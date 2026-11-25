import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FAR_BAND, FAR_SPREAD, farKeep, farSize, DETAIL, detailFor, lodRank, screenRadius } from './lod.ts'

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

test('blobs big enough on screen are all kept; smaller ones thin out by the share of the pixel they fill', () => {
  const rule = { pixels: 1, least: 0.05 }
  assert.equal(farKeep(4, rule), 1)
  assert.equal(farKeep(1, rule), 1)
  assert.equal(farKeep(0.25, rule), 0.25)
  assert.equal(farKeep(0.0001, rule), 0.05)
  assert.equal(farKeep(1, { pixels: 2, least: 0.05 }), 0.25)
  // the blobs kept cover what all of them did and a little more: what is kept, times how much each grows, is the spread
  for (const px2 of [0.98, 0.8, 0.25, 0.1, 0.01]) {
    let area = 0, kept = 0
    const n = 20000
    for (let i = 0; i < n; i++) { const f = farSize(lodRank(i), px2, rule); area += f; if (f > 0) kept++ }
    const keep = farKeep(px2, rule)
    if (Math.abs(area / n - (1 + (FAR_SPREAD - 1) * (1 - keep))) > 0.04) assert.fail(`at ${px2}: covered ${(area / n).toFixed(3)}`)
    if (Math.abs(kept / n - keep - Math.min(FAR_BAND, 1 - keep)) > 0.02) assert.fail(`at ${px2}: kept ${(kept / n).toFixed(3)} of ${keep.toFixed(3)}`)
  }
})

test('a blob shrinks away over some way as it gets smaller on screen, never blinks, and stays gone smaller still', () => {
  const rule = { pixels: 1, least: 0.01 }
  for (let i = 0; i < 2000; i++) {
    const rank = lodRank(i)
    if (farSize(rank, 1.5, rule) !== 1) assert.fail('blobs big enough are drawn as they are')
    let shrinks = 0, gone = 0
    // walking away: its size on screen falls as one over the distance
    for (let d = 1; d < 30; d *= 1.002) {
      const px2 = 1 / (d * d), keep = farKeep(px2, rule)
      const f = farSize(rank, px2, rule)
      if (gone && f > 0) assert.fail(`blob ${i} came back at ${d}`)
      if (!shrinks && f < (0.999 * (1 + (FAR_SPREAD - 1) * (1 - keep))) / (keep + Math.min(FAR_BAND, 1 - keep) / 2)) shrinks = d
      if (!gone && f === 0) gone = d
    }
    // from starting to shrink to gone is a few percent of the way out at least, so moving the camera never blinks it
    if (gone && gone / shrinks < 1.04) assert.fail(`blob ${i} went between ${shrinks} and ${gone}`)
  }
})
