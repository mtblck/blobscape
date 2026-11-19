import type { Blobs } from '../splat-core/blobs.ts'
import type { SplatMesh } from './mesh.ts'
import type { Skin } from './rig.ts'

/**
 * Blobs to a mesh of blocks: every cell of a grid that holds a blob becomes a cube in their mean color, and only the
 * faces with no cube beside them are kept, so a scene cut as discs on a grid (voxel.ts) comes out as the same grid in
 * solid blocks. That is the pixel-art scene's own shape: the polygons a game engine takes, colored as the scene was
 * painted (light and shadow included, for an unlit material), each block on the bones of the blob that made it, so the
 * file still moves. `blobsToMesh` (mesh.ts) is the smooth way round.
 *
 * An idea from Silicon Jungle's Ink Studio.
 */
export interface BlockOptions {
  /** A block's side, in the blobs' units: the grid the scene was cut on, or a whole number of it for fewer blocks. */
  cell: number
  /** Blobs fainter than this are left out (mist, haze; default 0.3). */
  least?: number
}

/** A cell's place as one number: three signed whole numbers of up to 17 bits (so it stays exact in a double). */
const SPAN = 1 << 17, HALF = SPAN / 2
const keyOf = (x: number, y: number, z: number) => ((x + HALF) * SPAN + (y + HALF)) * SPAN + (z + HALF)

/** The six faces of a cube: their outward way and four corners (each 0 or 1 a side), counterclockwise from outside. */
const FACES: { n: [number, number, number]; c: [number, number, number][] }[] = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
]

/** The blobs as blocks on a grid of `cell` (see `BlockOptions`), as a mesh `writeRiggedMeshGlb` writes. */
export function blocksToMesh(blobs: Blobs, skin: Skin | null, o: BlockOptions): SplatMesh {
  const cell = o.cell, least = o.least ?? 0.3
  const at = new Map<number, number>()
  const where: number[] = [], sums: number[] = [], firsts: number[] = []
  for (let i = 0; i < blobs.count; i++) {
    if (blobs.opacity[i] < least) continue
    const x = Math.round(blobs.center[i * 3] / cell), y = Math.round(blobs.center[i * 3 + 1] / cell), z = Math.round(blobs.center[i * 3 + 2] / cell)
    const key = keyOf(x, y, z)
    let k = at.get(key)
    if (k === undefined) { k = where.length / 3; at.set(key, k); where.push(x, y, z); sums.push(0, 0, 0, 0); firsts.push(i) }
    for (let c = 0; c < 3; c++) sums[k * 4 + c] += blobs.color[i * 3 + c]
    sums[k * 4 + 3]++
  }
  const cells = where.length / 3
  // count the faces first, so every array is made once
  let faces = 0
  const open = new Uint8Array(cells)
  for (let k = 0; k < cells; k++) {
    const x = where[k * 3], y = where[k * 3 + 1], z = where[k * 3 + 2]
    for (let f = 0; f < 6; f++) {
      const [a, b, c] = FACES[f].n
      if (!at.has(keyOf(x + a, y + b, z + c))) { open[k] |= 1 << f; faces++ }
    }
  }
  const n = faces * 4
  const positions = new Float32Array(n * 3), normals = new Float32Array(n * 3), colors = new Float32Array(n * 3)
  const joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4)
  const indices = new Uint32Array(faces * 6)
  let v = 0, t = 0, top = -Infinity
  for (let k = 0; k < cells; k++) {
    if (!open[k]) continue
    const x = where[k * 3], y = where[k * 3 + 1], z = where[k * 3 + 2], i = firsts[k], m = sums[k * 4 + 3]
    for (let f = 0; f < 6; f++) {
      if (!(open[k] & (1 << f))) continue
      const face = FACES[f]
      indices.set([v, v + 1, v + 2, v, v + 2, v + 3], t)
      t += 6
      for (const [cx, cy, cz] of face.c) {
        positions[v * 3] = (x + cx - 0.5) * cell
        positions[v * 3 + 1] = (y + cy - 0.5) * cell
        positions[v * 3 + 2] = (z + cz - 0.5) * cell
        top = Math.max(top, positions[v * 3 + 1])
        normals.set(face.n, v * 3)
        for (let c = 0; c < 3; c++) colors[v * 3 + c] = sums[k * 4 + c] / m
        if (skin) { joints.set(skin.joints.subarray(i * 4, i * 4 + 4), v * 4); weights.set(skin.weights.subarray(i * 4, i * 4 + 4), v * 4) }
        else weights[v * 4] = 1
        v++
      }
    }
  }
  return { positions, normals, colors, indices, joints, weights, vertexCount: n, triangleCount: faces * 2, pieces: cells ? 1 : 0, top: cells ? top : 0 }
}
