import type { Vec3 } from '../../splat-core/blobs.ts'
import type { Creature } from '../../splat-engine/body.ts'
import { poseIdle } from '../../splat-engine/creature.ts'
import { hipDrop, stepLegs, type Leg } from '../../splat-engine/ik.ts'
import { blendPose } from '../../splat-engine/mix.ts'
import { axisAngle, mulQ, rotate, type Skeleton } from '../../splat-engine/rig.ts'
import { Steps, type StepBody } from '../../splat-engine/steps.ts'
import { clearCloak, elfIdle, elfWalk, elfWave, makeElf } from '../../splat-engine/zoo/elf.ts'
import { makeFox, trot } from '../../splat-engine/zoo/fox.ts'
import { makeGround } from './ground.ts'
import { makePlant, type Plant, type Season } from './plants.ts'
import { FOX_SPOT, KINDS, PER_TILE, RING, RULES, TILE, WALK_SPEED, layout, obstacles, slotOf, stepFox, stepWalker, tileWindow, type Input, type Kind, type Placed, type Walker } from './world.ts'

/**
 * The forest walk, without the drawing: the elf, a ring of ground tiles and a
 * ring of prebuilt plants, and each frame's bookkeeping. As the elf walks,
 * tiles that fall out of reach are handed the next stretch of path, and their
 * plants are given that stretch's layout, hidden until the elf comes near and
 * they grow. Every actor stays in one SplatWorld for the whole walk; nothing
 * is rebuilt, only posed.
 */

export interface ForestOptions {
  /** Blob budget, relative: 1 is about 180k blobs in all. */
  detail: number
  season: Season
  /** The elf's look (forest, dusk, autumn). */
  look: string
  /** Which forest: what grows where. */
  seed: number
}

interface Slot {
  plant: Plant
  kind: Kind
  n: number
  /** Tile this plant stands on now, or null when hidden. */
  at: Placed | null
  /** When it started growing (seconds of forest time), or null while waiting for the elf to come near. */
  since: number | null
}

/** The elf's blob count at detail 1. */
export const ELF_BLOBS = 20000
/** The fox's, at detail 1. */
export const FOX_BLOBS = 9000
/** The fox is the Creature page's, at this size. */
export const FOX_SIZE = 0.55
/** The elf's walk clip's cycle: its arms and body swing once a stride; the legs go where the footsteps say. */
const STRIDE_SECONDS = 1.1
const WAVE_SECONDS = 4
const TAU = Math.PI * 2

/** The elf's legs, left first, as the footstep planner numbers its feet. */
const ELF_LEGS: Leg[] = ['l', 'r'].map((s) => ({ upper: `${s}Thigh`, lower: `${s}Shin`, foot: `${s}Foot`, pole: [0, 0, 1] }))
const ELF_STEPS = { reach: 0.33, duration: 0.4, lift: 0.1 }
/** The most either comes down to reach a stride, meters. */
const ELF_CROUCH = 0.12
/** The fox's legs, front left, front right, back left, back right; a trot moves them in diagonal pairs. */
const FOX_LEGS = ['fl', 'fr', 'bl', 'br'].map((l) => ({ upper: `${l}Upper`, lower: `${l}Lower`, pole: [0, 0, l[0] === 'f' ? 1 : -1] as Vec3 }))
const FOX_CROUCH = 0.09 * FOX_SIZE / 0.55
const FOX_STEPS = { reach: 0.13 * FOX_SIZE / 0.55, duration: 0.22, lift: 0.06, groups: [[0, 3], [1, 2]] }

/** Where the walk clip is in its cycle, from which foot is stepping and how far: the swing follows the steps. */
function strideAt(steps: Steps, starts: number[]): number | null {
  for (let g = 0; g < steps.opts.groups.length; g++) {
    const f = steps.feet[steps.opts.groups[g][0]]
    if (f.t >= 0) return starts[g] + Math.PI * Math.min(1, f.t)
  }
  return null
}

/** Eases an angle toward another the short way round, at `rate` a second. */
function toward(a: number, b: number, rate: number, dt: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + d * (1 - Math.exp(-rate * dt))
}

export class Forest {
  readonly elf: Creature
  /** A fox that walks with the elf, on the same kind of footsteps, four feet in two pairs. */
  readonly fox: Creature
  readonly grounds: Creature[]
  readonly slots: Slot[][]
  /** Every actor for the SplatWorld, elf first, then the fox. */
  readonly actors: Creature[]
  walker: Walker = { x: 0, z: 0, heading: 0, speed: 0 }
  foxWalker: Walker = { x: FOX_SPOT[0], z: FOX_SPOT[1], heading: 0, speed: 0 }
  /** Where each foot goes: the elf's two and the fox's four. Planted feet never slide. */
  readonly elfSteps: Steps
  readonly foxSteps: Steps
  /** The fox's legs, each ending at its paw. */
  private readonly foxLegs: Leg[]
  /** Plants grow as the elf comes near (true), or stand grown already. */
  sprout = true
  wind = 1
  seed: number
  time = 0
  /** Meters walked, either way. */
  walked = 0
  private tileOf = new Array<number | null>(RING).fill(null)
  private stride = 0
  private foxStride = 0
  private walkWeight = 0
  private foxWeight = 0
  private elfDrop = 0
  private foxDrop = 0
  private turned = { elf: 0, fox: 0 }
  private idleT = 0
  private waveUntil = -1
  private solid: { x: number; z: number; r: number }[] = []
  private solidFor = ''

  readonly opts: ForestOptions

  constructor(opts: ForestOptions) {
    this.opts = opts
    this.seed = opts.seed
    this.elf = makeElf(Math.round(ELF_BLOBS * Math.max(0.5, opts.detail)), opts.look)
    this.fox = makeFox(Math.round(FOX_BLOBS * Math.max(0.5, opts.detail)), 'red')
    const esk = this.elf.skeleton, fsk = this.fox.skeleton
    const ankle = (i: number): [number, number] => [esk.bones[i].head[0], esk.bones[i].head[2]]
    this.elfSteps = new Steps(ELF_LEGS.map((l) => ({ home: ankle(esk.index(l.foot!)) })), this.body(this.walker, 0), ELF_STEPS)
    const hips = fsk.bones[0].head
    this.foxLegs = FOX_LEGS.map((l) => ({ ...l, tip: fsk.bones[fsk.index(l.lower)].tail! }))
    this.foxSteps = new Steps(FOX_LEGS.map((l) => {
      const paw = fsk.bones[fsk.index(l.lower)].tail!
      return { home: [(paw[0] - hips[0]) * FOX_SIZE, (paw[2] - hips[2]) * FOX_SIZE] as [number, number] }
    }), this.body(this.foxWalker, 0), FOX_STEPS)
    this.grounds = Array.from({ length: RING }, (_, j) => makeGround(j, opts.detail, opts.season))
    this.slots = Array.from({ length: RING }, (_, j) => {
      const out: Slot[] = []
      for (const kind of KINDS) for (let n = 0; n < PER_TILE[kind]; n++) {
        // each ring slot's plant is its own: a different seed for every slot and place
        const plant = makePlant(kind, 7919 * (j + 1) + 104729 * (KINDS.indexOf(kind) + 1) + 31 * n, opts.detail, opts.season)
        out.push({ plant, kind, n, at: null, since: null })
      }
      return out
    })
    this.actors = [this.elf, this.fox, ...this.grounds, ...this.slots.flat().map((s) => s.plant)]
    this.update(0, { forward: 0, turn: 0 })
  }

  get blobCount() { return this.actors.reduce((s, a) => s + a.blobs.count, 0) }
  get plantCount() { return this.slots.reduce((s, row) => s + row.length, 0) }
  /** Plants standing (or growing) right now. */
  get growing() { return this.slots.reduce((s, row) => s + row.filter((p) => p.at && p.since !== null).length, 0) }
  /** The tiles in the ring now, for tests. */
  get tiles() { return [...this.tileOf] }

  /** Plants a different forest round the elf: everything regrows. */
  reseed(seed: number) {
    this.seed = seed
    this.tileOf.fill(null)
    this.solidFor = ''
  }

  /** Stands the elf and the fox still where they were (a new forest grown round them), feet square under them. */
  standAt(elf: Walker, fox: Walker) {
    this.walker = { ...elf, speed: 0 }
    this.foxWalker = { ...fox, speed: 0 }
    this.elfSteps.reset(this.body(this.walker, 0))
    this.foxSteps.reset(this.body(this.foxWalker, 0))
  }

  wave() { this.waveUntil = this.time + WAVE_SECONDS }
  get waving() { return this.time < this.waveUntil }

  /** One frame: move the elf, hand out tiles, grow and sway the plants, pose the elf. */
  update(dt: number, input: Input) {
    this.time += dt
    const was = this.walker
    const tiles = tileWindow(was.z, was.heading)
    const key = `${this.seed}:${tiles[0]}`
    if (key !== this.solidFor) { this.solid = obstacles(tiles, this.seed); this.solidFor = key }
    this.walker = stepWalker(was, input, dt, this.solid)
    this.turned.elf = dt > 0 ? (this.walker.heading - was.heading) / dt : 0
    const foxWas = this.foxWalker
    this.foxWalker = stepFox(foxWas, this.walker, dt, this.solid)
    this.turned.fox = dt > 0 ? (this.foxWalker.heading - foxWas.heading) / dt : 0
    this.walked += Math.hypot(this.walker.x - was.x, this.walker.z - was.z)
    if (Math.abs(this.walker.speed) > 0.3) this.waveUntil = -1

    for (const i of tileWindow(this.walker.z, this.walker.heading)) this.give(i)
    const { x, z } = this.walker
    for (const row of this.slots) for (const s of row) {
      const sk = s.plant.skeleton
      if (!s.at) continue
      if (s.since === null) {
        const near = Math.hypot(s.at.x - x, s.at.z - z) < RULES[s.kind].sprout
        if (!this.sprout) s.since = -Infinity
        else if (near) s.since = this.time
        else continue
      }
      sk.place.set([s.at.x, 0, s.at.z])
      s.plant.pose(this.time - s.since, this.time, s.at.yaw, s.at.scale, this.wind)
    }
    this.poseElf(dt)
    this.poseFox(dt)
  }

  /** The body as the footstep planner sees it. */
  private body(w: Walker, turn: number): StepBody {
    return { x: w.x, z: w.z, heading: w.heading, vx: Math.sin(w.heading) * w.speed, vz: Math.cos(w.heading) * w.speed, turn }
  }

  /** Hands ring slot i % RING the tile i, if it doesn't hold it already. */
  private give(i: number) {
    const j = slotOf(i)
    if (this.tileOf[j] === i) return
    this.tileOf[j] = i
    const g = this.grounds[j].skeleton
    g.place[2] = (i - j) * TILE
    g.update()
    const placed = layout(i, this.seed)
    for (const s of this.slots[j]) {
      s.at = placed.find((p) => p.kind === s.kind && p.n === s.n) ?? null
      s.since = null
      hide(s.plant.skeleton, this.walker)
    }
  }

  private poseElf(dt: number) {
    const sk = this.elf.skeleton
    const { heading } = this.walker
    this.idleT += dt
    const placed = this.elfSteps.update(this.body(this.walker, this.turned.elf), dt)
    // the arms and body swing with the steps: the left foot comes forward over the first half of the clip's cycle
    const at = strideAt(this.elfSteps, [-Math.PI / 2, Math.PI / 2])
    if (at !== null) this.stride = toward(this.stride, at, 18, dt)
    const stepping = at !== null || Math.abs(this.walker.speed) > 0.3
    this.walkWeight += ((stepping ? Math.min(1, Math.abs(this.walker.speed) / (WALK_SPEED * 0.45) + 0.35) : 0) - this.walkWeight) * (1 - Math.exp(-dt * 6))
    if (this.waving) elfWave(sk, WAVE_SECONDS - (this.waveUntil - this.time))
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
    const turn = axisAngle([0, 1, 0], heading)
    sk.setRotation(0, mulQ(turn, sk.rotation.subarray(0, 4)))
    sk.offset.set(rotate(turn, sk.offset.subarray(0, 3)), 0)
    sk.place.set([this.walker.x, 0, this.walker.z])
    // each foot where the planner put it, the hips low enough for a long stride to reach
    const ankles = ELF_LEGS.map((l) => sk.bones[sk.index(l.foot!)].head[1])
    const targets = placed.map((p, i): Vec3 => [p[0], ankles[i] + p[1], p[2]])
    this.elfDrop = this.ease(this.elfDrop, Math.min(ELF_CROUCH, hipDrop(sk, ELF_LEGS, targets)), dt)
    sk.offset[1] -= this.elfDrop
    stepLegs(sk, ELF_LEGS, targets, placed.map((_, i) => this.elfSteps.turned(i)))
    // the cloak swings clear of the legs as they are now
    clearCloak(sk)
    sk.update()
  }

  private poseFox(dt: number) {
    const sk = this.fox.skeleton, w = this.foxWalker
    const placed = this.foxSteps.update(this.body(w, this.turned.fox), dt)
    // the trot's front left paw is lifted through the second half of its cycle
    const at = strideAt(this.foxSteps, [Math.PI / 2, (3 * Math.PI) / 2])
    if (at !== null) this.foxStride = toward(this.foxStride, at, 24, dt)
    this.foxWeight += ((at !== null || Math.abs(w.speed) > 0.3 ? 1 : 0) - this.foxWeight) * (1 - Math.exp(-dt * 6))
    poseIdle(sk, this.idleT)
    const rest = { rotation: sk.rotation.slice(), offset: sk.offset.slice() }
    if (this.foxWeight > 0.01) {
      trot(sk, (((this.foxStride / TAU) % 1) + 1) % 1 / 1.4)
      blendPose(sk, rest, this.foxWeight)
    }
    // smaller than the Creature page's fox, turned to its heading about the hips, which stand over (x, z)
    const turn = axisAngle([0, 1, 0], w.heading), hips = sk.bones[0].head
    sk.rootScale = FOX_SIZE
    sk.setRotation(0, mulQ(turn, sk.rotation.subarray(0, 4)))
    const o = rotate(turn, sk.offset.subarray(0, 3))
    sk.offset.set([o[0] * FOX_SIZE - hips[0], o[1] * FOX_SIZE - hips[1] * (1 - FOX_SIZE), o[2] * FOX_SIZE - hips[2]], 0)
    sk.place.set([w.x, 0, w.z])
    const targets = placed.map((p): Vec3 => [p[0], p[1], p[2]])
    this.foxDrop = this.ease(this.foxDrop, Math.min(FOX_CROUCH, hipDrop(sk, this.foxLegs, targets)), dt)
    sk.offset[1] -= this.foxDrop
    stepLegs(sk, this.foxLegs, targets)
  }

  /** Eases the hips toward a new drop: down at once (a leg must reach), back up gently. */
  private ease(was: number, want: number, dt: number) {
    return want > was ? want : was + (want - was) * (1 - Math.exp(-dt * 4))
  }
}

/** Out of sight: no size, standing where the elf is so it doesn't stretch the scene's bounds. */
function hide(sk: Skeleton, at: Walker) {
  sk.reset()
  sk.rootScale = 0
  sk.place.set([at.x, 0, at.z])
  sk.update()
}
