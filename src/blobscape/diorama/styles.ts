/** Pixel Diorama's Style tab (Matt asked, 2026-11-19): pixel art first, then every look Brush and Ink offers. */
import { LOOKS } from '../brushLooks.ts'
import { CEL } from '../celLooks.ts'

const PIXEL = { id: 'pixel' as const, label: 'Pixel art', note: 'Drawn small, snapped to a palette and scaled up in whole pixels.' }

/** How a scene is drawn: as pixel art, or as one of Brush and Ink's looks. */
export type Style = typeof PIXEL.id | typeof CEL.id | (typeof LOOKS)[number]['id']

/** Pixel art first, then the looks in Brush and Ink's own order (the plain blobs last). */
export const STYLES: { id: Style; label: string; note: string }[] = [PIXEL, ...LOOKS.slice(0, -1), CEL, LOOKS[LOOKS.length - 1]]

/** The style an address asks for (`?style=oil`), or pixel art. */
export const styleAsked = (asked: string | null): Style => STYLES.find((s) => s.id === asked)?.id ?? 'pixel'

/** A style as the end of "drawn …", for the line under the view and the view's own label. */
export function styleWords(style: Style): string {
  if (style === 'pixel') return 'as pixel art'
  if (style === 'blobs') return 'as blobs'
  if (style === 'ascii') return 'as a grid of characters'
  return `in ${STYLES.find((s) => s.id === style)!.label.toLowerCase()}`
}
