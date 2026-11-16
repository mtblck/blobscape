import { quatToMat, type Blobs } from '../../splat-core/blobs.ts'
import type { SplatMesh } from '../../splat-engine/mesh.ts'

/**
 * Fair measures for the Fuzzy things lesson: each asks the splat and the
 * mesh the same question.
 */

type V3 = [number, number, number]

/** Bytes per blob in a plain .splat file (position, size, color, opacity, rotation). */
export const SPLAT_BYTES = 32
/** A mesh as a plain .glb: position, normal and color per corner (floats), three indices per triangle. */
export const meshBytes = (m: SplatMesh) => m.vertexCount * 36 + m.triangleCount * 12

/** How far out (in its own standard deviations) a blob counts as covering a point. */
const REACH = 2

/** The blob's covariance-scaled distance squared from p, in standard deviations. */
function sigmas2(b: Blobs, i: number, p: ArrayLike<number>): number {
  const r = quatToMat(b.quat.subarray(i * 4, i * 4 + 4))
  const d = [p[0] - b.center[i * 3], p[1] - b.center[i * 3 + 1], p[2] - b.center[i * 3 + 2]]
  let q = 0
  for (let a = 0; a < 3; a++) {
    // Component along the blob's own axis a (column a of R)
    const t = d[0] * r[a] + d[1] * r[3 + a] + d[2] * r[6 + a]
    const s = Math.max(1e-6, b.scale[i * 3 + a])
    q += (t * t) / (s * s)
  }
  return q
}

/** How many of these points some visible blob still covers. */
export function pointsKeptBySplats(b: Blobs, points: V3[]): number {
  let kept = 0
  for (const p of points) {
    for (let i = 0; i < b.count; i++) {
      if (b.opacity[i] > 0.3 && sigmas2(b, i, p) <= REACH * REACH) { kept++; break }
    }
  }
  return kept
}

/** How many of these points have the mesh's surface within `near` of them. */
export function pointsKeptByMesh(m: SplatMesh, points: V3[], near = 0.04): number {
  let kept = 0
  for (const p of points) {
    for (let i = 0; i < m.vertexCount; i++) {
      if (Math.hypot(m.positions[i * 3] - p[0], m.positions[i * 3 + 1] - p[1], m.positions[i * 3 + 2] - p[2]) < near) { kept++; break }
    }
  }
  return kept
}

/**
 * Share of light that gets through the blobs along a ray: each blob dims it
 * by its opacity where the ray passes closest, the way they blend on screen.
 */
export function lightThroughSplats(b: Blobs, from: V3, to: V3): number {
  const dir = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
  const len = Math.hypot(dir[0], dir[1], dir[2])
  const u = [dir[0] / len, dir[1] / len, dir[2] / len]
  let t = 1
  for (let i = 0; i < b.count; i++) {
    const c = [b.center[i * 3] - from[0], b.center[i * 3 + 1] - from[1], b.center[i * 3 + 2] - from[2]]
    const along = Math.max(0, Math.min(len, c[0] * u[0] + c[1] * u[1] + c[2] * u[2]))
    const p = [from[0] + u[0] * along, from[1] + u[1] * along, from[2] + u[2] * along]
    const q = sigmas2(b, i, p)
    if (q > 9) continue
    t *= 1 - Math.min(0.99, b.opacity[i] * Math.exp(-0.5 * q))
  }
  return t
}

/** Light through a mesh along the same ray: none if it hits a triangle, all if not. */
export function lightThroughMesh(m: SplatMesh, from: V3, to: V3): number {
  const p = m.positions, ix = m.indices
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
  for (let k = 0; k < m.triangleCount; k++) {
    const a = ix[k * 3] * 3, b = ix[k * 3 + 1] * 3, c = ix[k * 3 + 2] * 3
    // Möller–Trumbore, with the segment from → to as t in [0, 1]
    const e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]]
    const e2 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]]
    const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]]
    const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2]
    if (Math.abs(det) < 1e-12) continue
    const s = [from[0] - p[a], from[1] - p[a + 1], from[2] - p[a + 2]]
    const uu = (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]) / det
    if (uu < 0 || uu > 1) continue
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]]
    const vv = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det
    if (vv < 0 || uu + vv > 1) continue
    const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det
    if (t >= 0 && t <= 1) return 0
  }
  return 1
}
