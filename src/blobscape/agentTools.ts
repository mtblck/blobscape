import type { Vec3 } from '../splat-core/blobs.ts'
import { BRUSHES, type BrushId } from './brushes.ts'

/**
 * The sandbox's actions as WebMCP tools (issue #213), so an assistant in the browser can work on the scene: look at
 * it, add a creature, build a scene from a description, cut, recolor, paint with a brush, save and undo. WebMCP is
 * `document.modelContext` (Chrome, in an origin trial in 2026; `navigator.modelContext` was its first home): a page
 * registers tools with a name, a description, a JSON Schema for the input and an `execute` that answers in a string.
 * Where the browser has no such thing, nothing is registered and nothing else changes.
 *
 * Everything here is plain data and checks, tested in Node: the sandbox hands in what each action does (`SandboxApi`).
 * An assistant's input is checked before anything is touched, and a refusal says what was wrong in words it can act on.
 */

/** What the sandbox lets a tool do. Each answers in a sentence for the assistant to read. */
export interface SandboxApi {
  /** What is in the scene: counts, its box, the creatures, the limits. */
  describe(): string
  /** The creatures that can be added, as ids. */
  creatures(): string[]
  addCreature(id: string): string
  /** Builds a scene from a description (JSON text of a `SceneDoc`) in place of the scene. */
  writeScene(json: string): string
  /** Removes every blob whose center is inside the ball. */
  cut(center: Vec3, radius: number): string
  /** Gives every blob whose center is inside the ball this color. */
  recolor(center: Vec3, radius: number, color: Vec3): string
  /** One dab of a brush on the ground or surface at a point. */
  brush(kind: BrushId, at: Vec3, radius: number): string
  /** Saves the scene as a .ply file (a download). */
  save(): string
  undo(): string
}

export interface AgentTool {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  annotations?: { readOnlyHint?: boolean; consequentialHint?: boolean }
  execute: (input: unknown) => Promise<string>
}

const POINT = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'A point in the scene as [x, y, z] in meters. y is up and the floor is y = 0.' }
const RADIUS = { type: 'number', exclusiveMinimum: 0, maximum: 50, description: 'The radius of the ball, in meters.' }

class Refused extends Error {}
const refuse = (why: string): never => { throw new Refused(why) }
const field = (input: unknown, key: string): unknown => (typeof input === 'object' && input !== null ? (input as Record<string, unknown>)[key] : undefined)
function point(input: unknown, key: string): Vec3 {
  const v = field(input, key)
  if (!Array.isArray(v) || v.length !== 3 || !v.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 1000)) refuse(`"${key}" must be three numbers, [x, y, z]`)
  return v as Vec3
}
function radius(input: unknown): number {
  const v = field(input, 'radius')
  if (typeof v !== 'number' || !(v > 0) || v > 50) refuse('"radius" must be a number above 0, at most 50')
  return v as number
}
function text(input: unknown, key: string, max: number): string {
  const v = field(input, key)
  if (typeof v !== 'string' || !v) refuse(`"${key}" must be text`)
  if ((v as string).length > max) refuse(`"${key}" is longer than ${max.toLocaleString('en-US')} characters`)
  return v as string
}
function hex(input: unknown): Vec3 {
  const v = text(input, 'color', 7)
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v)
  if (!m) refuse('"color" must be a hex color like "#f2553a"')
  return [parseInt(m![1], 16) / 255, parseInt(m![2], 16) / 255, parseInt(m![3], 16) / 255]
}

/** The tools, in the order an assistant would reach for them. */
export function sandboxTools(api: SandboxApi): AgentTool[] {
  const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[], run: (input: unknown) => string, annotations?: AgentTool['annotations']): AgentTool => ({
    name, description, annotations,
    inputSchema: { type: 'object', properties, required },
    // A refusal is an answer, not a failure: the assistant reads why and tries again
    execute: async (input) => { try { return run(input) } catch (err) { if (err instanceof Refused) return `Not done: ${err.message}.`; throw err } },
  })
  const brushes = BRUSHES.map((b) => b.id)
  return [
    tool('describe_scene', 'Says what is in the Blobscape sandbox now: how many Gaussian splat blobs, the box they fill (so you know where things are), the creatures, and the limits. Call this first.', {}, [], () => api.describe(), { readOnlyHint: true }),
    tool('add_creature', 'Adds an animated creature made of splats beside the scene. It stands on the floor and plays its move.', { creature: { type: 'string', enum: api.creatures(), description: 'Which creature.' } }, ['creature'], (input) => {
      const id = text(input, 'creature', 40)
      if (!api.creatures().includes(id)) refuse(`there is no creature "${id}". The creatures are ${api.creatures().join(', ')}`)
      return api.addCreature(id)
    }),
    tool('write_scene', 'Replaces the scene with one built from a scene description: JSON with a palette, a light and parts, each part a shape (box, ball, cylinder, cone, roof and more) and a paint. If the description has mistakes, the answer lists them as "where: what" so you can fix them and call again. The guide is at https://github.com/mtblck/blobscape/blob/main/docs/scene-descriptions.md', { description: { type: 'string', description: 'The scene description, as JSON text.' } }, ['description'], (input) => api.writeScene(text(input, 'description', 200_000))),
    tool('cut', 'Removes every blob whose center is inside a ball. Use describe_scene first to know where things are.', { center: POINT, radius: RADIUS }, ['center', 'radius'], (input) => api.cut(point(input, 'center'), radius(input))),
    tool('recolor', 'Gives every blob whose center is inside a ball one color.', { center: POINT, radius: RADIUS, color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description: 'A hex color like "#f2553a".' } }, ['center', 'radius', 'color'], (input) => api.recolor(point(input, 'center'), radius(input), hex(input))),
    tool('paint', `Paints one dab with a brush at a point, on the ground there: ${BRUSHES.map((b) => `${b.id} (${b.note.replace(/\.$/, '').toLowerCase()})`).join('; ')}. Call it several times along a line to paint a stroke.`, { brush: { type: 'string', enum: brushes, description: 'Which brush.' }, at: POINT, radius: RADIUS }, ['brush', 'at', 'radius'], (input) => {
      const kind = text(input, 'brush', 20)
      if (!brushes.includes(kind as BrushId)) refuse(`there is no brush "${kind}". The brushes are ${brushes.join(', ')}`)
      return api.brush(kind as BrushId, point(input, 'at'), radius(input))
    }),
    tool('save_scene', 'Saves the scene to the person\'s device as a .ply file of Gaussian splats, which opens in most splat viewers. This starts a download.', {}, [], () => api.save(), { consequentialHint: true }),
    tool('undo', 'Takes back the last change to the scene.', {}, [], () => api.undo()),
  ]
}

/** The browser's WebMCP entry point, as much of it as is used here. */
export interface ModelContext {
  registerTool(tool: AgentTool, options?: { signal?: AbortSignal }): unknown
}

/** The page's WebMCP, if this browser has one. */
export function modelContext(): ModelContext | undefined {
  const d = typeof document === 'undefined' ? undefined : (document as unknown as { modelContext?: ModelContext }).modelContext
  const n = typeof navigator === 'undefined' ? undefined : (navigator as unknown as { modelContext?: ModelContext }).modelContext
  const mc = d ?? n
  return mc && typeof mc.registerTool === 'function' ? mc : undefined
}

/**
 * Registers the tools where there is a WebMCP to take them, and gives back how to take them away again. A tool the
 * browser refuses (a name it already has, a draft it no longer speaks) is skipped: the page must never break over this.
 */
export function registerTools(tools: AgentTool[], mc: ModelContext | undefined = modelContext()): { count: number; remove: () => void } {
  if (!mc) return { count: 0, remove: () => {} }
  const off = new AbortController()
  let count = 0
  for (const t of tools) {
    try {
      const done = mc.registerTool(t, { signal: off.signal })
      if (done instanceof Promise) done.catch(() => {})
      count++
    } catch { /* skipped */ }
  }
  return { count, remove: () => off.abort() }
}
