import type { Vec3 } from '../splat-core/blobs.ts'
import { many, orientedBox, type Shape, tighten } from './voxel.ts'

/**
 * Built things (issue #176): walls of real bricks, flights of worn steps, fences along a path and arcades cut into
 * equal bays, each one shape however many pieces it has. Pure numbers and distance functions, so the scene builder
 * cuts them like any other shape, and each shape's `pieceAt` says which brick, block, post or stone a point is on,
 * for the `pieces` paint.
 *
 * Every piece is placed by a rule from the shape's own sizes and a seed (the same seed, the same ruin), and sizes are
 * fitted so the pieces come out whole: a wall's length is a whole number of bricks (half bricks at the ends of every
 * other course), a span a whole number of bays, so pillars and posts land exactly at its ends.
 *
 * The idea comes from Silicon Jungle's Ink Studio built-things kit; this is our own code.
 */

/** A repeatable number in 0..1 from a seed and up to three whole numbers. */
export function hash(seed: number, a: number, b = 0, c = 0) {
  const v = Math.sin(seed * 12.9898 + a * 78.233 + b * 37.719 + c * 11.131 + 0.5) * 43758.5453
  return v - Math.floor(v)
}

/** Smooth 1D noise in 0..1 with bumps about `size` apart. */
export function noise1(seed: number, u: number, size: number) {
  const f = u / size, i = Math.floor(f), t = f - i, k = t * t * (3 - 2 * t)
  return hash(seed, i, 91) * (1 - k) + hash(seed, i + 1, 91) * k
}

const len2 = (x: number, z: number) => Math.hypot(x, z)

/** The distance to a box given by its half size, in a frame where it sits at the origin. */
function boxD(qx: number, qy: number, qz: number, hx: number, hy: number, hz: number, round = 0) {
  const ax = Math.abs(qx) - hx + round, ay = Math.abs(qy) - hy + round, az = Math.abs(qz) - hz + round
  return Math.hypot(Math.max(ax, 0), Math.max(ay, 0), Math.max(az, 0)) + Math.min(Math.max(ax, ay, az), 0) - round
}

/** A frame lying along the ground from `from` toward `to`: u along it, w across it (to its left), v up from `from`'s height. */
function groundFrame(from: Vec3, to: Vec3) {
  const dx = to[0] - from[0], dz = to[2] - from[2], len = len2(dx, dz) || 1e-6
  const ux = dx / len, uz = dz / len
  return {
    len, ux, uz,
    local: (x: number, y: number, z: number): [number, number, number] => {
      const px = x - from[0], pz = z - from[2]
      return [px * ux + pz * uz, y - from[1], -px * uz + pz * ux]
    },
    world: (u: number, v: number, w: number): Vec3 => [from[0] + u * ux - w * uz, from[1] + v, from[2] + u * uz + w * ux],
  }
}

/** The box (low and high corners) round a frame's slab: u 0..len, v lo..hi, w ±half. */
function slabBox(f: ReturnType<typeof groundFrame>, vLo: number, vHi: number, half: number) {
  const pts = [f.world(0, vLo, -half), f.world(0, vLo, half), f.world(f.len, vLo, -half), f.world(f.len, vLo, half)]
  return {
    min: [Math.min(...pts.map((p) => p[0])), pts[0][1], Math.min(...pts.map((p) => p[2]))] as Vec3,
    max: [Math.max(...pts.map((p) => p[0])), pts[0][1] + (vHi - vLo), Math.max(...pts.map((p) => p[2]))] as Vec3,
  }
}

// --- Walls

/** A brick wall for `wall`. */
export interface WallSpec {
  /** The foot of the wall at one end and at the other; the wall stands on `from`'s height. */
  from: Vec3
  /** The foot of the wall at its other end. */
  to: Vec3
  /** How high it stands. */
  height: number
  /** How thick it is. */
  thick: number
  /** A brick's length and height (a course), fitted so whole courses and bricks fill the wall. */
  brick?: [number, number]
  /** How far bricks sit proud or sunk and vary in size, 0 to 1. */
  jitter?: number
  /** How much of the top has fallen, 0 (whole) to 1 (down to the ground in places). */
  ruin?: number
  /** The share of bricks gone from the face, showing the mortar core behind, 0 to 0.5. */
  missing?: number
  /** Bricks lying at the foot of the wall, fallen from its top. */
  fallen?: number
  /** The same seed gives the same result. */
  seed: number
}

/** A brick's length and height where a wall gives none. */
export const WALL_BRICK: [number, number] = [0.16, 0.08]

/** How the bricks of a wall are laid: fitted sizes and which bricks stand. */
export function wallPlan(s: WallSpec) {
  const f = groundFrame(s.from, s.to)
  const [bl0, bh0] = s.brick ?? WALL_BRICK
  const rows = Math.max(1, Math.round(s.height / bh0)), bh = s.height / rows
  const cols = Math.max(1, Math.round(f.len / bl0)), bl = f.len / cols
  const ruin = s.ruin ?? 0, missing = s.missing ?? 0
  /** Where the broken top runs, along the wall. */
  const topAt = (u: number) => s.height * (1 - ruin * Math.min(1, 0.65 * noise1(s.seed, u, Math.max(0.35, f.len * 0.3)) + 0.45 * noise1(s.seed + 7, u, 0.18)))
  /** The span of brick `c` in row `j` along the wall: every other row is shifted half a brick, with half bricks at the ends. */
  const span = (j: number, c: number): [number, number] => {
    const shift = j & 1 ? bl / 2 : 0
    return [Math.max(0, c * bl - shift), Math.min(f.len, (c + 1) * bl - shift)]
  }
  /** 0 gone (above the broken top), 1 a hole in the face (mortar shows), 2 a brick. */
  const state = (j: number, c: number) => {
    const [a, b] = span(j, c)
    if (j < 0 || j >= rows || b <= a) return 0
    if ((j + 1) * bh > topAt((a + b) / 2) + bh * 0.3) return 0
    return j > 0 && hash(s.seed, j, c, 3) < missing ? 1 : 2
  }
  return { f, rows, cols, bh, bl, topAt, span, state }
}

/** A wall of bricks laid in courses (see WallSpec). `cell` is the grid spacing, so mortar lines are at least a cell wide. */
export function wall(s: WallSpec, cell: number): Shape {
  const plan = wallPlan(s)
  const { f, rows, bh, bl, span, state } = plan
  const jitter = s.jitter ?? 0.4
  const gap = Math.max(bh * 0.1, cell * 0.5)
  const sink = Math.max(gap * 1.2, cell)
  const proud = gap * 1.2 * jitter
  const half = s.thick / 2
  const brickD = (u: number, v: number, w: number, j: number, c: number) => {
    const [a, b] = span(j, c)
    const r = (k: number) => hash(s.seed, j, c, k) * 2 - 1
    const hu = (b - a) / 2 - gap / 2 + r(4) * gap * 0.3 * jitter, hv = bh / 2 - gap / 2 + r(5) * gap * 0.3 * jitter
    return boxD(u - (a + b) / 2, v - (j + 0.5) * bh, w - r(6) * proud * 0.3, hu, hv, half + r(7) * proud, Math.min(gap * 0.6, hv * 0.4))
  }
  const coreD = (u: number, v: number, w: number, j: number, c: number) => {
    const [a, b] = span(j, c)
    return boxD(u - (a + b) / 2, v - (j + 0.5) * bh, w, (b - a) / 2, bh / 2, half - sink)
  }
  // nothing reaches further than a brick from the neighbors looked at
  const beyond = Math.min(bh, bl) - gap
  const wallD = (x: number, y: number, z: number) => {
    const [u, v, w] = f.local(x, y, z)
    const slab = boxD(u - f.len / 2, v - s.height / 2, w, f.len / 2, s.height / 2, half + proud)
    if (slab > bh) return slab
    const j0 = Math.min(rows - 1, Math.max(0, Math.floor(v / bh)))
    let d = Math.max(beyond, slab)
    for (let j = j0 - 1; j <= j0 + 1; j++) {
      if (j < 0 || j >= rows) continue
      const c0 = Math.floor((u + (j & 1 ? bl / 2 : 0)) / bl)
      for (let c = c0 - 1; c <= c0 + 1; c++) {
        const st = state(j, c)
        if (st === 0) continue
        d = Math.min(d, coreD(u, v, w, j, c))
        if (st === 2) d = Math.min(d, brickD(u, v, w, j, c))
      }
    }
    return d
  }
  // the line drawn between bricks: half a brick's gap, but at least half a cell either side
  const line = Math.max(gap / 2, cell * 0.5)
  const wallPiece = (p: Vec3) => {
    const [u, v, w] = f.local(p[0], p[1], p[2])
    const j = Math.min(rows - 1, Math.max(0, Math.floor(v / bh)))
    const c = Math.floor((u + (j & 1 ? bl / 2 : 0)) / bl)
    const st = state(j, c)
    if (st !== 2 || Math.abs(w) < half - sink * 0.5) return -1
    const [a, b] = span(j, c)
    const fv = v - j * bh
    // a line only where another brick meets this one, so the top of a ruined wall and its ends stay brick
    if ((fv < line && state(j - 1, c) !== 0 && j > 0) || (fv > bh - line && state(j + 1, Math.floor((u + ((j + 1) & 1 ? bl / 2 : 0)) / bl)) !== 0)) return -1
    if ((u - a < line && a > 0 && state(j, c - 1) !== 0) || (b - u < line && b < f.len && state(j, c + 1) !== 0)) return -1
    return (j * 211 + c + 7) & 0xffff
  }
  const box = slabBox(f, 0, s.height, half + proud)
  const body: Shape = { sdf: wallD, min: box.min, max: box.max, pieceAt: wallPiece }
  const down = fallenBricks(s, plan)
  if (!down.length) return body
  const rubble = many(down)
  return {
    sdf: (x, y, z) => Math.min(wallD(x, y, z), rubble.sdf(x, y, z)),
    min: [0, 1, 2].map((i) => Math.min(body.min[i], rubble.min[i])) as Vec3,
    max: [0, 1, 2].map((i) => Math.max(body.max[i], rubble.max[i])) as Vec3,
    pieceAt: (p) => (wallD(p[0], p[1], p[2]) <= rubble.sdf(p[0], p[1], p[2]) ? wallPiece(p) : 50000 + (rubble.pieceAt?.(p) ?? 0)),
  }
}

/** The bricks lying at a wall's foot: each fell from where the top is lowest, lies flat on the ground at a random turn. */
export function fallenBricks(s: WallSpec, plan = wallPlan(s)): Shape[] {
  const n = Math.min(60, Math.max(0, Math.round(s.fallen ?? 0)))
  const { f, bh, bl, topAt } = plan
  const out: Shape[] = []
  const deep = Math.min(s.thick, bl * 0.5)
  for (let k = 0, tries = 0; out.length < n && tries < n * 20; tries++, k++) {
    const r = (q: number) => hash(s.seed + 31, k, q)
    const u = r(1) * f.len
    // more fall where more of the wall is gone
    if (r(2) > 0.15 + (1 - topAt(u) / s.height) * 2) continue
    const side = r(3) < 0.5 ? -1 : 1
    const w = side * (s.thick / 2 + bh * 0.6 + r(4) ** 1.5 * (0.15 + s.height * 0.35))
    const yaw = r(5) * Math.PI, tilt = (r(6) - 0.5) * 0.7
    const a: Vec3 = [Math.cos(yaw), 0, Math.sin(yaw)]
    // tipped about its own length, so some lie on an edge against their neighbors
    const up: Vec3 = [-Math.sin(tilt) * a[2], Math.cos(tilt), Math.sin(tilt) * a[0]]
    const side3: Vec3 = [a[1] * up[2] - a[2] * up[1], a[2] * up[0] - a[0] * up[2], a[0] * up[1] - a[1] * up[0]]
    const h: Vec3 = [bl / 2 * 0.95, bh / 2 * 0.95, deep / 2]
    const lift = Math.abs(up[1]) * h[1] + Math.abs(side3[1]) * h[2]
    const at = f.world(u, lift * 0.9, w)
    out.push(orientedBox(at, [a, up, side3], h, Math.min(bh, deep) * 0.18))
  }
  return out
}

// --- Steps

/** A flight of steps for `steps`. */
export interface StepsSpec {
  /** The middle of the bottom step's front edge, on the ground. */
  at: Vec3
  /** The way the flight climbs, along the ground: [x, z]. */
  dir: [number, number]
  /** How many steps. */
  count: number
  /** A step's height. */
  rise: number
  /** A step's depth, front to back. */
  run: number
  /** How wide the flight is. */
  width: number
  /** How worn: rounded noses and a hollow where feet go, 0 to 1. */
  wear?: number
  /** The same seed gives the same result. */
  seed: number
}

/** A flight of steps, each block its own piece, its nose worn round and its tread hollowed in the middle. */
export function steps(s: StepsSpec): Shape {
  const dl = len2(s.dir[0], s.dir[1]) || 1
  const to: Vec3 = [s.at[0] + (s.dir[0] / dl) * s.run * s.count, s.at[1], s.at[2] + (s.dir[1] / dl) * s.run * s.count]
  const f = groundFrame(s.at, to)
  const wear = s.wear ?? 0.5
  const n = Math.max(1, Math.round(s.count))
  const block = (k: number) => {
    const r = (q: number) => hash(s.seed, k, q) * 2 - 1
    return {
      top: (k + 1) * s.rise + r(1) * s.rise * 0.06 * wear,
      half: s.width / 2 + r(2) * s.width * 0.03 * wear,
      side: r(3) * s.width * 0.02 * wear,
      nose: wear * Math.min(s.rise, s.run) * (0.3 + 0.25 * (r(4) + 1)),
      dip: wear * s.rise * 0.22 * (0.6 + 0.2 * (r(5) + 1)),
    }
  }
  const blockD = (u: number, v: number, w: number, k: number) => {
    const b = block(k)
    const a0 = k * s.run, a1 = (k + 1) * s.run
    // feet wear a hollow in the middle of the tread, deepest toward the nose
    const lat = (w - b.side) / (s.width * 0.3)
    const vv = v + b.dip * Math.exp(-lat * lat) * Math.max(0, 1 - (u - a0) / (s.run * 1.4))
    // the profile across the step: a rectangle with its front top corner rounded off
    const r = b.nose
    let d2: number
    if (u < a0 + r && vv > b.top - r) d2 = Math.hypot(u - (a0 + r), vv - (b.top - r)) - r
    else {
      const qx = Math.abs(u - (a0 + a1) / 2) - (a1 - a0) / 2, qy = Math.abs(vv - b.top / 2) - b.top / 2
      d2 = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
    }
    const dw = Math.abs(w - b.side) - b.half
    return Math.hypot(Math.max(d2, 0), Math.max(dw, 0)) + Math.min(Math.max(d2, dw), 0)
  }
  const height = n * s.rise * 1.1
  const sdf = (x: number, y: number, z: number) => {
    const [u, v, w] = f.local(x, y, z)
    const slab = boxD(u - f.len / 2, v - height / 2, w, f.len / 2, height / 2, s.width * 0.56)
    if (slab > s.run) return slab
    const k0 = Math.min(n - 1, Math.max(0, Math.floor(u / s.run)))
    let d = Math.max(slab, s.run * 0.9)
    for (let k = k0 - 1; k <= k0 + 1; k++) if (k >= 0 && k < n) d = Math.min(d, blockD(u, v, w, k))
    return d
  }
  const box = slabBox(f, 0, height, s.width * 0.56)
  return {
    sdf, min: box.min, max: box.max,
    pieceAt: (p) => {
      const [u, v, w] = f.local(p[0], p[1], p[2])
      const k0 = Math.min(n - 1, Math.max(0, Math.floor(u / s.run)))
      let best = Infinity, at = k0
      for (let k = k0 - 1; k <= k0 + 1; k++) if (k >= 0 && k < n) { const d = blockD(u, v, w, k); if (d < best) { best = d; at = k } }
      return at + 1
    },
  }
}

// --- Fences and bays

/** Where the posts of a span stand: each straight run of the path cut into whole, equal bays, so posts land at every corner. */
export function bays(path: Vec3[], bay: number): Vec3[] {
  const out: Vec3[] = [path[0]]
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i]
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / bay))
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, a[2] + ((b[2] - a[2]) * k) / n])
  }
  return out
}

/** A post-and-rail fence for `fence`. */
export interface FenceSpec {
  /** Where it runs, on the ground: 2 to 16 points. */
  path: Vec3[]
  /** About how far apart the posts stand; each run is cut into whole bays. */
  bay: number
  /** A post's height. */
  height: number
  /** Half a post's thickness. */
  post: number
  /** Rails between posts, 1 to 4. */
  rails: number
  /** How many posts lean and how far, 0 to 1. */
  lean?: number
  /** The share of rails gone or hanging from one end, 0 to 1. */
  missing?: number
  /** How far rails sag in the middle, 0 to 1. */
  sag?: number
  /** The same seed gives the same result. */
  seed: number
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
const crossV = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** A plank or beam from `a` to `b`, `h` its half height and `t` its half thickness. */
function beam(a: Vec3, b: Vec3, h: number, t: number): Shape {
  const along = norm(sub(b, a))
  const side = Math.abs(along[1]) > 0.95 ? norm(crossV(along, [1, 0, 0])) : norm(crossV(along, [0, 1, 0]))
  const up = crossV(side, along)
  const l = Math.hypot(...sub(b, a)) / 2
  return orientedBox(lerp3(a, b, 0.5), [along, up, side], [l + t * 0.5, h, t])
}

/** The posts (feet and tops) of a fence, with their leans. */
export function fencePosts(s: FenceSpec): { foot: Vec3; top: Vec3 }[] {
  const lean = s.lean ?? 0
  return bays(s.path, s.bay).map((foot, i) => {
    const r = (q: number) => hash(s.seed, i, q)
    const tips = r(1) < lean ? lean * 0.35 * (0.4 + 0.6 * r(2)) * s.height : 0
    const a = r(3) * Math.PI * 2
    return { foot, top: [foot[0] + Math.cos(a) * tips, foot[1] + s.height, foot[2] + Math.sin(a) * tips] as Vec3 }
  })
}

/** A fence of posts and rails along a path: some posts lean, some rails are gone, hang from one end or sag. */
export function fence(s: FenceSpec, cell = 0): Shape {
  const posts = fencePosts(s)
  const missing = s.missing ?? 0, sag = s.sag ?? 0
  const rails = Math.min(4, Math.max(1, Math.round(s.rails)))
  const parts: Shape[] = []
  for (const p of posts) parts.push(beam([p.foot[0], p.foot[1] - s.post, p.foot[2]], p.top, s.post, s.post * 0.85))
  for (let i = 0; i + 1 < posts.length; i++) {
    const a = posts[i], b = posts[i + 1]
    for (let k = 0; k < rails; k++) {
      const r = (q: number) => hash(s.seed + 5, i * 8 + k, q)
      const t = rails === 1 ? 0.7 : 0.3 + (0.6 * k) / (rails - 1)
      const pa = lerp3(a.foot, a.top, t), pb = lerp3(b.foot, b.top, t)
      const fate = r(1)
      // never thinner than the grid, or a rail could miss every cell
      const h = Math.max(s.post * 0.75, cell * 0.6), th = Math.max(s.post * 0.45, cell * 0.55)
      if (fate < missing * 0.55) continue
      if (fate < missing) {
        // hanging from one post, its other end on the ground
        const [hi, lo] = r(2) < 0.5 ? [pa, pb] : [pb, pa]
        parts.push(beam(hi, lerp3([lo[0], a.foot[1] + h, lo[2]], hi, 0.12), h, th))
        continue
      }
      const dip = sag * r(3) * Math.hypot(...sub(pb, pa)) * 0.12
      if (dip < h * 0.5) parts.push(beam(pa, pb, h, th))
      else { const mid = lerp3(pa, pb, 0.5); mid[1] -= dip; parts.push(beam(pa, mid, h, th), beam(mid, pb, h, th)) }
    }
  }
  return many(parts)
}

/** A wall of arches for `arcade`. */
export interface ArcadeSpec {
  /** The foot of the wall at one end. */
  from: Vec3
  /** The foot of the wall at the other end. */
  to: Vec3
  /** How high it stands. */
  height: number
  /** How thick it is. */
  thick: number
  /** Equal bays the span is cut into: one opening each, with a pillar between. */
  bays: number
  /** A pillar's width. */
  pillar: number
  /** The height the arches spring from; left out, 60% of the wall. */
  spring?: number
  /** 'round', 'pointed' or 'flat' heads to the openings. */
  arch?: 'round' | 'pointed' | 'flat'
  /** Height of a course of stone; left out, about an eighth of the wall. */
  course?: number
  /** How much of the top has fallen, in a ragged line, 0 to 1 (never below the arches' springing). */
  ruin?: number
  /** The same seed gives the same result. */
  seed?: number
}

/** The heads an arcade's openings can have. */
export const ARCHES = ['round', 'pointed', 'flat'] as const

/** A wall cut into equal bays with an opening in each: arcades, cloisters, viaducts. Stones laid in courses, and wedge stones round each arch. */
function arcadeRaw(s: ArcadeSpec, cell: number): Shape {
  const f = groundFrame(s.from, s.to)
  const n = Math.max(1, Math.round(s.bays)), bw = f.len / n
  const ow = Math.max(cell, (bw - s.pillar) / 2)
  const spring = Math.min(s.spring ?? s.height * 0.6, s.height - ow * 1.1)
  const arch = s.arch ?? 'round'
  const R = ow * 1.6
  const ruin = s.ruin ?? 0, seed = s.seed ?? 0
  // a broken top, stepped by courses as stone falls, but never below the arches' feet
  const topAt = (u: number) => {
    const c = s.course ?? s.height / 8
    const h = s.height - ruin * (s.height - spring) * Math.min(1, 0.7 * noise1(seed, u, Math.max(0.3, f.len * 0.25)) + 0.4 * noise1(seed + 3, u, c * 2.5))
    return Math.max(spring, Math.round(h / c) * c + (noise1(seed + 9, u, c * 1.5) - 0.5) * c * 0.6)
  }
  /** The opening's 2D distance in (u, v) for bay i: a door with a round, pointed or flat head. */
  const hole = (u: number, v: number) => {
    const i = Math.min(n - 1, Math.max(0, Math.floor(u / bw))), du = u - (i + 0.5) * bw
    const rect = Math.max(Math.abs(du) - ow, v - spring, -v - 1)
    if (arch === 'flat') return rect
    if (arch === 'round') return Math.min(rect, Math.max(Math.hypot(du, v - spring) - ow, spring - v))
    // two arcs meeting at a point
    const pointed = Math.max(Math.hypot(Math.abs(du) + (R - ow), v - spring) - R, spring - v)
    return Math.min(rect, pointed)
  }
  const sdf = (x: number, y: number, z: number) => {
    const [u, v, w] = f.local(x, y, z)
    const slab = boxD(u - f.len / 2, v - s.height / 2, w, f.len / 2, s.height / 2, s.thick / 2)
    return Math.max(slab, -hole(u, v), ruin ? v - topAt(u) : -Infinity)
  }
  const course = s.course ?? s.height / 8
  const line = cell * 0.5
  const ring = Math.max(course * 1.2, ow * 0.45)
  const box = slabBox(f, 0, s.height, s.thick / 2)
  return {
    sdf, min: box.min, max: box.max,
    pieceAt: (p) => {
      const [u, v] = f.local(p[0], p[1], p[2])
      const i = Math.min(n - 1, Math.max(0, Math.floor(u / bw))), du = u - (i + 0.5) * bw
      // wedge stones round the head of each opening
      if (arch !== 'flat' && v > spring) {
        const cu = arch === 'round' ? 0 : du < 0 ? R - ow : -(R - ow)
        const rr = arch === 'round' ? ow : R
        const dist = Math.hypot(du - cu, v - spring)
        if (dist < rr + ring && dist > rr - cell) {
          const ang = Math.atan2(v - spring, du - cu), wedges = Math.max(5, Math.round((Math.PI * rr) / (course * 1.1)))
          const k = (ang / Math.PI) * wedges, fk = k - Math.floor(k)
          if (fk < line / course || rr + ring - dist < line) return -1
          return 1000 + i * 64 + Math.floor(k)
        }
      }
      const row = Math.floor(v / course), fv = v - row * course
      const bl = course * 2.2, along = u / bl + (row & 1) * 0.5, col = Math.floor(along)
      if ((fv < line && row > 0) || (along - col) * bl < line) return -1
      return row * 97 + col + 1
    },
  }
}

/**
 * A wall cut into equal bays with an opening in each: arcades, cloisters, viaducts. Its stones are laid in courses,
 * with wedge stones round each arch. `cell` is the grid's cell size.
 */
export const arcade = (s: ArcadeSpec, cell: number): Shape => tighten(arcadeRaw(s, cell), 0.7)
