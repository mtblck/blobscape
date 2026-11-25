import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paletteSnap } from './paints.ts'

test('full color leaves paint alone', () => {
  assert.equal(paletteSnap([]), undefined)
  assert.equal(paletteSnap(undefined), undefined)
})

test('each paint takes the nearest palette color, in OKLab', () => {
  const snap = paletteSnap([[16, 16, 24], [200, 40, 40], [40, 160, 60], [240, 236, 220]])!
  assert.deepEqual(snap(0.9, 0.2, 0.15), [200 / 255, 40 / 255, 40 / 255])
  assert.deepEqual(snap(0.1, 0.55, 0.2), [40 / 255, 160 / 255, 60 / 255])
  assert.deepEqual(snap(0.02, 0.02, 0.05), [16 / 255, 16 / 255, 24 / 255])
  assert.deepEqual(snap(1, 1, 0.95), [240 / 255, 236 / 255, 220 / 255])
  // a dark red is nearer the dark than the white
  assert.deepEqual(snap(0.25, 0.05, 0.05)[0] < 0.9, true)
})

test('a palette color snaps to itself, and out-of-range paint is held in range', () => {
  const pal: [number, number, number][] = [[12, 34, 56], [210, 120, 30]]
  const snap = paletteSnap(pal)!
  for (const c of pal) assert.deepEqual(snap(c[0] / 255, c[1] / 255, c[2] / 255), [c[0] / 255, c[1] / 255, c[2] / 255])
  assert.deepEqual(snap(1.4, 0.6, -0.2), [210 / 255, 120 / 255, 30 / 255])
})
