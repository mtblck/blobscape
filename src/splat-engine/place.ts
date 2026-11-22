import type { Quat, Vec3 } from '../splat-core/blobs.ts'
import { axisAngle, rotate } from './rig.ts'
import type { Shape, VoxelPart } from './voxel.ts'

/**
 * Setting a thing down somewhere else: its foot moved to a new point, turned about the upright and sized evenly. Shared
 * by Scene Creator's placed props (project.ts) and by a description's placed parts (`PartDoc.placed`, sceneDoc.ts), so
 * a prop set down in a scene is cut the same way however it got there.
 */

/** Where a thing is set down: its foot goes to `at`, turned `turn` degrees about the upright (counterclockwise seen from above), `size` times as big. */
export interface Placement {
  at: Vec3
  turn: number
  size: number
}

/** A placement worked out: the turn as a quaternion and the point maps both ways. */
export interface Placer {
  /** The turn. */
  q: Quat
  /** How big. */
  size: number
  /** A point of the prop's description to where it now stands. */
  point(p: ArrayLike<number>): Vec3
  /** Back: a point where it stands to the description's. */
  back(p: ArrayLike<number>): Vec3
  /** A direction of the description to the way it now points. */
  dir(v: ArrayLike<number>): Vec3
  /** Back: a direction to the description's. */
  backDir(v: ArrayLike<number>): Vec3
  /** Whether it changes nothing. */
  same: boolean
}

const DEG = Math.PI / 180
const conj = (q: ArrayLike<number>): Quat => [-q[0], -q[1], -q[2], q[3]]
const add = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: ArrayLike<number>, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]

export function placer(foot: ArrayLike<number>, pl: Placement): Placer {
  const q = axisAngle([0, 1, 0], pl.turn * DEG), qi = conj(q), s = pl.size
  const same = pl.turn % 360 === 0 && s === 1 && pl.at[0] === foot[0] && pl.at[1] === foot[1] && pl.at[2] === foot[2]
  return {
    q, size: s, same,
    point: (p) => (same ? [p[0], p[1], p[2]] : add(pl.at, scale(rotate(q, sub(p, foot)), s))),
    back: (p) => (same ? [p[0], p[1], p[2]] : add(foot, scale(rotate(qi, sub(p, pl.at)), 1 / s))),
    dir: (v) => (same ? [v[0], v[1], v[2]] : rotate(q, v)),
    backDir: (v) => (same ? [v[0], v[1], v[2]] : rotate(qi, v)),
  }
}

/** A shape where the placement puts it: distances are exact, since a turn and an even scale keep them (times the size). */
export function placedShape(sh: Shape, t: Placer): Shape {
  if (t.same) return sh
  const s = t.size
  // the box: all eight corners where they land
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let k = 0; k < 8; k++) {
    const c = t.point([k & 1 ? sh.max[0] : sh.min[0], k & 2 ? sh.max[1] : sh.min[1], k & 4 ? sh.max[2] : sh.min[2]])
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], c[i]); hi[i] = Math.max(hi[i], c[i]) }
  }
  const out: Shape = { sdf: (x, y, z) => { const p = t.back([x, y, z]); return s * sh.sdf(p[0], p[1], p[2]) }, min: lo, max: hi }
  if (sh.pieceAt) { const at = sh.pieceAt; out.pieceAt = (p) => at(t.back(p)) }
  return out
}

/** A part where the placement puts it: its shape, and its paint read where the point was in the description. */
export function placedPart(part: VoxelPart, t: Placer, bone: string = part.bone): VoxelPart {
  const color = typeof part.color === 'function' && !t.same ? ((f) => (p: Vec3, n: Vec3) => f(t.back(p), t.backDir(n)))(part.color) : part.color
  return { ...part, shape: placedShape(part.shape, t), color, bone }
}
