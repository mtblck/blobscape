import type { PointLight } from './engine.ts'
import type { MirrorImage } from './reflect.ts'
import { Skeleton } from './rig.ts'
import type { CompiledScene, WaterDrop, WaterPlan } from './sceneDoc.ts'
import { WATER_TICK, Water, crossing, makeSurface, shadeSurface, shapeSurface, type WaterSurface } from './water.ts'

/** The step heights are kept in: a hundredth of a millimeter where a unit is a meter, and room for a third of a unit either way. */
const STEP = 1e-5

/**
 * The water of a scene written as data (`SceneDoc.water`), played as the scene plays: from the time alone.
 *
 * A scene repeats, and can be shown at any moment of its loop in any order (paused, stepped frame by frame to record
 * it), so its water can't be stepped along with the clock. Instead one whole loop of it is worked out here, once:
 * the pond (water.ts, the wave equation on a grid) is run through the loop with every raindrop of the scene's rain
 * splashing where and when it lands and every body the scene names pushing its own volume aside as its bone carries
 * it through the surface. It is run through a few loops first, so that the rings still crossing the pond when the
 * loop starts are the ones the end of the loop leaves, and the last run is kept as heights at `fps` moments a
 * second. `show` then lays the heights for a time back on the pond and shapes and colors the surface's blobs.
 *
 * Nothing is drawn or keyed by hand: change the rain, the banks or a fish's path and the rings follow.
 */
export class SceneWater {
  /** The scene's water as it was planned. */
  readonly plan: WaterPlan
  /** The pond: its grid, and its heights at the time last shown. */
  readonly water: Water
  /** The blobs that draw the surface, for the world (`reshape` it after each `show`). */
  readonly surface: WaterSurface
  /** Seconds before the water repeats: the scene's loop. */
  readonly loop: number
  /** How many moments of the loop are kept. */
  readonly count: number
  /** The kept moments: each cell's height in steps of `STEP`, a moment after another. */
  private readonly frames: Int16Array
  private shown = NaN

  /** Works one loop of the scene's water out. `fps` moments a second are kept (24), after `warm` loops run to fill the pond with rings (2). */
  constructor(scene: CompiledScene, { fps = 24, warm = 2 }: { fps?: number; warm?: number } = {}) {
    const plan = scene.water
    if (!plan) throw new Error(`SceneWater: the scene "${scene.name}" has no water`)
    this.plan = plan
    this.loop = scene.loop
    this.scene = scene
    this.warm = warm
    const { x0, z0, nx, nz, cell, level, speed, damping } = plan
    const water = this.water = new Water({ x0, z0, nx, nz, cell, level, speed, damping, wet: plan.wet })
    this.surface = makeSurface(water, { per: 2 })
    // the loop in whole ticks, and a moment kept every `every` of them
    this.every = Math.max(1, Math.round(1 / (fps * WATER_TICK)))
    this.ticks = Math.max(this.every, Math.round(scene.loop / WATER_TICK / this.every) * this.every)
    this.count = this.ticks / this.every
    this.frames = this.run(water, plan.drops, true)
    this.set(0)
  }

  private readonly scene: CompiledScene
  private readonly warm: number
  private readonly every: number
  private readonly ticks: number

  /** Runs `water` through the loop `warm` times and once more, kept: with `drops` splashing and, where `bodies`, what swims pushing through. */
  private run(water: Water, drops: readonly WaterDrop[], bodies: boolean): Int16Array {
    const { plan, scene, every, ticks } = this, { nx, nz, level } = plan
    const frames = new Int16Array(this.count * nx * nz)
    const sk = bodies && plan.bodies.length ? new Skeleton(scene.bones) : undefined
    const at = [0, 0, 0]
    for (let run = 0; run <= this.warm; run++) {
      let next = 0
      for (let k = 0; k < ticks; k++) {
        const t = (k / ticks) * scene.loop
        if (run === this.warm && k % every === 0) {
          const o = (k / every) * nx * nz, h = water.h
          for (let c = 0; c < h.length; c++) frames[o + c] = Math.max(-32767, Math.min(32767, Math.round(h[c] / STEP)))
        }
        if (sk) {
          scene.pose(sk, t)
          plan.bodies.forEach((b, i) => {
            const m = sk.matrix, o = b.bone * 16, r = b.r * sk.scale[b.bone]
            for (let c = 0; c < 3; c++) at[c] = m[o + c] * b.at[0] + m[o + 4 + c] * b.at[1] + m[o + 8 + c] * b.at[2] + m[o + 12 + c]
            const cut = r > 0 ? crossing(at, at, r, level) : null
            // the same depth going in as coming out, so what it pressed aside comes back whole
            water.body(`body${i}`, cut, b.draft * sk.scale[b.bone])
          })
        }
        const until = ((k + 1) / ticks) * scene.loop
        for (; next < drops.length && drops[next].at < until; next++) water.splash(drops[next].x, drops[next].z, plan.splash.r, plan.splash.depth)
        water.step(WATER_TICK)
      }
    }
    return frames
  }

  /**
   * Rain from outside the scene (weather laid over it) on the pond, in bands of its swarm: `bands` are the shares of
   * the swarm where each ends (ascending, the last 1), and `rain` (0 to 1, the share of the swarm out) then says how
   * much of each band falls. Each band's rings are worked out on their own, through the same loops: the wave
   * equation is linear, so the pond with them is the pond without plus their rings. Costs a run of the loop a band.
   */
  addRain(drops: readonly WaterDrop[], bands: readonly number[]) {
    if (this.rained) return
    this.rained = true
    const { x0, z0, nx, nz, cell, level, speed, damping } = this.plan
    let from = 0
    for (const to of bands) {
      const mine = drops.filter((d) => d.share >= from - 1e-9 && d.share < to - 1e-9)
      if (mine.length) this.bands.push({ from, to, frames: this.run(new Water({ x0, z0, nx, nz, cell, level, speed, damping, wet: this.plan.wet }), mine, false) })
      from = to
    }
    this.shown = NaN
  }

  private readonly bands: { from: number; to: number; frames: Int16Array }[] = []
  /** How much of the rain from outside the scene (`addRain`) is falling: the share of its swarm out, 0 to 1. */
  rain = 0
  private shownRain = NaN
  private rained = false

  /** Lays the water as it stands `t` seconds into the loop back on the pond (`water.h`), blended between the two kept moments round it. */
  set(t: number) {
    const u = ((((t / this.loop) % 1) + 1) % 1) * this.count
    if (u === this.shown && this.rain === this.shownRain) return
    this.shown = u
    this.shownRain = this.rain
    const n = this.water.h.length, a = Math.floor(u) % this.count, b = (a + 1) % this.count, w = u - Math.floor(u)
    const h = this.water.h, f = this.frames
    for (let k = 0; k < n; k++) h[k] = (f[a * n + k] * (1 - w) + f[b * n + k] * w) * STEP
    for (const band of this.bands) {
      // a band falls as its share of the swarm comes out
      const on = Math.min(1, Math.max(0, (this.rain - band.from) / (band.to - band.from)))
      if (on <= 0) continue
      const g = band.frames
      for (let k = 0; k < n; k++) h[k] += (g[a * n + k] * (1 - w) + g[b * n + k] * w) * STEP * on
    }
    this.water.version++
  }

  /**
   * Makes the surface's blobs ready for the scene at `t` seconds, seen from `eye`: lifted and tilted to the water,
   * and colored for that eye. `mirror` is a picture of what the water mirrors (`SplatMirror`), `lights` the lamps
   * whose glints it catches. Hand `surface` to `SplatWorld.reshape` (or `Stage.reshape`) afterward.
   */
  show(t: number, eye: ArrayLike<number>, { mirror = null, lights = [] }: { mirror?: MirrorImage | null; lights?: readonly PointLight[] } = {}) {
    const p = this.plan
    this.set(t)
    shapeSurface(this.surface, this.water, p.ripple)
    shadeSurface(this.surface, { body: p.body, sky: p.sky, horizon: p.horizon, clear: p.clear, steep: p.ripple, deep: p.deep, mirror }, eye, lights)
  }
}
