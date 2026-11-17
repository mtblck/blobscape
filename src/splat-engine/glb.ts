import { SH_C0, srgbToLinear } from '../splat-core/color.ts'
import { Blobs, type Vec3 } from '../splat-core/blobs.ts'
import { Skeleton, norm4, packWeights, type Bone, type Skin } from './rig.ts'
import type { SplatMesh } from './mesh.ts'
import { morphWeight, targetCount, targetWeights, type Morph, type MorphTarget } from './morph.ts'

/**
 * Rigged splats in a .glb.
 *
 * The blobs are a KHR_gaussian_splatting primitive (POINTS, with SCALE,
 * ROTATION, OPACITY and the degree-0 color as extra attributes), so any
 * viewer that knows that extension shows the creature. The rig uses only
 * standard glTF: JOINTS_0 and WEIGHTS_0 on the same primitive, a skin, joint
 * nodes, and animation channels on those nodes.
 *
 * What glTF doesn't say is how a skinned *splat* turns, since a blob has a
 * rotation and a shape as well as a position. Our extension,
 * BLOBSCAPE_gaussian_skinning, says so: blob centers follow the usual linear
 * blend, and each blob's rotation is the weighted average of its bones'
 * rotations. It's listed as used, not required, so viewers that don't know it
 * still load the file, and most will show the creature standing still. The
 * full rule is written up in docs/rigged-splats.md.
 *
 * Morphs are standard glTF morph targets on the same primitive (POSITION
 * deltas, animated as the mesh node's `weights`), and our second extension,
 * BLOBSCAPE_gaussian_morphs, adds what a splat needs beside its center: a SHAPE
 * attribute per target (the morph's local 3×3 map minus identity, morph.ts) and
 * which targets are in-betweens of one morph. Viewers that know glTF morphs but
 * not the extension move the centers right and leave the shapes as they were.
 */
export const SKIN_EXTENSION = 'BLOBSCAPE_gaussian_skinning'
export const MORPH_EXTENSION = 'BLOBSCAPE_gaussian_morphs'
/** The morph target attribute holding each splat's shape change, G = J − I, as a column-major MAT3. */
export const SHAPE_ATTRIBUTE = `${MORPH_EXTENSION}:SHAPE`
const SPLATS = 'KHR_gaussian_splatting'
/** How a skinned blob turns and grows: the spec is docs/rigged-splats.md. */
export const SKIN_RULE = { rotationBlend: 'quaternionAverage', scaleBlend: 'weightedAverage' } as const

export interface Clip {
  name: string
  /** Seconds. */
  times: Float32Array
  /** Per bone, a rotation key per time (x, y, z, w). */
  rotations: Float32Array[]
  /** Per bone that moves, an offset key per time (x, y, z) on top of its rest place; missing for bones that never move. */
  offsets?: (Float32Array | undefined)[]
  /** Per bone that grows or shrinks, a uniform scale key per time; missing for bones that keep their size. */
  sizes?: (Float32Array | undefined)[]
  /** Each morph's weight per time (times × morphs, a key's weights together); missing for a clip that leaves them at 0. */
  weights?: Float32Array
}

export interface Rigged {
  name: string
  blobs: Blobs
  skin: Skin
  skeleton: Skeleton
  clips: Clip[]
  /** Blend shapes on the blobs (morph.ts), applied to the rest blobs before skinning; clips key their weights. */
  morphs?: Morph[]
}

/**
 * Records a clip by posing the skeleton at `fps` across `seconds`. Rotations
 * are kept for every bone; offsets and sizes only for bones that use them.
 * `weights`, if given, says each morph's weight at a time, and is keyed too.
 * Leaves the skeleton posed at the end.
 */
export function recordClip(name: string, sk: Skeleton, pose: (sk: Skeleton, t: number) => void, seconds: number, fps = 24, weights?: (t: number) => ArrayLike<number>): Clip {
  const n = Math.max(2, Math.round(seconds * fps) + 1)
  const nb = sk.count
  const times = new Float32Array(n)
  const rotations = sk.bones.map(() => new Float32Array(n * 4))
  const offsets = sk.bones.map(() => new Float32Array(n * 3))
  const sizes = sk.bones.map(() => new Float32Array(n))
  const moved = new Array<boolean>(nb).fill(false), grew = new Array<boolean>(nb).fill(false)
  const keyed: number[] = []
  for (let f = 0; f < n; f++) {
    const t = (f / (n - 1)) * seconds
    times[f] = t
    pose(sk, t)
    if (weights) keyed.push(...Array.from(weights(t)))
    for (let b = 0; b < nb; b++) {
      rotations[b].set(sk.rotation.subarray(b * 4, b * 4 + 4), f * 4)
      offsets[b].set(sk.offset.subarray(b * 3, b * 3 + 3), f * 3)
      sizes[b][f] = sk.size[b] * (b === 0 ? sk.rootScale : 1)
      moved[b] ||= sk.offset[b * 3] !== 0 || sk.offset[b * 3 + 1] !== 0 || sk.offset[b * 3 + 2] !== 0
      grew[b] ||= sizes[b][f] !== 1
    }
  }
  // neighboring keys on the same hemisphere, so linear interpolation takes the short way
  for (const r of rotations) for (let f = 1; f < n; f++) {
    const d = r[f * 4] * r[f * 4 - 4] + r[f * 4 + 1] * r[f * 4 - 3] + r[f * 4 + 2] * r[f * 4 - 2] + r[f * 4 + 3] * r[f * 4 - 1]
    if (d < 0) for (let k = 0; k < 4; k++) r[f * 4 + k] = -r[f * 4 + k]
  }
  // the root always gets an offset track, so a clip that bobs it is never read back as one that doesn't
  moved[0] = true
  return {
    name, times, rotations,
    offsets: offsets.map((o, b) => (moved[b] ? o : undefined)),
    ...(grew.some(Boolean) ? { sizes: sizes.map((s, b) => (grew[b] ? s : undefined)) } : {}),
    ...(weights ? { weights: Float32Array.from(keyed) } : {}),
  }
}

/**
 * Each morph's weight from a clip at time t (looping, interpolating keys), into
 * `out`. False, with `out` all 0, when the clip keys no weights.
 */
export function sampleWeights(clip: Clip | undefined, t: number, out: Float32Array) {
  out.fill(0)
  const w = clip?.weights
  if (!clip || !w || !out.length) return false
  const n = clip.times.length, m = w.length / n
  const end = clip.times[n - 1]
  const u = end > 0 ? ((t % end) + end) % end : 0
  let f = 0
  while (f < n - 2 && clip.times[f + 1] <= u) f++
  const span = clip.times[f + 1] - clip.times[f] || 1
  const a = n > 1 ? Math.min(1, Math.max(0, (u - clip.times[f]) / span)) : 0
  const g = Math.min(n - 1, f + 1)
  for (let k = 0; k < Math.min(m, out.length); k++) out[k] = w[f * m + k] * (1 - a) + w[g * m + k] * a
  return true
}

/** Poses the skeleton from a clip at time t (looping), interpolating keys. */
export function sampleClip(clip: Clip, sk: Skeleton, t: number) {
  const n = clip.times.length
  const end = clip.times[n - 1]
  const u = end > 0 ? ((t % end) + end) % end : 0
  let f = 0
  while (f < n - 2 && clip.times[f + 1] <= u) f++
  const span = clip.times[f + 1] - clip.times[f] || 1
  const a = Math.min(1, Math.max(0, (u - clip.times[f]) / span))
  clip.rotations.forEach((r, b) => {
    const q = [0, 1, 2, 3].map((k) => r[f * 4 + k] * (1 - a) + r[(f + 1) * 4 + k] * a)
    sk.setRotation(b, norm4(q))
  })
  sk.offset.fill(0)
  clip.offsets?.forEach((o, b) => { if (o) for (let k = 0; k < 3; k++) sk.offset[b * 3 + k] = o[f * 3 + k] * (1 - a) + o[(f + 1) * 3 + k] * a })
  sk.size.fill(1)
  sk.rootScale = 1
  clip.sizes?.forEach((s, b) => { if (s) sk.size[b] = s[f] * (1 - a) + s[f + 1] * a })
  sk.update()
}

// --- writing ---

interface Accessor {
  bufferView?: number; componentType: number; count: number; type: string; normalized?: boolean; min?: number[]; max?: number[]
  sparse?: { count: number; indices: { bufferView: number; componentType: number }; values: { bufferView: number } }
}

class BinWriter {
  chunks: Uint8Array[] = []
  length = 0
  views: { buffer: 0; byteOffset: number; byteLength: number }[] = []
  accessors: Accessor[] = []

  add(data: Float32Array | Uint8Array | Uint16Array | Uint32Array, componentType: number, type: string, count: number, extra: Partial<Accessor> = {}) {
    this.accessors.push({ bufferView: this.view(data), componentType, count, type, ...extra })
    return this.accessors.length - 1
  }

  /** A buffer view holding `data`, 4-byte aligned. */
  view(data: Float32Array | Uint8Array | Uint16Array | Uint32Array) {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    const pad = (4 - (this.length % 4)) % 4
    if (pad) { this.chunks.push(new Uint8Array(pad)); this.length += pad }
    this.views.push({ buffer: 0, byteOffset: this.length, byteLength: bytes.byteLength })
    this.chunks.push(bytes.slice())
    this.length += bytes.byteLength
    return this.views.length - 1
  }

  /**
   * A float accessor that is zero except at `indices` (a view of increasing indices, shared by every accessor of
   * one target): glTF's sparse accessor with no buffer view under it. No indices at all is all zeros.
   */
  addSparse(values: Float32Array, type: string, count: number, indices: { view: number; count: number; componentType: number } | undefined, extra: Partial<Accessor> = {}) {
    this.accessors.push({
      componentType: FLOAT, count, type, ...extra,
      ...(indices?.count ? { sparse: { count: indices.count, indices: { bufferView: indices.view, componentType: indices.componentType }, values: { bufferView: this.view(values) } } } : {}),
    })
    return this.accessors.length - 1
  }

  bytes() {
    const out = new Uint8Array(Math.ceil(this.length / 4) * 4)
    let o = 0
    for (const c of this.chunks) { out.set(c, o); o += c.byteLength }
    return out
  }
}

const FLOAT = 5126, UBYTE = 5121, USHORT = 5123, UINT = 5125

export function writeRiggedGlb(r: Rigged): Uint8Array {
  const { blobs, skin, skeleton } = r
  const n = blobs.count
  const w = new BinWriter()
  const pos = blobs.center.slice(0, n * 3)
  const min = [0, 1, 2].map((k) => { let m = Infinity; for (let i = 0; i < n; i++) m = Math.min(m, pos[i * 3 + k]); return m })
  const max = [0, 1, 2].map((k) => { let m = -Infinity; for (let i = 0; i < n; i++) m = Math.max(m, pos[i * 3 + k]); return m })
  const sh0 = new Float32Array(n * 3)
  for (let i = 0; i < n * 3; i++) sh0[i] = (blobs.color[i] - 0.5) / SH_C0
  const weights = skin.weights.slice(0, n * 4)
  const attributes: Record<string, number> = {
    POSITION: w.add(pos, FLOAT, 'VEC3', n, { min, max }),
    [`${SPLATS}:SCALE`]: w.add(blobs.scale.slice(0, n * 3), FLOAT, 'VEC3', n),
    [`${SPLATS}:ROTATION`]: w.add(blobs.quat.slice(0, n * 4), FLOAT, 'VEC4', n),
    [`${SPLATS}:OPACITY`]: w.add(blobs.opacity.slice(0, n), FLOAT, 'SCALAR', n),
    [`${SPLATS}:SH_DEGREE_0_COEF_0`]: w.add(sh0, FLOAT, 'VEC3', n),
    JOINTS_0: w.add(skin.joints.slice(0, n * 4), UBYTE, 'VEC4', n),
    WEIGHTS_0: w.add(weights, FLOAT, 'VEC4', n),
  }

  const morphs = r.morphs?.length ? r.morphs : undefined
  const targets = morphs ? writeTargets(w, morphs, n) : undefined

  const rig = writeRig(w, r.name, skeleton, r.clips, morphs)

  const bin = w.bytes()
  const json = {
    asset: { version: '2.0', generator: 'Blobscape' },
    extensionsUsed: [SPLATS, SKIN_EXTENSION, ...(morphs ? [MORPH_EXTENSION] : [])],
    scene: 0,
    scenes: [{ nodes: rig.sceneNodes }],
    nodes: rig.nodes,
    meshes: [{
      name: r.name,
      primitives: [{
        mode: 0,
        attributes,
        ...(targets ? { targets: targets.targets } : {}),
        extensions: {
          [SPLATS]: {
            kernel: 'ellipse', colorSpace: 'srgb_rec709_display', projection: 'perspective', sortingMethod: 'cameraDistance',
            // KHR_gaussian_splatting asks extensions that build on it to sit inside its own object (docs/rigged-splats.md)
            extensions: { [SKIN_EXTENSION]: SKIN_RULE, ...(targets ? { [MORPH_EXTENSION]: targets.extension } : {}) },
          },
        },
      }],
      // every morph starts at 0; targetNames is where three.js and Blender look for the names
      ...(targets ? { weights: targets.names.map(() => 0), extras: { targetNames: targets.names } } : {}),
    }],
    skins: [rig.skin],
    animations: rig.animations,
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: w.views,
    accessors: w.accessors,
  }
  return packGlb(json, bin)
}

/** How a morph target's shape change is applied: J = I + Σ w·SHAPE, and the splat's covariance becomes J Σ Jᵀ (docs/rigged-splats.md). */
export const MORPH_RULE = { shapeBlend: 'linearMap' } as const

/**
 * The morphs as glTF morph targets: a POSITION delta and a SHAPE change per
 * target, in-betweens as targets of their own in order. A target that moves
 * under half the blobs is written sparse, so a tail's morph costs the tail's
 * blobs, not the whole creature's.
 */
function writeTargets(w: BinWriter, morphs: Morph[], n: number) {
  const targets: Record<string, number>[] = []
  const names: string[] = []
  const groups: { name: string; targets: number[] }[] = []
  for (const m of morphs) {
    const ids: number[] = []
    m.targets.forEach((t, k) => {
      ids.push(targets.length)
      names.push(m.targets.length > 1 ? `${m.name} ${k + 1}/${m.targets.length}` : m.name)
      targets.push(writeTarget(w, t, n))
    })
    groups.push({ name: m.name, targets: ids })
  }
  return { targets, names, extension: { ...MORPH_RULE, morphs: groups } }
}

function writeTarget(w: BinWriter, t: MorphTarget, n: number) {
  const touched: number[] = []
  for (let i = 0; i < n; i++) {
    let any = t.delta[i * 3] !== 0 || t.delta[i * 3 + 1] !== 0 || t.delta[i * 3 + 2] !== 0
    for (let k = 0; !any && k < 9; k++) any = t.grad[i * 9 + k] !== 0
    if (any) touched.push(i)
  }
  // glTF stores a MAT3 by columns; morph.ts keeps grad by rows
  const column = (i: number, out: Float32Array, o: number) => { for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) out[o + c * 3 + r] = t.grad[i * 9 + r * 3 + c] }
  // the untouched blobs' zeros count too
  const min = [0, 1, 2].map(() => (touched.length < n ? 0 : Infinity)), max = min.map((v) => -v)
  for (const i of touched) for (let k = 0; k < 3; k++) { const v = t.delta[i * 3 + k]; min[k] = Math.min(min[k], v); max[k] = Math.max(max[k], v) }
  if (touched.length * 2 < n) {
    const m = touched.length
    const idx = n > 65535 ? Uint32Array.from(touched) : Uint16Array.from(touched)
    const indices = m ? { view: w.view(idx), count: m, componentType: n > 65535 ? UINT : USHORT } : undefined
    const d = new Float32Array(m * 3), g = new Float32Array(m * 9)
    touched.forEach((i, j) => { d.set(t.delta.subarray(i * 3, i * 3 + 3), j * 3); column(i, g, j * 9) })
    return { POSITION: w.addSparse(d, 'VEC3', n, indices, { min, max }), [SHAPE_ATTRIBUTE]: w.addSparse(g, 'MAT3', n, indices) }
  }
  const g = new Float32Array(n * 9)
  for (let i = 0; i < n; i++) column(i, g, i * 9)
  return { POSITION: w.add(t.delta.slice(0, n * 3), FLOAT, 'VEC3', n, { min, max }), [SHAPE_ATTRIBUTE]: w.add(g, FLOAT, 'MAT3', n) }
}

/** A bone's place relative to its parent's head (its glTF node translation) in the rest pose. */
function restTranslation(skeleton: Skeleton, i: number): Vec3 {
  const b = skeleton.bones[i]
  if (b.parent < 0) return [b.head[0], b.head[1], b.head[2]]
  const p = skeleton.bones[b.parent].head
  return [b.head[0] - p[0], b.head[1] - p[1], b.head[2] - p[2]]
}

/**
 * The rig, shared by both writers: node 0 is the mesh, node 1 + i is bone i,
 * placed by its offset from its parent's head (no rest rotation), with an
 * inverse bind matrix per bone, and each clip as rotation channels on the
 * bone nodes, plus translation and scale channels on the bones that move or grow.
 */
function writeRig(w: BinWriter, name: string, skeleton: Skeleton, clips: Clip[], morphs?: Morph[]) {
  const nb = skeleton.count
  const ibm = new Float32Array(nb * 16)
  const nodes: Record<string, unknown>[] = [{ name, mesh: 0, skin: 0 }]
  skeleton.bones.forEach((b, i) => {
    const t = restTranslation(skeleton, i)
    const children = skeleton.bones.map((c, j) => (c.parent === i ? j + 1 : -1)).filter((j) => j >= 0)
    nodes.push({ name: b.name, translation: [...t], ...(children.length ? { children } : {}) })
    ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.head[0], -b.head[1], -b.head[2], 1], i * 16)
  })
  const ibmAcc = w.add(ibm, FLOAT, 'MAT4', nb)
  const roots = skeleton.bones.map((b, i) => (b.parent < 0 ? i + 1 : -1)).filter((i) => i >= 0)

  const animations = clips.map((clip) => {
    const input = w.add(clip.times, FLOAT, 'SCALAR', clip.times.length, { min: [clip.times[0]], max: [clip.times[clip.times.length - 1]] })
    const samplers: Record<string, unknown>[] = []
    const channels: Record<string, unknown>[] = []
    clip.rotations.forEach((rot, b) => {
      samplers.push({ input, output: w.add(rot, FLOAT, 'VEC4', clip.times.length), interpolation: 'LINEAR' })
      channels.push({ sampler: samplers.length - 1, target: { node: b + 1, path: 'rotation' } })
    })
    clip.offsets?.forEach((off, b) => {
      if (!off) return
      const rest = restTranslation(skeleton, b)
      const tr = new Float32Array(clip.times.length * 3)
      for (let f = 0; f < clip.times.length; f++) for (let k = 0; k < 3; k++) tr[f * 3 + k] = rest[k] + off[f * 3 + k]
      samplers.push({ input, output: w.add(tr, FLOAT, 'VEC3', clip.times.length), interpolation: 'LINEAR' })
      channels.push({ sampler: samplers.length - 1, target: { node: b + 1, path: 'translation' } })
    })
    clip.sizes?.forEach((size, b) => {
      if (!size) return
      const sc = new Float32Array(clip.times.length * 3)
      for (let f = 0; f < clip.times.length; f++) sc.fill(size[f], f * 3, f * 3 + 3)
      samplers.push({ input, output: w.add(sc, FLOAT, 'VEC3', clip.times.length), interpolation: 'LINEAR' })
      channels.push({ sampler: samplers.length - 1, target: { node: b + 1, path: 'scale' } })
    })
    if (morphs && clip.weights) {
      // glTF keys a weight per target: in-betweens share their morph's weight
      const m = morphs.length, nt = targetCount(morphs), keys = clip.times.length
      const tw = new Float32Array(keys * nt)
      for (let f = 0; f < keys; f++) targetWeights(morphs, clip.weights.subarray(f * m, f * m + m), tw.subarray(f * nt, f * nt + nt))
      samplers.push({ input, output: w.add(tw, FLOAT, 'SCALAR', keys * nt), interpolation: 'LINEAR' })
      channels.push({ sampler: samplers.length - 1, target: { node: 0, path: 'weights' } })
    }
    return { name: clip.name, samplers, channels }
  })
  return {
    nodes,
    sceneNodes: [0, ...roots],
    skin: { joints: skeleton.bones.map((_, i) => i + 1), inverseBindMatrices: ibmAcc, skeleton: roots[0] },
    animations,
  }
}

/**
 * A solid, skinned triangle mesh with the same bones and clips: what Blender,
 * Godot, Unity and three.js open as an ordinary animated model. Colors are
 * per vertex (glTF wants them linear, so they're converted from the blobs'
 * display color); the material is marked unlit, since the blobs' colors
 * already have their lighting baked in. Viewers that don't know
 * KHR_materials_unlit light it as a plain matte surface.
 */
export function writeRiggedMeshGlb(r: { name: string; mesh: SplatMesh; skeleton: Skeleton; clips: Clip[] }): Uint8Array {
  const { mesh, skeleton } = r
  const n = mesh.vertexCount
  // glTF needs at least one of everything; an empty mesh is no file
  if (!n || !mesh.triangleCount) throw new GlbError('The mesh is empty: lower the level or use a finer grid')
  const w = new BinWriter()
  const pos = mesh.positions
  const min = [0, 1, 2].map((k) => { let m = Infinity; for (let i = 0; i < n; i++) m = Math.min(m, pos[i * 3 + k]); return n ? m : 0 })
  const max = [0, 1, 2].map((k) => { let m = -Infinity; for (let i = 0; i < n; i++) m = Math.max(m, pos[i * 3 + k]); return n ? m : 0 })
  const color = new Uint8Array(n * 4)
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) color[i * 4 + k] = Math.round(Math.min(1, Math.max(0, srgbToLinear(mesh.colors[i * 3 + k]))) * 255)
    color[i * 4 + 3] = 255
  }
  const weights = new Uint8Array(n * 4)
  const dv = new DataView(weights.buffer)
  for (let i = 0; i < n; i++) dv.setUint32(i * 4, packWeights(mesh.weights, i * 4), true)
  const big = n > 65535
  const attributes = {
    POSITION: w.add(pos, FLOAT, 'VEC3', n, { min, max }),
    NORMAL: w.add(mesh.normals, FLOAT, 'VEC3', n),
    COLOR_0: w.add(color, UBYTE, 'VEC4', n, { normalized: true }),
    JOINTS_0: w.add(mesh.joints, UBYTE, 'VEC4', n),
    WEIGHTS_0: w.add(weights, UBYTE, 'VEC4', n, { normalized: true }),
  }
  const indices = w.add(big ? mesh.indices : Uint16Array.from(mesh.indices), big ? UINT : USHORT, 'SCALAR', mesh.indices.length)
  const rig = writeRig(w, r.name, skeleton, r.clips)
  const bin = w.bytes()
  const json = {
    asset: { version: '2.0', generator: 'Blobscape' },
    extensionsUsed: ['KHR_materials_unlit'],
    scene: 0,
    scenes: [{ nodes: rig.sceneNodes }],
    nodes: rig.nodes,
    materials: [{ name: 'baked color', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 }, extensions: { KHR_materials_unlit: {} } }],
    meshes: [{ name: r.name, primitives: [{ mode: 4, attributes, indices, material: 0 }] }],
    skins: [rig.skin],
    animations: rig.animations,
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: w.views,
    accessors: w.accessors,
  }
  return packGlb(json, bin)
}

function packGlb(json: unknown, bin: Uint8Array) {
  let text = new TextEncoder().encode(JSON.stringify(json))
  const pad = (4 - (text.byteLength % 4)) % 4
  if (pad) { const t = new Uint8Array(text.byteLength + pad).fill(0x20); t.set(text); text = t }
  const total = 12 + 8 + text.byteLength + 8 + bin.byteLength
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546c67, true) // glTF
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, text.byteLength, true)
  dv.setUint32(16, 0x4e4f534a, true) // JSON
  out.set(text, 20)
  const o = 20 + text.byteLength
  dv.setUint32(o, bin.byteLength, true)
  dv.setUint32(o + 4, 0x004e4942, true) // BIN
  out.set(bin, o + 8)
  return out
}

// --- reading ---

export class GlbError extends Error {}

/** Reads a .glb written by `writeRiggedGlb`, or any KHR_gaussian_splatting file with a skin whose joints have no rest rotation. */
export function readRiggedGlb(bytes: Uint8Array): Rigged {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) throw new GlbError('Not a .glb file')
  const jsonLen = dv.getUint32(12, true)
  if (dv.getUint32(16, true) !== 0x4e4f534a) throw new GlbError('The .glb has no JSON chunk first')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)))
  const binStart = 20 + jsonLen
  const bin = bytes.subarray(binStart + 8, binStart + 8 + dv.getUint32(binStart, true))

  const read = (ai: number, Ctor: typeof Float32Array | typeof Uint8Array | typeof Uint16Array) => {
    const a = json.accessors[ai]
    const size = SIZES[a.type as string] ?? 1
    if (a.bufferView === undefined || a.sparse) return readSparse(ai, Ctor, size)
    return view(a.bufferView, a.byteOffset ?? 0, a.count * size, Ctor, size)
  }
  const view = (bv: number, offset: number, length: number, Ctor: typeof Float32Array | typeof Uint8Array | typeof Uint16Array | typeof Uint32Array, size = 1) => {
    const v = json.bufferViews[bv]
    const bytesPer = Ctor.BYTES_PER_ELEMENT
    if (v.byteStride && v.byteStride !== size * bytesPer) throw new GlbError('Interleaved buffers are not supported yet')
    const start = (v.byteOffset ?? 0) + offset
    if (start + length * bytesPer > Math.min(bin.byteLength, (v.byteOffset ?? 0) + v.byteLength)) throw new GlbError('An accessor runs past the end of its data')
    const raw = bin.slice(start, start + length * bytesPer)
    return new Ctor(raw.buffer, raw.byteOffset, length)
  }
  // zeros (or the buffer view's values) with a sparse accessor's few values written over them
  const readSparse = (ai: number, Ctor: typeof Float32Array | typeof Uint8Array | typeof Uint16Array, size: number) => {
    const a = json.accessors[ai]
    const out = a.bufferView === undefined ? new Ctor(a.count * size) : view(a.bufferView, a.byteOffset ?? 0, a.count * size, Ctor, size)
    const sp = a.sparse
    if (!sp?.count) return out
    if (a.componentType !== FLOAT || Ctor !== Float32Array) throw new GlbError('Sparse accessors are read only as floats')
    const IdxCtor = sp.indices.componentType === UBYTE ? Uint8Array : sp.indices.componentType === USHORT ? Uint16Array : sp.indices.componentType === UINT ? Uint32Array : undefined
    if (!IdxCtor) throw new GlbError('Unknown sparse index format')
    const idx = view(sp.indices.bufferView, sp.indices.byteOffset ?? 0, sp.count, IdxCtor)
    const vals = view(sp.values.bufferView, sp.values.byteOffset ?? 0, sp.count * size, Float32Array, size)
    for (let j = 0; j < sp.count; j++) {
      const i = idx[j]
      if (i >= a.count) throw new GlbError('A sparse index is past the end of its accessor')
      for (let k = 0; k < size; k++) out[i * size + k] = vals[j * size + k]
    }
    return out
  }

  const meshNode = json.nodes.findIndex((nd: { mesh?: number }) => nd.mesh !== undefined)
  if (meshNode < 0) throw new GlbError('The file has no mesh')
  const prim = json.meshes[json.nodes[meshNode].mesh].primitives[0]
  if (!prim.extensions?.[SPLATS]) throw new GlbError('The mesh is not a Gaussian splat')
  const at = prim.attributes
  for (const name of ['POSITION', `${SPLATS}:SCALE`, `${SPLATS}:ROTATION`, `${SPLATS}:OPACITY`, `${SPLATS}:SH_DEGREE_0_COEF_0`]) {
    if (at[name] === undefined) throw new GlbError(`The splat is missing ${name}`)
    if (json.accessors[at[name]].componentType !== FLOAT) throw new GlbError(`Quantized ${name} isn't supported yet`)
  }
  const pos = read(at.POSITION, Float32Array) as Float32Array
  const n = pos.length / 3
  const scale = read(at[`${SPLATS}:SCALE`], Float32Array) as Float32Array
  const rot = read(at[`${SPLATS}:ROTATION`], Float32Array) as Float32Array
  const op = read(at[`${SPLATS}:OPACITY`], Float32Array) as Float32Array
  const sh0 = read(at[`${SPLATS}:SH_DEGREE_0_COEF_0`], Float32Array) as Float32Array
  const blobs = new Blobs(n)
  for (let i = 0; i < n; i++) {
    blobs.push({
      center: [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]],
      scale: [scale[i * 3], scale[i * 3 + 1], scale[i * 3 + 2]],
      quat: [rot[i * 4], rot[i * 4 + 1], rot[i * 4 + 2], rot[i * 4 + 3]],
      color: [0, 1, 2].map((k) => Math.min(1, Math.max(0, 0.5 + SH_C0 * sh0[i * 3 + k]))) as Vec3,
      opacity: op[i],
    })
  }

  const skinDef = json.skins?.[json.nodes[meshNode].skin ?? 0]
  let skeleton: Skeleton
  const skin: Skin = { joints: new Uint8Array(n * 4), weights: new Float32Array(n * 4) }
  const jointOf = new Map<number, number>()
  if (skinDef && at.JOINTS_0 !== undefined && at.WEIGHTS_0 !== undefined) {
    const joints: number[] = skinDef.joints
    if (joints.length > 255) throw new GlbError('More than 255 bones')
    joints.forEach((node, i) => jointOf.set(node, i))
    const parentOf = new Map<number, number>()
    json.nodes.forEach((nd: { children?: number[] }, i: number) => nd.children?.forEach((c) => parentOf.set(c, i)))
    const heads: Vec3[] = []
    const bones: Bone[] = joints.map((node, i) => {
      const nd = json.nodes[node]
      if (nd.rotation && Math.abs(nd.rotation[3]) < 0.9999) throw new GlbError('Bones with a rest rotation are not supported yet')
      let p = parentOf.get(node)
      while (p !== undefined && !jointOf.has(p)) p = parentOf.get(p)
      const parent = p === undefined ? -1 : jointOf.get(p)!
      if (parent >= i) throw new GlbError('Bones must be listed parents first')
      const t = nd.translation ?? [0, 0, 0]
      heads[i] = parent < 0 ? [t[0], t[1], t[2]] : [heads[parent][0] + t[0], heads[parent][1] + t[1], heads[parent][2] + t[2]]
      return { name: nd.name ?? `bone${i}`, parent, head: heads[i] }
    })
    skeleton = new Skeleton(bones)
    const jt = json.accessors[at.JOINTS_0].componentType === UBYTE ? read(at.JOINTS_0, Uint8Array) : read(at.JOINTS_0, Uint16Array)
    if (joints.length > 256) throw new GlbError('More than 256 bones is not supported')
    for (const j of jt) if (j >= joints.length) throw new GlbError(`A blob names bone ${j}, but the skin has ${joints.length}`)
    skin.joints.set(jt)
    // weights may be floats, or bytes/shorts normalized to 0–1
    const wa = json.accessors[at.WEIGHTS_0]
    if (wa.componentType === FLOAT) skin.weights.set(read(at.WEIGHTS_0, Float32Array))
    else if (wa.componentType === UBYTE) skin.weights.set(Array.from(read(at.WEIGHTS_0, Uint8Array), (x) => x / 255))
    else if (wa.componentType === 5123) skin.weights.set(Array.from(read(at.WEIGHTS_0, Uint16Array), (x) => x / 65535))
    else throw new GlbError('Unknown weight format')
  } else {
    skeleton = new Skeleton([{ name: 'root', parent: -1, head: [0, 0, 0] }])
    for (let i = 0; i < n; i++) skin.weights[i * 4] = 1
  }

  const mesh = json.meshes[json.nodes[meshNode].mesh]
  const morphs = readMorphs(mesh, prim, n, (ai, size) => {
    if (json.accessors[ai]?.componentType !== FLOAT) throw new GlbError('Quantized morph targets are not supported yet')
    if (SIZES[json.accessors[ai].type] !== size || json.accessors[ai].count !== n) throw new GlbError('A morph target does not match its splats')
    return read(ai, Float32Array) as Float32Array
  })
  const nt = prim.targets?.length ?? 0

  const clips: Clip[] = (json.animations ?? []).map((anim: { name?: string; samplers: { input: number; output: number }[]; channels: { sampler: number; target: { node: number; path: string } }[] }, ai: number) => {
    const first = anim.samplers[0]
    const times = read(first.input, Float32Array) as Float32Array
    const rotations = skeleton.bones.map(() => {
      const r = new Float32Array(times.length * 4)
      for (let f = 0; f < times.length; f++) r[f * 4 + 3] = 1
      return r
    })
    const offsets: (Float32Array | undefined)[] = skeleton.bones.map(() => undefined)
    const sizes: (Float32Array | undefined)[] = skeleton.bones.map(() => undefined)
    let weights: Float32Array | undefined
    for (const ch of anim.channels) {
      if (ch.target.node === meshNode && ch.target.path === 'weights' && morphs) {
        const out = read(anim.samplers[ch.sampler].output, Float32Array) as Float32Array
        if (out.length !== times.length * nt || !out.every(Number.isFinite)) continue
        weights = new Float32Array(times.length * morphs.length)
        for (let f = 0; f < times.length; f++) {
          let at = 0
          morphs.forEach((m, k) => { weights![f * morphs.length + k] = morphWeight(out, f * nt + at, m.targets.length); at += m.targets.length })
        }
        continue
      }
      const b = jointOf.get(ch.target.node)
      if (b === undefined) continue
      const s = anim.samplers[ch.sampler]
      const out = read(s.output, Float32Array) as Float32Array
      // a key that isn't a number would poison every pose after it: skip the whole channel
      if (!out.every(Number.isFinite)) continue
      if (ch.target.path === 'rotation' && out.length === times.length * 4) rotations[b] = new Float32Array(out)
      if (ch.target.path === 'translation' && out.length === times.length * 3) {
        const rest = restTranslation(skeleton, b)
        const o = new Float32Array(out.length)
        for (let f = 0; f < times.length; f++) for (let k = 0; k < 3; k++) o[f * 3 + k] = out[f * 3 + k] - rest[k]
        offsets[b] = o
      }
      if (ch.target.path === 'scale' && out.length === times.length * 3) {
        // our bones scale evenly: a file's uneven scale is read as its average
        const o = new Float32Array(times.length)
        for (let f = 0; f < times.length; f++) o[f] = Math.min(1000, Math.max(0, (out[f * 3] + out[f * 3 + 1] + out[f * 3 + 2]) / 3))
        sizes[b] = o
      }
    }
    return { name: anim.name ?? `clip${ai}`, times, rotations, offsets, ...(sizes.some(Boolean) ? { sizes } : {}), ...(weights ? { weights } : {}) }
  })
  return { name: json.nodes[meshNode].name ?? '', blobs, skin, skeleton, clips, ...(morphs ? { morphs } : {}) }
}

const SIZES: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT3: 9, MAT4: 16 }

/**
 * The primitive's morph targets as morphs. Our extension groups in-betweens
 * into one morph; without it (or if its groups don't cover every target once,
 * in order) each target is a morph of its own. A target with no SHAPE moves
 * centers only, as a plain glTF morph would.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readMorphs(mesh: any, prim: any, n: number, read: (accessor: number, size: number) => Float32Array): Morph[] | undefined {
  const defs: Record<string, number>[] = prim.targets ?? []
  if (!defs.length) return undefined
  const targets: MorphTarget[] = defs.map((d) => {
    const delta = d.POSITION !== undefined ? read(d.POSITION, 3) : new Float32Array(n * 3)
    const grad = new Float32Array(n * 9)
    if (d[SHAPE_ATTRIBUTE] !== undefined) {
      const g = read(d[SHAPE_ATTRIBUTE], 9)
      // columns in the file, rows in morph.ts
      for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) grad[i * 9 + r * 3 + c] = g[i * 9 + c * 3 + r]
    }
    if (!delta.every(Number.isFinite) || !grad.every(Number.isFinite)) throw new GlbError('A morph target holds a value that is not a number')
    return { delta, grad }
  })
  const names: unknown[] = mesh.extras?.targetNames ?? []
  const groups: { name?: unknown; targets?: unknown }[] | undefined = prim.extensions?.[SPLATS]?.extensions?.[MORPH_EXTENSION]?.morphs
  let next = 0
  const fits = Array.isArray(groups) && groups.every((g) => Array.isArray(g.targets) && g.targets.length > 0 && g.targets.every((t) => t === next++)) && next === targets.length
  if (fits) return groups!.map((g, k) => ({ name: typeof g.name === 'string' ? g.name : `morph${k}`, targets: (g.targets as number[]).map((t) => targets[t]) }))
  return targets.map((t, k) => ({ name: typeof names[k] === 'string' ? (names[k] as string) : `morph${k}`, targets: [t] }))
}
