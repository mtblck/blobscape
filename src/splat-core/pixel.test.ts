import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alphaCut, autoPalette, downsample, makeFrame, outline, pixelArt, quantize, lookColours, snapColours, removeStrays, countSolid, type Rgb } from './pixel.ts'

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

test('snapColours puts pixels a level or two off back on the palette, and leaves empty ones alone', () => {
  const f = solid(2, 1, (x) => x === 0, [198, 42, 39])
  const look = { palette: PAL, dither: 0, outline: [1, 2, 3] as Rgb, glow: 0 }
  snapColours(f, lookColours(look))
  assert.deepEqual([...f.data], [200, 40, 40, 255, 0, 0, 0, 0])
  assert.equal(lookColours(look).length, 4)
  assert.equal(lookColours({ ...look, palette: [] }).length, 0)
})

test('pixelArt edge lines darken the dark side of a jump in colour, one pixel wide, and nothing else', () => {
  const f = makeFrame(6, 1)
  for (let x = 0; x < 6; x++) f.data.set(x < 3 ? [40, 60, 120, 255] : [230, 220, 200, 255], x * 4)
  const art = pixelArt(f, { palette: [], dither: 0, outline: null, glow: 0, edges: 1 })
  const at = (x: number) => [...art.data.subarray(x * 4, x * 4 + 3)]
  assert.deepEqual(at(1), [40, 60, 120])
  assert.ok(at(2)[2] < 60, `the dark pixel on the edge: ${at(2)}`)
  assert.deepEqual(at(3), [230, 220, 200])
  // close colours make no line
  const g = makeFrame(2, 1)
  g.data.set([40, 60, 120, 255, 48, 66, 126, 255])
  assert.deepEqual([...pixelArt(g, { palette: [], dither: 0, outline: null, glow: 0, edges: 1 }).data], [...g.data])
})

test('pixelArt fills the empty pixels with the sky, top colour to bottom, in palette colours, and leaves the scene and its outline alone', () => {
  const f = makeFrame(5, 16)
  f.data.set([200, 40, 40, 255], (8 * 5 + 2) * 4)
  const sky: [Rgb, Rgb] = [[20, 16, 24], [250, 240, 200]]
  const art = pixelArt(f, { palette: PAL, dither: 0, outline: [1, 2, 3], glow: 0, sky })
  const at = (x: number, y: number) => [...art.data.subarray((y * 5 + x) * 4, (y * 5 + x) * 4 + 4)]
  assert.equal(countSolid(art), 5 * 16)
  assert.deepEqual(at(2, 8), [200, 40, 40, 255])
  assert.deepEqual(at(1, 8), [1, 2, 3, 255])
  // the sky dithers even when the scene doesn't, so both end colours show somewhere and the top is mostly the top colour
  const dark = (y: number) => [0, 1, 2, 3, 4].filter((x) => at(x, y)[0] === 20).length
  assert.ok(dark(0) >= 4 && dark(15) === 0, `${dark(0)} dark at the top, ${dark(15)} at the bottom`)
  // without a sky the same pixels stay clear
  assert.equal(countSolid(pixelArt(f, { palette: PAL, dither: 0, outline: null, glow: 0 })), 1)
})

test('a sky with a reach is all its bottom colour below that share of the picture', () => {
  const f = makeFrame(4, 16)
  const art = pixelArt(f, { palette: PAL, dither: 0, outline: null, glow: 0, sky: [[250, 240, 200], [20, 16, 24], 0.5] })
  const at = (x: number, y: number) => [...art.data.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 3)]
  for (let y = 8; y < 16; y++) for (let x = 0; x < 4; x++) assert.deepEqual(at(x, y), [20, 16, 24])
  assert.ok([0, 1, 2, 3].some((x) => at(x, 0)[0] === 250))
})

test('a sky that stops short ends flat: its dither is gone by the end of the blend, and a bad reach means the whole way', () => {
  // a near neighbour of the bottom colour, which the sky's own dither would flip some pixels to
  const pal: Rgb[] = [[20, 16, 24], [30, 26, 34], [250, 240, 200]]
  const f = makeFrame(8, 32)
  const sky = (reach?: number) => pixelArt(f, { palette: pal, dither: 0, outline: null, glow: 0, sky: [[250, 240, 200], [20, 16, 24], reach] })
  const short = sky(0.5)
  for (let y = 16; y < 32; y++) for (let x = 0; x < 8; x++) assert.deepEqual([...short.data.subarray((y * 8 + x) * 4, (y * 8 + x) * 4 + 3)], [20, 16, 24])
  const whole = sky()
  for (const bad of [0, -1, NaN, 2]) assert.deepEqual(sky(bad).data, whole.data)
})

test('pixelArt with steady keeps a pixel on the colour it had when the other is only a little closer, and lets a clear change through', () => {
  const pal: Rgb[] = [[100, 100, 100], [140, 140, 140], [250, 240, 200]]
  const look = { palette: pal, dither: 0, outline: null, glow: 0, steady: 0.04 }
  // three pixels: just on the light side of the line between the two greys, far on the light side, and empty
  const f = makeFrame(3, 1)
  f.data.set([122, 122, 122, 255, 139, 139, 139, 255, 0, 0, 0, 0])
  const before = makeFrame(3, 1)
  before.data.set([100, 100, 100, 255, 100, 100, 100, 255, 100, 100, 100, 255])
  const px = (a: { data: Uint8ClampedArray }, x: number) => [...a.data.subarray(x * 4, x * 4 + 4)]
  assert.deepEqual(px(pixelArt(f, look), 0), [140, 140, 140, 255], 'with no frame before, the closest colour')
  const art = pixelArt(f, look, before)
  assert.deepEqual(px(art, 0), [100, 100, 100, 255], 'nearly as close: it stays')
  assert.deepEqual(px(art, 1), [140, 140, 140, 255], 'clearly closer: it changes')
  assert.deepEqual(px(art, 2), [0, 0, 0, 0], 'an empty pixel takes nothing from the frame before')
  // off, or a frame before of another size, or a colour before that is not in the palette: as if there were none
  assert.deepEqual(px(pixelArt(f, { ...look, steady: 0 }, before), 0), [140, 140, 140, 255])
  assert.deepEqual(px(pixelArt(f, look, makeFrame(2, 1)), 0), [140, 140, 140, 255])
  before.data.set([101, 100, 100, 255])
  assert.deepEqual(px(pixelArt(f, look, before), 0), [140, 140, 140, 255])
  // the sky is the same every frame: it never takes the colour a pixel had
  const sky = pixelArt(f, { ...look, sky: [[140, 140, 140], [140, 140, 140]] }, before)
  assert.deepEqual(px(sky, 2), [140, 140, 140, 255])
})
