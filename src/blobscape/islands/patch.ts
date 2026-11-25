/**
 * The finer patch: a finer cut of the ground round one place, laid into an island cut coarser. An island is some 120 by
 * 140 meters, and cut whole at 1× blocks it was close to 800,000 blobs and over half a minute (Matt found the page stuck
 * loading at 1×, 2026-11-21), so the island stays cut coarse and only a square round the elf (or the middle of the view)
 * is cut fine. The coarse cut leaves a hole there, whole coarse cells, and the fine cut fills the hole, overlapping it by
 * half a fine cell so no gap shows at the seam. Pure, in the island's own units.
 */

/** Half the patch's side, in the island's units (5 meters each): a square 40 meters across. */
export const PATCH_HALF = 4
/** The patch's middle stands on a grid this fine, so coming back to a place finds the patch cut for it before. */
export const PATCH_STEP = 1
/**
 * How far (each way, in the island's units) the elf goes from the patch's middle before it moves: about every 12 meters
 * walked, not every step, since each move builds the world's cubes again (over a second on a phone), and still 7 meters
 * of fine ground beyond the elf at the least.
 */
export const PATCH_MOVE = 2.5
/** How far the fine cut is lifted, in meters, so where its top meets a coarse top at the same height the fine one is drawn. */
export const PATCH_LIFT = 0.01

export interface Patch {
  /** Its middle, x and z in the island's units, on the `PATCH_STEP` grid. */
  at: [number, number]
  /** The coarse cells (x and z, inclusive) the coarse cut leaves out. */
  cells: { x: [number, number]; z: [number, number] }
  /** The box the fine cut is made in. */
  region: { min: [number, number, number]; max: [number, number, number] }
}

/** Where the patch's middle goes for a place on the island, in the island's units. */
export function patchAt(x: number, z: number): [number, number] {
  return [Math.round(x / PATCH_STEP) * PATCH_STEP, Math.round(z / PATCH_STEP) * PATCH_STEP]
}

/** Where the patch's middle goes when the place looked at moves to x, z: `now` while that is near enough, else round it. */
export function patchFor(now: [number, number], x: number, z: number): [number, number] {
  return Math.max(Math.abs(x - now[0]), Math.abs(z - now[1])) <= PATCH_MOVE ? now : patchAt(x, z)
}

/** The patch round `at` for an island cut every `coarse` and a patch cut every `fine`. */
export function patchOf(at: [number, number], coarse: number, fine: number): Patch {
  const span = (m: number): [number, number] => [Math.round((m - PATCH_HALF) / coarse), Math.round((m + PATCH_HALF) / coarse)]
  const x = span(at[0]), z = span(at[1])
  // the hole's edges are coarse cells' edges; a fine blob is kept when its own cell reaches into the hole
  const lo = (c: [number, number]) => (c[0] - 0.5) * coarse - fine / 2 + 1e-6
  const hi = (c: [number, number]) => (c[1] + 0.5) * coarse + fine / 2 - 1e-6
  return { at, cells: { x, z }, region: { min: [lo(x), -1e4, lo(z)], max: [hi(x), 1e4, hi(z)] } }
}

/** Whether a coarse blob at x, z (the island's units) is in the patch's hole. */
export function inHole(p: Patch, coarse: number, x: number, z: number): boolean {
  const i = Math.round(x / coarse), k = Math.round(z / coarse)
  return i >= p.cells.x[0] && i <= p.cells.x[1] && k >= p.cells.z[0] && k <= p.cells.z[1]
}

/**
 * The patch's hole as the square a drawing of blocks leaves out (blocks.ts `BlockHole`): the middles of the coarse cells
 * in it but its edge ring. Those cubes were made beside the ones in the hole, with the faces between left out, so
 * hiding the ring too would open slits into them where the fine ground stands lower; drawn, they lie under the
 * patch's own cubes, which overlap them.
 */
export function patchHole(p: Patch, coarse: number): { min: [number, number]; max: [number, number] } {
  return { min: [(p.cells.x[0] + 0.5) * coarse, (p.cells.z[0] + 0.5) * coarse], max: [(p.cells.x[1] - 0.5) * coarse, (p.cells.z[1] - 0.5) * coarse] }
}

/** On a phone a whole island is never cut in blocks under this many times the grid: smaller blocks are the patch's alone. */
export const PHONE_BLOCK_BASE = 2

/**
 * The block size a whole island is cut at, for the block size asked for. On a phone never under `PHONE_BLOCK_BASE`,
 * since a whole island at 1× is some 700,000 cubes and hung loading on Matt's phone (2026-11-21): smaller blocks are
 * streamed there, the patch round the elf (or the middle of the view) cut at the size asked for and the rest of the
 * island left coarser, so the blocks far off are fewer and bigger (issue #464).
 */
export function blockBase(size: number, phone: boolean): number {
  return phone ? Math.max(size, PHONE_BLOCK_BASE) : size
}
