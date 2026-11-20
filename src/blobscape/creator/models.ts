import { Blobs } from '../../splat-core/blobs.ts'
import { mulQ, Skeleton } from '../../splat-engine/rig.ts'
import { sampleClip, sampleWeights, type Clip, type Rigged } from '../../splat-engine/glb.ts'
import { applyMorphs, type Morph } from '../../splat-engine/morph.ts'
import { SIZE_RANGE, placer, type Placement, type Placer, type PropRef } from '../../splat-engine/project.ts'
import { pack, unpack, type PackedCut } from './pack.ts'

/**
 * Your own models as props (Scene Creator phase 2, #367): a rigged splat .glb (ours, as Splat Creatures saves them)
 * opened in the page. A project names one as `model-<hash of its bytes>`; the model itself is kept here, in the
 * page, for as long as it is open (#370 keeps it in the browser), and handed to the cut worker with each job, already
 * stood on its foot (`rest`). It plays its clips and morphs as Splat Creatures plays them.
 */

/** What a model's id starts with. */
export const MODEL_PREFIX = 'model-'

/** A model opened as a prop. */
export interface ModelProp {
  /** `model-` and a hash of the file's bytes, so opening the same file twice is one model. */
  id: string
  /** Its own name, else the file's. */
  name: string
  /** Its blobs, skin and bones, standing with its foot at the origin: the middle of its footprint on its lowest blob. */
  rest: PackedCut
  /** Its clips, as the file has them. */
  clips: Clip[]
  /** Its blend shapes, which the clips key. */
  morphs?: Morph[]
  /** The file's name. */
  file: string
}

/** Whether a prop is a model opened in the page. */
export const isModel = (ref: PropRef): ref is string => typeof ref === 'string' && ref.startsWith(MODEL_PREFIX)

/** A model's id from its file's bytes: FNV-1a over them, and their length. */
export function modelId(bytes: Uint8Array): string {
  let h = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0 }
  return `${MODEL_PREFIX}${h.toString(16).padStart(8, '0')}${bytes.length.toString(36)}`
}

const models = new Map<string, ModelProp>()
/** The model a prop names, if the page has it. */
export const modelOf = (id: string): ModelProp | undefined => models.get(id)
/** Keeps a model for the page's life. */
export const keepModel = (m: ModelProp) => { models.set(m.id, m) }
/** Every model the page has, oldest first. */
export const keptModels = (): ModelProp[] => [...models.values()]

/** A rigged file as a model: moved so its foot is the origin (the clips only turn and shift bones, so they still fit). */
export function modelFrom(r: Rigged, file: string, bytes: Uint8Array): ModelProp {
  const b = r.blobs, n = b.count
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = b.center[i * 3 + k]; lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v) }
  const shift = n ? [-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2] : [0, 0, 0]
  const moved = (p: ArrayLike<number>): [number, number, number] => [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]]
  const blobs = new Blobs(n)
  blobs.count = n
  for (let i = 0; i < n; i++) blobs.center.set(moved(b.center.subarray(i * 3, i * 3 + 3)), i * 3)
  blobs.scale.set(b.scale.subarray(0, n * 3))
  blobs.quat.set(b.quat.subarray(0, n * 4))
  blobs.color.set(b.color.subarray(0, n * 3))
  blobs.opacity.set(b.opacity.subarray(0, n))
  const bones = r.skeleton.bones.map((x) => ({ ...x, head: moved(x.head), tail: x.tail && moved(x.tail) }))
  const rest = pack({ blobs, skin: r.skin, skeleton: new Skeleton(bones), partOf: new Uint16Array(n) })
  const name = r.name?.trim() || file.replace(/\.[^.]*$/, '') || 'Model'
  return { id: modelId(bytes), name: name[0].toUpperCase() + name.slice(1), rest, clips: r.clips, morphs: r.morphs?.length ? r.morphs : undefined, file }
}

/** How tall a model is set down, before it is fitted to the land (#371): about a door's half, between a sheep and the cook. */
export const MODEL_HEIGHT = 0.6

/** The size a model is set down at, so it stands `MODEL_HEIGHT` tall. */
export function modelSize(m: ModelProp): number {
  let top = 0
  for (let i = 0; i < m.rest.count; i++) top = Math.max(top, m.rest.center[i * 3 + 1])
  const s = top > 0 ? MODEL_HEIGHT / top : 1
  return Math.round(Math.min(SIZE_RANGE[1], Math.max(SIZE_RANGE[0], s)) * 1e4) / 1e4
}

/** The clip a model plays in a scene: one that stays on the spot by its name (idle, stand, float, rest), else its first. */
export const modelClip = (m: ModelProp): Clip | undefined => m.clips.find((c) => /idle|stand|float|rest|breath/i.test(c.name)) ?? m.clips[0]

/** A clip's time `t` seconds into a scene's loop: played a whole number of times a loop, so the scene still joins. */
export function clipTime(clip: Clip, loop: number, t: number): number {
  const end = clip.times[clip.times.length - 1] || 0
  if (!(end > 0)) return 0
  const times = Math.max(1, Math.round(loop / end))
  return (((t % loop) + loop) % loop) * (times * end) / loop
}

/** Poses a model's own bones `t` seconds into a scene's loop, from its clip; at rest when it has none. */
export function poseModel(m: ModelProp, sk: Skeleton, loop: number, t: number) {
  const clip = modelClip(m)
  if (clip) sampleClip(clip, sk, clipTime(clip, loop, t))
  else sk.reset()
}

/**
 * A placed model's morphs: the weights its clip gives at a time reshape its rest blobs (before skinning, as the
 * engine does), which are then stood where the cut was placed and written over the cut's own blobs. `update` says
 * whether anything changed, so the page sends the shapes up only then.
 */
export class PlacedMorphs {
  private readonly m: ModelProp & { morphs: Morph[] }
  private readonly rest: Blobs
  private readonly out: Blobs
  private readonly t: Placer
  private readonly w: Float32Array
  private readonly was: Float32Array
  constructor(m: ModelProp & { morphs: Morph[] }, at: Placement) {
    this.m = m
    this.rest = unpack(m.rest).blobs
    this.out = new Blobs(this.rest.count)
    this.t = placer([0, 0, 0], at)
    this.w = new Float32Array(m.morphs.length)
    this.was = new Float32Array(m.morphs.length).fill(NaN)
  }

  /** Reshapes `into` (the placed cut's blobs, its rest first) for `t` seconds into a loop; true when it changed. */
  update(into: Blobs, loop: number, t: number): boolean {
    const clip = modelClip(this.m)
    if (!sampleWeights(clip, clip ? clipTime(clip, loop, t) : 0, this.w)) this.w.fill(0)
    if (this.w.every((v, k) => v === this.was[k])) return false
    this.was.set(this.w)
    applyMorphs(this.rest, this.m.morphs, this.w, this.out)
    const t2 = this.t
    for (let i = 0; i < this.out.count; i++) {
      into.center.set(t2.point(this.out.center.subarray(i * 3, i * 3 + 3)), i * 3)
      for (let k = 0; k < 3; k++) into.scale[i * 3 + k] = this.out.scale[i * 3 + k] * t2.size
      into.quat.set(mulQ(t2.q, this.out.quat.subarray(i * 4, i * 4 + 4)), i * 4)
    }
    return true
  }
}
