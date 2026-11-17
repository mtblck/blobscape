import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { SplatSkinning, SplatSkinningMode } from '@sparkjsdev/spark'
import { makeCreature, poseWalk } from '../splat-engine/creature.ts'
import { Skeleton, axisAngle, skinBlob } from '../splat-engine/rig.ts'
import { poseSpark, restAtOrigin, setSplatBones } from '../splat-engine/three/spark.ts'

/*
 * Checks the engine lab's Spark runs move the same fox the same way ours does.
 * Spark skins on the GPU, so this mirrors its two GLSL functions
 * (applyGsplatSkinning and applyCovSplatLBSkinning, Spark 2.4) over the bone and
 * skin data its JavaScript side writes.
 */

const fake = (n: number) => ({ numSplats: n, needsUpdate: false }) as never

function sparkCenter(sk: SplatSkinning, i: number, c: ArrayLike<number>): [number, number, number] {
  const d = sk.boneData
  const w = [0, 1, 2, 3].map((k) => (sk.skinData[i * 4 + k] & 0xff) / 255)
  const b = [0, 1, 2, 3].map((k) => (sk.skinData[i * 4 + k] >> 8) & 0xff)
  if (sk.mode === 'linear_blend') {
    const out = [0, 0, 0]
    for (let k = 0; k < 4; k++) {
      if (!w[k]) continue
      const o = b[k] * 16
      // mat3(v0.xyz | v0.w v1.xy | v1.zw v2.x) column by column, offset v2.yzw
      for (let r = 0; r < 3; r++) out[r] += w[k] * (d[o + r] * c[0] + d[o + 3 + r] * c[1] + d[o + 6 + r] * c[2] + d[o + 9 + r])
    }
    return out as [number, number, number]
  }
  const q = [0, 0, 0, 0], du = [0, 0, 0, 0]
  for (let k = 0; k < 4; k++) {
    if (!w[k]) continue
    const o = b[k] * 16
    let bq = [d[o], d[o + 1], d[o + 2], d[o + 3]], bd = [d[o + 4], d[o + 5], d[o + 6], d[o + 7]]
    if (k > 0 && q[0] * bq[0] + q[1] * bq[1] + q[2] * bq[2] + q[3] * bq[3] < 0) { bq = bq.map((x) => -x); bd = bd.map((x) => -x) }
    for (let j = 0; j < 4; j++) { q[j] += w[k] * bq[j]; du[j] += w[k] * bd[j] }
  }
  const n = Math.hypot(...q)
  const [x, y, z, ww] = q.map((v) => v / n), [dx, dy, dz, dw] = du.map((v) => v / n)
  const t = [
    2 * (-dw * x + dx * ww - dy * z + dz * y),
    2 * (-dw * y + dx * z + dy * ww - dz * x),
    2 * (-dw * z - dx * y + dy * x + dz * ww),
  ]
  const v = new THREE.Vector3(c[0], c[1], c[2]).applyQuaternion(new THREE.Quaternion(x, y, z, ww))
  return [v.x + t[0], v.y + t[1], v.z + t[2]]
}

/** Our skinning with the weights rounded to bytes as Spark stores them. */
function ourCenter(fox: ReturnType<typeof makeCreature>, i: number) {
  const w = [0, 1, 2, 3].map((k) => Math.round(fox.skin.weights[i * 4 + k] * 255) / 255)
  const out = new Float32Array(3), cov = new Float32Array(6)
  skinBlob(fox.blobs.center.subarray(i * 3, i * 3 + 3), [1, 1, 1], [0, 0, 0, 1], fox.skin.joints.subarray(i * 4, i * 4 + 4), w, fox.skeleton, 'linear', out, 0, cov, 0)
  return out
}

const dist = (a: ArrayLike<number>, b: ArrayLike<number>) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

function trottingFox(mode: SplatSkinningMode) {
  const fox = makeCreature(3000)
  const sk = new SplatSkinning({ mesh: fake(fox.blobs.count), numSplats: fox.blobs.count, numBones: fox.skeleton.count, mode })
  restAtOrigin(sk, fox.skeleton.count)
  setSplatBones(sk, fox.skin, fox.blobs.count)
  poseWalk(fox.skeleton, 0.3)
  poseSpark(sk, fox.skeleton)
  return { fox, sk }
}

test("Spark's linear blend, fed our skin matrices, puts every fox blob where ours does", () => {
  const { fox, sk } = trottingFox(SplatSkinningMode.LINEAR_BLEND)
  let worst = 0
  for (let i = 0; i < fox.blobs.count; i++) worst = Math.max(worst, dist(sparkCenter(sk, i, fox.blobs.center.subarray(i * 3)), ourCenter(fox, i)))
  assert.ok(worst < 1e-4, `worst ${worst}`)
})

test("Spark's dual quaternions agree with us on blobs held by one bone, and stay close on the rest", () => {
  const { fox, sk } = trottingFox(SplatSkinningMode.DUAL_QUATERNION)
  let single = 0, blended = 0
  for (let i = 0; i < fox.blobs.count; i++) {
    const d = dist(sparkCenter(sk, i, fox.blobs.center.subarray(i * 3)), ourCenter(fox, i))
    if (fox.skin.weights[i * 4] > 0.999) single = Math.max(single, d)
    else blended = Math.max(blended, d)
  }
  assert.ok(single < 1e-4, `single ${single}`)
  // dual quaternions bend a joint round an arc where a matrix blend cuts the corner: about 6 mm at most on the fox
  assert.ok(blended < 0.01, `blended ${blended}`)
})

test("Spark 2.4's rest pose only matches glTF skinning when it's the identity (why the lab rests bones at the origin)", () => {
  // One bone resting at (1, 0, 0), turned a quarter round its own head: a blob 1 along it should end up at (1, 1, 0).
  const arm = new Skeleton([{ name: 'a', parent: -1, head: [1, 0, 0] }])
  arm.setRotation(0, axisAngle([0, 0, 1], Math.PI / 2))
  arm.update()
  const ours = new Float32Array(3)
  skinBlob([2, 0, 0], [1, 1, 1], [0, 0, 0, 1], [0, 0, 0, 0], [1, 0, 0, 0], arm, 'linear', ours, 0, new Float32Array(6), 0)
  assert.deepEqual([...ours].map((v) => +v.toFixed(5)), [1, 1, 0])

  const q = new THREE.Quaternion(...arm.quat), head = new THREE.Vector3(1, 0, 0)
  for (const mode of [SplatSkinningMode.DUAL_QUATERNION, SplatSkinningMode.LINEAR_BLEND]) {
    const sk = new SplatSkinning({ mesh: fake(1), numSplats: 1, numBones: 1, mode })
    sk.setRestQuatPos(0, new THREE.Quaternion(), head)
    sk.setSplatBones(0, new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(1, 0, 0, 0))
    if (mode === SplatSkinningMode.LINEAR_BLEND) sk.setBoneMatrix(0, new THREE.Matrix4().compose(head, q, new THREE.Vector3(1, 1, 1)))
    else sk.setBoneQuatPos(0, q, head)
    const got = sparkCenter(sk, 0, [2, 0, 0]).map((v) => +v.toFixed(5))
    // Spark turns the blob about the origin instead of the bone's head. If this starts failing, Spark fixed it.
    assert.deepEqual(got, [0, 2, 0], mode)
  }
})
