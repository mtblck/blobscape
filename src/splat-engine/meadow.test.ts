import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BURN_TIME, Meadow, REGROW_TIME, SCAR_TIME } from './meadow.ts'

const field = (more: Partial<ConstructorParameters<typeof Meadow>[0]> = {}, room?: (x: number, z: number) => number) =>
  new Meadow({ x0: -5, z0: -5, nx: 40, nz: 40, cell: 0.25, seed: 3, ...more }, room)

test('fire runs through grass, eats it and leaves the ground black', () => {
  const m = field()
  assert.ok(m.light(0, 0) > 3)
  m.step(1)
  assert.ok(m.burning > 5, 'it spreads')
  m.step(8)
  const burnt = Array.from(m.char).filter((c) => c === 1).length
  assert.ok(burnt > 150, `${burnt} cells burnt`)
  // where it burnt out the grass is gone
  for (let k = 0; k < m.char.length; k++) if (m.char[k] === 1 && m.fire[k] === 0) assert.equal(m.grass[k], 0)
  // a cell burns for about BURN_TIME
  const one = field()
  one.light(0.1, 0.1, 0.01)
  const k = one.index(0.1, 0.1)
  one.step(BURN_TIME * 0.5)
  assert.ok(one.fire[k] > 0 && one.grass[k] > 0)
  one.step(BURN_TIME * 0.6)
  assert.equal(one.fire[k], 0)
})

test('it stops at bare ground, and a burnt cell cannot catch until grass grows back', () => {
  // a path across the field at z = 0 with no grass
  const m = field({}, (_x, z) => (Math.abs(z) < 0.4 ? 0 : 1))
  m.light(0, -2)
  m.step(20)
  for (let k = 0; k < m.char.length; k++) if (m.center(k)[1] > 0.4) assert.equal(m.char[k], 0, 'nothing burnt past the path')
  assert.equal(m.light(0, 0), 0, 'nothing to light on the path')
  // just burnt, it won't light again
  const b = field()
  b.light(0.1, 0.1)
  b.step(4)
  const k = b.index(0.1, 0.1)
  assert.equal(b.char[k], 1)
  assert.equal(b.light(0.1, 0.1, 0.01), 0)
})

test('scorched ground greens again and the grass grows back in full', () => {
  const m = field()
  m.light(0, 0)
  m.step(BURN_TIME + 2)
  const k = m.index(0, 0)
  assert.equal(m.grass[k], 0, 'burnt and not yet growing')
  m.step(SCAR_TIME)
  assert.ok(m.grass[k] > 0 && m.grass[k] < 0.5, 'greening')
  m.step(3 * (SCAR_TIME + REGROW_TIME))
  assert.equal(m.burning, 0)
  for (let q = 0; q < m.grass.length; q++) { assert.ok(Math.abs(m.grass[q] - 1) < 1e-5); assert.equal(m.char[q], 0) }
  assert.equal(m.busy, false)
})

test('the same sparks give the same field; wind drives it downwind; a wrapped grid joins end to end', () => {
  const a = field(), b = field()
  a.light(0, 0); b.light(0, 0)
  a.step(3); b.step(3)
  assert.deepEqual(a.fire, b.fire)
  const w = field({ wind: [1, 0] })
  w.light(0, 0)
  w.step(4)
  let east = 0, west = 0
  for (let k = 0; k < w.char.length; k++) if (w.char[k] > 0 || w.fire[k] > 0) { const [x] = w.center(k); if (x > 0.5) east++; if (x < -0.5) west++ }
  assert.ok(east > west * 1.5, `east ${east}, west ${west}`)
  const ring = field({ wrap: true, nz: 16 })
  assert.equal(ring.index(0, -5 + 16 * 0.25 + 0.1), ring.index(0, -5 + 0.1))
  ring.light(0, -4.9)
  ring.step(3)
  const last = ring.index(0, -5 + 15.5 * 0.25)
  assert.ok(ring.fire[last] > 0 || ring.char[last] > 0, 'across the seam')
  ring.reset(-5, -5 + 16 * 0.25)
  assert.equal(ring.burning, 0)
})
