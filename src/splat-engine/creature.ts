import { Blobs, quatFacing, type Vec3 } from '../splat-core/blobs.ts'
import { Skeleton, axisAngle, emptySkin, mulQ, setWeights, type Bone, type Skin } from './rig.ts'

/**
 * A procedural blob fox: a skeleton of 14 bones, a body of flat surface blobs
 * built around it, and each blob weighted to the bones of its own body part.
 * Facing +Z, standing on y = 0. `count` is a target; the result is within a
 * few blobs of it, so the same creature serves a lesson (20k) and a benchmark (200k).
 */
export interface Creature {
  blobs: Blobs
  skin: Skin
  skeleton: Skeleton
}

const BONES: Bone[] = [
  { name: 'hips', parent: -1, head: [0, 0.78, -0.42] },
  { name: 'chest', parent: 0, head: [0, 0.82, 0.38] },
  { name: 'neck', parent: 1, head: [0, 0.95, 0.62] },
  { name: 'head', parent: 2, head: [0, 1.2, 0.86] },
  { name: 'tail1', parent: 0, head: [0, 0.86, -0.62] },
  { name: 'tail2', parent: 4, head: [0, 0.98, -1.05] },
  { name: 'flUpper', parent: 1, head: [0.2, 0.7, 0.38] },
  { name: 'flLower', parent: 6, head: [0.2, 0.36, 0.4] },
  { name: 'frUpper', parent: 1, head: [-0.2, 0.7, 0.38] },
  { name: 'frLower', parent: 8, head: [-0.2, 0.36, 0.4] },
  { name: 'blUpper', parent: 0, head: [0.2, 0.68, -0.42] },
  { name: 'blLower', parent: 10, head: [0.2, 0.34, -0.46] },
  { name: 'brUpper', parent: 0, head: [-0.2, 0.68, -0.42] },
  { name: 'brLower', parent: 12, head: [-0.2, 0.34, -0.46] },
]

/** Where each bone's segment ends, for weighting by distance. */
export const TAILS: Record<string, Vec3> = {
  hips: [0, 0.82, 0.38], chest: [0, 0.95, 0.62], neck: [0, 1.2, 0.86], head: [0, 1.2, 1.25],
  tail1: [0, 0.98, -1.05], tail2: [0, 1.0, -1.5],
  flUpper: [0.2, 0.36, 0.4], flLower: [0.2, 0.0, 0.42], frUpper: [-0.2, 0.36, 0.4], frLower: [-0.2, 0.0, 0.42],
  blUpper: [0.2, 0.34, -0.46], blLower: [0.2, 0.0, -0.4], brUpper: [-0.2, 0.34, -0.46], brLower: [-0.2, 0.0, -0.4],
}

/** The fox's bones with their ends, for building another body on the same rig (zoo/fox.ts). */
export const foxBones = (): Bone[] => BONES.map((b) => ({ ...b, tail: TAILS[b.name] }))

interface Part {
  /** Capsule from a to b with radius ra → rb. */
  a: Vec3; b: Vec3; ra: number; rb: number
  color: (p: Vec3, n: Vec3, c: Coat) => Vec3
  bones: string[]
}

/** The fox's three colors: its fur, its pale chest and tail tip, and its dark socks, ear tips and nose. */
export interface Coat { fur: Vec3; pale: Vec3; dark: Vec3 }

export const COATS = {
  red: { fur: [0.88, 0.42, 0.13], pale: [0.96, 0.88, 0.74], dark: [0.18, 0.12, 0.1] },
  arctic: { fur: [0.9, 0.92, 0.95], pale: [0.99, 0.99, 1], dark: [0.25, 0.27, 0.32] },
  silver: { fur: [0.32, 0.33, 0.36], pale: [0.82, 0.83, 0.86], dark: [0.08, 0.08, 0.1] },
} satisfies Record<string, Coat>

const furry = (_p: Vec3, n: Vec3, c: Coat): Vec3 => (n[1] < -0.35 ? c.pale : c.fur)
const sock = (top: number) => (p: Vec3, _n: Vec3, c: Coat): Vec3 => (p[1] < top ? c.dark : c.fur)

const PARTS: Part[] = [
  { a: [0, 0.78, -0.55], b: [0, 0.84, 0.5], ra: 0.25, rb: 0.27, color: furry, bones: ['hips', 'chest'] },
  { a: [0, 0.9, 0.55], b: [0, 1.15, 0.84], ra: 0.17, rb: 0.15, color: furry, bones: ['chest', 'neck', 'head'] },
  { a: [0, 1.2, 0.8], b: [0, 1.16, 1.02], ra: 0.19, rb: 0.16, color: (p, n, c) => (n[1] < -0.2 || p[2] > 1.0 ? c.pale : c.fur), bones: ['head'] },
  { a: [0, 1.13, 1.0], b: [0, 1.1, 1.28], ra: 0.09, rb: 0.035, color: (p, _n, c) => (p[2] > 1.25 ? c.dark : c.pale), bones: ['head'] },
  { a: [0.1, 1.33, 0.85], b: [0.13, 1.52, 0.83], ra: 0.06, rb: 0.01, color: (p, _n, c) => (p[1] > 1.45 ? c.dark : c.fur), bones: ['head'] },
  { a: [-0.1, 1.33, 0.85], b: [-0.13, 1.52, 0.83], ra: 0.06, rb: 0.01, color: (p, _n, c) => (p[1] > 1.45 ? c.dark : c.fur), bones: ['head'] },
  { a: [0, 0.86, -0.6], b: [0, 1.0, -1.5], ra: 0.1, rb: 0.16, color: (p, _n, c) => (p[2] < -1.38 ? c.pale : c.fur), bones: ['hips', 'tail1', 'tail2'] },
  ...(['fl', 'fr', 'bl', 'br'] as const).map((leg): Part => {
    const up = BONES.find((b) => b.name === `${leg}Upper`)!
    const top: Vec3 = [up.head[0], up.head[1] + 0.06, up.head[2]]
    return { a: top, b: TAILS[`${leg}Lower`], ra: 0.085, rb: 0.055, color: sock(0.24), bones: [leg[0] === 'f' ? 'chest' : 'hips', `${leg}Upper`, `${leg}Lower`] }
  }),
]

function area(p: Part) {
  const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2])
  return 2 * Math.PI * ((p.ra + p.rb) / 2) * len + 2 * Math.PI * (p.ra * p.ra + p.rb * p.rb)
}

const r2 = (i: number): [number, number] => [(0.5 + i * 0.7548776662466927) % 1, (0.5 + i * 0.5698402909980532) % 1]

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}

const LIGHT: Vec3 = [-0.45, 0.75, 0.5]

export function makeCreature(count = 20000, seed = 7, coat: Coat = COATS.red): Creature {
  const total = PARTS.reduce((s, p) => s + area(p), 0)
  const blobs = new Blobs(count + 16)
  const rand = rng(seed)
  const parts: number[] = []
  const surface = total / count
  const size = Math.sqrt(surface) * 0.75
  PARTS.forEach((part, pi) => {
    const n = Math.max(8, Math.round((area(part) / total) * count))
    const ax: Vec3 = [part.b[0] - part.a[0], part.b[1] - part.a[1], part.b[2] - part.a[2]]
    const len = Math.hypot(...ax)
    const d: Vec3 = [ax[0] / len, ax[1] / len, ax[2] / len]
    // two unit vectors across the axis
    const helper: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const e1 = norm(cross(d, helper))
    const e2 = cross(d, e1)
    for (let i = 0; i < n; i++) {
      const [u, v] = r2(i + pi * 7919)
      // spread along a capsule: the ends are hemispheres
      const capA = (part.ra * part.ra) / (part.ra * part.ra + part.rb * part.rb + ((part.ra + part.rb) / 2) * len)
      const capB = (part.rb * part.rb) / (part.ra * part.ra + part.rb * part.rb + ((part.ra + part.rb) / 2) * len)
      const ang = v * Math.PI * 2
      let p: Vec3, nn: Vec3
      if (u < capA || u > 1 - capB) {
        const atA = u < capA
        const t = atA ? u / capA : (u - (1 - capB)) / capB
        const r = atA ? part.ra : part.rb
        const z = t // 0 at the pole, 1 at the equator
        const h = 1 - z
        const rr = Math.sqrt(Math.max(0, 1 - h * h))
        const sgn = atA ? -1 : 1
        nn = add3(scale3(d, sgn * h), add3(scale3(e1, Math.cos(ang) * rr), scale3(e2, Math.sin(ang) * rr)))
        p = add3(atA ? part.a : part.b, scale3(nn, r))
      } else {
        const t = (u - capA) / (1 - capA - capB)
        const r = part.ra + (part.rb - part.ra) * t
        nn = add3(scale3(e1, Math.cos(ang)), scale3(e2, Math.sin(ang)))
        // tilt the normal for a tapering cone
        nn = norm(add3(nn, scale3(d, (part.ra - part.rb) / len)))
        p = add3(add3(part.a, scale3(d, t * len)), add3(scale3(e1, Math.cos(ang) * r), scale3(e2, Math.sin(ang) * r)))
      }
      const base = part.color(p, nn, coat)
      const lit = 0.5 + 0.5 * Math.max(0, dot(nn, norm(LIGHT)) * 0.5 + 0.5)
      const k = lit * (0.9 + rand() * 0.2)
      const j = 0.75 + rand() * 0.5
      blobs.push({
        center: p,
        scale: [size * j, size * j * (0.7 + rand() * 0.6), size * 0.2],
        quat: quatFacing(nn),
        color: [Math.min(1, base[0] * k), Math.min(1, base[1] * k), Math.min(1, base[2] * k)],
        opacity: 0.92,
      })
      parts.push(pi)
    }
  })

  // tails are only for drawing the rig
  const skeleton = new Skeleton(BONES.map((b) => ({ ...b, tail: TAILS[b.name] })))
  const skin = emptySkin(blobs.count)
  for (let i = 0; i < blobs.count; i++) {
    const part = PARTS[parts[i]]
    const p = blobs.center.subarray(i * 3, i * 3 + 3)
    const pairs: [number, number][] = part.bones.map((name) => {
      const b = skeleton.index(name)
      const dist = segDist(p, BONES[b].head, TAILS[name])
      return [b, Math.exp(-(dist * dist) / (2 * 0.06 * 0.06))]
    })
    // the closest bone always gets a share, so no blob is left behind
    const best = pairs.reduce((m, q) => (q[1] > m[1] ? q : m))
    best[1] = Math.max(best[1], 1e-3)
    setWeights(skin, i, pairs)
  }
  return { blobs, skin, skeleton }
}

/**
 * Poses the fox at `t` seconds into a trot: diagonal legs together, the body
 * bobbing twice per stride, the tail swaying and the head nodding against it.
 */
export function poseWalk(sk: Skeleton, t: number, speed = 1) {
  const ph = t * Math.PI * 2 * 1.4 * speed
  const X: Vec3 = [1, 0, 0]
  const leg = (name: string, off: number) => {
    const s = Math.sin(ph + off)
    sk.setRotation(sk.index(`${name}Upper`), axisAngle(X, 0.45 * s))
    // the knee folds while the foot swings forward, and stays straight while it carries weight
    const lift = Math.max(0, Math.cos(ph + off))
    sk.setRotation(sk.index(`${name}Lower`), axisAngle(X, (name[0] === 'f' ? -1 : 1) * 0.7 * lift))
  }
  leg('fl', 0)
  leg('br', 0)
  leg('fr', Math.PI)
  leg('bl', Math.PI)
  const bob = Math.sin(ph * 2)
  sk.offset.set([0, 0.025 * bob, 0], 0)
  sk.setRotation(0, axisAngle([0, 0, 1], 0.03 * Math.sin(ph)))
  sk.setRotation(sk.index('chest'), axisAngle([0, 0, 1], -0.05 * Math.sin(ph)))
  sk.setRotation(sk.index('neck'), axisAngle(X, 0.06 * bob))
  sk.setRotation(sk.index('head'), axisAngle(X, -0.08 * bob))
  sk.setRotation(sk.index('tail1'), mulQ(axisAngle([0, 1, 0], 0.35 * Math.sin(ph)), axisAngle(X, 0.15)))
  sk.setRotation(sk.index('tail2'), axisAngle([0, 1, 0], 0.4 * Math.sin(ph - 0.8)))
  sk.update()
}

/**
 * The fox standing: breathing, the tail swishing, the head looking round now
 * and then. Loops every four seconds.
 */
export function poseIdle(sk: Skeleton, t: number) {
  sk.reset()
  const X: Vec3 = [1, 0, 0], Y: Vec3 = [0, 1, 0]
  const breath = Math.sin(t * Math.PI)
  const look = Math.sin((t * Math.PI) / 2)
  sk.offset.set([0, 0.008 * breath, 0], 0)
  sk.setRotation(sk.index('chest'), axisAngle(X, -0.02 * breath))
  sk.setRotation(sk.index('neck'), axisAngle(Y, 0.25 * look))
  sk.setRotation(sk.index('head'), mulQ(axisAngle(Y, 0.2 * look), axisAngle([0, 0, 1], 0.1 * Math.sin((t * Math.PI) / 2 + 1))))
  sk.setRotation(sk.index('tail1'), mulQ(axisAngle(Y, 0.3 * Math.sin(t * Math.PI * 1.5)), axisAngle(X, 0.1)))
  sk.setRotation(sk.index('tail2'), axisAngle(Y, 0.35 * Math.sin(t * Math.PI * 1.5 - 0.9)))
  sk.update()
}

function segDist(p: ArrayLike<number>, a: Vec3, b: Vec3) {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const ap: Vec3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]
  const t = Math.max(0, Math.min(1, dot(ap, ab) / (dot(ab, ab) || 1)))
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t)
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
