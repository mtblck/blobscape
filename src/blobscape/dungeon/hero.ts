import type { Vec3 } from '../../splat-core/blobs.ts'
import { buildBody, mix, type Creature, type Part } from '../../splat-engine/body.ts'
import { X, Y, aim, dir, env, ramp, turn } from '../../splat-engine/posing.ts'
import { axisAngle, mulQ, rotate, type Bone, type Skeleton } from '../../splat-engine/rig.ts'
import { elfIdle, elfSpec, elfWalk } from '../../splat-engine/zoo/elf.ts'
import { blendPose } from '../forest/forest.ts'
import { BOLT_POP, CAST, RUN_SPEED, SWING, type Bolt, type Hero } from './game.ts'

/**
 * The hero: Forest Walk's elf with a sword in the right hand (on its own
 * bone, so the blade can lead a swing) and a glowing orb of magic in the
 * left (on its own bone, so it can swell as a spell leaves). The bolt of
 * magic is its own small actor, with sparks for when it hits.
 */

const STEEL: Vec3 = [0.78, 0.82, 0.88]
const ARCANE: Vec3 = [0.55, 0.78, 1]

export function makeHero(count: number, look = 'forest'): Creature {
  const base = elfSpec(look)
  const rHand = base.bones.findIndex((b) => b.name === 'rHand')
  const lHand = base.bones.findIndex((b) => b.name === 'lHand')
  const grip: Vec3 = [-0.315, 0.9, 0.02]
  const orb: Vec3 = [0.325, 0.84, 0.07]
  const bones: Bone[] = [
    ...base.bones,
    { name: 'sword', parent: rHand, head: grip, tail: [grip[0], grip[1], 0.86] },
    { name: 'orb', parent: lHand, head: orb },
  ]
  const g = (z: number): Vec3 => [grip[0], grip[1], z]
  const parts: Part[] = [
    ...base.parts,
    // grip, guard, pommel and a long blade, its edge catching the light
    { shape: { tube: [g(-0.07), g(0.08)], r: [0.017, 0.017] }, colour: [0.3, 0.17, 0.08], bones: ['sword'], density: 4 },
    { shape: { ball: g(-0.085), r: [0.026, 0.026, 0.026] }, colour: [0.86, 0.68, 0.3], bones: ['sword'], density: 5 },
    { shape: { tube: [[grip[0] - 0.09, grip[1], 0.09], [grip[0] + 0.09, grip[1], 0.09]], r: [0.016, 0.016] }, colour: [0.86, 0.68, 0.3], bones: ['sword'], density: 5 },
    {
      shape: { tube: [g(0.1), g(0.84)], r: [0.03, 0.006], flat: 0.25 },
      colour: (_p, n, u) => mix(STEEL, [1, 1, 1], Math.abs(n[0]) > 0.8 ? 0.6 : 0.1 * u), glow: true, bones: ['sword'], density: 5, opacity: 0.97,
    },
    // the orb: a bright core in a soft halo
    { shape: { ball: orb, r: [0.04, 0.04, 0.04] }, colour: [0.85, 0.95, 1], glow: true, bones: ['orb'], density: 8, opacity: 0.95 },
    { shape: { ball: orb, r: [0.085, 0.085, 0.085] }, colour: ARCANE, glow: true, bones: ['orb'], density: 3, opacity: 0.22, size: 1.6 },
  ]
  const b = buildBody({ bones, parts, blend: base.blend }, count, 5)
  return { blobs: b.blobs, skin: b.skin, skeleton: b.skeleton }
}

/** What the stage keeps between frames for posing the hero. */
export interface HeroClock {
  idle: number
  walk: number
  /** Seconds since the hero went down, or −1. */
  down: number
  /** Blink while the hero can't be hurt (off under reduced motion, where it only staggers). */
  flicker: boolean
}

const STRIDE_METRES = 1.5, STRIDE_SECONDS = 1.1

/**
 * Poses the hero from the game: standing blending into a run with the
 * speed, the sword held ready in front, a swing (wind up over the
 * shoulder, cut across, follow through) or a cast (the left arm thrown
 * forward), a stagger when hurt, and a fall when down.
 */
export function poseHero(sk: Skeleton, h: Hero, clock: HeroClock, dt: number) {
  clock.idle += dt
  clock.walk += (dt * h.speed * STRIDE_SECONDS) / STRIDE_METRES
  elfIdle(sk, clock.idle)
  const rest = { rotation: sk.rotation.slice(), offset: sk.offset.slice() }
  const w = Math.min(1, Math.abs(h.speed) / (RUN_SPEED * 0.35))
  if (w > 0) {
    elfWalk(sk, ((clock.walk % STRIDE_SECONDS) + STRIDE_SECONDS) % STRIDE_SECONDS)
    blendPose(sk, rest, w)
  }
  const swinging = h.swingT >= 0 ? h.swingT / SWING : -1
  const casting = h.castT >= 0 ? h.castT / CAST : -1

  // ready: the sword held up in front, unless a swing is under way
  const ready = swinging < 0 ? 1 : 1 - env(swinging, 0, 0.12, 0.8, 1)
  aim(sk, 'rArm', dir([-0.25, -0.85, 0.35]), ready * 0.9)
  aim(sk, 'rForearm', dir([0.05, -0.25, 1]), ready)
  aim(sk, 'rHand', dir([0.05, -0.25, 1]), ready)
  aim(sk, 'sword', dir([0.12, 0.85, 0.55]), ready)
  if (swinging >= 0) swing(sk, swinging)

  // the left hand held a little out, the orb in it; thrown forward to cast
  aim(sk, 'lArm', dir([0.35, -0.85, 0.15]), 0.6)
  if (casting >= 0) {
    const k = env(casting, 0, 0.3, 0.6, 1)
    aim(sk, 'lArm', dir([0.12, 0.12, 1]), k)
    aim(sk, 'lForearm', dir([0.02, 0.18, 1]), k)
    aim(sk, 'lHand', dir([0, 0.5, 1]), k)
    turn(sk, 'chest', Y, 0.35 * k)
  }
  // the orb is as big as the magic left, and swells as a spell leaves
  const orb = sk.index('orb')
  sk.size[orb] = (0.45 + 0.55 * (h.mp / 100)) * (1 + (casting >= 0 ? 1.6 * env(casting, 0.1, 0.35, 0.4, 0.7) : 0))

  // hurt: thrown back for a moment
  if (h.hurt > 0 && clock.down < 0) {
    const k = ramp(h.hurt, 0.5, 0.85)
    turn(sk, 'chest', X, -0.35 * k)
    turn(sk, 'head', X, -0.3 * k)
  }

  let lean = axisAngle(X, 0)
  if (clock.down >= 0) {
    // down: knees go, then a fall forward onto the floor
    clock.down += dt
    const kneel = ramp(clock.down, 0, 0.4), fall = ramp(clock.down, 0.3, 1.1)
    sk.offset[1] -= 0.45 * kneel + 0.42 * fall
    for (const s of ['l', 'r']) { turn(sk, `${s}Thigh`, X, -1.2 * kneel * (1 - fall)); turn(sk, `${s}Shin`, X, 1.6 * kneel * (1 - fall)) }
    lean = axisAngle(X, 1.35 * fall)
  }

  // the whole hero turned to its heading, about the hips
  const facing = mulQ(axisAngle(Y, h.heading), lean)
  sk.setRotation(0, mulQ(facing, sk.rotation.subarray(0, 4)))
  sk.offset.set(rotate(axisAngle(Y, h.heading), sk.offset.subarray(0, 3)), 0)
  sk.place.set([h.x, 0, h.z])
  // the grace after a hurt shows as a slow blink: off for 0.12 s in every 0.45 s, about two blinks, well under three flashes a second
  sk.rootScale = clock.flicker && h.hurt > 0 && clock.down < 0 && h.hurt % 0.45 < 0.12 ? 0.0001 : 1
  sk.update()
}

/** A cut: wound up over the right shoulder, swept across in front to the left, and back. */
function swing(sk: Skeleton, u: number) {
  const WIND = { arm: dir([-0.7, 0.55, -0.15]), fore: dir([-0.35, 0.9, -0.25]), sword: dir([0.1, 0.5, -0.9]) }
  const CUT = { arm: dir([0.35, -0.05, 1]), fore: dir([0.75, -0.2, 0.75]), sword: dir([0.95, -0.25, 0.2]) }
  const lerp = (a: Vec3, b: Vec3, t: number) => dir([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])
  let to: typeof WIND, amount: number
  if (u < 0.25) { to = WIND; amount = ramp(u, 0, 0.22) }
  else if (u < 0.55) {
    const t = ramp(u, 0.25, 0.5)
    to = { arm: lerp(WIND.arm, CUT.arm, t), fore: lerp(WIND.fore, CUT.fore, t), sword: lerp(WIND.sword, CUT.sword, t) }
    amount = 1
  } else { to = CUT; amount = 1 - ramp(u, 0.6, 1) }
  aim(sk, 'rArm', to.arm, amount)
  aim(sk, 'rForearm', to.fore, amount)
  aim(sk, 'rHand', to.fore, amount)
  aim(sk, 'sword', to.sword, amount)
  // the body turns into the cut
  const twist = u < 0.25 ? -0.45 * ramp(u, 0, 0.22) : u < 0.55 ? -0.45 + 1.05 * ramp(u, 0.25, 0.5) : 0.6 * (1 - ramp(u, 0.6, 1))
  turn(sk, 'spine', Y, twist * 0.5)
  turn(sk, 'chest', Y, twist * 0.5)
}

// --- the bolt of magic

export const SPARKS = 12

export function makeBolt(count = 900): Creature {
  const bones: Bone[] = [
    { name: 'root', parent: -1, head: [0, 0, 0] },
    { name: 'orb', parent: 0, head: [0, 0, 0] },
    ...Array.from({ length: SPARKS }, (_, i): Bone => ({ name: `spark${i}`, parent: 0, head: [0, 0, 0] })),
  ]
  const parts: Part[] = [
    { shape: { ball: [0, 0, 0], r: [0.07, 0.07, 0.07] }, colour: [1, 1, 1], glow: true, bones: ['orb'], opacity: 1, density: 3 },
    { shape: { ball: [0, 0, 0], r: [0.13, 0.13, 0.13] }, colour: [0.45, 0.7, 1], glow: true, bones: ['orb'], opacity: 0.55, density: 1.5 },
    { shape: { ball: [0, 0, 0], r: [0.24, 0.24, 0.24] }, colour: [0.35, 0.4, 1], glow: true, bones: ['orb'], opacity: 0.2, size: 2 },
    // a tail streaming out behind
    { shape: { fill: [[0, 0, -0.05], [0, 0, -0.75]], r: [0.09, 0.0] }, colour: (_p, _n, u) => mix([0.75, 0.9, 1], [0.35, 0.35, 1], u), glow: true, opacity: (_p, u) => 0.6 * (1 - u), bones: ['orb'], size: 0.7 },
    ...Array.from({ length: SPARKS }, (_, i): Part => ({ shape: { ball: [0, 0, 0], r: [0.035, 0.035, 0.035] }, colour: i % 2 ? ARCANE : [1, 1, 1], glow: true, bones: [`spark${i}`], opacity: 0.9, density: 2 })),
  ]
  const b = buildBody({ bones, parts, blend: 0.05 }, count, 17)
  return { blobs: b.blobs, skin: b.skin, skeleton: b.skeleton }
}

/** Flying: the orb with its tail, spinning sparks hidden. Popped: the orb flashes out and the sparks fly. */
export function poseBolt(sk: Skeleton, b: Bolt) {
  sk.reset()
  sk.place.set([b.x, 1.0, b.z])
  sk.setRotation(0, axisAngle(Y, b.heading))
  if (!b.popped) {
    sk.size[1] = 1 + 0.12 * Math.sin(b.t * 40)
    for (let i = 0; i < SPARKS; i++) sk.size[2 + i] = 0
  } else {
    const u = b.t / BOLT_POP
    sk.size[1] = u < 0.15 ? 1 + u * 8 : 0
    for (let i = 0; i < SPARKS; i++) {
      const y = 1 - (i + 0.5) / SPARKS * 2, r = Math.sqrt(1 - y * y), a = i * 2.399963
      const d = 2.4 * Math.sqrt(u) * 0.6
      sk.offset.set([Math.cos(a) * r * d, y * d - 0.6 * u * u, Math.sin(a) * r * d], (2 + i) * 3)
      sk.size[2 + i] = 1.2 * (1 - u)
    }
  }
  sk.update()
}
