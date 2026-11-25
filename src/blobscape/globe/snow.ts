/**
 * Snow Globe (issue #459): a Diorama scene under a glass dome, with snow in the water round it that a shake stirs up.
 * Pure: the dome fitted round the scene, the snow as particles carried by the water, and the blobs that draw the
 * glass, the base and the flakes. The page (SnowGlobe.tsx) steps it by the stage's clock and sends the flakes up.
 *
 * The water is not simulated cell by cell: a shake sets it turning slowly about a tilted axis and stirs it into
 * swirls that drift (a field with no sources or sinks, so the snow spreads through it rather than piling up where
 * water would go down), both dying away over a few seconds. Each flake is dragged
 * toward the water's speed plus its own slow fall, so heavy flakes come down first and light ones drift, and a flake
 * that reaches the ground while the water is still lies there until the next shake lifts it.
 */
import { Blobs } from '../../splat-core/blobs.ts'
import { rng } from '../../splat-engine/body.ts'
import { Skeleton, emptySkin } from '../../splat-engine/rig.ts'
import { buildVoxels, cylinder, torus, type VoxelPart } from '../../splat-engine/voxel.ts'

type Vec3 = [number, number, number]

/** The dome: a sphere cut flat at `floor`, where it meets the base. */
export interface Globe {
  center: Vec3
  radius: number
  /** The height the glass is cut at: the scene's lowest point. */
  floor: number
  /** The radius of the circle where the glass meets the base. */
  rim: number
}

/** How much room the dome leaves round the scene, as a share of its radius. */
export const ROOM = 0.06

/**
 * The smallest dome round these points (centers, three numbers each) whose cut sits at their lowest point: the middle
 * is the middle of their box across, and its height is searched for the smallest radius that holds them all.
 */
export function fitGlobe(points: ArrayLike<number>, every = 1): Globe {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity
  const n = Math.floor(points.length / 3)
  for (let i = 0; i < n; i++) {
    const x = points[i * 3], y = points[i * 3 + 1], z = points[i * 3 + 2]
    if (x < x0) x0 = x; if (x > x1) x1 = x
    if (y < y0) y0 = y; if (y > y1) y1 = y
    if (z < z0) z0 = z; if (z > z1) z1 = z
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
  // the search looks at every `every`th point; the radius found is then checked against them all
  const reach = (cy: number, step = every) => {
    let most = 0
    for (let i = 0; i < n; i += step) {
      const dx = points[i * 3] - cx, dy = points[i * 3 + 1] - cy, dz = points[i * 3 + 2] - cz
      const d = dx * dx + dy * dy + dz * dz
      if (d > most) most = d
    }
    return Math.sqrt(most)
  }
  // the radius against the middle's height is convex: a golden section search finds its lowest
  let a = y0, b = Math.max(y1, y0 + 1e-3)
  const g = (Math.sqrt(5) - 1) / 2
  for (let k = 0; k < 40; k++) {
    const c = b - g * (b - a), d = a + g * (b - a)
    if (reach(c) < reach(d)) b = d; else a = c
  }
  const cy = (a + b) / 2
  const radius = reach(cy, 1) * (1 + ROOM)
  const h = cy - y0
  return { center: [cx, cy, cz], radius, floor: y0, rim: Math.sqrt(Math.max(radius * radius - h * h, (radius * 0.5) ** 2)) }
}

/** Seconds for a shake's turning to die to a third. */
export const SWIRL_LIFE = 4
/** Seconds for the stirring to die to a third. */
export const STIR_LIFE = 3.5
/** The fastest the water turns after the hardest shake, in turns a second. */
export const SWIRL_MOST = 0.12
/** How quickly a flake takes the water's speed: a third of the difference goes in 1/DRAG seconds. */
export const DRAG = 3
/** The slowest and fastest a flake falls through still water, in dome radii a second. */
export const FALL = [0.035, 0.11] as const
/** A lying flake is lifted again where the water moves faster than this, in dome radii a second. */
export const LIFT_FROM = 0.18

/** The snow in a dome: flakes carried by the water a shake sets moving. */
export class Snow {
  readonly count: number
  /** Where each flake is: three numbers a flake. */
  readonly pos: Float32Array
  readonly vel: Float32Array
  /** 1 where a flake lies on the ground. */
  readonly lying: Uint8Array
  /** How fast each flake falls in still water. */
  readonly fall: Float32Array
  /** How fast the water turns, in radians a second, about `axis`. */
  swirl = 0
  axis: Vec3 = [0, 1, 0]
  /** How hard the water is stirred, 0 to 1. */
  stir = 0
  /** Seconds the water has been moving, for the stirring's pattern. */
  time = 0
  private readonly heights: Float32Array
  private readonly least: number
  private readonly cells: number
  private readonly random: () => number

  /**
   * `ground(x, z)` is the height snow lies at (the scene's ground, worked out once on a grid here); `size` is a
   * flake's radius, which keeps it off the glass and the ground.
   */
  readonly globe: Globe
  /** A flake's radius, which keeps it off the glass and the ground. */
  readonly size: number

  /** `least` is the lowest snow lies (the top of the base's snow, where there is no ground under it). */
  constructor(globe: Globe, count: number, ground: (x: number, z: number) => number, size: number, seed = 1, cells = 40, least = globe.floor) {
    this.globe = globe
    this.size = size
    this.least = least
    this.count = count
    this.pos = new Float32Array(count * 3)
    this.vel = new Float32Array(count * 3)
    this.lying = new Uint8Array(count)
    this.fall = new Float32Array(count)
    this.random = rng(seed)
    const { center, rim } = globe
    this.cells = cells
    this.heights = new Float32Array(cells * cells)
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
      const x = center[0] + ((i + 0.5) / cells * 2 - 1) * rim, z = center[2] + ((j + 0.5) / cells * 2 - 1) * rim
      const g = ground(x, z)
      this.heights[j * cells + i] = Number.isFinite(g) ? Math.max(least, g) : least
    }
    for (let i = 0; i < count; i++) this.fall[i] = (FALL[0] + (FALL[1] - FALL[0]) * this.random() ** 1.5) * globe.radius
    this.lieDown()
  }

  /** Where snow lies under (x, z), bilinear between the grid's heights. */
  groundAt(x: number, z: number): number {
    const { center, rim } = this.globe, n = this.cells
    const u = ((x - center[0]) / rim * 0.5 + 0.5) * n - 0.5, v = ((z - center[2]) / rim * 0.5 + 0.5) * n - 0.5
    if (u < -0.5 || v < -0.5 || u > n - 0.5 || v > n - 0.5) return this.least
    const i = Math.max(0, Math.min(n - 2, Math.floor(u))), j = Math.max(0, Math.min(n - 2, Math.floor(v)))
    const fu = Math.max(0, Math.min(1, u - i)), fv = Math.max(0, Math.min(1, v - j))
    const h = this.heights
    const a = h[j * n + i] + (h[j * n + i + 1] - h[j * n + i]) * fu
    const b = h[(j + 1) * n + i] + (h[(j + 1) * n + i + 1] - h[(j + 1) * n + i]) * fu
    return a + (b - a) * fv
  }

  /** Every flake lying on the ground, spread over the floor of the dome, the water still. */
  lieDown() {
    const { center, rim } = this.globe
    for (let i = 0; i < this.count; i++) {
      const r = rim * 0.96 * Math.sqrt(this.random()), a = this.random() * Math.PI * 2
      const x = center[0] + r * Math.cos(a), z = center[2] + r * Math.sin(a)
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = this.groundAt(x, z) + this.size; this.pos[i * 3 + 2] = z
      this.vel.fill(0, i * 3, i * 3 + 3)
      this.lying[i] = 1
    }
    this.swirl = 0; this.stir = 0
    // a flake under a bank of the ground is kept inside the glass too
    this.keepIn()
  }

  /**
   * A shake, `strength` 0 to 1: the water turns (one way or the other by `way`, the shake's direction across the view,
   * which also tips the axis it turns about) and is stirred, and the snow lying is thrown up into it.
   */
  shake(strength: number, way: readonly [number, number] = [1, 0]) {
    const s = Math.max(0, Math.min(1, strength))
    const sign = way[0] >= 0 ? 1 : -1
    const turn = SWIRL_MOST * 2 * Math.PI * s * sign
    // a new shake adds to the turning, up to the most there can be
    this.swirl = Math.max(-SWIRL_MOST * 2 * Math.PI, Math.min(SWIRL_MOST * 2 * Math.PI, this.swirl + turn))
    const tip = 0.35 * Math.max(-1, Math.min(1, way[1]))
    const len = Math.hypot(tip, 1)
    this.axis = [tip / len, 1 / len, 0]
    this.stir = Math.min(1, this.stir + s)
    const R = this.globe.radius
    for (let i = 0; i < this.count; i++) {
      if (!this.lying[i] && this.random() > s) continue
      this.lying[i] = 0
      const k = s * R * (0.8 + 1.4 * this.random())
      this.vel[i * 3] += (this.random() - 0.5) * k
      this.vel[i * 3 + 1] += k * (0.8 + this.random())
      this.vel[i * 3 + 2] += (this.random() - 0.5) * k
    }
  }

  /** The water's speed at a point: its turning and its stirring. */
  water(x: number, y: number, z: number, out: Vec3): Vec3 {
    const { center, radius: R } = this.globe
    const rx = x - center[0], ry = y - center[1], rz = z - center[2]
    const [ax, ay, az] = this.axis, w = this.swirl
    out[0] = w * (ay * rz - az * ry)
    out[1] = w * (az * rx - ax * rz)
    out[2] = w * (ax * ry - ay * rx)
    if (this.stir > 1e-3) {
      // stirring: smooth swirls that drift with time
      const t = this.time, k = 4 / R, q = Math.sqrt(this.stir) * 0.7 * R
      out[0] += q * Math.sin(ry * k + t * 1.3) * Math.cos(rz * k * 0.8 - t * 0.7)
      out[1] += q * Math.sin(rz * k + t * 1.1) * Math.cos(rx * k * 0.9 + t * 0.5)
      out[2] += q * Math.sin(rx * k - t * 1.7) * Math.cos(ry * k * 1.1 + t * 0.9)
    }
    return out
  }

  /** How much is moving, 0 to 1: the water's turning and stirring, for the page to say. */
  get moving(): number {
    return Math.max(Math.abs(this.swirl) / (SWIRL_MOST * 2 * Math.PI), this.stir)
  }

  /** How many flakes are lying on the ground. */
  get settled(): number {
    let n = 0
    for (let i = 0; i < this.count; i++) n += this.lying[i]
    return n
  }

  /** Moves the snow on `dt` seconds, in steps of at most a sixtieth. */
  step(dt: number) {
    const steps = Math.max(1, Math.ceil(dt * 60))
    for (let s = 0; s < steps; s++) this.tick(dt / steps)
  }

  private tick(dt: number) {
    if (dt <= 0) return
    this.time += dt
    this.swirl *= Math.exp(-dt / SWIRL_LIFE)
    this.stir *= Math.exp(-dt / STIR_LIFE)
    if (Math.abs(this.swirl) < 1e-4) this.swirl = 0
    if (this.stir < 1e-4) this.stir = 0
    const take = 1 - Math.exp(-dt * DRAG), R = this.globe.radius, lift = LIFT_FROM * R
    const u: Vec3 = [0, 0, 0]
    const { pos, vel } = this
    const still = this.swirl === 0 && this.stir === 0
    for (let i = 0; i < this.count; i++) {
      const o = i * 3
      if (this.lying[i]) {
        if (still) continue
        this.water(pos[o], pos[o + 1], pos[o + 2], u)
        if (Math.hypot(u[0], u[1], u[2]) < lift) continue
        this.lying[i] = 0
      } else this.water(pos[o], pos[o + 1], pos[o + 2], u)
      vel[o] += (u[0] - vel[o]) * take
      vel[o + 1] += (u[1] - this.fall[i] - vel[o + 1]) * take
      vel[o + 2] += (u[2] - vel[o + 2]) * take
      pos[o] += vel[o] * dt; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt
      this.wall(i)
      const g = this.groundAt(pos[o], pos[o + 2]) + this.size
      if (pos[o + 1] < g) {
        pos[o + 1] = g
        // it settles where the water is too slow to keep it up
        if (Math.hypot(u[0], u[1], u[2]) < lift) { this.lying[i] = 1; vel.fill(0, o, o + 3) }
        else if (vel[o + 1] < 0) vel[o + 1] = 0
      }
    }
  }

  /** Keeps every flake inside the glass. */
  private keepIn() { for (let i = 0; i < this.count; i++) { this.wall(i); this.onGround(i) } }

  /** Lifts a flake the glass pushed into the ground back onto it. */
  private onGround(i: number) {
    const o = i * 3, g = this.groundAt(this.pos[o], this.pos[o + 2]) + this.size
    if (this.pos[o + 1] < g) this.pos[o + 1] = g
  }

  /** Puts a flake back inside the glass and takes away its speed into it. */
  private wall(i: number) {
    const { center, radius } = this.globe, { pos, vel } = this, o = i * 3
    const dx = pos[o] - center[0], dy = pos[o + 1] - center[1], dz = pos[o + 2] - center[2]
    const d = Math.hypot(dx, dy, dz), limit = radius - this.size * 2
    if (d <= limit || d === 0) return
    const nx = dx / d, ny = dy / d, nz = dz / d
    pos[o] = center[0] + nx * limit; pos[o + 1] = center[1] + ny * limit; pos[o + 2] = center[2] + nz * limit
    const out = vel[o] * nx + vel[o + 1] * ny + vel[o + 2] * nz
    if (out > 0) { vel[o] -= out * nx; vel[o + 1] -= out * ny; vel[o + 2] -= out * nz }
  }
}

/** An actor of `blobs` all on one still bone. */
export function stillActor(blobs: Blobs, name = 'still') {
  const skeleton = new Skeleton([{ name, parent: -1, head: [0, 0, 0] }])
  const skin = emptySkin(blobs.count)
  for (let i = 0; i < blobs.count; i++) skin.weights[i * 4] = 1
  return { blobs, skin, skeleton }
}

/** The quaternion (x, y, z, w) that turns +z onto the unit vector n. */
export function facing(n: Vec3): [number, number, number, number] {
  const d = n[2]
  if (d < -0.999999) return [1, 0, 0, 0]
  // half-way: axis z × n, angle acos(d)
  const x = -n[1], y = n[0], w = 1 + d, l = Math.hypot(x, y, w)
  return [x / l, y / l, 0, w / l]
}

/** The flakes: small flat white discs each turned its own way, placed where the snow is (`placeFlakes`). */
export function flakeBlobs(snow: Snow, seed = 3): Blobs {
  const random = rng(seed), b = new Blobs(snow.count)
  const s = snow.size
  for (let i = 0; i < snow.count; i++) {
    const n: Vec3 = [random() - 0.5, random() - 0.5, random() - 0.5]
    const l = Math.hypot(...n) || 1
    const k = 0.7 + 0.6 * random()
    b.push({ center: [snow.pos[i * 3], snow.pos[i * 3 + 1], snow.pos[i * 3 + 2]], scale: [s * k, s * k, s * k * 0.4], quat: facing([n[0] / l, n[1] / l, n[2] / l]), color: [0.96, 0.97, 1], opacity: 0.92 })
  }
  return b
}

/** Copies where the snow is onto its blobs. */
export function placeFlakes(snow: Snow, blobs: Blobs) {
  blobs.center.set(snow.pos.subarray(0, snow.count * 3))
}

/** How see-through the glass is: each disc's opacity, and the highlights'. */
export const GLASS = { opacity: 0.045, shine: 0.5 }

/**
 * The glass: faint discs lying on the sphere above the cut, close enough to cover it, and a few brighter ones in two
 * curved streaks toward the light (up and to the left), as a window reflects in a real dome.
 */
export function glassBlobs(globe: Globe, count = 2600, clear = 1): Blobs {
  const { center, radius: R, floor } = globe
  const b = new Blobs(count + 200)
  // Fibonacci points over the whole sphere, keeping those above the cut
  const golden = Math.PI * (3 - Math.sqrt(5))
  const total = Math.ceil(count / Math.max(0.2, (center[1] + R - floor) / (2 * R)))
  const disc = R * Math.sqrt(4 / total) * 1.15
  for (let i = 0; i < total; i++) {
    const y = 1 - (2 * (i + 0.5)) / total, r = Math.sqrt(1 - y * y), a = i * golden
    const n: Vec3 = [Math.cos(a) * r, y, Math.sin(a) * r]
    const p: Vec3 = [center[0] + n[0] * R, center[1] + n[1] * R, center[2] + n[2] * R]
    if (p[1] < floor + disc * 0.5) continue
    b.push({ center: p, scale: [disc, disc, disc * 0.08], quat: facing(n), color: [0.86, 0.93, 1], opacity: GLASS.opacity * clear })
  }
  // the highlights: two arcs on the upper left of the dome as it is first seen (from the front, +z)
  for (const [from, to, at, wide] of [[0.35, 1.05, 0.62, 1], [0.5, 0.85, 0.9, 0.6]] as const) {
    const steps = 46
    for (let k = 0; k < steps; k++) {
      const u = from + ((to - from) * k) / (steps - 1)
      const az = -at, el = u
      const n: Vec3 = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]
      const fade = Math.sin(((k + 0.5) / steps) * Math.PI)
      const s = R * 0.028 * wide
      b.push({ center: [center[0] + n[0] * R * 1.002, center[1] + n[1] * R * 1.002, center[2] + n[2] * R * 1.002], scale: [s, s * 2.2, s * 0.1], quat: facing(n), color: [1, 1, 1], opacity: GLASS.shine * fade * clear })
    }
  }
  return b
}

/** The base: a turned wooden plinth with a brass ring where the glass sits, and a disc of snow over its top. */
export function baseActor(globe: Globe, spacing: number) {
  const { center, rim, floor, radius } = globe
  const tall = radius * 0.32, c: [number, number] = [center[0], center[2]]
  const wood = (p: Vec3): Vec3 => {
    const grain = 0.86 + 0.14 * Math.sin(p[1] * 90 / radius + Math.sin(Math.atan2(p[2] - c[1], p[0] - c[0]) * 3) * 1.5)
    return [0.42 * grain, 0.25 * grain, 0.15 * grain]
  }
  const parts: VoxelPart[] = [
    { shape: cylinder(c, floor - tall, floor - tall * 0.78, rim * 1.22, rim * 1.18), color: wood, bone: 'base' },
    { shape: cylinder(c, floor - tall * 0.8, floor - tall * 0.12, rim * 1.12, rim * 1.02), color: wood, bone: 'base' },
    { shape: torus([c[0], floor - tall * 0.08, c[1]], rim * 1.02, tall * 0.1), color: [0.86, 0.66, 0.3], bone: 'base' },
    { shape: cylinder(c, floor - tall * 0.12, floor + spacing * 0.5, rim * 1.0, rim * 0.99), color: [0.92, 0.94, 0.98], bone: 'base' },
  ]
  return buildVoxels({ bones: [{ name: 'base', parent: -1, head: [c[0], floor, c[1]] }], parts, spacing, disc: 0.75 })
}
