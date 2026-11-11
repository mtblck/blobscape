import { SplatMesh } from '@sparkjsdev/spark'
import { Blobs } from './blobs.ts'
import { checkPlyHeader } from './plyCheck.ts'

/** Why a file couldn't be opened, in words the page can show. */
export class ImportError extends Error {
  kind: 'too-big' | 'mesh' | 'damaged' | 'memory'
  constructor(kind: ImportError['kind'], message: string) {
    super(message)
    this.kind = kind
  }
}

/**
 * Reads any splat file Spark understands (.ply, .spz, .splat, .ksplat, .sog)
 * into a `Blobs` list. Spark does the decoding (in WASM); we copy out the
 * base colour of each blob. View-dependent colour (spherical harmonics) is
 * left behind, so shiny things look a little flatter in the sandbox.
 *
 * Files with more than `max` splats keep every nth one, widened by √n (as
 * `thin` in ops.ts does), and only the kept ones are copied, so a huge
 * capture never needs a full-size copy. Splats with a non-finite number in
 * them are dropped. Returns the blobs, n and how many were dropped.
 */
export async function readSplatFile(bytes: ArrayBuffer, fileName: string, max = Infinity): Promise<{ blobs: Blobs; step: number; dropped: number }> {
  // A .ply header is checked before Spark sees it: a header that promises far more data than the file
  // holds makes Spark's decoder run out of memory and stop working for the rest of the visit
  if (/\.ply$/i.test(fileName)) {
    const problem = checkPlyHeader(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 65536)), bytes.byteLength)
    if (problem === 'mesh') throw new ImportError('mesh', 'This .ply is a mesh or point cloud, not Gaussian splats.')
    if (problem) throw new ImportError('damaged', 'This .ply is damaged: its header doesn’t match its size.')
  }
  const mesh = new SplatMesh({ fileBytes: bytes, fileName })
  try {
    try {
      await mesh.initialized
    } catch (err) {
      if (err instanceof RangeError) throw new ImportError('memory', 'This file is too big for this device.')
      throw new ImportError('damaged', 'This file is damaged or in a format the sandbox can’t read.')
    }
    const total = mesh.packedSplats?.numSplats ?? 0
    const step = total > max ? Math.ceil(total / max) : 1
    const k = Math.sqrt(step)
    const b = new Blobs(Math.max(1, Math.ceil(total / step)))
    let dropped = 0
    mesh.forEachSplat((i, c, s, q, opacity, col) => {
      if (i % step) return
      const v = [c.x, c.y, c.z, s.x, s.y, s.z, q.x, q.y, q.z, q.w, opacity, col.r, col.g, col.b]
      if (!v.every(Number.isFinite)) { dropped++; return }
      b.push({ centre: [c.x, c.y, c.z], scale: [s.x * k, s.y * k, s.z * k], quat: [q.x, q.y, q.z, q.w], colour: [col.r, col.g, col.b], opacity })
    })
    return { blobs: b, step, dropped }
  } finally {
    mesh.dispose()
  }
}
