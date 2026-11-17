import type { Vec3 } from '../splat-core/blobs.ts'

/**
 * Growers (issue #163): a tree, a coral or a cluster of crystals grown by a branching rule from a seed, so the same
 * seed always gives the same plant. Pure numbers: `grow` gives the twigs (round-ended sticks, thick to thin) and the
 * tips, which the scene builder turns into shapes. Each style is a rule: how many branches split from each end, how
 * far they lean out, how much shorter and thinner each step is, and how hard they pull back toward the sky.
 */

/** What a grower grows as. */
export type GrowStyle = 'tree' | 'coral' | 'crystal'
/** Every `GrowStyle`. */
export const GROW_STYLES: GrowStyle[] = ['tree', 'coral', 'crystal']

/** A tree, a coral or a cluster of crystals to grow from a seed, for `grow`. */
export interface Grower {
  /** What it grows as. */
  style: GrowStyle
  /** Where it stands. */
  at: Vec3
  /** The same seed gives the same result. */
  seed: number
  /** The trunk's length (a crystal's longest spike). */
  size: number
  /** The trunk's radius at the foot. */
  r: number
  /** Times it splits; left out, what suits the style. */
  depth?: number
  /** Branches from each split; left out, what suits the style. */
  branches?: number
}

/** One branch of a grower: a cone from `from`, where its radius is `r`, to `to`, where it is `rTo`. */
export interface Twig {
  /** Where it starts. */
  from: Vec3
  /** Where it ends. */
  to: Vec3
  /** Its radius at the start. */
  r: number
  /** Its radius at the end. */
  rTo: number
}

interface Rule {
  depth: number
  branches: number
  /** How far a branch leans from its parent, in degrees. */
  spread: number
  /** Each step's length and radius as a share of the one before. */
  shrink: number
  thin: number
  /** How hard a branch turns back toward straight up, 0 to 1. */
  up: number
  /** How much each branch's length and lean vary, 0 to 1. */
  wild: number
}

const RULES: Record<GrowStyle, Rule> = {
  tree: { depth: 4, branches: 3, spread: 34, shrink: 0.72, thin: 0.62, up: 0.3, wild: 0.35 },
  coral: { depth: 4, branches: 2, spread: 36, shrink: 0.82, thin: 0.8, up: 0.2, wild: 0.3 },
  // spikes from one foot: a single split, many branches, leaning far, pointed
  crystal: { depth: 1, branches: 7, spread: 42, shrink: 0.8, thin: 0.15, up: 0, wild: 0.45 },
}

/** No grower makes more twigs than this, whatever its depth and branches. */
export const MAX_TWIGS = 160

/** A small seeded random number source, the same numbers for the same seed everywhere. */
function rng(seed: number) {
  let s = (Math.floor(seed) * 2654435761) >>> 0 || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }

/** `d` leaned by `angle` toward the side picked by `around` (radians round d). */
function lean(d: Vec3, angle: number, around: number): Vec3 {
  const a = norm(Math.abs(d[1]) < 0.95 ? [d[2], 0, -d[0]] : [1, 0, 0])
  const b: Vec3 = [d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0]]
  const s = Math.sin(angle), c = Math.cos(angle), u = Math.cos(around), v = Math.sin(around)
  return norm([d[0] * c + (a[0] * u + b[0] * v) * s, d[1] * c + (a[1] * u + b[1] * v) * s, d[2] * c + (a[2] * u + b[2] * v) * s])
}

/** Grows it: twigs from the foot out, and the tips where the last twigs end. */
export function grow(g: Grower): { twigs: Twig[]; tips: Vec3[] } {
  const rule = RULES[g.style]
  const depth = g.depth ?? rule.depth, branches = g.branches ?? rule.branches
  const rand = rng(g.seed)
  const twigs: Twig[] = [], tips: Vec3[] = []
  const deg = Math.PI / 180
  const step = (from: Vec3, dir: Vec3, len: number, r: number, level: number) => {
    const to: Vec3 = [from[0] + dir[0] * len, from[1] + dir[1] * len, from[2] + dir[2] * len]
    const last = level >= depth || twigs.length >= MAX_TWIGS
    twigs.push({ from, to, r, rTo: r * rule.thin })
    if (last) { tips.push(to); return }
    const turn = rand() * Math.PI * 2
    for (let k = 0; k < branches && twigs.length < MAX_TWIGS; k++) {
      const around = turn + (k / branches) * Math.PI * 2 + (rand() - 0.5) * rule.wild * 2
      const angle = rule.spread * deg * (1 + (rand() - 0.5) * rule.wild)
      let d = lean(dir, angle, around)
      d = norm([d[0] * (1 - rule.up), d[1] * (1 - rule.up) + rule.up, d[2] * (1 - rule.up)])
      step(to, d, len * rule.shrink * (1 + (rand() - 0.5) * rule.wild), r * rule.thin, level + 1)
    }
  }
  if (g.style === 'crystal') {
    // a short stub in the ground, then spikes out of it
    const foot: Vec3 = [g.at[0], g.at[1] - g.r * 0.5, g.at[2]]
    for (let k = 0; k < branches; k++) {
      const d = lean([0, 1, 0], k === 0 ? 0 : rule.spread * deg * (0.4 + rand() * 0.8), (k / branches) * Math.PI * 2 + rand())
      const len = g.size * (k === 0 ? 1 : 0.45 + rand() * 0.45)
      const r = g.r * (k === 0 ? 1 : 0.55 + rand() * 0.35)
      const to: Vec3 = [foot[0] + d[0] * len, foot[1] + d[1] * len, foot[2] + d[2] * len]
      twigs.push({ from: foot, to, r, rTo: r * rule.thin })
      tips.push(to)
    }
    return { twigs, tips }
  }
  step(g.at, [0, 1, 0], g.size, g.r, 0)
  return { twigs, tips }
}

/** How far a grower can reach from its foot: half its box's size along x, y and z, and that box's middle. */
export function growBounds(g: Grower): { mid: Vec3; half: Vec3 } {
  const { twigs } = grow(g)
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const t of twigs) for (const p of [t.from, t.to]) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i] - t.r); hi[i] = Math.max(hi[i], p[i] + t.r) }
  return { mid: [0, 1, 2].map((i) => (lo[i] + hi[i]) / 2) as Vec3, half: [0, 1, 2].map((i) => (hi[i] - lo[i]) / 2) as Vec3 }
}
