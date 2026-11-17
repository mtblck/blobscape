import type { Vec3 } from '../splat-core/blobs.ts'
import { hash } from './built.ts'
import { many, type Shape, tighten } from './voxel.ts'

/**
 * Formations (issue #177): shapes that come from a rule rather than placing each one by hand. A faceted crystal and
 * clusters of them from one root, a geode broken open, basalt columns on a hex grid, stalactites and stalagmites that
 * join into columns, flowstone down a wall, and icicles under every downward edge of another shape. Pure distance
 * functions, each with a `pieceAt` for the `pieces` paint.
 *
 * The idea comes from Silicon Jungle's Ink Studio formations kit; this is our own code.
 */

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
/** Two directions square to `d` and to each other. */
function across(d: Vec3): [Vec3, Vec3] {
  const a = norm(Math.abs(d[1]) < 0.9 ? cross(d, [0, 1, 0]) : cross(d, [1, 0, 0]))
  return [a, cross(d, a)]
}
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

/** The distance from (x, y) to a regular polygon of `n` sides whose middles of edges are `apothem` from its middle. */
function polygon(x: number, y: number, n: number, apothem: number) {
  const sector = (Math.PI * 2) / n
  const t = Math.atan2(y, x)
  const phi = t - sector * Math.round(t / sector)
  return Math.hypot(x, y) * Math.cos(phi) - apothem
}

// --- Crystals

export interface CrystalSpec {
  /** Its foot, where it grows out of the rock. */
  at: Vec3
  /** The way it points. */
  dir: Vec3
  length: number
  /** Its radius, corner to middle. */
  r: number
  /** Sides, 3 to 8 (6 when left out). */
  sides?: number
  /** How much of its length the point takes, 0.1 to 0.8 (0.3). */
  tip?: number
  /** How many chips are knocked off its faces, 0 to 6. */
  chips?: number
  seed: number
}

/** A sided crystal with a pointed end, chipped here and there. */
export function crystal(s: CrystalSpec): Shape {
  const d = norm(s.dir), [a, b] = across(d)
  const n = Math.min(8, Math.max(3, Math.round(s.sides ?? 6)))
  const tip = s.length * Math.min(0.8, Math.max(0.1, s.tip ?? 0.3))
  const body = s.length - tip
  const apothem = s.r * Math.cos(Math.PI / n)
  const twist = hash(s.seed, 1) * Math.PI
  const slope = 1 / Math.hypot(1, apothem / tip)
  // planes that knock chips off the faces: a direction across the crystal, a height and a depth
  const chips = Array.from({ length: Math.min(6, Math.max(0, Math.round(s.chips ?? 0))) }, (_, k) => {
    const ang = hash(s.seed, k, 2) * Math.PI * 2, h = (0.2 + 0.75 * hash(s.seed, k, 3)) * s.length
    const tilt = (hash(s.seed, k, 4) - 0.3) * 0.9
    const nrm = norm([Math.cos(ang) * Math.cos(tilt), Math.sin(tilt), Math.sin(ang) * Math.cos(tilt)])
    const off = apothem * (0.55 + 0.3 * hash(s.seed, k, 5))
    return { nrm, h, off }
  })
  const sdf = (x: number, y: number, z: number) => {
    const q = sub([x, y, z], s.at)
    const h = dot(q, d), u = dot(q, a), v = dot(q, b)
    const c = Math.cos(twist), si = Math.sin(twist)
    const side = polygon(u * c - v * si, u * si + v * c, n, apothem)
    // the point: the faces lean in to nothing at the end
    const taper = h > body ? (side + (apothem * (h - body)) / tip) * slope : side
    let dist = Math.max(taper, -h, h - s.length)
    for (const ch of chips) {
      // a chip is a cut by a plane in the crystal's own frame, near its height
      const local: Vec3 = [u, h - ch.h, v]
      if (Math.abs(h - ch.h) < s.r * 1.5) dist = Math.max(dist, dot(local, ch.nrm) - ch.off)
    }
    return dist
  }
  const end: Vec3 = [s.at[0] + d[0] * s.length, s.at[1] + d[1] * s.length, s.at[2] + d[2] * s.length]
  return {
    sdf,
    min: [Math.min(s.at[0], end[0]) - s.r, Math.min(s.at[1], end[1]) - s.r, Math.min(s.at[2], end[2]) - s.r],
    max: [Math.max(s.at[0], end[0]) + s.r, Math.max(s.at[1], end[1]) + s.r, Math.max(s.at[2], end[2]) + s.r],
  }
}

export interface ClusterSpec {
  /** Where they grow from. */
  at: Vec3
  count: number
  /** The longest, in the middle. */
  size: number
  r: number
  /** How far the outer ones lean, in degrees (50 when left out). */
  spread?: number
  sides?: number
  chips?: number
  seed: number
}

/** The crystals of a cluster: the middle one longest and upright, the rest leaning out and shorter the further they lean. */
export function clusterCrystals(s: ClusterSpec): CrystalSpec[] {
  const n = Math.min(40, Math.max(1, Math.round(s.count)))
  const spread = ((s.spread ?? 50) * Math.PI) / 180
  return Array.from({ length: n }, (_, i) => {
    const r = (k: number) => hash(s.seed, i, k)
    const lean = n === 1 ? 0 : spread * Math.sqrt(i / (n - 1)) * (0.8 + 0.4 * r(1))
    const az = i * GOLDEN + r(2) * 0.6
    const dir: Vec3 = [Math.sin(lean) * Math.cos(az), Math.cos(lean), Math.sin(lean) * Math.sin(az)]
    const length = s.size * (1 - 0.6 * (lean / Math.max(spread, 1e-6))) * (0.75 + 0.25 * r(3))
    const rad = s.r * (0.55 + 0.45 * r(4)) * (i === 0 ? 1.15 : 1)
    // sunk a little into the root so they grow out of one place
    const at: Vec3 = [s.at[0] + dir[0] * -rad, s.at[1] + dir[1] * -rad, s.at[2] + dir[2] * -rad]
    return { at, dir, length: length + rad, r: rad, sides: s.sides, chips: s.chips, seed: s.seed * 31 + i }
  })
}

/** A cluster of crystals from one root (see clusterCrystals); each crystal is a piece. */
export function cluster(s: ClusterSpec): Shape {
  return many(clusterCrystals(s).map(crystal))
}

// --- Geodes

export interface GeodeSpec {
  at: Vec3
  r: number
  /** The way the broken face looks: its outward direction. */
  open: Vec3
  /** The rind's share of the radius (0.15). */
  rind?: number
  /** Banded layers inside the rind (3). */
  bands?: number
  /** How long the crystals lining the hollow are, as a share of the radius (0.22). */
  lining?: number
  seed: number
}

/** A geode broken open: a rough rind, banded layers, and a hollow lined with small crystals pointing in. */
function geodeRaw(s: GeodeSpec): Shape {
  const o = norm(s.open)
  const rind = s.r * (s.rind ?? 0.15), bands = Math.max(1, Math.round(s.bands ?? 3))
  const rIn = s.r * (1 - (s.rind ?? 0.15) - 0.3)
  const lining = s.r * (s.lining ?? 0.22)
  // where the break runs: a little in front of the middle, so more than half the geode is kept
  const cutAt = s.r * 0.12
  const lumps = (p: Vec3) => (Math.sin(p[0] * 13 + s.seed) + Math.sin(p[1] * 11 - s.seed) + Math.sin(p[2] * 15 + 2 * s.seed)) / 3
  const shell = (x: number, y: number, z: number) => {
    const q = sub([x, y, z], s.at), rho = Math.hypot(q[0], q[1], q[2])
    const outer = rho - s.r * (1 + 0.06 * lumps(q))
    const hollow = rIn * (1 + 0.08 * lumps([q[2], q[0], q[1]])) - rho
    return Math.max(outer, hollow, dot(q, o) - cutAt)
  }
  // crystals all over the inside of the hollow, pointing to its middle
  const count = Math.min(140, Math.max(12, Math.round((4 * Math.PI * rIn * rIn) / (lining * lining * 0.5))))
  const xtals: Shape[] = []
  for (let k = 0; k < count; k++) {
    const y = 1 - (2 * (k + 0.5)) / count, rr = Math.sqrt(1 - y * y), t = k * GOLDEN
    const on: Vec3 = [Math.cos(t) * rr, y, Math.sin(t) * rr]
    if (dot(on, o) * rIn > cutAt - lining * 0.3) continue
    const len = lining * (0.6 + 0.6 * hash(s.seed, k, 7))
    const base: Vec3 = [s.at[0] + on[0] * (rIn + lining * 0.2), s.at[1] + on[1] * (rIn + lining * 0.2), s.at[2] + on[2] * (rIn + lining * 0.2)]
    xtals.push(crystal({ at: base, dir: [-on[0], -on[1], -on[2]], length: len + lining * 0.2, r: len * 0.32, sides: 6, tip: 0.45, seed: s.seed + k }))
  }
  const lined = xtals.length ? many(xtals) : undefined
  const bandW = (s.r - rind - rIn) / bands
  return {
    sdf: (x, y, z) => Math.min(shell(x, y, z), lined ? lined.sdf(x, y, z) : Infinity),
    min: [s.at[0] - s.r * 1.07, s.at[1] - s.r * 1.07, s.at[2] - s.r * 1.07], max: [s.at[0] + s.r * 1.07, s.at[1] + s.r * 1.07, s.at[2] + s.r * 1.07],
    // the rind is piece 0, bands 1 and 2 by turns, the lining crystals a joint (-1)
    pieceAt: (p) => {
      if (lined && lined.sdf(p[0], p[1], p[2]) <= shell(p[0], p[1], p[2])) return -1
      const rho = Math.hypot(...sub(p, s.at))
      if (rho > s.r - rind) return 0
      return 1 + (Math.floor((s.r - rind - rho) / bandW) & 1)
    },
  }
}

// --- Columns

export interface ColumnsSpec {
  /** The middle of the field, on the ground. */
  at: Vec3
  /** How far the field reaches. */
  r: number
  /** A column's width across its flats. */
  cell: number
  /** The tallest column. */
  height: number
  /** How heights run: 'dome' (tallest in the middle, as organ pipes), 'steps' (a causeway stepping down to its edge) or 'random'. */
  rise?: 'dome' | 'steps' | 'random'
  seed: number
}

export const RISES = ['dome', 'steps', 'random'] as const

const SQ3 = Math.sqrt(3)

/** Basalt columns on a hex grid: one shape with a height per column, each column a piece. */
export function columns(s: ColumnsSpec): Shape {
  const c = s.cell, rise = s.rise ?? 'steps'
  const gap = c * 0.04
  /** The middle of column (i, j) on the grid, in x and z. */
  const center = (i: number, j: number): [number, number] => [s.at[0] + c * (i + j / 2), s.at[2] + (c * SQ3 * j) / 2]
  const height = (i: number, j: number) => {
    const [x, z] = center(i, j)
    const e = Math.hypot(x - s.at[0], z - s.at[2]) / s.r
    // a ragged edge: a column stands if it is inside the field, give or take
    if (e > 0.85 + 0.25 * hash(s.seed, i, j, 1)) return 0
    const rr = hash(s.seed, i, j, 2)
    if (rise === 'dome') return s.height * (1 - 0.75 * e * e) * (0.85 + 0.15 * rr)
    if (rise === 'random') return s.height * (0.35 + 0.65 * rr)
    // steps: heights fall off toward the edge in whole steps of a column's width, a step up or down here and there
    const steps = Math.max(1, Math.round(((1 - e) * s.height) / (c * 0.6)))
    return Math.max(c * 0.4, Math.min(s.height, (steps + (rr < 0.2 ? -1 : rr > 0.85 ? 1 : 0)) * c * 0.6))
  }
  const colD = (x: number, y: number, z: number, i: number, j: number) => {
    const h = height(i, j)
    if (h <= 0) return Infinity
    const [cx, cz] = center(i, j)
    // a pointy-topped hexagon in x and z: flats across x
    const d2 = polygon(z - cz, x - cx, 6, c / 2 - gap)
    // the top tilts a little each column
    const top = s.at[1] + h + (hash(s.seed, i, j, 3) - 0.5) * c * 0.25 * ((x - cx) / c) + (hash(s.seed, i, j, 4) - 0.5) * c * 0.25 * ((z - cz) / c)
    const dv = Math.max(y - top, s.at[1] - c * 0.3 - y)
    return Math.hypot(Math.max(d2, 0), Math.max(dv, 0)) + Math.min(Math.max(d2, dv), 0)
  }
  /** The grid cell a point is in (rounded to the nearest hex center). */
  const cellOf = (x: number, z: number): [number, number] => {
    const j = ((z - s.at[2]) * 2) / (c * SQ3), i = (x - s.at[0]) / c - j / 2
    // cube rounding
    let ri = Math.round(i), rj = Math.round(j)
    const rk = Math.round(-i - j)
    const di = Math.abs(ri - i), dj = Math.abs(rj - j), dk = Math.abs(rk + i + j)
    if (di > dj && di > dk) ri = -rj - rk
    else if (dj > dk) rj = -ri - rk
    return [ri, rj]
  }
  const NEAR = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]
  const reach = s.r * 1.1 + c
  const sdf = (x: number, y: number, z: number) => {
    const out = Math.max(Math.hypot(x - s.at[0], z - s.at[2]) - reach, y - (s.at[1] + s.height + c * 0.2), s.at[1] - c * 0.3 - y)
    if (out > c) return out
    const [i0, j0] = cellOf(x, z)
    let d = Math.max(out, c * 0.45)
    for (const [di, dj] of NEAR) d = Math.min(d, colD(x, y, z, i0 + di, j0 + dj))
    return d
  }
  return {
    sdf,
    min: [s.at[0] - reach, s.at[1] - c * 0.3, s.at[2] - reach], max: [s.at[0] + reach, s.at[1] + s.height + c * 0.2, s.at[2] + reach],
    pieceAt: (p) => {
      const [i0, j0] = cellOf(p[0], p[2])
      let best = Infinity, at = [i0, j0]
      for (const [di, dj] of NEAR) { const d = colD(p[0], p[1], p[2], i0 + di, j0 + dj); if (d < best) { best = d; at = [i0 + di, j0 + dj] } }
      return ((at[0] + 64) * 131 + at[1] + 64) & 0xffff
    },
  }
}

// --- Stalactites and stalagmites

export interface DripsSpec {
  /** The middle of the floor under them. */
  at: Vec3
  /** How far across they spread. */
  r: number
  /** The height of the roof they hang from. */
  roof: number
  count: number
  /** The longest stalactite. */
  length: number
  seed: number
}

/** Where each drip falls, and how long its stalactite above and stalagmite below have grown; `joined` when they met. */
export function dripPlan(s: DripsSpec) {
  const gap = s.roof - s.at[1]
  return Array.from({ length: Math.min(60, Math.max(1, Math.round(s.count))) }, (_, k) => {
    const r = (q: number) => hash(s.seed, k, q)
    const rad = s.r * Math.sqrt(r(1)), ang = r(2) * Math.PI * 2
    const x = s.at[0] + Math.cos(ang) * rad, z = s.at[2] + Math.sin(ang) * rad
    // most are short; a few are long
    const down = s.length * (0.25 + 0.75 * r(3) ** 2)
    const up = down * (0.35 + 0.4 * r(4))
    const joined = down + up > gap * 0.82
    return { x, z, down: joined ? gap * 0.55 : down, up: joined ? gap * 0.5 : up, joined, wide: 0.1 + 0.05 * r(5) }
  })
}

/** Stalactites hanging from a roof, stalagmites where their drips land, joined into columns where they meet. */
export function drips(s: DripsSpec, thin = 0): Shape {
  const parts: Shape[] = []
  for (const d of dripPlan(s)) {
    const top = s.roof + d.down * 0.1, floor = s.at[1] - d.up * 0.1
    parts.push(spike([d.x, top, d.z], [d.x, s.roof - d.down, d.z], Math.max(d.down * d.wide * 1.1, thin), d.joined ? d.down * d.wide * 0.45 : 0))
    parts.push(spike([d.x, floor, d.z], [d.x, s.at[1] + d.up, d.z], Math.max(d.up * d.wide * 1.6, thin), d.joined ? d.down * d.wide * 0.45 : 0))
  }
  return many(parts)
}

/** A cone from a round base to a point (or to `rTo`), the shape of a stalactite or an icicle: a ripple or two down it. */
function spike(from: Vec3, to: Vec3, r: number, rTo = 0): Shape {
  const ax = sub(to, from), len = Math.hypot(ax[0], ax[1], ax[2]) || 1e-6, d: Vec3 = [ax[0] / len, ax[1] / len, ax[2] / len]
  const slope = 1 / Math.hypot(1, (r - rTo) / len)
  return {
    sdf: (x, y, z) => {
      const q = sub([x, y, z], from), h = dot(q, d)
      const t = Math.min(1, Math.max(0, h / len))
      const rad = (r + (rTo - r) * t) * (1 + 0.08 * Math.sin(t * 19))
      const side = (Math.hypot(q[0] - d[0] * h, q[1] - d[1] * h, q[2] - d[2] * h) - rad) * slope
      return Math.max(side, -h, h - len)
    },
    min: [Math.min(from[0], to[0]) - r * 1.1, Math.min(from[1], to[1]) - r * 1.1, Math.min(from[2], to[2]) - r * 1.1],
    max: [Math.max(from[0], to[0]) + r * 1.1, Math.max(from[1], to[1]) + r * 1.1, Math.max(from[2], to[2]) + r * 1.1],
  }
}

// --- Flowstone

export interface FlowSpec {
  /** The middle of its top, where it leaves the wall. */
  at: Vec3
  /** Along the wall: [x, z]. Its face looks out to the right of this. */
  along: [number, number]
  width: number
  /** How far it hangs down. */
  drop: number
  /** Folds across it (5). */
  folds?: number
  seed: number
}

/** Flowstone down a wall: a curtain of stone in folds, thicker at the top, its foot hanging in scallops. */
function flowstoneRaw(s: FlowSpec): Shape {
  const l = Math.hypot(s.along[0], s.along[1]) || 1, ux = s.along[0] / l, uz = s.along[1] / l
  const folds = Math.max(1, s.folds ?? 5)
  const k = (Math.PI * 2 * folds) / s.width
  const amp = s.width / folds / 5
  const sdf = (x: number, y: number, z: number) => {
    const px = x - s.at[0], pz = z - s.at[2]
    const u = px * ux + pz * uz, w = -px * uz + pz * ux, v = s.at[1] - y
    const t = Math.min(1, Math.max(0, v / s.drop))
    // a fold that deepens the further it hangs, swelling out from the wall at the top
    const mid = amp * Math.sin(u * k + hash(s.seed, 1) * 6) * (0.3 + t) + s.drop * 0.12 * (1 - t) ** 2
    const thick = s.drop * 0.07 * (1.3 - t)
    const foot = s.drop * (0.7 + 0.3 * Math.abs(Math.cos((u * k) / 2 + hash(s.seed, 2) * 3)))
    const dw = (Math.abs(w - mid) - thick) / Math.hypot(1, amp * k * (0.3 + t))
    return Math.max(dw, Math.abs(u) - s.width / 2, v - foot, -v)
  }
  const R = s.width / 2 + amp * 1.3 + s.drop * 0.25
  return { sdf, min: [s.at[0] - R, s.at[1] - s.drop, s.at[2] - R], max: [s.at[0] + R, s.at[1], s.at[2] + R] }
}

// --- Icicles

export interface IcicleSpec {
  /** About how far apart they hang. */
  every: number
  /** The longest. */
  length: number
  /** Only edges higher than this hang icicles (an edge resting on the ground has none): every edge when left out. */
  above?: number
  seed: number
}

/**
 * Icicles under every downward edge of `host`: its box is looked at from below in columns `every` apart, and where a
 * column meets the underside of the shape but the column beside it doesn't (or meets it much higher up), an icicle
 * hangs from that edge. Only the icicles are drawn: give the host its own part.
 */
export function icicles(host: Shape, s: IcicleSpec, thin = 0): Shape {
  const e = Math.max(s.every, 0.01)
  const nx = Math.min(80, Math.ceil((host.max[0] - host.min[0]) / e) + 1), nz = Math.min(80, Math.ceil((host.max[2] - host.min[2]) / e) + 1)
  /** The height of the shape's underside in the column at (x, z), from below, or NaN if the column misses it. */
  const under = (x: number, z: number) => {
    let y = host.min[1] - e
    for (let k = 0; k < 96 && y < host.max[1] + e; k++) {
      const d = host.sdf(x, y, z)
      if (d < e * 0.05) return y
      y += Math.max(d, e * 0.08)
    }
    return NaN
  }
  const grid: number[] = []
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) grid.push(under(host.min[0] + i * e, host.min[2] + j * e))
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= nz ? NaN : grid[j * nx + i])
  const parts: Shape[] = []
  for (let j = 0; j < nz && parts.length < 200; j++) for (let i = 0; i < nx && parts.length < 200; i++) {
    const y = at(i, j)
    if (Number.isNaN(y)) continue
    // an edge: a neighbor column misses the shape, or meets it a good way higher
    const edge = [at(i + 1, j), at(i - 1, j), at(i, j + 1), at(i, j - 1)].some((n) => Number.isNaN(n) || n > y + e * 1.5)
    if (!edge || y <= (s.above ?? -Infinity)) continue
    const r = (q: number) => hash(s.seed, i, j, q)
    if (r(1) < 0.25) continue
    const x = host.min[0] + i * e + (r(2) - 0.5) * e * 0.6, z = host.min[2] + j * e + (r(3) - 0.5) * e * 0.6
    const len = s.length * (0.2 + 0.8 * r(4) ** 1.5)
    parts.push(spike([x, y + e * 0.3, z], [x, y - len, z], Math.max(len * 0.13, e * 0.18, thin)))
  }
  if (!parts.length) return { sdf: () => 1, min: host.min, max: host.min }
  return many(parts)
}

export const geode = (s: GeodeSpec): Shape => tighten(geodeRaw(s), 0.92)

export const flowstone = (s: FlowSpec): Shape => tighten(flowstoneRaw(s), 0.65)
