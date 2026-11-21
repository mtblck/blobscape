/** Blocks as Brush and Ink and Pixel Diorama offer them: the chip, the choices and the look they make for the stage. */
import { FLOW_SWELL, type BlockLook } from '../splat-engine/blocks.ts'
import { MOONLIGHT, lightFrom, nightLight } from './celLooks.ts'

/** The chip beside the drawn looks (brushLooks.ts). */
export const BLOCKS = { id: 'blocks' as const, label: 'Blocks', note: 'Built from cubes on a grid: every block one flat color, every face one tone, with the shadows blocks cast on each other.' }

/** What the page's controls make. */
export interface BlockChoice {
  /** A block's side, in cells of the grid the subject was cut on. */
  size: number
  /** Where the light is, in degrees round the subject from the starting view, and how high. */
  turn: number
  height: number
  shadows: boolean
  /** Darker corners, color that varies block to block, and the line round each face, each 0 to 1. */
  corners: number
  vary: number
  edge: number
  /** What stands behind, a time of day (`BLOCK_TIMES`, or 'scene' for the subject's own sky) or a plain color (`BLOCK_GROUNDS`): '' is the subject's own sky where it has one, else the afternoon. */
  backdrop: string
  /** A subject's water: columns of blocks that rise and fall, or the blobs it is among the cubes. */
  water: 'blocks' | 'blobs'
  /** How many times higher than it stands a ripple is drawn as blocks. */
  swell: number
}
export const BLOCK_START: BlockChoice = { size: 2, turn: -50, height: 50, shadows: true, corners: 0.5, vary: 0.35, edge: 0.3, backdrop: '', water: 'blobs', swell: FLOW_SWELL }
/**
 * Times of day (Matt, 2026-11-21: the backdrop is either a time of day, with its sky and its light, or a plain color in
 * day's light). `light` multiplies everything but the scene's own lamps (linear), `height` is where the Light height
 * slider goes when the time is picked.
 */
export const BLOCK_TIMES: { id: string; label: string; back: string; light: readonly [number, number, number]; height: number }[] = [
  { id: 'morning', label: 'Morning', back: 'linear-gradient(#9cc4e4, #f6d7b0 70%, #f9c58d)', light: [1, 0.86, 0.68], height: 20 },
  { id: 'afternoon', label: 'Afternoon', back: 'linear-gradient(#6fb1e6, #cfe6f4)', light: [1, 1, 1], height: 55 },
  { id: 'night', label: 'Night', back: 'linear-gradient(#0d1228, #27325a)', light: MOONLIGHT, height: 40 },
]
/** Plain colors to stand in front of, always in day's light. */
export const BLOCK_GROUNDS: { id: string; label: string; back: string }[] = [
  { id: 'sky', label: 'Sky blue', back: '#bfdcec' },
  { id: 'cream', label: 'Cream', back: '#f1e9d6' },
  { id: 'white', label: 'White', back: '#ffffff' },
  { id: 'slate', label: 'Slate', back: '#4a5568' },
  { id: 'black', label: 'Black', back: '#101014' },
]

/** What a choice of backdrop comes to: whether it is a time of day, what goes behind the canvas and what light it gives (none is day's). */
export interface BlockBack { id: string; time: boolean; back: string; light?: readonly [number, number, number] }
/**
 * The backdrop for a choice. `sky` is the subject's own sky as CSS and how much it is a night's (`nightOf`), where it
 * has one: it goes with the plain colors (Matt, 2026-11-21: a time of day overrides whatever time the scene has), keeps a
 * night's light under a dark sky, and is what an empty choice means.
 */
export function blockBack(choice: string, sky?: { back: string; night: number }): BlockBack {
  const id = choice || (sky ? 'scene' : 'afternoon')
  if (id === 'scene' && sky) return { id, time: false, back: sky.back, light: sky.night ? nightLight(sky.night) : undefined }
  const ground = BLOCK_GROUNDS.find((g) => g.id === id)
  if (ground) return { id, time: false, back: ground.back }
  const t = BLOCK_TIMES.find((x) => x.id === id) ?? BLOCK_TIMES[1]
  return { id: t.id, time: true, back: t.back, light: t.id === 'afternoon' ? undefined : t.light }
}

/** The most a ripple's height is multiplied by. */
export const SWELL_MOST = 16
/** The sizes on offer, in cells of the subject's grid. */
export const BLOCK_SIZES = { min: 1, max: 8 }
/** A subject cut on no grid gets blocks as if its longest side were this many cells. */
export const BLOCK_SPAN = 96

/** The side of one cell for a subject: the grid it was cut on, or a share of its longest side. */
export function gridOf(spacing: number | undefined, centers: ArrayLike<number>, count: number): number {
  if (spacing && spacing > 0) return spacing
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < count * 3; i++) { lo[i % 3] = Math.min(lo[i % 3], centers[i]); hi[i % 3] = Math.max(hi[i % 3], centers[i]) }
  const longest = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
  return longest > 0 ? longest / BLOCK_SPAN : 0.02
}

/** The look for the stage: `grid` is one cell's side, `azimuth` the starting view's turn, `ambient` a night's light. */
export function blockLook(c: BlockChoice, grid: number, azimuth = 0, ambient?: readonly [number, number, number]): BlockLook {
  return { cell: grid * Math.max(BLOCK_SIZES.min, Math.min(BLOCK_SIZES.max, c.size)), from: lightFrom(c.turn + azimuth, c.height), shadows: c.shadows, corners: c.corners, vary: c.vary, edge: c.edge, ambient, flow: c.water, swell: c.swell }
}
