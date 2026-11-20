import type { Vec3 } from '../../splat-core/blobs.ts'
import type { Creature } from '../../splat-engine/body.ts'
import { compileScene, type SceneDoc } from '../../splat-engine/sceneDoc.ts'
import type { Shape } from '../../splat-engine/voxel.ts'
import { groundUnder } from '../../splat-engine/weather.ts'
import { stepWader, type Input } from '../pond/wade.ts'
import { WAVE_SECONDS, WalkingElf, type Walker } from '../walkingElf.ts'
import { inside, type IslandPlan } from './island.ts'

/**
 * The elf on an island: where it may stand and how high the ground is under it, worked out from the island's own
 * shapes, and the elf stepping across it on its own feet. The island is written about seven units across; it stands
 * in the world `SCALE` times that, in meters, so a tree is a few meters tall beside the elf and the island takes a
 * while to cross. Pure: no drawing here, so a test can walk it.
 */

/** How many times larger an island stands in the world than it is written, so its units are meters beside the elf. */
export const SCALE = 5
/** How fast the elf walks, meters a second. */
export const WALK_SPEED = 1.5
/** How much room the elf needs round it, meters. */
export const BODY = 0.28
/** The steepest ground it walks up or down: rise over run. Terrace faces and cliffs are steeper. */
export const STEEPEST = 0.9
/** How close to the island's edge it may go, meters: near enough to look over, not to fall. */
export const EDGE = 0.6
/** The heights over the ground at which things are in its way, meters: a shin and a chest. Branches over its head are not. */
const IN_WAY = [0.3, 1.0]
/** The grid the ground's height is kept on, in the island's own units. */
const CELL = 0.03
/** Where the elf starts on the path, in from the edge it comes in at, in the island's own units. */
const IN_FROM_EDGE = 0.5

/** The parts the elf can't walk through: every thing's body, not its leaves overhead, flowers, clouds or rocks adrift. */
export function blockingParts(doc: SceneDoc): number[] {
  const out: number[] = []
  doc.parts.forEach((p, i) => {
    const bone = p.bone
    if (!bone || bone.endsWith('Crown') || bone.startsWith('cloud') || bone.startsWith('adrift') || bone.startsWith('~')) return
    // flowers and leaves cast no shadow and give way; a thing's body does neither
    if (p.noShadow) return
    out.push(i)
  })
  return out
}

/** Ground the elf walks on, in meters: how high it is, and where the elf may stand. */
export interface WalkGround {
  /** The height of the ground at (x, z); very low where there is none. */
  groundAt(x: number, z: number): number
  /** Whether the elf may stand at (x, z). */
  standsAt(x: number, z: number): boolean
}

/** Whether the elf may go from one place to another a short way off: room there, and ground no steeper than it climbs. */
export function passes(g: WalkGround, x0: number, z0: number, x1: number, z1: number): boolean {
  if (!g.standsAt(x1, z1)) return false
  const run = Math.hypot(x1 - x0, z1 - z0)
  return Math.abs(g.groundAt(x1, z1) - g.groundAt(x0, z0)) <= run * STEEPEST + 0.004
}

/** The ground of an island and what stands on it, as the elf meets them. Lengths in meters. */
export class IslandGround implements WalkGround {
  private readonly land: Shape
  private readonly things: Shape[]
  private readonly lobes: IslandPlan['lobes']
  private readonly half: number
  private readonly n: number
  private readonly heights: Float32Array
  /** Where the island stands in the world, in its own units (a world of islands sets each one apart). */
  readonly at: Vec3

  constructor(doc: SceneDoc, plan: IslandPlan, spacing: number, at: Vec3 = [0, 0, 0]) {
    this.at = at
    const shapes = compileScene(doc, { puffs: false }).spec(spacing).parts.map((p) => p.shape)
    this.land = shapes[0]
    this.things = blockingParts(doc).map((i) => shapes[i])
    this.lobes = plan.lobes
    this.half = Math.max(plan.land.half[0], plan.land.half[1]) + 0.3
    this.n = Math.ceil((this.half * 2) / CELL) + 1
    this.heights = new Float32Array(this.n * this.n).fill(NaN)
  }

  /** The ground's height on the grid's point (i, j), in the island's units, found the first time it is asked. */
  private cell(i: number, j: number) {
    const k = j * this.n + i
    let h = this.heights[k]
    if (Number.isNaN(h)) {
      h = groundUnder([this.land], i * CELL - this.half, j * CELL - this.half, 3, -3)
      this.heights[k] = h
    }
    return h
  }

  /** The height of the ground at (x, z), meters; very low off the island. */
  groundAt = (x: number, z: number): number => {
    const u = (x / SCALE - this.at[0] + this.half) / CELL, v = (z / SCALE - this.at[2] + this.half) / CELL
    const i = Math.max(0, Math.min(this.n - 2, Math.floor(u))), j = Math.max(0, Math.min(this.n - 2, Math.floor(v)))
    const fu = Math.max(0, Math.min(1, u - i)), fv = Math.max(0, Math.min(1, v - j))
    const a = this.cell(i, j), b = this.cell(i + 1, j), c = this.cell(i, j + 1), d = this.cell(i + 1, j + 1)
    return ((a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv + this.at[1]) * SCALE
  }

  /** How far inside the island's outline (x, z) is, meters (negative outside). */
  insideAt(x: number, z: number) { return inside(this.lobes, x / SCALE - this.at[0], z / SCALE - this.at[2]) * SCALE }

  /** Whether the elf may stand at (x, z), meters: on the island, back from its edge, and clear of every thing. */
  standsAt(x: number, z: number): boolean {
    const sx = x / SCALE - this.at[0], sz = z / SCALE - this.at[2]
    if (inside(this.lobes, sx, sz) < EDGE / SCALE) return false
    const g = this.groundAt(x, z) / SCALE - this.at[1]
    if (g < -2) return false
    const r = BODY / SCALE
    for (const s of this.things) {
      if (sx < s.min[0] - r || sx > s.max[0] + r || sz < s.min[2] - r || sz > s.max[2] + r) continue
      for (const up of IN_WAY) if (s.sdf(sx, g + up / SCALE, sz) < r) return false
    }
    return true
  }

}

/** Where the elf starts on an island: on the path, a little in from the edge it comes in at, facing along it. */
export function startOf(plan: IslandPlan, ground: WalkGround, at: Vec3 = [0, 0, 0]): Walker {
  const path = plan.path.map((p): Vec3 => [p[0] + at[0], p[1], p[2] + at[2]])
  const [a, b] = path
  const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz) || 1
  const heading = Math.atan2(dx, dz)
  // the first place along the way in where it may stand
  for (let d = IN_FROM_EDGE; d < len; d += 0.05) {
    const x = (a[0] + (dx / len) * d) * SCALE, z = (a[2] + (dz / len) * d) * SCALE
    if (ground.standsAt(x, z)) return { x, z, heading, speed: 0 }
  }
  // no room on the path's first run: anywhere near the middle
  for (let r = 0; r < 3; r += 0.1) for (let k = 0; k < 16; k++) {
    const x = (at[0] + Math.cos((k / 16) * Math.PI * 2) * r) * SCALE, z = (at[2] + Math.sin((k / 16) * Math.PI * 2) * r) * SCALE
    if (ground.standsAt(x, z)) return { x, z, heading, speed: 0 }
  }
  return { x: 0, z: 0, heading, speed: 0 }
}

/**
 * When a step is stopped short (a rail, a tree, the edge met at a slant), a try at going a little to either side of
 * the way it faces, so it slides along what is in its way into a gap (a bridge's end) instead of standing there.
 */
export function slide(was: Walker, now: Walker, dt: number, room: (x: number, z: number) => boolean, going = false): Walker {
  // stopped dead, it still pushes on when asked to go
  const want = Math.max(Math.abs(was.speed), Math.abs(now.speed), going ? WALK_SPEED * 0.3 : 0) * dt
  const moved = Math.hypot(now.x - was.x, now.z - was.z)
  if (want < 1e-4 || moved > want * 0.5) return now
  const back = now.speed < 0 ? Math.PI : 0
  for (const off of [0.5, -0.5, 1.0, -1.0]) {
    const a = now.heading + back + off, step = want * Math.cos(off)
    const x = was.x + Math.sin(a) * step, z = was.z + Math.cos(a) * step
    if (room(x, z)) return { ...now, x, z, speed: Math.sign(now.speed || was.speed) * step / dt }
  }
  return now
}

/** The elf walking about an island, or a world of them. */
export class IslandWalk {
  readonly ground: WalkGround
  readonly walking: WalkingElf
  walker: Walker
  /** Meters walked. */
  walked = 0
  time = 0
  private turned = 0
  private waveUntil = -1

  /** On ground of its own (a world of islands), starting at `start`; or, given a description and plan, on that island alone. */
  constructor(ground: WalkGround, start: Walker, opts?: { look?: string; blobs?: number })
  constructor(doc: SceneDoc, plan: IslandPlan, spacing: number, opts?: { look?: string; blobs?: number })
  constructor(a: WalkGround | SceneDoc, b: Walker | IslandPlan, c?: number | { look?: string; blobs?: number }, d?: { look?: string; blobs?: number }) {
    let opts: { look?: string; blobs?: number }
    if (typeof c === 'number') {
      const ground = new IslandGround(a as SceneDoc, b as IslandPlan, c)
      this.ground = ground
      this.walker = startOf(b as IslandPlan, ground)
      opts = d ?? {}
    } else {
      this.ground = a as WalkGround
      this.walker = { ...(b as Walker) }
      opts = c ?? {}
    }
    const { look = 'forest', blobs = 16000 } = opts
    this.walking = new WalkingElf(blobs, look, this.walker, { pace: WALK_SPEED, rides: true })
    this.update(0, { forward: 0, turn: 0 })
  }

  get elf(): Creature { return this.walking.elf }

  /** Where the camera should look: the elf's middle, about a meter over the ground it stands on. */
  get middle(): Vec3 { return [this.walker.x, this.ground.groundAt(this.walker.x, this.walker.z) + 1.0, this.walker.z] }

  wave() { this.waveUntil = this.time + WAVE_SECONDS }

  /** One frame: move the elf where the ground lets it, and pose it on its own feet. */
  update(dt: number, input: Input) {
    this.time += dt
    const was = this.walker
    const room = (x: number, z: number) => passes(this.ground, was.x, was.z, x, z)
    const going = (input.aim !== undefined && (input.go ?? 0) > 0.2) || input.forward > 0.2
    this.walker = slide(was, stepWader(was, input, dt, room, WALK_SPEED), dt, room, going)
    this.turned = dt > 0 ? (this.walker.heading - was.heading) / dt : 0
    this.walked += Math.hypot(this.walker.x - was.x, this.walker.z - was.z)
    if (Math.abs(this.walker.speed) > 0.3) this.waveUntil = -1
    const waving = this.time < this.waveUntil ? WAVE_SECONDS - (this.waveUntil - this.time) : null
    this.walking.pose(this.walker, this.turned, dt, waving, this.ground.groundAt)
  }
}
