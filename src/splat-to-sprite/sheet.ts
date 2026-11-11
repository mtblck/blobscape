import {
  alphaCut, autoPalette, darkest, downsample, outline, quantize, removeStrays,
  type Frame, type Rgb,
} from '../splat-core/pixel.ts'

export interface PixelSettings {
  size: number
  /** Render this many times bigger, then average down. */
  supersample: number
  alphaCut: number
  /** 'auto' builds one from the frames; 'none' keeps every colour. */
  palette: Rgb[] | 'auto' | 'none'
  autoColours: number
  dither: number
  strays: boolean
  outline: 'none' | 'darkest' | 'black'
}

export interface Stages {
  raw: Frame
  shrunk: Frame
  snapped: Frame
  final: Frame
  palette: Rgb[]
}

/** One frame through the whole pipeline, keeping every stage so the page can show them. */
export function processFrames(raws: Uint8Array[], s: PixelSettings, premultiplied: boolean): Stages[] {
  const big = s.size * s.supersample
  const raw = raws.map((r) => downsample(r, big, 1, { premultiplied, flipY: true }))
  const shrunk = raws.map((r) => downsample(r, big, s.supersample, { premultiplied, flipY: true }))
  const cut = shrunk.map((f) => alphaCut(f, s.alphaCut))
  const palette = s.palette === 'auto' ? autoPalette(cut, s.autoColours) : s.palette === 'none' ? [] : s.palette
  const snapped = cut.map((f) => quantize(f, palette, s.dither))
  const ink: Rgb = s.outline === 'black' ? [0, 0, 0] : darkest(palette.length ? palette : sample(snapped))
  const final = snapped.map((f) => {
    let g = s.strays ? removeStrays(f) : f
    if (s.outline !== 'none') g = outline(g, ink)
    return g
  })
  return raws.map((_, i) => ({ raw: raw[i], shrunk: shrunk[i], snapped: snapped[i], final: final[i], palette }))
}

function sample(frames: Frame[]): Rgb[] {
  const out: Rgb[] = []
  for (const f of frames) for (let i = 0; i < f.data.length; i += 64) if (f.data[i + 3]) out.push([f.data[i] * 0.35, f.data[i + 1] * 0.35, f.data[i + 2] * 0.35])
  return out
}

export type Layout = 'single' | 'dir4' | 'dir8' | 'spin8' | 'spin12'

export interface Shot {
  name: string
  /** Degrees added to the chosen camera angle. */
  turn: number
}

/**
 * Which camera turns make which rows. The camera circles the object; the
 * object's front faces +Z, so turning the camera +90° shows its left side.
 * Row order for 4 directions follows Tinkerkit (and RPG Maker): down, left, right, up.
 */
export function shotsFor(layout: Layout): { rows: { name: string; shots: Shot[] }[] } {
  const dir = (name: string, turn: number) => ({ name, shots: [{ name, turn }] })
  switch (layout) {
    case 'single':
      return { rows: [dir('down', 0)] }
    case 'dir4':
      return { rows: [dir('down', 0), dir('left', 90), dir('right', -90), dir('up', 180)] }
    case 'dir8':
      return {
        rows: [dir('down', 0), dir('down-left', 45), dir('left', 90), dir('up-left', 135), dir('up', 180), dir('up-right', -135), dir('right', -90), dir('down-right', -45)],
      }
    case 'spin8':
    case 'spin12': {
      const n = layout === 'spin8' ? 8 : 12
      return { rows: [{ name: 'spin', shots: Array.from({ length: n }, (_, i) => ({ name: `spin-${i}`, turn: (i * 360) / n })) }] }
    }
  }
}

/**
 * Directional layouts go one direction per row (Tinkerkit's convention, so
 * `idle-down` is frame 0, `idle-left` is the first frame of row 2 and so on).
 * A spin is one row of frames.
 */
export function packSheet(frames: Frame[], layout: Layout): { canvas: HTMLCanvasElement; cols: number; rows: number } {
  const { rows } = shotsFor(layout)
  const cols = Math.max(...rows.map((r) => r.shots.length))
  const size = frames[0].width
  const canvas = document.createElement('canvas')
  canvas.width = cols * size
  canvas.height = rows.length * size
  const ctx = canvas.getContext('2d')!
  let k = 0
  rows.forEach((row, r) => {
    row.shots.forEach((_, c) => {
      const f = frames[k++]
      ctx.putImageData(new ImageData(new Uint8ClampedArray(f.data), f.width, f.height), c * size, r * size)
    })
  })
  return { canvas, cols, rows: rows.length }
}

/** Mirrors Tinkerkit's `SpriteSheet` document (packages/format/src/spritesheet.ts, format version 71). */
export function tinkerkitSheet(name: string, image: string, layout: Layout, size: number, cols: number, rowsN: number, anchorY = size) {
  const { rows } = shotsFor(layout)
  const animations: Record<string, { frames: number[]; fps: number; loop: boolean }> = {}
  rows.forEach((row, r) => {
    const frames = row.shots.map((_, c) => r * cols + c)
    if (row.name === 'spin') animations.spin = { frames, fps: 10, loop: true }
    else animations[`idle-${row.name}`] = { frames: [frames[0]], fps: 1, loop: false }
  })
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'splat-sprite'
  return {
    kind: 'spritesheet',
    formatVersion: 71,
    id,
    name,
    image,
    imageWidth: cols * size,
    imageHeight: rowsN * size,
    frameWidth: size,
    frameHeight: size,
    pixelScale: 1,
    anchor: { x: size / 2, y: anchorY },
    footprint: { x: -size / 4, y: -4, w: size / 2, h: 4 },
    animations,
  }
}

/** One past the lowest solid row of a frame: where the object's feet are, for the sheet's anchor. */
export function baseline(f: Frame): number {
  for (let y = f.height - 1; y >= 0; y--) {
    for (let x = 0; x < f.width; x++) if (f.data[(y * f.width + x) * 4 + 3] > 0) return y + 1
  }
  return f.height
}
