import { test } from 'node:test'
import assert from 'node:assert/strict'
import { covariance } from '../splat-core/blobs.ts'
import { arm, blendAt, caterpillar, weightByX, wrist } from './models.ts'
import { mat3ToQuat, neighbourPairs, poseBlobs, stretch, symEigen, volumeKept } from './pose.ts'
import { axisAngle, quatMat3, skinBlob } from './rig.ts'
import { KEYS, footSpeed, keyPose, poseKeys, feet } from './walk.ts'
import { makeCreature } from './creature.ts'

test('the eigen split puts a covariance back together', () => {
  const c = [0.5, 0.1, -0.2, 0.3, 0.05, 0.2]
  const out = new Float64Array(12)
  symEigen(c, out)
  const V = out.subarray(3)
  const back = (r: number, k: number) => V[r * 3] * V[k * 3] * out[0] + V[r * 3 + 1] * V[k * 3 + 1] * out[1] + V[r * 3 + 2] * V[k * 3 + 2] * out[2]
  const want = [[0, 0, c[0]], [0, 1, c[1]], [0, 2, c[2]], [1, 1, c[3]], [1, 2, c[4]], [2, 2, c[5]]]
  for (const [r, k, v] of want) assert.ok(Math.abs(back(r, k) - v) < 1e-9, `${r}${k}: ${back(r, k)} vs ${v}`)
  // and the eigenvectors make a proper rotation that survives the trip through a quaternion
  const R = quatMat3(mat3ToQuat(V))
  for (let k = 0; k < 9; k++) assert.ok(Math.abs(R[k] - V[k]) < 1e-9)
})

for (const mode of ['quat', 'linear'] as const) {
  test(`posed blobs have the covariance skinBlob gives (${mode})`, () => {
    const m = wrist(400)
    weightByX(m, 0, 0.6)
    m.skeleton.setRotation(1, axisAngle([1, 0, 0], 2.2))
    m.skeleton.setRotation(0, axisAngle([0, 1, 0], 0.4))
    m.skeleton.update()
    const out = m.blobs.clone()
    poseBlobs(m.blobs, m.skin, m.skeleton, mode, out)
    const c = new Float32Array(3), v = new Float32Array(6)
    for (let i = 0; i < m.blobs.count; i += 3) {
      const b = m.blobs
      skinBlob(b.centre.subarray(i * 3, i * 3 + 3), b.scale.subarray(i * 3, i * 3 + 3), b.quat.subarray(i * 4, i * 4 + 4), m.skin.joints.subarray(i * 4, i * 4 + 4), m.skin.weights.subarray(i * 4, i * 4 + 4), m.skeleton, mode, c, 0, v, 0)
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(out.centre[i * 3 + k] - c[k]) < 1e-5)
      const got = covariance(out, i)
      for (let k = 0; k < 6; k++) assert.ok(Math.abs(got[k] - v[k]) < 1e-6 + 1e-4 * Math.abs(v[k]), `blob ${i} cov ${k}: ${got[k]} vs ${v[k]}`)
    }
  })
}

test('a half-twisted wrist keeps its blobs whole when turns are averaged, and flattens them when matrices are', () => {
  const m = wrist(800)
  weightByX(m, 0, 0.5)
  m.skeleton.setRotation(1, axisAngle([1, 0, 0], Math.PI))
  m.skeleton.update()
  const q = m.blobs.clone(), l = m.blobs.clone()
  poseBlobs(m.blobs, m.skin, m.skeleton, 'quat', q)
  poseBlobs(m.blobs, m.skin, m.skeleton, 'linear', l)
  let minQ = 1, minL = 1
  for (let i = 0; i < m.blobs.count; i++) if (Math.abs(m.blobs.centre[i * 3]) < 0.1) { minQ = Math.min(minQ, volumeKept(m.blobs, q, i)); minL = Math.min(minL, volumeKept(m.blobs, l, i)) }
  assert.ok(minQ > 0.99, `quat ${minQ}`)
  assert.ok(minL < 0.05, `linear ${minL}`)
})

test('a hard cut tears the bent elbow open, and a blend closes it', () => {
  const m = arm(1600)
  const pairs = neighbourPairs(m.blobs, (i) => Math.abs(m.blobs.centre[i * 3]) < 0.5)
  const posed = m.blobs.clone()
  const at = (width: number) => {
    weightByX(m, 0, width)
    m.skeleton.reset()
    m.skeleton.setRotation(1, axisAngle([0, 0, 1], Math.PI / 2))
    m.skeleton.update()
    poseBlobs(m.blobs, m.skin, m.skeleton, 'quat', posed)
    return stretch(pairs, m.blobs, posed)
  }
  assert.ok(at(0) > 4, `hard ${at(0)}`)
  assert.ok(at(0.8) < 1.6, `soft ${at(0.8)}`)
})

test('blend weights run smoothly from one bone to the other', () => {
  assert.equal(blendAt(-1, 0, 0), 0)
  assert.equal(blendAt(0.01, 0, 0), 1)
  assert.equal(blendAt(0, 0, 1), 0.5)
  assert.ok(blendAt(0.25, 0, 1) > 0.5 && blendAt(0.25, 0, 1) < 1)
  const c = caterpillar(300)
  for (let i = 0; i < c.blobs.count; i++) assert.ok(Math.abs(c.skin.weights[i * 4] + c.skin.weights[i * 4 + 1] - 1) < 1e-6)
})

test('the walk keys loop, and in-betweens land halfway', () => {
  const t = { keys: 4 as const, hold: false, cycle: 1 }
  assert.deepEqual(keyPose(0, t), KEYS[0])
  assert.deepEqual(keyPose(1, t).swing, KEYS[0].swing)
  const half = keyPose(0.125, t)
  assert.ok(Math.abs(half.swing[0] - KEYS[0].swing[0] / 2) < 1e-9)
  assert.deepEqual(keyPose(0.125, { ...t, hold: true }).swing, KEYS[0].swing)
  // two keys skip the passing poses, so no foot is ever folded
  for (let u = 0; u < 1; u += 0.05) assert.deepEqual(keyPose(u, { ...t, keys: 2 }).fold, [0, 0])
})

test('feet touch the ground at contact, and lift while passing', () => {
  const fox = makeCreature(500)
  const sk = fox.skeleton
  poseKeys(sk, 0, { keys: 4, hold: false, cycle: 1 })
  for (const f of feet(sk)) assert.ok(Math.abs(f[1]) < 0.03, `contact foot at ${f[1]}`)
  poseKeys(sk, 0.25, { keys: 4, hold: false, cycle: 1 })
  const ys = feet(sk).map((f) => f[1])
  assert.ok(Math.max(...ys) > 0.1, `passing feet ${ys}`)
  // a faster cycle moves the planted feet faster
  assert.ok(Math.abs(footSpeed(sk, 0.5) - 2 * footSpeed(sk, 1)) < 1e-6)
})
