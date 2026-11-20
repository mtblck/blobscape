import type { Blobs } from '../splat-core/blobs.ts'
import type { Vec3 } from '../splat-core/blobs.ts'

/**
 * Is a solid thing solid? A cut scene is a skin of discs one cell deep over each shape, hollow inside, so wherever the
 * skin lets light through, the inside of the far side shows: turf seen through an island's earth wall, earth through
 * its rock. `seeThrough` looks at a set of parts along one way and measures, over every pixel where the line of sight
 * meets a solid face-on, how much light gets past the first layer of discs it meets (the near surface alone, so what
 * lies behind cannot hide a hole). Pure, for tests: a thing that should be opaque must pass from every side.
 */

/** A part's shape as the cutter has it. */
export interface Solid { sdf: (x: number, y: number, z: number) => number; min: Vec3; max: Vec3 }

export interface SeeThrough {
  /** Pixels where the line of sight meets the solid face-on and runs on into it. */
  solid: number
  /** Share of those where more than half the light gets through the near surface: a hole pixel art shows as sky. */
  holes: number
  /** Share where more than `SEEN` of it does: enough for what is behind to tint the surface. */
  seen: number
  /** Where the worst pixels' lines of sight meet the surface, a few, for finding them. */
  worst: Vec3[]
}

/** The light let through a surface above which what lies behind it shows. */
export const SEEN = 0.15
/** How deep the near layer is, in cells, measured along the line of sight from the surface. */
export const LAYER = 1.5

const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * How much light gets through the near surface of `parts` (indices into `shapes` and the values of `partOf`) looking
 * along `way`, on pixels `pixel` across (half a cell when left out). Faces turned more than `graze` from the line of
 * sight are left out: a skin seen edge on is thin by nature.
 */
export function seeThrough(blobs: Blobs, partOf: ArrayLike<number>, shapes: Solid[], parts: number[], way: Vec3, spacing: number, { graze = 0.35, pixel = spacing / 2 }: { graze?: number; pixel?: number } = {}): SeeThrough {
  const w = norm(way), u = norm(cross(Math.abs(w[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], w)), v = cross(w, u)
  const own = parts.map((i) => shapes[i])
  // a shape is asked only near its own box: far off, the box's distance is enough to know it is not the nearest
  const sdf = (p: Vec3) => {
    let d = Infinity
    for (const s of own) {
      const out = Math.hypot(Math.max(s.min[0] - p[0], 0, p[0] - s.max[0]), Math.max(s.min[1] - p[1], 0, p[1] - s.max[1]), Math.max(s.min[2] - p[2], 0, p[2] - s.max[2]))
      d = Math.min(d, out > spacing * 2 ? out : s.sdf(p[0], p[1], p[2]))
    }
    return d
  }
  // the box round them, in the view's own axes
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const s of own) for (let c = 0; c < 8; c++) {
    const p: Vec3 = [c & 1 ? s.max[0] : s.min[0], c & 2 ? s.max[1] : s.min[1], c & 4 ? s.max[2] : s.min[2]]
    const q = [dot(p, u), dot(p, v), dot(p, w)]
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]) }
  }
  const px = pixel, W = Math.ceil((hi[0] - lo[0]) / px), H = Math.ceil((hi[1] - lo[1]) / px)
  const at = (a: number, b: number, c: number): Vec3 => [u[0] * a + v[0] * b + w[0] * c, u[1] * a + v[1] * b + w[1] * c, u[2] * a + v[2] * b + w[2] * c]
  // each pixel's near surface: how far along the way it is, or NaN where the pixel is not a solid met face-on
  const front = new Float32Array(W * H).fill(NaN)
  const step = spacing / 4, e = spacing * 0.25
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = lo[0] + (x + 0.5) * px, b = lo[1] + (y + 0.5) * px
    // stepped by most of the distance left, so open air is crossed quickly; a fine step near a surface
    let t = lo[2]
    for (let d = sdf(at(a, b, t)); t <= hi[2] && d >= 0; d = sdf(at(a, b, t))) t += Math.max(step, d * 0.7)
    if (t > hi[2]) continue
    const p = at(a, b, t)
    const n = norm([sdf([p[0] + e, p[1], p[2]]) - sdf([p[0] - e, p[1], p[2]]), sdf([p[0], p[1] + e, p[2]]) - sdf([p[0], p[1] - e, p[2]]), sdf([p[0], p[1], p[2] + e]) - sdf([p[0], p[1], p[2] - e])])
    if (-dot(n, w) < graze) continue
    // it must run on into the solid, not just skim a thin edge
    let deep = false
    for (let k = t; k <= Math.min(hi[2], t + spacing * 6) && !deep; k += step) deep = sdf(at(a, b, k)) < -spacing * 1.5
    if (deep) front[y * W + x] = t
  }
  const T = new Float32Array(W * H).fill(1)
  const keep = new Set(parts)
  for (let i = 0; i < blobs.count; i++) {
    if (!keep.has(partOf[i])) continue
    const c: Vec3 = [blobs.center[i * 3], blobs.center[i * 3 + 1], blobs.center[i * 3 + 2]]
    const cu = dot(c, u), cv = dot(c, v), cw = dot(c, w)
    const qx = blobs.quat[i * 4], qy = blobs.quat[i * 4 + 1], qz = blobs.quat[i * 4 + 2], qw = blobs.quat[i * 4 + 3]
    const s = [blobs.scale[i * 3], blobs.scale[i * 3 + 1], blobs.scale[i * 3 + 2]]
    // the blob's own axes, scaled, then seen along the way: Σ' = (P R S)(P R S)ᵀ
    const axes: Vec3[] = [
      [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qz * qw), 2 * (qx * qz - qy * qw)],
      [2 * (qx * qy - qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qx * qw)],
      [2 * (qx * qz + qy * qw), 2 * (qy * qz - qx * qw), 1 - 2 * (qx * qx + qy * qy)],
    ]
    let aa = 0, ab = 0, bb = 0
    for (let k = 0; k < 3; k++) { const pu = dot(axes[k], u) * s[k], pv = dot(axes[k], v) * s[k]; aa += pu * pu; ab += pu * pv; bb += pv * pv }
    const det = aa * bb - ab * ab
    if (det <= 0) continue
    const ia = bb / det, ib = -ab / det, ib2 = aa / det, r = 3 * Math.sqrt(Math.max(aa, bb))
    const x0 = Math.max(0, Math.floor((cu - r - lo[0]) / px)), x1 = Math.min(W, Math.ceil((cu + r - lo[0]) / px))
    const y0 = Math.max(0, Math.floor((cv - r - lo[1]) / px)), y1 = Math.min(H, Math.ceil((cv + r - lo[1]) / px))
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const f = front[y * W + x]
      if (!(Math.abs(cw - f) < spacing * LAYER)) continue
      const dx = lo[0] + (x + 0.5) * px - cu, dy = lo[1] + (y + 0.5) * px - cv
      const alpha = blobs.opacity[i] * Math.exp(-0.5 * (ia * dx * dx + 2 * ib * dx * dy + ib2 * dy * dy))
      T[y * W + x] *= 1 - Math.min(0.999, alpha)
    }
  }
  let solid = 0, holes = 0, seen = 0
  const worst: { t: number; p: Vec3 }[] = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const f = front[y * W + x]
    if (Number.isNaN(f)) continue
    solid++
    const t = T[y * W + x]
    if (t > 0.5) holes++
    if (t > SEEN) {
      seen++
      if (worst.length < 5 || t > worst[worst.length - 1].t) {
        worst.push({ t, p: at(lo[0] + (x + 0.5) * px, lo[1] + (y + 0.5) * px, f).map((n) => Math.round(n * 100) / 100) as Vec3 })
        worst.sort((m, n) => n.t - m.t).splice(5)
      }
    }
  }
  return { solid, holes: solid ? holes / solid : 0, seen: solid ? seen / solid : 0, worst: worst.map((k) => k.p) }
}
