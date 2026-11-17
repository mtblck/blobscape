import type { Vec3 } from '../splat-core/blobs.ts'
import { hash, noise1 } from './built.ts'
import { many, type Shape, tighten } from './voxel.ts'

/**
 * Worn land and layered rock (issue #175): a height field worn by water and slumping (droplets carve gullies and drop
 * what they carry in fans; slopes too steep for their rock slide to scree), rock laid down in beds where soft beds wear
 * back further than hard ones, so ledges, benches and overhangs come by themselves, with hoodoos and natural arches as
 * presets; cracked mud whose plates curl at their edges; and pebbles along a stream bed, bigger where it runs fastest.
 *
 * Everything runs once, when the scene is built, from its numbers and a seed: the same seed, the same land. Erosion
 * has a budget (`MAX_DROPS`, a grid of at most `MAX_GRID` cells a side) so a build stays within a second or so.
 *
 * The idea comes from Silicon Jungle's Ink Studio erosion kit; this is our own code.
 */

/** A bed of rock: how thick it is and how hard (0 soft, worn back far, to 1 hard, standing out as a ledge). */
export interface Bed { thick: number; hard: number }

/** Beds when none are given: soft and hard by turns, a hard one on top. */
export const BEDS: Bed[] = [{ thick: 0.14, hard: 0.85 }, { thick: 0.2, hard: 0.25 }, { thick: 0.1, hard: 0.95 }, { thick: 0.22, hard: 0.35 }, { thick: 0.12, hard: 0.8 }, { thick: 0.18, hard: 0.2 }]

/** Which bed a height above the base is in, the beds repeating upward. */
export function bedAt(beds: Bed[], y: number): number {
  const total = beds.reduce((a, b) => a + b.thick, 0)
  let h = ((y % total) + total) % total
  for (let i = 0; i < beds.length; i++) { if (h < beds[i].thick) return i + beds.length * Math.floor(y / total); h -= beds[i].thick }
  return beds.length - 1
}
const hardAt = (beds: Bed[], y: number) => beds[((bedAt(beds, y) % beds.length) + beds.length) % beds.length].hard

// --- Land worn by water

/** Land worn by water, for `land` and `wornLand`. */
export interface LandSpec {
  /** The middle of its foot. */
  at: Vec3
  /** Half its size along x and z. */
  half: [number, number]
  /** Hills: each a place, a height and a reach. */
  peaks: { at: [number, number]; h: number; r: number }[]
  /** Rough ground over the hills, as a height. */
  noise?: number
  /** Water drops that run down it, each wearing it and dropping what it carries where it slows (0 to MAX_DROPS). */
  drops?: number
  /** How far slopes slump to scree, 0 to 1. */
  slump?: number
  /** Beds of rock, from the bottom up, repeating: soft ones wear faster. Left out, all one rock. */
  beds?: Bed[]
  seed: number
}

/** The most water drops a `LandSpec` may ask for. */
export const MAX_DROPS = 30000
/** The most cells along a side of a land's height grid. */
export const MAX_GRID = 112

/** Worn land as a grid of heights, from `wornLand`. */
export interface Land {
  /** Grid points along x. */
  nx: number
  /** Grid points along z. */
  nz: number
  /** The distance between grid points. */
  cell: number
  /** The grid's first x. */
  x0: number
  /** The grid's first z. */
  z0: number
  /** Heights above the foot, nx by nz. */
  height: Float32Array
  /** Where water ran (a running total of how much and how fast). */
  flow: Float32Array
  /** What was laid down: fans where water slowed, scree where slopes slid. */
  laid: Float32Array
  /** How much laid down counts as a fan or scree, not a dusting. */
  thick: number
  /** Height at (x, z) in the land's own frame (above its foot), smoothly between grid points. */
  at(x: number, z: number): number
}

const lands = new Map<string, Land>()

/** The land, built and worn once per spec (the scene asks again at every detail level). */
export function wornLand(s: LandSpec): Land {
  const key = JSON.stringify(s)
  const had = lands.get(key)
  if (had) return had
  const land = wear(s)
  if (lands.size > 16) lands.clear()
  lands.set(key, land)
  return land
}

function wear(s: LandSpec): Land {
  const cell = Math.max((Math.max(s.half[0], s.half[1]) * 2) / MAX_GRID, 0.02)
  const nx = Math.min(MAX_GRID, Math.ceil((s.half[0] * 2) / cell) + 1), nz = Math.min(MAX_GRID, Math.ceil((s.half[1] * 2) / cell) + 1)
  const x0 = s.at[0] - s.half[0], z0 = s.at[2] - s.half[1]
  const H = new Float32Array(nx * nz), flow = new Float32Array(nx * nz), laid = new Float32Array(nx * nz)
  const amp = s.noise ?? 0
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * cell, z = z0 + j * cell
    let h = 0
    for (const p of s.peaks) {
      const d = Math.hypot(x - p.at[0], z - p.at[1]) / p.r
      if (d < 1) h += p.h * (1 - d * d) ** 2
    }
    // rough ground: two scales of smooth noise
    h += amp * (noise2(s.seed, x, z, 0.5) - 0.5) + amp * 0.5 * (noise2(s.seed + 3, x, z, 0.17) - 0.5)
    H[j * nx + i] = Math.max(0, h)
  }
  const beds = s.beds
  // rock in beds stands in steps before any water runs: hard beds as cliffs with a bench on top, soft ones as slopes
  if (beds) for (let k = 0; k < H.length; k++) H[k] = terrace(beds, H[k])
  const soft = (y: number) => (beds ? 1.35 - hardAt(beds, y) : 1)
  const get = (x: number, z: number) => {
    const fx = Math.min(nx - 1.001, Math.max(0, x)), fz = Math.min(nz - 1.001, Math.max(0, z))
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * nx + i
    return { h: H[k] * (1 - u) * (1 - v) + H[k + 1] * u * (1 - v) + H[k + nx] * (1 - u) * v + H[k + nx + 1] * u * v, gx: (H[k + 1] - H[k]) * (1 - v) + (H[k + nx + 1] - H[k + nx]) * v, gz: (H[k + nx] - H[k]) * (1 - u) + (H[k + nx + 1] - H[k + 1]) * u, i, j, u, v }
  }
  const put = (g: { i: number; j: number; u: number; v: number }, dh: number, into?: Float32Array) => {
    const k = g.j * nx + g.i, w = [(1 - g.u) * (1 - g.v), g.u * (1 - g.v), (1 - g.u) * g.v, g.u * g.v], ks = [k, k + 1, k + nx, k + nx + 1]
    for (let q = 0; q < 4; q++) { H[ks[q]] = Math.max(0, H[ks[q]] + dh * w[q]); if (into) into[ks[q]] += Math.max(0, dh) * w[q] }
  }
  // droplets: each runs downhill, picks up what it can carry and drops it where it slows
  const drops = Math.min(MAX_DROPS, Math.max(0, Math.round(s.drops ?? 0)))
  let seed = (s.seed * 2654435761) >>> 0 || 1
  const rand = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296 }
  const inertia = 0.3, capacityK = 1.5, erodeK = 0.3, depositK = 0.3, evaporate = 0.03
  for (let d = 0; d < drops; d++) {
    let x = 1 + rand() * (nx - 3), z = 1 + rand() * (nz - 3), dx = 0, dz = 0, speed = 1, water = 1, carry = 0
    for (let step = 0; step < 48; step++) {
      const g = get(x, z)
      dx = dx * inertia - g.gx * (1 - inertia); dz = dz * inertia - g.gz * (1 - inertia)
      const l = Math.hypot(dx, dz)
      if (l < 1e-6) break
      dx /= l; dz /= l
      x += dx; z += dz
      if (x < 1 || z < 1 || x > nx - 2 || z > nz - 2) break
      const next = get(x, z), dh = next.h - g.h
      flow[g.j * nx + g.i] += water * speed
      const cap = Math.max(-dh, 0.01 * cell) * speed * water * capacityK
      if (carry > cap || dh > 0) {
        // uphill or too slow: lay down what it can't carry (up to the rise, going uphill)
        const lay = dh > 0 ? Math.min(dh, carry) : (carry - cap) * depositK
        carry -= lay
        put(g, lay, laid)
      } else {
        // soft beds give more for the same water
        const take = Math.min((cap - carry) * erodeK * soft(g.h + s.at[1]), -dh)
        put(g, -take)
        carry += take
      }
      speed = Math.sqrt(Math.max(0, speed * speed - dh * 4))
      water *= 1 - evaporate
      if (water < 0.05) break
    }
  }
  // slumping: a slope steeper than its rock can hold slides down until it can; hard beds hold steeper
  const slump = s.slump ?? 0
  if (slump > 0) {
    const passes = Math.round(4 + 60 * slump)
    for (let p = 0; p < passes; p++) for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i
      const talus = cell * (beds ? 0.6 + 2.2 * hardAt(beds, H[k] + s.at[1]) : 1.1) * (1.4 - slump)
      for (const n of [k + 1, k - 1, k + nx, k - nx]) {
        const diff = H[k] - H[n]
        if (diff > talus) { const mv = (diff - talus) * 0.25; H[k] -= mv; H[n] += mv; laid[n] += mv }
      }
    }
  }
  // only the thickest fifth of what was laid counts as fans and scree: a dusting everywhere would paint it all
  const some = Array.from(laid).filter((v) => v > 0).sort((p, q) => p - q)
  const thick = some.length ? some[Math.floor(some.length * 0.8)] : Infinity
  return {
    nx, nz, cell, x0, z0, height: H, flow, laid, thick,
    at: (x, z) => get((x - x0) / cell, (z - z0) / cell).h,
  }
}

/**
 * Heights remapped into steps by the beds they fall in: going up a slope, a hard bed rises as a cliff (most of its
 * height over little ground) and then holds level for a bench, while a soft bed rises evenly as a slope.
 */
export function terrace(beds: Bed[], h: number): number {
  // how much ground (in input height) each bed spreads over, and the bench after a hard one
  let inAt = 0, outAt = 0
  for (let rep = 0; rep < 64; rep++) for (const b of beds) {
    const climb = b.thick * (1.25 - b.hard), bench = b.thick * b.hard * 1.4
    if (h < inAt + climb) return outAt + (b.thick * (h - inAt)) / climb
    inAt += climb; outAt += b.thick
    if (h < inAt + bench) return outAt
    inAt += bench
  }
  return outAt
}

/** Smooth 2D noise in 0..1 with lumps about `size` across. */
function noise2(seed: number, x: number, z: number, size: number) {
  const fx = x / size, fz = z / size, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v)
  const h = (a: number, b: number) => hash(seed, a, b, 5)
  return (h(i, j) * (1 - su) + h(i + 1, j) * su) * (1 - sv) + (h(i, j + 1) * (1 - su) + h(i + 1, j + 1) * su) * sv
}

/** Worn land as a shape: its surface from the height field, sides cut straight down, its foot `base` deep. Pieces: the bed a point is in, or -1 where something was laid down (fans and scree). */
export function land(s: LandSpec & { base?: number }): Shape {
  const L = wornLand(s)
  const base = s.base ?? 0.2
  const top = Math.max(...L.height)
  const grad = (x: number, z: number) => {
    const e = L.cell * 0.5
    return [(L.at(x + e, z) - L.at(x - e, z)) / (2 * e), (L.at(x, z + e) - L.at(x, z - e)) / (2 * e)]
  }
  const sdf = (x: number, y: number, z: number) => {
    const out = Math.max(Math.abs(x - s.at[0]) - s.half[0], Math.abs(z - s.at[2]) - s.half[1], s.at[1] - base - y)
    const h = s.at[1] + L.at(x, z)
    if (y > h + L.cell * 4) return Math.max(out, (y - h) / Math.hypot(1, 3))
    const [gx, gz] = grad(x, z)
    return Math.max(out, (y - h) / Math.hypot(1, gx, gz))
  }
  const lay = (x: number, z: number) => {
    const fx = Math.min(L.nx - 1, Math.max(0, Math.round((x - L.x0) / L.cell))), fz = Math.min(L.nz - 1, Math.max(0, Math.round((z - L.z0) / L.cell)))
    return L.laid[fz * L.nx + fx]
  }
  return {
    sdf,
    min: [s.at[0] - s.half[0], s.at[1] - base, s.at[2] - s.half[1]], max: [s.at[0] + s.half[0], s.at[1] + top, s.at[2] + s.half[1]],
    pieceAt: (p) => {
      const h = s.at[1] + L.at(p[0], p[2])
      // laid down at the surface only: deeper is the rock beneath
      if (p[1] > h - L.cell * 1.5 && lay(p[0], p[2]) >= L.thick) return -1
      return s.beds ? ((bedAt(s.beds, p[1] - s.at[1]) % s.beds.length) + s.beds.length) % s.beds.length : 0
    },
  }
}

// --- Buttes, hoodoos and arches

/** A butte for `butte`: beds of rock, the soft ones worn back. */
export interface ButteSpec {
  /** The middle of its foot. */
  at: Vec3
  r: number
  height: number
  beds?: Bed[]
  /** How far each soft bed is worn back, as a share of the radius (0.3). */
  wear?: number
  /** A caprock this much wider than the rock under it, as a share (0: none). */
  cap?: number
  seed: number
}

/**
 * A butte, mesa or hoodoo: rock in beds, turned about the upright, each bed worn back by how soft it is, so hard beds
 * stand out as ledges over the soft ones under them, and a wide caprock overhangs. A scree apron flares at its foot.
 */
const NEAR_BEDS = [-0.06, -0.045, -0.03, -0.015, 0.015, 0.03, 0.045, 0.06]

function butteRaw(s: ButteSpec): Shape {
  const beds = s.beds ?? BEDS
  const wear = s.wear ?? 0.3, cap = s.cap ?? 0
  const capH = cap > 0 ? Math.min(s.height * 0.18, s.r * 0.6) : 0
  /** The radius at a height above the foot, before the wobble round it. */
  const radius = (y: number) => {
    // worn back by softness, eased across a bed's edges so ledges round off a little
    const lo = hardAt(beds, y - 0.02), hi = hardAt(beds, y + 0.02), here = hardAt(beds, y)
    const h = (lo + hi + here * 2) / 4
    const apron = s.r * 0.35 * Math.exp(-y / (s.height * 0.12))
    // a little narrower toward the top, as rock is worn from above too
    return s.r * (1 - wear * (1 - h)) * (1 - 0.15 * (y / s.height)) + apron
  }
  const sdf = (x: number, y: number, z: number) => {
    const q: Vec3 = [x - s.at[0], y - s.at[1], z - s.at[2]]
    const ang = Math.atan2(q[2], q[0])
    const wobble = 1 + 0.1 * (noise1(s.seed, ang * 3 + q[1] * 2, 1) - 0.5) + 0.06 * Math.sin(ang * 5 + s.seed)
    const rho = Math.hypot(q[0], q[2])
    const at = (y: number) => radius(Math.min(s.height, Math.max(0, y))) * wobble
    let side = rho - at(q[1])
    // the beds step the radius, so a wider bed just above or below may be nearer than the face level with the point
    if (side > 0) for (const o of NEAR_BEDS) side = Math.min(side, Math.hypot(Math.max(0, rho - at(q[1] + o)), Math.max(0, Math.abs(o) - 0.012)))
    side *= 0.7
    const top = q[1] - s.height + (cap > 0 ? -capH * 0.4 * Math.max(0, 1 - (rho / (s.r * (1 + cap))) ** 2) : 0)
    const body = Math.max(side, top, -q[1])
    if (cap <= 0) return body
    // the caprock is a slab of its own laid on top, so its overhang has a distance of its own
    const capSide = (rho - s.r * (1 + cap) * wobble) * 0.7
    const slab = Math.max(capSide, top, s.height - capH - q[1])
    return Math.min(body, slab)
  }
  const R = s.r * (1.4 + cap)
  return {
    sdf, min: [s.at[0] - R, s.at[1], s.at[2] - R], max: [s.at[0] + R, s.at[1] + s.height + capH * 0.4, s.at[2] + R],
    pieceAt: (p) => (cap > 0 && p[1] - s.at[1] > s.height - capH ? beds.length : ((bedAt(beds, p[1] - s.at[1]) % beds.length) + beds.length) % beds.length),
  }
}

/** A hoodoo: a thin butte of soft rock, waisted where its softest beds are, under a hard cap. */
export function hoodoo(s: { at: Vec3; height: number; r: number; seed: number }): Shape {
  const n = 3 + Math.floor(hash(s.seed, 1) * 3), beds: Bed[] = []
  for (let i = 0; i < n; i++) beds.push({ thick: (s.height / n) * (0.7 + 0.6 * hash(s.seed, i, 2)), hard: i % 2 ? 0.15 : 0.55 })
  return butte({ at: s.at, r: s.r, height: s.height, beds, wear: 0.55, cap: 0.5, seed: s.seed })
}

/** A rock arch for `arch`. */
export interface ArchSpec {
  /** The feet of its two legs, on the ground. */
  from: Vec3
  to: Vec3
  height: number
  /** How thick the fin of rock is. */
  thick: number
  /** How high the soft bed the hole wore through sits: its middle, as a share of the height (0.4). */
  soft?: number
  beds?: Bed[]
  seed: number
}

/** A natural arch: a fin of rock in beds, with a hole worn through its soft bed so a span of hard rock bridges it. */
function archRaw(s: ArchSpec): Shape {
  const dx = s.to[0] - s.from[0], dz = s.to[2] - s.from[2], l = Math.hypot(dx, dz) || 1e-6
  const ux = dx / l, uz = dz / l
  const beds = s.beds ?? BEDS
  const holeMid = s.height * (s.soft ?? 0.4)
  const a = l * 0.36, b = Math.min(holeMid * 0.95, s.height * 0.32)
  const sdf = (x: number, y: number, z: number) => {
    const px = x - s.from[0], pz = z - s.from[2], v = y - s.from[1]
    const u = px * ux + pz * uz - l / 2, w = -px * uz + pz * ux
    const t = Math.min(1, Math.max(0, v / s.height))
    // the fin: thinner toward its top, its top rounded down to the ends, its sides worn by the beds
    const soft = 1 - hardAt(beds, v)
    const halfW = (s.thick / 2) * (1 - 0.35 * t) * (1 - 0.3 * soft) * (1 + 0.15 * (noise1(s.seed, u * 3 + v * 5, 0.4) - 0.5))
    const halfL = l / 2 + s.thick * 0.6
    const topH = s.height * (1 - 0.35 * (u / halfL) ** 2)
    const fin = Math.max(Math.abs(w) - halfW, Math.abs(u) - halfL, v - topH, -v) * 0.8
    // the hole, an ellipse in the fin's plane, worn wider in the soft bed
    const hole = (Math.hypot(u / a, (v - holeMid) / b) - 1) * Math.min(a, b)
    return Math.max(fin, -hole)
  }
  const R = l / 2 + s.thick * 1.5, mx = (s.from[0] + s.to[0]) / 2, mz = (s.from[2] + s.to[2]) / 2
  return {
    sdf, min: [mx - R, s.from[1], mz - R], max: [mx + R, s.from[1] + s.height, mz + R],
    pieceAt: (p) => ((bedAt(beds, p[1] - s.from[1]) % beds.length) + beds.length) % beds.length,
  }
}

// --- Cracked mud and pebbles

/** A patch of cracked mud for `mud`. */
export interface MudSpec {
  /** The middle of the patch, on the ground. */
  at: Vec3
  r: number
  /** About how wide a plate is. */
  plate: number
  /** How far plate edges curl up, 0 to 1. */
  curl?: number
  seed: number
}

/** The nearest two plate middles to (x, z) on a jittered grid: which plate, and how far in from its edge. */
function plates(s: MudSpec, x: number, z: number) {
  const fx = (x - s.at[0]) / s.plate, fz = (z - s.at[2]) / s.plate, i0 = Math.floor(fx), j0 = Math.floor(fz)
  let d1 = Infinity, d2 = Infinity, id = 0
  for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) {
    const cx = i + 0.15 + 0.7 * hash(s.seed, i, j, 1), cz = j + 0.15 + 0.7 * hash(s.seed, i, j, 2)
    const d = Math.hypot(fx - cx, fz - cz)
    if (d < d1) { d2 = d1; d1 = d; id = ((i + 512) * 1031 + j + 512) & 0xffff } else if (d < d2) d2 = d
  }
  return { id, edge: ((d2 - d1) / 2) * s.plate }
}

/** Dried mud cracked into plates, each plate's edges curled up off the ground, the cracks between them sunk. Each plate is a piece. */
function mudRaw(s: MudSpec, cell = 0): Shape {
  const thick = Math.max(s.plate * 0.06, cell)
  const gap = Math.max(s.plate * 0.05, cell * 0.6)
  const curl = (s.curl ?? 0.5) * s.plate * 0.18
  const sdf = (x: number, y: number, z: number) => {
    const { edge } = plates(s, x, z)
    const disc = Math.hypot(x - s.at[0], z - s.at[2]) - s.r
    const liftAt = (e: number) => curl * Math.max(0, 1 - e / (s.plate * 0.35)) ** 2
    let above: number
    if (edge < gap) {
      // over a crack: down to its floor, or across to the nearest plate's raised edge, whichever is nearer
      const rim = s.at[1] + thick + liftAt(gap)
      above = Math.min((y - (s.at[1] - thick)) * 0.6, Math.hypot(gap - edge, Math.max(0, y - rim)))
    } else above = (y - (s.at[1] + thick + liftAt(edge))) * 0.6
    return Math.max(above, s.at[1] - thick * 2 - y, disc)
  }
  return {
    sdf, min: [s.at[0] - s.r, s.at[1] - thick * 2, s.at[2] - s.r], max: [s.at[0] + s.r, s.at[1] + thick + curl, s.at[2] + s.r],
    pieceAt: (p) => { const k = plates(s, p[0], p[2]); return k.edge < gap ? -1 : k.id },
  }
}

/** Pebbles along a stream bed, for `pebbles`. */
export interface PebbleSpec {
  /** The stream's line, on the ground. */
  path: Vec3[]
  width: number
  count: number
  /** The biggest pebble, mid-stream. */
  size: number
  seed: number
}

/** Pebbles along a stream bed: placed at random along it and across it, bigger toward the middle where water runs fastest. */
export function pebbleList(s: PebbleSpec): { at: Vec3; r: Vec3 }[] {
  const lens = s.path.slice(1).map((q, i) => Math.hypot(q[0] - s.path[i][0], q[2] - s.path[i][2]))
  const total = lens.reduce((a, b) => a + b, 0) || 1
  return Array.from({ length: Math.min(200, Math.max(1, Math.round(s.count))) }, (_, k) => {
    const r = (q: number) => hash(s.seed, k, q)
    let t = r(1) * total, i = 0
    while (i < lens.length - 1 && t > lens[i]) { t -= lens[i]; i++ }
    const a = s.path[i], b = s.path[i + 1], f = t / (lens[i] || 1)
    const dx = (b[0] - a[0]) / (lens[i] || 1), dz = (b[2] - a[2]) / (lens[i] || 1)
    const across = (r(2) * 2 - 1) * s.width / 2
    // water runs fastest mid-stream: the biggest stones stay there, the small ones wash to the sides
    const fast = 1 - (across / (s.width / 2)) ** 2
    const size = s.size * (0.3 + 0.7 * fast) * (0.6 + 0.4 * r(3))
    const at: Vec3 = [a[0] + (b[0] - a[0]) * f - dz * across, a[1] + (b[1] - a[1]) * f + size * 0.25, a[2] + (b[2] - a[2]) * f + dx * across]
    return { at, r: [size * (0.8 + 0.4 * r(4)), size * 0.55, size * (0.8 + 0.4 * r(5))] }
  })
}

/**
 * Pebbles along a stream's line, the biggest mid-stream. `cell` is the grid's cell size, so none comes out smaller
 * than a cell.
 */
export function pebbles(s: PebbleSpec, cell = 0): Shape {
  return many(pebbleList(s).map((p) => {
    const r: Vec3 = [Math.max(p.r[0], cell), Math.max(p.r[1], cell * 0.8), Math.max(p.r[2], cell)]
    const m = Math.min(...r)
    return {
      sdf: (x: number, y: number, z: number) => (Math.hypot((x - p.at[0]) / r[0], (y - p.at[1]) / r[1], (z - p.at[2]) / r[2]) - 1) * m,
      min: [p.at[0] - r[0], p.at[1] - r[1], p.at[2] - r[2]] as Vec3, max: [p.at[0] + r[0], p.at[1] + r[1], p.at[2] + r[2]] as Vec3,
    }
  }))
}

/** See butteRaw; its wobble and worn beds make the side distance a little ragged. */
export const butte = (s: ButteSpec): Shape => tighten(butteRaw(s), 0.55)

/** A rock arch: a fin of rock with a hole worn through its soft bed. */
export const arch = (s: ArchSpec): Shape => tighten(archRaw(s), 0.88)

/**
 * Cracked mud: plates with curled edges. `cell` is the grid's cell size, so the cracks are never thinner than a cell.
 */
export const mud = (s: MudSpec, cell = 0): Shape => tighten(mudRaw(s, cell), 0.6)
