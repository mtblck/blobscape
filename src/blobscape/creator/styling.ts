import type { Rgb } from '../../splat-core/pixel.ts'
import { PALETTES, type Palette } from '../diorama/scene.ts'

/**
 * Style mode (Scene Creator, #339): the palettes pixel art can snap to. The settings and the pixel look are shared
 * with Diorama (`styleSettings.ts`, `StyleControls.tsx`); the other styles are Brush and Ink's, through `useDrawnLook`.
 */

/** The project's own palette (its land's colors, then each prop's that the land lacks), then every shared one. */
export const paletteChoices = (own: Rgb[]): Palette[] => [{ id: 'own', label: 'Its own', colors: own }, ...PALETTES]
