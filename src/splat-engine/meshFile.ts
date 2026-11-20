import type { Mesh } from './meshShape.ts'

/**
 * Reading a model file into a `Mesh` (issue #164): Wavefront .obj (positions, faces, `usemtl` colors from a .mtl's
 * `Kd` when given) and glTF binary .glb (every triangle primitive of every mesh node, placed by the node tree; colors
 * from COLOR_0 times the material's base color; the base color texture's uv and image when it has one, for the page
 * to decode). Pure: no DOM, so Node tests read the same files.
 */

export class MeshFileError extends Error {}

/** A texture image in the file, still encoded (png or jpeg), for the page to decode. */
export interface MeshImage {
  bytes: Uint8Array
  mime: string
}

export interface MeshFile {
  mesh: Mesh
  /** The images triangles point at through `mesh.tex`. */
  images: MeshImage[]
}

/** Biggest model read, in triangles: past this a cut takes too long to be worth waiting for. */
export const MAX_TRIANGLES = 400_000

/** Reads an .obj (and its .mtl's colors, if given). Polygons are fanned into triangles. */
export function readObj(text: string, mtl?: string): MeshFile {
  const kd = new Map<string, [number, number, number]>()
  if (mtl) {
    let name = ''
    for (const line of mtl.split(/\r?\n/)) {
      const w = line.trim().split(/\s+/)
      if (w[0] === 'newmtl') name = w.slice(1).join(' ')
      else if (w[0] === 'Kd' && name) kd.set(name, [Number(w[1]), Number(w[2]), Number(w[3])])
    }
  }
  const vs: number[] = [], vcol: number[] = []
  const pos: number[] = [], col: number[] = [], idx: number[] = []
  let color: [number, number, number] | undefined, anyColor = false
  // one output vertex per (obj vertex, color) pair
  const made = new Map<string, number>()
  const vertex = (ref: string) => {
    let i = parseInt(ref.split('/')[0], 10)
    if (!Number.isFinite(i) || i === 0) throw new MeshFileError(`A face points at vertex "${ref}"`)
    i = i < 0 ? vs.length / 3 + i : i - 1
    if (i < 0 || i >= vs.length / 3) throw new MeshFileError(`A face points past the vertices (${ref})`)
    const key = color ? `${i}:${color.join(',')}` : `${i}`
    let at = made.get(key)
    if (at === undefined) {
      at = pos.length / 3
      made.set(key, at)
      pos.push(vs[i * 3], vs[i * 3 + 1], vs[i * 3 + 2])
      const c = color ?? (vcol.length ? [vcol[i * 3], vcol[i * 3 + 1], vcol[i * 3 + 2]] : [0.8, 0.8, 0.8])
      col.push(c[0], c[1], c[2])
    }
    return at
  }
  for (const line of text.split(/\r?\n/)) {
    const w = line.trim().split(/\s+/)
    if (w[0] === 'v') {
      vs.push(Number(w[1]), Number(w[2]), Number(w[3]))
      // some exporters put a vertex color after the position
      if (w.length >= 7) { vcol.push(Number(w[4]), Number(w[5]), Number(w[6])); anyColor = true }
    } else if (w[0] === 'usemtl') {
      color = kd.get(w.slice(1).join(' '))
      if (color) anyColor = true
    } else if (w[0] === 'f') {
      const f = w.slice(1).map(vertex)
      for (let k = 1; k + 1 < f.length; k++) idx.push(f[0], f[k], f[k + 1])
      if (idx.length / 3 > MAX_TRIANGLES) throw new MeshFileError(`The model has more than ${MAX_TRIANGLES.toLocaleString('en-US')} triangles`)
    }
  }
  if (!idx.length) throw new MeshFileError('The file has no faces')
  if (pos.some((x) => !Number.isFinite(x))) throw new MeshFileError('A vertex is not a number')
  return { mesh: { positions: new Float32Array(pos), indices: new Uint32Array(idx), colors: anyColor ? new Float32Array(col) : undefined }, images: [] }
}

const SIZES: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
const TYPES: Record<number, { bytes: number; get: (d: DataView, at: number) => number; max: number }> = {
  5120: { bytes: 1, get: (d, a) => d.getInt8(a), max: 127 },
  5121: { bytes: 1, get: (d, a) => d.getUint8(a), max: 255 },
  5122: { bytes: 2, get: (d, a) => d.getInt16(a, true), max: 32767 },
  5123: { bytes: 2, get: (d, a) => d.getUint16(a, true), max: 65535 },
  5125: { bytes: 4, get: (d, a) => d.getUint32(a, true), max: 1 },
  5126: { bytes: 4, get: (d, a) => d.getFloat32(a, true), max: 1 },
}

export type M4 = number[]
export const IDENTITY: M4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
export const mul = (a: M4, b: M4): M4 => {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function nodeMatrix(nd: any): M4 {
  if (nd.matrix) return nd.matrix
  const [x, y, z, w] = nd.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = nd.scale ?? [1, 1, 1], [tx, ty, tz] = nd.translation ?? [0, 0, 0]
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

/** An accessor read as plain numbers (normalized ones scaled to 0–1), `size` per element. */
export type GlbRead = (accessor: number) => { data: Float64Array; size: number }

/** A .glb taken apart: its description, a reader for its accessors, and its texture images (decoded by the page). */
export interface OpenGlb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any
  read: GlbRead
  images: MeshImage[]
  /** The index in `images` of a texture's image, added on first use; -1 when the file doesn't hold it. */
  textureImage: (texture: number | undefined) => number
}

/** Opens a .glb: checks its chunks and gives readers for what's in it. Shared with skinnedModel.ts. */
export function openGlb(bytes: Uint8Array): OpenGlb {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) throw new MeshFileError('Not a .glb file')
  const jsonLen = dv.getUint32(12, true)
  if (dv.getUint32(16, true) !== 0x4e4f534a) throw new MeshFileError('The .glb has no JSON chunk first')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any
  try { json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen))) } catch { throw new MeshFileError('The .glb’s description is not JSON') }
  const binStart = 20 + jsonLen
  const bin = binStart + 8 <= bytes.byteLength ? bytes.subarray(binStart + 8, binStart + 8 + dv.getUint32(binStart, true)) : new Uint8Array(0)
  const bdv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)

  const read: GlbRead = (ai) => {
    const a = json.accessors?.[ai]
    if (!a) throw new MeshFileError(`Accessor ${ai} is missing`)
    const size = SIZES[a.type] ?? 1, t = TYPES[a.componentType]
    if (!t) throw new MeshFileError(`Unknown number format ${a.componentType}`)
    if (a.sparse) throw new MeshFileError('Sparse accessors are not read in models')
    const out = new Float64Array(a.count * size)
    if (a.bufferView === undefined) return { data: out, size }
    const v = json.bufferViews[a.bufferView]
    if ((v.buffer ?? 0) !== 0) throw new MeshFileError('The model keeps data outside the .glb')
    const stride = v.byteStride || size * t.bytes, start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0)
    if (a.count && start + (a.count - 1) * stride + size * t.bytes > Math.min(bin.byteLength, (v.byteOffset ?? 0) + v.byteLength)) throw new MeshFileError('An accessor runs past the end of its data')
    const norm = a.normalized ? t.max : 1
    for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) out[i * size + k] = t.get(bdv, start + i * stride + k * t.bytes) / norm
    return { data: out, size }
  }

  const images: MeshImage[] = []
  const imageOf = new Map<number, number>()
  const textureImage = (ti: number | undefined): number => {
    if (ti === undefined) return -1
    const src = json.textures?.[ti]?.source
    if (src === undefined) return -1
    if (!imageOf.has(src)) {
      const im = json.images?.[src]
      if (im?.bufferView === undefined) return -1
      const v = json.bufferViews[im.bufferView]
      const start = v.byteOffset ?? 0
      if (start + v.byteLength > bin.byteLength) throw new MeshFileError('An image runs past the end of the file')
      imageOf.set(src, images.length)
      images.push({ bytes: bin.slice(start, start + v.byteLength), mime: im.mimeType ?? 'image/png' })
    }
    return imageOf.get(src)!
  }
  return { json, read, images, textureImage }
}

/** Reads a .glb's triangles, placed by its node tree, with colors and the base color texture. */
export function readMeshGlb(bytes: Uint8Array): MeshFile {
  const g = openGlb(bytes)
  const mesh = gather(g, rootsOf(g.json).map((ni) => ({ ni, m: IDENTITY })))
  if (!mesh) throw new MeshFileError('The file has no triangles')
  return { mesh, images: g.images }
}

/** One thing in a model of a whole scene: a node at the top of its tree, with everything under it. */
export interface MeshPart {
  /** The node's own name, or "Part n". */
  name: string
  mesh: Mesh
}

/** Most things a whole scene is split into. */
export const MAX_MESH_PARTS = 40

/**
 * Reads a .glb of a whole scene as its things (#380): each node at the top of the tree with its children, placed as
 * in the file, so they stand where they stood. A lone node holding everything (as many exporters write a scene) is
 * looked inside. Nodes with no triangles are left out; the images are shared, as `tex` points into them.
 */
export function readMeshGlbParts(bytes: Uint8Array): { parts: MeshPart[]; images: MeshImage[] } {
  const g = openGlb(bytes)
  const { json } = g
  let tops = rootsOf(json).map((ni) => ({ ni, m: IDENTITY }))
  // a lone wrapper with no mesh of its own: its children are the scene's things
  for (let d = 0; d < 8 && tops.length === 1; d++) {
    const nd = json.nodes?.[tops[0].ni]
    if (!nd || nd.mesh !== undefined || !nd.children?.length) break
    const m = mul(tops[0].m, nodeMatrix(nd))
    tops = (nd.children as number[]).map((ni) => ({ ni, m }))
  }
  const parts: MeshPart[] = []
  let count = 0
  for (const t of tops) {
    const mesh = gather(g, [t], count)
    if (!mesh) continue
    count += mesh.indices.length / 3
    const own = json.nodes?.[t.ni]?.name
    parts.push({ name: typeof own === 'string' && own.trim() ? own.trim().slice(0, 60) : `Part ${parts.length + 1}`, mesh })
    if (parts.length > MAX_MESH_PARTS) throw new MeshFileError(`The scene has more than ${MAX_MESH_PARTS} things at the top of its tree`)
  }
  if (!parts.length) throw new MeshFileError('The file has no triangles')
  return { parts, images: g.images }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rootsOf(json: any): number[] {
  const scene = json.scenes?.[json.scene ?? 0]
  return scene?.nodes ?? (json.nodes ?? []).map((_: unknown, i: number) => i).filter((i: number) => !(json.nodes as { children?: number[] }[]).some((p) => p.children?.includes(i)))
}

/** The triangles under these nodes, placed by the tree; undefined when there are none. `before` counts triangles already read, against the most. */
function gather({ json, read, textureImage }: OpenGlb, starts: { ni: number; m: M4 }[], before = 0): Mesh | undefined {
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [], tex: number[] = []
  let anyColor = false, anyTex = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addMesh = (mesh: any, m: M4) => {
    for (const prim of mesh.primitives ?? []) {
      if ((prim.mode ?? 4) !== 4) continue
      if (prim.attributes?.POSITION === undefined) continue
      const P = read(prim.attributes.POSITION).data, n = P.length / 3
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
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]
        pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14])
        // glTF keeps colors linear; the voxel builder paints in sRGB
        for (let k = 0; k < 3; k++) col.push(toSrgb((C ? C.data[i * C.size + k] : 1) * f[k]))
        uv.push(T ? T[i * 2] : 0, T ? T[i * 2 + 1] : 0)
      }
      const I = prim.indices !== undefined ? read(prim.indices).data : Float64Array.from({ length: n }, (_, i) => i)
      for (let t = 0; t + 2 < I.length; t += 3) {
        if (I[t] >= n || I[t + 1] >= n || I[t + 2] >= n) throw new MeshFileError('A triangle points past its vertices')
        idx.push(base + I[t], base + I[t + 1], base + I[t + 2])
        tex.push(T ? img : -1)
      }
      if (T) anyTex = true
      if (before + idx.length / 3 > MAX_TRIANGLES) throw new MeshFileError(`The model has more than ${MAX_TRIANGLES.toLocaleString('en-US')} triangles`)
    }
  }
  const seen = new Set<number>()
  const walk = (ni: number, parent: M4) => {
    if (seen.has(ni)) throw new MeshFileError('The node tree loops')
    seen.add(ni)
    const nd = json.nodes?.[ni]
    if (!nd) throw new MeshFileError(`Node ${ni} is missing`)
    const m = mul(parent, nodeMatrix(nd))
    if (nd.mesh !== undefined) addMesh(json.meshes[nd.mesh], m)
    for (const c of nd.children ?? []) walk(c, m)
  }
  for (const st of starts) walk(st.ni, st.m)
  if (!idx.length) return undefined
  return {
    positions: new Float32Array(pos),
    indices: new Uint32Array(idx),
    colors: anyColor ? new Float32Array(col) : undefined,
    uvs: anyTex ? new Float32Array(uv) : undefined,
    tex: anyTex ? Int16Array.from(tex) : undefined,
  }
}

export function toSrgb(c: number): number {
  const x = Math.min(1, Math.max(0, c))
  return x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055
}

/** Reads a model by its file name: .obj (with its .mtl's text, if there is one) or .glb. */
export function readMeshFile(name: string, bytes: Uint8Array, mtl?: string): MeshFile {
  const ext = name.toLowerCase().split('.').pop()
  if (ext === 'obj') return readObj(new TextDecoder().decode(bytes), mtl)
  if (ext === 'glb') return readMeshGlb(bytes)
  throw new MeshFileError('Open an .obj or a .glb')
}
