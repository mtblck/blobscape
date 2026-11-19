import type { Vec3 } from '../../splat-core/blobs.ts'
import { hex } from './flowers.ts'
import { LAMP, Maker, type Finish, arc, hash, lerp, mix, mul, noise, rng, smooth } from './make.ts'

/**
 * What the vase stands on (Matt asked for these four, 2026-11-19, and for legs even where the view hardly
 * shows them): a long rustic wooden table, a round glass top on a metal frame, a round wooden top on a turned
 * pedestal, and a white garden table of pierced metal. Each top is at height 0 with the vase at its middle, and
 * each stands on the ground `TABLE_HEIGHT` below.
 */
export type TableKind = 'long' | 'glass' | 'round' | 'garden'
export const TABLES: { id: TableKind; label: string }[] = [
  { id: 'long', label: 'Long rustic' }, { id: 'round', label: 'Round wood' }, { id: 'glass', label: 'Round glass' }, { id: 'garden', label: 'White garden' },
]

/** How far the ground is under a table's top: a vase is about a fifth of this. */
export const TABLE_HEIGHT = 1.5

export interface TableInfo {
  kind: TableKind
  /** What to call it: 'a long rustic table'. */
  name: string
  /** How far the top reaches from its middle along a level way (x, z), for a petal to land on it and not past it. */
  reach: (x: number, z: number) => number
  /** The lowest any of it goes: its feet on the ground. */
  ground: number
}

const TAU = Math.PI * 2
const pickOf = <T,>(xs: T[], r: number) => xs[Math.floor(r * xs.length) % xs.length]
/** The vase's shadow on the top, falling away from the lamp: 1 in the open, less under and beside the vase. */
const shadowAt = (p: ArrayLike<number>, foot: number, deep = 0.45) => 1 - deep * smooth(1 - (Math.hypot(p[0] - LAMP[0] * -0.12, p[2] - LAMP[2] * -0.12) - foot * 0.7) / (foot * 0.9 + 0.12))

/** A round top, flat on height `y`, painted by `color`. */
function disc(m: Maker, radius: number, y: number, color: (p: Vec3, a: number) => ArrayLike<number>, fin: Finish = {}, keep?: (p: Vec3) => boolean, swell: (a: number) => number = () => 1) {
  m.cover(
    (u, v) => { const r = u * radius * swell(v * TAU); return [r * Math.cos(v * TAU), y, -r * Math.sin(v * TAU)] },
    Math.round(radius / m.step), (u) => (TAU * u * radius) / m.step,
    (_u, v, p) => color(p, v * TAU), fin, { wrap: true, keep },
  )
}

/** A straight or bent bar: a leg, a rail, a ring. */
const bar = (m: Maker, path: Vec3[], r: number | ((t: number) => number), color: (p: Vec3, t: number) => ArrayLike<number>, shine = 0) =>
  m.tube(path, typeof r === 'number' ? () => r : r, (t, _a, p) => color(p, t), shine ? { shine } : {})

const ring = (radius: number, y: number, n = 28): Vec3[] => Array.from({ length: n + 1 }, (_, i) => [radius * Math.cos((i / n) * TAU), y, radius * Math.sin((i / n) * TAU)] as Vec3)

/** Stands a table under the vase and says how far its top reaches. The same seed gives the same table. */
export function makeTable(m: Maker, kind: TableKind, foot: number, seed: number): TableInfo {
  const rand = rng(seed * 31 + 5)
  const ground = -TABLE_HEIGHT
  // a coarser cover than the flowers: a table needs no finer
  const fine = m.spacing
  m.spacing = fine * 1.8
  m.newPart()
  let info: TableInfo
  if (kind === 'long') {
    // planks along the table, each its own shade, with gaps, knots and a worn edge; four square-set posts and a stretcher
    const X = 1.9, Z = 0.66, T = 0.085, plank = 0.21
    const wood = hex(pickOf(['#a47a52', '#8a6646', '#b08e68', '#75583f'], rand()))
    const paint = (p: ArrayLike<number>, along: number, across: number) => {
      const board = Math.floor(across / plank + 100), inBoard = across / plank + 100 - board
      const grain = 0.86 + 0.2 * noise([along * 0.9 + board * 3.1, 0, across * 7], 9, seed) + 0.08 * noise([along * 5, 0, across * 30], 5, seed + 2)
      const gap = Math.abs(inBoard - 0.5) > 0.465 ? -0.3 : 0
      // a knot here and there, and the boards' ends where two meet
      const k = [hash(board, seed, 1) * 2 * X - X, (board - 100 + 0.2 + 0.6 * hash(board, seed, 2)) * plank]
      const knot = hash(board, seed, 3) < 0.6 ? -0.28 * smooth(1 - Math.hypot((along - k[0]) * 0.6, across - k[1]) / 0.035) : 0
      const joint = Math.abs(along - (hash(board, seed, 4) - 0.5) * 2.8) < 0.006 ? -0.22 : 0
      return mul(wood, (grain + gap + knot + joint) * (0.86 + 0.2 * hash(board, 5, seed)) * shadowAt(p, foot))
    }
    m.cover((u, v) => [lerp(-X, X, u), 0, lerp(Z, -Z, v)], Math.round((2 * X) / m.step), () => (2 * Z) / m.step, (_u, _v, p) => paint(p, p[0], p[2]), { glow: true })
    const side = (p: Vec3, along: number) => mul(wood, 0.74 + 0.2 * noise([along * 2, p[1] * 30, 0], 7, seed + 4))
    m.cover((u, v) => [lerp(-X, X, u), lerp(-T, 0, v), Z], Math.round((2 * X) / m.step), () => Math.max(2, T / m.step), (_u, _v, p) => side(p, p[0]))
    m.cover((u, v) => [lerp(X, -X, u), lerp(-T, 0, v), -Z], Math.round((2 * X) / m.step), () => Math.max(2, T / m.step), (_u, _v, p) => side(p, p[0]))
    m.cover((u, v) => [X, lerp(-T, 0, v), lerp(Z, -Z, u)], Math.round((2 * Z) / m.step), () => Math.max(2, T / m.step), (_u, _v, p) => side(p, p[2]))
    m.cover((u, v) => [-X, lerp(-T, 0, v), lerp(-Z, Z, u)], Math.round((2 * Z) / m.step), () => Math.max(2, T / m.step), (_u, _v, p) => side(p, p[2]))
    // the underside, seen through nothing but still there when the view goes low
    m.cover((u, v) => [lerp(-X, X, u), -T, lerp(-Z, Z, v)], Math.round((2 * X) / (m.step * 1.5)), () => (2 * Z) / (m.step * 1.5), () => mul(wood, 0.4))
    m.newPart()
    const leg = (p: Vec3, t: number) => mul(wood, 0.62 + 0.22 * noise([p[0] * 9, t * 6, p[2] * 9], 6, seed + 6))
    const lx = X - 0.22, lz = Z - 0.14
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) bar(m, [[sx * lx, -T, sz * lz], [sx * lx, ground, sz * lz]], 0.062, leg)
      // an apron under each end and a rail low down between its legs
      bar(m, [[sx * lx, -T - 0.07, -lz], [sx * lx, -T - 0.07, lz]], 0.045, leg)
      bar(m, [[sx * lx, ground + 0.32, -lz], [sx * lx, ground + 0.32, lz]], 0.04, leg)
    }
    for (const sz of [-1, 1]) bar(m, [[-lx, -T - 0.07, sz * lz], [lx, -T - 0.07, sz * lz]], 0.045, leg)
    bar(m, [[-lx, ground + 0.32, 0], [lx, ground + 0.32, 0]], 0.04, leg)
    info = { kind, name: 'a long rustic table', ground, reach: (x, z) => Math.min(X / Math.max(1e-6, Math.abs(x)), Z / Math.max(1e-6, Math.abs(z))) }
  } else if (kind === 'glass') {
    // a pane you see the frame through: faint and green at the edge, bright where the lamp strikes it
    const R = 0.86
    const tint = hex(pickOf(['#bfe0d6', '#c9dfe6', '#cfe3cf'], rand())), metal = hex(pickOf(['#2e2f33', '#5b4a36', '#7d8087'], rand()))
    disc(m, R, 0, (p) => {
      const r = Math.hypot(p[0], p[2]) / R
      const glint = smooth(1 - Math.abs(p[0] * LAMP[2] - p[2] * LAMP[0] + 0.3) / 0.07) * 0.5
      return mix(mul(tint, (0.74 + 0.26 * r) * shadowAt(p, foot, 0.3)), [1, 1, 1], glint)
    }, { glow: true, opacity: 0.3 })
    m.lathe([[R - 0.012, -0.03], [R, -0.026], [R + 0.004, -0.013], [R, 0]], (a) => mix(mul(tint, 0.62), [1, 1, 1], 0.5 * smooth(1 - Math.abs(((a - Math.atan2(LAMP[2], LAMP[0]) + Math.PI * 3) % TAU) - Math.PI) / 0.5)), { glow: true, opacity: 0.72 })
    m.newPart()
    const iron = (p: Vec3) => mul(metal, 0.8 + 0.25 * noise(p, 10, seed))
    bar(m, ring(0.6, -0.055), 0.02, iron, 0.5)
    bar(m, ring(0.44, ground + 0.5), 0.016, iron, 0.5)
    for (let i = 0; i < 4; i++) {
      const a = (i + 0.5) * (TAU / 4), c = Math.cos(a), s = Math.sin(a)
      bar(m, arc([0.6 * c, -0.055, 0.6 * s], [0.34 * c, ground + 0.62, 0.34 * s], [0.66 * c, ground, 0.66 * s], 16), 0.021, iron, 0.5)
      // a pad of rubber under the glass at each leg
      m.ball([0.6 * c, -0.036, 0.6 * s], [0.03, 0.012, 0.03], () => [0.12, 0.12, 0.13])
    }
    info = { kind, name: 'a round glass table', ground, reach: () => R }
  } else if (kind === 'garden') {
    // white painted metal, pierced in rings of petals, with a scalloped skirt and three curled legs
    const R = 0.72, white = hex(pickOf(['#f1eee6', '#e9ece8', '#f3efe9'], rand()))
    const scallop = (a: number) => 1 + 0.018 * Math.cos(a * 18)
    const pierced = (p: ArrayLike<number>) => {
      const r = Math.hypot(p[0], p[2]) / R, a = Math.atan2(p[2], p[0])
      if (r < 0.34 || r > 0.9) return false
      // three rings of openings, each ring's set half a step round from the last
      const band = Math.floor((r - 0.34) / 0.19), inBand = ((r - 0.34) / 0.19) % 1, n = 9 + band * 5
      const round = (((a / TAU) * n + band * 0.5) % 1 + 1) % 1
      return Math.hypot((inBand - 0.5) / 0.36, (round - 0.5) / 0.3) < 1
    }
    const paint = (p: Vec3) => mul(white, (0.94 + 0.07 * noise(p, 14, seed)) * shadowAt(p, foot, 0.3))
    disc(m, R, 0, paint, { glow: true }, (p) => !pierced(p), scallop)
    m.lathe([[R - 0.02, -0.075], [R + 0.006, -0.06], [R + 0.004, 0]], (_a, _t, p) => mul(white, 0.78 + 0.08 * noise(p, 14, seed)), {}, { swell: scallop, keep: (p) => p[1] > -0.045 - 0.03 * Math.abs(Math.cos(Math.atan2(p[2], p[0]) * 9)) })
    m.newPart()
    const enamel = (p: Vec3) => mul(white, 0.8 + 0.1 * noise(p, 12, seed + 3))
    bar(m, ring(0.5, -0.04), 0.018, enamel, 0.3)
    bar(m, ring(0.2, ground + 0.62), 0.016, enamel, 0.3)
    for (let i = 0; i < 3; i++) {
      const a = i * (TAU / 3) + 0.5, c = Math.cos(a), s = Math.sin(a)
      // down and in to the waist, then out to a foot that curls up at its end
      const waist: Vec3 = [0.2 * c, ground + 0.62, 0.2 * s]
      bar(m, arc([0.5 * c, -0.04, 0.5 * s], [0.52 * c, ground + 1.0, 0.52 * s], waist, 12), 0.02, enamel, 0.3)
      bar(m, arc(waist, [0.1 * c, ground + 0.16, 0.1 * s], [0.6 * c, ground + 0.02, 0.6 * s], 12), 0.02, enamel, 0.3)
      bar(m, arc([0.6 * c, ground + 0.02, 0.6 * s], [0.7 * c, ground + 0.02, 0.7 * s], [0.66 * c, ground + 0.1, 0.66 * s], 6), 0.018, enamel, 0.3)
    }
    info = { kind, name: 'a white garden table', ground, reach: () => R * 0.98 }
  } else {
    // boards with a grain, an edge, and a turned pedestal on three feet
    const R = 0.85
    const wood = hex(pickOf(['#b98a5e', '#8e6a4c', '#d8c3a0', '#6f5b4c', '#c9cdc6'], rand()))
    disc(m, R, 0, (p) => {
      const board = Math.floor(p[0] / 0.16 + 100)
      const grain = 0.9 + 0.16 * noise([p[0] * 6, 0, p[2] * 0.7 + board * 3.1], 9, seed) + (Math.abs(p[0] / 0.16 + 100 - board - 0.5) > 0.47 ? -0.18 : 0)
      return mul(wood, grain * (0.9 + 0.1 * hash(board, 5)) * shadowAt(p, foot))
    }, { glow: true })
    m.lathe([[R - 0.04, -0.06], [R, -0.045], [R, 0]], (_a, _t, p) => mul(wood, 0.62 + 0.1 * noise(p, 12, seed)), {})
    // a second layer under the top, or the pedestal shows through the gaps between the top's blobs
    disc(m, R - 0.03, -0.05, () => mul(wood, 0.38), { glow: true })
    m.newPart()
    const turned = (p: Vec3) => mul(wood, 0.6 + 0.16 * noise([p[0] * 8, p[1] * 3, p[2] * 8], 8, seed + 1))
    m.lathe([[0.1, ground + 0.24], [0.13, ground + 0.34], [0.075, ground + 0.5], [0.06, ground + 0.8], [0.1, ground + 0.98], [0.065, ground + 1.1], [0.085, ground + 1.3], [0.2, ground + 1.4], [0.34, -0.075]], (_a, _t, p) => turned(p), { shine: 0.2 })
    for (let i = 0; i < 3; i++) {
      const a = i * (TAU / 3) + 0.9, c = Math.cos(a), s = Math.sin(a)
      bar(m, arc([0.06 * c, ground + 0.3, 0.06 * s], [0.3 * c, ground + 0.34, 0.3 * s], [0.56 * c, ground + 0.03, 0.56 * s], 12), (t) => 0.05 - 0.016 * t, turned)
    }
    info = { kind, name: 'a round wooden table', ground, reach: () => R }
  }
  m.spacing = fine
  return info
}

/** The table a seed stands its bouquet on when none is asked for. */
export const tableFor = (seed: number): TableKind => TABLES[Math.floor(rng(seed * 613 + 29)() * TABLES.length) % TABLES.length].id
