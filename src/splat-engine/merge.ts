/**
 * Merged blobs for far ground: a world as big as an island keeps, beside its own blobs, coarser copies of itself on
 * grids two and four times as wide (`mergeLevels`), each blob of a coarser level standing for every blob in its grid
 * cell (their weighted mean and spread: one blob with the same middle and shape, `MERGE_GROW` fuller so neighbors
 * close up as the fine ones did). Where it is projected, a blob is drawn only while its own level is the one whose
 * cells come to about `MERGE_PX` pixels on screen (`levelWeight`), so far ground is drawn with blobs four or sixteen
 * times fewer, which hold its color and shape where thinning the fine ones (lod.ts `FarRule`) left it grainy.
 *
 * The choice is made blob by blob from where each one stands, so a cell and the blobs it stands for decide at almost
 * the same distance (they are a cell apart at most, which is a pixel or two, against a few hundred pixels' worth of
 * distance), and over `MERGE_BAND` the coarser comes in fully before the finer goes, so nothing between them shows
 * through. `levelWeightNode` in engine.ts is the twin of `levelWeight`; change both.
 */
import { Blobs, fromCovariance } from '../splat-core/blobs.ts'
import type { Skin } from './rig.ts'

/** How many coarser levels: cells two and four times the blobs' own. */
export const MERGE_LEVELS = 2

/** A level gives way to the next coarser one where its cells come under this many pixels across on screen. */
export const MERGE_PX = 1.5

/** Over how much of `MERGE_PX` (either side) one level hands over to the next. */
export const MERGE_BAND = 0.25

/**
 * How much wider a merged blob is than the spread of what it stands for (standard deviations): the mean and spread
 * of a cell of touching discs is a blob a third the cell wide, which left the far ground see-through between cells.
 */
export const MERGE_GROW = 1.35

/** The byte a blob carries for its level: 0 for a blob in no level (drawn at every distance), else its level and the coarsest. */
export function levelCode(level: number, top: number): number {
  return 16 | (top << 2) | level
}

const ease = (x: number) => {
  const t = Math.min(1, Math.max(0, (x - MERGE_PX * (1 - MERGE_BAND)) / (2 * MERGE_PX * MERGE_BAND)))
  return t * t * (3 - 2 * t)
}

/**
 * How much of a blob is drawn (0 to 1, opacity) where a cell of the finest level is `px` pixels across on screen
 * (its side over its distance, at the blob), for its `levelCode`: a level shows from where its finer level's cells
 * come under `MERGE_PX` to where its own do, coming in fully over the band before the finer one starts to go.
 */
export function levelWeight(px: number, code: number): number {
  if (code < 16) return 1
  const level = code & 3, top = (code >> 2) & 3
  const into = level > 0 ? Math.min(1, 2 * (1 - ease(px * 2 ** (level - 1)))) : 1
  const out = level < top ? Math.min(1, 2 * ease(px * 2 ** level)) : 1
  return into * out
}

/** An actor's blobs and what rides with each, as `mergeLevels` takes and gives them. */
export interface Mergeable {
  /** The blobs in the rest pose. */
  blobs: Blobs
  /** Which bones move each blob: only a blob wholly on one bone is merged. */
  skin: Skin
  /** Which part each blob belongs to (the engine's `Actor.partOf`). */
  partOf?: ArrayLike<number>
  /** How much of each of the first four lights each blob sees, four bytes a blob (`Actor.seen`). */
  seen?: Uint8Array
  /** How much of its own light each blob gives, a byte a blob (`Actor.glow`). */
  glow?: Uint8Array
}

/**
 * The blobs with coarser levels added after them: on grids of `cell` (the side the blobs were cut on) times 2, 4 …
 * (`levels` of them), cells counted from the origin of the blobs' own frame so a coarse cell holds whole finer ones,
 * one blob a cell and bone from the blobs on that bone alone. A blob on more than one bone, or clear, stays in no
 * level and is drawn at every distance. Each blob counts by its opacity times the area of its two widest axes; a
 * merged blob takes their weighted color, opacity, glow and sight of lamps, the part of the heaviest, and their mean
 * and spread (each blob's own shape plus where it stands), grown by `MERGE_GROW`. `levels` is each blob's `levelCode`.
 */
export function mergeLevels(a: Mergeable, cell: number, levels = MERGE_LEVELS): Mergeable & { levels: Uint8Array } {
  const { blobs, skin } = a
  const n = blobs.count
  const R = new Float64Array(9)
  type Sum = { w: number; c: number[]; m: number[]; col: number[]; op: number; ar: number; glow: number; seen: number[]; part: number; heavy: number; bone: number }
  const sums: Sum[][] = []
  for (let level = 1; level <= levels; level++) {
    const side = cell * 2 ** level
    const cells = new Map<string, Sum>()
    for (let k = 0; k < n; k++) {
      if (skin.weights[k * 4] < 0.999 || !(blobs.opacity[k] > 0)) continue
      const bone = skin.joints[k * 4]
      const x = blobs.center[k * 3], y = blobs.center[k * 3 + 1], z = blobs.center[k * 3 + 2]
      const key = `${bone},${Math.floor(x / side)},${Math.floor(y / side)},${Math.floor(z / side)}`
      let s = cells.get(key)
      if (!s) cells.set(key, (s = { w: 0, c: [0, 0, 0], m: [0, 0, 0, 0, 0, 0], col: [0, 0, 0], op: 0, ar: 0, glow: 0, seen: [0, 0, 0, 0], part: 0, heavy: -1, bone }))
      const sx = blobs.scale[k * 3], sy = blobs.scale[k * 3 + 1], sz = blobs.scale[k * 3 + 2]
      const area = (sx * sy * sz) / Math.min(sx, sy, sz)
      const w = blobs.opacity[k] * area
      if (!(w > 0)) continue
      // the blob's own covariance, R S² Rᵀ
      const [qx, qy, qz, qw] = blobs.quat.subarray(k * 4, k * 4 + 4)
      R[0] = 1 - 2 * (qy * qy + qz * qz); R[1] = 2 * (qx * qy - qz * qw); R[2] = 2 * (qx * qz + qy * qw)
      R[3] = 2 * (qx * qy + qz * qw); R[4] = 1 - 2 * (qx * qx + qz * qz); R[5] = 2 * (qy * qz - qx * qw)
      R[6] = 2 * (qx * qz - qy * qw); R[7] = 2 * (qy * qz + qx * qw); R[8] = 1 - 2 * (qx * qx + qy * qy)
      const s2 = [sx * sx, sy * sy, sz * sz]
      const cov = (r: number, c: number) => R[r * 3] * R[c * 3] * s2[0] + R[r * 3 + 1] * R[c * 3 + 1] * s2[1] + R[r * 3 + 2] * R[c * 3 + 2] * s2[2]
      s.w += w
      s.c[0] += w * x; s.c[1] += w * y; s.c[2] += w * z
      s.m[0] += w * (cov(0, 0) + x * x); s.m[1] += w * (cov(0, 1) + x * y); s.m[2] += w * (cov(0, 2) + x * z)
      s.m[3] += w * (cov(1, 1) + y * y); s.m[4] += w * (cov(1, 2) + y * z); s.m[5] += w * (cov(2, 2) + z * z)
      for (let j = 0; j < 3; j++) s.col[j] += area * blobs.opacity[k] * blobs.color[k * 3 + j]
      s.op += area * blobs.opacity[k]
      s.ar += area
      if (a.glow) s.glow += w * a.glow[k]
      if (a.seen) for (let j = 0; j < 4; j++) s.seen[j] += w * a.seen[k * 4 + j]
      if (w > s.heavy) { s.heavy = w; s.part = a.partOf?.[k] ?? 0 }
    }
    sums.push([...cells.values()].filter((s) => s.w > 0))
  }
  const added = sums.reduce((t, s) => t + s.length, 0)
  const out = blobs.clone()
  const joints = new Uint8Array((n + added) * 4), weights = new Float32Array((n + added) * 4)
  joints.set(skin.joints.subarray(0, n * 4)); weights.set(skin.weights.subarray(0, n * 4))
  const partOf = new Uint16Array(n + added)
  for (let k = 0; k < n; k++) partOf[k] = a.partOf?.[k] ?? 0
  const glow = a.glow ? new Uint8Array(n + added) : undefined
  if (glow) glow.set(a.glow!.subarray(0, n))
  const seen = a.seen ? new Uint8Array((n + added) * 4) : undefined
  if (seen) seen.set(a.seen!.subarray(0, n * 4))
  const codes = new Uint8Array(n + added)
  for (let k = 0; k < n; k++) codes[k] = skin.weights[k * 4] >= 0.999 && blobs.opacity[k] > 0 ? levelCode(0, levels) : 0
  const grow = MERGE_GROW * MERGE_GROW
  let i = n
  sums.forEach((level, l) => {
    for (const s of level) {
      const c = s.c.map((v) => v / s.w)
      const m = s.m.map((v) => v / s.w)
      const cov = [m[0] - c[0] * c[0], m[1] - c[0] * c[1], m[2] - c[0] * c[2], m[3] - c[1] * c[1], m[4] - c[1] * c[2], m[5] - c[2] * c[2]].map((v) => v * grow)
      const { scale, quat } = fromCovariance(cov)
      out.push({
        center: [c[0], c[1], c[2]],
        scale: [Math.max(scale[0], 1e-6), Math.max(scale[1], 1e-6), Math.max(scale[2], 1e-6)],
        quat,
        color: [s.col[0] / s.op, s.col[1] / s.op, s.col[2] / s.op],
        opacity: Math.min(1, s.op / s.ar),
      })
      joints[i * 4] = s.bone; weights[i * 4] = 1
      partOf[i] = s.part
      if (glow) glow[i] = Math.round(s.glow / s.w)
      if (seen) for (let j = 0; j < 4; j++) seen[i * 4 + j] = Math.round(s.seen[j] / s.w)
      codes[i] = levelCode(l + 1, levels)
      i++
    }
  })
  return { blobs: out, skin: { joints, weights }, partOf, glow, seen, levels: codes }
}
