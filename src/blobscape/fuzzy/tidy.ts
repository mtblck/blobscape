import type { SplatMesh } from '../../splat-engine/mesh.ts'
import { BLOCK_FACES, BLOCK_SIDE, paint, shade } from './subjects.ts'

/**
 * The block as a tidied mesh: what decimation does to flat faces, or a
 * modeller would make by hand. Each face is cut only where its paint changes,
 * so every edge and every stripe stays sharp in a few dozen triangles.
 */
export function tidyBlock(): SplatMesh {
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = []
  const half = BLOCK_SIDE / 2
  for (const f of BLOCK_FACES) {
    const side = f.normal[1] === 0
    const front = f.normal[2] === 1
    const us = front ? [-0.5, -0.18, 0.18, 0.5] : [-0.5, 0.5]
    const vs = front ? [-0.5, -0.1, 0.1, 0.15, 0.42, 0.5] : side ? [-0.5, -0.1, 0.1, 0.5] : [-0.5, 0.5]
    for (let i = 0; i + 1 < us.length; i++) for (let j = 0; j + 1 < vs.length; j++) {
      const c = shade(paint(f.normal, (us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2), f.normal)
      const base = pos.length / 3
      for (const [s, t] of [[us[i], vs[j]], [us[i + 1], vs[j]], [us[i + 1], vs[j + 1]], [us[i], vs[j + 1]]]) {
        pos.push(
          f.normal[0] * half + (f.u[0] * s + f.v[0] * t) * BLOCK_SIDE,
          half + f.normal[1] * half + (f.u[1] * s + f.v[1] * t) * BLOCK_SIDE,
          f.normal[2] * half + (f.u[2] * s + f.v[2] * t) * BLOCK_SIDE,
        )
        nrm.push(...f.normal)
        col.push(...c)
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }
  const vertexCount = pos.length / 3
  return {
    positions: Float32Array.from(pos),
    normals: Float32Array.from(nrm),
    colours: Float32Array.from(col),
    indices: Uint32Array.from(idx),
    joints: new Uint8Array(vertexCount * 4),
    weights: new Float32Array(vertexCount * 4),
    vertexCount,
    triangleCount: idx.length / 3,
    pieces: 1,
    top: BLOCK_SIDE,
  }
}
