import { Wax, radiiOf, radiusOf, type Blob } from './wax.ts'

/**
 * The wax drawn (pure, tested): the pool, every blob and every tie between them as one smoothly joined surface, cut
 * each frame into flat discs a grid cell apart, as voxel.ts cuts a scene's shapes. A blob is an ellipsoid drawn out
 * along its way, wobbling slowly; a tie is a tube that thins as it is drawn out; the joins are a smooth minimum, so a
 * bud keeps a neck to the pool until its tie snaps and two blobs about to merge reach for each other.
 */

/** How far a join reaches, as a share of the smaller of the two radii it joins (at least `JOIN_LEAST` cells). */
const JOIN = 0.55, JOIN_LEAST = 1.5
/** A blob's slow wobble, as a share of its radius, and how many times a second it goes round. */
const WOBBLE = 0.07, WOBBLE_RATE = 0.35
/** A tie's thickness at rest, as a share of the smaller radius it ties; it thins as it is drawn out to its snap. */
const TIE_THICK = 0.42
/** A disc's radius across the surface as a share of the grid (wider than a scene's, as a creature's are, so nothing behind shows between). */
export const WAX_DISC = 0.75

/** One shape of the wax, ready to ask distances of. */
interface Part {
  kind: 'blob' | 'tie'
  /** The box it reaches, joins included. */
  min: [number, number, number]; max: [number, number, number]
  /** For a blob: its middle, its way (unit), its radii along and across, its wobble's seed. */
  c: [number, number, number]; u: [number, number, number]; along: number; across: number; seed: number
  /** For a tie: its two ends and its thickness at each. */
  a: [number, number, number]; b: [number, number, number]; ra: number; rb: number
  temp: number
  /** How far its joins reach. */
  k: number
}

let kept = new Uint8Array(0)
/** A cleared array of marks, kept from call to call. */
function scratch(n: number) {
  if (kept.length < n) kept = new Uint8Array(n)
  else kept.fill(0, 0, n)
  return kept
}

const smin = (a: number, b: number, k: number) => {
  if (k <= 0) return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

/** Distance to an ellipsoid with radii `ra` along u and `rc` across, from a point given relative to its middle. */
function ellipsoid(px: number, py: number, pz: number, u: readonly number[], ra: number, rc: number) {
  const l = px * u[0] + py * u[1] + pz * u[2]
  const qx = px - l * u[0], qy = py - l * u[1], qz = pz - l * u[2]
  const s = Math.sqrt(qx * qx + qy * qy + qz * qz)
  const k0 = Math.hypot(l / ra, s / rc), k1 = Math.hypot(l / (ra * ra), s / (rc * rc))
  return k1 > 1e-12 ? (k0 * (k0 - 1)) / k1 : -Math.min(ra, rc)
}

/** Distance to a tube from a to b, ra thick at a and rb at b. */
function tube(px: number, py: number, pz: number, a: readonly number[], b: readonly number[], ra: number, rb: number) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], len2 = bx * bx + by * by + bz * bz
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * bx + (py - a[1]) * by + (pz - a[2]) * bz) / len2)) : 0
  return Math.hypot(px - a[0] - bx * t, py - a[1] - by * t, pz - a[2] - bz * t) - (ra + (rb - ra) * t)
}

/** The wax as shapes to ask distances of, at a moment of the page's clock (the wobble's). */
export function waxParts(wax: Wax, seconds: number, cell: number): Part[] {
  const parts: Part[] = []
  const byId = new Map(wax.blobs.map((b) => [b.id, b]))
  const blobPart = (b: Blob): Part => {
    const [along, across] = radiiOf(b)
    const speed = Math.hypot(b.vx, b.vy, b.vz)
    // the way it is drawn out: its way while it moves, else upright
    const u: [number, number, number] = speed > 1e-4 ? [b.vx / speed, b.vy / speed, b.vz / speed] : [0, 1, 0]
    const blend = Math.min(1, speed / 0.01)
    const w: [number, number, number] = [u[0] * blend, u[1] * blend + (1 - blend), u[2] * blend]
    const wl = Math.hypot(...w) || 1
    const k = Math.max(JOIN * across, cell * JOIN_LEAST), reach = along + k + along * WOBBLE
    return {
      kind: 'blob', c: [b.x, b.y, b.z], u: [w[0] / wl, w[1] / wl, w[2] / wl], along, across, seed: b.wobble + seconds * WOBBLE_RATE * Math.PI * 2,
      a: [0, 0, 0], b: [0, 0, 0], ra: 0, rb: 0, temp: b.temp, k,
      min: [b.x - reach, b.y - reach, b.z - reach], max: [b.x + reach, b.y + reach, b.z + reach],
    }
  }
  for (const b of wax.blobs) parts.push(blobPart(b))
  for (const t of wax.ties) {
    const a = byId.get(t.a), o = t.b >= 0 ? byId.get(t.b) : undefined
    if (!a || (t.b >= 0 && !o)) continue
    const ra = radiusOf(a.vol)
    const end: [number, number, number] = o ? [o.x, o.y, o.z] : [a.x * 0.6, wax.pool.depth - ra * 0.2, a.z * 0.6]
    const d = Math.hypot(end[0] - a.x, end[1] - a.y, end[2] - a.z)
    const thin = Math.max(0, 1 - d / t.snap)
    const rb = o ? radiusOf(o.vol) : ra * 1.4
    const r0 = Math.min(ra, rb) * TIE_THICK * thin
    if (r0 < cell * 0.4) continue
    const k = Math.max(JOIN * r0 * 2, cell * JOIN_LEAST), pad = r0 + k
    parts.push({
      kind: 'tie', a: [a.x, a.y, a.z], b: end, ra: r0, rb: r0 * (o ? 1 : 1.3), temp: (a.temp + (o ? o.temp : wax.pool.temp)) / 2, k,
      c: [0, 0, 0], u: [0, 1, 0], along: 0, across: 0, seed: 0,
      min: [Math.min(a.x, end[0]) - pad, Math.min(a.y, end[1]) - pad, Math.min(a.z, end[2]) - pad],
      max: [Math.max(a.x, end[0]) + pad, Math.max(a.y, end[1]) + pad, Math.max(a.z, end[2]) + pad],
    })
  }
  return parts
}

/** How hot the wax nearest the point last asked of `waxDistance` is. */
export let nearestTemp = 0

/** The surface of the wax: how far a point is from it, negative inside (and `nearestTemp` set). */
export function waxDistance(wax: Wax, parts: Part[], x: number, y: number, z: number, seconds: number, cell: number): number {
  const pool = wax.pool
  // the pool: a layer on the bottom whose top swells gently
  const swell = Math.sin(x * 31 + seconds * 0.7) * Math.sin(z * 27 - seconds * 0.5) * pool.depth * 0.08
  let d = y - (pool.depth + swell), temp = pool.temp, best = d
  for (const p of parts) {
    if (x < p.min[0] || y < p.min[1] || z < p.min[2] || x > p.max[0] || y > p.max[1] || z > p.max[2]) continue
    let e: number
    if (p.kind === 'blob') {
      const px = x - p.c[0], py = y - p.c[1], pz = z - p.c[2]
      e = ellipsoid(px, py, pz, p.u, p.along, p.across)
      // a slow wobble of the skin
      e += p.across * WOBBLE * Math.sin(px * 40 + p.seed) * Math.sin(py * 33 - p.seed * 0.7) * Math.sin(pz * 37 + p.seed * 1.3)
    } else e = tube(x, y, z, p.a, p.b, p.ra, p.rb)
    if (e < best) { best = e; temp = p.temp }
    d = smin(d, e, p.k)
  }
  // wax pressed against the glass is flat there
  const wall = Math.hypot(x, z) - (wax.vessel.radius(Math.max(0, y)) - cell * 0.5)
  nearestTemp = temp
  return Math.max(d, wall)
}

/** Discs on the wax's surface, as flat arrays a disc each; `count` is how many were made (at most the arrays hold). */
export interface WaxDiscs {
  count: number
  center: Float32Array
  normal: Float32Array
  temp: Float32Array
}

export function makeDiscs(capacity: number): WaxDiscs {
  return { count: 0, center: new Float32Array(capacity * 3), normal: new Float32Array(capacity * 3), temp: new Float32Array(capacity) }
}

/**
 * Cuts the wax's surface into discs on a grid of side `cell` in the vessel's own frame: a disc for every cell just
 * inside the surface, moved out onto it and laid flat along it. Nothing is made outside the glass.
 */
export function surfaceOf(wax: Wax, seconds: number, cell: number, into: WaxDiscs): WaxDiscs {
  const parts = waxParts(wax, seconds, cell)
  const v = wax.vessel
  let R = 0
  for (let k = 0; k <= 40; k++) R = Math.max(R, v.radius((k / 40) * v.height))
  const nx = Math.ceil((2 * R) / cell) + 2, ny = Math.ceil(v.height / cell) + 2
  const seen = scratch(nx * ny * nx)
  const at = (i: number, R0: number) => -R0 + (i + 0.5) * cell
  const cap = into.temp.length
  into.count = 0
  const e = cell * 0.35
  const visit = (i: number, j: number, k: number) => {
    const key = (j * nx + k) * nx + i
    if (seen[key]) return
    seen[key] = 1
    const x = at(i, R), y = (j + 0.5) * cell, z = at(k, R)
    const wall = v.radius(y)
    if (x * x + z * z > wall * wall) return
    const fd = waxDistance(wax, parts, x, y, z, seconds, cell), ft = nearestTemp
    if (fd > 0 || fd < -cell * 0.9 || into.count >= cap) return
    // the way out, from the distances either side
    const a = waxDistance(wax, parts, x + e, y - e, z - e, seconds, cell), b = waxDistance(wax, parts, x - e, y - e, z + e, seconds, cell)
    const c = waxDistance(wax, parts, x - e, y + e, z - e, seconds, cell), d = waxDistance(wax, parts, x + e, y + e, z + e, seconds, cell)
    const gx = a - b - c + d, gy = -a - b + c + d, gz = -a + b - c + d
    const g = Math.hypot(gx, gy, gz)
    if (g < 1e-9) return
    const n = [gx / g, gy / g, gz / g]
    const o = into.count++
    let px = x - n[0] * fd, py = y - n[1] * fd, pz = z - n[2] * fd
    // a disc moved onto the surface stays in the glass
    const rr = Math.hypot(px, pz), w2 = v.radius(Math.max(0, py)) - cell * 0.4
    if (rr > w2) { px *= w2 / rr; pz *= w2 / rr }
    py = Math.max(cell * 0.3, py)
    into.center[o * 3] = px; into.center[o * 3 + 1] = py; into.center[o * 3 + 2] = pz
    into.normal[o * 3] = n[0]; into.normal[o * 3 + 1] = n[1]; into.normal[o * 3 + 2] = n[2]
    into.temp[o] = ft
  }
  // coarse cells first, four fine cells a side: only those the surface may pass through are cut finely
  const C = 4, ncx = Math.ceil(nx / C), ncy = Math.ceil(ny / C)
  const coarse = new Uint8Array(ncx * ncy * ncx)
  const half = cell * C * 0.5, near = cell * C * 0.95
  const look = (ci: number, cj: number, ck: number) => {
    const key = (cj * ncx + ck) * ncx + ci
    if (coarse[key]) return
    coarse[key] = 1
    const x = -R + (ci * C) * cell + half, y = cj * C * cell + half, z = -R + (ck * C) * cell + half
    const wall = v.radius(Math.min(v.height, y)) + half * 1.8
    if (x * x + z * z > wall * wall) return
    if (Math.abs(waxDistance(wax, parts, x, y, z, seconds, cell)) > near) return
    for (let j = cj * C; j < Math.min(ny, cj * C + C); j++) for (let k = ck * C; k < Math.min(nx, ck * C + C); k++) for (let i = ci * C; i < Math.min(nx, ci * C + C); i++) visit(i, j, k)
  }
  const range = (lo: number, hi: number, off: number, n: number) => [Math.max(0, Math.floor((lo + off) / (cell * C))), Math.min(n - 1, Math.floor((hi + off) / (cell * C)))]
  // the pool, then each shape's box
  const [j0, j1] = range(0, wax.pool.depth * 1.1 + cell * 2, 0, ncy)
  for (let j = j0; j <= j1; j++) for (let k = 0; k < ncx; k++) for (let i = 0; i < ncx; i++) look(i, j, k)
  for (const p of parts) {
    const [i0, i1] = range(p.min[0], p.max[0], R, ncx), [k0, k1] = range(p.min[2], p.max[2], R, ncx), [a0, a1] = range(p.min[1], p.max[1], 0, ncy)
    for (let j = a0; j <= a1; j++) for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) look(i, j, k)
  }
  return into
}
