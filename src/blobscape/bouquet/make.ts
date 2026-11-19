import { Blobs, type Quat, type Vec3 } from '../../splat-core/blobs.ts'
import { mulQ, rotate } from '../../splat-engine/rig.ts'

/**
 * The bouquet's blob maker: surfaces written as functions (a petal, a leaf, a
 * turned vase, a stem) are covered in flat blobs lying on them, a blob every
 * `spacing`, lit once from a fixed lamp and written into one list with the
 * bone and the part each belongs to. Everything is made in a frame (a place,
 * a turn and a size) so a flower is written standing at the origin and then
 * set on its stem.
 */

export const add = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const mul = (a: ArrayLike<number>, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
export const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const len = (a: ArrayLike<number>) => Math.hypot(a[0], a[1], a[2])
export const unit = (a: ArrayLike<number>): Vec3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const mix = (a: ArrayLike<number>, b: ArrayLike<number>, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const smooth = (x: number) => { const u = clamp(x); return u * u * (3 - 2 * u) }

/** A seeded run of numbers from 0 up to 1 (mulberry32): the same seed, the same bouquet. */
export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A number from 0 up to 1 for a whole-number place: the same place, the same number. */
export function hash(a: number, b = 0, c = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smooth noise from 0 to 1 at a point, `freq` lumps a unit. */
export function noise(p: ArrayLike<number>, freq: number, seed = 0) {
  const x = p[0] * freq, y = p[1] * freq, z = p[2] * freq
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const fx = smooth(x - xi), fy = smooth(y - yi), fz = smooth(z - zi)
  const h = (i: number, j: number, k: number) => hash(xi + i + seed * 131, yi + j, zi + k)
  const a = lerp(lerp(h(0, 0, 0), h(1, 0, 0), fx), lerp(h(0, 1, 0), h(1, 1, 0), fx), fy)
  const b = lerp(lerp(h(0, 0, 1), h(1, 0, 1), fx), lerp(h(0, 1, 1), h(1, 1, 1), fx), fy)
  return lerp(a, b, fz)
}

/** The turn that takes the x, y and z axes onto three unit vectors at right angles. */
export function basisQuat(x: ArrayLike<number>, y: ArrayLike<number>, z: ArrayLike<number>): Quat {
  const m00 = x[0], m10 = x[1], m20 = x[2], m01 = y[0], m11 = y[1], m21 = y[2], m02 = z[0], m12 = z[1], m22 = z[2]
  const tr = m00 + m11 + m22
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; return [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4] }
  if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; return [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s] }
  if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; return [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s] }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2
  return [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s]
}

/** The turn that takes the y axis onto unit vector `to`, by the short way. */
export function upTo(to: ArrayLike<number>): Quat {
  const d = to[1]
  if (d < -0.999999) return [1, 0, 0, 0]
  const q: Quat = [to[2], 0, -to[0], 1 + d]
  const l = Math.hypot(q[0], q[1], q[2], q[3])
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
}

/** Where the lamp is, as a direction: up, to the left and toward the viewer. */
export const LAMP: Vec3 = unit([-0.42, 0.78, 0.46])
/** Where the picture is mostly seen from, for the painted shine on glaze and glass. */
const EYE: Vec3 = unit([0.25, 0.3, 1])
const HALF: Vec3 = unit(add(LAMP, EYE))

/** A place, a turn and a size to make things in. */
export interface Frame { at: Vec3; turn: Quat; size: number }
export const HOME: Frame = { at: [0, 0, 0], turn: [0, 0, 0, 1], size: 1 }

/** How a surface takes the lamp. */
export interface Finish {
  /** Seen from both sides, and lit a little from behind too: petals and leaves. */
  thin?: boolean
  /** A painted shine, 0 to 1: glaze, glass, a berry. */
  shine?: number
  /** Its own light: not shaded at all. */
  glow?: boolean
  /** Opacity of each blob (0.95 left out). */
  opacity?: number
  /** How much darker than lit it may get, 0 to 1 (1 left out): less for pale flowers, which go gray. */
  shade?: number
}

/** One fallen-petal-to-be: its blobs, where it joins the flower and which way it faces. */
export interface Loose { from: number; to: number; base: Vec3; normal: Vec3; bone: number }

export class Maker {
  readonly blobs = new Blobs(16384)
  /** The bone each blob hangs on, and a second one with its share (0 for none). */
  bone: number[] = []
  bone2: number[] = []
  share2: number[] = []
  /** The part each blob belongs to: a petal, a leaf, the vase. */
  part: number[] = []
  /** Petals that may fall: see `Loose`. */
  loose: Loose[] = []
  private frames: Frame[] = [HOME]
  private parts = 0
  /** The bone new blobs hang on. */
  onBone = 0
  /** A second bone for new blobs, given where each is: a stem bending between two bones. */
  blend?: (p: Vec3) => [bone: number, share: number]

  /** How far apart blobs lie on a surface. */
  readonly spacing: number

  constructor(spacing: number) { this.spacing = spacing }

  get frame() { return this.frames[this.frames.length - 1] }
  /** Makes what `f` makes inside a frame set within the current one. */
  within(at: ArrayLike<number>, turn: Quat, size: number, f: () => void) {
    const o = this.frame
    this.frames.push({ at: add(o.at, mul(rotate(o.turn, at), o.size)), turn: mulQ(o.turn, turn), size: o.size * size })
    try { f() } finally { this.frames.pop() }
  }
  /** A point of the current frame, in the bouquet's own space. */
  out(p: ArrayLike<number>): Vec3 { const o = this.frame; return add(o.at, mul(rotate(o.turn, p), o.size)) }
  /** A direction of the current frame, in the bouquet's own space. */
  way(d: ArrayLike<number>): Vec3 { return rotate(this.frame.turn, d) }
  /** Blob spacing measured in the current frame's units. */
  get step() { return this.spacing / this.frame.size }
  /** Starts a new part and returns its number. */
  newPart() { return ++this.parts }
  get partCount() { return this.parts + 1 }

  /**
   * One flat blob at `p` lying along unit tangents `tu` and `tv` (in the current frame), `su` and `sv` across
   * (standard deviations, in the frame's units), of color `c` before light.
   */
  put(p: ArrayLike<number>, tu: Vec3, tv: Vec3, su: number, sv: number, c: ArrayLike<number>, fin: Finish = {}, thick = 0.18) {
    const o = this.frame
    const P = this.out(p)
    const x = rotate(o.turn, tu)
    let n = unit(cross(x, rotate(o.turn, tv)))
    const y = cross(n, x)
    let k = 1, hot = 0
    if (!fin.glow) {
      const d = dot(n, LAMP)
      // a thin thing lets some light through: its far side is lit a little too
      const lit = fin.thin ? 0.5 + 0.5 * (0.6 * d + 0.4 * Math.abs(d)) : 0.5 + 0.5 * d
      k = 1 - (fin.shade ?? 1) * 0.5 * (1 - clamp(lit))
      if (fin.shine) {
        if (fin.thin && dot(n, EYE) < 0) n = mul(n, -1)
        hot = fin.shine * Math.pow(Math.max(0, dot(n, HALF)), 60)
      }
    }
    const s = o.size
    const i = this.blobs.push({
      center: P,
      scale: [su * s, sv * s, Math.min(su, sv) * s * thick],
      quat: basisQuat(x, y, n),
      color: [clamp(c[0] * k + hot), clamp(c[1] * k + hot), clamp(c[2] * k + hot)],
      opacity: fin.opacity ?? 0.95,
    })
    this.bone[i] = this.onBone
    const b = this.blend?.(P)
    this.bone2[i] = b ? b[0] : 0
    this.share2[i] = b ? b[1] : 0
    this.part[i] = this.parts
    return i
  }

  /** A round blob (a bead, a grain of pollen, a bubble). */
  dot(p: ArrayLike<number>, r: number, c: ArrayLike<number>, fin: Finish = {}) {
    return this.put(p, [1, 0, 0], [0, 1, 0], r, r, c, { ...fin, glow: fin.glow ?? false, thin: true }, 1)
  }

  /**
   * Covers a surface in blobs. `at(u, v)` is the surface for u and v from 0 to 1, `rows` and `cols(u)` how many
   * blobs along and across (worked out from sizes by the caller), `color(u, v, p)` its paint.
   */
  cover(at: (u: number, v: number) => Vec3, rows: number, cols: (u: number) => number, color: (u: number, v: number, p: Vec3) => ArrayLike<number>, fin: Finish = {}, opts: { keep?: (p: Vec3) => boolean; wrap?: boolean; seed?: number; fat?: number } = {}) {
    const e = 1e-3, fat = opts.fat ?? 1, seed = opts.seed ?? this.blobs.count
    for (let i = 0; i < rows; i++) {
      const u0 = (i + 0.5) / rows
      const n = Math.max(1, Math.round(cols(u0)))
      for (let j = 0; j < n; j++) {
        const u = clamp(u0 + (hash(seed, i, j) - 0.5) * 0.5 / rows, 0.001, 0.999)
        // every other row is set half a blob across, like bricks
        let v = (j + 0.5 + (i % 2 ? 0.25 : -0.25) + (hash(seed + 7, i, j) - 0.5) * 0.3) / n
        v = opts.wrap ? ((v % 1) + 1) % 1 : clamp(v, 0.5 / n, 1 - 0.5 / n)
        const p = at(u, v)
        if (opts.keep && !opts.keep(p)) continue
        const du = sub(at(Math.min(1, u + e), v), at(Math.max(0, u - e), v)), dv = sub(at(u, opts.wrap ? v + e : Math.min(1, v + e)), at(u, opts.wrap ? v - e : Math.max(0, v - e)))
        const lu = len(du) / (Math.min(1, u + e) - Math.max(0, u - e)), lv = len(dv) / (opts.wrap ? 2 * e : Math.min(1, v + e) - Math.max(0, v - e))
        if (!(lu > 1e-9) || !(lv > 1e-9)) continue
        const tu = unit(du)
        // across, squared up against along
        const tv = unit(sub(dv, mul(tu, dot(dv, tu))))
        if (!Number.isFinite(tv[0]) || len(tv) < 0.5) continue
        this.put(p, tu, tv, Math.max(this.step * 0.3, (lu / rows) * 0.55 * fat), Math.max(this.step * 0.3, (lv / n) * 0.55 * fat), color(u, v, p), fin)
      }
    }
  }

  /**
   * A tube along a path of points with a radius at each, covered in blobs lying along it. Returns nothing: the
   * path's own points are the caller's.
   */
  tube(path: Vec3[], radius: (t: number) => number, color: (t: number, a: number, p: Vec3) => ArrayLike<number>, fin: Finish = {}) {
    if (path.length < 2) return
    const lens = [0]
    for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + len(sub(path[i], path[i - 1])))
    const total = lens[lens.length - 1]
    if (!(total > 0)) return
    const pointAt = (t: number): [Vec3, Vec3] => {
      const d = clamp(t) * total
      let i = 1
      while (i < path.length - 1 && lens[i] < d) i++
      const f = (d - lens[i - 1]) / Math.max(1e-9, lens[i] - lens[i - 1])
      return [mix(path[i - 1], path[i], f), unit(sub(path[i], path[i - 1]))]
    }
    const step = this.step
    const rows = Math.max(2, Math.round(total / (step * 1.5)))
    for (let i = 0; i < rows; i++) {
      const t = (i + 0.5) / rows
      const [c, dir] = pointAt(t)
      const r = radius(t)
      const side = unit(Math.abs(dir[1]) < 0.95 ? cross(dir, [0, 1, 0]) : cross(dir, [1, 0, 0]))
      const other = cross(dir, side)
      const round = Math.max(3, Math.round((2 * Math.PI * r) / step))
      for (let j = 0; j < round; j++) {
        const a = ((j + (i % 2) * 0.5) / round) * Math.PI * 2
        const n = add(mul(side, Math.cos(a)), mul(other, Math.sin(a)))
        const p = add(c, mul(n, r))
        this.put(p, dir, cross(n, dir), (total / rows) * 0.6, Math.max(step * 0.3, ((2 * Math.PI * r) / round) * 0.55), color(t, a, p), fin)
      }
    }
  }

  /** An egg of blobs: radii along x, y and z about `c`. `keep` drops the blobs it says no to. */
  ball(c: ArrayLike<number>, r: ArrayLike<number>, color: (n: Vec3, p: Vec3) => ArrayLike<number>, fin: Finish = {}, keep?: (p: Vec3) => boolean) {
    const mean = (r[0] + r[1] + r[2]) / 3
    const rows = Math.max(3, Math.round((Math.PI * mean) / this.step))
    this.cover(
      (u, v) => { const th = u * Math.PI, ph = -v * Math.PI * 2; return [c[0] + r[0] * Math.sin(th) * Math.cos(ph), c[1] + r[1] * Math.cos(th), c[2] + r[2] * Math.sin(th) * Math.sin(ph)] },
      rows,
      (u) => Math.max(3, (2 * Math.PI * mean * Math.sin(u * Math.PI)) / this.step),
      (_u, _v, p) => color(unit([(p[0] - c[0]) / r[0] ** 2, (p[1] - c[1]) / r[1] ** 2, (p[2] - c[2]) / r[2] ** 2]), p),
      fin,
      // v runs backward round the egg so that along × across faces out
      { wrap: true, keep },
    )
  }

  /**
   * A shape turned on a wheel about the y axis: `profile` is its outline as [radius, height] points from the foot
   * up, `swell(a, t)` scales the radius by the angle round (a pumpkin's ribs).
   */
  lathe(profile: [number, number][], color: (a: number, t: number, p: Vec3) => ArrayLike<number>, fin: Finish = {}, opts: { swell?: (a: number, t: number) => number; keep?: (p: Vec3) => boolean; inside?: boolean } = {}) {
    const lens = [0]
    for (let i = 1; i < profile.length; i++) lens.push(lens[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]))
    const total = lens[lens.length - 1]
    const at = (t: number): [number, number] => {
      const d = clamp(t) * total
      let i = 1
      while (i < profile.length - 1 && lens[i] < d) i++
      const f = (d - lens[i - 1]) / Math.max(1e-9, lens[i] - lens[i - 1])
      return [lerp(profile[i - 1][0], profile[i][0], f), lerp(profile[i - 1][1], profile[i][1], f)]
    }
    const swell = opts.swell ?? (() => 1)
    // going round the other way turns the facing inward, for the wall seen through the mouth
    const sign = opts.inside ? -1 : 1
    this.cover(
      (u, v) => { const [r, y] = at(u); const a = v * Math.PI * 2 * sign; const k = swell(a, u); return [r * k * Math.cos(a), y, r * k * Math.sin(a)] },
      Math.max(2, Math.round(total / this.step)),
      (u) => Math.max(3, (2 * Math.PI * at(u)[0]) / this.step),
      (u, v, p) => color(v * Math.PI * 2 * sign, u, p),
      fin,
      { wrap: true, keep: opts.keep },
    )
  }
}

/** A smooth outline through a few [radius, height] points (Catmull-Rom), for `lathe`. */
export function outline(points: [number, number][], per = 8): [number, number][] {
  const out: [number, number][] = []
  const P = (i: number) => points[clamp(i, 0, points.length - 1)]
  for (let i = 0; i < points.length - 1; i++) {
    for (let k = 0; k < per; k++) {
      const t = k / per, a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2)
      const f = (j: 0 | 1) => 0.5 * (2 * b[j] + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t * t + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t * t * t)
      out.push([Math.max(0, f(0)), f(1)])
    }
  }
  out.push(points[points.length - 1])
  return out
}

/** A curve through three points (a quadratic Bezier), as `n` + 1 points. */
export function arc(a: Vec3, b: Vec3, c: Vec3, n = 12): Vec3[] {
  const out: Vec3[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = 1 - t
    out.push([s * s * a[0] + 2 * s * t * b[0] + t * t * c[0], s * s * a[1] + 2 * s * t * b[1] + t * t * c[1], s * s * a[2] + 2 * s * t * b[2] + t * t * c[2]])
  }
  return out
}
