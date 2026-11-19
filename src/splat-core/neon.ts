/**
 * Neon (Matt's idea, 2026-11-19): a scene drawn as tubes of glowing light along its outlines, over bodies kept dark
 * that catch the light as it runs along the tubes. The arithmetic here is pure; `splat-engine/neonPass.ts` is its
 * shader twin (change both).
 */

/** How a stage draws neon (`Stage.setNeon`). */
export interface NeonLook {
  /** How wide a tube is, in CSS pixels (2). */
  line?: number
  /** How strongly the tubes' light spills round them and onto the bodies: 0 none, 1 as designed, up to 2. */
  glow?: number
  /** How lit the bodies are with no tube near, as a share of their own color (`NEON_BODY`). */
  body?: number
  /** The tubes' colors (sRGB 0–1), dealt out part by part. Left out, each tube takes the color of the thing it goes round, at full strength. */
  colors?: readonly (readonly [number, number, number])[]
  /** How many seconds a pulse of light takes to come round again; 0 holds the light still (4). A scene that loops wants a whole number of these in its loop. */
  period?: number
  /** How far apart two pulses run, as a share of the scene's size (0.45). */
  apart?: number
}

/** Bodies with no tube near keep this share of their own color. */
export const NEON_BODY = 0.05
/** A tube between pulses shines this much of its full light. */
export const NEON_REST = 0.22
/** How fast a pulse dies away behind its head: its light is (1 − how far behind, as a share of the way to the next) to this power. */
export const NEON_TAIL = 3.5
/** A tube's color keeps at least this much of each channel, so a pure red still has a hot core. */
export const NEON_FLOOR = 0.06
/** A thing darker than this in every channel (linear) has no hue to speak of, and its tube is white. */
export const NEON_BLACK = 1e-3
/** How much stronger than its own a tube's color is made, about its gray. */
export const NEON_VIVID = 2.4
/**
 * How many times its own color a thing that gives its own light (`Actor.glow`: a lamp, a lit window, a flame) is
 * drawn into neon's picture, so the pass can tell it from a pale thing: its color goes over white (`lampShare`).
 */
export const NEON_EMIT = 4
/** A pixel whose brightest channel is over the first of these is partly a lamp, and over the second wholly one. */
export const NEON_LAMP: readonly [number, number] = [1.05, 1.6]
/** How brightly a lamp shines beside a tube at a pulse's head. */
export const NEON_LAMP_SHINE = 0.85
/** The most colors a look may deal out. */
export const NEON_COLORS = 6
/** The two ways pulses run through a scene (not unit: the second set of pulses lies closer together). */
export const NEON_WAYS: readonly [readonly [number, number, number], readonly [number, number, number]] = [[0.62, 0.7, 0.36], [-0.75, 0.55, 1.1]]
/** The second set of pulses' share of the first's light. */
export const NEON_SECOND = 0.7
/** How far a part's own number shifts its pulses, in pulses. */
export const NEON_SHIFT = 1

/**
 * The color of the tube round a thing of color `rgb` (linear, 0–1): the same hue at full strength, however dark the
 * thing is. A gray thing gets a white tube.
 */
export function neonColor(rgb: readonly number[]): [number, number, number] {
  const top = Math.max(rgb[0], rgb[1], rgb[2])
  if (!(top > NEON_BLACK)) return [1, 1, 1]
  const c = [rgb[0] / top, rgb[1] / top, rgb[2] / top]
  const gray = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  const v = c.map((x) => Math.min(1, Math.max(0, gray + (x - gray) * NEON_VIVID)))
  const most = Math.max(v[0], v[1], v[2], 1e-4)
  return [Math.max(NEON_FLOOR, v[0] / most), Math.max(NEON_FLOOR, v[1] / most), Math.max(NEON_FLOOR, v[2] / most)]
}

/** One set of pulses: 1 at a pulse's head, dying away behind it to nothing just before the next. `phase` counts pulses. */
export function pulse(phase: number): number {
  const behind = phase - Math.floor(phase)
  return (1 - behind) ** NEON_TAIL
}

/**
 * How brightly a tube shines at a place: `along` is the place measured along each of the two ways, in pulses (its
 * part's shift included), `turn` how many pulses have gone by. Never under `NEON_REST`, 1 at a head.
 */
export function shineAt(along: readonly [number, number], turn: number): number {
  const p = Math.max(pulse(along[0] - turn), NEON_SECOND * pulse(along[1] - turn))
  return NEON_REST + (1 - NEON_REST) * p
}

/**
 * How much of a pixel of neon's picture is a lamp, from its brightest channel (`top`): nothing up to white, all of
 * it well over. A lamp is filled with its own light, steady, and that light is spread onto the bodies round it as
 * the tubes' is.
 */
export function lampShare(top: number): number {
  const t = Math.min(1, Math.max(0, (top - NEON_LAMP[0]) / (NEON_LAMP[1] - NEON_LAMP[0])))
  return t * t * (3 - 2 * t)
}

/** Which of `count` colors a part takes, from the part's shift (0–1). */
export const colorOf = (shift: number, count: number) => Math.min(count - 1, Math.floor(shift * count))

/**
 * A body's color (linear) under the tubes' light: its own color times what it keeps unlit plus the light that
 * reaches it (`light`, the tubes' light spread out, linear).
 */
export function bodyColor(own: readonly number[], light: readonly number[], body = NEON_BODY, glow = 1): [number, number, number] {
  return [own[0] * (body + glow * light[0]), own[1] * (body + glow * light[1]), own[2] * (body + glow * light[2])]
}
