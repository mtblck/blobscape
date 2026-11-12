import * as THREE from 'three'
import type { SplatSkinning } from '@sparkjsdev/spark'
import type { Skeleton, Skin } from '../splat-engine/rig.ts'

/**
 * Hands our skeleton to Spark's `SplatSkinning`, for the engine lab's
 * side-by-side runs. Pure (no renderer), so Node tests can check it.
 *
 * Spark builds each bone's transform as "pose relative to rest", but composes
 * the two in an order that only matches glTF skinning when the rest pose is
 * the identity (see sparkSkinning.test.ts). So every bone rests at the origin,
 * unturned, and each frame we pass Spark the finished skin transform (posed ×
 * inverse rest) that our own `Skeleton.update()` already works out.
 *
 * Dual quaternions carry no scale, so in that mode a bone that grows (the
 * frog's tongue, the forest's plants) can't be shown; the fox never grows.
 */
export function restAtOrigin(sk: SplatSkinning, bones: number) {
  for (let b = 0; b < bones; b++) {
    if (sk.mode === 'linear_blend') sk.setRestMatrix(b, I)
    else sk.setRestQuatPos(b, Q0, V0)
  }
}

export function setSplatBones(sk: SplatSkinning, skin: Skin, count: number) {
  for (let i = 0; i < count; i++) {
    j4.fromArray(skin.joints, i * 4)
    w4.fromArray(skin.weights, i * 4)
    sk.setSplatBones(i, j4, w4)
  }
}

/** Copies the posed skeleton's skin transforms into Spark, then flags the mesh for an update. */
export function poseSpark(sk: SplatSkinning, skel: Skeleton) {
  for (let b = 0; b < skel.count; b++) {
    if (sk.mode === 'linear_blend') {
      m4.fromArray(skel.matrix, b * 16)
      sk.setBoneMatrix(b, m4)
    } else {
      q4.fromArray(skel.quat, b * 4)
      v3.set(skel.matrix[b * 16 + 12], skel.matrix[b * 16 + 13], skel.matrix[b * 16 + 14])
      sk.setBoneQuatPos(b, q4, v3)
    }
  }
  sk.updateBones()
}

const I = new THREE.Matrix4(), Q0 = new THREE.Quaternion(), V0 = new THREE.Vector3()
const j4 = new THREE.Vector4(), w4 = new THREE.Vector4(), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3()
