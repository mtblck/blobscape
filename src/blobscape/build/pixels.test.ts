import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Frame } from '../../splat-core/pixel.ts'
import { checkScene, compileScene } from '../../splat-engine/sceneDoc.ts'
import { FEW, PALETTES, PIXELS_START, PIXEL_SCENE, changed, colorsIn, lookFor, pixelCode } from './pixels.ts'

const frame = (w: number, h: number, px: [number, number, number, number][]): Frame => ({ width: w, height: h, data: new Uint8ClampedArray(px.flat()) })

test('the scene is sound, and every palette lists its darkest color first for the outline', () => {
  assert.deepEqual(checkScene(PIXEL_SCENE), [])
  const lum = (c: number[]) => c[0] + c[1] + c[2]
  for (const p of PALETTES) assert.ok(p.colors.every((c) => lum(c) >= lum(p.colors[0])), p.id)
  assert.ok(PALETTES.some((p) => p.colors.length <= FEW))
  const look = lookFor(compileScene(PIXEL_SCENE).look, { ...PIXELS_START, palette: 'four', outline: true, steady: true })
  assert.equal(look.palette.length, 4)
  assert.deepEqual(look.outline, look.palette[0])
  assert.ok(look.steady! > 0)
  assert.equal(lookFor(compileScene(PIXEL_SCENE).look, PIXELS_START).steady, 0)
})

test('colors are counted where there is something, and changes as a share of the picture', () => {
  const a = frame(2, 2, [[1, 2, 3, 255], [1, 2, 3, 255], [9, 9, 9, 255], [0, 0, 0, 0]])
  const b = frame(2, 2, [[1, 2, 3, 255], [4, 4, 4, 255], [9, 9, 9, 255], [0, 0, 0, 0]])
  assert.equal(colorsIn(a), 2)
  assert.equal(changed(a, b), 0.25)
  assert.equal(changed(a, a), 0)
  assert.equal(changed(a, frame(1, 1, [[0, 0, 0, 0]])), undefined)
})

test('the code says what the controls chose', () => {
  assert.doesNotMatch(pixelCode(PIXELS_START), /stage\.setPixels\(\{/)
  const on = pixelCode({ ...PIXELS_START, pixels: true, palette: 'four', steady: true, rate: 8, size: 6 })
  assert.match(on, /steady: 0\.04/)
  assert.match(on, /stage\.step = 1 \/ 8/)
  assert.match(on, /\}, 6\)/)
  assert.match(on, /const palette: \[number, number, number\]\[\] = \[\[26, 28, 51\], /)
})
