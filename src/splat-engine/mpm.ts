/**
 * Sand, snow and goo that flow (issue #162): a small 3D MLS-MPM (moving least
 * squares material point method, after Hu et al. 2018's 88-line version, in
 * 3D), on the CPU. Each particle carries its place, velocity, affine velocity
 * field `C` and deformation `F`; each step scatters mass and momentum to a
 * coarse grid with quadratic B-splines, moves the grid under gravity and the
 * walls, and gathers it back.
 *
 * - Sand: Hencky elasticity with a Drucker-Prager yield (Klár et al. 2016), so
 *   it can't pull and slides once a slope passes its friction angle.
 * - Snow: fixed corotated elasticity with Stomakhin et al. 2013's plasticity
 *   and hardening, so it packs where it is pressed and breaks in clumps.
 * - Goo: soft, and giving way at a small stretch, so it runs out flat and,
 *   pulled, draws out slowly instead of flying apart.
 *
 * The box is [0, 1] on each side (the page scales it), the floor y = 0.
 * Pure and tested.
 */

export type Material = 'sand' | 'snow' | 'goo'
export const MATERIALS: readonly Material[] = ['sand', 'snow', 'goo']

export interface MpmOptions {
  /** Grid cells a side. */
  cells?: number
  /** Most particles it can hold. */
  capacity?: number
  /** Seconds per substep. */
  dt?: number
  /** Downward pull, box sides per second squared. */
  gravity?: number
  /** Sand's friction angle in degrees: the steepest slope a pile keeps. */
  friction?: number
}

interface Params { mu: number; lambda: number }
/** Young's modulus and Poisson ratio per material, kept soft so a coarse step stays stable. */
const ELASTIC: Record<Material, [E: number, nu: number]> = { sand: [400, 0.3], snow: [300, 0.2], goo: [15, 0.3] }
const lame = ([E, nu]: [number, number]): Params => ({ mu: E / (2 * (1 + nu)), lambda: (E * nu) / ((1 + nu) * (1 - 2 * nu)) })
const SNOW = { compress: 0.025, stretch: 0.0075, harden: 10 }
const GOO = { yield: 0.02 }
/** Particles per cell a side when filling a shape. */
export const PER_CELL = 2

export class Mpm {
  readonly n: number
  readonly dx: number
  readonly capacity: number
  dt: number
  gravity: number
  count = 0
  /** Particle state. */
  readonly x: Float64Array
  readonly v: Float64Array
  readonly C: Float64Array
  readonly F: Float64Array
  /** Kirchhoff stress from the last step's F, so each step needs one decomposition. */
  readonly tau: Float64Array
  readonly Jp: Float64Array
  readonly mat: Uint8Array
  /** Grid: velocity (momentum while scattering) and mass. */
  readonly gv: Float64Array
  readonly gm: Float64Array
  readonly mass: number
  readonly volume: number
  private alpha: number
  private params: Params[]
  /** A push waiting for the next step: center, radius, velocity added. */
  private push: { at: [number, number, number]; r: number; v: [number, number, number] } | null = null
  time = 0

  constructor(o: MpmOptions = {}) {
    this.n = o.cells ?? 24
    this.dx = 1 / this.n
    this.capacity = o.capacity ?? 12000
    this.dt = o.dt ?? 2e-3
    this.gravity = o.gravity ?? 4
    const c = this.capacity
    this.x = new Float64Array(c * 3)
    this.v = new Float64Array(c * 3)
    this.C = new Float64Array(c * 9)
    this.F = new Float64Array(c * 9)
    this.tau = new Float64Array(c * 9)
    this.Jp = new Float64Array(c)
    this.mat = new Uint8Array(c)
    const g = this.n ** 3
    this.gv = new Float64Array(g * 3)
    this.gm = new Float64Array(g)
    this.volume = (this.dx / PER_CELL) ** 3
    this.mass = this.volume // density 1
    this.params = MATERIALS.map((m) => lame(ELASTIC[m]))
    this.alpha = 0
    this.setFriction(o.friction ?? 32)
  }

  setFriction(degrees: number) {
    const s = Math.sin((degrees * Math.PI) / 180)
    this.alpha = Math.sqrt(2 / 3) * (2 * s) / (3 - s)
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
    this.mat[i] = MATERIALS.indexOf(m)
    return true
  }

  /** Fills a box (corners in box units) with particles on a jittered lattice, `PER_CELL` a cell a side. Returns how many went in. */
  fillBox(lo: ArrayLike<number>, hi: ArrayLike<number>, m: Material, seed = 1, vel: ArrayLike<number> = [0, 0, 0]): number {
    const step = this.dx / PER_CELL
    let r = seed >>> 0 || 1, added = 0
    const rand = () => { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; return ((r >>> 0) / 4294967296) }
    for (let x = lo[0] + step / 2; x < hi[0]; x += step)
      for (let y = lo[1] + step / 2; y < hi[1]; y += step)
        for (let z = lo[2] + step / 2; z < hi[2]; z += step) {
          const j = step * 0.3
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
    const wall = 2
    for (let gx = 0; gx < n; gx++) for (let gy = 0; gy < n; gy++) for (let gz = 0; gz < n; gz++) {
      const g = (gx * n + gy) * n + gz
      const m = gm[g]
      if (m <= 0) continue
      let vx = gv[g * 3] / m, vy = gv[g * 3 + 1] / m - dt * this.gravity, vz = gv[g * 3 + 2] / m
      if (push) {
        const d = Math.hypot(gx * dx - push.at[0], gy * dx - push.at[1], gz * dx - push.at[2])
        if (d < push.r) { const f = 1 - d / push.r; vx += push.v[0] * f; vy += push.v[1] * f; vz += push.v[2] * f }
      }
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
        const keep = side > 0 ? Math.max(0, side - 0.6 * into) / side : 0
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
    this.time += dt
  }

  /** F ← (I + dt C) F, then the material's plasticity, then its stress for the next step. */
  private deform(p: number, dt: number) {
    const { F, C, tau, Jp } = this, o = p * 9
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
      if (tr >= 0) { S[0] = S[1] = S[2] = 1 }
      else {
        const d0 = e0 - tr / 3, d1 = e1 - tr / 3, d2 = e2 - tr / 3
        const norm = Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2)
        const dg = norm + ((3 * lambda + 2 * mu) / (2 * mu)) * tr * this.alpha
        if (dg > 0 && norm > 1e-12) {
          const k = dg / norm
          S[0] = Math.exp(e0 - k * d0); S[1] = Math.exp(e1 - k * d1); S[2] = Math.exp(e2 - k * d2)
        } else { S[0] = Math.max(S[0], 1e-4); S[1] = Math.max(S[1], 1e-4); S[2] = Math.max(S[2], 1e-4) }
      }
      compose(U, S, V, nf)
      // Hencky: tau = U (2 mu ln S + lambda tr(ln S)) U^T
      const l0 = Math.log(S[0]), l1 = Math.log(S[1]), l2 = Math.log(S[2]), t = l0 + l1 + l2
      D[0] = 2 * mu * l0 + lambda * t; D[1] = 2 * mu * l1 + lambda * t; D[2] = 2 * mu * l2 + lambda * t
    } else {
      if (kind === SNOW_I) {
        const before = S[0] * S[1] * S[2]
        for (let i = 0; i < 3; i++) S[i] = clamp(S[i], 1 - SNOW.compress, 1 + SNOW.stretch)
        Jp[p] = clamp(Jp[p] * (before / (S[0] * S[1] * S[2])), 0.6, 20)
        const h = Math.exp(SNOW.harden * (1 - Jp[p]))
        mu *= h; lambda *= h
      } else {
        for (let i = 0; i < 3; i++) S[i] = clamp(S[i], 1 - GOO.yield, 1 + GOO.yield)
      }
      compose(U, S, V, nf)
      // fixed corotated: tau = 2 mu (F - R) F^T + lambda (J - 1) J I, with R = U V^T
      const J = S[0] * S[1] * S[2]
      for (let i = 0; i < 3; i++) D[i] = 2 * mu * (S[i] - 1) * S[i] + lambda * (J - 1) * J
    }
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      tau[o + r * 3 + c] = U[r * 3] * D[0] * U[c * 3] + U[r * 3 + 1] * D[1] * U[c * 3 + 1] + U[r * 3 + 2] * D[2] * U[c * 3 + 2]
      F[o + r * 3 + c] = nf[r * 3 + c]
    }
  }
}

const SAND = 0, SNOW_I = 1
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
  // A = F^T F
  const a = A
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) a[r * 3 + c] = f[r] * f[c] + f[3 + r] * f[3 + c] + f[6 + r] * f[6 + c]
  v.fill(0); v[0] = v[4] = v[8] = 1
  for (let sweep = 0; sweep < 8; sweep++) {
    const off = a[1] * a[1] + a[2] * a[2] + a[5] * a[5]
    if (off < 1e-22) break
    for (let pair = 0; pair < 3; pair++) {
      const p = pair === 2 ? 1 : 0, q = pair === 0 ? 1 : 2
      const apq = a[p * 3 + q]
      if (Math.abs(apq) < 1e-30) continue
      const theta = (a[q * 3 + q] - a[p * 3 + p]) / (2 * apq)
      const t = (theta < 0 ? -1 : 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs
      for (let k = 0; k < 3; k++) {
        const akp = a[k * 3 + p], akq = a[k * 3 + q]
        a[k * 3 + p] = cs * akp - sn * akq; a[k * 3 + q] = sn * akp + cs * akq
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p * 3 + k], aqk = a[q * 3 + k]
        a[p * 3 + k] = cs * apk - sn * aqk; a[q * 3 + k] = sn * apk + cs * aqk
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k * 3 + p], vkq = v[k * 3 + q]
        v[k * 3 + p] = cs * vkp - sn * vkq; v[k * 3 + q] = sn * vkp + cs * vkq
      }
    }
  }
  // sort by eigenvalue, largest first
  let i0 = 0, i1 = 1, i2 = 2, sw
  if (a[i1 * 4] > a[i0 * 4]) { sw = i0; i0 = i1; i1 = sw }
  if (a[i2 * 4] > a[i1 * 4]) { sw = i1; i1 = i2; i2 = sw }
  if (a[i1 * 4] > a[i0 * 4]) { sw = i0; i0 = i1; i1 = sw }
  VS.set(v)
  for (let r = 0; r < 3; r++) { v[r * 3] = VS[r * 3 + i0]; v[r * 3 + 1] = VS[r * 3 + i1]; v[r * 3 + 2] = VS[r * 3 + i2] }
  if (det(v) < 0) for (let r = 0; r < 3; r++) v[r * 3 + 2] = -v[r * 3 + 2]
  // U's columns: F v_i / s_i
  for (let c = 0; c < 3; c++) {
    let x = 0, y = 0, z = 0
    for (let k = 0; k < 3; k++) { x += f[k] * v[k * 3 + c]; y += f[3 + k] * v[k * 3 + c]; z += f[6 + k] * v[k * 3 + c] }
    const l = Math.hypot(x, y, z)
    s[c] = l
    if (l > 1e-9) { u[c] = x / l; u[3 + c] = y / l; u[6 + c] = z / l } else u[c] = u[3 + c] = u[6 + c] = NaN
  }
  // fill in any column too small to read, then make U a rotation
  if (!(u[0] === u[0])) { u[0] = 1; u[3] = 0; u[6] = 0 }
  if (!(u[1] === u[1])) {
    // any unit vector square to the first
    const ax0 = Math.abs(u[0]) < 0.9 ? 1 : 0, ax1 = 1 - ax0
    let x = ax1 * u[6], y = -ax0 * u[6], z = ax0 * u[3] - ax1 * u[0]
    const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l
    u[1] = x; u[4] = y; u[7] = z
  }
  {
    // the third column always from the first two, so U is a rotation; s[2] takes the sign
    const x = u[3] * u[7] - u[6] * u[4], y = u[6] * u[1] - u[0] * u[7], z = u[0] * u[4] - u[3] * u[1]
    if (u[2] === u[2]) {
      const dot = x * u[2] + y * u[5] + z * u[8]
      if (dot < 0) s[2] = -s[2]
    }
    u[2] = x; u[5] = y; u[8] = z
  }
}
const A = new Float64Array(9)
const VS = new Float64Array(9)
const det = (m: ArrayLike<number>) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])

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
