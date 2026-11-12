import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeCreature, poseWalk } from './creature.ts'
import { SKIN_EXTENSION, SKIN_RULE, readRiggedGlb, recordClip, sampleClip, writeRiggedGlb } from './glb.ts'
import { skinBlob } from './rig.ts'

const fox = () => {
  const c = makeCreature(3000)
  const clip = recordClip('trot', c.skeleton, poseWalk, 1 / 1.4, 24)
  return { name: 'fox', ...c, clips: [clip] }
}

test('a rigged fox survives a round trip through .glb', () => {
  const a = fox()
  const bytes = writeRiggedGlb(a)
  const b = readRiggedGlb(bytes)
  assert.equal(b.blobs.count, a.blobs.count)
  assert.equal(b.skeleton.count, a.skeleton.count)
  assert.deepEqual(b.skeleton.bones.map((x) => x.name), a.skeleton.bones.map((x) => x.name))
  for (let i = 0; i < a.skeleton.count; i++) for (let k = 0; k < 3; k++) assert.ok(Math.abs(b.skeleton.bones[i].head[k] - a.skeleton.bones[i].head[k]) < 1e-5)
  for (let i = 0; i < a.blobs.count * 3; i++) {
    assert.ok(Math.abs(b.blobs.centre[i] - a.blobs.centre[i]) < 1e-6)
    assert.ok(Math.abs(b.blobs.colour[i] - a.blobs.colour[i]) < 1e-5)
  }
  assert.deepEqual([...b.skin.joints], [...a.skin.joints])
  assert.equal(b.clips.length, 1)
  assert.equal(b.clips[0].times.length, a.clips[0].times.length)
})

test('the walk read back from the file poses the fox as the original did', () => {
  const a = fox()
  const b = readRiggedGlb(writeRiggedGlb(a))
  const t = 0.3
  sampleClip(a.clips[0], a.skeleton, t)
  sampleClip(b.clips[0], b.skeleton, t)
  const ca = new Float32Array(3), cb = new Float32Array(3), v = new Float32Array(6)
  let worst = 0
  for (let i = 0; i < a.blobs.count; i += 7) {
    const args = (x: typeof a) => [x.blobs.centre.subarray(i * 3, i * 3 + 3), x.blobs.scale.subarray(i * 3, i * 3 + 3), x.blobs.quat.subarray(i * 4, i * 4 + 4), x.skin.joints.subarray(i * 4, i * 4 + 4), x.skin.weights.subarray(i * 4, i * 4 + 4), x.skeleton] as const
    skinBlob(...args(a), 'quat', ca, 0, v, 0)
    skinBlob(...args(b), 'quat', cb, 0, v, 0)
    worst = Math.max(worst, Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]))
  }
  assert.ok(worst < 1e-4, `worst ${worst}`)
})

test('the file declares splats and our skinning rule, without requiring either', () => {
  const bytes = writeRiggedGlb(fox())
  const len = new DataView(bytes.buffer).getUint32(12, true)
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)))
  assert.deepEqual(json.extensionsUsed, ['KHR_gaussian_splatting', SKIN_EXTENSION])
  assert.equal(json.extensionsRequired, undefined)
  assert.equal(json.meshes[0].primitives[0].mode, 0)
  assert.ok(json.meshes[0].primitives[0].attributes.JOINTS_0 !== undefined)
  // inside the splat extension's own object, where KHR_gaussian_splatting says extensions of it go
  assert.deepEqual(json.meshes[0].primitives[0].extensions.KHR_gaussian_splatting.extensions[SKIN_EXTENSION], SKIN_RULE)
  assert.equal(json.extensions, undefined)
  assert.equal(json.skins[0].joints.length, 14)
  assert.equal(bytes.byteLength % 4, 0)
})

test('a clip loops back to where it started', () => {
  const a = fox()
  const clip = a.clips[0]
  const end = clip.times[clip.times.length - 1]
  sampleClip(clip, a.skeleton, 0)
  const start = a.skeleton.posedHead.slice()
  sampleClip(clip, a.skeleton, end * 0.9999)
  for (let i = 0; i < start.length; i++) assert.ok(Math.abs(a.skeleton.posedHead[i] - start[i]) < 0.02, `bone coord ${i}`)
})
