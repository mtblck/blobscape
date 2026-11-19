import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CELL_H, CELL_W, EDGE_TONE, GLYPHS, RAMP, RAMP_INK, STICK, STROKES, STROKE_FROM, glyphAtlas, glyphBit, glyphCell, glyphScale, glyphText, rampFor, strokeFor, strokeHeld, toneOf, lieColor, strandFor, LIE_FROM, LIE_FULL, STRAND, STRAND_HOLD, type Probe } from './glyphs.ts'

const on: Probe = { shown: true, tone: 0.5, depth: 4, part: 1 }
const off: Probe = { shown: false, tone: 0, depth: 0, part: 0 }
/** Probes for a cell from what is shown at each: left, right, above, below, above left, above right, below left, below right. */
const cell = (f: (x: number, y: number) => Probe) => [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y]) => f(x, y))

test('the ramp runs from no ink to the most, each character heavier than the last', () => {
  assert.equal(RAMP_INK[0], 0)
  assert.equal(RAMP_INK[RAMP_INK.length - 1], 1)
  for (let i = 1; i < RAMP_INK.length; i++) assert.ok(RAMP_INK[i] > RAMP_INK[i - 1], `${RAMP[i]} is no heavier than ${RAMP[i - 1]}`)
})

test('ramp characters keep their last column and row clear; strokes reach the sides of the cell they run to', () => {
  for (let g = 0; g < RAMP.length; g++) {
    for (let y = 0; y < CELL_H; y++) assert.ok(!glyphBit(g, CELL_W - 1, y), `${RAMP[g]} touches its right side`)
    for (let x = 0; x < CELL_W; x++) assert.ok(!glyphBit(g, x, CELL_H - 1), `${RAMP[g]} touches its bottom`)
  }
  const at = (ch: string) => GLYPHS.indexOf(ch)
  const some = (g: number, f: (x: number, y: number) => boolean) => { for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) if (glyphBit(g, x, y) && f(x, y)) return true; return false }
  assert.ok(some(at('|'), (_, y) => y === 0) && some(at('|'), (_, y) => y === CELL_H - 1))
  assert.ok(some(at('_'), (x) => x === 0) && some(at('_'), (x) => x === CELL_W - 1))
  assert.ok(glyphBit(at('/'), CELL_W - 1, 0) && glyphBit(at('/'), 0, CELL_H - 1))
  assert.ok(glyphBit(at('\\'), 0, 0) && glyphBit(at('\\'), CELL_W - 1, CELL_H - 1))
})

test('the atlas holds every character side by side, as glyphBit gives them', () => {
  const a = glyphAtlas()
  assert.equal(a.width, GLYPHS.length * CELL_W)
  assert.equal(a.height, CELL_H)
  for (let g = 0; g < GLYPHS.length; g++) for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) assert.equal(a.data[y * a.width + g * CELL_W + x] > 0, glyphBit(g, x, y))
})

test('more to show never gets a lighter character, and nothing gets a space', () => {
  let last = 0
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const g = rampFor(t, -1, 0)
    assert.ok(g >= last, `tone ${t}`)
    last = g
  }
  assert.equal(rampFor(0), 0)
  assert.equal(rampFor(1), RAMP.length - 1)
  assert.equal(toneOf([0, 0, 0], 0), 0)
})

test('tone follows brightness on a dark ground and darkness on a light one, and a half-filled cell wants half as much', () => {
  const white = [1, 1, 1], gray = [0.25, 0.25, 0.25]
  assert.ok(toneOf(white, 1) > toneOf(gray, 1))
  assert.ok(toneOf(white, 1, { light: true }) < toneOf(gray, 1, { light: true }))
  assert.ok(Math.abs(toneOf([0.5, 0.5, 0.5], 0.5) - toneOf(white, 1) / 2) < 1e-9)
  assert.ok(toneOf(gray, 1, { gain: 2 }) > toneOf(gray, 1))
})

test('a cell keeps its character while its tone wanders between two, and gives it up once another is clearly closer', () => {
  const a = 4, b = 5, mid = (RAMP_INK[a] + RAMP_INK[b]) / 2
  // without it the character flips at the midpoint; with it either one holds on both sides of it
  assert.equal(rampFor(mid - 0.01, -1, 0), a)
  assert.equal(rampFor(mid + 0.01, -1, 0), b)
  for (const d of [-0.02, 0.02]) {
    assert.equal(rampFor(mid + d, a), a)
    assert.equal(rampFor(mid + d, b), b)
  }
  assert.equal(rampFor(RAMP_INK[b], a), b)
  assert.equal(rampFor(RAMP_INK[a] + STICK / 2 + (RAMP_INK[b] - RAMP_INK[a]) / 2 + 0.01, a), b)
  // a stroke the frame before is nothing to keep
  assert.equal(rampFor(mid + 0.02, STROKE_FROM), b)
})

test('an edge through a cell gets the stroke that runs along it', () => {
  const s = (f: (x: number, y: number) => boolean) => { const g = strokeFor(cell((x, y) => (f(x, y) ? on : off))); return g < 0 ? '' : GLYPHS[g] }
  assert.equal(s((x) => x < 0), '|')
  assert.equal(s((x) => x > 0), '|')
  assert.equal(s((_, y) => y > 0), '_')
  // the picture is below and right of a rising line, or above and left of it (y counts down the screen)
  assert.equal(s((x, y) => x + y > 0), '/')
  assert.equal(s((x, y) => x + y < 0), '/')
  assert.equal(s((x, y) => x - y > 0), '\\')
  assert.equal(s(() => true), '')
  assert.equal(s(() => false), '')
  assert.equal(STROKES.length, GLYPHS.length - STROKE_FROM)
})

test('parts, depth and tone each make an edge between two shown probes; small differences do not', () => {
  const edge = (other: Partial<Probe>) => strokeFor(cell((x) => (x < 0 ? on : { ...on, ...other }))) >= 0
  assert.ok(edge({ part: 2 }))
  assert.ok(edge({ depth: 5 }))
  assert.ok(edge({ tone: on.tone + EDGE_TONE + 0.05 }))
  assert.ok(!edge({ depth: 4.05, tone: on.tone + EDGE_TONE / 2 }))
})

test('a stroke starts where both rings of probes find it, and holds while either still does', () => {
  const edge = cell((x) => (x < 0 ? on : off)), none = cell(() => on), bar = GLYPHS.indexOf('|')
  assert.equal(strokeHeld(edge, edge), bar)
  // the edge has only reached the outer ring: not yet a stroke, but one that was there stays
  assert.equal(strokeHeld(none, edge), -1)
  assert.equal(strokeHeld(none, edge, bar), bar)
  assert.equal(strokeHeld(none, edge, bar, 0), -1)
  assert.equal(strokeHeld(none, edge, GLYPHS.indexOf('/')), -1)
  assert.equal(strokeHeld(none, none, bar), -1)
})

test('a cell takes a stroke only when asked and when there is enough of the picture in it', () => {
  const probes = [...cell((x) => (x < 0 ? on : off)), ...cell((x) => (x < 0 ? on : off))]
  assert.equal(GLYPHS[glyphCell([0.3, 0.3, 0.3], 0.5, probes).glyph], '|')
  assert.ok(glyphCell([0.3, 0.3, 0.3], 0.5, probes, { edges: false }).glyph < STROKE_FROM)
  assert.ok(glyphCell([0.03, 0.03, 0.03], 0.05, probes).glyph < STROKE_FROM)
})

test('a character takes the hue of what it stands for, or the one ink when given', () => {
  const c = glyphCell([0.2, 0.1, 0.05], 1, undefined).color
  assert.ok(c[0] > c[1] && c[1] > c[2] && c[0] <= 1)
  assert.ok(Math.abs(c[1] / c[0] - 0.5) < 1e-9)
  assert.deepEqual(glyphCell([0.2, 0.1, 0.05], 1, undefined, {}, -1, [0.1, 0.2, 0.3]).color, [0.1, 0.2, 0.3])
  // something near black stays dark: its faint tint is not blown up into a bright color
  assert.ok(Math.max(...glyphCell([0.02, 0.01, 0.01], 1, undefined).color) < 0.1)
  assert.ok(Math.max(...glyphCell([0.01, 0.005, 0.005], 0.5, undefined).color) < 0.1)
  // on a light ground the heavier character is the darker one
  const pale = glyphCell([0.8, 0.8, 0.8], 1, undefined, { light: true }), dark = glyphCell([0.02, 0.02, 0.02], 1, undefined, { light: true })
  assert.ok(dark.glyph > pale.glyph && dark.color[0] < pale.color[0])
})

test('the grid reads off as lines of text', () => {
  const at = (s: string) => [...s].map((ch) => GLYPHS.indexOf(ch))
  assert.equal(glyphText([...at(' @# '), ...at('/|\\ '), ...at('    ')], 4), ' @#\n/|\\')
})

test('a pixel of the font is a whole number of device pixels', () => {
  assert.equal(glyphScale(12, 1), 2)
  assert.equal(glyphScale(12, 2), 3)
  assert.equal(glyphScale(2, 1), 1)
})

/** A map color back to the lie a cell would average: red and green less a half, doubled. */
const lieOf = (c: number[]) => [(c[0] - 0.5) * 2, (c[1] - 0.5) * 2]

test('how a blob lies: nothing for a round one, the same either way along a long one, and each stroke for its own way', () => {
  assert.deepEqual(lieOf(lieColor(1, 0, 1)), [0, 0])
  assert.deepEqual(lieOf(lieColor(1, 0, 1 - LIE_FROM)), [0, 0])
  assert.equal(lieColor(3, 1, 1 - LIE_FULL)[2], 1)
  for (const [x, y] of [[1, 0], [0.3, 0.9], [-0.7, 0.2]]) {
    const a = lieColor(x, y, 0.05), b = lieColor(-x, -y, 0.05)
    assert.ok(a.every((v, i) => Math.abs(v - b[i]) < 1e-12))
  }
  const stroke = (x: number, y: number) => GLYPHS[strandFor(lieOf(lieColor(x, y, 0.05)))]
  assert.equal(stroke(1, 0), '_')
  assert.equal(stroke(0, 1), '|')
  assert.equal(stroke(1, 1), '/')
  assert.equal(stroke(1, -1), '\\')
  assert.equal(stroke(1, 0.2), '_')
  assert.equal(stroke(0.2, 1), '|')
})

test('a cell is strands only when enough of it runs one way, and keeps its stroke while they still nearly do', () => {
  assert.equal(strandFor([0, 0]), -1)
  assert.equal(strandFor([STRAND - 0.02, 0]), -1)
  const level = GLYPHS.indexOf('_'), rising = GLYPHS.indexOf('/')
  assert.equal(strandFor([STRAND + 0.02, 0]), level)
  // fewer strands than would start one, but one was there
  assert.equal(strandFor([STRAND - 0.02, 0], level), level)
  assert.equal(strandFor([STRAND - 0.02, 0], level, 0), -1)
  assert.equal(strandFor([STRAND_HOLD - 0.02, 0], level), -1)
  // strands that cross cancel: half one way and half the other is no way at all
  assert.equal(strandFor([0.5 * 1 + 0.5 * -1, 0]), -1)
  // just past the line between level and rising: a fresh cell takes rising, one that was level stays level
  const v = [Math.cos(0.9) * 0.6, Math.sin(0.9) * 0.6]
  assert.equal(strandFor(v), rising)
  assert.equal(strandFor(v, level), level)
  assert.equal(strandFor([0, 0.6], level), rising)
})

test('a cell of strands takes their stroke, lit by its tone, before any edge', () => {
  const edge = [...cell((x) => (x < 0 ? on : off)), ...cell((x) => (x < 0 ? on : off))]
  const dim = glyphCell([0.05, 0.05, 0.05], 1, edge, {}, -1, undefined, [0.8, 0]), lit = glyphCell([0.8, 0.8, 0.8], 1, edge, {}, -1, undefined, [0.8, 0])
  assert.equal(GLYPHS[dim.glyph], '_')
  assert.ok(lit.color[0] > dim.color[0])
  assert.equal(GLYPHS[glyphCell([0.5, 0.5, 0.5], 1, edge, { strands: false }, -1, undefined, [0.8, 0]).glyph], '|')
})

test('braille: each eighth of a cell lights its own dot, an even tone lights one dot more for each eighth, and dots hold at their step', async () => {
  const { brailleFor, dotBit, DOT_STEP, charOf, setBit, DOT_X, DOT_Y } = await import('./glyphs.ts')
  // only the part below right is heavy: the dot below right
  assert.equal(brailleFor([0, 0, 0, 0, 0, 0, 0, 1]), 1 << dotBit(1, 3))
  assert.equal(charOf('braille', brailleFor([0, 0, 0, 0, 0, 0, 0, 1])), '⢀')
  assert.equal(charOf('braille', brailleFor([1, 1, 1, 1, 1, 1, 1, 1])), '⣿')
  assert.equal(charOf('braille', brailleFor([1, 0, 1, 0, 1, 0, 0, 0])), '⠇')
  const bitsOn = (b: number) => b.toString(2).split('1').length - 1
  for (let k = 0; k <= 8; k++) assert.equal(bitsOn(brailleFor(new Array(8).fill((k + 0.01) / 8 - 0.001))), k)
  // a tone just under a dot's step keeps it on if it was, and not otherwise
  const just = DOT_STEP.map((v, i) => (i === 0 ? v - STICK / 2 : 0))
  assert.equal(brailleFor(just), 0)
  assert.equal(brailleFor(just, 1 << dotBit(0, 0)), 1 << dotBit(0, 0))
  assert.equal(brailleFor(just, 1 << dotBit(0, 0), 0), 0)
  // the drawn dots are where the bits say
  for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) assert.ok(setBit('braille', 1 << dotBit(c, r), DOT_X[c], DOT_Y[r]))
  let ink = 0
  for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) ink += setBit('braille', 255, x, y) ? 1 : 0
  assert.equal(ink, 8)
})

test('blocks: a shape where the quarters differ, an even shade where they do not, each held near its edge', async () => {
  const { blockFor, charOf, blockInk, setBit, BLOCK_SPLIT } = await import('./glyphs.ts')
  assert.equal(charOf('blocks', blockFor([1, 0, 1, 0])), '▌')
  assert.equal(charOf('blocks', blockFor([0.9, 0.9, 0.1, 0.9])), '▜')
  assert.equal(charOf('blocks', blockFor([0.5, 0.5, 0.5, 0.5])), '▒')
  assert.equal(charOf('blocks', blockFor([0, 0, 0, 0])), ' ')
  assert.equal(charOf('blocks', blockFor([1, 1, 1, 0.9])), '█')
  // a shade holds while its tone is within `steady` of the nearest
  assert.equal(charOf('blocks', blockFor([0.4, 0.4, 0.4, 0.4], 18)), '▒')
  assert.equal(charOf('blocks', blockFor([0.62, 0.62, 0.62, 0.62])), '▒')
  assert.equal(charOf('blocks', blockFor([0.62, 0.62, 0.62, 0.62], 18)), '▓')
  // a shape keeps the quarters it had while none is clearly on the other side of the middle
  const q = [0.6, 0.6 - BLOCK_SPLIT, 0.6, 0.6 - BLOCK_SPLIT / 2 - 0.02]
  assert.equal(charOf('blocks', blockFor(q)), '▌')
  assert.equal(charOf('blocks', blockFor(q, 13)), '▙')
  // what is drawn holds as much ink as the character's weight says
  for (let g = 0; g < 19; g++) {
    let ink = 0
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) ink += setBit('blocks', g, x, y) ? 1 : 0
    assert.equal(ink / (CELL_W * CELL_H), blockInk(g), `block ${g}`)
  }
})

test('a grid in braille or blocks reads back as their own characters', async () => {
  const { glyphText } = await import('./glyphs.ts')
  assert.equal(glyphText([255, 0, 1, 0], 2, 'braille'), '⣿\n⠁')
  assert.equal(glyphText([15, 16, 5, 0], 2, 'blocks'), '█░\n▌')
})

test('a braille or blocks cell takes its color from its heaviest part', async () => {
  const { shapeCell } = await import('./glyphs.ts')
  const dim = shapeCell([0.2, 0.1, 0.05], 1, [0.1, 0.1, 0.1, 0.1], { set: 'blocks' }), bright = shapeCell([0.2, 0.1, 0.05], 1, [1, 0, 0, 0], { set: 'blocks' })
  assert.ok(bright.color[0] > dim.color[0])
  assert.deepEqual(shapeCell([0.2, 0.1, 0.05], 1, new Array(8).fill(1), { set: 'braille' }, -1, [0.1, 0.2, 0.3]).color, [0.1, 0.2, 0.3])
})
