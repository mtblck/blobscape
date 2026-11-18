import type { Vec3 } from '../../splat-core/blobs.ts'
import type { Built, Creature } from '../../splat-engine/body.ts'
import type { PointLight } from '../../splat-engine/engine.ts'
import { compileScene, type CompiledScene } from '../../splat-engine/sceneDoc.ts'
import type { StepOptions } from '../../splat-engine/steps.ts'
import { buildVoxels, type Shape } from '../../splat-engine/voxel.ts'
import type { MirrorImage } from '../../splat-engine/reflect.ts'
import { Water, crossing, makeSurface, shadeSurface, shapeSurface, type WaterLook, type WaterSurface } from '../../splat-engine/water.ts'
import { groundUnder } from '../../splat-engine/weather.ts'
import { WAVE_SECONDS, WalkingElf, type Walker } from '../walkingElf.ts'
import { candleGlints, candleLights, makeFlames, poseFlames } from './candles.ts'
import { CANDLES, LEVEL, NICHE_FLOOR, POND_SCENE, SCALE } from './scene.ts'
import { BODY, WADE_SPEED, stepWader, type Input } from './wade.ts'

/**
 * The wading pond, without the drawing: the ruin (a scene description, cut into blobs), the water that fills
 * whatever of it lies under the water's level, the elf wading on its own feet, and the candles. Each frame the elf's
 * legs tell the water where they cross its surface, and the water does the rest: a foot coming down raises a ring,
 * a leg dragged through pushes a wave ahead of it, and the rings bounce off the banks, the steps and the column.
 */

export interface PondOptions {
  /** The grid the ruin is cut on, in the scene's own units: smaller is finer. */
  spacing: number
  /** The elf's look (forest, dusk, autumn). */
  look: string
  /** The elf's blob count. */
  elfBlobs?: number
}

/** A cell of the water's grid, meters. */
export const WATER_CELL = 0.075
/** Where the water stands, meters. */
export const WATER_LEVEL = LEVEL * SCALE
/** How the elf steps in water: it lifts each foot clear of the surface and sets it down again. */
export const WADE_STEPS: StepOptions = { reach: 0.3, duration: 0.5, lift: 0.2 }
/** Where the elf starts. */
const START: Walker = { x: -1, z: 3, heading: Math.PI, speed: 0 }
/** A raindrop: how wide it lands and how much water it is. */
const DROP_R = 0.05, DROP_VOLUME = 2.2e-5

/** How the pond's surface looks: dark clear water under a night sky, catching the moon. */
const LOOK: Omit<WaterLook, 'sun'> = { body: [0.012, 0.085, 0.075], sky: [0.012, 0.02, 0.035], horizon: [0.07, 0.11, 0.15], clear: 0.34, gloss: 70, steep: 2.5 }
const MOON: Vec3 = [0.75, 0.85, 0.8]

/** Each leg as the water sees it: from one bone's head to the next, this thick. */
const LIMBS = ['l', 'r'].flatMap((s) => [
  { id: `${s}-shin`, from: `${s}Shin`, to: `${s}Foot`, r: 0.05 },
  { id: `${s}-foot`, from: `${s}Foot`, to: `${s}Toe`, r: 0.04 },
])

export class Pond {
  readonly opts: PondOptions
  /** The ruin, as blobs on the scene's bones, standing `SCALE` times its written size. */
  readonly scene: Built
  private readonly compiled: CompiledScene
  /** The pond's water. */
  readonly water: Water
  /** The blobs that draw the water's surface. */
  readonly surface: WaterSurface
  /** The height of the ground under each cell of the water's grid, meters. */
  readonly bed: Float32Array
  /** The elf on its own feet. */
  readonly walking: WalkingElf
  /** The candles' flames. */
  readonly flames: Creature
  /** The top of each candle, where its flame stands. */
  readonly wicks: Vec3[]
  /** Every actor for the SplatWorld. */
  readonly actors: Creature[]
  walker: Walker = { ...START }
  time = 0
  /** Meters waded. */
  waded = 0
  /** Burn the candles steady and hold the air still (reduced motion). */
  calm = false
  /** Raindrops a second over the whole pond; 0 for none. */
  rain = 0
  /** Whether the surface's blobs were moved or colored again by the last `draw`. */
  surfaceChanged = true
  /** Whether the last `draw` moved the surface's blobs (not only colored them). */
  surfaceMoved = true
  /** What the water mirrors of the scene (the stage's `SplatMirror`, read back), or null for the sky alone. Set it with `setMirror`. */
  mirror: MirrorImage | null = null
  private mirrorNew = false
  private waveUntil = -1
  private turned = 0
  private drawn = { version: -1, eye: [NaN, NaN, NaN], at: -1 }
  private rainDue = 0
  private seed = 12345

  constructor(opts: PondOptions) {
    this.opts = opts
    this.compiled = compileScene(POND_SCENE, { puffs: false })
    const spec = this.compiled.spec(opts.spacing)
    this.scene = buildVoxels(spec)
    // what holds the water: everything solid that stays put
    const solid = spec.parts.filter((p) => !p.glow && !p.bone.startsWith('~')).map((p) => p.shape)
    const { water, bed } = fill(solid)
    this.water = water
    this.bed = bed
    this.surface = makeSurface(water, { per: 2 })
    this.walking = new WalkingElf(opts.elfBlobs ?? 20000, opts.look, this.walker, { steps: WADE_STEPS, pace: WADE_SPEED })
    this.wicks = CANDLES.map((c): Vec3 => [c.x * SCALE, (NICHE_FLOOR + c.h) * SCALE, c.z * SCALE])
    this.flames = makeFlames(this.wicks)
    this.actors = [this.scene, this.walking.elf, this.flames, this.surface]
    this.update(0, { forward: 0, turn: 0 })
    // the elf has been standing here: no splash for arriving
    this.water.rest()
  }

  get blobCount() { return this.actors.reduce((s, a) => s + a.blobs.count, 0) }
  get elf(): Creature { return this.walking.elf }

  /** The height of the pond's bed at (x, z), meters: what a foot stands on. */
  groundAt = (x: number, z: number) => {
    const k = this.water.index(x, z)
    return k < 0 || !this.water.wet[k] ? 0 : this.bed[k]
  }

  /** Stands the elf where another pond's was (a rebuild at a new detail), if there is water for it there. */
  standAt(w: Walker) {
    if (!this.water.roomAt(w.x, w.z, BODY)) return
    this.walker = { ...w, speed: 0 }
    this.walking.standAt(this.walker)
    this.update(0, { forward: 0, turn: 0 })
    this.water.rest()
  }

  wave() { this.waveUntil = this.time + WAVE_SECONDS }
  get waving() { return this.time < this.waveUntil }

  /** Lets a drop fall at (x, z), as a tap on the water does. */
  drip(x: number, z: number) { this.water.drop(x, z, DROP_R * 1.6, DROP_VOLUME * 6) }

  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0
    return this.seed / 4294967296
  }

  /** One frame: move the elf, tell the water where its legs are, step the water, pose everything. */
  update(dt: number, input: Input) {
    this.time += dt
    const was = this.walker
    this.walker = stepWader(was, input, dt, (x, z) => this.water.roomAt(x, z, BODY))
    this.turned = dt > 0 ? (this.walker.heading - was.heading) / dt : 0
    this.waded += Math.hypot(this.walker.x - was.x, this.walker.z - was.z)
    if (Math.abs(this.walker.speed) > 0.3) this.waveUntil = -1
    this.walking.pose(this.walker, this.turned, dt, this.waving ? WAVE_SECONDS - (this.waveUntil - this.time) : null, this.groundAt)

    // the legs, where they cross the surface now
    const sk = this.elf.skeleton, at = (name: string) => { const b = sk.index(name) * 3; return sk.posedHead.subarray(b, b + 3) }
    // a leg stands in the water down to the bed, so it takes the place of the whole column of water under where it crosses
    for (const l of LIMBS) {
      const c = crossing(at(l.from), at(l.to), l.r, WATER_LEVEL)
      this.water.body(l.id, c, c ? Math.max(0, WATER_LEVEL - this.groundAt(c.x, c.z)) : 0)
    }

    // rain, each drop where the dice say
    if (this.rain > 0 && dt > 0) {
      this.rainDue += this.rain * dt
      const { x0, z0, nx, nz, cell } = this.water.spec
      while (this.rainDue >= 1) {
        this.rainDue--
        this.water.drop(x0 + this.random() * nx * cell, z0 + this.random() * nz * cell, DROP_R, DROP_VOLUME)
      }
    }
    this.water.step(dt)

    // the ruin's own moves (the tree, the fireflies), standing at the world's size
    const ssk = this.scene.skeleton
    this.compiled.pose(ssk, this.calm ? 0 : this.time)
    ssk.rootScale = SCALE
    ssk.update()
    poseFlames(this.flames.skeleton, this.time, this.calm)
  }

  /** Hands the water a new picture of what it mirrors (or null for none): the next `draw` colors the surface with it. */
  setMirror(image: MirrorImage | null) {
    if (image === this.mirror) return
    this.mirror = image
    this.mirrorNew = true
  }

  /** The live lights this frame: the candles. */
  lights(): PointLight[] { return candleLights(this.wicks, this.time, this.calm) }

  /**
   * Makes the surface's blobs ready for an eye at `eye`: lifted and tilted to the water if it moved, and colored for
   * that eye. Still water seen from the same place is only colored again now and then, for the candles' glints.
   */
  draw(eye: ArrayLike<number>) {
    const d = this.drawn
    const moved = this.water.version !== d.version
    const looked = Math.abs(eye[0] - d.eye[0]) + Math.abs(eye[1] - d.eye[1]) + Math.abs(eye[2] - d.eye[2]) > 1e-4
    this.surfaceChanged = moved || looked || this.mirrorNew || this.time - d.at > (this.calm ? 1e9 : 0.07) || d.at < 0
    this.surfaceMoved = this.surfaceChanged && (moved || d.at < 0)
    if (!this.surfaceChanged) return
    this.mirrorNew = false
    if (this.surfaceMoved) shapeSurface(this.surface, this.water, LOOK.steep)
    const from = POND_SCENE.light!.from!
    // with a picture of the scene to mirror, the flames are in it; without one, each flame gets a glint of its own
    shadeSurface(this.surface, { ...LOOK, sun: { toward: from, color: MOON, glow: 0.12 }, mirror: this.mirror }, eye, this.mirror ? [] : candleGlints(this.wicks, this.time, this.calm))
    this.drawn = { version: this.water.version, eye: [eye[0], eye[1], eye[2]], at: this.time }
  }
}

/**
 * Fills the scene with water to the level: measures the ground under every cell of a grid over the scene, and floods
 * outward from where the elf starts through every cell whose ground is under the surface. What stands above it, or
 * hangs lower than a wader is tall, is dry; water that the flood can't reach (a puddle behind a bank) is left out.
 */
export function fill(solid: Shape[]): { water: Water; bed: Float32Array } {
  const lo = Math.min(...solid.map((s) => Math.min(s.min[0], s.min[2]))) * SCALE, hi = Math.max(...solid.map((s) => Math.max(s.max[0], s.max[2]))) * SCALE
  const n = Math.ceil((hi - lo) / WATER_CELL)
  const bed = new Float32Array(n * n), under = new Uint8Array(n * n)
  // from a little over head height down: an arch overhead is not in the way, a wall is
  const top = LEVEL + 0.75
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (lo + (i + 0.5) * WATER_CELL) / SCALE, z = (lo + (j + 0.5) * WATER_CELL) / SCALE
    const g = groundUnder(solid, x, z, top, -10)
    bed[j * n + i] = g * SCALE
    // there must be ground to hold it, and the ground must be under the surface with a little water over it
    under[j * n + i] = g > -5 && g < LEVEL - 0.006 ? 1 : 0
  }
  // flood from the start
  const wet = new Uint8Array(n * n)
  const cellOf = (x: number, z: number) => Math.floor((z - lo) / WATER_CELL) * n + Math.floor((x - lo) / WATER_CELL)
  const stack = [cellOf(START.x, START.z)]
  while (stack.length) {
    const k = stack.pop()!
    if (wet[k] || !under[k]) continue
    wet[k] = 1
    const i = k % n, j = (k - i) / n
    if (i > 0) stack.push(k - 1)
    if (i < n - 1) stack.push(k + 1)
    if (j > 0) stack.push(k - n)
    if (j < n - 1) stack.push(k + n)
  }
  const water = new Water({ x0: lo, z0: lo, nx: n, nz: n, cell: WATER_CELL, level: WATER_LEVEL, wet: (x, z) => wet[cellOf(x, z)] === 1 })
  return { water, bed }
}
