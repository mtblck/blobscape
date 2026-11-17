import type { Vec3 } from '../splat-core/blobs.ts'
import { axisAngle, mulQ, type Skeleton } from './rig.ts'

/**
 * Tap to poke (issue #156): a tapped part with a bone of its own leans away from the tap and wobbles back, a damped
 * spring; a tap on the land (bone 0) throws a puff of sparkles from where it landed, on bones kept hidden for it.
 * Pure: `apply` poses on top of whatever the scene's poser did, from the time alone, so the loop underneath is
 * untouched and a poke simply ends.
 */

/** How long a poke lasts, in seconds. */
export const POKE_LIFE = 0.9
/** How far a poked bone leans at most, in radians. */
export const LEAN = 0.32
/** How many sparkles a puff throws; scenes keep this many hidden bones for them (`~puff<n>`). */
export const PUFFS = 6
/** How far a puff's sparkles fly out, in world units. */
const PUFF_REACH = 0.38

export interface Poke {
  /** The bone poked (a wobble), or -1 for a puff. */
  bone: number
  /** Where the tap landed, in world space. */
  at: Vec3
  /** When, in the clock `apply` is given. */
  start: number
  /** The way the bone leans: about this world axis. */
  axis: Vec3
}

/** The wobble's angle `s` seconds in: out fast, back past rest, settled by the end. */
export function wobble(s: number): number {
  if (s < 0 || s >= POKE_LIFE) return 0
  return LEAN * Math.exp(-5 * s) * Math.sin(15 * s) * (1 - s / POKE_LIFE)
}

/** Each sparkle's way out, spread round and upward, the same every puff. */
const PUFF_WAYS: Vec3[] = Array.from({ length: PUFFS }, (_, k) => {
  const a = (k / PUFFS) * Math.PI * 2 + 0.4, up = 0.6 + 0.25 * (k % 2)
  const r = Math.sqrt(1 - up * up)
  return [Math.cos(a) * r, up, Math.sin(a) * r]
})

export class Pokes {
  list: Poke[] = []
  /** The bones that carry the puff's sparkles, hidden unless a puff is on. */
  readonly puffs: number[]

  constructor(sk: Skeleton) {
    this.puffs = sk.bones.flatMap((b, i) => (b.name.startsWith('~puff') ? [i] : []))
  }

  /**
   * A tap on `bone` at `at` (world space), at clock `now`. The land, or a bone with no say of its own (specks, mist),
   * gives a puff where puff bones exist, and nothing otherwise. A bone poked again starts over.
   */
  add(sk: Skeleton, bone: number, at: Vec3, now: number) {
    const name = sk.bones[bone]?.name ?? ''
    if (bone <= 0 || name.startsWith('~')) {
      if (!this.puffs.length) return
      this.list = this.list.filter((p) => p.bone !== -1)
      this.list.push({ bone: -1, at, start: now, axis: [1, 0, 0] })
      return
    }
    // lean away from the tap: about the level line at right angles to the way from the bone's head to the tap
    const h = sk.posedHead.subarray(bone * 3, bone * 3 + 3)
    let dx = at[0] - h[0], dz = at[2] - h[2]
    const len = Math.hypot(dx, dz)
    if (len < 1e-4) { dx = 0; dz = 1 } else { dx /= len; dz /= len }
    this.list = this.list.filter((p) => p.bone !== bone)
    this.list.push({ bone, at, start: now, axis: [-dz, 0, dx] })
  }

  /** Whether anything is still moving at `now`. */
  busy(now: number) { return this.list.some((p) => now - p.start < POKE_LIFE) }

  /** Poses the pokes at `now` on top of the scene's pose, then updates the skeleton. Hides puff bones not in use. */
  apply(sk: Skeleton, now: number) {
    this.list = this.list.filter((p) => now - p.start < POKE_LIFE && now >= p.start)
    let puff: Poke | undefined
    for (const p of this.list) {
      if (p.bone < 0) { puff = p; continue }
      const turn = axisAngle(p.axis, wobble(now - p.start))
      sk.setRotation(p.bone, mulQ(turn, sk.rotation.subarray(p.bone * 4, p.bone * 4 + 4)))
    }
    for (let k = 0; k < this.puffs.length; k++) {
      const b = this.puffs[k]
      if (!puff) { sk.size[b] = 0; continue }
      const s = (now - puff.start) / POKE_LIFE, w = PUFF_WAYS[k % PUFFS], out = PUFF_REACH * (1 - Math.exp(-4 * s))
      const head = sk.bones[b].head
      for (let i = 0; i < 3; i++) sk.offset[b * 3 + i] = puff.at[i] + w[i] * out - head[i] - (i === 1 ? 0.12 * s * s : 0)
      sk.size[b] = Math.sin(Math.PI * Math.min(1, s * 1.15)) ** 0.5
    }
    sk.update()
  }
}
