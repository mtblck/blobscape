/**
 * Halftone screen print (Matt asked for our own, 2026-11-25): the picture printed in a few inks, each laid through
 * its own screen of dots. A screen is a grid of cells fixed on the paper (so on the screen), turned to the ink's own
 * angle; each cell holds one dot whose area is how much of that ink the picture wants there, read at the cell's
 * middle, so a light place is small dots and a dark one dots that run together into a field with small holes. Inks
 * are see-through and print over one another, so where dots of two inks overlap the paper shows through both. Each
 * ink's plate can sit a little off the others (misregistration), and the ink takes unevenly. The arithmetic here is
 * pure; `splat-engine/halftonePass.ts` is its shader twin (change both).
 */

/** An sRGB color, 0–1. */
export type Rgb01 = readonly [number, number, number]

/** One ink and its screen. */
export interface HalftoneInk {
  /** The ink's color as printed full on white paper (sRGB 0–1). */
  color: Rgb01
  /** The screen's angle, in degrees. */
  angle: number
  /** The key ink (black): it takes over the gray the other inks share, as a printer's black does (one a set, at most). */
  key?: boolean
}

/** How a stage prints in halftone (`Stage.setHalftone`). */
export interface HalftoneLook {
  /** The inks, printed in this order; at most `HALFTONE_INKS`. */
  inks: readonly HalftoneInk[]
  /** The paper (sRGB 0–1). */
  paper?: Rgb01
  /** A cell of the screen, in CSS pixels (7). */
  cell?: number
  /** How far each plate sits off true, in CSS pixels (1). */
  shift?: number
  /** How unevenly the ink takes, 0 to 1 (0.4). */
  texture?: number
  /** The sky printed behind the subject, top and bottom (sRGB 0–1). Left out, the paper is bare there. */
  sky?: readonly [Rgb01, Rgb01]
}

/** The most inks a print has. */
export const HALFTONE_INKS = 4
/** The paper (sRGB 0–1): a bright white with a little warmth. */
export const HALFTONE_PAPER: Rgb01 = [0.96, 0.95, 0.92]
/** How many times the separation goes round the inks. */
export const SEPARATE_PASSES = 8
/** How much of the gray the colored inks share a key ink (black) takes over (`separate`). */
export const KEY_TAKES = 0.9
/**
 * Black starts only past this much gray, as a printer's skeleton black: small black dots in a light gray read as
 * dirt, so the lightest grays stay in the colored inks.
 */
export const KEY_FROM = 0.3
/**
 * The dot's spot function is (cos 2πu + cos 2πv) / 2 over a cell (u, v from -½ to ½ about its middle): round dots
 * when small, a checkerboard at half, round holes when large. These turn a dot's area into the level the spot
 * function is cut at, as an odd polynomial in 1 − 2·area (fitted to the spot's own areas, within 0.7%).
 */
export const SPOT_FIT: readonly number[] = [0.5069, 1.0692, -1.0476, 0.4792]
/** Each plate's direction off true, by its place in the print (radians): spread so no two lie the same way. */
export const SHIFT_WAYS: readonly number[] = [0.4, 2.6, 4.3, 5.6]
/** How wide a patch of unevenly taken ink is, in CSS pixels. */
export const INK_GRAIN = 6
/** How much darker or lighter ink takes from place to place at full texture. */
export const INK_UNEVEN = 0.35

/** sRGB to linear light. */
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
/** An ink's color in linear light. */
export const inkLinear = (c: Rgb01): [number, number, number] => [lin(c[0]), lin(c[1]), lin(c[2])]

/**
 * How much of each ink a color wants (each 0 to 1), for a print on `paper` (both linear). Dots of inks on different
 * screens fall over one another as if at random, so a place with shares a of each ink reflects, on average,
 * paper · Π (1 − aᵢ·(1 − inkᵢ)) in each channel. The shares are found ink by ink with the others held, each step a
 * Gauss–Newton step on the error in log light, again and again. A `key` ink (black) is left out at first; then it
 * takes `KEY_TAKES` of the gray the other inks have in common (the least of their shares) past `KEY_FROM`, as a
 * printer replaces three inks' gray with black, and the others are found again round it. Let in at the start, black took the dark
 * channel of every color and greens came out gray.
 */
export function separate(color: readonly number[], paper: readonly number[], inks: readonly (readonly number[])[], key = -1): number[] {
  // one ink can only tell light from dark: it matches the color's luminance
  const lum = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2], plum = 0.2126 * paper[0] + 0.7152 * paper[1] + 0.0722 * paper[2]
  const want = [0, 1, 2].map((c) => Math.log(Math.min(1, Math.max(0.01, inks.length === 1 ? lum / Math.max(plum, 0.001) : color[c] / Math.max(paper[c], 0.001)))))
  const a = inks.map(() => 0)
  const k = inks.map((ink) => ink.map((v) => 1 - Math.max(0.02, v)))
  const solve = (passes: number, held: number) => {
    for (let pass = 0; pass < passes; pass++) {
      for (let i = 0; i < inks.length; i++) {
        if (i === held) continue
        let g = 0, h = 1e-4
        for (let c = 0; c < 3; c++) {
          let got = 0
          for (let j = 0; j < inks.length; j++) got += Math.log(1 - a[j] * k[j][c])
          const d = -k[i][c] / (1 - a[i] * k[i][c])
          g += (got - want[c]) * d
          h += d * d
        }
        a[i] = Math.min(1, Math.max(0, a[i] - g / h))
      }
    }
  }
  const keyed = inks.length > 1 ? key : -1
  solve(SEPARATE_PASSES, keyed)
  if (keyed >= 0) {
    let gray = 1
    for (let i = 0; i < inks.length; i++) if (i !== key) gray = Math.min(gray, a[i])
    a[key] = (Math.max(0, gray - KEY_FROM) / (1 - KEY_FROM)) * KEY_TAKES
    solve(SEPARATE_PASSES, key)
  }
  return a
}

/** The level the spot function is cut at for a dot of this area (0 to 1): 1 for none, −1 for a full field. */
export function spotLevel(area: number): number {
  const b = 1 - 2 * Math.min(1, Math.max(0, area))
  return SPOT_FIT[0] * b + SPOT_FIT[1] * b ** 3 + SPOT_FIT[2] * b ** 5 + SPOT_FIT[3] * b ** 7
}

/** The spot function at a place in a cell (u, v from -½ to ½ about its middle). */
export const spotAt = (u: number, v: number): number => (Math.cos(2 * Math.PI * u) + Math.cos(2 * Math.PI * v)) / 2

/**
 * Where a point of the paper (in device pixels) falls on a plate's screen: which cell (counted from the one at the
 * screen's turning point, `about`), the cell's middle on the paper, and the point's place in its cell. `cell` is in
 * device pixels, `angle` in degrees, `off` where the plate sits off true. Screens turn about the picture's middle.
 */
export function screenAt(x: number, y: number, cell: number, angle: number, off: readonly [number, number] = [0, 0], about: readonly [number, number] = [0, 0]): { at: [number, number]; mid: [number, number]; u: number; v: number } {
  const t = (angle * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
  const px = x - about[0] - off[0], py = y - about[1] - off[1]
  const qx = (c * px + s * py) / cell, qy = (-s * px + c * py) / cell
  const ix = Math.floor(qx), iy = Math.floor(qy), fx = ix + 0.5, fy = iy + 0.5
  return { at: [ix, iy], mid: [(c * fx - s * fy) * cell + off[0] + about[0], (s * fx + c * fy) * cell + off[1] + about[1]], u: qx - fx, v: qy - fy }
}

/** Where a cell's color is read, round its middle, along the screen's own two ways: shares of a cell (the middle and four more). */
export const CELL_TAPS: readonly [number, number][] = [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]

/**
 * How much of ink `i` a plate's cell holds: the picture read round the cell's middle (`mid`, device pixels; `t` from
 * 0 at the top to 1 at the bottom, for the sky), over the sky or the paper, separated into the look's inks.
 */
export function cellShare(i: number, mid: readonly [number, number], angle: number, cell: number, height: number, picture: (x: number, y: number) => readonly number[], look: HalftoneLook): number {
  const paper = inkLinear(look.paper ?? HALFTONE_PAPER)
  const inks = look.inks.slice(0, HALFTONE_INKS)
  const t = (angle * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
  const sum = [0, 0, 0, 0]
  for (const [a, b] of CELL_TAPS) {
    const p = picture(mid[0] + (c * a - s * b) * cell, mid[1] + (s * a + c * b) * cell)
    for (let k = 0; k < 4; k++) sum[k] += p[k] / CELL_TAPS.length
  }
  const sky = look.sky?.map(inkLinear)
  const down = Math.min(1, Math.max(0, mid[1] / Math.max(1, height)))
  const back = sky ? [0, 1, 2].map((k) => sky[0][k] + (sky[1][k] - sky[0][k]) * down) : paper
  const color = [0, 1, 2].map((k) => sum[k] + (1 - Math.min(1, sum[3])) * back[k])
  return separate(color, paper, inks.map((k) => inkLinear(k.color)), inks.findIndex((k) => k.key))[i]
}

/** How much of a pixel a dot of `area` covers at (u, v) in its cell, softened over one pixel (`soft`: a device pixel in cell units). */
export function dotCover(u: number, v: number, area: number, soft: number): number {
  if (area <= 0.004) return 0
  if (area >= 0.996) return 1
  const s = spotAt(u, v) - spotLevel(area)
  const g = Math.PI * Math.hypot(Math.sin(2 * Math.PI * u), Math.sin(2 * Math.PI * v)) * soft
  return Math.min(1, Math.max(0, 0.5 + s / Math.max(g, 1e-4)))
}

/** Where plate `i` sits off true, in device pixels, for a look's `shift` in device pixels. */
export const plateOff = (i: number, shift: number): [number, number] => [Math.cos(SHIFT_WAYS[i]) * shift, Math.sin(SHIFT_WAYS[i]) * shift]

/** The paper with inks on it: `cover` is how much of the pixel each ink's dot covers, `thick` how heavily it took there (1 as printed). Linear in, linear out. */
export function printed(paper: readonly number[], inks: readonly (readonly number[])[], cover: readonly number[], thick: readonly number[] = []): [number, number, number] {
  const out: [number, number, number] = [paper[0], paper[1], paper[2]]
  for (let i = 0; i < inks.length; i++) for (let c = 0; c < 3; c++) out[c] *= 1 - cover[i] * (1 - Math.max(0.02, inks[i][c]) ** (thick[i] ?? 1))
  return out
}

/** A small, smooth noise over the paper (0 to 1), in CSS pixels, for how unevenly ink takes: the shader's twin. */
export function inkNoise(x: number, y: number): number {
  const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v) }
  const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j
  const u = f * f * (3 - 2 * f), w = g * g * (3 - 2 * g)
  const top = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * u, bottom = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * u
  return top + (bottom - top) * w
}

/**
 * One device pixel of the print. `picture(x, y)` is the picture there, linear and premultiplied (r, g, b, a), with y
 * counted from the top; `width` and `height` are the picture's, `ratio` device pixels a CSS pixel.
 */
export function halftoneAt(x: number, y: number, picture: (x: number, y: number) => readonly number[], width: number, height: number, look: HalftoneLook, ratio = 1): [number, number, number] {
  const paper = inkLinear(look.paper ?? HALFTONE_PAPER)
  const inks = look.inks.slice(0, HALFTONE_INKS)
  const cell = Math.max(2, (look.cell ?? 7) * ratio), shift = (look.shift ?? 1) * ratio, tex = look.texture ?? 0.4
  const cover: number[] = [], thick: number[] = []
  inks.forEach((ink, i) => {
    const { mid, u, v } = screenAt(x, y, cell, ink.angle, plateOff(i, shift), [width / 2, height / 2])
    const area = cellShare(i, mid, ink.angle, cell, height, picture, look)
    cover.push(dotCover(u, v, area, 1 / cell))
    thick.push(1 + (inkNoise(x / ratio / INK_GRAIN + i * 17.3, y / ratio / INK_GRAIN) - 0.5) * 2 * INK_UNEVEN * tex)
  })
  return printed(paper, inks.map((k) => inkLinear(k.color)), cover, thick)
}
