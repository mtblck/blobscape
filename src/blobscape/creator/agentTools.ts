import type { AgentTool } from '../agentTools.ts'

/**
 * Scene Creator's actions as WebMCP tools (#341), as the sandbox has its own (`agentTools.ts`, which explains WebMCP):
 * an assistant in the browser can look at the scene, add a prop from the library, move, turn and size one, set the
 * light and pick the style. Plain data and checks, tested in Node; the page hands in what each action does. Every
 * change is one step the visitor can undo.
 */

/** A light change an assistant may ask for: each left out stays as it is. */
export interface LightAsk {
  /** The baked sun: degrees round from the front (+z), counterclockwise seen from above, and degrees up. */
  sun?: { turn: number; height: number }
  /** The sun live at this hour of the day, or null to bake it again. */
  hour?: number | null
  weather?: 'rain' | 'snow' | 'leaves' | null
  /** How strongly lamps and glowing things shine, 0 to 4. */
  glow?: number
  /** Distance haze, 0 (none) to 16. */
  haze?: number
}

/** What the page lets a tool do. Each answers in a sentence for the assistant to read. */
export interface CreatorApi {
  /** What is open: the land, each prop with its number, place, turn and size, the light, the style, the limits. */
  describe(): string
  /** The library's props, as ids. */
  props(): string[]
  /** Sets a prop down at a place on the ground (its middle when left out). */
  addProp(id: string, at?: [number, number]): string
  /** Moves prop `index` (from describe_scene) on the ground, and turns and sizes it. */
  moveProp(index: number, change: { at?: [number, number]; turn?: number; size?: number }): string
  setLight(ask: LightAsk): string
  /** The styles, as ids. */
  styles(): string[]
  setStyle(id: string): string
  undo(): string
}

class Refused extends Error {}
const refuse = (why: string): never => { throw new Refused(why) }
const field = (input: unknown, key: string): unknown => (typeof input === 'object' && input !== null ? (input as Record<string, unknown>)[key] : undefined)
function num(input: unknown, key: string, lo: number, hi: number): number | undefined {
  const v = field(input, key)
  if (v === undefined) return undefined
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) refuse(`"${key}" must be a number from ${lo} to ${hi}`)
  return v as number
}
function spot(input: unknown, key: string): [number, number] | undefined {
  const v = field(input, key)
  if (v === undefined) return undefined
  if (!Array.isArray(v) || v.length !== 2 || !v.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 100)) refuse(`"${key}" must be two numbers, [x, z]`)
  return v as [number, number]
}
function oneOf(input: unknown, key: string, list: string[]): string {
  const v = field(input, key)
  if (typeof v !== 'string' || !list.includes(v)) refuse(`"${key}" must be one of ${list.join(', ')}`)
  return v as string
}

const SPOT = { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'A place on the ground as [x, z], in the scene\'s units (describe_scene gives the land\'s size). The prop stands on the ground there.' }
const WEATHER = ['rain', 'snow', 'leaves', 'none']

/** The tools, in the order an assistant would reach for them. */
export function creatorTools(api: CreatorApi): AgentTool[] {
  const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[], run: (input: unknown) => string, annotations?: AgentTool['annotations']): AgentTool => ({
    name, description, annotations,
    inputSchema: { type: 'object', properties, required },
    execute: async (input) => { try { return run(input) } catch (err) { if (err instanceof Refused) return `Not done: ${err.message}.`; throw err } },
  })
  return [
    tool('describe_scene', 'Says what is open in Blobscape\'s Scene Creator, a pixel-art scene made of Gaussian splats: the land everything stands on and its size, each prop with its number, place, turn and size, the light, the style and the limits. Call this first.', {}, [], () => api.describe(), { readOnlyHint: true }),
    tool('add_prop', 'Sets a prop from the library down on the land. It stands on the ground and plays its own moves.', { prop: { type: 'string', enum: api.props(), description: 'Which prop.' }, at: SPOT }, ['prop'], (input) => api.addProp(oneOf(input, 'prop', api.props()), spot(input, 'at'))),
    tool('move_prop', 'Moves a prop along the ground, turns it or sizes it. Give its number from describe_scene and any of the rest.', {
      index: { type: 'integer', minimum: 0, description: 'The prop\'s number, from describe_scene.' },
      at: SPOT,
      turn: { type: 'number', minimum: -180, maximum: 180, description: 'Degrees it faces round from the front, counterclockwise seen from above.' },
      size: { type: 'number', minimum: 0.25, maximum: 4, description: 'Times its own size.' },
    }, ['index'], (input) => {
      const i = field(input, 'index')
      if (typeof i !== 'number' || !Number.isInteger(i) || i < 0) refuse('"index" must be a prop\'s number from describe_scene')
      const change = { at: spot(input, 'at'), turn: num(input, 'turn', -180, 180), size: num(input, 'size', 0.25, 4) }
      if (!change.at && change.turn === undefined && change.size === undefined) refuse('give "at", "turn" or "size"')
      return api.moveProp(i as number, change)
    }),
    tool('set_light', 'Sets the light: a baked sun from a direction, or the sun live at an hour of the day (with the moon and stars at night), the weather, the glow of lamps and the haze. Give only what should change.', {
      sun_turn: { type: 'number', minimum: -180, maximum: 180, description: 'Where the baked sun comes from, in degrees round from the front, counterclockwise seen from above.' },
      sun_height: { type: 'number', minimum: 0, maximum: 90, description: 'How high the baked sun stands, in degrees.' },
      hour: { type: ['number', 'null'], minimum: 0, maximum: 24, description: 'Shine the sun live at this hour (0 to 24), or null to go back to a baked sun.' },
      weather: { type: 'string', enum: WEATHER, description: 'What falls and lands.' },
      glow: { type: 'number', minimum: 0, maximum: 4, description: 'How strongly lamps and glowing things shine; 1 is as the scene has it.' },
      haze: { type: 'number', minimum: 0, maximum: 16, description: 'Distance haze: 0 is none.' },
    }, [], (input) => {
      const ask: LightAsk = {}
      const turn = num(input, 'sun_turn', -180, 180), height = num(input, 'sun_height', 0, 90)
      if ((turn === undefined) !== (height === undefined)) refuse('give both "sun_turn" and "sun_height"')
      if (turn !== undefined) ask.sun = { turn: turn, height: height! }
      const h = field(input, 'hour')
      if (h === null) ask.hour = null
      else if (h !== undefined) ask.hour = num(input, 'hour', 0, 24)
      if (field(input, 'weather') !== undefined) { const w = oneOf(input, 'weather', WEATHER); ask.weather = w === 'none' ? null : (w as LightAsk['weather']) }
      ask.glow = num(input, 'glow', 0, 4)
      ask.haze = num(input, 'haze', 0, 16)
      for (const k of Object.keys(ask) as (keyof LightAsk)[]) if (ask[k] === undefined) delete ask[k]
      if (!Object.keys(ask).length) refuse('give something to change')
      return api.setLight(ask)
    }),
    tool('set_style', 'Picks how the scene is drawn: pixel art, or a painted or drawn look.', { style: { type: 'string', enum: api.styles(), description: 'Which style.' } }, ['style'], (input) => api.setStyle(oneOf(input, 'style', api.styles()))),
    tool('undo', 'Takes back the last change to the scene.', {}, [], () => api.undo()),
  ]
}
