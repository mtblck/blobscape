import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DETAIL, detailFor, lodRank, screenRadius } from './lod.ts'

test('ranks are spread evenly over 0–1 and fixed per blob', () => {
  const n = 200000
  const buckets = new Array(10).fill(0)
  for (let i = 0; i < n; i++) {
    const r = lodRank(i)
    assert.ok(r >= 0 && r < 1)
    buckets[Math.floor(r * 10)]++
  }
  for (const b of buckets) assert.ok(Math.abs(b - n / 10) < n / 100, `${buckets}`)
  assert.equal(lodRank(12345), lodRank(12345))
  // neighbours don't run in step, so a cut is spread over the whole body, not one end of it
  let runs = 0
  for (let i = 1; i < 1000; i++) if ((lodRank(i) < 0.5) === (lodRank(i - 1) < 0.5)) runs++
  assert.ok(runs > 400 && runs < 600, `${runs}`)
})

test('a creature small on screen keeps a share of its blobs, a big one keeps all, and never less than the floor', () => {
  assert.equal(detailFor(200000, 400), 1)
  const small = detailFor(200000, 120)
  assert.ok(Math.abs(small - (Math.PI * 14400 * DETAIL.density) / 200000) < 1e-9)
  assert.equal(detailFor(200000, 1), 0.06)
  assert.equal(detailFor(0, 10), 1)
})

test('screen radius shrinks with distance, and is unbounded once the camera is inside', () => {
  const near = screenRadius(1, 5, 2, 800), far = screenRadius(1, 10, 2, 800)
  assert.ok(Math.abs(near - 160) < 1e-9 && Math.abs(far - 80) < 1e-9)
  assert.equal(screenRadius(1, 0.5, 2, 800), Infinity)
})
