import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ANAGLYPH_MIXES, EYE_MIX, EYE_SHARE, eyeX, eyesFor, mixEyes } from './anaglyph.ts'

// a three.js perspective projection, 35° tall, 4:3, near 0.05, far 100 (column-major)
function projection(fov = 35, aspect = 4 / 3, near = 0.05, far = 100): number[] {
  const f = 1 / Math.tan((fov * Math.PI) / 360)
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, -(far + near) / (far - near), -1, 0, 0, (-2 * far * near) / (far - near), 0]
}
const P = projection()

test('the eyes stand a thirtieth of the distance apart, and the screen is where the view looks, unless it is pushed back', () => {
  const e = eyesFor(6, {})
  assert.ok(Math.abs(e.half * 2 - 6 * EYE_SHARE) < 1e-12)
  assert.equal(e.screen, 6)
  assert.equal(eyesFor(6, { depth: 0 }).half, 0)
  assert.ok(Math.abs(eyesFor(6, { depth: 2 }).half - 2 * e.half) < 1e-12)
  assert.equal(eyesFor(6, { pop: 0.5 }).screen, 9)
})

test('a thing at the screen lands in the same place for both eyes, wherever it is across the picture', () => {
  const { half, screen } = eyesFor(5, { pop: 0.3 })
  for (const x of [-1.2, 0, 0.7]) for (const y of [-0.5, 0.4]) {
    const at = [x, y, -screen] as const
    assert.ok(Math.abs(eyeX(P, -half, screen, at) - eyeX(P, half, screen, at)) < 1e-9, `${x},${y}`)
  }
})

test('nearer than the screen the eyes cross (it comes out), farther they part (it goes in), and more depth means more', () => {
  const { half, screen } = eyesFor(5, {})
  const apart = (z: number, h = half) => eyeX(P, h, screen, [0, 0, -z]) - eyeX(P, -h, screen, [0, 0, -z])
  // the right eye sees a near thing more to the left than the left eye does
  assert.ok(apart(3) < 0)
  assert.ok(apart(9) > 0)
  assert.ok(Math.abs(apart(5)) < 1e-12)
  assert.ok(apart(3, half * 2) < apart(3))
  // what the view looks at stays in the middle: the eyes' two pictures straddle it evenly
  const l = eyeX(P, -half, screen, [0, 0, -3]), r = eyeX(P, half, screen, [0, 0, -3])
  assert.ok(Math.abs(l + r) < 1e-12)
})

test('mixing: the left eye only ever reaches red, the right only green and blue, except in the optimized mix', () => {
  const left = [0.8, 0.3, 0.1] as const, right = [0.2, 0.6, 0.9] as const
  for (const mix of ['color', 'half', 'gray'] as const) {
    const onlyLeft = mixEyes(left, [0, 0, 0], mix), onlyRight = mixEyes([0, 0, 0], right, mix)
    assert.equal(onlyLeft[1], 0, mix)
    assert.equal(onlyLeft[2], 0, mix)
    assert.equal(onlyRight[0], 0, mix)
  }
  assert.deepEqual(mixEyes(left, right, 'color'), [0.8, 0.6, 0.9])
  // gray gives each lens its eye's lightness, so a scene seen the same by both eyes comes out gray-cyan balanced
  const g = mixEyes([0.5, 0.5, 0.5], [0.5, 0.5, 0.5], 'gray')
  assert.ok(Math.abs(g[0] - 0.5) < 1e-9 && Math.abs(g[1] - 0.5) < 1e-9 && Math.abs(g[2] - 0.5) < 1e-9)
})

test('the optimized mix keeps white white and black black, and stays in range', () => {
  const w = mixEyes([1, 1, 1], [1, 1, 1], 'optimized')
  for (const v of w) assert.ok(v > 0.9, `${w}`)
  assert.deepEqual(mixEyes([0, 0, 0], [0, 0, 0], 'optimized'), [0, 0, 0])
  for (let i = 0; i < 50; i++) {
    const c = (k: number) => ((i * (k + 3) * 0.137) % 1)
    for (const v of mixEyes([c(0), c(1), c(2)], [c(3), c(4), c(5)], 'optimized')) assert.ok(v >= 0 && v <= 1)
  }
  // through the red lens (the result's red), the left picture counts far more than the right
  const red = EYE_MIX.optimized
  const fromLeft = red.left[0].reduce((a, b) => a + b, 0), fromRight = red.right[0].reduce((a, b) => a + b, 0)
  assert.ok(fromLeft > 1 && Math.abs(fromRight) < 0.2)
})

test('every mix is offered', () => {
  assert.deepEqual([...ANAGLYPH_MIXES].sort(), Object.keys(EYE_MIX).sort())
})
