/**
 * 3D glasses (Matt's idea, 2026-11-25): the scene drawn twice, from two eyes a little apart, and the two pictures laid
 * one over the other in red and cyan. Without glasses things stand doubled, a red ghost to one side and a cyan one to
 * the other; through red and cyan glasses each eye sees only its own picture and the scene comes together in depth.
 *
 * Pure: the eyes' geometry and how the two pictures are mixed, which `AnaglyphPass` (splat-engine/anaglyphPass.ts)
 * repeats in its shader. Change both.
 */

/** An RGB color, linear 0–1. */
type Rgb3 = readonly [number, number, number]

/** How the two pictures are mixed into one. */
export type AnaglyphMix = 'optimized' | 'color' | 'half' | 'gray'

/**
 * How the eyes are set and the pictures mixed. Glasses are red over the left eye and cyan over the right, the
 * usual pair.
 */
export interface AnaglyphLook {
  /** How far apart the eyes are, as a share of the usual (`EYE_SHARE` of the distance to what the view looks at): 0 is flat, 1 the usual, 2 twice as deep. */
  depth?: number
  /** Where the screen stands, past what the view looks at, as a share of the distance to it: 0 puts that at the screen, 0.5 puts the screen half as far again behind it, so more comes out toward you. */
  pop?: number
  /** How the two pictures are mixed. */
  mix?: AnaglyphMix
  /** What is behind the scene, top and bottom (sRGB 0–1), the same in both eyes so it sits at the screen. */
  back?: readonly [Rgb3, Rgb3]
}

/** The usual eyes: a thirtieth of the distance to what the view looks at, a stereo photographer's rule of thumb. */
export const EYE_SHARE = 1 / 30
/** What is behind a scene with no sky of its own (sRGB): a dark gray, which shows the least ghosting through either lens. */
export const ANAGLYPH_BACK: readonly [Rgb3, Rgb3] = [[0.2, 0.21, 0.23], [0.13, 0.13, 0.15]]

/**
 * The two eyes for a view looking at something `distance` away: how far each stands to the side of the camera
 * (`half`, the left eye at −half along the camera's right, the right at +half), and how far away the screen is
 * (`screen`), where a thing is drawn in the same place for both eyes.
 */
export function eyesFor(distance: number, look: AnaglyphLook): { half: number; screen: number } {
  const d = Math.max(1e-4, distance)
  const depth = Math.max(0, look.depth ?? 1)
  const pop = Math.max(0, look.pop ?? 0)
  return { half: (d * EYE_SHARE * depth) / 2, screen: d * (1 + pop) }
}

/**
 * How far an eye's picture is slid across (in clip space, per unit of w) so that a point `screen` away, straight
 * ahead of the camera, lands in the middle of both: `side` is the eye's place along the camera's right, `p00` the
 * projection's x scale. Add it to the projection matrix's element 8 (x from z) negated, as `eyeProjection` does.
 */
export const eyeSlide = (side: number, p00: number, screen: number) => (side * p00) / screen

/** An eye's projection matrix (column-major, as three.js keeps it): the camera's own with x slid by `eyeSlide`. */
export function eyeProjection(p: ArrayLike<number>, side: number, screen: number): number[] {
  const out = Array.from(p)
  out[8] -= eyeSlide(side, p[0], screen)
  return out
}

/**
 * Where a point in the camera's own frame (x right, y up, looking down −z) lands across the picture for an eye,
 * in normalized device coordinates: that eye stands at `side` along x and uses `eyeProjection`. The CPU check of
 * what the shader is given.
 */
export function eyeX(p: ArrayLike<number>, side: number, screen: number, at: readonly [number, number, number]): number {
  const m = eyeProjection(p, side, screen)
  const x = at[0] - side, y = at[1], z = at[2]
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12]
  const w = m[3] * x + m[7] * y + m[11] * z + m[15]
  return cx / w
}

/**
 * Each mix as two 3×3 matrices, rows for red, green and blue of the result, columns for the left and right
 * pictures' red, green and blue (linear). `optimized` is Eric Dubois's least-squares red–cyan projection, which
 * keeps most color while each lens passes little of the other eye's picture; `color` hands the left eye's red and
 * the right eye's green and blue over as they are (bright, but reds ghost); `half` gives the left eye its gray and
 * the right its color; `gray` gives both their gray (no color, least ghosting).
 */
export const EYE_MIX: Record<AnaglyphMix, { left: readonly Rgb3[]; right: readonly Rgb3[] }> = {
  optimized: {
    left: [[0.456, 0.5, 0.176], [-0.04, -0.038, -0.016], [-0.015, -0.021, -0.005]],
    right: [[-0.043, -0.088, -0.002], [0.378, 0.734, -0.018], [-0.072, -0.113, 1.226]],
  },
  color: {
    left: [[1, 0, 0], [0, 0, 0], [0, 0, 0]],
    right: [[0, 0, 0], [0, 1, 0], [0, 0, 1]],
  },
  half: {
    left: [[0.2126, 0.7152, 0.0722], [0, 0, 0], [0, 0, 0]],
    right: [[0, 0, 0], [0, 1, 0], [0, 0, 1]],
  },
  gray: {
    left: [[0.2126, 0.7152, 0.0722], [0, 0, 0], [0, 0, 0]],
    right: [[0, 0, 0], [0.2126, 0.7152, 0.0722], [0.2126, 0.7152, 0.0722]],
  },
}

/** The mixes in the order the page offers them. */
export const ANAGLYPH_MIXES: readonly AnaglyphMix[] = ['optimized', 'color', 'half', 'gray']

/** One pixel of the finished picture (linear, 0–1) from the two eyes' pixels there (linear, over the backdrop). */
export function mixEyes(left: Rgb3, right: Rgb3, mix: AnaglyphMix = 'optimized'): [number, number, number] {
  const m = EYE_MIX[mix] ?? EYE_MIX.optimized
  const row = (k: number) => {
    const l = m.left[k], r = m.right[k]
    const v = l[0] * left[0] + l[1] * left[1] + l[2] * left[2] + r[0] * right[0] + r[1] * right[1] + r[2] * right[2]
    return Math.min(1, Math.max(0, v))
  }
  return [row(0), row(1), row(2)]
}
