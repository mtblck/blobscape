import { Blobs } from '../splat-core/blobs.ts'

/**
 * Shape shifting: one set of blobs turning into another that was made with no
 * thought of the first (a frog into a dragon). A morph (morph.ts) changes a
 * shape whose blobs stay the same blobs; here the two shapes share nothing, so
 * the work is in two steps:
 *
 * - `pairUp` gives every blob of one shape a partner in the other, near where
 *   it already is, so each has a short trip and neighbors stay neighbors;
 * - `shiftBlobs` moves each blob toward its partner and blends its size,
 *   facing, color and opacity on the way, along a chosen path and in a chosen
 *   order.
 *
 * Both are plain numbers on typed arrays: no bones, and nothing the GPU has to
 * know about but the blobs that come out.
 */
export type Pairing = 'place' | 'match' | 'random'
export type Path = 'straight' | 'swirl' | 'melt' | 'burst'
export type Order = 'together' | 'rise' | 'scatter'

export interface Shift {
  /** The two shapes with as many blobs each, in step: blob i of `from` becomes blob i of `to`. */
  from: Blobs
  to: Blobs
  count: number
  /** The upright line the swirl turns about and the melt spreads from, and the floor the melt sinks to. */
  mid: [x: number, z: number]
  floor: number
  top: number
  /** How far a blob travels on average, in a straight line. */
  trip: number
  /** Worked out once, so a frame is cheap: the logs of both shapes' sizes, when each blob sets off for each order (0..1), and how far each is thrown by a burst. */
  logFrom: Float32Array
  logTo: Float32Array
  delay: Record<Exclude<Order, 'together'>, Float32Array>
  throw: Float32Array
}

/** A cheap hash of a whole number, 0..1. */
const hash = (i: number) => { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s) }

/**
 * A copy of the blobs grown or shrunk so the longest side of the box round
 * their centers is `size`, standing on the floor (y = 0) over the middle. Two
 * creatures sized alike shift into each other; a frog beside a dragon ten
 * times its size would only seem to grow.
 */
export function sized(b: Blobs, size: number): Blobs {
  const out = b.clone()
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < b.count; i++) for (let k = 0; k < 3; k++) { const v = b.center[i * 3 + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v }
  const f = size / Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1e-6)
  const at = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2]
  for (let i = 0; i < b.count * 3; i++) { out.center[i] = (b.center[i] - at[i % 3]) * f; out.scale[i] = b.scale[i] * f }
  return out
}

/** `n` blobs from `b`: all of them, and the same ones again, evenly spread, to make up the number. */
function stretched(b: Blobs, n: number): Uint32Array {
  const ids = new Uint32Array(n)
  for (let i = 0; i < n; i++) ids[i] = i < b.count ? i : Math.floor(((i - b.count + 0.5) / (n - b.count)) * b.count)
  return ids
}

/**
 * Pairs by place: both lists are cut in half across whichever way they reach
 * furthest, lower half with lower half, and each half is paired the same way
 * until one blob is left on each side. Halves are by rank, not by distance, so
 * a small creature and a big one still pair top to top and front to front.
 */
function pairByPlace(a: Blobs, ia: Uint32Array, b: Blobs, ib: Uint32Array) {
  const walk = (lo: number, hi: number) => {
    if (hi - lo < 2) return
    let axis = 0, widest = -1
    for (let k = 0; k < 3; k++) {
      let min = Infinity, max = -Infinity
      for (let i = lo; i < hi; i++) {
        const u = a.center[ia[i] * 3 + k], v = b.center[ib[i] * 3 + k]
        if (u < min) min = u
        if (u > max) max = u
        // the other shape counts too: the cut goes across the longest way of the two together
        if (v < min) min = v
        if (v > max) max = v
      }
      if (max - min > widest) { widest = max - min; axis = k }
    }
    ia.subarray(lo, hi).sort((p, q) => a.center[p * 3 + axis] - a.center[q * 3 + axis])
    ib.subarray(lo, hi).sort((p, q) => b.center[p * 3 + axis] - b.center[q * 3 + axis])
    const mid = (lo + hi) >> 1
    walk(lo, mid)
    walk(mid, hi)
  }
  walk(0, ia.length)
}

/** How much a step of color counts against a step of place in `matchPairs`, as a share of the shapes' size: a color from black to white costs as much as moving this far. */
export const COLOR_WEIGHT = 0.06
/** How many times `matchPairs` goes over every blob, at most. */
export const MATCH_PASSES = 4
/** How many neighbors each blob tries swapping partners with in a pass, at most. */
const MATCH_TRIES = 24
/** How many blobs `matchPairs` wants in a cell of its grid. */
const PER_CELL = 4
/** A cell and the 26 round it, nearest first. */
const AROUND: [number, number, number][] = [-1, 0, 1].flatMap((x) => [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((z) => [x, y, z] as [number, number, number]))).sort((p, q) => Math.abs(p[0]) + Math.abs(p[1]) + Math.abs(p[2]) - Math.abs(q[0]) - Math.abs(q[1]) - Math.abs(q[2]))

/**
 * Pairs closer to the best there is, starting from pairing by place: as transport problems are solved, the cost of a
 * pairing is the sum of each pair's squared distance plus its squared change of color (`COLOR_WEIGHT`), and each blob swaps
 * partners with whichever of the blobs near it saves the most, while any swap costs less. Each swap only lowers the cost, so it settles;
 * paths that cross are what a swap undoes, and a blob goes to the part of the other shape that has its color where
 * there is a choice (an eye to an eye). Neighbors are found on a grid of `a`'s places, a few in each cell. An idea
 * from Silicon Jungle's Ink Studio, which pairs by optimal transport.
 */
export function matchPairs(a: Blobs, ia: Uint32Array, b: Blobs, ib: Uint32Array, passes = MATCH_PASSES): number {
  const n = ia.length
  if (n < 2) return 0
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = a.center[ia[i] * 3 + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v }
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1e-6)
  const w = (COLOR_WEIGHT * extent) ** 2
  const cost = (i: number, j: number) => {
    const p = ia[i] * 3, q = ib[j] * 3
    const dx = a.center[p] - b.center[q], dy = a.center[p + 1] - b.center[q + 1], dz = a.center[p + 2] - b.center[q + 2]
    const r = a.color[p] - b.color[q], g = a.color[p + 1] - b.color[q + 1], u = a.color[p + 2] - b.color[q + 2]
    return dx * dx + dy * dy + dz * dz + w * (r * r + g * g + u * u)
  }
  // a grid of a's places with a few blobs in each cell that has any: a creature is a shell, so the cell is sized to
  // what is filled, halved until the cells hold about `PER_CELL`
  let cell = extent / Math.max(1, Math.cbrt(n / PER_CELL)), side = 1
  const keys = new Float64Array(n), order = new Uint32Array(n)
  const bin = () => {
    side = Math.ceil(extent / cell) + 1
    const filled = new Set<number>()
    for (let i = 0; i < n; i++) {
      const c = [0, 1, 2].map((k) => Math.min(side - 1, Math.floor((a.center[ia[i] * 3 + k] - min[k]) / cell)))
      keys[i] = (c[0] * side + c[1]) * side + c[2]
      filled.add(keys[i])
    }
    return n / filled.size
  }
  for (let tries = 0; tries < 6 && bin() > PER_CELL * 2 && side < 1024; tries++) cell /= 2
  for (let i = 0; i < n; i++) order[i] = i
  order.sort((x, y) => keys[x] - keys[y])
  const starts = new Map<number, number>()
  for (let k = n - 1; k >= 0; k--) starts.set(keys[order[k]], k)
  // a pair's partners worth trying: the blobs in its own cell, then the 26 round it, `MATCH_TRIES` at most
  const near = new Uint32Array(MATCH_TRIES)
  const neighbors = (i: number) => {
    const c = keys[i], cx = Math.floor(c / (side * side)), cy = Math.floor(c / side) % side, cz = c % side
    let m = 0
    for (const [dx, dy, dz] of AROUND) {
      if (m >= MATCH_TRIES) break
      const x = cx + dx, y = cy + dy, z = cz + dz
      if (x < 0 || y < 0 || z < 0 || x >= side || y >= side || z >= side) continue
      const key = (x * side + y) * side + z
      const at = starts.get(key)
      if (at === undefined) continue
      for (let k = at; k < n && keys[order[k]] === key && m < MATCH_TRIES; k++) if (order[k] !== i) near[m++] = order[k]
    }
    return m
  }
  let swaps = 0
  for (let pass = 0; pass < passes; pass++) {
    let these = 0
    for (let i = 0; i < n; i++) {
      // the swap among the neighbors that saves the most
      const m = neighbors(i), own = cost(i, i)
      let best = -1, most = 1e-12
      for (let t = 0; t < m; t++) {
        const j = near[t], save = own + cost(j, j) - cost(i, j) - cost(j, i)
        if (save > most) { most = save; best = j }
      }
      if (best >= 0) { const x = ib[i]; ib[i] = ib[best]; ib[best] = x; these++ }
    }
    swaps += these
    if (!these) break
  }
  return swaps
}

/** The mean over pairs of squared distance plus squared change of color weighed by `COLOR_WEIGHT`: what `matchPairs` lowers. */
export function pairCost(s: Shift): number {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < s.count * 3; i++) { const v = s.from.center[i], k = i % 3; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v }
  const w = (COLOR_WEIGHT * Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1e-6)) ** 2
  let total = 0
  for (let i = 0; i < s.count * 3; i++) { const d = s.to.center[i] - s.from.center[i], c = s.to.color[i] - s.from.color[i]; total += d * d + w * c * c }
  return total / s.count
}

function take(b: Blobs, ids: Uint32Array): Blobs {
  const out = new Blobs(ids.length)
  out.count = ids.length
  for (let i = 0; i < ids.length; i++) {
    const s = ids[i]
    out.center.set(b.center.subarray(s * 3, s * 3 + 3), i * 3)
    out.scale.set(b.scale.subarray(s * 3, s * 3 + 3), i * 3)
    out.quat.set(b.quat.subarray(s * 4, s * 4 + 4), i * 4)
    out.color.set(b.color.subarray(s * 3, s * 3 + 3), i * 3)
    out.opacity[i] = b.opacity[s]
  }
  return out
}

/**
 * Gives every blob of `a` a partner in `b`. The shape with fewer blobs uses
 * some of its blobs twice, so nothing appears from nowhere. 'match' starts
 * from pairing by place and swaps partners while that lowers the cost
 * (`matchPairs`). 'random' pairs with no regard to place, to show what pairing
 * by place is for.
 */
export function pairUp(a: Blobs, b: Blobs, pairing: Pairing = 'place'): Shift {
  const n = Math.max(a.count, b.count, 1)
  const ia = stretched(a, n), ib = stretched(b, n)
  if (pairing !== 'random') {
    pairByPlace(a, ia, b, ib)
    if (pairing === 'match') matchPairs(a, ia, b, ib)
  } else {
    // a shuffle that is the same every time
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(hash(i) * (i + 1)), t = ib[i]; ib[i] = ib[j]; ib[j] = t }
  }
  const from = take(a, ia), to = take(b, ib)
  let x = 0, z = 0, floor = Infinity, top = -Infinity, trip = 0
  for (let i = 0; i < n; i++) {
    const p = from.center.subarray(i * 3, i * 3 + 3), q = to.center.subarray(i * 3, i * 3 + 3)
    x += p[0] + q[0]; z += p[2] + q[2]
    floor = Math.min(floor, p[1], q[1]); top = Math.max(top, p[1], q[1])
    trip += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])
    // the same facing can be written two ways: keep each pair on the same side, so the blend turns the short way
    const s = i * 4
    if (from.quat[s] * to.quat[s] + from.quat[s + 1] * to.quat[s + 1] + from.quat[s + 2] * to.quat[s + 2] + from.quat[s + 3] * to.quat[s + 3] < 0) {
      for (let k = 0; k < 4; k++) to.quat[s + k] = -to.quat[s + k]
    }
  }
  const logFrom = new Float32Array(n * 3), logTo = new Float32Array(n * 3)
  for (let i = 0; i < n * 3; i++) { logFrom[i] = Math.log(Math.max(1e-6, from.scale[i])); logTo[i] = Math.log(Math.max(1e-6, to.scale[i])) }
  const rise = new Float32Array(n), scatter = new Float32Array(n), thrown = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    rise[i] = ((from.center[i * 3 + 1] + to.center[i * 3 + 1]) / 2 - floor) / Math.max(1e-6, top - floor)
    scatter[i] = hash(i + 0.5)
    thrown[i] = 0.5 + 1.1 * hash(i + 0.25)
  }
  return { from, to, count: n, mid: [x / (2 * n), z / (2 * n)], floor, top, trip: trip / n, logFrom, logTo, delay: { rise, scatter }, throw: thrown }
}

/** How long the last blob waits, as a share of the whole shift, when the order is not 'together'. */
const WAIT = 0.6
const smooth = (u: number) => u * u * (3 - 2 * u)

/**
 * The blobs `amount` of the way from one shape to the other (0 is `from`, 1 is
 * `to`), into `out`. Every blob makes the whole trip; `order` says when it
 * sets off and `path` which way it goes.
 */
export function shiftBlobs(s: Shift, amount: number, out: Blobs, path: Path = 'straight', order: Order = 'together') {
  const n = s.count
  if (out.capacity < n) throw new Error(`shiftBlobs: out holds ${out.capacity} blobs, the shift has ${n}`)
  out.count = n
  const a = s.from, b = s.to, w = Math.min(1, Math.max(0, amount))
  const wait = order === 'together' ? 0 : WAIT, late = order === 'together' ? undefined : s.delay[order]
  const [mx, mz] = s.mid
  for (let i = 0; i < n; i++) {
    const u = Math.min(1, Math.max(0, (w - (late ? late[i] * wait : 0)) / (1 - wait)))
    const e = smooth(u), c = i * 3, q = i * 4
    if (e === 0 || e === 1) {
      // not set off yet, or arrived: the blob as it is in that shape
      const end = e === 0 ? a : b
      out.center[c] = end.center[c]; out.center[c + 1] = end.center[c + 1]; out.center[c + 2] = end.center[c + 2]
      out.scale[c] = end.scale[c]; out.scale[c + 1] = end.scale[c + 1]; out.scale[c + 2] = end.scale[c + 2]
      out.quat[q] = end.quat[q]; out.quat[q + 1] = end.quat[q + 1]; out.quat[q + 2] = end.quat[q + 2]; out.quat[q + 3] = end.quat[q + 3]
      out.color[c] = end.color[c]; out.color[c + 1] = end.color[c + 1]; out.color[c + 2] = end.color[c + 2]
      out.opacity[i] = end.opacity[i]
      continue
    }
    // how far off the straight line the path is: none at either end
    const off = Math.sin(Math.PI * e)
    let x = a.center[c] + (b.center[c] - a.center[c]) * e
    let y = a.center[c + 1] + (b.center[c + 1] - a.center[c + 1]) * e
    let z = a.center[c + 2] + (b.center[c + 2] - a.center[c + 2]) * e
    if (path === 'swirl') {
      // round the middle line: distance from it and height blend, and the angle goes the short way plus one whole turn
      const ax = a.center[c] - mx, az = a.center[c + 2] - mz, bx = b.center[c] - mx, bz = b.center[c + 2] - mz
      const ra = Math.hypot(ax, az), rb = Math.hypot(bx, bz)
      const ta = Math.atan2(az, ax)
      let d = Math.atan2(bz, bx) - ta
      d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI
      const r = ra + (rb - ra) * e, t = ta + (d + 2 * Math.PI) * e
      x = mx + r * Math.cos(t); z = mz + r * Math.sin(t)
    } else if (path === 'melt') {
      // down into a puddle on the floor, and up again
      y = s.floor + (y - s.floor) * (1 - 0.94 * off)
      x = mx + (x - mx) * (1 + 0.7 * off); z = mz + (z - mz) * (1 + 0.7 * off)
    } else if (path === 'burst') {
      // out from the middle, each blob its own distance, and back in
      const my = (s.floor + s.top) / 2, dx = x - mx, dy = y - my, dz = z - mz, l = Math.hypot(dx, dy, dz) || 1
      const push = off * s.throw[i]
      x += (dx / l) * push; y += (dy / l) * push; z += (dz / l) * push
    }
    out.center[c] = x; out.center[c + 1] = y; out.center[c + 2] = z
    // sizes blend by ratio, so a blob ten times bigger is about three times bigger halfway
    for (let k = 0; k < 3; k++) out.scale[c + k] = Math.exp(s.logFrom[c + k] + (s.logTo[c + k] - s.logFrom[c + k]) * e)
    let qx = a.quat[q] + (b.quat[q] - a.quat[q]) * e, qy = a.quat[q + 1] + (b.quat[q + 1] - a.quat[q + 1]) * e
    let qz = a.quat[q + 2] + (b.quat[q + 2] - a.quat[q + 2]) * e, qw = a.quat[q + 3] + (b.quat[q + 3] - a.quat[q + 3]) * e
    const l = Math.hypot(qx, qy, qz, qw)
    if (l < 1e-6) { qx = a.quat[q]; qy = a.quat[q + 1]; qz = a.quat[q + 2]; qw = a.quat[q + 3] } else { qx /= l; qy /= l; qz /= l; qw /= l }
    out.quat[q] = qx; out.quat[q + 1] = qy; out.quat[q + 2] = qz; out.quat[q + 3] = qw
    for (let k = 0; k < 3; k++) out.color[c + k] = a.color[c + k] + (b.color[c + k] - a.color[c + k]) * e
    out.opacity[i] = a.opacity[i] + (b.opacity[i] - a.opacity[i]) * e
  }
}

/**
 * The amount shown `t` seconds into an endless there-and-back: it holds on the
 * first shape, shifts over `seconds`, holds on the second and shifts back.
 */
export function amountAt(t: number, seconds: number, hold = 0.8) {
  const cycle = 2 * (seconds + hold)
  const x = ((t % cycle) + cycle) % cycle
  if (x < hold) return 0
  if (x < hold + seconds) return (x - hold) / seconds
  if (x < 2 * hold + seconds) return 1
  return 1 - (x - 2 * hold - seconds) / seconds
}

/** A time at which `amountAt` gives `amount` on the way out (or, with `back`, on the way back). */
export function timeAt(amount: number, seconds: number, back = false, hold = 0.8) {
  const w = Math.min(1, Math.max(0, amount))
  return back ? 2 * hold + seconds + (1 - w) * seconds : hold + w * seconds
}
