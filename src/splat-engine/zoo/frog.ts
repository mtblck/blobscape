import type { Vec3 } from '../../splat-core/blobs.ts'
import { mirror, mix, spots } from '../body.ts'
import { membrane, scales, sculptToCount, smooth, type SculptPart, type SculptSpec } from '../sculpt.ts'
import { cone, displace, ellipsoid, sphere, type Shape } from '../voxel.ts'
import type { Bone, Skeleton } from '../rig.ts'
import { X, aim, dir, env, ramp, set, turn } from '../posing.ts'
import type { Species } from './species.ts'

/**
 * A frog, sitting, facing +z: twenty bones, including a jaw and a tongue of
 * three. The tongue lies folded back along the floor of the mouth, tip
 * toward the throat, as a real frog's does; flicking it turns it over the
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

function spec(c: Skin, s: number): SculptSpec {
  /** No thinner than the grid can catch. */
  const fat = (r: number) => Math.max(r, s * 0.6)
  const WART = 0.021
  // blotches with a dark rim on top and the sides, pale underneath, two pale ridges down the back
  const hide = (p: Vec3, n: Vec3): Vec3 => {
    if (n[1] < -0.35) return mix(c.belly, c.back, 0.08 * scales(p, 0.012).id)
    if (n[1] > 0.45 && Math.abs(Math.abs(p[0]) - 0.052) < 0.007 && p[2] < 0.12) return mix(c.back, c.belly, 0.6)
    const blot = spots(p, 46)
    const base = blot > 0.7 ? c.spot : blot > 0.62 ? mix(c.back, c.spot, 0.55) : mix(c.back, c.belly, 0.14 * scales(p, WART).id)
    return n[1] < -0.05 ? mix(base, c.belly, Math.min(1, (-0.05 - n[1]) * 3)) : base
  }
  // bands across the legs
  const legHide = (p: Vec3, n: Vec3): Vec3 => (n[1] < -0.4 ? mix(c.belly, c.back, 0.35) : Math.sin(Math.hypot(p[0], p[2] + 0.02) * 95) > 0.35 ? c.spot : mix(c.back, c.belly, 0.1 * scales(p, WART).id))
  /** Warts: every cell of the pattern a low bump. */
  const warty = (shape: Shape, h = 0.0035) => displace(shape, (x, y, z) => h * (1 - scales([x, y, z], WART).out), h)
  // the mouth is pink only where the head and the jaw close on each other, so no lip shows at the seam
  const inHead = (p: Vec3) => (p[0] / 0.115) ** 2 + ((p[1] - 0.225) / 0.058) ** 2 + ((p[2] - 0.15) / 0.105) ** 2 < 0.92
  const inJaw = (p: Vec3) => (p[0] / 0.108) ** 2 + ((p[1] - 0.178) / 0.034) ** 2 + ((p[2] - 0.155) / 0.095) ** 2 < 0.92
  const parts: SculptPart[] = [
    // body and skull as one skin, with a brow over each eye
    {
      shape: warty(smooth(0.03,
        ellipsoid([0, 0.15, -0.045], [0.112, 0.088, 0.14]), ellipsoid([0, 0.225, 0.15], [0.115, 0.058, 0.105]),
        ellipsoid([0.068, 0.262, 0.16], [0.042, 0.03, 0.042]), ellipsoid([-0.068, 0.262, 0.16], [0.042, 0.03, 0.042]),
      )),
      // the roof of the mouth, seen when the jaw drops
      color: (p, n) => (n[1] < -0.3 && inJaw(p) ? MOUTH : hide(p, n)), bones: ['body', 'head'],
    },
    { shape: ellipsoid([0, 0.178, 0.155], [0.108, 0.034, 0.095]), color: (p, n) => (inHead(p) ? MOUTH : n[1] < 0.1 ? c.belly : hide(p, n)), bones: ['jaw'], group: 'jaw' },
    { shape: smooth(0.006, cone([0, 0.181, 0.215], [0, 0.192, 0.085], fat(0.009), fat(0.012)), ellipsoid([0, 0.193, 0.08], [0.02, fat(0.015), 0.017])), color: TONGUE, bones: ['tongue1', 'tongue2', 'tongue3'], group: 'tongue' },
  ]
  for (const [side, x] of SIDES) {
    const at = (p: Vec3) => sided(x, p)
    const eye = at([0.073, 0.272, 0.172])
    const out = dir([0.62 * x, 0.35, 0.7])
    parts.push(
      // the eye: gold, with a wide pupil lying level and a glint
      {
        shape: ellipsoid(eye, [0.036, 0.034, 0.034]), bones: ['head'], group: 'eyes', glow: true,
        color: (_p, n) => {
          const d = n[0] * out[0] + n[1] * out[1] + n[2] * out[2]
          if (d > 0.9 && n[1] > out[1] + 0.12) return [1, 1, 0.95]
          if (d > 0.62 && Math.abs(n[1] - out[1]) < 0.17) return PUPIL
          return d > 0.3 ? mix(GOLD, [0.5, 0.3, 0.05], Math.max(0, 0.9 - d)) : c.back
        },
      },
      // a nostril, and the round drum of the ear behind the eye
      { shape: sphere(at([0.03, 0.235, 0.247]), fat(0.006)), color: c.spot, bones: ['head'] },
      { shape: ellipsoid(at([0.106, 0.222, 0.105]), [fat(0.008), 0.022, 0.022]), color: (p) => (Math.hypot(p[1] - 0.222, p[2] - 0.105) < 0.012 ? mix(c.spot, c.back, 0.5) : c.spot), bones: ['head'] },
      { shape: warty(smooth(0.012, cone(at([0.075, 0.15, 0.07]), at([0.11, 0.08, 0.11]), 0.032, 0.024), cone(at([0.11, 0.08, 0.11]), at([0.11, 0.018, 0.125]), 0.024, 0.018)), 0.002), color: legHide, bones: ['body', `${side}Arm`, `${side}Forearm`, `${side}Hand`] },
    )
    // four fingers with round pads
    for (const tip of [[0.075, 0.008, 0.175], [0.105, 0.008, 0.195], [0.14, 0.008, 0.185], [0.16, 0.008, 0.15]] as Vec3[]) {
      parts.push(
        { shape: cone(at([0.11, 0.014, 0.13]), at(tip), fat(0.011), fat(0.007)), color: c.back, bones: [`${side}Hand`] },
        { shape: ellipsoid(at(tip), [0.013, fat(0.008), 0.013]), color: mix(c.belly, c.back, 0.25), bones: [`${side}Hand`] },
      )
    }
    const knee = at([0.2, 0.1, 0.0]), ankle = at([0.17, 0.045, -0.15]), base = at([0.2, 0.014, -0.02])
    parts.push({
      shape: warty(smooth(0.014, cone(at([0.07, 0.12, -0.12]), knee, 0.06, 0.04), cone(knee, ankle, 0.04, 0.026), cone(ankle, base, 0.024, 0.016)), 0.0025),
      color: legHide, bones: ['body', `${side}Thigh`, `${side}Shin`, `${side}Foot`, `${side}Toes`],
    })
    // long toes with pads, and webbing between them
    const tips: Vec3[] = ([[0.16, 0.008, 0.075], [0.205, 0.008, 0.1], [0.255, 0.008, 0.085], [0.285, 0.008, 0.035]] as Vec3[]).map(at)
    const web: Vec3[][] = []
    for (let k = 0; k < tips.length - 1; k++) web.push([base, mix(base, tips[k], 0.82), mix(base, tips[k + 1], 0.82)])
    parts.push({ shape: membrane(web, fat(0.003)), color: (p) => (Math.sin(Math.hypot(p[0] - base[0], p[2] - base[2]) * 260) > 0.6 ? mix(c.back, c.spot, 0.4) : mix(c.back, c.belly, 0.45)), bones: [`${side}Toes`], group: `${side}Web`, opacity: 0.9, noShadow: true })
    for (const tip of tips) {
      parts.push(
        { shape: cone(base, tip, fat(0.01), fat(0.007)), color: c.back, bones: [`${side}Foot`, `${side}Toes`] },
        { shape: ellipsoid(tip, [0.012, fat(0.007), 0.012]), color: mix(c.belly, c.back, 0.25), bones: [`${side}Toes`] },
      )
    }
  }
  return { bones: BONES, parts, blend: 0.03, light: { ambient: 0.66, shadow: 0.45 } }
}

export function makeFrog(count = 10000, look = 'green') {
  const c = LOOKS[look] ?? LOOKS.green
  const b = sculptToCount((s) => spec(c, s), count, 0.012)
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
  blurb: 'A warty frog of twenty bones, blotched and banded, that jumps, and flicks a tongue that lives folded in its mouth.',
  detail: [5000, 15000, 40000, 80000],
  start: 15000,
  looks: Object.entries(LOOKS).map(([id, l]) => ({ id, label: l.label })),
  make: makeFrog,
  moves: [
    { name: 'jump', label: 'Jump', doing: 'jumping on the spot', seconds: LEAP, fps: 30, pose: frogJump },
    { name: 'tongue', label: 'Tongue', doing: 'flicking its tongue', seconds: FLICK, fps: 30, pose: frogTongue },
    { name: 'idle', label: 'Sit', doing: 'sitting and breathing', seconds: 3, fps: 12, pose: frogIdle },
  ],
  view: { target: [0, 0.24, 0.02], distance: 1.7, azimuth: 35, elevation: 14 },
}
