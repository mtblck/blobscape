import type { Vec3 } from '../../splat-core/blobs.ts'
import { buildBody, mix, type Creature, type Part } from '../../splat-engine/body.ts'
import { X, Y, aim, dir, env, ramp, turn } from '../../splat-engine/posing.ts'
import { axisAngle, mulQ, rotate, type Bone, type Skeleton } from '../../splat-engine/rig.ts'
import { joinBuilt } from '../../splat-engine/sculpt.ts'
import { ELF_BONES, clearCloak, elfIdle, elfWalk, makeElf } from '../../splat-engine/zoo/elf.ts'
import { blendPose } from '../../splat-engine/mix.ts'
import type { ElfCloth } from '../../splat-engine/zoo/elfCloth.ts'
import { BOLT_POP, CAST, DODGE, RUN_SPEED, SWING, type Bolt, type Element, type Hero } from './game.ts'

/**
 * The hero: Forest Walk's elf with a sword in the right hand (on its own
 * bone, so the blade can lead a swing) and a glowing orb of magic in the
 * left (on its own bone, so it can swell as a spell leaves). The bolt of
 * magic is its own small actor, with sparks for when it hits.
 */

const STEEL: Vec3 = [0.78, 0.82, 0.88]
const ARCANE: Vec3 = [0.55, 0.78, 1]
/** The share of the hero's blobs that are the sword and the orb. */
const HELD = 0.09

export function makeHero(count: number, look = 'forest'): Creature {
  const rHand = ELF_BONES.findIndex((b) => b.name === 'rHand')
  const lHand = ELF_BONES.findIndex((b) => b.name === 'lHand')
  const grip: Vec3 = [-0.315, 0.9, 0.02]
  const orb: Vec3 = [0.325, 0.84, 0.07]
  const bones: Bone[] = [
    ...ELF_BONES,
    { name: 'sword', parent: rHand, head: grip, tail: [grip[0], grip[1], 0.86] },
    { name: 'orb', parent: lHand, head: orb },
  ]
  const g = (z: number): Vec3 => [grip[0], grip[1], z]
  const parts: Part[] = [
    // grip, guard, pommel and a long blade, its edge catching the light
    { shape: { tube: [g(-0.07), g(0.08)], r: [0.017, 0.017] }, color: [0.3, 0.17, 0.08], bones: ['sword'], density: 4 },
    { shape: { ball: g(-0.085), r: [0.026, 0.026, 0.026] }, color: [0.86, 0.68, 0.3], bones: ['sword'], density: 5 },
    { shape: { tube: [[grip[0] - 0.09, grip[1], 0.09], [grip[0] + 0.09, grip[1], 0.09]], r: [0.016, 0.016] }, color: [0.86, 0.68, 0.3], bones: ['sword'], density: 5 },
    {
      shape: { tube: [g(0.1), g(0.84)], r: [0.03, 0.006], flat: 0.25 },
      color: (_p, n, u) => mix(STEEL, [1, 1, 1], Math.abs(n[0]) > 0.8 ? 0.6 : 0.1 * u), glow: true, bones: ['sword'], density: 5, opacity: 0.97,
    },
    // the orb: a bright core in a soft halo
    { shape: { ball: orb, r: [0.04, 0.04, 0.04] }, color: [0.85, 0.95, 1], glow: true, bones: ['orb'], density: 8, opacity: 0.95 },
    { shape: { ball: orb, r: [0.085, 0.085, 0.085] }, color: ARCANE, glow: true, bones: ['orb'], density: 3, opacity: 0.22, size: 1.6 },
  ]
  // the elf itself, on the longer list of bones, and what it carries as a build of its own on the same bones
  const held = buildBody({ bones, parts, blend: 0.07 }, Math.round(count * HELD), 5)
  const elf = makeElf(count - held.blobs.count, look, bones)
  const b = joinBuilt(elf, held)
  return { blobs: b.blobs, skin: b.skin, skeleton: elf.skeleton }
}

/** What the stage keeps between frames for posing the hero. */
export interface HeroClock {
  idle: number
  walk: number
  /** Seconds since the hero went down, or −1. */
  down: number
  /** Blink while the hero can't be hurt (off under reduced motion, where it only staggers). */
  flicker: boolean
  /** The cloak and plait as cloth, swinging after the run, the dodge and the fall (without it the cloak only clears the legs). */
  cloth?: ElfCloth
}

const STRIDE_METERS = 1.5, STRIDE_SECONDS = 1.1

/**
 * Poses the hero from the game: standing blending into a run with the
 * speed, the sword held ready in front, a swing (wind up over the
 * shoulder, cut across, follow through) or a cast (the left arm thrown
 * forward), a hop back to dodge, a stagger when hurt, and a fall when down.
 */
export function poseHero(sk: Skeleton, h: Hero, clock: HeroClock, dt: number) {
  clock.idle += dt
  const dodging = h.dodgeT >= 0 ? Math.min(1, h.dodgeT / DODGE) : -1
  // a dodge is a hop, not running backwards: the legs don't walk through it
  if (dodging < 0) clock.walk += (dt * h.speed * STRIDE_SECONDS) / STRIDE_METERS
  elfIdle(sk, clock.idle)
  const rest = { rotation: sk.rotation.slice(), offset: sk.offset.slice() }
  const w = dodging >= 0 ? 0 : Math.min(1, Math.abs(h.speed) / (RUN_SPEED * 0.35))
  if (w > 0) {
    elfWalk(sk, ((clock.walk % STRIDE_SECONDS) + STRIDE_SECONDS) % STRIDE_SECONDS)
    blendPose(sk, rest, w)
    clearCloak(sk)
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

  // dodge: a crouch, a low hop back with the knees tucked and the body leaning in, and a landing
  if (dodging >= 0) {
    const hop = Math.sin(Math.PI * dodging), crouch = env(dodging, 0, 0.15, 0.75, 1)
    sk.offset[1] += 0.22 * hop - 0.12 * crouch * (1 - hop)
    turn(sk, 'chest', X, 0.25 * crouch)
    turn(sk, 'head', X, -0.15 * crouch)
    for (const s of ['l', 'r']) { turn(sk, `${s}Thigh`, X, -0.7 * crouch); turn(sk, `${s}Shin`, X, 1.1 * crouch) }
  }

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
  // the cloak and plait swing after the body (and clear the legs); a blinked-out hero isn't drawn, so it waits
  if (clock.cloth && sk.rootScale === 1) clock.cloth.update(sk, dt)
  else sk.update()
}

/**
 * A cut: drawn back low on the right, swept flat across in front at about knee height (slimes are low), and through to
 * the left, the body bending into it. The blade is in front of the hero, low, for the whole time a swing can hit.
 */
function swing(sk: Skeleton, u: number) {
  type Pose = { arm: Vec3; fore: Vec3; sword: Vec3 }
  const WIND: Pose = { arm: dir([-0.75, -0.6, 0.05]), fore: dir([-0.85, -0.4, 0.2]), sword: dir([-1, -0.25, 0.05]) }
  const FRONT: Pose = { arm: dir([-0.15, -0.45, 0.9]), fore: dir([0, -0.3, 1]), sword: dir([0.05, -0.2, 1]) }
  const CUT: Pose = { arm: dir([0.4, -0.55, 0.75]), fore: dir([0.7, -0.4, 0.7]), sword: dir([0.9, -0.1, 0.75]) }
  const lerp = (a: Vec3, b: Vec3, t: number) => dir([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])
  const between = (a: Pose, b: Pose, t: number): Pose => ({ arm: lerp(a.arm, b.arm, t), fore: lerp(a.fore, b.fore, t), sword: lerp(a.sword, b.sword, t) })
  let to: Pose, amount: number
  if (u < 0.22) { to = WIND; amount = ramp(u, 0, 0.2) }
  else if (u < 0.58) {
    // right to front to left, quickest through the middle
    const t = ramp(u, 0.22, 0.56)
    to = t < 0.5 ? between(WIND, FRONT, t * 2) : between(FRONT, CUT, t * 2 - 1)
    amount = 1
  } else { to = CUT; amount = 1 - ramp(u, 0.62, 1) }
  aim(sk, 'rArm', to.arm, amount)
  aim(sk, 'rForearm', to.fore, amount)
  aim(sk, 'rHand', to.fore, amount)
  aim(sk, 'sword', to.sword, amount)
  // the body turns into the cut and bends down to it
  const twist = u < 0.22 ? -0.3 * ramp(u, 0, 0.2) : u < 0.58 ? -0.3 + 0.6 * ramp(u, 0.22, 0.56) : 0.3 * (1 - ramp(u, 0.62, 1))
  const bend = LEAN * env(u, 0, 0.24, 0.6, 1)
  turn(sk, 'spine', Y, twist * 0.5)
  turn(sk, 'chest', Y, twist * 0.5)
  turn(sk, 'spine', X, bend * 0.6)
  turn(sk, 'chest', X, bend * 0.4)
}
/** How far the hero bends into a swing, radians. */
const LEAN = 0.55

// --- the bolt of magic

export const SPARKS = 12

/** A bolt's colors: its core, the glow round it, its haze, the tail from root to tip, and every other spark. */
const BOLT_LOOK: Record<Element, { core: Vec3; glow: Vec3; haze: Vec3; tail: [Vec3, Vec3]; spark: Vec3 }> = {
  fire: { core: [1, 0.95, 0.7], glow: [1, 0.6, 0.18], haze: [1, 0.32, 0.08], tail: [[1, 0.8, 0.4], [0.95, 0.25, 0.05]], spark: [1, 0.55, 0.15] },
  frost: { core: [1, 1, 1], glow: [0.45, 0.7, 1], haze: [0.35, 0.4, 1], tail: [[0.75, 0.9, 1], [0.35, 0.35, 1]], spark: ARCANE },
}

export function makeBolt(count = 900, element: Element = 'frost'): Creature {
  const look = BOLT_LOOK[element]
  const bones: Bone[] = [
    { name: 'root', parent: -1, head: [0, 0, 0] },
    { name: 'orb', parent: 0, head: [0, 0, 0] },
    ...Array.from({ length: SPARKS }, (_, i): Bone => ({ name: `spark${i}`, parent: 0, head: [0, 0, 0] })),
  ]
  const parts: Part[] = [
    { shape: { ball: [0, 0, 0], r: [0.07, 0.07, 0.07] }, color: look.core, glow: true, bones: ['orb'], opacity: 1, density: 3 },
    { shape: { ball: [0, 0, 0], r: [0.13, 0.13, 0.13] }, color: look.glow, glow: true, bones: ['orb'], opacity: 0.55, density: 1.5 },
    { shape: { ball: [0, 0, 0], r: [0.24, 0.24, 0.24] }, color: look.haze, glow: true, bones: ['orb'], opacity: 0.2, size: 2 },
    // a tail streaming out behind
    { shape: { fill: [[0, 0, -0.05], [0, 0, -0.75]], r: [0.09, 0.0] }, color: (_p, _n, u) => mix(look.tail[0], look.tail[1], u), glow: true, opacity: (_p, u) => 0.6 * (1 - u), bones: ['orb'], size: 0.7 },
    ...Array.from({ length: SPARKS }, (_, i): Part => ({ shape: { ball: [0, 0, 0], r: [0.035, 0.035, 0.035] }, color: i % 2 ? look.spark : look.core, glow: true, bones: [`spark${i}`], opacity: 0.9, density: 2 })),
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
