/**
 * Marks: every blob drawn as a brush mark or an ink stroke in place of a soft dot, so a scene reads as a painting or
 * a drawing from any side. A mark is a function of where a pixel is on its own blob (along the blob's long and short
 * axes on screen, in standard deviations) and of the blob's seed, and of nothing on the screen: marks belong to their
 * blobs, so they stay put as the view moves, where a filter laid over the finished picture slides across it.
 *
 * This file is the CPU twin of the engine's draw (`markOf` in splat-engine/engine.ts): change one, change both.
 */

/**
 * The kinds of mark: flat opaque dabs with bristle streaks, thicker dabs with ridges that catch light, a wash with a
 * pen stroke along each blob, hatching that is denser where it is darker, or a whole disc of the blob's own color with
 * no brushwork at all (`flat`: the fill under cel shading, where the discs of one surface close up into one color).
 */
export type MarkKind = 'gouache' | 'oil' | 'ink' | 'hatch' | 'flat'

/** The kinds, in the order the GPU numbers them (from 1; 0 is no marks). */
export const MARK_KINDS: readonly MarkKind[] = ['gouache', 'oil', 'ink', 'hatch', 'flat']

/** How the blobs are drawn as marks. */
export interface MarkLook {
  /** Which mark. */
  kind: MarkKind
  /** How big a mark is beside its blob: 1 reaches 1.5 standard deviations along the blob (default 1). */
  size?: number
  /** Ink and hatch: the pen's color, sRGB 0–1 (default a blue-black). */
  ink?: readonly [number, number, number]
  /** Ink and hatch: the paper's color, sRGB 0–1 (default a warm white). Set the page behind the view to it too. */
  paper?: readonly [number, number, number]
  /**
   * Lay the marks one over another from far to near, with soft edges, as soft blobs are drawn. Without it (the
   * default) each pixel shows the mark nearest to it, so the marks on a thing keep their places as it turns: right
   * for anything cut as discs on a surface. A scan's blobs overlap far more and build a surface between them, and
   * look better laid softly.
   */
  soft?: boolean
}

/** The default pen and paper. */
export const INK: readonly [number, number, number] = [0.1, 0.11, 0.17]
/** The default paper. */
export const PAPER: readonly [number, number, number] = [0.96, 0.94, 0.89]

/** How far a mark reaches along and across its blob at size 1, in standard deviations. */
export const MARK_LONG = 1.5
/** How far a mark reaches across its blob at size 1, in standard deviations. */
export const MARK_WIDE = 1.2
/** The quad a blob is drawn on ends two standard deviations out, so a mark can't be bigger than this. */
export const MARK_MOST = 1.3

/**
 * The engine draws a mark where its cover is at least this, and nothing of it elsewhere: marks write depth so that
 * each pixel shows the nearest one, and an edge that faded out would hide what lies under it.
 */
export const MARK_CUT = 0.5
/**
 * Marks that lie in one plane are at one depth, so each is lifted toward or away from the eye by up to half this
 * share of its own size, by its seed: which of two is on top is then a matter of the two blobs and never of the view.
 */
export const MARK_LIFT = 0.35

/** A `flat` mark is the blob's whole disc out to where a soft blob would have faded to this (the same disc as the engine's maps of parts and depth). */
export const FLAT_CUT = 0.15

/** A blob this opaque or more is solid paint (a mark's alpha is its cover times the blob's opacity times this, at most 1). */
export const MARK_SOLID = 1.5

/**
 * How a blob lies in depth across its ellipse on screen: how much nearer or further it is densest along the line of
 * sight, per pixel right and per pixel up of its center (the mean of its depth given the place on screen). For a flat
 * blob that is its own plane, so flat blobs lying in one plane are at one depth wherever they overlap; a round blob
 * has no slope. `cov` is the blob's covariance in the camera's frame (xx, xy, xz, yy, yz, zz), `jac` the projection's
 * slopes there (pixels per unit: x by x, y by y, x by depth, y by depth), `kernel` the screen blur added to the
 * ellipse. The CPU twin of `tilt` in the engine's `projectSplat`: change one, change both.
 */
export function depthSlope(cov: ArrayLike<number>, jac: ArrayLike<number>, kernel = 0.3): [number, number] {
  const [c00, c01, c02, c11, c12, c22] = cov as number[], [j00, j11, j02, j12] = jac as number[]
  const a = j00 * j00 * c00 + 2 * j00 * j02 * c02 + j02 * j02 * c22 + kernel
  const b = j00 * j11 * c01 + j00 * j12 * c02 + j02 * j11 * c12 + j02 * j12 * c22
  const c = j11 * j11 * c11 + 2 * j11 * j12 * c12 + j12 * j12 * c22 + kernel
  const h0 = c02 * j00 + c22 * j02, h1 = c12 * j11 + c22 * j12
  const det = Math.max(a * c - b * b, 1e-12)
  return [(c * h0 - b * h1) / det, (a * h1 - b * h0) / det]
}

const fract = (x: number) => x - Math.floor(x)
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const hash = (i: number, seed: number) => fract(Math.sin(i * 127.1 + seed * 311.7) * 43758.5453)

/** Smooth noise along a line, 0–1, different for every seed. */
export function noise1(x: number, seed: number): number {
  const i = Math.floor(x), f = x - i
  const a = hash(i, seed), b = hash(i + 1, seed)
  return a + (b - a) * f * f * (3 - 2 * f)
}

/**
 * Streaks across a mark, 0–1, the same after a half turn: the long axis of a blob on screen has no front or back, so
 * it can flip end for end as the view moves, and a mark that looked different turned round would jump.
 */
export function streak(v: number, seed: number, rate: number): number {
  return (noise1(v * rate + 40, seed) + noise1(-v * rate + 40, seed)) / 2
}

/** Drawn outlines (the engine's `InkLines`): something counts as nearer, and gets a line, when its depth is this share less. */
export const LINE_DEPTH = 0.035
/** Drawn outlines: a line between two parts is this share of the pen's width. */
export const LINE_PART = 0.6
/** Drawn outlines: how far the hand wobbles, in pen widths. */
export const LINE_WOBBLE = 0.6
/** Drawn outlines: round something lighter than `dark`, the pen lifts off where its swell is under `swell`. */
export const LINE_BREAK = { dark: 0.22, swell: 0.3 }

/**
 * How strong a drawn outline is, 0–1: heavier round dark things than light ones, swelling and thinning along its
 * length (`swell`, 0–1, smooth noise), and broken off here and there round the lightest. `dark` is 1 less the root of
 * the thing's luminance.
 */
export function lineWeight(dark: number, swell: number): number {
  if (dark < LINE_BREAK.dark && swell < LINE_BREAK.swell) return 0
  return Math.min(1, (0.45 + 0.55 * dark) * (0.75 + 0.5 * swell))
}

/** A pen for drawn outlines (`Stage.setOutline`). */
export interface OutlinePen {
  /** The line's width in CSS pixels (default 1.5). */
  width?: number
  /** Its color, sRGB 0–1 (default the same blue-black as `MarkLook.ink`). */
  ink?: readonly [number, number, number]
}

/** Ink and wash: how far toward a blob's color its wash goes, for the lightest and the darkest. */
export const WASH_LEAST = 0.45
/** See `WASH_LEAST`. */
export const WASH_MOST = 0.85
/** Ink and wash: the pen hatches a blob only when it is darker than `SHADE_FROM` (1 less the root of its luminance), fully from `SHADE_FULL`. */
export const SHADE_FROM = 0.5
/** See `SHADE_FROM`. */
export const SHADE_FULL = 0.72

/** What a mark is at one pixel. */
export interface MarkSample {
  /** How much of the pixel the mark covers, 0–1. Marks are paint: its alpha is this times the blob's opacity times `MARK_SOLID`, at most 1. */
  cover: number
  /** The mark's color there, linear RGB. */
  color: [number, number, number]
}

const luma = (c: ArrayLike<number>) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

/**
 * A mark at (u, v): u along the blob's long axis on screen and v across it, in standard deviations. `rgb` is the
 * blob's color (linear) and `seed` its own number, 0–1. `ink` and `paper` are linear too.
 */
export function markAt(kind: MarkKind, u: number, v: number, seed: number, rgb: ArrayLike<number>, size = 1, ink: ArrayLike<number> = [0.01, 0.012, 0.025], paper: ArrayLike<number> = [0.91, 0.87, 0.77]): MarkSample {
  // flat: all of the disc in the blob's own color, whatever the size
  if (kind === 'flat') return { cover: Math.exp(-0.5 * (u * u + v * v)) >= FLAT_CUT ? 1 : 0, color: [rgb[0], rgb[1], rgb[2]] }
  const k = Math.min(MARK_MOST, Math.max(0.2, size))
  const s = streak(v / k, seed, 5)
  // a dab: a rounded slab whose ends are ragged, each bristle stopping where it ran dry
  const long = MARK_LONG * k * (0.78 + 0.3 * s), wide = MARK_WIDE * k
  const d = Math.pow(Math.abs(u) / long, 4) + Math.pow(Math.abs(v) / wide, 4)
  const cover = 1 - smooth(0.8, 1, d)
  // every blob a touch lighter or darker than the next, as mixed paint is
  const own = 1 + 0.12 * (seed - 0.5)
  if (kind === 'gouache') {
    const shade = own * (0.94 + 0.12 * s)
    return { cover, color: [rgb[0] * shade, rgb[1] * shade, rgb[2] * shade] }
  }
  if (kind === 'oil') {
    // thick paint: ridges between the bristles, lit along one side of each
    const ridge = streak(v / k, seed + 0.37, 9)
    const shade = own * (0.8 + 0.4 * ridge)
    const shine = 0.1 * smooth(0.62, 0.9, ridge)
    return { cover, color: [rgb[0] * shade + shine, rgb[1] * shade + shine, rgb[2] * shade + shine] }
  }
  const dark = 1 - Math.min(1, Math.sqrt(Math.max(0, luma(rgb))))
  if (kind === 'ink') {
    // line and wash: a wash of the blob's color, thinner the lighter it is so the lightest leave the paper nearly
    // bare; and the pen only in the shade, a stroke along the blob that is heavier where it is darker. The outlines
    // are the pen's main work, and are drawn over the whole picture (`Stage.setOutline`)
    const wash = [0, 1, 2].map((c) => paper[c] + (rgb[c] - paper[c]) * (WASH_LEAST + (WASH_MOST - WASH_LEAST) * dark))
    const reach = Math.max(0, 1 - Math.pow(Math.abs(u) / (MARK_LONG * k * 0.95), 2))
    const half = (0.04 + 0.16 * dark) * k * Math.sqrt(reach) * (0.7 + 0.6 * s)
    const pen = reach > 0 ? (1 - smooth(half * 0.6, half + 0.02, Math.abs(v))) * smooth(SHADE_FROM, SHADE_FULL, dark) : 0
    return { cover, color: [0, 1, 2].map((c) => wash[c] + (ink[c] - wash[c]) * pen) as [number, number, number] }
  }
  // hatch: lines along the blob on bare paper, more of each line drawn the darker the blob is
  // measured out from the middle both ways, so the lines are the same after a half turn
  const line = Math.abs(fract(Math.abs(v) / (0.42 * k) + seed) - 0.5) * 2
  const pen = (1 - smooth(dark * 0.7, dark * 0.7 + 0.25, line)) * smooth(0.06, 0.2, dark)
  return { cover, color: [0, 1, 2].map((c) => paper[c] + (ink[c] - paper[c]) * pen) as [number, number, number] }
}
