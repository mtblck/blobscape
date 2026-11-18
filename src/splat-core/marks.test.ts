import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MARK_KINDS, markAt, noise1, streak } from './marks.ts'

const GRID = Array.from({ length: 41 }, (_, i) => -2 + i * 0.1)

test('a mark looks the same after a half turn, so a blob whose long axis flips end for end does not jump', () => {
  for (const kind of MARK_KINDS) for (const seed of [0.03, 0.4, 0.77]) for (const u of GRID) for (const v of GRID) {
    const a = markAt(kind, u, v, seed, [0.3, 0.2, 0.1]), b = markAt(kind, -u, -v, seed, [0.3, 0.2, 0.1])
    assert.ok(Math.abs(a.cover - b.cover) < 1e-9 && a.color.every((c, k) => Math.abs(c - b.color[k]) < 1e-9), `${kind} at ${u}, ${v}`)
  }
})

test('a mark is solid in the middle and gone before the edge of the quad its blob is drawn on', () => {
  for (const kind of MARK_KINDS) for (const size of [0.5, 1, 1.3, 5]) for (const seed of [0.1, 0.6, 0.95]) {
    assert.equal(markAt(kind, 0, 0, seed, [0.5, 0.5, 0.5], size).cover, 1)
    for (const t of GRID) {
      assert.ok(markAt(kind, 2, t, seed, [0.5, 0.5, 0.5], size).cover < 1e-6, `${kind} size ${size}: paint at the end of the quad`)
      assert.ok(markAt(kind, t, 2, seed, [0.5, 0.5, 0.5], size).cover < 1e-6, `${kind} size ${size}: paint at the side of the quad`)
    }
  }
})

test('colors stay colors: nothing below 0, paint no brighter than a ridge of light allows', () => {
  for (const kind of MARK_KINDS) for (const rgb of [[0, 0, 0], [1, 1, 1], [0.8, 0.1, 0.05]]) for (const u of GRID) for (const v of GRID) {
    const { cover, color } = markAt(kind, u, v, 0.31, rgb)
    assert.ok(cover >= 0 && cover <= 1)
    for (const c of color) assert.ok(c >= 0 && c <= 1.45, `${kind}: ${c}`)
  }
})

test('two blobs of one color get different marks, and a mark has streaks along it', () => {
  let differs = 0, streaky = 0
  for (const v of GRID) {
    if (Math.abs(markAt('gouache', 0.3, v, 0.2, [0.5, 0.4, 0.3]).color[0] - markAt('gouache', 0.3, v, 0.7, [0.5, 0.4, 0.3]).color[0]) > 0.004) differs++
    if (Math.abs(markAt('oil', 0, v, 0.2, [0.5, 0.4, 0.3]).color[0] - markAt('oil', 0, v + 0.1, 0.2, [0.5, 0.4, 0.3]).color[0]) > 0.01) streaky++
  }
  assert.ok(differs > 10 && streaky > 8, `${differs} differ, ${streaky} streaks`)
  // along the blob the paint keeps its shade: streaks run the way the brush went
  const along = GRID.filter((u) => Math.abs(u) < 0.8).map((u) => markAt('gouache', u, 0.2, 0.2, [0.5, 0.4, 0.3]).color[0])
  assert.ok(Math.max(...along) - Math.min(...along) < 1e-9)
})

test('ink is heavier where the blob is darker, and a pale blob is mostly wash; hatching leaves light things bare', () => {
  const inked = (kind: 'ink' | 'hatch', rgb: number[]) => {
    let n = 0
    for (const u of GRID) for (const v of GRID) { const m = markAt(kind, u, v, 0.5, rgb); if (m.cover > 0.5 && m.color[0] < 0.2) n++ }
    return n
  }
  for (const kind of ['ink', 'hatch'] as const) assert.ok(inked(kind, [0.02, 0.02, 0.02]) > inked(kind, [0.3, 0.3, 0.3]) && inked(kind, [0.3, 0.3, 0.3]) >= inked(kind, [0.9, 0.9, 0.9]), kind)
  assert.equal(inked('hatch', [0.95, 0.95, 0.95]), 0)
  assert.ok(inked('ink', [0.02, 0.02, 0.02]) > 20)
})

test('the noise is smooth and stays in 0 to 1', () => {
  for (let x = -5; x < 5; x += 0.013) {
    const a = noise1(x, 0.4), b = noise1(x + 0.013, 0.4)
    assert.ok(a >= 0 && a <= 1 && Math.abs(a - b) < 0.05)
    assert.ok(Math.abs(streak(x, 0.4, 5) - streak(-x, 0.4, 5)) < 1e-12)
  }
})
