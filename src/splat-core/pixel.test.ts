import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alphaCut, autoPalette, downsample, makeFrame, outline, pixelArt, quantize, removeStrays, countSolid, type Rgb } from './pixel.ts'

const solid = (w: number, h: number, on: (x: number, y: number) => boolean, rgb = [200, 40, 40]) => {
  const f = makeFrame(w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) f.data.set([...rgb, 255], (y * w + x) * 4)
  return f
}

test('downsample averages colour by coverage, so a half-covered pixel keeps its colour', () => {
  // 2x2 block: two red opaque samples, two empty
  const src = new Uint8Array([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0])
  const f = downsample(src, 2, 2, { premultiplied: false, flipY: false })
  // colour stays pure red; coverage is 2 of 4 samples = 510/4, rounded → 128
  assert.deepEqual([...f.data], [255, 0, 0, 128])
})

test('downsample un-premultiplies', () => {
  // premultiplied 50% red = (128,0,0,128)
  const src = new Uint8Array([128, 0, 0, 128])
  const f = downsample(src, 1, 1, { premultiplied: true, flipY: false })
  assert.ok(Math.abs(f.data[0] - 255) <= 1)
})

test('downsample flips GL rows', () => {
  const sq = new Uint8Array(16)
  sq.set([9, 9, 9, 255], 0) // bottom-left in GL = row 0
  const f = downsample(sq, 2, 1, { premultiplied: false, flipY: true })
  assert.equal(f.data[(1 * 2 + 0) * 4], 9)
})

test('alphaCut makes alpha binary', () => {
  const f = makeFrame(2, 1)
  f.data.set([1, 1, 1, 100, 1, 1, 1, 200])
  const c = alphaCut(f, 0.5)
  assert.equal(c.data[3], 0)
  assert.equal(c.data[7], 255)
})

test('quantize snaps to the nearest palette colour', () => {
  const f = solid(1, 1, () => true, [250, 10, 10])
  const q = quantize(f, [[0, 0, 0], [255, 0, 0], [0, 0, 255]], 0)
  assert.deepEqual([...q.data.slice(0, 3)], [255, 0, 0])
})

test('autoPalette finds the two colours of a two-colour image', () => {
  const f = solid(8, 8, () => true)
  for (let i = 0; i < 32; i++) f.data.set([20, 120, 220, 255], i * 4)
  const p = autoPalette([f], 2)
  assert.equal(p.length, 2)
  assert.ok(p.some((c) => c[0] === 200 && c[1] === 40))
  assert.ok(p.some((c) => c[2] === 220))
})

test('removeStrays drops lone pixels but keeps shapes', () => {
  const f = solid(5, 5, (x, y) => (x === 0 && y === 0) || (x >= 2 && x <= 3 && y >= 2 && y <= 3))
  assert.equal(countSolid(removeStrays(f)), 4)
})

test('outline rings the silhouette with 4-neighbours', () => {
  const f = solid(3, 3, (x, y) => x === 1 && y === 1)
  const o = outline(f, [0, 0, 0])
  assert.equal(countSolid(o), 5)
})

const PAL: Rgb[] = [[20, 16, 24], [200, 40, 40], [250, 240, 200]]

test('pixelArt with no glow is the alpha cut, palette and outline steps in one', () => {
  const f = solid(8, 8, (x, y) => x >= 2 && x < 6 && y >= 2 && y < 6, [190, 60, 50])
  // a faint pixel is cut away
  f.data.set([190, 60, 50, 90], (1 * 8 + 3) * 4)
  const got = pixelArt(f, { palette: PAL, dither: 0.4, outline: PAL[0], glow: 0 })
  const want = outline(quantize(alphaCut(f, 0.5), PAL, 0.4), PAL[0])
  assert.deepEqual([...got.data], [...want.data])
})

test('pixelArt glow lights the pixels round a bright one, empty ones too, and leaves dull scenes alone', () => {
  const f = solid(9, 9, (_x, y) => y >= 6, [60, 50, 70])
  f.data.set([255, 240, 180, 255], (3 * 9 + 4) * 4)
  const look = { palette: [], dither: 0, outline: null, glow: 3 }
  const lit = pixelArt(f, look)
  // beside the lamp: empty before, lit now, in the lamp's colour
  const i = (3 * 9 + 5) * 4
  assert.equal(lit.data[i + 3], 255)
  assert.ok(lit.data[i] > lit.data[i + 2])
  // far from it: still empty
  assert.equal(lit.data[(0 * 9 + 0) * 4 + 3], 0)
  // the floor is too dull to glow
  const dull = pixelArt(solid(9, 9, (_x, y) => y >= 6, [60, 50, 70]), look)
  assert.equal(countSolid(dull), 27)
  assert.deepEqual([...dull.data.subarray(8 * 9 * 4, 8 * 9 * 4 + 3)], [60, 50, 70])
})
