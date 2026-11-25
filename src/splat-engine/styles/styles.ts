/** Diorama's Style tab (Matt asked, 2026-11-19, and for blocks first and as the style a page starts in, 2026-11-24): blocks, pixel art, tech glitch on top of it, then every look Brush and Ink offers. */
import { LOOKS } from './brushLooks.ts'
import { CEL } from './celLooks.ts'
import { BLOCKS } from './blockLooks.ts'
import { NEON } from './neonLooks.ts'
import { GLASS } from './glassLooks.ts'
import { WASH } from './washLooks.ts'
import { HALFTONE } from './halftoneLooks.ts'
import { KNIT } from './knitLooks.ts'
import { GLITCH } from './glitchLooks.ts'

const PIXEL = { id: 'pixel' as const, label: 'Pixel art', note: 'Drawn small, snapped to a palette and scaled up in whole pixels.' }

/** How a scene is drawn: as pixel art (plain or glitching), or as one of Brush and Ink's looks. */
export type Style = typeof PIXEL.id | typeof GLITCH.id | typeof CEL.id | typeof BLOCKS.id | typeof NEON.id | typeof GLASS.id | typeof WASH.id | typeof HALFTONE.id | typeof KNIT.id | (typeof LOOKS)[number]['id']

/** Blocks first, then pixel art and tech glitch (pixel art too), then the looks in Brush and Ink's own order (the plain blobs last). */
export const STYLES: { id: Style; label: string; note: string }[] = [BLOCKS, PIXEL, GLITCH, ...LOOKS.slice(0, -1), CEL, NEON, GLASS, WASH, HALFTONE, KNIT, LOOKS[LOOKS.length - 1]]

/** The style a page starts in, and the one a plain address means: blocks. Every other style is named in the address (`?style=pixel`). */
export const DEFAULT_STYLE: Style = BLOCKS.id

/**
 * The style an address or a kept scene asks for (`?style=oil`), or the default. Text keeps the id `ascii` (`?style=text`
 * means it too), and a Text picture in box drawing or quarter blocks (`?style=ascii&chars=lines`, kept before
 * 2026-11-25) is Box Art now, so `chars` is the address's or the kept Text settings' set of characters.
 */
export function styleAsked(asked: string | null, chars?: string | null): Style {
  const id = asked === 'text' ? 'ascii' : asked
  if (id === 'ascii' && (chars === 'lines' || chars === 'blocks')) return 'boxart'
  return STYLES.find((s) => s.id === id)?.id ?? DEFAULT_STYLE
}

/** A style as the end of "drawn …", for the line under the view and the view's own label. */
export function styleWords(style: Style): string {
  if (style === 'pixel') return 'as pixel art'
  if (style === 'glitch') return 'as glitching pixel art'
  if (style === 'blobs') return 'as blobs'
  if (style === 'blocks') return 'as blocks'
  if (style === 'ascii') return 'as text'
  if (style === 'boxart') return 'as box art'
  if (style === 'knit') return 'as knitting'
  if (style === 'halftone') return 'as a halftone print'
  return `in ${STYLES.find((s) => s.id === style)!.label.toLowerCase()}`
}

/** Whether a style is drawn as pixel art underneath (pixel mode, its palette and finish): pixel art itself and tech glitch. */
export const isPixelStyle = (style: Style): style is 'pixel' | 'glitch' => style === 'pixel' || style === 'glitch'

/** Whether a style lights the scene itself, so the scene is cut with no light baked in: cel shading, neon, stained glass, blocks and knitting (which wants each thing in its own flat colors). */
export const lightsItself = (style: Style | undefined): boolean => style === 'cel' || style === 'neon' || style === 'glass' || style === 'blocks' || style === 'knit'
