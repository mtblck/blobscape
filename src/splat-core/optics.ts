/**
 * A camera's lens, in plain numbers: how far out of focus a thing at some distance is, and how much of a bright
 * light spills round it. `SplatLens` (splat-engine/lens.ts) draws with these; they are here apart from any
 * drawing so tests can ask them, and so the shader and the numbers shown on a page come from one place.
 *
 * Focus is the thin lens: a lens of focal length f, set to be sharp at distance s, draws a point at distance d as a
 * disc (its circle of confusion) of diameter A·f·|d − s| / (d·(s − f)) on the film, where A = f / N is the opening
 * for f-number N. So blur grows with the opening, grows fast for things nearer than the focus, and levels off behind
 * it. The focal length follows from the view's angle and the film's height, taken as a 35 mm frame's 24 mm unless
 * given: a scene a few meters across then blurs as a photograph of a small real place does.
 */

/** How a view is finished through a lens. Distances are in the scene's units (meters). */
export interface OpticsLook {
  /** The distance in front of the camera that is sharp. */
  focus: number
  /** The f-number: 2 is a wide opening and a thin slice in focus, 16 keeps nearly everything sharp. 0 or less turns focus blur off. */
  fNumber: number
  /**
   * The film's height, in the scene's units: 0.024 (a 35 mm frame) when left out. A bigger film blurs more at the
   * same f-number. A scene photographed as a model of itself, 1/n of its size, is the same as a film n times as high.
   */
  film?: number
  /** The widest blur drawn, as a share of the picture's height: 0.02 when left out. */
  most?: number
  /**
   * How strongly the light over `knee` spills round it: 0 for none. A small bright thing's light is spread thin, so
   * about 1 suits a picture that holds light well over white, and several one that stops at white (where a flame is
   * drawn no brighter than paper).
   */
  glow: number
  /** How bright (linear, 0 to 1 and over) a pixel must be before it glows: 0.7 when left out. */
  knee?: number
  /**
   * Where strong light starts to roll off toward white instead of running straight into it, as film does: about 0.7.
   * Left out, light over 1 clips, each of red, green and blue on its own, which turns a fair thing in strong light
   * into a flat pale patch.
   */
  shoulder?: number
}

/** A lens's focal length for a view `fov` degrees tall on film `film` high, in the film's units. */
export const focalLength = (fov: number, film = 0.024) => film / 2 / Math.tan((fov * Math.PI) / 360)

/**
 * The number the shader multiplies |d − s| / d by to get a blur radius in pixels: A·f / (s − f), halved (a radius),
 * as a share of the film and so of the picture's `height` in pixels. 0 when focus blur is off or the focus is
 * inside the lens.
 */
export function blurScale(look: OpticsLook, fov: number, height: number): number {
  const film = look.film ?? 0.024, f = focalLength(fov, film)
  if (!(look.fNumber > 0) || look.focus <= f) return 0
  return ((f / look.fNumber) * f) / (look.focus - f) / 2 / film * height
}

/** The radius, in pixels, of the disc a point `depth` in front of the camera is drawn as, for a picture `height` pixels tall: 0 at the focus, never over `most`. The CPU twin of the shader's. */
export function blurRadius(depth: number, look: OpticsLook, fov: number, height: number): number {
  if (!(depth > 0)) return 0
  return Math.min((look.most ?? 0.02) * height, (blurScale(look, fov, height) * Math.abs(depth - look.focus)) / depth)
}

/** The nearest and farthest distances drawn no blurrier than `sharp` pixels: the slice in focus. `far` is Infinity when everything behind the focus is that sharp. */
export function sharpRange(look: OpticsLook, fov: number, height: number, sharp = 1): { near: number; far: number } {
  const k = blurScale(look, fov, height)
  if (k <= 0) return { near: 0, far: Infinity }
  // k·|d − s| / d = sharp, on each side of s
  return { near: (k * look.focus) / (k + sharp), far: k > sharp ? (k * look.focus) / (k - sharp) : Infinity }
}

/** How much of a pixel's light glows: nothing under the knee, then rising smoothly to all of it a third of the knee higher. The CPU twin of the shader's. */
export function glowShare(brightest: number, knee = 0.7): number {
  const t = Math.max(0, Math.min(1, (brightest - knee) / (knee / 3)))
  return t * t * (3 - 2 * t)
}

/**
 * A brightness after the film's shoulder: unchanged up to `start`, then closing on 1 ever more slowly and never
 * passing it. The lens scales a pixel's whole color by this over its brightest channel, so its hue holds. The CPU
 * twin of the shader's.
 */
export function rolledOff(brightest: number, start: number): number {
  if (!(start < 1) || brightest <= start) return Math.min(brightest, Math.max(1, start))
  const room = 1 - start
  return start + room * (1 - Math.exp(-(brightest - start) / room))
}
