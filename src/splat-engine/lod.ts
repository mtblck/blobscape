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

/**
 * Level of detail for blobs too small to see, blob by blob: for one actor as big as a world (an island a hundred and
 * fifty meters across, the camera standing on it), where the actor's own size on screen says nothing. A blob that
 * would come under `pixels` on screen (its largest standard deviation, far off or just small) is kept by the share of
 * that it would fill, so fewer are drawn the smaller they get, each grown to cover for those left out: far ground is
 * drawn by about as many blobs as the pixels it covers, which also stops far fine detail shimmering, while a big soft
 * cloud at the same distance keeps every blob. Which go is `lodRank` again, so the same blobs go each time.
 */
export interface FarRule {
  /** The least a blob's size may come to on screen (its largest standard deviation, in pixels of the picture) before blobs thin out. */
  pixels: number
  /** Never fewer than this share of the blobs, however small. */
  least: number
}

/** Blobs thin out where they would come under about a pixel, and never under 5% of them. */
export const FAR: FarRule = { pixels: 1, least: 0.05 }

/** How far before it goes a blob starts to shrink, as a share of the ranks: a blob shrinks away rather than blinks out. */
export const FAR_BAND = 0.1

/**
 * How much more than the area left out the blobs kept grow to cover, when few are kept: blobs thinned at random
 * leave chance gaps between them, which a surface of opaque discs showed as specks of what lies behind (clouds of
 * small blobs came out grainy). Eased in from nothing as blobs start to thin out, so nothing jumps.
 */
export const FAR_SPREAD = 2

/** The share of blobs kept where a blob's largest standard deviation on screen squared is `px2` (pixels²). */
export function farKeep(px2: number, { pixels, least }: FarRule): number {
  return Math.min(1, Math.max(least, px2 / (pixels * pixels)))
}

/**
 * What a blob's covariance is multiplied by, by its `rank` (`lodRank`), where its largest standard deviation on screen
 * squared is `px2`: 0 left out, else grown by one over the area kept (and `FAR_SPREAD`), and shrinking toward 0 over `FAR_BAND` as it
 * nears its turn to go. `farSizeNode` in engine.ts is its twin (in `projectSplat`); change both.
 */
export function farSize(rank: number, px2: number, rule: FarRule): number {
  const keep = farKeep(px2, rule)
  if (keep >= 1) return 1
  const s = Math.min(1, Math.max(0, (rank - (1 - keep)) / FAR_BAND + 1))
  // those shrinking count for half: grown by one over the area kept, so the blobs cover what they did, and a little
  // more (`FAR_SPREAD`) so chance gaps between them close
  return (s * (1 + (FAR_SPREAD - 1) * (1 - keep))) / (keep + Math.min(FAR_BAND, 1 - keep) / 2)
}
