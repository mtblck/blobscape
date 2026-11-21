import type { PointLight } from './engine.ts'
import type { MirrorImage } from './reflect.ts'
import { Blobs } from '../splat-core/blobs.ts'
import type { Actor } from './engine.ts'
import { Skeleton, axisAngle, emptySkin, mulQ, setWeights } from './rig.ts'
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
  /** Foam on each cell as last laid by `set`, 0 to 1 (`WaterDoc.foam`); all 0 where the scene has none. */
  readonly foam: Float32Array
  /** The kept moments' foam, a byte a cell, when the scene has foam. */
  private readonly foamFrames: Uint8Array | null
  /**
   * Spray thrown up where the water strikes something hard enough (with `WaterDoc.foam`): droplets on one still
   * bone, placed for the moment by `show` (hand it to the stage beside the surface and `reshape` it too). It stays
   * blobs when the scene is drawn as blocks. None when the scene has no foam.
   */
  readonly spray: Actor | null
  /** Every burst of spray in the loop: where, when, which way away from what it struck, and how hard (0 to 1). */
  readonly bursts: Burst[] = []
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
    this.foam = new Float32Array(nx * nz)
    const froth = plan.foam > 0 ? new Froth(water, plan, scene.loop, this.foam) : undefined
    this.foamFrames = froth ? new Uint8Array(this.count * nx * nz) : null
    this.spray = froth ? sprayActor(plan) : null
    let next = 0
    for (let run = 0; run <= warm; run++) {
      next = 0
      for (let k = 0; k < ticks; k++) {
        const t = (k / ticks) * scene.loop
        if (run === warm && k % every === 0) {
          const f = this.frames, o = (k / every) * nx * nz, h = water.h
          for (let c = 0; c < h.length; c++) f[o + c] = Math.max(-32767, Math.min(32767, Math.round(h[c] / STEP)))
          const ff = this.foamFrames, foam = this.foam
          if (ff) for (let c = 0; c < foam.length; c++) ff[o + c] = Math.round(Math.min(1, foam[c]) * 255)
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
        if (froth) froth.tick(run === warm ? t : null, this.bursts)
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
    const ff = this.foamFrames, foam = this.foam
    if (ff) for (let k = 0; k < n; k++) foam[k] = (ff[a * n + k] * (1 - w) + ff[b * n + k] * w) / 255
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
    if (this.foamFrames) whiten(this.surface, this.foam)
    if (this.spray) throwSpray(this.spray, this.bursts, t, this.loop, p.level)
  }
}

/** A burst of spray: thrown at `at` seconds into the loop from (x, z), away from what was struck along (ox, oz). */
export interface Burst {
  /** Where it was thrown from, on the water: x. */
  x: number
  /** Where it was thrown from, on the water: z. */
  z: number
  /** Seconds into the loop. */
  at: number
  /** The way out from what was struck, a unit pair: x. */
  ox: number
  /** The way out from what was struck, a unit pair: z. */
  oz: number
  /** How hard, 0 to 1: how high its droplets go. */
  strength: number
}

/**
 * A strike throws spray when it is at least `SPRAY_SHARE` of the hardest that stretch of wall takes in a loop (so each
 * post and rock throws on its own biggest waves, a post in the lee of the rock too), and that hardest is at least
 * `SPRAY_LEAST`: in the units foam gathers by, the surge past `FOAM_FROM` times how open the water is.
 */
const SPRAY_SHARE = 0.85, SPRAY_LEAST = 0.1
/** The strike at which spray is thrown hardest. */
const SPRAY_STRONG = 0.8
/** Seconds before the same stretch of wall throws spray again, and how many cells a stretch is. */
const SPRAY_GAP = 0.6, SPRAY_CELLS = 3
/** Droplets in a burst, and the most droplets drawn at once. */
const SPRAY_DROPS = 6, SPRAY_POOL = 240
/** How fast the strongest burst throws its droplets up, and how fast things fall, in scene units (about a third of a meter each). */
const SPRAY_UP = 0.32, SPRAY_FALL = 1.6
/** A droplet's size, in scene units, at its biggest. */
const SPRAY_SIZE = 0.007
/** Spray's color, sRGB: white with a little of the sea in it. */
const SPRAY_COLOR = [0.9, 0.95, 0.98]

/** The pool of droplets, all hidden at the start, on one still bone at the water's middle. */
function sprayActor(plan: WaterPlan): Actor {
  const blobs = new Blobs(SPRAY_POOL)
  const mid: [number, number, number] = [plan.x0 + (plan.nx * plan.cell) / 2, plan.level, plan.z0 + (plan.nz * plan.cell) / 2]
  for (let k = 0; k < SPRAY_POOL; k++) blobs.push({ center: mid, scale: [1e-5, 1e-5, 1e-5], quat: [0, 0, 0, 1], color: SPRAY_COLOR as [number, number, number], opacity: 0 })
  const skin = emptySkin(blobs.count)
  for (let k = 0; k < blobs.count; k++) setWeights(skin, k, [[0, 1]])
  return { blobs, skin, skeleton: new Skeleton([{ name: 'spray', parent: -1, head: mid }]), soft: true }
}

/** A share 0 to 1 from a whole number, the same every time. */
const hashOf = (n: number) => ((Math.imul(n ^ (n >>> 15), 2246822507) >>> 0) % 10007) / 10007

/**
 * Places every droplet in the air `t` seconds into the loop: each burst's droplets leave the point struck upward and
 * away from the wall, each its own speed and way by a hash of its number, fall under their weight and are gone when
 * they come back down to the water, shrinking as they fall. A burst near the end of the loop goes on into its start,
 * so the loop joins. Droplets past the pool are left out.
 */
function throwSpray(spray: Actor, bursts: Burst[], t: number, loop: number, level: number) {
  const { center, scale, opacity } = spray.blobs
  let n = 0
  const life = (2 * SPRAY_UP) / SPRAY_FALL
  for (let b = 0; b < bursts.length && n < SPRAY_POOL; b++) {
    const burst = bursts[b], age = (((t - burst.at) % loop) + loop) % loop
    if (age > life) continue
    for (let d = 0; d < SPRAY_DROPS && n < SPRAY_POOL; d++) {
      const seed = b * 131 + d * 17
      const up = SPRAY_UP * burst.strength * (0.45 + 0.55 * hashOf(seed))
      const fall = (2 * up) / SPRAY_FALL
      if (age > fall) continue
      // out from the wall, spread a fan about it
      const turn = (hashOf(seed + 5) - 0.5) * 2.2, out = up * (0.25 + 0.45 * hashOf(seed + 9))
      const c = Math.cos(turn), s = Math.sin(turn)
      const wx = burst.ox * c - burst.oz * s, wz = burst.ox * s + burst.oz * c
      center[n * 3] = burst.x + wx * out * age
      center[n * 3 + 1] = level + up * age - 0.5 * SPRAY_FALL * age * age
      center[n * 3 + 2] = burst.z + wz * out * age
      const r = SPRAY_SIZE * (0.5 + 0.5 * hashOf(seed + 3)) * (1 - 0.6 * (age / fall))
      scale[n * 3] = r; scale[n * 3 + 1] = r; scale[n * 3 + 2] = r
      opacity[n] = 0.95
      n++
    }
  }
  for (; n < SPRAY_POOL; n++) { opacity[n] = 0; scale[n * 3] = scale[n * 3 + 1] = scale[n * 3 + 2] = 1e-5 }
}

/** Foam's color, in sRGB: a white a shade cool, so the scene's own light gives it its tone. */
const FOAM_COLOR = [0.93, 0.96, 0.98]
/** Seconds foam takes to fade to about a third. */
const FOAM_LIFE = 1.2
/** The share of the way to the mean of its wet neighbors foam goes a tick: how fast it spreads off the wall. */
const FOAM_SPREAD = 0.12
/** The water's speed up or down against a wall, as a share of the swells' own, under which no foam gathers. */
const FOAM_FROM = 0.08
/** Foam gathered a second by water moving one swell speed past `FOAM_FROM` beside something standing alone, at `foam` 1. */
const FOAM_GAIN = 16
/** How many cells round a cell beside a wall are looked at to see how much it stands in open water. */
const FOAM_LOOK = 3

/**
 * Foam where the water strikes something standing in it (`WaterDoc.foam`). The cells beside a dry cell inside the
 * water (a post, the rock, a bank; not the grid's open edge) gather it while the water there runs up faster than
 * `FOAM_FROM` of the swells' speed, as a surge thrown up a wall does; every tick it spreads a little toward its wet
 * neighbors and fades. Run once a tick with the water, through the warm loops as well, so the loop joins.
 */
class Froth {
  private readonly water: Water
  private readonly foam: Float32Array
  private readonly next: Float32Array
  /** The cells beside a wall. */
  private readonly shore: Int32Array
  /** How much each of those stands in open water (the share of water round it, cubed): a post more than a long bank. */
  private readonly open: Float32Array
  /** Foam gathered a tick per unit of upward speed past the threshold, and the threshold, in the water's own units. */
  private readonly gain: number
  private readonly from: number
  private readonly keep = Math.exp(-WATER_TICK / FOAM_LIFE)
  /** Each shore cell's way out from what it lies beside (x, z, a unit pair), and the last time its stretch of wall threw spray. */
  private readonly out: Float32Array
  private readonly thrown = new Map<number, number>()
  /** The hardest strike each shore cell took in the loops run so far. */
  private readonly peak: Float32Array
  private readonly pace: number

  constructor(water: Water, plan: WaterPlan, loop: number, foam: Float32Array) {
    this.water = water
    this.foam = foam
    this.next = new Float32Array(foam.length)
    const { nx, nz, x0, z0, cell } = plan, wet = water.wet
    // the dry cells something stands in (not those past the edge of the sea, where there is nothing to strike)
    const wall = new Uint8Array(nx * nz)
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (!wet[j * nx + i]) wall[j * nx + i] = plan.stands(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell) ? 1 : 0
    const shore: number[] = [], open: number[] = [], outs: number[] = []
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      if (!wet[k]) continue
      if (!((i > 0 && wall[k - 1]) || (i < nx - 1 && wall[k + 1]) || (j > 0 && wall[k - nx]) || (j < nz - 1 && wall[k + nx]))) continue
      // how much water lies round it: a post standing alone in the sea is cut through by the whole sea's motion
      let all = 0, w = 0
      for (let b = -FOAM_LOOK; b <= FOAM_LOOK; b++) for (let a = -FOAM_LOOK; a <= FOAM_LOOK; a++) {
        const p = i + a, q = j + b
        if (p < 0 || q < 0 || p >= nx || q >= nz) continue
        all++; if (wet[q * nx + p]) w++
      }
      shore.push(k); open.push((w / all) ** 3)
      let ox = 0, oz = 0
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const p = i + a, q = j + b
        if (p >= 0 && q >= 0 && p < nx && q < nz && wall[q * nx + p]) { ox -= a; oz -= b }
      }
      const l = Math.hypot(ox, oz) || 1
      outs.push(ox / l, oz / l)
    }
    this.shore = Int32Array.from(shore)
    this.open = Float32Array.from(open)
    this.out = Float32Array.from(outs)
    this.peak = new Float32Array(shore.length)
    // the swells' own speed up and down; with none, what a centimeter's ripple a second would be
    let pace = 0
    for (const s of plan.swells) pace += (TAU * s.times * s.height) / loop
    if (!pace) pace = 0.01
    this.pace = pace
    this.gain = (plan.foam * FOAM_GAIN * WATER_TICK) / pace
    this.from = FOAM_FROM * pace
  }

  /** Steps the foam a tick; with the time `t` (the kept loop), bursts of spray thrown this tick go into `bursts`. */
  tick(t: number | null, bursts: Burst[]) {
    const { foam, next, shore, open, gain, from, keep, pace } = this
    const { wet, v } = this.water, { nx, nz, x0, z0, cell } = this.water.spec
    for (let s = 0; s < shore.length; s++) {
      const k = shore[s], hit = Math.abs(v[k]) - from
      if (hit <= 0) continue
      foam[k] = Math.min(1.5, foam[k] + hit * gain * open[s])
      // a hard surge up the wall throws spray, once a stretch of wall in a while
      const strike = (hit / pace) * open[s]
      if (v[k] <= 0) continue
      if (t === null) { if (strike > this.peak[s]) this.peak[s] = strike; continue }
      const peak = this.peak[s]
      if (peak < SPRAY_LEAST || strike < SPRAY_SHARE * peak) continue
      const i = k % nx, j = (k - i) / nx, spot = Math.floor(j / SPRAY_CELLS) * nx + Math.floor(i / SPRAY_CELLS)
      const last = this.thrown.get(spot)
      if (last !== undefined && t - last < SPRAY_GAP) continue
      this.thrown.set(spot, t)
      bursts.push({ x: x0 + (i + 0.5) * cell, z: z0 + (j + 0.5) * cell, at: t, ox: this.out[s * 2], oz: this.out[s * 2 + 1], strength: 0.45 + 0.55 * Math.min(1, peak / SPRAY_STRONG) })
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      if (!wet[k]) { next[k] = 0; continue }
      let sum = 0, n = 0
      if (i > 0 && wet[k - 1]) { sum += foam[k - 1]; n++ }
      if (i < nx - 1 && wet[k + 1]) { sum += foam[k + 1]; n++ }
      if (j > 0 && wet[k - nx]) { sum += foam[k - nx]; n++ }
      if (j < nz - 1 && wet[k + nx]) { sum += foam[k + nx]; n++ }
      const f = n ? foam[k] + FOAM_SPREAD * (sum / n - foam[k]) : foam[k]
      next[k] = f * keep
    }
    foam.set(next)
  }
}

/**
 * Draws foam on the surface: each blob is taken toward white by the foam on its cells (blended as its height is),
 * by a share of its own (a hash of its index) so foam lies in lace and clumps rather than an even sheet, and made
 * as solid as its foam.
 */
function whiten(s: WaterSurface, foam: Float32Array) {
  const { blobs, taps, shares } = s, { color, opacity } = blobs, n = shares.length / 4
  for (let k = 0; k < n; k++) {
    let f = 0
    for (let q = 0; q < 4; q++) { const c = taps[k * 8 + q]; if (c >= 0) f += foam[c] * shares[k * 4 + q] }
    if (f < 0.02) continue
    const lace = 0.4 + 1.2 * (((Math.imul(k, 2654435761) >>> 0) % 1000) / 1000)
    const a = Math.min(1, f * lace)
    for (let c = 0; c < 3; c++) color[k * 3 + c] += (FOAM_COLOR[c] - color[k * 3 + c]) * a
    opacity[k] = Math.max(opacity[k], a)
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
