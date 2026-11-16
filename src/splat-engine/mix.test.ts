import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Skeleton, axisAngle } from './rig.ts'
import { Mixer, addPose, blendPose, putPose, takePose } from './mix.ts'

const arm = () => new Skeleton([
  { name: 'root', parent: -1, head: [0, 0, 0] },
  { name: 'fore', parent: 0, head: [1, 0, 0] },
])
/** The forearm's turn about z, in radians. */
const bend = (sk: Skeleton) => 2 * Math.atan2(sk.rotation[6], sk.rotation[7])
const bendTo = (rad: number) => (sk: Skeleton) => { sk.setRotation(1, axisAngle([0, 0, 1], rad)) }

test('blending halfway between two bends lands halfway, and sizes and offsets blend too', () => {
  const sk = arm()
  bendTo(0.2)(sk)
  const from = takePose(sk)
  bendTo(1.0)(sk)
  sk.size[1] = 2
  sk.offset[3] = 0.4
  blendPose(sk, from, 0.5)
  assert.ok(Math.abs(bend(sk) - 0.6) < 1e-3, `${bend(sk)}`)
  assert.ok(Math.abs(sk.size[1] - 1.5) < 1e-6)
  assert.ok(Math.abs(sk.offset[3] - 0.2) < 1e-6)
})

test('an added layer turns on top of the pose; the reference pose itself adds nothing', () => {
  const sk = arm()
  const ref = takePose(sk)
  bendTo(0.3)(sk)
  const nod = takePose(sk)
  bendTo(0.5)(sk)
  const pose = takePose(sk)
  addPose(sk, ref, ref)
  assert.ok(Math.abs(bend(sk) - 0.5) < 1e-6)
  putPose(sk, pose)
  addPose(sk, nod, ref)
  assert.ok(Math.abs(bend(sk) - 0.8) < 1e-5)
  putPose(sk, pose)
  addPose(sk, nod, ref, 0.5)
  assert.ok(Math.abs(bend(sk) - 0.65) < 1e-5)
})

test('a crossfade moves weight from one move to the next, always summing to one', () => {
  const m = new Mixer([
    { name: 'idle', seconds: 2, pose: bendTo(0) },
    { name: 'wave', seconds: 1, pose: (sk, t) => bendTo(1 + t)(sk) },
  ])
  m.play('idle', 0)
  m.update(0)
  assert.equal(m.weight('idle'), 1)
  m.play('wave', 0.5)
  for (let i = 1; i <= 5; i++) {
    m.update(0.1)
    assert.ok(Math.abs(m.weight('idle') + m.weight('wave') - 1) < 1e-9)
    assert.ok(Math.abs(m.weight('wave') - i * 0.2) < 1e-9, `${m.weight('wave')}`)
  }
  // all wave now: the pose is the wave's own, at the wave's own time (0.5 s in)
  const sk = arm()
  m.apply(sk)
  assert.ok(Math.abs(bend(sk) - 1.5) < 1e-6)
  // a loop wraps its clock
  m.update(0.7)
  assert.ok(Math.abs(m.time('wave') - 0.2) < 1e-9)
})

test('weights set directly are a blend of the moves, scaled to sum to one', () => {
  const m = new Mixer([
    { name: 'a', pose: bendTo(0) },
    { name: 'b', pose: bendTo(1) },
    { name: 'c', pose: bendTo(0.5) },
  ])
  m.setWeights({ a: 1, b: 1 })
  assert.equal(m.weight('a'), 0.5)
  const sk = arm()
  m.apply(sk)
  assert.ok(Math.abs(bend(sk) - 0.5) < 1e-2, `${bend(sk)}`)
  m.setWeights({ a: 1, b: 1, c: 2 })
  m.apply(sk)
  assert.ok(Math.abs(bend(sk) - 0.5) < 1e-2, `${bend(sk)}`)
})
