import type { Blobs } from '../splat-core/blobs.ts'
import { linearToSrgb, srgbToLinear } from '../splat-core/color.ts'

/**
 * Shape edits: cut or paint every blob inside a sphere or a box, live, without
 * rebuilding anything. The GPU applies them as it moves the blobs (a cut blob
 * gets no size, as level of detail leaves one out) and as it colors them (a
 * painted blob's own color is mixed toward the paint before any light).
 * Edits are tested against where a blob is now, in world space, so a box
 * that cuts a creature's head off keeps cutting as the head moves through it.
 *
 * This file is the CPU twin (`editAt`), also used to bake edits into blobs for
 * a file (`bakeEdits`). The GPU side is `editsAt` in engine.ts; change both.
 *
 * A cut can also have a clean edge (a world made with `cleanCuts`): a blob the
 * edge passes through is kept, and each of its pixels is tested on its own,
 * at the point of the blob that pixel shows most of (`densestAlong`). A file
 * still gets whole blobs: `bakeEdits` keeps or drops each by its center.
 */

/** One edit for `setEdits`: a sphere, a box or an upright cylinder in world space that cuts blobs away or paints them. */
export interface ShapeEdit {
  /** The shape of what it acts on. */
  shape: 'sphere' | 'box' | 'cylinder'
  /** World position of the shape's middle. */
  center: [number, number, number]
  /** A sphere's radius (the first value), a box's half sizes, or a cylinder's radius and half height (it stands along y). */
  size: [number, number, number]
  /** Cut the blobs away, or paint them. */
  op: 'cut' | 'paint'
  /** Act on what's outside the shape instead: a cut that keeps only the inside is a crop. */
  outside?: boolean
  /** Paint: the color, in sRGB 0–1 like a blob's own. */
  color?: [number, number, number]
  /** Paint: how far toward the color, 0–1 (default 1). */
  amount?: number
  /** Paint: how far in from the edge it takes to reach full strength, in units (default 0, a hard edge). */
  soft?: number
}

/** How many edits the GPU takes at once; the rest are dropped. */
export const MAX_EDITS = 8

/** Signed distance from p to the shape: negative inside. */
export function shapeDistance(e: ShapeEdit, p: ArrayLike<number>): number {
  const q = [p[0] - e.center[0], p[1] - e.center[1], p[2] - e.center[2]]
  if (e.shape === 'sphere') return Math.hypot(q[0], q[1], q[2]) - e.size[0]
  if (e.shape === 'cylinder') {
    const r = Math.hypot(q[0], q[2]) - e.size[0], h = Math.abs(q[1]) - e.size[1]
    return Math.hypot(Math.max(r, 0), Math.max(h, 0)) + Math.min(Math.max(r, h), 0)
  }
  const d = q.map((v, k) => Math.abs(v) - e.size[k])
  const out = Math.hypot(Math.max(d[0], 0), Math.max(d[1], 0), Math.max(d[2], 0))
  return out + Math.min(Math.max(d[0], d[1], d[2]), 0)
}

/** Clean cuts: a blob is dropped whole only when its center is this many of its sizes (`blobReach`) inside a cut. */
export const CLEAN_MARGIN = 2.5

/** A blob's size for clean cuts: the root of its covariance's trace (xx, xy, xz, yy, yz, zz), at least its longest standard deviation. */
export function blobReach(cov: ArrayLike<number>, at = 0): number {
  return Math.sqrt(Math.max(cov[at] + cov[at + 3] + cov[at + 5], 0))
}

/**
 * How far along a ray (`from` + t·`dir`) a blob is densest: the point of the blob a pixel on that ray shows most of.
 * For a flat blob that is where the ray meets its plane. `cov` is xx, xy, xz, yy, yz, zz. A blob seen edge-on, or a
 * needle, has no such point to speak of and gives the point of the ray nearest its center.
 */
export function densestAlong(from: ArrayLike<number>, dir: ArrayLike<number>, center: ArrayLike<number>, cov: ArrayLike<number>): number {
  const [a, b, c, d, e, f] = [cov[0], cov[1], cov[2], cov[3], cov[4], cov[5]]
  // the adjugate stands in for the inverse (the scale cancels), and is sound for a blob with no thickness
  const A = [d * f - e * e, c * e - b * f, b * e - c * d, a * f - c * c, b * c - a * e, a * d - b * b]
  const mul = (v: ArrayLike<number>) => [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[1] * v[0] + A[3] * v[1] + A[4] * v[2], A[2] * v[0] + A[4] * v[1] + A[5] * v[2]]
  const to = [center[0] - from[0], center[1] - from[1], center[2] - from[2]]
  const Ad = mul(dir)
  const den = dir[0] * Ad[0] + dir[1] * Ad[1] + dir[2] * Ad[2]
  const dd = dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]
  // edge-on or a needle: next to nothing of the adjugate lies along the ray
  if (!(den > 1e-6 * (Math.abs(A[0]) + Math.abs(A[3]) + Math.abs(A[5])) * dd)) return (dir[0] * to[0] + dir[1] * to[1] + dir[2] * to[2]) / Math.max(dd, 1e-30)
  return (to[0] * Ad[0] + to[1] * Ad[1] + to[2] * Ad[2]) / den
}

/**
 * What the edits do to a blob at p: whether it stays, and the paint mixed over its color (linear RGB and amount).
 * `margin` is how far inside a cut it must be to go (0 for a point; clean cuts pass `CLEAN_MARGIN` blob sizes).
 */
export function editAt(edits: readonly ShapeEdit[], p: ArrayLike<number>, margin = 0): { keep: boolean; paint: [number, number, number]; amount: number } {
  let keep = true
  const paint: [number, number, number] = [0, 0, 0]
  let amount = 0
  for (const e of edits.slice(0, MAX_EDITS)) {
    const s = shapeDistance(e, p) * (e.outside ? -1 : 1)
    if (e.op === 'cut') { if (s < -margin) keep = false; continue }
    const soft = Math.max(e.soft ?? 0, 0)
    const w = Math.max(0, Math.min(1, e.amount ?? 1)) * (soft > 0 ? Math.max(0, Math.min(1, -s / soft)) : s < 0 ? 1 : 0)
    if (w <= 0) continue
    // later paint goes over earlier paint
    const c = (e.color ?? [1, 1, 1]).map(srgbToLinear)
    for (let k = 0; k < 3; k++) paint[k] = paint[k] * (1 - w) + c[k] * w
    amount = amount * (1 - w) + w
  }
  // as a color to mix toward: undo the weighting so mix(base, paint, amount) gives the same result
  if (amount > 0) for (let k = 0; k < 3; k++) paint[k] /= amount
  return { keep, paint, amount }
}

/** A copy of still blobs with the edits applied: cut blobs left out, painted ones recolored. */
export function bakeEdits(b: Blobs, edits: readonly ShapeEdit[]): Blobs {
  const out = b.clone()
  const kept = new Uint8Array(b.count)
  for (let i = 0; i < b.count; i++) {
    const e = editAt(edits, b.center.subarray(i * 3, i * 3 + 3))
    kept[i] = e.keep ? 1 : 0
    if (e.amount > 0) for (let k = 0; k < 3; k++) {
      const lin = srgbToLinear(b.color[i * 3 + k])
      out.color[i * 3 + k] = linearToSrgb(lin + (e.paint[k] - lin) * e.amount)
    }
  }
  out.filter((i) => kept[i] === 1)
  return out
}
