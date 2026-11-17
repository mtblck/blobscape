import type { Vec3 } from '../splat-core/blobs.ts'
import type { Shape } from './voxel.ts'

/**
 * A triangle mesh as a shape the voxel builder can cut (issue #164). The signed distance is worked out once on a grid
 * a little finer than the cut and read back by trilinear blending: exact distance to the nearest triangle in a band
 * round the surface, inside or outside from the crossings of a ray along x through each row (so a mesh needs to be
 * closed, as most models are), and the band's edge beyond. Each grid point near the surface also keeps its nearest
 * triangle, so colors can be read off the mesh where a cell lands (`meshColor`).
 */

export interface Mesh {
  /** x, y, z per vertex. */
  positions: Float32Array
  /** Three vertex indices per triangle. */
  indices: Uint32Array
  /** r, g, b (0–1, sRGB) per vertex, if it has them. */
  colors?: Float32Array
  /** u, v per vertex, if it has them (for `textures`). */
  uvs?: Float32Array
  /** Per triangle, which of `textures` paints it (-1 none), when some are textured. */
  tex?: Int16Array
}

export interface MeshShape extends Shape {
  /** The nearest triangle to a point, or -1 far from the surface. */
  nearest: (x: number, y: number, z: number) => number
}

/** How many cells of the distance grid the exact band reaches out from the surface. */
const BAND = 3

function triDistance2(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  // closest point on a triangle (Ericson, Real-Time Collision Detection 5.1.5)
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]
  const dot = (u: number[], v: number[]) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
  const d1 = dot(ab, ap), d2 = dot(ac, ap)
  const at = (q: number[]) => (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2
  if (d1 <= 0 && d2 <= 0) return at(a)
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]], d3 = dot(ab, bp), d4 = dot(ac, bp)
  if (d3 >= 0 && d4 <= d3) return at(b)
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return at([a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]) }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], d5 = dot(ab, cp), d6 = dot(ac, cp)
  if (d6 >= 0 && d5 <= d6) return at(c)
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return at([a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]) }
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return at([b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]) }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den
  return at([a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w])
}

/** The mesh's box. */
export function meshBounds(m: Mesh): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], m.positions[i + k]); max[k] = Math.max(max[k], m.positions[i + k]) }
  return { min, max }
}

/** The mesh moved and scaled so its longest side is `size`, standing on y = 0, centered on x and z. */
export function fitMesh(m: Mesh, size: number): Mesh {
  const { min, max } = meshBounds(m)
  const k = size / Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1e-9)
  const mid = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2]
  const positions = new Float32Array(m.positions.length)
  for (let i = 0; i < positions.length; i += 3) for (let j = 0; j < 3; j++) positions[i + j] = (m.positions[i + j] - mid[j]) * k
  return { ...m, positions }
}

/** The mesh as a shape, its distance found on a grid `cell` apart. */
export function meshShape(m: Mesh, cell: number): MeshShape {
  const { min: lo, max: hi } = meshBounds(m)
  const pad = cell * (BAND + 1)
  const o: Vec3 = [lo[0] - pad, lo[1] - pad, lo[2] - pad]
  const n = [0, 1, 2].map((k) => Math.max(2, Math.ceil((hi[k] - lo[k] + 2 * pad) / cell) + 1))
  const [nx, ny, nz] = n
  const idx = (i: number, j: number, k: number) => (k * ny + j) * nx + i
  const far = cell * BAND
  const dist = new Float32Array(nx * ny * nz).fill(far)
  const near = new Int32Array(nx * ny * nz).fill(-1)
  const P = m.positions, I = m.indices, tris = I.length / 3
  const vtx = (v: number): Vec3 => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]
  // exact distance in a band round each triangle
  for (let t = 0; t < tris; t++) {
    const a = vtx(I[t * 3]), b = vtx(I[t * 3 + 1]), c = vtx(I[t * 3 + 2])
    const from = [0, 1, 2].map((k) => Math.max(0, Math.floor((Math.min(a[k], b[k], c[k]) - far - o[k]) / cell)))
    const to = [0, 1, 2].map((k) => Math.min(n[k] - 1, Math.ceil((Math.max(a[k], b[k], c[k]) + far - o[k]) / cell)))
    for (let k = from[2]; k <= to[2]; k++) for (let j = from[1]; j <= to[1]; j++) for (let i = from[0]; i <= to[0]; i++) {
      const d = Math.sqrt(triDistance2([o[0] + i * cell, o[1] + j * cell, o[2] + k * cell], a, b, c))
      const g = idx(i, j, k)
      if (d < dist[g]) { dist[g] = d; near[g] = t }
    }
  }
  // inside or out: a ray along +x through each row, flipping at every crossing
  const rows: number[][] = Array.from({ length: ny * nz }, () => [])
  for (let t = 0; t < tris; t++) {
    const a = vtx(I[t * 3]), b = vtx(I[t * 3 + 1]), c = vtx(I[t * 3 + 2])
    const j0 = Math.max(0, -1 + Math.ceil((Math.min(a[1], b[1], c[1]) - o[1]) / cell)), j1 = Math.min(ny - 1, 1 + Math.floor((Math.max(a[1], b[1], c[1]) - o[1]) / cell))
    const k0 = Math.max(0, -1 + Math.ceil((Math.min(a[2], b[2], c[2]) - o[2]) / cell)), k1 = Math.min(nz - 1, 1 + Math.floor((Math.max(a[2], b[2], c[2]) - o[2]) / cell))
    // a row a cell either side too: the nudge can carry a row just inside a triangle whose corner sits on the grid
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) {
      // nudged off the grid so a ray never runs exactly along an edge or through a vertex
      const y = o[1] + j * cell + cell * 1e-4, z = o[2] + k * cell + cell * 1.3e-4
      // the triangle in y-z: barycentric weights of (y, z)
      const den = (b[1] - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (b[2] - a[2])
      if (Math.abs(den) < 1e-18) continue
      const u = ((y - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (z - a[2])) / den
      const v = ((b[1] - a[1]) * (z - a[2]) - (y - a[1]) * (b[2] - a[2])) / den
      if (u < 0 || v < 0 || u + v > 1) continue
      rows[k * ny + j].push(a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v)
    }
  }
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
    const xs = rows[k * ny + j].sort((p, q) => p - q)
    let inside = false, c = 0
    for (let i = 0; i < nx; i++) {
      const x = o[0] + i * cell
      while (c < xs.length && xs[c] < x) { inside = !inside; c++ }
      if (inside) dist[idx(i, j, k)] = -dist[idx(i, j, k)]
    }
  }
  const sample = (x: number, y: number, z: number) => {
    const fx = (x - o[0]) / cell, fy = (y - o[1]) / cell, fz = (z - o[2]) / cell
    const i = Math.min(nx - 2, Math.max(0, Math.floor(fx))), j = Math.min(ny - 2, Math.max(0, Math.floor(fy))), k = Math.min(nz - 2, Math.max(0, Math.floor(fz)))
    const u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fy - j)), w = Math.min(1, Math.max(0, fz - k))
    const g = (a: number, b: number, c: number) => dist[idx(i + a, j + b, k + c)]
    const x00 = g(0, 0, 0) + (g(1, 0, 0) - g(0, 0, 0)) * u, x10 = g(0, 1, 0) + (g(1, 1, 0) - g(0, 1, 0)) * u
    const x01 = g(0, 0, 1) + (g(1, 0, 1) - g(0, 0, 1)) * u, x11 = g(0, 1, 1) + (g(1, 1, 1) - g(0, 1, 1)) * u
    const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v
    return y0 + (y1 - y0) * w
  }
  const gmin: Vec3 = [o[0], o[1], o[2]], gmax: Vec3 = [o[0] + (nx - 1) * cell, o[1] + (ny - 1) * cell, o[2] + (nz - 1) * cell]
  return {
    min: [lo[0] - cell, lo[1] - cell, lo[2] - cell],
    max: [hi[0] + cell, hi[1] + cell, hi[2] + cell],
    sdf(x, y, z) {
      // outside the grid: at least the way to it, plus what its edge says
      const ox = Math.max(gmin[0] - x, 0, x - gmax[0]), oy = Math.max(gmin[1] - y, 0, y - gmax[1]), oz = Math.max(gmin[2] - z, 0, z - gmax[2])
      const out = Math.hypot(ox, oy, oz)
      return out > 0 ? out + far : sample(x, y, z)
    },
    nearest(x, y, z) {
      const i = Math.round((x - o[0]) / cell), j = Math.round((y - o[1]) / cell), k = Math.round((z - o[2]) / cell)
      if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return -1
      return near[idx(i, j, k)]
    },
  }
}

/** Reads a texture: r, g, b (0–1) at u, v. */
export type Texture = (u: number, v: number) => Vec3

/**
 * The mesh's color where a point lands: its nearest triangle's vertex colors, times its texture at the blended uv
 * when it has one, and `base` where the mesh says nothing.
 */
export function meshColor(m: Mesh, shape: MeshShape, base: Vec3 = [0.8, 0.8, 0.8], textures: Texture[] = []): (p: Vec3) => Vec3 {
  const P = m.positions, I = m.indices
  return (p) => {
    const t = shape.nearest(p[0], p[1], p[2])
    const texture = m.tex && m.uvs && t >= 0 ? textures[m.tex[t]] : undefined
    if (t < 0 || (!m.colors && !texture)) return base
    const [ia, ib, ic] = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]]
    // barycentric weights of the point's projection onto the triangle
    const a = [P[ia * 3], P[ia * 3 + 1], P[ia * 3 + 2]], b = [P[ib * 3], P[ib * 3 + 1], P[ib * 3 + 2]], c = [P[ic * 3], P[ic * 3 + 1], P[ic * 3 + 2]]
    const v0 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v2 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]
    const dot = (u: number[], v: number[]) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
    const d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1), d20 = dot(v2, v0), d21 = dot(v2, v1)
    const den = d00 * d11 - d01 * d01 || 1
    let wb = (d11 * d20 - d01 * d21) / den, wc = (d00 * d21 - d01 * d20) / den
    wb = Math.min(1, Math.max(0, wb)); wc = Math.min(1 - wb, Math.max(0, wc))
    const wa = 1 - wb - wc
    const C = m.colors
    const c3: Vec3 = C ? [0, 1, 2].map((k) => C[ia * 3 + k] * wa + C[ib * 3 + k] * wb + C[ic * 3 + k] * wc) as Vec3 : [1, 1, 1]
    if (!texture) return c3
    const U = m.uvs!
    const tc = texture(U[ia * 2] * wa + U[ib * 2] * wb + U[ic * 2] * wc, U[ia * 2 + 1] * wa + U[ib * 2 + 1] * wb + U[ic * 2 + 1] * wc)
    return [c3[0] * tc[0], c3[1] * tc[1], c3[2] * tc[2]]
  }
}
