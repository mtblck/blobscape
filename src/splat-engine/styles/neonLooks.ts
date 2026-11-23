/** Neon as the pages offer it (Matt's idea, 2026-11-19): its chip, the tubes' colors, how fast the light runs, and the look for the stage. */
import type { NeonLook } from '../../splat-core/neon.ts'

/** The chip beside the drawn looks (brushLooks.ts). */
export const NEON = { id: 'neon' as const, label: 'Neon', note: 'Tubes of glowing light along every outline, with pulses running along them, over dark bodies that catch the light as it passes.' }

/** What neon stands on: near black, a little violet, as a night street. */
export const NEON_GROUND = '#06050b'

/** The tubes' colors: each thing's own at full strength, or a set dealt out part by part (sRGB 0–1). */
export const NEON_SETS: { id: string; label: string; colors?: readonly (readonly [number, number, number])[] }[] = [
  { id: 'own', label: 'Their own' },
  { id: 'signs', label: 'Signs', colors: [[1, 0.16, 0.55], [0.1, 0.9, 1], [1, 0.86, 0.15], [0.3, 1, 0.4], [0.66, 0.36, 1], [1, 0.45, 0.12]] },
  { id: 'synth', label: 'Magenta and cyan', colors: [[1, 0.1, 0.75], [0.08, 0.92, 1]] },
  { id: 'ice', label: 'Ice', colors: [[0.72, 0.92, 1]] },
]

/** How fast the light runs: the seconds a pulse takes to come round again, about (0 holds it still). */
export const NEON_PACES: { id: string; label: string; period: number }[] = [
  { id: 'still', label: 'Still', period: 0 },
  { id: 'slow', label: 'Slow', period: 6 },
  { id: 'steady', label: 'Steady', period: 3 },
  { id: 'fast', label: 'Fast', period: 1.5 },
]

/** What the page's controls make. */
export interface NeonChoice {
  /** A tube's width, in CSS pixels. */
  line: number
  /** How strongly the tubes' light spreads. */
  glow: number
  /** How much of its own color a body keeps in the dark, 0 to 1. */
  body: number
  /** The tubes' colors, an id of `NEON_SETS`. */
  set: string
  /** How fast the light runs, an id of `NEON_PACES`. */
  pace: string
}
/** Where neon's settings start. */
export const NEON_START: NeonChoice = { line: 2, glow: 1, body: 0.05, set: 'own', pace: 'steady' }

/**
 * The period nearest `about` seconds that goes a whole number of times into a loop of `loop` seconds, so a recorded
 * loop joins up; `about` itself where nothing loops.
 */
export function periodIn(about: number, loop?: number): number {
  if (!(about > 0) || !loop || !(loop > 0)) return Math.max(0, about)
  return loop / Math.max(1, Math.round(loop / about))
}

/** The look for the stage. Under reduced motion the light holds still. */
export function neonLook(c: NeonChoice, loop?: number, still = false): NeonLook {
  const set = NEON_SETS.find((s) => s.id === c.set) ?? NEON_SETS[0], pace = NEON_PACES.find((p) => p.id === c.pace) ?? NEON_PACES[2]
  return { line: c.line, glow: c.glow, body: c.body, colors: set.colors, period: still ? 0 : periodIn(pace.period, loop) }
}
