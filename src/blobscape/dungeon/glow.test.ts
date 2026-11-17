import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FADE, Glow, RISE, gather, type Want } from './glow.ts'

const fire = (x: number, z: number, k = 1): Want => ({ kind: 'fire', position: [x, 0.45, z], color: [1.8 * k, 0.8 * k, 0.2 * k], range: 2 })
const sum = (c: ArrayLike<number>) => c[0] + c[1] + c[2]

test('a light eases in, follows what it lights as it moves, and fades out after it has gone', () => {
  const g = new Glow(), dt = 1 / 60
  let out = g.update([fire(0, 0)], dt)
  assert.equal(out.length, 1)
  assert.ok(sum(out[0].color) < sum(fire(0, 0).color) * 0.3, 'it does not pop on')
  for (let t = 0; t < RISE * 5; t += dt) out = g.update([fire(0, 0)], dt)
  assert.ok(Math.abs(sum(out[0].color) - sum(fire(0, 0).color)) < 0.05)
  // a bolt flying at 9 m/s stays one light, never two
  for (let k = 0; k < 30; k++) { out = g.update([{ ...fire(k * 0.15, 0), kind: 'fire' }], dt); assert.equal(out.length, 1) }
  // gone: it fades, still there a moment later, and then it is dropped
  out = g.update([], dt)
  assert.equal(out.length, 1)
  for (let t = 0; t < FADE * 12; t += dt) out = g.update([], dt)
  assert.equal(out.length, 0)
})

test('light that jumps (fire spreading at the ground tick, a bolt bursting) changes gently from frame to frame', () => {
  const g = new Glow(), dt = 1 / 60
  let was = 0, most = 0
  for (let f = 0; f < 240; f++) {
    // the ground steps ten times a second: its fire jumps between levels
    const level = [0.2, 1, 0.4, 0.9, 0][Math.floor(f / 6) % 5]
    const out = g.update(level ? [fire(1, 1, level)] : [], dt)
    const now = out.reduce((s, l) => s + sum(l.color), 0)
    if (f > 0) most = Math.max(most, Math.abs(now - was))
    was = now
  }
  assert.ok(most < 0.4, `a frame changed the light by ${most}`)
  // lights of other kinds are never taken for each other, and the brightest are kept when there are too many
  const out = g.update([fire(0, 0, 3), { ...fire(0, 0), kind: 'ice' }, fire(5, 5, 0.1)], dt, 2)
  assert.equal(out.length, 2)
})

test('gather: a patch of fire is one light, a far patch another, never more than asked, brighter but not by the count', () => {
  const patch = [fire(0, 0), fire(0.5, 0), fire(0, 0.5), fire(0.5, 0.5)], far = [fire(6, 6), fire(6.4, 6)]
  const two = gather([...patch, ...far], 5)
  assert.equal(two.length, 2)
  const big = two.find((l) => l.position[0] < 3)!
  assert.ok(Math.abs(big.position[0] - 0.25) < 1e-9 && Math.abs(big.position[2] - 0.25) < 1e-9)
  assert.ok(sum(big.color) > sum(fire(0, 0).color) && sum(big.color) < sum(fire(0, 0).color) * 2)
  const spread = Array.from({ length: 12 }, (_, i) => fire(i * 3, 0))
  assert.equal(gather(spread, 3).length, 3)
  assert.deepEqual(gather([], 3), [])
})
