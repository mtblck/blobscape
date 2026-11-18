import type { PointLight } from './engine.ts'
import type { MirrorImage } from './reflect.ts'
import { Skeleton } from './rig.ts'
import type { CompiledScene, WaterPlan } from './sceneDoc.ts'
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
    const { x0, z0, nx, nz, cell, level, speed, damping } = plan
    const water = this.water = new Water({ x0, z0, nx, nz, cell, level, speed, damping, wet: plan.wet })
    this.surface = makeSurface(water, { per: 2 })
    // the loop in whole ticks, and a moment kept every `every` of them
    const every = Math.max(1, Math.round(1 / (fps * WATER_TICK)))
    const ticks = Math.max(every, Math.round(scene.loop / WATER_TICK / every) * every)
    this.count = ticks / every
    this.frames = new Int16Array(this.count * nx * nz)
    const sk = plan.bodies.length ? new Skeleton(scene.bones) : undefined
    const at = [0, 0, 0]
    let next = 0
    for (let run = 0; run <= warm; run++) {
      next = 0
      for (let k = 0; k < ticks; k++) {
        const t = (k / ticks) * scene.loop
        if (run === warm && k % every === 0) {
          const f = this.frames, o = (k / every) * nx * nz, h = water.h
          for (let c = 0; c < h.length; c++) f[o + c] = Math.max(-32767, Math.min(32767, Math.round(h[c] / STEP)))
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
        for (; next < plan.drops.length && plan.drops[next].at < until; next++) water.splash(plan.drops[next].x, plan.drops[next].z, plan.splash.r, plan.splash.depth)
        water.step(WATER_TICK)
      }
    }
    this.set(0)
  }

  /** Lays the water as it stands `t` seconds into the loop back on the pond (`water.h`), blended between the two kept moments round it. */
  set(t: number) {
    const u = ((((t / this.loop) % 1) + 1) % 1) * this.count
    if (u === this.shown) return
    this.shown = u
    const n = this.water.h.length, a = Math.floor(u) % this.count, b = (a + 1) % this.count, w = u - Math.floor(u)
    const h = this.water.h, f = this.frames
    for (let k = 0; k < n; k++) h[k] = (f[a * n + k] * (1 - w) + f[b * n + k] * w) * STEP
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
