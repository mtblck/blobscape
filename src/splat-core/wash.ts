/**
 * Watercolor (Matt picked it, 2026-11-19): a scene painted in thin washes on paper. Paint is see-through, so a wash
 * darkens the paper under it and never covers it; its edges run a little and dry darker where the pigment pools;
 * the paper's grain shows through; the lightest places are left as bare paper. The arithmetic here is pure;
 * `splat-engine/washPass.ts` is its shader twin (change both).
 */

/** How a stage draws watercolor (`Stage.setWash`). */
export interface WashLook {
  /** How far a wash's edge runs and wanders, in CSS pixels (4). */
  bleed?: number
  /** How much darker a wash dries at its edges, 0 to 1 (0.6). */
  pool?: number
  /** How much the paper's grain shows in the paint, 0 to 1 (0.55). */
  grain?: number
  /** How strong the paint is, 0 to 1: lower is paler, with more paper showing (0.7). */
  strength?: number
  /** A pencil line under the paint, 0 for none to 1 (0.55). */
  pencil?: number
  /** The paper (sRGB 0–1). */
  paper?: readonly [number, number, number]
  /** A wash behind the subject, top and bottom (sRGB 0–1), laid short of the paper's edge. Left out, the paper is bare. */
  sky?: readonly [readonly [number, number, number], readonly [number, number, number]]
}

/** The paper (sRGB 0–1): a warm white. */
export const WASH_PAPER: readonly [number, number, number] = [0.97, 0.955, 0.92]
/** The pencil (sRGB 0–1). */
export const WASH_PENCIL: readonly [number, number, number] = [0.3, 0.29, 0.31]
/** A color this light or lighter (its brightest channel, linear) is left as bare paper, and one under the second is painted at full strength. */
export const WASH_WHITE: readonly [number, number] = [0.92, 0.6]
/** Paint is richer wet than the picture's color: made this much stronger about its gray. */
export const WASH_RICH = 1.25
/** A wash is this much thinner or thicker from place to place, as water carries the pigment about. */
export const WASH_UNEVEN = 0.22
/** The wash behind the subject stops this far short of the paper's edge, as a share of the picture's height, give or take as much again. */
export const WASH_MARGIN = 0.05
/** And is laid this thin beside the subject's own paint. */
export const WASH_SKY = 0.55

/**
 * Paper with one wash on it: `paint` is the pigment's color (linear, 0–1), `density` how much of it lies there (0
 * none, 1 a full wash, more where it pooled). Paint only ever takes light away, so the result is never lighter
 * than the paper.
 */
export function washed(paper: readonly number[], paint: readonly number[], density: number): [number, number, number] {
  const d = Math.max(0, density)
  // a full wash lets through its own color; a thicker one, that color again and again
  return [paper[0] * Math.max(paint[0], 0.02) ** d, paper[1] * Math.max(paint[1], 0.02) ** d, paper[2] * Math.max(paint[2], 0.02) ** d]
}

/** The pigment for a picture's color (linear): a little richer, and never quite black. */
export function pigment(rgb: readonly number[]): [number, number, number] {
  const gray = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
  const one = (x: number) => Math.min(1, Math.max(0.02, gray + (x - gray) * WASH_RICH))
  return [one(rgb[0]), one(rgb[1]), one(rgb[2])]
}

/** How much of a color is painted at all: nothing for the lightest (bare paper stands for it), all of it for the rest. `top` is its brightest channel. */
export function kept(top: number): number {
  const t = Math.min(1, Math.max(0, (WASH_WHITE[0] - top) / (WASH_WHITE[0] - WASH_WHITE[1])))
  return t * t * (3 - 2 * t)
}

/**
 * How much paint lies at a place: the wash's `cover` there (0 off it, 1 well inside), thinned or thickened by the
 * water (`water`, 0–1), gathered into the paper's grain (`tooth`, 0–1, by `grain`), and more where it pooled as it
 * dried (`edge`, 0–1: how near the wash's edge or a change of color, by `pool`).
 */
export function density(cover: number, water: number, tooth: number, edge: number, look: { strength?: number; grain?: number; pool?: number } = {}): number {
  const base = cover * (look.strength ?? 0.7) * (1 + (water - 0.5) * 2 * WASH_UNEVEN)
  return base * (1 + (tooth - 0.5) * (look.grain ?? 0.35)) * (1 + edge * (look.pool ?? 0.6))
}
