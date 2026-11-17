/**
 * A list of Gaussian blobs, kept as flat typed arrays (one entry per blob) so a
 * scene of tens of thousands stays cheap to copy, undo and hand to the GPU.
 *
 * Each blob is the five kinds of number (14 values) a 3D Gaussian splat is made of:
 * a center, three scales (standard deviations along its own axes), a rotation
 * (unit quaternion x, y, z, w), a color and an opacity. Colors are stored as
 * given to Spark (0–1 per channel), which draws them as sRGB.
 */
export class Blobs {
  /** How many blobs. */
  count = 0
  /** Centers: x, y, z per blob. */
  center: Float32Array
  /** Sizes along each blob's own axes (standard deviations): three per blob. */
  scale: Float32Array
  /** Rotations as unit quaternions: x, y, z, w per blob. */
  quat: Float32Array
  /** Colors, 0–1 sRGB: red, green, blue per blob. */
  color: Float32Array
  /** Opacity, 0–1: one per blob. */
  opacity: Float32Array
  /**
   * Color by angle, when the blobs have it: `shDegree` 1–3, and per blob
   * `shTerms` triples (r, g, b for each spherical harmonic term after the
   * first, in the files' order and signs: see `viewColor` in sh.ts). Blobs
   * without it have degree 0 and no array.
   */
  shDegree = 0
  /** The color-by-angle terms themselves, or null when the blobs have none: see `shDegree`. */
  sh: Float32Array | null = null

  constructor(capacity = 64) {
    this.center = new Float32Array(capacity * 3)
    this.scale = new Float32Array(capacity * 3)
    this.quat = new Float32Array(capacity * 4)
    this.color = new Float32Array(capacity * 3)
    this.opacity = new Float32Array(capacity)
  }

  /** How many blobs the arrays have room for; they grow as blobs are pushed. */
  get capacity() { return this.opacity.length }

  /** Rest terms per blob: 0, 3, 8 or 15. */
  get shTerms() { return [0, 3, 8, 15][this.shDegree] }

  /** Gives the blobs color by angle up to `degree` (0 removes it), keeping the terms they already have. */
  setSHDegree(degree: number) {
    const was = this.sh, wasTerms = this.shTerms
    this.shDegree = degree
    const t = this.shTerms
    this.sh = t ? new Float32Array(this.capacity * t * 3) : null
    if (this.sh && was) for (let i = 0; i < this.count; i++) for (let k = 0; k < Math.min(t, wasTerms) * 3; k++) this.sh[i * t * 3 + k] = was[i * wasTerms * 3 + k]
  }

  private grow(min: number) {
    if (min <= this.capacity) return
    const cap = Math.max(min, this.capacity * 2, 64)
    const re = (a: Float32Array, k: number) => { const b = new Float32Array(cap * k); b.set(a.subarray(0, this.count * k)); return b }
    this.center = re(this.center, 3)
    this.scale = re(this.scale, 3)
    this.quat = re(this.quat, 4)
    this.color = re(this.color, 3)
    this.opacity = re(this.opacity, 1)
    if (this.sh) this.sh = re(this.sh, this.shTerms * 3)
  }

  /** Adds a blob and returns its index. */
  push(b: Blob): number {
    this.grow(this.count + 1)
    const i = this.count++
    this.set(i, b)
    // a slot freed by filter may still hold an old blob's terms
    if (this.sh) this.sh.fill(0, i * this.shTerms * 3, (i + 1) * this.shTerms * 3)
    return i
  }

  /** Writes blob `i`. */
  set(i: number, b: Blob) {
    this.center.set(b.center, i * 3)
    this.scale.set(b.scale, i * 3)
    this.quat.set(normalize(b.quat), i * 4)
    this.color.set(b.color, i * 3)
    this.opacity[i] = b.opacity
  }

  /** Reads blob `i`. */
  get(i: number): Blob {
    return {
      center: [...this.center.subarray(i * 3, i * 3 + 3)] as Vec3,
      scale: [...this.scale.subarray(i * 3, i * 3 + 3)] as Vec3,
      quat: [...this.quat.subarray(i * 4, i * 4 + 4)] as Quat,
      color: [...this.color.subarray(i * 3, i * 3 + 3)] as Vec3,
      opacity: this.opacity[i],
    }
  }

  /** Keeps the blobs where `keep(i)` is true, in order. Returns how many were removed. */
  filter(keep: (i: number) => boolean): number {
    let w = 0
    for (let r = 0; r < this.count; r++) {
      if (!keep(r)) continue
      if (w !== r) {
        this.center.copyWithin(w * 3, r * 3, r * 3 + 3)
        this.scale.copyWithin(w * 3, r * 3, r * 3 + 3)
        this.quat.copyWithin(w * 4, r * 4, r * 4 + 4)
        this.color.copyWithin(w * 3, r * 3, r * 3 + 3)
        this.opacity[w] = this.opacity[r]
        const s = this.shTerms * 3
        if (this.sh) this.sh.copyWithin(w * s, r * s, r * s + s)
      }
      w++
    }
    const removed = this.count - w
    this.count = w
    return removed
  }

  /** A copy that shares nothing with this one. */
  clone(): Blobs {
    const c = new Blobs(Math.max(1, this.count))
    c.count = this.count
    c.center.set(this.center.subarray(0, this.count * 3))
    c.scale.set(this.scale.subarray(0, this.count * 3))
    c.quat.set(this.quat.subarray(0, this.count * 4))
    c.color.set(this.color.subarray(0, this.count * 3))
    c.opacity.set(this.opacity.subarray(0, this.count))
    if (this.sh) { c.setSHDegree(this.shDegree); c.sh!.set(this.sh.subarray(0, this.count * this.shTerms * 3)) }
    return c
  }

  /** Bytes held by the used part, for capping undo history. */
  get bytes() { return this.count * (14 + this.shTerms * 3) * 4 }
}

/** Three numbers: a point or a direction (x, y, z), or a color (red, green, blue). */
export type Vec3 = [number, number, number]
export type Quat = [number, number, number, number]
export interface Blob { center: Vec3; scale: Vec3; quat: Quat; color: Vec3; opacity: number }

export function normalize(q: ArrayLike<number>): Quat {
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
  // axis = z × n, angle from dot: q = (z × n, 1 + z·n), normalized
  return normalize([-n[1], n[0], 0, 1 + d])
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

/** A world point to CSS pixels (y down) and its depth in front of the camera, or null behind a perspective camera. */
export function projectPoint(p: ArrayLike<number>, lens: Lens): { x: number; y: number; depth: number; tx: number; ty: number } | null {
  const V = lens.view
  const tx = V[0] * p[0] + V[4] * p[1] + V[8] * p[2] + V[12]
  const ty = V[1] * p[0] + V[5] * p[1] + V[9] * p[2] + V[13]
  const depth = -(V[2] * p[0] + V[6] * p[1] + V[10] * p[2] + V[14])
  if (lens.ortho) return { x: lens.width / 2 + lens.fx * tx, y: lens.height / 2 - lens.fy * ty, depth, tx, ty }
  if (depth <= 1e-4) return null
  return { x: lens.width / 2 + (lens.fx * tx) / depth, y: lens.height / 2 - (lens.fy * ty) / depth, depth, tx, ty }
}

/**
 * Projects blob i to its screen footprint, the same way 3DGS renderers do:
 * Σ' = J W Σ Wᵀ Jᵀ, with J the Jacobian of the projection at the blob's center.
 * Returns null when the blob is behind the camera.
 */
export function project(b: Blobs, i: number, lens: Lens): Footprint | null {
  const V = lens.view
  const c = projectPoint(b.center.subarray(i * 3, i * 3 + 3), lens)
  if (!c) return null
  const { x, y, depth, tx, ty } = c
  // Jacobian rows (screen u right, v down) w.r.t. camera-space x, y, z
  const J = lens.ortho
    ? [lens.fx, 0, 0, 0, -lens.fy, 0]
    : [lens.fx / depth, 0, (lens.fx * tx) / (depth * depth), 0, -lens.fy / depth, (-lens.fy * ty) / (depth * depth)]
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
  // Runs once per blob per pick, so it works on plain numbers: no arrays allocated.
  const q = b.quat, i4 = i * 4, i3 = i * 3
  const x = q[i4], y = q[i4 + 1], z = q[i4 + 2], w = q[i4 + 3]
  // Columns of the rotation matrix are the blob's axes in world space
  const ax0 = 1 - 2 * (y * y + z * z), ay0 = 2 * (x * y + z * w), az0 = 2 * (x * z - y * w)
  const ax1 = 2 * (x * y - z * w), ay1 = 1 - 2 * (x * x + z * z), az1 = 2 * (y * z + x * w)
  const ax2 = 2 * (x * z + y * w), ay2 = 2 * (y * z - x * w), az2 = 1 - 2 * (x * x + y * y)
  const rx = o[0] - b.center[i3], ry = o[1] - b.center[i3 + 1], rz = o[2] - b.center[i3 + 2]
  const s0 = 1 / (k * Math.max(b.scale[i3], 1e-6)), s1 = 1 / (k * Math.max(b.scale[i3 + 1], 1e-6)), s2 = 1 / (k * Math.max(b.scale[i3 + 2], 1e-6))
  // Rᵀ · v, divided by k·scale per axis: in this frame the ellipsoid is a unit sphere
  const lo0 = (ax0 * rx + ay0 * ry + az0 * rz) * s0, lo1 = (ax1 * rx + ay1 * ry + az1 * rz) * s1, lo2 = (ax2 * rx + ay2 * ry + az2 * rz) * s2
  const ld0 = (ax0 * dir[0] + ay0 * dir[1] + az0 * dir[2]) * s0, ld1 = (ax1 * dir[0] + ay1 * dir[1] + az1 * dir[2]) * s1, ld2 = (ax2 * dir[0] + ay2 * dir[1] + az2 * dir[2]) * s2
  const A = ld0 * ld0 + ld1 * ld1 + ld2 * ld2
  const B = 2 * (lo0 * ld0 + lo1 * ld1 + lo2 * ld2)
  const C = lo0 * lo0 + lo1 * lo1 + lo2 * lo2 - 1
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

/** sRGB hex ("#rrggbb") to 0–1 channels, no color management: what you pick is what Spark draws. */
export function hexToRgb(hex: string): Vec3 {
  const n = parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function rgbToHex(c: ArrayLike<number>): string {
  const h = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`
}

/**
 * The scale and facing of a blob with covariance `c` ([xx, xy, xz, yy, yz, zz]): its
 * axes are Σ's eigenvectors, its scales the roots of the eigenvalues (Jacobi
 * sweeps; exact to float precision). The inverse of `covariance`, up to which
 * axis is called which.
 */
export function fromCovariance(c: ArrayLike<number>): { scale: Vec3; quat: Quat } {
  const a = [[c[0], c[1], c[2]], [c[1], c[3], c[4]], [c[2], c[4], c[5]]]
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  for (let sweep = 0; sweep < 12; sweep++) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2])
    if (off < 1e-30 + 1e-12 * (Math.abs(a[0][0]) + Math.abs(a[1][1]) + Math.abs(a[2][2]))) break
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (a[p][q] === 0) continue
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q])
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1))
      const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p], akq = a[k][q]
        a[k][p] = cs * akp - sn * akq; a[k][q] = sn * akp + cs * akq
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k], aqk = a[q][k]
        a[p][k] = cs * apk - sn * aqk; a[q][k] = sn * apk + cs * aqk
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p], vkq = v[k][q]
        v[k][p] = cs * vkp - sn * vkq; v[k][q] = sn * vkp + cs * vkq
      }
    }
  }
  // the columns of v are the axes; a proper turn needs a determinant of +1
  const det = v[0][0] * (v[1][1] * v[2][2] - v[1][2] * v[2][1]) - v[0][1] * (v[1][0] * v[2][2] - v[1][2] * v[2][0]) + v[0][2] * (v[1][0] * v[2][1] - v[1][1] * v[2][0])
  if (det < 0) for (let k = 0; k < 3; k++) v[k][2] = -v[k][2]
  const scale: Vec3 = [Math.sqrt(Math.max(a[0][0], 0)), Math.sqrt(Math.max(a[1][1], 0)), Math.sqrt(Math.max(a[2][2], 0))]
  return { scale, quat: matToQuat(v) }
}

/** The unit quaternion of a rotation matrix given as rows. */
function matToQuat(m: number[][]): Quat {
  const tr = m[0][0] + m[1][1] + m[2][2]
  let q: Quat
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2
    q = [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4]
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2
    q = [s / 4, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s]
  } else if (m[1][1] > m[2][2]) {
    const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2
    q = [(m[0][1] + m[1][0]) / s, s / 4, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s]
  } else {
    const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2
    q = [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, s / 4, (m[1][0] - m[0][1]) / s]
  }
  return normalize(q)
}
