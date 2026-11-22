/**
 * Times of day a page can set a scene in (Matt, 2026-11-21: the time of day is a setting of the scene, which every
 * style respects). A time brings its sky, a light that multiplies everything but the scene's own lamps, and whether it
 * is dark, which is what lamps, lit windows and fires go by (`litFor` in splat-engine/sceneDoc.ts).
 */
import { linearToSrgb, srgbToLinear } from '../splat-core/color.ts'
import type { Rgb } from '../splat-core/pixel.ts'
import { joinPalettes } from '../splat-engine/project.ts'
import { MOONLIGHT } from './celLooks.ts'

export type TimeId = 'morning' | 'afternoon' | 'night'

export interface TimeOfDay {
  id: TimeId
  label: string
  /** The sky, top and bottom, as a description writes one. */
  sky: [string, string]
  /** What multiplies everything but the scene's own lamps and what glows (linear). */
  light: readonly [number, number, number]
  /** How high the sun or moon stands, in degrees, for a look that lights the scene itself. */
  height: number
  /** Whether lamps that wait for the dark are lit. */
  dark: boolean
  /** The hour a live sun stands at for it (Scene Creator's Light mode sets its clock to this). */
  hour: number
}

/** The colors, lights, heights and hours are mine, not Matt's yet. */
export const TIMES: TimeOfDay[] = [
  { id: 'morning', label: 'Morning', sky: ['#9cc4e4', '#f9c58d'], light: [1, 0.86, 0.68], height: 20, dark: false, hour: 8 },
  { id: 'afternoon', label: 'Afternoon', sky: ['#6fb1e6', '#cfe6f4'], light: [1, 1, 1], height: 55, dark: false, hour: 15 },
  { id: 'night', label: 'Night', sky: ['#0d1228', '#27325a'], light: MOONLIGHT, height: 40, dark: true, hour: 22 },
]

/** The time asked for by name (`?time=night`), or none: the scene as it is written. */
export const timeAsked = (q: string | null | undefined): TimeId | undefined => TIMES.find((t) => t.id === q)?.id
export const timeOf = (id: TimeId): TimeOfDay => TIMES.find((t) => t.id === id)!

const hex = (c: readonly number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

/** A color (sRGB 0–255) as it looks under a light. */
export function under(c: readonly number[], light: readonly number[]): Rgb {
  return [0, 1, 2].map((k) => Math.round(linearToSrgb(Math.min(1, srgbToLinear(c[k] / 255) * light[k])) * 255)) as Rgb
}

/**
 * A palette for a scene at a time of day: its own colors as the time's light leaves them, the sky's two, then its own
 * as they were (what its lamps light and what glows keep those), joined down to what a palette holds. Pixel art snaps
 * to it, so a scene made for the day has its night's colors to snap to.
 */
export function paletteAt(colors: readonly Rgb[], time: TimeOfDay): Rgb[] {
  if (time.light.every((v) => v === 1)) return joinPalettes([colors.map(hex), time.sky])
  return joinPalettes([[...colors.map((c) => hex(under(c, time.light))), ...time.sky], colors.map(hex)])
}
