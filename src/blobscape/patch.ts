import type { Blobs, Vec3 } from '../splat-core/blobs.ts'

/**
 * The sandbox's two mending tools (issue #209), pure and tested. Fill a hole: under the brush ring, blobs grow in
 * from the edge of a gap, each taking its size, facing, color and height from the blobs beside it. Clone stamp:
 * blobs round one place are copied to another, the way a photo editor's stamp copies pixels.
 */

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

/** How far past the ring the tools look for the surface round it, in ring radii. */
export const REACH = 1.7

/**
 * The blobs round a ring on screen that belong to the nearest surface there: those within `REACH` ring radii of the
 * ray (origin `o`, unit direction `d`; the ring is `k` wide per unit of distance along it), no further back than
 * about a ring's width behind the nearest of them, so what shows through a gap from behind is left out.
 */
export function rimUnder(b: Blobs, o: Vec3, d: Vec3, k: number): number[] {
  const found: { i: number; t: number }[] = []
  for (let i = 0; i < b.count; i++) {
    const v = [b.center[i * 3] - o[0], b.center[i * 3 + 1] - o[1], b.center[i * 3 + 2] - o[2]]
    const t = dot(v, d)
    if (t <= 0) continue
    if (Math.hypot(v[0] - t * d[0], v[1] - t * d[1], v[2] - t * d[2]) <= REACH * k * t) found.push({ i, t })
  }
  if (!found.length) return []
  const depths = found.map((f) => f.t).sort((x, y) => x - y)
  const near = depths[Math.floor(depths.length * 0.15)]
  return found.filter((f) => f.t <= near * (1 + 2 * REACH * k)).map((f) => f.i)
}

/** The direction a cloud of points is thinnest along: the smallest eigenvector of its covariance (Jacobi turns). */
function thinAxis(pts: Float64Array, n: number, c: Vec3): Vec3 {
  const a = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (let i = 0; i < n; i++) {
    const x = pts[i * 3] - c[0], y = pts[i * 3 + 1] - c[1], z = pts[i * 3 + 2] - c[2]
    a[0] += x * x; a[1] += x * y; a[2] += x * z; a[4] += y * y; a[5] += y * z; a[8] += z * z
  }
  a[3] = a[1]; a[6] = a[2]; a[7] = a[5]
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1]
  for (let sweep = 0; sweep < 12; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      const apq = a[p * 3 + q]
      if (Math.abs(apq) < 1e-18) continue
      const th = (a[q * 3 + q] - a[p * 3 + p]) / (2 * apq)
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1))
      const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs
      for (let r = 0; r < 3; r++) { const x = a[r * 3 + p], y = a[r * 3 + q]; a[r * 3 + p] = cs * x - sn * y; a[r * 3 + q] = sn * x + cs * y }
      for (let r = 0; r < 3; r++) { const x = a[p * 3 + r], y = a[q * 3 + r]; a[p * 3 + r] = cs * x - sn * y; a[q * 3 + r] = sn * x + cs * y }
      for (let r = 0; r < 3; r++) { const x = v[r * 3 + p], y = v[r * 3 + q]; v[r * 3 + p] = cs * x - sn * y; v[r * 3 + q] = sn * x + cs * y }
    }
  }
  const k = a[0] <= a[4] && a[0] <= a[8] ? 0 : a[4] <= a[8] ? 1 : 2
  return unit([v[k], v[3 + k], v[6 + k]])
}

export interface Filled {
  /** How many blobs were added (at the end of the set). */
  added: number
  /** Why none were, when none were. */
  why?: 'nothing-there' | 'no-gap' | 'full'
}

/**
 * Fills the gap under the ring. The blobs round the ring (`rimUnder`) give the surface: a plane through them, how
 * far apart they sit, and how high each stands off the plane. New blobs are laid on a grid that far apart inside
 * the ring, only where no blob already is, and only next to one that is there: so they grow in from the edge, pass
 * by pass, each taking the mixed color, size, opacity and height of its nearest few neighbors and the facing of its
 * nearest. Open space with nothing round it stays empty. `max` caps the set's size.
 */
export function fillHole(b: Blobs, o: Vec3, d: Vec3, k: number, max = Infinity, seed = 1): Filled {
  const rim = rimUnder(b, o, d, k)
  if (rim.length < 3) return { added: 0, why: 'nothing-there' }
  const n0 = rim.length
  const pts = new Float64Array(n0 * 3)
  const c: Vec3 = [0, 0, 0]
  rim.forEach((i, j) => { for (let q = 0; q < 3; q++) { pts[j * 3 + q] = b.center[i * 3 + q]; c[q] += b.center[i * 3 + q] / n0 } })
  let n = thinAxis(pts, n0, c)
  if (dot(n, d) > 0) n = [-n[0], -n[1], -n[2]]
  // a surface seen edge-on can't be filled from here: use the plane facing the view instead
  const facing = -dot(n, d)
  if (facing < 0.15) n = [-d[0], -d[1], -d[2]]
  // where the ray meets the plane, and the ring's size there
  const t0 = dot([c[0] - o[0], c[1] - o[1], c[2] - o[2]], n) / dot(d, n)
  const p0: Vec3 = [o[0] + d[0] * t0, o[1] + d[1] * t0, o[2] + d[2] * t0]
  const R = k * t0
  const u = unit(cross(Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], n)), v = cross(n, u)

  // every point so far in the plane's own frame: across (x, y) and off it (h), with the blob it takes after
  const xs: number[] = [], ys: number[] = [], hs: number[] = [], src: number[] = []
  for (const i of rim) {
    const r: Vec3 = [b.center[i * 3] - p0[0], b.center[i * 3 + 1] - p0[1], b.center[i * 3 + 2] - p0[2]]
    xs.push(dot(r, u)); ys.push(dot(r, v)); hs.push(dot(r, n)); src.push(i)
  }
  // how far apart the rim's blobs sit: the middle nearest-neighbor distance of a sample of them
  const step = Math.max(1, Math.floor(n0 / 400))
  const nearest: number[] = []
  for (let i = 0; i < n0; i += step) {
    let best = Infinity
    for (let j = 0; j < n0; j++) if (j !== i) best = Math.min(best, (xs[i] - xs[j]) ** 2 + (ys[i] - ys[j]) ** 2)
    if (best > 0 && best < Infinity) nearest.push(Math.sqrt(best))
  }
  nearest.sort((x, y) => x - y)
  const s = Math.min(R / 3, Math.max(R / 40, nearest[nearest.length >> 1] ?? R / 10))

  // a grid over the plane, a cell a spacing wide, so a point asks only its neighbors
  const cells = new Map<number, number[]>()
  const key = (x: number, y: number) => (Math.floor(x / s) + 32768) * 65536 + Math.floor(y / s) + 32768
  const put = (j: number) => { const kk = key(xs[j], ys[j]); const l = cells.get(kk); if (l) l.push(j); else cells.set(kk, [j]) }
  for (let j = 0; j < n0; j++) put(j)
  const near = (x: number, y: number, reach: number): { j: number; d2: number }[] => {
    const out: { j: number; d2: number }[] = []
    const w = Math.ceil(reach / s)
    for (let cx = -w; cx <= w; cx++) for (let cy = -w; cy <= w; cy++) {
      const l = cells.get(key(x + cx * s, y + cy * s))
      if (l) for (const j of l) { const d2 = (xs[j] - x) ** 2 + (ys[j] - y) ** 2; if (d2 <= reach * reach) out.push({ j, d2 }) }
    }
    return out
  }

  let state = seed >>> 0
  const rand = () => { state = (state + 0x6d2b79f5) >>> 0; let x = state; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296 }
  // where blobs could go: a jittered triangle grid inside the ring, not already taken
  let waiting: { x: number; y: number }[] = []
  const row = s * 0.866
  for (let gy = -Math.ceil(R / row); gy <= R / row; gy++) for (let gx = -Math.ceil(R / s) - 1; gx <= R / s + 1; gx++) {
    const x = (gx + (gy & 1) * 0.5 + (rand() - 0.5) * 0.3) * s, y = (gy + (rand() - 0.5) * 0.3) * row
    if (x * x + y * y > R * R) continue
    if (near(x, y, s * 0.75).length) continue
    waiting.push({ x, y })
  }
  if (!waiting.length) return { added: 0, why: 'no-gap' }

  const from = b.count
  let full = false
  for (let pass = 0; pass < 200 && waiting.length && !full; pass++) {
    const next: { x: number; y: number }[] = []
    const before = xs.length
    let grown = 0
    for (const w of waiting) {
      if (b.count >= max) { full = true; break }
      // beside something that was there before this pass, and not on top of anything
      const by = near(w.x, w.y, s * 1.7).filter((m) => m.j < before)
      if (!by.length) { next.push(w); continue }
      if (near(w.x, w.y, s * 0.75).length) continue
      by.sort((p, q) => p.d2 - q.d2)
      const few = by.slice(0, 4)
      let sum = 0, h = 0, op = 0
      const col = [0, 0, 0], ls = [0, 0, 0]
      for (const m of few) {
        const wt = 1 / (m.d2 + (s * 0.2) ** 2), i = src[m.j]
        sum += wt; h += wt * hs[m.j]; op += wt * b.opacity[i]
        for (let q = 0; q < 3; q++) { col[q] += wt * b.color[i * 3 + q]; ls[q] += wt * Math.log(Math.max(1e-9, b.scale[i * 3 + q])) }
      }
      h /= sum
      const like = src[few[0].j]
      b.push({
        center: [p0[0] + u[0] * w.x + v[0] * w.y + n[0] * h, p0[1] + u[1] * w.x + v[1] * w.y + n[1] * h, p0[2] + u[2] * w.x + v[2] * w.y + n[2] * h],
        scale: [Math.exp(ls[0] / sum), Math.exp(ls[1] / sum), Math.exp(ls[2] / sum)],
        quat: [b.quat[like * 4], b.quat[like * 4 + 1], b.quat[like * 4 + 2], b.quat[like * 4 + 3]],
        color: [col[0] / sum, col[1] / sum, col[2] / sum],
        opacity: op / sum,
      })
      xs.push(w.x); ys.push(w.y); hs.push(h); src.push(b.count - 1)
      grown++
      put(xs.length - 1)
    }
    if (!grown) break
    waiting = next
  }
  const added = b.count - from
  return added ? { added } : { added: 0, why: full ? 'full' : 'nothing-there' }
}

/**
 * One dab of the clone stamp: every blob among the first `count` (those there when the stroke began, so a copy is
 * never copied again) whose center is within `r` of `from`, and that this stroke hasn't copied yet (`done`), is
 * copied `shift` away. Returns how many were added; stops at `max` blobs in the set.
 */
export function stampDab(b: Blobs, count: number, from: Vec3, r: number, shift: Vec3, done: Set<number>, max = Infinity): number {
  let added = 0
  const r2 = r * r
  for (let i = 0; i < count && b.count < max; i++) {
    if (done.has(i)) continue
    const x = b.center[i * 3] - from[0], y = b.center[i * 3 + 1] - from[1], z = b.center[i * 3 + 2] - from[2]
    if (x * x + y * y + z * z > r2) continue
    done.add(i)
    const blob = b.get(i)
    b.push({ ...blob, center: [blob.center[0] + shift[0], blob.center[1] + shift[1], blob.center[2] + shift[2]] })
    added++
  }
  return added
}
