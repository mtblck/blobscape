import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alphaCut, autoPalette, downsample, makeFrame, outline, pixelArt, quantize, lookColors, snapColors, removeStrays, countSolid, tidyLone, calmArt, calmEdge, lineFix, keptNearest, CALM_MOST, resolveFine, ditherRank, typicalSpacing, surfaceRanks, snapShift, cycleTurns, heatPace, heatShift, HALO_R, HEAT_UP, SELOUT_FROM, oklab, type Rgb, type PixelLook } from './pixel.ts'

const solid = (w: number, h: number, on: (x: number, y: number) => boolean, rgb = [200, 40, 40]) => {
  const f = makeFrame(w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) f.data.set([...rgb, 255], (y * w + x) * 4)
  return f
}

test('downsample averages color by coverage, so a half-covered pixel keeps its color', () => {
  // 2x2 block: two red opaque samples, two empty
  const src = new Uint8Array([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0])
  const f = downsample(src, 2, 2, { premultiplied: false, flipY: false })
  // color stays pure red; coverage is 2 of 4 samples = 510/4, rounded → 128
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

test('quantize snaps to the nearest palette color', () => {
  const f = solid(1, 1, () => true, [250, 10, 10])
  const q = quantize(f, [[0, 0, 0], [255, 0, 0], [0, 0, 255]], 0)
  assert.deepEqual([...q.data.slice(0, 3)], [255, 0, 0])
})

test('autoPalette finds the two colors of a two-color image', () => {
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

test('outline rings the silhouette with 4-neighbors', () => {
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
  // beside the lamp: empty before, lit now, in the lamp's color
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

test('snapColors puts pixels a level or two off back on the palette, and leaves empty ones alone', () => {
  const f = solid(2, 1, (x) => x === 0, [198, 42, 39])
  const look = { palette: PAL, dither: 0, outline: [1, 2, 3] as Rgb, glow: 0 }
  snapColors(f, lookColors(look))
  assert.deepEqual([...f.data], [200, 40, 40, 255, 0, 0, 0, 0])
  assert.equal(lookColors(look).length, 4)
  assert.equal(lookColors({ ...look, palette: [] }).length, 0)
})

test('pixelArt edge lines darken the dark side of a jump in color, one pixel wide, and nothing else', () => {
  const f = makeFrame(6, 1)
  for (let x = 0; x < 6; x++) f.data.set(x < 3 ? [40, 60, 120, 255] : [230, 220, 200, 255], x * 4)
  const art = pixelArt(f, { palette: [], dither: 0, outline: null, glow: 0, edges: 1 })
  const at = (x: number) => [...art.data.subarray(x * 4, x * 4 + 3)]
  assert.deepEqual(at(1), [40, 60, 120])
  assert.ok(at(2)[2] < 60, `the dark pixel on the edge: ${at(2)}`)
  assert.deepEqual(at(3), [230, 220, 200])
  // close colors make no line
  const g = makeFrame(2, 1)
  g.data.set([40, 60, 120, 255, 48, 66, 126, 255])
  assert.deepEqual([...pixelArt(g, { palette: [], dither: 0, outline: null, glow: 0, edges: 1 }).data], [...g.data])
})

test('pixelArt fills the empty pixels with the sky, top color to bottom, in palette colors, and leaves the scene and its outline alone', () => {
  const f = makeFrame(5, 16)
  f.data.set([200, 40, 40, 255], (8 * 5 + 2) * 4)
  const sky: [Rgb, Rgb] = [[20, 16, 24], [250, 240, 200]]
  const art = pixelArt(f, { palette: PAL, dither: 0, outline: [1, 2, 3], glow: 0, sky })
  const at = (x: number, y: number) => [...art.data.subarray((y * 5 + x) * 4, (y * 5 + x) * 4 + 4)]
  assert.equal(countSolid(art), 5 * 16)
  assert.deepEqual(at(2, 8), [200, 40, 40, 255])
  assert.deepEqual(at(1, 8), [1, 2, 3, 255])
  // the sky dithers even when the scene doesn't, so both end colors show somewhere and the top is mostly the top color
  const dark = (y: number) => [0, 1, 2, 3, 4].filter((x) => at(x, y)[0] === 20).length
  assert.ok(dark(0) >= 4 && dark(15) === 0, `${dark(0)} dark at the top, ${dark(15)} at the bottom`)
  // without a sky the same pixels stay clear
  assert.equal(countSolid(pixelArt(f, { palette: PAL, dither: 0, outline: null, glow: 0 })), 1)
})

test('a sky with a reach is all its bottom color below that share of the picture', () => {
  const f = makeFrame(4, 16)
  const art = pixelArt(f, { palette: PAL, dither: 0, outline: null, glow: 0, sky: [[250, 240, 200], [20, 16, 24], 0.5] })
  const at = (x: number, y: number) => [...art.data.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 3)]
  for (let y = 8; y < 16; y++) for (let x = 0; x < 4; x++) assert.deepEqual(at(x, y), [20, 16, 24])
  assert.ok([0, 1, 2, 3].some((x) => at(x, 0)[0] === 250))
})

test('a sky that stops short ends flat: its dither is gone by the end of the blend, and a bad reach means the whole way', () => {
  // a near neighbor of the bottom color, which the sky's own dither would flip some pixels to
  const pal: Rgb[] = [[20, 16, 24], [30, 26, 34], [250, 240, 200]]
  const f = makeFrame(8, 32)
  const sky = (reach?: number) => pixelArt(f, { palette: pal, dither: 0, outline: null, glow: 0, sky: [[250, 240, 200], [20, 16, 24], reach] })
  const short = sky(0.5)
  for (let y = 16; y < 32; y++) for (let x = 0; x < 8; x++) assert.deepEqual([...short.data.subarray((y * 8 + x) * 4, (y * 8 + x) * 4 + 3)], [20, 16, 24])
  const whole = sky()
  for (const bad of [0, -1, NaN, 2]) assert.deepEqual(sky(bad).data, whole.data)
})

test('pixelArt with steady keeps a pixel on the color it had when the other is only a little closer, and lets a clear change through', () => {
  const pal: Rgb[] = [[100, 100, 100], [140, 140, 140], [250, 240, 200]]
  const look = { palette: pal, dither: 0, outline: null, glow: 0, steady: 0.04 }
  // three pixels: just on the light side of the line between the two grays, far on the light side, and empty
  const f = makeFrame(3, 1)
  f.data.set([122, 122, 122, 255, 139, 139, 139, 255, 0, 0, 0, 0])
  const before = makeFrame(3, 1)
  before.data.set([100, 100, 100, 255, 100, 100, 100, 255, 100, 100, 100, 255])
  const px = (a: { data: Uint8ClampedArray }, x: number) => [...a.data.subarray(x * 4, x * 4 + 4)]
  assert.deepEqual(px(pixelArt(f, look), 0), [140, 140, 140, 255], 'with no frame before, the closest color')
  const art = pixelArt(f, look, before)
  assert.deepEqual(px(art, 0), [100, 100, 100, 255], 'nearly as close: it stays')
  assert.deepEqual(px(art, 1), [140, 140, 140, 255], 'clearly closer: it changes')
  assert.deepEqual(px(art, 2), [0, 0, 0, 0], 'an empty pixel takes nothing from the frame before')
  // off, or a frame before of another size, or a color before that is not in the palette: as if there were none
  assert.deepEqual(px(pixelArt(f, { ...look, steady: 0 }, before), 0), [140, 140, 140, 255])
  assert.deepEqual(px(pixelArt(f, look, makeFrame(2, 1)), 0), [140, 140, 140, 255])
  before.data.set([101, 100, 100, 255])
  assert.deepEqual(px(pixelArt(f, look, before), 0), [140, 140, 140, 255])
  // the sky is the same every frame: it never takes the color a pixel had
  const sky = pixelArt(f, { ...look, sky: [[140, 140, 140], [140, 140, 140]] }, before)
  assert.deepEqual(px(sky, 2), [140, 140, 140, 255])
})

test('pixelArt with parts draws a line where one part meets another of the same color, on one side only, and none without the map', () => {
  // one flat color, left half one part and right half another
  const f = solid(6, 3, () => true, [120, 90, 60])
  const map = makeFrame(6, 3)
  for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) map.data.set([x < 3 ? 1 : 2, 0, 1, 255], (y * 6 + x) * 4)
  const look = { palette: [], dither: 0, outline: null, glow: 0, edges: 1, parts: true }
  const art = pixelArt(f, look, undefined, map)
  const dark = (a: { data: Uint8ClampedArray }) => [0, 1, 2, 3, 4, 5].map((x) => a.data[(6 + x) * 4] < 120)
  assert.deepEqual(dark(art), [false, false, true, false, false, false], 'the lower-numbered part carries the line, one pixel wide')
  assert.deepEqual(dark(pixelArt(f, look)), [false, false, false, false, false, false], 'no map, no line')
  assert.deepEqual(dark(pixelArt(f, { ...look, parts: false }, undefined, map)), [false, false, false, false, false, false], 'switched off, no line')
  // a much lighter part beside a darker one: the color line on the darker side is the only line, whatever the parts' numbers
  const g = solid(6, 3, () => true, [120, 90, 60])
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) g.data.set([235, 205, 150, 255], (y * 6 + x) * 4)
  const lit = pixelArt(g, look, undefined, map)
  assert.equal(lit.data[(6 + 2) * 4], 235, 'the lighter side is left alone')
  assert.ok(lit.data[(6 + 3) * 4] < 120, 'the darker side takes the line')
  // and with color lines off, parts that far apart in color need no line of their own; parts of one color still get theirs
  const only = { ...look, edges: 0 }
  assert.equal(pixelArt(g, only, undefined, map).data[(6 + 3) * 4], 120)
  assert.deepEqual(dark(pixelArt(f, only, undefined, map)), [false, false, true, false, false, false])
  // where the map has nothing (alpha 0), there is no part to end
  for (let y = 0; y < 3; y++) map.data[(y * 6 + 3) * 4 + 3] = 0
  assert.deepEqual(dark(pixelArt(f, look, undefined, map)), [false, false, false, false, false, false])
})

test('tidyLone: a stray in a flat patch takes its neighbors\' color; dither, edges, other parts and empty pixels stay', () => {
  const w = 12, h = 6
  const solid = makeFrame(w, h)
  for (let i = 0; i < w * h; i++) solid.data[i * 4 + 3] = 255
  const art = makeFrame(w, h)
  const put = (x: number, y: number, c: Rgb) => { const i = (y * w + x) * 4; art.data[i] = c[0]; art.data[i + 1] = c[1]; art.data[i + 2] = c[2]; art.data[i + 3] = 255 }
  const A: Rgb = [200, 100, 50], B: Rgb = [20, 40, 60]
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, x < 6 ? A : (x + y) % 2 ? A : B)
  put(2, 2, B) // a stray in the flat half
  put(3, 4, B); put(4, 4, B) // a pair: not lone
  const got = (f: ReturnType<typeof makeFrame>, x: number, y: number) => Array.from(f.data.slice((y * w + x) * 4, (y * w + x) * 4 + 3))
  const out = tidyLone(art, solid)
  assert.deepEqual(got(out, 2, 2), A)
  assert.deepEqual(got(out, 3, 4), B)
  // the checkerboard half is untouched
  for (let y = 0; y < h; y++) for (let x = 7; x < w; x++) assert.deepEqual(got(out, x, y), got(art, x, y))
  // with a map of parts: the stray is a part of its own (an eye, a speck), so it stays
  const map = makeFrame(w, h)
  for (let i = 0; i < w * h; i++) { map.data[i * 4] = 1; map.data[i * 4 + 3] = 255 }
  map.data[(2 * w + 2) * 4] = 2
  assert.deepEqual(got(tidyLone(art, solid, map.data), 2, 2), B)
  // an empty pixel (sky) is never touched
  solid.data[(2 * w + 2) * 4 + 3] = 0
  assert.deepEqual(got(tidyLone(art, solid), 2, 2), B)
})

test('calmArt: a pixel takes a color most of its own part share; specks, line tips, gaps and other parts stay', () => {
  const w = 9, h = 9
  const solid = makeFrame(w, h), art = makeFrame(w, h)
  const A: Rgb = [200, 100, 50], B: Rgb = [20, 40, 60], C: Rgb = [90, 200, 90]
  const put = (x: number, y: number, c: Rgb) => { const i = (y * w + x) * 4; art.data[i] = c[0]; art.data[i + 1] = c[1]; art.data[i + 2] = c[2]; art.data[i + 3] = 255; solid.data[i + 3] = 255 }
  const got = (f: ReturnType<typeof makeFrame>, x: number, y: number) => Array.from(f.data.slice((y * w + x) * 4, (y * w + x) * 4 + 3))
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, B)
  // a pixel of A among B with one A beside it: five or more neighbors share B and fewer share A
  put(4, 4, A); put(5, 4, A); put(3, 3, A)
  assert.ok(CALM_MOST === 5)
  assert.deepEqual(got(calmArt(art, solid), 4, 4), B)
  // a checkerboard keeps its pixels: four neighbors share each color
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, (x + y) % 2 ? A : C)
  const board = calmArt(art, solid)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) assert.deepEqual(got(board, x, y), got(art, x, y))
  // with a map of parts, neighbors of another part do not count
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, B)
  put(4, 4, A)
  const map = makeFrame(w, h)
  for (let i = 0; i < w * h; i++) { map.data[i * 4] = 1; map.data[i * 4 + 3] = 255 }
  for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) map.data[(y * w + x) * 4] = x === 4 && y === 4 ? 2 : 3
  assert.deepEqual(got(calmArt(art, solid, map.data), 4, 4), A)
})

test('calmEdge: a bump on a wall is taken off and a notch filled; a speck, a line tip and a gap a pixel wide stay', () => {
  const w = 9, h = 9
  const on = new Set<string>()
  const solid = (x: number, y: number) => on.has(`${x},${y}`)
  const wall = () => { on.clear(); for (let y = 5; y < h; y++) for (let x = 0; x < w; x++) on.add(`${x},${y}`) }
  // a bump on top of the wall takes the backdrop above it (N8 index 3, above)
  wall(); on.add('4,4')
  assert.equal(calmEdge(4, 4, w, h, solid), 3)
  // a notch in the wall's top takes the wall below it (index 2)
  wall(); on.delete('4,5')
  assert.equal(calmEdge(4, 5, w, h, solid), 2)
  // a lone speck (a star) stays
  on.clear(); on.add('4,4')
  assert.equal(calmEdge(4, 4, w, h, solid), -1)
  // the tip of a line a pixel wide stays
  on.clear(); for (let y = 2; y < 7; y++) on.add(`4,${y}`)
  assert.equal(calmEdge(4, 2, w, h, solid), -1)
  // a gap a pixel wide between two blocks stays
  on.clear(); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x !== 4) on.add(`${x},${y}`)
  on.add('4,8')
  assert.equal(calmEdge(4, 7, w, h, solid), -1)
  // a hole is filled
  on.clear(); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x !== 4 || y !== 4) on.add(`${x},${y}`)
  assert.ok(calmEdge(4, 4, w, h, solid) >= 0)
})

test('pixelArt with calm: the outline follows a silhouette with its bump taken off', () => {
  const w = 9, h = 9
  const f = makeFrame(w, h)
  const fill = (x: number, y: number) => { const i = (y * w + x) * 4; f.data[i] = 200; f.data[i + 1] = 100; f.data[i + 2] = 50; f.data[i + 3] = 255 }
  for (let y = 5; y < h; y++) for (let x = 0; x < w; x++) fill(x, y)
  fill(4, 4)
  const line: Rgb = [0, 0, 0]
  const look: PixelLook = { palette: [], dither: 0, outline: line, glow: 0, calm: true }
  const art = pixelArt(f, look)
  const at = (x: number, y: number) => Array.from(art.data.slice((y * w + x) * 4, (y * w + x) * 4 + 4))
  // the bump is now the line, and above it is clear, so the line runs flat along the wall's top
  for (let x = 0; x < w; x++) assert.deepEqual(at(x, 4), [0, 0, 0, 255], `x ${x}`)
  assert.equal(at(4, 3)[3], 0)
})

test('resolveFine: a pixel is scene with two samples or more, shows the part most samples show, and takes one of its samples whole', () => {
  // one art pixel a case, side by side: 2 samples down, 2 across each
  const cases = 6
  const fine = makeFrame(cases * 2, 2), map = makeFrame(cases * 2, 2)
  const put = (c: number, k: number, rgb: Rgb | null, part = 0) => {
    const i = ((k >> 1) * cases * 2 + c * 2 + (k & 1)) * 4
    if (rgb) fine.data.set([...rgb, 255], i)
    if (part) map.data.set([part, 0, 0, 255], i)
  }
  const R: Rgb = [200, 40, 40], B: Rgb = [40, 40, 200]
  // 0: one sample only: empty
  put(0, 0, R, 1)
  // 1: two samples: scene
  put(1, 0, R, 1); put(1, 3, R, 1)
  // 2: three of part 2, one of part 1: part 2 wins, and no red gets in
  put(2, 0, R, 1); put(2, 1, B, 2); put(2, 2, B, 2); put(2, 3, B, 2)
  // 3: two of each: the lower-numbered part
  put(3, 0, B, 2); put(3, 1, B, 2); put(3, 2, R, 1); put(3, 3, R, 1)
  // 4: one part, three shades: the one nearest their average, not the average itself
  put(4, 0, [10, 10, 10], 3); put(4, 1, [100, 100, 100], 3); put(4, 2, [110, 110, 110], 3); put(4, 3, [250, 250, 250], 3)
  // 5: no part under any sample (a mesh): still settled, and the map stays empty there
  put(5, 0, R); put(5, 1, R); put(5, 2, B)
  const { small, parts } = resolveFine(fine, map)
  assert.equal(small.width, cases); assert.equal(small.height, 1)
  const px = (f: { data: Uint8ClampedArray }, c: number) => Array.from(f.data.slice(c * 4, c * 4 + 4))
  assert.deepEqual(px(small, 0), [0, 0, 0, 0])
  assert.deepEqual(px(small, 1), [...R, 255])
  assert.deepEqual(px(small, 2), [...B, 255]); assert.deepEqual(px(parts!, 2), [2, 0, 0, 255])
  assert.deepEqual(px(small, 3), [...R, 255]); assert.deepEqual(px(parts!, 3), [1, 0, 0, 255])
  assert.deepEqual(px(small, 4), [110, 110, 110, 255])
  assert.deepEqual(px(small, 5), [...R, 255]); assert.deepEqual(px(parts!, 5), [0, 0, 0, 0])
  // without a map, every sample counts as one thing
  assert.deepEqual(px(resolveFine(fine).small, 2), [...B, 255])
  assert.equal(resolveFine(fine).parts, undefined)
})

test('pixelArt with own draws the outline in a darker palette step of the thing beside it, and in the outline color where there is none', () => {
  const pal: Rgb[] = [[12, 10, 20], [70, 30, 30], [200, 60, 50], [30, 50, 110], [90, 140, 230]]
  // a red thing on the left, a blue one on the right, a gap between
  const f = makeFrame(9, 3)
  const put = (x: number, c: Rgb) => f.data.set([...c, 255], (1 * 9 + x) * 4)
  put(1, pal[2]); put(2, pal[2]); put(6, pal[4]); put(7, pal[4])
  const look = { palette: pal, dither: 0, outline: pal[0], glow: 0, own: true }
  const art = pixelArt(f, look)
  const px = (x: number, y: number) => Array.from(art.data.slice((y * 9 + x) * 4, (y * 9 + x) * 4 + 3))
  assert.deepEqual(px(1, 0), pal[1], 'over the red thing: dark red')
  assert.deepEqual(px(0, 1), pal[1])
  assert.deepEqual(px(6, 2), pal[3], 'under the blue thing: dark blue')
  assert.deepEqual(px(8, 1), pal[3])
  assert.deepEqual(px(1, 1), pal[2], 'the things keep their colors')
  assert.equal(art.data[(1 * 9 + 4) * 4 + 3], 0, 'and the gap stays empty')
  // a thing already in the darkest color has no darker step: the outline color
  const g = makeFrame(3, 3)
  g.data.set([...pal[1], 255], (1 * 3 + 1) * 4)
  const lone = pixelArt(g, { ...look, outline: [1, 2, 3] })
  assert.deepEqual(Array.from(lone.data.slice(1 * 4, 1 * 4 + 3)), pal[0])
  const dark = makeFrame(3, 3)
  dark.data.set([...pal[0], 255], (1 * 3 + 1) * 4)
  assert.deepEqual(Array.from(pixelArt(dark, { ...look, outline: [1, 2, 3] }).data.slice(1 * 4, 1 * 4 + 3)), [1, 2, 3])
  // with no palette: the neighbor's color, darkened
  const free = pixelArt(f, { ...look, palette: [] })
  assert.deepEqual(Array.from(free.data.slice(0, 3)), [0, 0, 0])
  assert.deepEqual(Array.from(free.data.slice((1 * 9 + 0) * 4, (1 * 9 + 0) * 4 + 3)), pal[2].map((v) => Math.round(v * 0.38)))
})

test('surface dither: a blob keeps its step wherever it lands, and a face runs through the whole pattern', () => {
  // a face of blobs on a grid 0.1 apart, in each of the three ways a face can lie
  for (const axis of [0, 1, 2]) {
    const seen = new Set<number>()
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
      const p = [0.05, 0.05, 0.05]
      p[(axis + 1) % 3] += a * 0.1; p[(axis + 2) % 3] += b * 0.1
      seen.add(ditherRank(p[0], p[1], p[2], 0.1))
    }
    assert.equal(seen.size, 16, `a face across axis ${axis} uses every step`)
  }
  // the step depends on the blob's rest place alone, so moving the picture leaves it
  assert.equal(ditherRank(0.31, 0.72, -0.4, 0.1), ditherRank(0.31, 0.72, -0.4, 0.1))
})

test('typicalSpacing finds a grid\'s spacing, and surfaceRanks gives a step a blob', () => {
  const n = 20 * 20
  const center = new Float32Array(n * 3), scale = new Float32Array(n * 3).fill(0.04)
  for (let i = 0; i < n; i++) { center[i * 3] = (i % 20) * 0.08; center[i * 3 + 2] = Math.floor(i / 20) * 0.08 }
  const blobs = { count: n, center, scale }
  assert.ok(Math.abs(typicalSpacing(blobs) - 0.08) < 1e-6)
  const ranks = surfaceRanks(blobs)
  assert.equal(ranks.length, n)
  assert.equal(new Set(ranks).size, 16)
})

test('pixelArt with surface dither reads each pixel\'s step from the map, and the sky keeps the screen\'s', () => {
  const pal: Rgb[] = [[0, 0, 0], [120, 120, 120], [240, 240, 240]]
  const f = solid(4, 4, () => true, [60, 60, 60])
  const look: PixelLook = { palette: pal, dither: 1, outline: null, glow: 0, surface: true }
  const steps = (step: number) => ({ width: 4, height: 4, data: new Uint8ClampedArray(64).map((_, i) => (i % 4 === 3 ? 255 : i % 4 === 0 ? step : 0)) })
  // every pixel on one step: one color for the whole face, darker at a low step than at a high one
  const low = pixelArt(f, look, undefined, undefined, steps(0)), high = pixelArt(f, look, undefined, undefined, steps(15))
  assert.equal(new Set(Array.from({ length: 16 }, (_, i) => low.data[i * 4])).size, 1)
  assert.ok(low.data[0] < high.data[0])
  // without the map, the screen's pattern as before
  assert.deepEqual([...pixelArt(f, look).data], [...pixelArt(f, { ...look, surface: false }).data])
})

test('snapShift lands a point on the edge of a whole art pixel', () => {
  for (const ndc of [-0.73, 0.001, 0.5, 0.91]) {
    const px = ((ndc + snapShift(ndc, 160)) * 0.5 + 0.5) * 160
    assert.ok(Math.abs(px - Math.round(px)) < 1e-9)
    assert.ok(Math.abs(snapShift(ndc, 160)) <= 1 / 160 + 1e-12)
  }
})

// art-pixel effects (after Ink Studio's): glow in rings, heat haze, color cycling, softer outlines on lit sides

/** A dark floor with one white-hot pixel at `(lx, ly)`. */
const lamp = (w: number, h: number, lx: number, ly: number) => {
  const f = solid(w, h, () => true, [30, 30, 40])
  f.data.set([255, 255, 255, 255], (ly * w + lx) * 4)
  return f
}
const rgbAt = (f: { width: number; data: Uint8ClampedArray }, x: number, y: number) => Array.from(f.data.slice((y * f.width + x) * 4, (y * f.width + x) * 4 + 3))

test('glow in rings lights the pixels round a lamp in flat bands, nearer brighter, and none past its reach', () => {
  const f = lamp(11, 11, 5, 5)
  const look: PixelLook = { palette: [], dither: 0, outline: null, glow: 1, bands: 2 }
  const art = pixelArt(f, look)
  const at = (d: number) => rgbAt(art, 5 + d, 5)[0]
  assert.equal(at(1), at(2), 'one band holds one value')
  assert.ok(at(1) > at(3) && at(3) > 30, `the far ring is dimmer but lit: ${[at(1), at(2), at(3)]}`)
  assert.equal(at(HALO_R + 1), 30, 'nothing past the reach')
  // the soft spill gives a different falloff: the rings are a look of their own
  const soft = pixelArt(f, { ...look, bands: 0 })
  assert.notEqual(rgbAt(soft, 7, 5)[0], at(2))
})

test('heat haze moves pixels only above something glowing, and the same frame and time give the same picture', () => {
  // vertical stripes, so a sideways shift shows; the lamp near the bottom
  const f = solid(16, 16, () => true, [30, 30, 40])
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x += 2) f.data.set([90, 60, 50, 255], (y * 16 + x) * 4)
  f.data.set([255, 255, 255, 255], (13 * 16 + 8) * 4)
  const look: PixelLook = { palette: [], dither: 0, outline: null, glow: 0, heat: { pixels: 1, pace: 8 } }
  const plain = pixelArt(f, { ...look, heat: undefined })
  let moved = 0, outside = 0
  for (const t of [0, 0.125, 0.25, 0.375]) {
    const art = pixelArt(f, look, undefined, undefined, undefined, t)
    assert.deepEqual([...art.data], [...pixelArt(f, look, undefined, undefined, undefined, t).data])
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (rgbAt(art, x, y).join() === rgbAt(plain, x, y).join()) continue
      const above = 13 - y >= HEAT_UP - 3 && 13 - y <= HEAT_UP + 3 && Math.abs(x - 8) <= 3
      if (above) moved++
      else outside++
    }
  }
  assert.ok(moved > 10, `the air above the lamp shimmers: ${moved}`)
  assert.equal(outside, 0)
  assert.equal(rgbAt(pixelArt(f, look, undefined, undefined, undefined, 0.3), 8, 13).join(), '255,255,255', 'the lamp itself holds still')
  // the waves are whole pixels, at most `pixels`, and change with the step
  const shifts = new Set(Array.from({ length: 16 }, (_, t) => heatShift(3, 4, t, 2)))
  assert.deepEqual([...shifts].sort(), [-2, 0, 2])
})

test('heat haze and color cycling fit a whole number of steps into a loop, so an export joins', () => {
  for (const loop of [6, 8, 9.5, 12, 16]) assert.ok(Math.abs(heatPace(loop) * loop - Math.round(heatPace(loop) * loop)) < 1e-9)
})

test('color cycling steps scene pixels of a cycle round its list and leaves other colors and the sky alone', () => {
  const pal: Rgb[] = [[20, 20, 30], [40, 90, 200], [80, 140, 230], [150, 200, 250], [200, 60, 40]]
  const look: PixelLook = { palette: pal, dither: 0, outline: null, glow: 0, sky: [[20, 20, 30], [40, 90, 200]], cycle: [{ colors: [[40, 90, 200], [80, 140, 230], [150, 200, 250]], pace: 2 }] }
  const f = makeFrame(3, 2)
  f.data.set([40, 90, 200, 255, 150, 200, 250, 255, 200, 60, 40, 255], 0)
  const at = (t: number) => pixelArt(f, look, undefined, undefined, undefined, t)
  assert.deepEqual(rgbAt(at(0), 0, 0), [40, 90, 200])
  assert.deepEqual(rgbAt(at(0.5), 0, 0), [80, 140, 230], 'one step on')
  assert.deepEqual(rgbAt(at(0.5), 1, 0), [40, 90, 200], 'the last wraps to the first')
  assert.deepEqual(rgbAt(at(1.5), 0, 0), [40, 90, 200], 'three steps round')
  assert.deepEqual(rgbAt(at(0.5), 2, 0), [200, 60, 40], 'a color not in the cycle stays')
  assert.deepEqual(rgbAt(at(0.5), 0, 1), rgbAt(at(0), 0, 1), 'the sky does not cycle')
  // colors are matched to the palette, so a visitor's own palette still cycles; one that has a single match does not
  const { member } = cycleTurns({ ...look, cycle: [{ colors: [[41, 91, 199], [79, 139, 231]], pace: 1 }] }, 0)
  assert.deepEqual([...member], [0, 1, 1, 0, 0])
  assert.deepEqual([...cycleTurns({ ...look, cycle: [{ colors: [[41, 91, 199], [40, 90, 200]], pace: 1 }] }, 3).member], [0, 0, 0, 0, 0])
})

test('steady pixels leave cycling colors free to move', () => {
  const pal: Rgb[] = [[40, 90, 200], [80, 140, 230]]
  const look: PixelLook = { palette: pal, dither: 0, outline: null, glow: 0, steady: 1, cycle: [{ colors: pal, pace: 1 }] }
  const f = solid(1, 1, () => true, [40, 90, 200])
  const before = pixelArt(f, look, undefined, undefined, undefined, 0)
  assert.deepEqual(rgbAt(pixelArt(f, look, before, undefined, undefined, 1), 0, 0), [80, 140, 230])
})

test('a softer outline on lit sides: beside something light the line is a shade of it, beside something dark it stays', () => {
  const pal: Rgb[] = [[10, 10, 20], [60, 50, 40], [200, 180, 120], [240, 220, 160]]
  const f = makeFrame(4, 1)
  f.data.set([240, 220, 160, 255], 1 * 4)
  f.data.set([60, 50, 40, 255], 2 * 4)
  assert.ok(oklab(240, 220, 160)[0] >= SELOUT_FROM && oklab(60, 50, 40)[0] < SELOUT_FROM)
  const look: PixelLook = { palette: pal, dither: 0, outline: pal[0], glow: 0, selout: true }
  const art = pixelArt(f, look)
  assert.deepEqual(rgbAt(art, 0, 0), [200, 180, 120], 'lit side: a shade under the light thing')
  assert.deepEqual(rgbAt(art, 3, 0), [10, 10, 20], 'shaded side: the outline')
  assert.deepEqual(rgbAt(pixelArt(f, { ...look, selout: false }), 0, 0), [10, 10, 20])
})

test('lineFix: a one-pixel kink in a straight edge is taken off, a doubled corner of a dark line goes, the rest stays', () => {
  const paint = (rows: string[]) => {
    const f = makeFrame(rows[0].length, rows.length)
    const colors: Record<string, number[]> = { A: [240, 230, 200], B: [40, 30, 60], C: [200, 120, 60] }
    rows.forEach((row, y) => [...row].forEach((ch, x) => { const i = (y * f.width + x) * 4; f.data.set([...colors[ch], 255], i) }))
    return f
  }
  const color = (f: ReturnType<typeof makeFrame>, at: number) => Array.from(f.data.slice(at, at + 3))
  // a straight edge between two colors with one pixel of the lower one poking up into the upper
  const kink = paint(['AAAAAAA', 'AAAAAAA', 'AAACAAA', 'CCCCCCC', 'CCCCCCC'])
  assert.deepEqual(color(kink, lineFix(kink, 3, 2)), [240, 230, 200])
  assert.equal(lineFix(kink, 2, 3), -1)
  // a dark line one pixel thick that turns a corner: the pixel in the corner is the double, and the line meets corner to corner
  const double = paint(['AABAAAA', 'AABAAAA', 'AABAAAA', 'AABBBBB', 'AAAAAAA'])
  const fixes: number[][] = []
  for (let y = 0; y < 5; y++) for (let x = 0; x < 7; x++) if (lineFix(double, x, y) >= 0) fixes.push([x, y])
  assert.deepEqual(fixes, [[2, 3]])
  assert.deepEqual(color(double, lineFix(double, 2, 3)), [240, 230, 200])
  // a plain straight line and a checkerboard are left alone
  const line = paint(['AAAAA', 'BBBBB', 'AAAAA'])
  for (let x = 0; x < 5; x++) assert.equal(lineFix(line, x, 1), -1)
  const checks = paint(['ACACA', 'CACAC', 'ACACA', 'CACAC'])
  for (let y = 1; y < 3; y++) for (let x = 1; x < 4; x++) assert.equal(lineFix(checks, x, y), -1)
})

test('pixelArt flat: surfaces are drawn without dither while the sky keeps it', () => {
  const w = 16, h = 16
  const f = makeFrame(w, h)
  // a scene of one color halfway between two palette colors on the lower half, empty sky above
  for (let y = 8; y < h; y++) for (let x = 0; x < w; x++) f.data.set([110, 28, 32, 255], (y * w + x) * 4)
  const look: PixelLook = { palette: PAL, dither: 1, outline: null, glow: 0, sky: [[20, 16, 24], [250, 240, 200]] }
  const colorsIn = (a: ReturnType<typeof makeFrame>, y0: number, y1: number) => { const s = new Set<string>(); for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) s.add(Array.from(a.data.slice((y * w + x) * 4, (y * w + x) * 4 + 3)).join()); return s.size }
  const dithered = pixelArt(f, look), flat = pixelArt(f, { ...look, flat: true })
  assert.ok(colorsIn(dithered, 9, h) > 1)
  assert.equal(colorsIn(flat, 9, h), 1)
  assert.ok(colorsIn(flat, 0, 7) > 1, 'the sky is still dithered')
})

test('keptNearest: a glow on gray stone snaps to stone or the light, never to the green between them', () => {
  const pal = ([[59, 56, 72], [107, 100, 116], [255, 243, 176], [255, 209, 102], [63, 122, 69], [107, 74, 53]] as Rgb[]).map((c) => oklab(...c))
  const own = oklab(59, 56, 72), light = oklab(255, 230, 120)
  // the mix of the two, which plain nearest takes to the green
  const mix = oklab(110, 112, 80)
  const plain = pal.reduce((b, p, k) => (Math.hypot(...p.map((v, j) => v - mix[j])) < Math.hypot(...pal[b].map((v, j) => v - mix[j])) ? k : b), 0)
  assert.equal(plain, 4)
  const kept = keptNearest(mix, pal, own, light)
  assert.ok([0, 1, 2, 3].includes(kept), String(kept))
})
