import type { Vec3 } from '../../splat-core/blobs.ts'
import { buildBody, mirror, mix, spots, type BodySpec, type Part } from '../body.ts'
import type { Bone, Skeleton } from '../rig.ts'
import { X, aim, dir, env, ramp, set, turn } from '../posing.ts'
import type { Species } from './species.ts'

/**
 * A frog, sitting, facing +z: twenty bones, including a jaw and a tongue of
 * three. The tongue lies folded back along the floor of the mouth, tip
 * towards the throat, as a real frog's does; flicking it turns it over the
 * jaw and out, and grows it, so it never stretches its blobs thin.
 */

const SIDES = [['l', 1], ['r', -1]] as const
const sided = (x: number, p: Vec3): Vec3 => (x > 0 ? p : mirror(p))

const BONES: Bone[] = [
  { name: 'body', parent: -1, head: [0, 0.13, -0.12], tail: [0, 0.2, 0.07] },
  { name: 'head', parent: 0, head: [0, 0.21, 0.07], tail: [0, 0.22, 0.27] },
  { name: 'jaw', parent: 1, head: [0, 0.185, 0.06], tail: [0, 0.165, 0.25] },
  { name: 'tongue1', parent: 2, head: [0, 0.18, 0.22], tail: [0, 0.185, 0.17] },
  { name: 'tongue2', parent: 3, head: [0, 0.185, 0.17], tail: [0, 0.19, 0.12] },
  { name: 'tongue3', parent: 4, head: [0, 0.19, 0.12], tail: [0, 0.195, 0.08] },
]
for (const [s, x] of SIDES) {
  const hand = BONES.length
  BONES.push(
    { name: `${s}Arm`, parent: 0, head: sided(x, [0.075, 0.15, 0.07]) },
    { name: `${s}Forearm`, parent: hand, head: sided(x, [0.11, 0.08, 0.11]) },
    { name: `${s}Hand`, parent: hand + 1, head: sided(x, [0.11, 0.018, 0.125]), tail: sided(x, [0.115, 0.006, 0.19]) },
  )
}
for (const [s, x] of SIDES) {
  const thigh = BONES.length
  BONES.push(
    { name: `${s}Thigh`, parent: 0, head: sided(x, [0.085, 0.12, -0.12]) },
    { name: `${s}Shin`, parent: thigh, head: sided(x, [0.2, 0.1, 0.0]) },
    { name: `${s}Foot`, parent: thigh + 1, head: sided(x, [0.17, 0.045, -0.15]) },
    { name: `${s}Toes`, parent: thigh + 2, head: sided(x, [0.2, 0.012, -0.02]), tail: sided(x, [0.23, 0.005, 0.08]) },
  )
}

interface Skin { back: Vec3; spot: Vec3; belly: Vec3 }
const LOOKS: Record<string, Skin & { label: string }> = {
  green: { label: 'Green', back: [0.32, 0.62, 0.2], spot: [0.12, 0.3, 0.08], belly: [0.94, 0.9, 0.66] },
  blue: { label: 'Dart blue', back: [0.1, 0.36, 0.86], spot: [0.03, 0.04, 0.08], belly: [0.25, 0.55, 0.95] },
  tomato: { label: 'Tomato', back: [0.9, 0.32, 0.12], spot: [0.62, 0.16, 0.05], belly: [1, 0.74, 0.4] },
}
const MOUTH: Vec3 = [0.62, 0.2, 0.26], TONGUE: Vec3 = [0.96, 0.46, 0.56], GOLD: Vec3 = [0.9, 0.68, 0.16], PUPIL: Vec3 = [0.03, 0.03, 0.03]

function spec(c: Skin): BodySpec {
  // spotted on top and the sides, pale underneath
  const hide = (p: Vec3, n: Vec3): Vec3 => (n[1] < -0.3 ? c.belly : spots(p, 70) > 0.72 ? c.spot : c.back)
  const legHide = (p: Vec3, n: Vec3): Vec3 => (n[1] < -0.4 ? mix(c.belly, c.back, 0.4) : Math.sin(Math.hypot(p[0], p[2]) * 90) > 0.55 ? c.spot : c.back)
  const parts: Part[] = [
    { shape: { tube: [[0, 0.12, -0.13], [0, 0.19, 0.06]], r: [0.11, 0.12], flat: 0.78 }, colour: hide, bones: ['body', 'head'] },
    { shape: { ball: [0, 0.225, 0.15], r: [0.115, 0.058, 0.105] }, colour: hide, bones: ['head', 'body'] },
    { shape: { ball: [0, 0.178, 0.155], r: [0.108, 0.034, 0.095] }, colour: (p, n) => (n[1] < 0 ? c.belly : hide(p, n)), bones: ['jaw'] },
    // the inside of the mouth, seen when the jaw drops
    { shape: { ball: [0, 0.192, 0.15], r: [0.095, 0.012, 0.08] }, colour: MOUTH, bones: ['head'], density: 1.5 },
    { shape: { tube: [[0, 0.181, 0.215], [0, 0.192, 0.085]], r: [0.009, 0.012] }, colour: TONGUE, bones: ['tongue1', 'tongue2', 'tongue3'], density: 10, size: 0.4 },
    { shape: { ball: [0, 0.193, 0.08], r: [0.02, 0.015, 0.017] }, colour: TONGUE, bones: ['tongue3'], density: 10, size: 0.4 },
  ]
  for (const [s, x] of SIDES) {
    const out = dir([0.62 * x, 0.35, 0.7])
    parts.push(
      {
        shape: { ball: [0.068 * x, 0.268, 0.168], r: [0.038, 0.036, 0.036] }, bones: ['head'], density: 5,
        colour: (_p, n) => {
          const d = n[0] * out[0] + n[1] * out[1] + n[2] * out[2]
          if (d > 0.93 && n[1] > out[1] + 0.1) return [1, 1, 0.95] // a glint
          return d > 0.78 && Math.abs(n[1] - out[1]) < 0.16 ? PUPIL : d > 0.45 ? GOLD : c.back
        },
      },
      { shape: { tube: [sided(x, [0.075, 0.15, 0.07]), sided(x, [0.11, 0.08, 0.11])], r: [0.032, 0.024] }, colour: legHide, bones: ['body', `${s}Arm`, `${s}Forearm`] },
      { shape: { tube: [sided(x, [0.11, 0.08, 0.11]), sided(x, [0.11, 0.018, 0.125])], r: [0.024, 0.018] }, colour: legHide, bones: [`${s}Arm`, `${s}Forearm`, `${s}Hand`] },
    )
    // four fingers with round pads
    for (const tip of [[0.075, 0.006, 0.175], [0.105, 0.006, 0.195], [0.14, 0.006, 0.185], [0.16, 0.006, 0.15]] as Vec3[]) {
      parts.push(
        { shape: { tube: [sided(x, [0.11, 0.014, 0.13]), sided(x, tip)], r: [0.011, 0.007] }, colour: c.back, bones: [`${s}Hand`], density: 2 },
        { shape: { ball: sided(x, tip), r: [0.011, 0.007, 0.011] }, colour: mix(c.belly, c.back, 0.3), bones: [`${s}Hand`], density: 2 },
      )
    }
    const knee = sided(x, [0.2, 0.1, 0.0]), ankle = sided(x, [0.17, 0.045, -0.15]), base = sided(x, [0.2, 0.012, -0.02])
    parts.push(
      { shape: { tube: [sided(x, [0.07, 0.12, -0.12]), knee], r: [0.06, 0.04] }, colour: legHide, bones: ['body', `${s}Thigh`] },
      { shape: { tube: [knee, ankle], r: [0.04, 0.026] }, colour: legHide, bones: [`${s}Thigh`, `${s}Shin`, `${s}Foot`] },
      { shape: { tube: [ankle, base], r: [0.024, 0.016] }, colour: legHide, bones: [`${s}Shin`, `${s}Foot`, `${s}Toes`] },
    )
    // long toes with webbing between them
    const tips: Vec3[] = ([[0.16, 0.006, 0.075], [0.205, 0.006, 0.1], [0.255, 0.006, 0.085], [0.285, 0.006, 0.035]] as Vec3[]).map((p) => sided(x, p))
    const web: Vec3[][] = []
    for (let k = 0; k < tips.length - 1; k++) web.push([base, tips[k], tips[k + 1]])
    parts.push({ shape: { sheet: web }, colour: mix(c.back, c.belly, 0.35), bones: [`${s}Toes`], opacity: 0.85 })
    for (const tip of tips) parts.push({ shape: { tube: [base, tip], r: [0.01, 0.007] }, colour: c.back, bones: [`${s}Foot`, `${s}Toes`], density: 2 })
  }
  return { bones: BONES, parts, blend: 0.03 }
}

export function makeFrog(count = 10000, look = 'green') {
  const b = buildBody(spec(LOOKS[look] ?? LOOKS.green), count, 11)
  return { blobs: b.blobs, skin: b.skin, skeleton: b.skeleton }
}

/** Breathing through the throat, now and then a glance. Loops every three seconds. */
export function frogIdle(sk: Skeleton, t: number) {
  sk.reset()
  const breath = Math.sin((t / 3) * Math.PI * 2 * 3)
  set(sk, 'jaw', X, 0.03 + 0.03 * breath)
  sk.offset.set([0, 0.003 * breath, 0], 0)
  set(sk, 'head', [0, 1, 0], 0.12 * Math.sin((t / 3) * Math.PI * 2))
  sk.update()
}

const LEAP = 1.1

/**
 * A jump on the spot: a crouch, the back legs straightening behind it as it
 * leaves the ground, arms reaching forward to land, and a settle.
 */
export function frogJump(sk: Skeleton, t: number) {
  sk.reset()
  const u = (t % LEAP) / LEAP
  const crouch = env(u, 0, 0.18, 0.2, 0.3) + env(u, 0.72, 0.8, 0.86, 1)
  const push = env(u, 0.2, 0.32, 0.5, 0.7)
  const air = Math.min(1, Math.max(0, (u - 0.24) / 0.5))
  const height = air > 0 && air < 1 ? 0.32 * 4 * air * (1 - air) : 0
  sk.offset.set([0, height - 0.025 * crouch, 0], 0)
  // nose up on the way up, down to land
  set(sk, 'body', X, -0.45 * push + 0.25 * env(u, 0.55, 0.7, 0.78, 0.9) + 0.08 * crouch)
  set(sk, 'head', X, 0.15 * push)
  for (const [s, x] of SIDES) {
    // legs fully out behind, then folding back under
    aim(sk, `${s}Thigh`, dir([0.18 * x, -0.45, -0.88]), push)
    aim(sk, `${s}Shin`, dir([0.1 * x, -0.4, -0.9]), push)
    aim(sk, `${s}Foot`, dir([0.06 * x, -0.45, -0.89]), push)
    aim(sk, `${s}Toes`, dir([0.04 * x, -0.4, -0.92]), push)
    const reach = env(u, 0.3, 0.5, 0.78, 0.9)
    aim(sk, `${s}Arm`, dir([0.25 * x, -0.25, 0.93]), reach)
    aim(sk, `${s}Forearm`, dir([0.1 * x, -0.55, 0.83]), reach)
  }
  sk.update()
}

const FLICK = 2

/** The jaw drops, the tongue flips over it and out at a fly, and snaps back. */
export function frogTongue(sk: Skeleton, t: number) {
  const u = (t % FLICK) / FLICK
  frogIdle(sk, u * 3)
  const open = env(u, 0.18, 0.26, 0.5, 0.62)
  const out = env(u, 0.24, 0.32, 0.44, 0.54)
  set(sk, 'head', X, -0.12 * open)
  set(sk, 'jaw', X, 0.6 * open)
  // over the top of the jaw and out, aiming a little up: the jaw is already turned down by 0.6
  set(sk, 'tongue1', X, (Math.PI - 0.85) * out)
  turn(sk, 'tongue2', X, -0.35 * (1 - out) * ramp(u, 0.24, 0.3))
  turn(sk, 'tongue3', X, -0.2 * Math.sin(u * 40) * out)
  sk.size[sk.index('tongue1')] = 1 + 1.9 * out
  sk.update()
}

export const FROG: Species = {
  id: 'frog',
  name: 'frog',
  blurb: 'A frog of twenty bones that jumps, and flicks a tongue that lives folded in its mouth.',
  detail: [3000, 10000, 30000, 60000],
  start: 10000,
  looks: Object.entries(LOOKS).map(([id, l]) => ({ id, label: l.label })),
  make: makeFrog,
  moves: [
    { name: 'jump', label: 'Jump', doing: 'jumping on the spot', seconds: LEAP, fps: 30, pose: frogJump },
    { name: 'tongue', label: 'Tongue', doing: 'flicking its tongue', seconds: FLICK, fps: 30, pose: frogTongue },
    { name: 'idle', label: 'Sit', doing: 'sitting and breathing', seconds: 3, fps: 12, pose: frogIdle },
  ],
  view: { target: [0, 0.24, 0.02], distance: 1.7, azimuth: 35, elevation: 14 },
}
