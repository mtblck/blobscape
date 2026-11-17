import { Blobs, type Vec3 } from '../splat-core/blobs.ts'
import { recordClip, sampleClip, type Clip, type Rigged } from '../splat-engine/glb.ts'
import { Skeleton, type Bone, type Skin } from '../splat-engine/rig.ts'
import type { Move, Species } from '../splat-engine/zoo/species.ts'
import { STILL, placeInto, placePoint, placingOf, poseActor, turnToLook, type Actor } from './actors.ts'

/**
 * The sandbox's scene as one rigged-splat .glb (issue #135), and back.
 *
 * Writing: bone 0, `SCENE_BONE`, holds the scene's own blobs and never moves;
 * each creature's bones hang under it, placed where the creature stands (its
 * size and facing baked into the rest pose), and its blobs ride them. One clip,
 * `SCENE_CLIP`, plays every creature's move together, long enough that each
 * loops cleanly where it can (`clipLength`). A creature walking about is saved
 * standing on its spot, playing its own move.
 *
 * Reading: a file whose bone 0 is `SCENE_BONE` comes apart again into the
 * scene's blobs and one creature per bone under it (`splitScene`); any other
 * rigged .glb is one creature. Either way a creature from a file is a `Species`
 * whose moves are the file's clips (`fileSpecies`).
 */

export const SCENE_BONE = 'sandbox-scene'
export const SCENE_CLIP = 'scene'
/** Joints are bytes in the file. */
export const MAX_FILE_BONES = 255
/** The longest the scene's clip runs, in seconds. */
const MAX_CLIP = 24
const FPS = 24

/** A move's period, or 0 when it stands still. */
const periodOf = (a: Actor) => (a.move === STILL ? 0 : a.species.moves.find((m) => m.name === a.move)?.seconds ?? 0)

/**
 * The clip's length: the longest move, or a few of it when that lets every
 * shorter move loop a whole number of times too (within 2%), at most MAX_CLIP.
 */
export function clipLength(periods: number[]): number {
  const ps = periods.filter((p) => p > 0)
  if (!ps.length) return 0
  const longest = Math.max(...ps)
  for (let m = 1; m * longest <= MAX_CLIP; m++) {
    const L = m * longest
    if (ps.every((p) => { const k = L / p; return Math.abs(k - Math.round(k)) * p < 0.02 * p })) return L
  }
  return Math.min(longest, MAX_CLIP)
}

/** A creature standing on its spot (walking about is left out of the file). */
const standing = (a: Actor): Actor => ({ ...a, roam: 0 })

/** Bones the whole scene's file would hold. */
export const sceneBones = (actors: readonly Actor[]) => 1 + actors.reduce((n, a) => n + a.body.skeleton.count, 0)

/**
 * The scene and its creatures as one rigged model. `clock` is each creature's
 * time now, where its clip starts; `gazeAt` is where any watching creature looks.
 */
export function sceneRig(scene: Blobs, actors: readonly Actor[], clock: (a: Actor) => number, gazeAt?: (a: Actor) => Vec3 | null): Rigged {
  if (sceneBones(actors) > MAX_FILE_BONES) throw new Error(`The file can hold ${MAX_FILE_BONES} bones; these creatures have ${sceneBones(actors) - 1}`)
  const list = actors.map(standing)
  const bones: Bone[] = [{ name: SCENE_BONE, parent: -1, head: [0, 0, 0], tail: [0, 0.1, 0] }]
  const base: number[] = []
  const names = new Map<string, number>()
  for (const a of list) {
    const P = placingOf(a)
    const sk = a.body.skeleton
    base.push(bones.length)
    const n = (names.get(a.species.id) ?? 0) + 1
    names.set(a.species.id, n)
    for (const b of sk.bones) {
      bones.push({
        name: `${a.species.id}${n}/${b.name}`,
        parent: b.parent < 0 ? 0 : base[base.length - 1] + b.parent,
        head: placePoint(b.head, P),
        ...(b.tail ? { tail: placePoint(b.tail, P) } : {}),
      })
    }
  }
  const total = scene.count + list.reduce((n, a) => n + a.body.blobs.count, 0)
  const blobs = new Blobs(Math.max(1, total))
  blobs.count = total
  const skin: Skin = { joints: new Uint8Array(total * 4), weights: new Float32Array(total * 4) }
  // The scene's own blobs, all on bone 0
  blobs.center.set(scene.center.subarray(0, scene.count * 3))
  blobs.scale.set(scene.scale.subarray(0, scene.count * 3))
  blobs.quat.set(scene.quat.subarray(0, scene.count * 4))
  blobs.color.set(scene.color.subarray(0, scene.count * 3))
  blobs.opacity.set(scene.opacity.subarray(0, scene.count))
  for (let i = 0; i < scene.count; i++) skin.weights[i * 4] = 1
  let from = scene.count
  list.forEach((a, k) => {
    const rest = a.body.blobs, n = rest.count
    placeInto(rest, placingOf(a), blobs, from)
    for (let i = 0; i < n * 4; i++) {
      const w = a.body.skin.weights[i]
      skin.weights[from * 4 + i] = w
      skin.joints[from * 4 + i] = w > 0 ? base[k] + a.body.skin.joints[i] : 0
    }
    from += n
  })
  const skeleton = new Skeleton(bones)
  const L = clipLength(list.map(periodOf))
  const clips: Clip[] = []
  if (L > 0) {
    const t0 = list.map((a) => clock(a))
    clips.push(recordClip(SCENE_CLIP, skeleton, (sk, t) => {
      sk.reset()
      list.forEach((a, k) => {
        const own = a.body.skeleton, P = placingOf(a)
        poseActor(a, t0[k] + t)
        const point = a.gaze !== 'ahead' ? gazeAt?.(a) : null
        if (point) turnToLook(a, point, P)
        // The creature's pose turned by its facing and scaled by its size: q' = R q R⁻¹, offsets turned and scaled
        const { qy, qw, k: s } = P
        for (let b = 0; b < own.count; b++) {
          const o = base[k] + b
          const x = own.rotation[b * 4], y = own.rotation[b * 4 + 1], z = own.rotation[b * 4 + 2], w = own.rotation[b * 4 + 3]
          // R q (R = (0, qy, 0, qw)), then times R⁻¹ = (0, −qy, 0, qw)
          const ax = qw * x + qy * z, ay = qw * y + qy * w, az = qw * z - qy * x, aw = qw * w - qy * y
          sk.rotation[o * 4] = ax * qw + az * qy
          sk.rotation[o * 4 + 1] = ay * qw - aw * qy
          sk.rotation[o * 4 + 2] = az * qw - ax * qy
          sk.rotation[o * 4 + 3] = aw * qw + ay * qy
          const ox = own.offset[b * 3] * s, oy = own.offset[b * 3 + 1] * s, oz = own.offset[b * 3 + 2] * s
          sk.offset[o * 3] = ox * P.c + oz * P.s
          sk.offset[o * 3 + 1] = oy
          sk.offset[o * 3 + 2] = -ox * P.s + oz * P.c
          sk.size[o] = own.size[b] * (b === 0 ? own.rootScale : 1)
        }
      })
      sk.update()
    }, L, FPS))
    for (const a of list) { a.body.skeleton.reset(); a.body.skeleton.update() }
    skeleton.reset(); skeleton.update()
  }
  return { name: 'Sandbox scene', blobs, skin, skeleton, clips }
}

/** A creature from a file: its body as read, its clips as moves. */
export function fileSpecies(r: Rigged, name: string, id = 'file'): Species {
  const moves: Move[] = r.clips.map((c) => ({
    name: c.name, label: c.name === SCENE_CLIP ? 'Play' : c.name, doing: c.name === SCENE_CLIP ? 'moving as saved' : `playing ${c.name}`,
    seconds: Math.max(1e-3, c.times[c.times.length - 1]),
    pose: (sk, t) => sampleClip(c, sk, t),
  }))
  return {
    id, name, blurb: '', detail: [r.blobs.count], start: r.blobs.count,
    looks: [{ id: 'file', label: 'From file' }],
    make: () => ({ blobs: r.blobs, skin: r.skin, skeleton: r.skeleton }),
    moves,
    view: { target: [0, 0.5, 0], distance: 3, azimuth: 30, elevation: 15 },
  }
}

/**
 * A scene file taken apart: the blobs on bone 0, and one rigged model per bone
 * under it, with its bones, blobs and clip tracks. Null for a file that isn't
 * a sandbox scene.
 */
export function splitScene(r: Rigged): { scene: Blobs; parts: Rigged[] } | null {
  const sk = r.skeleton
  if (sk.bones[0]?.name !== SCENE_BONE) return null
  const n = r.blobs.count
  // Which part each bone belongs to: the child of bone 0 it hangs from
  const part = new Int32Array(sk.count).fill(-1)
  const roots: number[] = []
  sk.bones.forEach((b, i) => {
    if (i === 0) return
    if (b.parent === 0) { part[i] = roots.length; roots.push(i) } else part[i] = part[b.parent]
  })
  // Each blob goes with the part of its heaviest bone; blobs on bone 0 are the scene
  const owner = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    let best = 0, bw = -1
    for (let j = 0; j < 4; j++) if (r.skin.weights[i * 4 + j] > bw) { bw = r.skin.weights[i * 4 + j]; best = r.skin.joints[i * 4 + j] }
    owner[i] = best === 0 ? -1 : part[best]
  }
  const pick = (want: number) => {
    let count = 0
    for (let i = 0; i < n; i++) if (owner[i] === want) count++
    const b = new Blobs(Math.max(1, count))
    const ids: number[] = []
    for (let i = 0; i < n; i++) if (owner[i] === want) { b.push(r.blobs.get(i)); ids.push(i) }
    return { b, ids }
  }
  const scene = pick(-1).b
  const parts = roots.map((_, p) => {
    const keep = sk.bones.map((_, i) => i).filter((i) => part[i] === p)
    const index = new Map(keep.map((i, k) => [i, k]))
    const bones: Bone[] = keep.map((i) => {
      const b = sk.bones[i]
      return { name: b.name.replace(/^[^/]*\//, ''), parent: b.parent === 0 ? -1 : index.get(b.parent)!, head: [...b.head] as Vec3, ...(b.tail ? { tail: [...b.tail] as Vec3 } : {}) }
    })
    const { b, ids } = pick(p)
    const skin: Skin = { joints: new Uint8Array(b.count * 4), weights: new Float32Array(b.count * 4) }
    ids.forEach((i, k) => {
      for (let j = 0; j < 4; j++) {
        const joint = index.get(r.skin.joints[i * 4 + j])
        // A weight on a bone outside the part (the scene's) goes to the part's root
        skin.joints[k * 4 + j] = joint ?? 0
        skin.weights[k * 4 + j] = r.skin.weights[i * 4 + j]
      }
    })
    const clips: Clip[] = r.clips.map((c) => ({
      name: c.name, times: c.times,
      rotations: keep.map((i) => c.rotations[i]),
      ...(c.offsets ? { offsets: keep.map((i) => c.offsets![i]) } : {}),
      ...(c.sizes ? { sizes: keep.map((i) => c.sizes![i]) } : {}),
    }))
    const name = sk.bones[roots[p]].name.split('/')[0].replace(/\d+$/, '')
    return { name, blobs: b, skin, skeleton: new Skeleton(bones), clips }
  })
  return { scene, parts }
}
