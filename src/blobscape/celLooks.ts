/** Cel shading as Brush and Ink offers it: its chip, its backdrops, and the way to the light from the two sliders. */
import type { CelLook } from '../splat-core/cel.ts'

/** The chip beside the drawn looks (brushLooks.ts). */
export const CEL = { id: 'cel' as const, label: 'Cel shading', note: 'Flat color, the light cut into two or three clean tones, shadows cast by whatever stands in the light, and an even outline.' }

/** What the cel stands on, and the shade and line that go with it. */
export const BACKDROPS: { id: string; label: string; back: string; shade: readonly [number, number, number]; ink: readonly [number, number, number] }[] = [
  { id: 'sky', label: 'Sky', back: '#bfdcec', shade: [0.6, 0.6, 0.82], ink: [0.09, 0.08, 0.14] },
  { id: 'cream', label: 'Cream', back: '#f1e9d6', shade: [0.66, 0.58, 0.72], ink: [0.16, 0.1, 0.1] },
  { id: 'dusk', label: 'Dusk', back: '#e8a98a', shade: [0.56, 0.44, 0.7], ink: [0.17, 0.07, 0.16] },
  { id: 'night', label: 'Night', back: '#1d2440', shade: [0.36, 0.4, 0.72], ink: [0.03, 0.03, 0.08] },
]

/** The way to a light `turn` degrees round the upright (0 is from +z, 90 from +x, as a view's azimuth) and `height` degrees up. */
export function lightFrom(turn: number, height: number): [number, number, number] {
  const a = (turn * Math.PI) / 180, e = (height * Math.PI) / 180
  return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)]
}

/** What the page's controls make. */
export interface CelChoice { turn: number; height: number; tones: 2 | 3; shadows: boolean; smooth: number; line: number; backdrop: string; /** How many colors each part's own are gathered into (`gatherColors`); 0 leaves them as painted. */ fills: number }
export const CEL_START: CelChoice = { turn: -50, height: 40, tones: 2, shadows: true, smooth: 8, line: 1.5, backdrop: 'sky', fills: 3 }

/** The look for the stage. */
export function celLook(c: CelChoice): CelLook {
  const b = BACKDROPS.find((x) => x.id === c.backdrop) ?? BACKDROPS[0]
  return { from: lightFrom(c.turn, c.height), tones: c.tones, shadows: c.shadows, smooth: c.smooth, line: c.line, shade: b.shade, ink: b.ink }
}

/** Flat fills take out speckle finer than this many of a typical blob's size; an eye or an apple a few blobs across stays. */
export const FILL_REACH = 2.2

/** A sky this dark or darker (the mean lightness of its top and bottom, sRGB 0–1) is night, and one this light or lighter is day. */
export const NIGHT_SKY = 0.18
export const DAY_SKY = 0.42
/** What a night's light multiplies every tone by (linear): dim and blue, as moonlight is painted. */
export const MOONLIGHT: readonly [number, number, number] = [0.3, 0.38, 0.62]

/** How much a sky (top and bottom, sRGB 0–255) is a night's: 0 by day, 1 at night, between at dusk. */
export function nightOf(sky: readonly [readonly number[], readonly number[]]): number {
  const light = (c: readonly number[]) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255
  const t = Math.max(0, Math.min(1, (DAY_SKY - (light(sky[0]) + light(sky[1])) / 2) / (DAY_SKY - NIGHT_SKY)))
  return t * t * (3 - 2 * t)
}

/** What cel shading's tones are multiplied by under a sky that much a night's (`CelLook.ambient`): nothing by day, `MOONLIGHT` at night. */
export function nightLight(night: number): [number, number, number] {
  return [1 + (MOONLIGHT[0] - 1) * night, 1 + (MOONLIGHT[1] - 1) * night, 1 + (MOONLIGHT[2] - 1) * night]
}
