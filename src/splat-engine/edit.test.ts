import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs } from '../splat-core/blobs.ts'
import { CLEAN_MARGIN, bakeEdits, blobReach, densestAlong, editAt, shapeDistance, type ShapeEdit } from './edit.ts'

const ball: ShapeEdit = { shape: 'sphere', center: [0, 1, 0], size: [0.5, 0, 0], op: 'cut' }
const box: ShapeEdit = { shape: 'box', center: [0, 0, 0], size: [1, 0.5, 2], op: 'paint', color: [1, 0, 0] }

test('distances: negative inside, zero on the surface, the true distance outside', () => {
  assert.equal(shapeDistance(ball, [0, 1, 0]), -0.5)
  assert.ok(Math.abs(shapeDistance(ball, [0, 1.5, 0])) < 1e-12)
  assert.equal(shapeDistance(box, [3, 0, 0]), 2)
  assert.ok(Math.abs(shapeDistance(box, [2, 1.5, 0]) - Math.SQRT2) < 1e-12)
  assert.ok(Math.abs(shapeDistance(box, [0, 0.4, 0]) + 0.1) < 1e-12)
})

test('a cut removes what is inside (or outside, as a crop); paint mixes toward its color, softly if asked', () => {
  assert.equal(editAt([ball], [0, 1.2, 0]).keep, false)
  assert.equal(editAt([ball], [0, 2, 0]).keep, true)
  assert.equal(editAt([{ ...ball, outside: true }], [0, 2, 0]).keep, false)
  const hard = editAt([box], [0, 0, 0])
  assert.equal(hard.amount, 1)
  assert.deepEqual(hard.paint, [1, 0, 0])
  assert.equal(editAt([box], [0, 0.6, 0]).amount, 0)
  const soft = editAt([{ ...box, soft: 0.2, amount: 0.5 }], [0, 0.4, 0])
  assert.ok(Math.abs(soft.amount - 0.25) < 1e-12, `${soft.amount}`)
  // a second paint over the first takes over where it is full strength
  const two = editAt([box, { ...box, color: [0, 0, 1] }], [0, 0, 0])
  assert.deepEqual(two.paint, [0, 0, 1])
})

test('baked edits leave cut blobs out and recolor painted ones', () => {
  const b = new Blobs()
  for (const y of [0, 1, 2]) b.push({ center: [0, y, 0], scale: [0.1, 0.1, 0.1], quat: [0, 0, 0, 1], color: [0.5, 0.5, 0.5], opacity: 1 })
  const out = bakeEdits(b, [ball, box])
  assert.equal(out.count, 2)
  assert.deepEqual([...out.color.subarray(0, 3)], [1, 0, 0])
  assert.deepEqual([...out.center.subarray(3, 6)], [0, 2, 0])
  assert.equal(b.count, 3, 'the original is left alone')
})

test('an upright cylinder: its distance from the side, the caps and the rim', () => {
  const can: ShapeEdit = { shape: 'cylinder', center: [1, 0, 0], size: [0.5, 2, 0], op: 'cut' }
  assert.ok(Math.abs(shapeDistance(can, [1, 0, 0]) + 0.5) < 1e-12)
  assert.ok(Math.abs(shapeDistance(can, [2, 1, 0]) - 0.5) < 1e-12)
  assert.ok(Math.abs(shapeDistance(can, [1, 3, 0]) - 1) < 1e-12)
  assert.ok(Math.abs(shapeDistance(can, [1.8, 2.4, 0]) - 0.5) < 1e-12)
  assert.equal(editAt([{ ...can, outside: true }], [1.2, 1, 0.2]).keep, true)
  assert.equal(editAt([{ ...can, outside: true }], [1.6, 1, 0]).keep, false)
})

test('a clean cut drops a blob whole only when it is well inside the cut', () => {
  const half: ShapeEdit = { shape: 'box', center: [10, 0, 0], size: [10, 10, 10], op: 'cut' }
  const cov = [0.04, 0, 0, 0.04, 0, 0.04]
  const reach = CLEAN_MARGIN * blobReach(cov)
  assert.ok(reach > 2 * 0.2, 'the margin covers the two standard deviations a blob is drawn to')
  assert.equal(editAt([half], [0.1, 0, 0]).keep, false)
  assert.equal(editAt([half], [0.1, 0, 0], reach).keep, true)
  assert.equal(editAt([half], [reach + 0.01, 0, 0], reach).keep, false)
})

test('the densest point along a ray: a flat blob\'s own plane, a ball\'s nearest point, and never a blow-up', () => {
  // a disc lying flat at y = 1, seen from above at a slant: the ray meets y = 1
  const flat = [0.09, 0, 0, 0, 0, 0.09]
  const from = [0, 3, 2], dir = [0.3, -1, -0.8]
  const t = densestAlong(from, dir, [0.2, 1, 0.1], flat)
  assert.ok(Math.abs(from[1] + t * dir[1] - 1) < 1e-9, `${t}`)
  // the same with a little thickness stays close to the plane
  const thin = densestAlong(from, dir, [0.2, 1, 0.1], [0.09, 0, 0, 1e-6, 0, 0.09])
  assert.ok(Math.abs(thin - t) < 1e-3)
  // a ball: the point of the ray nearest its center
  const ball = densestAlong([0, 0, 5], [0.1, 0, -1], [0, 0, 0], [0.04, 0, 0, 0.04, 0, 0.04])
  assert.ok(Math.abs(ball - 5 / 1.01) < 1e-9)
  // a turned disc (its normal along x + y): the plane through its center
  const s = 0.5, tilted = [0.02 * s, -0.02 * s, 0, 0.02 * s, 0, 0.02]
  const u = densestAlong([2, 2, 0], [-1, -0.5, 0.2], [0.5, 0.5, 0], tilted)
  const p = [2 - u, 2 - 0.5 * u]
  assert.ok(Math.abs(p[0] - 0.5 + (p[1] - 0.5)) < 1e-9)
  // seen edge-on, and a needle: finite, the nearest point to the center
  for (const cov of [flat, [0.09, 0, 0, 0, 0, 0]]) {
    const e = densestAlong([0, 1, 5], [0, 0, -1], [0.2, 1, 0], cov)
    assert.ok(Number.isFinite(e) && Math.abs(e - 5) < 1e-9, `${e}`)
  }
})
