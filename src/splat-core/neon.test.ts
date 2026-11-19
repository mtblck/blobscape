import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NEON_FLOOR, NEON_REST, bodyColor, colorOf, neonColor, pulse, shineAt } from './neon.ts'

test('a tube takes its thing\'s hue at full strength, however dark the thing', () => {
  const dark = neonColor([0.02, 0.005, 0.005]), bright = neonColor([0.8, 0.2, 0.2])
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(dark[k] - bright[k]) < 1e-6)
  assert.equal(Math.max(...dark), 1)
  assert.ok(dark[0] > dark[1] && dark[1] >= NEON_FLOOR)
  assert.deepEqual(neonColor([0.3, 0.3, 0.3]), [1, 1, 1])
  assert.deepEqual(neonColor([0, 0, 0]), [1, 1, 1])
})

test('a pulse is brightest at its head, dies away behind it and comes round again', () => {
  assert.equal(pulse(0), 1)
  assert.ok(pulse(0.1) < pulse(0.01))
  assert.ok(pulse(0.99) < 0.001)
  assert.ok(Math.abs(pulse(3.25) - pulse(0.25)) < 1e-9)
  assert.ok(Math.abs(pulse(-0.75) - pulse(0.25)) < 1e-9)
})

test('a tube never goes out, and a whole turn later shines the same', () => {
  for (let i = 0; i < 50; i++) {
    const along: [number, number] = [i * 0.137, i * 0.291], s = shineAt(along, 0.4)
    assert.ok(s >= NEON_REST && s <= 1)
    assert.ok(Math.abs(s - shineAt(along, 3.4)) < 1e-9)
  }
  assert.equal(shineAt([0.5, 9], 0.5), 1)
})

test('parts are dealt every color', () => {
  const seen = new Set(Array.from({ length: 100 }, (_, i) => colorOf(i / 100, 4)))
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3])
  assert.equal(colorOf(1, 4), 3)
})

test('a body is dark away from the tubes and takes the light\'s color near them', () => {
  const far = bodyColor([0.5, 0.5, 0.5], [0, 0, 0]), near = bodyColor([0.5, 0.5, 0.5], [1, 0, 0.5])
  assert.ok(far[0] < 0.05)
  assert.ok(near[0] > near[2] && near[2] > near[1])
})
