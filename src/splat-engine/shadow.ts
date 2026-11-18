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
/** How far to the side of itself, in cells, a blob may start its march (half of it each way), so neighbors soften a shadow's edge between them. */
export const SPREAD = 1.6
/** The longest march toward a light at a place, in cells. */
export const MAX_MARCH = 48
/** The longest march toward a light from a direction (a sun), in cells: far enough to cross the grid, so a low sun's long shadows are whole. */
export const SUN_MARCH = 112

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

/**
 * A grid over `lo`–`hi` that holds still from frame to frame: its cells lie on a lattice fixed in the world (corners at
 * whole multiples of the cell), and it keeps the cell size of the grid `before` while the box still fits the budget at
 * that size and has not shrunk to under half of it. So a bird crossing the sky or a swaying tree, which change the
 * bounds every frame, do not move the cells under everything else, and shadows of things that stand still stand still.
 */
export function steadyBox(lo: ArrayLike<number>, hi: ArrayLike<number>, before?: ShadowBox, budget = SHADOW_CELLS): ShadowBox {
  const fit = (cell: number) => {
    const from = [0, 1, 2].map((k) => Math.floor(lo[k] / cell) - 1)
    const dims = [0, 1, 2].map((k) => Math.max(1, Math.floor(hi[k] / cell) + 2 - from[k]))
    return { origin: from.map((f) => f * cell) as [number, number, number], cell, dims: dims as [number, number, number] }
  }
  if (before) {
    const same = fit(before.cell), cells = same.dims[0] * same.dims[1] * same.dims[2]
    if (cells <= budget && cells >= budget / 2.5) return same
  }
  // a new size: a little coarser than the tightest fit, so the bounds can grow a while before it changes again
  let cell = shadowBox(lo, hi, budget).cell * 1.1
  let b = fit(cell)
  while (b.dims[0] * b.dims[1] * b.dims[2] > budget * 0.8) { cell *= 1.03; b = fit(cell) }
  return b
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
 * light, so a lamp's own blobs don't hide it. With `sun`, `light` is the way toward a light from a direction (a unit
 * vector) and the march goes on up to `SUN_MARCH` cells. A march that has left the grid going away from it stops.
 * `density` is how dark what it passes makes it (the world's `shadowDensity`). `spread` moves the start sideways along
 * the surface by up to `SPREAD` cells: the engine gives every blob its own, so a shadow's edge is a soft band.
 */
export function transmittance(
  grid: Uint32Array<ArrayBufferLike>, box: ShadowBox, p: ArrayLike<number>, n: ArrayLike<number>, light: ArrayLike<number>, sun = false, density = SHADOW_DENSITY, spread?: ArrayLike<number>,
): number {
  const { origin: o, cell, dims } = box
  const to = sun ? [light[0], light[1], light[2]] : [light[0] - p[0], light[1] - p[1], light[2] - p[2]]
  const len = Math.hypot(to[0], to[1], to[2])
  if (len < 1e-6) return 1
  const dist = sun ? Infinity : len
  const dir = to.map((v) => v / len)
  const side = n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0 ? -1 : 1
  // `spread`: the blob's own offset (each of three numbers from -0.5 to 0.5), kept to its surface and scaled to `SPREAD` cells
  const along = spread ? spread[0] * n[0] + spread[1] * n[1] + spread[2] * n[2] : 0
  const start = [0, 1, 2].map((k) => p[k] + (n[k] * side + dir[k]) * LIFT * cell + (spread ? (spread[k] - n[k] * along) * SPREAD * cell : 0))
  const steps = Math.floor(Math.min(Math.max((dist - 2.5 * cell) / cell, 0), sun ? SUN_MARCH : MAX_MARCH))
  let acc = 0
  march: for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * cell
    const at = [0, 1, 2].map((k) => start[k] + dir[k] * t)
    const q = at.map((v, k) => Math.floor((v - o[k]) / cell))
    for (let k = 0; k < 3; k++) {
      // out of the grid and heading further out on this axis: it can't come back in
      if ((q[k] < 0 && dir[k] <= 0) || (q[k] >= dims[k] && dir[k] >= 0)) break march
    }
    if (q.some((v, k) => v < 0 || v >= dims[k])) continue
    acc += grid[(q[2] * dims[1] + q[1]) * dims[0] + q[0]] / OCC_SCALE
    if (acc > 6) break
  }
  return Math.exp(-density * acc)
}
