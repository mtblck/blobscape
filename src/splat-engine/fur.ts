import { Blobs, type Quat, type Vec3 } from '../splat-core/blobs.ts'
import { emptySkin } from './rig.ts'
import type { SculptPart, Sculpted } from './sculpt.ts'

/**
 * Fur for a sculpted creature (sculpt.ts): strands grown out of its skin.
 *
 * The cut creature is a shell of round discs, one per grid cell; textured, it
 * reads as bricks. Fur is what a Gaussian is good at: every strand here is one
 * long, thin blob that leaves the skin at a slant and lies the way the coat
 * runs (`flow`), rooted anywhere inside its cell so the grid never shows. The
 * shell stays underneath, a shade darker, as the undercoat: it keeps the body
 * solid where strands part, and the strands' soft tips make the outline soft.
 *
 * A strand hangs on its root cell's bones with the same weights, so the fur
 * bends with the body, and it is still a plain blob: files, sprite sheets and
 * Shape Shifter take it as they take any other.
 */
export interface Fur {
  /** How long a strand is, in world units. */
  length: number
  /** Which way the coat lies at a surface point. Only its part along the skin counts. */
  flow: Vec3 | ((p: Vec3, n: Vec3) => Vec3)
  /** How far strands stand up from the skin, in radians: 0 lies flat. */
  lift?: number
  /** How far strands stray from the flow, in radians either way. */
  wild?: number
  /** Strands here for each strand on plain fur of the same area (a ruff is thicker). */
  density?: number
  /** A factor on the length at a surface point: a ruff that grows longer toward the chest. */
  long?: (p: Vec3, n: Vec3) => number
  /** How dark the undercoat (the shell under the strands) is, as a share of its color. */
  under?: number
  /** Strand color at a point, if not the skin's own (a pale tip on dark fur). Lit as the skin under it is. */
  color?: (p: Vec3, n: Vec3) => Vec3
}

/** A part of a sculpted creature that may grow fur. */
export interface FurryPart extends SculptPart {
  /** The fur that grows on it; left out, bare skin. */
  fur?: Fur
}

/** A number 0–1 that is the same for the same pair of whole numbers. */
function hash(a: number, b: number) {
  const h = Math.sin(a * 12.9898 + b * 78.233 + 0.5) * 43758.5453
  return h - Math.floor(h)
}

const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** The rotation whose x, y and z axes are the given (orthonormal, right-handed) columns. */
export function quatFromAxes(x: Vec3, y: Vec3, z: Vec3): Quat {
  const t = x[0] + y[1] + z[2]
  if (t > 0) {
    const s = Math.sqrt(t + 1) * 2
    return [(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, s / 4]
  }
  if (x[0] > y[1] && x[0] > z[2]) {
    const s = Math.sqrt(1 + x[0] - y[1] - z[2]) * 2
    return [s / 4, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s]
  }
  if (y[1] > z[2]) {
    const s = Math.sqrt(1 + y[1] - x[0] - z[2]) * 2
    return [(y[0] + x[1]) / s, s / 4, (z[1] + y[2]) / s, (z[0] - x[2]) / s]
  }
  const s = Math.sqrt(1 + z[2] - x[0] - y[1]) * 2
  return [(z[0] + x[2]) / s, (z[1] + y[2]) / s, s / 4, (x[1] - y[0]) / s]
}

/** The way a disc of the shell faces: its local z axis, turned by its rotation. */
function facing(q: ArrayLike<number>): Vec3 {
  const [x, y, z, w] = [q[0], q[1], q[2], q[3]]
  return [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]
}

/**
 * Grows `total - shell.blobs.count` strands over the furred parts of `shell`
 * (cut from `parts`, in the same order), spread by area and `density`, so the
 * creature comes out at exactly `total` blobs. The same shell and parts always
 * grow the same fur.
 */
export function growFur(shell: Sculpted, parts: FurryPart[], total: number): Sculpted {
  const s = shell.spacing
  const src = shell.blobs
  const n0 = src.count
  const want = Math.max(0, total - n0)
  // each cell's share of the strands
  let sum = 0
  const share = new Float32Array(n0)
  for (let i = 0; i < n0; i++) {
    const fur = parts[shell.partOf[i]]?.fur
    if (fur) sum += share[i] = fur.density ?? 1
  }
  const blobs = new Blobs(n0 + want)
  const partOf = new Uint16Array(n0 + want)
  const skin = emptySkin(n0 + want)
  for (let i = 0; i < n0; i++) {
    const b = src.get(i)
    const fur = parts[shell.partOf[i]]?.fur
    // under the fur the shell is the undercoat, in the strands' shade
    if (fur && want) { const u = fur.under ?? 0.72; b.color = [b.color[0] * u, b.color[1] * u, b.color[2] * u] }
    blobs.push(b)
  }
  partOf.set(shell.partOf.subarray(0, n0))
  skin.joints.set(shell.skin.joints.subarray(0, n0 * 4))
  skin.weights.set(shell.skin.weights.subarray(0, n0 * 4))
  if (!want || !sum) return { ...shell, blobs, skin, partOf }

  let last = n0 - 1
  while (!share[last]) last--
  let acc = 0, made = 0
  for (let i = 0; i < n0; i++) {
    if (!share[i]) continue
    const from = made
    acc += (share[i] / sum) * want
    // the last cell takes whatever rounding left over
    const to = i === last ? want : Math.min(want, Math.floor(acc))
    const fur = parts[shell.partOf[i]].fur!
    const c: Vec3 = [src.center[i * 3], src.center[i * 3 + 1], src.center[i * 3 + 2]]
    const n = facing(src.quat.subarray(i * 4, i * 4 + 4))
    const f = typeof fur.flow === 'function' ? fur.flow(c, n) : fur.flow
    // the flow laid on the skin; where it points straight out, any way along the skin will do
    let t: Vec3 = [f[0] - n[0] * dot(f, n), f[1] - n[1] * dot(f, n), f[2] - n[2] * dot(f, n)]
    if (Math.hypot(t[0], t[1], t[2]) < 1e-3) t = Math.abs(n[1]) < 0.9 ? cross(n, [0, 1, 0]) : cross(n, [1, 0, 0])
    t = norm(t)
    const side = cross(n, t)
    const base = src.color.subarray(i * 3, i * 3 + 3)
    const length = fur.length * (fur.long?.(c, n) ?? 1)
    for (let k = from; k < to; k++) {
      const h = (m: number) => hash(i * 7 + m, k)
      // rooted anywhere in the cell, so strands never line up in rows
      const u = (h(1) - 0.5) * s * 1.2, v = (h(2) - 0.5) * s * 1.2
      const root: Vec3 = [c[0] + t[0] * u + side[0] * v, c[1] + t[1] * u + side[1] * v, c[2] + t[2] * u + side[2] * v]
      const lift = (fur.lift ?? 0.35) + (h(3) - 0.5) * (fur.wild ?? 0.4)
      const turn = (h(4) - 0.5) * 2 * (fur.wild ?? 0.4)
      const along: Vec3 = [t[0] * Math.cos(turn) + side[0] * Math.sin(turn), t[1] * Math.cos(turn) + side[1] * Math.sin(turn), t[2] * Math.cos(turn) + side[2] * Math.sin(turn)]
      const d = norm([along[0] * Math.cos(lift) + n[0] * Math.sin(lift), along[1] * Math.cos(lift) + n[1] * Math.sin(lift), along[2] * Math.cos(lift) + n[2] * Math.sin(lift)])
      // never shorter than a cell and a half, or the strand is just a dot
      const len = Math.max(s * 1.5, length * (0.65 + 0.7 * h(5)))
      const width = Math.max(s * 0.3, len * 0.07)
      const x = norm(cross(n, d)), y = cross(d, x)
      const tip: Vec3 = [root[0] + d[0] * len, root[1] + d[1] * len, root[2] + d[2] * len]
      const own = fur.color?.(tip, n)
      // lit as the skin under it; a strand a little lighter or darker than its neighbors
      const lit = own ? shadeOf(src, i, parts[shell.partOf[i]], c, n) : 1
      const tone = 0.82 + 0.36 * h(6)
      const col: Vec3 = own
        ? [own[0] * lit * tone, own[1] * lit * tone, own[2] * lit * tone]
        : [base[0] * tone, base[1] * tone, base[2] * tone]
      blobs.push({
        center: [root[0] + d[0] * len * 0.5, root[1] + d[1] * len * 0.5, root[2] + d[2] * len * 0.5],
        // thinnest across the skin, so live light reads it as facing out
        scale: [width, width * 0.6, len * 0.4],
        quat: quatFromAxes(x, y, d),
        color: [Math.min(1, col[0]), Math.min(1, col[1]), Math.min(1, col[2])],
        opacity: 0.7 + 0.25 * h(7),
      })
      partOf[n0 + made] = shell.partOf[i]
      skin.joints.set(shell.skin.joints.subarray(i * 4, i * 4 + 4), (n0 + made) * 4)
      skin.weights.set(shell.skin.weights.subarray(i * 4, i * 4 + 4), (n0 + made) * 4)
      made++
    }
  }
  return { blobs, skin, skeleton: shell.skeleton, partOf, spacing: s }
}

/** How lit the shell is at cell i: its baked color over the part's own color there. */
function shadeOf(src: Blobs, i: number, part: FurryPart, c: Vec3, n: Vec3) {
  const own = typeof part.color === 'function' ? part.color(c, n) : part.color
  const a = own[0] + own[1] + own[2]
  return a > 0.01 ? (src.color[i * 3] + src.color[i * 3 + 1] + src.color[i * 3 + 2]) / a : 1
}
