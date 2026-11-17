import * as THREE from 'three'
import type { SplatSkinning } from '@sparkjsdev/spark'
import type { Skeleton, Skin } from '../rig.ts'
import { skinMatrices, type ThreeRig } from './rigged.ts'

/**
 * Hands a skeleton to Spark's `SplatSkinning`: ours (the engine lab's
 * side-by-side runs) or a rigged-splat file's bones in three.js
 * (`./rigged.ts`, issue #136). The binding is pure (no renderer), so Node
 * tests can check it; `sparkRig` builds the mesh too, so it needs Spark's
 * renderer running.
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

/** Copies skin transforms (column-major 4×4s, as `skinMatrices` gives) into Spark, then flags the mesh for an update. */
export function poseSparkMatrices(sk: SplatSkinning, matrices: Float32Array, bones: number) {
  for (let b = 0; b < bones; b++) {
    m4.fromArray(matrices, b * 16)
    if (sk.mode === 'linear_blend') sk.setBoneMatrix(b, m4)
    else {
      // dual quaternions carry no scale: a bone that grows shows unscaled
      m4.decompose(v3, q4, s3)
      sk.setBoneQuatPos(b, q4, v3)
    }
  }
  sk.updateBones()
}

/** Sets up a `SplatSkinning` for a file's rig: every bone resting at the origin, every splat on its bones. */
export function bindSpark(sk: SplatSkinning, t: ThreeRig) {
  restAtOrigin(sk, t.bones.length)
  setSplatBones(sk, t.rig.skin, t.rig.blobs.count)
  sk.skinTexture.needsUpdate = true
}

export interface SparkRig {
  mesh: import('@sparkjsdev/spark').SplatMesh
  skinning: SplatSkinning
  /** Moves the splats to where the three.js bones are now; call after the mixer each frame. */
  update(): void
}

/**
 * A Spark `SplatMesh` of a rigged-splat file that follows its three.js bones.
 * Add `mesh` under the same parent as `t.root` (it skins relative to the
 * root, so give the mesh the root's transform). 'linear' blends matrices
 * like the file's own rule and needs Spark's covariance splats
 * (`new SparkRenderer({ covSplats: true, accumExtSplats: true })`); 'dual'
 * is Spark's default and can't show a bone grow.
 */
export async function sparkRig(t: ThreeRig, mode: 'linear' | 'dual' = 'dual'): Promise<SparkRig> {
  const { ExtSplats, PackedSplats, SplatMesh, SplatSkinning: Skinning, SplatSkinningMode } = await import('@sparkjsdev/spark')
  const b = t.rig.blobs, linear = mode === 'linear'
  const store = linear ? new ExtSplats({ maxSplats: b.count }) : new PackedSplats({ maxSplats: b.count })
  const c = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion(), col = new THREE.Color()
  for (let i = 0; i < b.count; i++) {
    c.fromArray(b.center, i * 3)
    s.fromArray(b.scale, i * 3)
    q.fromArray(b.quat, i * 4)
    col.setRGB(b.color[i * 3], b.color[i * 3 + 1], b.color[i * 3 + 2])
    store.setSplat(i, c, s, q, b.opacity[i], col)
  }
  let mesh: InstanceType<typeof SplatMesh>
  if (store instanceof ExtSplats) {
    // ExtSplats uploads its arrays only when it's made from them
    mesh = new SplatMesh({ extSplats: new ExtSplats({ extArrays: store.extArrays, numSplats: b.count }), covSplats: true })
  } else {
    store.numSplats = b.count
    store.needsUpdate = true
    mesh = new SplatMesh({ packedSplats: store })
  }
  await mesh.initialized
  const skinning = new Skinning({ mesh, numSplats: b.count, numBones: t.bones.length, mode: linear ? SplatSkinningMode.LINEAR_BLEND : SplatSkinningMode.DUAL_QUATERNION })
  bindSpark(skinning, t)
  mesh.skinning = skinning
  mesh.updateGenerator()
  const matrices = new Float32Array(t.bones.length * 16)
  const update = () => poseSparkMatrices(skinning, skinMatrices(t, matrices), t.bones.length)
  update()
  return { mesh, skinning, update }
}

const I = new THREE.Matrix4(), Q0 = new THREE.Quaternion(), V0 = new THREE.Vector3()
const j4 = new THREE.Vector4(), w4 = new THREE.Vector4(), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3()
