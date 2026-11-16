import type { Blobs } from '../splat-core/blobs.ts'
import { mulQ, norm4, quatMat3, type Skeleton, type Skin, type SkinMode } from './rig.ts'

/**
 * Skinning on the CPU into an ordinary `Blobs` list, so a small rigged model
 * (a lesson's caterpillar or arm, a few thousand blobs) can be drawn by any
 * renderer that takes blobs, Spark included. It is `skinBlob` (rig.ts) written
 * without allocation and turned back into a center, three scales and a
 * rotation instead of a covariance. Change one, change both: the tests check
 * they give the same covariance.
 *
 * - 'quat': the shape turns by the weighted average of the bone rotations and
 *   scales by their average scale, so it never flattens.
 * - 'linear': the shape is pushed through the blended matrix, then split back
 *   into axes and sizes (an eigen decomposition). On a twisting joint that
 *   blended matrix squashes, and so does the blob.
 *
 * Writes centers, scales and rotations of `out` (which must hold as many
 * blobs as `rest`); colors and opacities are left as they are.
 */
export function poseBlobs(rest: Blobs, skin: Skin, rig: Skeleton, mode: SkinMode, out: Blobs) {
  const n = rest.count
  const M = new Float64Array(12)
  const A = new Float64Array(9)
  const R = new Float64Array(9)
  const cov = new Float64Array(6)
  const eig = new Float64Array(12)
  const Q = [0, 0, 0, 0]
  out.count = n
  for (let i = 0; i < n; i++) {
    M.fill(0)
    Q[0] = Q[1] = Q[2] = Q[3] = 0
    let S = 0
    const j0 = skin.joints[i * 4]
    for (let k = 0; k < 4; k++) {
      const w = skin.weights[i * 4 + k]
      if (!w) continue
      const j = skin.joints[i * 4 + k]
      for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++) M[c * 3 + r] += w * rig.matrix[j * 16 + c * 4 + r]
      const d = rig.quat[j * 4] * rig.quat[j0 * 4] + rig.quat[j * 4 + 1] * rig.quat[j0 * 4 + 1] + rig.quat[j * 4 + 2] * rig.quat[j0 * 4 + 2] + rig.quat[j * 4 + 3] * rig.quat[j0 * 4 + 3]
      const sign = d < 0 ? -w : w
      for (let c = 0; c < 4; c++) Q[c] += sign * rig.quat[j * 4 + c]
      S += w * rig.scale[j]
    }
    const x = rest.center[i * 3], y = rest.center[i * 3 + 1], z = rest.center[i * 3 + 2]
    out.center[i * 3] = M[0] * x + M[3] * y + M[6] * z + M[9]
    out.center[i * 3 + 1] = M[1] * x + M[4] * y + M[7] * z + M[10]
    out.center[i * 3 + 2] = M[2] * x + M[5] * y + M[8] * z + M[11]
    const rq = rest.quat.subarray(i * 4, i * 4 + 4)

    if (mode === 'quat') {
      const q = mulQ(norm4(Q), rq)
      out.quat.set(norm4(q), i * 4)
      for (let k = 0; k < 3; k++) out.scale[i * 3 + k] = rest.scale[i * 3 + k] * S
      continue
    }
    // A = Mblend(3×3) · R_rest · S_rest, Σ = A Aᵀ, then Σ = V diag(λ) Vᵀ
    const Rr = quatMat3(norm4(rq))
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      A[r * 3 + c] = (M[r] * Rr[c] + M[3 + r] * Rr[3 + c] + M[6 + r] * Rr[6 + c]) * rest.scale[i * 3 + c]
    }
    const d = (a: number, b: number) => A[a * 3] * A[b * 3] + A[a * 3 + 1] * A[b * 3 + 1] + A[a * 3 + 2] * A[b * 3 + 2]
    cov[0] = d(0, 0); cov[1] = d(0, 1); cov[2] = d(0, 2); cov[3] = d(1, 1); cov[4] = d(1, 2); cov[5] = d(2, 2)
    symEigen(cov, eig)
    for (let k = 0; k < 3; k++) out.scale[i * 3 + k] = Math.sqrt(Math.max(0, eig[k]))
    // eigenvectors are the columns of the rotation
    for (let k = 0; k < 9; k++) R[k] = eig[3 + k]
    const q = mat3ToQuat(R)
    out.quat.set(q, i * 4)
  }
}

/**
 * Eigen decomposition of a symmetric 3×3 matrix [xx, xy, xz, yy, yz, zz] by
 * Jacobi rotations. Writes the three eigenvalues, then the eigenvectors as the
 * columns of a row-major 3×3 rotation (determinant +1).
 */
export function symEigen(c: ArrayLike<number>, out: Float64Array) {
  const a = [c[0], c[1], c[2], c[1], c[3], c[4], c[2], c[4], c[5]]
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1]
  for (let sweep = 0; sweep < 12; sweep++) {
    const off = a[1] * a[1] + a[2] * a[2] + a[5] * a[5]
    if (off < 1e-30 * (a[0] * a[0] + a[4] * a[4] + a[8] * a[8] + 1e-300)) break
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      const apq = a[p * 3 + q]
      if (Math.abs(apq) < 1e-300) continue
      const theta = (a[q * 3 + q] - a[p * 3 + p]) / (2 * apq)
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs
      for (let k = 0; k < 3; k++) {
        const akp = a[k * 3 + p], akq = a[k * 3 + q]
        a[k * 3 + p] = cs * akp - sn * akq
        a[k * 3 + q] = sn * akp + cs * akq
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p * 3 + k], aqk = a[q * 3 + k]
        a[p * 3 + k] = cs * apk - sn * aqk
        a[q * 3 + k] = sn * apk + cs * aqk
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k * 3 + p], vkq = v[k * 3 + q]
        v[k * 3 + p] = cs * vkp - sn * vkq
        v[k * 3 + q] = sn * vkp + cs * vkq
      }
    }
  }
  // a right-handed frame, so it is a rotation
  const det = v[0] * (v[4] * v[8] - v[5] * v[7]) - v[1] * (v[3] * v[8] - v[5] * v[6]) + v[2] * (v[3] * v[7] - v[4] * v[6])
  if (det < 0) { v[2] = -v[2]; v[5] = -v[5]; v[8] = -v[8] }
  out[0] = a[0]; out[1] = a[4]; out[2] = a[8]
  for (let k = 0; k < 9; k++) out[3 + k] = v[k]
}

/** Unit quaternion (x, y, z, w) of a row-major 3×3 rotation. */
export function mat3ToQuat(m: ArrayLike<number>): [number, number, number, number] {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = [m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]]
  const tr = m00 + m11 + m22
  let x: number, y: number, z: number, w: number
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2
    w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2
    w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2
    w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2
    w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s
  }
  const l = Math.hypot(x, y, z, w) || 1
  return [x / l, y / l, z / l, w / l]
}

/**
 * How much of its rest volume each blob keeps: √det of the posed covariance
 * over the rest one. 1 is whole; a blob squashed flat on a twist heads to 0.
 */
export function volumeKept(rest: Blobs, posed: Blobs, i: number) {
  const r = rest.scale, p = posed.scale
  const v0 = r[i * 3] * r[i * 3 + 1] * r[i * 3 + 2]
  return v0 > 0 ? (p[i * 3] * p[i * 3 + 1] * p[i * 3 + 2]) / v0 : 1
}

/**
 * Pairs of blobs that sit next to each other in the rest pose (each blob with
 * its `k` nearest, among those `near` accepts), for measuring how a pose
 * pulls the surface apart. Brute force: meant for a few hundred blobs round
 * one joint.
 */
export function neighborPairs(b: Blobs, near: (i: number) => boolean, k = 4): Uint32Array {
  const ids: number[] = []
  for (let i = 0; i < b.count; i++) if (near(i)) ids.push(i)
  const c = b.center
  const out: number[] = []
  const best: [number, number][] = []
  for (const i of ids) {
    best.length = 0
    for (const j of ids) {
      if (j === i) continue
      const d = (c[i * 3] - c[j * 3]) ** 2 + (c[i * 3 + 1] - c[j * 3 + 1]) ** 2 + (c[i * 3 + 2] - c[j * 3 + 2]) ** 2
      if (best.length < k) { best.push([d, j]); best.sort((x, y) => x[0] - y[0]) }
      else if (d < best[k - 1][0]) { best[k - 1] = [d, j]; best.sort((x, y) => x[0] - y[0]) }
    }
    for (const [, j] of best) out.push(i, j)
  }
  return Uint32Array.from(out)
}

/**
 * How far a pose has pulled neighboring blobs apart: for each pair, its posed
 * distance over its rest distance, and the ratio that a share `q` of the pairs
 * stay under (0.995: all but the worst half percent, so one stray pair can't
 * decide it). 1 is untouched; 3 means gaps three times the usual spacing.
 */
export function stretch(pairs: Uint32Array, rest: Blobs, posed: Blobs, q = 0.995) {
  const r: number[] = []
  const a = rest.center, p = posed.center
  for (let k = 0; k < pairs.length; k += 2) {
    const i = pairs[k] * 3, j = pairs[k + 1] * 3
    const d0 = Math.hypot(a[i] - a[j], a[i + 1] - a[j + 1], a[i + 2] - a[j + 2])
    const d1 = Math.hypot(p[i] - p[j], p[i + 1] - p[j + 1], p[i + 2] - p[j + 2])
    if (d0 > 1e-6) r.push(d1 / d0)
  }
  if (!r.length) return 1
  r.sort((x, y) => x - y)
  return r[Math.min(r.length - 1, Math.floor(r.length * q))]
}
