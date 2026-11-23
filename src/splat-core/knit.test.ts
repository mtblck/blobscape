import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BAND_SHARE, GAP_SHADE, KNIT_YARNS, MOTIFS, PICTURE_MARK, knitCell, knitChart, stitchAt, stitchHash, stitchSize, yarnFor } from './knit.ts'

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]
const YARNS = ['#c3222d', '#f4ecdb', '#1f8243', '#0f4d2b', '#e3ad2f', '#6f4222', '#8a1622', '#26262c', '#74b3d8', '#c9925a'].map(hex)

test('a stitch is a V: yarn on both legs, the same on both sides, gap in the middle of its top', () => {
  for (let i = 0; i < 40; i++) {
    const x = (i * 0.37) % 1, y = (i * 0.61) % 1
    const a = stitchAt(x, y), b = stitchAt(1 - x, y)
    assert.equal(a.above, b.above)
    assert.ok(Math.abs(a.shade - b.shade) < 1e-9)
    assert.ok(a.shade >= GAP_SHADE - 1e-9 && a.shade <= 1)
  }
  // the legs stand apart at the top and meet at the bottom
  assert.equal(stitchAt(0.02, 0.9).shade, GAP_SHADE)
  assert.ok(stitchAt(0.15, 0.1).shade > 0.8)
  assert.ok(stitchAt(0.85, 0.1).shade > 0.8)
  assert.ok(stitchAt(0.5, 0.95).shade > 0.6)
  // the tip of the stitch above lies over the top of this one, in the middle
  assert.equal(stitchAt(0.42, 0.12).above, true)
  assert.equal(stitchAt(0.2, 0.6).above, false)
})

test('more than half of a stitch is yarn', () => {
  let yarn = 0
  const n = 40
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (stitchAt((i + 0.5) / n, (j + 0.5) / n).shade > GAP_SHADE) yarn++
  assert.ok(yarn / (n * n) > 0.6, `${yarn / (n * n)}`)
})

test('a stitch has its own number, the same each time', () => {
  assert.equal(stitchHash(3, 7), stitchHash(3, 7))
  assert.notEqual(stitchHash(3, 7), stitchHash(4, 7))
  for (let i = 0; i < 20; i++) { const h = stitchHash(i, i * 3); assert.ok(h >= 0 && h < 1) }
})

test('a color takes the nearest yarn, never the body, and a shaded red stays red', () => {
  assert.equal(yarnFor(hex('#ffffff'), YARNS).yarn, 1)
  assert.equal(yarnFor(hex('#22863f'), YARNS).yarn, 2)
  assert.equal(yarnFor(hex('#e8b535'), YARNS).yarn, 4)
  // the body's own red goes to the dark red, not to a brown
  assert.equal(yarnFor(YARNS[0], YARNS).yarn, 6)
  assert.equal(yarnFor(hex('#a01c26'), YARNS).yarn, 6)
  for (let i = 0; i < 30; i++) {
    const y = yarnFor([(i * 0.31) % 1, (i * 0.53) % 1, (i * 0.71) % 1], YARNS).yarn
    assert.ok(y >= 1 && y < KNIT_YARNS)
  }
})

test('a stitch keeps its yarn unless another is clearly nearer', () => {
  const between = [0.5, 0.42, 0.2]
  const free = yarnFor(between, YARNS)
  const other = free.yarn === 5 ? 9 : 5
  const held = yarnFor(between, YARNS, other, 1)
  assert.equal(held.yarn, other)
  assert.equal(yarnFor(between, YARNS, other, 0).yarn, free.yarn)
  // far off, it changes whatever it was
  assert.equal(yarnFor(hex('#ffffff'), YARNS, 7, 0.035).yarn, 1)
})

test('every motif is a block of known stitches', () => {
  assert.equal(new Set(MOTIFS.map((m) => m.id)).size, MOTIFS.length)
  for (const m of MOTIFS) {
    assert.ok(m.rows.length > 0, m.id)
    for (const r of m.rows) {
      assert.equal(r.length, m.rows[0].length, `${m.id}: every row is one repeat wide`)
      assert.match(r, /^[.xo]+$/, m.id)
    }
  }
})

test('the bands fit their share of the rows, are the same on both sides, and a band too tall is left out', () => {
  const cols = 81, rows = 80
  const chart = knitChart(cols, rows, { bands: ['line', 'checks', 'line', 'star', 'zigzag'], snow: false })
  const room = Math.floor(rows * BAND_SHARE)
  let any = 0
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = chart[r * cols + c]
    assert.ok(v <= 2)
    if (v) { any++; assert.ok(r < room || r >= rows - room, `row ${r} is in the field`) }
    // an odd grid mirrors about its middle stitch wherever the motif is its own mirror (all of these are)
    if (r < room && chart[r * cols + (cols - 1 - c)] !== v) assert.fail(`row ${r} is not the same on both sides at ${c}`)
  }
  assert.ok(any > 200)
  // the first row is the line
  for (let c = 0; c < cols; c++) assert.equal(chart[c], 1)
  // a short grid has no room for the star
  const short = knitChart(cols, 30, { bands: ['star'] })
  assert.ok(short.every((v) => v === 0))
  assert.ok(knitChart(cols, rows, {}).every((v) => v === 0))
})

test('upright motifs stand the same way up at the bottom, the others are turned over', () => {
  const cols = 48, rows = 120
  const trees = knitChart(cols, rows, { bands: ['trees'] })
  const tall = MOTIFS.find((m) => m.id === 'trees')!.rows.length
  for (let r = 0; r < tall; r++) for (let c = 0; c < cols; c++) assert.equal(trees[r * cols + c], trees[(rows - tall + r) * cols + c])
  const peaks = knitChart(cols, rows, { bands: ['peaks'] })
  const high = MOTIFS.find((m) => m.id === 'peaks')!.rows.length
  for (let r = 0; r < high; r++) for (let c = 0; c < cols; c++) assert.equal(peaks[r * cols + c], peaks[(rows - 1 - r) * cols + c])
})

test('snow dots fall only between the bands', () => {
  const cols = 60, rows = 80
  const plain = knitChart(cols, rows, { bands: ['zigzag'] })
  const snowy = knitChart(cols, rows, { bands: ['zigzag'], snow: true })
  let dots = 0
  for (let i = 0; i < plain.length; i++) {
    if (plain[i]) assert.equal(snowy[i], plain[i])
    else if (snowy[i]) { dots++; assert.equal(snowy[i], 1) }
  }
  assert.ok(dots > 100 && dots < cols * rows / 4)
})

test('stitches are whole pixels, wider than tall', () => {
  for (const [size, ratio] of [[9, 1], [9, 2], [5, 1.5], [20, 3], [1, 1]]) {
    const s = stitchSize(size, ratio)
    assert.ok(Number.isInteger(s.width) && Number.isInteger(s.height))
    assert.ok(s.width >= 4 && s.height >= 3 && s.height <= s.width)
  }
})

test('the picture wins, and the stitches right beside it are plain body', () => {
  const white = hex('#ffffff')
  assert.equal(knitCell(0.9, white, false, 2, YARNS), 1 + PICTURE_MARK)
  assert.equal(knitCell(0.2, white, true, 2, YARNS), 0)
  assert.equal(knitCell(0.2, white, false, 2, YARNS), 2)
  // only a stitch that showed the picture can keep its yarn
  const between = [0.5, 0.42, 0.2]
  const free = yarnFor(between, YARNS).yarn, other = free === 5 ? 9 : 5
  assert.equal(knitCell(1, between, false, 0, YARNS, other + PICTURE_MARK, 1), other + PICTURE_MARK)
  assert.equal(knitCell(1, between, false, 0, YARNS, other, 1), free + PICTURE_MARK)
})
