import { test } from 'node:test'
import assert from 'node:assert/strict'
import { depthImage, normalMap, shrinkDepth } from './spriteMaps.ts'

/** A mask frame, solid where `on` says. */
const mask = (size: number, on: (x: number, y: number) => boolean) => {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (on(x, y)) data[(y * size + x) * 4 + 3] = 255
  return { width: size, height: size, data }
}

test('depth shrinks to the mean of the drawn samples, and solid pixels with none take the nearest', () => {
  const big = 8, by = 2, d = new Float32Array(big * big)
  // the left half drawn at 4, one sample of the top left pixel at 6, the rest empty
  for (let y = 0; y < big; y++) for (let x = 0; x < 4; x++) d[y * big + x] = 4
  d[0] = 6
  const m = mask(4, (x) => x < 3)
  const s = shrinkDepth(d, big, by, m)
  assert.equal(s[0], (6 + 4 * 3) / 4)
  assert.equal(s[1], 4)
  // the outline column has no samples: it takes its neighbor's
  assert.equal(s[2], 4)
  // empty pixels stay empty even under samples
  assert.equal(s[3], 0)
})

test('a flat face to the camera points straight out; a slope leans its normal the way the surface falls away', () => {
  const size = 5, flat = new Float32Array(size * size).fill(10)
  const n = normalMap(flat, size, 0.1)
  assert.deepEqual([...n.data.slice(48, 52)], [128, 128, 255, 255])
  // depth grows to the right: the surface turns away to the right, as a ball's right side does, so its normal leans right
  const slope = Float32Array.from({ length: size * size }, (_, k) => 10 + (k % size) * 0.1)
  const s = normalMap(slope, size, 0.1)
  const [r, g, b] = s.data.slice(48, 51)
  assert.ok(r > 155 && Math.abs(g - 128) <= 1 && b > 128 && b < 255)
  // depth grows upward, as over the top of a ball: the surface faces up, and +y (green) is up
  const up = Float32Array.from({ length: size * size }, (_, k) => 10 - Math.floor(k / size) * 0.1)
  assert.ok(normalMap(up, size, 0.1).data[48 + 1] > 155)
  // every normal is a unit vector
  for (const map of [n, s]) for (let k = 0; k < size * size; k++) {
    const v = [0, 1, 2].map((c) => map.data[k * 4 + c] / 255 * 2 - 1)
    assert.ok(Math.abs(Math.hypot(...v) - 1) < 0.02)
  }
})

test('no slope is taken across a step: a thing standing in front stays flat at its edge', () => {
  const size = 4, d = new Float32Array(size * size)
  for (let k = 0; k < d.length; k++) d[k] = (k % size) < 2 ? 5 : 9
  const n = normalMap(d, size, 0.1)
  assert.deepEqual([...n.data.slice(4, 7)], [128, 128, 255])
  assert.deepEqual([...n.data.slice(8, 11)], [128, 128, 255])
  // empty pixels stay clear
  assert.equal(normalMap(new Float32Array(16), 4, 0.1).data.some((v) => v), false)
})

test('the depth image runs white near to black far, and empty pixels stay clear', () => {
  const img = depthImage([1, 2, 3, 0], 2, 1, 3)
  assert.deepEqual([img.data[0], img.data[4], img.data[8]], [255, 128, 1])
  assert.equal(img.data[15], 0)
  assert.equal(img.data[11], 255)
})
