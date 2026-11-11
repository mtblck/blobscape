/**
 * A list of Gaussian blobs, kept as flat typed arrays (one entry per blob) so a
 * scene of tens of thousands stays cheap to copy, undo and hand to the GPU.
 *
 * Each blob is the seven kinds of number a 3D Gaussian splat is made of:
 * a centre, three scales (standard deviations along its own axes), a rotation
 * (unit quaternion x, y, z, w), a colour and an opacity. Colours are stored as
 * given to Spark (0–1 per channel), which draws them as sRGB.
 */
export class Blobs {
  count = 0
  centre: Float32Array
  scale: Float32Array
  quat: Float32Array
  colour: Float32Array
  opacity: Float32Array

  constructor(capacity = 64) {
    this.centre = new Float32Array(capacity * 3)
    this.scale = new Float32Array(capacity * 3)
    this.quat = new Float32Array(capacity * 4)
    this.colour = new Float32Array(capacity * 3)
    this.opacity = new Float32Array(capacity)
  }

  get capacity() { return this.opacity.length }

  private grow(min: number) {
    if (min <= this.capacity) return
    const cap = Math.max(min, this.capacity * 2, 64)
    const re = (a: Float32Array, k: number) => { const b = new Float32Array(cap * k); b.set(a.subarray(0, this.count * k)); return b }
    this.centre = re(this.centre, 3)
    this.scale = re(this.scale, 3)
    this.quat = re(this.quat, 4)
    this.colour = re(this.colour, 3)
    this.opacity = re(this.opacity, 1)
  }

  push(b: Blob): number {
    this.grow(this.count + 1)
    const i = this.count++
    this.set(i, b)
    return i
  }

  set(i: number, b: Blob) {
    this.centre.set(b.centre, i * 3)
    this.scale.set(b.scale, i * 3)
    this.quat.set(normalise(b.quat), i * 4)
    this.colour.set(b.colour, i * 3)
    this.opacity[i] = b.opacity
  }

  get(i: number): Blob {
    return {
      centre: [...this.centre.subarray(i * 3, i * 3 + 3)] as Vec3,
      scale: [...this.scale.subarray(i * 3, i * 3 + 3)] as Vec3,
      quat: [...this.quat.subarray(i * 4, i * 4 + 4)] as Quat,
      colour: [...this.colour.subarray(i * 3, i * 3 + 3)] as Vec3,
      opacity: this.opacity[i],
    }
  }

  /** Keeps the blobs where `keep(i)` is true, in order. Returns how many were removed. */
  filter(keep: (i: number) => boolean): number {
    let w = 0
    for (let r = 0; r < this.count; r++) {
      if (!keep(r)) continue
      if (w !== r) {
        this.centre.copyWithin(w * 3, r * 3, r * 3 + 3)
        this.scale.copyWithin(w * 3, r * 3, r * 3 + 3)
        this.quat.copyWithin(w * 4, r * 4, r * 4 + 4)
        this.colour.copyWithin(w * 3, r * 3, r * 3 + 3)
        this.opacity[w] = this.opacity[r]
      }
      w++
    }
    const removed = this.count - w
    this.count = w
    return removed
  }

  clone(): Blobs {
    const c = new Blobs(Math.max(1, this.count))
    c.count = this.count
    c.centre.set(this.centre.subarray(0, this.count * 3))
    c.scale.set(this.scale.subarray(0, this.count * 3))
    c.quat.set(this.quat.subarray(0, this.count * 4))
    c.colour.set(this.colour.subarray(0, this.count * 3))
    c.opacity.set(this.opacity.subarray(0, this.count))
    return c
  }

  /** Bytes held by the used part, for capping undo history. */
  get bytes() { return this.count * 14 * 4 }
}

export type Vec3 = [number, number, number]
export type Quat = [number, number, number, number]
export interface Blob { centre: Vec3; scale: Vec3; quat: Quat; colour: Vec3; opacity: number }

export function normalise(q: ArrayLike<number>): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]
}

/** Rotation matrix (row-major 3×3) of a unit quaternion. */
export function quatToMat(q: ArrayLike<number>): number[] {
  const [x, y, z, w] = [q[0], q[1], q[2], q[3]]
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ]
}

/** Quaternion from Euler angles in degrees, applied in X, then Y, then Z order (three.js 'XYZ'). */
export function quatFromEuler(xDeg: number, yDeg: number, zDeg: number): Quat {
  const [x, y, z] = [xDeg, yDeg, zDeg].map((d) => (d * Math.PI) / 360)
  const [c1, c2, c3] = [Math.cos(x), Math.cos(y), Math.cos(z)]
  const [s1, s2, s3] = [Math.sin(x), Math.sin(y), Math.sin(z)]
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ]
}

/** Quaternion that turns +Z onto the unit vector n: how a flat disc is laid on a surface. */
export function quatFacing(n: ArrayLike<number>): Quat {
  const d = n[2]
  if (d < -0.999999) return [1, 0, 0, 0]
  // axis = z × n, angle from dot: q = (z × n, 1 + z·n), normalised
  return normalise([-n[1], n[0], 0, 1 + d])
}

/**
 * The blob's 3D covariance Σ = R S Sᵀ Rᵀ (symmetric; returned as
 * [xx, xy, xz, yy, yz, zz]). This is the matrix a renderer actually projects.
 */
export function covariance(b: Blobs, i: number): number[] {
  const R = quatToMat(b.quat.subarray(i * 4, i * 4 + 4))
  const s = b.scale.subarray(i * 3, i * 3 + 3)
  const m = (r: number, c: number) => R[r * 3 + c] * s[c]
  const cov = (r1: number, r2: number) => m(r1, 0) * m(r2, 0) + m(r1, 1) * m(r2, 1) + m(r1, 2) * m(r2, 2)
  return [cov(0, 0), cov(0, 1), cov(0, 2), cov(1, 1), cov(1, 2), cov(2, 2)]
}

/**
 * Just enough of a camera to project with: a view matrix (world → camera,
 * column-major 4×4, the camera looking down −Z as in three.js) and either a
 * perspective focal length or an orthographic scale, in pixels.
 */
export interface Lens {
  view: ArrayLike<number>
  width: number
  height: number
  /** Pixels per unit at depth 1 (perspective) or pixels per world unit (orthographic). */
  fx: number
  fy: number
  ortho: boolean
}

/** A blob as it lands on screen: a 2D ellipse at 1σ, in CSS pixels, y down. */
export interface Footprint {
  x: number
  y: number
  depth: number
  /** Semi-axes at 1σ, major first. */
  a: number
  b: number
  /** Angle of the major axis, radians, measured on screen (y down). */
  angle: number
  /** The 2D covariance [xx, xy, yy] in pixels², for anyone who wants to evaluate the Gaussian. */
  cov: [number, number, number]
}

/**
 * Projects blob i to its screen footprint, the same way 3DGS renderers do:
 * Σ' = J W Σ Wᵀ Jᵀ, with J the Jacobian of the projection at the blob's centre.
 * Returns null when the blob is behind the camera.
 */
export function project(b: Blobs, i: number, lens: Lens): Footprint | null {
  const V = lens.view
  const [px, py, pz] = b.centre.subarray(i * 3, i * 3 + 3)
  const tx = V[0] * px + V[4] * py + V[8] * pz + V[12]
  const ty = V[1] * px + V[5] * py + V[9] * pz + V[13]
  const tz = V[2] * px + V[6] * py + V[10] * pz + V[14]
  const depth = -tz
  if (!lens.ortho && depth <= 1e-4) return null
  // Jacobian rows (screen u right, v down) w.r.t. camera-space x, y, z
  let J: number[]
  let x: number, y: number
  if (lens.ortho) {
    J = [lens.fx, 0, 0, 0, -lens.fy, 0]
    x = lens.width / 2 + lens.fx * tx
    y = lens.height / 2 - lens.fy * ty
  } else {
    J = [lens.fx / depth, 0, (lens.fx * tx) / (depth * depth), 0, -lens.fy / depth, (-lens.fy * ty) / (depth * depth)]
    x = lens.width / 2 + (lens.fx * tx) / depth
    y = lens.height / 2 - (lens.fy * ty) / depth
  }
  // T = J · W (2×3), W the rotation part of the view matrix
  const W = [V[0], V[4], V[8], V[1], V[5], V[9], V[2], V[6], V[10]]
  const T = [0, 1].flatMap((r) => [0, 1, 2].map((c) => J[r * 3] * W[c] + J[r * 3 + 1] * W[3 + c] + J[r * 3 + 2] * W[6 + c]))
  const [sxx, sxy, sxz, syy, syz, szz] = covariance(b, i)
  const S = [sxx, sxy, sxz, sxy, syy, syz, sxz, syz, szz]
  const TS = [0, 1].flatMap((r) => [0, 1, 2].map((c) => T[r * 3] * S[c] + T[r * 3 + 1] * S[3 + c] + T[r * 3 + 2] * S[6 + c]))
  const a = TS[0] * T[0] + TS[1] * T[1] + TS[2] * T[2]
  const bxy = TS[0] * T[3] + TS[1] * T[4] + TS[2] * T[5]
  const d = TS[3] * T[3] + TS[4] * T[4] + TS[5] * T[5]
  const { major, minor, angle } = eigen2(a, bxy, d)
  return { x, y, depth, a: Math.sqrt(major), b: Math.sqrt(minor), angle, cov: [a, bxy, d] }
}

/** Eigenvalues (major ≥ minor) and major-axis angle of the symmetric matrix [[a, b], [b, d]]. */
export function eigen2(a: number, b: number, d: number) {
  const mid = (a + d) / 2
  const diff = Math.sqrt(((a - d) / 2) ** 2 + b * b)
  const major = mid + diff
  const minor = Math.max(0, mid - diff)
  const angle = 0.5 * Math.atan2(2 * b, a - d)
  return { major, minor, angle }
}

/**
 * Where a ray first enters blob i's ellipsoid at k standard deviations, or
 * -1 if it misses. The ray is moved into the blob's own frame, where the
 * ellipsoid is a unit sphere.
 */
export function rayHit(b: Blobs, i: number, o: ArrayLike<number>, dir: ArrayLike<number>, k = 2): number {
  const R = quatToMat(b.quat.subarray(i * 4, i * 4 + 4))
  const c = b.centre.subarray(i * 3, i * 3 + 3)
  const s = b.scale.subarray(i * 3, i * 3 + 3)
  const rel = [o[0] - c[0], o[1] - c[1], o[2] - c[2]]
  // Rᵀ · v, then divide by k·scale per axis
  const lo = [0, 1, 2].map((a) => (R[a] * rel[0] + R[3 + a] * rel[1] + R[6 + a] * rel[2]) / (k * Math.max(s[a], 1e-6)))
  const ld = [0, 1, 2].map((a) => (R[a] * dir[0] + R[3 + a] * dir[1] + R[6 + a] * dir[2]) / (k * Math.max(s[a], 1e-6)))
  const A = ld[0] ** 2 + ld[1] ** 2 + ld[2] ** 2
  const B = 2 * (lo[0] * ld[0] + lo[1] * ld[1] + lo[2] * ld[2])
  const C = lo[0] ** 2 + lo[1] ** 2 + lo[2] ** 2 - 1
  const disc = B * B - 4 * A * C
  if (disc < 0 || A === 0) return -1
  const sq = Math.sqrt(disc)
  const t0 = (-B - sq) / (2 * A)
  const t1 = (-B + sq) / (2 * A)
  if (t1 < 0) return -1
  return t0 >= 0 ? t0 : 0
}

/** The nearest blob a ray hits (ignoring nearly invisible ones), or -1. */
export function pick(b: Blobs, o: ArrayLike<number>, dir: ArrayLike<number>, k = 2, minOpacity = 0.08): { index: number; t: number } {
  let best = -1
  let bestT = Infinity
  for (let i = 0; i < b.count; i++) {
    if (b.opacity[i] < minOpacity) continue
    const t = rayHit(b, i, o, dir, k)
    if (t >= 0 && t < bestT) { bestT = t; best = i }
  }
  return { index: best, t: bestT }
}

/** sRGB hex ("#rrggbb") to 0–1 channels, no colour management: what you pick is what Spark draws. */
export function hexToRgb(hex: string): Vec3 {
  const n = parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function rgbToHex(c: ArrayLike<number>): string {
  const h = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`
}
