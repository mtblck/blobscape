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
}

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

/** A grid of characters (their numbers in `GLYPHS`, a row after another from the top) as lines of text, with spaces at line ends dropped. */
export function glyphText(glyphs: ArrayLike<number>, columns: number): string {
  const lines: string[] = []
  for (let at = 0; at < glyphs.length; at += columns) {
    let line = ''
    for (let x = 0; x < columns && at + x < glyphs.length; x++) line += GLYPHS[glyphs[at + x]] ?? ' '
    lines.push(line.replace(/ +$/, ''))
  }
  while (lines.length && !lines[lines.length - 1]) lines.pop()
  return lines.join('\n')
}

/** How many device pixels one pixel of the font is, for a cell `size` CSS pixels tall: whole, and at least 1. */
export function glyphScale(size: number, pixelRatio: number): number {
  return Math.max(1, Math.round((size * pixelRatio) / CELL_H))
}
