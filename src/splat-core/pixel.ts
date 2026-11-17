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

export type Rgb = [number, number, number]

export interface Frame {
  width: number
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
export function pixelArt(f: Frame, look: PixelLook, before?: Frame, parts?: Frame): Frame {
  const { width: w, height: h } = f
  const out = makeFrame(w, h)
  const cut = PIXEL_CUT * 255
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && f.data[(y * w + x) * 4 + 3] >= cut
  const pl = look.palette.map((c) => oklab(...c))
  const amp = look.dither * 48
  const edges = look.edges ?? 0
  const map = look.parts && parts && parts.width === w && parts.height === h ? parts.data : undefined
  const steady = before && before.width === w && before.height === h ? look.steady ?? 0 : 0
  const slot = new Map(look.palette.map((c, k) => [(c[0] << 16) | (c[1] << 8) | c[2], k]))
  const g: Rgb = [0, 0, 0]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      g[0] = g[1] = g[2] = 0
      if (look.glow > 0) {
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
        out.data[i] = look.outline[0]; out.data[i + 1] = look.outline[1]; out.data[i + 2] = look.outline[2]; out.data[i + 3] = 255
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
        const off = spread > 0 ? (BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * spread : 0
        const lab = oklab(Math.max(0, r + off), Math.max(0, gg + off), Math.max(0, b + off))
        let k = nearest(lab, pl)
        // only the scene's own pixels: the sky is the same every frame, and a pixel the scene has left must not keep its color
        if (steady > 0 && solid(x, y) && before!.data[i + 3] === 255) {
          const was = slot.get((before!.data[i] << 16) | (before!.data[i + 1] << 8) | before!.data[i + 2])
          const far = (p: Rgb) => Math.hypot(lab[0] - p[0], lab[1] - p[1], lab[2] - p[2])
          if (was !== undefined && was !== k && far(pl[was]) <= far(pl[k]) + steady) k = was
        }
        const c = look.palette[k]
        r = c[0]; gg = c[1]; b = c[2]
      }
      out.data[i] = r; out.data[i + 1] = gg; out.data[i + 2] = b; out.data[i + 3] = 255
    }
  }
  return look.tidy ? tidyLone(out, f, map) : out
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
