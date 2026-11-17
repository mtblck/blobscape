import type { Vec3 } from '../splat-core/blobs.ts'
import { hash } from './built.ts'
import { cone, many, type Shape } from './voxel.ts'

/**
 * Weather that lands (issue #174): what falls finds the ground actually under it, snow lies in drifts shaped by the
 * wind and what stands in its way, and frost grows across a pane a branch at a time. Pure and tested.
 *
 * The idea comes from Silicon Jungle's Ink Studio weather kit; this is our own code.
 */

// --- The ground under a point

/**
 * The height of the first surface met going straight down from `top` at (x, z), or `bottom` if nothing is met. The
 * shapes' distances are lower bounds, so each step down is as long as the distance says and never steps through.
 */
export function groundUnder(shapes: Shape[], x: number, z: number, top: number, bottom: number): number {
  const near = shapes.filter((s) => x >= s.min[0] && x <= s.max[0] && z >= s.min[2] && z <= s.max[2] && s.min[1] <= top)
  if (!near.length) return bottom
  const at = (y: number) => { let d = Infinity; for (const s of near) d = Math.min(d, s.sdf(x, y, z)); return d }
  const eps = 0.002
  let y = Math.min(top, Math.max(...near.map((s) => s.max[1])) + eps)
  for (let k = 0; k < 400 && y > bottom; k++) {
    const d = at(y)
    if (d < eps) return y
    y -= Math.max(d, eps)
  }
  return bottom
}

// --- Falling and landing

export type Falling = 'rain' | 'snow' | 'leaves'

/** How long the fall takes, as a share of each life, then how long it lies before it is gone. */
const FALL: Record<Falling, { fall: number; lie: number }> = { rain: { fall: 0.82, lie: 0.06 }, snow: { fall: 0.86, lie: 0.04 }, leaves: { fall: 0.6, lie: 0.3 } }

/**
 * Where a falling thing is in its life (0 to 1, starting again each time it falls): `drop`, the share of its fall
 * done (0 at the top, 1 landed); `lying`, whether it has landed; `size`, from nothing as it appears to nothing as it
 * goes (snow melts, a leaf fades, rain splashes away quickly). Size is 0 at both ends, so a loop joins up.
 */
export function fallAt(kind: Falling, life: number): { drop: number; lying: boolean; size: number } {
  const { fall, lie } = FALL[kind]
  const l = ((life % 1) + 1) % 1
  const appear = Math.min(1, l / 0.05)
  if (l < fall) return { drop: l / fall, lying: false, size: appear }
  const after = l - fall
  if (after < lie) return { drop: 1, lying: true, size: kind === 'rain' ? 1 - (after / lie) * 0.4 : 1 }
  const gone = Math.min(1, (after - lie) / Math.max(1e-6, 1 - fall - lie))
  return { drop: 1, lying: true, size: (kind === 'rain' ? 0.6 : 1) * (1 - gone) }
}

/** The share of a life spent falling: what a speck's sway is frozen at once it lands. */
export const fallShare = (kind: Falling) => FALL[kind].fall

// --- Snow drifts

export interface DriftSpec {
  /** The middle of the snow field, at about ground height. */
  at: Vec3
  /** Half its size along x and z. */
  half: [number, number]
  /** How deep snow lies on open, level ground. */
  depth: number
  /** Which way the wind blows, [x, z]; the drift piles downwind of what stands in its way. */
  wind: [number, number]
  /** The most it piles up against something (3 × depth). */
  pile?: number
  /** How far downwind a wall still shelters, in multiples of its height (4). */
  reach?: number
  /** A path trodden through it, where it lies thin. */
  path?: Vec3[]
  pathWidth?: number
  seed: number
}

export interface Drift {
  nx: number
  nz: number
  cell: number
  x0: number
  z0: number
  /** The ground under the snow. */
  ground: Float32Array
  /** How deep the snow is on it. */
  depth: Float32Array
}

export const DRIFT_GRID = 96
/** Half how wide something must be to shelter snow behind it. */
const WIDE = 0.06

/**
 * How deep snow lies over the ground `under` gives, in a grid: deep where something upwind shelters it (a wall, a
 * rock, a bank), thin where the wind scours (anything higher than the ground upwind, and steep slopes), thinner on a
 * path, then smoothed so it lies in soft drifts.
 */
export function driftField(s: DriftSpec, under: (x: number, z: number) => number): Drift {
  const cell = Math.max((Math.max(s.half[0], s.half[1]) * 2) / DRIFT_GRID, 0.01)
  const nx = Math.min(DRIFT_GRID + 1, Math.ceil((s.half[0] * 2) / cell) + 1), nz = Math.min(DRIFT_GRID + 1, Math.ceil((s.half[1] * 2) / cell) + 1)
  const x0 = s.at[0] - s.half[0], z0 = s.at[2] - s.half[1]
  const ground = new Float32Array(nx * nz)
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) ground[j * nx + i] = under(x0 + i * cell, z0 + j * cell)
  const g = (x: number, z: number) => {
    const i = Math.min(nx - 1, Math.max(0, Math.round((x - x0) / cell))), j = Math.min(nz - 1, Math.max(0, Math.round((z - z0) / cell)))
    return ground[j * nx + i]
  }
  const wl = Math.hypot(s.wind[0], s.wind[1]) || 1, wx = s.wind[0] / wl, wz = s.wind[1] / wl
  const pile = s.pile ?? s.depth * 3, reach = s.reach ?? 4
  const look = Math.max(s.half[0], s.half[1])
  let depth = new Float32Array(nx * nz)
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * cell, z = z0 + j * cell, h = ground[j * nx + i]
    // shelter: something upwind stands higher than a line falling from it at 1 in `reach`
    let lee = 0, upwind = 0, n = 0
    for (let d = cell; d <= look; d += cell) {
      // only something wide shelters: a thin post lets the wind round it
      const ux = x - wx * d, uz = z - wz * d
      const up = Math.min(g(ux, uz), g(ux - wz * WIDE, uz + wx * WIDE), g(ux + wz * WIDE, uz - wx * WIDE)) - h
      lee = Math.max(lee, up - d / reach)
      if (d <= cell * 4) { upwind += up; n++ }
    }
    // scour: standing above the ground just upwind, the wind takes it
    const exposed = Math.max(0, -upwind / Math.max(1, n))
    const slope = Math.hypot(g(x + cell, z) - g(x - cell, z), g(x, z + cell) - g(x, z - cell)) / (2 * cell)
    // snow can't lie on a steep face, piled or not
    const holds = Math.max(0, 1 - slope / 1.6)
    let dp = s.depth * (1 + 0.25 * (hash(s.seed, i >> 2, j >> 2) - 0.5)) * Math.max(0, 1 - exposed / Math.max(s.depth, 1e-6) * 0.5)
    dp = (dp + Math.min(pile, lee * 0.9)) * holds
    if (s.path && s.path.length > 1) {
      const w = (s.pathWidth ?? 0.2) / 2, pd = toPath(s.path, x, z)
      if (pd < w * 1.6) dp *= 0.15 + 0.85 * smooth(Math.max(0, (pd - w * 0.6) / w))
    }
    depth[j * nx + i] = dp
  }
  // drifts are soft: a few passes of a small blur
  for (let pass = 0; pass < 3; pass++) {
    const next = new Float32Array(depth.length)
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      let sum = 0, w = 0
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const ii = i + a, jj = j + b
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue
        const k = (a === 0 ? 2 : 1) * (b === 0 ? 2 : 1)
        sum += depth[jj * nx + ii] * k; w += k
      }
      next[j * nx + i] = sum / w
    }
    depth = next
  }
  return { nx, nz, cell, x0, z0, ground, depth }
}

const smooth = (t: number) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u) }

function toPath(path: Vec3[], x: number, z: number) {
  let best = Infinity
  for (let i = 1; i < path.length; i++) {
    const ax = path[i - 1][0], az = path[i - 1][2], bx = path[i][0] - ax, bz = path[i][2] - az
    const t = Math.min(1, Math.max(0, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz || 1)))
    best = Math.min(best, Math.hypot(x - ax - bx * t, z - az - bz * t))
  }
  return best
}

/** Bilinear in a drift's grid. */
function sample(D: Drift, f: Float32Array, x: number, z: number) {
  const fx = Math.min(D.nx - 1.0001, Math.max(0, (x - D.x0) / D.cell)), fz = Math.min(D.nz - 1.0001, Math.max(0, (z - D.z0) / D.cell))
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * D.nx + i
  return f[k] * (1 - u) * (1 - v) + f[k + 1] * u * (1 - v) + f[k + D.nx] * (1 - u) * v + f[k + D.nx + 1] * u * v
}

/** Snow lying as a layer of its own over whatever `under` finds: its top the ground plus the drift, gone where it is thinner than `thin`. */
export function drift(s: DriftSpec, under: (x: number, z: number) => number, thin = 0): Shape {
  const D = driftField(s, under)
  const top = new Float32Array(D.ground.length)
  for (let k = 0; k < top.length; k++) top[k] = D.depth[k] >= thin * 0.5 ? D.ground[k] + Math.max(D.depth[k], thin) : D.ground[k] - thin * 2
  let hi = -Infinity, lo = Infinity
  for (let k = 0; k < top.length; k++) { hi = Math.max(hi, top[k]); lo = Math.min(lo, D.ground[k]) }
  const e = D.cell * 0.5
  const sdf = (x: number, y: number, z: number) => {
    const out = Math.max(Math.abs(x - s.at[0]) - s.half[0], Math.abs(z - s.at[2]) - s.half[1])
    const t = sample(D, top, x, z)
    const gx = (sample(D, top, x + e, z) - sample(D, top, x - e, z)) / (2 * e), gz = (sample(D, top, x, z + e) - sample(D, top, x, z - e)) / (2 * e)
    // a layer: from a little under the ground to the snow's top
    const floor = sample(D, D.ground, x, z) - Math.max(thin, 0.01) * 1.5
    return Math.max(out, (y - t) / Math.hypot(1, gx, gz, 1), (floor - y) / 2)
  }
  return { sdf, min: [s.at[0] - s.half[0], lo - 0.03, s.at[2] - s.half[1]], max: [s.at[0] + s.half[0], hi, s.at[2] + s.half[1]] }
}

// --- Frost ferns

export interface FrostSpec {
  /** Where it starts, on the surface. */
  at: Vec3
  /** The way the surface faces. */
  facing: Vec3
  /** How far it spreads. */
  r: number
  /** Main branches out from the start (5). */
  arms?: number
  /** Which share of its growth to show, [from, to] in 0..1 (all of it): split one fern over parts that sprout in turn and it grows a branch at a time. */
  stage?: [number, number]
  seed: number
}

export interface FrostBranch { from: Vec3; to: Vec3; r: number; gen: number; t: number }

/**
 * A frost fern as straight strokes in the surface's plane: main branches curve out from the start, each throwing
 * side branches at about 60 degrees, every other step on alternate sides, which do the same, smaller, up to three
 * generations. `t` is when a stroke grows, 0 at the start to 1 at the last tip, by how far along it is.
 */
export function frostPlan(s: FrostSpec): FrostBranch[] {
  const n = norm(s.facing)
  const u = norm(Math.abs(n[1]) < 0.9 ? cross(n, [0, 1, 0]) : cross(n, [1, 0, 0])), v = cross(n, u)
  const step = s.r / 12
  const out: FrostBranch[] = []
  const grow = (p: [number, number], ang: number, length: number, gen: number, dist: number, key: number) => {
    const steps = Math.max(1, Math.round(length / step))
    let x = p[0], y = p[1], a = ang
    const bend = (hash(s.seed, key, 1) - 0.5) * 0.12
    for (let k = 0; k < steps && out.length < 900; k++) {
      a += bend + (hash(s.seed, key, k + 3) - 0.5) * 0.18
      const nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step
      if (Math.hypot(nx, ny) > s.r) break
      const at = dist + (k + 1) * step
      const w = s.r * 0.022 * (1 - 0.22 * gen) * (1 - 0.5 * (k / steps))
      out.push({ from: place(x, y), to: place(nx, ny), r: w, gen, t: at })
      if (gen < 3 && k % 2 === 1 && k < steps - 1) {
        const side = (k >> 1) % 2 === 0 ? 1 : -1
        const left = length * (1 - k / steps)
        grow([nx, ny], a + side * (1.0 + 0.15 * (hash(s.seed, key, k, 9) - 0.5)), left * 0.45, gen + 1, at, key * 31 + k)
      }
      x = nx; y = ny
    }
  }
  const place = (x: number, y: number): Vec3 => [s.at[0] + u[0] * x + v[0] * y, s.at[1] + u[1] * x + v[1] * y, s.at[2] + u[2] * x + v[2] * y]
  const arms = Math.min(8, Math.max(1, Math.round(s.arms ?? 5)))
  for (let k = 0; k < arms; k++) grow([0, 0], (k / arms) * Math.PI * 2 + hash(s.seed, k, 7) * 0.8, s.r * (0.75 + 0.25 * hash(s.seed, k, 8)), 0, 0, k + 1)
  const last = Math.max(...out.map((b) => b.t), 1e-6)
  for (const b of out) b.t /= last
  return out
}

/** A frost fern lying on a surface (see frostPlan), each stroke standing a little proud of it; pieces are the generations, 0 the main branches. */
export function frost(s: FrostSpec, thin = 0): Shape {
  const [a, b] = s.stage ?? [0, 1]
  const strokes = frostPlan(s).filter((k) => k.t > a && k.t <= b)
  if (!strokes.length) return { sdf: () => 1, min: s.at, max: s.at }
  // one bucketed group per generation, so a point asks only its neighbors and its piece is the nearest group's
  const groups = [0, 1, 2, 3].map((g) => strokes.filter((k) => k.gen === g)).filter((g) => g.length).map((g) => ({ gen: g[0].gen, shape: many(g.map((k) => cone(k.from, k.to, Math.max(k.r, thin * 0.6), Math.max(k.r * 0.9, thin * 0.55)))) }))
  const min: Vec3 = [0, 1, 2].map((i) => Math.min(...groups.map((g) => g.shape.min[i]))) as Vec3
  const max: Vec3 = [0, 1, 2].map((i) => Math.max(...groups.map((g) => g.shape.max[i]))) as Vec3
  return {
    sdf: (x, y, z) => { let d = Infinity; for (const g of groups) d = Math.min(d, g.shape.sdf(x, y, z)); return d },
    min, max,
    pieceAt: (p) => { let best = 0, bd = Infinity; for (const g of groups) { const d = g.shape.sdf(...p); if (d < bd) { bd = d; best = g.gen } } return best },
  }
}

const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
