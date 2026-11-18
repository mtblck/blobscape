import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as build from './build.ts'
import { MEADOW } from './doc.ts'
import * as hand from './layout.ts'

const near = (a: ArrayLike<number>, b: ArrayLike<number>, eps = 1e-6) => Array.from(a).every((x, i) => Math.abs(x - b[i]) < eps)

test('the hand-written meadow and Blobscape\'s put the fox and the wisp in the same places', () => {
  assert.equal(hand.LOOP, build.LOOP)
  for (const t of [0, 0.7, 3.3, 6, 9.1, 11.99]) {
    const a = build.foxAt(t), b = hand.foxAt(t / hand.LOOP)
    assert.ok(near(a.at, b.at) && Math.abs(a.turn - b.turn) < 1e-9, `fox at ${t}`)
    for (const behind of [0, 0.3, 0.78]) assert.ok(near(build.wispAt(t, behind), hand.wispAt(t / hand.LOOP, behind)), `wisp at ${t}`)
  }
  assert.deepEqual([hand.RING, hand.FOX_SIZE, hand.STRIDES, hand.AMBIENT], [build.RING, build.FOX_SIZE, build.STRIDES, build.AMBIENT])
  assert.deepEqual(hand.WISP_LIGHT, build.WISP_LIGHT)
  assert.deepEqual(hand.MOONLIGHT.from, MEADOW.light?.from)
  // the moon, by its place in the description
  assert.ok(MEADOW.parts.some((p) => 'at' in p.shape && near(p.shape.at as number[], hand.MOON.at)))
  for (const [x, z] of [[0, 0], [0.5, 0.2], [1.05, 0], [0, -1.2], [1.6, 0.2], [1.8, 0]]) assert.equal(hand.grown(x, z), build.grassHeight(x, z))
})

test('the wisp stays clear of the stone and over the turf', () => {
  for (let k = 0; k < 600; k++) {
    const [x, y, z] = hand.wispAt(k / 600), r = Math.hypot(x, z)
    assert.ok(r > hand.STONE.r + 0.1 && r < hand.TURF.r && y > 0.3, `at ${k}: ${r.toFixed(2)}, ${y.toFixed(2)}`)
  }
})

test('the hand-written trot joins up over a loop and keeps its paws near the ground', () => {
  const a = hand.foxJoints(0), b = hand.foxJoints(1)
  for (const id of hand.LEGS) a.legs[id].forEach((p, i) => assert.ok(near(p, b.legs[id][i], 1e-6)))
  a.tail.forEach((p, i) => assert.ok(near(p, b.tail[i], 1e-6)))
  for (let k = 0; k < 200; k++) for (const id of hand.LEGS) {
    const paw = hand.foxJoints(k / 200).legs[id][3]
    assert.ok(paw[1] > -0.06 && paw[1] < 0.45, `${id} paw at ${paw[1].toFixed(3)}`)
  }
})

test('the meadow is one actor whose pose joins up over a loop', () => {
  const m = build.buildMeadow(0.06, 3000, 600)
  assert.equal(m.blobs.count, m.counts.scene + m.counts.fox + m.counts.grass)
  assert.equal(m.counts.grass, 1800)
  // every blob hangs on bones the skeleton has, with weights that sum to one
  for (let i = 0; i < m.blobs.count; i++) {
    let sum = 0
    for (let k = 0; k < 4; k++) { sum += m.skin.weights[i * 4 + k]; assert.ok(m.skin.joints[i * 4 + k] < m.skeleton.count) }
    assert.ok(Math.abs(sum - 1) < 1e-3, `blob ${i} weighs ${sum}`)
  }
  build.poseMeadow(m, m.skeleton, 0)
  const start = Float32Array.from(m.skeleton.matrix)
  build.poseMeadow(m, m.skeleton, build.LOOP)
  assert.ok(near(start, m.skeleton.matrix, 1e-4))
  // the fox is carried: its hips are on the ring, at its size
  const hips = m.foxFrom, at = build.foxAt(0).at
  assert.ok(Math.abs(m.skeleton.scale[hips] - build.FOX_SIZE) < 1e-6)
  assert.ok(Math.hypot(m.skeleton.posedHead[hips * 3] - at[0], m.skeleton.posedHead[hips * 3 + 2] - at[2]) < 0.35)
})
