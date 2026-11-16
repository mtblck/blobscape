import { Blobs, quatFacing, type Vec3 } from '../splat-core/blobs.ts'
import { Skeleton, emptySkin, setWeights, type Bone, type Skin } from './rig.ts'

/**
 * A body builder for procedural creatures: a skeleton, plus a list of simple
 * shapes (tapered tubes, ellipsoids, flat sheets, and filled cones for things
 * like flame), each covered in flat surface blobs and weighted to the bones
 * named on it by distance. The fox (creature.ts) was the first creature and
 * builds its own way; the frog, elf and dragon are written in this.
 *
 * Blobs are spread by area, so a part gets its share of `count`; `density`
 * gives small parts (eyes, claws) more than their share. Lighting is baked into
 * the color from a fixed light, as for the fox, unless a part is `glow`.
 */
export interface Creature {
  blobs: Blobs
  skin: Skin
  skeleton: Skeleton
}

export type Shape =
  /** A capsule from a to b, radius ra → rb; `flat` < 1 squashes it top to bottom. */
  | { tube: [a: Vec3, b: Vec3]; r: [ra: number, rb: number]; flat?: number }
  /** An ellipsoid with radii along x, y and z. */
  | { ball: Vec3; r: Vec3 }
  /** Flat triangles (each three points), seen from both sides: wings, webbed feet, a cape. */
  | { sheet: Vec3[][] }
  /** A solid cone of round blobs from a (radius ra) to b (radius rb): flame, smoke. */
  | { fill: [a: Vec3, b: Vec3]; r: [ra: number, rb: number] }

export interface Part {
  shape: Shape
  /** Color at a point on the surface, given its outward normal and `u`, how far along a tube or fill (0–1). */
  color: Vec3 | ((p: Vec3, n: Vec3, u: number) => Vec3)
  /** The bones that move it, nearest first is not needed: each blob is weighted by its distance to each. */
  bones: string[]
  /** Blobs per unit area, relative to the rest. */
  density?: number
  /** Blob size, relative to the rest. */
  size?: number
  /** Opacity, or opacity at a point given how far along it is (as for `color`). */
  opacity?: number | ((p: Vec3, u: number) => number)
  /** Unlit: the color as given, for eyes and fire. */
  glow?: boolean
  /** How far its weights spread from each bone, if not the creature's `blend`: wider for a sheet that must stretch smoothly. */
  blend?: number
}

export interface BodySpec {
  bones: Bone[]
  parts: Part[]
  /** How far (in world units) a blob's weight spreads from a bone: about a tenth of a limb. */
  blend: number
}

export interface Built extends Creature {
  /** Which part each blob came from. */
  partOf: Uint16Array
}

const LIGHT: Vec3 = norm([-0.45, 0.75, 0.5])
const r2 = (i: number): [number, number] => [(0.5 + i * 0.7548776662466927) % 1, (0.5 + i * 0.5698402909980532) % 1]

export function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/** Where a bone ends in the rest pose: its tail, else its first child's head, else a short way on from its parent. */
export function boneTail(bones: Bone[], i: number): Vec3 {
  const b = bones[i]
  if (b.tail) return b.tail
  const child = bones.find((c) => c.parent === i)
  if (child) return child.head
  if (b.parent >= 0) {
    const p = bones[b.parent].head
    return [b.head[0] + (b.head[0] - p[0]) * 0.4, b.head[1] + (b.head[1] - p[1]) * 0.4, b.head[2] + (b.head[2] - p[2]) * 0.4]
  }
  return [b.head[0], b.head[1] + 0.1, b.head[2]]
}

export function shapeArea(s: Shape): number {
  if ('tube' in s || 'fill' in s) {
    const [a, b] = 'tube' in s ? s.tube : s.fill
    const [ra, rb] = s.r
    const len = dist(a, b)
    if ('fill' in s) return Math.PI * ((ra + rb) / 2) ** 2 * 6 + len * (ra + rb) // volume-ish: filled cones get blobs by bulk
    const f = 'flat' in s && s.flat ? (1 + s.flat) / 2 : 1
    return (2 * Math.PI * ((ra + rb) / 2) * len + 2 * Math.PI * (ra * ra + rb * rb)) * f
  }
  if ('ball' in s) {
    const [a, b, c] = s.r, p = 1.6075
    return 4 * Math.PI * (((a * b) ** p + (a * c) ** p + (b * c) ** p) / 3) ** (1 / p)
  }
  return s.sheet.reduce((sum, t) => sum + triArea(t), 0)
}

/**
 * Builds a creature from its spec with about `count` blobs. The same spec and
 * seed always give the same creature.
 */
export function buildBody(spec: BodySpec, count: number, seed = 7): Built {
  const areas = spec.parts.map((p) => shapeArea(p.shape) * (p.density ?? 1))
  const total = areas.reduce((a, b) => a + b, 0)
  const surface = spec.parts.reduce((s, p) => s + shapeArea(p.shape), 0)
  const per = spec.parts.map((_, i) => Math.max(24, Math.round((areas[i] / total) * count)))
  const n = per.reduce((a, b) => a + b, 0)
  const blobs = new Blobs(n)
  const partOf = new Uint16Array(n)
  const rand = rng(seed)
  // one blob size for the whole creature, so a part's density shows as overlap, not as a different grain
  const size = Math.sqrt(surface / count) * 0.75

  spec.parts.forEach((part, pi) => {
    const s = part.shape
    const m = per[pi]
    for (let i = 0; i < m; i++) {
      const [u, v] = r2(i + pi * 7919)
      const { p, n: nn, along } = sample(s, u, v, rand)
      const base = typeof part.color === 'function' ? part.color(p, nn, along) : part.color
      let k = 1
      if (!part.glow) {
        const facing = 'sheet' in s ? Math.abs(dot(nn, LIGHT)) : dot(nn, LIGHT)
        k = (0.5 + 0.5 * Math.max(0, facing * 0.5 + 0.5)) * (0.9 + rand() * 0.2)
      }
      const j = (0.75 + rand() * 0.5) * (part.size ?? 1)
      const op = typeof part.opacity === 'function' ? part.opacity(p, along) : part.opacity ?? 0.92
      const round = 'fill' in s
      blobs.push({
        center: p,
        scale: round ? [size * j * 1.6, size * j * 1.6, size * j * 1.6] : [size * j, size * j * (0.7 + rand() * 0.6), size * 0.2 * (part.size ?? 1)],
        quat: quatFacing(nn),
        color: [Math.min(1, base[0] * k), Math.min(1, base[1] * k), Math.min(1, base[2] * k)],
        opacity: op,
      })
      partOf[blobs.count - 1] = pi
    }
  })

  const skeleton = new Skeleton(spec.bones)
  const skin = emptySkin(blobs.count)
  const index = new Map(spec.bones.map((b, i) => [b.name, i]))
  const tails = spec.bones.map((_, i) => boneTail(spec.bones, i))
  for (let i = 0; i < blobs.count; i++) {
    const part = spec.parts[partOf[i]]
    const sig2 = 2 * (part.blend ?? spec.blend) ** 2
    const p = blobs.center.subarray(i * 3, i * 3 + 3)
    const pairs: [number, number][] = part.bones.map((name) => {
      const b = index.get(name)
      if (b === undefined) throw new Error(`no bone ${name}`)
      const d = segDist(p, spec.bones[b].head, tails[b])
      return [b, Math.exp(-(d * d) / sig2)]
    })
    // the closest bone always gets a share, so no blob is left behind
    const best = pairs.reduce((m, q) => (q[1] > m[1] ? q : m))
    best[1] = Math.max(best[1], 1e-3)
    setWeights(skin, i, pairs)
  }
  return { blobs, skin, skeleton, partOf }
}

function sample(s: Shape, u: number, v: number, rand: () => number): { p: Vec3; n: Vec3; along: number } {
  if ('ball' in s) {
    // even on a sphere, then stretched; normals follow the ellipsoid
    const y = 1 - 2 * u, rr = Math.sqrt(Math.max(0, 1 - y * y)), ang = v * Math.PI * 2
    const d: Vec3 = [Math.cos(ang) * rr, y, Math.sin(ang) * rr]
    return { p: [s.ball[0] + d[0] * s.r[0], s.ball[1] + d[1] * s.r[1], s.ball[2] + d[2] * s.r[2]], n: norm([d[0] / s.r[0], d[1] / s.r[1], d[2] / s.r[2]]), along: (1 - y) / 2 }
  }
  if ('sheet' in s) {
    const areas = s.sheet.map(triArea)
    const total = areas.reduce((a, b) => a + b, 0)
    let pick = rand() * total, t = 0
    while (t < s.sheet.length - 1 && pick > areas[t]) { pick -= areas[t]; t++ }
    let a = u, b = v
    if (a + b > 1) { a = 1 - a; b = 1 - b }
    const [p0, p1, p2] = s.sheet[t]
    const p: Vec3 = [p0[0] + (p1[0] - p0[0]) * a + (p2[0] - p0[0]) * b, p0[1] + (p1[1] - p0[1]) * a + (p2[1] - p0[1]) * b, p0[2] + (p1[2] - p0[2]) * a + (p2[2] - p0[2]) * b]
    const n = norm(cross(sub(p1, p0), sub(p2, p0)))
    return { p, n: n[1] < 0 ? [-n[0], -n[1], -n[2]] : n, along: (a + b) / 2 }
  }
  const [a, b] = 'tube' in s ? s.tube : s.fill
  const [ra, rb] = s.r
  const flat = 'tube' in s ? s.flat ?? 1 : 1
  const len = dist(a, b) || 1e-6
  const d: Vec3 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len, (b[2] - a[2]) / len]
  // e1 lies level (side to side), e2 is the tube's "up", which `flat` squashes
  const helper: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1]
  const e1 = norm(cross(helper, d))
  const e2 = cross(d, e1)
  const ang = v * Math.PI * 2
  const c = Math.cos(ang), sn = Math.sin(ang)
  if ('fill' in s) {
    const t = u
    const r = (ra + (rb - ra) * t) * Math.sqrt(rand())
    const p = add(add(a, scale(d, t * len)), add(scale(e1, c * r), scale(e2, sn * r)))
    return { p, n: norm(add(scale(e1, c), scale(e2, sn))), along: t }
  }
  const capA = (ra * ra) / (ra * ra + rb * rb + ((ra + rb) / 2) * len)
  const capB = (rb * rb) / (ra * ra + rb * rb + ((ra + rb) / 2) * len)
  if (u < capA || u > 1 - capB) {
    const atA = u < capA
    const h = 1 - (atA ? u / capA : (u - (1 - capB)) / capB)
    const rr = Math.sqrt(Math.max(0, 1 - h * h))
    const r = atA ? ra : rb
    const dir = scale(d, atA ? -h : h)
    const n = norm(add(dir, add(scale(e1, c * rr), scale(e2, (sn * rr) / flat))))
    const p = add(atA ? a : b, add(scale(dir, r), add(scale(e1, c * rr * r), scale(e2, sn * rr * r * flat))))
    return { p, n, along: atA ? 0 : 1 }
  }
  const t = (u - capA) / (1 - capA - capB)
  const r = ra + (rb - ra) * t
  const n = norm(add(add(scale(e1, c), scale(e2, sn / flat)), scale(d, (ra - rb) / len)))
  const p = add(add(a, scale(d, t * len)), add(scale(e1, c * r), scale(e2, sn * r * flat)))
  return { p, n, along: t }
}

/** Distance from p to the segment ab. */
export function segDist(p: ArrayLike<number>, a: Vec3, b: Vec3) {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const ap: Vec3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]
  const t = Math.max(0, Math.min(1, dot(ap, ab) / (dot(ab, ab) || 1)))
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t)
}

/** Mirrors a point (or a list of them) to the creature's other side. */
export const mirror = (p: Vec3): Vec3 => [-p[0], p[1], p[2]]

/** A cheap, smooth-ish pattern in 0–1 for spots and scales: the same at the same point every time. */
export function spots(p: Vec3, freq: number, seed = 0) {
  const s = Math.sin(p[0] * freq + seed) * Math.sin(p[1] * freq * 1.31 + 2.1 + seed) * Math.sin(p[2] * freq * 0.87 + 4.2 + seed)
  const t = Math.sin(p[0] * freq * 2.3 + 1.7) * Math.sin(p[2] * freq * 1.9 + 0.3 + seed)
  return 0.5 + 0.35 * s + 0.15 * t
}

export const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

function triArea([a, b, c]: Vec3[]) { const x = cross(sub(b, a), sub(c, a)); return Math.hypot(...x) / 2 }
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
function norm(a: Vec3): Vec3 { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
