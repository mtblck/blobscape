import { Blobs, type Vec3 } from './blobs.ts'

/**
 * Whole-scene and selection edits on a `Blobs` list. Plain functions, so the
 * sandbox stays a UI and these can be tested.
 */

/** Which blobs are selected: one byte per blob, plus a running count. */
export class Selection {
  mask = new Uint8Array(0)
  count = 0

  has(i: number) { return this.mask[i] === 1 }

  private ensure(n: number) {
    if (this.mask.length >= n) return
    const m = new Uint8Array(Math.max(n, this.mask.length * 2, 64))
    m.set(this.mask)
    this.mask = m
  }

  set(i: number, on: boolean) {
    this.ensure(i + 1)
    if (this.mask[i] === (on ? 1 : 0)) return
    this.mask[i] = on ? 1 : 0
    this.count += on ? 1 : -1
  }

  clear() { this.mask.fill(0); this.count = 0 }

  all(n: number) { this.ensure(n); this.mask.fill(1, 0, n); this.mask.fill(0, n); this.count = n }

  invert(n: number) {
    this.ensure(n)
    let c = 0
    for (let i = 0; i < n; i++) { this.mask[i] ^= 1; c += this.mask[i] }
    this.mask.fill(0, n)
    this.count = c
  }

  /** Indices of selected blobs, in order. */
  indices(n: number): Uint32Array {
    const out = new Uint32Array(this.count)
    let k = 0
    for (let i = 0; i < n && k < out.length; i++) if (this.mask[i]) out[k++] = i
    return out
  }

  /** Every index with the selected ones first: the order effects put blobs on the GPU in. */
  selectedFirst(n: number): Uint32Array {
    const out = new Uint32Array(n)
    let a = 0, z = this.count
    for (let i = 0; i < n; i++) if (this.mask[i]) out[a++] = i; else out[z++] = i
    return out
  }
}

/** Centre of a set of blobs (all of them when `sel` is null or empty). */
export function centroid(b: Blobs, sel: Selection | null): Vec3 {
  const c: Vec3 = [0, 0, 0]
  let n = 0
  const useSel = !!sel && sel.count > 0
  for (let i = 0; i < b.count; i++) {
    if (useSel && !sel!.has(i)) continue
    c[0] += b.centre[i * 3]; c[1] += b.centre[i * 3 + 1]; c[2] += b.centre[i * 3 + 2]; n++
  }
  return n ? [c[0] / n, c[1] / n, c[2] / n] : c
}

/** Moves the selected blobs by d. */
export function translate(b: Blobs, sel: Selection, d: Vec3) {
  for (let i = 0; i < b.count; i++) if (sel.has(i)) for (let a = 0; a < 3; a++) b.centre[i * 3 + a] += d[a]
}

/** Turns the selected blobs (positions and orientations) about a vertical axis through `pivot`. */
export function turnY(b: Blobs, sel: Selection | null, pivot: Vec3, deg: number) {
  const ang = (deg * Math.PI) / 180
  const cs = Math.cos(ang), sn = Math.sin(ang)
  const s = Math.sin(ang / 2), w = Math.cos(ang / 2)
  for (let i = 0; i < b.count; i++) {
    if (sel && !sel.has(i)) continue
    const k = i * 3
    const dx = b.centre[k] - pivot[0], dz = b.centre[k + 2] - pivot[2]
    b.centre[k] = pivot[0] + dx * cs + dz * sn
    b.centre[k + 2] = pivot[2] - dx * sn + dz * cs
    const q = i * 4
    const [x, y, z, qw] = [b.quat[q], b.quat[q + 1], b.quat[q + 2], b.quat[q + 3]]
    b.quat[q] = w * x + s * z
    b.quat[q + 1] = w * y + s * qw
    b.quat[q + 2] = w * z - s * x
    b.quat[q + 3] = w * qw - s * y
  }
}

/** Scales the selected blobs as a group about `pivot`: positions and blob sizes together. */
export function scaleGroup(b: Blobs, sel: Selection, pivot: Vec3, k: number) {
  for (let i = 0; i < b.count; i++) {
    if (!sel.has(i)) continue
    for (let a = 0; a < 3; a++) {
      b.centre[i * 3 + a] = pivot[a] + (b.centre[i * 3 + a] - pivot[a]) * k
      b.scale[i * 3 + a] *= k
    }
  }
}

/**
 * Turns a capture the right way up: most trained scenes come out upside
 * down (the COLMAP camera convention has y pointing down). A half turn about
 * the x axis.
 */
export function flipUpright(b: Blobs) {
  for (let i = 0; i < b.count; i++) {
    b.centre[i * 3 + 1] *= -1
    b.centre[i * 3 + 2] *= -1
    const q = i * 4
    const [x, y, z, w] = [b.quat[q], b.quat[q + 1], b.quat[q + 2], b.quat[q + 3]]
    // (1, 0, 0, 0) * (x, y, z, w)
    b.quat[q] = w
    b.quat[q + 1] = -z
    b.quat[q + 2] = y
    b.quat[q + 3] = -x
  }
}

/**
 * Moves a scene so it stands on the floor (y = 0) and is centred over the
 * origin, ignoring the faint stray blobs ("floaters") every capture has.
 */
export function sitOnFloor(b: Blobs) {
  if (!b.count) return
  const stride = Math.max(1, Math.floor(b.count / 50000))
  const xs: number[] = [], ys: number[] = [], zs: number[] = []
  for (let i = 0; i < b.count; i += stride) {
    if (b.opacity[i] < 0.2) continue
    xs.push(b.centre[i * 3]); ys.push(b.centre[i * 3 + 1]); zs.push(b.centre[i * 3 + 2])
  }
  if (!xs.length) return
  const q = (a: number[], t: number) => { const s = [...a].sort((m, n) => m - n); return s[Math.min(s.length - 1, Math.floor(t * s.length))] }
  const dx = -(q(xs, 0.02) + q(xs, 0.98)) / 2, dy = -q(ys, 0.02), dz = -(q(zs, 0.02) + q(zs, 0.98)) / 2
  for (let i = 0; i < b.count; i++) { b.centre[i * 3] += dx; b.centre[i * 3 + 1] += dy; b.centre[i * 3 + 2] += dz }
}

/** Is (x, y) inside the polygon? Even-odd rule. */
export function inPolygon(x: number, y: number, poly: ArrayLike<number>): boolean {
  let inside = false
  const n = poly.length / 2
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2], yi = poly[i * 2 + 1], xj = poly[j * 2], yj = poly[j * 2 + 1]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Selects every blob whose colour is within `tolerance` (0–1, straight-line RGB distance) of `rgb`. */
export function selectByColour(b: Blobs, sel: Selection, rgb: Vec3, tolerance: number) {
  const t2 = tolerance * tolerance * 3
  for (let i = 0; i < b.count; i++) {
    const d = (b.colour[i * 3] - rgb[0]) ** 2 + (b.colour[i * 3 + 1] - rgb[1]) ** 2 + (b.colour[i * 3 + 2] - rgb[2]) ** 2
    if (d <= t2) sel.set(i, true)
  }
}

/** Mean colour of the selection. */
export function meanColour(b: Blobs, sel: Selection): Vec3 | null {
  if (!sel.count) return null
  const c: Vec3 = [0, 0, 0]
  for (let i = 0; i < b.count; i++) if (sel.has(i)) for (let a = 0; a < 3; a++) c[a] += b.colour[i * 3 + a]
  return [c[0] / sel.count, c[1] / sel.count, c[2] / sel.count]
}

/**
 * Keeps every nth blob, for files bigger than the sandbox can hold, and
 * widens the survivors (by √n, since coverage goes with area) so the surface
 * stays covered. Returns n.
 */
export function thin(b: Blobs, max: number): number {
  if (b.count <= max) return 1
  const n = Math.ceil(b.count / max)
  b.filter((i) => i % n === 0)
  const k = Math.sqrt(n)
  for (let i = 0; i < b.count * 3; i++) b.scale[i] *= k
  return n
}
