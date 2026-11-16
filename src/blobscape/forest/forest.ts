import type { Creature } from '../../splat-engine/body.ts'
import { axisAngle, mulQ, norm4, rotate, type Skeleton } from '../../splat-engine/rig.ts'
import { clearCloak, elfIdle, elfWalk, elfWave, makeElf } from '../../splat-engine/zoo/elf.ts'
import { makeGround } from './ground.ts'
import { makePlant, type Plant, type Season } from './plants.ts'
import { KINDS, PER_TILE, RING, RULES, TILE, WALK_SPEED, layout, obstacles, slotOf, stepWalker, tileWindow, type Input, type Kind, type Placed, type Walker } from './world.ts'

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
/** Meters the elf covers in one walk cycle, so the feet keep pace with the ground. */
const STRIDE_METERS = 1.5
const STRIDE_SECONDS = 1.1
const WAVE_SECONDS = 4

export class Forest {
  readonly elf: Creature
  readonly grounds: Creature[]
  readonly slots: Slot[][]
  /** Every actor for the SplatWorld, elf first. */
  readonly actors: Creature[]
  walker: Walker = { x: 0, z: 0, heading: 0, speed: 0 }
  /** Plants grow as the elf comes near (true), or stand grown already. */
  sprout = true
  wind = 1
  seed: number
  time = 0
  /** Meters walked, either way. */
  walked = 0
  private tileOf = new Array<number | null>(RING).fill(null)
  private walkT = 0
  private idleT = 0
  private waveUntil = -1
  private solid: { x: number; z: number; r: number }[] = []
  private solidFor = ''

  readonly opts: ForestOptions

  constructor(opts: ForestOptions) {
    this.opts = opts
    this.seed = opts.seed
    this.elf = makeElf(Math.round(ELF_BLOBS * Math.max(0.5, opts.detail)), opts.look)
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
    this.actors = [this.elf, ...this.grounds, ...this.slots.flat().map((s) => s.plant)]
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
    const { speed, heading } = this.walker
    this.idleT += dt
    // the walk cycle runs at the pace of the feet: backwards when backing up
    this.walkT += (dt * speed * STRIDE_SECONDS) / STRIDE_METERS
    const w = Math.min(1, Math.abs(speed) / (WALK_SPEED * 0.45))
    if (this.waving) elfWave(sk, WAVE_SECONDS - (this.waveUntil - this.time))
    else elfIdle(sk, this.idleT)
    const rest = { rotation: sk.rotation.slice(), offset: sk.offset.slice() }
    if (w > 0) {
      elfWalk(sk, ((this.walkT % STRIDE_SECONDS) + STRIDE_SECONDS) % STRIDE_SECONDS)
      blendPose(sk, rest, w)
      // a blend of two poses is neither: hold the cloak clear of the legs as they are now
      clearCloak(sk)
    } else {
      sk.rotation.set(rest.rotation)
      sk.offset.set(rest.offset)
    }
    // turn the whole elf to its heading, about the hips
    const turn = axisAngle([0, 1, 0], heading)
    sk.setRotation(0, mulQ(turn, sk.rotation.subarray(0, 4)))
    sk.offset.set(rotate(turn, sk.offset.subarray(0, 3)), 0)
    sk.place.set([this.walker.x, 0, this.walker.z])
    sk.update()
  }
}

/** Out of sight: no size, standing where the elf is so it doesn't stretch the scene's bounds. */
function hide(sk: Skeleton, at: Walker) {
  sk.reset()
  sk.rootScale = 0
  sk.place.set([at.x, 0, at.z])
  sk.update()
}

/** Mixes the pose in `sk` with `from`, weight w on `sk`'s: turns by normalized lerp, offsets by lerp. */
export function blendPose(sk: Skeleton, from: { rotation: Float32Array; offset: Float32Array }, w: number) {
  for (let b = 0; b < sk.count; b++) {
    const a = from.rotation.subarray(b * 4, b * 4 + 4), q = sk.rotation.subarray(b * 4, b * 4 + 4)
    const sign = a[0] * q[0] + a[1] * q[1] + a[2] * q[2] + a[3] * q[3] < 0 ? -1 : 1
    sk.setRotation(b, norm4([0, 1, 2, 3].map((k) => a[k] + (q[k] * sign - a[k]) * w)))
    for (let k = 0; k < 3; k++) sk.offset[b * 3 + k] = from.offset[b * 3 + k] + (sk.offset[b * 3 + k] - from.offset[b * 3 + k]) * w
  }
}
