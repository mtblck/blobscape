import type { Blobs } from '../splat-core/blobs.ts'
import type { Skin } from './rig.ts'

/**
 * Skin that stretches. Skinning moves each blob's center by its bones, but a blob's size was only ever turned, so
 * where the skin between two bones is pulled out (a wing's membrane as it opens, the back of a knee) the centers
 * part and the blobs no longer cover the gaps between them.
 *
 * How the skin stretches at a blob is the gradient of where skinning puts a point, and that has two halves: the
 * blend of the bones' own matrices, and how the weights themselves change from one place to the next,
 * Σ (bone k's place for the point) ⊗ ∇wₖ. The second half is the stretch between bones and was missing. Here each
 * blob gets ∇wₖ for its four bones, found from the weights of the blobs next to it, so any skin has it: a sculpted
 * creature, one opened from a file, a model laid with blobs. `skinBlob` and the engine's deform pass add the half
 * it gives.
 */

/** Numbers per blob in what `weightGradients` gives: ∇w (x, y, z) for the second, third and fourth of its bones. */
export const GRAD_STRIDE = 9

/** How far, in a blob's own largest size, another blob may be and still count as next to it. */
const NEAR = 2.3
/** At most this many of the blobs next to one are asked. */
const MOST = 14
/** Fewer than this next to a blob and it is left as it was. */
const LEAST = 3
/** Blobs whose weights differ by more than this in all are not one skin (a jaw beside a head), however close. */
const SAME_SKIN = 1

const cache = new WeakMap<Skin, { centers: Float32Array; count: number; grads: Float32Array | null }>()

/**
 * How each blob's weights change across the skin, from the blobs next to it: for the second, third and fourth of
 * its bones the gradient of that weight in the rest pose (`GRAD_STRIDE` numbers a blob; the first bone's is minus
 * their sum, since the weights always add up to 1). Along the surface only: nothing is known across it. Null when
 * no blob hangs on two bones, so nothing can stretch. `partOf` keeps a blob to neighbors of its own part. The
 * answer is kept for the same skin and blobs.
 */
export function weightGradients(blobs: Blobs, skin: Skin, partOf?: ArrayLike<number>): Float32Array | null {
  const n = blobs.count
  const had = cache.get(skin)
  if (had && had.centers === blobs.center && had.count === n) return had.grads
  const grads = findGradients(blobs, skin, partOf)
  cache.set(skin, { centers: blobs.center, count: n, grads })
  return grads
}

function findGradients(blobs: Blobs, skin: Skin, partOf?: ArrayLike<number>): Float32Array | null {
  const n = blobs.count
  const { joints, weights } = skin
  const c = blobs.center, sc = blobs.scale
  // only a blob on two bones or more can stretch
  const blended: number[] = []
  const sizes: number[] = []
  for (let i = 0; i < n; i++) {
    let on = 0
    for (let k = 0; k < 4; k++) if (weights[i * 4 + k] > 0.004) on++
    if (on < 2) continue
    blended.push(i)
    sizes.push(Math.max(sc[i * 3], sc[i * 3 + 1], sc[i * 3 + 2]))
  }
  if (!blended.length) return null
  // a grid of cells as wide as a typical blended blob's reach, holding every blob
  const sorted = Float64Array.from(sizes).sort()
  const cell = Math.max(1e-9, sorted[sorted.length >> 1] * NEAR)
  let x0 = Infinity, y0 = Infinity, z0 = Infinity
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, c[i * 3]); y0 = Math.min(y0, c[i * 3 + 1]); z0 = Math.min(z0, c[i * 3 + 2])
  }
  // a stray far-off blob must not make the grid huge: cells are hashed, not laid out
  const MASK = (1 << 20) - 1
  const cellOf = (x: number, y: number, z: number) => (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) & MASK) >>> 0
  const at = (v: number, lo: number) => Math.floor((v - lo) / cell)
  const head = new Int32Array(MASK + 1).fill(-1), next = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    const h = cellOf(at(c[i * 3], x0), at(c[i * 3 + 1], y0), at(c[i * 3 + 2], z0))
    next[i] = head[h]; head[h] = i
  }

  const out = new Float32Array(n * GRAD_STRIDE)
  const near = new Int32Array(MOST), far = new Float64Array(MOST)
  const dw = new Float64Array(4), rhs = new Float64Array(12), g = new Float64Array(12)
  for (let b = 0; b < blended.length; b++) {
    const i = blended[b]
    const px = c[i * 3], py = c[i * 3 + 1], pz = c[i * 3 + 2]
    const reach = Math.min(cell, sizes[b] * NEAR), reach2 = reach * reach
    const part = partOf ? partOf[i] : 0
    // the nearest few within reach
    let found = 0
    const cx = at(px, x0), cy = at(py, y0), cz = at(pz, z0)
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iy = cy - 1; iy <= cy + 1; iy++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
      for (let j = head[cellOf(ix, iy, iz)]; j >= 0; j = next[j]) {
        if (j === i || (partOf && partOf[j] !== part)) continue
        const dx = c[j * 3] - px, dy = c[j * 3 + 1] - py, dz = c[j * 3 + 2] - pz
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 > reach2 || d2 === 0) continue
        let s = found
        if (found < MOST) found++
        else if (d2 >= far[MOST - 1]) continue
        else s = MOST - 1
        while (s > 0 && far[s - 1] > d2) { far[s] = far[s - 1]; near[s] = near[s - 1]; s-- }
        far[s] = d2; near[s] = j
      }
    }
    // least squares: the gradient g that best gives each neighbor's weight, w(j) − w(i) ≈ g · (xⱼ − xᵢ)
    let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0
    rhs.fill(0)
    let used = 0
    for (let s = 0; s < found; s++) {
      const j = near[s]
      let apart = 0
      for (let k = 0; k < 4; k++) {
        const wi = weights[i * 4 + k]
        // a slot with no weight holds no bone
        if (!(wi > 0)) { dw[k] = 0; continue }
        const bone = joints[i * 4 + k]
        let wj = 0
        for (let m = 0; m < 4; m++) if (joints[j * 4 + m] === bone) wj += weights[j * 4 + m]
        dw[k] = wj - wi
        apart += Math.abs(dw[k])
      }
      if (apart > SAME_SKIN) continue
      used++
      const dx = c[j * 3] - px, dy = c[j * 3 + 1] - py, dz = c[j * 3 + 2] - pz
      xx += dx * dx; xy += dx * dy; xz += dx * dz; yy += dy * dy; yz += dy * dz; zz += dz * dz
      for (let k = 0; k < 4; k++) { rhs[k * 3] += dx * dw[k]; rhs[k * 3 + 1] += dy * dw[k]; rhs[k * 3 + 2] += dz * dw[k] }
    }
    if (used < LEAST) continue
    // neighbors lie on a surface, so nothing is known across it: a little weight on "no change" settles that way
    const soft = (xx + yy + zz) * 0.02
    xx += soft; yy += soft; zz += soft
    const i00 = yy * zz - yz * yz, i01 = xz * yz - xy * zz, i02 = xy * yz - xz * yy
    const det = xx * i00 + xy * i01 + xz * i02
    if (!(det > 0)) continue
    const i11 = xx * zz - xz * xz, i12 = xy * xz - xx * yz, i22 = xx * yy - xy * xy
    let sx = 0, sy = 0, sz = 0
    for (let k = 0; k < 4; k++) {
      const a = rhs[k * 3], bb = rhs[k * 3 + 1], cc = rhs[k * 3 + 2]
      g[k * 3] = (i00 * a + i01 * bb + i02 * cc) / det
      g[k * 3 + 1] = (i01 * a + i11 * bb + i12 * cc) / det
      g[k * 3 + 2] = (i02 * a + i12 * bb + i22 * cc) / det
      sx += g[k * 3]; sy += g[k * 3 + 1]; sz += g[k * 3 + 2]
    }
    // the four must add up to nothing (the weights add up to 1 everywhere): what a fifth bone next door took is
    // shared out by weight
    for (let k = 1; k < 4; k++) {
      const w = weights[i * 4 + k]
      out[i * GRAD_STRIDE + (k - 1) * 3] = g[k * 3] - w * sx
      out[i * GRAD_STRIDE + (k - 1) * 3 + 1] = g[k * 3 + 1] - w * sy
      out[i * GRAD_STRIDE + (k - 1) * 3 + 2] = g[k * 3 + 2] - w * sz
    }
  }
  return out
}
