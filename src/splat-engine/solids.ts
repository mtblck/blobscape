/**
 * Solid things for the flowing materials of mpm.ts to meet: a `Solid` is a
 * shape given as a distance function (voxel.ts's `Shape`), either fixed in
 * place (a block, steps, a bowl) or a rigid body that falls, turns and is
 * pushed back by what it lands in (a ball, a cube, a rock). The simulation
 * asks only how far a point is inside and which way is out; a body also
 * carries points on its own surface, which is how it meets the floor, the
 * walls and the fixed solids.
 *
 * Pure and tested.
 */
import type { Shape } from './voxel.ts'

type Vec3 = [number, number, number]

/** Options for a `Solid`. */
export interface SolidOptions {
  /** Where its middle starts (a body), in the simulation's units. */
  at?: Vec3
  /** Its weight for its size, against the material's 1. Left out or 0, it is fixed in place and its shape is read where it is. */
  density?: number
  /** How much it grips what slides on it: 0 is ice. */
  friction?: number
  /** Points on its surface to meet the world with, on top of the ones found for it (a cube's corners). */
  corners?: Vec3[]
  /** Its starting speed. */
  velocity?: Vec3
  /** For a ball: its radius. It then meets the world at the exact point under it, not at the nearest of its surface points, so it rolls instead of rocking. */
  round?: number
}

/** What a body can run into besides the material: the floor, the four walls and the fixed solids. */
export interface Room {
  /** The floor's height. */
  floor: number
  /** The near walls: x and z stay above this. */
  lo: number
  /** The far walls: x and z stay under this. */
  hi: number
  /** Downward pull. */
  gravity: number
  /** Fixed solids to stay out of. */
  fixed: Solid[]
}

/** How many points a body meets the world with, before its `corners`. */
const POINTS = 64
/** Samples a side when weighing a body. */
const WEIGH = 16
/** How much of a sinking-in is put right each step. */
const PUSH_OUT = 0.2
/** A body slower than this (speed and turning, squared) for `REST` seconds while something holds it up goes to sleep. */
const STILL = 2e-3, REST = 0.4
/** A sleeping body wakes this often (seconds) for a moment (`NAP_CHECK`), in case what held it has gone. */
const NAP = 0.3, NAP_CHECK = 0.04

/**
 * A solid thing in a material simulation: fixed, or a rigid body with weight. Its shape is a distance function; a
 * body's shape is given about its own middle and is carried by `pos` and `quat`.
 */
export class Solid {
  /** Its shape: for a body, about its own middle. */
  readonly shape: Shape
  /** Whether it stays put. */
  readonly fixed: boolean
  /** Where its middle is (a body). */
  readonly pos = new Float64Array(3)
  /** How it is turned (x, y, z, w). */
  readonly quat = new Float64Array([0, 0, 0, 1])
  /** Its speed. */
  readonly vel = new Float64Array(3)
  /** How fast it turns, about each axis of the world. */
  readonly spin = new Float64Array(3)
  /** Its mass: infinite when fixed. */
  readonly mass: number
  /** Its volume. */
  readonly volume: number
  /** Its resistance to turning about each of its own axes. */
  readonly inertia: Vec3
  /** No part of it is further than this from its middle. */
  readonly reach: number
  /** How much it grips. */
  friction: number
  /** @internal Its turn as a 3×3, row-major. */
  readonly rot = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
  /** @internal Points on its surface, about its middle. */
  readonly points: Float64Array
  /** @internal A ball's radius, or 0. */
  private readonly round: number
  /** @internal Seconds it has lain still, and whether it sleeps. */
  private rested = 0
  private napped = 0
  /** Whether the material was pressing on it in the last step. */
  held = false
  /** Whether it has come to rest: a sleeping body is fixed until something pushes it. */
  asleep = false

  constructor(shape: Shape, o: SolidOptions = {}) {
    this.shape = shape
    this.fixed = !o.density
    this.friction = o.friction ?? 0.5
    this.round = o.round ?? 0
    const { min, max } = shape
    this.reach = this.fixed
      ? Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2
      : Math.hypot(Math.max(-min[0], max[0]), Math.max(-min[1], max[1]), Math.max(-min[2], max[2]))
    if (this.fixed) {
      for (let k = 0; k < 3; k++) this.pos[k] = (min[k] + max[k]) / 2
      this.mass = Infinity; this.volume = 0; this.inertia = [Infinity, Infinity, Infinity]
      this.points = new Float64Array(0)
      return
    }
    if (o.at) this.pos.set(o.at)
    if (o.velocity) this.vel.set(o.velocity)
    // weigh it: the share of a box of samples that is inside
    let inside = 0, ix = 0, iy = 0, iz = 0
    const cell = [0, 1, 2].map((k) => (max[k] - min[k]) / WEIGH)
    for (let a = 0; a < WEIGH; a++) for (let b = 0; b < WEIGH; b++) for (let c = 0; c < WEIGH; c++) {
      const x = min[0] + (a + 0.5) * cell[0], y = min[1] + (b + 0.5) * cell[1], z = min[2] + (c + 0.5) * cell[2]
      if (shape.sdf(x, y, z) > 0) continue
      inside++
      ix += y * y + z * z; iy += x * x + z * z; iz += x * x + y * y
    }
    const dv = cell[0] * cell[1] * cell[2]
    this.volume = Math.max(inside * dv, 1e-9)
    this.mass = this.volume * o.density!
    const per = (this.mass / Math.max(inside, 1))
    this.inertia = [Math.max(ix * per, 1e-12), Math.max(iy * per, 1e-12), Math.max(iz * per, 1e-12)]
    // points on the surface: walk in from outside along evenly spread directions
    const pts: number[] = []
    for (let i = 0; i < POINTS; i++) {
      const y = 1 - (2 * (i + 0.5)) / POINTS, r = Math.sqrt(1 - y * y), t = i * 2.399963229728653
      const d: Vec3 = [Math.cos(t) * r, y, Math.sin(t) * r]
      let at = this.reach * 1.05
      for (let s = 0; s < 40; s++) {
        const dist = shape.sdf(d[0] * at, d[1] * at, d[2] * at)
        if (dist < 1e-5) break
        at -= dist
        if (at <= 0) { at = 0; break }
      }
      pts.push(d[0] * at, d[1] * at, d[2] * at)
    }
    for (const c of o.corners ?? []) pts.push(c[0], c[1], c[2])
    this.points = new Float64Array(pts)
  }

  /** How far a point of the world is from its surface: negative inside. */
  distance(x: number, y: number, z: number): number {
    if (this.fixed) return this.shape.sdf(x, y, z)
    const r = this.rot, px = x - this.pos[0], py = y - this.pos[1], pz = z - this.pos[2]
    return this.shape.sdf(r[0] * px + r[3] * py + r[6] * pz, r[1] * px + r[4] * py + r[7] * pz, r[2] * px + r[5] * py + r[8] * pz)
  }

  /** The way out of it at a point of the world, as a unit vector written to `out`. */
  normal(x: number, y: number, z: number, out: Float64Array | number[]) {
    const e = 1e-4
    let nx = this.distance(x + e, y, z) - this.distance(x - e, y, z)
    let ny = this.distance(x, y + e, z) - this.distance(x, y - e, z)
    let nz = this.distance(x, y, z + e) - this.distance(x, y, z - e)
    const l = Math.hypot(nx, ny, nz)
    if (l < 1e-12) { nx = 0; ny = 1; nz = 0 } else { nx /= l; ny /= l; nz /= l }
    out[0] = nx; out[1] = ny; out[2] = nz
  }

  /** The speed of the point of it at `r` from its middle, written to `out`. */
  speedAt(rx: number, ry: number, rz: number, out: Float64Array | number[]) {
    const w = this.spin, v = this.vel
    out[0] = v[0] + w[1] * rz - w[2] * ry
    out[1] = v[1] + w[2] * rx - w[0] * rz
    out[2] = v[2] + w[0] * ry - w[1] * rx
  }

  /** Pushes it at the point `r` from its middle: a kick `j` (mass times change of speed). Wakes it. */
  kick(rx: number, ry: number, rz: number, jx: number, jy: number, jz: number) {
    if (this.fixed) return
    const im = 1 / this.mass
    this.vel[0] += jx * im; this.vel[1] += jy * im; this.vel[2] += jz * im
    this.turnBy(ry * jz - rz * jy, rz * jx - rx * jz, rx * jy - ry * jx)
  }

  /** @internal Adds to the spin what a turning kick gives: I⁻¹ in the world is R diag(1/I) Rᵀ. */
  turnBy(tx: number, ty: number, tz: number) {
    const r = this.rot, I = this.inertia
    const lx = (r[0] * tx + r[3] * ty + r[6] * tz) / I[0], ly = (r[1] * tx + r[4] * ty + r[7] * tz) / I[1], lz = (r[2] * tx + r[5] * ty + r[8] * tz) / I[2]
    this.spin[0] += r[0] * lx + r[1] * ly + r[2] * lz
    this.spin[1] += r[3] * lx + r[4] * ly + r[5] * lz
    this.spin[2] += r[6] * lx + r[7] * ly + r[8] * lz
  }

  /** @internal Its inertia in the world, a 3×3 written row-major to `out`. */
  worldInertia(out: Float64Array | number[]) {
    const r = this.rot, I = this.inertia
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) out[a * 3 + b] = r[a * 3] * I[0] * r[b * 3] + r[a * 3 + 1] * I[1] * r[b * 3 + 1] + r[a * 3 + 2] * I[2] * r[b * 3 + 2]
  }

  /** Wakes a sleeping body. */
  wake() { this.asleep = false; this.rested = 0; this.napped = 0 }

  /** Gravity for one step: call before the material has pushed on it. */
  fall(room: Room, dt: number) {
    if (this.fixed || this.asleep) return
    this.vel[1] -= room.gravity * dt
  }

  /**
   * Meets the floor, the walls and the fixed solids, then moves on by `dt`: call after the material has pushed on it.
   * `held` says the material is holding it up too, which lets it sleep where it lies.
   */
  move(room: Room, dt: number, held = false) {
    if (this.fixed) return
    if (this.asleep) {
      // look again now and then: what held it up may have run out from under it
      this.vel.fill(0); this.spin.fill(0)
      this.napped += dt
      if (this.napped > NAP) { this.asleep = false; this.napped = 0; this.rested = REST - NAP_CHECK }
      return
    }
    const { points: pts, rot: r, pos, vel, spin } = this
    const n = N, u = UU
    let touching = held
    let outX = 0, outY = 0, outZ = 0
    const R = this.round
    /** One point of the body at `r` from its middle, `depth` inside something whose way out is `n`. */
    const touch = (rx: number, ry: number, rz: number, depth: number, grip: number, first: boolean) => {
      touching = true
      if (first) {
        const o = depth * PUSH_OUT
        if (Math.abs(n[0] * o) > Math.abs(outX)) outX = n[0] * o
        if (Math.abs(n[1] * o) > Math.abs(outY)) outY = n[1] * o
        if (Math.abs(n[2] * o) > Math.abs(outZ)) outZ = n[2] * o
      }
      this.speedAt(rx, ry, rz, u)
      const un = u[0] * n[0] + u[1] * n[1] + u[2] * n[2]
      if (un >= 0) return
      // stop it going in, then take off sideways speed by as much as the grip allows
      const jn = -un / this.give(rx, ry, rz, n[0], n[1], n[2])
      this.kick(rx, ry, rz, n[0] * jn, n[1] * jn, n[2] * jn)
      this.speedAt(rx, ry, rz, u)
      const un2 = u[0] * n[0] + u[1] * n[1] + u[2] * n[2]
      let tx = u[0] - un2 * n[0], ty = u[1] - un2 * n[1], tz = u[2] - un2 * n[2]
      const side = Math.hypot(tx, ty, tz)
      if (side > 1e-9) {
        tx /= side; ty /= side; tz /= side
        const jt = Math.min(side / this.give(rx, ry, rz, tx, ty, tz), grip * jn)
        this.kick(rx, ry, rz, -tx * jt, -ty * jt, -tz * jt)
      }
    }
    for (let pass = 0; pass < 3; pass++) {
      if (R) {
        // a ball: the floor, each wall and each fixed solid meet it at the one point of it nearest them
        const x = pos[0], y = pos[1], z = pos[2]
        if (y - R < room.floor) { n[0] = 0; n[1] = 1; n[2] = 0; touch(0, -R, 0, room.floor - y + R, this.friction, pass === 0) }
        if (x - R < room.lo) { n[0] = 1; n[1] = 0; n[2] = 0; touch(-R, 0, 0, room.lo - x + R, this.friction, pass === 0) }
        if (x + R > room.hi) { n[0] = -1; n[1] = 0; n[2] = 0; touch(R, 0, 0, x + R - room.hi, this.friction, pass === 0) }
        if (z - R < room.lo) { n[0] = 0; n[1] = 0; n[2] = 1; touch(0, 0, -R, room.lo - z + R, this.friction, pass === 0) }
        if (z + R > room.hi) { n[0] = 0; n[1] = 0; n[2] = -1; touch(0, 0, R, z + R - room.hi, this.friction, pass === 0) }
        for (const f of room.fixed) {
          if (Math.hypot(x - f.pos[0], y - f.pos[1], z - f.pos[2]) > f.reach + R) continue
          const d = f.distance(x, y, z) - R
          if (d >= 0) continue
          f.normal(x, y, z, n)
          touch(-n[0] * R, -n[1] * R, -n[2] * R, -d, (f.friction + this.friction) / 2, pass === 0)
        }
        continue
      }
      for (let i = 0; i < pts.length; i += 3) {
        const rx = r[0] * pts[i] + r[1] * pts[i + 1] + r[2] * pts[i + 2]
        const ry = r[3] * pts[i] + r[4] * pts[i + 1] + r[5] * pts[i + 2]
        const rz = r[6] * pts[i] + r[7] * pts[i + 1] + r[8] * pts[i + 2]
        const x = pos[0] + rx, y = pos[1] + ry, z = pos[2] + rz
        // the deepest thing this point is in
        let depth = 0, grip = this.friction
        if (y < room.floor) { depth = room.floor - y; n[0] = 0; n[1] = 1; n[2] = 0 }
        if (room.lo - x > depth) { depth = room.lo - x; n[0] = 1; n[1] = 0; n[2] = 0 }
        if (x - room.hi > depth) { depth = x - room.hi; n[0] = -1; n[1] = 0; n[2] = 0 }
        if (room.lo - z > depth) { depth = room.lo - z; n[0] = 0; n[1] = 0; n[2] = 1 }
        if (z - room.hi > depth) { depth = z - room.hi; n[0] = 0; n[1] = 0; n[2] = -1 }
        for (const f of room.fixed) {
          if (Math.hypot(x - f.pos[0], y - f.pos[1], z - f.pos[2]) > f.reach) continue
          const d = -f.distance(x, y, z)
          if (d > depth) { depth = d; f.normal(x, y, z, n); grip = (f.friction + this.friction) / 2 }
        }
        if (depth > 0) touch(rx, ry, rz, depth, grip, pass === 0)
      }
    }
    pos[0] += vel[0] * dt + outX; pos[1] += vel[1] * dt + outY; pos[2] += vel[2] * dt + outZ
    // turn by the spin
    const q = this.quat, hx = spin[0] * dt * 0.5, hy = spin[1] * dt * 0.5, hz = spin[2] * dt * 0.5
    const qx = q[0] + hx * q[3] + hy * q[2] - hz * q[1]
    const qy = q[1] + hy * q[3] + hz * q[0] - hx * q[2]
    const qz = q[2] + hz * q[3] + hx * q[1] - hy * q[0]
    const qw = q[3] - hx * q[0] - hy * q[1] - hz * q[2]
    const l = Math.hypot(qx, qy, qz, qw)
    q[0] = qx / l; q[1] = qy / l; q[2] = qz / l; q[3] = qw / l
    this.turned()
    if (touching) {
      // what lies on something loses its last rocking
      const calm = Math.exp(-dt * 3)
      spin[0] *= calm; spin[1] *= calm; spin[2] *= calm
      const slow = vel[0] ** 2 + vel[1] ** 2 + vel[2] ** 2 + (spin[0] ** 2 + spin[1] ** 2 + spin[2] ** 2) * this.reach ** 2 < STILL
      this.rested = slow ? this.rested + dt : 0
      if (this.rested > REST) { this.asleep = true; vel.fill(0); spin.fill(0) }
    } else this.rested = 0
  }

  /** @internal How much speed along `d` a unit kick along `d` at `r` gives that point. */
  private give(rx: number, ry: number, rz: number, dx: number, dy: number, dz: number): number {
    const cx = ry * dz - rz * dy, cy = rz * dx - rx * dz, cz = rx * dy - ry * dx
    const r = this.rot, I = this.inertia
    const lx = r[0] * cx + r[3] * cy + r[6] * cz, ly = r[1] * cx + r[4] * cy + r[7] * cz, lz = r[2] * cx + r[5] * cy + r[8] * cz
    return 1 / this.mass + (lx * lx) / I[0] + (ly * ly) / I[1] + (lz * lz) / I[2]
  }

  /** Works out `rot` from `quat`: call after setting `quat` by hand. */
  turned() {
    const [x, y, z, w] = this.quat, r = this.rot
    r[0] = 1 - 2 * (y * y + z * z); r[1] = 2 * (x * y - z * w); r[2] = 2 * (x * z + y * w)
    r[3] = 2 * (x * y + z * w); r[4] = 1 - 2 * (x * x + z * z); r[5] = 2 * (y * z - x * w)
    r[6] = 2 * (x * z - y * w); r[7] = 2 * (y * z + x * w); r[8] = 1 - 2 * (x * x + y * y)
  }
}

const N = new Float64Array(3), UU = new Float64Array(3)

/** Solves the 6×6 `a x = b` in place (row-major `a`), leaving the answer in `b`. Returns false when it can't. */
export function solve6(a: Float64Array, b: Float64Array): boolean {
  for (let c = 0; c < 6; c++) {
    let best = c
    for (let r = c + 1; r < 6; r++) if (Math.abs(a[r * 6 + c]) > Math.abs(a[best * 6 + c])) best = r
    if (Math.abs(a[best * 6 + c]) < 1e-18) return false
    if (best !== c) {
      for (let k = 0; k < 6; k++) { const t = a[c * 6 + k]; a[c * 6 + k] = a[best * 6 + k]; a[best * 6 + k] = t }
      const t = b[c]; b[c] = b[best]; b[best] = t
    }
    for (let r = c + 1; r < 6; r++) {
      const f = a[r * 6 + c] / a[c * 6 + c]
      if (!f) continue
      for (let k = c; k < 6; k++) a[r * 6 + k] -= f * a[c * 6 + k]
      b[r] -= f * b[c]
    }
  }
  for (let r = 5; r >= 0; r--) {
    let s = b[r]
    for (let k = r + 1; k < 6; k++) s -= a[r * 6 + k] * b[k]
    b[r] = s / a[r * 6 + r]
  }
  return true
}
