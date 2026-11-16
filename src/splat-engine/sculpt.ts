import { Blobs, type Vec3 } from '../splat-core/blobs.ts'
import { boneTail, segDist, type Creature } from './body.ts'
import { emptySkin, setWeights, type Bone, type Skin } from './rig.ts'
import { buildVoxels, type Shape, type VoxelLight } from './voxel.ts'

/**
 * Creatures cut the way the pixel scenes are (voxel.ts): shapes given as
 * distance functions, one solid disc per surface cell, sun and cast shadows
 * baked in. What a scene does not need and a creature does is bending: here
 * every cell is weighted to the bones named on its part by distance, as
 * body.ts weights its blobs, so a neck or a tail curves without a seam.
 *
 * Parts in one `group` are treated as one solid: a cell buried inside a
 * neighbor is never made. Give a part its own group when it swings clear of
 * the rest (a jaw, a wing), or what it uncovers would be missing.
 */
export interface SculptPart {
  shape: Shape
  /** Color (0–1, sRGB) or color at a surface point given its outward normal. */
  color: Vec3 | ((p: Vec3, n: Vec3) => Vec3)
  /** The bones that move it: each cell is weighted by its distance to each. */
  bones: string[]
  group?: string
  glow?: boolean
  opacity?: number
  noShadow?: boolean
  /** How far its weights spread from each bone, if not the creature's `blend`. */
  blend?: number
}

export interface SculptSpec {
  bones: Bone[]
  parts: SculptPart[]
  /** How far (in world units) a cell's weight spreads from a bone. */
  blend: number
  light?: Partial<VoxelLight>
}

export interface Sculpted extends Creature {
  partOf: Uint16Array
  spacing: number
}

/** Cuts the creature on a grid of `spacing`. */
export function buildSculpt(spec: SculptSpec, spacing: number): Sculpted {
  // the cutter culls between parts on one bone, so each group borrows a bone of its own for the cut
  const groups = [...new Set(spec.parts.map((p) => p.group ?? ''))]
  if (groups.length > spec.bones.length) throw new Error('more groups than bones')
  const built = buildVoxels({
    bones: spec.bones, spacing, light: spec.light, blocks: true,
    parts: spec.parts.map((p) => ({ shape: p.shape, color: p.color, bone: spec.bones[groups.indexOf(p.group ?? '')].name, glow: p.glow, opacity: p.opacity, noShadow: p.noShadow })),
  })
  const index = new Map(spec.bones.map((b, i) => [b.name, i]))
  const tails = spec.bones.map((_, i) => boneTail(spec.bones, i))
  const lists = spec.parts.map((part) => part.bones.map((name) => {
    const b = index.get(name)
    if (b === undefined) throw new Error(`no bone ${name}`)
    return b
  }))
  const skin = emptySkin(built.blobs.count)
  for (let i = 0; i < built.blobs.count; i++) {
    const part = spec.parts[built.partOf[i]]
    const sig2 = 2 * (part.blend ?? spec.blend) ** 2
    const p = built.blobs.center.subarray(i * 3, i * 3 + 3)
    const pairs = lists[built.partOf[i]].map((b): [number, number] => {
      const d = segDist(p, spec.bones[b].head, tails[b])
      return [b, Math.exp(-(d * d) / sig2)]
    })
    // the closest bone always gets a share, so no cell is left behind
    const best = pairs.reduce((m, q) => (q[1] > m[1] ? q : m))
    best[1] = Math.max(best[1], 1e-3)
    setWeights(skin, i, pairs)
  }
  return { blobs: built.blobs, skin, skeleton: built.skeleton, partOf: built.partOf, spacing }
}

/**
 * Cuts the creature at the spacing that gives about `count` blobs: one coarse
 * cut to measure its surface, then the real one (cells go as 1 / spacing²).
 * `make` is handed the spacing so thin parts can be kept at least a cell thick.
 */
export function sculptToCount(make: (spacing: number) => SculptSpec, count: number, probe = 0.08): Sculpted {
  const rough = buildSculpt(make(probe), probe)
  const spacing = probe * Math.sqrt(rough.blobs.count / count)
  return buildSculpt(make(spacing), spacing)
}

/** One creature from two builds on the same bones (a sculpted body and a fuzzy flame, say): `b`'s blobs follow `a`'s. */
export function joinBuilt(a: { blobs: Blobs; skin: Skin }, b: { blobs: Blobs; skin: Skin }): { blobs: Blobs; skin: Skin; from: number } {
  const blobs = new Blobs(a.blobs.count + b.blobs.count)
  for (let i = 0; i < a.blobs.count; i++) blobs.push(a.blobs.get(i))
  for (let i = 0; i < b.blobs.count; i++) blobs.push(b.blobs.get(i))
  const skin = emptySkin(blobs.count)
  skin.joints.set(a.skin.joints.subarray(0, a.blobs.count * 4))
  skin.weights.set(a.skin.weights.subarray(0, a.blobs.count * 4))
  skin.joints.set(b.skin.joints.subarray(0, b.blobs.count * 4), a.blobs.count * 4)
  skin.weights.set(b.skin.weights.subarray(0, b.blobs.count * 4), a.blobs.count * 4)
  return { blobs, skin, from: a.blobs.count }
}

// --- Shapes a creature needs beyond voxel.ts's

/** Shapes melted into each other over a distance `k`, so a neck runs into a chest without a crease. */
export function smooth(k: number, ...s: Shape[]): Shape {
  return {
    sdf: (x, y, z) => {
      let d = s[0].sdf(x, y, z)
      for (let i = 1; i < s.length; i++) {
        const e = s[i].sdf(x, y, z)
        const h = Math.max(k - Math.abs(d - e), 0) / k
        d = Math.min(d, e) - h * h * k * 0.25
      }
      return d
    },
    min: [0, 1, 2].map((i) => Math.min(...s.map((q) => q.min[i])) - k) as Vec3,
    max: [0, 1, 2].map((i) => Math.max(...s.map((q) => q.max[i])) + k) as Vec3,
  }
}

/** A shape squashed front to back (along z) about z = `at`, to `f` of its depth: a chest, a foot. */
export function flatten(s: Shape, f: number, at = 0): Shape {
  return {
    sdf: (x, y, z) => s.sdf(x, y, at + (z - at) / f) * f,
    min: [s.min[0], s.min[1], at + (s.min[2] - at) * f], max: [s.max[0], s.max[1], at + (s.max[2] - at) * f],
  }
}

const sub = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** Squared distance from p to the triangle a b c. */
function triDist2(p: Vec3, a: Vec3, b: Vec3, c: Vec3) {
  const ba = sub(b, a), pa = sub(p, a), cb = sub(c, b), pb = sub(p, b), ac = sub(a, c), pc = sub(p, c)
  const n = cross(ba, ac)
  const outside = Math.sign(dot(cross(ba, n), pa)) + Math.sign(dot(cross(cb, n), pb)) + Math.sign(dot(cross(ac, n), pc)) < 2
  if (!outside) return (dot(n, pa) ** 2) / (dot(n, n) || 1e-12)
  const edge = (e: Vec3, q: Vec3) => { const t = clamp01(dot(e, q) / (dot(e, e) || 1e-12)); const v: Vec3 = [e[0] * t - q[0], e[1] * t - q[1], e[2] * t - q[2]]; return dot(v, v) }
  return Math.min(edge(ba, pa), edge(cb, pb), edge(ac, pc))
}

/** A skin of thickness 2r stretched over triangles: a wing's membrane, a fin. */
export function membrane(tris: Vec3[][], r: number): Shape {
  const pts = tris.flat()
  return {
    sdf: (x, y, z) => {
      let d = Infinity
      const p: Vec3 = [x, y, z]
      for (const t of tris) d = Math.min(d, triDist2(p, t[0], t[1], t[2]))
      return Math.sqrt(d) - r
    },
    min: [0, 1, 2].map((i) => Math.min(...pts.map((q) => q[i])) - r) as Vec3,
    max: [0, 1, 2].map((i) => Math.max(...pts.map((q) => q[i])) + r) as Vec3,
  }
}

/**
 * A pattern of scales: space cut into staggered cells of size `a`. Gives how
 * far the point is from its cell's middle (0 at the middle, 1 at the seam) and
 * a number 0–1 that is the same all over one scale.
 */
export function scales(p: ArrayLike<number>, a: number): { out: number; id: number } {
  const j = Math.round(p[1] / a)
  const off = (j & 1) * 0.5
  const i = Math.round(p[0] / a + off), k = Math.round(p[2] / a + off)
  const out = Math.max(Math.abs(p[0] / a + off - i), Math.abs(p[1] / a - j), Math.abs(p[2] / a + off - k)) * 2
  const h = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453
  return { out, id: h - Math.floor(h) }
}
