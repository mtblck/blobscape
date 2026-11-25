/** 3D glasses as the pages offer it (Matt's idea, 2026-11-25: red and blue shifted apart, coming together only through 3D glasses): its chip, what the page's controls start at, and the look for the stage. */
import { ANAGLYPH_BACK, type AnaglyphLook, type AnaglyphMix } from '../../splat-core/anaglyph.ts'

/** The chip beside the drawn looks (brushLooks.ts). */
export const ANAGLYPH = { id: 'anaglyph' as const, label: '3D glasses', note: 'Drawn from two eyes a little apart and laid over each other in red and cyan: doubled to the bare eye, standing in depth through red and cyan glasses.' }

/** The mixes as the page offers them. */
export const ANAGLYPH_MIX_CHOICES: { id: AnaglyphMix; label: string; about: string }[] = [
  { id: 'optimized', label: 'Balanced', about: 'Most of the scene’s color, with little of either eye’s picture leaking through the other lens.' },
  { id: 'color', label: 'Full color', about: 'The brightest colors, but reds show through the cyan lens as a ghost.' },
  { id: 'half', label: 'Half color', about: 'The left eye sees gray, the right its colors: less ghosting, reds turn dark.' },
  { id: 'gray', label: 'Gray', about: 'No color at all, and the least ghosting: the depth is clearest.' },
]

/** What the page's controls make. */
export interface AnaglyphChoice {
  /** How deep it looks, as a share of the usual eyes. */
  depth: number
  /** How far the screen stands behind what the view looks at, as a share of the distance to it. */
  pop: number
  /** How the two pictures are mixed. */
  mix: AnaglyphMix
  /** The palette the scene is painted from before it is drawn: 'none' keeps its own colors, 'own' is the scene's, else a shared one. */
  palette: string
}
/** Where 3D glasses' settings start. */
export const ANAGLYPH_START: AnaglyphChoice = { depth: 1, pop: 0.2, mix: 'optimized', palette: 'none' }

const css = (c: readonly number[]) => `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`

/** The color to put behind the canvas before the picture is drawn (the pass covers it): the subject's sky where it has one, else the dark backdrop. */
export const anaglyphGround = (sky?: readonly [readonly number[], readonly number[]]) => (sky ? `linear-gradient(rgb(${sky[0].join(' ')}), rgb(${sky[1].join(' ')}))` : `linear-gradient(${css(ANAGLYPH_BACK[0])}, ${css(ANAGLYPH_BACK[1])})`)

/** The look for the stage; `sky` is the subject's own, top and bottom (sRGB 0–255), which stands behind it at the screen. */
export function anaglyphLook(c: AnaglyphChoice, sky?: readonly [readonly number[], readonly number[]]): AnaglyphLook {
  const one = (v: readonly number[]) => [v[0] / 255, v[1] / 255, v[2] / 255] as const
  return { depth: c.depth, pop: c.pop, mix: c.mix, back: sky ? [one(sky[0]), one(sky[1])] : ANAGLYPH_BACK }
}
