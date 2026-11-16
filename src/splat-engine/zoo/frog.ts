import type { Vec3 } from '../../splat-core/blobs.ts'
import { mirror, mix, spots } from '../body.ts'
import { membrane, sculptToCount, smooth, type SculptPart, type SculptSpec } from '../sculpt.ts'
import { cone, ellipsoid, sphere } from '../voxel.ts'
import type { Bone, Skeleton } from '../rig.ts'
import { X, aim, dir, env, ramp, set } from '../posing.ts'
import type { Species } from './species.ts'

/**
 * A frog, sitting, facing +z: twenty bones, including a jaw and a tongue of
 * three. The tongue lies along the floor of the mouth, rooted at the back;
 * flicking it grows it straight out between the jaws, so it never stretches
 * its blobs thin.
 */

const SIDES = [['l', 1], ['r', -1]] as const
const sided = (x: number, p: Vec3): Vec3 => (x > 0 ? p : mirror(p))

const BONES: Bone[] = [
  { name: 'body', parent: -1, head: [0, 0.1, -0.13], tail: [0, 0.19, 0.07] },
  { name: 'head', parent: 0, head: [0, 0.21, 0.07], tail: [0, 0.22, 0.27] },
  { name: 'jaw', parent: 1, head: [0, 0.185, 0.06], tail: [0, 0.165, 0.25] },
  { name: 'tongue1', parent: 2, head: [0, 0.172, 0.08] },
  { name: 'tongue2', parent: 3, head: [0, 0.175, 0.125] },
  { name: 'tongue3', parent: 4, head: [0, 0.178, 0.17], tail: [0, 0.18, 0.215] },
]
// The arm: out and down to an elbow that points back, then down and forward to a hand turned in.
const SHOULDER: Vec3 = [0.082, 0.155, 0.075], ELBOW: Vec3 = [0.128, 0.088, 0.062], WRIST: Vec3 = [0.108, 0.02, 0.118]
for (const [s, x] of SIDES) {
  const hand = BONES.length
  BONES.push(
    { name: `${s}Arm`, parent: 0, head: sided(x, SHOULDER) },
    { name: `${s}Forearm`, parent: hand, head: sided(x, ELBOW) },
    { name: `${s}Hand`, parent: hand + 1, head: sided(x, WRIST), tail: sided(x, [0.1, 0.006, 0.18]) },
  )
}
// The leg, folded as a sitting frog's is: the thigh forward along the flank to the knee, the shin back to the heel
// beside the rump, and the long foot forward again along the ground.
const HIP: Vec3 = [0.062, 0.095, -0.15], KNEE: Vec3 = [0.158, 0.098, 0.0], HEEL: Vec3 = [0.142, 0.04, -0.172], SOLE: Vec3 = [0.172, 0.014, -0.045]
for (const [s, x] of SIDES) {
  const thigh = BONES.length
  BONES.push(
    { name: `${s}Thigh`, parent: 0, head: sided(x, HIP) },
    { name: `${s}Shin`, parent: thigh, head: sided(x, KNEE) },
    { name: `${s}Foot`, parent: thigh + 1, head: sided(x, HEEL) },
    { name: `${s}Toes`, parent: thigh + 2, head: sided(x, SOLE), tail: sided(x, [0.2, 0.005, 0.06]) },
  )
}

interface Skin {
  back: Vec3
  /** The darker shade the back is clouded with. */
  cloud: Vec3
  /** Stripes, spots and the line of the mouth. */
  mark: Vec3
  belly: Vec3
  /** The flank under the stripe, and the inside of the thighs. */
  flank: Vec3
  pad: Vec3
  /** `stripe`: a dark band from the nostril through the eye and down the flank. `spots`: round spots all over. */
  marks: 'stripe' | 'spots'
}
const LOOKS: Record<string, Skin & { label: string }> = {
  green: { label: 'Green', marks: 'stripe', back: [0.36, 0.7, 0.16], cloud: [0.2, 0.52, 0.12], mark: [0.16, 0.13, 0.08], belly: [0.95, 0.93, 0.78], flank: [0.86, 0.82, 0.3], pad: [0.86, 0.8, 0.5] },
  blue: { label: 'Dart blue', marks: 'spots', back: [0.12, 0.42, 0.92], cloud: [0.06, 0.24, 0.74], mark: [0.02, 0.03, 0.07], belly: [0.3, 0.6, 0.97], flank: [0.08, 0.2, 0.62], pad: [0.4, 0.62, 0.95] },
  tomato: { label: 'Tomato', marks: 'stripe', back: [0.93, 0.3, 0.1], cloud: [0.74, 0.17, 0.06], mark: [0.25, 0.07, 0.04], belly: [1, 0.86, 0.5], flank: [0.98, 0.58, 0.16], pad: [1, 0.72, 0.42] },
}
const MOUTH: Vec3 = [0.62, 0.2, 0.26], TONGUE: Vec3 = [0.96, 0.46, 0.56], GOLD: Vec3 = [0.93, 0.66, 0.12], PUPIL: Vec3 = [0.03, 0.03, 0.03]

const step = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t) }
/** Toward the light a wet skin throws back: between the baked sun and the usual view. */
const SHINE = dir([-0.2, 0.82, 0.54])
const HEAD: [Vec3, Vec3] = [[0, 0.225, 0.15], [0.115, 0.058, 0.105]], JAW: [Vec3, Vec3] = [[0, 0.178, 0.155], [0.107, 0.034, 0.095]]
/** Where p is in an ellipsoid: under 1 inside, 1 on its surface. */
const within = (p: Vec3, [c, r]: [Vec3, Vec3]) => ((p[0] - c[0]) / r[0]) ** 2 + ((p[1] - c[1]) / r[1]) ** 2 + ((p[2] - c[2]) / r[2]) ** 2

function spec(c: Skin, s: number): SculptSpec {
  /** No thinner than the grid can catch. */
  const fat = (r: number) => Math.max(r, s * 0.6)
  /** Wet skin: a soft highlight where it faces the light. */
  const wet = (col: Vec3, n: Vec3, much = 0.5): Vec3 => {
    const d = Math.max(0, n[0] * SHINE[0] + n[1] * SHINE[1] + n[2] * SHINE[2])
    return mix(col, [1, 1, 0.92], much * d ** 14)
  }
  /** How high the stripe runs at z: level along the head, then down the flank to the groin. */
  const stripeAt = (z: number) => (z > 0.07 ? 0.229 : 0.229 - (0.07 - z) * 0.62)
  // the skin of the head and body: a clouded back, the look's marks, a pale underside
  const hide = (p: Vec3, n: Vec3): Vec3 => {
    let col = mix(c.back, c.cloud, step(0.5, 0.72, spots(p, 34)) * 0.75)
    const under = step(0.1, -0.5, n[1])
    if (c.marks === 'spots') {
      if (spots(p, 52, 1.3) > 0.69) col = c.mark
      col = mix(col, c.flank, under * 0.6)
    } else {
      const side = Math.abs(n[0]) > 0.3 || p[2] > 0.2
      const off = p[1] - stripeAt(p[2])
      // the stripe thins out toward the groin, with a pale line along its lower edge
      const wide = p[2] > 0.07 ? 0.011 : 0.011 * step(-0.13, 0.0, p[2]) + 0.003
      if (side && p[2] > -0.12 && Math.abs(off) < wide) col = c.mark
      else if (side && p[2] > -0.12 && off < 0 && off > -wide - 0.007) col = mix(c.belly, c.flank, 0.3)
      else if (off < 0) col = mix(col, c.flank, step(0, -0.03, off) * (1 - under))
      col = mix(col, c.belly, under)
    }
    return wet(col, n)
  }
  // the limbs: bands across them (spots on a spotted frog), paler underneath
  const limb = (from: Vec3) => (p: Vec3, n: Vec3): Vec3 => {
    const d = Math.hypot(p[0] - from[0], p[1] - from[1], p[2] - from[2])
    let col = mix(c.back, c.cloud, step(0.5, 0.72, spots(p, 34)) * 0.75)
    if (c.marks === 'spots') col = spots(p, 60, 2.2) > 0.66 ? c.mark : mix(col, c.flank, 0.55)
    else col = mix(col, c.cloud, 0.85 * step(0.25, 0.6, Math.sin(d * 120)))
    return wet(mix(col, c.marks === 'spots' ? c.flank : c.belly, step(0, -0.55, n[1])), n, 0.4)
  }
  const pad = (tip: Vec3, r: number): SculptPart['shape'] => ellipsoid(tip, [r, fat(r * 0.62), r])
  const parts: SculptPart[] = [
    // The body and skull as one skin: a chest held up on the arms, a back that slopes down over the hips to a rump
    // on the ground, a wide flat head, and a lid over each eye.
    {
      shape: smooth(0.035,
        ellipsoid([0, 0.158, 0.015], [0.106, 0.084, 0.105]), ellipsoid([0, 0.092, -0.115], [0.098, 0.08, 0.1]), ellipsoid(...HEAD),
        ellipsoid([0.068, 0.262, 0.16], [0.042, 0.03, 0.042]), ellipsoid([-0.068, 0.262, 0.16], [0.042, 0.03, 0.042]),
      ),
      // the roof of the mouth, seen when the jaw drops; the lip stays the back's color down to the mouth's line
      color: (p, n) => (n[1] < -0.3 && within(p, JAW) < 0.92 ? MOUTH : p[2] > 0.07 && p[1] > 0.185 && c.marks !== 'spots' && n[1] < 0.1 && Math.abs(p[1] - 0.229) > 0.011 ? wet(mix(c.back, c.cloud, 0.3), n) : hide(p, n)),
      bones: ['body', 'head'],
    },
    // the jaw and throat: pale, with a dark line where the lips meet
    {
      shape: ellipsoid(...JAW), bones: ['jaw'], group: 'jaw',
      color: (p, n) => {
        const h = within(p, HEAD)
        if (h < 0.92) return MOUTH
        if (h < 1.05 && n[1] > -0.2) return c.mark
        return wet(c.marks === 'spots' ? mix(c.belly, c.flank, 0.3) : c.belly, n, 0.3)
      },
    },
    // the tongue: thin, with a sticky bulb at its tip, rooted at the back of the mouth
    { shape: smooth(0.006, cone([0, 0.172, 0.08], [0, 0.18, 0.21], fat(0.0065), fat(0.0075)), ellipsoid([0, 0.18, 0.212], [0.013, fat(0.009), 0.012])), color: TONGUE, bones: ['tongue1', 'tongue2', 'tongue3'], group: 'tongue' },
  ]
  for (const [side, x] of SIDES) {
    const at = (p: Vec3) => sided(x, p)
    const eye = at([0.073, 0.272, 0.172])
    const out = dir([0.62 * x, 0.35, 0.7])
    parts.push(
      // the eye: gold in a dark rim, with a wide pupil lying level and a glint
      {
        shape: ellipsoid(eye, [0.036, 0.034, 0.034]), bones: ['head'], group: 'eyes', glow: true,
        color: (_p, n) => {
          const d = n[0] * out[0] + n[1] * out[1] + n[2] * out[2]
          if (d > 0.9 && n[1] > out[1] + 0.12) return [1, 1, 0.95]
          if (d > 0.62 && Math.abs(n[1] - out[1]) < 0.17) return PUPIL
          if (d > 0.36) return mix(GOLD, [0.55, 0.3, 0.04], step(0.95, 0.4, d))
          return d > 0.24 ? c.mark : mix(c.back, c.cloud, 0.3)
        },
      },
      // a nostril, and the round drum of the ear behind the eye
      { shape: sphere(at([0.03, 0.238, 0.246]), fat(0.005)), color: c.mark, bones: ['head'] },
      { shape: ellipsoid(at([0.107, 0.225, 0.1]), [fat(0.007), 0.019, 0.019]), color: (p) => (Math.hypot(p[1] - 0.225, p[2] - 0.1) < 0.011 ? mix(c.mark, c.back, 0.45) : c.mark), bones: ['head'] },
      // the arm: a slim upper arm and a forearm that thickens to the wrist
      { shape: smooth(0.012, cone(at(SHOULDER), at(ELBOW), 0.027, 0.02), cone(at(ELBOW), at(WRIST), 0.019, 0.016)), color: limb(at(SHOULDER)), bones: ['body', `${side}Arm`, `${side}Forearm`, `${side}Hand`] },
    )
    // four fingers turned in, each ending in a round pad
    const palm = at([WRIST[0], 0.013, WRIST[2] + 0.004])
    for (const tip of [[0.05, 0.008, 0.158], [0.08, 0.008, 0.18], [0.118, 0.008, 0.182], [0.15, 0.008, 0.156]] as Vec3[]) {
      parts.push(
        { shape: cone(palm, at(tip), fat(0.009), fat(0.0055)), color: (_p, n) => wet(c.back, n, 0.3), bones: [`${side}Hand`] },
        { shape: pad(at(tip), 0.0115), color: (_p, n) => wet(c.pad, n, 0.35), bones: [`${side}Hand`] },
      )
    }
    // the leg: a full thigh, a long shin and a thin foot, folded against the body
    const knee = at(KNEE), heel = at(HEEL), sole = at(SOLE)
    parts.push({
      shape: smooth(0.016, cone(at(HIP), knee, 0.052, 0.036), cone(knee, heel, 0.034, 0.021), cone(heel, sole, 0.02, 0.014)),
      color: limb(at(HIP)), bones: ['body', `${side}Thigh`, `${side}Shin`, `${side}Foot`, `${side}Toes`],
    })
    // five long toes with pads, and webbing between them
    const tips: Vec3[] = ([[0.118, 0.008, 0.035], [0.158, 0.008, 0.07], [0.2, 0.008, 0.082], [0.24, 0.008, 0.06], [0.262, 0.008, 0.012]] as Vec3[]).map(at)
    const web: Vec3[][] = []
    for (let k = 0; k < tips.length - 1; k++) web.push([sole, mix(sole, tips[k], 0.74), mix(sole, tips[k + 1], 0.74)])
    parts.push({ shape: membrane(web, fat(0.003)), color: (_p, n) => wet(mix(c.flank, c.back, 0.35), n, 0.3), bones: [`${side}Toes`], group: `${side}Web`, opacity: 0.9, noShadow: true })
    for (const tip of tips) {
      parts.push(
        { shape: cone(sole, tip, fat(0.009), fat(0.0055)), color: (_p, n) => wet(c.back, n, 0.3), bones: [`${side}Foot`, `${side}Toes`] },
        { shape: pad(tip, 0.011), color: (_p, n) => wet(c.pad, n, 0.35), bones: [`${side}Toes`] },
      )
    }
  }
  return { bones: BONES, parts, blend: 0.03, light: { ambient: 0.62, shadow: 0.5 } }
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

/**
 * The mouth opens wide and the tongue shoots straight out of the back of it at a fly, and back in. It only grows
 * along the way it points, between the roof of the mouth and the dropped jaw, so it never passes through the head.
 */
export function frogTongue(sk: Skeleton, t: number) {
  const u = (t % FLICK) / FLICK
  frogIdle(sk, u * 3)
  const open = env(u, 0.16, 0.26, 0.52, 0.64)
  const out = env(u, 0.27, 0.34, 0.42, 0.5)
  set(sk, 'head', X, -0.2 * open)
  set(sk, 'jaw', X, 0.78 * open)
  // level, whatever the jaw under it is doing
  aim(sk, 'tongue1', dir([0, -0.05, 1]), ramp(open, 0.3, 0.9))
  sk.size[sk.index('tongue1')] = 1 + 2.5 * out
  sk.update()
}

export const FROG: Species = {
  id: 'frog',
  name: 'frog',
  blurb: 'A tree frog of twenty bones in wet skin, striped or spotted by its look, that jumps, and shoots its tongue straight out.',
  detail: [5000, 15000, 40000, 80000],
  start: 40000,
  looks: Object.entries(LOOKS).map(([id, l]) => ({ id, label: l.label })),
  make: makeFrog,
  moves: [
    { name: 'jump', label: 'Jump', doing: 'jumping on the spot', seconds: LEAP, fps: 30, pose: frogJump },
    { name: 'tongue', label: 'Tongue', doing: 'flicking its tongue', seconds: FLICK, fps: 30, pose: frogTongue },
    { name: 'idle', label: 'Sit', doing: 'sitting and breathing', seconds: 3, fps: 12, pose: frogIdle },
  ],
  view: { target: [0, 0.24, 0.02], distance: 1.7, azimuth: 35, elevation: 14 },
}
