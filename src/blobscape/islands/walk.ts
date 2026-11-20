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

/** The ground of an island and what stands on it, as the elf meets them. Lengths in meters. */
export class IslandGround {
  private readonly land: Shape
  private readonly things: Shape[]
  private readonly lobes: IslandPlan['lobes']
  private readonly half: number
  private readonly n: number
  private readonly heights: Float32Array

  constructor(doc: SceneDoc, plan: IslandPlan, spacing: number) {
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
    const u = (x / SCALE + this.half) / CELL, v = (z / SCALE + this.half) / CELL
    const i = Math.max(0, Math.min(this.n - 2, Math.floor(u))), j = Math.max(0, Math.min(this.n - 2, Math.floor(v)))
    const fu = Math.max(0, Math.min(1, u - i)), fv = Math.max(0, Math.min(1, v - j))
    const a = this.cell(i, j), b = this.cell(i + 1, j), c = this.cell(i, j + 1), d = this.cell(i + 1, j + 1)
    return ((a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv) * SCALE
  }

  /** Whether the elf may stand at (x, z), meters: on the island, back from its edge, and clear of every thing. */
  standsAt(x: number, z: number): boolean {
    const sx = x / SCALE, sz = z / SCALE
    if (inside(this.lobes, sx, sz) < EDGE / SCALE) return false
    const g = this.groundAt(x, z) / SCALE
    if (g < -2) return false
    const r = BODY / SCALE
    for (const s of this.things) {
      if (sx < s.min[0] - r || sx > s.max[0] + r || sz < s.min[2] - r || sz > s.max[2] + r) continue
      for (const up of IN_WAY) if (s.sdf(sx, g + up / SCALE, sz) < r) return false
    }
    return true
  }

  /** Whether the elf may go from one place to another a short way off: room there, and ground no steeper than it climbs. */
  passes(x0: number, z0: number, x1: number, z1: number): boolean {
    if (!this.standsAt(x1, z1)) return false
    const run = Math.hypot(x1 - x0, z1 - z0)
    return Math.abs(this.groundAt(x1, z1) - this.groundAt(x0, z0)) <= run * STEEPEST + 0.004
  }
}

/** Where the elf starts on an island: on the path, a little in from the edge it comes in at, facing along it. */
export function startOf(plan: IslandPlan, ground: IslandGround): Walker {
  const [a, b] = plan.path
  const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz) || 1
  const heading = Math.atan2(dx, dz)
  // the first place along the way in where it may stand
  for (let d = IN_FROM_EDGE; d < len; d += 0.05) {
    const x = (a[0] + (dx / len) * d) * SCALE, z = (a[2] + (dz / len) * d) * SCALE
    if (ground.standsAt(x, z)) return { x, z, heading, speed: 0 }
  }
  // no room on the path's first run: anywhere near the middle
  for (let r = 0; r < 3; r += 0.1) for (let k = 0; k < 16; k++) {
    const x = Math.cos((k / 16) * Math.PI * 2) * r * SCALE, z = Math.sin((k / 16) * Math.PI * 2) * r * SCALE
    if (ground.standsAt(x, z)) return { x, z, heading, speed: 0 }
  }
  return { x: 0, z: 0, heading, speed: 0 }
}

/** The elf walking about an island. */
export class IslandWalk {
  readonly ground: IslandGround
  readonly walking: WalkingElf
  walker: Walker
  /** Meters walked. */
  walked = 0
  time = 0
  private turned = 0
  private waveUntil = -1

  constructor(doc: SceneDoc, plan: IslandPlan, spacing: number, { look = 'forest', blobs = 16000 }: { look?: string; blobs?: number } = {}) {
    this.ground = new IslandGround(doc, plan, spacing)
    this.walker = startOf(plan, this.ground)
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
    this.walker = stepWader(was, input, dt, (x, z) => this.ground.passes(was.x, was.z, x, z), WALK_SPEED)
    this.turned = dt > 0 ? (this.walker.heading - was.heading) / dt : 0
    this.walked += Math.hypot(this.walker.x - was.x, this.walker.z - was.z)
    if (Math.abs(this.walker.speed) > 0.3) this.waveUntil = -1
    const waving = this.time < this.waveUntil ? WAVE_SECONDS - (this.waveUntil - this.time) : null
    this.walking.pose(this.walker, this.turned, dt, waving, this.ground.groundAt)
  }
}
