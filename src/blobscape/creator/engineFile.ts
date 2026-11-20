import { Blobs } from '../../splat-core/blobs.ts'
import { recordClip, type Clip, type Rigged } from '../../splat-engine/glb.ts'
import { Skeleton, type Bone, type Skin } from '../../splat-engine/rig.ts'

/**
 * A scene for the engine (#387): the land and every prop, each a rig of its own while editing, joined into one rigged
 * splat model with one clip of the scene's loop, which `@blobscape/engine`'s `Stage` and `<blobscape-creature>` play.
 * Bone 0, `SCENE_ROOT`, never moves; each piece's bones hang under it named `<piece>/<bone>`, and its blobs ride them
 * as they do on the page. Lights, the sky and the style are not in the file.
 */

export const SCENE_ROOT = 'scene'
export const LOOP_CLIP = 'loop'
/** Joints are bytes in the file. */
export const MOST_BONES = 255
const FPS = 24

/** One piece as cut: its blobs at rest, which bones move them, and its bones. */
export interface RigPiece {
  name: string
  blobs: Blobs
  skin: Skin
  skeleton: Skeleton
}

/** Bones the file would hold. */
export const bonesIn = (pieces: readonly RigPiece[]) => 1 + pieces.reduce((n, p) => n + p.skeleton.count, 0)

/** A name made safe to stand before a `/` in a bone's name, unique among `taken`. */
function pieceName(name: string, taken: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'piece'
  let n = base
  for (let k = 2; taken.has(n); k++) n = `${base}-${k}`
  taken.add(n)
  return n
}

/**
 * The pieces joined. `pose(t)` poses every piece's own skeleton at time `t` (as the page does each frame); the clip
 * copies each piece's pose onto its bones, one whole `loop` at `FPS`. The pieces are put back at rest after.
 */
export function sceneRig(name: string, pieces: readonly RigPiece[], loop: number, pose: (t: number) => void): Rigged {
  const total = bonesIn(pieces)
  if (total > MOST_BONES) throw new RangeError(`A file holds at most ${MOST_BONES} bones; this scene has ${total}.`)
  const bones: Bone[] = [{ name: SCENE_ROOT, parent: -1, head: [0, 0, 0], tail: [0, 0.1, 0] }]
  const base: number[] = []
  const taken = new Set<string>()
  for (const p of pieces) {
    const at = bones.length
    base.push(at)
    const pre = pieceName(p.name, taken)
    for (const b of p.skeleton.bones) bones.push({ name: `${pre}/${b.name}`, parent: b.parent < 0 ? 0 : at + b.parent, head: [...b.head], ...(b.tail ? { tail: [...b.tail] } : {}) })
  }
  const count = pieces.reduce((n, p) => n + p.blobs.count, 0)
  const blobs = new Blobs(Math.max(1, count))
  blobs.count = count
  const skin: Skin = { joints: new Uint8Array(count * 4), weights: new Float32Array(count * 4) }
  let from = 0
  pieces.forEach((p, k) => {
    const b = p.blobs, n = b.count
    blobs.center.set(b.center.subarray(0, n * 3), from * 3)
    blobs.scale.set(b.scale.subarray(0, n * 3), from * 3)
    blobs.quat.set(b.quat.subarray(0, n * 4), from * 4)
    blobs.color.set(b.color.subarray(0, n * 3), from * 3)
    blobs.opacity.set(b.opacity.subarray(0, n), from)
    for (let i = 0; i < n * 4; i++) {
      const w = p.skin.weights[i]
      skin.weights[from * 4 + i] = w
      skin.joints[from * 4 + i] = w > 0 ? base[k] + p.skin.joints[i] : 0
    }
    from += n
  })
  const skeleton = new Skeleton(bones)
  const clips: Clip[] = []
  if (loop > 0) {
    clips.push(recordClip(LOOP_CLIP, skeleton, (sk, t) => {
      sk.reset()
      pose(t)
      pieces.forEach((p, k) => {
        const own = p.skeleton
        for (let b = 0; b < own.count; b++) {
          const o = base[k] + b
          sk.rotation.set(own.rotation.subarray(b * 4, b * 4 + 4), o * 4)
          sk.offset.set(own.offset.subarray(b * 3, b * 3 + 3), o * 3)
          sk.size[o] = own.size[b] * (b === 0 ? own.rootScale : 1)
        }
      })
      sk.update()
    }, loop, FPS))
    for (const p of pieces) { p.skeleton.reset(); p.skeleton.update() }
    skeleton.reset()
    skeleton.update()
  }
  return { name, blobs, skin, skeleton, clips }
}
