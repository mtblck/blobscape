import type { Rgb } from '../../splat-core/pixel.ts'
import { PALETTES as SPRITE_PALETTES } from '../../splat-to-sprite/palettes.ts'

/**
 * What Pixel Diorama's scenes share: the detail levels (the grid each is cut on) and the palettes the page offers.
 * The scenes themselves are descriptions in `scenes/` (the lighthouse too, since issue #333).
 */

export const DETAIL = [
  { id: 'chunky', label: 'Chunky', spacing: 0.042 },
  { id: 'medium', label: 'Medium', spacing: 0.03 },
  { id: 'fine', label: 'Fine', spacing: 0.022 },
  { id: 'finest', label: 'Finest', spacing: 0.017 },
] as const

/** `note` says where a borrowed palette comes from, under the strip on the page. */
export interface Palette { id: string; label: string; colors: Rgb[]; note?: string }

const shared = (id: string): Rgb[] => SPRITE_PALETTES.find((p) => p.id === id)!.colors

const hex = (...h: string[]): Rgb[] => h.map((c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)])

export const PALETTES: Palette[] = [
  { id: 'dusk', label: 'Dusk', colors: hex('#0b1026', '#1b2148', '#27407a', '#3f62a8', '#6fa3d8', '#cfe6f5', '#22402f', '#3f7a45', '#69b05a', '#3b3848', '#514c5e', '#6b6474', '#9d97a6', '#d3cfd6', '#6b4a35', '#a37a52', '#d8c08f', '#7d2836', '#c9485a', '#f4f1e4', '#ffd166', '#fff3b0') },
  { id: 'ember', label: 'Ember', colors: hex('#120a06', '#2b1608', '#4d260b', '#7a3d0d', '#a85d12', '#d98a1f', '#f5b83d', '#ffe08a', '#fff6d6', '#cfe9f2') },
  { id: 'pocket', label: 'Pocket', colors: hex('#0f2a1d', '#2f5d3a', '#7fae5a', '#d8e8a0') },
  { id: 'ink', label: 'Ink', colors: hex('#101018', '#3a3a52', '#8a8aa6', '#e8e6f0') },
  { id: 'pico8', label: 'PICO-8', note: 'The 16 colors of the PICO-8 fantasy console.', colors: shared('pico8') },
  { id: 'sweetie16', label: 'Sweetie 16', note: 'Sweetie 16, a 16 color palette by GrafxKid.', colors: shared('sweetie16') },
  { id: 'endesga32', label: 'Endesga 32', note: 'Endesga 32, a 32 color palette by Endesga.', colors: shared('endesga32') },
  { id: 'neon', label: 'Neon', colors: hex('#0d0221', '#1f0a47', '#3d1378', '#7a1fa2', '#c2259c', '#ff3d8b', '#ff8fb8', '#ffd9e8', '#123a6b', '#1a7fb5', '#27d3e6', '#b8fbff') },
  { id: 'sepia', label: 'Sepia', colors: hex('#1c120b', '#3d2a1a', '#6b4a2e', '#9c7448', '#c9a473', '#ecd9b0') },
  { id: 'onebit', label: '1-bit', note: 'Two colors, as on the first black and white screens.', colors: hex('#16161d', '#f1ecdc') },
  { id: 'none', label: 'Full color', colors: [] },
]
