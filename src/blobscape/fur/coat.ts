import { Blobs, type Vec3 } from '../../splat-core/blobs.ts'
import { quatFromAxes } from '../../splat-engine/fur.ts'
import { box, buildVoxels, ellipsoid, sphere, type VoxelPart } from '../../splat-engine/voxel.ts'
import { lightThroughSplats } from '../fuzzy/measure.ts'

/**
 * The Fur and grass lesson's two things, grown the way the engine grows the
 * Splat Creatures fox's coat (splat-engine/fur.ts): a skin cut on a grid, one
 * disc per cell, and strands out of it, each a long thin blob that leaves the
 * skin at a slant (`lift`) and strays a little (`wild`).
 *
 * The lesson adds what the engine leaves fixed, so each can be got wrong:
 * how wide a strand is (`thick`), whether the skin stays under the strands
 * (`undercoat`), and how many blobs make one strand (`segments`),
 * which only matters once a breeze bends them. Each thing has a fixed blob
 * budget: a strand of three blobs is three strands fewer.
 */
export type Thing = 'critter' | 'lawn'

export interface CoatOptions {
  /** A strand's length, in world units. */
  length: number
  /** How far strands stand off the skin, in radians: 0 lies flat, π/2 stands straight out. */
  lift: number
  /** How far strands stray from the way the coat lies, in radians either way. */
  wild: number
  /** Blobs in one strand, end to end. */
  segments: number
  /** A strand's width as a share of its length. */
  thick: number
  /** Keep the skin's discs under the strands. */
  undercoat: boolean
  /** Wind from the left, 0–1: it bends each strand more toward its tip. */
  breeze: number
}

export const DEFAULTS: Record<Thing, CoatOptions> = {
  critter: { length: 0.08, lift: (25 * Math.PI) / 180, wild: 0.4, segments: 1, thick: 0.07, undercoat: true, breeze: 0 },
  lawn: { length: 0.24, lift: (75 * Math.PI) / 180, wild: 0.3, segments: 1, thick: 0.045, undercoat: true, breeze: 0 },
}

/** Every blob the thing may use, skin and strands together. */
export const BUDGET: Record<Thing, number> = { critter: 9000, lawn: 9000 }

/** How far the breeze turns a strand's tip at full strength, before it would point straight downwind. */
const BEND = (85 * Math.PI) / 180
/** The wind blows toward +x. */
const WIND: Vec3 = [1, 0, 0]

export interface Shell {
  blobs: Blobs
  /** Whether strands grow from each disc (1), and how long they are there as a share of the coat's length; 0 is bare. */
  furred: Float32Array
  spacing: number
}

export interface Coat {
  blobs: Blobs
  strands: number
  /** How much further a strand's last blob leans than its first, in degrees, averaged over strands. */
  curl: number
}

/** A number 0–1 that is the same for the same pair of whole numbers. */
function hash(a: number, b: number) {
  const h = Math.sin(a * 12.9898 + b * 78.233 + 0.5) * 43758.5453
  return h - Math.floor(h)
}

const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** v turned by angle a about the unit axis k (Rodrigues). */
function turn(v: Vec3, k: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a), kv = cross(k, v), d = dot(k, v) * (1 - c)
  return [v[0] * c + kv[0] * s + k[0] * d, v[1] * c + kv[1] * s + k[1] * d, v[2] * c + kv[2] * s + k[2] * d]
}

/** The way a disc faces: its local z axis, turned by its rotation. */
function facing(q: ArrayLike<number>): Vec3 {
  const [x, y, z, w] = [q[0], q[1], q[2], q[3]]
  return [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]
}

const GINGER: Vec3 = [0.9, 0.56, 0.28]
const CREAM: Vec3 = [0.98, 0.88, 0.7]

/**
 * A round critter: a furry body with ears and feet, and bare eyes and nose.
 * The coat lies from the nose back and a little down, so nothing grows over
 * the eyes.
 */
function critterParts(): (VoxelPart & { fur: number })[] {
  const coat = (p: Vec3, n: Vec3): Vec3 => (n[1] < -0.25 || (n[2] > 0.55 && p[1] < 0.36) ? CREAM : GINGER)
  return [
    { shape: ellipsoid([0, 0.4, 0], [0.36, 0.33, 0.38]), color: coat, bone: 'body', fur: 1 },
    { shape: ellipsoid([-0.18, 0.76, -0.03], [0.08, 0.13, 0.045]), color: GINGER, bone: 'body', fur: 0.35 },
    { shape: ellipsoid([0.18, 0.76, -0.03], [0.08, 0.13, 0.045]), color: GINGER, bone: 'body', fur: 0.35 },
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ shape: ellipsoid([sx * 0.18, 0.08, sz * 0.17], [0.08, 0.07, 0.1]), color: CREAM, bone: 'body', fur: 0.4 }))),
    { shape: sphere([-0.12, 0.5, 0.35], 0.055), color: [0.08, 0.06, 0.06], bone: 'body', fur: 0 },
    { shape: sphere([0.12, 0.5, 0.35], 0.055), color: [0.08, 0.06, 0.06], bone: 'body', fur: 0 },
    { shape: sphere([0, 0.42, 0.39], 0.038), color: [0.85, 0.42, 0.45], bone: 'body', fur: 0 },
  ]
}

/** A patch of earth: grass grows from its top only. */
function lawnParts(): (VoxelPart & { fur: number })[] {
  return [{ shape: box([0, -0.06, 0], [0.62, 0.06, 0.42], 0.02), color: [0.42, 0.29, 0.18], bone: 'body', fur: 1 }]
}

const shells = new Map<Thing, Shell>()

/** The thing's skin, cut once and kept. */
export function shellOf(thing: Thing): Shell {
  const had = shells.get(thing)
  if (had) return had
  const parts = thing === 'critter' ? critterParts() : lawnParts()
  const spacing = thing === 'critter' ? 0.022 : 0.026
  const built = buildVoxels({
    bones: [{ name: 'body', parent: -1, head: [0, 0, 0] }],
    parts, spacing, blocks: true, trueShell: true, disc: 0.75,
    light: { dir: [-0.45, 0.75, 0.5], ambient: 0.5, shadow: 0.4 },
  })
  const furred = new Float32Array(built.blobs.count)
  for (let i = 0; i < built.blobs.count; i++) {
    const n = facing(built.blobs.quat.subarray(i * 4, i * 4 + 4))
    const p = built.blobs.center.subarray(i * 3, i * 3 + 3)
    // short round the eyes and nose, so the face stays clear
    const face = thing === 'critter' && n[2] > 0.45 && p[1] > 0.33 && p[1] < 0.62 ? 0.45 : 1
    furred[i] = thing === 'critter' || n[1] > 0.7 ? parts[built.partOf[i]].fur * face : 0
  }
  const shell = { blobs: built.blobs, furred, spacing }
  shells.set(thing, shell)
  return shell
}

/** Blobs the skin takes: the bare parts always, the furred ones only as an undercoat. */
export function skinBlobs(thing: Thing, undercoat: boolean): number {
  const shell = shellOf(thing)
  if (undercoat) return shell.blobs.count
  let n = 0
  for (let i = 0; i < shell.blobs.count; i++) if (!shell.furred[i]) n++
  return n
}

/** How many strands the budget leaves for strands of this many blobs, after the skin. */
export function strandsFor(thing: Thing, segments: number, undercoat: boolean): number {
  return Math.max(0, Math.floor((BUDGET[thing] - skinBlobs(thing, undercoat)) / segments))
}

/** Grows the thing's coat. The same options always grow the same coat. */
export function growCoat(thing: Thing, o: CoatOptions): Coat {
  const shell = shellOf(thing)
  const src = shell.blobs, s = shell.spacing
  const K = Math.max(1, Math.round(o.segments))
  const strands = strandsFor(thing, K, o.undercoat)
  const blobs = new Blobs(src.count + strands * K)
  for (let i = 0; i < src.count; i++) if (o.undercoat || !shell.furred[i]) {
    const b = src.get(i)
    // the skin under a coat is its darker undercoat
    if (shell.furred[i] && thing === 'critter') b.color = [b.color[0] * 0.72, b.color[1] * 0.72, b.color[2] * 0.72]
    blobs.push(b)
  }
  const grass = thing === 'lawn'
  const flow: Vec3 = [0, -0.35, -1]
  const steps = 24
  const cells: number[] = []
  for (let i = 0; i < src.count; i++) if (shell.furred[i]) cells.push(i)
  // in a shuffled order (the same every time), or a thin coat would fall in the grid's rows
  cells.sort((a, b) => hash(a, 9999) - hash(b, 9999))
  let curlSum = 0, made = 0, at0 = -1, first = 0
  for (let j = 0; j < strands; j++) {
    // strands spread evenly over the furred cells, so a thin coat is thin everywhere, not missing somewhere
    const slot = Math.floor((j * cells.length) / strands)
    if (slot !== at0) { at0 = slot; first = j }
    const i = cells[slot], k = j - first
    const h = (m: number) => hash(i * 7 + m, k)
    const c: Vec3 = [src.center[i * 3], src.center[i * 3 + 1], src.center[i * 3 + 2]]
    const n = facing(src.quat.subarray(i * 4, i * 4 + 4))
    // the way the coat lies, laid on the skin; grass has no way, so each blade picks its own
    let t: Vec3 = grass ? [Math.cos(h(8) * 6.283), 0, Math.sin(h(8) * 6.283)] : flow
    t = [t[0] - n[0] * dot(t, n), t[1] - n[1] * dot(t, n), t[2] - n[2] * dot(t, n)]
    if (Math.hypot(t[0], t[1], t[2]) < 1e-3) t = Math.abs(n[1]) < 0.9 ? cross(n, [0, 1, 0]) : cross(n, [1, 0, 0])
    t = norm(t)
    const side = cross(n, t)
    // rooted anywhere in the cell, so strands never line up in the grid's rows
    const u = (h(1) - 0.5) * s * 1.2, v = (h(2) - 0.5) * s * 1.2
    const root: Vec3 = [c[0] + t[0] * u + side[0] * v, c[1] + t[1] * u + side[1] * v, c[2] + t[2] * u + side[2] * v]
    const lift = Math.min(Math.PI / 2, o.lift + (h(3) - 0.5) * o.wild)
    const yaw = (h(4) - 0.5) * 2 * o.wild
    const along: Vec3 = turn(t, n, yaw)
    const d0 = norm([along[0] * Math.cos(lift) + n[0] * Math.sin(lift), along[1] * Math.cos(lift) + n[1] * Math.sin(lift), along[2] * Math.cos(lift) + n[2] * Math.sin(lift)])
    const len = Math.max(s * 1.5, o.length * shell.furred[i] * (0.65 + 0.7 * h(5)))
    // the breeze turns the strand toward the wind, more toward the tip, never past pointing downwind
    const axisRaw = cross(d0, WIND)
    const room = Math.acos(Math.max(-1, Math.min(1, dot(d0, WIND))))
    const axis = Math.hypot(axisRaw[0], axisRaw[1], axisRaw[2]) > 1e-4 ? norm(axisRaw) : null
    const full = Math.min(room * 0.95, o.breeze * BEND * (0.8 + 0.4 * h(9)))
    const at = (f: number): Vec3 => (axis ? turn(d0, axis, full * f * f) : d0)
    // walk along the bent strand; K evenly spaced points on it give the blobs, each a straight chord of the curve
    const pts: Vec3[] = [root]
    let p = root
    for (let q = 0; q < steps; q++) {
      const d = at((q + 0.5) / steps)
      p = [p[0] + (d[0] * len) / steps, p[1] + (d[1] * len) / steps, p[2] + (d[2] * len) / steps]
      pts.push(p)
    }
    const chords = chordsOf(pts, K)
    const width = Math.max(s * (grass ? 0.35 : 0.3), len * o.thick)
    const base = src.color.subarray(i * 3, i * 3 + 3)
    const tone = 0.82 + 0.36 * h(6)
    const green: Vec3 = h(10) < 0.5 ? [0.38, 0.62, 0.22] : [0.5, 0.7, 0.26]
    for (let m = 0; m < K; m++) {
      const [a, b] = chords[m]
      const dir = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]])
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      // darker toward the root, where the coat shades itself
      const f = (m + 0.5) / K
      const shade = grass ? 0.5 + 0.55 * f : 0.85 + 0.2 * f
      const col: Vec3 = grass ? [green[0] * shade * tone, green[1] * shade * tone, green[2] * shade * tone] : [base[0] * shade * tone, base[1] * shade * tone, base[2] * shade * tone]
      let x = cross(n, dir)
      if (Math.hypot(x[0], x[1], x[2]) < 1e-4) x = cross(dir, Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])
      x = norm(x)
      const y = cross(dir, x)
      blobs.push({
        center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
        // a blade is a flat ribbon, a hair is round-ish
        scale: grass ? [width, width * 0.25, seg * 0.4] : [width, width * 0.6, seg * 0.4],
        quat: quatFromAxes(x, y, dir),
        color: [Math.min(1, col[0]), Math.min(1, col[1]), Math.min(1, col[2])],
        opacity: 0.7 + 0.25 * h(7),
      })
    }
    if (K > 1) {
      const first = norm(sub(chords[0][1], chords[0][0])), last = norm(sub(chords[K - 1][1], chords[K - 1][0]))
      curlSum += (Math.acos(Math.max(-1, Math.min(1, dot(first, last)))) * 180) / Math.PI
    }
    made++
  }
  return { blobs, strands, curl: made ? curlSum / made : 0 }
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
/** K chords of the walked curve, end to end. */
function chordsOf(pts: Vec3[], K: number): [Vec3, Vec3][] {
  const out: [Vec3, Vec3][] = []
  const last = pts.length - 1
  for (let m = 0; m < K; m++) {
    const a = (m / K) * last, b = ((m + 1) / K) * last
    out.push([lerpAt(pts, a), lerpAt(pts, b)])
  }
  return out
}
function lerpAt(pts: Vec3[], at: number): Vec3 {
  const i = Math.min(pts.length - 2, Math.floor(at)), f = at - i
  const a = pts[i], b = pts[i + 1]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

/** Rays straight through the critter's body, front to back and side to side, on a grid over its middle. */
const THROUGH: [Vec3, Vec3][] = []
for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
  const y = 0.4 + b * 0.06
  THROUGH.push([[a * 0.07, y, -0.9], [a * 0.07, y, 0.9]], [[-0.9, y, a * 0.07], [0.9, y, a * 0.07]])
}

/** How much light gets straight through the critter's body, 0–1, averaged over the rays. */
export function lightThrough(blobs: Blobs): number {
  return THROUGH.reduce((a, [p, q]) => a + lightThroughSplats(blobs, p, q), 0) / THROUGH.length
}

/** Looking down on the lawn from the lesson's camera (azimuth 25°, up 30°). */
const LOOK: Vec3 = norm([Math.sin((25 * Math.PI) / 180) * Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), Math.cos((25 * Math.PI) / 180) * Math.cos(Math.PI / 6)])

/** Share of the lawn's earth you can see between the blades from the lesson's camera, sampled on a grid in its middle. */
export function groundShowing(blobs: Blobs): number {
  let sum = 0, n = 0
  for (let gx = -6; gx <= 6; gx++) for (let gz = -4; gz <= 4; gz++) {
    const from: Vec3 = [gx * 0.037 + 0.013, 0.03, gz * 0.037 + 0.021]
    sum += lightThroughSplats(blobs, from, [from[0] + LOOK[0], from[1] + LOOK[1], from[2] + LOOK[2]])
    n++
  }
  return sum / n
}
