import type { Quat, Vec3 } from '../splat-core/blobs.ts'
import { axisAngle, mulQ, norm4, posedPoint, rotate, type Skeleton } from './rig.ts'
import { conj, dir, fromTo, worldQuat } from './posing.ts'

/**
 * Reaching for things: inverse kinematics on our skeletons, the part of a
 * mesh engine's animation tools (three.js's `CCDIKSolver`, a game engine's
 * foot IK) that creatures need most.
 *
 * - `twoBoneIK` bends a limb of two bones (thigh and shin, arm and forearm)
 *   so its end lands on a point, keeping the knee on the side it bends now;
 * - `lookAt` turns one bone so a direction it carries points at a place;
 * - `plantFeet` lays a walk over uneven ground: hips down to the lower foot,
 *   each leg bent to its own patch of ground, each foot tilted to the slope;
 * - `hipDrop` and `stepLegs` put feet where a footstep planner (steps.ts) says.
 *
 * Bones here have no rest rotation, so a bone's world turn is the product of
 * the local ones up its chain (`worldQuat`), and changing a bone's world turn
 * means setting its local turn to parent⁻¹ · wanted.
 */

const sub = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: ArrayLike<number>) => Math.hypot(a[0], a[1], a[2])
const head = (sk: Skeleton, b: number): Vec3 => [sk.posedHead[b * 3], sk.posedHead[b * 3 + 1], sk.posedHead[b * 3 + 2]]

/** Gives bone `b` the world turn `q`, under whatever its parent does now. */
export function setWorldQuat(sk: Skeleton, b: number, q: ArrayLike<number>) {
  const p = sk.bones[b].parent
  const pw: Quat = p >= 0 ? worldQuat(sk, p) : [0, 0, 0, 1]
  sk.setRotation(b, norm4(mulQ(conj(pw), q)))
}

/** The part of `q` (a turn) that is `amount` of the way from no turn. */
function partTurn(q: Quat, amount: number): Quat {
  const w = Math.max(-1, Math.min(1, q[3]))
  const angle = 2 * Math.acos(Math.abs(w))
  const s = Math.sqrt(Math.max(0, 1 - w * w))
  if (s < 1e-9 || angle < 1e-9) return [0, 0, 0, 1]
  const sign = w < 0 ? -1 : 1
  return axisAngle([(q[0] / s) * sign, (q[1] / s) * sign, (q[2] / s) * sign], angle * amount)
}

/** Options for `twoBoneIK`. */
export interface TwoBoneOptions {
  /** World direction the knee or elbow should point when the limb gives no bend of its own (it is straight). */
  pole?: Vec3
  /** 0 leaves the limb as it is, 1 reaches all the way. */
  amount?: number
}

/**
 * Bends the chain upper → lower so `tip`, a point carried by `lower` (given
 * where it is in the rest pose: an ankle, a wrist, the end of a shin), lands on
 * `target`, or as near as the limb reaches. The knee stays in the plane it
 * bends in now, so a walk's knees keep pointing the way they did. Leaves the
 * skeleton updated. Returns how far the tip still is from the target.
 */
export function twoBoneIK(sk: Skeleton, upper: number, lower: number, tip: ArrayLike<number>, target: ArrayLike<number>, { pole = [0, 0, 1], amount = 1 }: TwoBoneOptions = {}): number {
  if (sk.bones[lower].parent !== upper) throw new Error('twoBoneIK needs a chain: the lower bone must be a child of the upper one')
  sk.update()
  const A = head(sk, upper), B = head(sk, lower), C = posedPoint(sk, lower, tip)
  const T: Vec3 = [C[0] + (target[0] - C[0]) * amount, C[1] + (target[1] - C[1]) * amount, C[2] + (target[2] - C[2]) * amount]
  const la = len(sub(B, A)), lb = len(sub(C, B))
  if (la < 1e-9 || lb < 1e-9) return len(sub(T, C))
  const toT = sub(T, A)
  const dT = len(toT)
  if (dT < 1e-9) return len(sub(T, C))
  const u = dir(toT)
  // reach is capped just short of straight and just past folded flat, so the knee always has a side
  const d = Math.min(la + lb - 1e-5 * (la + lb), Math.max(Math.abs(la - lb) + 1e-5 * (la + lb), dT))
  // which side the knee goes: where it is now, off the line from hip to ankle; or the pole when the leg is straight
  const AC = sub(C, A)
  const acLen = len(AC)
  let side = sub(B, A)
  if (acLen > 1e-9) { const k = dot(side, AC) / (acLen * acLen); side = [side[0] - AC[0] * k, side[1] - AC[1] * k, side[2] - AC[2] * k] }
  if (len(side) < 1e-4 * la) side = [...pole] as Vec3
  // take out the part along the new reach
  const along = dot(side, u)
  let v: Vec3 = [side[0] - u[0] * along, side[1] - u[1] * along, side[2] - u[2] * along]
  if (len(v) < 1e-9) {
    // the pole lies along the reach: any square direction will do
    v = Math.abs(u[1]) < 0.9 ? [u[2], 0, -u[0]] : [0, -u[2], u[1]]
  }
  v = dir(v)
  const x = (la * la - lb * lb + d * d) / (2 * d)
  const y = Math.sqrt(Math.max(0, la * la - x * x))
  const knee: Vec3 = [A[0] + u[0] * x + v[0] * y, A[1] + u[1] * x + v[1] * y, A[2] + u[2] * x + v[2] * y]

  setWorldQuat(sk, upper, mulQ(fromTo(dir(sub(B, A)), dir(sub(knee, A))), worldQuat(sk, upper)))
  sk.update()
  const B2 = head(sk, lower), C2 = posedPoint(sk, lower, tip)
  setWorldQuat(sk, lower, mulQ(fromTo(dir(sub(C2, B2)), dir(sub(T, B2))), worldQuat(sk, lower)))
  sk.update()
  return len(sub(posedPoint(sk, lower, tip), T))
}

/** Options for `lookAt`. */
export interface LookOptions {
  /** The direction the bone looks along at rest, in world space (a creature facing +z looks along +z). */
  forward?: Vec3
  /** 0 leaves the bone, 1 turns it all the way. */
  amount?: number
  /** The most it turns from where it points now, in radians, so a head never spins round. */
  limit?: number
}

/** Turns bone `name` so its `forward` points at `point`. Leaves the skeleton updated. */
export function lookAt(sk: Skeleton, name: string, point: ArrayLike<number>, { forward = [0, 0, 1], amount = 1, limit = Math.PI }: LookOptions = {}) {
  const b = sk.index(name)
  sk.update()
  const w = worldQuat(sk, b)
  const now = rotate(w, forward)
  const want = dir(sub(point, head(sk, b)))
  let q = fromTo(dir(now), want)
  const angle = 2 * Math.acos(Math.min(1, Math.abs(q[3])))
  const k = angle > 1e-9 ? Math.min(amount, (limit * amount) / angle) : 0
  q = partTurn(q, Math.min(1, k))
  setWorldQuat(sk, b, mulQ(q, w))
  sk.update()
}

/**
 * One leg for `plantFeet`: bone names from the hip down. The ankle is the foot
 * bone's head, or `tip` (a rest point the lower bone carries) for a leg with no
 * foot bone. `pole` is where its knee points if the leg is straight.
 */
export interface Leg {
  /** The thigh bone's name. */
  upper: string
  /** The shin bone's name. */
  lower: string
  /** The foot bone's name, if the leg has one. */
  foot?: string
  /** The ankle as a rest point the lower bone carries, for a leg with no foot bone. */
  tip?: Vec3
  /** Where the knee points if the leg is straight. */
  pole?: Vec3
}

/** The height of the ground under a point on the floor plane. */
export type Ground = (x: number, z: number) => number

/**
 * The ground's way up under (x, z). Each way across is the gentler of the two
 * one-sided slopes, so a foot beside a step's edge stands level on its tread
 * instead of tipping toward the drop.
 */
export function groundNormal(ground: Ground, x: number, z: number, e = 0.03): Vec3 {
  const h = ground(x, z)
  const gentle = (a: number, b: number) => (Math.abs(a) < Math.abs(b) ? a : b)
  const sx = gentle(h - ground(x - e, z), ground(x + e, z) - h) / e
  const sz = gentle(h - ground(x, z - e), ground(x, z + e) - h) / e
  return dir([-sx, 1, -sz])
}

/** Options for `plantFeet`. */
export interface PlantOptions {
  /** 0 leaves the walk as it is (on flat ground), 1 plants it fully. */
  amount?: number
  /** Lower the hips so the lower foot can reach (true), or leave them and let that leg hang. */
  hips?: boolean
  /** Tilt each foot to the slope under it. */
  tilt?: boolean
}

/** What `plantFeet` did, for a readout or a test. */
export interface Planted {
  /** How far the hips moved down (negative) or up. */
  hipShift: number
  /** Per leg: the ankle's target and how far it ended from it. */
  legs: { target: Vec3; miss: number; ground: number }[]
}

/**
 * Lays the pose (made for flat ground at y = 0) over `ground`. Each ankle
 * keeps its height above the floor from the walk (a lifted foot stays lifted),
 * measured from that leg's own patch of ground instead of from 0. The hips
 * move by the smallest of the legs' changes, so no leg has to stretch past its
 * length, then each leg is bent to its target and each foot turned to the
 * slope. Leaves the skeleton updated.
 */
export function plantFeet(sk: Skeleton, legs: Leg[], ground: Ground, { amount = 1, hips = true, tilt = true }: PlantOptions = {}): Planted {
  sk.update()
  const ids = legIds(sk, legs)
  const floor = sk.place[1]
  const plan = ids.map((l) => {
    const P = posedPoint(sk, l.lower, l.tip)
    const g = ground(P[0], P[2])
    return { P, g, target: [P[0], P[1] + (g - floor) * amount, P[2]] as Vec3 }
  })
  let hipShift = 0
  if (hips && plan.length) {
    hipShift = Math.min(...plan.map((p) => p.target[1] - p.P[1]))
    sk.offset[1] += hipShift // the root's offset is in world units
    sk.update()
  }
  // each foot's world turn as the walk had it, to put back (tilted) once its leg is bent
  const feet = ids.map((l) => (l.foot >= 0 ? worldQuat(sk, l.foot) : undefined))
  const out = ids.map((l, i) => {
    const miss = twoBoneIK(sk, l.upper, l.lower, l.tip, plan[i].target, { pole: l.pole })
    let q = feet[i]
    if (q && tilt) {
      const { P } = plan[i]
      q = mulQ(partTurn(fromTo([0, 1, 0], groundNormal(ground, P[0], P[2])), amount), q)
    }
    if (q) { setWorldQuat(sk, l.foot, q); sk.update() }
    return { target: plan[i].target, miss, ground: plan[i].g }
  })
  return { hipShift, legs: out }
}

const legIds = (sk: Skeleton, legs: Leg[]) => legs.map((l) => {
  const foot = l.foot ? sk.index(l.foot) : -1
  const tip = l.tip ?? (foot >= 0 ? sk.bones[foot].head : undefined)
  if (!tip) throw new Error(`leg ${l.upper}: give a foot bone or a tip`)
  return { upper: sk.index(l.upper), lower: sk.index(l.lower), foot, tip, pole: l.pole }
})

/**
 * How far the hips must come down (meters, 0 or more) so every leg reaches its ankle target with a little bend
 * left (`slack` of its length): a long stride from straight legs needs the body lower. The skeleton as posed now.
 */
export function hipDrop(sk: Skeleton, legs: Leg[], targets: ArrayLike<number>[], slack = 0.97): number {
  return Math.max(0, hipShift(sk, legs, targets, slack))
}

/**
 * `hipDrop` with its sign kept: under zero is how far the hips could rise (meters) before the straightest leg is
 * down to `slack` of its length. A body that stands with it stands as tall as its legs allow on whatever is under
 * its feet, where one posed at a fixed height squats when the ground is a little higher than the pose expects.
 */
export function hipShift(sk: Skeleton, legs: Leg[], targets: ArrayLike<number>[], slack = 0.97): number {
  return Math.max(...legShifts(sk, legs, targets, slack))
}

/**
 * `hipShift` leg by leg: how far each leg's own hip joint would come down (or, under zero, could rise) to leave that
 * leg `slack` of its length. They differ when the feet stand at different heights: a leg a centimeter short of
 * straight has its knee well forward, so a body standing on uneven ground tips its pelvis to keep both legs straight.
 */
export function legShifts(sk: Skeleton, legs: Leg[], targets: ArrayLike<number>[], slack = 0.97): number[] {
  sk.update()
  return legIds(sk, legs).map((l, i) => {
    const A = head(sk, l.upper), B = head(sk, l.lower), C = posedPoint(sk, l.lower, l.tip), T = targets[i]
    const L = (len(sub(B, A)) + len(sub(C, B))) * slack
    const h = Math.min(L, Math.hypot(T[0] - A[0], T[2] - A[2]))
    return A[1] - T[1] - Math.sqrt(L * L - h * h)
  })
}

/**
 * Bends each leg so its ankle lands on its target (from a footstep planner, say), and turns each foot bone level,
 * facing `facing[i]` (radians from +z toward +x) when given. Leaves the skeleton updated; returns each leg's miss.
 */
export function stepLegs(sk: Skeleton, legs: Leg[], targets: ArrayLike<number>[], facing?: number[]): number[] {
  sk.update()
  return legIds(sk, legs).map((l, i) => {
    const miss = twoBoneIK(sk, l.upper, l.lower, l.tip, targets[i], { pole: l.pole })
    if (l.foot >= 0 && facing) { setWorldQuat(sk, l.foot, axisAngle([0, 1, 0], facing[i])); sk.update() }
    return miss
  })
}
