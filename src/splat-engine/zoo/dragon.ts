import type { Vec3 } from '../../splat-core/blobs.ts'
import { boneTail, buildBody, mirror, mix, segDist, type BodySpec, type Part } from '../body.ts'
import { joinBuilt, membrane, scales, sculptToCount, smooth, type SculptPart, type SculptSpec } from '../sculpt.ts'
import { cone, displace, ellipsoid, sphere, type Shape } from '../voxel.ts'
import { Skeleton, type Bone } from '../rig.ts'
import { X, Y, Z, aim, dir, env, ramp, set, turn } from '../posing.ts'
import type { Species } from './species.ts'

/**
 * A dragon, standing, facing +z, about eight units nose to tail: 43 bones.
 * Its body is cut the way the pixel scenes are (sculpt.ts): every scale, tooth
 * and horn ring is a shape or a pattern on one, lit and shadowed once, and
 * weighted to the bones so the neck and tail still curve. Its wings are skin
 * stretched between an arm and three finger bones, so the membrane follows
 * the fingers as they spread and fold.
 *
 * Its fire is bones too: a chain of six from inside the mouth. In the rest
 * pose the flame is built FLAME times smaller than life, hidden in the mouth,
 * so a file opened elsewhere shows a dragon with its mouth shut; breathing
 * fire grows the first fire bone by FLAME (a scale key, which glTF has) and
 * the chain unrolls and flickers. Nothing about it is a particle system.
 */

const SIDES = [['l', 1], ['r', -1]] as const
const sided = (x: number, p: Vec3): Vec3 => (x > 0 ? p : mirror(p))

/** How much smaller than life the flame is at rest. */
export const FLAME = 40
const MOUTH: Vec3 = [0, 2.84, 2.55]
const AIM = dir([0, -0.1, 1])
const REACH = 3.6
const at = (d: number): Vec3 => [MOUTH[0] + AIM[0] * d, MOUTH[1] + AIM[1] * d, MOUTH[2] + AIM[2] * d]
const FIRE = 6

const SPINE: Bone[] = [
  { name: 'hips', parent: -1, head: [0, 1.55, -0.7] },
  { name: 'spine', parent: 0, head: [0, 1.65, 0.1] },
  { name: 'chest', parent: 1, head: [0, 1.75, 0.8] },
  { name: 'neck1', parent: 2, head: [0, 1.95, 1.25] },
  { name: 'neck2', parent: 3, head: [0, 2.3, 1.6] },
  { name: 'neck3', parent: 4, head: [0, 2.65, 1.85] },
  { name: 'head', parent: 5, head: [0, 2.95, 2.0], tail: [0, 2.88, 2.8] },
  { name: 'jaw', parent: 6, head: [0, 2.8, 2.08], tail: [0, 2.7, 2.72] },
  { name: 'tail1', parent: 0, head: [0, 1.5, -1.3] },
  { name: 'tail2', parent: 8, head: [0, 1.35, -2.0] },
  { name: 'tail3', parent: 9, head: [0, 1.15, -2.7] },
  { name: 'tail4', parent: 10, head: [0, 0.95, -3.35] },
  { name: 'tail5', parent: 11, head: [0, 0.8, -3.95], tail: [0, 0.72, -4.6] },
]

const WING = { shoulder: [0.32, 2.02, 0.65], elbow: [1.35, 2.9, 0.4], wrist: [2.65, 2.7, 0.12], tips: [[4.5, 3.6, -0.6], [4.3, 2.05, -1.55], [2.95, 1.4, -2.05]], flank: [0.35, 1.8, -0.9] } as const

function bones(): Bone[] {
  const out = [...SPINE]
  const idx = (n: string) => out.findIndex((b) => b.name === n)
  for (const [s, x] of SIDES) {
    out.push(
      { name: `${s}Arm`, parent: idx('chest'), head: sided(x, [0.38, 1.55, 0.85]) },
      { name: `${s}Forearm`, parent: out.length, head: sided(x, [0.45, 0.9, 1.05]) },
      { name: `${s}Hand`, parent: out.length + 1, head: sided(x, [0.45, 0.22, 0.95]), tail: sided(x, [0.47, 0.04, 1.32]) },
    )
  }
  for (const [s, x] of SIDES) {
    out.push(
      { name: `${s}Thigh`, parent: 0, head: sided(x, [0.42, 1.45, -0.7]) },
      { name: `${s}Shin`, parent: out.length, head: sided(x, [0.5, 0.85, -0.3]) },
      { name: `${s}Foot`, parent: out.length + 1, head: sided(x, [0.5, 0.38, -0.8]), tail: sided(x, [0.52, 0.05, -0.45]) },
    )
  }
  for (const [s, x] of SIDES) {
    const w = out.length
    out.push(
      { name: `${s}Wing1`, parent: idx('chest'), head: sided(x, [...WING.shoulder]) },
      { name: `${s}Wing2`, parent: w, head: sided(x, [...WING.elbow]) },
      { name: `${s}Wing3`, parent: w + 1, head: sided(x, [...WING.wrist]), tail: sided(x, [...WING.tips[0]]) },
      ...WING.tips.map((tip, k): Bone => ({ name: `${s}Finger${k + 1}`, parent: w + 2, head: sided(x, [...WING.wrist]), tail: sided(x, [...tip]) })),
    )
  }
  for (let k = 0; k < FIRE; k++) {
    out.push({ name: `fire${k + 1}`, parent: k ? out.length - 1 : idx('head'), head: at((k / FIRE) * REACH), ...(k === FIRE - 1 ? { tail: at(REACH) } : {}) })
  }
  return out
}

interface Palette { label: string; body: Vec3; dark: Vec3; belly: Vec3; frost: Vec3; membrane: Vec3; claw: Vec3; gum: Vec3; eye: Vec3 }

/** The dragon's looks. The fire is the same in every one; `frost` is the pale trim: spikes, horns, frills and the flecks in the hide. */
const LOOKS: Record<string, Palette> = {
  ice: { label: 'Ice', body: [0.46, 0.68, 0.88], dark: [0.2, 0.34, 0.58], belly: [0.86, 0.93, 0.99], frost: [0.93, 0.98, 1], membrane: [0.52, 0.74, 0.94], claw: [0.16, 0.2, 0.28], gum: [0.45, 0.12, 0.2], eye: [0.55, 0.97, 1] },
  ember: { label: 'Ember', body: [0.62, 0.12, 0.08], dark: [0.16, 0.06, 0.06], belly: [0.98, 0.72, 0.32], frost: [1, 0.84, 0.42], membrane: [0.86, 0.3, 0.12], claw: [0.08, 0.06, 0.06], gum: [0.3, 0.05, 0.06], eye: [1, 0.78, 0.2] },
  jade: { label: 'Jade', body: [0.2, 0.55, 0.38], dark: [0.07, 0.24, 0.2], belly: [0.93, 0.86, 0.58], frost: [0.95, 0.8, 0.4], membrane: [0.46, 0.76, 0.5], claw: [0.14, 0.12, 0.08], gum: [0.42, 0.12, 0.16], eye: [0.98, 0.9, 0.3] },
}

/** The ridge along the top, neck to tail, where the spikes grow. */
const RIDGE: Vec3[] = [[0, 3.2, 1.9], [0, 2.6, 1.62], [0, 2.18, 1.25], [0, 2.3, 0.7], [0, 2.22, -0.1], [0, 2.02, -0.85], [0, 1.82, -1.35], [0, 1.6, -2.0], [0, 1.36, -2.7], [0, 1.12, -3.35], [0, 0.92, -3.95], [0, 0.8, -4.45]]

function spec(c: Palette, s: number): SculptSpec {
  /** No thinner than the grid can catch. */
  const fat = (r: number) => Math.max(r, s * 0.6)
  const SCALE = 0.13
  const hide = (p: Vec3, n: Vec3): Vec3 => {
    const sc = scales(p, SCALE)
    // plates across the belly, with a dark seam between each
    if (n[1] < -0.5 && Math.abs(p[0]) < 0.42) {
      const f = p[2] / 0.17 - Math.floor(p[2] / 0.17)
      return f < 0.16 ? mix(c.belly, c.dark, 0.5) : mix(c.belly, c.body, 0.1 + 0.12 * sc.id)
    }
    // darker along the back, in bands that run down the flanks
    const band = 0.5 + 0.5 * Math.sin(p[2] * 5.2 + Math.abs(p[0]) * 2.4)
    let base = mix(c.body, c.dark, Math.max(0, Math.min(0.7, n[1] * 0.3 + band * band * 0.4 * Math.max(0, n[1] + 0.35))))
    if (sc.id > 0.86) base = mix(base, c.frost, 0.6)
    else if (sc.id < 0.22) base = mix(base, c.dark, 0.3)
    else if (sc.id > 0.6) base = mix(base, c.belly, 0.12)
    return sc.out > 0.8 ? mix(base, c.dark, 0.55) : base
  }
  /** Each scale stands a little proud of the seams round it, so the sun picks them out. */
  const scaly = (shape: Shape, h = 0.022) => displace(shape, (x, y, z) => h * (1 - scales([x, y, z], SCALE).out), h)
  /** Horn and spike: pale, ringed darker toward the root. */
  const horn = (root: Vec3) => (p: Vec3): Vec3 => {
    const d = Math.hypot(p[0] - root[0], p[1] - root[1], p[2] - root[2])
    return Math.sin(d * 48) > 0.55 ? mix(c.frost, c.dark, 0.4) : mix(c.frost, c.body, Math.max(0, 0.35 - d))
  }
  const spine = ['hips', 'spine', 'chest', 'neck1', 'neck2', 'neck3', 'head', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5']
  const tail: [Vec3, number][] = [[[0, 1.52, -1.0], 0.42], [[0, 1.35, -2.0], 0.31], [[0, 1.15, -2.7], 0.23], [[0, 0.95, -3.35], 0.16], [[0, 0.8, -3.95], 0.1], [[0, 0.72, -4.55], 0.05]]
  const parts: SculptPart[] = [
    // trunk, neck and tail as one skin
    {
      shape: scaly(smooth(0.16,
        cone([0, 1.5, -0.95], [0, 1.72, 0.9], 0.52, 0.58), ellipsoid([0, 1.68, 0.9], [0.56, 0.56, 0.5]),
        cone([0, 1.88, 1.15], [0, 2.3, 1.6], 0.4, 0.28), cone([0, 2.3, 1.6], [0, 2.82, 1.92], 0.28, 0.22),
        ...tail.slice(0, -1).map((t, k) => cone(t[0], tail[k + 1][0], t[1], tail[k + 1][1])),
      )),
      color: hide, bones: spine,
    },
    // the head: skull, snout, brows, cheeks and nostrils melted together
    {
      shape: scaly(smooth(0.07,
        ellipsoid([0, 3.0, 2.05], [0.3, 0.27, 0.36]), cone([0, 2.99, 2.2], [0, 2.93, 2.78], 0.19, 0.12),
        ellipsoid([0.19, 3.17, 2.2], [0.1, 0.06, 0.17]), ellipsoid([-0.19, 3.17, 2.2], [0.1, 0.06, 0.17]),
        ellipsoid([0.25, 2.92, 2.0], [0.1, 0.13, 0.17]), ellipsoid([-0.25, 2.92, 2.0], [0.1, 0.13, 0.17]),
        sphere([0.075, 3.0, 2.76], 0.055), sphere([-0.075, 3.0, 2.76], 0.055),
      ), 0.012),
      // the roof of the mouth shows when the jaw drops
      color: (p, n) => (n[1] < -0.55 && p[2] > 2.15 ? c.gum : hide(p, n)), bones: ['head'],
    },
    { shape: scaly(cone([0, 2.79, 2.12], [0, 2.73, 2.74], 0.16, 0.09), 0.01), color: (p, n) => (n[1] > 0.55 ? c.gum : n[1] < -0.3 ? c.belly : hide(p, n)), bones: ['jaw'], group: 'jaw' },
    { shape: ellipsoid([0, 2.84, 2.42], [0.07, fat(0.03), 0.24]), color: mix(c.gum, [1, 0.5, 0.5], 0.35), bones: ['jaw'], group: 'jaw' },
    { shape: cone([0, 2.7, 2.62], [0, 2.56, 2.5], 0.05, fat(0.008)), color: horn([0, 2.7, 2.62]), bones: ['jaw'], group: 'jaw' },
    // a spade at the end of the tail
    { shape: membrane([[[0, 0.73, -4.4], [0.34, 0.76, -4.78], [0, 0.7, -5.2]], [[0, 0.73, -4.4], [0, 0.7, -5.2], [-0.34, 0.76, -4.78]]], fat(0.025)), color: (p) => (Math.abs(p[0]) < 0.03 ? mix(c.frost, c.dark, 0.4) : c.frost), bones: ['tail5'] },
  ]
  // spikes along the ridge, tallest over the shoulders
  for (let k = 0; k < RIDGE.length - 1; k++) {
    for (const f of [0, 0.5]) {
      const p = mix(RIDGE[k], RIDGE[k + 1], f)
      const t = (k + f) / (RIDGE.length - 1)
      const h = 0.38 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.08)) + 0.07
      const root: Vec3 = [p[0], p[1] - 0.06, p[2]]
      parts.push({ shape: cone(root, [p[0], p[1] + h, p[2] - h * 0.65], 0.075 * (h / 0.3 + 0.3), fat(0.008)), color: horn(root), bones: spine })
    }
  }
  for (const [side, x] of SIDES) {
    const at = (p: Vec3) => sided(x, p)
    const eye = at([0.255, 3.07, 2.25])
    parts.push(
      // horns, two a side, swept back, and three barbs off each cheek
      { shape: cone(at([0.14, 3.16, 1.92]), at([0.4, 3.56, 1.32]), 0.085, fat(0.008)), color: horn(at([0.14, 3.16, 1.92])), bones: ['head'] },
      { shape: cone(at([0.22, 3.04, 1.86]), at([0.54, 3.14, 1.46]), 0.055, fat(0.006)), color: horn(at([0.22, 3.04, 1.86])), bones: ['head'] },
      ...[0, 1, 2].map((k): SculptPart => ({ shape: cone(at([0.3, 2.96 - k * 0.07, 1.92]), at([0.5 - k * 0.04, 2.9 - k * 0.16, 1.62 + k * 0.05]), 0.04, fat(0.006)), color: horn(at([0.3, 2.96 - k * 0.07, 1.92])), bones: ['head'] })),
      // eyes that glow, with a slit
      { shape: ellipsoid(eye, [0.055, 0.05, 0.08]), color: (p) => (Math.abs(p[2] - eye[2]) < 0.016 ? [0.04, 0.06, 0.12] : c.eye), bones: ['head'], glow: true },
      { shape: sphere(at([0.085, 3.0, 2.805]), fat(0.022)), color: [0.05, 0.06, 0.1], bones: ['head'] },
    )
    // teeth: long ones on the upper jaw, short ones on the lower
    for (let k = 0; k < 6; k++) {
      const z = 2.28 + k * 0.085, w = 0.135 - k * 0.012
      parts.push({ shape: cone(at([w, 2.88, z]), at([w, 2.76 - (k === 4 ? 0.04 : 0), z + 0.01]), fat(0.024), fat(0.004)), color: [0.96, 0.95, 0.88], bones: ['head'] })
      if (k % 2 === 0) parts.push({ shape: cone(at([w * 0.82, 2.8, z + 0.04]), at([w * 0.82, 2.87, z + 0.04]), fat(0.02), fat(0.004)), color: [0.96, 0.95, 0.88], bones: ['jaw'], group: 'jaw' })
    }
    // legs, each one skin from shoulder to toe, with a spur at the elbow and the hock
    const fl = { top: at([0.42, 1.62, 0.85]), elbow: at([0.45, 0.9, 1.05]), wrist: at([0.45, 0.22, 0.95]), toe: at([0.47, 0.09, 1.3]) }
    const bl = { top: at([0.42, 1.52, -0.7]), knee: at([0.5, 0.85, -0.3]), hock: at([0.5, 0.38, -0.8]), toe: at([0.52, 0.07, -0.42]) }
    parts.push(
      { shape: scaly(smooth(0.08, cone(fl.top, fl.elbow, 0.26, 0.16), cone(fl.elbow, fl.wrist, 0.16, 0.11), cone(at([0.45, 0.18, 0.92]), fl.toe, 0.13, 0.1)), 0.016), color: hide, bones: ['chest', `${side}Arm`, `${side}Forearm`, `${side}Hand`] },
      { shape: scaly(smooth(0.08, cone(bl.top, bl.knee, 0.4, 0.21), cone(bl.knee, bl.hock, 0.21, 0.12), cone(bl.hock, bl.toe, 0.12, 0.1), cone(bl.toe, at([0.53, 0.07, -0.18]), 0.1, 0.085)), 0.016), color: hide, bones: ['hips', `${side}Thigh`, `${side}Shin`, `${side}Foot`] },
      { shape: cone(fl.elbow, at([0.5, 0.98, 0.72]), 0.07, fat(0.008)), color: horn(fl.elbow), bones: [`${side}Arm`, `${side}Forearm`] },
      { shape: cone(bl.hock, at([0.54, 0.62, -1.12]), 0.07, fat(0.008)), color: horn(bl.hock), bones: [`${side}Shin`, `${side}Foot`] },
    )
    for (const dx of [-0.09, 0, 0.09]) {
      parts.push(
        { shape: cone(at([0.47 + dx, 0.09, 1.3]), at([0.47 + dx * 1.5, 0.01, 1.54]), 0.055, fat(0.008)), color: c.claw, bones: [`${side}Hand`] },
        { shape: cone(at([0.53 + dx, 0.07, -0.2]), at([0.53 + dx * 1.5, 0.01, 0.03]), 0.05, fat(0.008)), color: c.claw, bones: [`${side}Foot`] },
      )
    }
    // the wing: an arm and three fingers you can see, a claw at the wrist, and the membrane between them
    const S = at([...WING.shoulder]), E = at([...WING.elbow]), W = at([...WING.wrist])
    const [T1, T2, T3] = WING.tips.map((t) => at([...t]))
    const B = at([...WING.flank])
    const wing = `${side}Wing`
    const wingBones = ['chest', 'hips', `${side}Wing1`, `${side}Wing2`, `${side}Wing3`, `${side}Finger1`, `${side}Finger2`, `${side}Finger3`]
    // the trailing edge dips between the fingers
    const dip = (a: Vec3, b: Vec3): Vec3 => mix(mix(a, b, 0.5), W, 0.16)
    parts.push(
      { shape: scaly(smooth(0.05, cone(S, E, 0.12, 0.08), cone(E, W, 0.08, 0.055)), 0.01), color: hide, bones: ['chest', `${side}Wing1`, `${side}Wing2`, `${side}Wing3`], group: wing, noShadow: true },
      ...[T1, T2, T3].map((T, k): SculptPart => ({ shape: cone(W, T, 0.05, fat(0.016)), color: c.dark, bones: [`${side}Wing3`, `${side}Finger${k + 1}`], group: wing, noShadow: true })),
      { shape: sphere(W, 0.085), color: c.frost, bones: [`${side}Wing2`, `${side}Wing3`], group: wing, noShadow: true },
      { shape: cone(W, [W[0] + 0.1 * x, W[1] + 0.34, W[2] + 0.2], 0.05, fat(0.006)), color: horn(W), bones: [`${side}Wing3`], group: wing, noShadow: true },
      {
        shape: membrane([[S, E, W], [S, W, T3], [S, T3, B], [W, T1, dip(T1, T2)], [W, dip(T1, T2), T2], [W, T2, dip(T2, T3)], [W, dip(T2, T3), T3]], fat(0.018)),
        // veins fan out from the wrist; the skin pales toward the edge and is mottled
        color: (p) => {
          if ([T1, T2, T3].some((T) => segDist(p, W, T) < 0.05) || segDist(p, W, B) < 0.035) return mix(c.membrane, c.dark, 0.55)
          const far = Math.min(1, Math.hypot(p[0] - S[0], p[1] - S[1], p[2] - S[2]) / 4.2)
          const base = mix(mix(c.membrane, c.dark, 0.25), mix(c.membrane, c.belly, 0.45), far)
          const sc = scales(p, 0.21)
          return sc.id > 0.8 ? mix(base, c.frost, 0.3) : sc.id < 0.18 ? mix(base, c.dark, 0.2) : base
        },
        bones: wingBones, opacity: 0.93, blend: 0.55, group: wing, noShadow: true,
      },
    )
  }
  return { bones: bones(), parts, blend: 0.22, light: { ambient: 0.62, shadow: 0.5 } }
}

/** The flame, as body.ts makes it: a solid cone of glowing blobs, white-hot at its heart, thinning to red at its edges and end. */
function flame(): BodySpec {
  const fireBones = Array.from({ length: FIRE }, (_, k) => `fire${k + 1}`)
  /** How far a point is from the flame's axis, as a share of the flame's radius there. */
  const offAxis = (p: Vec3, u: number) => {
    const q = [p[0] - MOUTH[0], p[1] - MOUTH[1], p[2] - MOUTH[2]]
    const along = q[0] * AIM[0] + q[1] * AIM[1] + q[2] * AIM[2]
    return Math.hypot(q[0] - AIM[0] * along, q[1] - AIM[1] * along, q[2] - AIM[2] * along) / (0.06 + 0.69 * u)
  }
  const part: Part = {
    shape: { fill: [MOUTH, at(REACH)], r: [0.06, 0.75] },
    color: (p, _n, u) => {
      const heat = Math.max(0, 1 - offAxis(p, u) * 0.75 - u * 0.45)
      const c = heat > 0.5 ? mix([1, 0.78, 0.3], [1, 0.98, 0.86], (heat - 0.5) / 0.5) : mix([0.95, 0.28, 0.05], [1, 0.78, 0.3], heat / 0.5)
      return u > 0.8 ? mix(c, [0.4, 0.14, 0.08], (u - 0.8) / 0.2) : c
    },
    opacity: (p, u) => (0.1 + 0.75 * (1 - u) ** 0.7) * (1 - 0.7 * offAxis(p, u) ** 2),
    bones: fireBones, glow: true,
  }
  return { bones: bones(), parts: [part], blend: 0.22 }
}

/** The share of the dragon's blobs that are its fire. */
const FIRE_SHARE = 0.07

export function makeDragon(count = 100000, look = 'ice') {
  const c = LOOKS[look] ?? LOOKS.ice
  const body = sculptToCount((s) => spec(c, s), Math.round(count * (1 - FIRE_SHARE)))
  const fire = buildBody(flame(), Math.max(200, count - body.blobs.count), 3)
  const b = joinBuilt(body, fire)
  // shrink the flame into the mouth: its blobs and bones, about the mouth
  const shrink = (p: ArrayLike<number>): Vec3 => [MOUTH[0] + (p[0] - MOUTH[0]) / FLAME, MOUTH[1] + (p[1] - MOUTH[1]) / FLAME, MOUTH[2] + (p[2] - MOUTH[2]) / FLAME]
  for (let i = b.from; i < b.blobs.count; i++) {
    b.blobs.center.set(shrink(b.blobs.center.subarray(i * 3, i * 3 + 3)), i * 3)
    for (let k = 0; k < 3; k++) b.blobs.scale[i * 3 + k] /= FLAME
  }
  const all = bones()
  const rest = all.map((bone, i): Bone => (bone.name.startsWith('fire') ? { ...bone, head: shrink(bone.head), tail: shrink(boneTail(all, i)) } : bone))
  return { blobs: b.blobs, skin: b.skin, skeleton: new Skeleton(rest) }
}

/** Wings half folded: the arm drawn back and the fingers closed together. */
function fold(sk: Skeleton, amount: number) {
  for (const [s, x] of SIDES) {
    aim(sk, `${s}Wing1`, dir([0.55 * x, 0.65, -0.55]), amount)
    aim(sk, `${s}Wing2`, dir([0.35 * x, -0.35, -0.85]), amount)
    aim(sk, `${s}Wing3`, dir([0.12 * x, 0.1, -1]), amount)
    aim(sk, `${s}Finger1`, dir([0.12 * x, 0.1, -1]), amount)
    aim(sk, `${s}Finger2`, dir([0.1 * x, -0.25, -1]), amount)
    aim(sk, `${s}Finger3`, dir([0.08 * x, -0.55, -1]), amount)
  }
}

function tailSway(sk: Skeleton, t: number, amp: number, lift = 0) {
  for (let k = 1; k <= 5; k++) {
    set(sk, `tail${k}`, Y, amp * Math.sin(t - k * 0.55))
    turn(sk, `tail${k}`, X, -lift * 0.06 * k)
  }
}

const IDLE = 5

/** Standing guard: slow breaths, wings half folded and settling, the tail and head moving. */
export function dragonIdle(sk: Skeleton, t: number) {
  sk.reset()
  const ph = (t / IDLE) * Math.PI * 2
  const breath = Math.sin(ph * 2)
  sk.offset.set([0, 0.015 * breath, 0], 0)
  set(sk, 'chest', X, -0.025 * breath)
  set(sk, 'neck1', Y, 0.12 * Math.sin(ph))
  set(sk, 'neck2', X, 0.04 * breath)
  set(sk, 'neck3', Y, 0.12 * Math.sin(ph))
  set(sk, 'head', Y, 0.15 * Math.sin(ph - 0.5))
  set(sk, 'jaw', X, 0.04 + 0.03 * breath)
  tailSway(sk, ph, 0.12)
  fold(sk, 0.75 + 0.05 * breath)
  sk.update()
}

const FLAP = 1.2

/** Hovering: wings beating, the wave running out from shoulder to fingertip, legs hanging, body rising on each downstroke. */
export function dragonFlap(sk: Skeleton, t: number) {
  sk.reset()
  const ph = (t / FLAP) * Math.PI * 2
  // the body rises as the wings come down
  sk.offset.set([0, 0.75 + 0.18 * Math.sin(ph + 0.4), 0], 0)
  set(sk, 'hips', X, -0.12)
  set(sk, 'chest', X, -0.08 + 0.05 * Math.cos(ph))
  set(sk, 'neck1', X, 0.12)
  set(sk, 'neck2', X, 0.08 + 0.04 * Math.cos(ph + 0.6))
  set(sk, 'head', X, 0.1 - 0.06 * Math.cos(ph + 1))
  tailSway(sk, ph, 0.08, 1)
  for (let k = 1; k <= 5; k++) turn(sk, `tail${k}`, X, 0.08 * Math.sin(ph - k * 0.7))
  for (const [s, x] of SIDES) {
    set(sk, `${s}Wing1`, Z, x * (0.15 + 0.75 * Math.cos(ph)))
    turn(sk, `${s}Wing1`, Y, x * 0.15 * Math.sin(ph))
    set(sk, `${s}Wing2`, Z, x * 0.35 * Math.cos(ph - 0.7))
    set(sk, `${s}Wing3`, Z, x * 0.3 * Math.cos(ph - 1.3))
    for (let k = 1; k <= 3; k++) set(sk, `${s}Finger${k}`, Z, x * 0.25 * Math.cos(ph - 1.5 - k * 0.15))
    // legs hang back, swinging a little
    aim(sk, `${s}Arm`, dir([0.1 * x, -0.9, -0.3]))
    aim(sk, `${s}Forearm`, dir([0.05 * x, -0.7, 0.6]))
    aim(sk, `${s}Thigh`, dir([0.15 * x, -0.75, -0.55 - 0.08 * Math.sin(ph)]))
    aim(sk, `${s}Shin`, dir([0.05 * x, -0.45, -0.9]))
    aim(sk, `${s}Foot`, dir([0.02 * x, -0.3, -0.95]))
  }
  sk.update()
}

const BREATH = 3.4

/**
 * Fire: rearing back to draw breath, wings opening, then lunging forward
 * with the jaw open as the flame unrolls from the mouth, roaring and
 * flickering, until the last of it rolls away and the mouth shuts.
 */
export function dragonFire(sk: Skeleton, t: number) {
  const u = (t % BREATH) / BREATH
  dragonIdle(sk, u * IDLE)
  const rear = env(u, 0.02, 0.24, 0.26, 0.36)
  const lunge = env(u, 0.28, 0.38, 0.82, 0.95)
  const open = env(u, 0.3, 0.37, 0.84, 0.92)
  set(sk, 'chest', X, -0.1 * rear + 0.06 * lunge)
  set(sk, 'neck1', X, -0.35 * rear + 0.1 * lunge)
  set(sk, 'neck2', X, -0.35 * rear + 0.12 * lunge)
  set(sk, 'neck3', X, -0.2 * rear + 0.08 * lunge)
  set(sk, 'head', X, 0.25 * rear + 0.06 * lunge + 0.02 * Math.sin(u * 90) * lunge)
  set(sk, 'jaw', X, 0.06 + 0.5 * open)
  fold(sk, 0.75 * (1 - env(u, 0.05, 0.3, 0.8, 0.98)))
  for (const [s, x] of SIDES) turn(sk, `${s}Wing1`, Z, x * 0.35 * env(u, 0.05, 0.3, 0.8, 0.98))
  // the flame: grown to life size from the mouth, unrolling segment by segment, flickering, then rolling away
  const on = ramp(u, 0.34, 0.4)
  const away = ramp(u, 0.8, 0.9)
  const gone = ramp(u, 0.9, 0.93)
  const f1 = sk.index('fire1')
  sk.size[f1] = 1 + (FLAME * (0.12 + 0.88 * on) * (1 - 0.6 * away) - 1) * (1 - gone) * ramp(u, 0.33, 0.34)
  const seg = REACH / FIRE / FLAME
  sk.offset.set([AIM[0] * seg * 3 * away * (1 - gone), AIM[1] * seg * 3 * away * (1 - gone), AIM[2] * seg * 3 * away * (1 - gone)], f1 * 3)
  for (let k = 2; k <= FIRE; k++) {
    const b = sk.index(`fire${k}`)
    sk.size[b] = (0.35 + 0.65 * ramp(u, 0.34 + 0.02 * k, 0.4 + 0.025 * k)) * (1 + 0.08 * Math.sin(u * 140 + k * 1.7))
    set(sk, `fire${k}`, X, 0.09 * Math.sin(u * 61 + k * 1.3))
    turn(sk, `fire${k}`, Y, 0.09 * Math.sin(u * 47 + k * 2.1))
  }
  sk.update()
}

export const DRAGON: Species = {
  id: 'dragon',
  name: 'dragon',
  blurb: 'A dragon of forty-three bones, in ice, ember or jade, scaled from snout to tail spade, with wings of skin stretched between finger bones, and fire made of bones too.',
  detail: [30000, 60000, 100000, 200000],
  start: 60000,
  looks: Object.entries(LOOKS).map(([id, l]) => ({ id, label: l.label })),
  make: (count, look) => makeDragon(count, look),
  moves: [
    { name: 'flap', label: 'Flap', doing: 'hovering on beating wings', seconds: FLAP, fps: 30, pose: dragonFlap },
    { name: 'fire', label: 'Breathe fire', doing: 'breathing fire', seconds: BREATH, fps: 30, pose: dragonFire },
    { name: 'idle', label: 'Stand', doing: 'standing guard', seconds: IDLE, fps: 12, pose: dragonIdle },
  ],
  view: { target: [0, 1.7, -0.4], distance: 11, azimuth: 40, elevation: 14 },
}
