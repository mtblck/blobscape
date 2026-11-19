/** Stained glass as the pages offer it (Matt picked it, 2026-11-19): its chip, what the page's controls start at, and the look for the stage. */
import type { GlassLook } from '../splat-core/glass.ts'

/** The chip beside the drawn looks (brushLooks.ts). */
export const GLASS = { id: 'glass' as const, label: 'Stained glass', note: 'A leaded window: every surface cut into panes of colored glass that stay put as the view turns, lead between them, and the light behind.' }

/** What shows before the window is drawn: the lead's own color. */
export const GLASS_GROUND = '#121010'

/** How many flat colors each part's own are gathered into (`gatherColors`) before it is glazed. */
export const GLASS_FILLS = 2

/** What the page's controls make. */
export interface GlassChoice { pane: number; lead: number; shine: number; vary: number }
export const GLASS_START: GlassChoice = { pane: 0.06, lead: 3, shine: 0.5, vary: 0.5 }

/** The look for the stage; `sky` is the subject's own, top and bottom (sRGB 0–255), where it has one. */
export function glassLook(c: GlassChoice, sky?: readonly [readonly number[], readonly number[]]): GlassLook {
  const one = (v: readonly number[]) => [v[0] / 255, v[1] / 255, v[2] / 255] as const
  return { pane: c.pane, lead: c.lead, shine: c.shine, vary: c.vary, sky: sky ? [one(sky[0]), one(sky[1])] : undefined }
}
