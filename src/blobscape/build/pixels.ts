import type { Frame, PixelLook, Rgb } from '../../splat-core/pixel.ts'
import type { SceneDoc } from '../../splat-engine/sceneDoc.ts'
import { SCENE_SOLVED, SCENE_START, docText } from './scene.ts'

/**
 * Lesson 24's settings and measures: the cottage from lesson 23 drawn as pixel art. Pure and tested.
 */

/** The cottage with its lantern flickering and its tree still, so the only thing that moves is the light. */
export const PIXEL_SCENE: SceneDoc = { ...SCENE_START, name: 'Cottage in pixels', lights: SCENE_SOLVED.lights }

export interface Palette { id: string; label: string; colors: Rgb[] }

const rgb = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]

export const PALETTES: Palette[] = [
  { id: 'own', label: 'Its own 14', colors: PIXEL_SCENE.palette.map(rgb) },
  { id: 'six', label: '6 colors', colors: ['#141a33', '#2a2f55', '#4a7a3a', '#8a2f2a', '#d8c09a', '#ffd166'].map(rgb) },
  { id: 'four', label: '4 colors', colors: ['#1a1c33', '#3f6e3a', '#b8452f', '#f2d49a'].map(rgb) },
]

/** Pixel sizes on the chips: screen pixels across one picture pixel. */
export const SIZES = [2, 3, 4, 6, 8]
/** Held frames a second on the Motion chips; 0 is smooth. */
export const RATES = [0, 12, 8]

export interface PixelOptions {
  pixels: boolean
  size: number
  palette: string
  dither: number
  outline: boolean
  edges: boolean
  steady: boolean
  rate: number
}

export const PIXELS_START: PixelOptions = { pixels: false, size: 3, palette: 'own', dither: 0.1, outline: true, edges: true, steady: false, rate: 0 }

/** The goals' lines: a picture this narrow, this few colors, and a light that flips no more than this share of it. */
export const SMALL = 200
export const FEW = 4
export const STILL = 0.002

/** How steady pixels are set when on: the engine's own `STEADY`. */
const STEADY = 0.04

/** The look for these settings, on the scene's own (its sky, its glow). */
export function lookFor(base: PixelLook, o: PixelOptions): PixelLook {
  const colors = (PALETTES.find((p) => p.id === o.palette) ?? PALETTES[0]).colors
  // every palette lists its darkest color first: that is the outline
  return { ...base, palette: colors, dither: o.dither, outline: o.outline ? colors[0] : null, edges: o.edges ? 1 : 0, steady: o.steady ? STEADY : 0 }
}

/** How many colors a picture uses (pixels with nothing in them don't count). */
export function colorsIn(f: Frame): number {
  const seen = new Set<number>()
  for (let i = 0; i < f.width * f.height; i++) {
    if (f.data[i * 4 + 3] < 128) continue
    seen.add((f.data[i * 4] << 16) | (f.data[i * 4 + 1] << 8) | f.data[i * 4 + 2])
  }
  return seen.size
}

/** The share of a picture's pixels whose color changed from one look to the next (undefined if the pictures differ in size). */
export function changed(a: Frame, b: Frame): number | undefined {
  if (a.width !== b.width || a.height !== b.height) return
  let n = 0
  const d = a.data, e = b.data
  for (let i = 0; i < a.width * a.height; i++) {
    const k = i * 4
    if (d[k] !== e[k] || d[k + 1] !== e[k + 1] || d[k + 2] !== e[k + 2] || d[k + 3] !== e[k + 3]) n++
  }
  return n / (a.width * a.height)
}

const list = (c: Rgb[]) => `[${c.map((x) => `[${x.join(', ')}]`).join(', ')}]`

/** The code that draws the cottage as these settings do, with the package. */
export function pixelCode(o: PixelOptions): string {
  const colors = (PALETTES.find((p) => p.id === o.palette) ?? PALETTES[0]).colors
  return `import { Stage, compileScene, buildVoxels, type SceneDoc } from '@blobscape/engine'

const doc: SceneDoc = ${docText(PIXEL_SCENE)}

const scene = compileScene(doc)
const stage = await Stage.start(document.querySelector('canvas')!, { lights: true })
stage.setActor(buildVoxels(scene.spec(0.028)))
stage.orbit = scene.orbit
stage.setFloor(0) // the scene brings its own ground
stage.setPoser((sk, t) => {
  scene.pose(sk, t)
  stage.setLights(scene.lights(t))
})
${o.pixels ? `
// pixel art: the scene drawn small, each pixel snapped to a palette color, ${o.size} screen pixels to one
const palette: [number, number, number][] = ${list(colors)}
stage.setPixels({
  ...scene.look,
  palette,
  dither: ${o.dither}, // mixes two colors where neither is close
  outline: ${o.outline ? 'palette[0]' : 'null'}, // a line round the scene's edge
  edges: ${o.edges ? 1 : 0}, // lines inside, where a color meets a much lighter one
  steady: ${o.steady ? STEADY : 0}, // a pixel keeps last frame's color unless another is clearly closer
}, ${o.size})
${o.rate ? `// hold each pose for 1/${o.rate} of a second, as drawn animation does
stage.step = 1 / ${o.rate}
` : ''}` : `
// stage.setPixels(scene.look, 4) would draw it as pixel art, in the look the scene asks for
`}`
}
