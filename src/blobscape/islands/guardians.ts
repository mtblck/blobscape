import type { Vec3 } from '../../splat-core/blobs.ts'
import { mix } from '../../splat-engine/body.ts'
import { Skeleton, axisAngle, mulQ, type Bone } from '../../splat-engine/rig.ts'
import { buildSculpt, flatten, smooth, type SculptPart, type SculptSpec, type Sculpted } from '../../splat-engine/sculpt.ts'
import { cone, displace, ellipsoid, union } from '../../splat-engine/voxel.ts'
import { chance, hashOf } from './materials.ts'
import { ROOM as THING_ROOM } from './things.ts'
import { SCALE, passes, type IslandGround } from './walk.ts'
import type { WorldPlan } from './world.ts'

/**
 * One great creature an island, its guardian, wandering a wide loop across it (issue #400; Matt, 2026-11-21): a
 * many-tailed fox with white markings along its sides on a meadow, a tall spirit deer with branching antlers in a
 * pinewood, and on a mesa a cactus that stands like any other until it opens one great eye, rises on six legs and
 * walks. Each is sculpted the way the elf and the creatures are (sculpt.ts), so it is drawn in fine cubes or pixels
 * like the rest, in meters, facing +z. It walks under leaves and branches but round trunks, rocks and everything the
 * elf can't pass, and where it is comes from the time alone.
 */

export type GuardianKind = 'fox' | 'deer' | 'cactus'
/** Each biome's guardian. */
export const GUARDIANS: Record<string, GuardianKind> = { meadow: 'fox', pinewood: 'deer', mesa: 'cactus' }
/** The cell guardians are cut on, meters: their own cubes, finer than the island's, so their detail shows. */
export const GUARDIAN_CELL = 0.11
/** How far round its middle each guardian needs clear ground, meters. */
export const BODY: Record<GuardianKind, number> = { fox: 1.6, deer: 1.5, cactus: 1.7 }
/** How fast each walks, meters a second, and how long it rests at each stop, seconds. */
const PACE: Record<GuardianKind, number> = { fox: 1.8, deer: 1.2, cactus: 0.9 }
const REST: Record<GuardianKind, number> = { fox: 4, deer: 6, cactus: 12 }
/** How far from its home a guardian wanders, meters, and how many stops its loop has. */
const ROAM = 26, STOPS = 6
/** Steps along a leg its ground is checked at, meters. */
const CHECK = 0.5
/** Seconds a cactus takes to rise onto its legs, or settle back down. */
const RISE = 1.6
/** How high the cactus's trunk stands over the ground on its legs, meters. */
const LIFT = 1.5

const TAU = Math.PI * 2
const X: Vec3 = [1, 0, 0], Y: Vec3 = [0, 1, 0], Z: Vec3 = [0, 0, 1]
const hex = (h: string): Vec3 => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255) as Vec3
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scaled = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const smoothstep = (v: number) => { const u = Math.max(0, Math.min(1, v)); return u * u * (3 - 2 * u) }

// --- The fox

const FOX_TAILS = 7

/** The fox: about four meters to the top of its head, a coat of warm gold with white markings that sweep along its sides, and seven tails fanned out behind. */
function foxSpec(): SculptSpec {
  const gold = hex('#d98a3d'), deep = hex('#a85a26'), cream = hex('#f6ead2'), white = hex('#fbf8f0'), dark = hex('#3a2a24')
  const bones: Bone[] = [
    { name: 'hips', parent: -1, head: [0, 2.6, -1.2], tail: [0, 2.7, 1.1] },
    { name: 'chest', parent: 0, head: [0, 2.7, 1.1], tail: [0, 3.1, 1.9] },
    { name: 'neck', parent: 1, head: [0, 3.05, 1.8], tail: [0, 3.85, 2.55] },
    { name: 'head', parent: 2, head: [0, 3.85, 2.55], tail: [0, 3.7, 3.9] },
  ]
  // the white markings: flame-like sweeps along the flank, in from the shoulder and back over the haunch, and a
  // mark between the eyes
  const marked = (p: Vec3, n: Vec3) => {
    if (Math.abs(n[0]) > 0.35 && p[1] > 2.1 && p[1] < 3.4) {
      const along = (p[2] + 1.6) / 3.4
      const wave = 2.75 + 0.32 * Math.sin(along * 7.5) - 0.25 * along
      if (Math.abs(p[1] - wave) < 0.07 + 0.05 * Math.sin(along * 15) ** 2) return true
      if (Math.abs(p[1] - (wave - 0.38)) < 0.045 && Math.sin(along * 9) > 0.1) return true
    }
    return n[2] > 0.5 && p[1] > 3.95 && p[1] < 4.25 && Math.abs(p[0]) < 0.07 && p[2] > 2.9
  }
  const coat = (p: Vec3, n: Vec3): Vec3 => {
    if (marked(p, n)) return white
    if (n[1] < -0.4) return cream
    if (n[1] < -0.05) return mix(gold, cream, (-0.05 - n[1]) / 0.35)
    return n[1] > 0.75 ? mix(gold, deep, (n[1] - 0.75) / 0.25) : gold
  }
  const parts: SculptPart[] = [
    { shape: smooth(0.5, cone([0, 2.6, -1.3], [0, 2.75, 1.0], 0.82, 0.9), ellipsoid([0, 2.72, 1.15], [0.92, 1.1, 0.95]), ellipsoid([0, 2.65, -1.15], [0.85, 0.92, 0.95])), color: coat, bones: ['hips', 'chest'] },
    // the neck under a white ruff
    { shape: smooth(0.3, cone([0, 2.95, 1.7], [0, 3.8, 2.5], 0.72, 0.5), ellipsoid([0, 2.95, 1.95], [0.78, 0.95, 0.7])), color: (p, n) => (n[2] > 0.25 && p[1] < 3.6 ? white : coat(p, n)), bones: ['chest', 'neck', 'head'] },
    // the head: a rounded skull and a long muzzle, pale beneath
    {
      shape: smooth(0.2, ellipsoid([0, 3.95, 2.7], [0.55, 0.5, 0.6]), cone([0, 3.85, 3.0], [0, 3.62, 3.95], 0.34, 0.1)),
      color: (p, n) => (n[1] < -0.1 || (p[2] > 3.35 && n[1] < 0.3) ? cream : coat(p, n)), bones: ['head'],
    },
    { shape: ellipsoid([0, 3.66, 3.98], [0.11, 0.09, 0.09]), color: dark, bones: ['head'] },
  ]
  for (const x of [1, -1]) {
    const at = (p: Vec3): Vec3 => [p[0] * x, p[1], p[2]]
    const eye = at([0.3, 4.03, 3.05])
    parts.push(
      // tall ears, dark at the tips, pale within
      { shape: flatten(cone(at([0.3, 4.25, 2.55]), at([0.55, 5.25, 2.5]), 0.36, 0.05), 0.45, 2.55), color: (p, n) => (p[1] > 4.95 ? dark : n[2] > 0.3 ? cream : coat(p, n)), bones: ['head'] },
      { shape: ellipsoid(at([0.42, 3.8, 2.7]), [0.25, 0.25, 0.32]), color: white, bones: ['head'] },
      // amber eyes, a little glow of their own, a dark slit
      { shape: flatten(ellipsoid(eye, [0.1, 0.075, 0.1]), 0.7, eye[2]), color: (p) => (Math.abs(p[0] - eye[0]) < 0.025 ? dark : hex('#f6c23e')), bones: ['head'], group: 'eyes', glow: true },
    )
  }
  // legs: shoulder or thigh on the body, then a long lower leg to a dark paw
  for (const [leg, side, front] of [['fl', 1, true], ['fr', -1, true], ['bl', 1, false], ['br', -1, false]] as const) {
    const x = side * (front ? 0.55 : 0.6), z = front ? 1.35 : -1.35
    const hip: Vec3 = [x, 2.3, z], knee: Vec3 = [x, 1.15, z + (front ? 0.05 : -0.35)], foot: Vec3 = [x, 0, z + (front ? 0.12 : -0.15)]
    bones.push({ name: `${leg}Upper`, parent: front ? 1 : 0, head: hip, tail: knee }, { name: `${leg}Lower`, parent: bones.length, head: knee, tail: foot })
    parts.push(
      { shape: smooth(0.2, ellipsoid([x * 1.05, 2.3, z], [0.4, 0.6, 0.5]), cone(hip, knee, 0.33, 0.22), cone(knee, add(foot, [0, 0.15, 0]), 0.2, 0.17)), color: (p, n) => (p[1] < 0.9 ? dark : coat(p, n)), bones: [front ? 'chest' : 'hips', `${leg}Upper`, `${leg}Lower`], blend: 0.3 },
      { shape: ellipsoid(add(foot, [0, 0.14, 0.12]), [0.24, 0.16, 0.32]), color: dark, bones: [`${leg}Lower`] },
    )
  }
  // the tails: each from the base of the spine, fanned out and up, full in the middle and tipped white
  const base: Vec3 = [0, 2.85, -2.0]
  for (let k = 0; k < FOX_TAILS; k++) {
    const a = ((k / (FOX_TAILS - 1)) - 0.5) * 2.2, s = Math.sin(a), c = Math.cos(a)
    const p1 = add(base, [s * 1.0, 0.9 + 0.3 * c, -0.9 * c]), p2 = add(p1, [s * 1.1, 0.8 + 0.2 * c, -0.6 * c]), p3 = add(p2, [s * 0.9, 0.35, 0.2 * c])
    const b0 = bones.length
    bones.push({ name: `tail${k}a`, parent: 0, head: base, tail: p1 }, { name: `tail${k}b`, parent: b0, head: p1, tail: p2 }, { name: `tail${k}c`, parent: b0 + 1, head: p2, tail: p3 })
    const tip = p3
    parts.push({
      shape: smooth(0.3, cone(base, p1, 0.2, 0.5), cone(p1, p2, 0.5, 0.48), cone(p2, p3, 0.48, 0.12)),
      color: (p) => { const d = Math.hypot(p[0] - tip[0], p[1] - tip[1], p[2] - tip[2]); return d < 0.75 ? white : d < 1 ? mix(white, gold, (d - 0.75) / 0.25) : gold },
      bones: ['hips', `tail${k}a`, `tail${k}b`, `tail${k}c`], group: `tail${k % 2}`, blend: 0.45,
    })
  }
  return { bones, parts, blend: 0.4, skirt: 0.15, light: { ambient: 0.6, shadow: 0.45 } }
}

// --- The deer

/** The spirit deer: tall and slender, a dark moss coat dappled with pale glowing spots, a pale face, and antlers that branch like a tree's crown. */
function deerSpec(): SculptSpec {
  const moss = hex('#5b7a63'), deep = hex('#3d5546'), pale = hex('#e9e4d4'), bone = hex('#efe7d2'), glow = hex('#bff0d8'), dark = hex('#1b1a1f')
  const bones: Bone[] = [
    { name: 'hips', parent: -1, head: [0, 3.5, -1.1], tail: [0, 3.65, 1.0] },
    { name: 'chest', parent: 0, head: [0, 3.65, 1.0], tail: [0, 4.1, 1.5] },
    { name: 'neck', parent: 1, head: [0, 4.0, 1.5], tail: [0, 5.3, 2.1] },
    { name: 'head', parent: 2, head: [0, 5.3, 2.1], tail: [0, 5.05, 3.2] },
  ]
  // pale spots along the back and flanks, each one a soft glow
  const spot = (p: Vec3, n: Vec3) => {
    if (n[1] < 0.15 || p[1] < 3.4) return false
    const gx = Math.round(p[2] / 0.42), gy = Math.round(p[0] / 0.42 + (gx & 1) * 0.5)
    const h = Math.sin(gx * 127.1 + gy * 311.7) * 43758.5453, r = h - Math.floor(h)
    if (r < 0.45) return false
    const cx = gx * 0.42, cy = (gy - (gx & 1) * 0.5) * 0.42
    return Math.hypot(p[2] - cx, p[0] - cy) < 0.1 + 0.05 * r
  }
  const coat = (_p: Vec3, n: Vec3): Vec3 => (n[1] < -0.35 ? mix(moss, pale, 0.35) : n[1] > 0.7 ? deep : moss)
  const parts: SculptPart[] = [
    { shape: smooth(0.4, cone([0, 3.5, -1.15], [0, 3.7, 1.0], 0.72, 0.8), ellipsoid([0, 3.7, 1.0], [0.8, 0.95, 0.85]), ellipsoid([0, 3.55, -1.05], [0.72, 0.8, 0.8])), color: coat, bones: ['hips', 'chest'] },
    { shape: smooth(0.2, ellipsoid([0, 4.9, -0.5], [0.2, 0.1, 1.8]), ellipsoid([0, 4.45, 0.8], [0.25, 0.12, 0.8])), color: glow, bones: ['hips', 'chest'], group: 'spots', glow: true, opacity: 0 },
    { shape: cone([0, 3.9, 1.4], [0, 5.25, 2.05], 0.55, 0.36), color: (p, n) => (n[2] > 0.35 ? mix(moss, pale, 0.5) : coat(p, n)), bones: ['chest', 'neck', 'head'] },
    // the head: long and narrow, pale like a mask, with a dark nose
    { shape: smooth(0.15, ellipsoid([0, 5.35, 2.25], [0.4, 0.42, 0.5]), cone([0, 5.25, 2.5], [0, 4.95, 3.3], 0.3, 0.14)), color: pale, bones: ['head'] },
    { shape: ellipsoid([0, 4.98, 3.32], [0.12, 0.1, 0.1]), color: dark, bones: ['head'] },
    { shape: ellipsoid([0, 3.75, -1.95], [0.22, 0.32, 0.18]), color: pale, bones: ['hips'] },
  ]
  // the spots are painted on the body, not cut as their own part: replace the placeholder with a painted coat
  parts.splice(1, 1)
  parts[0].color = (p, n) => (spot(p, n) ? glow : coat(p, n))
  for (const x of [1, -1]) {
    const at = (p: Vec3): Vec3 => [p[0] * x, p[1], p[2]]
    const eye = at([0.3, 5.42, 2.6])
    parts.push(
      { shape: flatten(cone(at([0.3, 5.55, 2.05]), at([0.85, 5.75, 1.9]), 0.2, 0.05), 0.5, 2.0), color: (_p, n) => (n[2] > 0.3 ? pale : moss), bones: ['head'] },
      { shape: ellipsoid(eye, [0.08, 0.1, 0.1]), color: hex('#9ff3ff'), bones: ['head'], group: 'eyes', glow: true },
    )
    // antlers: a beam up and back that branches, each branch again, like a tree's limbs; pale bone, the tips glowing
    const tines: Shape[] = []
    const grow = (from: Vec3, way: Vec3, len: number, r: number, depth: number, seed: number) => {
      const to = add(from, scaled(way, len))
      tines.push(cone(from, to, r, r * 0.7))
      if (depth === 0) { tines.push(ellipsoid(to, [r * 0.9, r * 0.9, r * 0.9])); return }
      for (let b = 0; b < 2; b++) {
        const h = chance(seed, b), turn = (b ? 1 : -1) * (0.35 + 0.35 * h)
        // branches spread outward and up, turning about the way they came
        const w: Vec3 = [way[0] + turn * 0.6 * x, way[1] + 0.3 + 0.2 * h, way[2] + (b ? 0.35 : -0.45)]
        const l = Math.hypot(...w)
        grow(to, [w[0] / l, w[1] / l, w[2] / l], len * (0.72 + 0.1 * h), r * 0.7, depth - 1, hashOf(seed, 10 + b))
      }
    }
    grow(at([0.2, 5.7, 2.0]), at([0.45, 0.85, -0.2]), 0.75, 0.13, 3, hashOf(7, x > 0 ? 1 : 2))
    parts.push({ shape: union(...tines), color: (p) => (p[1] > 7.3 ? glow : bone), bones: ['head'], group: 'antlers', glow: false })
  }
  for (const [leg, side, front] of [['fl', 1, true], ['fr', -1, true], ['bl', 1, false], ['br', -1, false]] as const) {
    const x = side * 0.45, z = front ? 1.2 : -1.25
    const hip: Vec3 = [x, 3.2, z], knee: Vec3 = [x, 1.6, z + (front ? 0 : -0.35)], foot: Vec3 = [x, 0, z + (front ? 0.08 : -0.1)]
    bones.push({ name: `${leg}Upper`, parent: front ? 1 : 0, head: hip, tail: knee }, { name: `${leg}Lower`, parent: bones.length, head: knee, tail: foot })
    parts.push(
      { shape: smooth(0.15, ellipsoid([x * 1.05, 3.2, z], [0.33, 0.55, 0.45]), cone(hip, knee, 0.24, 0.13), cone(knee, add(foot, [0, 0.12, 0]), 0.12, 0.1)), color: (p, n) => (p[1] < 0.35 ? dark : p[1] < 1.4 ? mix(moss, pale, 0.45) : coat(p, n)), bones: [front ? 'chest' : 'hips', `${leg}Upper`, `${leg}Lower`], blend: 0.25 },
    )
  }
  return { bones, parts, blend: 0.35, skirt: 0.12, light: { ambient: 0.62, shadow: 0.45 } }
}
type Shape = ReturnType<typeof cone>

// --- The cactus

const CACTUS_LEGS = 6

/** The cactus: a ribbed trunk with two arms and a flower on top, one great eye in its middle, and six jointed legs folded away under it. */
function cactusSpec(): SculptSpec {
  const green = hex('#4f8a4a'), ridge = hex('#6fae5f'), groove = hex('#2f5a33'), spine = hex('#f3e7b0'), flower = hex('#e2557f'), legC = hex('#3d6b3a'), white = hex('#f4f1e6'), iris = hex('#c2412d'), dark = hex('#16120f')
  const bottom = LIFT
  const bones: Bone[] = [
    { name: 'trunk', parent: -1, head: [0, bottom, 0], tail: [0, bottom + 3, 0] },
    { name: 'top', parent: 0, head: [0, bottom + 3, 0], tail: [0, bottom + 5.2, 0] },
    { name: 'armL', parent: 0, head: [0.8, bottom + 2.2, 0], tail: [1.7, bottom + 4, 0] },
    { name: 'armR', parent: 0, head: [-0.8, bottom + 2.6, 0], tail: [-1.6, bottom + 4.3, 0] },
    { name: 'eye', parent: 0, head: [0, bottom + 2.9, 0.86], tail: [0, bottom + 2.9, 1.2] },
  ]
  // ribs round the trunk and arms: a groove between each pair, spines along the ridges
  const ribs = (ax: number, az: number) => (x: number, _y: number, z: number) => 0.07 * Math.cos(Math.atan2(z - az, x - ax) * 12)
  const skin = (center: (p: Vec3) => [number, number]) => (p: Vec3): Vec3 => {
    const [cx, cz] = center(p), c = Math.cos(Math.atan2(p[2] - cz, p[0] - cx) * 12)
    if (c > 0.85 && Math.abs(Math.sin(p[1] * 9)) < 0.18) return spine
    return c > 0.3 ? mix(green, ridge, (c - 0.3) / 0.7) : mix(groove, green, (c + 1) / 1.3)
  }
  const trunk = cone([0, bottom, 0], [0, bottom + 5, 0], 0.95, 0.85)
  const parts: SculptPart[] = [
    { shape: displace(union(trunk, ellipsoid([0, bottom + 5, 0], [0.85, 0.55, 0.85])), ribs(0, 0), 0.08), color: skin(() => [0, 0]), bones: ['trunk', 'top'] },
    // the arms bend up from the trunk
    { shape: displace(smooth(0.2, cone([0.6, bottom + 2.2, 0], [1.6, bottom + 2.5, 0], 0.45, 0.45), cone([1.6, bottom + 2.5, 0], [1.7, bottom + 4.1, 0], 0.45, 0.4), ellipsoid([1.7, bottom + 4.1, 0], [0.4, 0.3, 0.4])), ribs(1.65, 0), 0.08), color: skin((p) => [p[1] > bottom + 2.7 ? 1.65 : 1.1, 0]), bones: ['armL'], group: 'armL' },
    { shape: displace(smooth(0.2, cone([-0.6, bottom + 2.6, 0], [-1.45, bottom + 2.85, 0], 0.4, 0.4), cone([-1.45, bottom + 2.85, 0], [-1.6, bottom + 4.4, 0], 0.4, 0.36), ellipsoid([-1.6, bottom + 4.4, 0], [0.36, 0.28, 0.36])), ribs(-1.5, 0), 0.08), color: skin((p) => [p[1] > bottom + 3.05 ? -1.5 : -1.0, 0]), bones: ['armR'], group: 'armR' },
    // a flower on top
    { shape: smooth(0.1, ellipsoid([0, bottom + 5.55, 0], [0.45, 0.18, 0.45]), ellipsoid([0.2, bottom + 5.6, 0.1], [0.22, 0.16, 0.22])), color: (p) => (Math.hypot(p[0], p[2]) < 0.14 ? hex('#f7d34a') : flower), bones: ['top'], group: 'flower' },
    // the eye, standing a little out of the trunk: white, a red iris, a dark pupil. Closed, its bone is shrunk away and only the cactus shows
    {
      shape: flatten(ellipsoid([0, bottom + 2.9, 0.82], [0.55, 0.45, 0.4]), 0.55, 0.82),
      color: (p) => { const d = Math.hypot(p[0], p[1] - bottom - 2.9); return d < 0.12 ? dark : d < 0.27 ? iris : white },
      bones: ['eye'], group: 'eye',
    },
  ]
  // six legs round the base, folded up into the trunk while it rests: hip under the trunk's edge, knee up and out, foot on the ground
  for (let k = 0; k < CACTUS_LEGS; k++) {
    const a = ((k + 0.5) / CACTUS_LEGS) * TAU, c = Math.cos(a), s = Math.sin(a)
    const hip: Vec3 = [c * 0.65, bottom + 0.25, s * 0.65], knee: Vec3 = [c * 1.75, bottom + 0.55, s * 1.75], foot: Vec3 = [c * 2.25, 0, s * 2.25]
    bones.push({ name: `leg${k}a`, parent: 0, head: hip, tail: knee }, { name: `leg${k}b`, parent: bones.length, head: knee, tail: foot })
    parts.push({ shape: smooth(0.12, cone(hip, knee, 0.24, 0.2), cone(knee, foot, 0.2, 0.1), ellipsoid(knee, [0.24, 0.24, 0.24])), color: (p) => (p[1] < 0.3 ? groove : legC), bones: [`leg${k}a`, `leg${k}b`], group: `leg${k % 2}`, blend: 0.2 })
  }
  return { bones, parts, blend: 0.3, skirt: 0.1, light: { ambient: 0.62, shadow: 0.45 } }
}

const SPECS: Record<GuardianKind, () => SculptSpec> = { fox: foxSpec, deer: deerSpec, cactus: cactusSpec }

/** A guardian cut on `cell` (meters), standing at the origin facing +z. */
export function makeGuardian(kind: GuardianKind, cell = GUARDIAN_CELL): Sculpted {
  return buildSculpt(SPECS[kind](), cell)
}

// --- Where it walks

interface Leg { from: [number, number]; to: [number, number]; yaw0: number; yaw1: number; start: number; turn: number; go: number; rest: number }
/** A guardian on its island: what it is, its loop and where on it it starts. */
export interface Guardian { kind: GuardianKind; island: number; legs: Leg[]; period: number; offset: number }

const turnBy = (from: number, to: number) => (((to - from) % TAU) + TAU * 1.5) % TAU - Math.PI

/** Whether a body `r` across may stand at (x, z): its middle and a ring round it, so it can't straddle a trunk. */
function roomAt(g: IslandGround, x: number, z: number, r: number) {
  if (!g.standsAt(x, z)) return false
  for (let a = 0; a < 6; a++) if (!g.standsAt(x + Math.cos((a * TAU) / 6) * r, z + Math.sin((a * TAU) / 6) * r)) return false
  return true
}

/** Whether a body `r` across may go from a to b in a straight line. */
function wayClear(g: IslandGround, a: [number, number], b: [number, number], r: number) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / CHECK))
  let x0 = a[0], z0 = a[1]
  for (let k = 1; k <= n; k++) {
    const x = a[0] + ((b[0] - a[0]) * k) / n, z = a[1] + ((b[1] - a[1]) * k) / n
    if (!passes(g, x0, z0, x, z) || !roomAt(g, x, z, r)) return false
    x0 = x; z0 = z
  }
  return true
}

/**
 * Each island's guardian and the loop it walks: a home on the most open ground (measured from every thing's crown),
 * stops up to `ROAM` from it that its body fits on, each leg clear of trunks and rocks, the loop closing back home.
 * The same world gives the same guardians.
 */
export function placeGuardians(world: WorldPlan, islands: readonly IslandGround[]): Guardian[] {
  const out: Guardian[] = []
  world.islands.forEach((isl, j) => {
    const kind = GUARDIANS[isl.biome] ?? 'fox', g = islands[j], seed = hashOf(isl.seed, 9100), body = BODY[kind]
    const mid = [isl.at[0] * SCALE, isl.at[2] * SCALE], reach = Math.max(isl.plan.land.half[0], isl.plan.land.half[1]) * SCALE
    const discs = isl.plan.things.map((t) => ({ x: (t.at[0] + isl.at[0]) * SCALE, z: (t.at[2] + isl.at[2]) * SCALE, r: 2.5 * THING_ROOM[t.kind] * t.size * SCALE }))
    let home: { x: number; z: number; open: number } | undefined
    for (let t = 0; t < 200; t++) {
      const x = mid[0] + (chance(seed, t * 2) * 2 - 1) * reach, z = mid[1] + (chance(seed, t * 2 + 1) * 2 - 1) * reach
      const edge = g.insideAt(x, z) - 4
      if (edge < body * 2 || !roomAt(g, x, z, body)) continue
      let open = edge
      for (const d of discs) open = Math.min(open, Math.hypot(d.x - x, d.z - z) - d.r)
      if (!home || open > home.open) home = { x, z, open }
    }
    if (!home) return
    const stops: [number, number][] = [[home.x, home.z]]
    for (let s = 1; s < STOPS; s++) {
      for (let t = 0; t < 40; t++) {
        const r = ROAM * Math.sqrt(0.25 + 0.75 * chance(seed, 500 + s * 61 + t)), a = TAU * chance(seed, 501 + s * 61 + t)
        const p: [number, number] = [home.x + Math.sin(a) * r, home.z + Math.cos(a) * r], prev = stops[stops.length - 1]
        if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) < ROAM / 3 || g.insideAt(p[0], p[1]) < body * 2) continue
        if (!roomAt(g, p[0], p[1], body) || !wayClear(g, prev, p, body)) continue
        stops.push(p)
        break
      }
    }
    while (stops.length > 1 && !wayClear(g, stops[stops.length - 1], stops[0], body)) stops.pop()
    const legs: Leg[] = []
    let yaw = chance(seed, 900) * TAU, time = 0
    for (let i = 0; i < stops.length; i++) {
      const from = stops[i], to = stops[(i + 1) % stops.length]
      const dist = Math.hypot(to[0] - from[0], to[1] - from[1])
      const yaw1 = dist > 1e-6 ? yaw + turnBy(yaw, Math.atan2(to[0] - from[0], to[1] - from[1])) : yaw
      const turn = Math.abs(yaw1 - yaw) / 0.9 + (kind === 'cactus' ? RISE : 0), go = dist / PACE[kind], rest = REST[kind] * (0.7 + 0.6 * chance(seed, 950 + i))
      legs.push({ from, to, yaw0: yaw, yaw1, start: time, turn, go, rest })
      time += turn + go + rest
      yaw = yaw1
    }
    out.push({ kind, island: j, legs, period: Math.max(1, time), offset: chance(seed, 990) * time })
  })
  return out
}

/** Where a guardian is at a time: meters, facing (radians, 0 is +z), how far it has walked, and how awake it is (0 resting, 1 on the move). */
export function guardianAt(gd: Guardian, t: number) {
  const tt = (((t + gd.offset) % gd.period) + gd.period) % gd.period
  let leg = gd.legs[0]
  for (const l of gd.legs) if (l.start <= tt) leg = l
  const s = tt - leg.start
  // a cactus rises before it turns, and settles once it has stopped; the others are up at once
  const rise = gd.kind === 'cactus' ? RISE : 0.4
  const awake = Math.min(smoothstep(s / rise), smoothstep((leg.turn + leg.go + rise - s) / rise))
  const turning = Math.max(0, Math.min(1, (s - (gd.kind === 'cactus' ? RISE : 0)) / Math.max(1e-6, leg.turn - (gd.kind === 'cactus' ? RISE : 0))))
  const u = Math.max(0, Math.min(1, (s - leg.turn) / Math.max(1e-6, leg.go)))
  const yaw = leg.yaw0 + (leg.yaw1 - leg.yaw0) * smoothstep(turning)
  const dist = Math.hypot(leg.to[0] - leg.from[0], leg.to[1] - leg.from[1])
  // how far it has walked over the whole loop, so its stride never jumps
  let walked = 0
  for (const l of gd.legs) if (l.start < leg.start) walked += Math.hypot(l.to[0] - l.from[0], l.to[1] - l.from[1])
  walked += dist * u
  const stepping = s > leg.turn && s < leg.turn + leg.go ? 1 : s <= leg.turn && s > (gd.kind === 'cactus' ? RISE : 0) ? 0.5 : 0
  return { x: leg.from[0] + (leg.to[0] - leg.from[0]) * u, z: leg.from[1] + (leg.to[1] - leg.from[1]) * u, yaw, walked, awake, stepping, turnedFor: s }
}

/** How far along its stride a guardian's legs are for a distance walked: a stride is this many meters. */
const STRIDE: Record<GuardianKind, number> = { fox: 3.2, deer: 3, cactus: 1.8 }

/** Poses a guardian at a time, standing it on the ground at (x, z). */
export function poseGuardian(gd: Guardian, sk: Skeleton, t: number, ground: (x: number, z: number) => number) {
  const w = guardianAt(gd, t)
  sk.reset()
  const ph = (w.walked / STRIDE[gd.kind]) * TAU
  const turn = axisAngle(Y, w.yaw)
  if (gd.kind === 'cactus') {
    // resting it sits on the ground with its legs folded away and its eye shut; awake it stands on six legs
    const up = w.awake
    sk.offset[1] = -LIFT * (1 - up)
    for (let k = 0; k < CACTUS_LEGS; k++) {
      const a = sk.index(`leg${k}a`), b = sk.index(`leg${k}b`)
      sk.size[a] = Math.max(0.001, smoothstep(up * 1.4 - 0.2))
      // legs step in two sets of three, each lifting at the knee as it swings
      const p = ph + (k % 2) * Math.PI, lift = Math.max(0, Math.sin(p)) * w.stepping
      const ang = ((k + 0.5) / CACTUS_LEGS) * TAU, side: Vec3 = [-Math.sin(ang), 0, Math.cos(ang)]
      sk.setRotation(a, axisAngle(side, -0.35 * lift))
      sk.setRotation(b, axisAngle(side, 0.25 * lift))
      void b
    }
    // the eye opens as it wakes, and blinks every few seconds
    const blink = (t % 4.3) < 0.18 ? 0 : 1
    sk.size[sk.index('eye')] = Math.max(0.001, smoothstep(up * 1.6 - 0.4) * blink)
    // the arms sway a little as it walks
    sk.setRotation(sk.index('armL'), axisAngle(Z, 0.08 * Math.sin(ph) * w.stepping))
    sk.setRotation(sk.index('armR'), axisAngle(Z, 0.08 * Math.sin(ph + 1) * w.stepping))
    sk.setRotation(0, turn)
  } else {
    const fox = gd.kind === 'fox'
    // a walk: diagonal pairs swing together, lifting at the knee as they come forward
    for (const [leg, off] of [['fl', 0], ['br', 0], ['fr', Math.PI], ['bl', Math.PI]] as const) {
      const swing = Math.sin(ph + off) * w.stepping, lift = Math.max(0, -Math.cos(ph + off)) * w.stepping
      const front = leg[0] === 'f'
      sk.setRotation(sk.index(`${leg}Upper`), axisAngle(X, (front ? 0.3 : 0.28) * swing - (front ? 0.15 : -0.1) * lift))
      sk.setRotation(sk.index(`${leg}Lower`), axisAngle(X, front ? 0.9 * lift : -0.6 * lift))
    }
    // breathing, a bob with the stride, and the head looking about while it rests
    const bob = Math.abs(Math.sin(ph)) * 0.08 * w.stepping
    sk.offset[1] = bob + Math.sin((t * TAU) / 5) * 0.03
    const look = Math.sin((t * TAU) / 13) * 0.5 * (1 - w.stepping), nod = Math.sin((t * TAU) / 9) * 0.08
    sk.setRotation(sk.index('neck'), axisAngle(Y, look * 0.5))
    sk.setRotation(sk.index('head'), mulQ(axisAngle(Y, look * 0.5), axisAngle(X, nod)))
    if (fox) {
      // the tails sway in a slow wave, each a little behind the one beside it
      for (let k = 0; k < FOX_TAILS; k++) {
        const wave = (t * TAU) / 3.2 + k * 0.7
        for (const [part, amt] of [['a', 0.12], ['b', 0.2], ['c', 0.28]] as const) {
          sk.setRotation(sk.index(`tail${k}${part}`), mulQ(axisAngle(Y, amt * Math.sin(wave)), axisAngle(X, amt * 0.4 * Math.cos(wave))))
        }
      }
    }
    sk.setRotation(0, turn)
  }
  sk.place.set([w.x, ground(w.x, w.z), w.z])
  sk.update()
}
