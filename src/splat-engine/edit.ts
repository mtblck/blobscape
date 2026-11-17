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
 */

/** One edit for `setEdits`: a sphere or a box in world space that cuts blobs away or paints them. */
export interface ShapeEdit {
  shape: 'sphere' | 'box'
  /** World position of the shape's middle. */
  center: [number, number, number]
  /** A sphere's radius (the first value), or a box's half sizes. */
  size: [number, number, number]
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
  const d = q.map((v, k) => Math.abs(v) - e.size[k])
  const out = Math.hypot(Math.max(d[0], 0), Math.max(d[1], 0), Math.max(d[2], 0))
  return out + Math.min(Math.max(d[0], d[1], d[2]), 0)
}

/** What the edits do to a blob at p: whether it stays, and the paint mixed over its color (linear RGB and amount). */
export function editAt(edits: readonly ShapeEdit[], p: ArrayLike<number>): { keep: boolean; paint: [number, number, number]; amount: number } {
  let keep = true
  const paint: [number, number, number] = [0, 0, 0]
  let amount = 0
  for (const e of edits.slice(0, MAX_EDITS)) {
    const s = shapeDistance(e, p) * (e.outside ? -1 : 1)
    if (e.op === 'cut') { if (s < 0) keep = false; continue }
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
