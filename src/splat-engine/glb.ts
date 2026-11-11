import { SH_C0, srgbToLinear } from '../splat-core/colour.ts'
import { Blobs, type Vec3 } from '../splat-core/blobs.ts'
import { Skeleton, norm4, packWeights, type Bone, type Skin } from './rig.ts'
import type { SplatMesh } from './mesh.ts'

/**
 * Rigged splats in a .glb.
 *
 * The blobs are a KHR_gaussian_splatting primitive (POINTS, with SCALE,
 * ROTATION, OPACITY and the degree-0 colour as extra attributes), so any
 * viewer that knows that extension shows the creature. The rig uses only
 * standard glTF: JOINTS_0 and WEIGHTS_0 on the same primitive, a skin, joint
 * nodes, and animation channels on those nodes.
 *
 * What glTF doesn't say is how a skinned *splat* turns, since a blob has a
 * rotation and a shape as well as a position. Our extension,
 * BLOBSCAPE_gaussian_skinning, says so: blob centres follow the usual linear
 * blend, and each blob's rotation is the weighted average of its bones'
 * rotations. It's listed as used, not required, so viewers that don't know it
 * still load the file, and most will show the creature standing still.
 */
export const SKIN_EXTENSION = 'BLOBSCAPE_gaussian_skinning'
const SPLATS = 'KHR_gaussian_splatting'

export interface Clip {
  name: string
  /** Seconds. */
  times: Float32Array
  /** Per bone, a rotation key per time (x, y, z, w). */
  rotations: Float32Array[]
  /** Offset of the root (bone 0) per time, on top of its rest position. */
  rootOffset?: Float32Array
}

export interface Rigged {
  name: string
  blobs: Blobs
  skin: Skin
  skeleton: Skeleton
  clips: Clip[]
}

/** Records a clip by posing the skeleton at `fps` across `seconds`. Leaves it posed at the end. */
export function recordClip(name: string, sk: Skeleton, pose: (sk: Skeleton, t: number) => void, seconds: number, fps = 24): Clip {
  const n = Math.max(2, Math.round(seconds * fps) + 1)
  const times = new Float32Array(n)
  const rotations = sk.bones.map(() => new Float32Array(n * 4))
  const rootOffset = new Float32Array(n * 3)
  for (let f = 0; f < n; f++) {
    const t = (f / (n - 1)) * seconds
    times[f] = t
    pose(sk, t)
    sk.bones.forEach((_, b) => rotations[b].set(sk.rotation.subarray(b * 4, b * 4 + 4), f * 4))
    rootOffset.set(sk.offset.subarray(0, 3), f * 3)
  }
  // neighbouring keys on the same hemisphere, so linear interpolation takes the short way
  for (const r of rotations) for (let f = 1; f < n; f++) {
    const d = r[f * 4] * r[f * 4 - 4] + r[f * 4 + 1] * r[f * 4 - 3] + r[f * 4 + 2] * r[f * 4 - 2] + r[f * 4 + 3] * r[f * 4 - 1]
    if (d < 0) for (let k = 0; k < 4; k++) r[f * 4 + k] = -r[f * 4 + k]
  }
  return { name, times, rotations, rootOffset }
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
  if (clip.rootOffset) for (let k = 0; k < 3; k++) sk.offset[k] = clip.rootOffset[f * 3 + k] * (1 - a) + clip.rootOffset[(f + 1) * 3 + k] * a
  sk.update()
}

// --- writing ---

interface Accessor { bufferView: number; componentType: number; count: number; type: string; normalized?: boolean; min?: number[]; max?: number[] }

class BinWriter {
  chunks: Uint8Array[] = []
  length = 0
  views: { buffer: 0; byteOffset: number; byteLength: number }[] = []
  accessors: Accessor[] = []

  add(data: Float32Array | Uint8Array | Uint16Array | Uint32Array, componentType: number, type: string, count: number, extra: Partial<Accessor> = {}) {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    const pad = (4 - (this.length % 4)) % 4
    if (pad) { this.chunks.push(new Uint8Array(pad)); this.length += pad }
    this.views.push({ buffer: 0, byteOffset: this.length, byteLength: bytes.byteLength })
    this.chunks.push(bytes.slice())
    this.length += bytes.byteLength
    this.accessors.push({ bufferView: this.views.length - 1, componentType, count, type, ...extra })
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
  const pos = blobs.centre.slice(0, n * 3)
  const min = [0, 1, 2].map((k) => { let m = Infinity; for (let i = 0; i < n; i++) m = Math.min(m, pos[i * 3 + k]); return m })
  const max = [0, 1, 2].map((k) => { let m = -Infinity; for (let i = 0; i < n; i++) m = Math.max(m, pos[i * 3 + k]); return m })
  const sh0 = new Float32Array(n * 3)
  for (let i = 0; i < n * 3; i++) sh0[i] = (blobs.colour[i] - 0.5) / SH_C0
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

  const rig = writeRig(w, r.name, skeleton, r.clips)

  const bin = w.bytes()
  const json = {
    asset: { version: '2.0', generator: 'Blobscape' },
    extensionsUsed: [SPLATS, SKIN_EXTENSION],
    scene: 0,
    scenes: [{ nodes: rig.sceneNodes }],
    nodes: rig.nodes,
    meshes: [{
      name: r.name,
      primitives: [{
        mode: 0,
        attributes,
        extensions: { [SPLATS]: { kernel: 'ellipse', colorSpace: 'srgb_rec709_display', projection: 'perspective', sortingMethod: 'cameraDistance' } },
      }],
    }],
    skins: [rig.skin],
    animations: rig.animations,
    extensions: { [SKIN_EXTENSION]: { rotationBlend: 'quaternionAverage', scaleBlend: 'weightedAverage' } },
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: w.views,
    accessors: w.accessors,
  }
  return packGlb(json, bin)
}

/**
 * The rig, shared by both writers: node 0 is the mesh, node 1 + i is bone i,
 * placed by its offset from its parent's head (no rest rotation), with an
 * inverse bind matrix per bone, and each clip as rotation channels on the
 * bone nodes plus the root's translation.
 */
function writeRig(w: BinWriter, name: string, skeleton: Skeleton, clips: Clip[]) {
  const nb = skeleton.count
  const ibm = new Float32Array(nb * 16)
  const nodes: Record<string, unknown>[] = [{ name, mesh: 0, skin: 0 }]
  skeleton.bones.forEach((b, i) => {
    const t: Vec3 = b.parent < 0 ? b.head : [b.head[0] - skeleton.bones[b.parent].head[0], b.head[1] - skeleton.bones[b.parent].head[1], b.head[2] - skeleton.bones[b.parent].head[2]]
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
    if (clip.rootOffset) {
      const root = skeleton.bones[0].head
      const tr = new Float32Array(clip.times.length * 3)
      for (let f = 0; f < clip.times.length; f++) for (let k = 0; k < 3; k++) tr[f * 3 + k] = root[k] + clip.rootOffset[f * 3 + k]
      samplers.push({ input, output: w.add(tr, FLOAT, 'VEC3', clip.times.length), interpolation: 'LINEAR' })
      channels.push({ sampler: samplers.length - 1, target: { node: 1, path: 'translation' } })
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
 * Godot, Unity and three.js open as an ordinary animated model. Colours are
 * per vertex (glTF wants them linear, so they're converted from the blobs'
 * display colour); the material is marked unlit, since the blobs' colours
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
  const colour = new Uint8Array(n * 4)
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) colour[i * 4 + k] = Math.round(Math.min(1, Math.max(0, srgbToLinear(mesh.colours[i * 3 + k]))) * 255)
    colour[i * 4 + 3] = 255
  }
  const weights = new Uint8Array(n * 4)
  const dv = new DataView(weights.buffer)
  for (let i = 0; i < n; i++) dv.setUint32(i * 4, packWeights(mesh.weights, i * 4), true)
  const big = n > 65535
  const attributes = {
    POSITION: w.add(pos, FLOAT, 'VEC3', n, { min, max }),
    NORMAL: w.add(mesh.normals, FLOAT, 'VEC3', n),
    COLOR_0: w.add(colour, UBYTE, 'VEC4', n, { normalized: true }),
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
    materials: [{ name: 'baked colour', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 }, extensions: { KHR_materials_unlit: {} } }],
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
    const v = json.bufferViews[a.bufferView]
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type as string] ?? 1
    const bytesPer = Ctor.BYTES_PER_ELEMENT
    if (v.byteStride && v.byteStride !== size * bytesPer) throw new GlbError('Interleaved buffers are not supported yet')
    const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0)
    const raw = bin.slice(start, start + a.count * size * bytesPer)
    return new Ctor(raw.buffer, raw.byteOffset, a.count * size)
  }

  const meshNode = json.nodes.findIndex((nd: { mesh?: number }) => nd.mesh !== undefined)
  if (meshNode < 0) throw new GlbError('The file has no mesh')
  const prim = json.meshes[json.nodes[meshNode].mesh].primitives[0]
  if (!prim.extensions?.[SPLATS]) throw new GlbError('The mesh is not a Gaussian splat')
  const at = prim.attributes
  for (const name of ['POSITION', `${SPLATS}:SCALE`, `${SPLATS}:ROTATION`, `${SPLATS}:OPACITY`, `${SPLATS}:SH_DEGREE_0_COEF_0`]) {
    if (at[name] === undefined) throw new GlbError(`The splat is missing ${name}`)
    if (json.accessors[at[name]].componentType !== FLOAT) throw new GlbError(`Quantised ${name} isn't supported yet`)
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
      centre: [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]],
      scale: [scale[i * 3], scale[i * 3 + 1], scale[i * 3 + 2]],
      quat: [rot[i * 4], rot[i * 4 + 1], rot[i * 4 + 2], rot[i * 4 + 3]],
      colour: [0, 1, 2].map((k) => Math.min(1, Math.max(0, 0.5 + SH_C0 * sh0[i * 3 + k]))) as Vec3,
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
    // weights may be floats, or bytes/shorts normalised to 0–1
    const wa = json.accessors[at.WEIGHTS_0]
    if (wa.componentType === FLOAT) skin.weights.set(read(at.WEIGHTS_0, Float32Array))
    else if (wa.componentType === UBYTE) skin.weights.set(Array.from(read(at.WEIGHTS_0, Uint8Array), (x) => x / 255))
    else if (wa.componentType === 5123) skin.weights.set(Array.from(read(at.WEIGHTS_0, Uint16Array), (x) => x / 65535))
    else throw new GlbError('Unknown weight format')
  } else {
    skeleton = new Skeleton([{ name: 'root', parent: -1, head: [0, 0, 0] }])
    for (let i = 0; i < n; i++) skin.weights[i * 4] = 1
  }

  const clips: Clip[] = (json.animations ?? []).map((anim: { name?: string; samplers: { input: number; output: number }[]; channels: { sampler: number; target: { node: number; path: string } }[] }, ai: number) => {
    const first = anim.samplers[0]
    const times = read(first.input, Float32Array) as Float32Array
    const rotations = skeleton.bones.map(() => {
      const r = new Float32Array(times.length * 4)
      for (let f = 0; f < times.length; f++) r[f * 4 + 3] = 1
      return r
    })
    let rootOffset: Float32Array | undefined
    for (const ch of anim.channels) {
      const b = jointOf.get(ch.target.node)
      if (b === undefined) continue
      const s = anim.samplers[ch.sampler]
      const out = read(s.output, Float32Array) as Float32Array
      if (ch.target.path === 'rotation' && out.length === times.length * 4) rotations[b] = new Float32Array(out)
      if (ch.target.path === 'translation' && b === 0 && out.length === times.length * 3) {
        rootOffset = new Float32Array(out.length)
        for (let f = 0; f < times.length; f++) for (let k = 0; k < 3; k++) rootOffset[f * 3 + k] = out[f * 3 + k] - skeleton.bones[0].head[k]
      }
    }
    return { name: anim.name ?? `clip${ai}`, times, rotations, rootOffset }
  })
  return { name: json.nodes[meshNode].name ?? '', blobs, skin, skeleton, clips }
}
