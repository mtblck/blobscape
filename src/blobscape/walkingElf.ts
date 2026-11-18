import type { Vec3 } from '../splat-core/blobs.ts'
import type { Creature } from '../splat-engine/body.ts'
import { legShifts, stepLegs, type Leg } from '../splat-engine/ik.ts'
import { blendPose } from '../splat-engine/mix.ts'
import { axisAngle, mulQ, rotate } from '../splat-engine/rig.ts'
import { Steps, type StepBody, type StepOptions } from '../splat-engine/steps.ts'
import { elfIdle, elfWalk, elfWave, makeElf } from '../splat-engine/zoo/elf.ts'
import { ElfCloth } from '../splat-engine/zoo/elfCloth.ts'

/**
 * The elf walking on its own feet, for any place it is steered about (Forest Walk's path, the pond): the footstep
 * planner places each foot and keeps it planted, the legs are bent to the feet, the walk clip swings only the arms and
 * body in time with the steps, and the cloak and plait swing after. The caller says where the body is each frame.
 */

/** Where a walker stands and how it moves, in plain numbers. */
export interface Walker {
  x: number
  z: number
  /** Which way it faces, radians: 0 is +z, positive turns toward +x. */
  heading: number
  /** Meters per second along its heading (negative backs up). */
  speed: number
}

/** The elf's legs, left first, as the footstep planner numbers its feet. */
export const ELF_LEGS: Leg[] = ['l', 'r'].map((s) => ({ upper: `${s}Thigh`, lower: `${s}Shin`, foot: `${s}Foot`, pole: [0, 0, 1] }))
/** How the elf steps on open ground. */
export const ELF_STEPS: StepOptions = { reach: 0.33, duration: 0.4, lift: 0.1 }
/** The most it comes down to reach a stride, meters. */
const ELF_CROUCH = 0.12
/** The most it rises over its pose to stand straight on higher ground, meters. */
const ELF_RISE = 0.3
/** The most one hip joint rises over the other as the pelvis tips, meters. */
const ELF_TIP = 0.04
/**
 * How much of a leg's full length the hips leave it, standing and walking. A leg 3% short of straight has its knee a
 * tenth of a meter forward, which standing still reads as a squat (Matt saw it in the pond), so at rest it is nearly straight.
 */
const STAND_SLACK = 0.996, WALK_SLACK = 0.97
/** The elf's walk clip's cycle: its arms and body swing once a stride; the legs go where the footsteps say. */
const STRIDE_SECONDS = 1.1
/** How long a wave lasts, seconds. */
export const WAVE_SECONDS = 4
const TAU = Math.PI * 2

/** Where a walk clip is in its cycle, from which foot is stepping and how far: the swing follows the steps. */
export function strideAt(steps: Steps, starts: number[]): number | null {
  for (let g = 0; g < steps.opts.groups.length; g++) {
    const f = steps.feet[steps.opts.groups[g][0]]
    if (f.t >= 0) return starts[g] + Math.PI * Math.min(1, f.t)
  }
  return null
}

/** Eases an angle toward another the short way round, at `rate` a second. */
export function toward(a: number, b: number, rate: number, dt: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + d * (1 - Math.exp(-rate * dt))
}

/** The body as the footstep planner sees it. */
export function stepBody(w: Walker, turn: number): StepBody {
  return { x: w.x, z: w.z, heading: w.heading, vx: Math.sin(w.heading) * w.speed, vz: Math.cos(w.heading) * w.speed, turn }
}

/** Eases hips toward a new drop: down at once (a leg must reach), back up gently. */
export function easeDrop(was: number, want: number, dt: number) {
  return want > was ? want : was + (want - was) * (1 - Math.exp(-dt * 4))
}

export class WalkingElf {
  readonly elf: Creature
  /** Where each foot goes, left then right. Planted feet never slide. */
  readonly steps: Steps
  /** The cloak and plait, swinging after the body. */
  readonly cloth: ElfCloth
  /** How fast a full walk is, meters a second: the swing of the arms is full by about half of it. */
  private readonly pace: number
  private stride = 0
  private walkWeight = 0
  private drop = 0
  private idleT = 0
  private posed = false
  private readonly tips = [0, 0]

  constructor(blobs: number, look: string, start: Walker, { steps = ELF_STEPS, pace = 1.45 }: { steps?: StepOptions; pace?: number } = {}) {
    this.elf = makeElf(blobs, look)
    this.pace = pace
    const sk = this.elf.skeleton
    this.cloth = new ElfCloth(sk)
    const ankle = (i: number): [number, number] => [sk.bones[i].head[0], sk.bones[i].head[2]]
    this.steps = new Steps(ELF_LEGS.map((l) => ({ home: ankle(sk.index(l.foot!)) })), stepBody(start, 0), steps)
  }

  /** Stands it still at `w`, feet square under it. */
  standAt(w: Walker) { this.steps.reset(stepBody(w, 0)) }

  /**
   * Poses the elf standing at `w`, which turns at `turned` radians a second, `dt` seconds on from the last pose.
   * `waving` is how many seconds into a wave it is, or null when it isn't waving. `ground`, if given, is the height of
   * the ground at a point: each foot stands on the ground under it, and a foot in the air rises from where it left to
   * where it lands.
   */
  pose(w: Walker, turned: number, dt: number, waving: number | null = null, ground?: (x: number, z: number) => number) {
    const sk = this.elf.skeleton
    this.idleT += dt
    const placed = this.steps.update(stepBody(w, turned), dt)
    // the arms and body swing with the steps: the left foot comes forward over the first half of the clip's cycle
    const at = strideAt(this.steps, [-Math.PI / 2, Math.PI / 2])
    if (at !== null) this.stride = toward(this.stride, at, 18, dt)
    const stepping = at !== null || Math.abs(w.speed) > 0.3
    this.walkWeight += ((stepping ? Math.min(1, Math.abs(w.speed) / (this.pace * 0.45) + 0.35) : 0) - this.walkWeight) * (1 - Math.exp(-dt * 6))
    if (waving !== null) elfWave(sk, waving)
    else elfIdle(sk, this.idleT)
    const rest = { rotation: sk.rotation.slice(), offset: sk.offset.slice() }
    if (this.walkWeight > 0.01) {
      elfWalk(sk, ((((this.stride / TAU) * STRIDE_SECONDS) % STRIDE_SECONDS) + STRIDE_SECONDS) % STRIDE_SECONDS)
      blendPose(sk, rest, this.walkWeight)
    } else {
      sk.rotation.set(rest.rotation)
      sk.offset.set(rest.offset)
    }
    // turn the whole elf to its heading, about the hips
    const turn = axisAngle([0, 1, 0], w.heading)
    sk.setRotation(0, mulQ(turn, sk.rotation.subarray(0, 4)))
    sk.offset.set(rotate(turn, sk.offset.subarray(0, 3)), 0)
    sk.place.set([w.x, 0, w.z])
    // each foot where the planner put it, the hips low enough for a long stride to reach
    const ankles = ELF_LEGS.map((l) => sk.bones[sk.index(l.foot!)].head[1])
    const under = (i: number) => {
      if (!ground) return 0
      const f = this.steps.feet[i]
      if (f.t < 0) return ground(f.at[0], f.at[1])
      const k = f.t * f.t * (3 - 2 * f.t)
      return ground(f.at[0], f.at[1]) * (1 - k) + ground(f.to[0], f.to[1]) * k
    }
    const targets = placed.map((p, i): Vec3 => [p[0], ankles[i] + p[1] + under(i), p[2]])
    // standing, the legs are all but straight; walking they keep some bend for the stride
    const slack = STAND_SLACK + (WALK_SLACK - STAND_SLACK) * Math.min(1, this.walkWeight)
    // as tall as the legs allow on the ground under the feet, and no further down than a long stride needs
    const shifts = legShifts(sk, ELF_LEGS, targets, slack)
    const want = Math.max(-ELF_RISE, Math.min(ELF_CROUCH, Math.max(...shifts)))
    // the first pose has no pose before it to ease from
    this.drop = this.posed ? easeDrop(this.drop, want, dt) : want
    sk.offset[1] -= this.drop
    // standing with one foot higher, the pelvis tips: that side's hip joint rises so its leg is as straight as the other
    const still = 1 - Math.min(1, this.walkWeight)
    ELF_LEGS.forEach((l, i) => {
      const tip = Math.min(ELF_TIP, Math.max(0, want - shifts[i])) * still
      this.tips[i] = this.posed ? this.tips[i] + (tip - this.tips[i]) * (1 - Math.exp(-dt * 6)) : tip
      sk.offset[sk.index(l.upper) * 3 + 1] += this.tips[i]
    })
    this.posed = true
    stepLegs(sk, ELF_LEGS, targets, placed.map((_, i) => this.steps.turned(i)))
    // the cloak and plait swing after the body, then clear the legs as they are now
    this.cloth.update(sk, dt)
  }
}
