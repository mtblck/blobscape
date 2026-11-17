import * as THREE from 'three'
import { readRiggedGlb, type Clip, type Rigged } from '../glb.ts'

/**
 * Rigged-splat .glb files in three.js (issue #136): the file's bones as a
 * `THREE.Bone` tree and its clips as `THREE.AnimationClip`s, so three's own
 * `AnimationMixer` plays them, and the splats themselves (`rig`) for whatever
 * draws them: Spark through `./spark.ts`, or our engine.
 *
 *   const r = await new RiggedSplatLoader().loadAsync('fox.glb')
 *   scene.add(r.root)
 *   const mixer = new THREE.AnimationMixer(r.root)
 *   mixer.clipAction(r.animations[0]).play()
 *   // each frame: mixer.update(dt); then skinMatrices(r) for the drawer
 *
 * Bones rest unturned at their heads (the file's rule), so a bone's local
 * place is its head less its parent's, plus any offset a clip keys, and its
 * scale is the clip's uniform size. A bone's skin transform is its world
 * matrix, taken relative to `root`, times the inverse of its rest place.
 * Morph targets are left out here: three has no morphs for splats to drive.
 */

export interface ThreeRig {
  /** What the file holds, as read: blobs, skin, our skeleton, clips, morphs. */
  rig: Rigged
  /** Holds the root bones; place it in the scene and the creature goes with it. */
  root: THREE.Group
  /** One per file bone, in the file's order. */
  bones: THREE.Bone[]
  skeleton: THREE.Skeleton
  /** The file's clips, keyed by the bones' (made unique, three-safe) names. */
  animations: THREE.AnimationClip[]
}

/** The rig's bones and clips in three.js terms. */
export function threeRig(rig: Rigged): ThreeRig {
  const sk = rig.skeleton
  const root = new THREE.Group()
  root.name = rig.name || 'rigged splats'
  // three binds tracks by node name, and dots, slashes and brackets mean something there
  const seen = new Set<string>()
  const names = sk.bones.map((b, i) => {
    let n = THREE.PropertyBinding.sanitizeNodeName(b.name) || `bone${i}`
    while (seen.has(n)) n = `${n}_${i}`
    seen.add(n)
    return n
  })
  const local = (i: number): [number, number, number] => {
    const b = sk.bones[i], h = b.head
    if (b.parent < 0) return [h[0], h[1], h[2]]
    const p = sk.bones[b.parent].head
    return [h[0] - p[0], h[1] - p[1], h[2] - p[2]]
  }
  const bones = sk.bones.map((_, i) => {
    const bone = new THREE.Bone()
    bone.name = names[i]
    bone.position.fromArray(local(i))
    return bone
  })
  sk.bones.forEach((b, i) => (b.parent < 0 ? root : bones[b.parent]).add(bones[i]))
  root.updateMatrixWorld(true)
  // rest is unturned at the head: the inverse is a move back from it
  const inverses = sk.bones.map((b) => new THREE.Matrix4().makeTranslation(-b.head[0], -b.head[1], -b.head[2]))
  const skeleton = new THREE.Skeleton(bones, inverses)
  const animations = rig.clips.map((c) => toAnimation(c, names, local))
  return { rig, root, bones, skeleton, animations }
}

function toAnimation(c: Clip, names: string[], local: (i: number) => [number, number, number]): THREE.AnimationClip {
  const times = Array.from(c.times)
  const n = times.length
  const tracks: THREE.KeyframeTrack[] = []
  c.rotations.forEach((r, b) => tracks.push(new THREE.QuaternionKeyframeTrack(`${names[b]}.quaternion`, times, Array.from(r.subarray(0, n * 4)))))
  c.offsets?.forEach((o, b) => {
    if (!o) return
    const h = local(b), v = new Array<number>(n * 3)
    for (let k = 0; k < n; k++) for (let j = 0; j < 3; j++) v[k * 3 + j] = h[j] + o[k * 3 + j]
    tracks.push(new THREE.VectorKeyframeTrack(`${names[b]}.position`, times, v))
  })
  c.sizes?.forEach((s, b) => {
    if (!s) return
    const v = new Array<number>(n * 3)
    for (let k = 0; k < n; k++) v[k * 3] = v[k * 3 + 1] = v[k * 3 + 2] = s[k]
    tracks.push(new THREE.VectorKeyframeTrack(`${names[b]}.scale`, times, v))
  })
  return new THREE.AnimationClip(c.name, times[n - 1] ?? 0, tracks)
}

/**
 * Each bone's skin transform now (column-major 4×4s, one after another):
 * where the bone is, relative to `root`, times the inverse of where it rests.
 * Call after the mixer has moved the bones.
 */
export function skinMatrices(t: ThreeRig, out = new Float32Array(t.bones.length * 16)): Float32Array {
  t.root.updateMatrixWorld(true)
  rootInverse.copy(t.root.matrixWorld).invert()
  t.bones.forEach((b, i) => {
    m.multiplyMatrices(rootInverse, b.matrixWorld).multiply(t.skeleton.boneInverses[i])
    m.toArray(out, i * 16)
  })
  return out
}

/** Opens rigged-splat .glb files, as three's other loaders open theirs. */
export class RiggedSplatLoader extends THREE.Loader<ThreeRig> {
  load(url: string, onLoad: (r: ThreeRig) => void, onProgress?: (e: ProgressEvent) => void, onError?: (err: unknown) => void) {
    const files = new THREE.FileLoader(this.manager)
    files.setPath(this.path)
    files.setResponseType('arraybuffer')
    files.setRequestHeader(this.requestHeader)
    files.setWithCredentials(this.withCredentials)
    files.load(url, (data) => {
      try { onLoad(this.parse(data as ArrayBuffer)) } catch (err) {
        if (onError) onError(err); else console.error(err)
        this.manager.itemError(url)
      }
    }, onProgress, onError)
  }

  parse(data: ArrayBuffer | Uint8Array): ThreeRig {
    return threeRig(readRiggedGlb(data instanceof Uint8Array ? data : new Uint8Array(data)))
  }
}

const m = new THREE.Matrix4(), rootInverse = new THREE.Matrix4()
