import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs } from '../../splat-core/blobs.ts'
import { readRiggedGlb, sampleClip, writeRiggedGlb } from '../../splat-engine/glb.ts'
import { Skeleton } from '../../splat-engine/rig.ts'
import { MOST_BONES, SCENE_ROOT, bonesIn, sceneRig, type RigPiece } from './engineFile.ts'

/** A piece of `n` blobs on the last of a chain of `bones` bones. */
function piece(name: string, bones: number, n: number, x: number): RigPiece {
  const skeleton = new Skeleton(Array.from({ length: bones }, (_, i) => ({ name: `b${i}`, parent: i - 1, head: [x, i * 0.2, 0] as [number, number, number] })))
  const blobs = new Blobs(n)
  blobs.count = n
  for (let i = 0; i < n; i++) { blobs.center.set([x, 0.1 * i, 0], i * 3); blobs.scale.set([0.05, 0.05, 0.05], i * 3); blobs.quat[i * 4 + 3] = 1; blobs.opacity[i] = 1 }
  const joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) { joints[i * 4] = bones - 1; weights[i * 4] = 1 }
  return { name, blobs, skin: { joints, weights }, skeleton }
}

test('pieces join under one still bone, each blob riding its own piece’s bone, and play as posed', () => {
  const land = piece('Grassy hill', 1, 5, 0), mill = piece('Windmill', 3, 4, 2), mill2 = piece('Windmill', 2, 3, -2)
  const pieces = [land, mill, mill2]
  const r = sceneRig('Hill', pieces, 2, (t) => {
    // the windmill's top bone turns a quarter about z by t = 1 and the copy's root grows
    const a = (Math.PI / 4) * t
    mill.skeleton.rotation.set([0, 0, Math.sin(a), Math.cos(a)], 2 * 4)
    mill2.skeleton.rootScale = 1 + t
  })
  assert.equal(r.skeleton.count, bonesIn(pieces))
  assert.equal(r.skeleton.bones[0].name, SCENE_ROOT)
  assert.deepEqual(r.skeleton.bones.slice(1).map((b) => b.name), ['grassy-hill/b0', 'windmill/b0', 'windmill/b1', 'windmill/b2', 'windmill-2/b0', 'windmill-2/b1'])
  assert.deepEqual(r.skeleton.bones.map((b) => b.parent), [-1, 0, 0, 2, 3, 0, 5])
  assert.equal(r.blobs.count, 12)
  // the land's blobs on its bone 1, the windmill's on its third bone (4), the copy's on its second (6)
  assert.deepEqual([0, 5, 9].map((i) => r.skin.joints[i * 4]), [1, 4, 6])
  assert.equal(r.blobs.center[5 * 3], 2)
  // the file opens again with the same bones and the pose at t = 1
  const back = readRiggedGlb(writeRiggedGlb(r))
  assert.equal(back.skeleton.count, 7)
  assert.equal(back.blobs.count, 12)
  const clip = back.clips[0]
  sampleClip(clip, back.skeleton, 1)
  assert.ok(Math.abs(back.skeleton.rotation[4 * 4 + 2] - Math.sin(Math.PI / 4)) < 0.01)
  assert.ok(Math.abs(back.skeleton.size[5] - 2) < 0.01)
  // the pieces are left at rest
  assert.equal(mill.skeleton.rotation[2 * 4 + 2], 0)
})

test('a scene with more bones than a file holds says so', () => {
  assert.throws(() => sceneRig('Big', [piece('a', 200, 1, 0), piece('b', 60, 1, 0)], 1, () => {}), new RegExp(`${MOST_BONES} bones`))
})
