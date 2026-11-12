import { shotsFor } from '../splat-to-sprite/sheet.ts'
import type { Clip } from './glb.ts'
import type { Skeleton, Skin } from './rig.ts'
import type { Blobs } from '../splat-core/blobs.ts'
import { sampleClip } from './glb.ts'

/**
 * A rigged creature's moves as a pixel-art sprite sheet: the plan (which row
 * is which move from which side), the framing, and the two JSON files that go
 * with the PNG. Pure, so Node tests can check it; the drawing is bakeSheet.ts.
 *
 * Rows are move by move, and within a move one row per direction, in the
 * order Splat to Sprite uses: 4 directions follow Tinkerkit (down, left,
 * right, up), 8 go round clockwise from down. Each row holds that move's
 * frames, evenly spaced through one loop of its clip.
 */
export interface SheetMove {
  /** Names the animations: `<name>-<direction>`. */
  name: string
  /** Undefined for a still pose (the rest pose). */
  clip?: Clip
  frames: number
}

export interface SheetRow { move: SheetMove; dir: string; turn: number }

export interface SheetPlan { rows: SheetRow[]; cols: number }

export function planSheet(moves: SheetMove[], directions: 4 | 8): SheetPlan {
  const dirs = shotsFor(directions === 8 ? 'dir8' : 'dir4').rows.map((r) => ({ dir: r.name, turn: r.shots[0].turn }))
  const rows = moves.flatMap((move) => dirs.map((d) => ({ move, ...d })))
  return { rows, cols: Math.max(1, ...moves.map((m) => m.frames)) }
}

/** How long one loop of a move lasts, in seconds (0 for a still pose). */
export const loopSeconds = (m: SheetMove) => (m.clip ? m.clip.times[m.clip.times.length - 1] : 0)

/** When each frame of a move is taken: evenly through one loop, so the last frame leads back into the first. */
export const frameTimes = (m: SheetMove) => Array.from({ length: m.frames }, (_, f) => (f / m.frames) * loopSeconds(m))

/** Frames per second that plays a move at its real speed. */
export const moveFps = (m: SheetMove) => (m.clip && loopSeconds(m) > 0 ? Math.max(1, Math.round(m.frames / loopSeconds(m))) : 1)

export interface Framing { centre: [number, number, number]; radius: number }

/**
 * A sphere round the creature through every frame of every move, so one
 * camera distance fits them all and the creature is the same size in every
 * frame. Moves a sample of blob centres by their bones on the CPU (the same
 * blend as the GPU), and pads each by its largest scale.
 */
export function frameAll(actor: { blobs: Blobs; skin: Skin; skeleton: Skeleton }, moves: SheetMove[], sample = 3000): Framing {
  const { blobs, skin, skeleton: sk } = actor
  const step = Math.max(1, Math.floor(blobs.count / sample))
  const pts: number[] = []
  const pose = (m: SheetMove, t: number) => {
    if (m.clip) sampleClip(m.clip, sk, t)
    else { sk.reset(); sk.update() }
    for (let i = 0; i < blobs.count; i += step) {
      if (blobs.opacity[i] < 0.05) continue
      const x = blobs.centre[i * 3], y = blobs.centre[i * 3 + 1], z = blobs.centre[i * 3 + 2]
      let ox = 0, oy = 0, oz = 0, grow = 0
      for (let k = 0; k < 4; k++) {
        const w = skin.weights[i * 4 + k]
        if (!w) continue
        grow += w * sk.scale[skin.joints[i * 4 + k]]
        const m = sk.matrix.subarray(skin.joints[i * 4 + k] * 16)
        ox += w * (m[0] * x + m[4] * y + m[8] * z + m[12])
        oy += w * (m[1] * x + m[5] * y + m[9] * z + m[13])
        oz += w * (m[2] * x + m[6] * y + m[10] * z + m[14])
      }
      // a blob reaches about two of its scales, grown as its bones are (weighted, as the GPU does); one shrunk to nothing (a hidden tongue) is left out
      const s = 2 * Math.max(blobs.scale[i * 3], blobs.scale[i * 3 + 1], blobs.scale[i * 3 + 2]) * grow
      if (s > 1e-4) pts.push(ox, oy, oz, s)
    }
  }
  for (const m of moves) for (const t of m.clip ? frameTimes(m) : [0]) pose(m, t)
  sk.reset()
  sk.update()
  if (!pts.length) return { centre: [0, 0, 0], radius: 1 }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pts.length; i += 4) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pts[i + k] - pts[i + 3]); hi[k] = Math.max(hi[k], pts[i + k] + pts[i + 3]) }
  const centre: [number, number, number] = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
  let r = 0
  for (let i = 0; i < pts.length; i += 4) r = Math.max(r, Math.hypot(pts[i] - centre[0], pts[i + 1] - centre[1], pts[i + 2] - centre[2]) + pts[i + 3])
  return { centre, radius: r }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sprite'

/** Every row's animation name, frames and speed, as both JSON files use them. */
function animations(plan: SheetPlan) {
  return plan.rows.map((row, r) => ({
    name: `${slug(row.move.name)}-${row.dir}`,
    frames: Array.from({ length: row.move.frames }, (_, c) => r * plan.cols + c),
    fps: moveFps(row.move),
    loop: !!row.move.clip,
  }))
}

/**
 * Mirrors Tinkerkit's `SpriteSheet` document (packages/format/src/spritesheet.ts,
 * format version 71). Adds `idle-<direction>` (the first frame of the first
 * move) when no move is called idle, since Tinkerkit's characters stand on it.
 */
export function tinkerkitJson(name: string, image: string, plan: SheetPlan, size: number, anchorY = size) {
  const anims: Record<string, { frames: number[]; fps: number; loop: boolean }> = {}
  for (const a of animations(plan)) anims[a.name] = { frames: a.frames, fps: a.fps, loop: a.loop }
  const first = plan.rows[0]?.move
  if (first && !plan.rows.some((r) => slug(r.move.name) === 'idle')) {
    plan.rows.forEach((row, r) => { if (row.move === first) anims[`idle-${row.dir}`] = { frames: [r * plan.cols], fps: 1, loop: false } })
  }
  return {
    kind: 'spritesheet', formatVersion: 71, id: slug(name), name, image,
    imageWidth: plan.cols * size, imageHeight: plan.rows.length * size, frameWidth: size, frameHeight: size, pixelScale: 1,
    anchor: { x: size / 2, y: anchorY }, footprint: { x: -size / 4, y: -4, w: size / 2, h: 4 },
    animations: anims,
  }
}

/**
 * The JSON-array sheet Aseprite writes (and TexturePacker, Phaser and most
 * engines' importers read): one entry per frame, with a tag per animation.
 */
export function asepriteJson(image: string, plan: SheetPlan, size: number) {
  const frames: object[] = []
  const frameTags: object[] = []
  for (const a of animations(plan)) {
    const from = frames.length
    for (const k of a.frames) {
      frames.push({
        filename: `${a.name} ${k - a.frames[0]}`,
        frame: { x: (k % plan.cols) * size, y: Math.floor(k / plan.cols) * size, w: size, h: size },
        rotated: false, trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: size, h: size },
        sourceSize: { w: size, h: size },
        duration: Math.round(1000 / a.fps),
      })
    }
    frameTags.push({ name: a.name, from, to: frames.length - 1, direction: 'forward' })
  }
  return {
    frames,
    meta: { app: 'https://blobscape.dev/experiments/creature/', version: '1', image, format: 'RGBA8888', size: { w: plan.cols * size, h: plan.rows.length * size }, scale: '1', frameTags },
  }
}
