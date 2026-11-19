/** Tech glitch as Pixel Diorama offers it (Matt's idea, 2026-11-19): its chip, the page's choices and the look for the stage. */
import { GLITCH_PACES, type GlitchLook } from '../splat-core/glitch.ts'

/** The chip in the Style tab, after pixel art: it is pixel art with bursts of corruption laid on. */
export const GLITCH = { id: 'glitch' as const, label: 'Tech glitch', note: 'Pixel art with bursts of signal corruption that pop in and out: rows slide, red and blue split apart and blocks break up, in sudden steps.' }

/** What the page's controls make. */
export interface GlitchChoice { amount: number; strength: number; jitter: boolean; split: boolean; blocks: boolean; pace: number; seed: number }
export const GLITCH_START: GlitchChoice = { amount: 0.5, strength: 0.6, jitter: true, split: true, blocks: true, pace: 12, seed: 0 }

/** How often bursts come, by name. */
export const GLITCH_AMOUNTS: { id: string; label: string; amount: number }[] = [
  { id: 'rare', label: 'Now and then', amount: 0.25 },
  { id: 'often', label: 'Often', amount: 0.5 },
  { id: 'wild', label: 'All the time', amount: 1 },
]

/** The steps a second the page offers. */
export const GLITCH_PACE_CHOICES = GLITCH_PACES

/** The look for the stage. A scene's loop keeps it joined up; under reduced motion it never bursts. */
export const glitchLook = (c: GlitchChoice, loop?: number, still = false): GlitchLook => ({ ...c, loop, still })
