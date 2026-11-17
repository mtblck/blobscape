import { test } from 'node:test'
import assert from 'node:assert/strict'
import { H, W, draw, fence, measure, truthSteps } from './fence.ts'

const blobs = fence()
const at = (distance: number) => ({ distance, real: truthSteps(blobs, distance) })

test('up close every way of drawing agrees: no blink, the right amount of fence', () => {
  const { distance, real } = at(1.5)
  for (const [blur, fade] of [[0, false], [0.55, false], [0.55, true]] as const) {
    const m = measure(blobs, { distance, blur, fade }, real)
    assert.ok(m.flicker < 0.03, `blur ${blur} ${fade}: blink ${m.flicker}`)
    assert.ok(Math.abs(m.weight - 1) < 0.2, `blur ${blur} ${fade}: weight ${m.weight}`)
  }
})

test('far off, sampling each pixel at its middle blinks; the blur stops it but thickens the fence; the fade keeps both right', () => {
  const { distance, real } = at(8)
  const sharp = measure(blobs, { distance, blur: 0, fade: false }, real)
  const blurred = measure(blobs, { distance, blur: 0.55, fade: false }, real)
  const faded = measure(blobs, { distance, blur: 0.55, fade: true }, real)
  // the lesson's goals rest on these lines
  assert.ok(sharp.flicker >= 0.12, `sharp blinks ${sharp.flicker}`)
  assert.ok(blurred.flicker < 0.04, `blurred blinks ${blurred.flicker}`)
  assert.ok(blurred.weight >= 1.8, `blurred weighs ${blurred.weight}`)
  assert.ok(faded.flicker < 0.02 && Math.abs(faded.weight - 1) <= 0.05, `faded: ${JSON.stringify(faded)}`)
})

test('the goals can be met where the lesson says: blink by 6 m with no blur, calm and heavy at 6 m with some', () => {
  const { distance, real } = at(6)
  assert.ok(measure(blobs, { distance, blur: 0, fade: false }, real).flicker >= 0.12)
  const b = measure(blobs, { distance, blur: 0.6, fade: false }, real)
  assert.ok(b.flicker < 0.04 && b.weight >= 1.8, JSON.stringify(b))
  const f = measure(blobs, { distance: 7, blur: 0.6, fade: true }, truthSteps(blobs, 7))
  assert.ok(f.flicker < 0.02 && Math.abs(f.weight - 1) <= 0.05, JSON.stringify(f))
})

test('the truth averages each pixel; one point a pixel is what a renderer does', () => {
  const p = draw(blobs, { distance: 3, dx: 0, blur: 0, fade: false })
  assert.equal(p.rgb.length, W * H * 3)
  assert.ok(p.cover.every((c) => c >= 0 && c <= 1))
  // sliding a whole pixel moves the picture by exactly a pixel
  const q = draw(blobs, { distance: 3, dx: 1, blur: 0, fade: false })
  let worst = 0
  for (let y = 0; y < H; y++) for (let x = 1; x < W; x++) worst = Math.max(worst, Math.abs(q.cover[y * W + x] - p.cover[y * W + x - 1]))
  assert.ok(worst < 1e-5, `shifted by ${worst}`)
})
