import { STEADY, darkest, type PixelLook, type Rgb } from '../../splat-core/pixel.ts'
import { PALETTES, type Palette } from '../diorama/scene.ts'
import type { Diorama } from '../diorama/scenes.ts'

/**
 * Style mode (Scene Creator, #339), pure so it is tested: the palettes pixel art can snap to and the pixel look made
 * from the visitor's choices. The other styles are Brush and Ink's, through `useDrawnLook`.
 */

/** The project's own palette (its land's colors, then each prop's that the land lacks), then every shared one. */
export const paletteChoices = (own: Rgb[]): Palette[] => [{ id: 'own', label: 'Its own', colors: own }, ...PALETTES]

/** Pixel art's settings in Style mode. */
export interface PixelChoice {
  palette: string
  /** Each art pixel this many device pixels across. */
  size: number
  /** Frames a second the scene moves at; 0 is every frame the screen shows. */
  rate: number
  dither: number
  outline: boolean
  edges: boolean
  parts: boolean
  sky: boolean
}

/** Pixel sizes and paces on offer, as Pixel Diorama has them. */
export const PIXEL_SIZES = [2, 3, 4, 6]
export const PIXEL_RATES = [0, 12, 8]

/** What a scene's own finish starts pixel art on. */
export const pixelStart = (finish: Diorama['finish']): PixelChoice => ({
  palette: 'own', size: 2, rate: 0, dither: finish.dither, outline: finish.outline, edges: finish.edges, parts: true, sky: finish.sky,
})

/** The pixel look for a choice: its palette's colors, the sky when it is wanted, and the scene's glow. */
export function pixelLook(c: PixelChoice, palettes: Palette[], sky: PixelLook['sky'], glow: number): PixelLook {
  const colors = (palettes.find((p) => p.id === c.palette) ?? palettes[0]).colors
  return {
    palette: colors, dither: c.dither, outline: c.outline ? (colors.length ? darkest(colors) : [11, 16, 38]) : null, glow,
    edges: c.edges ? 1 : 0, parts: c.parts, sky: c.sky ? sky : undefined, steady: STEADY, tidy: true, fine: true, own: true,
  }
}
