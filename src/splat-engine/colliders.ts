import { openGlb } from './meshFile.ts'

/**
 * Colliders: simple solid shapes laid over a scan or a scene, which has none of its own. A scan is a cloud of blobs
 * with nothing to stand on or bump into; a box for the table, a cylinder for the mug and a slab for the floor give
 * feet a ground (`groundOf`, the `Ground` that `plantFeet` takes) and bodies something to stay out of (`pushOut`).
 *
 * A shape is a box, a ball or an upright cylinder, turned only about the upright, which is what furniture and floors
 * need and keeps every question (how far, how high, where a ray lands) a few lines. `writeColliderGlb` saves them as
 * ordinary glTF nodes with a mesh each, so the file opens anywhere as shapes, and `readColliderGlb` reads them back
 * exactly.
 */

type Vec3 = [number, number, number]

/** One solid shape. */
export interface Collider {
  /** A box, a ball, or a cylinder standing along y. */
  shape: 'box' | 'sphere' | 'cylinder'
  /** Its middle, in world space. */
  center: Vec3
  /** A box's half sizes; a ball's radius (the first value); a cylinder's radius and half height. */
  size: Vec3
  /** Degrees it is turned about the upright (a ball and a cylinder look the same turned). */
  turn: number
  /** What it stands for, if named: 'floor', 'table'. */
  name?: string
}

/** The smallest a shape's size may be dragged to. */
export const SMALLEST = 0.02

/** p in the shape's own frame: its middle at the origin, its turn undone. */
function local(c: Collider, p: ArrayLike<number>): Vec3 {
  const x = p[0] - c.center[0], y = p[1] - c.center[1], z = p[2] - c.center[2]
  if (c.shape !== 'box' || !c.turn) return [x, y, z]
  const r = (c.turn * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r)
  // undo a turn about +y by `turn`: x' = x cos − z sin, z' = x sin + z cos
  return [x * cs - z * sn, y, x * sn + z * cs]
}

/** A direction in the shape's own frame, as it lies in the world. */
function toWorld(c: Collider, v: Vec3): Vec3 {
  if (c.shape !== 'box' || !c.turn) return v
  const r = (c.turn * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r)
  return [v[0] * cs + v[2] * sn, v[1], -v[0] * sn + v[2] * cs]
}

/** Signed distance from p to the shape's surface: negative inside. */
export function colliderDistance(c: Collider, p: ArrayLike<number>): number {
  const q = local(c, p)
  if (c.shape === 'sphere') return Math.hypot(q[0], q[1], q[2]) - c.size[0]
  if (c.shape === 'cylinder') {
    const r = Math.hypot(q[0], q[2]) - c.size[0], h = Math.abs(q[1]) - c.size[1]
    return Math.hypot(Math.max(r, 0), Math.max(h, 0)) + Math.min(Math.max(r, h), 0)
  }
  const d = [Math.abs(q[0]) - c.size[0], Math.abs(q[1]) - c.size[1], Math.abs(q[2]) - c.size[2]]
  return Math.hypot(Math.max(d[0], 0), Math.max(d[1], 0), Math.max(d[2], 0)) + Math.min(Math.max(d[0], d[1], d[2]), 0)
}

/** How high the shape's top is over the point (x, z) of the floor, or undefined where it is not over it. */
export function topAt(c: Collider, x: number, z: number): number | undefined {
  const q = local(c, [x, c.center[1], z])
  if (c.shape === 'box') return Math.abs(q[0]) <= c.size[0] && Math.abs(q[2]) <= c.size[2] ? c.center[1] + c.size[1] : undefined
  const d2 = q[0] * q[0] + q[2] * q[2], r = c.size[0]
  if (d2 > r * r) return undefined
  return c.shape === 'cylinder' ? c.center[1] + c.size[1] : c.center[1] + Math.sqrt(r * r - d2)
}

/**
 * The ground the shapes make, for `plantFeet` and anything else that asks how high the floor is at (x, z): the
 * highest top under the point, and `base` where there is none.
 */
export function groundOf(colliders: readonly Collider[], base = 0): (x: number, z: number) => number {
  return (x, z) => {
    let top = base
    for (const c of colliders) { const t = topAt(c, x, z); if (t !== undefined && t > top) top = t }
    return top
  }
}

/** The same ground, but only tops no more than `step` above `from`: a shape too tall to step onto is a wall, not a floor. */
export function groundBelow(colliders: readonly Collider[], from: number, step: number, base = 0): (x: number, z: number) => number {
  return (x, z) => {
    let top = base
    for (const c of colliders) { const t = topAt(c, x, z); if (t !== undefined && t > top && t <= from + step) top = t }
    return top
  }
}

/** Which way is out of the shape at p (a unit vector), by its distance's slope. */
function outward(c: Collider, p: Vec3): Vec3 {
  const e = 1e-4
  const g: Vec3 = [
    colliderDistance(c, [p[0] + e, p[1], p[2]]) - colliderDistance(c, [p[0] - e, p[1], p[2]]),
    colliderDistance(c, [p[0], p[1] + e, p[2]]) - colliderDistance(c, [p[0], p[1] - e, p[2]]),
    colliderDistance(c, [p[0], p[1], p[2] + e]) - colliderDistance(c, [p[0], p[1], p[2] - e]),
  ]
  const l = Math.hypot(g[0], g[1], g[2])
  return l > 1e-12 ? [g[0] / l, g[1] / l, g[2] / l] : [0, 1, 0]
}

/** A ball of `radius` at p, moved the shortest way out of every shape it is in (a few rounds, for corners). */
export function pushOut(colliders: readonly Collider[], p: ArrayLike<number>, radius = 0): Vec3 {
  const out: Vec3 = [p[0], p[1], p[2]]
  for (let round = 0; round < 4; round++) {
    let moved = false
    for (const c of colliders) {
      const d = colliderDistance(c, out)
      if (d >= radius - 1e-9) continue
      const n = outward(c, out)
      for (let k = 0; k < 3; k++) out[k] += n[k] * (radius - d)
      moved = true
    }
    if (!moved) break
  }
  return out
}

/** How far along a ray (a unit `direction`) it first meets the shape, or undefined if it misses within `far`. */
export function rayCollider(c: Collider, origin: ArrayLike<number>, direction: ArrayLike<number>, far = 100): number | undefined {
  let t = 0
  for (let i = 0; i < 96 && t < far; i++) {
    const d = colliderDistance(c, [origin[0] + direction[0] * t, origin[1] + direction[1] * t, origin[2] + direction[2] * t])
    if (d < 1e-4) return t
    t += d
  }
  return undefined
}

/** The shape a ray meets first: its index and how far along, or undefined. */
export function pickCollider(colliders: readonly Collider[], origin: ArrayLike<number>, direction: ArrayLike<number>): { index: number; t: number } | undefined {
  let best: { index: number; t: number } | undefined
  colliders.forEach((c, index) => {
    const t = rayCollider(c, origin, direction)
    if (t !== undefined && (!best || t < best.t)) best = { index, t }
  })
  return best
}

/**
 * The shape as lines to draw over a picture: each entry is a run of points to join. A box's twelve edges, a cylinder's
 * two rims and four sides, a ball's three great circles. `steps` is how many points a circle gets.
 */
export function wireOf(c: Collider, steps = 24): Vec3[][] {
  const at = (v: Vec3): Vec3 => { const w = toWorld(c, v); return [c.center[0] + w[0], c.center[1] + w[1], c.center[2] + w[2]] }
  const ring = (r: number, y: number, plane: 0 | 1 | 2 = 1): Vec3[] => Array.from({ length: steps + 1 }, (_, i) => {
    const t = (i / steps) * Math.PI * 2, a = Math.cos(t) * r, b = Math.sin(t) * r
    return at(plane === 1 ? [a, y, b] : plane === 0 ? [0, a, b] : [a, b, 0])
  })
  if (c.shape === 'sphere') return [ring(c.size[0], 0, 1), ring(c.size[0], 0, 0), ring(c.size[0], 0, 2)]
  if (c.shape === 'cylinder') {
    const [r, h] = c.size
    const sides = [0, 1, 2, 3].map((k): Vec3[] => { const t = (k * Math.PI) / 2, x = Math.cos(t) * r, z = Math.sin(t) * r; return [at([x, -h, z]), at([x, h, z])] })
    return [ring(r, h), ring(r, -h), ...sides]
  }
  const [x, y, z] = c.size
  const rim = (h: number): Vec3[] => [at([-x, h, -z]), at([x, h, -z]), at([x, h, z]), at([-x, h, z]), at([-x, h, -z])]
  const posts = ([[-x, -z], [x, -z], [x, z], [-x, z]] as const).map(([a, b]): Vec3[] => [at([a, -y, b]), at([a, y, b])])
  return [rim(y), rim(-y), ...posts]
}

/** A handle on a shape: where it is, the way it pulls, and which of the shape's sizes it changes. */
export interface Handle {
  /** Which of the shape's sizes it changes. */
  key: 0 | 1 | 2
  /** Where it is, in world space. */
  at: Vec3
  /** The way it pulls (a unit vector): out along it grows the shape. */
  axis: Vec3
}

/** The handles that size a shape: one on each face that matters (a box's three, a cylinder's side and top, a ball's side). */
export function handlesOf(c: Collider): Handle[] {
  const keys: (0 | 1 | 2)[] = c.shape === 'box' ? [0, 1, 2] : c.shape === 'cylinder' ? [0, 1] : [0]
  return keys.map((key) => {
    const v: Vec3 = [0, 0, 0]
    v[key] = 1
    const axis = toWorld(c, v), s = c.size[key]
    return { key, axis, at: [c.center[0] + axis[0] * s, c.center[1] + axis[1] * s, c.center[2] + axis[2] * s] }
  })
}

/** The shape with one size changed by `by` (pulling its handle out or in); never smaller than `SMALLEST`. */
export function resized(c: Collider, key: 0 | 1 | 2, by: number): Collider {
  const size: Vec3 = [c.size[0], c.size[1], c.size[2]]
  size[key] = Math.max(SMALLEST, size[key] + by)
  return { ...c, size }
}

/** The shape scaled about the origin and then shifted: for a scan that is resized and stood somewhere else. */
export function placed(c: Collider, scale: number, shift: ArrayLike<number> = [0, 0, 0]): Collider {
  return { ...c, center: [c.center[0] * scale + shift[0], c.center[1] * scale + shift[1], c.center[2] * scale + shift[2]], size: [c.size[0] * scale, c.size[1] * scale, c.size[2] * scale] }
}

/**
 * A first guess for a scan: a slab for the floor (its top at `floor`, reaching well past the thing) and a box round
 * what was kept (`lo` to `hi`, from the floor up). Either is left out when it would have no size.
 */
export function guessColliders(lo: ArrayLike<number>, hi: ArrayLike<number>, floor: number): Collider[] {
  const out: Collider[] = []
  const wide = Math.max(hi[0] - lo[0], hi[2] - lo[2], 0.1), thick = 0.05
  const cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2
  out.push({ shape: 'box', name: 'floor', center: [cx, floor - thick, cz], size: [wide, thick, wide], turn: 0 })
  const bottom = Math.max(lo[1], floor), tall = hi[1] - bottom
  if (tall > SMALLEST && hi[0] - lo[0] > SMALLEST && hi[2] - lo[2] > SMALLEST) {
    out.push({ shape: 'box', name: 'object', center: [cx, bottom + tall / 2, cz], size: [(hi[0] - lo[0]) / 2, tall / 2, (hi[2] - lo[2]) / 2], turn: 0 })
  }
  return out
}

/** Thrown when a file holds no shapes we can read. */
export class ColliderFileError extends Error {}

/** A shape's surface as triangles in its own frame, so a file shows it anywhere. */
function meshOf(c: Collider): { positions: number[]; indices: number[] } {
  const positions: number[] = [], indices: number[] = []
  if (c.shape === 'box') {
    const [x, y, z] = c.size
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) positions.push(sx * x, sy * y, sz * z)
    // corners are numbered x·4 + y·2 + z; each face's two triangles wind outward
    indices.push(0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3)
    return { positions, indices }
  }
  const N = 20
  if (c.shape === 'cylinder') {
    const [r, h] = c.size
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; positions.push(Math.cos(a) * r, -h, Math.sin(a) * r, Math.cos(a) * r, h, Math.sin(a) * r) }
    positions.push(0, -h, 0, 0, h, 0)
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = ((i + 1) % N) * 2
      indices.push(a, a + 1, b + 1, a, b + 1, b, N * 2, a, b, N * 2 + 1, b + 1, a + 1)
    }
    return { positions, indices }
  }
  const R = c.size[0], M = 10
  for (let j = 0; j <= M; j++) for (let i = 0; i < N; i++) {
    const v = (j / M) * Math.PI, a = (i / N) * Math.PI * 2
    positions.push(Math.sin(v) * Math.cos(a) * R, Math.cos(v) * R, Math.sin(v) * Math.sin(a) * R)
  }
  for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
    const a = j * N + i, b = j * N + ((i + 1) % N), d = a + N, e = b + N
    indices.push(a, b, e, a, e, d)
  }
  return { positions, indices }
}

/** The name of our own note on a node: the shape exactly as it was, whatever else reads the file. */
const EXTRA = 'blobscape_collider'

/**
 * The shapes as a .glb: a node each, placed and turned, with a mesh of its surface so the file opens anywhere, our
 * own exact note in the node's `extras`, and the Khronos draft extensions for physics shapes (`KHR_implicit_shapes`,
 * `KHR_physics_rigid_bodies`; used, not required) so an engine that knows them takes the shapes as colliders.
 */
export function writeColliderGlb(colliders: readonly Collider[]): Uint8Array {
  const chunks: Uint8Array[] = []
  let at = 0
  const views: object[] = [], accessors: object[] = [], meshes: object[] = [], nodes: object[] = [], shapes: object[] = []
  const add = (data: Float32Array | Uint16Array, target: number) => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    views.push({ buffer: 0, byteOffset: at, byteLength: bytes.byteLength, target })
    chunks.push(bytes)
    at += bytes.byteLength
    const pad = (4 - (at % 4)) % 4
    if (pad) { chunks.push(new Uint8Array(pad)); at += pad }
    return views.length - 1
  }
  colliders.forEach((c, i) => {
    const m = meshOf(c)
    const pos = new Float32Array(m.positions), idx = new Uint16Array(m.indices)
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
    for (let k = 0; k < pos.length; k++) { lo[k % 3] = Math.min(lo[k % 3], pos[k]); hi[k % 3] = Math.max(hi[k % 3], pos[k]) }
    accessors.push({ bufferView: add(pos, 34962), componentType: 5126, count: pos.length / 3, type: 'VEC3', min: lo, max: hi })
    accessors.push({ bufferView: add(idx, 34963), componentType: 5123, count: idx.length, type: 'SCALAR' })
    meshes.push({ primitives: [{ attributes: { POSITION: i * 2 }, indices: i * 2 + 1 }] })
    shapes.push(
      c.shape === 'box' ? { type: 'box', box: { size: [c.size[0] * 2, c.size[1] * 2, c.size[2] * 2] } }
      : c.shape === 'sphere' ? { type: 'sphere', sphere: { radius: c.size[0] } }
      : { type: 'cylinder', cylinder: { height: c.size[1] * 2, radiusBottom: c.size[0], radiusTop: c.size[0] } },
    )
    const r = (c.turn * Math.PI) / 360
    nodes.push({
      name: c.name ?? `${c.shape} ${i + 1}`, mesh: i, translation: c.center, rotation: [0, Math.sin(r), 0, Math.cos(r)],
      extras: { [EXTRA]: { shape: c.shape, size: c.size, turn: c.turn, ...(c.name ? { name: c.name } : {}) } },
      extensions: { KHR_physics_rigid_bodies: { collider: { geometry: { shape: i } } } },
    })
  })
  const json = {
    asset: { version: '2.0', generator: 'Blobscape' },
    scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, accessors, bufferViews: views,
    buffers: [{ byteLength: at }],
    extensionsUsed: ['KHR_implicit_shapes', 'KHR_physics_rigid_bodies'],
    extensions: { KHR_implicit_shapes: { shapes } },
  }
  let text = new TextEncoder().encode(JSON.stringify(json))
  if (text.byteLength % 4) { const padded = new Uint8Array(text.byteLength + 4 - (text.byteLength % 4)).fill(0x20); padded.set(text); text = padded }
  const out = new Uint8Array(12 + 8 + text.byteLength + 8 + at)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.byteLength, true)
  dv.setUint32(12, text.byteLength, true); dv.setUint32(16, 0x4e4f534a, true)
  out.set(text, 20)
  const b = 20 + text.byteLength
  dv.setUint32(b, at, true); dv.setUint32(b + 4, 0x004e4942, true)
  let o = b + 8
  for (const c of chunks) { out.set(c, o); o += c.byteLength }
  return out
}

/** Whether a .glb's description says it holds shapes `readColliderGlb` reads. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hasShapes = (json: any) => Array.isArray(json?.nodes) && json.nodes.some((n: any) => n?.extras?.[EXTRA] || n?.extensions?.KHR_physics_rigid_bodies?.collider)

/** Whether these bytes are a .glb of colliders (ours, or another tool's with the physics shape extensions). */
export function isColliderGlb(bytes: Uint8Array): boolean {
  try { return hasShapes(openGlb(bytes).json) } catch { return false }
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)

/**
 * Reads the shapes back from a .glb: ours exactly, from each node's own note; another tool's from the physics shape
 * extensions (boxes, spheres and upright cylinders; a turn about the upright is kept, any other is dropped). At most
 * `most` shapes. Throws `ColliderFileError` when the file holds none.
 */
export function readColliderGlb(bytes: Uint8Array, most = 64): Collider[] {
  let json
  try { json = openGlb(bytes).json } catch (e) { throw new ColliderFileError(e instanceof Error ? e.message : 'Not a .glb file') }
  const out: Collider[] = []
  const shapes = json?.extensions?.KHR_implicit_shapes?.shapes
  for (const n of Array.isArray(json?.nodes) ? json.nodes : []) {
    if (out.length >= most) break
    const t = Array.isArray(n?.translation) ? n.translation : [0, 0, 0]
    const center: Vec3 = [num(t[0], 0), num(t[1], 0), num(t[2], 0)]
    const note = n?.extras?.[EXTRA]
    const name = typeof n?.name === 'string' ? n.name.slice(0, 40) : undefined
    if (note && (note.shape === 'box' || note.shape === 'sphere' || note.shape === 'cylinder') && Array.isArray(note.size)) {
      // only the sizes the shape uses have a smallest
      const used = note.shape === 'box' ? 3 : note.shape === 'cylinder' ? 2 : 1
      const size = [0, 1, 2].map((i) => (i < used ? Math.max(SMALLEST, num(note.size[i], 0.1)) : Math.max(0, num(note.size[i], 0)))) as Vec3
      out.push({ shape: note.shape, center, size, turn: num(note.turn, 0), ...(typeof note.name === 'string' ? { name: note.name.slice(0, 40) } : {}) })
      continue
    }
    const s = shapes?.[n?.extensions?.KHR_physics_rigid_bodies?.collider?.geometry?.shape]
    if (!s) continue
    const q = Array.isArray(n?.rotation) ? n.rotation : [0, 0, 0, 1]
    const turn = (2 * Math.atan2(num(q[1], 0), num(q[3], 1)) * 180) / Math.PI
    const k = Array.isArray(n?.scale) ? num(n.scale[0], 1) : 1
    if (s.type === 'box' && Array.isArray(s.box?.size)) out.push({ shape: 'box', center, size: [0, 1, 2].map((i) => Math.max(SMALLEST, (num(s.box.size[i], 0.2) * k) / 2)) as Vec3, turn, ...(name ? { name } : {}) })
    else if (s.type === 'sphere') out.push({ shape: 'sphere', center, size: [Math.max(SMALLEST, num(s.sphere?.radius, 0.1) * k), 0, 0], turn: 0, ...(name ? { name } : {}) })
    else if (s.type === 'cylinder') out.push({ shape: 'cylinder', center, size: [Math.max(SMALLEST, num(s.cylinder?.radiusBottom ?? s.cylinder?.radiusTop, 0.1) * k), Math.max(SMALLEST, (num(s.cylinder?.height, 0.2) * k) / 2), 0], turn: 0, ...(name ? { name } : {}) })
  }
  if (!out.length) throw new ColliderFileError('This .glb holds no collider shapes')
  return out
}
