import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Skeleton, axisAngle, emptySkin, packWeights, setWeights, skinBlob } from './rig.ts'

const near = (a: number, b: number, eps = 1e-5) => Math.abs(a - b) < eps

function det3(c: Float32Array) {
  const [xx, xy, xz, yy, yz, zz] = c
  return xx * (yy * zz - yz * yz) - xy * (xy * zz - yz * xz) + xz * (xy * yz - yy * xz)
}

const arm = () => new Skeleton([
  { name: 'root', parent: -1, head: [0, 0, 0] },
  { name: 'fore', parent: 0, head: [1, 0, 0] },
])

test('the rest pose leaves every blob where it was', () => {
  const sk = arm()
  const c = new Float32Array(3), v = new Float32Array(6)
  skinBlob([1.5, 0.2, -0.3], [0.1, 0.2, 0.3], [0, 0, 0, 1], [1, 0, 0, 0], [1, 0, 0, 0], sk, 'quat', c, 0, v, 0)
  assert.ok(near(c[0], 1.5) && near(c[1], 0.2) && near(c[2], -0.3))
  assert.ok(near(v[0], 0.01) && near(v[3], 0.04) && near(v[5], 0.09))
})

test('a bent elbow carries the forearm blobs around the joint', () => {
  const sk = arm()
  sk.setRotation(1, axisAngle([0, 0, 1], Math.PI / 2))
  sk.update()
  const c = new Float32Array(3), v = new Float32Array(6)
  skinBlob([2, 0, 0], [0.1, 0.1, 0.1], [0, 0, 0, 1], [1, 0, 0, 0], [1, 0, 0, 0], sk, 'quat', c, 0, v, 0)
  assert.ok(near(c[0], 1) && near(c[1], 1) && near(c[2], 0), `${c}`)
  // posed head of the forearm stays at the elbow
  assert.ok(near(sk.posedHead[3], 1) && near(sk.posedHead[4], 0))
})

test('a child follows its parent', () => {
  const sk = arm()
  sk.setRotation(0, axisAngle([0, 1, 0], Math.PI))
  sk.update()
  assert.ok(near(sk.posedHead[3], -1) && near(sk.posedHead[5], 0, 1e-5), `${sk.posedHead}`)
})

test('on a half-twisted joint, averaging rotations keeps the blob whole and blending matrices squashes it', () => {
  const sk = arm()
  sk.setRotation(1, axisAngle([1, 0, 0], Math.PI)) // a full half-turn twist of the forearm
  sk.update()
  const c = new Float32Array(3)
  const q = new Float32Array(6), l = new Float32Array(6)
  const blob = [[1, 0.1, 0], [0.05, 0.2, 0.05], [0, 0, 0, 1]] as const
  skinBlob(...blob, [0, 1, 0, 0], [0.5, 0.5, 0, 0], sk, 'quat', c, 0, q, 0)
  skinBlob(...blob, [0, 1, 0, 0], [0.5, 0.5, 0, 0], sk, 'linear', c, 0, l, 0)
  const rest = (0.05 * 0.2 * 0.05) ** 2
  assert.ok(near(det3(q), rest, 1e-9), `quat keeps volume: ${det3(q)} vs ${rest}`)
  assert.ok(det3(l) < rest * 0.01, `linear collapses: ${det3(l)}`)
})

test('weights keep the strongest four and sum to one', () => {
  const s = emptySkin(1)
  setWeights(s, 0, [[0, 1], [1, 3], [2, 0.5], [3, 2], [4, 4]])
  assert.deepEqual([...s.joints], [4, 1, 3, 0])
  assert.ok(near(s.weights.reduce((a, b) => a + b, 0), 1))
})

test('root scale grows the whole creature from its root', () => {
  const sk = arm()
  sk.rootScale = 2
  sk.update()
  const c = new Float32Array(3), v = new Float32Array(6)
  skinBlob([2, 0, 0], [0.1, 0.1, 0.1], [0, 0, 0, 1], [1, 0, 0, 0], [1, 0, 0, 0], sk, 'quat', c, 0, v, 0)
  assert.ok(near(c[0], 4), `${c}`)
  assert.ok(near(v[0], 0.04))
})

test('packed byte weights always sum to 255, even from a file that does not normalise them', () => {
  for (const w of [[0, 0.5, 0.5, 0], [0.2, 0.2, 0.2, 0.2], [1, 0, 0, 0], [0, 0, 0, 0], [3, 1, 0, 0]]) {
    const word = packWeights(w, 0)
    const bytes = [0, 8, 16, 24].map((s) => (word >>> s) & 255)
    assert.equal(bytes.reduce((a, b) => a + b, 0), 255, `${w} → ${bytes}`)
  }
})
