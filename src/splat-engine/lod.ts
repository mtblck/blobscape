/**
 * Level of detail per actor: a creature far away or small on screen draws a
 * share of its blobs, each grown to cover for the ones left out, so it costs
 * less to draw and looks about the same.
 *
 * Which blobs stay is fixed per blob by `lodRank` (a hash of its index), so a
 * creature thinning out loses the same blobs every time and keeps the rest:
 * nothing flickers as the share drifts. A kept blob's covariance is divided by
 * the share kept (each axis grows by 1/√keep), so the covered area stays about
 * the same for the surface discs creatures are cut from.
 *
 * The GPU (`deformBlob` in engine.ts) and the CPU twin (`SplatWorld.deformCPU`)
 * use the same hash; change both.
 */

/** A blob's place in line for being dropped, 0–1: blobs ranked below the share dropped are left out. Wang's integer hash. */
export function lodRank(i: number): number {
  let h = ((i ^ 61) ^ (i >>> 16)) >>> 0
  h = Math.imul(h, 9) >>> 0
  h = (h ^ (h >>> 4)) >>> 0
  h = Math.imul(h, 0x27d4eb2d) >>> 0
  h = (h ^ (h >>> 15)) >>> 0
  return (h >>> 8) / 16777216
}

/** How many of its blobs an actor keeps for the size it is on screen. */
export interface DetailRule {
  /**
   * Blobs wanted per pixel of the disc round the actor on screen. The disc is a loose fit (a long creature seen end on
   * fills a third of it), about half the blobs face away, and blobs overlap, so one per disc pixel still looks whole.
   */
  density: number
  /** Never fewer than this share of the blobs. */
  min: number
}

/** The rule to give `world.autoDetail`: about one blob per pixel, and never under 6% of them. */
export const DETAIL: DetailRule = { density: 1, min: 0.06 }

/** The share of an actor's `count` blobs to draw when it covers a disc `radiusPx` pixels across on screen. */
export function detailFor(count: number, radiusPx: number, { density, min }: DetailRule = DETAIL): number {
  if (count <= 0) return 1
  const wanted = Math.PI * radiusPx * radiusPx * density
  return Math.max(min, Math.min(1, wanted / count))
}

/**
 * How many pixels a sphere of `radius` reaches on screen, `depth` units in front of a perspective camera whose
 * projection matrix has `p11` as its [1][1] (y focal) term, drawn `height` pixels tall. Behind the camera it is huge.
 */
export function screenRadius(radius: number, depth: number, p11: number, height: number): number {
  if (depth <= radius) return Infinity
  return (radius / depth) * p11 * (height / 2)
}
