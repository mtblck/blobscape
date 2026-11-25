import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs, covariance } from '../splat-core/blobs.ts'
import { MERGE_BAND, MERGE_GROW, MERGE_LEVELS, MERGE_PX, levelCode, levelWeight, mergeLevels } from './merge.ts'

// a floor of flat discs on a grid of `cell`, 16 × 16, on bone 0, and one blob shared by two bones
const cell = 0.1
function floor() {
  const blobs = new Blobs()
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
    blobs.push({ center: [(x + 0.5) * cell, 0.02, (z + 0.5) * cell], scale: [0.6 * cell, 0.05 * cell, 0.6 * cell], quat: [0, 0, 0, 1], color: [x / 15, 0.5, z / 15], opacity: 0.9 })
  }
  blobs.push({ center: [0.3, 0.5, 0.3], scale: [0.05, 0.05, 0.05], quat: [0, 0, 0, 1], color: [1, 0, 0], opacity: 1 })
  const n = blobs.count
  const joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4)
  for (let k = 0; k < n; k++) weights[k * 4] = 1
  joints[(n - 1) * 4 + 1] = 1; weights[(n - 1) * 4] = 0.5; weights[(n - 1) * 4 + 1] = 0.5
  return { blobs, skin: { joints, weights }, glow: new Uint8Array(n).fill(40) }
}
const made = mergeLevels(floor(), cell)

test('each level is a blob a cell, after the blobs themselves', () => {
  const n = 257
  assert.equal(made.blobs.count, n + 64 + 16)
  assert.equal(made.levels[0], levelCode(0, MERGE_LEVELS))
  assert.equal(made.levels[n - 1], 0, 'a blob on two bones is in no level')
  assert.equal(made.levels[n], levelCode(1, MERGE_LEVELS))
  assert.equal(made.levels[n + 64], levelCode(2, MERGE_LEVELS))
  assert.equal(made.skin.weights[(n + 3) * 4], 1)
  assert.equal(made.glow![n + 70], 40)
})

test('a merged blob stands for its cell: the mean place and color, the spread grown', () => {
  const n = 257, i = n + 64 // the first level-2 cell: x and z 0..0.4, 4 × 4 discs
  const c = made.blobs.center.subarray(i * 3, i * 3 + 3)
  assert.ok(Math.abs(c[0] - 0.2) < 1e-6 && Math.abs(c[2] - 0.2) < 1e-6 && Math.abs(c[1] - 0.02) < 1e-6)
  const cov = covariance(made.blobs, i)
  // four discs a side, a cell apart, each 0.6 cell across: spread (0.1² · 1.25) plus their own 0.06², grown
  const want = (0.1 * 0.1 * 1.25 + 0.06 * 0.06) * MERGE_GROW * MERGE_GROW
  assert.ok(Math.abs(cov[0] - want) < 1e-6 && Math.abs(cov[5] - want) < 1e-6, `${cov[0]} against ${want}`)
  assert.ok(cov[3] < want / 100, 'stays flat')
  assert.ok(Math.abs(made.blobs.opacity[i] - 0.9) < 1e-6)
  assert.ok(Math.abs(made.blobs.color[i * 3] - 1.5 / 15) < 1e-6)
})

test('the levels hand over: the drawn levels add up to one, the next in before the last goes', () => {
  const codes = [0, 1, 2].map((l) => levelCode(l, 2))
  for (let px = 0.05; px < 20; px *= 1.03) {
    const w = codes.map((c) => levelWeight(px, c))
    const shown = 1 - (1 - w[0]) * (1 - w[1]) * (1 - w[2])
    if (shown < 0.999) assert.fail(`at ${px.toFixed(2)} px the ground shows through: ${w.map((v) => v.toFixed(2))}`)
    if (w.filter((v) => v > 0).length > 2) assert.fail(`three levels at once at ${px}`)
  }
  assert.equal(levelWeight(MERGE_PX * (1 + MERGE_BAND) * 1.01, codes[0]), 1)
  assert.equal(levelWeight(MERGE_PX * (1 + MERGE_BAND) * 1.01, codes[1]), 0)
  assert.equal(levelWeight(0.01, codes[2]), 1, 'the coarsest stays however far')
  assert.equal(levelWeight(100, codes[0]), 1)
  assert.equal(levelWeight(0.01, 0), 1, 'a blob in no level is always drawn')
})
