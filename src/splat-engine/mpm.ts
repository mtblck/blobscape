/**
 * Sand, snow and goo that flow (issue #162): a small 3D MLS-MPM (moving least
 * squares material point method, after Hu et al. 2018's 88-line version, in
 * 3D), on the CPU. Each particle carries its place, velocity, affine velocity
 * field `C` and deformation `F`; each step scatters mass and momentum to a
 * coarse grid with quadratic B-splines, moves the grid under gravity and the
 * walls, and gathers it back.
 *
 * - Sand: Hencky elasticity with a Drucker-Prager yield (Klár et al. 2016), so
 *   it can't pull and slides once a slope passes its friction angle. Damp sand's
 *   cone is moved a little into pulling, so it holds together.
 * - Snow: the same cone with a hold that weakens wherever it gives, so it breaks
 *   along cracks and the rest stays in clumps, and a cap on how far it squeezes
 *   that rises as it packs, so pressed snow stays pressed.
 * - Goo: keeps its volume and gives only in shape; the change of shape past its
 *   yield drains at a rate its thickness sets, so it flows, slowly when thick.
 *
 * Solid things (solids.ts) can stand in the box or fall into it: the material
 * piles on a fixed one, and pushes a body as hard as the body pushes it.
 *
 * The box is [0, 1] on each side (the page scales it), the floor y = 0.
 * Pure and tested.
 */
import { Solid, solve6, type Room } from './solids.ts'

/** What a particle is made of. */
export type Material = 'sand' | 'snow' | 'goo'
/** Every `Material`. */
export const MATERIALS: readonly Material[] = ['sand', 'snow', 'goo']

/** Options for an `Mpm` box. */
export interface MpmOptions {
  /** Grid cells a side. */
  cells?: number
  /** Most particles it can hold. */
  capacity?: number
  /** Seconds per substep: left out, as long as the grid's cell size allows. */
  dt?: number
  /** Downward pull, box sides per second squared. */
  gravity?: number
  /** How each material behaves; what is left out comes from `KNOBS`. */
  knobs?: PartialKnobs
}

/** How each material behaves: the settings a visitor can change while it runs (`Mpm.set`). */
export interface Knobs {
  /** Sand: grains that can't pull on each other. */
  sand: {
    /** The friction angle in degrees: the steepest slope a dry heap keeps. */
    friction: number
    /** 0 to 1: how damp it is. Damp sand holds a little pull, so it stands in walls and breaks in lumps. */
    damp: number
  }
  /** Snow: grains that hold on to each other, break in clumps and pack down. */
  snow: {
    /** 0 to 1: from dry powder, which crumbles at once, to wet packing snow, which holds in clumps. */
    stick: number
    /** 0 to 1: how far it packs down when pressed, from old firm snow to fresh fluffy snow. */
    pack: number
  }
  /** Goo: keeps its volume, not its shape. */
  goo: {
    /** 0 to 1: how thick it is, from runny to treacle. */
    thick: number
    /** 0 to 1: how much shape it keeps before it starts to run, from none (a puddle) to a soft jelly. */
    hold: number
  }
}
/** Some of `Knobs`: any material, any of its settings. */
export type PartialKnobs = { [M in Material]?: Partial<Knobs[M]> }
/** What each material starts as. */
export const KNOBS: Knobs = { sand: { friction: 32, damp: 0 }, snow: { stick: 0.4, pack: 0.5 }, goo: { thick: 0.35, hold: 0.1 } }

interface Params { mu: number; lambda: number }
/** Young's modulus and Poisson ratio per material, kept soft so a coarse step stays stable. */
const ELASTIC: Record<Material, [E: number, nu: number]> = { sand: [200, 0.3], snow: [200, 0.2], goo: [60, 0.42] }
const lame = ([E, nu]: [number, number]): Params => ({ mu: E / (2 * (1 + nu)), lambda: (E * nu) / ((1 + nu) * (1 - 2 * nu)) })
/** Particles per cell a side when filling a shape. */
export const PER_CELL = 2

/**
 * A box of sand, snow and goo: a small 3D material point simulation (MLS-MPM) on the CPU. Put particles in with `add`
 * or `fillBox`, then move time on with `advance`.
 */
export class Mpm {
  /** Grid cells a side. */
  readonly n: number
  /** A cell's size: the box is 1 a side. */
  readonly dx: number
  /** The most particles it can hold. */
  readonly capacity: number
  /** Seconds per substep. */
  dt: number
  /** Downward pull, box sides per second squared. */
  gravity: number
  /** How many particles are in the box. */
  count = 0
  /** Particle state. */
  readonly x: Float64Array
  /** @internal Velocities. */
  readonly v: Float64Array
  /** @internal Each particle's affine velocity field. */
  readonly C: Float64Array
  /** @internal Each particle's deformation. */
  readonly F: Float64Array
  /** Kirchhoff stress from the last step's F, so each step needs one decomposition. */
  readonly tau: Float64Array
  /** How well each snow particle still holds on to its neighbors: 1 as it fell, less where it has cracked, more where it was pressed. */
  readonly Jp: Float64Array
  /** How far each snow particle has been packed down for good, as log volume lost. */
  readonly packed: Float64Array
  /** Which material each particle is, as an index into `MATERIALS`. */
  readonly mat: Uint8Array
  /** Grid: velocity (momentum while scattering) and mass. */
  readonly gv: Float64Array
  /** @internal Grid masses. */
  readonly gm: Float64Array
  /** @internal A particle's mass. */
  readonly mass: number
  /** @internal A particle's volume. */
  readonly volume: number
  /** How each material behaves now. Change it with `set`. */
  readonly knobs: Knobs
  private alpha = 0
  private cohesion = 0
  private snow = { hold: 0, brittle: 1, firm: 0, harden: 0 }
  private goo = { yield: 0, keep: 0 }
  private params: Params[]
  /** A push waiting for the next step: center, radius, velocity added. */
  private push: { at: [number, number, number]; r: number; v: [number, number, number] } | null = null
  /** Seconds simulated so far. */
  time = 0
  /** How much the floor grips what slides on it: 0 is ice. */
  floorGrip = 0.6
  /** Solid things in the box: fixed ones the material piles on, and bodies it pushes about. Add with `addSolid`. */
  readonly solids: Solid[] = []
  private room: Room

  constructor(o: MpmOptions = {}) {
    this.n = o.cells ?? 24
    this.dx = 1 / this.n
    this.capacity = o.capacity ?? 12000
    this.dt = o.dt ?? STEP_PER_CELL / this.n
    this.gravity = o.gravity ?? 4
    const c = this.capacity
    this.x = new Float64Array(c * 3)
    this.v = new Float64Array(c * 3)
    this.C = new Float64Array(c * 9)
    this.F = new Float64Array(c * 9)
    this.tau = new Float64Array(c * 9)
    this.Jp = new Float64Array(c)
    this.packed = new Float64Array(c)
    this.mat = new Uint8Array(c)
    const g = this.n ** 3
    this.gv = new Float64Array(g * 3)
    this.gm = new Float64Array(g)
    this.volume = (this.dx / PER_CELL) ** 3
    this.mass = this.volume // density 1
    this.params = MATERIALS.map((m) => lame(ELASTIC[m]))
    this.room = { floor: this.floor, lo: this.lo, hi: this.hi, gravity: this.gravity, fixed: [] }
    this.knobs = { sand: { ...KNOBS.sand }, snow: { ...KNOBS.snow }, goo: { ...KNOBS.goo } }
    this.set(o.knobs ?? {})
  }

  /** Changes how the materials behave, from now on: any material, any of its settings. */
  set(k: PartialKnobs) {
    Object.assign(this.knobs.sand, k.sand); Object.assign(this.knobs.snow, k.snow); Object.assign(this.knobs.goo, k.goo)
    const { sand, snow, goo } = this.knobs
    const s = Math.sin((sand.friction * Math.PI) / 180)
    this.alpha = Math.sqrt(2 / 3) * (2 * s) / (3 - s)
    this.cohesion = SAND_HOLD * clamp(sand.damp, 0, 1)
    const stick = clamp(snow.stick, 0, 1), pack = clamp(snow.pack, 0, 1)
    this.snow.hold = SNOW_HOLD * stick
    this.snow.brittle = SNOW_BRITTLE[0] + (SNOW_BRITTLE[1] - SNOW_BRITTLE[0]) * stick
    this.snow.firm = SNOW_FIRM[0] + (SNOW_FIRM[1] - SNOW_FIRM[0]) * pack
    this.snow.harden = SNOW_HARDEN[0] * (SNOW_HARDEN[1] / SNOW_HARDEN[0]) ** pack
    this.goo.yield = GOO_HOLD * clamp(goo.hold, 0, 1) ** 2
    // the share of the strain past its yield that is still there a step later: thin goo sheds it at once
    const relax = GOO_RELAX[0] * (GOO_RELAX[1] / GOO_RELAX[0]) ** clamp(goo.thick, 0, 1)
    this.goo.keep = Math.exp(-this.dt / relax)
  }

  /** The height material rests at on the floor: a cell and a half up, where the grid's own floor holds it. */
  get floor() { return this.dx * FLOOR_CELLS }
  /** Where the near walls hold material: x and z stay above this. */
  get lo() { return this.dx * FLOOR_CELLS }
  /** Where the far walls hold material: x and z stay under this. */
  get hi() { return 1 - this.dx * (FLOOR_CELLS + 0.5) }

  /** Puts a solid in the box. Particles already inside it are pushed out over the next steps. */
  addSolid(s: Solid): Solid {
    this.solids.push(s)
    this.room.fixed = this.solids.filter((f) => f.fixed)
    return s
  }

  /** Takes a solid out of the box, or every solid when none is named. */
  removeSolid(s?: Solid) {
    if (s) { const i = this.solids.indexOf(s); if (i >= 0) this.solids.splice(i, 1) } else this.solids.length = 0
    this.room.fixed = this.solids.filter((f) => f.fixed)
  }

  /** Adds one particle, still and unstrained. Returns false when full. */
  add(p: ArrayLike<number>, m: Material, vel: ArrayLike<number> = [0, 0, 0]): boolean {
    if (this.count >= this.capacity) return false
    const i = this.count++
    for (let k = 0; k < 3; k++) { this.x[i * 3 + k] = clamp(p[k], this.dx * 1.01, 1 - this.dx * 1.51); this.v[i * 3 + k] = vel[k] }
    this.C.fill(0, i * 9, i * 9 + 9)
    this.F.fill(0, i * 9, i * 9 + 9)
    this.F[i * 9] = this.F[i * 9 + 4] = this.F[i * 9 + 8] = 1
    this.tau.fill(0, i * 9, i * 9 + 9)
    this.Jp[i] = 1
    this.packed[i] = 0
    this.mat[i] = MATERIALS.indexOf(m)
    return true
  }

  /** Fills a box (corners in box units) with particles on a jittered lattice, `PER_CELL` a cell a side. Returns how many went in. With `inside`, only where it says yes, so the box can hold any shape. */
  fillBox(lo: ArrayLike<number>, hi: ArrayLike<number>, m: Material, seed = 1, vel: ArrayLike<number> = [0, 0, 0], inside?: (x: number, y: number, z: number) => boolean): number {
    const step = this.dx / PER_CELL
    let r = seed >>> 0 || 1, added = 0
    const rand = () => { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; return ((r >>> 0) / 4294967296) }
    for (let x = lo[0] + step / 2; x < hi[0]; x += step)
      for (let y = lo[1] + step / 2; y < hi[1]; y += step)
        for (let z = lo[2] + step / 2; z < hi[2]; z += step) {
          const j = step * 0.3
          if (inside && !inside(x, y, z)) continue
          if (!this.add([x + (rand() - 0.5) * j, y + (rand() - 0.5) * j, z + (rand() - 0.5) * j], m, vel)) return added
          added++
        }
    return added
  }

  /** Pushes everything within `r` of `at` by `v` (box sides a second) on the next step. */
  poke(at: [number, number, number], r: number, v: [number, number, number]) { this.push = { at, r, v } }

  /** Empties the box. */
  clear() { this.count = 0 }

  /** Total mass on the grid after the last scatter, for tests. */
  gridMass(): number { let s = 0; for (let i = 0; i < this.gm.length; i++) s += this.gm[i]; return s }

  /** Runs whole substeps for `seconds`. */
  advance(seconds: number) {
    const steps = Math.max(1, Math.round(seconds / this.dt))
    for (let s = 0; s < steps; s++) this.step()
  }

  /** Moves the box on by one substep of `dt`. */
  step() {
    const { n, dx, dt, x, v, C, tau, gv, gm, mass, volume } = this
    const inv = 1 / dx
    gv.fill(0)
    gm.fill(0)
    const w = W, base = BASE
    // particles to grid
    const k = -dt * volume * 4 * inv * inv
    const a = AFF
    for (let p = 0; p < this.count; p++) {
      const o = p * 3, o9 = p * 9
      weights(x, o, inv, base, w)
      // affine = stress + mass * C, both 3×3 row-major
      for (let q = 0; q < 9; q++) a[q] = k * tau[o9 + q] + mass * C[o9 + q]
      const bx = base[0], by = base[1], bz = base[2]
      const fx = x[o] * inv - bx, fy = x[o + 1] * inv - by, fz = x[o + 2] * inv - bz
      const mvx = mass * v[o], mvy = mass * v[o + 1], mvz = mass * v[o + 2]
      for (let i = 0; i < 3; i++) {
        const dxp = (i - fx) * dx
        for (let j = 0; j < 3; j++) {
          const dyp = (j - fy) * dx
          const wij = w[i] * w[3 + j]
          const row = ((bx + i) * n + by + j) * n + bz
          // what doesn't change along z
          const px = mvx + a[0] * dxp + a[1] * dyp, py = mvy + a[3] * dxp + a[4] * dyp, pz = mvz + a[6] * dxp + a[7] * dyp
          for (let l = 0; l < 3; l++) {
            const dzp = (l - fz) * dx
            const wt = wij * w[6 + l]
            const g = row + l
            gv[g * 3] += wt * (px + a[2] * dzp)
            gv[g * 3 + 1] += wt * (py + a[5] * dzp)
            gv[g * 3 + 2] += wt * (pz + a[8] * dzp)
            gm[g] += wt * mass
          }
        }
      }
    }
    // the grid: momentum to velocity, gravity, a push, the walls
    const push = this.push
    this.push = null
    if (push) for (const s of this.solids) s.wake()
    const g3 = n * n * n, grav = dt * this.gravity
    for (let g = 0; g < g3; g++) {
      const m = gm[g]
      if (m <= 0) continue
      gv[g * 3] /= m; gv[g * 3 + 1] = gv[g * 3 + 1] / m - grav; gv[g * 3 + 2] /= m
    }
    if (push) {
      const r = Math.ceil(push.r * inv)
      const cx = Math.round(push.at[0] * inv), cy = Math.round(push.at[1] * inv), cz = Math.round(push.at[2] * inv)
      for (let gx = Math.max(0, cx - r); gx <= Math.min(n - 1, cx + r); gx++) for (let gy = Math.max(0, cy - r); gy <= Math.min(n - 1, cy + r); gy++) for (let gz = Math.max(0, cz - r); gz <= Math.min(n - 1, cz + r); gz++) {
        const g = (gx * n + gy) * n + gz
        if (gm[g] <= 0) continue
        const d = Math.hypot(gx * dx - push.at[0], gy * dx - push.at[1], gz * dx - push.at[2])
        if (d < push.r) { const f = 1 - d / push.r; gv[g * 3] += push.v[0] * f; gv[g * 3 + 1] += push.v[1] * f; gv[g * 3 + 2] += push.v[2] * f }
      }
    }
    // the solids: bodies fall, then each meets the material on the grid
    this.room.gravity = this.gravity
    for (const s of this.solids) { s.fall(this.room, dt); this.meet(s) }
    const wall = 2
    for (let gx = 0; gx < n; gx++) for (let gy = 0; gy < n; gy++) for (let gz = 0; gz < n; gz++) {
      const edge = gx < wall || gx >= n - wall || gy < wall || gy >= n - wall || gz < wall || gz >= n - wall
      if (!edge) { gz = n - wall - 1; continue }
      const g = (gx * n + gy) * n + gz
      if (gm[g] <= 0) continue
      let vx = gv[g * 3], vy = gv[g * 3 + 1], vz = gv[g * 3 + 2]
      if (gx < wall && vx < 0) vx = 0
      if (gx >= n - wall && vx > 0) vx = 0
      if (gz < wall && vz < 0) vz = 0
      if (gz >= n - wall && vz > 0) vz = 0
      if (gy >= n - wall && vy > 0) vy = 0
      if (gy < wall && vy < 0) {
        // the floor: what presses into it stops, and friction takes off as much sideways speed
        const into = -vy
        vy = 0
        const side = Math.hypot(vx, vz)
        const keep = side > 0 ? Math.max(0, side - this.floorGrip * into) / side : 0
        vx *= keep; vz *= keep
      }
      gv[g * 3] = vx; gv[g * 3 + 1] = vy; gv[g * 3 + 2] = vz
    }
    // grid to particles
    const lo = dx * 1.01, hi = 1 - dx * 1.51 // where a particle's 3×3×3 nodes are all on the grid
    for (let p = 0; p < this.count; p++) {
      const o = p * 3, o9 = p * 9
      weights(x, o, inv, base, w)
      const bx = base[0], by = base[1], bz = base[2]
      const fx = x[o] * inv - bx, fy = x[o + 1] * inv - by, fz = x[o + 2] * inv - bz
      let nvx = 0, nvy = 0, nvz = 0
      let c0 = 0, c1 = 0, c2 = 0, c3 = 0, c4 = 0, c5 = 0, c6 = 0, c7 = 0, c8 = 0
      for (let i = 0; i < 3; i++) {
        const dxp = i - fx
        for (let j = 0; j < 3; j++) {
          const dyp = j - fy
          const wij = w[i] * w[3 + j]
          const row = ((bx + i) * n + by + j) * n + bz
          for (let l = 0; l < 3; l++) {
            const dzp = l - fz
            const wt = wij * w[6 + l]
            const g = (row + l) * 3
            const ux = gv[g] * wt, uy = gv[g + 1] * wt, uz = gv[g + 2] * wt
            nvx += ux; nvy += uy; nvz += uz
            c0 += ux * dxp; c1 += ux * dyp; c2 += ux * dzp
            c3 += uy * dxp; c4 += uy * dyp; c5 += uy * dzp
            c6 += uz * dxp; c7 += uz * dyp; c8 += uz * dzp
          }
        }
      }
      const s4 = 4 * inv
      C[o9] = s4 * c0; C[o9 + 1] = s4 * c1; C[o9 + 2] = s4 * c2
      C[o9 + 3] = s4 * c3; C[o9 + 4] = s4 * c4; C[o9 + 5] = s4 * c5
      C[o9 + 6] = s4 * c6; C[o9 + 7] = s4 * c7; C[o9 + 8] = s4 * c8
      v[o] = nvx; v[o + 1] = nvy; v[o + 2] = nvz
      x[o] = clamp(x[o] + dt * nvx, lo, hi)
      x[o + 1] = clamp(x[o + 1] + dt * nvy, lo, hi)
      x[o + 2] = clamp(x[o + 2] + dt * nvz, lo, hi)
      this.deform(p, dt)
    }
    if (this.solids.length) {
      // nothing stays inside a solid: a particle the grid let in is put back on its surface
      const nn = NRM
      for (const s of this.solids) {
        const sx = s.pos[0], sy = s.pos[1], sz = s.pos[2], reach = s.reach, r2 = reach * reach
        for (let p = 0; p < this.count; p++) {
          const o = p * 3
          const ax = x[o] - sx, ay = x[o + 1] - sy, az = x[o + 2] - sz
          if (ax * ax + ay * ay + az * az > r2) continue
          const d = s.distance(x[o], x[o + 1], x[o + 2])
          if (d >= 0) continue
          s.normal(x[o], x[o + 1], x[o + 2], nn)
          x[o] = clamp(x[o] - d * nn[0], lo, hi); x[o + 1] = clamp(x[o + 1] - d * nn[1], lo, hi); x[o + 2] = clamp(x[o + 2] - d * nn[2], lo, hi)
          // and it stops going in: a lone particle the grid's points round it are too few to stop
          s.speedAt(ax, ay, az, SPD)
          const vn = (v[o] - SPD[0]) * nn[0] + (v[o + 1] - SPD[1]) * nn[1] + (v[o + 2] - SPD[2]) * nn[2]
          if (vn < 0) {
            v[o] -= vn * nn[0]; v[o + 1] -= vn * nn[1]; v[o + 2] -= vn * nn[2]
            // what the particle gains, a body loses
            if (!s.fixed && !s.asleep) s.kick(ax, ay, az, mass * vn * nn[0], mass * vn * nn[1], mass * vn * nn[2])
          }
        }
      }
      for (const s of this.solids) s.move(this.room, dt, s.held)
    }
    this.time += dt
  }

  /**
   * A solid meets the material on the grid. Material moving into a fixed solid stops and rubs on it. A body and the
   * material moving into it come away at one speed along the way out, found for every such point of the grid at
   * once (so a light body under a heavy heap doesn't shake), and rub sideways.
   */
  private meet(s: Solid) {
    const { n, dx, gv, gm } = this
    const inv = 1 / dx
    const { min, max } = s.shape
    const live = !s.fixed && !s.asleep
    const lo = [0, 1, 2].map((k) => Math.max(0, Math.floor((s.fixed ? min[k] : s.pos[k] - s.reach) * inv)))
    const hi = [0, 1, 2].map((k) => Math.min(n - 1, Math.ceil((s.fixed ? max[k] : s.pos[k] + s.reach) * inv)))
    const nn = NRM, u = SPD
    let k = 0
    s.held = false
    for (let gx = lo[0]; gx <= hi[0]; gx++) for (let gy = lo[1]; gy <= hi[1]; gy++) for (let gz = lo[2]; gz <= hi[2]; gz++) {
      const g = (gx * n + gy) * n + gz
      const m = gm[g]
      if (m <= 0) continue
      const px = gx * dx, py = gy * dx, pz = gz * dx
      if (s.distance(px, py, pz) >= 0) continue
      s.normal(px, py, pz, nn)
      if (!live) {
        const vn = gv[g * 3] * nn[0] + gv[g * 3 + 1] * nn[1] + gv[g * 3 + 2] * nn[2]
        if (vn >= 0) continue
        let tx = gv[g * 3] - vn * nn[0], ty = gv[g * 3 + 1] - vn * nn[1], tz = gv[g * 3 + 2] - vn * nn[2]
        const side = Math.hypot(tx, ty, tz)
        const keep = side > 0 ? Math.max(0, side + s.friction * vn) / side : 0
        gv[g * 3] = tx * keep; gv[g * 3 + 1] = ty * keep; gv[g * 3 + 2] = tz * keep
        continue
      }
      if (k >= MEET_MOST) continue
      MEET_G[k] = g
      MEET[k * 6] = nn[0]; MEET[k * 6 + 1] = nn[1]; MEET[k * 6 + 2] = nn[2]
      MEET[k * 6 + 3] = px - s.pos[0]; MEET[k * 6 + 4] = py - s.pos[1]; MEET[k * 6 + 5] = pz - s.pos[2]
      k++
    }
    if (!live || !k) return
    // (M + Σ m a aᵀ) u' = M u + Σ m a (n·v), with a = (n, r × n), over the points moving into the body
    const A = A6, b = B6
    A.fill(0)
    s.worldInertia(IW)
    for (let i = 0; i < 3; i++) {
      A[i * 7] = s.mass
      for (let j = 0; j < 3; j++) A[(3 + i) * 6 + 3 + j] = IW[i * 3 + j]
    }
    for (let i = 0; i < 3; i++) { b[i] = s.mass * s.vel[i]; b[3 + i] = IW[i * 3] * s.spin[0] + IW[i * 3 + 1] * s.spin[1] + IW[i * 3 + 2] * s.spin[2] }
    let touching = 0, heavy = 0
    const a = AV
    for (let c = 0; c < k; c++) {
      const g = MEET_G[c], o = c * 6, m = gm[g]
      const nx = MEET[o], ny = MEET[o + 1], nz = MEET[o + 2], rx = MEET[o + 3], ry = MEET[o + 4], rz = MEET[o + 5]
      s.speedAt(rx, ry, rz, u)
      const vn = (gv[g * 3] - u[0]) * nx + (gv[g * 3 + 1] - u[1]) * ny + (gv[g * 3 + 2] - u[2]) * nz
      if (vn >= 0) { MEET_G[c] = -1; continue }
      touching++
      heavy += m
      a[0] = nx; a[1] = ny; a[2] = nz
      a[3] = ry * nz - rz * ny; a[4] = rz * nx - rx * nz; a[5] = rx * ny - ry * nx
      const nv = gv[g * 3] * nx + gv[g * 3 + 1] * ny + gv[g * 3 + 2] * nz
      for (let i = 0; i < 6; i++) {
        b[i] += m * a[i] * nv
        for (let j = 0; j < 6; j++) A[i * 6 + j] += m * a[i] * a[j]
      }
    }
    if (!touching || !solve6(A, b)) return
    s.held = true
    s.vel[0] = b[0]; s.vel[1] = b[1]; s.vel[2] = b[2]
    s.spin[0] = b[3]; s.spin[1] = b[4]; s.spin[2] = b[5]
    // the material takes the body's speed along the way out, and rubs: the sideways kick is shared out by weight,
    // so neither side can be thrown past the other
    const share = s.mass / (s.mass + heavy)
    for (let c = 0; c < k; c++) {
      const g = MEET_G[c]
      if (g < 0) continue
      const o = c * 6, m = gm[g]
      const nx = MEET[o], ny = MEET[o + 1], nz = MEET[o + 2], rx = MEET[o + 3], ry = MEET[o + 4], rz = MEET[o + 5]
      s.speedAt(rx, ry, rz, u)
      const wx = gv[g * 3] - u[0], wy = gv[g * 3 + 1] - u[1], wz = gv[g * 3 + 2] - u[2]
      const vn = wx * nx + wy * ny + wz * nz
      if (vn >= 0) continue
      const tx = wx - vn * nx, ty = wy - vn * ny, tz = wz - vn * nz
      const side = Math.hypot(tx, ty, tz)
      const cut = side > 1e-12 ? (Math.min(side, -s.friction * vn) * share) / side : 0
      gv[g * 3] -= vn * nx + tx * cut; gv[g * 3 + 1] -= vn * ny + ty * cut; gv[g * 3 + 2] -= vn * nz + tz * cut
      s.kick(rx, ry, rz, m * tx * cut, m * ty * cut, m * tz * cut)
    }
  }

  /** F ← (I + dt C) F, then the material's plasticity, then its stress for the next step. */
  private deform(p: number, dt: number) {
    const { F, C, tau, Jp, packed } = this, o = p * 9
    const nf = NF
    for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) {
      nf[r * 3 + q] = F[o + r * 3 + q] + dt * (C[o + r * 3] * F[o + q] + C[o + r * 3 + 1] * F[o + 3 + q] + C[o + r * 3 + 2] * F[o + 6 + q])
    }
    svd3(nf, U, S, V)
    const kind = this.mat[p]
    let { mu, lambda } = this.params[kind]
    if (kind === SAND) {
      // Drucker-Prager in log strain: no pulling apart, and shear only up to what the pressure holds
      const e0 = Math.log(Math.max(S[0], 1e-4)), e1 = Math.log(Math.max(S[1], 1e-4)), e2 = Math.log(Math.max(S[2], 1e-4))
      const tr = e0 + e1 + e2
      // damp sand's cone is moved a little into pulling, so it holds that much before it parts
      const coh = this.cohesion
      if (tr >= coh) { S[0] = S[1] = S[2] = Math.exp(coh / 3) }
      else {
        const d0 = e0 - tr / 3, d1 = e1 - tr / 3, d2 = e2 - tr / 3
        const norm = Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2)
        const dg = norm + ((3 * lambda + 2 * mu) / (2 * mu)) * (tr - coh) * this.alpha
        if (dg > 0 && norm > 1e-12) {
          const k = dg / norm
          S[0] = Math.exp(e0 - k * d0); S[1] = Math.exp(e1 - k * d1); S[2] = Math.exp(e2 - k * d2)
        } else { S[0] = Math.max(S[0], 1e-4); S[1] = Math.max(S[1], 1e-4); S[2] = Math.max(S[2], 1e-4) }
      }
      compose(U, S, V, nf)
      // Hencky: tau = U (2 mu ln S + lambda tr(ln S)) U^T
      const l0 = Math.log(S[0]), l1 = Math.log(S[1]), l2 = Math.log(S[2]), t = l0 + l1 + l2
      D[0] = 2 * mu * l0 + lambda * t; D[1] = 2 * mu * l1 + lambda * t; D[2] = 2 * mu * l2 + lambda * t
    } else if (kind === SNOW_I) {
      // snow is grains that hold on to each other: it packs for good when pressed past its limit (and the limit
      // rises as it packs), slides like sand once it shears, and each time it gives, the bonds there weaken, so it
      // breaks along cracks and the rest stays in clumps
      let e0 = Math.log(Math.max(S[0], 1e-4)), e1 = Math.log(Math.max(S[1], 1e-4)), e2 = Math.log(Math.max(Math.abs(S[2]), 1e-4))
      let tr = e0 + e1 + e2
      const sn = this.snow
      const limit = -(sn.firm + sn.harden * packed[p])
      if (tr < limit) {
        const give = limit - tr
        packed[p] += give
        e0 += give / 3; e1 += give / 3; e2 += give / 3
        tr = limit
        Jp[p] = Math.min(SNOW_BOND_MOST, Jp[p] + give * SNOW_HEAL)
      }
      // a broken bond still holds a little, as crumbs of snow do
      const coh = sn.hold * (SNOW_CRUMB + (1 - SNOW_CRUMB) * Jp[p])
      if (tr >= coh) {
        Jp[p] *= Math.exp(-(tr - coh) / sn.brittle)
        S[0] = S[1] = S[2] = Math.exp(coh / 3)
      } else {
        const d0 = e0 - tr / 3, d1 = e1 - tr / 3, d2 = e2 - tr / 3
        const norm = Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2)
        const dg = norm + ((3 * lambda + 2 * mu) / (2 * mu)) * (tr - coh) * SNOW_ALPHA
        if (dg > 0 && norm > 1e-12) {
          Jp[p] *= Math.exp(-dg / sn.brittle)
          const k = dg / norm
          S[0] = Math.exp(e0 - k * d0); S[1] = Math.exp(e1 - k * d1); S[2] = Math.exp(e2 - k * d2)
        } else { S[0] = Math.exp(e0); S[1] = Math.exp(e1); S[2] = Math.exp(e2) }
      }
      compose(U, S, V, nf)
      const l0 = Math.log(S[0]), l1 = Math.log(S[1]), l2 = Math.log(S[2]), t = l0 + l1 + l2
      D[0] = 2 * mu * l0 + lambda * t; D[1] = 2 * mu * l1 + lambda * t; D[2] = 2 * mu * l2 + lambda * t
    } else {
      // goo keeps its volume and gives only in shape: the change of shape past its yield drains away at a rate
      // its thickness sets, so it flows, and what is under the yield stays, so a thick one keeps a soft form
      const e0 = Math.log(Math.max(S[0], 1e-4)), e1 = Math.log(Math.max(S[1], 1e-4)), e2 = Math.log(Math.max(Math.abs(S[2]), 1e-4))
      const was = (e0 + e1 + e2) / 3
      const d0 = e0 - was, d1 = e1 - was, d2 = e2 - was
      // it can be squeezed but never swells: drops that part company are let go, not pulled back
      const third = Math.min(was, 0)
      const norm = Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2)
      const y = this.goo.yield
      const k = norm > y && norm > 1e-12 ? (y + (norm - y) * this.goo.keep) / norm : 1
      S[0] = Math.exp(third + k * d0); S[1] = Math.exp(third + k * d1); S[2] = Math.exp(third + k * d2)
      compose(U, S, V, nf)
      const l0 = Math.log(S[0]), l1 = Math.log(S[1]), l2 = Math.log(S[2]), t = l0 + l1 + l2
      D[0] = 2 * mu * l0 + lambda * t; D[1] = 2 * mu * l1 + lambda * t; D[2] = 2 * mu * l2 + lambda * t
    }
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      tau[o + r * 3 + c] = U[r * 3] * D[0] * U[c * 3] + U[r * 3 + 1] * D[1] * U[c * 3 + 1] + U[r * 3 + 2] * D[2] * U[c * 3 + 2]
      F[o + r * 3 + c] = nf[r * 3 + c]
    }
  }
}

const SAND = 0, SNOW_I = 1
/** Seconds a substep, times the grid's cells a side: a finer grid needs shorter steps for the same stiffness. */
const STEP_PER_CELL = 0.072
/** Cells up from the grid's edge where its walls hold material. */
const FLOOR_CELLS = 1.5
/** The most grid points one body meets in a step. */
const MEET_MOST = 4096
const MEET = new Float64Array(MEET_MOST * 6), MEET_G = new Int32Array(MEET_MOST)
const A6 = new Float64Array(36), B6 = new Float64Array(6), AV = new Float64Array(6), IW = new Float64Array(9), NRM = new Float64Array(3), SPD = new Float64Array(3)
/** The most pull damp sand holds, as log strain. */
const SAND_HOLD = 0.0025
/** Snow's friction, as sand's `alpha`, for an angle of 38 degrees. */
const SNOW_ALPHA = Math.sqrt(2 / 3) * (2 * Math.sin(0.663)) / (3 - Math.sin(0.663))
/** The most pull the stickiest snow holds (log strain), and how much giving it takes to break a bond, from powder to packing snow. */
const SNOW_HOLD = 0.011, SNOW_BRITTLE = [0.003, 0.022]
/** How far snow squeezes before it starts to pack, and how fast that limit rises as it packs, from snow that packs a lot to snow that hardly does. */
const SNOW_FIRM = [0.004, 0.0008], SNOW_HARDEN = [6, 0.25]
/** How much pressing mends bonds, and the strongest a bond gets. */
const SNOW_HEAL = 5, SNOW_BOND_MOST = 1.3
/** The share of its hold that snow keeps where its bonds have broken. */
const SNOW_CRUMB = 0.3
/** The most change of shape goo keeps, and the seconds its flow takes to drain, from runny to treacle. */
const GOO_HOLD = 0.025, GOO_RELAX = [0.002, 0.07]
const AFF = new Float64Array(9), W = new Float64Array(9), BASE = [0, 0, 0], NF = new Float64Array(9)
const U = new Float64Array(9), V = new Float64Array(9), S = new Float64Array(3), D = new Float64Array(3)
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/** Quadratic B-spline weights for a particle: the lowest of its 3×3×3 nodes and the weights along each axis. */
function weights(x: Float64Array, o: number, inv: number, base: number[], w: Float64Array) {
  for (let d = 0; d < 3; d++) {
    const g = x[o + d] * inv
    const b = Math.floor(g - 0.5)
    const f = g - b
    base[d] = b
    w[d * 3] = 0.5 * (1.5 - f) ** 2
    w[d * 3 + 1] = 0.75 - (f - 1) ** 2
    w[d * 3 + 2] = 0.5 * (f - 0.5) ** 2
  }
}

/** out = U diag(s) V^T. */
function compose(u: Float64Array, s: Float64Array, v: Float64Array, out: Float64Array) {
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = u[r * 3] * s[0] * v[c * 3] + u[r * 3 + 1] * s[1] * v[c * 3 + 1] + u[r * 3 + 2] * s[2] * v[c * 3 + 2]
}

/**
 * Singular values of a 3×3 (row-major) with U and V both rotations: F = U diag(s) V^T. A reflection shows as a
 * negative last singular value. Jacobi on F^T F for V, then U's columns from F V.
 */
export function svd3(f: ArrayLike<number>, u: Float64Array, s: Float64Array, v: Float64Array) {
  // A = F^T F, symmetric: its six numbers, turned by Jacobi until the three off the diagonal are gone
  const f0 = f[0], f1 = f[1], f2 = f[2], f3 = f[3], f4 = f[4], f5 = f[5], f6 = f[6], f7 = f[7], f8 = f[8]
  let a00 = f0 * f0 + f3 * f3 + f6 * f6, a11 = f1 * f1 + f4 * f4 + f7 * f7, a22 = f2 * f2 + f5 * f5 + f8 * f8
  let a01 = f0 * f1 + f3 * f4 + f6 * f7, a02 = f0 * f2 + f3 * f5 + f6 * f8, a12 = f1 * f2 + f4 * f5 + f7 * f8
  let v00 = 1, v01 = 0, v02 = 0, v10 = 0, v11 = 1, v12 = 0, v20 = 0, v21 = 0, v22 = 1
  const tiny = 1e-17 * (a00 + a11 + a22) ** 2 + 1e-300
  for (let sweep = 0; sweep < 10; sweep++) {
    if (a01 * a01 + a02 * a02 + a12 * a12 < tiny) break
    if (a01 !== 0) {
      const theta = (a11 - a00) / (2 * a01)
      const t = (theta < 0 ? -1 : 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1), sn = t * c
      a00 -= t * a01; a11 += t * a01; a01 = 0
      const x = a02, y = a12
      a02 = c * x - sn * y; a12 = sn * x + c * y
      let w = v00; v00 = c * w - sn * v01; v01 = sn * w + c * v01
      w = v10; v10 = c * w - sn * v11; v11 = sn * w + c * v11
      w = v20; v20 = c * w - sn * v21; v21 = sn * w + c * v21
    }
    if (a02 !== 0) {
      const theta = (a22 - a00) / (2 * a02)
      const t = (theta < 0 ? -1 : 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1), sn = t * c
      a00 -= t * a02; a22 += t * a02; a02 = 0
      const x = a01, y = a12
      a01 = c * x - sn * y; a12 = sn * x + c * y
      let w = v00; v00 = c * w - sn * v02; v02 = sn * w + c * v02
      w = v10; v10 = c * w - sn * v12; v12 = sn * w + c * v12
      w = v20; v20 = c * w - sn * v22; v22 = sn * w + c * v22
    }
    if (a12 !== 0) {
      const theta = (a22 - a11) / (2 * a12)
      const t = (theta < 0 ? -1 : 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1), sn = t * c
      a11 -= t * a12; a22 += t * a12; a12 = 0
      const x = a01, y = a02
      a01 = c * x - sn * y; a02 = sn * x + c * y
      let w = v01; v01 = c * w - sn * v02; v02 = sn * w + c * v02
      w = v11; v11 = c * w - sn * v12; v12 = sn * w + c * v12
      w = v21; v21 = c * w - sn * v22; v22 = sn * w + c * v22
    }
  }
  // sort by eigenvalue, largest first, by swapping V's columns
  let w
  if (a11 > a00) { w = a00; a00 = a11; a11 = w; w = v00; v00 = v01; v01 = w; w = v10; v10 = v11; v11 = w; w = v20; v20 = v21; v21 = w }
  if (a22 > a11) { w = a11; a11 = a22; a22 = w; w = v01; v01 = v02; v02 = w; w = v11; v11 = v12; v12 = w; w = v21; v21 = v22; v22 = w }
  if (a11 > a00) { w = a00; a00 = a11; a11 = w; w = v00; v00 = v01; v01 = w; w = v10; v10 = v11; v11 = w; w = v20; v20 = v21; v21 = w }
  // V a rotation: its third column is the cross of the first two
  v02 = v10 * v21 - v20 * v11; v12 = v20 * v01 - v00 * v21; v22 = v00 * v11 - v10 * v01
  // U's columns: F v_i / s_i
  let u00 = f0 * v00 + f1 * v10 + f2 * v20, u10 = f3 * v00 + f4 * v10 + f5 * v20, u20 = f6 * v00 + f7 * v10 + f8 * v20
  let u01 = f0 * v01 + f1 * v11 + f2 * v21, u11 = f3 * v01 + f4 * v11 + f5 * v21, u21 = f6 * v01 + f7 * v11 + f8 * v21
  const x2 = f0 * v02 + f1 * v12 + f2 * v22, y2 = f3 * v02 + f4 * v12 + f5 * v22, z2 = f6 * v02 + f7 * v12 + f8 * v22
  const s0 = Math.sqrt(u00 * u00 + u10 * u10 + u20 * u20), s1 = Math.sqrt(u01 * u01 + u11 * u11 + u21 * u21)
  if (s0 > 1e-9) { u00 /= s0; u10 /= s0; u20 /= s0 } else { u00 = 1; u10 = 0; u20 = 0 }
  if (s1 > 1e-9) {
    // square to the first exactly, so U stays a rotation however close the two singular values are
    const d = u01 * u00 + u11 * u10 + u21 * u20
    u01 -= d * u00; u11 -= d * u10; u21 -= d * u20
    const l = Math.sqrt(u01 * u01 + u11 * u11 + u21 * u21)
    if (l > 1e-9 * s1) { u01 /= l; u11 /= l; u21 /= l } else u01 = NaN
  } else u01 = NaN
  if (u01 !== u01) {
    // any unit vector square to the first
    if (Math.abs(u00) < 0.9) { u01 = 0; u11 = -u20; u21 = u10 } else { u01 = u20; u11 = 0; u21 = -u00 }
    const l = Math.sqrt(u01 * u01 + u11 * u11 + u21 * u21)
    u01 /= l; u11 /= l; u21 /= l
  }
  // the third column always from the first two, so U is a rotation; s[2] takes the sign
  const u02 = u10 * u21 - u20 * u11, u12 = u20 * u01 - u00 * u21, u22 = u00 * u11 - u10 * u01
  s[0] = s0; s[1] = s1; s[2] = x2 * u02 + y2 * u12 + z2 * u22
  u[0] = u00; u[1] = u01; u[2] = u02; u[3] = u10; u[4] = u11; u[5] = u12; u[6] = u20; u[7] = u21; u[8] = u22
  v[0] = v00; v[1] = v01; v[2] = v02; v[3] = v10; v[4] = v11; v[5] = v12; v[6] = v20; v[7] = v21; v[8] = v22
}

/** How steep a heap stands: the angle in degrees from the floor up its side, from where its height falls from 80% to 20% of the top. */
export function slopeOf(sim: Mpm, material = 0): number {
  // heights by distance from the middle of the heap, in rings a cell wide
  let cx = 0, cz = 0, k = 0
  for (let p = 0; p < sim.count; p++) if (sim.mat[p] === material) { cx += sim.x[p * 3]; cz += sim.x[p * 3 + 2]; k++ }
  if (!k) return 0
  cx /= k; cz /= k
  const ring = sim.dx, top = new Float64Array(Math.ceil(0.8 / ring))
  for (let p = 0; p < sim.count; p++) {
    if (sim.mat[p] !== material) continue
    const r = Math.floor(Math.hypot(sim.x[p * 3] - cx, sim.x[p * 3 + 2] - cz) / ring)
    if (r < top.length) top[r] = Math.max(top[r], sim.x[p * 3 + 1])
  }
  const peak = top[0]
  const at = (share: number) => { for (let r = 0; r < top.length; r++) if (top[r] < peak * share) return r * ring; return top.length * ring }
  const run = at(0.2) - at(0.8)
  return (Math.atan2(peak * 0.6, Math.max(run, 1e-6)) * 180) / Math.PI
}
