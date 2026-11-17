import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs } from '../splat-core/blobs.ts'
import { Skeleton } from './rig.ts'
import { MAX_MUD, MIN_VALUE_RANGE, loopSnaps, partClashes, valuesOf } from './sceneChecks.ts'
import { axisAngle } from './rig.ts'
import { box, buildVoxels, cylinder } from './voxel.ts'

const bones = () => new Skeleton([{ name: 'root', parent: -1, head: [0, 0, 0] }, { name: 'b', parent: 0, head: [0, 0, 0] }])

test('loopSnaps passes a smooth loop, a fast flap and a spark that shrinks away to start again', () => {
  const sk = bones()
  const b = sk.index('b')
  // a bob that joins up
  assert.deepEqual(loopSnaps(sk, (s, t) => { s.reset(); s.offset[b * 3 + 1] = Math.sin((t / 2) * Math.PI * 2); s.update() }, 2), [])
  // a flap far faster than the frames, but steady
  assert.deepEqual(loopSnaps(sk, (s, t) => { s.reset(); s.offset[b * 3] = 0.5 * Math.sin(t * 11 * Math.PI * 2); s.update() }, 2), [])
  // a spark rising and sent back, shrunk to nothing at the turn as `drift` does
  assert.deepEqual(loopSnaps(sk, (s, t) => { s.reset(); const life = t % 1; s.offset[b * 3 + 1] = 3 * life; s.size[b] = Math.sin(Math.PI * life) ** 0.6; s.update() }, 2), [])
})

test('loopSnaps catches a move that does not join up at the seam, or jumps mid-loop, while it is seen', () => {
  const sk = bones()
  const b = sk.index('b')
  const seam = loopSnaps(sk, (s, t) => { s.reset(); s.offset[b * 3] = t; s.update() }, 2)
  assert.equal(seam.length, 1)
  assert.equal(seam[0].bone, 'b')
  assert.equal(seam[0].at, 0, 'at the seam')
  const mid = loopSnaps(sk, (s, t) => { s.reset(); s.offset[b * 3 + 2] = t < 1 ? 0 : 1; s.update() }, 2)
  assert.deepEqual(mid.map((x) => [x.bone, x.at]), [['b', 0], ['b', 1]])
})

test('valuesOf reads the spread of lightness and the share of gray mud', () => {
  const lit = new Blobs(16)
  for (let i = 0; i < 100; i++) lit.push({ center: [0, 0, 0], scale: [1, 1, 1], quat: [0, 0, 0, 1], color: i < 50 ? [0.1, 0.1, 0.3] : [1, 0.9, 0.6], opacity: 1 })
  const v = valuesOf(lit)
  assert.ok(v.light - v.dark > MIN_VALUE_RANGE && v.mud === 0, JSON.stringify(v))
  const gray = new Blobs(16)
  for (let i = 0; i < 100; i++) gray.push({ center: [0, 0, 0], scale: [1, 1, 1], quat: [0, 0, 0, 1], color: [0.45 + (i % 5) * 0.01, 0.45 + (i % 5) * 0.01, 0.45 + (i % 5) * 0.01], opacity: 1 })
  const g = valuesOf(gray)
  assert.ok(g.light - g.dark < MIN_VALUE_RANGE && g.mud > MAX_MUD, JSON.stringify(g))
})

test('partClashes catches sails that turn through their tower, and passes ones that clear it, a hub that touches and a thing that only bobs beside another', () => {
  const s = 0.04
  // a tower, and a cross of two bars turning about z in front of it, on a hub that reaches back into the tower
  const mill = (z: number) => buildVoxels({
    spacing: s,
    bones: [{ name: 'land', parent: -1, head: [0, 0, 0] }, { name: 'sails', parent: 0, head: [0, 0.9, z] }, { name: 'gull', parent: 0, head: [1.5, 1, 0] }],
    parts: [
      { shape: cylinder([0, 0], 0, 1.2, 0.3), color: [0.7, 0.7, 0.7], bone: 'land' },
      { shape: box([0, 0.9, z], [0.9, 0.06, 0.04]), color: [0.8, 0.6, 0.3], bone: 'sails' },
      { shape: box([0, 0.9, z], [0.06, 0.9, 0.04]), color: [0.8, 0.6, 0.3], bone: 'sails' },
      { shape: box([0, 0.9, z / 2 + 0.1], [0.05, 0.05, z / 2 + 0.1]), color: [0.4, 0.3, 0.2], bone: 'sails' },
      { shape: box([1.5, 1, 0], [0.1, 0.05, 0.1]), color: [1, 1, 1], bone: 'gull' },
    ],
  })
  const pose = (sk: Skeleton, t: number) => {
    sk.reset()
    sk.setRotation(sk.index('sails'), axisAngle([0, 0, 1], (t / 8) * Math.PI * 2))
    sk.offset[sk.index('gull') * 3 + 1] = Math.sin((t / 8) * Math.PI * 2) * 0.2
    sk.update()
  }
  // 0.45 in front of a tower 0.3 thick: clear all the way round
  assert.deepEqual(partClashes(mill(0.45), pose, 8, s), [])
  // 0.2 in front: the down-going bar sweeps through the tower's wall
  const hit = partClashes(mill(0.2), pose, 8, s)
  assert.ok(hit.length >= 1, 'the sails clash')
  for (const c of hit) {
    assert.equal(c.bone, 'sails')
    assert.equal(c.into, 0, 'with the tower')
    assert.ok(c.part === 1 || c.part === 2, 'a bar, not the hub that sits in the tower at rest')
    assert.ok(c.blobs >= 12 && c.at >= 0 && c.at < 8)
  }
})
