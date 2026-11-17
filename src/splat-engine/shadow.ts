/**
 * Shadows from live lights. Each frame the blobs are dropped into a coarse grid
 * of how much they block (`occupancy`), and a lit blob marches from itself to
 * each light that casts shadows, adding up what it passes (`transmittance`).
 * Soft by nature: a cell is a few blobs wide, so edges blur over a cell or two.
 *
 * The GPU does both in engine.ts (`makeShadowClear`, `makeShadowScatter`, and
 * the march in `lit`); this is its CPU twin, used by the WebGL backend (which
 * has no compute) and by the tests. Change one, change both.
 */

/** How many cells the grid has at most: its cells are cubes, as many a side as the world's box takes. */
export const SHADOW_CELLS = 64 ** 3
/** Occupancy is stored in whole units of 1/OCC_SCALE, so the GPU can add it up with integer atomics. */
export const OCC_SCALE = 64
/** How dark a cell's occupancy makes the light through it: light × e^(−SHADOW_DENSITY × occupancy passed). */
export const SHADOW_DENSITY = 1.5
/** How far out a blob blocks light, in standard deviations: its solid core, not its faint edge. */
export const REACH = 1.5
/** How far the march starts off the surface and toward the light, in cells, so a surface doesn't shadow itself. */
export const LIFT = 1.5
/** The longest march, in cells. */
export const MAX_MARCH = 48

/** The grid's place: its lowest corner, the side of one cell, and how many cells it has each way. */
export interface ShadowBox { origin: [number, number, number]; cell: number; dims: [number, number, number] }

/** A grid of cube cells over the box `lo`–`hi` (a little past it), with at most `budget` cells. */
export function shadowBox(lo: ArrayLike<number>, hi: ArrayLike<number>, budget = SHADOW_CELLS): ShadowBox {
  const ext = [0, 1, 2].map((k) => Math.max(hi[k] - lo[k], 0) * 1.02 + 0.02)
  let cell = Math.cbrt((ext[0] * ext[1] * ext[2]) / budget)
  let dims = ext.map((e) => Math.max(1, Math.ceil(e / cell)))
  while (dims[0] * dims[1] * dims[2] > budget) {
    cell *= 1.02
    dims = ext.map((e) => Math.max(1, Math.ceil(e / cell)))
  }
  const origin = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2 - (dims[k] * cell) / 2) as [number, number, number]
  return { origin, cell, dims: dims as [number, number, number] }
}

/** A blob's reach for blocking light, from its covariance [xx, xy, xz, yy, yz, zz]: about its longest standard deviation. */
export function blobSigma(cov: ArrayLike<number>, at = 0): number {
  return Math.sqrt(Math.max(cov[at], cov[at + 3], cov[at + 5], 0))
}

/**
 * How much each cell blocks: every blob adds its opacity, times how much of a cell's face it covers, to each cell its
 * core (`REACH` σ) touches (its own cell and at most the next one each way). Centers have `stride` floats each.
 */
export function occupancy(
  centers: ArrayLike<number>, stride: number, sigma: ArrayLike<number>, opacity: ArrayLike<number>, count: number,
  box: ShadowBox, out: Uint32Array<ArrayBufferLike> = new Uint32Array(box.dims[0] * box.dims[1] * box.dims[2]),
): Uint32Array<ArrayBufferLike> {
  out.fill(0)
  const { origin: o, cell, dims: [nx, ny, nz] } = box
  for (let i = 0; i < count; i++) {
    const s = sigma[i], a = opacity[i]
    if (!(s > 0) || !(a > 0)) continue
    const p = [centers[i * stride], centers[i * stride + 1], centers[i * stride + 2]]
    const reach = REACH * s
    const add = Math.round(a * Math.min(1, (reach / cell) ** 2) * OCC_SCALE)
    if (add <= 0) continue
    const c = p.map((v, k) => Math.floor((v - o[k]) / cell))
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = c[0] + dx, y = c[1] + dy, z = c[2] + dz
      if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue
      // nearest point of the cell to the blob's center
      let d2 = 0
      const q = [x, y, z]
      for (let k = 0; k < 3; k++) {
        const lo = o[k] + q[k] * cell, hi = lo + cell
        const e = p[k] < lo ? lo - p[k] : p[k] > hi ? p[k] - hi : 0
        d2 += e * e
      }
      if (d2 <= reach * reach) out[(z * ny + y) * nx + x] += add
    }
  }
  return out
}

/**
 * The share of a light that reaches a blob at `p` (normal `n`, either sign) from a light at `light`: the march starts
 * `LIFT` cells off the surface on the light's side and as far toward it, so a blob doesn't shadow itself, and stops short of the
 * light, so a lamp's own blobs don't hide it.
 */
export function transmittance(
  grid: Uint32Array<ArrayBufferLike>, box: ShadowBox, p: ArrayLike<number>, n: ArrayLike<number>, light: ArrayLike<number>,
): number {
  const { origin: o, cell, dims: [nx, ny, nz] } = box
  const to = [light[0] - p[0], light[1] - p[1], light[2] - p[2]]
  const dist = Math.hypot(to[0], to[1], to[2])
  if (dist < 1e-6) return 1
  const dir = to.map((v) => v / dist)
  const side = n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0 ? -1 : 1
  const start = [0, 1, 2].map((k) => p[k] + (n[k] * side + dir[k]) * LIFT * cell)
  const steps = Math.floor(Math.min(Math.max((dist - 2.5 * cell) / cell, 0), MAX_MARCH))
  let acc = 0
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * cell
    const x = Math.floor((start[0] + dir[0] * t - o[0]) / cell)
    const y = Math.floor((start[1] + dir[1] * t - o[1]) / cell)
    const z = Math.floor((start[2] + dir[2] * t - o[2]) / cell)
    if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue
    acc += grid[(z * ny + y) * nx + x] / OCC_SCALE
    if (acc > 6) break
  }
  return Math.exp(-SHADOW_DENSITY * acc)
}
