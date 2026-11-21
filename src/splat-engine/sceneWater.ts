import type { PointLight } from './engine.ts'
import type { MirrorImage } from './reflect.ts'
import { Skeleton, axisAngle, mulQ } from './rig.ts'
import type { CompiledScene, WaterPlan } from './sceneDoc.ts'
import { WATER_TICK, Water, crossing, makeSurface, shadeSurface, shapeSurface, type WaterSurface } from './water.ts'

/** The step heights are kept in: a hundredth of a millimeter where a unit is a meter, and room for a third of a unit either way. */
const STEP = 1e-5
const TAU = Math.PI * 2

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
    const swells = plan.swells.length ? new Swells(water, plan, scene.loop) : undefined
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
        if (swells) swells.at(t)
        const until = ((k + 1) / ticks) * scene.loop
        for (; next < plan.drops.length && plan.drops[next].at < until; next++) water.splash(plan.drops[next].x, plan.drops[next].z, plan.splash.r, plan.splash.depth)
        water.step(WATER_TICK)
      }
    }
    this.set(0)
  }

  /**
   * Stands each float of the scene (`WaterDoc.floats`) on the water as it is `t` seconds into the loop: its bone rises
   * and falls with the surface at its point and tips with the slope across its size, steepened as the surface is
   * drawn, on top of the pose the scene gave it. Call it after the scene's pose; it updates the skeleton.
   */
  ride(sk: Skeleton, t: number) {
    const floats = this.plan.floats
    if (!floats.length) return
    this.set(t)
    const w = this.water, steep = this.plan.ripple
    for (const f of floats) {
      if (f.bone < 0) continue
      const [x, , z] = f.at, d = f.size
      const sx = ((w.heightAt(x + d, z) - w.heightAt(x - d, z)) / (2 * d)) * steep
      const sz = ((w.heightAt(x, z + d) - w.heightAt(x, z - d)) / (2 * d)) * steep
      sk.offset[f.bone * 3 + 1] += w.heightAt(x, z) * steep
      // up turned onto the surface's normal (−sx, 1, −sz): about up × normal, by the angle between them
      const ax = -sz, az = sx, s2 = Math.hypot(ax, az)
      if (s2 > 1e-9) {
        const tip = axisAngle([ax / s2, 0, az / s2], Math.atan(s2))
        sk.setRotation(f.bone, mulQ(tip, sk.rotation.subarray(f.bone * 4, f.bone * 4 + 4)))
      }
    }
    sk.update()
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

/** How much of the open water's width, along each swell's way, is held to the swells: a wavelength, between these shares. */
const ZONE_LEAST = 0.12, ZONE_MOST = 0.3
/** The share a tick the water at the outer edge of the held stretch is pulled to the swells (less further in). */
const ZONE_PULL = 0.2

/**
 * Swells coming in from the open sea (`WaterDoc.swells`). Along the side of the water each comes from, a stretch about
 * a wavelength deep is held, a tick at a time, to the surface the swells would make as long straight waves arriving
 * from beyond the scene (all of them added together), pulled hardest at the outer edge and not at all at the inner.
 * The waves then roll on into the rest of the water by the wave equation alone, round the rock and anything standing
 * in it, and what comes back out to that side is held down there instead of bouncing back in.
 */
class Swells {
  private readonly weight: Float32Array
  private readonly h: Float32Array
  private readonly v: Float32Array
  /** Per swell: its way (x, z), the cells' distance along it, its wave number, its pace (radians a second), height and start. */
  private readonly trains: { along: Float32Array; k: number; w: number; a: number; phase: number }[]

  private readonly water: Water

  constructor(water: Water, plan: WaterPlan, loop: number) {
    this.water = water
    const { nx, nz, x0, z0, cell, speed } = plan
    const n = nx * nz
    this.weight = new Float32Array(n); this.h = new Float32Array(n); this.v = new Float32Array(n)
    this.trains = plan.swells.map((s) => {
      const a = (s.from * Math.PI) / 180, dx = -Math.sin(a), dz = -Math.cos(a)
      const along = new Float32Array(n)
      let least = Infinity, most = -Infinity
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const d = (x0 + (i + 0.5) * cell) * dx + (z0 + (j + 0.5) * cell) * dz
        along[j * nx + i] = d
        if (water.wet[j * nx + i]) { least = Math.min(least, d); most = Math.max(most, d) }
      }
      const w = (TAU * s.times) / loop, length = (speed * loop) / s.times
      const zone = Math.min(ZONE_MOST * (most - least), Math.max(ZONE_LEAST * (most - least), length))
      for (let k = 0; k < n; k++) {
        along[k] -= least
        const u = along[k] / zone
        if (u < 1) this.weight[k] = Math.max(this.weight[k], ZONE_PULL * (1 - u) * (1 - u))
      }
      return { along, k: w / speed, w, a: s.height, phase: s.phase * TAU }
    })
  }

  /** Holds the stretches to the swells as they stand `t` seconds into the loop. Call it once a tick, before the step. */
  at(t: number) {
    const { weight, h, v, trains } = this
    for (let c = 0; c < weight.length; c++) {
      if (!weight[c]) continue
      let hh = 0, vv = 0
      for (const s of trains) {
        const q = s.k * s.along[c] - s.w * t + s.phase
        hh += s.a * Math.sin(q)
        vv -= s.a * s.w * Math.cos(q)
      }
      h[c] = hh; v[c] = vv
    }
    this.water.relax(weight, h, v)
  }
}
