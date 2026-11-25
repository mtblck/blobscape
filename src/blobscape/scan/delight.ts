import { Blobs, covariance, type Vec3 } from '../../splat-core/blobs.ts'
import { linearToSrgb, srgbToLinear, toOklab } from '../../splat-core/color.ts'
import { blobNormal, flatness } from '../../splat-engine/light.ts'
import { bakedColor } from '../../splat-engine/voxel.ts'

/**
 * Taking a scan's own light out, so our sun, moon and lamps can light it (issue #463). A phone scan stores what the
 * camera saw: each blob's paint times the light that fell on it the day it was scanned. Nothing in the file says what
 * that light was, so it is worked out from the scan itself, in our own way:
 *
 * 1. The blobs are poured into a coarse grid of how much is there, which is what everything else asks: how open a
 *    blob is to the sky round it (`open`, the ambient light that reaches a crevice or the foot of a wall), which of its
 *    two faces is its outside (the more open one; level sheets such as a table take their top), and whether a way
 *    toward a light is blocked (cast shadow).
 * 2. One light from a direction over ambient is tried from every way round (`WAYS`) at several strengths. For each
 *    try every blob's light is `open + strength · facing · unblocked`, and the try that best explains the scan's
 *    lightness is kept. Blobs are only compared with blobs of their own hue nearby (`HUE_STEP`, `NEAR_SHARE`), so a
 *    white table beside a dark mug is a difference of paint, not of light, and a big difference within a group counts
 *    no more than `CAP` (a painted stripe is not shade).
 * 3. Each blob's color is divided by the light it found, scaled so a blob in full light stays as it was. What comes
 *    out is the paint (`Delit.blobs`), which the engine's live lights, or `litScan` for a baked sun, light again.
 *
 * It can't tell a dark paint from a deep shade the light alone would make, and highlights that move with the view
 * (color by angle) stay as they were. Pure, tested.
 */

/** What `takeOutLight` found and made. */
export interface Delit {
  /** The scan's paint: its colors with the light it was scanned in divided out (sRGB, as `Blobs` keeps them). */
  blobs: Blobs
  /** Each blob's outside (unit, three a blob). */
  normal: Float32Array
  /** How open each blob is to the light from round it, 0 shut in to 1 open. */
  open: Float32Array
  /** The scanned light: the way toward it, how much brighter its full light was than the light from round about, and how much of the scan's shading it explains (0 to 1). */
  found: { way: Vec3; strength: number; explained: number }
  /** How much of the way toward `way` each point can see (0 to 1), through the grid of what is there. */
  sees: (p: ArrayLike<number>, n: ArrayLike<number>, way: ArrayLike<number>) => number
}

/** How far round a hue group reaches, in OKLab a and b. */
export const HUE_STEP = 0.035
/** How far across a group reaches, as a share of the scan's longest side. */
export const NEAR_SHARE = 0.25
/** The most a blob's difference from its group counts, in natural log of lightness (about 2.2 times). */
export const CAP = 1.2
/** The most a blob is brightened when its light is taken out, so a deep shadow's noise isn't blown up. */
export const MOST_LIFT = 4
/** The grid's cells along the scan's longest side. */
export const CELLS = 56
/** How far (cells) a face looks round itself when it is open near both ways. */
const FAR_STEPS = 32
/** How much more a face turned straight up counts as open, when telling outside from in. */
const UP_LEAN = 0.4
/** How many blobs at most the light is looked for among (spread through the scan). */
const SAMPLE = 24000
/** The strengths tried. */
const STRENGTHS = [0, 0.25, 0.5, 0.8, 1.2, 1.8, 2.8, 4.5, 7]

/** Ways toward a light that are tried: a Fibonacci spread over the sphere, all but straight up from under the floor. */
export const WAYS: Vec3[] = (() => {
  const out: Vec3[] = []
  const n = 120
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * 2.399963
    if (y > -0.25) out.push([r * Math.cos(a), y, r * Math.sin(a)])
  }
  return out
})()

/** The light from round about at a blob as open as `open`: some always reaches, thrown off what is round it. */
export const skyOf = (open: number) => AROUND_LEAST + (1 - AROUND_LEAST) * open
/** The share of the light from round about that reaches even a shut-in blob. */
export const AROUND_LEAST = 0.5

/** The grid of what is there: opacity poured into cells, and a march through it. */
export function solidGrid(b: Blobs) {
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < b.count; i++) for (let k = 0; k < 3; k++) {
    const v = b.center[i * 3 + k]
    if (v < lo[k]) lo[k] = v
    if (v > hi[k]) hi[k] = v
  }
  const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 1e-6)
  const cell = span / (CELLS - 2)
  for (let k = 0; k < 3; k++) lo[k] -= cell * 1.37 // off the scan by an odd share, so a level table never lies on a cell boundary
  const n = [0, 1, 2].map((k) => Math.max(1, Math.ceil((hi[k] - lo[k]) / cell) + 2))
  const d = new Float32Array(n[0] * n[1] * n[2])
  const index = (x: number, y: number, z: number) => {
    const i = Math.floor((x - lo[0]) / cell), j = Math.floor((y - lo[1]) / cell), k = Math.floor((z - lo[2]) / cell)
    return i < 0 || j < 0 || k < 0 || i >= n[0] || j >= n[1] || k >= n[2] ? -1 : (k * n[1] + j) * n[0] + i
  }
  for (let i = 0; i < b.count; i++) {
    const c = index(b.center[i * 3], b.center[i * 3 + 1], b.center[i * 3 + 2])
    if (c >= 0) d[c] += b.opacity[i]
  }
  // a full cell: the upper quarter of the cells with anything in them
  const full = Array.from(d.filter((v) => v > 0)).sort((x, y) => x - y)
  const ref = full.length ? full[Math.floor(full.length * 0.75)] : 1
  const thick = 2.5 / Math.max(ref, 1e-6)
  /** How much light gets from `p`, stepped off its face `n`, `steps` cells along `way`. */
  // steps shorter than a cell, so a march slanting through a one-cell wall can't step over it; each counts its share
  const stride = cell * 0.7
  const through = (p: ArrayLike<number>, nrm: ArrayLike<number>, way: ArrayLike<number>, steps: number) => {
    // a cell off the face, so a slanting march clears the layer the face lies in, and never counting the blob's own cell, which holds the surface it lies on
    const own = index(p[0], p[1], p[2])
    let x = p[0] + nrm[0] * cell * 1.1, y = p[1] + nrm[1] * cell * 1.1, z = p[2] + nrm[2] * cell * 1.1
    let sum = 0
    for (let s = 0; s < steps / 0.7; s++) {
      x += way[0] * stride; y += way[1] * stride; z += way[2] * stride
      const c = index(x, y, z)
      if (c < 0) break
      if (c !== own) sum += d[c] * 0.7
      if (sum * thick > 6) break
    }
    return Math.exp(-sum * thick)
  }
  // blobs in one cell facing about one way ask the same thing, a scan's many thousands of times over: ask once
  const memo = new Map<number, number>()
  const bin = (v: ArrayLike<number>, k: number) => ((Math.round(v[0] * k) + k) * (2 * k + 1) + Math.round(v[1] * k) + k) * (2 * k + 1) + Math.round(v[2] * k) + k
  const asked = (p: ArrayLike<number>, nrm: ArrayLike<number>, way: ArrayLike<number>, steps: number) => {
    const own = index(p[0], p[1], p[2])
    const key = ((own * 125 + bin(nrm, 2)) * 4913 + bin(way, 8)) * 512 + Math.min(steps, 511)
    let t = memo.get(key)
    if (t === undefined) { t = through(p, nrm, way, steps); memo.set(key, t) }
    return t
  }
  return { cell, through: asked, reach: Math.min(n[0] + n[1] + n[2], 511) }
}

/** Six ways round a face, leaning out from it, for how open it is. */
function aroundOf(n: Vec3): Vec3[] {
  const t: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const u = norm(cross(n, t)), v = cross(n, u)
  const out: Vec3[] = [n]
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, c = Math.cos(a) * 0.8, s = Math.sin(a) * 0.8
    out.push(norm([n[0] * 0.6 + u[0] * c + v[0] * s, n[1] * 0.6 + u[1] * c + v[1] * s, n[2] * 0.6 + u[2] * c + v[2] * s]))
  }
  return out
}

/**
 * The scan's paint, with the light it was scanned in found and taken out. `amount` (0 to 1) takes out that share of
 * it, in light's own terms (the light found to that power).
 */
export function takeOutLight(b: Blobs, amount = 1): Delit {
  const count = b.count
  const grid = solidGrid(b)
  const normal = new Float32Array(count * 3), open = new Float32Array(count)
  let mx = 0, mz = 0
  for (let i = 0; i < count; i++) { mx += b.center[i * 3]; mz += b.center[i * 3 + 2] }
  mx /= count || 1; mz /= count || 1
  const OPEN_STEPS = 6
  for (let i = 0; i < count; i++) {
    const p = b.center.subarray(i * 3, i * 3 + 3)
    let n: Vec3 = blobNormal(covariance(b, i))
    const back: Vec3 = [-n[0], -n[1], -n[2]]
    let front = grid.through(p, n, n, OPEN_STEPS), behind = grid.through(p, back, back, OPEN_STEPS)
    if (Math.abs(front - behind) <= 0.15) {
      // open near both ways: look further round each side, since the inside of a closed shell meets its far wall, and
      // lean to a face turned up (a scan is seen from above, its underside hardly ever)
      const far = (m: Vec3) => { let o = 0; for (const w of aroundOf(m)) o += grid.through(p, m, w, FAR_STEPS); return o / 6 + UP_LEAN * Math.max(0, m[1]) }
      front = far(n); behind = far(back)
    }
    if (Math.abs(front - behind) > 0.05) { if (behind > front) n = back }
    else {
      // open both ways (a table, a lone sheet): a level face takes its top, an upright one faces away from the middle
      const out = Math.abs(n[1]) > 0.5 ? [0, 1, 0] : [p[0] - mx, 0, p[2] - mz]
      if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = back
    }
    normal.set(n, i * 3)
    let o = 0
    for (const w of aroundOf(n)) o += grid.through(p, n, w, OPEN_STEPS)
    open[i] = o / 6
  }

  // the blobs the light is looked for among, and each one's group: its hue, and where it is
  const lum = new Float32Array(count), weight = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const r = srgbToLinear(b.color[i * 3]), g = srgbToLinear(b.color[i * 3 + 1]), bl = srgbToLinear(b.color[i * 3 + 2])
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * bl
    const top = Math.max(b.color[i * 3], b.color[i * 3 + 1], b.color[i * 3 + 2])
    // faint blobs, blown-out ones and near-black ones say little about the light
    weight[i] = b.opacity[i] < 0.2 || top > 0.985 || lum[i] < 0.003 ? 0 : b.opacity[i] * (0.4 + 0.6 * flatness(covariance(b, i)))
  }
  const step = Math.max(1, Math.floor(count / SAMPLE))
  const picked: number[] = []
  for (let i = 0; i < count; i += step) if (weight[i] > 0) picked.push(i)
  const span = grid.cell * (CELLS - 2), near = span * NEAR_SHARE
  const groupKeys = new Map<string, number>()
  const group = new Int32Array(picked.length)
  for (const [j, i] of picked.entries()) {
    const [, a, bb] = toOklab([b.color[i * 3], b.color[i * 3 + 1], b.color[i * 3 + 2]])
    const key = [Math.round(a / HUE_STEP), Math.round(bb / HUE_STEP), Math.floor(b.center[i * 3] / near), Math.floor(b.center[i * 3 + 1] / near), Math.floor(b.center[i * 3 + 2] / near)].join(',')
    let g = groupKeys.get(key)
    if (g === undefined) { g = groupKeys.size; groupKeys.set(key, g) }
    group[j] = g
  }
  const groups = groupKeys.size
  const logY = picked.map((i) => Math.log(lum[i] + 0.002))

  /** How badly a light explains the picked blobs: the spread of what is left once each group's own paint is taken off. */
  const mean = new Float64Array(groups), wsum = new Float64Array(groups)
  const spread = (light: (j: number) => number) => {
    mean.fill(0); wsum.fill(0)
    const z = new Float64Array(picked.length)
    for (const [j, i] of picked.entries()) {
      z[j] = logY[j] - Math.log(light(j))
      mean[group[j]] += weight[i] * z[j]
      wsum[group[j]] += weight[i]
    }
    for (let g = 0; g < groups; g++) mean[g] /= wsum[g] || 1
    let e = 0
    for (const [j, i] of picked.entries()) {
      // a group of one says nothing
      if (wsum[group[j]] <= weight[i] + 1e-9) continue
      const dz = Math.min(Math.abs(z[j] - mean[group[j]]), CAP)
      e += weight[i] * dz * dz
    }
    return e
  }
  const flat = spread(() => 1)
  let best = { way: [0, 1, 0] as Vec3, strength: 0, e: spread((j) => skyOf(open[picked[j]])) }
  const facing = new Float32Array(picked.length)
  for (const way of WAYS) {
    for (const [j, i] of picked.entries()) {
      const n = normal.subarray(i * 3, i * 3 + 3)
      const f = n[0] * way[0] + n[1] * way[1] + n[2] * way[2]
      facing[j] = f > 0 ? f * grid.through(b.center.subarray(i * 3, i * 3 + 3), n, way, grid.reach) : 0
    }
    for (const s of STRENGTHS) {
      if (!s) continue
      const e = spread((j) => skyOf(open[picked[j]]) + s * facing[j])
      if (e < best.e) best = { way, strength: s, e }
    }
  }
  const explained = flat > 0 ? Math.max(0, 1 - best.e / flat) : 0

  // divide it out: full light (open, facing the light square on, nothing in the way) keeps its color
  const out = b.clone()
  const fullLight = 1 + best.strength
  const sees = (p: ArrayLike<number>, n: ArrayLike<number>, way: ArrayLike<number>) => grid.through(p, n, way, grid.reach)
  for (let i = 0; i < count; i++) {
    const n = normal.subarray(i * 3, i * 3 + 3), p = b.center.subarray(i * 3, i * 3 + 3)
    const f = n[0] * best.way[0] + n[1] * best.way[1] + n[2] * best.way[2]
    const light = skyOf(open[i]) + (f > 0 && best.strength ? best.strength * f * sees(p, n, best.way) : 0)
    let lift = Math.min(MOST_LIFT, (fullLight / light) ** amount)
    const lin = [0, 1, 2].map((k) => srgbToLinear(b.color[i * 3 + k]))
    const top = Math.max(lin[0], lin[1], lin[2])
    if (top * lift > 1) lift = Math.max(1, 1 / Math.max(top, 1e-6))
    for (let k = 0; k < 3; k++) out.color[i * 3 + k] = linearToSrgb(lin[k] * lift)
  }
  return { blobs: out, normal, open, found: { way: best.way, strength: best.strength, explained }, sees }
}

/**
 * The paint lit by a baked sun, as the cutter lights a scene's parts (voxel.ts `bakedColor`): ambient where the blob
 * is open, the sun by how its outside faces it and whether anything stands in the way, and the light's ramp. For a
 * scan set down as a land under a baked sun.
 */
export function litScan(d: Delit, light: { dir: ArrayLike<number>; ambient: number; shadow: number; ramp?: number }): Blobs {
  const b = d.blobs.clone()
  const sun = norm([light.dir[0], light.dir[1], light.dir[2]])
  for (let i = 0; i < b.count; i++) {
    const n = d.normal.subarray(i * 3, i * 3 + 3), p = b.center.subarray(i * 3, i * 3 + 3)
    const f = Math.max(0, n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2])
    const seen = f > 0 ? 1 - light.shadow * (1 - d.sees(p, n, sun)) : 1
    const lit = f * seen
    const shade = light.ambient * (0.4 + 0.6 * d.open[i]) + (1 - light.ambient) * lit
    b.color.set(bakedColor([b.color[i * 3], b.color[i * 3 + 1], b.color[i * 3 + 2]], shade, lit, light.ramp ?? 0), i * 3)
  }
  return b
}

/**
 * How high the scanned light stood, in words: "straight above", "high up", "part way up", "low down", "below". Only its
 * height: a scan's own left and right are wherever the phone happened to start.
 */
export function wayInWords(way: ArrayLike<number>): string {
  const up = Math.asin(Math.max(-1, Math.min(1, way[1]))) * (180 / Math.PI)
  return up > 70 ? 'straight above' : up > 40 ? 'high up' : up > 12 ? 'part way up' : up > -5 ? 'low down' : 'below'
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
