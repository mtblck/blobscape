import type { BufferAttribute, BufferGeometry } from 'three'
import { Blobs, fromCovariance } from './blobs.ts'
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
 * Reads a splat file (.ply, .spz, .splat, .ksplat, .sog) into a `Blobs` list.
 * .ply, .spz, .splat and .ksplat are decoded by three.js's loaders and keep
 * their color by angle (spherical harmonics, to the file's degree, rounded to
 * 1/128 as three.js holds them); .sog, and a name with none of those endings,
 * still go through Spark (in WASM, base color only).
 *
 * Files with more than `max` splats keep every nth one, widened by √n (as
 * `thin` in ops.ts does), and only the kept ones are copied, so a huge
 * capture never needs a full-size copy. Splats with a non-finite number in
 * them are dropped. Returns the blobs, n and how many were dropped.
 */
export async function readSplatFile(bytes: ArrayBuffer, fileName: string, max = Infinity): Promise<{ blobs: Blobs; step: number; dropped: number }> {
  // A .ply header is checked first: a header that promises far more data than the file holds would have the
  // decoder ask for more memory than there is
  if (/\.ply$/i.test(fileName)) {
    const problem = checkPlyHeader(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 65536)), bytes.byteLength)
    if (problem === 'mesh') throw new ImportError('mesh', 'This .ply is a mesh or point cloud, not Gaussian splats.')
    if (problem) throw new ImportError('damaged', 'This .ply is damaged: its header doesn’t match its size.')
  }
  const kind = /\.(ply|spz|splat|ksplat)$/i.exec(fileName)?.[1].toLowerCase()
  if (!kind) return readWithSpark(bytes, fileName, max)
  let geometry: BufferGeometry
  try {
    geometry = await parseWithThree(bytes, kind)
  } catch (err) {
    if (err instanceof RangeError) throw new ImportError('memory', 'This file is too big for this device.')
    throw new ImportError('damaged', 'This file is damaged or in a format the sandbox can’t read.')
  }
  try {
    return fromGeometry(geometry, max)
  } finally {
    geometry.dispose()
  }
}

/** three.js's loader for the kind, loaded only when a file of that kind is opened. */
async function parseWithThree(bytes: ArrayBuffer, kind: string): Promise<BufferGeometry> {
  // the loaders may keep or detach what they're given: hand them a copy so the caller's bytes stay whole
  const copy = bytes.slice(0)
  if (kind === 'ply') return new (await import('three/addons/loaders/GaussianSplatPLYLoader.js')).GaussianSplatPLYLoader().parse(copy)
  if (kind === 'splat') return new (await import('three/addons/loaders/SPLATLoader.js')).SPLATLoader().parse(copy)
  if (kind === 'ksplat') return new (await import('three/addons/loaders/KSPLATLoader.js')).KSPLATLoader().parse(copy)
  const loader = new (await import('three/addons/loaders/SPZLoader.js')).SPZLoader()
  // version 4 decodes asynchronously; earlier versions answer at once
  return await (loader.parse(copy) as BufferGeometry | Promise<BufferGeometry>)
}

/** Where each band of rest terms starts, and how many numbers it holds (three.js keeps them a band to an attribute). */
const BAND_FIRST = [0, 0, 3, 8]
const BAND_NUMBERS = [0, 9, 15, 21]

/**
 * Blobs from three.js's splat geometry: centers, covariances (turned back into scale and facing), colors as bytes
 * (the files' base color, as `Blobs.color` keeps it) and the rest terms, a byte each as (v + 1) × 128.
 */
export function fromGeometry(g: BufferGeometry, max = Infinity): { blobs: Blobs; step: number; dropped: number } {
  const pos = g.getAttribute('position') as BufferAttribute, cov = g.getAttribute('covariance') as BufferAttribute, col = g.getAttribute('color') as BufferAttribute
  const total = pos.count
  const step = total > max ? Math.ceil(total / max) : 1
  const b = new Blobs(Math.max(1, Math.ceil(total / step)))
  const bands: Uint8Array[] = []
  for (let d = 1; d <= 3; d++) {
    const a = g.getAttribute(`sphericalHarmonics${d}`) as BufferAttribute | undefined
    if (!a) break
    const arr = a.array as Uint32Array
    bands.push(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength))
  }
  if (bands.length) b.setSHDegree(bands.length)
  const t = b.shTerms
  const p = pos.array as Float32Array, c = cov.array as Float32Array, rgba = col.array as Uint8Array
  let dropped = 0
  for (let i = 0; i < total; i += step) {
    const v = [p[i * 3], p[i * 3 + 1], p[i * 3 + 2], c[i * 6], c[i * 6 + 1], c[i * 6 + 2], c[i * 6 + 3], c[i * 6 + 4], c[i * 6 + 5]]
    if (!v.every(Number.isFinite)) { dropped++; continue }
    // every nth blob kept stands for n: widened by √n each way, so its covariance by n
    const { scale, quat } = fromCovariance(v.slice(3).map((x) => x * step))
    const k = b.push({ center: [v[0], v[1], v[2]], scale, quat, color: [rgba[i * 4] / 255, rgba[i * 4 + 1] / 255, rgba[i * 4 + 2] / 255], opacity: rgba[i * 4 + 3] / 255 })
    for (let d = 1; d <= bands.length; d++) {
      const bytes = bands[d - 1], stride = bytes.length / total
      for (let j = 0; j < BAND_NUMBERS[d]; j++) b.sh![k * t * 3 + (BAND_FIRST[d] + Math.floor(j / 3)) * 3 + (j % 3)] = (bytes[i * stride + j] - 128) / 128
    }
  }
  return { blobs: b, step, dropped }
}

/** The files three.js has no loader for (.sog), through Spark, as before: base color only. */
async function readWithSpark(bytes: ArrayBuffer, fileName: string, max: number): Promise<{ blobs: Blobs; step: number; dropped: number }> {
  const { SplatMesh } = await import('@sparkjsdev/spark')
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
      b.push({ center: [c.x, c.y, c.z], scale: [s.x * k, s.y * k, s.z * k], quat: [q.x, q.y, q.z, q.w], color: [col.r, col.g, col.b], opacity })
    })
    return { blobs: b, step, dropped }
  } finally {
    mesh.dispose()
  }
}
