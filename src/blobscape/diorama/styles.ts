/** Pixel Diorama's Style tab (Matt asked, 2026-11-19): pixel art first, tech glitch on top of it, then every look Brush and Ink offers. */
import { LOOKS } from '../brushLooks.ts'
import { CEL } from '../celLooks.ts'
import { BLOCKS } from '../blockLooks.ts'
import { NEON } from '../neonLooks.ts'
import { GLASS } from '../glassLooks.ts'
import { WASH } from '../washLooks.ts'
import { GLITCH } from '../glitchLooks.ts'

const PIXEL = { id: 'pixel' as const, label: 'Pixel art', note: 'Drawn small, snapped to a palette and scaled up in whole pixels.' }

/** How a scene is drawn: as pixel art (plain or glitching), or as one of Brush and Ink's looks. */
export type Style = typeof PIXEL.id | typeof GLITCH.id | typeof CEL.id | typeof BLOCKS.id | typeof NEON.id | typeof GLASS.id | typeof WASH.id | (typeof LOOKS)[number]['id']

/** Pixel art first, then tech glitch (pixel art too), then the looks in Brush and Ink's own order (the plain blobs last). */
export const STYLES: { id: Style; label: string; note: string }[] = [PIXEL, GLITCH, ...LOOKS.slice(0, -1), CEL, BLOCKS, NEON, GLASS, WASH, LOOKS[LOOKS.length - 1]]

/** The style an address asks for (`?style=oil`), or pixel art. */
export const styleAsked = (asked: string | null): Style => STYLES.find((s) => s.id === asked)?.id ?? 'pixel'

/** A style as the end of "drawn …", for the line under the view and the view's own label. */
export function styleWords(style: Style): string {
  if (style === 'pixel') return 'as pixel art'
  if (style === 'glitch') return 'as glitching pixel art'
  if (style === 'blobs') return 'as blobs'
  if (style === 'blocks') return 'as blocks'
  if (style === 'ascii') return 'as a grid of characters'
  return `in ${STYLES.find((s) => s.id === style)!.label.toLowerCase()}`
}

/** Whether a style is drawn as pixel art underneath (pixel mode, its palette and finish): pixel art itself and tech glitch. */
export const isPixelStyle = (style: Style): style is 'pixel' | 'glitch' => style === 'pixel' || style === 'glitch'
