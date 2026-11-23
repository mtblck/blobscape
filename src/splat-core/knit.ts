/**
 * Knit (Matt's idea, 2026-11-23: a picture reminiscent of an ugly Christmas sweater, about stitching and patterns).
 * The view is a piece of knitting: a grid of stitches fixed on the screen, each one V of yarn in one of a few yarn
 * colors. Where the picture shows, a stitch takes the yarn nearest what it shows; round it the sweater's own
 * pattern is knitted in, bands of small motifs above and below (zigzags, stars, trees, reindeer) and snow dots
 * between. The arithmetic here is pure; `splat-engine/knitPass.ts` is its shader twin (change both).
 */
import { oklab } from './pixel.ts'

type Rgb3 = readonly [number, number, number]

/** How a stage draws knitting (`Stage.setKnit`). */
export interface KnitLook {
  /** A stitch's width, in CSS pixels (9). */
  size?: number
  /** The yarns (sRGB 0–1), at most `KNIT_YARNS`: the first is the sweater's body, the second the pattern's main yarn, the third its second. The picture is knitted in every yarn but the body's. */
  yarns: readonly Rgb3[]
  /** The pattern round the picture: the bands from the edge inward, each an id of `MOTIFS`. Left out or empty, none. */
  bands?: readonly string[]
  /** Small dots of the pattern's yarn over the plain field between the bands. */
  snow?: boolean
  /** How much nearer another yarn must be (OKLab) before a stitch of the picture changes yarn; 0 decides each frame afresh (`KNIT_STEADY`). */
  steady?: number
}

/** The most yarns a look can have. */
export const KNIT_YARNS = 10
/** A stitch is this many times as tall as wide: knitting is wider than it is tall. */
export const STITCH_TALL = 0.8
/** A stitch belongs to the picture when this much of it is covered. */
export const KNIT_COVER = 0.5
/** A stitch of the picture keeps its yarn unless another is this much nearer (OKLab distance). */
export const KNIT_STEADY = 0.035
/** How much lightness counts beside hue when a yarn is picked for a color: a red thing in shade takes the dark red yarn before a brown one as light as it. */
export const KNIT_LIGHT = 0.5
/** The bands at the top take up to this share of the rows, and those at the bottom as much. */
export const BAND_SHARE = 0.3
/** Snow dots stand this many stitches apart, each row of them half a step aside from the last. */
export const SNOW_STEP = 4
/** Added to a stitch's yarn number in the grid when it shows the picture, so the next frame can tell. */
export const PICTURE_MARK = 32

// ---- the stitch ----

/** Where a V's two legs run, in a stitch's own square (x across, y down, both 0 to 1): from `LEG_TOP` out at the side to `LEG_TIP` near the middle, which lies a quarter of a stitch into the row below. */
export const LEG_TOP: readonly [number, number] = [0.37, -0.08]
/** Where a V's leg ends, near the middle and a quarter of a stitch into the row below (see `LEG_TOP`). */
export const LEG_TIP: readonly [number, number] = [0.1, 1.27]
/** Half a strand's width, as a share of the stitch's. */
export const YARN_HALF = 0.2
/** How dark the gap between strands is beside the yarn. */
export const GAP_SHADE = 0.42
/** How much darker a strand is at its edges than along its middle. */
export const YARN_ROUND = 0.4
/** How much one stitch's yarn is lighter or darker than the next's. */
export const YARN_VARY = 0.07

/** The distance from a point to the nearer leg of a V whose stitch starts at y = 0, in stitch widths. */
function legDistance(x: number, y: number): number {
  // both legs at once: fold across the middle
  const px = Math.abs(x - 0.5), py = y * STITCH_TALL
  const ax = LEG_TOP[0], ay = LEG_TOP[1] * STITCH_TALL, bx = LEG_TIP[0], by = LEG_TIP[1] * STITCH_TALL
  const dx = bx - ax, dy = by - ay
  const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

/**
 * What is at a point of a stitch (x across, y down, 0 to 1): `above` when it is the tip of the stitch above, which
 * lies over this one, and `shade`, what the yarn's color is multiplied by there (a strand is lighter along its
 * middle; between strands is the dark of the gap, in the stitch's own yarn).
 */
export function stitchAt(x: number, y: number): { above: boolean; shade: number } {
  const over = legDistance(x, y + 1), own = legDistance(x, y)
  const above = over < YARN_HALF
  const d = above ? over : own
  if (d >= YARN_HALF) return { above: false, shade: GAP_SHADE }
  const t = d / YARN_HALF
  // the last tenth of a strand's width is its edge, eased into the gap
  const edge = Math.min(1, (1 - t) / 0.18)
  const body = 1 - YARN_ROUND * t * t
  return { above, shade: GAP_SHADE + (body - GAP_SHADE) * edge }
}

/** A number from 0 to 1 for a stitch, as the shader makes it. */
export function stitchHash(col: number, row: number): number {
  const s = Math.sin(col * 127.1 + row * 311.7) * 43758.5453
  return s - Math.floor(s)
}

// ---- the yarn ----

/** The yarn nearest a color (sRGB 0–1) in OKLab with lightness counted `KNIT_LIGHT`, never the body's (yarn 0): its number, and how far off it is. `was` is the yarn the stitch had, kept unless another is `steady` nearer. */
export function yarnFor(color: readonly number[], yarns: readonly Rgb3[], was = -1, steady = 0): { yarn: number; off: number } {
  const lab = oklab(color[0] * 255, color[1] * 255, color[2] * 255)
  let best = 1, off = Infinity, wasOff = Infinity
  for (let i = 1; i < yarns.length && i < KNIT_YARNS; i++) {
    const y = oklab(yarns[i][0] * 255, yarns[i][1] * 255, yarns[i][2] * 255)
    const d = Math.hypot((lab[0] - y[0]) * KNIT_LIGHT, lab[1] - y[1], lab[2] - y[2])
    if (d < off) { off = d; best = i }
    if (i === was) wasOff = d
  }
  return steady > 0 && wasOff <= off + steady ? { yarn: was, off: wasOff } : { yarn: best, off }
}

// ---- the pattern ----

/** A small picture knitted over and over along a band: rows of stitches, `.` the body, `x` the pattern's main yarn, `o` its second. Every row is one repeat wide. */
export interface Motif {
  /** Its name in a look's `bands`. */
  id: string
  /** The rows, top first. */
  rows: readonly string[]
  /** It stands on the ground (a tree, a reindeer), so the bottom bands don't turn it over. */
  upright?: boolean
}

/** An eight-point star as knitters chart it: eight petals of `k` by `k` stitches round a middle stitch, one repeat `4k + 2` wide, a small stitch between one star and the next first, so the star's middle is the repeat's. */
function star(k: number): string[] {
  const n = 2 * k, rows: string[] = []
  for (let y = -n; y <= n; y++) {
    let row = ''
    for (let x = -n - 1; x <= n; x++) {
      const a = Math.abs(x), b = Math.abs(y), hi = Math.max(a, b), lo = Math.min(a, b)
      const petal = x >= -n && lo >= 1 && lo <= k && hi - lo >= 1 && hi - lo <= k
      const between = x === -n - 1 && y === 0
      row += petal ? 'x' : (a === 0 && b === 0) || between ? 'o' : '.'
    }
    rows.push(row)
  }
  return rows
}

/** The motifs a band can be. */
export const MOTIFS: readonly Motif[] = [
  { id: 'line', rows: ['x'] },
  { id: 'gap', rows: ['.'] },
  { id: 'checks', rows: ['x.', '.x'] },
  { id: 'dots', rows: ['x...', '....', '..x.'] },
  { id: 'zigzag', rows: ['..x.', '.x.x', 'x...'] },
  { id: 'peaks', rows: ['...x..', '..xxx.', '.xxxxx', '......', 'o..o..'] },
  { id: 'crosses', rows: ['x.x.', '.x.o', 'x.x.'] },
  { id: 'diamonds', rows: ['...x..', '..x.x.', '.x.o.x', '..x.x.', '...x..'] },
  { id: 'hearts', rows: ['.xx.xx..', 'xxxxxxx.', 'xxxxxxx.', '.xxxxx..', '..xxx...', '...x....'], upright: true },
  { id: 'star', rows: star(3) },
  { id: 'small-star', rows: star(2) },
  {
    id: 'trees', upright: true, rows: [
      '....x.......',
      '...xxx......',
      '..xxxxx.....',
      '...xxx....o.',
      '..xxxxx.....',
      '.xxxxxxx....',
      '..xxxxx.....',
      '.xxxxxxx....',
      'xxxxxxxxx...',
      '....o.......',
    ],
  },
  {
    id: 'reindeer', upright: true, rows: [
      '.......x.x.x....',
      '........xxx.....',
      '.........x......',
      '........xxxx....',
      '........xxxxx...',
      'x......xxx......',
      '.xxxxxxxxx......',
      '.xxxxxxxxx......',
      '.xxxxxxxxx......',
      '.x.x....x.x.....',
      '.x.x....x.x.....',
      '.x.x....x.x.....',
    ],
  },
]

const YARN_OF: Record<string, number> = { '.': 0, x: 1, o: 2 }

/**
 * The sweater's own pattern for a grid of stitches: a yarn number a stitch (0 the body, 1 and 2 the pattern's),
 * rows from the top. The bands are laid from the top edge inward, each with a plain row after it, for as long as
 * they fit in `BAND_SHARE` of the rows (one too tall is left out), and again from the bottom edge up, turned over
 * unless they stand upright. Every motif is laid so that the middle of the grid is the middle of a repeat, so the
 * pattern is the same on both sides. Snow dots fill the field between.
 */
export function knitChart(cols: number, rows: number, look: Pick<KnitLook, 'bands' | 'snow'>): Uint8Array {
  const out = new Uint8Array(cols * rows)
  const room = Math.floor(rows * BAND_SHARE)
  const laid: Motif[] = []
  let used = 0
  for (const id of look.bands ?? []) {
    const m = MOTIFS.find((x) => x.id === id)
    if (!m || used + m.rows.length + 1 > room) continue
    laid.push(m)
    used += m.rows.length + 1
  }
  let top = 0
  for (const m of laid) {
    const wide = m.rows[0].length, start = Math.floor(cols / 2) - Math.floor(wide / 2)
    for (let r = 0; r < m.rows.length; r++) {
      for (let c = 0; c < cols; c++) {
        const k = (((c - start) % wide) + wide) % wide
        out[(top + r) * cols + c] = YARN_OF[m.rows[r][k]] ?? 0
        // the bottom band: the same rows turned over, or as they are for a thing that stands upright
        const from = m.upright ? r : m.rows.length - 1 - r
        out[(rows - top - m.rows.length + r) * cols + c] = YARN_OF[m.rows[from][k]] ?? 0
      }
    }
    top += m.rows.length + 1
  }
  if (look.snow) {
    const mid = Math.floor(cols / 2)
    for (let r = used + 1; r < rows - used - 1; r++) {
      const k = r - (used + 1)
      if (k % (SNOW_STEP / 2)) continue
      const aside = (k / (SNOW_STEP / 2)) % 2 ? SNOW_STEP / 2 : 0
      for (let c = 0; c < cols; c++) if ((((c - mid + aside) % SNOW_STEP) + SNOW_STEP) % SNOW_STEP === 0) out[r * cols + c] = 1
    }
  }
  return out
}

/** How many device pixels a stitch is wide and tall: whole, so every stitch is the same size. */
export function stitchSize(size: number, ratio: number): { width: number; height: number } {
  const width = Math.max(4, Math.round(size * ratio))
  return { width, height: Math.max(3, Math.round(width * STITCH_TALL)) }
}

/**
 * One stitch decided: `cover` is how much of it the picture covers and `color` what it shows there (sRGB 0–1,
 * straight), `beside` whether a stitch next to it (left, right, above or below) shows the picture, `chart` the
 * sweater's own yarn there and `was` the grid's number for it the frame before (-1 for none). The picture wins;
 * a stitch right beside it is plain body, so the pattern never runs into the picture. Gives the grid's number:
 * the yarn, plus `PICTURE_MARK` for a stitch of the picture.
 */
export function knitCell(cover: number, color: readonly number[], beside: boolean, chart: number, yarns: readonly Rgb3[], was = -1, steady = 0): number {
  if (cover >= KNIT_COVER) return yarnFor(color, yarns, was >= PICTURE_MARK ? was - PICTURE_MARK : -1, steady).yarn + PICTURE_MARK
  return beside ? 0 : chart
}
