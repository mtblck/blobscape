import { project, type Blobs, type Footprint, type Lens } from '../splat-core/blobs.ts'

/**
 * A tiny software splat renderer, used where the lesson needs to break the
 * rules Spark (rightly) never breaks: drawing blobs in the wrong order.
 *
 * It's the whole algorithm in one loop: project each blob to its 2D Gaussian,
 * then for every pixel blend it "over" what's already there:
 *   color = blobColor · α + color · (1 − α),  α = opacity · exp(−½ dᵀ Σ⁻¹ d)
 * That blend is only right when blobs arrive back to front.
 */

export type Order = 'sorted' | 'reversed' | 'list'

/** The order blobs are drawn in: indices, first drawn first. */
export function drawOrder(b: Blobs, lens: Lens, order: Order): number[] {
  const idx = Array.from({ length: b.count }, (_, i) => i)
  if (order === 'list') return idx
  // Behind the camera counts as nearest (drawn last); a finite stand-in keeps the comparator consistent
  const depth = idx.map((i) => project(b, i, lens)?.depth ?? -1e30)
  idx.sort((x, y) => depth[y] - depth[x]) // far first
  return order === 'sorted' ? idx : idx.reverse()
}

/**
 * Renders into premultiplied RGBA floats (0–1). `reach` is how many standard
 * deviations out each blob is drawn, like Spark's maxStdDev.
 */
export function rasterize(b: Blobs, lens: Lens, order: number[], width: number, height: number, reach = Math.sqrt(8)): Float32Array {
  const out = new Float32Array(width * height * 4)
  const sx = width / lens.width, sy = height / lens.height
  for (const i of order) {
    const f = project(b, i, lens)
    if (!f) continue
    splatOne(out, width, height, f, sx, sy, b.color.subarray(i * 3, i * 3 + 3), b.opacity[i], reach)
  }
  return out
}

function splatOne(out: Float32Array, w: number, h: number, f: Footprint, sx: number, sy: number, c: ArrayLike<number>, opacity: number, reach: number) {
  // Covariance in output pixels (the lens is in CSS pixels)
  const a = f.cov[0] * sx * sx + 0.3, bxy = f.cov[1] * sx * sy, d = f.cov[2] * sy * sy + 0.3
  const det = a * d - bxy * bxy
  if (det <= 0) return
  const ia = d / det, ib = -bxy / det, id = a / det
  const cx = f.x * sx, cy = f.y * sy
  const rx = reach * Math.sqrt(a), ry = reach * Math.sqrt(d)
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(w - 1, Math.ceil(cx + rx))
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(h - 1, Math.ceil(cy + ry))
  const cut = reach * reach
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const m = dx * dx * ia + 2 * dx * dy * ib + dy * dy * id
      if (m > cut) continue
      const al = opacity * Math.exp(-0.5 * m)
      if (al < 1 / 255) continue
      const k = (y * w + x) * 4
      const keep = 1 - al
      out[k] = c[0] * al + out[k] * keep
      out[k + 1] = c[1] * al + out[k + 1] * keep
      out[k + 2] = c[2] * al + out[k + 2] * keep
      out[k + 3] = al + out[k + 3] * keep
    }
  }
}

/** Premultiplied floats to straight-alpha bytes for `putImageData`. */
export function toImageData(px: Float32Array, width: number, height: number): ImageData {
  const bytes = new Uint8ClampedArray(width * height * 4)
  for (let k = 0; k < px.length; k += 4) {
    const al = px[k + 3]
    if (al <= 0) continue
    bytes[k] = (px[k] / al) * 255
    bytes[k + 1] = (px[k + 1] / al) * 255
    bytes[k + 2] = (px[k + 2] / al) * 255
    bytes[k + 3] = al * 255
  }
  return new ImageData(bytes, width, height)
}
