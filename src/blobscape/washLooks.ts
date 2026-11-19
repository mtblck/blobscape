/** Watercolor as the pages offer it (Matt picked it, 2026-11-19): its chip, its papers, what the page's controls start at, and the look for the stage. */
import { WASH_PAPER, type WashLook } from '../splat-core/wash.ts'
import { css } from './brushLooks.ts'

/** The chip beside the drawn looks (brushLooks.ts). */
export const WASH = { id: 'watercolor' as const, label: 'Watercolor', note: 'Thin washes on paper: edges that run and dry darker, the grain showing through, the lightest places left bare, and a faint pencil line underneath.' }

/** The papers a wash can be laid on (sRGB 0–1). All light: paint only darkens what is under it. */
export const WASH_PAPERS: { id: string; label: string; paper: readonly [number, number, number] }[] = [
  { id: 'white', label: 'White', paper: WASH_PAPER },
  { id: 'cream', label: 'Cream', paper: [0.95, 0.91, 0.82] },
  { id: 'gray', label: 'Cool gray', paper: [0.86, 0.88, 0.89] },
]

/** What the page's controls make. */
export interface WashChoice { bleed: number; pool: number; grain: number; strength: number; pencil: number; paper: string }
export const WASH_START: WashChoice = { bleed: 4, pool: 0.6, grain: 0.35, strength: 0.7, pencil: 0.55, paper: 'white' }

const paperOf = (id: string) => WASH_PAPERS.find((p) => p.id === id) ?? WASH_PAPERS[0]
/** The color to put behind the canvas before the paper is drawn. */
export const washGround = (c: WashChoice) => css(paperOf(c.paper).paper)

/** The look for the stage; `sky` is the subject's own, top and bottom (sRGB 0–255), where it has one. */
export function washLook(c: WashChoice, sky?: readonly [readonly number[], readonly number[]]): WashLook {
  const one = (v: readonly number[]) => [v[0] / 255, v[1] / 255, v[2] / 255] as const
  return { bleed: c.bleed, pool: c.pool, grain: c.grain, strength: c.strength, pencil: c.pencil, paper: paperOf(c.paper).paper, sky: sky ? [one(sky[0]), one(sky[1])] : undefined }
}
