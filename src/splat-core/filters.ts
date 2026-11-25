/**
 * Six looks laid over the whole picture (Matt picked them, 2026-11-25): a thermal camera, an old CRT or tape, a
 * blueprint, a mosaic, paper cutouts and claymation. Each is drawn by `splat-engine/filterPass.ts` from the frame as
 * the blobs draw it (and, where a look asks, a map of depth and one of parts), one full-screen pass a look. The
 * arithmetic here is pure and is the shader's CPU twin: change one, change both.
 *
 * Places on the screen are device pixels with y counted down from the top; `ratio` is device pixels a CSS pixel, so
 * a look's sizes (lines, tiles, shadows) are the same size to the eye on every screen.
 */

import type { Rgb01 } from './halftone.ts'

/** A sky, top and bottom (sRGB 0–1). */
export type Sky01 = readonly [Rgb01, Rgb01]

/** The fractional part. */
export const fract = (v: number) => v - Math.floor(v)
/** A number from 0 to 1 for a place (the shader's `hash`; change both). */
export const hash2 = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453)
/** Smooth value noise from 0 to 1 over whole-number cells (the shader's `noise`; change both). */
export function noise2(x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j
  const u = f * f * (3 - 2 * f), w = g * g * (3 - 2 * g)
  const top = hash2(i, j) + (hash2(i + 1, j) - hash2(i, j)) * u, bottom = hash2(i, j + 1) + (hash2(i + 1, j + 1) - hash2(i, j + 1)) * u
  return top + (bottom - top) * w
}
/** A color's luminance (linear in, linear out). */
export const luma = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t) }
const mixv = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
/** sRGB 0–1 to linear light. */
export const toLinear = (c: Rgb01): [number, number, number] => c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number]
/** The sky at `t`, from 0 at the top of the picture to 1 at the bottom (linear in, linear out). */
export const skyAt = (top: readonly number[], bottom: readonly number[], t: number) => mixv(top, bottom, clamp01(t))
/** A picture read at a device pixel: linear light, premultiplied (r, g, b, a). */
export type Picture = (x: number, y: number) => readonly number[]

// ————— Thermal camera —————

/** How a stage is drawn as a thermal camera sees it (`Stage.setFilter`). */
export interface ThermalLook {
  /** Which look this is. */
  kind: 'thermal'
  /** The heat colors from cold to hot (sRGB 0–1), 2 to `THERMAL_STOPS` of them, evenly spread. */
  ramp: readonly Rgb01[]
  /** Each heat takes the nearest of the ramp's colors, not a mix of two (a palette's colors stay its own). */
  stepped?: boolean
  /** How hot what gives its own light runs (a lamp, a fire, breath), 0 to 1.5 (1). */
  hot?: number
  /** How far heat spreads round what gives its own light, in CSS pixels (20). */
  spread?: number
  /** How warm lit things are, by how bright they are, 0 to 1 (0.8). */
  warm?: number
  /** The sensor's grain, 0 to 1 (0.3). */
  noise?: number
  /** The grain holds still (reduced motion, or a frame that must not change by the clock). */
  still?: boolean
}

/** What gives its own light is drawn this many times its color for the thermal camera, so it can be told from a pale thing (as neon's lamps). */
export const THERMAL_EMIT = 4
/** The most colors a heat ramp has. */
export const THERMAL_STOPS = 8
/** Where heat is looked for round each pixel, as shares of the look's spread (eight at the full reach, four at half). */
export const THERMAL_TAPS: readonly [number, number][] = [
  ...Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)] as [number, number]),
  ...Array.from({ length: 4 }, (_, i) => [0.5 * Math.cos(((i + 0.5) * Math.PI) / 2), 0.5 * Math.sin(((i + 0.5) * Math.PI) / 2)] as [number, number]),
]
/** How much of what glows nearby a pixel takes as its own heat. */
export const THERMAL_SPREAD_GAIN = 0.6
/** How hot the empty sky reads at its top and at the horizon. */
export const THERMAL_SKY: readonly [number, number] = [0.02, 0.08]
/** How often the grain changes, a second. */
export const THERMAL_FPS = 15

/** How much of its color a pixel gives off by itself (linear, not premultiplied): 0 for anything at or under white, 1 at `THERMAL_EMIT` times. */
export const emitted = (c: readonly number[]) => clamp01((Math.max(c[0], c[1], c[2]) - 1) / (THERMAL_EMIT - 1))

/**
 * How much of what glows there counts as hot, by how colored it is: a lamp, a flame or the sun is warm-colored and
 * hot, while a glowing cloud, the moon or a star is white and reads cold, as the sky does to a heat camera.
 */
export const hotShare = (c: readonly number[]) => { const hi = Math.max(c[0], c[1], c[2]), lo = Math.min(c[0], c[1], c[2]); return smooth(0.08, 0.35, hi > 1e-4 ? (hi - lo) / hi : 0) }

/** How much cooler a white thing reads than a dark one in the same light: white throws the sun back (clouds, snow, white walls). */
export const THERMAL_WHITE = 0.55

/** A pixel's own heat, 0 to about 1.5, from its color (linear, not premultiplied): warmth by how bright it is lit, and the heat of what glows. */
export function heatOf(c: readonly number[], look: ThermalLook): number {
  const e = emitted(c), q = hotShare(c)
  const body = (look.warm ?? 0.8) * Math.pow(clamp01(luma(c)), 0.6) * (1 - e * (1 - q) * 0.85) * (1 - THERMAL_WHITE * clamp01(Math.min(c[0], c[1], c[2])))
  return body + (look.hot ?? 1) * e * q
}

/** The color for a heat (0 to 1) along a ramp of linear colors, evenly spread; `stepped` takes the nearest one. */
export function rampAt(ramp: readonly (readonly number[])[], h: number, stepped = false): [number, number, number] {
  const n = ramp.length
  if (n === 0) return [h, h, h]
  if (n === 1) return [ramp[0][0], ramp[0][1], ramp[0][2]]
  const x = clamp01(h) * (n - 1)
  if (stepped) { const k = Math.round(x); return [ramp[k][0], ramp[k][1], ramp[k][2]] }
  const k = Math.min(n - 2, Math.floor(x))
  return mixv(ramp[k], ramp[k + 1], x - k)
}

/** A palette (sRGB 0–255) as a heat ramp: its colors from darkest to lightest, at most `THERMAL_STOPS`, spread evenly over it. */
export function paletteRamp(colors: readonly (readonly number[])[]): Rgb01[] {
  const seen = new Set<string>()
  const one = colors.map((c) => [c[0] / 255, c[1] / 255, c[2] / 255] as Rgb01).filter((c) => { const k = c.join(); if (seen.has(k)) return false; seen.add(k); return true })
  one.sort((a, b) => luma(toLinear(a)) - luma(toLinear(b)))
  if (one.length <= THERMAL_STOPS) return one
  return Array.from({ length: THERMAL_STOPS }, (_, i) => one[Math.round((i * (one.length - 1)) / (THERMAL_STOPS - 1))])
}

/** The grain's frame at a time. */
export const grainFrame = (time: number, still?: boolean) => (still ? 0 : Math.floor(time * THERMAL_FPS + 1e-6))

/** One device pixel as the thermal camera sees it (linear out). */
export function thermalAt(x: number, y: number, picture: Picture, height: number, look: ThermalLook, ratio = 1, time = 0): [number, number, number] {
  const c = picture(x, y), a = Math.min(1, c[3])
  const own = a > 0 ? [c[0] / a, c[1] / a, c[2] / a] : [0, 0, 0]
  const sky = THERMAL_SKY[0] + (THERMAL_SKY[1] - THERMAL_SKY[0]) * clamp01(y / height)
  let h = a * heatOf(own, look) + (1 - a) * sky
  const reach = (look.spread ?? 20) * ratio
  let near = 0
  for (const [dx, dy] of THERMAL_TAPS) {
    const t = picture(x + dx * reach, y + dy * reach), ta = Math.min(1, t[3])
    if (ta > 0) { const o = [t[0] / ta, t[1] / ta, t[2] / ta]; near += ta * emitted(o) * hotShare(o) }
  }
  h += (look.hot ?? 1) * THERMAL_SPREAD_GAIN * (near / THERMAL_TAPS.length)
  const f = grainFrame(time, look.still), g = 1.5 * ratio
  h += (hash2(Math.floor(x / g) + f * 13.1, Math.floor(y / g) + f * 7.7) - 0.5) * (look.noise ?? 0.3) * 0.1
  return rampAt(look.ramp.map(toLinear), h, look.stepped)
}

// ————— CRT / VHS —————

/** How a stage is drawn as an old television playing a tape (`Stage.setFilter`). */
export interface CrtLook {
  /** Which look this is. */
  kind: 'crt'
  /** How dark the gaps between scanlines are, 0 to 1 (0.5). */
  scan?: number
  /** How tall a scanline is, in CSS pixels (3). */
  every?: number
  /** How far color smears to the right of where it belongs, 0 to 1 (0.5). */
  bleed?: number
  /** How much the picture's rows wander and a tracking band rolls up the screen, 0 to 1 (0.4). */
  wobble?: number
  /** Tape noise, 0 to 1 (0.3). */
  noise?: number
  /** How much the glass bulges, with darker corners, 0 to 1 (0.4). */
  curve?: number
  /** What stands behind the subject, top and bottom (sRGB 0–1). */
  sky?: Sky01
  /** Seconds the scene takes to come round again: the wobble goes a whole number of times into it, so a recording joins (12). */
  period?: number
  /** The wobble and noise hold still. */
  still?: boolean
}

/** Behind a subject with no sky of its own (sRGB 0–1): a dim studio blue. */
export const CRT_BACK: Sky01 = [[0.1, 0.12, 0.2], [0.2, 0.2, 0.26]]
/** How many CSS pixels color smears at full bleed. */
export const CRT_BLEED_PX = 6
/** How many taps the smear is read with. */
export const CRT_BLEED_TAPS = 6
/** How far the tracking band throws rows aside at full wobble, in CSS pixels. */
export const CRT_BAND_PX = 14
/** How tall the tracking band is, as a share of the picture. */
export const CRT_BAND = 0.06
/** How many times a loop the tracking band rolls up the screen. */
export const CRT_ROLLS = 2
/** How many times a loop the slow wander of the rows goes round. */
export const CRT_WANDERS = 3
/** How often the tape noise changes, a second. */
export const CRT_FPS = 30

/** YIQ from linear-ish RGB (the television's own split of brightness and color). */
export const yiq = (c: readonly number[]): [number, number, number] => [0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2], 0.596 * c[0] - 0.274 * c[1] - 0.322 * c[2], 0.211 * c[0] - 0.523 * c[1] + 0.312 * c[2]]
/** RGB from YIQ. */
export const fromYiq = (c: readonly number[]): [number, number, number] => [c[0] + 0.956 * c[1] + 0.621 * c[2], c[0] - 0.272 * c[1] - 0.647 * c[2], c[0] - 1.106 * c[1] + 1.703 * c[2]]

/** Where a point of the screen (u, v from 0 to 1) reads the picture through the bulging glass, or undefined off its edge. */
export function crtCurve(u: number, v: number, curve: number): [number, number] | undefined {
  const x = u * 2 - 1, y = v * 2 - 1, k = 1 + curve * 0.1 * (x * x + y * y)
  const a = x * k, b = y * k
  if (Math.abs(a) > 1 || Math.abs(b) > 1) return undefined
  return [(a + 1) / 2, (b + 1) / 2]
}

/** How bright a place within a scanline is (`f` from 0 to 1 down the line): bright in its middle, dark between lines. */
export const scanShade = (f: number, scan: number) => 1 + (0.35 + 0.9 * Math.sin(Math.PI * f) - 1) * scan

/** How far the rows at `v` (0 top, 1 bottom; `y` in CSS pixels) are thrown aside at a time, in CSS pixels. */
export function wobbleAt(v: number, yCss: number, time: number, look: CrtLook): number {
  const w = look.wobble ?? 0.4, period = look.period || 12, t = look.still ? 0 : time
  let off = w * 0.8 * Math.sin(yCss * 0.045 + (2 * Math.PI * CRT_WANDERS * t) / period)
  const band = 1 - fract((CRT_ROLLS * t) / period)
  const near = smooth(CRT_BAND, 0, Math.abs(v - band))
  off += w * CRT_BAND_PX * near * (hash2(Math.floor(yCss), Math.floor(t * CRT_FPS)) - 0.5) * 2
  return off
}

/** One device pixel of the television (linear out). `picture` is linear and premultiplied. */
export function crtAt(x: number, y: number, picture: Picture, width: number, height: number, look: CrtLook, ratio = 1, time = 0): [number, number, number] {
  const at = crtCurve(x / width, y / height, look.curve ?? 0.4)
  if (!at) return [0, 0, 0]
  const sky = look.sky ?? CRT_BACK, top = toLinear(sky[0]), bottom = toLinear(sky[1])
  const sx = at[0] * width + wobbleAt(at[1], (at[1] * height) / ratio, time, look) * ratio, sy = at[1] * height
  const read = (px: number) => { const c = picture(px, sy), a = Math.min(1, c[3]), b = skyAt(top, bottom, sy / height); return [c[0] + b[0] * (1 - a), c[1] + b[1] * (1 - a), c[2] + b[2] * (1 - a)] }
  const sharp = yiq(read(sx))
  const reach = (look.bleed ?? 0.5) * CRT_BLEED_PX * ratio
  let i = 0, q = 0
  for (let k = 0; k < CRT_BLEED_TAPS; k++) { const s = yiq(read(sx - (reach * k) / (CRT_BLEED_TAPS - 1))); i += s[1]; q += s[2] }
  const rgb = fromYiq([sharp[0], i / CRT_BLEED_TAPS, q / CRT_BLEED_TAPS])
  const line = (look.every ?? 3) * ratio
  const shade = scanShade(fract(sy / line), look.scan ?? 0.5)
  const f = look.still ? 0 : Math.floor(time * CRT_FPS + 1e-6)
  const n = (hash2(Math.floor(x / ratio) + f * 3.7, Math.floor(y / ratio) + f * 9.1) - 0.5) * (look.noise ?? 0.3) * 0.16
  const u = at[0] * 2 - 1, v = at[1] * 2 - 1, vignette = 1 - (look.curve ?? 0.4) * 0.35 * (u * u + v * v)
  return rgb.map((c) => Math.max(0, (c * shade + n) * vignette)) as [number, number, number]
}

// ————— Blueprint —————

/** How a stage is drawn as a blueprint (`Stage.setFilter`). */
export interface BlueprintLook {
  /** Which look this is. */
  kind: 'blueprint'
  /** The paper (sRGB 0–1). */
  paper?: Rgb01
  /** The lines (sRGB 0–1). */
  ink?: Rgb01
  /** The outline's width, in CSS pixels (1.5). */
  line?: number
  /** How strong the lines between a thing's parts are beside its outline, 0 to 1 (0.6). */
  inner?: number
  /** How far apart the grid's lines are, in CSS pixels; 0 draws none (16). */
  grid?: number
  /** Whether dimension lines are drawn across the subject's width and height (true). */
  dims?: boolean
  /** How strongly the subject is washed in the line color, 0 to 1 (0.25). */
  fill?: number
}

/** A blueprint's paper (sRGB 0–1). */
export const BLUEPRINT_PAPER: Rgb01 = [0.11, 0.29, 0.56]
/** A blueprint's lines (sRGB 0–1). */
export const BLUEPRINT_INK: Rgb01 = [0.93, 0.96, 1]
/** How strong the grid's lines are. */
export const GRID_MINOR = 0.16
/** How strong every fifth line of the grid is. */
export const GRID_MAJOR = 0.32
/** How far the dimension lines stand off the subject, in CSS pixels. */
export const DIM_GAP = 16
/** How long the dimension lines' arrowheads are, in CSS pixels. */
export const DIM_ARROW = 7
/** How many marks divide a dimension line. */
export const DIM_TICKS = 10

/** How much of the grid's lines cover a pixel (0 to 1); `x`, `y` and `every` in device pixels, `ratio` for the line's width. */
export function gridAt(x: number, y: number, every: number, ratio = 1): number {
  if (every <= 0) return 0
  const lineOf = (v: number) => {
    const k = Math.round(v / every), d = Math.abs(v - k * every)
    const cover = clamp01(0.6 * ratio + 0.5 - d)
    return cover * (((k % 5) + 5) % 5 === 0 ? GRID_MAJOR : GRID_MINOR)
  }
  return Math.max(lineOf(x), lineOf(y))
}

/** A box on the screen, in device pixels: left, top, right, bottom. */
export type ScreenBox = readonly [number, number, number, number]

/** How much of a segment from (ax, ay) to (bx, by) `half` pixels wide covers the point (x, y). */
function segment(x: number, y: number, ax: number, ay: number, bx: number, by: number, half: number): number {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
  const t = len2 > 0 ? clamp01(((x - ax) * dx + (y - ay) * dy) / len2) : 0
  const d = Math.hypot(x - ax - dx * t, y - ay - dy * t)
  return clamp01(half + 0.5 - d)
}

/** Where a box's dimension lines go (device pixels): the line under it (`yd`) and beside it (`xd`), each moved over or to the left where there is no room, and where their extension lines run; none for a box too small or off the picture. */
export function dimPlaces(box: ScreenBox, width: number, height: number, ratio = 1): { yd: number; xd: number; fromY: number; toY: number; fromX: number; toX: number } | undefined {
  const [x0, y0, x1, y1] = box
  if (!(x1 - x0 >= 30 * ratio && y1 - y0 >= 30 * ratio)) return undefined
  if (x1 < 0 || y1 < 0 || x0 > width || y0 > height) return undefined
  const gap = DIM_GAP * ratio
  const yd = y1 + gap < height - 6 * ratio ? y1 + gap : y0 - gap
  const xd = x1 + gap < width - 6 * ratio ? x1 + gap : x0 - gap
  return {
    yd, xd,
    fromY: yd > y1 ? y1 + 3 * ratio : y0 - 3 * ratio, toY: yd > y1 ? yd + 4 * ratio : yd - 4 * ratio,
    fromX: xd > x1 ? x1 + 3 * ratio : x0 - 3 * ratio, toX: xd > x1 ? xd + 4 * ratio : xd - 4 * ratio,
  }
}

/**
 * Dimension lines round a box (device pixels, y down): one under it across its width and one beside it down its
 * height (over it and to its left where there is no room), each with extension lines to the box, an arrowhead at each
 * end and `DIM_TICKS` marks along it. How much of them covers (x, y), 0 to 1.
 */
export function dimsAt(x: number, y: number, box: ScreenBox, width: number, height: number, ratio = 1): number {
  const [x0, y0, x1, y1] = box
  const place = dimPlaces(box, width, height, ratio)
  if (!place) return 0
  const { yd, xd, fromY, toY, fromX, toX } = place
  const arrow = DIM_ARROW * ratio, half = 0.5 * ratio
  let c = 0
  // the lines and their extension lines
  c = Math.max(c, segment(x, y, x0, yd, x1, yd, half), segment(x, y, x0, fromY, x0, toY, half), segment(x, y, x1, fromY, x1, toY, half))
  c = Math.max(c, segment(x, y, xd, y0, xd, y1, half), segment(x, y, fromX, y0, toX, y0, half), segment(x, y, fromX, y1, toX, y1, half))
  // arrowheads: filled, narrowing to the point
  const head = (along: number, across: number) => (along >= 0 && along <= arrow ? clamp01((along / arrow) * 3 * ratio + 0.5 - Math.abs(across)) : 0)
  c = Math.max(c, head(x - x0, y - yd), head(x1 - x, y - yd), head(y - y0, x - xd), head(y1 - y, x - xd))
  // marks along each line
  for (let k = 1; k < DIM_TICKS; k++) {
    const tx = x0 + ((x1 - x0) * k) / DIM_TICKS, ty = y0 + ((y1 - y0) * k) / DIM_TICKS, tall = (k === DIM_TICKS / 2 ? 4 : 2.5) * ratio
    c = Math.max(c, segment(x, y, tx, yd - tall, tx, yd + tall, half), segment(x, y, xd - tall, ty, xd + tall, ty, half))
  }
  return c
}

// ————— Mosaic —————

/** How a stage is drawn as a mosaic (`Stage.setFilter`). */
export interface MosaicLook {
  /** Which look this is. */
  kind: 'mosaic'
  /** A tile's side, in CSS pixels (10). */
  tile?: number
  /** The grout between tiles, in CSS pixels (1.5). */
  grout?: number
  /** The grout's color (sRGB 0–1). */
  groutColor?: Rgb01
  /** How much tiles differ in color from one to the next, 0 to 1 (0.5). */
  vary?: number
  /** How much each tile's edges catch light and shade, 0 to 1 (0.5). */
  bevel?: number
  /** Rows set over one another like bricks, half a tile along. */
  brick?: boolean
  /** What stands behind the subject, top and bottom (sRGB 0–1): tiles in its colors. Left out, plain tiles of `MOSAIC_GROUND`. */
  sky?: Sky01
}

/** The grout (sRGB 0–1): a pale mortar. */
export const MOSAIC_GROUT: Rgb01 = [0.84, 0.82, 0.77]
/** Tiles behind a subject when no sky is laid (sRGB 0–1): a warm stone. */
export const MOSAIC_GROUND: Rgb01 = [0.9, 0.86, 0.78]
/** Where a tile's color is read, as shares of the tile about its middle (the middle first). */
export const MOSAIC_TAPS: readonly [number, number][] = [[0, 0], [-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]]

/** The tile a device pixel lies in: its column and row, its middle, and the pixel's place in it (u, v from −½ to ½). */
export function tileAt(x: number, y: number, side: number, brick = false): { cell: [number, number]; mid: [number, number]; u: number; v: number } {
  const row = Math.floor(y / side)
  const shift = brick && ((row % 2) + 2) % 2 === 1 ? side / 2 : 0
  const col = Math.floor((x - shift) / side)
  const mid: [number, number] = [col * side + shift + side / 2, row * side + side / 2]
  return { cell: [col, row], mid, u: (x - mid[0]) / side, v: (y - mid[1]) / side }
}

/**
 * How much of a pixel a tile covers (0 to 1): a rounded square inset by half the grout, a little smaller or larger
 * by its own hash so the grout lines wander. `side` and `grout` in device pixels.
 */
export function tileCover(u: number, v: number, cell: readonly [number, number], side: number, grout: number): number {
  const inset = grout / 2 + (hash2(cell[0] + 0.5, cell[1] + 0.5) - 0.5) * grout * 0.6
  const half = Math.max(0.5, side / 2 - inset), round = Math.min(half, grout * 0.6 + side * 0.08)
  const qx = Math.abs(u * side) - (half - round), qy = Math.abs(v * side) - (half - round)
  const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - round
  return clamp01(0.5 - d)
}

/** A tile's own change of color: how much lighter or darker, and a small shift of each channel. */
export function tileTint(cell: readonly [number, number], vary: number): [number, number, number] {
  const k = 1 + (hash2(cell[0] * 1.7, cell[1] * 2.3) - 0.5) * 0.3 * vary
  return [0, 1, 2].map((c) => k + (hash2(cell[0] + c * 11.3, cell[1] - c * 5.1) - 0.5) * 0.1 * vary) as [number, number, number]
}

/** How a tile's face is lit by its bevel at (u, v): lighter toward its top left edge, darker toward its bottom right. */
export function bevelAt(u: number, v: number, bevel: number): number {
  const edge = smooth(0.25, 0.5, Math.max(Math.abs(u), Math.abs(v)))
  return 1 + bevel * edge * (-(u + v)) * 0.45
}

// ————— Paper cutout —————

/** How a stage is drawn as layered cut paper (`Stage.setFilter`). */
export interface CutoutLook {
  /** Which look this is. */
  kind: 'cutout'
  /** How far a layer's shadow falls on what is behind it, in CSS pixels (6). */
  shadow?: number
  /** How soft the shadow's edge is, 0 to 1 (0.5). */
  soft?: number
  /** Where the light comes from on the screen, in degrees (0 from the right, 90 from above; 120). */
  light?: number
  /** The paper's fibers, 0 to 1 (0.5). */
  grain?: number
  /** The pale cut edge on the side toward the light, in CSS pixels (1). */
  edge?: number
  /** How ragged the cut edges are, 0 to 1 (0.4). */
  ragged?: number
  /** The card behind everything, top and bottom (sRGB 0–1). */
  sky?: Sky01
}

/** The card behind a subject with no sky of its own (sRGB 0–1). */
export const CUTOUT_CARD: Sky01 = [[0.93, 0.88, 0.78], [0.86, 0.8, 0.7]]
/** How dark a shadow is at full. */
export const CUTOUT_SHADE = 0.42
/** How much a layer must be nearer than the one under it to cast on it, as a share of the depth. */
export const CUTOUT_LAYER = 0.01
/** Where a soft shadow's edge is read, as shares of its softness, across the light's way. */
export const CUTOUT_TAPS: readonly number[] = [-1, -0.5, 0, 0.5, 1]
/** How far a ragged edge wanders at full, in CSS pixels. */
export const RAGGED_PX = 1.6
/** How far apart a ragged edge's turns are, in CSS pixels. */
export const RAGGED_GRAIN = 9

/** The way toward the light on the screen (device y down), for a light from `deg` (0 from the right, 90 from above). */
export const lightWay = (deg: number): [number, number] => [Math.cos((deg * Math.PI) / 180), -Math.sin((deg * Math.PI) / 180)]

/** Where a pixel reads the picture so cut edges wander a little: an offset in device pixels. */
export function raggedAt(x: number, y: number, ragged: number, ratio = 1): [number, number] {
  const s = RAGGED_GRAIN * ratio, r = ragged * RAGGED_PX * ratio
  return [(noise2(x / s, y / s) - 0.5) * 2 * r, (noise2(x / s + 31.7, y / s - 17.3) - 0.5) * 2 * r]
}

/** The paper's fibers at a pixel: a brightness from about 0.94 to 1.06 at full grain. */
export function grainAt(x: number, y: number, grain: number, ratio = 1): number {
  const fine = noise2(x / (1.5 * ratio), y / (1.5 * ratio)), long = noise2(x / (14 * ratio), y / (3 * ratio))
  return 1 + ((fine - 0.5) * 0.08 + (long - 0.5) * 0.06) * grain
}

/**
 * How much shadow falls on a pixel (0 to 1): where, a shadow's length toward the light, there is a layer nearer than
 * this one (or anything at all, where this pixel is the card), read at a few places across the light's way for a
 * soft edge. `at(x, y)` says whether something is there and its depth (0 for nothing) and part.
 */
export function shadowAt(x: number, y: number, at: (x: number, y: number) => { depth: number; part: number }, look: CutoutLook, ratio = 1): number {
  const [lx, ly] = lightWay(look.light ?? 120), len = (look.shadow ?? 6) * ratio, spread = (look.soft ?? 0.5) * len * 0.6
  const here = at(x, y)
  let s = 0
  for (const k of CUTOUT_TAPS) {
    const t = at(x + lx * len - ly * spread * k, y + ly * len + lx * spread * k)
    const covers = t.depth > 0 && (here.depth === 0 || (t.part !== here.part && t.depth < here.depth * (1 - CUTOUT_LAYER)))
    s += covers ? 1 : 0
  }
  return s / CUTOUT_TAPS.length
}

// ————— Claymation —————

/** How a stage is drawn as stop-motion clay (`Stage.setFilter`). */
export interface ClayLook {
  /** Which look this is. */
  kind: 'clay'
  /** Frames a second the scene moves at, as stop motion; 0 moves every frame (12). */
  fps?: number
  /** How deep the thumbprints are, 0 to 1 (0.6). */
  prints?: number
  /** How big a thumbprint is, as a share of the scene's size (0.05). */
  size?: number
  /** How smooth the clay is: each thing's own colors softened together, 0 to 1 (0.5). */
  smooth?: number
  /** How much the clay shines, 0 to 1 (0.3). */
  sheen?: number
  /** How much the thumbprints shift from one frame to the next, as an animator's hands leave them (0.4). */
  boil?: number
  /** What stands behind the subject, top and bottom (sRGB 0–1). */
  sky?: Sky01
}

/** Behind a subject with no sky of its own (sRGB 0–1): a painted studio backdrop. */
export const CLAY_BACK: Sky01 = [[0.6, 0.74, 0.86], [0.92, 0.86, 0.74]]
/** The clay's key light in the view's own frame (x right, y up, z toward the viewer): from the top left, in front. */
export const CLAY_KEY: readonly [number, number, number] = [-0.45, 0.6, 0.66]
/** How much a thumbprint's middle darkens the clay at full depth. */
export const PRINT_DENT = 0.26
/** How strong a thumbprint's ridges are at full depth. */
export const PRINT_RIDGE = 0.1
/** How many ridges cross a thumbprint from its middle to its edge. */
export const PRINT_RINGS = 5
/** The share of the clay's cells that hold a thumbprint. */
export const PRINT_SHARE = 0.55
/** How far round each pixel the clay is softened, in CSS pixels at full smoothness. */
export const CLAY_SMOOTH_PX = 6
/** Where it is softened, as shares of that reach (eight ways at the full reach, eight between them at half). */
export const CLAY_TAPS: readonly [number, number][] = [
  ...Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)] as [number, number]),
  ...Array.from({ length: 8 }, (_, i) => [0.5 * Math.cos(((i + 0.5) * Math.PI) / 4), 0.5 * Math.sin(((i + 0.5) * Math.PI) / 4)] as [number, number]),
]
/** How far round each pixel the clay looks for nearer clay that shades it, in CSS pixels. */
export const CLAY_SHADE_PX = 10
/** How dark a pixel shut in on every side by nearer clay gets. */
export const CLAY_HOLLOW = 0.4
/** How much nearer than a pixel its neighbor must be, as a share of its depth, to shade it fully. */
export const CLAY_DEEP = 0.03

/** How shut in a pixel is (0 open to 1 shut in), from its own depth and its neighbors' round it (0 for nothing there): soft shade in the creases between lumps of clay. */
export function hollowOf(depth: number, round: readonly number[]): number {
  if (!(depth > 0) || !round.length) return 0
  let s = 0
  for (const d of round) if (d > 0) s += clamp01((depth - d) / (depth * CLAY_DEEP))
  return s / round.length
}

/** A number from 0 to 1 for a cell of the world (the shader's `cellHash` in filterPass.ts; change both). */
export const printHash = (x: number, y: number, z: number, salt: number) => fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + salt * 19.19) * 43758.5453)

/** The stop-motion frame a time falls in, which the thumbprints shift by. */
export const clayFrame = (time: number, fps: number) => (fps > 0 ? Math.floor(time * fps + 1e-6) : 0)

/**
 * The thumbprints at a point of the world, in the prints' own size (the world divided by a print's size): how much
 * the light there is changed, as a multiplier near 1. A print is a shallow round dent with a few ridges round its
 * middle; each cell of the world holds one or none, and each frame shifts it a little (`boil`), as hands do.
 */
export function printAt(p: readonly [number, number, number], frame: number, boil: number, prints: number): number {
  const bx = Math.floor(p[0]), by = Math.floor(p[1]), bz = Math.floor(p[2])
  let best = Infinity, has = 0
  for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    const cx = bx + x, cy = by + y, cz = bz + z
    const j = (salt: number) => printHash(cx, cy, cz, salt) + (printHash(cx, cy, cz, salt + frame * 3.1) - 0.5) * boil * 0.3
    const dx = cx + j(1) - p[0], dy = cy + j(2) - p[1], dz = cz + j(3) - p[2]
    const d = Math.hypot(dx, dy, dz)
    if (d < best) { best = d; has = printHash(cx, cy, cz, 4) < PRINT_SHARE ? 1 : 0 }
  }
  const dent = smooth(0.45, 0, best) * has
  const ridge = Math.sin((best / 0.45) * PRINT_RINGS * Math.PI * 2) * dent
  return 1 - prints * (PRINT_DENT * dent - PRINT_RIDGE * ridge)
}

/** The clay's own shading for a surface facing `n` (the view's frame, unit length): a soft wrapped key light and a little sheen. */
export function clayShade(n: readonly [number, number, number], sheen: number): { shade: number; shine: number } {
  const k = CLAY_KEY, len = Math.hypot(k[0], k[1], k[2])
  const facing = (n[0] * k[0] + n[1] * k[1] + n[2] * k[2]) / len
  const shade = 0.6 + 0.52 * (facing * 0.5 + 0.5)
  // the half way between the light and the eye (0, 0, 1)
  const h = [k[0] / len, k[1] / len, k[2] / len + 1], hl = Math.hypot(h[0], h[1], h[2])
  const shine = sheen * 0.22 * Math.pow(Math.max(0, (n[0] * h[0] + n[1] * h[1] + n[2] * h[2]) / hl), 14)
  return { shade, shine }
}

/** Any of the looks laid over the whole picture. */
export type FilterLook = ThermalLook | CrtLook | BlueprintLook | MosaicLook | CutoutLook | ClayLook
/** Which of them. */
export type FilterKind = FilterLook['kind']
