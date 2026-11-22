import type { Vec3 } from '../splat-core/blobs.ts'

/**
 * Fire that burns (a scene's `fires`, sceneDoc.ts): a shared recipe, as the water and the lava are. Nothing here is a
 * flame shape that is scaled and swayed: it is hot gas rising through air, worked out on a small grid over the bed.
 *
 * - Fuel burns at `spots` on the bed (each waxing and waning a whole number of times a loop, as logs catch and die
 *   back), which heats the air there.
 * - Hot air is lighter, so it is pushed up (`BUOYANCY` times its heat), and the air it leaves behind is replaced from
 *   the sides: the flow is kept free of sources and sinks each tick (`project`), which is what draws air in low down,
 *   necks the plume above the bed and rolls its edges over into the licks and curls a flame has. Small swirls are kept
 *   from being smoothed away by the grid (`SWIRL`, vorticity confinement).
 * - The gas loses heat as it goes (`COOL` seconds to fall to a third, quicker while it is hottest), so a flame ends
 *   where its gas has cooled: its height is not set anywhere, it follows from how fast the gas rises and cools.
 * - What is drawn are tracers: points let go on the bed at hashed places and times and carried by the flow, each as
 *   hot as the gas where it is, gone once that has cooled. Sparks are tracers with weight of their own: they are
 *   thrown up with the gas, leave the flame and drift on, cooling.
 *
 * Lengths are in bed radii and the bed's middle is the origin, so one run serves a fire of any size at any place.
 * Everything is a function of the shape and the time, stepped at a fixed rate (`FIRE_TICK`), so the same shape gives
 * the same fire. `runFire` plays it through a scene's loop once and keeps it, as `SceneWater` keeps a pond's ripples.
 */

/** What decides how a fire burns, with nothing about where it is or how big: `runFire` gives the same loop for the same shape. */
export interface FireShape {
  /** How tall the flames are meant to stand, in bed radii (it sets how much room the gas is given and how fast it cools). */
  tall: number
  /** How fast it burns beside a campfire a tenth of a unit across: a bigger fire is slower, as the square root of its size. */
  quick: number
  /** Sparks thrown a second. */
  sparks: number
  /** Another fire of the same shape burns differently with another seed. */
  seed: number
  /** A steady wind across the fire, in bed radii a second along x and z. */
  wind?: readonly [number, number]
}

/** Seconds a tick of the fire. */
export const FIRE_TICK = 1 / 30
/** Grid cells to a bed radius. */
export const FIRE_CELLS = 3
/** How hard heat lifts the gas: cells a second, each second, at full heat. */
const BUOYANCY = 260
/** Seconds for gas to lose two thirds of its heat once it has left the bed, for a flame `TALL_REF` radii tall. */
const COOL = 0.6
const TALL_REF = 3.6
/** How strongly small swirls are kept up against the grid's smoothing. */
const SWIRL = 5
/** Rounds of the pressure solve a tick. */
const ROUNDS = 14
/** Tracers that make up the flame. */
export const FIRE_FLAMES = 520
/** Tracers that are sparks, after the flame's in a kept loop. */
export const FIRE_SPARKS = 16
/** Heat under which a flame tracer has gone out. */
const OUT = 0.07
/** Seconds a spark lasts at most. */
const SPARK_LIFE = 2.4
/** Moments a second the loop is kept at. */
export const FIRE_FPS = 24

/** A number from 0 to 1 for two whole numbers, the same everywhere. */
function hash(i: number, j = 0): number {
  let x = Math.imul((i + 1) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((j + 7) | 0, 0xc2b2ae35)
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
  x = Math.imul(x ^ (x >>> 15), 0x27d4eb2f)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}
const TAU = Math.PI * 2

/** A place on the bed where fuel burns: at (x, z) in cells from the middle, `r` cells across (half), `times` flare-ups a loop from `phase`. */
interface Spot { x: number; z: number; r: number; times: number; phase: number; least: number }

/** The gas over one bed: its flow and its heat on a grid, stepped by `tick`. */
export class Fire {
  /** Cells across, along x. */
  readonly nx: number
  /** Cells up. */
  readonly ny: number
  /** Cells across, along z. */
  readonly nz: number
  /** The flow along x, cells a second, a value a cell: x, then z, then up. */
  readonly u: Float32Array
  /** The flow along z, cells a second. */
  readonly v: Float32Array
  /** The flow upward, cells a second. */
  readonly w: Float32Array
  /** The heat, 0 to about 1. */
  readonly heat: Float32Array
  /** @internal */
  readonly spots: Spot[]
  private readonly a: Float32Array
  private readonly b: Float32Array
  private readonly c: Float32Array
  private readonly d: Float32Array
  private readonly p: Float32Array
  private readonly q: Float32Array
  private readonly div: Float32Array
  private readonly curl: Float32Array
  /** The shape it was made for. */
  readonly shape: FireShape
  /** Seconds a loop: the fuel flares a whole number of times in it. */
  readonly loop: number

  constructor(shape: FireShape, loop: number) {
    this.shape = shape; this.loop = loop
    this.nx = this.nz = FIRE_CELLS * 5 + 1
    this.ny = Math.max(14, Math.min(40, Math.ceil(shape.tall * FIRE_CELLS * 1.7)))
    const n = this.nx * this.ny * this.nz
    this.u = new Float32Array(n); this.v = new Float32Array(n); this.w = new Float32Array(n); this.heat = new Float32Array(n)
    this.a = new Float32Array(n); this.b = new Float32Array(n); this.c = new Float32Array(n); this.d = new Float32Array(n)
    this.p = new Float32Array(n); this.q = new Float32Array(n); this.div = new Float32Array(n); this.curl = new Float32Array(n * 3)
    // five places on the bed burn, one in the middle and four round it, each flaring up in its own time
    this.spots = []
    for (let s = 0; s < 5; s++) {
      const turn = hash(shape.seed, s) * TAU, out = s ? FIRE_CELLS * (0.35 + 0.3 * hash(shape.seed, s + 20)) : 0
      this.spots.push({ x: Math.cos(turn + s * 1.9) * out, z: Math.sin(turn + s * 1.9) * out, r: FIRE_CELLS * (s ? 0.42 : 0.6), times: Math.max(1, Math.round(loop * shape.quick * (0.35 + 0.5 * hash(shape.seed, s + 40)))), phase: hash(shape.seed, s + 60), least: s ? 0.25 : 0.6 })
    }
  }

  /** How hard a spot burns `t` seconds into the loop, 0 to 1: it flares and dies back, never quite out. */
  burning(s: Spot, t: number): number {
    const a = (t / this.loop) * s.times + s.phase
    return s.least + (1 - s.least) * (0.5 + 0.3 * Math.sin(a * TAU) + 0.2 * Math.sin(a * 3 * TAU + 1.7))
  }

  /** A field read between its cells at (x, y, z) in cells; `edge` is what lies past the sides and the top (the floor repeats its lowest cells). */
  sample(f: Float32Array, x: number, y: number, z: number, hold: boolean): number {
    const { nx, ny, nz } = this
    if (!hold && (x < -0.5 || z < -0.5 || x > nx - 0.5 || z > nz - 0.5 || y > ny - 0.5)) return 0
    x = x < 0 ? 0 : x > nx - 1.001 ? nx - 1.001 : x
    y = y < 0 ? 0 : y > ny - 1.001 ? ny - 1.001 : y
    z = z < 0 ? 0 : z > nz - 1.001 ? nz - 1.001 : z
    const i = x | 0, j = y | 0, k = z | 0, fx = x - i, fy = y - j, fz = z - k
    const o = i + nx * (k + nz * j), sx = 1, sz = nx, sy = nx * nz
    const lo = (f[o] * (1 - fx) + f[o + sx] * fx) * (1 - fz) + (f[o + sz] * (1 - fx) + f[o + sz + sx] * fx) * fz
    const hi = (f[o + sy] * (1 - fx) + f[o + sy + sx] * fx) * (1 - fz) + (f[o + sy + sz] * (1 - fx) + f[o + sy + sz + sx] * fx) * fz
    return lo * (1 - fy) + hi * fy
  }

  /** The flow at a point, in cells a second. */
  flowAt(x: number, y: number, z: number, out: Float32Array | number[]) {
    out[0] = this.sample(this.u, x, y, z, true); out[1] = this.sample(this.w, x, y, z, true); out[2] = this.sample(this.v, x, y, z, true)
  }

  /** The heat at a point (none outside the grid). */
  heatAt(x: number, y: number, z: number): number { return this.sample(this.heat, x, y, z, false) }

  /** Moves the fire on a tick; `t` is the time into the loop, which says how hard each spot burns. */
  tick(t: number) {
    const { nx, ny, nz, u, v, w, heat, shape } = this
    const dt = FIRE_TICK * shape.quick, sy = nx * nz, sz = nx, mid = (nx - 1) / 2
    // fuel burns on the bed: the two lowest layers over each spot are heated toward how hard it burns
    for (const s of this.spots) {
      const burn = this.burning(s, t), r = s.r
      for (let k = Math.max(0, Math.floor(mid + s.z - r)); k <= Math.min(nz - 1, Math.ceil(mid + s.z + r)); k++) for (let i = Math.max(0, Math.floor(mid + s.x - r)); i <= Math.min(nx - 1, Math.ceil(mid + s.x + r)); i++) {
        const dx = i - mid - s.x, dz = k - mid - s.z, near = 1 - (dx * dx + dz * dz) / (r * r)
        if (near <= 0) continue
        for (let j = 0; j < 2; j++) {
          const o = i + nx * (k + nz * j), to = burn * near * (j ? 0.8 : 1)
          if (heat[o] < to) heat[o] += (to - heat[o]) * Math.min(1, 14 * dt)
        }
      }
    }
    // heat lifts; a wind pushes the air that is not in the flame along with it
    const wind = shape.wind
    for (let o = 0; o < heat.length; o++) {
      w[o] += BUOYANCY * heat[o] * dt
      if (wind) { const k = Math.min(1, 2.5 * dt); u[o] += (wind[0] * FIRE_CELLS - u[o]) * k; v[o] += (wind[1] * FIRE_CELLS - v[o]) * k }
    }
    this.swirl(dt)
    // everything is carried along by the flow, looked up where it came from
    const { a, b, c, d } = this
    for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      const o = i + sz * k + sy * j
      const x = i - u[o] * dt, y = j - w[o] * dt, z = k - v[o] * dt
      a[o] = this.sample(u, x, y, z, true); b[o] = this.sample(v, x, y, z, true); c[o] = this.sample(w, x, y, z, true); d[o] = this.sample(heat, x, y, z, false)
    }
    u.set(a); v.set(b); w.set(c)
    // it cools as it goes, quicker the hotter it is (it glows its heat away), and a taller fire's gas holds its heat longer
    const cool = dt / (COOL * (shape.tall / TALL_REF))
    for (let o = 0; o < heat.length; o++) { const h = d[o]; heat[o] = Math.max(0, h - h * (0.55 + 0.9 * h) * cool - 0.02 * cool) }
    this.project()
  }

  /** Keeps small swirls turning: a push toward where the flow curls most, across the curl. */
  private swirl(dt: number) {
    const { nx, ny, nz, u, v, w, curl } = this, sy = nx * nz, sz = nx
    for (let j = 1; j < ny - 1; j++) for (let k = 1; k < nz - 1; k++) for (let i = 1; i < nx - 1; i++) {
      const o = i + sz * k + sy * j
      // x, z, up: the curl of (u, v, w) with z the second axis and y the third
      curl[o * 3] = (w[o + sz] - w[o - sz] - (v[o + sy] - v[o - sy])) / 2
      curl[o * 3 + 1] = (u[o + sy] - u[o - sy] - (w[o + 1] - w[o - 1])) / 2
      curl[o * 3 + 2] = (v[o + 1] - v[o - 1] - (u[o + sz] - u[o - sz])) / 2
    }
    const size = (o: number) => Math.hypot(curl[o * 3], curl[o * 3 + 1], curl[o * 3 + 2])
    for (let j = 2; j < ny - 2; j++) for (let k = 2; k < nz - 2; k++) for (let i = 2; i < nx - 2; i++) {
      const o = i + sz * k + sy * j
      let gx = size(o + 1) - size(o - 1), gz = size(o + sz) - size(o - sz), gy = size(o + sy) - size(o - sy)
      const g = Math.hypot(gx, gy, gz) + 1e-6
      gx /= g; gy /= g; gz /= g
      // (toward more curl) × curl, with the axes named as above: x is across, z the second grid axis, y up
      const cx = curl[o * 3], cz = curl[o * 3 + 1], cy = curl[o * 3 + 2]
      u[o] += SWIRL * dt * (gz * cy - gy * cz)
      v[o] += SWIRL * dt * (gy * cx - gx * cy)
      w[o] += SWIRL * dt * (gx * cz - gz * cx)
    }
  }

  /** Takes out of the flow whatever would pile air up or thin it: a pressure is found whose push leaves no cell gaining or losing air. The floor lets nothing through; the sides and top are open air. */
  private project() {
    const { nx, ny, nz, u, v, w, div } = this, sy = nx * nz, sz = nx
    let { p, q } = this
    for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      const o = i + sz * k + sy * j
      const ux = (i < nx - 1 ? u[o + 1] : u[o]) - (i > 0 ? u[o - 1] : u[o])
      const vz = (k < nz - 1 ? v[o + sz] : v[o]) - (k > 0 ? v[o - sz] : v[o])
      // nothing comes up through the floor: the cell under the lowest moves down as fast as that one moves up
      const wy = (j < ny - 1 ? w[o + sy] : w[o]) - (j > 0 ? w[o - sy] : -w[o])
      div[o] = (ux + vz + wy) / 2
    }
    p.fill(0)
    for (let round = 0; round < ROUNDS; round++) {
      for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
        const o = i + sz * k + sy * j
        const sum = (i > 0 ? p[o - 1] : 0) + (i < nx - 1 ? p[o + 1] : 0) + (k > 0 ? p[o - sz] : 0) + (k < nz - 1 ? p[o + sz] : 0) + (j > 0 ? p[o - sy] : p[o]) + (j < ny - 1 ? p[o + sy] : 0)
        q[o] = (sum - div[o]) / 6
      }
      const s = p; p = q; q = s
    }
    for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      const o = i + sz * k + sy * j
      u[o] -= ((i < nx - 1 ? p[o + 1] : 0) - (i > 0 ? p[o - 1] : 0)) / 2
      v[o] -= ((k < nz - 1 ? p[o + sz] : 0) - (k > 0 ? p[o - sz] : 0)) / 2
      w[o] -= ((j < ny - 1 ? p[o + sy] : 0) - (j > 0 ? p[o - sy] : p[o])) / 2
    }
    // the bed itself lets nothing down through it
    for (let o = 0; o < sy; o++) if (w[o] < 0) w[o] = 0
  }
}

/**
 * One loop of a fire, kept: where each tracer is, how hot and how big, at `FIRE_FPS` moments a second. Places are in
 * bed radii from the bed's middle (x, up, z). A tracer that is out has size 0.
 */
export interface FireLoop {
  /** Seconds a loop. */
  loop: number
  /** Moments kept. */
  frames: number
  /** Flame tracers first (`FIRE_FLAMES`), then sparks (`FIRE_SPARKS`). */
  count: number
  /** Three numbers a tracer a moment: x, up, z. */
  place: Float32Array
  /** Heat, 0 to 1, a tracer a moment. */
  heat: Float32Array
  /** Size as a share of a tracer's biggest, a tracer a moment. */
  size: Float32Array
  /** How strongly the whole fire burns at each moment, beside its mean over the loop (about 0.6 to 1.5): what its light flickers by. */
  power: Float32Array
}

/** The tracers of a fire, let go and carried as the fire is stepped. */
class Tracers {
  readonly count = FIRE_FLAMES + FIRE_SPARKS
  readonly place = new Float32Array(this.count * 3)
  readonly speed = new Float32Array(this.count * 3)
  readonly heat = new Float32Array(this.count)
  readonly size = new Float32Array(this.count)
  /** The birth each is living out (a whole number counted from the loop's start, so the same births come round each loop), or -1 before its first. */
  private readonly life = new Int32Array(this.count).fill(-1)
  private readonly out = new Uint8Array(this.count)
  private readonly every: Float32Array
  private readonly from: Float32Array
  private readonly births: Int32Array
  private readonly fire: Fire

  constructor(fire: Fire) {
    this.fire = fire
    const { loop, shape } = fire
    this.every = new Float32Array(this.count); this.from = new Float32Array(this.count); this.births = new Int32Array(this.count)
    for (let i = 0; i < this.count; i++) {
      // each is let go a whole number of times a loop, so the loop's end meets its start
      const spark = i >= FIRE_FLAMES
      const wanted = spark ? (shape.sparks * loop) / FIRE_SPARKS : (loop * shape.quick) / ((0.55 + 0.5 * hash(shape.seed + 3, i)) * (shape.tall / TALL_REF))
      const n = Math.max(spark ? 0 : 1, Math.floor(wanted + hash(shape.seed + 5, i)))
      this.births[i] = n
      this.every[i] = n ? loop / n : Infinity
      this.from[i] = hash(shape.seed + 7, i)
    }
  }

  /** Moves every tracer on a tick that ends `t` seconds from the start of the first loop (so `t` runs past the loop's length). */
  tick(t: number) {
    const { fire, place, speed, heat, size } = this, { shape, nx } = fire
    const dt = FIRE_TICK * shape.quick, mid = (nx - 1) / 2, flow = [0, 0, 0]
    for (let i = 0; i < this.count; i++) {
      const n = this.births[i]
      if (!n) { size[i] = 0; continue }
      const spark = i >= FIRE_FLAMES
      const born = Math.floor(t / this.every[i] - this.from[i])
      if (born > this.life[i] || this.life[i] < 0) {
        this.life[i] = Math.max(born, 0)
        if (born < 0) { size[i] = 0; this.out[i] = 1; continue }
        // let go on the bed over one of the spots, by a hash of which birth of the loop this is
        const which = ((born % n) + n) % n, s = fire.spots[Math.floor(hash(shape.seed + 11 + which, i) * fire.spots.length)]
        const turn = hash(shape.seed + 13 + which, i) * TAU, far = Math.sqrt(hash(shape.seed + 17 + which, i)) * s.r * (spark ? 0.6 : 1.05)
        place[i * 3] = mid + s.x + Math.cos(turn) * far; place[i * 3 + 1] = 0.3 + hash(shape.seed + 19 + which, i) * (spark ? 2 : 1.2); place[i * 3 + 2] = mid + s.z + Math.sin(turn) * far
        speed[i * 3] = speed[i * 3 + 1] = speed[i * 3 + 2] = 0
        this.out[i] = 0
        heat[i] = 1
      }
      if (this.out[i]) { size[i] = 0; continue }
      const age = t - (this.life[i] + this.from[i]) * this.every[i]
      const x = place[i * 3], y = place[i * 3 + 1], z = place[i * 3 + 2]
      if (!spark) {
        // carried by the gas (a midpoint step), as hot as the gas where it is
        fire.flowAt(x, y, z, flow)
        fire.flowAt(x + flow[0] * dt * 0.5, y + flow[1] * dt * 0.5, z + flow[2] * dt * 0.5, flow)
        place[i * 3] = x + flow[0] * dt; place[i * 3 + 1] = y + flow[1] * dt; place[i * 3 + 2] = z + flow[2] * dt
        speed[i * 3] = flow[0]; speed[i * 3 + 1] = flow[1]; speed[i * 3 + 2] = flow[2]
        const h = fire.heatAt(place[i * 3], place[i * 3 + 1], place[i * 3 + 2])
        heat[i] = h
        if (h < OUT && age > 0.08) { this.out[i] = 1; size[i] = 0; continue }
        // it comes in over a moment and thins as its gas cools, so nothing pops in or out
        size[i] = Math.min(1, age / 0.07) * Math.min(1, (h - OUT) / (OUT * 2.5)) * (0.45 + 0.55 * Math.sqrt(Math.min(1, h)))
      } else {
        // a spark has weight: it takes up the gas's speed in a while, keeps it on leaving the flame, and slows in the still air above
        const life = SPARK_LIFE * (0.6 + 0.4 * hash(shape.seed + 23, i)) / shape.quick
        if (age > life) { this.out[i] = 1; size[i] = 0; continue }
        fire.flowAt(x, y, z, flow)
        const inFlame = fire.heatAt(x, y, z) > 0.03 ? 1 : 0, take = Math.min(1, (inFlame ? 9 : 1.6) * dt)
        const drift = 0.9 * FIRE_CELLS, wob = age * shape.quick * 3 + i
        const tx = inFlame ? flow[0] : Math.sin(wob * 1.3) * drift + (shape.wind?.[0] ?? 0) * FIRE_CELLS
        const ty = inFlame ? flow[1] * 0.75 : 1.1 * FIRE_CELLS
        const tz = inFlame ? flow[2] : Math.cos(wob * 1.1) * drift + (shape.wind?.[1] ?? 0) * FIRE_CELLS
        speed[i * 3] += (tx - speed[i * 3]) * take; speed[i * 3 + 1] += (ty - speed[i * 3 + 1]) * take; speed[i * 3 + 2] += (tz - speed[i * 3 + 2]) * take
        place[i * 3] = x + speed[i * 3] * dt; place[i * 3 + 1] = y + speed[i * 3 + 1] * dt; place[i * 3 + 2] = z + speed[i * 3 + 2] * dt
        const gone = age / life
        heat[i] = 0.85 - 0.6 * gone
        size[i] = Math.min(1, age / 0.1) * (1 - gone * gone)
      }
    }
  }
}

/** Seconds the fire burns before anything is kept, and seconds past the loop's end that are mixed into its start so the two meet. */
const WARM = 2, LAP = 2

/**
 * A fire played through a loop of `loop` seconds and kept. The same fuel flares and the same tracers are let go each
 * loop, but the gas never repeats itself exactly, so the fire is run on past the loop's end for `LAP` seconds and
 * those moments are mixed into the loop's first ones, from all of the later run at the very start to none: the last
 * kept moment is followed by the first as closely as by the one the fire itself went on to.
 */
export function runFire(shape: FireShape, loop: number): FireLoop {
  const fire = new Fire(shape, loop), tracers = new Tracers(fire)
  const frames = Math.max(2, Math.round(loop * FIRE_FPS)), count = tracers.count, lap = Math.min(LAP, loop / 3)
  const kept: FireLoop = { loop, frames, count, place: new Float32Array(frames * count * 3), heat: new Float32Array(frames * count), size: new Float32Array(frames * count), power: new Float32Array(frames) }
  const mid = (fire.nx - 1) / 2
  // it burns from cold for a while first, on the last seconds of the loop before, so the first kept moment is a fire well alight
  let ticks = 0
  const until = (seconds: number) => { while ((ticks + 1) * FIRE_TICK <= seconds + 1e-9) { ticks++; const t = ticks * FIRE_TICK - WARM; fire.tick(((t % loop) + loop) % loop); tracers.tick(t + loop) } }
  for (let f = 0; ; f++) {
    const at = f / FIRE_FPS
    if (at >= loop + lap) break
    until(WARM + at)
    const into = f % frames, mix = f < frames ? 1 : 1 - (at - loop) / lap
    // the first pass writes the loop; the run past its end is mixed over its start
    let power = 0
    for (let i = 0; i < count; i++) {
      const o = into * count + i, x = (tracers.place[i * 3] - mid) / FIRE_CELLS, y = tracers.place[i * 3 + 1] / FIRE_CELLS, z = (tracers.place[i * 3 + 2] - mid) / FIRE_CELLS
      const size = tracers.size[i], heat = tracers.heat[i]
      if (i < FIRE_FLAMES) power += size * size * heat
      if (f < frames) { kept.place[o * 3] = x; kept.place[o * 3 + 1] = y; kept.place[o * 3 + 2] = z; kept.heat[o] = heat; kept.size[o] = size; continue }
      // a tracer out in one run and alight in the other fades between them where the lit one is
      const was = kept.size[o], w = was > 0 && size > 0 ? mix : size > 0 ? 1 : 0
      kept.place[o * 3] += (x - kept.place[o * 3]) * w; kept.place[o * 3 + 1] += (y - kept.place[o * 3 + 1]) * w; kept.place[o * 3 + 2] += (z - kept.place[o * 3 + 2]) * w
      kept.heat[o] += (heat - kept.heat[o]) * (was > 0 ? mix : size > 0 ? 1 : 0)
      kept.size[o] += (size - was) * mix
    }
    kept.power[into] = f < frames ? power : kept.power[into] + (power - kept.power[into]) * mix
  }
  let mean = 0
  for (let f = 0; f < frames; f++) mean += kept.power[f] / frames
  for (let f = 0; f < frames; f++) kept.power[f] = mean > 0 ? kept.power[f] / mean : 1
  return kept
}

/** How strongly a kept fire burns `t` seconds into its loop, beside its mean (smoothed over a few moments, as an eye and a lit wall take it). */
export function powerAt(kept: FireLoop, t: number): number {
  const f = ((((t / kept.loop) % 1) + 1) % 1) * kept.frames, a = Math.floor(f), w = f - a
  let sum = 0
  for (let k = -1; k <= 2; k++) sum += kept.power[(((a + k) % kept.frames) + kept.frames) % kept.frames] * (k === 0 ? 1 - w + 0.5 : k === 1 ? w + 0.5 : 0.5 * (k < 0 ? 1 - w : w))
  return sum / 2.5
}

/** A fire's colors from its coolest to its hottest, 0 to 1 as blobs hold them (sRGB): deep red, orange, yellow, white-hot. */
export type FireColors = readonly [Vec3, Vec3, Vec3, Vec3]

/** Heat at which each color is reached. */
const STEPS = [0.1, 0.32, 0.6, 0.9]

/** The color of gas at `heat`, along the fire's four colors. */
export function fireColor(heat: number, colors: FireColors, out: Float32Array | number[], at = 0) {
  let k = 0
  while (k < 2 && heat > STEPS[k + 1]) k++
  const w = Math.min(1, Math.max(0, (heat - STEPS[k]) / (STEPS[k + 1] - STEPS[k]))), a = colors[k], b = colors[k + 1]
  out[at] = a[0] + (b[0] - a[0]) * w; out[at + 1] = a[1] + (b[1] - a[1]) * w; out[at + 2] = a[2] + (b[2] - a[2]) * w
}
