import { Blobs, type Quat, type Vec3 } from '../../splat-core/blobs.ts'
import { rng } from '../../splat-engine/body.ts'

/**
 * Cleaning up a phone scan of an object, without any drawing: find the
 * table or floor it sat on and turn the scan so that's level, cut the floor
 * away, crop to a box, and drop the stray blobs a capture always leaves
 * floating round it (floaters), the faint ones and the huge blurry ones.
 *
 * Every step gives a mask (1 keeps a blob), so the page can preview each one
 * and switch it off again; `keepOnly` makes the cleaned list at the end.
 */

export type Mask = Uint8Array

export interface Plane {
  /** Unit normal. */
  n: Vec3
  /** n·p = d for points on the plane. */
  d: number
  /** Share of the blobs within the tolerance of it. */
  share: number
}

/** The box round every blob's center, and its diagonal. */
export function extent(b: Blobs, mask?: Mask) {
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < b.count; i++) {
    if (mask && !mask[i]) continue
    for (let k = 0; k < 3; k++) {
      const v = b.center[i * 3 + k]
      if (v < lo[k]) lo[k] = v
      if (v > hi[k]) hi[k] = v
    }
  }
  if (lo[0] > hi[0]) return { lo: [0, 0, 0] as Vec3, hi: [0, 0, 0] as Vec3, diag: 0 }
  return { lo, hi, diag: Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) }
}

/** The box that holds the middle `share` of the blobs on each axis: a scan's edges are mostly stray blobs, so this frames the object. */
export function coreBox(b: Blobs, share = 0.96): { lo: Vec3; hi: Vec3 } {
  const lo: Vec3 = [0, 0, 0], hi: Vec3 = [0, 0, 0]
  if (!b.count) return { lo, hi }
  const step = Math.max(1, Math.floor(b.count / 50000))
  for (let k = 0; k < 3; k++) {
    const v: number[] = []
    for (let i = 0; i < b.count; i += step) v.push(b.center[i * 3 + k])
    v.sort((x, y) => x - y)
    const cut = (1 - share) / 2
    lo[k] = v[Math.floor(cut * (v.length - 1))]
    hi[k] = v[Math.ceil((1 - cut) * (v.length - 1))]
  }
  return { lo, hi }
}

/**
 * The flat surface most blobs lie on (the table or floor under the object),
 * by RANSAC: planes through three random blobs, scored by how many blobs lie
 * within `tol` of them (as a share of the core box's size), counting only
 * planes with no more than `oneSided` of the blobs on their far side. Returns
 * null when no plane holds at least `minShare` of the blobs.
 */
export function findFloor(b: Blobs, { tries = 400, tol = 0.012, minShare = 0.15, oneSided = 0.05, seed = 1 } = {}): Plane | null {
  if (b.count < 50) return null
  const rand = rng(seed)
  const box = coreBox(b, 0.9)
  const size = Math.hypot(box.hi[0] - box.lo[0], box.hi[1] - box.lo[1], box.hi[2] - box.lo[2]) || 1
  const t = tol * size
  // score on a sample, so a million-blob scan stays quick
  const n = Math.min(b.count, 20000)
  const pick = Array.from({ length: n }, () => Math.floor(rand() * b.count))
  const P = (i: number): Vec3 => [b.center[i * 3], b.center[i * 3 + 1], b.center[i * 3 + 2]]
  let best: Plane | null = null
  for (let k = 0; k < tries; k++) {
    const a = P(pick[Math.floor(rand() * n)]), c = P(pick[Math.floor(rand() * n)]), e = P(pick[Math.floor(rand() * n)])
    const u = sub(c, a), v = sub(e, a)
    const nn = cross(u, v), l = Math.hypot(...nn)
    // three points nearly in a line make no plane
    if (l < 1e-9 || l < 0.05 * Math.hypot(...u) * Math.hypot(...v)) continue
    const nrm: Vec3 = [nn[0] / l, nn[1] / l, nn[2] / l]
    const d = dot(nrm, a)
    let on = 0, above = 0, below = 0
    for (const i of pick) {
      const s = dot(nrm, P(i)) - d
      if (Math.abs(s) < t) on++
      else if (s > 0) above++
      else below++
    }
    // a floor has the object on one side of it: a flat part of the object itself (a lid, the coffee in a mug) has the rest on both
    if (Math.min(above, below) > oneSided * n) continue
    if (!best || on / n > best.share) best = { n: nrm, d, share: on / n }
  }
  if (!best || best.share < minShare) return null
  // refine: fit the plane again through every sampled blob near it (least squares, by the smallest axis of their spread)
  const near = pick.map(P).filter((p) => Math.abs(dot(best!.n, p) - best!.d) < t)
  const refined = fitPlane(near)
  if (refined) {
    const n2 = dot(refined.n, best.n) < 0 ? scale(refined.n, -1) : refined.n
    best = { n: n2, d: dot(n2, refined.c), share: best.share }
  }
  // face the normal toward the object: the side most of the other blobs are on
  let above = 0, below = 0
  for (const i of pick) {
    const s = dot(best.n, P(i)) - best.d
    if (s > t) above++
    else if (s < -t) below++
  }
  if (below > above) best = { n: scale(best.n, -1), d: -best.d, share: best.share }
  return best
}

/** The rotation that turns the plane's normal to +y, and how far to lift so the plane sits at y = 0. */
export function leveling(p: Plane): { q: Quat; lift: number } {
  const q = fromTo(p.n, [0, 1, 0])
  return { q, lift: -p.d }
}

/** Turns every blob by q about the origin, then moves it up by `lift`: a new list. */
export function turned(b: Blobs, q: Quat, lift = 0): Blobs {
  const out = b.clone()
  for (let i = 0; i < b.count; i++) {
    const c = rotate(q, [b.center[i * 3], b.center[i * 3 + 1], b.center[i * 3 + 2]])
    out.center.set([c[0], c[1] + lift, c[2]], i * 3)
    out.quat.set(mulQ(q, [b.quat[i * 4], b.quat[i * 4 + 1], b.quat[i * 4 + 2], b.quat[i * 4 + 3]]), i * 4)
  }
  return out
}

/** Keeps blobs above y = `above` (cutting a leveled floor away, with its thickness). */
export function floorMask(b: Blobs, above: number): Mask {
  const m = new Uint8Array(b.count)
  for (let i = 0; i < b.count; i++) m[i] = b.center[i * 3 + 1] > above ? 1 : 0
  return m
}

/** Keeps blobs whose center is inside the box. */
export function boxMask(b: Blobs, lo: Vec3, hi: Vec3): Mask {
  const m = new Uint8Array(b.count)
  for (let i = 0; i < b.count; i++) {
    let inside = 1
    for (let k = 0; k < 3; k++) { const v = b.center[i * 3 + k]; if (v < lo[k] || v > hi[k]) inside = 0 }
    m[i] = inside
  }
  return m
}

/** Keeps blobs at least `min` opaque. */
export function faintMask(b: Blobs, min: number): Mask {
  const m = new Uint8Array(b.count)
  for (let i = 0; i < b.count; i++) m[i] = b.opacity[i] >= min ? 1 : 0
  return m
}

/** Keeps blobs whose longest axis is under `share` of `size` (by default the scan's core size): drops the huge, blurry ones. */
export function hugeMask(b: Blobs, share: number, size = 0): Mask {
  if (!size) {
    const box = coreBox(b)
    size = Math.hypot(box.hi[0] - box.lo[0], box.hi[1] - box.lo[1], box.hi[2] - box.lo[2]) || 1
  }
  const max = share * size
  const m = new Uint8Array(b.count)
  for (let i = 0; i < b.count; i++) m[i] = Math.max(b.scale[i * 3], b.scale[i * 3 + 1], b.scale[i * 3 + 2]) < max ? 1 : 0
  return m
}

/**
 * Drops floaters: blobs off on their own, away from the object. The blobs
 * (those still in `within`) go into a grid of cells; cells with fewer than
 * `min` blobs count as empty; touching cells join up; and only the biggest
 * clump is kept, with any other clump at least `keepShare` of its size.
 * `strength` 0–1 sets both: stronger needs fuller cells and keeps fewer clumps.
 */
export function floaterMask(b: Blobs, strength: number, within?: Mask): Mask {
  const m = new Uint8Array(b.count)
  if (!b.count) return m
  const box = coreBox(b)
  const size = Math.max(box.hi[0] - box.lo[0], box.hi[1] - box.lo[1], box.hi[2] - box.lo[2]) || 1
  const min = 1 + Math.round(strength * 5)
  const keepShare = 0.3 - 0.25 * strength
  // start at 1/48 of the object; a sparse scan gets bigger cells, until the cell a typical blob is in holds a few times `min`
  let cell = size / 48
  let count = new Map<number, number>()
  const keys = new Float64Array(b.count).fill(-1)
  for (let tries = 0; tries < 6; tries++) {
    count = new Map()
    for (let i = 0; i < b.count; i++) {
      if (within && !within[i]) continue
      const k = cellKey(Math.floor(b.center[i * 3] / cell), Math.floor(b.center[i * 3 + 1] / cell), Math.floor(b.center[i * 3 + 2] / cell))
      keys[i] = k
      count.set(k, (count.get(k) ?? 0) + 1)
    }
    // how full the cell a typical blob sits in is (weighted by blobs, so a scatter of lone floaters doesn't count for much)
    const filled = [...count.values()].sort((x, y) => x - y)
    const total = filled.reduce((s, c) => s + c, 0)
    let seen = 0, typical = 0
    for (const c of filled) { seen += c; if (seen >= total / 2) { typical = c; break } }
    if (!total || typical >= 3 * min) break
    cell *= 1.6
  }
  // clumps of full cells, joined through their 26 neighbors
  const clump = new Map<number, number>()
  const sizes: number[] = []
  for (const [k, c] of count) {
    if (c < min || clump.has(k)) continue
    const id = sizes.length
    let total = 0
    const stack = [k]
    clump.set(k, id)
    while (stack.length) {
      const here = stack.pop()!
      total += count.get(here)!
      const x = Math.floor(here / SPAN / SPAN) - HALF, y = (Math.floor(here / SPAN) % SPAN) - HALF, z = (here % SPAN) - HALF
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const nk = cellKey(x + dx, y + dy, z + dz)
        if (clump.has(nk) || (count.get(nk) ?? 0) < min) continue
        clump.set(nk, id)
        stack.push(nk)
      }
    }
    sizes.push(total)
  }
  const biggest = Math.max(0, ...sizes)
  for (let i = 0; i < b.count; i++) {
    if (keys[i] < 0) continue
    const id = clump.get(keys[i])
    m[i] = id !== undefined && sizes[id] >= biggest * keepShare ? 1 : 0
  }
  return m
}

// grid cells as one number each (quicker than strings on a million blobs); blobs far out are held at the edge of the grid
const HALF = 100000, SPAN = 2 * HALF + 1
const clampCell = (v: number) => Math.max(-HALF, Math.min(HALF, v))
const cellKey = (x: number, y: number, z: number) => ((clampCell(x) + HALF) * SPAN + clampCell(y) + HALF) * SPAN + clampCell(z) + HALF

/** Every mask together: a blob stays only if all keep it. */
export function both(...masks: (Mask | null | undefined)[]): Mask | undefined {
  const real = masks.filter((m): m is Mask => !!m)
  if (!real.length) return undefined
  const out = new Uint8Array(real[0].length).fill(1)
  for (const m of real) for (let i = 0; i < out.length; i++) out[i] &= m[i]
  return out
}

export const kept = (m: Mask | undefined, n: number) => (m ? m.reduce((s, v) => s + v, 0) : n)

/** The blobs the mask keeps, as a new list (copied array to array: quick on a million blobs). */
export function keepOnly(b: Blobs, m?: Mask): Blobs {
  if (!m) return b.clone()
  const out = new Blobs(Math.max(1, kept(m, b.count)))
  let w = 0
  for (let i = 0; i < b.count; i++) {
    if (!m[i]) continue
    copyBlob(b, i, out, w++)
  }
  out.count = w
  return out
}

/** Copies blob i of `from` into slot j of `to` (which must have room). */
export function copyBlob(from: Blobs, i: number, to: Blobs, j: number) {
  to.center.set(from.center.subarray(i * 3, i * 3 + 3), j * 3)
  to.scale.set(from.scale.subarray(i * 3, i * 3 + 3), j * 3)
  to.quat.set(from.quat.subarray(i * 4, i * 4 + 4), j * 4)
  to.color.set(from.color.subarray(i * 3, i * 3 + 3), j * 3)
  to.opacity[j] = from.opacity[i]
}

// --- small vector helpers

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]

export function mulQ(a: ArrayLike<number>, b: ArrayLike<number>): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ]
}

export function rotate(q: ArrayLike<number>, v: ArrayLike<number>): Vec3 {
  const [x, y, z, w] = [q[0], q[1], q[2], q[3]]
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0])
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)]
}

/** The shortest turn from unit a to unit b. */
export function fromTo(a: Vec3, b: Vec3): Quat {
  const d = dot(a, b)
  if (d < -0.999999) {
    const axis: Vec3 = Math.abs(a[0]) < 0.9 ? [0, -a[2], a[1]] : [-a[1], a[0], 0]
    const l = Math.hypot(...axis)
    return [axis[0] / l, axis[1] / l, axis[2] / l, 0]
  }
  const c = cross(a, b)
  const q: Quat = [c[0], c[1], c[2], 1 + d]
  const l = Math.hypot(...q)
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
}

/** A turn of `deg` degrees about the axis. */
export function about(axis: Vec3, deg: number): Quat {
  const h = (deg * Math.PI) / 360, s = Math.sin(h)
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)]
}

/** Least-squares plane through points: their middle, and the direction they spread least in. */
function fitPlane(pts: Vec3[]): { n: Vec3; c: Vec3 } | null {
  if (pts.length < 3) return null
  const c: Vec3 = [0, 0, 0]
  for (const p of pts) for (let k = 0; k < 3; k++) c[k] += p[k] / pts.length
  const m = [0, 0, 0, 0, 0, 0] // xx xy xz yy yz zz
  for (const p of pts) {
    const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2]
    m[0] += x * x; m[1] += x * y; m[2] += x * z; m[3] += y * y; m[4] += y * z; m[5] += z * z
  }
  // the smallest axis: the largest column of the adjugate (as the engine finds a blob's normal)
  const [a, b, cc, d, e, f] = m
  const cols: Vec3[] = [
    [d * f - e * e, cc * e - b * f, b * e - cc * d],
    [cc * e - b * f, a * f - cc * cc, b * cc - a * e],
    [b * e - cc * d, b * cc - a * e, a * d - b * b],
  ]
  const best = cols.reduce((x, y) => (Math.hypot(...y) > Math.hypot(...x) ? y : x))
  const l = Math.hypot(...best)
  if (!(l > 0)) return null
  return { n: [best[0] / l, best[1] / l, best[2] / l], c }
}
