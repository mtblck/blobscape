import { srgbToLinear } from './color.ts'
/**
 * The 2D half of Splat to Sprite: everything that happens after the splat has
 * been rendered. Pure functions on RGBA byte arrays so they can be unit tested
 * without a GPU.
 *
 * Pipeline per frame:
 *   supersampled render → box downsample → alpha cut → palette (+dither) →
 *   stray-pixel cleanup → outline
 */

/** A color as three numbers: red, green and blue, 0 to 255 in a palette. */
export type Rgb = [number, number, number]

/** A picture as RGBA bytes. */
export interface Frame {
  /** Pixels across. */
  width: number
  /** Pixels down. */
  height: number
  /** RGBA, row 0 at the top, straight (not premultiplied) alpha. */
  data: Uint8ClampedArray
}

export function makeFrame(width: number, height: number): Frame {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}

/**
 * Averages each `factor`×`factor` block of the big render into one pixel.
 * GL readback is bottom-up, so this also flips rows. Color is averaged
 * weighted by alpha, so a pixel half covered by a red blob comes out red at
 * 50% coverage, not dark red.
 */
export function downsample(
  src: Uint8Array | Uint8ClampedArray,
  srcSize: number,
  factor: number,
  opts: { premultiplied: boolean; flipY: boolean },
): Frame {
  const size = Math.floor(srcSize / factor)
  const out = makeFrame(size, size)
  const n = factor * factor
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < factor; sy++) {
        const row = (y * factor + sy) * srcSize
        for (let sx = 0; sx < factor; sx++) {
          const i = (row + x * factor + sx) * 4
          const al = src[i + 3]
          const w = opts.premultiplied ? 255 : al
          r += src[i] * w
          g += src[i + 1] * w
          b += src[i + 2] * w
          a += al
        }
      }
      const oy = opts.flipY ? size - 1 - y : y
      const o = (oy * size + x) * 4
      if (a > 0) {
        out.data[o] = r / a
        out.data[o + 1] = g / a
        out.data[o + 2] = b / a
      }
      out.data[o + 3] = a / n
    }
  }
  return out
}

/** Pixel art has no half-transparent pixels: coverage at or over the cut becomes solid, the rest empty. */
export function alphaCut(f: Frame, threshold: number): Frame {
  const out = { ...f, data: new Uint8ClampedArray(f.data) }
  const t = threshold * 255
  for (let i = 3; i < out.data.length; i += 4) out.data[i] = out.data[i] >= t ? 255 : 0
  return out
}

// --- color ---------------------------------------------------------------

const toLinear = (c: number) => srgbToLinear(c / 255)

/** OKLab, so "nearest palette color" matches what an eye would pick, not raw RGB distance. */
export function oklab(r: number, g: number, b: number): Rgb {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function rgbToHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

function nearest(lab: Rgb, paletteLab: Rgb[]): number {
  let best = 0, bestD = Infinity
  for (let i = 0; i < paletteLab.length; i++) {
    const p = paletteLab[i]
    const d = (lab[0] - p[0]) ** 2 + (lab[1] - p[1]) ** 2 + (lab[2] - p[2]) ** 2
    if (d < bestD) { bestD = d; best = i }
  }
  return best
}

/** 4×4 Bayer matrix, values 0..15. */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/**
 * Snaps every solid pixel to the palette. `dither` (0..1) nudges each pixel by
 * an ordered Bayer offset first, so a gradient between two palette colors
 * becomes a checker pattern instead of a hard band — the classic pixel-art
 * trick for faking colors the palette doesn't have.
 */
export function quantize(f: Frame, palette: Rgb[], dither: number): Frame {
  const out = { ...f, data: new Uint8ClampedArray(f.data) }
  if (palette.length === 0) return out
  const pl = palette.map((c) => oklab(...c))
  // Spread of the palette's lightness sets how big a dither nudge is.
  const amp = dither * 48
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const i = (y * f.width + x) * 4
      if (out.data[i + 3] === 0) continue
      const off = dither > 0 ? (BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * amp : 0
      const idx = nearest(oklab(out.data[i] + off, out.data[i + 1] + off, out.data[i + 2] + off), pl)
      const c = palette[idx]
      out.data[i] = c[0]
      out.data[i + 1] = c[1]
      out.data[i + 2] = c[2]
    }
  }
  return out
}

/**
 * Builds a palette from the frames themselves: k-means in OKLab over every
 * solid pixel of every frame, so all directions of a sheet share one palette.
 * Deterministic (fixed seed) so the same input always gives the same sheet.
 */
export function autoPalette(frames: Frame[], k: number): Rgb[] {
  const px: Rgb[] = []
  for (const f of frames) {
    for (let i = 0; i < f.data.length; i += 4) if (f.data[i + 3] > 0) px.push([f.data[i], f.data[i + 1], f.data[i + 2]])
  }
  if (px.length === 0) return []
  const labs = px.map((c) => oklab(...c))
  let seed = 1234567
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  // k-means++ seeding
  const centers: Rgb[] = [labs[Math.floor(rand() * labs.length)]]
  const dist = new Float64Array(labs.length)
  while (centers.length < Math.min(k, labs.length)) {
    let sum = 0
    for (let i = 0; i < labs.length; i++) {
      const c = centers[nearest(labs[i], centers)]
      dist[i] = (labs[i][0] - c[0]) ** 2 + (labs[i][1] - c[1]) ** 2 + (labs[i][2] - c[2]) ** 2
      sum += dist[i]
    }
    if (sum === 0) break
    let r = rand() * sum, j = 0
    while (j < labs.length - 1 && (r -= dist[j]) > 0) j++
    centers.push(labs[j])
  }
  const assign = new Int32Array(labs.length)
  for (let iter = 0; iter < 12; iter++) {
    for (let i = 0; i < labs.length; i++) assign[i] = nearest(labs[i], centers)
    const acc = centers.map(() => [0, 0, 0, 0])
    for (let i = 0; i < labs.length; i++) {
      const a = acc[assign[i]]
      a[0] += labs[i][0]; a[1] += labs[i][1]; a[2] += labs[i][2]; a[3]++
    }
    acc.forEach((a, c) => { if (a[3]) centers[c] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]] })
  }
  // Report each cluster as the mean of its real sRGB pixels (no OKLab→sRGB inverse needed).
  const rgbAcc = centers.map(() => [0, 0, 0, 0])
  for (let i = 0; i < px.length; i++) {
    const a = rgbAcc[assign[i]]
    a[0] += px[i][0]; a[1] += px[i][1]; a[2] += px[i][2]; a[3]++
  }
  return rgbAcc
    .filter((a) => a[3] > 0)
    .map((a) => [Math.round(a[0] / a[3]), Math.round(a[1] / a[3]), Math.round(a[2] / a[3])] as Rgb)
    .sort((p, q) => oklab(...p)[0] - oklab(...q)[0])
}

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

/** Drops solid pixels with no solid neighbor: single specks from stray, far-off splats. */
export function removeStrays(f: Frame): Frame {
  const out = { ...f, data: new Uint8ClampedArray(f.data) }
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < f.width && y < f.height && f.data[(y * f.width + x) * 4 + 3] > 0
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      if (!solid(x, y)) continue
      if (!N4.some(([dx, dy]) => solid(x + dx, y + dy))) out.data[(y * f.width + x) * 4 + 3] = 0
    }
  }
  return out
}

/** A 1-pixel outline around the silhouette, drawn on the empty pixels that touch it. */
export function outline(f: Frame, color: Rgb, diagonal = false): Frame {
  const out = { ...f, data: new Uint8ClampedArray(f.data) }
  const dirs = diagonal ? [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]] : N4
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < f.width && y < f.height && f.data[(y * f.width + x) * 4 + 3] > 0
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      if (solid(x, y)) continue
      if (dirs.some(([dx, dy]) => solid(x + dx, y + dy))) {
        const i = (y * f.width + x) * 4
        out.data[i] = color[0]; out.data[i + 1] = color[1]; out.data[i + 2] = color[2]; out.data[i + 3] = 255
      }
    }
  }
  return out
}

/** Darkest color of a palette: the usual outline choice. */
export function darkest(palette: Rgb[]): Rgb {
  if (!palette.length) return [20, 16, 24]
  return palette.reduce((a, b) => (oklab(...a)[0] <= oklab(...b)[0] ? a : b))
}

export function countSolid(f: Frame): number {
  let n = 0
  for (let i = 3; i < f.data.length; i += 4) if (f.data[i] > 0) n++
  return n
}

export function countColors(f: Frame): number {
  const s = new Set<number>()
  for (let i = 0; i < f.data.length; i += 4) if (f.data[i + 3] > 0) s.add((f.data[i] << 16) | (f.data[i + 1] << 8) | f.data[i + 2])
  return s.size
}

// --- whole scenes ----------------------------------------------------------

/** How a scene is turned into pixel art, live (splat-engine/pixelPass.ts) or here on the CPU. */
export interface PixelLook {
  /** The colors every pixel snaps to; empty keeps the scene's own colors. */
  palette: Rgb[]
  /** 0..1, as for `quantize`. */
  dither: number
  /** A 1-pixel line round the scene's silhouette, or none. */
  outline: Rgb | null
  /**
   * The outline in a darker tone of whatever it goes round, not one color for the whole scene: each outline pixel takes
   * the palette color nearest a darker step of the scene pixel beside it (`outline`'s own color where the palette has
   * nothing darker). Needs `outline`.
   */
  own?: boolean
  /**
   * Four samples a pixel: the scene is drawn at twice the art's size and each art pixel is settled from its 2×2 samples
   * (`resolveFine`) before anything else happens, so a pixel on the edge of a thing shows one thing or the other, never
   * a mix. The live pass does it itself; `pixelArt` is given the settled frame.
   */
  fine?: boolean
  /** How far bright pixels spill light onto their neighbors: 0 is none. */
  glow: number
  /** Lines inside the scene, where one color meets a much lighter one: 0 (or left out) is none, 1 the darkest line. */
  edges?: number
  /**
   * A line where one part of the scene meets another whose color is too close for `edges` to draw one (two things of one color, one in front of the other), at `edges`' strength or full strength without it.
   * Needs a map of the parts drawn beside the scene (`pixelArt`'s `parts`; the live pass draws its own).
   */
  parts?: boolean
  /**
   * A backdrop behind the scene: its color at the top and at the bottom of the picture, blended between and dithered into the palette.
   * `reach` is how far down the picture the blend runs before it is all the bottom color (above 0, up to 1; the whole way when left out or not a sound number: `skyReach`).
   * Left out, empty pixels stay clear.
   */
  sky?: [top: Rgb, bottom: Rgb, reach?: number]
  /**
   * Steady pixels: a pixel keeps the palette color it had in the frame before unless another is closer by more than this (an OKLab distance; 0 or left out is off).
   * Without it, a pixel that sits between two colors flips back and forth as lights flicker and the view turns.
   */
  steady?: number
  /**
   * Lone-pixel cleanup, as a pixel artist does it: a scene pixel whose color none of its eight neighbors shares, while
   * six or more of them share one other color, takes that color. With a map of parts, only a pixel inside its own
   * part (four or more neighbors of its part) is touched, so a speck, an eye or a firefly in front of something stays.
   * A checkerboard dither keeps its pixels: each has its own color on the diagonals.
   */
  tidy?: boolean
  /**
   * Dither that stays on the things it falls on: each blob takes one step of the Bayer pattern from where it sits in
   * its own rest pose (`ditherRank`), not from the pixel it lands on, so the pattern rides with a turning view or a
   * moving creature instead of standing still on the screen while they slide under it. Needs a map of each pixel's
   * step drawn beside the scene (`pixelArt`'s `ranks`; the live pass draws its own). The sky keeps the screen's pattern.
   * After Silicon Jungle's Ink Studio (object-space dither, MIT), with their agreement.
   */
  surface?: boolean
  /**
   * Holds the picture on the art's grid: the world's origin always lands on a whole art pixel, so when the view slides
   * (a pan, a zoom, a camera that follows) the scene moves by whole pixels instead of smearing across them. The live
   * pass only (`snapShift`). After Ink Studio's camera snap, which does it for a flat view; here it holds for a
   * perspective view at the origin's depth.
   */
  snap?: boolean
  /**
   * Glow in bands (1 or 2): in place of the soft spill round bright pixels, each pixel within `HALO_R` art pixels of a
   * glowing one takes a flat share of its light by how far it is, in rings, as hand-drawn pixel art lights a lamp.
   * After Ink Studio's banded glow (MIT), with their agreement.
   */
  bands?: number
  /**
   * Heat haze: pixels above anything glowing (within `HEAT_R` across and up to `HEAT_UP` more above) are drawn from a
   * pixel or so to one side, the shift running in waves that change `pace` times a second (a whole number a loop, so a
   * recording joins). `pixels` is the most a pixel moves, 1 to 3. After Ink Studio's heat effect (MIT).
   */
  heat?: { pixels: number; pace: number }
  /**
   * Color cycling: scene pixels whose palette color is one of `colors` step along the list `pace` times a second, as
   * old games ran water and fire. Each color is taken to its nearest in the palette, so a visitor's own palette still
   * cycles. Steady pixels leave these colors alone. After Ink Studio's palette cycles (MIT).
   */
  cycle?: { colors: Rgb[]; pace: number }[]
  /**
   * Lighter outlines on lit sides ("selout"): an outline beside a scene pixel lighter than `SELOUT_FROM` takes a shade
   * just under that pixel's own color instead of the outline, so the line shows only where the thing is in shade. Needs
   * `outline`. After Ink Studio's lit and shadow line colors (MIT).
   */
  selout?: boolean
}

/** Banded glow reaches this many art pixels from a glowing one, and lends this share of its light at the nearest band. */
export const HALO_R = 3, HALO_SHARE = 0.5
/** Heat haze: how far across and how far above a glowing pixel the air shimmers, and its waves (a step of 16, in −1..1). */
export const HEAT_R = 3, HEAT_UP = 3
export const HEAT_WAVE = [0, 0, 1, 1, 1, 1, 1, 0, 0, 0, -1, -1, -1, -1, -1, 0]
/** Heat haze's waves change about this many times a second (a page fits it to a whole number a loop). */
export const HEAT_PACE = 8
/** Heat haze's pace for a scene that loops every `loop` seconds: about `HEAT_PACE` a second, a whole number a loop. */
export const heatPace = (loop: number): number => Math.max(1, Math.round(HEAT_PACE * loop)) / loop
/** Selout: an outline beside a pixel at least this light (OKLab) takes a shade of it, this share of its lightness. */
export const SELOUT_FROM = 0.62, SELOUT_L = 0.82

/** How bright a pixel glows, 0 to 1, from its brightest channel (0–255): the glow's own measure. */
export const brightOf = (r: number, g: number, b: number): number => smooth(GLOW_FROM, 1, Math.max(r, g, b) / 255)

/**
 * The haze's shift for column `x` and row `y` (from the top) at step `tick`: whole art pixels, `pixels` at most.
 * Integers only, so the live pass gives the same.
 */
export function heatShift(x: number, y: number, tick: number, pixels: number): number {
  return HEAT_WAVE[(y * 2 + x + tick * 3) & 15] * pixels
}

/**
 * Color cycling at time `t`: for each palette index, the index it is drawn as (`turn`), and whether it is in a cycle
 * at all (`member`, which steady pixels leave alone). The live pass reads both from uniforms.
 */
export function cycleTurns(look: PixelLook, t: number): { turn: Int32Array; member: Uint8Array } {
  const n = look.palette.length
  const turn = Int32Array.from({ length: n }, (_, i) => i), member = new Uint8Array(n)
  if (!look.cycle?.length || !n) return { turn, member }
  const pl = look.palette.map((c) => oklab(...c))
  for (const c of look.cycle) {
    const ids: number[] = []
    for (const col of c.colors) { const k = nearest(oklab(...col), pl); if (!ids.includes(k)) ids.push(k) }
    if (ids.length < 2) continue
    const shift = Math.floor(t * c.pace + 1e-6)
    ids.forEach((k, i) => { if (member[k]) return; member[k] = 1; turn[k] = ids[(((i + shift) % ids.length) + ids.length) % ids.length] })
  }
  return { turn, member }
}

/**
 * The Bayer step (0 to 15) that a blob at rest place `x, y, z` takes, on a lattice `spacing` apart. The three axes are
 * mixed so that any face, whichever way it lies, runs through the whole 4 × 4 pattern (as Ink Studio does).
 */
export function ditherRank(x: number, y: number, z: number, spacing: number): number {
  const ix = Math.floor(x / spacing), iy = Math.floor(y / spacing), iz = Math.floor(z / spacing)
  const dx = ix + 3 * iy + 2 * iz, dy = 2 * ix + iy + 3 * iz
  return BAYER4[(dy & 3) * 4 + (dx & 3)]
}

/**
 * How far apart a set of blobs typically sits: the middle distance from a sample of them to their nearest neighbor.
 * For a cut scene or creature it is the grid's spacing; the lattice of `surfaceRanks` goes by it.
 */
export function typicalSpacing(blobs: { count: number; center: ArrayLike<number>; scale: ArrayLike<number> }): number {
  const n = blobs.count
  if (n < 2) return 1
  const sizes: number[] = []
  const every = Math.max(1, Math.floor(n / 2048))
  for (let i = 0; i < n; i += every) {
    const a = blobs.scale[i * 3], b = blobs.scale[i * 3 + 1], c = blobs.scale[i * 3 + 2]
    sizes.push(a + b + c - Math.max(a, b, c) - Math.min(a, b, c))
  }
  sizes.sort((p, q) => p - q)
  const cell = Math.max(sizes[sizes.length >> 1] * 4, 1e-6)
  const grid = new Map<string, number[]>()
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`
  for (let i = 0; i < n; i++) {
    const k = key(Math.floor(blobs.center[i * 3] / cell), Math.floor(blobs.center[i * 3 + 1] / cell), Math.floor(blobs.center[i * 3 + 2] / cell))
    const list = grid.get(k)
    if (list) list.push(i); else grid.set(k, [i])
  }
  const near: number[] = []
  const step = Math.max(1, Math.floor(n / 512))
  for (let i = 0; i < n; i += step) {
    const x = blobs.center[i * 3], y = blobs.center[i * 3 + 1], z = blobs.center[i * 3 + 2]
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell)
    let best = Infinity
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      for (const j of grid.get(key(cx + a, cy + b, cz + c)) ?? []) {
        if (j === i) continue
        const d = (blobs.center[j * 3] - x) ** 2 + (blobs.center[j * 3 + 1] - y) ** 2 + (blobs.center[j * 3 + 2] - z) ** 2
        if (d > 0 && d < best) best = d
      }
    }
    if (best < Infinity) near.push(Math.sqrt(best))
  }
  if (!near.length) return cell
  near.sort((p, q) => p - q)
  return near[near.length >> 1]
}

/** Every blob's Bayer step for `surface` dither (`ditherRank` on a lattice of the blobs' own `typicalSpacing`). */
export function surfaceRanks(blobs: { count: number; center: ArrayLike<number>; scale: ArrayLike<number> }): Uint8Array {
  const s = typicalSpacing(blobs)
  const out = new Uint8Array(blobs.count)
  for (let i = 0; i < blobs.count; i++) out[i] = ditherRank(blobs.center[i * 3], blobs.center[i * 3 + 1], blobs.center[i * 3 + 2], s)
  return out
}

/**
 * For `snap`: how far to shift the picture, in normalized device units, so a point drawn at `ndc` lands on the edge of
 * a whole art pixel in a picture `size` art pixels across that axis.
 */
export function snapShift(ndc: number, size: number): number {
  const px = (ndc * 0.5 + 0.5) * size
  return ((Math.round(px) - px) * 2) / size
}

/** A good `steady` for a moving scene: under the gap between neighboring palette colors, so shapes still move freely. */
export const STEADY = 0.04

/** The most colors a look's palette can hold (the live pass keeps them in a fixed list). */
export const MAX_PALETTE_SIZE = 32
/** Coverage at or over this is a solid pixel. */
export const PIXEL_CUT = 0.5
/** Where a neighbor's light is gathered from, in pixels: a small diamond. */
export const GLOW_TAPS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [1, -1], [-1, 1], [-1, -1]]
/** A pixel gives off light once its brightest channel passes this (0..1), fully by 1. */
export const GLOW_FROM = 0.92
/** Two neighboring pixels are on either side of an edge when their colors are this far apart in OKLab. */
export const EDGE_JUMP = 0.11
/** How much of its light a pixel on an edge loses at `edges` 1. */
export const EDGE_DARK = 0.62
/** An outline in the scene's own colors aims at this share of its neighbor's lightness and of its color's strength (OKLab), */
export const OWN_L = 0.6, OWN_C = 0.85
/** and only takes a palette color under this share of the neighbor's lightness, so the line is always darker than what it goes round. */
export const OWN_UNDER = 0.85
/** How far down the picture a sky's blend runs: its third value when that is a sound share of the picture, else the whole way. Both twins go by this. */
export const skyReach = (sky: NonNullable<PixelLook['sky']>): number => { const r = sky[2]; return typeof r === 'number' && r > 0 && r <= 1 ? r : 1 }

/** The least dither the sky gets, so its bands blend however crisp the scene is kept. */
export const SKY_DITHER = 0.6
/** Light spilled onto an empty pixel shows once its brightest channel passes this (0..255). */
export const GLOW_SHOWS = 16

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

/**
 * One frame of a scene to pixel art, the CPU twin of the live pixel pass
 * (change one, change both). `f` is the scene drawn small: straight sRGB.
 *
 *   alpha cut → glow (bright pixels light their neighbors, and empty pixels
 *   beside them) → edge lines (the darker side of a jump in color) →
 *   palette + dither → outline on the empty pixels that touch the scene →
 *   sky on the rest, if the look has one
 *
 * `before` is the art of the frame before, for a look with `steady`: where it
 * holds a palette color that is nearly as close as the best one, that pixel
 * keeps it. `parts` is the scene's map of parts for a look with `parts`: the
 * same view with every part in its own flat color (alpha 0 where there is none).
 */
export function pixelArt(f: Frame, look: PixelLook, before?: Frame, parts?: Frame, ranks?: Frame, time = 0): Frame {
  const { width: w, height: h } = f
  const out = makeFrame(w, h)
  const cut = PIXEL_CUT * 255
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && f.data[(y * w + x) * 4 + 3] >= cut
  /** A glowing pixel, by the glow's own measure: what banded glow and heat haze start from. */
  const brightAt = (x: number, y: number) => { if (!solid(x, y)) return 0; const j = (y * w + x) * 4; return brightOf(f.data[j], f.data[j + 1], f.data[j + 2]) }
  const pl = look.palette.map((c) => oklab(...c))
  const amp = look.dither * 48
  const edges = look.edges ?? 0
  const map = look.parts && parts && parts.width === w && parts.height === h ? parts.data : undefined
  const steady = before && before.width === w && before.height === h ? look.steady ?? 0 : 0
  // surface dither: each pixel's step from the map of steps, where the scene has one
  const steps = look.surface && ranks && ranks.width === w && ranks.height === h ? ranks.data : undefined
  const slot = new Map(look.palette.map((c, k) => [(c[0] << 16) | (c[1] << 8) | c[2], k]))
  const bands = Math.min(2, Math.max(0, Math.round(look.bands ?? 0)))
  const heat = look.heat && look.heat.pixels > 0 ? look.heat : undefined
  const tick = heat ? Math.floor(time * heat.pace + 1e-6) : 0
  const { turn, member } = cycleTurns(look, time)
  const g: Rgb = [0, 0, 0]
  for (let y = 0; y < h; y++) {
    for (let x0 = 0; x0 < w; x0++) {
      const o = (y * w + x0) * 4
      // heat haze: above something glowing (and not glowing itself), this pixel is drawn from one beside it
      let x = x0
      if (heat && brightAt(x0, y) <= 0.5) {
        let near = false
        for (let b = HEAT_UP - HEAT_R; b <= HEAT_UP + HEAT_R && !near; b++) for (let a = -HEAT_R; a <= HEAT_R && !near; a++) near = brightAt(x0 + a, y + b) > 0.5
        if (near) x = Math.min(w - 1, Math.max(0, x0 + heatShift(x0, y, tick, heat.pixels)))
      }
      const i = (y * w + x) * 4
      g[0] = g[1] = g[2] = 0
      if (look.glow > 0 && bands > 0) {
        // banded glow: the brightest light near, by its strength over distance, lends a flat share by its ring
        let best = 0, bd = 0, bk = 0, bj = 0
        for (let dy = -HALO_R; dy <= HALO_R; dy++) for (let dx = -HALO_R; dx <= HALO_R; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy))
          if (d === 0) continue
          const k = brightAt(x + dx, y + dy)
          if (k / (1 + d) > best) { best = k / (1 + d); bd = d; bk = k; bj = ((y + dy) * w + x + dx) * 4 }
        }
        if (best > 0) {
          const band = Math.min(bands - 1, Math.floor(((bd - 1) * bands) / HALO_R))
          const s = bk * ((bands - band - 0.5) / bands) * look.glow * HALO_SHARE
          g[0] = f.data[bj] * s; g[1] = f.data[bj + 1] * s; g[2] = f.data[bj + 2] * s
        }
      } else if (look.glow > 0) {
        for (const [dx, dy] of GLOW_TAPS) {
          if (!solid(x + dx, y + dy)) continue
          const j = ((y + dy) * w + x + dx) * 4
          const k = smooth(GLOW_FROM, 1, Math.max(f.data[j], f.data[j + 1], f.data[j + 2]) / 255) * look.glow / GLOW_TAPS.length
          g[0] += f.data[j] * k; g[1] += f.data[j + 1] * k; g[2] += f.data[j + 2] * k
        }
      }
      let r: number, gg: number, b: number
      let spread = amp
      if (solid(x, y)) {
        r = f.data[i] + g[0]; gg = f.data[i + 1] + g[1]; b = f.data[i + 2] + g[2]
        if (edges > 0 || map) {
          // a line on the darker side of a jump: one pixel wide, and never on the light thing itself
          const a = oklab(f.data[i], f.data[i + 1], f.data[i + 2])
          const jump = N4.some(([dx, dy]) => {
            if (!solid(x + dx, y + dy)) return false
            const j = ((y + dy) * w + x + dx) * 4
            const n = oklab(f.data[j], f.data[j + 1], f.data[j + 2])
            const far = Math.hypot(n[0] - a[0], n[1] - a[1], n[2] - a[2]) > EDGE_JUMP
            if (edges > 0 && far && n[0] > a[0]) return true
            // and where another part begins in a color too close for that: on the lower-numbered part, so the line keeps its side as lights flicker
            if (far || !map || map[i + 3] < 128 || map[j + 3] < 128) return false
            return (map[i] | (map[i + 1] << 8) | (map[i + 2] << 16)) < (map[j] | (map[j + 1] << 8) | (map[j + 2] << 16))
          })
          if (jump) { const k = 1 - EDGE_DARK * (edges > 0 ? edges : 1); r *= k; gg *= k; b *= k }
        }
      }
      else if (look.outline && N4.some(([dx, dy]) => solid(x + dx, y + dy))) {
        let c = look.outline
        // the scene pixel beside it: the first of right, left, below, above
        const [nx, ny] = N4.find(([dx, dy]) => solid(x + dx, y + dy))!
        const j = ((y + ny) * w + x + nx) * 4
        const lit = look.selout ? oklab(f.data[j], f.data[j + 1], f.data[j + 2]) : undefined
        if (lit && lit[0] >= SELOUT_FROM) {
          // selout: on a lit side, a shade just under the thing's own color
          if (pl.length) {
            let bestD = Infinity
            for (let k = 0; k < pl.length; k++) {
              const d = (pl[k][0] - lit[0] * SELOUT_L) ** 2 + (pl[k][1] - lit[1]) ** 2 + (pl[k][2] - lit[2]) ** 2
              if (d < bestD) { bestD = d; c = look.palette[k] }
            }
          } else c = [f.data[j] * SELOUT_L, f.data[j + 1] * SELOUT_L, f.data[j + 2] * SELOUT_L]
        } else if (look.own) {
          // a darker tone of the scene pixel beside it
          if (pl.length) {
            const a = oklab(f.data[j], f.data[j + 1], f.data[j + 2])
            let bestD = Infinity
            for (let k = 0; k < pl.length; k++) {
              if (pl[k][0] >= a[0] * OWN_UNDER) continue
              const d = (pl[k][0] - a[0] * OWN_L) ** 2 + (pl[k][1] - a[1] * OWN_C) ** 2 + (pl[k][2] - a[2] * OWN_C) ** 2
              if (d < bestD) { bestD = d; c = look.palette[k] }
            }
          } else c = [f.data[j] * (1 - EDGE_DARK), f.data[j + 1] * (1 - EDGE_DARK), f.data[j + 2] * (1 - EDGE_DARK)]
        }
        out.data[o] = c[0]; out.data[o + 1] = c[1]; out.data[o + 2] = c[2]; out.data[o + 3] = 255
        continue
      } else if (look.sky) {
        const [top, low] = look.sky, reach = skyReach(look.sky), t = Math.min(1, (y + 0.5) / h / reach)
        r = top[0] + (low[0] - top[0]) * t + g[0]; gg = top[1] + (low[1] - top[1]) * t + g[1]; b = top[2] + (low[2] - top[2]) * t + g[2]
        // a sky that stops short eases its dither away over the last quarter of the blend, so it ends flat with no seam
        spread = Math.max(look.dither, SKY_DITHER * (reach < 1 ? Math.min(1, (1 - t) * 4) : 1)) * 48
      } else if (Math.max(g[0], g[1], g[2]) > GLOW_SHOWS) { r = g[0]; gg = g[1]; b = g[2] }
      else continue
      r = Math.min(255, r); gg = Math.min(255, gg); b = Math.min(255, b)
      if (pl.length) {
        const step = steps && solid(x, y) && steps[i + 3] >= 128 ? steps[i] : BAYER4[(y & 3) * 4 + (x0 & 3)]
        const off = spread > 0 ? (step / 16 - 0.5) * spread : 0
        const lab = oklab(Math.max(0, r + off), Math.max(0, gg + off), Math.max(0, b + off))
        let k = nearest(lab, pl)
        // only the scene's own pixels: the sky is the same every frame, and a pixel the scene has left must not keep its color
        if (steady > 0 && solid(x, y) && before!.data[o + 3] === 255) {
          const was = slot.get((before!.data[o] << 16) | (before!.data[o + 1] << 8) | before!.data[o + 2])
          const far = (p: Rgb) => Math.hypot(lab[0] - p[0], lab[1] - p[1], lab[2] - p[2])
          // colors that cycle are left to move
          if (was !== undefined && was !== k && !member[was] && !member[k] && far(pl[was]) <= far(pl[k]) + steady) k = was
        }
        // color cycling, on the scene's own pixels
        const c = look.palette[solid(x, y) ? turn[k] : k]
        r = c[0]; gg = c[1]; b = c[2]
      }
      out.data[o] = r; out.data[o + 1] = gg; out.data[o + 2] = b; out.data[o + 3] = 255
    }
  }
  return look.tidy ? tidyLone(out, f, map) : out
}

/** The four samples of an art pixel, in the order ties go by: across the top, then the bottom. */
const QUAD = [[0, 0], [1, 0], [0, 1], [1, 1]] as const

/**
 * Four samples a pixel (`PixelLook.fine`), the CPU twin of the live pass's first step (change one, change both).
 * `fine` is the scene drawn at twice the art's size (straight sRGB) and `parts` its map of parts at that size, if there
 * is one. Each art pixel is settled from its 2×2 samples:
 *
 *   it is scene when two or more samples are solid → the part most of those samples show wins (the lower-numbered on a
 *   tie; samples the map has no part for count as one more) → the pixel takes one of that part's samples whole, the one
 *   nearest their average, so it is always a color that was drawn, never a mix of two things.
 *
 * Gives the frame and the map of parts at the art's size, as `pixelArt` takes them.
 */
export function resolveFine(fine: Frame, parts?: Frame): { small: Frame; parts?: Frame } {
  const w = fine.width >> 1, h = fine.height >> 1
  const small = makeFrame(w, h)
  const map = parts && parts.width === fine.width && parts.height === fine.height ? parts.data : undefined
  const ids = map ? makeFrame(w, h) : undefined
  const cut = PIXEL_CUT * 255
  const NONE = 1 << 24
  const at = [0, 0, 0, 0], part = [0, 0, 0, 0], solid = [false, false, false, false]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let count = 0
      QUAD.forEach(([sx, sy], k) => {
        const j = at[k] = ((y * 2 + sy) * fine.width + x * 2 + sx) * 4
        solid[k] = fine.data[j + 3] >= cut
        if (solid[k]) count++
        part[k] = map && map[j + 3] >= 128 ? map[j] | (map[j + 1] << 8) | (map[j + 2] << 16) : NONE
      })
      if (count < 2) continue
      // the part most samples show: the lower number on a tie
      let win = NONE, most = 0
      for (let k = 0; k < 4; k++) {
        if (!solid[k]) continue
        let n = 0
        for (let m = 0; m < 4; m++) if (solid[m] && part[m] === part[k]) n++
        if (n > most || (n === most && part[k] < win)) { most = n; win = part[k] }
      }
      // of its samples, the one nearest their average
      let r = 0, g = 0, b = 0
      for (let k = 0; k < 4; k++) if (solid[k] && part[k] === win) { r += fine.data[at[k]]; g += fine.data[at[k] + 1]; b += fine.data[at[k] + 2] }
      r /= most; g /= most; b /= most
      let pick = -1, bestD = Infinity
      for (let k = 0; k < 4; k++) {
        if (!solid[k] || part[k] !== win) continue
        const j = at[k], d = (fine.data[j] - r) ** 2 + (fine.data[j + 1] - g) ** 2 + (fine.data[j + 2] - b) ** 2
        if (d < bestD) { bestD = d; pick = j }
      }
      const i = (y * w + x) * 4
      small.data[i] = fine.data[pick]; small.data[i + 1] = fine.data[pick + 1]; small.data[i + 2] = fine.data[pick + 2]; small.data[i + 3] = fine.data[pick + 3]
      if (ids && win !== NONE) { ids.data[i] = map![pick]; ids.data[i + 1] = map![pick + 1]; ids.data[i + 2] = map![pick + 2]; ids.data[i + 3] = map![pick + 3] }
    }
  }
  return { small, parts: ids }
}

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const

/**
 * `art` with its lone pixels cleaned up (see `PixelLook.tidy`): `f` is the small frame it was drawn from (which pixels
 * are scene), `map` the map of parts if there is one. Reads only `art`, so a pixel cleaned never changes its neighbors.
 */
export function tidyLone(art: Frame, f: Frame, map?: Uint8ClampedArray | Uint8Array): Frame {
  const { width: w, height: h } = art
  const out = makeFrame(w, h)
  out.data.set(art.data)
  const cut = PIXEL_CUT * 255
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && f.data[(y * w + x) * 4 + 3] >= cut
  const colorAt = (x: number, y: number) => { const j = (y * w + x) * 4; return (art.data[j] << 16) | (art.data[j + 1] << 8) | art.data[j + 2] }
  const partAt = (x: number, y: number) => { const j = (y * w + x) * 4; return map![j + 3] < 128 ? -1 : map![j] | (map![j + 1] << 8) | (map![j + 2] << 16) }
  const near: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid(x, y)) continue
      const me = colorAt(x, y)
      near.length = 0
      let mine = false, ofPart = 0
      const part = map ? partAt(x, y) : -1
      for (const [dx, dy] of N8) {
        if (!solid(x + dx, y + dy)) continue
        const c = colorAt(x + dx, y + dy)
        if (c === me) { mine = true; break }
        near.push(c)
        if (map && part >= 0 && partAt(x + dx, y + dy) === part) ofPart++
      }
      if (mine || near.length < 6 || (map && ofPart < 4)) continue
      let best = -1, most = 0
      for (const c of near) { let n = 0; for (const d of near) if (d === c) n++; if (n > most) { most = n; best = c } }
      if (most < 6) continue
      const i = (y * w + x) * 4
      out.data[i] = best >> 16; out.data[i + 1] = (best >> 8) & 255; out.data[i + 2] = best & 255
    }
  }
  return out
}

/**
 * The colors a look can put in a frame: its palette and its outline. Empty
 * when the look has no palette (then any color can appear).
 */
export function lookColors(look: PixelLook): Rgb[] {
  if (!look.palette.length) return []
  return look.outline ? [...look.palette, look.outline] : look.palette
}

/**
 * Moves every solid pixel onto the closest of `colors`, in place. Color that
 * has been through 8-bit linear storage comes back a level or two off the
 * palette; this puts it back exactly. (The live pass now keeps its art in
 * sRGB, where a palette color is stored as it is, so there it changes nothing.)
 */
export function snapColors(f: Frame, colors: Rgb[]): Frame {
  if (!colors.length) return f
  for (let i = 0; i < f.data.length; i += 4) {
    if (!f.data[i + 3]) continue
    let best = colors[0], bestD = Infinity
    for (const c of colors) {
      const d = (f.data[i] - c[0]) ** 2 + (f.data[i + 1] - c[1]) ** 2 + (f.data[i + 2] - c[2]) ** 2
      if (d < bestD) { bestD = d; best = c }
    }
    f.data[i] = best[0]; f.data[i + 1] = best[1]; f.data[i + 2] = best[2]
  }
  return f
}
