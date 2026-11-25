/** Watercolor as the pages offer it (Matt picked it, 2026-11-19): its chip, its papers, what the page's controls start at, and the look for the stage. */
import { WASH_PAPER, type WashLook } from '../../splat-core/wash.ts'
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
export interface WashChoice {
  /** How far a wash's edge wanders over the paper, in CSS pixels. */
  bleed: number
  /** How much darker paint gathers where a wash ends, 0 to 1. */
  pool: number
  /** How much the paper's tooth shows, 0 to 1. */
  grain: number
  /** How much paint is laid on, 0 to 1. */
  strength: number
  /** How strong the pencil line is, 0 for none. */
  pencil: number
  /** The paper, an id of `WASH_PAPERS`. */
  paper: string
  /** The palette the scene is painted from before it is drawn: 'none' keeps its own colors, 'own' is the scene's, else a shared one. */
  palette: string
}
/** Where watercolor's settings start. */
export const WASH_START: WashChoice = { bleed: 4, pool: 0.6, grain: 0.35, strength: 0.7, pencil: 0.55, paper: 'white', palette: 'none' }

const paperOf = (id: string) => WASH_PAPERS.find((p) => p.id === id) ?? WASH_PAPERS[0]
/** The color to put behind the canvas before the paper is drawn. */
export const washGround = (c: WashChoice) => css(paperOf(c.paper).paper)

/**
 * The wash behind a subject with no sky of its own, top and bottom (sRGB 0–1): a pale blue going warm toward the
 * ground, so the paper still has a painted sky on it (Matt, 2026-11-22: bare paper read as no background at all).
 */
export const WASH_SKY_COLORS: readonly [readonly [number, number, number], readonly [number, number, number]] = [[0.64, 0.76, 0.87], [0.93, 0.89, 0.8]]

/** The look for the stage; `sky` is the subject's own, top and bottom (sRGB 0–255), or `WASH_SKY_COLORS` where it has none. */
export function washLook(c: WashChoice, sky?: readonly [readonly number[], readonly number[]]): WashLook {
  const one = (v: readonly number[]) => [v[0] / 255, v[1] / 255, v[2] / 255] as const
  return { bleed: c.bleed, pool: c.pool, grain: c.grain, strength: c.strength, pencil: c.pencil, paper: paperOf(c.paper).paper, sky: sky ? [one(sky[0]), one(sky[1])] : WASH_SKY_COLORS }
}
