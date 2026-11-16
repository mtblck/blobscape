import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs } from '../splat-core/blobs.ts'
import { Skeleton, axisAngle, emptySkin, setWeights, skinBlob } from './rig.ts'
import { boneLabel, boneShare, pickActors } from './pick.ts'

/** An arm along +x: an upper bone at the origin, a forearm from x = 1, one blob on each and one shared at the elbow. */
function arm() {
  const skeleton = new Skeleton([
    { name: 'upper', parent: -1, head: [0, 0, 0] },
    { name: 'fore', parent: 0, head: [1, 0, 0] },
  ])
  const blobs = new Blobs()
  const ball = (x: number) => blobs.push({ center: [x, 0, 0], scale: [0.1, 0.1, 0.1], quat: [0, 0, 0, 1], color: [1, 1, 1], opacity: 1 })
  ball(0.5); ball(1.5); ball(1)
  const skin = emptySkin(3)
  setWeights(skin, 0, [[0, 1]])
  setWeights(skin, 1, [[1, 1]])
  setWeights(skin, 2, [[0, 0.3], [1, 0.7]])
  return { blobs, skin, skeleton, partOf: [4, 7, 7] }
}

const down = [0, -1, 0]

test('a ray finds the blob where it is drawn, not where it rests', () => {
  const a = arm()
  a.skeleton.setRotation(1, axisAngle([0, 0, 1], Math.PI / 2)) // the forearm points up
  a.skeleton.update()
  // the forearm blob was at x = 1.5 and is now at (1, 0.5, 0)
  assert.equal(pickActors([a], [1.5, 5, 0], down), null)
  const hit = pickActors([a], [1, 5, 0], down)
  assert.ok(hit)
  assert.equal(hit.blob, 1)
  assert.equal(hit.bone, 1)
  assert.equal(hit.part, 7)
  // it enters the blob 1.6 standard deviations above its center
  assert.ok(Math.abs(hit.point[1] - (0.5 + 0.16)) < 1e-4, `${hit.point}`)
})

test('the nearest blob along the ray wins, across actors', () => {
  const a = arm(), b = arm()
  b.skeleton.place.set([0, 0, -3])
  a.skeleton.update(); b.skeleton.update()
  const hit = pickActors([b, a], [0.5, 0, 5], [0, 0, -1])
  assert.ok(hit)
  assert.equal(hit.actor, 1)
  assert.equal(hit.blob, 0)
})

test('a blob shared by two bones is found where its blend puts it, and belongs to the heavier bone', () => {
  const a = arm()
  a.skeleton.setRotation(1, axisAngle([0, 0, 1], Math.PI / 2))
  a.skeleton.size[1] = 1.5 // grown too
  a.skeleton.update()
  const c = new Float32Array(3), v = new Float32Array(6)
  skinBlob(a.blobs.center.subarray(6, 9), a.blobs.scale.subarray(6, 9), [0, 0, 0, 1], a.skin.joints.subarray(8, 12), a.skin.weights.subarray(8, 12), a.skeleton, 'linear', c, 0, v, 0)
  const hit = pickActors([a], [c[0], c[1], 5], [0, 0, -1])
  assert.ok(hit)
  assert.equal(hit.blob, 2)
  assert.equal(hit.bone, 1)
  // it is entered at the edge of its posed ellipsoid, 1.6 standard deviations along z from the center
  assert.ok(Math.abs(hit.point[2] - 1.6 * Math.sqrt(v[5])) < 1e-4)
})

test('faint blobs are looked through, and a bone grown to nothing hides its blobs', () => {
  const a = arm()
  a.blobs.opacity[0] = 0.05
  a.skeleton.update()
  assert.equal(pickActors([a], [0.5, 5, 0], down), null)
  a.skeleton.size[1] = 0
  a.skeleton.update()
  assert.equal(pickActors([a], [1.5, 5, 0], down), null)
})

test('boneShare gives each blob its weight on one bone', () => {
  const s = boneShare(arm(), 1)
  assert.deepEqual([...s].map((x) => Math.round(x * 10) / 10), [0, 1, 0.7])
})

test('bone names read as words', () => {
  assert.equal(boneLabel('lForearm'), 'left forearm')
  assert.equal(boneLabel('rTop'), 'right top')
  assert.equal(boneLabel('tail3'), 'tail 3')
  assert.equal(boneLabel('head'), 'head')
  assert.equal(boneLabel('lowerJaw'), 'lower jaw')
  assert.equal(boneLabel('lThigh0'), 'left thigh 0')
  assert.equal(boneLabel('flUpper'), 'front left upper')
  assert.equal(boneLabel('flap'), 'flap')
})
