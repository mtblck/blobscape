import type { Vec3 } from '../../splat-core/blobs.ts'
import { boneTail, buildBody, mirror, mix, segDist, spots, type BodySpec, type Part } from '../body.ts'
import { Skeleton, type Bone } from '../rig.ts'
import { X, Y, Z, aim, dir, env, ramp, set, turn } from '../posing.ts'
import type { Species } from './species.ts'

/**
 * An ice dragon, standing, facing +z, about eight units nose to tail: 43
 * bones. Its wings are sheets of blobs stretched between an arm and three
 * finger bones, so the membrane follows the fingers as they spread and fold.
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

function spec(c: Palette): BodySpec {
  const hide = (p: Vec3, n: Vec3): Vec3 => {
    if (n[1] < -0.4) return Math.sin(p[2] * 16) > 0.75 ? mix(c.belly, c.body, 0.35) : c.belly
    const top = Math.max(0, n[1])
    const base = mix(c.body, c.dark, Math.min(1, top * 0.8 + (spots(p, 9) - 0.5) * 0.8))
    return spots(p, 46, 2) > 0.8 ? mix(base, c.frost, 0.55) : base
  }
  const spine = ['hips', 'spine', 'chest', 'neck1', 'neck2', 'neck3', 'head', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5']
  const parts: Part[] = [
    { shape: { tube: [[0, 1.5, -0.95], [0, 1.72, 0.9]], r: [0.55, 0.6], flat: 0.85 }, colour: hide, bones: ['hips', 'spine', 'chest'] },
    { shape: { ball: [0, 1.68, 0.9], r: [0.56, 0.56, 0.5] }, colour: hide, bones: ['chest', 'spine'] },
    { shape: { tube: [[0, 1.88, 1.15], [0, 2.3, 1.6]], r: [0.4, 0.28] }, colour: hide, bones: ['chest', 'neck1', 'neck2'] },
    { shape: { tube: [[0, 2.3, 1.6], [0, 2.82, 1.92]], r: [0.28, 0.22] }, colour: hide, bones: ['neck2', 'neck3', 'head'] },
    // the head: skull, snout, jaw, and the inside of the mouth
    { shape: { ball: [0, 3.0, 2.05], r: [0.3, 0.27, 0.36] }, colour: hide, bones: ['head'], density: 1.5 },
    { shape: { tube: [[0, 2.98, 2.2], [0, 2.9, 2.8]], r: [0.2, 0.12], flat: 0.72 }, colour: hide, bones: ['head'], density: 1.5 },
    { shape: { tube: [[0, 2.79, 2.12], [0, 2.73, 2.74]], r: [0.16, 0.09], flat: 0.55 }, colour: (p, n) => (n[1] < -0.3 ? c.belly : hide(p, n)), bones: ['jaw'], density: 1.5 },
    { shape: { ball: [0, 2.83, 2.42], r: [0.12, 0.035, 0.3] }, colour: c.gum, bones: ['head'], density: 2 },
    // a frill of ice down the back of the jaw
    { shape: { sheet: [[[0.22, 2.9, 1.9], [0.45, 2.75, 1.55], [0.2, 2.75, 2.15]], [[-0.22, 2.9, 1.9], [-0.45, 2.75, 1.55], [-0.2, 2.75, 2.15]]] }, colour: c.frost, bones: ['head'], opacity: 0.85 },
    // a spade at the end of the tail
    { shape: { sheet: [[[0, 0.73, -4.4], [0.32, 0.76, -4.75], [0, 0.7, -5.15]], [[0, 0.73, -4.4], [0, 0.7, -5.15], [-0.32, 0.76, -4.75]]] }, colour: c.frost, bones: ['tail5'], opacity: 0.9 },
  ]
  // the tail, tapering
  const tail: [Vec3, number][] = [[[0, 1.52, -1.0], 0.42], [[0, 1.35, -2.0], 0.31], [[0, 1.15, -2.7], 0.23], [[0, 0.95, -3.35], 0.16], [[0, 0.8, -3.95], 0.1], [[0, 0.72, -4.55], 0.05]]
  for (let k = 0; k < tail.length - 1; k++) {
    parts.push({ shape: { tube: [tail[k][0], tail[k + 1][0]], r: [tail[k][1], tail[k + 1][1]] }, colour: hide, bones: k ? [`tail${k}`, `tail${k + 1}`, ...(k < 4 ? [`tail${k + 2}`] : [])] : ['hips', 'tail1', 'tail2'] })
  }
  // spikes of ice along the ridge, tallest over the shoulders
  for (let k = 0; k < RIDGE.length - 1; k++) {
    for (const f of [0, 0.5]) {
      const p = mix(RIDGE[k], RIDGE[k + 1], f)
      const s = (k + f) / (RIDGE.length - 1)
      const h = 0.34 * Math.sin(Math.PI * Math.min(1, s * 1.15 + 0.08)) + 0.06
      parts.push({ shape: { tube: [p, [p[0], p[1] + h, p[2] - h * 0.65]], r: [0.07 * (h / 0.3 + 0.3), 0.008] }, colour: c.frost, bones: spine, density: 2 })
    }
  }
  for (const [s, x] of SIDES) {
    parts.push(
      // horns, two a side, swept back
      { shape: { tube: [sided(x, [0.14, 3.16, 1.92]), sided(x, [0.36, 3.5, 1.4])], r: [0.075, 0.008] }, colour: c.frost, bones: ['head'], density: 2 },
      { shape: { tube: [sided(x, [0.22, 3.04, 1.86]), sided(x, [0.5, 3.12, 1.52])], r: [0.05, 0.006] }, colour: c.frost, bones: ['head'], density: 2 },
      // eyes that glow, with a slit
      { shape: { ball: sided(x, [0.2, 3.06, 2.22]), r: [0.06, 0.04, 0.065] }, colour: (p) => (Math.abs(p[2] - sided(x, [0.2, 3.06, 2.22])[2] - 0.01) < 0.012 ? [0.05, 0.1, 0.2] : c.eye), bones: ['head'], density: 4, glow: true },
      { shape: { ball: sided(x, [0.07, 2.97, 2.79]), r: [0.028, 0.02, 0.02] }, colour: [0.08, 0.1, 0.16], bones: ['head'], density: 4 },
    )
    // teeth along the upper jaw
    for (let k = 0; k < 6; k++) {
      const z = 2.3 + k * 0.08, w = 0.13 - k * 0.012
      parts.push({ shape: { tube: [sided(x, [w, 2.87, z]), sided(x, [w, 2.78, z + 0.01])], r: [0.022, 0.003] }, colour: c.frost, bones: ['head'], density: 4 })
    }
    // legs
    const fl = { top: sided(x, [0.42, 1.62, 0.85]), elbow: sided(x, [0.45, 0.9, 1.05]), wrist: sided(x, [0.45, 0.22, 0.95]), toe: sided(x, [0.47, 0.08, 1.3]) }
    const bl = { top: sided(x, [0.42, 1.52, -0.7]), knee: sided(x, [0.5, 0.85, -0.3]), hock: sided(x, [0.5, 0.38, -0.8]), toe: sided(x, [0.52, 0.06, -0.42]) }
    parts.push(
      { shape: { tube: [fl.top, fl.elbow], r: [0.25, 0.15] }, colour: hide, bones: ['chest', `${s}Arm`, `${s}Forearm`] },
      { shape: { tube: [fl.elbow, fl.wrist], r: [0.15, 0.11] }, colour: hide, bones: [`${s}Arm`, `${s}Forearm`, `${s}Hand`] },
      { shape: { tube: [sided(x, [0.45, 0.18, 0.92]), fl.toe], r: [0.13, 0.1], flat: 0.6 }, colour: hide, bones: [`${s}Forearm`, `${s}Hand`] },
      { shape: { tube: [bl.top, bl.knee], r: [0.38, 0.2] }, colour: hide, bones: ['hips', `${s}Thigh`, `${s}Shin`] },
      { shape: { tube: [bl.knee, bl.hock], r: [0.2, 0.12] }, colour: hide, bones: [`${s}Thigh`, `${s}Shin`, `${s}Foot`] },
      { shape: { tube: [bl.hock, bl.toe], r: [0.12, 0.1] }, colour: hide, bones: [`${s}Shin`, `${s}Foot`] },
      { shape: { tube: [bl.toe, sided(x, [0.53, 0.06, -0.18])], r: [0.1, 0.08], flat: 0.6 }, colour: hide, bones: [`${s}Foot`] },
    )
    for (const dx of [-0.08, 0, 0.08]) {
      parts.push(
        { shape: { tube: [sided(x, [0.47 + dx, 0.08, 1.3]), sided(x, [0.47 + dx * 1.4, 0.0, 1.48])], r: [0.045, 0.005] }, colour: c.claw, bones: [`${s}Hand`], density: 3 },
        { shape: { tube: [sided(x, [0.53 + dx, 0.06, -0.2]), sided(x, [0.53 + dx * 1.4, 0.0, -0.02])], r: [0.04, 0.005] }, colour: c.claw, bones: [`${s}Foot`], density: 3 },
      )
    }
    // the wing: bones you can see along its leading edge and fingers, and the membrane between them
    const S = sided(x, [...WING.shoulder]), E = sided(x, [...WING.elbow]), W = sided(x, [...WING.wrist])
    const [T1, T2, T3] = WING.tips.map((t) => sided(x, [...t]))
    const B = sided(x, [...WING.flank])
    const wingBones = ['chest', 'hips', `${s}Wing1`, `${s}Wing2`, `${s}Wing3`, `${s}Finger1`, `${s}Finger2`, `${s}Finger3`]
    parts.push(
      { shape: { tube: [S, E], r: [0.11, 0.07] }, colour: hide, bones: ['chest', `${s}Wing1`, `${s}Wing2`] },
      { shape: { tube: [E, W], r: [0.07, 0.05] }, colour: hide, bones: [`${s}Wing1`, `${s}Wing2`, `${s}Wing3`] },
      ...[T1, T2, T3].map((T, k): Part => ({ shape: { tube: [W, T], r: [0.045, 0.015] }, colour: c.dark, bones: [`${s}Wing3`, `${s}Finger${k + 1}`], density: 1.5 })),
      { shape: { ball: W, r: [0.07, 0.07, 0.07] }, colour: c.frost, bones: [`${s}Wing2`, `${s}Wing3`] },
      {
        shape: { sheet: [[S, E, W], [S, W, T3], [S, T3, B], [W, T1, T2], [W, T2, T3]] },
        // veins fan out from the wrist
        colour: (p) => {
          const v = [T1, T2, T3].some((T) => segDist(p, W, T) < 0.035) || segDist(p, W, B) < 0.03
          return v ? mix(c.membrane, c.dark, 0.5) : mix(c.membrane, c.belly, Math.max(0, Math.min(1, (p[1] - 1.6) * 0.4)))
        },
        bones: wingBones, opacity: 0.78, density: 1.1, size: 1.25, blend: 0.55,
      },
    )
  }
  // the flame: a solid cone of glowing blobs, white-hot at its heart, thinning to red at its edges and end
  const fireBones = Array.from({ length: FIRE }, (_, k) => `fire${k + 1}`)
  /** How far a point is from the flame's axis, as a share of the flame's radius there. */
  const offAxis = (p: Vec3, u: number) => {
    const q = [p[0] - MOUTH[0], p[1] - MOUTH[1], p[2] - MOUTH[2]]
    const along = q[0] * AIM[0] + q[1] * AIM[1] + q[2] * AIM[2]
    return Math.hypot(q[0] - AIM[0] * along, q[1] - AIM[1] * along, q[2] - AIM[2] * along) / (0.06 + 0.69 * u)
  }
  parts.push({
    shape: { fill: [MOUTH, at(REACH)], r: [0.06, 0.75] },
    colour: (p, _n, u) => {
      const heat = Math.max(0, 1 - offAxis(p, u) * 0.75 - u * 0.45)
      const c = heat > 0.5 ? mix([1, 0.78, 0.3], [1, 0.98, 0.86], (heat - 0.5) / 0.5) : mix([0.95, 0.28, 0.05], [1, 0.78, 0.3], heat / 0.5)
      return u > 0.8 ? mix(c, [0.4, 0.14, 0.08], (u - 0.8) / 0.2) : c
    },
    opacity: (p, u) => (0.1 + 0.75 * (1 - u) ** 0.7) * (1 - 0.7 * offAxis(p, u) ** 2),
    bones: fireBones, glow: true, density: 0.8,
  })
  return { bones: bones(), parts, blend: 0.22 }
}

export function makeDragon(count = 100000, look = 'ice') {
  const sp = spec(LOOKS[look] ?? LOOKS.ice)
  const b = buildBody(sp, count, 3)
  // shrink the flame into the mouth: its blobs and bones, about the mouth
  const fire = sp.parts.length - 1
  const shrink = (p: ArrayLike<number>): Vec3 => [MOUTH[0] + (p[0] - MOUTH[0]) / FLAME, MOUTH[1] + (p[1] - MOUTH[1]) / FLAME, MOUTH[2] + (p[2] - MOUTH[2]) / FLAME]
  for (let i = 0; i < b.blobs.count; i++) {
    if (b.partOf[i] !== fire) continue
    b.blobs.centre.set(shrink(b.blobs.centre.subarray(i * 3, i * 3 + 3)), i * 3)
    for (let k = 0; k < 3; k++) b.blobs.scale[i * 3 + k] /= FLAME
  }
  const rest = sp.bones.map((bone, i): Bone => (bone.name.startsWith('fire') ? { ...bone, head: shrink(bone.head), tail: shrink(boneTail(sp.bones, i)) } : bone))
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
  blurb: 'A dragon of forty-three bones, in ice, ember or jade, with wings that are sheets of blobs between finger bones, and fire made of bones too.',
  detail: [30000, 100000, 200000, 400000],
  start: 100000,
  looks: Object.entries(LOOKS).map(([id, l]) => ({ id, label: l.label })),
  make: (count, look) => makeDragon(count, look),
  moves: [
    { name: 'flap', label: 'Flap', doing: 'hovering on beating wings', seconds: FLAP, fps: 30, pose: dragonFlap },
    { name: 'fire', label: 'Breathe fire', doing: 'breathing fire', seconds: BREATH, fps: 30, pose: dragonFire },
    { name: 'idle', label: 'Stand', doing: 'standing guard', seconds: IDLE, fps: 12, pose: dragonIdle },
  ],
  view: { target: [0, 1.7, -0.4], distance: 11, azimuth: 40, elevation: 14 },
}
