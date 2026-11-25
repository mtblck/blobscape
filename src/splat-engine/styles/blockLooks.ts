/** Blocks as Brush and Ink and Diorama offer them: the chip, the choices and the look they make for the stage. */
import { FLOW_SWELL, type BlockLook } from '../blocks.ts'
import { lightFrom, nightLight } from './celLooks.ts'

/** The chip beside the drawn looks (brushLooks.ts). */
export const BLOCKS = { id: 'blocks' as const, label: 'Blocks', note: 'Built from cubes on a grid: every block one flat color, every face one tone, with the shadows blocks cast on each other.' }

/** What the page's controls make. */
export interface BlockChoice {
  /** A block's side, in cells of the grid the subject was cut on. */
  size: number
  /** Where the light is, in degrees round the subject from the starting view. */
  turn: number
  /** How high the light stands, in degrees. */
  height: number
  /** Whether blocks cast shadows on each other. */
  shadows: boolean
  /** How dark the corners where blocks meet are, 0 to 1. */
  corners: number
  /** How much a block's color differs from the next, 0 to 1. */
  vary: number
  /** How strong the line round each face is, 0 to 1. */
  edge: number
  /** What stands behind: 'scene' for the subject's own sky, or a plain color (`BLOCK_GROUNDS`); '' is the subject's own sky where it has one, else daylight. */
  backdrop: string
  /** A subject's water: columns of blocks that rise and fall, or the blobs it is among the cubes. */
  water: 'blocks' | 'blobs'
  /** Weather over the subject (clouds, rain, snow): cubes as the scene is, or the soft blobs it is in the other styles. */
  weather: 'blocks' | 'blobs'
  /** How many times higher than it stands a ripple is drawn as blocks. */
  swell: number
  /** The palette the blocks are painted from: 'none' keeps each block's own color, 'own' is the scene's, else a shared one (Diorama's `PALETTES`). */
  palette: string
}
/** Where the Blocks style's settings start. */
export const BLOCK_START: BlockChoice = { size: 1, turn: -50, height: 50, shadows: true, corners: 0.5, vary: 0.35, edge: 0.3, backdrop: '', water: 'blobs', weather: 'blobs', swell: FLOW_SWELL, palette: 'none' }
/**
 * What to stand in front of when it is not the subject's own sky: daylight, or a plain color. The time of day is the
 * scene's own setting (timeOfDay.ts), not this look's: it reaches here as the subject's sky and the stage's light.
 */
export const BLOCK_GROUNDS: { id: string; label: string; back: string }[] = [
  { id: 'day', label: 'Daylight', back: 'linear-gradient(#6fb1e6, #cfe6f4)' },
  { id: 'sky', label: 'Sky blue', back: '#bfdcec' },
  { id: 'cream', label: 'Cream', back: '#f1e9d6' },
  { id: 'white', label: 'White', back: '#ffffff' },
  { id: 'slate', label: 'Slate', back: '#4a5568' },
  { id: 'black', label: 'Black', back: '#101014' },
]

/** What a choice of backdrop comes to: what goes behind the canvas and what light it gives (none is day's). */
export interface BlockBack {
  /** Which backdrop it is. */
  id: string
  /** What goes behind the canvas, as CSS. */
  back: string
  /** The light it gives; day's when left out. */
  light?: readonly [number, number, number]
}
/**
 * The backdrop for a choice. `sky` is the subject's own sky as CSS and how much it is a night's (`nightOf`), where it
 * has one: it is what an empty choice means, and under a dark one the light is a night's, unless the page has set a
 * time of day (`timed`), whose light is already the stage's.
 */
export function blockBack(choice: string, sky?: { back: string; night: number }, timed = false): BlockBack {
  const id = choice || (sky ? 'scene' : BLOCK_GROUNDS[0].id)
  if (id === 'scene' && sky) return { id, back: sky.back, light: sky.night && !timed ? nightLight(sky.night) : undefined }
  const ground = BLOCK_GROUNDS.find((g) => g.id === id) ?? BLOCK_GROUNDS[0]
  return { id: ground.id, back: ground.back }
}

/** The most a ripple's height is multiplied by. */
export const SWELL_MOST = 16
/** The sizes on offer, in cells of the subject's grid. */
export const BLOCK_SIZES = { min: 1, max: 8 }
/** A subject cut on no grid gets blocks as if its longest side were this many cells. */
export const BLOCK_SPAN = 96

/**
 * The side of one cell for a subject: the grid the page says it was cut on, else the grid the cut records (`Built.grid`,
 * from voxel.ts), else a share of its longest side. A guessed cell that is not the cut's own grid falls between the
 * blobs' rows and leaves rows of empty cells, so blocks drawn from a cut always snap to its grid.
 */
export function gridOf(spacing: number | undefined, centers: ArrayLike<number>, count: number, own?: number): number {
  if (spacing && spacing > 0) return spacing
  if (own && own > 0) return own
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < count * 3; i++) { lo[i % 3] = Math.min(lo[i % 3], centers[i]); hi[i % 3] = Math.max(hi[i % 3], centers[i]) }
  const longest = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
  return longest > 0 ? longest / BLOCK_SPAN : 0.02
}

/** The look for the stage: `grid` is one cell's side, `azimuth` the starting view's turn, `ambient` a night's light. */
export function blockLook(c: BlockChoice, grid: number, azimuth = 0, ambient?: readonly [number, number, number], palette?: readonly (readonly [number, number, number])[]): BlockLook {
  return { palette: palette?.length ? palette : undefined, cell: grid * Math.max(BLOCK_SIZES.min, Math.min(BLOCK_SIZES.max, c.size)), from: lightFrom(c.turn + azimuth, c.height), shadows: c.shadows, corners: c.corners, vary: c.vary, edge: c.edge, ambient, flow: c.water, weather: c.weather, swell: c.swell }
}
