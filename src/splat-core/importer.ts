import { SplatMesh } from '@sparkjsdev/spark'
import { Blobs } from './blobs.ts'

/**
 * Reads any splat file Spark understands (.ply, .spz, .splat, .ksplat, .sog)
 * into a `Blobs` list. Spark does the decoding (in WASM); we copy out the
 * base colour of each blob. View-dependent colour (spherical harmonics) is
 * left behind, so shiny things look a little flatter in the sandbox.
 */
export async function readSplatFile(bytes: ArrayBuffer, fileName: string): Promise<Blobs> {
  const mesh = new SplatMesh({ fileBytes: bytes, fileName })
  try {
    await mesh.initialized
    const n = mesh.packedSplats?.numSplats ?? 0
    const b = new Blobs(Math.max(1, n))
    mesh.forEachSplat((_i, c, s, q, opacity, col) => {
      b.push({ centre: [c.x, c.y, c.z], scale: [s.x, s.y, s.z], quat: [q.x, q.y, q.z, q.w], colour: [col.r, col.g, col.b], opacity })
    })
    return b
  } finally {
    mesh.dispose()
  }
}
