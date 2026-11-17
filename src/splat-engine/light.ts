import { covariance, type Blobs } from '../splat-core/blobs.ts'
import { linearToSrgb, srgbToLinear } from '../splat-core/color.ts'
import type { PointLight } from './engine.ts'

/**
 * The CPU twin of the engine's live lights (`lit` and `blobNormal` in
 * engine.ts): the same normal from the covariance's adjugate, the same
 * falloff and the same two-sided facing. Change one, change both.
 */

/** A blob's normal (either sign) from its covariance [xx, xy, xz, yy, yz, zz]. */
export function blobNormal(cov: ArrayLike<number>): [number, number, number] {
  const [a, b, c, d, e, f] = [cov[0], cov[1], cov[2], cov[3], cov[4], cov[5]]
  const cols: [number, number, number][] = [
    [d * f - e * e, c * e - b * f, b * e - c * d],
    [c * e - b * f, a * f - c * c, b * c - a * e],
    [b * e - c * d, b * c - a * e, a * d - b * b],
  ]
  const len = cols.map((v) => v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
  const best = len[0] > len[1] ? (len[0] > len[2] ? cols[0] : cols[2]) : len[1] > len[2] ? cols[1] : cols[2]
  const v: [number, number, number] = [best[0], best[1] + 1e-12, best[2]]
  const l = Math.hypot(...v)
  return [v[0] / l, v[1] / l, v[2] / l]
}

/**
 * How much light (linear, per channel) reaches a point with normal n: ambient plus each light by distance and facing,
 * and each of the first four by `seen` (0–255, how much of it the point can see), as the engine reads an actor's `seen`.
 */
export function lightAt(p: ArrayLike<number>, n: ArrayLike<number>, lights: PointLight[], ambient: number, seen?: ArrayLike<number>): [number, number, number] {
  const sum: [number, number, number] = [ambient, ambient, ambient]
  for (const [j, L] of lights.entries()) {
    const to = [L.position[0] - p[0], L.position[1] - p[1], L.position[2] - p[2]]
    const d2 = to[0] * to[0] + to[1] * to[1] + to[2] * to[2]
    const r2 = Math.max(1e-3, L.range) ** 2
    const fade = Math.max(1 - d2 / (r2 * 4), 0)
    const fall = (fade * fade) / (1 + d2 / r2)
    const inv = 1 / Math.sqrt(Math.max(d2, 1e-6))
    const facing = Math.abs((n[0] * to[0] + n[1] * to[1] + n[2] * to[2]) * inv) * 0.65 + 0.35
    const sees = seen && j < 4 ? seen[j] / 255 : 1
    for (let k = 0; k < 3; k++) sum[k] += L.color[k] * fall * facing * sees
  }
  return sum
}

/** A copy of the blobs with the lights baked into their colors, as the engine would show them (still blobs, no bones). */
export function bakeLights(b: Blobs, lights: PointLight[], ambient: number): Blobs {
  const out = b.clone()
  for (let i = 0; i < b.count; i++) {
    const s = lightAt(b.center.subarray(i * 3, i * 3 + 3), blobNormal(covariance(b, i)), lights, ambient)
    for (let k = 0; k < 3; k++) out.color[i * 3 + k] = linearToSrgb(Math.min(1, srgbToLinear(b.color[i * 3 + k]) * s[k]))
  }
  return out
}
