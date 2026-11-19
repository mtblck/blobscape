import { covariance, type Blobs } from '../splat-core/blobs.ts'
import { linearToSrgb, srgbToLinear } from '../splat-core/color.ts'
import type { Light } from './engine.ts'

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
 * How much light (linear, per channel) reaches a point with normal n: ambient (one brightness, or a color) plus each
 * light by distance and facing (a light from a direction doesn't fade with distance), and each of the first four by
 * `seen` (0–255, how much of it the point can see), as the engine reads an actor's `seen`.
 */
export function lightAt(p: ArrayLike<number>, n: ArrayLike<number>, lights: Light[], ambient: number | ArrayLike<number>, seen?: ArrayLike<number>): [number, number, number] {
  const sum: [number, number, number] = typeof ambient === 'number' ? [ambient, ambient, ambient] : [ambient[0], ambient[1], ambient[2]]
  for (const [j, L] of lights.entries()) {
    let to: number[], fall = 1
    if ('direction' in L) to = [L.direction[0], L.direction[1], L.direction[2]]
    else {
      to = [L.position[0] - p[0], L.position[1] - p[1], L.position[2] - p[2]]
      const d2 = to[0] * to[0] + to[1] * to[1] + to[2] * to[2]
      const r2 = Math.max(1e-3, L.range) ** 2
      const fade = Math.max(1 - d2 / (r2 * 4), 0)
      fall = (fade * fade) / (1 + d2 / r2)
    }
    const inv = 1 / Math.sqrt(Math.max(to[0] * to[0] + to[1] * to[1] + to[2] * to[2], 1e-6))
    const facing = Math.abs((n[0] * to[0] + n[1] * to[1] + n[2] * to[2]) * inv) * 0.65 + 0.35
    const sees = seen && j < 4 ? seen[j] / 255 : 1
    for (let k = 0; k < 3; k++) sum[k] += L.color[k] * fall * facing * sees
  }
  return sum
}

/**
 * What a blob's color is multiplied by under `light` (from `lightAt`) when it gives `glow` of its own light (0 to 1,
 * `Actor.glow`): never less than its own share, so a lit window stays bright in the dark and still takes the sun.
 */
export function ownLight(light: readonly number[], glow: number): [number, number, number] {
  return [Math.max(light[0], glow), Math.max(light[1], glow), Math.max(light[2], glow)]
}

/** A copy of the blobs with the lights baked into their colors, as the engine would show them (still blobs, no bones). */
export function bakeLights(b: Blobs, lights: Light[], ambient: number | ArrayLike<number>): Blobs {
  const out = b.clone()
  for (let i = 0; i < b.count; i++) {
    const s = lightAt(b.center.subarray(i * 3, i * 3 + 3), blobNormal(covariance(b, i)), lights, ambient)
    for (let k = 0; k < 3; k++) out.color[i * 3 + k] = linearToSrgb(Math.min(1, srgbToLinear(b.color[i * 3 + k]) * s[k]))
  }
  return out
}

/**
 * How flat a blob is, from its covariance [xx, xy, xz, yy, yz, zz]: 1 for a disc (two long axes and a shorter one,
 * which is its normal), 0 for a needle or a ball, which have no one side to turn to a light. It is how much shorter
 * the shortest axis is than the middle one, from the covariance's eigenvalues (in closed form, by the angle of the
 * cubic). CPU twin of `flatness` in engine.ts: change both.
 */
export function flatness(cov: ArrayLike<number>): number {
  const [a, b, c, d, e, f] = [cov[0], cov[1], cov[2], cov[3], cov[4], cov[5]]
  const q = (a + d + f) / 3
  const p = Math.sqrt(Math.max(((a - q) ** 2 + (d - q) ** 2 + (f - q) ** 2 + 2 * (b * b + c * c + e * e)) / 6, 1e-30))
  const A = (a - q) / p, B = b / p, C = c / p, D = (d - q) / p, E = e / p, F = (f - q) / p
  const half = (A * (D * F - E * E) - B * (B * F - C * E) + C * (B * E - C * D)) / 2
  const phi = Math.acos(Math.max(-1, Math.min(1, half))) / 3
  const most = q + 2 * p * Math.cos(phi), least = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3)
  const mid = 3 * q - most - least
  const ratio = Math.sqrt(Math.max(least, 0) / Math.max(mid, 1e-30))
  const t = Math.max(0, Math.min(1, (ratio - FLAT_FULL) / (FLAT_NONE - FLAT_FULL)))
  return 1 - t * t * (3 - 2 * t)
}
/** A blob is flat when its shortest axis is at most this share of its middle one, and not at all from `FLAT_NONE`. */
export const FLAT_FULL = 0.7
/** See `FLAT_FULL`. */
export const FLAT_NONE = 0.95

/** The most the scene's lamps count for in a blob's tone (`toneAt`'s `lamps`): over it is a blob that gives its own light. */
export const LAMP_MOST = 0.8

/**
 * What cel shading cuts into tones (splat-core/cel.ts), for a blob at `p` with covariance `cov` seen from `eye` under
 * the first light: how it faces the light (0 away, 0.5 edge on, 1 toward), with the side of the blob that the eye sees
 * taken for its outside (a blob doesn't know its outside, but the side in view is the one being drawn), and how sure
 * that is (`flatness`). The share of the light that reaches it past what is in the way is the shadows' own answer
 * (`transmittance` in shadow.ts). `lamps` is how much the scene's own lights (`others`: those set on the stage, which
 * come after cel shading's) reach it: each point light's brightness by its distance, the blob's facing and its baked
 * lamp shadow (`seen`, a byte for each of the first four), as `lightAt` counts them, at most `LAMP_MOST`. CPU twin of
 * `toned` in engine.ts: change both.
 */
export function toneAt(p: ArrayLike<number>, cov: ArrayLike<number>, eye: ArrayLike<number>, light: Light | undefined, others: Light[] = [], seen?: ArrayLike<number>): { facing: number; sure: number; lamps: number } {
  if (!light) return { facing: 1, sure: flatness(cov), lamps: 0 }
  const n = blobNormal(cov)
  const side = n[0] * (eye[0] - p[0]) + n[1] * (eye[1] - p[1]) + n[2] * (eye[2] - p[2]) < 0 ? -1 : 1
  const to = 'direction' in light ? light.direction : [light.position[0] - p[0], light.position[1] - p[1], light.position[2] - p[2]]
  const inv = 1 / Math.sqrt(Math.max(to[0] * to[0] + to[1] * to[1] + to[2] * to[2], 1e-6))
  let lamps = 0
  for (const [j, L] of others.entries()) {
    if ('direction' in L) continue
    const at = [L.position[0] - p[0], L.position[1] - p[1], L.position[2] - p[2]]
    const d2 = at[0] * at[0] + at[1] * at[1] + at[2] * at[2]
    const r2 = Math.max(1e-3, L.range) ** 2
    const fade = Math.max(1 - d2 / (r2 * 4), 0)
    const facing = Math.abs((n[0] * at[0] + n[1] * at[1] + n[2] * at[2]) / Math.sqrt(Math.max(d2, 1e-6))) * 0.65 + 0.35
    lamps += (0.2126 * L.color[0] + 0.7152 * L.color[1] + 0.0722 * L.color[2]) * ((fade * fade) / (1 + d2 / r2)) * facing * (seen && j < 4 ? seen[j] / 255 : 1)
  }
  return { facing: side * (n[0] * to[0] + n[1] * to[1] + n[2] * to[2]) * inv * 0.5 + 0.5, sure: flatness(cov), lamps: Math.min(lamps, LAMP_MOST) }
}
