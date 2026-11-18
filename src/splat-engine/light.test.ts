import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Blobs, covariance, quatFacing } from '../splat-core/blobs.ts'
import { bakeLights, blobNormal, lightAt } from './light.ts'

const disc = (n: [number, number, number]) => {
  const b = new Blobs()
  b.push({ center: [0, 0, 0], scale: [0.1, 0.1, 0.01], quat: quatFacing(n), color: [0.5, 0.5, 0.5], opacity: 1 })
  return b
}

test('a flat blob\'s normal is its thin axis', () => {
  for (const n of [[0, 1, 0], [1, 0, 0], [0.6, 0, 0.8]] as [number, number, number][]) {
    const got = blobNormal(covariance(disc(n), 0))
    assert.ok(Math.abs(Math.abs(got[0] * n[0] + got[1] * n[1] + got[2] * n[2]) - 1) < 1e-4, `${n} → ${got}`)
  }
})

test('light falls with distance, reaches both faces, and is gone by twice its range', () => {
  const L = { position: [0, 1, 0] as [number, number, number], color: [1, 1, 1] as [number, number, number], range: 1 }
  const up = lightAt([0, 0, 0], [0, 1, 0], [L], 0)[0]
  const down = lightAt([0, 0, 0], [0, -1, 0], [L], 0)[0]
  const edge = lightAt([0, 0, 0], [1, 0, 0], [L], 0)[0]
  assert.ok(Math.abs(up - 0.28125) < 1e-9, `${up}`) // fade (1 - 1/4)² over (1 + 1)
  assert.equal(up, down)
  assert.ok(edge < up && edge > 0)
  assert.equal(lightAt([0, -1.01, 0], [0, 1, 0], [L], 0.2)[0], 0.2)
})

test('bakeLights with no lights and full ambient keeps the colors', () => {
  const b = disc([0, 1, 0])
  const out = bakeLights(b, [], 1)
  assert.ok(Math.abs(out.color[0] - 0.5) < 1e-6)
  const lit = bakeLights(b, [{ position: [0, 1, 0], color: [4, 0, 0], range: 1 }], 0.5)
  assert.ok(lit.color[0] > 0.5 && lit.color[1] < 0.5)
})

test('a light a point can\'t see adds nothing, and only the first four lights are shaded', async () => {
  const { lightAt } = await import('./light.ts')
  const L = { position: [0, 1, 0] as [number, number, number], color: [1, 1, 1] as [number, number, number], range: 2 }
  const open = lightAt([0, 0, 0], [0, 1, 0], [L], 0)
  const hid = lightAt([0, 0, 0], [0, 1, 0], [L], 0, [0, 255, 255, 255])
  assert.ok(open[0] > 0.1 && hid[0] === 0)
  const fifth = lightAt([0, 0, 0], [0, 1, 0], [L, L, L, L, L], 0, [0, 0, 0, 0])
  assert.ok(Math.abs(fifth[0] - open[0]) < 1e-9)
})

test('a light from a direction is as strong everywhere, and the sky\'s light may have a color', async () => {
  const { lightAt, ownLight } = await import('./light.ts')
  const sun = { direction: [0, 2, 0] as [number, number, number], color: [1, 0.9, 0.8] as [number, number, number] }
  const near = lightAt([0, 0, 0], [0, 1, 0], [sun], [0.1, 0.2, 0.3])
  const far = lightAt([50, -3, 9], [0, 1, 0], [sun], [0.1, 0.2, 0.3])
  assert.deepEqual(near, far)
  assert.ok(Math.abs(near[0] - 1.1) < 1e-9 && Math.abs(near[1] - 1.1) < 1e-9 && Math.abs(near[2] - 1.1) < 1e-9, `${near}`)
  // edge on, a face keeps the soft wrap's share
  assert.ok(Math.abs(lightAt([0, 0, 0], [1, 0, 0], [sun], 0)[0] - 0.35) < 1e-9)
  // a blob that gives its own light is never darker than that share, and still takes more light than it gives
  assert.deepEqual(ownLight([0.05, 0.05, 0.1], 1), [1, 1, 1])
  assert.deepEqual(ownLight([1.4, 0.2, 0.1], 0.5), [1.4, 0.5, 0.5])
  assert.deepEqual(ownLight([0.3, 0.2, 0.1], 0), [0.3, 0.2, 0.1])
})
