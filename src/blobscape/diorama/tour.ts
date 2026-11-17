import type { Frame } from '../../splat-core/pixel.ts'

/**
 * How it's made: Pixel Diorama's walk through its own steps, from a list of shapes to the finished pixels. Each step
 * shows the live scene a different way; what a step says and how the scene is drawn for it are here, pure and tested.
 */

/** What a step's words are filled in from. */
export interface TourFacts {
  /** Parts in the scene, and the size of its description when it is written as data. */
  parts: number
  descriptionBytes?: number
  blobs: number
  /** Colors in the palette: 0 is full color. */
  colors: number
  /** Whether the scene was painted in steps of the palette as it was cut. */
  steps: boolean
  /** The outline as the Finish tab has it: each thing's own darker tone, one color for everything, or none. */
  lines: 'own' | 'one' | 'none'
}

export interface TourStep {
  id: 'shapes' | 'blobs' | 'paint' | 'samples' | 'finish'
  title: string
  text(f: TourFacts): string
  /** Drawn as pixel art, or as the blobs themselves. */
  pixels: boolean
  /** In plain clay, so the shapes read before their colors. */
  clay: boolean
  /** The share of blobs drawn: under 1 leaves gaps, so the blobs show one by one. */
  keep: number
}

const kb = (bytes: number) => `${(bytes / 1024).toLocaleString('en-US', { maximumFractionDigits: 1 })} KB`

export const TOUR: TourStep[] = [
  {
    id: 'shapes', title: 'Shapes, written down', pixels: false, clay: true, keep: 1,
    text: (f) => `The scene starts as a list of ${f.parts.toLocaleString('en-US')} shapes, each with its paint and the bone that moves it${f.descriptionBytes ? `: ${kb(f.descriptionBytes)} of text` : ''}. Here it is in plain clay.`,
  },
  {
    id: 'blobs', title: 'Cut into blobs', pixels: false, clay: true, keep: 1 / 8,
    text: (f) => `Every bit of surface becomes one flat blob, ${f.blobs.toLocaleString('en-US')} in all. One in eight is drawn here, so you can see them one by one.`,
  },
  {
    id: 'paint', title: 'Painted and lit', pixels: false, clay: false, keep: 1,
    text: (f) => f.steps
      ? 'Each blob carries its own color. Sun, shade and cast shadows are worked out once as it is cut, and the result is moved onto a step of the palette, so shade falls in flat bands.'
      : 'Each blob carries its own color, with sun, shade and cast shadows worked out once as it is cut. Nothing is lit again while it plays, except by lamps and fires.',
  },
  {
    id: 'samples', title: 'Four samples a pixel', pixels: true, clay: false, keep: 1,
    text: () => 'The scene is drawn small, at twice the picture\'s size. Each pixel takes the thing most of its four samples show, and one of that thing\'s samples whole, so an edge is one thing or the other, never a mix.',
  },
  {
    id: 'finish', title: 'Palette and lines', pixels: true, clay: false, keep: 1,
    text: (f) => `${f.colors ? `Every pixel moves to the nearest of ${f.colors} colors` : 'Every pixel keeps its own color'}${f.lines === 'own' ? ', and the edges of things take a line in a darker tone of their own color' : f.lines === 'one' ? ', and the scene takes a dark line round its edge' : ''}. Then it is scaled up in whole pixels.`,
  },
]

/** A blob's color in clay: a warm gray as light as the color was, lifted so shade still shows shape. */
export function clay(c: readonly [number, number, number]): [number, number, number] {
  const v = 0.2 + 0.72 * (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2])
  return [v, v * 0.97, v * 0.93]
}

/** Whether blob `i` is one of the `keep` share a step draws: the same blobs every time, spread evenly over the scene. */
export function kept(i: number, keep: number): boolean {
  if (keep >= 1) return true
  const v = Math.sin(i * 12.9898 + 4.1) * 43758.5453
  return v - Math.floor(v) < keep
}

/**
 * Where the magnifier looks: the box of `size` × `size` art pixels with the most pixels whose four samples show more
 * than one thing (two parts, or a part and nothing), which is where four samples matter. `parts` is the map of parts
 * at twice the art's size. Boxes nearer the middle win ties. Gives the box's top left, in art pixels.
 */
export function busiestSpot(parts: Frame, size = 12): { x: number; y: number } {
  const w = parts.width >> 1, h = parts.height >> 1
  const box = Math.max(1, Math.min(size, w, h))
  // one more row and column than the art: sums of everything above and to the left
  const sum = new Int32Array((w + 1) * (h + 1))
  const id = (sx: number, sy: number) => { const j = (sy * parts.width + sx) * 4; return parts.data[j + 3] < 128 ? -1 : parts.data[j] | (parts.data[j + 1] << 8) | (parts.data[j + 2] << 16) }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = id(x * 2, y * 2)
      const mixed = id(x * 2 + 1, y * 2) !== a || id(x * 2, y * 2 + 1) !== a || id(x * 2 + 1, y * 2 + 1) !== a ? 1 : 0
      sum[(y + 1) * (w + 1) + x + 1] = mixed + sum[y * (w + 1) + x + 1] + sum[(y + 1) * (w + 1) + x] - sum[y * (w + 1) + x]
    }
  }
  let best = { x: Math.max(0, (w - box) >> 1), y: Math.max(0, (h - box) >> 1) }, bestScore = -Infinity
  for (let y = 0; y + box <= h; y++) {
    for (let x = 0; x + box <= w; x++) {
      const count = sum[(y + box) * (w + 1) + x + box] - sum[y * (w + 1) + x + box] - sum[(y + box) * (w + 1) + x] + sum[y * (w + 1) + x]
      const off = Math.hypot(x + box / 2 - w / 2, y + box / 2 - h / 2) / Math.hypot(w, h)
      const score = count - off * box
      if (score > bestScore) { bestScore = score; best = { x, y } }
    }
  }
  return best
}
