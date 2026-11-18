/**
 * Marks: every blob drawn as a brush mark or an ink stroke in place of a soft dot, so a scene reads as a painting or
 * a drawing from any side. A mark is a function of where a pixel is on its own blob (along the blob's long and short
 * axes on screen, in standard deviations) and of the blob's seed, and of nothing on the screen: marks belong to their
 * blobs, so they stay put as the view moves, where a filter laid over the finished picture slides across it.
 *
 * This file is the CPU twin of the engine's draw (`markOf` in splat-engine/engine.ts): change one, change both.
 */

/** The kinds of mark: flat opaque dabs with bristle streaks, thicker dabs with ridges that catch light, a wash with a pen stroke along each blob, or hatching that is denser where it is darker. */
export type MarkKind = 'gouache' | 'oil' | 'ink' | 'hatch'

/** The kinds, in the order the GPU numbers them (from 1; 0 is no marks). */
export const MARK_KINDS: readonly MarkKind[] = ['gouache', 'oil', 'ink', 'hatch']

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

/** A blob this opaque or more is solid paint (a mark's alpha is its cover times the blob's opacity times this, at most 1). */
export const MARK_SOLID = 1.5

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
    // a wash of the blob's color thinned toward the paper, and a pen stroke along the blob, heavier where it is darker
    const wash = [0, 1, 2].map((c) => paper[c] + (rgb[c] - paper[c]) * 0.7)
    const reach = Math.max(0, 1 - Math.pow(Math.abs(u) / (MARK_LONG * k * 0.95), 2))
    const half = (0.05 + 0.3 * dark) * k * Math.sqrt(reach) * (0.7 + 0.6 * s)
    const pen = reach > 0 ? 1 - smooth(half * 0.6, half + 0.02, Math.abs(v)) : 0
    return { cover, color: [0, 1, 2].map((c) => wash[c] + (ink[c] - wash[c]) * pen) as [number, number, number] }
  }
  // hatch: lines along the blob on bare paper, more of each line drawn the darker the blob is
  // measured out from the middle both ways, so the lines are the same after a half turn
  const line = Math.abs(fract(Math.abs(v) / (0.42 * k) + seed) - 0.5) * 2
  const pen = (1 - smooth(dark * 0.7, dark * 0.7 + 0.25, line)) * smooth(0.06, 0.2, dark)
  return { cover, color: [0, 1, 2].map((c) => paper[c] + (ink[c] - paper[c]) * pen) as [number, number, number] }
}
