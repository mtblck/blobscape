import type { Blobs } from '../splat-core/blobs.ts'
import type { Skin } from './rig.ts'

/**
 * Blobs to a solid, skinned triangle mesh: the simple route from the roadmap.
 *
 * 1. Spread every blob's opacity over a grid of points (its density).
 * 2. Mark the points where blobs are dense enough (`level`): for a capture or
 *    our creatures that is a thin shell, since the blobs lie on the surface.
 * 3. Flood-fill the outside from the grid's edge; whatever the flood can't
 *    reach is the inside, so the shell becomes a solid.
 * 4. Soften the solid a little and wrap a surface round it (surface nets: one
 *    vertex per grid cell the surface passes through, joined into quads).
 * 5. Give each vertex the colour of the blobs nearest it, and the skin weights
 *    of the blob that counts most there, so the mesh walks with the same bones.
 *
 * A finer grid keeps thinner parts (ears, a tail tip); a higher level keeps
 * only where blobs are thick on the ground, so thin parts break off first.
 */
export interface MeshOptions {
  /** Grid cells along the longest side. */
  cells: number
  /** How dense blobs must be to count as surface; about 1 is a closed shell. */
  level: number
}

export interface SplatMesh {
  positions: Float32Array
  normals: Float32Array
  /** 0–1 per channel, display (sRGB) colour like the blobs'. */
  colours: Float32Array
  indices: Uint32Array
  joints: Uint8Array
  weights: Float32Array
  vertexCount: number
  triangleCount: number
  /** Separate pieces with more than a few triangles. */
  pieces: number
  /** Highest point of the mesh (y), for checking whether thin parts on top survived. */
  top: number
}

/**
 * How much of the shell's half-thickness to pull the surface back by. All of
 * it puts the surface through the blobs on a body, but eats thin legs and ears
 * on a coarse grid; none leaves the mesh a few centimetres fat everywhere.
 */
const PULL_BACK = 0.45

export function blobsToMesh(blobs: Blobs, skin: Skin | null, o: MeshOptions): SplatMesh {
  const n = blobs.count
  const c = blobs.centre, s = blobs.scale
  // bounds, padded by the widest blob and two cells
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  let widest = 0
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], c[i * 3 + k]); hi[k] = Math.max(hi[k], c[i * 3 + k]) }
    widest = Math.max(widest, s[i * 3], s[i * 3 + 1], s[i * 3 + 2])
  }
  if (!n) return empty()
  const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 1e-3)
  const h = span / Math.max(4, o.cells)
  const pad = Math.max(widest * 2.5, h) + h * 2
  for (let k = 0; k < 3; k++) { lo[k] -= pad; hi[k] += pad }
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1
  const N = nx * ny * nz
  const at = (x: number, y: number, z: number) => x + nx * (y + ny * z)

  // 1. density, colour sums and the strongest blob at each point
  const dens = new Float32Array(N)
  const col = new Float32Array(N * 3)
  const best = new Float32Array(N)
  const bestBlob = new Int32Array(N).fill(-1)
  for (let i = 0; i < n; i++) {
    const own = Math.max(s[i * 3], s[i * 3 + 1], s[i * 3 + 2], 1e-6)
    const sig = Math.max(own, h * 0.6)
    // the same total amount whatever the grid: a wider spread is a fainter one
    const amp = blobs.opacity[i] * (own * own) / (sig * sig)
    const r = Math.ceil((2.5 * sig) / h)
    const gx = Math.round((c[i * 3] - lo[0]) / h), gy = Math.round((c[i * 3 + 1] - lo[1]) / h), gz = Math.round((c[i * 3 + 2] - lo[2]) / h)
    const inv = 1 / (2 * sig * sig)
    for (let z = Math.max(0, gz - r); z <= Math.min(nz - 1, gz + r); z++) {
      const dz = lo[2] + z * h - c[i * 3 + 2]
      for (let y = Math.max(0, gy - r); y <= Math.min(ny - 1, gy + r); y++) {
        const dy = lo[1] + y * h - c[i * 3 + 1]
        for (let x = Math.max(0, gx - r); x <= Math.min(nx - 1, gx + r); x++) {
          const dx = lo[0] + x * h - c[i * 3]
          const w = amp * Math.exp(-(dx * dx + dy * dy + dz * dz) * inv)
          if (w < 1e-5) continue
          const g = at(x, y, z)
          dens[g] += w
          col[g * 3] += w * blobs.colour[i * 3]; col[g * 3 + 1] += w * blobs.colour[i * 3 + 1]; col[g * 3 + 2] += w * blobs.colour[i * 3 + 2]
          if (w > best[g]) { best[g] = w; bestBlob[g] = i }
        }
      }
    }
  }
  // density on a surface of blobs that just cover it is about 2 × opacity, so level 1 is a quarter of that
  const level = o.level * 0.5

  // 2–3. outside = reachable from the edge without crossing the shell
  const outside = new Uint8Array(N)
  const queue = new Int32Array(N)
  let qh = 0, qt = 0
  const seed = (g: number) => { if (!outside[g] && dens[g] < level) { outside[g] = 1; queue[qt++] = g } }
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    if (x === 0 || y === 0 || z === 0 || x === nx - 1 || y === ny - 1 || z === nz - 1) seed(at(x, y, z))
  }
  while (qh < qt) {
    const g = queue[qh++]
    const x = g % nx, y = Math.floor(g / nx) % ny, z = Math.floor(g / (nx * ny))
    if (x > 0) seed(g - 1)
    if (x < nx - 1) seed(g + 1)
    if (y > 0) seed(g - nx)
    if (y < ny - 1) seed(g + nx)
    if (z > 0) seed(g - nx * ny)
    if (z < nz - 1) seed(g + nx * ny)
  }

  // 4. The solid now runs to the outer edge of the shell, which sits a little
  // outside the blobs. Pull the surface back to the middle of the shell: a
  // signed distance to the boundary (positive inside), less the shell's
  // half-thickness. A blob sheet's density falls off like its blobs, so its
  // half-thickness is σ·√(2 ln(peak / level)).
  const dIn = chamfer(outside, 1, nx, ny, nz, h)
  const dOut = chamfer(outside, 0, nx, ny, nz, h)
  const peaks: number[] = []
  let sigSum = 0
  const every = Math.max(1, Math.floor(n / 2000))
  for (let i = 0; i < n; i += every) {
    const gx = Math.round((c[i * 3] - lo[0]) / h), gy = Math.round((c[i * 3 + 1] - lo[1]) / h), gz = Math.round((c[i * 3 + 2] - lo[2]) / h)
    peaks.push(dens[at(gx, gy, gz)])
    sigSum += Math.max(s[i * 3], s[i * 3 + 1], s[i * 3 + 2], h * 0.6)
  }
  peaks.sort((x, y) => x - y)
  const peak = peaks[peaks.length >> 1] ?? level
  const half = PULL_BACK * Math.min(1.5 * h, (sigSum / peaks.length) * Math.sqrt(2 * Math.log(Math.max(1, peak / level))))
  let f = new Float32Array(N)
  for (let g = 0; g < N; g++) f[g] = (outside[g] ? -(dOut[g] - h / 2) : dIn[g] - h / 2) - half
  // smoothed once each way, so the surface isn't blocky
  let tmp = new Float32Array(N)
  for (const step of [1, nx, nx * ny]) {
    const lim = step === 1 ? nx : step === nx ? ny : nz
    for (let g = 0; g < N; g++) {
      const p = step === 1 ? g % nx : step === nx ? Math.floor(g / nx) % ny : Math.floor(g / (nx * ny))
      const a = p > 0 ? f[g - step] : f[g], b = p < lim - 1 ? f[g + step] : f[g]
      tmp[g] = 0.25 * a + 0.5 * f[g] + 0.25 * b
    }
    const t = f; f = tmp; tmp = t
  }
  const ISO = 0

  // surface nets: a vertex in each cell whose corners straddle ISO
  const cellIndex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1)
  const cellAt = (x: number, y: number, z: number) => x + (nx - 1) * (y + (ny - 1) * z)
  const pos: number[] = []
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]]
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]
  const v = new Float32Array(8)
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    let inside = 0
    for (let k = 0; k < 8; k++) { v[k] = f[at(x + corner[k][0], y + corner[k][1], z + corner[k][2])]; if (v[k] > ISO) inside++ }
    if (inside === 0 || inside === 8) continue
    let sx = 0, sy = 0, sz = 0, m = 0
    for (const [a, b] of edges) {
      if ((v[a] > ISO) === (v[b] > ISO)) continue
      const t = (ISO - v[a]) / (v[b] - v[a])
      sx += corner[a][0] + (corner[b][0] - corner[a][0]) * t
      sy += corner[a][1] + (corner[b][1] - corner[a][1]) * t
      sz += corner[a][2] + (corner[b][2] - corner[a][2]) * t
      m++
    }
    cellIndex[cellAt(x, y, z)] = pos.length / 3
    pos.push(lo[0] + (x + sx / m) * h, lo[1] + (y + sy / m) * h, lo[2] + (z + sz / m) * h)
  }

  // a quad across every grid edge the surface crosses, joining the four cells round it
  const idx: number[] = []
  const quad = (a: number, b: number, cc: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || cc < 0 || d < 0) return
    // wound so the front faces out of the solid
    if (flip) idx.push(a, b, cc, a, cc, d)
    else idx.push(a, cc, b, a, d, cc)
  }
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const here = f[at(x, y, z)] > ISO
    // edge along +x
    if (x < nx - 1 && here !== f[at(x + 1, y, z)] > ISO) {
      quad(cellIndex[cellAt(x, y - 1, z - 1)], cellIndex[cellAt(x, y, z - 1)], cellIndex[cellAt(x, y, z)], cellIndex[cellAt(x, y - 1, z)], here)
    }
    if (y < ny - 1 && here !== f[at(x, y + 1, z)] > ISO) {
      quad(cellIndex[cellAt(x - 1, y, z - 1)], cellIndex[cellAt(x - 1, y, z)], cellIndex[cellAt(x, y, z)], cellIndex[cellAt(x, y, z - 1)], here)
    }
    if (z < nz - 1 && here !== f[at(x, y, z + 1)] > ISO) {
      quad(cellIndex[cellAt(x - 1, y - 1, z)], cellIndex[cellAt(x, y - 1, z)], cellIndex[cellAt(x, y, z)], cellIndex[cellAt(x - 1, y, z)], here)
    }
  }

  const vc = pos.length / 3
  const positions = Float32Array.from(pos)
  const indices = Uint32Array.from(idx)
  const normals = new Float32Array(vc * 3)
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, d = indices[t + 2] * 3
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2]
    const wx = positions[d] - positions[a], wy = positions[d + 1] - positions[a + 1], wz = positions[d + 2] - positions[a + 2]
    const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx
    for (const p of [a, b, d]) { normals[p] += cx; normals[p + 1] += cy; normals[p + 2] += cz }
  }
  for (let i = 0; i < vc; i++) {
    const l = Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]) || 1
    normals[i * 3] /= l; normals[i * 3 + 1] /= l; normals[i * 3 + 2] /= l
  }

  // 5. colour and skin from the nearest blobs, looking further out until some are found
  const colours = new Float32Array(vc * 3)
  const joints = new Uint8Array(vc * 4)
  const weights = new Float32Array(vc * 4)
  const boneSum = new Map<number, number>()
  let top = -Infinity
  for (let i = 0; i < vc; i++) {
    top = Math.max(top, positions[i * 3 + 1])
    const gx = Math.round((positions[i * 3] - lo[0]) / h), gy = Math.round((positions[i * 3 + 1] - lo[1]) / h), gz = Math.round((positions[i * 3 + 2] - lo[2]) / h)
    let wsum = 0, r0 = 0, g0 = 0, b0 = 0
    boneSum.clear()
    for (let r = 1; r <= 4 && wsum < 1e-4; r++) {
      for (let z = Math.max(0, gz - r); z <= Math.min(nz - 1, gz + r); z++) for (let y = Math.max(0, gy - r); y <= Math.min(ny - 1, gy + r); y++) for (let x = Math.max(0, gx - r); x <= Math.min(nx - 1, gx + r); x++) {
        const g = at(x, y, z)
        const w = dens[g]
        if (w <= 0) continue
        wsum += w; r0 += col[g * 3]; g0 += col[g * 3 + 1]; b0 += col[g * 3 + 2]
        const bi = bestBlob[g]
        if (skin && bi >= 0) for (let k = 0; k < 4; k++) {
          const bw = skin.weights[bi * 4 + k]
          if (bw > 0) boneSum.set(skin.joints[bi * 4 + k], (boneSum.get(skin.joints[bi * 4 + k]) ?? 0) + bw * best[g])
        }
      }
    }
    if (wsum > 0) { colours[i * 3] = r0 / wsum; colours[i * 3 + 1] = g0 / wsum; colours[i * 3 + 2] = b0 / wsum }
    else colours.fill(0.5, i * 3, i * 3 + 3)
    const top4 = [...boneSum].sort((a, b) => b[1] - a[1]).slice(0, 4)
    const tw = top4.reduce((a, p) => a + p[1], 0)
    if (!top4.length || !(tw > 0)) { weights[i * 4] = 1; continue }
    top4.forEach(([j, w], k) => { joints[i * 4 + k] = j; weights[i * 4 + k] = w / tw })
  }

  return { positions, normals, colours, indices, joints, weights, vertexCount: vc, triangleCount: indices.length / 3, pieces: countPieces(vc, indices), top: vc ? top : 0 }
}

/**
 * Distance from each grid point to the nearest point where `mask` is
 * `target`, in world units (0 at those points), by a two-pass chamfer over the
 * 26 neighbours: close to true distance, and fast.
 */
function chamfer(mask: Uint8Array, target: number, nx: number, ny: number, nz: number, h: number) {
  const N = nx * ny * nz
  const d = new Float32Array(N)
  for (let g = 0; g < N; g++) d[g] = mask[g] === target ? 0 : 1e9
  const offs: [number, number, number, number][] = []
  for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    // the neighbours already visited when scanning forwards
    if (z < 0 || (z === 0 && (y < 0 || (y === 0 && x < 0)))) offs.push([x, y, z, Math.hypot(x, y, z) * h])
  }
  const pass = (dir: 1 | -1) => {
    for (let k = 0; k < N; k++) {
      const g = dir === 1 ? k : N - 1 - k
      if (d[g] === 0) continue
      const x = g % nx, y = Math.floor(g / nx) % ny, z = Math.floor(g / (nx * ny))
      let best = d[g]
      for (const [ox, oy, oz, w] of offs) {
        const X = x + ox * dir, Y = y + oy * dir, Z = z + oz * dir
        if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue
        const v = d[X + nx * (Y + ny * Z)] + w
        if (v < best) best = v
      }
      d[g] = best
    }
  }
  pass(1)
  pass(-1)
  return d
}

/** Connected pieces of a triangle mesh, ignoring specks of eight triangles or fewer. */
export function countPieces(vertexCount: number, indices: Uint32Array) {
  const parent = new Int32Array(vertexCount)
  for (let i = 0; i < vertexCount; i++) parent[i] = i
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a] } return a }
  for (let t = 0; t < indices.length; t += 3) {
    const a = find(indices[t]), b = find(indices[t + 1]), d = find(indices[t + 2])
    parent[b] = a
    parent[find(d)] = a
  }
  const tris = new Map<number, number>()
  for (let t = 0; t < indices.length; t += 3) { const r = find(indices[t]); tris.set(r, (tris.get(r) ?? 0) + 1) }
  let pieces = 0
  for (const k of tris.values()) if (k > 8) pieces++
  return pieces
}

/**
 * Moves a mesh's vertices by the same bones as the blobs (linear blend, as
 * every game engine skins a mesh). Writes posed positions and normals.
 */
export function skinMesh(m: SplatMesh, rig: { matrix: ArrayLike<number> }, outPos: Float32Array, outNrm: Float32Array) {
  const p = m.positions, nr = m.normals, mat = rig.matrix
  for (let i = 0; i < m.vertexCount; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2]
    const a = nr[i * 3], b = nr[i * 3 + 1], c = nr[i * 3 + 2]
    let ox = 0, oy = 0, oz = 0, na = 0, nb = 0, nc = 0
    for (let k = 0; k < 4; k++) {
      const w = m.weights[i * 4 + k]
      if (!w) continue
      const o = m.joints[i * 4 + k] * 16
      ox += w * (mat[o] * x + mat[o + 4] * y + mat[o + 8] * z + mat[o + 12])
      oy += w * (mat[o + 1] * x + mat[o + 5] * y + mat[o + 9] * z + mat[o + 13])
      oz += w * (mat[o + 2] * x + mat[o + 6] * y + mat[o + 10] * z + mat[o + 14])
      na += w * (mat[o] * a + mat[o + 4] * b + mat[o + 8] * c)
      nb += w * (mat[o + 1] * a + mat[o + 5] * b + mat[o + 9] * c)
      nc += w * (mat[o + 2] * a + mat[o + 6] * b + mat[o + 10] * c)
    }
    outPos[i * 3] = ox; outPos[i * 3 + 1] = oy; outPos[i * 3 + 2] = oz
    const l = Math.hypot(na, nb, nc) || 1
    outNrm[i * 3] = na / l; outNrm[i * 3 + 1] = nb / l; outNrm[i * 3 + 2] = nc / l
  }
}

/**
 * How closely a mesh follows the blobs: the average distance from a blob's
 * centre to the nearest mesh vertex, over up to `sample` blobs. Blobs lie on
 * the surface, so a faithful mesh passes close to all of them.
 */
export function meshError(m: SplatMesh, blobs: Blobs, sample = 1500) {
  if (!m.vertexCount || !blobs.count) return Infinity
  const cell = 0.04
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`
  const grid = new Map<string, number[]>()
  const p = m.positions
  for (let i = 0; i < m.vertexCount; i++) {
    const k = key(Math.floor(p[i * 3] / cell), Math.floor(p[i * 3 + 1] / cell), Math.floor(p[i * 3 + 2] / cell))
    let list = grid.get(k)
    if (!list) grid.set(k, (list = []))
    list.push(i)
  }
  const step = Math.max(1, Math.floor(blobs.count / sample))
  let sum = 0, k = 0
  for (let b = 0; b < blobs.count; b += step) {
    const x = blobs.centre[b * 3], y = blobs.centre[b * 3 + 1], z = blobs.centre[b * 3 + 2]
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell)
    let best = Infinity
    for (let r = 0; r <= 6 && best > (r - 1) * cell; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue
        for (const i of grid.get(key(cx + dx, cy + dy, cz + dz)) ?? []) {
          best = Math.min(best, Math.hypot(p[i * 3] - x, p[i * 3 + 1] - y, p[i * 3 + 2] - z))
        }
      }
    }
    sum += Math.min(best, 7 * cell)
    k++
  }
  return sum / k
}

function empty(): SplatMesh {
  return { positions: new Float32Array(0), normals: new Float32Array(0), colours: new Float32Array(0), indices: new Uint32Array(0), joints: new Uint8Array(0), weights: new Float32Array(0), vertexCount: 0, triangleCount: 0, pieces: 0, top: 0 }
}
