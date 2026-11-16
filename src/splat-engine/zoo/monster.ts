import type { Vec3 } from '../../splat-core/blobs.ts'
import { mirror, mix, rng, spots } from '../body.ts'
import { Skeleton, posedPoint, type Bone } from '../rig.ts'
import { X, Y, Z, env, set, turn } from '../posing.ts'
import { growFur, type Fur, type FurryPart } from '../fur.ts'
import { membrane, scales, sculptToCount, smooth, type SculptSpec } from '../sculpt.ts'
import { cone, displace, ellipsoid, sphere, type Shape } from '../voxel.ts'
import type { Species } from './species.ts'

/**
 * Make me a monster: a creature drawn up from a seed. The seed picks a body
 * plan (two, four or six legs; how long, how round, how tall), a head (one to
 * three eyes, a snout, horns, ears or feelers), a tail, back spikes and a
 * coat and what its hide is (fur in strands, scales, or smooth wet skin), then
 * cuts it with sculpt.ts like the hand-made zoo. Every monster can
 * walk on the spot, stand and breathe, and roar, and the same seed always
 * makes the same monster, so a link can share one.
 *
 * Monsters face +z and stand on the floor (y = 0) at rest.
 */

export interface Plan {
  seed: number
  legs: 2 | 4 | 6
  /** Height of the hips above the floor. */
  hip: number
  /** Hips to chest. */
  length: number
  /** Body radius. */
  girth: number
  /** Chest radius over hip radius. */
  chest: number
  neck: number
  head: number
  /** How far the snout sticks out, relative to the head. */
  snout: number
  eyes: 1 | 2 | 3
  eye: number
  top: 'none' | 'horns' | 'ears' | 'feelers'
  /** Tail length, relative to the body (0 for none). */
  tail: number
  spikes: boolean
  arms: boolean
  coat: 'spots' | 'stripes' | 'plain'
  /** How it looks at you: no brows at all, level, worried (inner ends up), surprised (raised) or cross (inner ends down). */
  brow: Brow
  /** What covers it: strands of fur (fur.ts), a hide of small scales, or smooth wet skin. */
  hide: Hide
  colors: { back: Vec3; belly: Vec3; accent: Vec3; iris: Vec3 }
  name: string
}

export type Brow = 'none' | 'level' | 'worried' | 'raised' | 'cross'
export type Hide = 'fur' | 'scales' | 'smooth'

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length]
const between = (r: () => number, a: number, b: number) => a + (b - a) * r()

/** HSL (0–1 each) to linear-ish RGB in 0–1, the way the zoo writes colors. */
function hsl(h: number, s: number, l: number): Vec3 {
  const k = (n: number) => (n + h * 12) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)]
}

const START = ['gr', 'sn', 'bl', 'pl', 'fl', 'gl', 'sk', 'w', 'm', 'z', 'b', 'qu', 'tr', 'cr', 'v', 'dr']
const MIDDLE = ['o', 'u', 'a', 'i', 'oo', 'ee', 'au', 'y']
const END = ['mble', 'rk', 'zzle', 'nch', 'b', 'rp', 'ggle', 'mp', 'x', 'lch', 'rt', 'ff', 'mpus', 'ndle']

/** Names that read as rude, a slur or a politician: a monster never gets one. */
const AVOID = /boob|moob|queer|quim|grundle|trump|wank|skank|cum|tit|fag|nig|spic/

/** A made-up name; one that reads as something else is drawn again (from the same seed, so it stays the same). */
function nameOf(r: () => number) {
  for (;;) {
    const n = pick(r, START) + pick(r, MIDDLE) + pick(r, END)
    if (!AVOID.test(n)) return n
  }
}

/** The seed's plan: everything about the monster before any blob is placed. */
export function planMonster(seed: number): Plan {
  const r = rng(seed * 7919 + 13)
  r(); r()
  const legs = pick(r, [2, 4, 4, 6] as const)
  const length = legs === 2 ? between(r, 0.32, 0.48) : between(r, 0.42, 0.75)
  const girth = between(r, 0.11, 0.2) * (legs === 2 ? 1.05 : 1)
  const hip = legs === 2 ? between(r, 0.28, 0.45) : between(r, 0.2, 0.4) + girth * 0.4
  const hue = r()
  const back = hsl(hue, between(r, 0.45, 0.8), between(r, 0.38, 0.55))
  const belly = hsl((hue + between(r, -0.06, 0.06) + 1) % 1, between(r, 0.25, 0.5), between(r, 0.7, 0.85))
  const accent = hsl((hue + pick(r, [0.33, 0.5, 0.67])) % 1, between(r, 0.6, 0.9), between(r, 0.4, 0.55))
  const iris = hsl(r(), 0.85, 0.5)
  const name = nameOf(r)
  // (anything new is drawn last, below, so the seeds people have shared keep their monsters)
  return {
    seed, legs, hip, length, girth,
    chest: between(r, 0.8, 1.3),
    neck: between(r, 0.04, 0.2),
    head: between(r, 0.1, 0.17) * (legs === 2 ? 1.15 : 1),
    snout: between(r, 0, 1),
    eyes: pick(r, [1, 2, 2, 2, 3] as const),
    eye: between(r, 0.22, 0.4),
    top: pick(r, ['none', 'horns', 'horns', 'ears', 'feelers'] as const),
    tail: r() < 0.2 ? 0 : between(r, 0.5, 1.4),
    spikes: r() < 0.45,
    arms: legs === 2 && r() < 0.8,
    coat: pick(r, ['spots', 'stripes', 'plain'] as const),
    brow: pick(r, ['none', 'level', 'level', 'worried', 'raised', 'raised', 'cross'] as const),
    hide: pick(r, ['fur', 'fur', 'fur', 'scales', 'smooth'] as const),
    colors: { back, belly, accent, iris },
    name,
  }
}

const SIDES = [['l', 1], ['r', -1]] as const
const side = (x: number, p: Vec3): Vec3 => (x > 0 ? p : mirror(p))
const along = (a: Vec3, b: Vec3, t: number): Vec3 => mix(a, b, t)

/** Where each pair of legs joins the body, front to back, as a share of the way from hips (0) to chest (1). */
function legSpots(p: Plan): number[] {
  return p.legs === 6 ? [1, 0.5, 0] : p.legs === 4 ? [1, 0] : [0]
}

/** Whether the pair of legs at `u` (0 hips, 1 chest) bends at an elbow, pointing back, not at a knee. */
const elbowed = (p: Plan, u: number) => p.legs !== 2 && u > 0.5

/** How thick a leg is at the top; it thins to 0.6 of this at the ankle. */
export const legRadius = (p: Plan) => Math.max(0.025, p.girth * (p.legs === 6 ? 0.28 : 0.38))

export interface Layout { bones: Bone[]; hips: Vec3; chest: Vec3; neckTop: Vec3; headC: Vec3; legPairs: number }

/** The skeleton, from the plan: every point the parts hang on. */
export function layout(p: Plan): Layout {
  const upright = p.legs === 2
  const hips: Vec3 = [0, p.hip, upright ? -0.02 : -p.length / 2]
  const chest: Vec3 = upright ? [0, p.hip + p.length, 0.04] : [0, p.hip + p.girth * 0.25, p.length / 2]
  const neckTop: Vec3 = upright ? [0, chest[1] + p.girth * p.chest * 0.6 + p.neck, chest[2] + 0.02] : [0, chest[1] + p.girth * 0.5 + p.neck * 0.8, chest[2] + p.girth * 0.5 + p.neck * 0.6]
  const headC: Vec3 = [0, neckTop[1] + p.head * 0.6, neckTop[2] + p.head * 0.35]
  const bones: Bone[] = [
    { name: 'body', parent: -1, head: hips, tail: chest },
    { name: 'chest', parent: 0, head: chest, tail: neckTop },
    { name: 'neck', parent: 1, head: along(chest, neckTop, 0.5), tail: neckTop },
    { name: 'head', parent: 2, head: neckTop, tail: [headC[0], headC[1], headC[2] + p.head * (1 + p.snout)] },
    { name: 'jaw', parent: 3, head: [0, headC[1] - p.head * 0.35, headC[2]], tail: [0, headC[1] - p.head * 0.45, headC[2] + p.head * (0.9 + p.snout)] },
  ]
  if (p.tail > 0) {
    const tl = p.tail * p.length
    let prev = 0
    for (let k = 0; k < 3; k++) {
      const a = k / 3, b = (k + 1) / 3
      const at = (t: number): Vec3 => [0, hips[1] + (upright ? -0.3 : 0.05) * tl * t + 0.04 * Math.sin(t * 3), hips[2] - tl * t]
      bones.push({ name: `tail${k + 1}`, parent: prev, head: at(a), tail: at(b) })
      prev = bones.length - 1
    }
  }
  const spots = legSpots(p)
  spots.forEach((u, i) => {
    const base = along(hips, chest, u)
    for (const [s, x] of SIDES) {
      const top = side(x, [p.girth * 0.75 + (p.legs === 6 && i === 1 ? legRadius(p) : 0), base[1] - p.girth * 0.2, base[2]])
      const footY = 0.02
      // a knee points forward; the front legs of a four- or six-legged monster bend at an elbow, which points back
      const kneeZ = (elbowed(p, u) ? -1 : 1) * Math.max(0.03, (top[1] - footY) * (upright ? 0.1 : 0.16))
      // the middle pair of six stands wider, as an insect's does, so it steps past the pairs in front and behind
      const out = p.girth * 0.8 + (p.legs === 6 && i === 1 ? legRadius(p) * 3.2 : 0)
      const knee = side(x, [out, (top[1] + footY) / 2, base[2] + kneeZ])
      const ankle = side(x, [out, footY + 0.025, base[2] - kneeZ * 0.5])
      const toe = side(x, [out, 0.01, base[2] + 0.07 + p.girth * 0.2])
      const t = bones.length
      bones.push(
        { name: `${s}Thigh${i}`, parent: u > 0.5 ? 1 : 0, head: top },
        { name: `${s}Shin${i}`, parent: t, head: knee },
        { name: `${s}Foot${i}`, parent: t + 1, head: ankle, tail: toe },
      )
    }
  })
  if (p.arms) {
    for (const [s, x] of SIDES) {
      const shoulder = side(x, [p.girth * p.chest * 0.95, chest[1] + p.girth * 0.2, chest[2]])
      const elbow = side(x, [p.girth * p.chest * 1.15, chest[1] - p.length * 0.35, chest[2] + 0.02])
      const hand = side(x, [p.girth * p.chest * 1.15, chest[1] - p.length * 0.7, chest[2] + 0.06])
      const a = bones.length
      bones.push(
        { name: `${s}Arm`, parent: 1, head: shoulder },
        { name: `${s}Forearm`, parent: a, head: elbow, tail: hand },
      )
    }
  }
  // ears and feelers get a bone each, so they can bounce and flick (horns are stiff)
  if (p.top === 'ears' || p.top === 'feelers') {
    for (const [s, x] of SIDES) {
      const root = side(x, [p.head * 0.55, headC[1] + p.head * 0.6, headC[2] - p.head * 0.15])
      const tip = p.top === 'ears' ? side(x, [p.head * 0.95, headC[1] + p.head * 1.4, headC[2] - p.head * 0.3]) : side(x, [p.head * 0.9, headC[1] + p.head * 1.9, headC[2] + p.head * 0.4])
      bones.push({ name: `${s}Top`, parent: 3, head: root, tail: tip })
    }
  }
  return { bones, hips, chest, neckTop, headC, legPairs: spots.length }
}

const HORN: Vec3 = [0.92, 0.88, 0.76]
const MOUTH: Vec3 = [0.55, 0.1, 0.14]
const TONGUE: Vec3 = [0.86, 0.42, 0.46]

/** Toward the light a wet skin throws back (as the frog's). */
const SHINE: Vec3 = [-0.22, 0.83, 0.51]

/**
 * The monster as shapes to cut (sculpt.ts), at a grid of `s`: a hide in the
 * seed's coat (furred parts say how their fur lies, for fur.ts), a mouth with
 * teeth, a tongue and two tusks, eyes under brows, clawed feet and hands.
 */
function spec(p: Plan, s: number): SculptSpec & { parts: FurryPart[] } {
  const L = layout(p)
  const { back, belly, accent, iris } = p.colors
  const dark = mix(back, [0.04, 0.03, 0.05], 0.55)
  const fat = (r: number) => Math.max(r, s * 0.6)
  const scaly = p.hide === 'scales', furry = p.hide === 'fur'
  const A = Math.max(0.018, p.girth * 0.17)
  /** A scaly hide stands in scales, each a low bump; fur and smooth skin leave the shape as it is. */
  const hide = (shape: Shape, h = A * 0.16) => (scaly ? displace(shape, (x, y, z) => h * (1 - scales([x, y, z], A).out), h) : shape)
  const coat = (q: Vec3, n: Vec3): Vec3 => {
    if (scaly && n[1] < -0.5) {
      // the plates of a scaly belly
      const f = q[2] / (A * 1.6)
      return f - Math.floor(f) < 0.2 ? mix(belly, dark, 0.3) : belly
    }
    let base = back
    if (p.coat === 'spots' && spots(q, 30, p.seed % 7) > 0.72) base = accent
    else if (p.coat === 'stripes' && Math.sin(q[2] * (16 / p.length) + q[1] * 8) > 0.4) base = dark
    else if (p.coat === 'plain' && n[1] > 0.7) base = mix(back, dark, 0.3)
    if (scaly) {
      const t = scales(q, A)
      base = t.id > 0.72 ? mix(base, [1, 1, 1], 0.1) : t.id < 0.25 ? mix(base, dark, 0.16) : base
      if (t.out > 0.86) base = mix(base, dark, 0.25)
    } else base = mix(base, dark, 0.12 * spots(q, 19, 3))
    base = n[1] < -0.2 ? mix(base, belly, Math.min(1, (-0.2 - n[1]) / 0.3)) : base
    // smooth skin is wet: a soft highlight where it faces the light
    return p.hide === 'smooth' ? mix(base, [1, 1, 0.94], 0.45 * Math.max(0, n[0] * SHINE[0] + n[1] * SHINE[1] + n[2] * SHINE[2]) ** 14) : base
  }
  /** Fur for a part, lying along `flow`, as long as `long` of the body's. */
  const fur = (flow: Fur['flow'], long = 1, more: Partial<Fur> = {}): Pick<FurryPart, 'fur'> =>
    (furry ? { fur: { length: Math.max(0.03, p.girth * 0.27) * long, flow, lift: 0.4, wild: 0.5, ...more } } : {})
  const parts: FurryPart[] = []
  const hipR = p.girth, chestR = p.girth * p.chest
  const hc = L.headC, hr = p.head
  // body, neck and tail as one hide
  const tb = L.bones.filter((b) => b.name.startsWith('tail'))
  const trunk = [cone(L.hips, L.chest, hipR, chestR), cone(L.chest, L.neckTop, Math.min(chestR, hr) * 0.75, hr * 0.6)]
  tb.forEach((b, k) => trunk.push(cone(b.head, b.tail!, fat(hipR * 0.55 * (1 - k / 3)), fat(hipR * 0.55 * (1 - (k + 1) / 3) + 0.008))))
  // the coat lies back along the body and tail, hangs longer under the belly, and stands in a mane down the neck
  const upright = p.legs === 2
  parts.push({
    shape: hide(smooth(p.girth * 0.3, ...trunk)), color: coat, bones: ['body', 'chest', 'neck', 'head', ...tb.map((b) => b.name)],
    ...fur(upright ? (q) => [q[0] * 0.5, -1, q[2] < L.hips[2] ? -0.8 : -0.25] : [0, -0.35, -1], 1, { long: (q, n) => (n[1] < -0.3 ? 1.3 : q[2] > L.chest[2] && n[1] > 0.3 ? 1.5 : 1) }),
  })
  // a tuft at the end of the tail
  if (tb.length) parts.push({ shape: sphere(tb[tb.length - 1].tail!, fat(hipR * 0.2)), color: accent, bones: [tb[tb.length - 1].name], ...fur([0, 0.1, -1], 1.5, { lift: 0.7, wild: 0.9, density: 2 }) })
  // the head, and the jaw under it: a chin that drops when it roars
  const snouted = p.snout > 0.15
  const tip: Vec3 = [0, hc[1] - hr * 0.15, hc[2] + hr * (0.8 + p.snout * 0.9)]
  const skull = [ellipsoid(hc, [hr, hr * 0.9, hr * 1.05])]
  if (snouted) skull.push(cone([0, hc[1] - hr * 0.05, hc[2] + hr * 0.3], tip, hr * 0.6, hr * 0.38))
  const head = smooth(hr * 0.15, ...skull)
  const front = hc[2] + hr * (0.82 + p.snout * 0.85)
  const jawC: Vec3 = [0, hc[1] - hr * 0.56, (hc[2] - hr * 0.2 + front) / 2]
  const jawR: Vec3 = [hr * 0.58, hr * 0.3, (front - hc[2] + hr * 0.2) / 2 + hr * 0.1]
  const jaw = ellipsoid(jawC, jawR)
  // where the eyes sit: the face's fur keeps clear of them
  const er = hr * p.eye
  const eyeAt: Vec3[] = p.eyes === 1 ? [[0, hc[1] + hr * 0.45, hc[2] + hr * 0.7]]
    : p.eyes === 2 ? SIDES.map(([, x]) => side(x, [hr * 0.48, hc[1] + hr * 0.4, hc[2] + hr * 0.68]))
      : [[0, hc[1] + hr * 0.62, hc[2] + hr * 0.6], ...SIDES.map(([, x]) => side(x, [hr * 0.55, hc[1] + hr * 0.28, hc[2] + hr * 0.7]))]
  parts.push({
    shape: hide(head, A * 0.1), bones: ['head'],
    // short on the face, lying back from the nose
    ...fur((q) => [q[0], 0.2, -1], 0.42, { lift: 0.22, wild: 0.35, long: (q) => (eyeAt.some((e) => Math.hypot(q[0] - e[0], q[1] - e[1], q[2] - e[2]) < er * 1.7) ? 0 : q[2] > hc[2] + hr * 0.5 ? 0.6 : 1) }),
    color: (q, n) => {
      const d = jaw.sdf(q[0], q[1], q[2])
      if (d < 0) return n[1] < -0.2 ? MOUTH : coat(q, n)
      if (d < Math.max(s * 1.1, hr * 0.04) && q[1] < hc[1]) return mix(dark, [0, 0, 0], 0.4)
      if (snouted && q[2] > tip[2] + hr * 0.18 && q[1] > tip[1] + hr * 0.08 && Math.abs(Math.abs(q[0]) - hr * 0.13) < hr * 0.06) return mix(dark, [0, 0, 0], 0.5)
      return coat(q, n)
    },
  })
  parts.push({
    shape: jaw, bones: ['jaw'], group: 'jaw',
    color: (q, n) => (head.sdf(q[0], q[1], q[2]) < 0 ? (n[1] > 0.5 && Math.abs(q[0]) < hr * 0.24 ? TONGUE : MOUTH) : n[1] < -0.1 ? belly : coat(q, n)),
    // a beard under the chin, clear of the mouth
    ...fur([0, -1, -0.3], 0.6, { lift: 0.3, long: (q, n) => (head.sdf(q[0], q[1], q[2]) < hr * 0.12 || n[1] > 0 ? 0 : 1) }),
  })
  // teeth round the jaw, and two tusks from the lip above
  const TEETH = 9
  for (let k = 0; k < TEETH; k++) {
    const a = ((k / (TEETH - 1)) * 2 - 1) * 1.25
    const at: Vec3 = [jawR[0] * 0.8 * Math.sin(a), jawC[1] + jawR[1] * 0.45, jawC[2] + jawR[2] * 0.8 * Math.cos(a)]
    parts.push({ shape: cone(at, [at[0], at[1] + hr * 0.2, at[2]], fat(hr * 0.05), fat(hr * 0.012)), color: HORN, bones: ['jaw'], group: 'jaw', noShadow: true })
  }
  for (const [, x] of SIDES) {
    const at = side(x, [jawR[0] * 0.62, jawC[1] + jawR[1] * 0.75, jawC[2] + jawR[2] * 0.93])
    parts.push({ shape: cone(at, [at[0], at[1] - hr * 0.3, at[2] + hr * 0.04], fat(hr * 0.065), fat(hr * 0.015)), color: HORN, bones: ['head'], noShadow: true })
  }
  // eyes, looking ahead, each under a brow
  for (const at of eyeAt) {
    const out: Vec3 = [at[0] * 0.6 / hr, 0.15, 1]
    const ol = Math.hypot(...out)
    const o: Vec3 = [out[0] / ol, out[1] / ol, out[2] / ol]
    parts.push({
      shape: sphere(at, er), bones: ['head'], group: 'eyes', glow: true, noShadow: true,
      color: (q) => {
        const v: Vec3 = [q[0] - at[0], q[1] - at[1], q[2] - at[2]]
        const l = Math.hypot(...v) || 1
        const d = (v[0] * o[0] + v[1] * o[1] + v[2] * o[2]) / l
        if (d > 0.9 && v[1] / l > o[1] + 0.2) return [1, 1, 0.97]
        return d > 0.88 ? [0.03, 0.03, 0.04] : d > 0.62 ? iris : [0.9, 0.89, 0.84]
      },
    })
    const sx = Math.sign(at[0])
    const brow = (dx: number, dy: number): Vec3 => [at[0] + dx * er * (sx || 1), at[1] + er * dy, at[2] + er * 0.45]
    // the brow sets the mood: its inner end (toward the middle of the face) sits lower when cross, higher when worried
    if (p.brow !== 'none') {
      const lift = p.brow === 'raised' ? 0.35 : 0
      const inner = (p.brow === 'cross' ? 0.75 : p.brow === 'worried' ? 1.35 : 1.08) + lift, outer = (p.brow === 'worried' ? 0.95 : 1.08) + lift
      parts.push({ shape: cone(brow(-1.05, sx ? inner : outer), brow(1.05, outer), fat(er * 0.3), fat(er * 0.22)), color: mix(back, dark, 0.6), bones: ['head'], noShadow: true })
    }
  }
  // on top of the head
  for (const [sd, x] of SIDES) {
    const root = side(x, [hr * 0.55, hc[1] + hr * 0.6, hc[2] - hr * 0.15])
    if (p.top === 'horns') {
      const mid = side(x, [hr * 0.95, hc[1] + hr * 1.05, hc[2] - hr * 0.5]), end = side(x, [hr * 1.0, hc[1] + hr * 1.6, hc[2] - hr * 0.45])
      const len = hr * 1.3
      parts.push({
        shape: smooth(hr * 0.06, cone(root, mid, hr * 0.2, fat(hr * 0.12)), cone(mid, end, fat(hr * 0.12), fat(hr * 0.025))), bones: ['head'],
        color: (q) => {
          const u = Math.min(1, Math.hypot(q[0] - root[0], q[1] - root[1], q[2] - root[2]) / len)
          const ring = (u * 7) % 1 < 0.22
          return mix(mix(HORN, [0.35, 0.3, 0.25], u), [0.2, 0.17, 0.15], ring ? 0.35 : 0)
        },
      })
    }
    if (p.top === 'ears') {
      const up = side(x, [hr * 0.95, hc[1] + hr * 1.4, hc[2] - hr * 0.3]), rear = side(x, [hr * 0.2, hc[1] + hr * 0.95, hc[2] - hr * 0.35])
      parts.push({ shape: membrane([[root, up, rear]], fat(hr * 0.06)), color: (_q, n) => (n[2] > 0.3 ? mix(accent, belly, 0.55) : accent), bones: ['head', `${sd}Top`], blend: hr * 0.12 })
    }
    if (p.top === 'feelers') {
      const end = side(x, [hr * 0.9, hc[1] + hr * 1.9, hc[2] + hr * 0.4])
      parts.push({ shape: cone(root, end, fat(hr * 0.06), fat(hr * 0.035)), color: dark, bones: ['head', `${sd}Top`], blend: hr * 0.12, noShadow: true })
      parts.push({ shape: sphere(end, fat(hr * 0.15)), color: accent, bones: [`${sd}Top`], glow: true, noShadow: true })
    }
  }
  // spikes down the back, and smaller ones down the tail
  if (p.spikes) {
    const n = 7
    const spike = (base: Vec3, r: number, bones: string[]) => parts.push({
      shape: cone(base, [0, base[1] + r * 0.75, base[2] - r * 0.3], fat(r * 0.2), fat(r * 0.03)), bones, noShadow: true,
      color: (q) => mix(mix(accent, dark, 0.45), mix(accent, [1, 1, 1], 0.2), Math.min(1, (q[1] - base[1]) / (r * 0.6))),
    })
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n
      const c = along(L.hips, L.chest, t)
      const r = hipR + (chestR - hipR) * t
      spike([0, c[1] + r * 0.8, c[2]], r, ['body', 'chest'])
    }
    tb.forEach((b, k) => {
      const r = hipR * 0.55 * (1 - (k + 0.5) / 3)
      const c = along(b.head, b.tail!, 0.5)
      spike([0, c[1] + r * 0.7, c[2]], Math.max(r * 1.4, hipR * 0.35), [b.name])
    })
  }
  // legs with a haunch, and feet with three claws
  const claws = (toe: Vec3, r: number, dir: Vec3, bones: string[]) => {
    for (const o of [-1, 0, 1]) {
      const from: Vec3 = [toe[0] + o * r * 0.55, toe[1], toe[2]]
      parts.push({ shape: cone(from, [from[0] + o * r * 0.2 + dir[0] * r, from[1] + dir[1] * r, from[2] + dir[2] * r], fat(r * 0.24), fat(r * 0.06)), color: HORN, bones, noShadow: true })
    }
  }
  for (let i = 0; i < L.legPairs; i++) {
    for (const [sd] of SIDES) {
      const th = L.bones.find((b) => b.name === `${sd}Thigh${i}`)!, sh = L.bones.find((b) => b.name === `${sd}Shin${i}`)!, ft = L.bones.find((b) => b.name === `${sd}Foot${i}`)!
      const lr = legRadius(p)
      const body = p.legs === 2 || i === 0 ? (L.bones[th.parent].name) : 'body'
      parts.push({
        shape: hide(smooth(lr * 0.5, ellipsoid(th.head, [lr * 1.2, lr * 1.5, lr * 1.4]), cone(th.head, sh.head, lr, lr * 0.75), cone(sh.head, ft.head, lr * 0.75, lr * 0.6)), A * 0.1),
        color: coat, bones: [body, `${sd}Thigh${i}`, `${sd}Shin${i}`, `${sd}Foot${i}`],
        // down the leg, shaggier over the haunch
        ...fur([0, -1, -0.2], 0.7, { lift: 0.3, long: (q) => (q[1] > sh.head[1] ? 1.2 : 0.75) }),
      })
      const toe = ft.tail!
      const fy = Math.max(lr * 0.5, 0.02)
      parts.push({ shape: ellipsoid([toe[0], fy, (ft.head[2] + toe[2]) / 2], [lr * 0.8, fy, (toe[2] - ft.head[2]) / 2 + lr * 0.5]), color: (q, n) => mix(coat(q, n), dark, 0.4), bones: [`${sd}Shin${i}`, `${sd}Foot${i}`] })
      claws([toe[0], fy * 0.8, toe[2] + lr * 0.25], lr, [0, -0.35, 0.9], [`${sd}Foot${i}`])
    }
  }
  if (p.arms && L.bones.some((b) => b.name === 'lArm')) {
    for (const [sd] of SIDES) {
      const a = L.bones.find((b) => b.name === `${sd}Arm`)!, f = L.bones.find((b) => b.name === `${sd}Forearm`)!
      const ar = Math.max(0.02, p.girth * 0.28)
      const hand = f.tail!
      parts.push({ shape: hide(smooth(ar * 0.4, sphere(a.head, ar * 1.25), cone(a.head, f.head, ar, ar * 0.8), cone(f.head, hand, ar * 0.8, ar * 0.65), sphere(hand, ar)), A * 0.1), color: (q, n) => (q[1] < hand[1] + ar * 0.6 ? mix(coat(q, n), dark, 0.4) : coat(q, n)), bones: ['chest', `${sd}Arm`, `${sd}Forearm`], ...fur([0, -1, -0.1], 0.6, { lift: 0.3, long: (q) => (q[1] < hand[1] + ar * 0.6 ? 0.4 : 1) }) })
      claws([hand[0], hand[1] - ar * 0.5, hand[2] + ar * 0.5], ar, [0, -0.8, 0.6], [`${sd}Forearm`])
    }
  }
  return { bones: L.bones, parts, blend: Math.max(0.03, p.girth * 0.42), light: { ambient: 0.66, shadow: 0.5 } }
}

/** The share of a furry monster's blobs that are its skin; the rest are strands. */
const SKIN = 0.4

export function makeMonster(seed: number, count = 15000) {
  const p = planMonster(seed)
  const skin = sculptToCount((s) => spec(p, s), p.hide === 'fur' ? count * SKIN : count, 0.03)
  const b = p.hide === 'fur' ? growFur(skin, spec(p, skin.spacing).parts, count) : skin
  return { blobs: b.blobs, skin: b.skin, skeleton: b.skeleton }
}

/** One stride, in seconds: little monsters step quicker. */
export const strideOf = (p: Plan) => Math.max(0.55, Math.min(1.1, p.hip * 2.2))

/**
 * How a monster steps: `lag` is how far each pair of legs trails the pair in front of it, as a phase (π is a trot on
 * four legs and tripods on six, 0 is a pace, with both legs of a side swinging together), and `reach` scales the swing.
 */
export interface Gait { lag: number; reach: number }

/** Each leg's place in the gait, as a phase: left and right alternate, and each pair trails the one in front. */
function legPhase(p: Plan, g: Gait, i: number, left: boolean): number {
  return (left ? 0 : Math.PI) + (p.legs === 2 ? 0 : i * g.lag)
}

/**
 * The least room between any two legs on one side of a posed monster (under 0: one passes through the other). Each
 * leg is its three bones, as thick as it is cut.
 */
export function legRoom(p: Plan, sk: Skeleton): number {
  const lr = legRadius(p), n = legSpots(p).length
  const leg = (s: string, i: number) => {
    const th = sk.index(`${s}Thigh${i}`), sh = sk.index(`${s}Shin${i}`), ft = sk.index(`${s}Foot${i}`)
    const at = (b: number): Vec3 => [sk.posedHead[b * 3], sk.posedHead[b * 3 + 1], sk.posedHead[b * 3 + 2]]
    const a = at(th), b = at(sh), c = at(ft), d = posedPoint(sk, ft, sk.bones[ft].tail!)
    const out: [Vec3, number][] = []
    for (let k = 0; k <= 6; k++) {
      const t = k / 6
      out.push([mix(a, b, t), lr * (1 - 0.25 * t)], [mix(b, c, t), lr * (0.75 - 0.15 * t)], [mix(c, d, t), lr * 0.8])
    }
    return out
  }
  let room = Infinity
  for (const [s] of SIDES) {
    const legs = Array.from({ length: n }, (_, i) => leg(s, i))
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      for (const [q, r] of legs[i]) for (const [q2, r2] of legs[j]) room = Math.min(room, Math.hypot(q[0] - q2[0], q[1] - q2[1], q[2] - q2[2]) - r - r2)
    }
  }
  return room
}

/** The gaits a monster tries, best first: a full trot, then pairs closer in step or a shorter swing. */
const GAITS: Gait[] = [[1, 1], [0.75, 1], [1, 0.8], [0.5, 1], [0.75, 0.8], [0.5, 0.8], [0.25, 1], [0.25, 0.8], [0, 1], [0, 0.8], [0, 0.6], [0, 0.4]]
  .map(([lag, reach]) => ({ lag: lag * Math.PI, reach }))
const gaits = new Map<number, Gait>()

/**
 * The gait for this monster: the first of `GAITS` in which no leg passes through another at any point of the stride.
 * Long legs on a short body can't trot (the hind foot swings forward into the front one swinging back), so, like a
 * camel, they bring the two legs of a side into step.
 */
export function gaitOf(p: Plan): Gait {
  if (p.legs === 2) return GAITS[0]
  let g = gaits.get(p.seed)
  if (g) return g
  const sk = new Skeleton(layout(p).bones), T = strideOf(p), need = legRadius(p) * 0.4
  g = GAITS[GAITS.length - 1]
  for (const c of GAITS) {
    const walk = monsterWalk(p, c)
    let room = Infinity
    for (let k = 0; k < 32 && room > need; k++) { walk(sk, (k / 32) * T); sk.update(); room = Math.min(room, legRoom(p, sk)) }
    if (room > need) { g = c; break }
  }
  gaits.set(p.seed, g)
  return g
}

const TAU = Math.PI * 2
const tops = (p: Plan) => p.top === 'ears' || p.top === 'feelers'

/**
 * Walking on the spot. The legs swing and lift, and the rest of the body answers them: the hips roll and (on four or
 * six legs) the spine snakes from side to side, the chest turns the other way so the head stays ahead, the head nods
 * a beat behind the bounce, the tail whips in a wave that travels down it, and ears or feelers bounce after the head.
 */
export function monsterWalk(p: Plan, gait?: Gait) {
  const T = strideOf(p)
  const upright = p.legs === 2
  const g = gait ?? gaitOf(p)
  return (sk: Skeleton, t: number) => {
    sk.reset()
    const ph = (t / T) * TAU
    const pairs = legSpots(p)
    for (let i = 0; i < pairs.length; i++) {
      for (const [s] of SIDES) {
        const a = ph + legPhase(p, g, i, s === 'l')
        const lift = Math.max(0, Math.cos(a))
        if (elbowed(p, pairs[i])) {
          // a front leg: the elbow draws back and up, the forearm folds forward under it and the paw hangs back
          set(sk, `${s}Thigh${i}`, X, -0.5 * g.reach * Math.sin(a) + 0.35 * lift)
          set(sk, `${s}Shin${i}`, X, -0.9 * lift)
          set(sk, `${s}Foot${i}`, X, 0.8 * lift)
        } else {
          // a hind leg, or a leg of two: the knee comes forward and the shin folds back behind it
          set(sk, `${s}Thigh${i}`, X, -0.6 * g.reach * Math.sin(a) - 0.15 * lift)
          set(sk, `${s}Shin${i}`, X, 1.0 * lift)
          set(sk, `${s}Foot${i}`, X, -0.4 * lift)
        }
      }
    }
    const bob = Math.sin(ph * 2)
    sk.offset.set([0, p.hip * 0.07 * bob, 0], 0)
    set(sk, 'body', Z, (upright ? 0.1 : 0.05) * Math.sin(ph))
    turn(sk, 'body', Y, (upright ? 0.12 : 0.1) * Math.sin(ph + 0.4))
    turn(sk, 'body', X, 0.04 * bob)
    set(sk, 'chest', Z, -0.07 * Math.sin(ph))
    turn(sk, 'chest', Y, -0.16 * Math.sin(ph + 0.4))
    set(sk, 'neck', X, 0.1 * Math.sin(ph * 2 - 0.6))
    set(sk, 'head', X, -0.13 * Math.sin(ph * 2 - 1.1))
    turn(sk, 'head', Z, 0.07 * Math.sin(ph - 0.5))
    set(sk, 'jaw', X, 0.05 + 0.05 * Math.max(0, Math.sin(ph * 2 - 1.6)))
    if (p.arms) for (const [s, x] of SIDES) { set(sk, `${s}Arm`, X, 0.7 * Math.sin(ph) * x); turn(sk, `${s}Arm`, Z, -0.12 * x); set(sk, `${s}Forearm`, X, -0.55 - 0.3 * Math.cos(ph + (x > 0 ? 0 : Math.PI))) }
    if (p.tail > 0) for (let k = 1; k <= 3; k++) { set(sk, `tail${k}`, Y, (0.22 + 0.1 * k) * Math.sin(ph - k * 0.9)); turn(sk, `tail${k}`, X, 0.1 * Math.sin(ph * 2 - k * 0.8)) }
    if (tops(p)) for (const [s, x] of SIDES) set(sk, `${s}Top`, X, -0.1 + 0.22 * Math.sin(ph * 2 - 1.9 - (x > 0 ? 0 : 0.5)))
    sk.update()
  }
}

const IDLE = 4

/**
 * Standing: it breathes (the chest swells), shifts its weight from side to side, looks round with a tilt of the
 * head, swishes its tail and now and then flicks an ear or a feeler. Loops every four seconds.
 */
export function monsterIdle(p: Plan) {
  return (sk: Skeleton, t: number) => {
    sk.reset()
    const u = (t % IDLE) / IDLE
    const breath = Math.sin(u * TAU * 2)
    const shift = Math.sin(u * TAU)
    const look = env(u, 0.12, 0.26, 0.4, 0.5) - env(u, 0.55, 0.68, 0.8, 0.93)
    sk.offset.set([p.girth * 0.12 * shift, p.hip * 0.025 * breath, 0], 0)
    set(sk, 'body', Z, -0.05 * shift)
    set(sk, 'chest', X, -0.04 * breath)
    turn(sk, 'chest', Z, 0.04 * shift)
    sk.size[sk.index('chest')] = 1 + 0.025 * breath
    set(sk, 'neck', X, 0.05 * Math.sin(u * TAU + 1))
    turn(sk, 'neck', Y, 0.2 * look)
    set(sk, 'head', Y, 0.4 * look)
    turn(sk, 'head', Z, 0.16 * look)
    turn(sk, 'head', X, 0.05 * Math.sin(u * TAU * 2 + 0.5))
    set(sk, 'jaw', X, 0.04 + 0.04 * breath)
    if (p.arms) for (const [s, x] of SIDES) { set(sk, `${s}Arm`, Z, -0.06 * x * (1 + breath)); set(sk, `${s}Forearm`, X, -0.35 - 0.1 * breath) }
    if (p.tail > 0) for (let k = 1; k <= 3; k++) { set(sk, `tail${k}`, Y, (0.2 + 0.08 * k) * Math.sin(u * TAU - k * 0.8)); turn(sk, `tail${k}`, X, 0.08 * Math.sin(u * TAU * 2 - k)) }
    if (tops(p)) {
      set(sk, 'lTop', X, -0.5 * env(u, 0.3, 0.33, 0.35, 0.42) + 0.04 * breath)
      set(sk, 'rTop', X, -0.5 * env(u, 0.72, 0.75, 0.77, 0.84) + 0.04 * breath)
    }
    sk.update()
  }
}

const ROAR = 2

/** It rears back, then throws its head forward with the jaw wide open, shaking with it, and settles. */
export function monsterRoar(p: Plan) {
  return (sk: Skeleton, t: number) => {
    const u = (t % ROAR) / ROAR
    monsterIdle(p)(sk, u * IDLE)
    const rear = env(u, 0.1, 0.3, 0.32, 0.42)
    const roar = env(u, 0.32, 0.42, 0.7, 0.85)
    // a shake that fits a whole number of times into the clip, and is nothing at either end
    const shake = Math.sin(u * TAU * 16) * roar
    turn(sk, 'body', X, -0.1 * rear + 0.12 * roar)
    set(sk, 'chest', X, -0.3 * rear + 0.15 * roar)
    sk.size[sk.index('chest')] = 1 + 0.06 * rear - 0.03 * roar
    set(sk, 'neck', X, -0.35 * rear + 0.2 * roar)
    turn(sk, 'head', X, -0.45 * roar)
    turn(sk, 'head', Z, 0.05 * shake)
    set(sk, 'jaw', X, 0.05 + 0.8 * roar + 0.04 * shake)
    if (p.arms) for (const [s, x] of SIDES) { set(sk, `${s}Arm`, Z, -1.0 * roar * x); set(sk, `${s}Forearm`, X, -0.3 - 0.9 * roar) }
    if (p.tail > 0) for (let k = 1; k <= 3; k++) { turn(sk, `tail${k}`, X, -0.3 * roar); turn(sk, `tail${k}`, Y, 0.06 * shake) }
    if (tops(p)) for (const [s] of SIDES) set(sk, `${s}Top`, X, -0.6 * roar + 0.1 * shake)
    sk.offset.set([0.006 * shake, p.hip * 0.08 * rear - p.hip * 0.04 * roar, 0], 0)
    sk.update()
  }
}

const NUMBERS = ['', 'one', 'two', 'three', 'four', 'five', 'six']

/** The seed as a creature for the Creature page and its sprite sheets. */
export function monsterSpecies(seed: number): Species {
  const p = planMonster(seed)
  const height = layout(p).headC[1] + p.head
  const reach = Math.max(height, p.length * (1 + p.tail * 0.6) + p.head * 2)
  const bits = [
    p.hide === 'fur' ? 'furry' : p.hide === 'scales' ? 'scaly' : 'smooth-skinned',
    `${NUMBERS[p.legs]}-legged`,
    p.eyes === 2 ? '' : `${NUMBERS[p.eyes]}-eyed`,
  ].filter(Boolean).join(', ')
  const extras = [p.top === 'horns' ? 'horns' : p.top === 'ears' ? 'pointed ears' : p.top === 'feelers' ? 'glowing feelers' : '', p.spikes ? 'a spiky back' : '', p.tail > 0 ? (p.tail > 1 ? 'a long tail' : 'a tail') : ''].filter(Boolean)
  const w = extras.length ? ` with ${extras.length > 1 ? `${extras.slice(0, -1).join(', ')} and ${extras[extras.length - 1]}` : extras[0]}` : ''
  return {
    id: 'monster',
    seed,
    name: p.name,
    blurb: `A ${bits} ${p.name}${w}, made up from seed ${seed}. Every seed makes a different monster.`,
    detail: [5000, 15000, 40000, 80000],
    start: 15000,
    looks: [{ id: 'own', label: 'Its own colors' }],
    make: (count) => makeMonster(seed, count),
    moves: [
      { name: 'walk', label: 'Walk', doing: 'walking on the spot', seconds: strideOf(p), fps: 24, pose: monsterWalk(p) },
      { name: 'idle', label: 'Stand', doing: 'standing and breathing', seconds: IDLE, fps: 12, pose: monsterIdle(p) },
      { name: 'roar', label: 'Roar', doing: 'roaring', seconds: ROAR, fps: 24, pose: monsterRoar(p) },
    ],
    view: { target: [0, height * 0.5, 0], distance: Math.max(1.4, reach * 2.6), azimuth: 35, elevation: 12 },
  }
}

/** Seeds run from 1 to this; the button picks one and a link may name any. */
export const MAX_SEED = 99999

/** A fresh seed for the button. */
export const newSeed = () => 1 + Math.floor(Math.random() * MAX_SEED)
