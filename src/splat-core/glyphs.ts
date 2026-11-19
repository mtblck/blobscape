/**
 * Characters: the picture drawn as text, a grid of cells over the view with one character in each. A cell's character
 * is picked by how much of the cell there is to show (its tone: more ink for more of it), or, where an edge runs
 * through the cell, by which way the edge runs: `|`, `-`, `/` or `\`. The grid is fixed on the screen, so the
 * characters stand in rows and columns and never slide; and a cell keeps the character it had unless another has
 * become clearly closer, so a cell whose tone sits between two characters does not flip back and forth as lights
 * flicker and the view turns.
 *
 * This file is the CPU twin of the engine's pass (`GlyphPass` in splat-engine/glyphPass.ts): change one, change both.
 */

/** A cell's width and height in the font's own pixels. */
export const CELL_W = 6
/** See `CELL_W`. */
export const CELL_H = 8

/**
 * The font: every character on a 6 × 8 grid, top row first. Letters and signs keep the last column and the last row
 * clear, so neighbors don't touch; the strokes reach every side of the cell, so a line of them joins up.
 */
const FONT: Record<string, string[]> = {
  ' ': ['......', '......', '......', '......', '......', '......', '......', '......'],
  '.': ['......', '......', '......', '......', '......', '..#...', '......', '......'],
  ':': ['......', '......', '..#...', '......', '......', '..#...', '......', '......'],
  '-': ['......', '......', '......', '.###..', '......', '......', '......', '......'],
  '=': ['......', '......', '.###..', '......', '.###..', '......', '......', '......'],
  '+': ['......', '..#...', '..#...', '#####.', '..#...', '..#...', '......', '......'],
  '*': ['......', '..#...', '#.#.#.', '.###..', '#.#.#.', '..#...', '......', '......'],
  '%': ['##..#.', '##.#..', '...#..', '..#...', '.#....', '.#.##.', '#..##.', '......'],
  '8': ['.###..', '#...#.', '#...#.', '.###..', '#...#.', '#...#.', '.###..', '......'],
  '#': ['.#.#..', '.#.#..', '#####.', '.#.#..', '#####.', '.#.#..', '.#.#..', '......'],
  '@': ['.###..', '#...#.', '#.###.', '#.#.#.', '#.###.', '#.....', '.####.', '......'],
  '|': ['..#...', '..#...', '..#...', '..#...', '..#...', '..#...', '..#...', '..#...'],
  '_': ['......', '......', '......', '######', '......', '......', '......', '......'],
  '/': ['.....#', '....#.', '....#.', '...#..', '..#...', '.#....', '.#....', '#.....'],
  '\\': ['#.....', '.#....', '.#....', '..#...', '...#..', '....#.', '....#.', '.....#'],
}

/** The characters that show tone, from none to the most ink. */
export const RAMP = ' .:-=+*%8#@'
/** The characters that show an edge: upright, level (drawn as a dash the width of the cell), rising and falling. */
export const STROKES = '|_/\\'
/** Every character, in the order the engine numbers them. */
export const GLYPHS = RAMP + STROKES
/** Where the strokes start in `GLYPHS`. */
export const STROKE_FROM = RAMP.length

/** Whether a character has ink at a pixel of its cell (`x` from the left, `y` from the top). */
export function glyphBit(glyph: number, x: number, y: number): boolean {
  return FONT[GLYPHS[glyph]]?.[y]?.[x] === '#'
}

const count = (ch: string) => FONT[ch].join('').split('#').length - 1
const MOST = count(RAMP[RAMP.length - 1])
/** How much ink each character of the ramp lays down, as a share of the heaviest one's: what its tone is. */
export const RAMP_INK: readonly number[] = [...RAMP].map((ch) => count(ch) / MOST)

/** The font as one strip of bytes, a character after another from the left, 255 where there is ink: what the engine samples. */
export function glyphAtlas(): { width: number; height: number; data: Uint8Array } {
  const width = GLYPHS.length * CELL_W, data = new Uint8Array(width * CELL_H)
  for (let g = 0; g < GLYPHS.length; g++) for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) if (glyphBit(g, x, y)) data[y * width + g * CELL_W + x] = 255
  return { width, height: CELL_H, data }
}

/** How the picture is drawn as characters (`Stage.setGlyphs`). */
export interface GlyphLook {
  /** How tall a cell is in CSS pixels (default 12; a cell is three quarters as wide). It is rounded so every pixel of the font is a whole number of device pixels. */
  size?: number
  /** The characters' color, sRGB 0–1. Left out, each takes the color of what it stands for. */
  ink?: readonly [number, number, number]
  /** For a light ground: darker things get the heavier characters. Without it (a dark ground) lighter things do. */
  light?: boolean
  /** Draw a stroke where an edge runs through a cell: where the picture ends, one thing stands in front of another, two parts meet, or the tone changes sharply (default true). */
  edges?: boolean
  /**
   * Draw a stroke along what is long and thin on the screen, such as strands of fur and blades of grass, where a cell
   * is mostly that (default true). The stroke is the one of `|`, `_`, `/` and `\` nearest the way they run.
   */
  strands?: boolean
  /** How much closer another character's tone has to be before a cell gives up the one it has, 0–0.5 of the whole range (default `STICK`; 0 never keeps one). */
  steady?: number
  /** Tones are multiplied by this before a character is picked (default 1): over 1 for a dim scene. */
  gain?: number
  /**
   * Which characters (default 'ascii'): 'braille' draws each cell as the braille character whose eight dots are on
   * where that eighth of the cell is heavy enough, and 'blocks' as the quarter blocks (▘ ▚ ▙ and so on) or, where a
   * cell is even, one of the shades ░ ▒ ▓. Both show shapes within a cell, so `edges` and `strands` are not used.
   */
  set?: GlyphSet
}

/** The kinds of characters a picture can be drawn in (`GlyphLook.set`). */
export type GlyphSet = 'ascii' | 'braille' | 'blocks'

/** The default `GlyphLook.steady`. */
export const STICK = 0.06
/** Two probes in a cell are on two sides of an edge when their tones differ by this much. */
export const EDGE_TONE = 0.3
/** ...or their depths by this share of the nearer one. */
export const EDGE_DEPTH = 0.05
/** How far from a cell's middle its two rings of eight probes stand, as shares of the cell: the inner ring, then the outer. */
export const PROBE: readonly [number, number] = [0.2, 0.4]
/** A cell with less cover than this shows no stroke. */
export const EDGE_COVER = 0.12

/** A character's own color is the cell's made no more than this many times brighter. */
export const LIFT_MOST = 4

const luma = (c: ArrayLike<number>) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

/**
 * A cell's tone, 0–1: how heavy a character it wants. `rgb` is the mean of the picture over the cell, linear and
 * premultiplied, `cover` its mean alpha: a cell the subject only half fills gets a lighter character, which softens
 * the outline.
 */
export function toneOf(rgb: ArrayLike<number>, cover: number, look: GlyphLook = {}): number {
  if (cover <= 0) return 0
  const bright = Math.sqrt(Math.min(1, Math.max(0, luma(rgb) / cover)))
  return Math.min(1, cover * (look.light ? 1 - bright : bright) * (look.gain ?? 1))
}

/**
 * The ramp character for a tone: the one whose ink is nearest, unless the cell had a ramp character the frame before
 * (`before`, its number) that is no more than `steady` further off.
 */
export function rampFor(tone: number, before = -1, steady = STICK): number {
  let best = 0
  for (let i = 1; i < RAMP_INK.length; i++) if (Math.abs(RAMP_INK[i] - tone) < Math.abs(RAMP_INK[best] - tone)) best = i
  if (before >= 0 && before < RAMP_INK.length && steady > 0 && Math.abs(RAMP_INK[before] - tone) <= Math.abs(RAMP_INK[best] - tone) + steady) return before
  return best
}

/** What the picture is at one of a cell's probes. */
export interface Probe {
  /** Whether anything is drawn there. */
  shown: boolean
  /** Its tone there (`toneOf` of that one point). */
  tone: number
  /** How far in front of the camera it is. */
  depth: number
  /** Which part it is, as any number that differs between parts. */
  part: number
}

/** Whether two probes lie on two sides of an edge. */
export function across(a: Probe, b: Probe): boolean {
  if (a.shown !== b.shown) return true
  if (!a.shown) return false
  return a.part !== b.part || Math.abs(a.depth - b.depth) > Math.min(a.depth, b.depth) * EDGE_DEPTH || Math.abs(a.tone - b.tone) > EDGE_TONE
}

/**
 * The stroke for a cell, as a number in `GLYPHS`, or -1 for none. The probes are left, right, above, below, then
 * above left, above right, below left and below right of the cell's middle. An edge runs along the one way in which
 * both ends are on the same side while the way across it is not: upright and level are tried first.
 */
export function strokeFor(p: readonly Probe[]): number {
  const [l, r, t, b, tl, tr, bl, br] = p
  const h = across(l, r), v = across(t, b), overRise = across(tl, br), overFall = across(tr, bl)
  if (h && !v) return STROKE_FROM
  if (v && !h) return STROKE_FROM + 1
  // the two corners a rising line joins are on one side, and the other two are not
  if (overRise && !overFall) return STROKE_FROM + 2
  if (overFall && !overRise) return STROKE_FROM + 3
  return -1
}

/**
 * The stroke for a cell from its two rings of probes (`strokeFor` of each), or -1. A stroke starts only where both
 * rings find the same one, and a cell that had one the frame before (`before`, a number in `GLYPHS`) keeps it while
 * either ring still finds it, when `steady` is over 0: an edge has to come well into a cell to be drawn there and to
 * leave it altogether to be dropped, so an edge lying along the border of two cells does not hop between them.
 */
export function strokeHeld(inner: readonly Probe[], outer: readonly Probe[], before = -1, steady = STICK): number {
  const a = strokeFor(inner), b = strokeFor(outer)
  if (steady > 0 && before >= STROKE_FROM && (a === before || b === before)) return before
  return a === b ? a : -1
}

/** A blob counts as long and thin on the screen from this much longer than wide (1 less its width over its length)... */
export const LIE_FROM = 0.7
/** ...and fully from this. */
export const LIE_FULL = 0.9
/** A cell is drawn as a strand's stroke when its mean lie is this strong... */
export const STRAND = 0.3
/** ...and one that was stays one down to this. */
export const STRAND_HOLD = 0.2
/** A cell keeps its strand stroke while the strands run within this of it, as the cosine of twice the angle between (a fresh pick is within 0.707). */
export const STRAND_KEEP = 0.5

/**
 * How a blob lies on the screen, as the color the engine's map of it holds: `x, y` is its long axis there in pixels
 * (y up; either way along it), `thin` its width over its length. Red and green are 0.5 plus half the cosine and sine
 * of twice the axis's angle, times how long and thin the blob is (0 under `LIE_FROM`, 1 from `LIE_FULL`), which is
 * blue. Twice the angle, so a line and the same line turned end for end are one color, and the mean of many is the way
 * most of them run.
 */
export function lieColor(x: number, y: number, thin: number): [number, number, number] {
  const l2 = Math.max(x * x + y * y, 1e-12)
  const t = Math.min(1, Math.max(0, (1 - thin - LIE_FROM) / (LIE_FULL - LIE_FROM))), e = t * t * (3 - 2 * t)
  return [0.5 + (0.5 * e * (x * x - y * y)) / l2, 0.5 + (0.5 * e * 2 * x * y) / l2, e]
}

/** The four strokes as ways to run, each the cosine and sine of twice its angle: upright, level, rising, falling (the order of `STROKES`). */
const WAYS: readonly [number, number][] = [[-1, 0], [1, 0], [0, 1], [0, -1]]

/**
 * The stroke for a cell that is mostly strands, as a number in `GLYPHS`, or -1 when it is not. `lie` is the mean over
 * the cell of the map's red and green, each less 0.5 and doubled: its length says how much of the cell is long thin
 * blobs running one way, its direction which way. A cell that had a stroke (`before`) keeps it while the strands
 * still run near it and there are still about enough of them, when `steady` is over 0.
 */
export function strandFor(lie: ArrayLike<number>, before = -1, steady = STICK): number {
  const strength = Math.hypot(lie[0], lie[1])
  if (strength < STRAND_HOLD) return -1
  const was = before - STROKE_FROM
  if (steady > 0 && was >= 0 && was < WAYS.length && (lie[0] * WAYS[was][0] + lie[1] * WAYS[was][1]) / strength >= STRAND_KEEP) return before
  if (strength < STRAND) return -1
  let best = 0
  for (let i = 1; i < WAYS.length; i++) if (lie[0] * WAYS[i][0] + lie[1] * WAYS[i][1] > lie[0] * WAYS[best][0] + lie[1] * WAYS[best][1]) best = i
  return STROKE_FROM + best
}

/** A cell as drawn: its character and that character's color. */
export interface GlyphCell {
  /** The character's number in `GLYPHS` (0 is a space). */
  glyph: number
  /** Its color, linear RGB. */
  color: [number, number, number]
}

/**
 * One cell: its character and color from the picture's mean over the cell (`rgb` linear and premultiplied, `cover`
 * its alpha), the two rings of probes when edges are wanted (the inner eight, then the outer eight), and the character
 * it had the frame before (-1 for none). `ink` here is linear. `lie` is the cell's mean lie (`strandFor`) when strands
 * are wanted: a cell of strands takes their stroke, lit by its tone, before any edge is looked for.
 */
export function glyphCell(rgb: ArrayLike<number>, cover: number, probes: readonly Probe[] | undefined, look: GlyphLook = {}, before = -1, ink?: ArrayLike<number>, lie?: ArrayLike<number>): GlyphCell {
  const tone = toneOf(rgb, cover, look)
  const steady = look.steady ?? STICK
  const strand = lie && look.strands !== false && cover >= EDGE_COVER ? strandFor(lie, before, steady) : -1
  if (strand >= 0) {
    if (ink) return { glyph: strand, color: [ink[0], ink[1], ink[2]] }
    const top = Math.max(rgb[0], rgb[1], rgb[2], cover / LIFT_MOST, 1e-4)
    const level = look.light ? 0.6 - 0.45 * tone : 0.45 + 0.55 * tone
    return { glyph: strand, color: [(rgb[0] / top) * level, (rgb[1] / top) * level, (rgb[2] / top) * level] }
  }
  const stroke = probes && look.edges !== false && cover >= EDGE_COVER ? strokeHeld(probes.slice(0, 8), probes.slice(8, 16), before, steady) : -1
  const glyph = stroke >= 0 ? stroke : rampFor(tone, before, steady)
  if (ink) return { glyph, color: [ink[0], ink[1], ink[2]] }
  // its own color, brought up to full strength, since the character's ink already says how light or dark it is; but
  // only so far (`LIFT_MOST` times), or the faint tint of something near black would come out as a bright color
  const top = Math.max(rgb[0], rgb[1], rgb[2], cover / LIFT_MOST, 1e-4)
  const level = stroke >= 0 ? (look.light ? 0.2 : 1) : look.light ? 0.6 - 0.45 * tone : 0.55 + 0.45 * tone
  return { glyph, color: [(rgb[0] / top) * level, (rgb[1] / top) * level, (rgb[2] / top) * level] }
}

/** A cell's color from the picture's mean over it, brought up to full strength (`LIFT_MOST` at most) and set to `level`. */
function lifted(rgb: ArrayLike<number>, cover: number, level: number, ink?: ArrayLike<number>): [number, number, number] {
  if (ink) return [ink[0], ink[1], ink[2]]
  const top = Math.max(rgb[0], rgb[1], rgb[2], cover / LIFT_MOST, 1e-4)
  return [(rgb[0] / top) * level, (rgb[1] / top) * level, (rgb[2] / top) * level]
}

/**
 * The tone at which each braille dot comes on, a dot a row from the top, left then right: spread like an ordered
 * dither, so a cell of even tone lights its dots in an order that keeps them apart, one more for each eighth.
 */
export const DOT_STEP: readonly number[] = [0, 4, 6, 2, 3, 7, 5, 1].map((v) => (v + 0.5) / 8)

/** The bit of the braille character (counted from U+2800) that holds the dot in column `c` and row `r` (from the top). */
export const dotBit = (c: number, r: number) => (r < 3 ? r + 3 * c : 6 + c)

/** Where a braille cell's dots sit in the font's 6 × 8 cell: columns, then rows. */
export const DOT_X: readonly number[] = [1, 4]
/** See `DOT_X`. */
export const DOT_Y: readonly number[] = [0, 2, 4, 6]

/**
 * A braille cell's dots from the tones of its eight parts (two across, four down, a row after another from the top):
 * as bits from U+2800. A dot is on where its part's tone reaches its `DOT_STEP`; one that was on the frame before
 * (`before`, the same bits, or -1) stays on down to `steady` under it, so a dot at its step does not blink.
 */
export function brailleFor(tones: ArrayLike<number>, before = -1, steady = STICK): number {
  let bits = 0
  for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
    const d = r * 2 + c, bit = dotBit(c, r), was = before >= 0 && steady > 0 && (before >> bit) & 1
    if (tones[d] >= DOT_STEP[d] - (was ? steady : 0)) bits |= 1 << bit
  }
  return bits
}

/** The quarter blocks, by their bits: above left 1, above right 2, below left 4, below right 8. */
export const QUADS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'
/** The shades, light to dark, numbered after the quarter blocks. */
export const SHADES = '░▒▓'
/** A blocks cell whose quarters' tones lie closer than this is drawn as one even shade, not a shape. */
export const BLOCK_SPLIT = 0.25
/** The even blocks as tones: none, the three shades, full. */
const EVEN: readonly [number, number][] = [[0, 0], [16, 0.25], [17, 0.5], [18, 0.75], [15, 1]]

/**
 * A blocks cell from the tones of its four quarters (above left, above right, below left, below right): an even cell
 * is the shade nearest its mean (kept, like a ramp character, unless another is `steady` closer), and an uneven one is
 * the quarter block with the quarters over the middle of its tones (kept while no quarter is clearly on the other side).
 */
export function blockFor(q: ArrayLike<number>, before = -1, steady = STICK): number {
  const hi = Math.max(q[0], q[1], q[2], q[3]), lo = Math.min(q[0], q[1], q[2], q[3])
  if (hi - lo < BLOCK_SPLIT) {
    const mean = (q[0] + q[1] + q[2] + q[3]) / 4
    let best = 0
    for (let i = 1; i < EVEN.length; i++) if (Math.abs(EVEN[i][1] - mean) < Math.abs(EVEN[best][1] - mean)) best = i
    const was = steady > 0 ? EVEN.findIndex(([g]) => g === before) : -1
    return was >= 0 && Math.abs(EVEN[was][1] - mean) <= Math.abs(EVEN[best][1] - mean) + steady ? EVEN[was][0] : EVEN[best][0]
  }
  const mid = (hi + lo) / 2
  let bits = 0
  for (let i = 0; i < 4; i++) if (q[i] > mid) bits |= 1 << i
  if (steady > 0 && before > 0 && before < 15 && before !== bits) {
    let holds = true
    for (let i = 0; i < 4; i++) if ((before >> i) & 1 ? q[i] < mid - steady : q[i] > mid + steady) holds = false
    if (holds) return before
  }
  return bits
}

/** How heavy a blocks character is, 0–1. */
export const blockInk = (g: number) => (g >= 16 ? EVEN[g - 15][1] : ((g & 1) + ((g >> 1) & 1) + ((g >> 2) & 1) + ((g >> 3) & 1)) / 4)

/**
 * One cell drawn in braille or blocks (`GlyphLook.set`): `parts` are the tones of its eighths or quarters (`toneOf` of
 * each), the rest as for `glyphCell`. The color is the cell's own at the level its heaviest part asks for.
 */
export function shapeCell(rgb: ArrayLike<number>, cover: number, parts: ArrayLike<number>, look: GlyphLook = {}, before = -1, ink?: ArrayLike<number>): GlyphCell {
  const steady = look.steady ?? STICK
  const glyph = look.set === 'braille' ? brailleFor(parts, before, steady) : blockFor(parts, before, steady)
  let top = 0
  for (let i = 0; i < parts.length; i++) top = Math.max(top, parts[i])
  return { glyph, color: lifted(rgb, cover, look.light ? 0.6 - 0.45 * top : 0.55 + 0.45 * top, ink) }
}

/** Whether a character of a set has ink at a pixel of its 6 × 8 cell (`x` from the left, `y` from the top): what the engine draws. */
export function setBit(set: GlyphSet, glyph: number, x: number, y: number): boolean {
  if (set === 'braille') {
    const c = DOT_X.indexOf(x), r = DOT_Y.indexOf(y)
    return c >= 0 && r >= 0 && ((glyph >> dotBit(c, r)) & 1) === 1
  }
  if (set === 'blocks') {
    if (glyph === 16) return x % 2 === 0 && y % 2 === 0
    if (glyph === 17) return (x + y) % 2 === 0
    if (glyph === 18) return !(x % 2 === 1 && y % 2 === 1)
    return ((glyph >> ((x >= CELL_W / 2 ? 1 : 0) + (y >= CELL_H / 2 ? 2 : 0))) & 1) === 1
  }
  return glyphBit(glyph, x, y)
}

/** A character of a set as text. */
export function charOf(set: GlyphSet, glyph: number): string {
  if (set === 'braille') return glyph ? String.fromCharCode(0x2800 + glyph) : ' '
  if (set === 'blocks') return glyph >= 16 ? SHADES[glyph - 16] ?? ' ' : QUADS[glyph] ?? ' '
  return GLYPHS[glyph] ?? ' '
}

/** A grid of characters (their numbers in `GLYPHS`, or a set's own numbers, a row after another from the top) as lines of text, with spaces at line ends dropped. */
export function glyphText(glyphs: ArrayLike<number>, columns: number, set: GlyphSet = 'ascii'): string {
  const lines: string[] = []
  for (let at = 0; at < glyphs.length; at += columns) {
    let line = ''
    for (let x = 0; x < columns && at + x < glyphs.length; x++) line += charOf(set, glyphs[at + x])
    lines.push(line.replace(/ +$/, ''))
  }
  while (lines.length && !lines[lines.length - 1]) lines.pop()
  return lines.join('\n')
}

/** How many device pixels one pixel of the font is, for a cell `size` CSS pixels tall: whole, and at least 1. */
export function glyphScale(size: number, pixelRatio: number): number {
  return Math.max(1, Math.round((size * pixelRatio) / CELL_H))
}
