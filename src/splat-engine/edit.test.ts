import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs } from '../splat-core/blobs.ts'
import { bakeEdits, editAt, shapeDistance, type ShapeEdit } from './edit.ts'

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
