/** Blocks as Brush and Ink and Pixel Diorama offer them: the chip, the choices and the look they make for the stage. */
import type { BlockLook } from '../splat-engine/blocks.ts'
import { lightFrom } from './celLooks.ts'

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
  /** What stands behind: '' is the subject's own sky where it has one. */
  backdrop: string
}
export const BLOCK_START: BlockChoice = { size: 2, turn: -50, height: 50, shadows: true, corners: 0.5, vary: 0.35, edge: 0.3, backdrop: '' }
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
  return { cell: grid * Math.max(BLOCK_SIZES.min, Math.min(BLOCK_SIZES.max, c.size)), from: lightFrom(c.turn + azimuth, c.height), shadows: c.shadows, corners: c.corners, vary: c.vary, edge: c.edge, ambient }
}
