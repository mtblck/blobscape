/** Halftone screen print as the pages offer it (Matt asked for our own, 2026-11-25): its chip, its sets of inks and papers, what the page's controls start at, and the look for the stage. */
import { HALFTONE_PAPER, type HalftoneInk, type HalftoneLook, type Rgb01 } from '../../splat-core/halftone.ts'
import { css } from './brushLooks.ts'

/** The chip beside the drawn looks (brushLooks.ts). */
export const HALFTONE = { id: 'halftone' as const, label: 'Halftone print', note: 'Screen printed in a few see-through inks, each laid as dots on its own turned screen, so the picture is dots that grow and run together, the plates a little off true and the ink taking unevenly.' }

/** The sets of inks a print can be made in. Black takes the grays first where a set has it. */
export const HALFTONE_SETS: { id: string; label: string; about: string; inks: HalftoneInk[] }[] = [
  {
    id: 'process', label: 'Four color', about: 'Cyan, magenta, yellow and black, as a magazine is printed: every color comes out close.',
    inks: [
      { color: [0.13, 0.12, 0.13], angle: 45, key: true },
      { color: [0, 0.64, 0.94], angle: 15 },
      { color: [0.91, 0.1, 0.5], angle: 75 },
      { color: [1, 0.9, 0.05], angle: 0 },
    ],
  },
  {
    id: 'poster', label: 'Bright poster', about: 'Fluorescent pink, yellow and a deep blue, as a hand-pulled poster: colors lean warm and loud.',
    inks: [
      { color: [0.05, 0.33, 0.66], angle: 45 },
      { color: [1, 0.3, 0.55], angle: 15 },
      { color: [1, 0.88, 0.1], angle: 75 },
    ],
  },
  {
    id: 'duotone', label: 'Duotone', about: 'Navy and orange: every color is told in two inks, so the picture takes their mood.',
    inks: [
      { color: [0.11, 0.18, 0.36], angle: 45 },
      { color: [0.98, 0.5, 0.18], angle: 15 },
    ],
  },
  {
    id: 'newsprint', label: 'Newsprint', about: 'One black ink, as a newspaper photo: light and dark only.',
    inks: [{ color: [0.12, 0.11, 0.12], angle: 45, key: true }],
  },
]

/** The papers a print can be pulled on (sRGB 0–1). All light: ink only darkens what is under it. */
export const HALFTONE_PAPERS: { id: string; label: string; paper: Rgb01 }[] = [
  { id: 'white', label: 'White', paper: HALFTONE_PAPER },
  { id: 'newsprint', label: 'Newsprint', paper: [0.89, 0.87, 0.81] },
  { id: 'cream', label: 'Cream', paper: [0.96, 0.91, 0.8] },
]

/** What the page's controls make. */
export interface HalftoneChoice {
  /** The inks, an id of `HALFTONE_SETS`. */
  inks: string
  /** A cell of the screen, in CSS pixels. */
  cell: number
  /** How far each plate sits off true, in CSS pixels. */
  shift: number
  /** How unevenly the ink takes, 0 to 1. */
  texture: number
  /** The paper, an id of `HALFTONE_PAPERS`. */
  paper: string
  /** Whether the subject's sky is printed behind it, or the paper left bare there. */
  sky: boolean
  /** The palette the scene is painted from before it is printed: 'none' keeps its own colors, 'own' is the scene's, else a shared one. */
  palette: string
}
/** Where halftone's settings start. */
export const HALFTONE_START: HalftoneChoice = { inks: 'process', cell: 7, shift: 1, texture: 0.4, paper: 'white', sky: true, palette: 'none' }

const paperOf = (id: string) => HALFTONE_PAPERS.find((p) => p.id === id) ?? HALFTONE_PAPERS[0]
const setOf = (id: string) => HALFTONE_SETS.find((s) => s.id === id) ?? HALFTONE_SETS[0]
/** The color to put behind the canvas before the print is drawn. */
export const halftoneGround = (c: HalftoneChoice) => css(paperOf(c.paper).paper)

/** The sky printed behind a subject with no sky of its own, top and bottom (sRGB 0–1): a pale blue going warm toward the ground. */
export const HALFTONE_SKY: readonly [Rgb01, Rgb01] = [[0.62, 0.78, 0.9], [0.96, 0.9, 0.78]]

/** The look for the stage; `sky` is the subject's own, top and bottom (sRGB 0–255), or `HALFTONE_SKY` where it has none. */
export function halftoneLook(c: HalftoneChoice, sky?: readonly [readonly number[], readonly number[]]): HalftoneLook {
  const one = (v: readonly number[]): Rgb01 => [v[0] / 255, v[1] / 255, v[2] / 255]
  return { inks: setOf(c.inks).inks, paper: paperOf(c.paper).paper, cell: c.cell, shift: c.shift, texture: c.texture, sky: !c.sky ? undefined : sky ? [one(sky[0]), one(sky[1])] : HALFTONE_SKY }
}
