import type { Quat, Vec3 } from '../splat-core/blobs.ts'
import { boneTail } from './body.ts'
import { axisAngle, mulQ, norm4, rotate, type Skeleton } from './rig.ts'

/**
 * Small helpers for writing clips by hand, the way an animator thinks: aim a
 * bone at a direction, ease in and out of a move, hold a pose for a while.
 * Clips are functions of time that pose a skeleton; `recordClip` turns them
 * into keys for a file.
 */

/** The x axis. */
export const X: Vec3 = [1, 0, 0]
/** The y axis: up. */
export const Y: Vec3 = [0, 1, 0]
/** The z axis. */
export const Z: Vec3 = [0, 0, 1]

/** 0 → 1 smoothly as t goes from a to b. */
export function ramp(t: number, a: number, b: number) {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return u * u * (3 - 2 * u)
}

/** Up from a to b, held, then down from c to d. */
export const env = (t: number, a: number, b: number, c: number, d: number) => ramp(t, a, b) * (1 - ramp(t, c, d))

/** A unit quaternion's inverse: the same turn, the other way. */
export const conj = (q: ArrayLike<number>): Quat => [-q[0], -q[1], -q[2], q[3]]

/** The rotation that turns unit vector a onto unit vector b by the shortest way. */
export function fromTo(a: Vec3, b: Vec3): Quat {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  if (d < -0.999999) {
    const axis: Vec3 = Math.abs(a[0]) < 0.9 ? [0, -a[2], a[1]] : [-a[1], a[0], 0]
    return axisAngle(axis, Math.PI)
  }
  return norm4([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], 1 + d])
}

/** A bone's world rotation from the local rotations set so far (bones have no rest rotation, so it's the product up the chain). */
export function worldQuat(sk: Skeleton, b: number): Quat {
  let q: Quat = [0, 0, 0, 1]
  for (let i = b; i >= 0; i = sk.bones[i].parent) q = mulQ(sk.rotation.subarray(i * 4, i * 4 + 4), q)
  return q
}

/** A vector scaled to length 1. */
export function dir(v: Vec3): Vec3 { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l] }

/** Where a bone points in the rest pose. */
export function restDir(sk: Skeleton, b: number): Vec3 {
  const h = sk.bones[b].head, t = boneTail(sk.bones, b)
  return dir([t[0] - h[0], t[1] - h[1], t[2] - h[2]])
}

/**
 * Turns bone `name` so it points along world direction `to`, blended by
 * `amount` from where it points now. Set parents first: the result is a local
 * rotation under whatever the parent is doing.
 */
export function aim(sk: Skeleton, name: string, to: Vec3, amount = 1) {
  const b = sk.index(name)
  const parent = sk.bones[b].parent
  const pw = parent >= 0 ? worldQuat(sk, parent) : ([0, 0, 0, 1] as Quat)
  const rest = restDir(sk, b)
  const now = rotate(worldQuat(sk, b), rest)
  const target = dir([now[0] + (to[0] - now[0]) * amount, now[1] + (to[1] - now[1]) * amount, now[2] + (to[2] - now[2]) * amount])
  sk.setRotation(b, mulQ(conj(pw), fromTo(rest, dir(target))))
}

/** Adds a local turn on top of a bone's current rotation. */
export function turn(sk: Skeleton, name: string, axis: Vec3, rad: number) {
  const b = sk.index(name)
  sk.setRotation(b, mulQ(sk.rotation.subarray(b * 4, b * 4 + 4), axisAngle(axis, rad)))
}

/** Sets a local turn, replacing the bone's rotation. */
export function set(sk: Skeleton, name: string, axis: Vec3, rad: number) {
  sk.setRotation(sk.index(name), axisAngle(axis, rad))
}

/** Several turns, applied in order (first is outermost). */
export function turns(...qs: Quat[]): Quat {
  return qs.reduce((a, b) => mulQ(a, b), [0, 0, 0, 1] as Quat)
}
