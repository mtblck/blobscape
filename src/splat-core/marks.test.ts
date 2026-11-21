import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LINE_BREAK, MARK_KINDS, lineWeight, markAt, noise1, streak, MARK_CUT, MARK_LIFT, depthSlope } from './marks.ts'

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
    for (const c of color) assert.ok(c >= 0 && c <= 1.7, `${kind}: ${c}`)
  }
})

test('gouache and oil are different paint: flat chalky dabs beside long ridged strokes of richer color', () => {
  const rgb = [0.6, 0.25, 0.1]
  const swing = (kind: 'gouache' | 'oil') => { const c = GRID.filter((v) => Math.abs(v) < 0.7).map((v) => markAt(kind, 0, v, 0.4, rgb).color[1]); return Math.max(...c) - Math.min(...c) }
  assert.ok(swing('oil') > 4 * swing('gouache'), 'oil has ridges where gouache is nearly flat')
  // a stroke of oil reaches further along its blob and is narrower across it
  const reach = (kind: 'gouache' | 'oil', across: boolean) => GRID.filter((t) => t >= 0 && markAt(kind, across ? 0 : t, across ? t : 0, 0.4, rgb).cover > 0.5).length
  assert.ok(reach('oil', false) > reach('gouache', false) && reach('oil', true) < reach('gouache', true))
  // oil is richer than the blob's own color and gouache chalkier, the same seed and place
  const chroma = (c: number[]) => Math.max(...c) - Math.min(...c)
  const gray = [0.3, 0.3, 0.3]
  assert.ok(markAt('gouache', 0, 0, 0.5, [0, 0, 0]).color[0] > 0.02, 'chalk lifts gouache off black')
  assert.ok(markAt('oil', 0, 0, 0.5, [0, 0, 0]).color[0] < 0.21)
  let richer = 0
  for (const v of GRID) { const o = markAt('oil', 0, v, 0.5, rgb), g = markAt('gouache', 0, v, 0.5, rgb); if (o.cover && g.cover && chroma(o.color) / (o.color[0] + 1e-6) > chroma(g.color) / (g.color[0] + 1e-6)) richer++ }
  assert.ok(richer > 5)
  // a stroke of oil leans warm or cool by its seed; a gray stays gray in gouache
  assert.ok(markAt('oil', 0, 0, 0.9, gray).color[0] > markAt('oil', 0, 0, 0.9, gray).color[2] && markAt('oil', 0, 0, 0.1, gray).color[0] < markAt('oil', 0, 0, 0.1, gray).color[2])
  assert.ok(Math.abs(markAt('gouache', 0, 0, 0.9, gray).color[0] - markAt('gouache', 0, 0, 0.9, gray).color[2]) < 1e-9)
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
  const inked = (kind: 'ink' | 'hatch' | 'stipple', rgb: number[]) => {
    let n = 0
    for (const u of GRID) for (const v of GRID) { const m = markAt(kind, u, v, 0.5, rgb); if (m.cover > 0.5 && m.color[0] < 0.2) n++ }
    return n
  }
  for (const kind of ['ink', 'hatch', 'stipple'] as const) assert.ok(inked(kind, [0.02, 0.02, 0.02]) > inked(kind, [0.3, 0.3, 0.3]) && inked(kind, [0.3, 0.3, 0.3]) >= inked(kind, [0.9, 0.9, 0.9]), kind)
  assert.equal(inked('hatch', [0.95, 0.95, 0.95]), 0)
  assert.equal(inked('stipple', [0.95, 0.95, 0.95]), 0)
  assert.ok(inked('stipple', [0.02, 0.02, 0.02]) > 20)
  assert.ok(inked('ink', [0.02, 0.02, 0.02]) > 20)
})

test('the noise is smooth and stays in 0 to 1', () => {
  for (let x = -5; x < 5; x += 0.013) {
    const a = noise1(x, 0.4), b = noise1(x + 0.013, 0.4)
    assert.ok(a >= 0 && a <= 1 && Math.abs(a - b) < 0.05)
    assert.ok(Math.abs(streak(x, 0.4, 5) - streak(-x, 0.4, 5)) < 1e-12)
  }
})

test('a drawn line is heavier round dark things, swells along its length, and lifts off only round light ones', () => {
  for (let swell = 0; swell <= 1; swell += 0.1) {
    assert.ok(lineWeight(1, swell) >= lineWeight(0.5, swell) && lineWeight(0.5, swell) >= lineWeight(0.1, swell))
    assert.ok(lineWeight(0.6, swell) > 0.4 && lineWeight(1, swell) <= 1)
  }
  assert.ok(lineWeight(0.5, 0.9) > lineWeight(0.5, 0.1))
  assert.equal(lineWeight(LINE_BREAK.dark - 0.01, LINE_BREAK.swell - 0.01), 0)
  assert.ok(lineWeight(LINE_BREAK.dark + 0.01, 0) > 0 && lineWeight(0, LINE_BREAK.swell + 0.01) > 0)
})

test('ink and wash leaves light things nearly bare paper and keeps its pen for the shade', () => {
  const pen = (rgb: number[]) => { let n = 0; for (const u of GRID) for (const v of GRID) { const m = markAt('ink', u, v, 0.5, rgb); if (m.cover > 0.5 && m.color[0] < 0.2) n++ } return n }
  assert.equal(pen([0.8, 0.8, 0.8]), 0)
  assert.ok(pen([0.03, 0.03, 0.03]) > 20)
})

test('flat blobs lying in one plane are at one depth wherever they overlap, however the plane is turned', () => {
  // Drawn back to front by their centers, the blobs of a flat thing swap places all at once as it turns in the view,
  // and every mark on it jumps (the windmill's sails did). By depth at each pixel instead, none is in front of another
  const f = 300, size = 0.02
  for (const [nx, ny] of [[0.3, 0.1], [-0.2, 0.35], [0, -0.4], [0.05, 0]]) {
    const nz = Math.sqrt(1 - nx * nx - ny * ny)
    const cov = [1 - nx * nx, -nx * ny, -nx * nz, 1 - ny * ny, -ny * nz, 1 - nz * nz].map((v) => v * size * size)
    const [sx, sy] = depthSlope(cov, [f, f, 0, 0], 0)
    // two discs on the plane, and a pixel both cover
    const on = (x: number, y: number) => [x, y, -(nx * x + ny * y) / nz - 5]
    const p = on(0.1, 0.2), q = on(0.115, 0.19), at = [0.108 * f, 0.196 * f]
    const depth = (c: number[]) => c[2] + sx * (at[0] - c[0] * f) + sy * (at[1] - c[1] * f)
    assert.ok(Math.abs(p[2] - q[2]) > 1e-4 || nx === 0.05, 'their centers are at different depths')
    assert.ok(Math.abs(depth(p) - depth(q)) < 1e-9, `${depth(p)} and ${depth(q)}`)
    assert.ok(Math.abs(depth(p) - on(0.108, 0.196)[2]) < 1e-9)
  }
  // a round blob has no slope, and the screen blur only makes a slope gentler
  const ball = depthSlope([1, 0, 0, 1, 0, 1], [f, f, 0, 0], 0)
  assert.ok(Math.hypot(...ball) < 1e-9)
  const flat = [0.91, 0, -0.286, 1, 0, 0.09].map((v) => v * size * size)
  assert.ok(Math.hypot(...depthSlope(flat, [f, f, 0, 0])) < Math.hypot(...depthSlope(flat, [f, f, 0, 0], 0)))
  // the lift that settles which of two is on top is far smaller than a blob, so it never reaches another surface
  assert.ok(MARK_LIFT > 0 && MARK_LIFT < 0.5 && MARK_CUT > 0 && MARK_CUT < 1)
})

test('a flat mark is the whole disc in the blob\'s own color, whatever its seed or size', () => {
  for (const seed of [0.1, 0.9]) for (const size of [0.5, 1.3]) {
    const mid = markAt('flat', 0.4, -0.3, seed, [0.3, 0.2, 0.1], size), out = markAt('flat', 1.6, 1.4, seed, [0.3, 0.2, 0.1], size)
    assert.deepEqual(mid, { cover: 1, color: [0.3, 0.2, 0.1] })
    assert.equal(out.cover, 0)
  }
})
