import { Blobs } from '../../splat-core/blobs.ts'
import { mulQ, Skeleton } from '../../splat-engine/rig.ts'
import { sampleClip, sampleWeights, type Clip, type Rigged } from '../../splat-engine/glb.ts'
import { applyMorphs, type Morph } from '../../splat-engine/morph.ts'
import { SIZE_RANGE, placer, type Placement, type Placer, type PropRef } from '../../splat-engine/project.ts'
import { fitMesh, meshBounds, type Mesh, type Texture } from '../../splat-engine/meshShape.ts'
import { splatModel } from '../../splat-engine/skinnedModel.ts'
import { pack, unpack, type PackedCut } from './pack.ts'

/**
 * Your own models as props (Scene Creator phase 2): a rigged splat .glb (ours, as Splat Creatures saves them, #367),
 * which plays its clips and morphs as Splat Creatures plays them, or a still mesh (.obj, .glb, #368), which is cut on
 * the scene's grid like any described part, so it takes the land's baked light, every style and the pixel palette.
 * A project names one as `model-<hash of its bytes>`; the model itself is kept here, in the page, for as long as it
 * is open (#370 keeps it in the browser), and handed to the cut worker with each job, already stood on its foot.
 */

/** What a model's id starts with. */
export const MODEL_PREFIX = 'model-'

/** A model opened as a prop: rigged splats, or a still mesh. */
export type ModelProp = SplatModel | MeshModel

interface ModelBase {
  /** `model-` and a hash of the file's bytes, so opening the same file twice is one model. */
  id: string
  /** Its own name, else the file's. */
  name: string
  /** The file's name. */
  file: string
  /** How tall it is in the file's own units (meters, in a glTF file), for fitting it to the scene (#371). */
  tall?: number
}

/** A rigged splat .glb. */
export interface SplatModel extends ModelBase {
  kind: 'splats'
  /** Its blobs, skin and bones, standing with its foot at the origin: the middle of its footprint on its lowest blob. */
  rest: PackedCut
  /** Its clips, as the file has them. */
  clips: Clip[]
  /** Its blend shapes, which the clips key. */
  morphs?: Morph[]
  /** Scattered over a mesh in its own flat colors (#369), so the cut lights it by the land's sun. */
  scattered?: boolean
  /** A splat scan opened as a land (#381), its scanned light taken out and the scene's lit in (#463). */
  scan?: boolean
}

/** A texture's pixels, decoded by the page (a worker and the tests take them as they are). */
export interface RawImage { width: number; height: number; data: Uint8ClampedArray }

/** A still mesh, cut like a scene's part. */
export interface MeshModel extends ModelBase {
  kind: 'mesh'
  /** Its triangles, standing with their foot at the origin, the longest side 1. */
  mesh: Mesh
  /** The textures `mesh.tex` points at. */
  images: RawImage[]
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
const forgotten = new Set<string>()
/** Keeps a model for the page's life. */
export const keepModel = (m: ModelProp) => { models.set(m.id, m); forgotten.delete(m.id) }
/** Takes a model out of the list; a scene using it still has it until the page closes. */
export const forgetKept = (id: string) => { forgotten.add(id) }
/** Every model the page lists, oldest first. */
export const keptModels = (): ModelProp[] => [...models.values()].filter((m) => !forgotten.has(m.id))

/** A rigged file as a model: moved so its foot is the origin (the clips only turn and shift bones, so they still fit). */
export function modelFrom(r: Rigged, file: string, bytes: Uint8Array, tall?: number): SplatModel {
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
  return { kind: 'splats', id: modelId(bytes), name: named(r.name, file), rest, clips: r.clips, morphs: r.morphs?.length ? r.morphs : undefined, file, tall: tall ?? (n ? hi[1] - lo[1] : undefined) }
}

const named = (own: string | undefined, file: string): string => {
  const name = own?.trim() || file.replace(/\.[^.]*$/, '').trim() || 'Your model'
  return name[0].toUpperCase() + name.slice(1)
}

/** A still mesh as a model: stood on its foot, its longest side 1 (`modelSize` sets it down at its height). */
export function meshModelFrom(mesh: Mesh, images: RawImage[], file: string, bytes: Uint8Array): MeshModel {
  const { min, max } = meshBounds(mesh)
  return { kind: 'mesh', id: modelId(bytes), name: named(undefined, file), mesh: fitMesh(mesh, 1), images, file, tall: max[1] - min[1] }
}

/**
 * How much of a mesh is open: the share of its edges not shared by exactly two triangles, its corners joined where
 * they lie within a hair of each other (files often split a corner by its normals or texture). A mesh is cut by
 * which side of its surface a point is on, so an open one cuts wrongly.
 */
export function openShare(m: Mesh): number {
  const P = m.positions, I = m.indices
  let size = 0
  for (let i = 0; i < P.length; i++) size = Math.max(size, Math.abs(P[i]))
  const q = 1e5 / Math.max(size, 1e-9)
  const at = new Map<string, number>(), id = new Uint32Array(P.length / 3)
  for (let v = 0; v < id.length; v++) {
    const key = `${Math.round(P[v * 3] * q)},${Math.round(P[v * 3 + 1] * q)},${Math.round(P[v * 3 + 2] * q)}`
    let k = at.get(key)
    if (k === undefined) { k = at.size; at.set(key, k) }
    id[v] = k
  }
  const edges = new Map<number, number>(), n = at.size
  for (let t = 0; t + 2 < I.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = id[I[t + e]], b = id[I[t + (e + 1) % 3]]
      if (a === b) continue
      const key = Math.min(a, b) * n + Math.max(a, b)
      edges.set(key, (edges.get(key) ?? 0) + 1)
    }
  }
  let open = 0
  for (const c of edges.values()) if (c !== 2) open++
  return edges.size ? open / edges.size : 1
}

/** The most of a mesh's edges that may be open for it to be cut as a solid. */
export const OPEN_MOST = 0.01

/** How many blobs a mesh is scattered into when it is not cut (rigged, or open): a prop's share of a phone's room. */
export const SCATTERED = 30_000

/**
 * A still mesh that is open, as rigged splats on one bone (#369): flat blobs scattered over its triangles by area
 * (`splatModel`), a unit tall, in its own colors. An open surface can't be cut as a solid, but it can be covered.
 */
export function scatteredStill(mesh: Mesh, name: string, textures: Texture[] = [], count = SCATTERED): Rigged {
  const n = mesh.positions.length / 3
  const weights = new Float32Array(n * 4)
  for (let v = 0; v < n; v++) weights[v * 4] = 1
  return splatModel(
    { name, mesh, joints: new Uint8Array(n * 4), weights, bones: [{ name: 'model', head: [0, 0, 0], parent: -1 }], clips: [], images: [] },
    { count, height: 1, textures },
  )
}

/** What the cut worker needs of a model: a rigged one's blobs at rest, or a mesh and its textures. */
export type ModelJob = { kind: 'splats'; rest: PackedCut; scattered?: boolean } | { kind: 'mesh'; mesh: Mesh; images: RawImage[] }
export const modelJob = (m: ModelProp): ModelJob => (m.kind === 'mesh' ? { kind: 'mesh', mesh: m.mesh, images: m.images } : { kind: 'splats', rest: m.rest, scattered: m.scattered })

/** A texture to read from a decoded image, nearest pixel and repeating, as glTF's default sampler wraps. */
export function rawTexture(im: RawImage): Texture {
  const { data, width: w, height: h } = im
  const wrap = (x: number, n: number) => ((Math.floor(x * n) % n) + n) % n
  return (u, v) => {
    const i = (wrap(v, h) * w + wrap(u, w)) * 4
    return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]
  }
}

/** How tall a model is set down when its own height says nothing: between a sheep and the cook. */
export const MODEL_HEIGHT = 0.6

/** Scene units to a meter: the scenes' people (the cook, the elf) stand about 1.3, as a person stands 1.7 m. */
export const PER_METER = 0.75

/** The least a model is set down tall, and the most as a share of the land's width, so it fits on it. */
export const FIT = { least: 0.15, share: 0.4 }

/**
 * How tall a model is set down on a land `span` across (#371): its own height in meters at the scenes' scale, as a
 * glTF file's units are, kept between `FIT.least` and `FIT.share` of the land, so a house fits on the hill and a
 * mouse can be seen; `MODEL_HEIGHT` when it has no height of its own.
 */
export function fittedHeight(tall: number | undefined, span: number): number {
  const most = Math.max(FIT.least * 2, span * FIT.share)
  if (!(tall && tall > 0 && Number.isFinite(tall))) return Math.min(MODEL_HEIGHT, most)
  return Math.min(most, Math.max(FIT.least, tall * PER_METER))
}

/** The size a model is set down at on a land `span` across, so it stands `fittedHeight` tall. */
export function modelSize(m: ModelProp, span = 3): number {
  let top = 0
  if (m.kind === 'mesh') for (let i = 1; i < m.mesh.positions.length; i += 3) top = Math.max(top, m.mesh.positions[i])
  else for (let i = 0; i < m.rest.count; i++) top = Math.max(top, m.rest.center[i * 3 + 1])
  const s = top > 0 ? fittedHeight(m.tall, span) / top : 1
  return Math.round(Math.min(SIZE_RANGE[1], Math.max(SIZE_RANGE[0], s)) * 1e4) / 1e4
}

/** The clip a model plays in a scene: one that stays on the spot by its name (idle, stand, float, rest), else its first. */
export const modelClip = (m: SplatModel): Clip | undefined => m.clips.find((c) => /idle|stand|float|rest|breath/i.test(c.name)) ?? m.clips[0]

/** A clip's time `t` seconds into a scene's loop: played a whole number of times a loop, so the scene still joins. */
export function clipTime(clip: Clip, loop: number, t: number): number {
  const end = clip.times[clip.times.length - 1] || 0
  if (!(end > 0)) return 0
  const times = Math.max(1, Math.round(loop / end))
  return (((t % loop) + loop) % loop) * (times * end) / loop
}

/** Poses a model's own bones `t` seconds into a scene's loop, from its clip; at rest when it has none. */
export function poseModel(m: SplatModel, sk: Skeleton, loop: number, t: number) {
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
  private readonly m: SplatModel & { morphs: Morph[] }
  private readonly rest: Blobs
  private readonly out: Blobs
  private readonly t: Placer
  private readonly w: Float32Array
  private readonly was: Float32Array
  constructor(m: SplatModel & { morphs: Morph[] }, at: Placement) {
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
