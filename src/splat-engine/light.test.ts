import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Blobs, covariance, quatFacing } from '../splat-core/blobs.ts'
import { bakeLights, blobNormal, lightAt } from './light.ts'

const disc = (n: [number, number, number]) => {
  const b = new Blobs()
  b.push({ centre: [0, 0, 0], scale: [0.1, 0.1, 0.01], quat: quatFacing(n), colour: [0.5, 0.5, 0.5], opacity: 1 })
  return b
}

test('a flat blob\'s normal is its thin axis', () => {
  for (const n of [[0, 1, 0], [1, 0, 0], [0.6, 0, 0.8]] as [number, number, number][]) {
    const got = blobNormal(covariance(disc(n), 0))
    assert.ok(Math.abs(Math.abs(got[0] * n[0] + got[1] * n[1] + got[2] * n[2]) - 1) < 1e-4, `${n} → ${got}`)
  }
})

test('light falls with distance, reaches both faces, and is gone by twice its range', () => {
  const L = { position: [0, 1, 0] as [number, number, number], colour: [1, 1, 1] as [number, number, number], range: 1 }
  const up = lightAt([0, 0, 0], [0, 1, 0], [L], 0)[0]
  const down = lightAt([0, 0, 0], [0, -1, 0], [L], 0)[0]
  const edge = lightAt([0, 0, 0], [1, 0, 0], [L], 0)[0]
  assert.ok(Math.abs(up - 0.28125) < 1e-9, `${up}`) // fade (1 - 1/4)² over (1 + 1)
  assert.equal(up, down)
  assert.ok(edge < up && edge > 0)
  assert.equal(lightAt([0, -1.01, 0], [0, 1, 0], [L], 0.2)[0], 0.2)
})

test('bakeLights with no lights and full ambient keeps the colours', () => {
  const b = disc([0, 1, 0])
  const out = bakeLights(b, [], 1)
  assert.ok(Math.abs(out.colour[0] - 0.5) < 1e-6)
  const lit = bakeLights(b, [{ position: [0, 1, 0], colour: [4, 0, 0], range: 1 }], 0.5)
  assert.ok(lit.colour[0] > 0.5 && lit.colour[1] < 0.5)
})
