import { Blobs, quatFacing, type Quat, type Vec3 } from '../splat-core/blobs.ts'
import type { Clip, Rigged } from './glb.ts'
import { MAX_TRIANGLES, MeshFileError, mul, nodeMatrix, openGlb, toSrgb, type M4, type MeshImage } from './meshFile.ts'
import type { Mesh, Texture } from './meshShape.ts'
import { Skeleton, emptySkin, mulQ, rotate, setWeights, type Bone } from './rig.ts'

/**
 * A rigged model to splats, keeping its rig (issue #208): an ordinary skinned glTF (a .glb from Blender, Mixamo or
 * a game kit: triangles, JOINTS_0/WEIGHTS_0, a skin and its animations) read into our bones and clips, then its
 * surface covered in flat blobs that hang on the same bones with the weights the mesh gave its corners. Pure: the
 * page decodes texture images and hands them in as `Texture`s.
 *
 * Our bones have no rest rotation: a bone is its head, posed by a turn about it. A glTF joint carries any rest
 * frame, so each frame of a clip is read as what the skin does, not what the nodes say: joint j's skin matrix is
 * S = G·IBM (its world matrix now times its inverse bind matrix), which takes the bind pose to the posed one. Its
 * linear part is our bone's world turn (times its scale) and it carries the bind head (where IBM⁻¹ puts the joint)
 * to where the joint is now. Local turns, offsets and sizes follow from those, so the blobs land where the mesh's
 * vertices would.
 */

/**
 * An ordinary skinned model as `readSkinnedGlb` reads it: its triangles, their bone weights, our bones and its clips.
 */
export interface SkinnedModel {
  /** The model's name. */
  name: string
  /** The triangles in the bind pose. */
  mesh: Mesh
  /** Per vertex, four of our bone indices and their weights (summing to 1). */
  joints: Uint8Array
  weights: Float32Array
  /** Our bones, parents first. */
  bones: Bone[]
  /** Its animations, sampled onto our bones. */
  clips: Clip[]
  /** Texture images, still encoded, which `mesh.tex` points at. */
  images: MeshImage[]
}

/** Keys a second when a clip is read: glTF keys may sit anywhere in time, ours sit evenly. */
export const MODEL_FPS = 30
/** Most keys read from one clip. */
const MAX_KEYS = 30 * 60
/** Our joint indices are bytes. */
const MAX_BONES = 255

// --- small matrix and quaternion helpers (column-major 4×4, as glTF) ---

function invert(m: ArrayLike<number>): M4 {
  const a = Array.from(m)
  const o = new Array(16)
  o[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10]
  o[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10]
  o[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9]
  o[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9]
  o[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10]
  o[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10]
  o[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9]
  o[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9]
  o[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6]
  o[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6]
  o[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5]
  o[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5]
  o[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6]
  o[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6]
  o[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5]
  o[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5]
  const det = a[0] * o[0] + a[1] * o[4] + a[2] * o[8] + a[3] * o[12]
  if (!det || !Number.isFinite(det)) throw new MeshFileError('A bone’s bind matrix can’t be undone')
  return o.map((v) => v / det)
}

/** A rotation matrix's quaternion (x, y, z, w), from the columns of a 4×4 already freed of scale. */
function matQuat(m: ArrayLike<number>): Quat {
  const m00 = m[0], m10 = m[1], m20 = m[2], m01 = m[4], m11 = m[5], m21 = m[6], m02 = m[8], m12 = m[9], m22 = m[10]
  const tr = m00 + m11 + m22
  let q: Quat
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4] }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s] }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s] }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s] }
  const l = Math.hypot(...q) || 1
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
}

const conj = (q: ArrayLike<number>): Quat => [-q[0], -q[1], -q[2], q[3]]

/** A skin matrix taken apart: its uniform scale and its turn, with any shear or uneven scale averaged away. */
function similarity(m: ArrayLike<number>): { s: number; q: Quat } {
  const det = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2])
  const s = Math.cbrt(Math.abs(det)) || 1
  const r = new Array(16).fill(0)
  for (let c = 0; c < 3; c++) {
    // each column to unit length, then Gram-Schmidt so the turn is a turn
    const v = [m[c * 4], m[c * 4 + 1], m[c * 4 + 2]]
    for (let p = 0; p < c; p++) { const d = v[0] * r[p * 4] + v[1] * r[p * 4 + 1] + v[2] * r[p * 4 + 2]; for (let k = 0; k < 3; k++) v[k] -= d * r[p * 4 + k] }
    const l = Math.hypot(v[0], v[1], v[2]) || 1
    for (let k = 0; k < 3; k++) r[c * 4 + k] = v[k] / l
  }
  // a mirrored skin can't be a turn: flip the last axis back
  if (det < 0) for (let k = 0; k < 3; k++) r[8 + k] = -r[8 + k]
  return { s, q: matQuat(r) }
}

// --- reading the file ---

interface Channel { node: number; path: 'translation' | 'rotation' | 'scale'; times: Float64Array; values: Float64Array; step: boolean; cubic: boolean }

/** The value of an animation channel at time t (rotations kept the short way round and renormalized). */
function sample(ch: Channel, t: number): number[] {
  const size = ch.path === 'rotation' ? 4 : 3
  const keys = ch.times.length
  const at = (k: number) => {
    const o = (ch.cubic ? k * 3 + 1 : k) * size
    return Array.from(ch.values.subarray(o, o + size))
  }
  if (t <= ch.times[0] || keys === 1) return at(0)
  if (t >= ch.times[keys - 1]) return at(keys - 1)
  let lo = 0, hi = keys - 1
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ch.times[mid] <= t) lo = mid; else hi = mid }
  const a = at(lo)
  if (ch.step) return a
  const b = at(hi)
  const u = (t - ch.times[lo]) / (ch.times[hi] - ch.times[lo] || 1)
  if (size === 4) {
    const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
    const sign = dot < 0 ? -1 : 1
    const q = a.map((v, k) => v * (1 - u) + b[k] * sign * u)
    const l = Math.hypot(...q) || 1
    return q.map((v) => v / l)
  }
  return a.map((v, k) => v * (1 - u) + b[k] * u)
}

/**
 * Reads a skinned .glb: the first mesh node with a skin, its triangles in the bind pose with colors and texture
 * coordinates, the skin's joints as our bones (parents first), and every animation sampled as our clips.
 */
export function readSkinnedGlb(bytes: Uint8Array, name = ''): SkinnedModel {
  const { json, read, images, textureImage } = openGlb(bytes)
  const nodes: { mesh?: number; skin?: number; children?: number[]; name?: string; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[] }[] = json.nodes ?? []
  const meshNode = nodes.findIndex((nd) => nd.mesh !== undefined && nd.skin !== undefined)
  if (meshNode < 0) throw new MeshFileError('The model has no skin: it has no bones to keep')
  const skinDef = json.skins?.[nodes[meshNode].skin!]
  const joints: number[] = skinDef?.joints ?? []
  if (!joints.length) throw new MeshFileError('The model’s skin has no bones')
  if (joints.length > MAX_BONES) throw new MeshFileError(`The model has ${joints.length} bones; up to ${MAX_BONES} are kept`)

  const parentOf = new Map<number, number>()
  nodes.forEach((nd, i) => nd.children?.forEach((c) => parentOf.set(c, i)))
  const depth = (n: number) => { let d = 0; for (let p = parentOf.get(n); p !== undefined; p = parentOf.get(p)) if (++d > nodes.length) throw new MeshFileError('The node tree loops'); return d }
  // our bones come parents first: the skin's joints by depth in the tree, keeping their order within a depth
  const order = joints.map((node, j) => ({ node, j, d: depth(node) })).sort((a, b) => a.d - b.d || a.j - b.j)
  const boneOfJoint = new Int32Array(joints.length)
  const boneOfNode = new Map<number, number>()
  order.forEach((o, b) => { boneOfJoint[o.j] = b; boneOfNode.set(o.node, b) })

  const ibmData = skinDef.inverseBindMatrices !== undefined ? read(skinDef.inverseBindMatrices).data : undefined
  const ibm = (j: number): M4 => (ibmData ? Array.from(ibmData.subarray(j * 16, j * 16 + 16)) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
  const IBM = order.map((o) => ibm(o.j))
  const heads: Vec3[] = IBM.map((m) => { const b = invert(m); return [b[12], b[13], b[14]] })
  const bones: Bone[] = order.map((o, b) => {
    let p = parentOf.get(o.node)
    while (p !== undefined && !boneOfNode.has(p)) p = parentOf.get(p)
    const parent = p === undefined ? -1 : boneOfNode.get(p)!
    return { name: nodes[o.node].name ?? `bone${b}`, parent, head: heads[b] }
  })
  // a bone's tail is its first child's head, or a short way on from its parent's line for the ends
  bones.forEach((bone, b) => {
    const child = bones.findIndex((c) => c.parent === b)
    if (child >= 0) bone.tail = [...bones[child].head]
    else if (bone.parent >= 0) {
      const ph = bones[bone.parent].head
      bone.tail = [bone.head[0] + (bone.head[0] - ph[0]) * 0.5, bone.head[1] + (bone.head[1] - ph[1]) * 0.5, bone.head[2] + (bone.head[2] - ph[2]) * 0.5]
    }
  })

  // the triangles, in the bind pose (a skinned mesh's own node is ignored, as glTF says)
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [], tex: number[] = [], jts: number[] = [], wts: number[] = []
  let anyColor = false, anyTex = false
  for (const prim of json.meshes[nodes[meshNode].mesh!].primitives ?? []) {
    if ((prim.mode ?? 4) !== 4 || prim.attributes?.POSITION === undefined) continue
    const P = read(prim.attributes.POSITION).data, n = P.length / 3
    const J = prim.attributes.JOINTS_0 !== undefined ? read(prim.attributes.JOINTS_0).data : undefined
    const W = prim.attributes.WEIGHTS_0 !== undefined ? read(prim.attributes.WEIGHTS_0).data : undefined
    const C = prim.attributes.COLOR_0 !== undefined ? read(prim.attributes.COLOR_0) : undefined
    const mat = prim.material !== undefined ? json.materials?.[prim.material] : undefined
    const pbr = mat?.pbrMetallicRoughness
    const f: number[] = pbr?.baseColorFactor ?? [1, 1, 1, 1]
    const img = textureImage(pbr?.baseColorTexture?.index)
    const set = pbr?.baseColorTexture?.texCoord ?? 0
    const T = img >= 0 && prim.attributes[`TEXCOORD_${set}`] !== undefined ? read(prim.attributes[`TEXCOORD_${set}`]).data : undefined
    if (C || mat) anyColor = true
    const base = pos.length / 3
    for (let i = 0; i < n; i++) {
      pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2])
      for (let k = 0; k < 3; k++) col.push(toSrgb((C ? C.data[i * C.size + k] : 1) * f[k]))
      uv.push(T ? T[i * 2] : 0, T ? T[i * 2 + 1] : 0)
      let sum = 0
      for (let k = 0; k < 4; k++) sum += W ? Math.max(0, W[i * 4 + k]) : 0
      for (let k = 0; k < 4; k++) {
        const j = J ? J[i * 4 + k] : 0
        if (j >= joints.length) throw new MeshFileError('A vertex names a bone the skin doesn’t have')
        jts.push(boneOfJoint[j])
        // a vertex with no weight at all hangs on the first bone
        wts.push(sum > 0 ? Math.max(0, W![i * 4 + k]) / sum : k === 0 ? 1 : 0)
      }
    }
    const I = prim.indices !== undefined ? read(prim.indices).data : Float64Array.from({ length: n }, (_, i) => i)
    for (let t = 0; t + 2 < I.length; t += 3) {
      if (I[t] >= n || I[t + 1] >= n || I[t + 2] >= n) throw new MeshFileError('A triangle points past its vertices')
      idx.push(base + I[t], base + I[t + 1], base + I[t + 2])
      tex.push(T ? img : -1)
    }
    if (T) anyTex = true
    if (idx.length / 3 > MAX_TRIANGLES) throw new MeshFileError(`The model has more than ${MAX_TRIANGLES.toLocaleString('en-US')} triangles`)
  }
  if (!idx.length) throw new MeshFileError('The skinned mesh has no triangles')

  const clips: Clip[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(json.animations ?? []).forEach((anim: any, ai: number) => {
    const channels: Channel[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const ch of anim.channels ?? []) {
      const path = ch.target?.path
      if (ch.target?.node === undefined || (path !== 'translation' && path !== 'rotation' && path !== 'scale')) continue
      const s = anim.samplers?.[ch.sampler]
      if (!s) continue
      const times = read(s.input).data, values = read(s.output).data
      if (!times.length || !values.every(Number.isFinite) || !times.every(Number.isFinite)) continue
      channels.push({ node: ch.target.node, path, times, values, step: s.interpolation === 'STEP', cubic: s.interpolation === 'CUBICSPLINE' })
    }
    if (!channels.length) return
    const start = Math.min(...channels.map((c) => c.times[0]))
    const end = Math.max(...channels.map((c) => c.times[c.times.length - 1]))
    const keys = Math.min(MAX_KEYS, Math.max(2, Math.round((end - start) * MODEL_FPS) + 1))
    clips.push(clipFrom(anim.name ?? `clip${ai}`, nodes, parentOf, channels, start, end, keys, order.map((o) => o.node), IBM, bones))
  })

  return {
    name: name || nodes[meshNode].name || json.meshes[nodes[meshNode].mesh!].name || '',
    mesh: {
      positions: new Float32Array(pos),
      indices: new Uint32Array(idx),
      colors: anyColor ? new Float32Array(col) : undefined,
      uvs: anyTex ? new Float32Array(uv) : undefined,
      tex: anyTex ? Int16Array.from(tex) : undefined,
    },
    joints: Uint8Array.from(jts),
    weights: new Float32Array(wts),
    bones,
    clips,
    images,
  }
}

/** One animation, sampled evenly, as our clip: per key, each joint's skin matrix taken apart into our pose. */
function clipFrom(
  name: string, nodes: { translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[] }[], parentOf: Map<number, number>,
  channels: Channel[], start: number, end: number, keys: number, jointNodes: number[], IBM: M4[], bones: Bone[],
): Clip {
  const nb = bones.length
  const times = new Float32Array(keys)
  const rotations = bones.map(() => new Float32Array(keys * 4))
  const offsets = bones.map(() => new Float32Array(keys * 3))
  const sizes = bones.map(() => new Float32Array(keys))
  const byNode = new Map<number, Channel[]>()
  for (const c of channels) byNode.set(c.node, [...(byNode.get(c.node) ?? []), c])
  for (let f = 0; f < keys; f++) {
    const t = start + ((end - start) * f) / (keys - 1)
    times[f] = t - start
    const world = new Map<number, M4>()
    const worldOf = (n: number): M4 => {
      const got = world.get(n)
      if (got) return got
      const nd = nodes[n]
      let local = nodeMatrix(nd)
      const chs = byNode.get(n)
      if (chs && !nd.matrix) {
        const trs = { translation: nd.translation ?? [0, 0, 0], rotation: nd.rotation ?? [0, 0, 0, 1], scale: nd.scale ?? [1, 1, 1] }
        for (const c of chs) trs[c.path] = sample(c, t)
        local = nodeMatrix(trs)
      }
      const p = parentOf.get(n)
      const m = p === undefined ? local : mul(worldOf(p), local)
      world.set(n, m)
      return m
    }
    const wq: Quat[] = [], ws: number[] = [], wp: Vec3[] = []
    for (let b = 0; b < nb; b++) {
      const G = worldOf(jointNodes[b])
      const { s, q } = similarity(mul(G, IBM[b]))
      wq[b] = q; ws[b] = s; wp[b] = [G[12], G[13], G[14]]
      const bone = bones[b], h = bone.head
      if (bone.parent < 0) {
        rotations[b].set(q, f * 4)
        offsets[b].set([wp[b][0] - h[0], wp[b][1] - h[1], wp[b][2] - h[2]], f * 3)
        sizes[b][f] = s
      } else {
        const p = bone.parent, ph = bones[p].head
        rotations[b].set(mulQ(conj(wq[p]), q), f * 4)
        // our child head = parent's posed head + parent's turn · (rest step + offset) · parent's scale
        const rel = rotate(conj(wq[p]), [(wp[b][0] - wp[p][0]) / ws[p], (wp[b][1] - wp[p][1]) / ws[p], (wp[b][2] - wp[p][2]) / ws[p]])
        offsets[b].set([rel[0] - (h[0] - ph[0]), rel[1] - (h[1] - ph[1]), rel[2] - (h[2] - ph[2])], f * 3)
        sizes[b][f] = s / ws[p]
      }
    }
    // keep each bone's turn on the same side as its last key, so keys blend the short way
    if (f) for (let b = 0; b < nb; b++) {
      const r = rotations[b], o = f * 4
      if (r[o] * r[o - 4] + r[o + 1] * r[o - 3] + r[o + 2] * r[o - 2] + r[o + 3] * r[o - 1] < 0) for (let k = 0; k < 4; k++) r[o + k] = -r[o + k]
    }
  }
  // offsets and sizes only for bones that use them (a bone that just turns keeps its length)
  const tiny = 1e-4 * Math.max(1e-6, ...bones.map((b) => Math.hypot(...b.head)))
  const keptOffsets = offsets.map((o) => (o.some((v) => Math.abs(v) > tiny) ? o : undefined))
  const keptSizes = sizes.map((s) => (s.some((v) => Math.abs(v - 1) > 1e-4) ? s : undefined))
  return { name, times, rotations, offsets: keptOffsets, ...(keptSizes.some(Boolean) ? { sizes: keptSizes } : {}) }
}

// --- covering the surface in blobs ---

/** Options for `splatModel`. */
export interface SplatOptions {
  /** How many blobs to lay on the surface. */
  count: number
  /** The model's height once fitted, standing on y = 0 and centered over the origin; left as the file has it when missing. */
  height?: number
  /** Decoded texture images, in the order of `model.images`. */
  textures?: Texture[]
  /** The color of a surface with neither vertex colors nor a texture (sRGB). */
  base?: Vec3
  /** The same seed scatters the blobs the same way. */
  seed?: number
}

/** How wide a blob is, as a share of the spacing between blobs: flat discs that just overlap their neighbors. */
const DISC = 0.62
/** How thin a disc is, as a share of its width. */
const FLAT = 0.12

/**
 * The model as rigged splats: `count` flat blobs scattered over its triangles by area (the same seed gives the same
 * blobs), each lying on its triangle, colored from the vertex colors or the texture at that point, and hung on the
 * bones the triangle's corners hang on, weighted by how near each corner is. Bones and clips come with it, fitted
 * to `height` when given.
 */
export function splatModel(model: SkinnedModel, o: SplatOptions): Rigged {
  const { mesh } = model
  const P = mesh.positions, I = mesh.indices
  const tris = I.length / 3
  // fit: a whole-model scale k and a shift, applied to the mesh, the bone heads and the clips' offsets alike
  let k = 1
  const shift: Vec3 = [0, 0, 0]
  if (o.height) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], P[i + a]); max[a] = Math.max(max[a], P[i + a]) }
    k = o.height / Math.max(1e-9, max[1] - min[1])
    shift[0] = -k * (min[0] + max[0]) / 2; shift[1] = -k * min[1]; shift[2] = -k * (min[2] + max[2]) / 2
  }
  const at = (v: number): Vec3 => [P[v * 3] * k + shift[0], P[v * 3 + 1] * k + shift[1], P[v * 3 + 2] * k + shift[2]]

  const area = new Float64Array(tris)
  let total = 0
  for (let t = 0; t < tris; t++) {
    const a = at(I[t * 3]), b = at(I[t * 3 + 1]), c = at(I[t * 3 + 2])
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    total += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2
    area[t] = total
  }
  if (!(total > 0)) throw new MeshFileError('The model’s triangles have no area')
  const width = DISC * Math.sqrt(total / o.count)
  const base = o.base ?? [0.8, 0.8, 0.8]
  let seed = (o.seed ?? 1) >>> 0
  const rand = () => { seed = (seed + 0x6d2b79f5) >>> 0; let x = seed; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296 }

  const blobs = new Blobs(o.count)
  const skin = emptySkin(o.count)
  for (let i = 0; i < o.count; i++) {
    // a triangle by area, then a point spread evenly over it
    const r = rand() * total
    let lo = 0, hi = tris - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (area[mid] < r) lo = mid + 1; else hi = mid }
    const t = lo
    const r1 = Math.sqrt(rand()), r2 = rand()
    const w = [1 - r1, r1 * (1 - r2), r1 * r2]
    const v = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]]
    const a = at(v[0]), b = at(v[1]), c = at(v[2])
    const center: Vec3 = [0, 1, 2].map((q) => a[q] * w[0] + b[q] * w[1] + c[q] * w[2]) as Vec3
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const nrm = [u[1] * e[2] - u[2] * e[1], u[2] * e[0] - u[0] * e[2], u[0] * e[1] - u[1] * e[0]]
    const nl = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1
    let color: Vec3 = base
    const ti = mesh.tex?.[t] ?? -1
    if (ti >= 0 && mesh.uvs && o.textures?.[ti]) {
      const U = mesh.uvs
      color = o.textures[ti](U[v[0] * 2] * w[0] + U[v[1] * 2] * w[1] + U[v[2] * 2] * w[2], U[v[0] * 2 + 1] * w[0] + U[v[1] * 2 + 1] * w[1] + U[v[2] * 2 + 1] * w[2])
    }
    if (mesh.colors) {
      const C = mesh.colors
      const vc = [0, 1, 2].map((q) => C[v[0] * 3 + q] * w[0] + C[v[1] * 3 + q] * w[1] + C[v[2] * 3 + q] * w[2])
      color = ti >= 0 && o.textures?.[ti] ? (color.map((x, q) => x * vc[q]) as Vec3) : (vc as Vec3)
    }
    blobs.push({ center, scale: [width, width, width * FLAT], quat: quatFacing([nrm[0] / nl, nrm[1] / nl, nrm[2] / nl]), color, opacity: 0.95 })
    // the corners' bones, each weighted by how near its corner is
    const pairs = new Map<number, number>()
    for (let q = 0; q < 3; q++) for (let s = 0; s < 4; s++) {
      const wt = model.weights[v[q] * 4 + s] * w[q]
      if (wt > 0) { const j = model.joints[v[q] * 4 + s]; pairs.set(j, (pairs.get(j) ?? 0) + wt) }
    }
    setWeights(skin, i, [...pairs])
  }

  const bones: Bone[] = model.bones.map((b) => ({
    ...b,
    head: [b.head[0] * k + shift[0], b.head[1] * k + shift[1], b.head[2] * k + shift[2]],
    ...(b.tail ? { tail: [b.tail[0] * k + shift[0], b.tail[1] * k + shift[1], b.tail[2] * k + shift[2]] as Vec3 } : {}),
  }))
  const clips = k === 1 ? model.clips : model.clips.map((c) => ({ ...c, offsets: c.offsets?.map((off) => off && off.map((x) => x * k)) }))
  return { name: model.name, blobs, skin, skeleton: new Skeleton(bones), clips }
}
