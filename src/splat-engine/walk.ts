import type { Vec3 } from '../splat-core/blobs.ts'
import { TAILS } from './creature.ts'
import { axisAngle, mulQ, type Skeleton } from './rig.ts'

/**
 * The fox's trot as four key poses, the way an animator blocks a walk:
 *
 * - A, contact: one diagonal pair of legs reaching forward, the other back;
 * - B, passing: the reaching pair now under the body carrying it, the other
 *   pair folded and swinging past;
 * - C and D: the same with the pairs swapped.
 *
 * Everything between keys is in-betweened (each joint angle blended), or held
 * until the next key. With only the two contact keys, nothing ever lifts a
 * foot: it sweeps forward along, and through, the ground.
 */
export interface Key {
  name: string
  /** Hip swing of the pair (front-left + back-right), then the other pair (front-right + back-left). Positive swings the foot back. */
  swing: [number, number]
  /** Knee fold of each pair, 0 straight to 1 fully folded. */
  fold: [number, number]
  /** Body height above rest. */
  bob: number
}

const SWING = 0.42
const FOLD = 0.75
/** How far the body drops so a leg swung out by SWING still reaches the ground (leg ≈ 0.7 long). */
const DROP = -0.7 * (1 - Math.cos(SWING))

export const KEYS: Key[] = [
  { name: 'Contact', swing: [-SWING, SWING], fold: [0, 0], bob: DROP },
  { name: 'Passing', swing: [0, 0], fold: [0, 1], bob: 0 },
  { name: 'Contact', swing: [SWING, -SWING], fold: [0, 0], bob: DROP },
  { name: 'Passing', swing: [0, 0], fold: [1, 0], bob: 0 },
]

export interface WalkTiming {
  /** 2 (contacts only) or 4 (contacts and passing poses). */
  keys: 2 | 4
  /** Snap from key to key instead of blending between them. */
  hold: boolean
  /** Seconds for a full cycle: every leg steps once. */
  cycle: number
}

const LEGS = [['fl', 0], ['br', 0], ['fr', 1], ['bl', 1]] as const

/** Which keys a walk with this many keys uses, in order. */
export const keysUsed = (n: 2 | 4) => (n === 2 ? [0, 2] : [0, 1, 2, 3])

/** The pose at a point in the cycle (0–1), as a blend of two keys. */
export function keyPose(u: number, timing: WalkTiming): Key {
  const used = keysUsed(timing.keys)
  const f = (((u % 1) + 1) % 1) * used.length
  const k = Math.floor(f)
  const a = KEYS[used[k]], b = KEYS[used[(k + 1) % used.length]]
  const t = timing.hold ? 0 : f - k
  const mix = (x: number, y: number) => x + (y - x) * t
  return {
    name: a.name,
    swing: [mix(a.swing[0], b.swing[0]), mix(a.swing[1], b.swing[1])],
    fold: [mix(a.fold[0], b.fold[0]), mix(a.fold[1], b.fold[1])],
    bob: mix(a.bob, b.bob),
  }
}

/** Poses the fox from a key pose. */
export function applyKey(sk: Skeleton, k: Key) {
  sk.reset()
  const X: Vec3 = [1, 0, 0]
  for (const [leg, pair] of LEGS) {
    sk.setRotation(sk.index(`${leg}Upper`), axisAngle(X, k.swing[pair]))
    // front knees fold forward, back knees (hocks) the other way
    sk.setRotation(sk.index(`${leg}Lower`), axisAngle(X, (leg[0] === 'f' ? -1 : 1) * FOLD * k.fold[pair]))
  }
  sk.offset.set([0, k.bob, 0], 0)
  // a little life: the tail sways against the stride
  const sway = (k.swing[0] / SWING) * 0.25
  sk.setRotation(sk.index('tail1'), mulQ(axisAngle([0, 1, 0], sway), axisAngle(X, 0.15)))
  sk.update()
}

/** Poses the fox `t` seconds into the walk. */
export function poseKeys(sk: Skeleton, t: number, timing: WalkTiming) {
  applyKey(sk, keyPose(t / timing.cycle, timing))
}

/** Where each foot is now (posed skeleton), in the order fl, fr, bl, br. */
export function feet(sk: Skeleton): Vec3[] {
  return (['fl', 'fr', 'bl', 'br'] as const).map((leg) => {
    const m = sk.matrix.subarray(sk.index(`${leg}Lower`) * 16)
    const p = TAILS[`${leg}Lower`]
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]
  })
}

/**
 * How fast a planted foot moves back under the body, in units per second: a
 * stride (from reaching forward to pushing off) over the half cycle it takes.
 * The ground has to move at this speed under a walk on the spot, or the feet
 * slide.
 */
export function footSpeed(sk: Skeleton, cycle: number) {
  applyKey(sk, KEYS[0])
  const front = feet(sk)[0][2]
  applyKey(sk, KEYS[2])
  const back = feet(sk)[0][2]
  sk.reset()
  sk.update()
  return Math.abs(front - back) / (cycle / 2)
}
