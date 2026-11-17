import { mulQ, norm4, type Skeleton } from './rig.ts'

/**
 * Mixing moves: what three.js's AnimationMixer does for meshes, for our
 * skeletons. A move here is a function of time that poses a skeleton (as the
 * zoo's moves and the elf's walk are), so a mix poses the skeleton once per
 * move and blends the results.
 *
 * - `takePose` / `putPose` copy a pose out and back;
 * - `blendPose` moves the pose now part of the way toward or away from another
 *   (rotations by the short way, offsets and sizes straight);
 * - `addPose` lays a move on top as a change from a reference pose, so a nod
 *   or a breath can ride on any walk;
 * - `Mixer` plays named moves with weights and crossfades between them.
 */
export interface Pose {
  rotation: Float32Array
  offset: Float32Array
  size: Float32Array
}

/** A copy of the skeleton's pose as it is now: every bone's rotation, offset and size. */
export function takePose(sk: Skeleton): Pose {
  return { rotation: sk.rotation.slice(), offset: sk.offset.slice(), size: sk.size.slice() }
}

/** Sets the skeleton's pose from one taken with `takePose`. Call the skeleton's `update()` after. */
export function putPose(sk: Skeleton, p: Pose) {
  sk.rotation.set(p.rotation)
  sk.offset.set(p.offset)
  sk.size.set(p.size)
}

/**
 * Blends from `from` to the skeleton's pose by `w` (0 leaves `from`, 1 keeps
 * the pose as it is). Rotations go the short way and are renormalized, which
 * is close to a slerp for the angles between two poses of one move.
 */
export function blendPose(sk: Skeleton, from: Pose | Omit<Pose, 'size'>, w: number) {
  for (let b = 0; b < sk.count; b++) {
    const a = from.rotation.subarray(b * 4, b * 4 + 4), q = sk.rotation.subarray(b * 4, b * 4 + 4)
    const sign = a[0] * q[0] + a[1] * q[1] + a[2] * q[2] + a[3] * q[3] < 0 ? -1 : 1
    sk.setRotation(b, norm4([0, 1, 2, 3].map((k) => a[k] + (q[k] * sign - a[k]) * w)))
    for (let k = 0; k < 3; k++) sk.offset[b * 3 + k] = from.offset[b * 3 + k] + (sk.offset[b * 3 + k] - from.offset[b * 3 + k]) * w
    if ('size' in from) sk.size[b] = from.size[b] + (sk.size[b] - from.size[b]) * w
  }
}

/**
 * Lays `layer` on the skeleton's pose as a change from `ref`, by `w`: each
 * bone turns by layer·ref⁻¹ on top of what it does now, slides by the offset's
 * change and grows by the size's ratio. A layer equal to `ref` changes nothing.
 */
export function addPose(sk: Skeleton, layer: Pose, ref: Pose, w = 1) {
  for (let b = 0; b < sk.count; b++) {
    const l = layer.rotation.subarray(b * 4, b * 4 + 4), r = ref.rotation.subarray(b * 4, b * 4 + 4)
    let d = mulQ(l, [-r[0], -r[1], -r[2], r[3]])
    if (d[3] < 0) d = [-d[0], -d[1], -d[2], -d[3]]
    // the change, by w: from no turn toward d
    const part = norm4([d[0] * w, d[1] * w, d[2] * w, 1 + (d[3] - 1) * w])
    sk.setRotation(b, norm4(mulQ(part, sk.rotation.subarray(b * 4, b * 4 + 4))))
    for (let k = 0; k < 3; k++) sk.offset[b * 3 + k] += (layer.offset[b * 3 + k] - ref.offset[b * 3 + k]) * w
    const grow = ref.size[b] > 1e-9 ? layer.size[b] / ref.size[b] : 1
    sk.size[b] *= 1 + (grow - 1) * w
  }
}

/** A move a `Mixer` can blend: its name, how long its loop takes and the function that poses it. */
export interface MixMove {
  /** What the mixer knows it by. */
  name: string
  /** Seconds a loop takes; the move's time wraps at it. Leave it out for a move that runs on (a pose held, or a one-off read with `elapsed`). */
  seconds?: number
  /** Poses the skeleton `t` seconds into the move. */
  pose: (sk: Skeleton, t: number) => void
}

interface Track { move: MixMove; time: number; weight: number; target: number; rate: number }

/**
 * Plays moves and crossfades between them. `play(name, fade)` brings one move
 * up to full weight over `fade` seconds while every other fades out; `update(dt)`
 * moves the clocks and weights on; `apply(sk)` poses the skeleton as the
 * weighted blend. Weights always sum to 1 while anything plays, so a blend is
 * never a shrunken pose.
 *
 * Each move keeps its own time, and `speed` scales a move's clock: a walk can
 * keep pace with the ground while the idle under it breathes on.
 */
export class Mixer {
  private readonly tracks = new Map<string, Track>()
  private readonly order: string[] = []

  constructor(moves: MixMove[]) {
    for (const m of moves) {
      this.tracks.set(m.name, { move: m, time: 0, weight: 0, target: 0, rate: 0 })
      this.order.push(m.name)
    }
  }

  /** Fades `name` in over `fade` seconds (0: at once) and everything else out. `restart` sets its clock back to 0. */
  play(name: string, fade = 0.25, restart = false) {
    const on = this.track(name)
    if (restart) on.time = 0
    for (const t of this.tracks.values()) {
      t.target = t === on ? 1 : 0
      t.rate = fade > 0 ? 1 / fade : 0
      if (fade <= 0) t.weight = t.target
    }
  }

  /** Sets weights directly (they are scaled to sum to 1), as a run blends with speed. No fade. */
  setWeights(weights: Record<string, number>) {
    for (const [name, t] of this.tracks) { t.weight = t.target = Math.max(0, weights[name] ?? 0); t.rate = 0 }
    this.normalize()
  }

  /** How much of a move is in the mix now. */
  weight(name: string) { return this.track(name).weight }

  /** A move's own time, in seconds since it started (wrapped by `seconds` when it loops). */
  time(name: string) {
    const t = this.track(name)
    return t.move.seconds ? ((t.time % t.move.seconds) + t.move.seconds) % t.move.seconds : t.time
  }

  /** Moves a clock on by its own amount (a walk at the pace of the feet; negative backs up). */
  advance(name: string, dt: number) { this.track(name).time += dt }

  /** Moves every clock on by `dt` (times `speed[name]` where given) and every weight toward its target. */
  update(dt: number, speed: Record<string, number> = {}) {
    for (const [name, t] of this.tracks) {
      t.time += dt * (speed[name] ?? 1)
      if (t.weight !== t.target) {
        const step = dt * t.rate
        t.weight = t.weight < t.target ? Math.min(t.target, t.weight + step) : Math.max(t.target, t.weight - step)
      }
    }
    this.normalize()
  }

  /** Poses `sk` as the blend of every move with weight, in the order they were given; each move starts from the rest pose. Doesn't call `update()` on the skeleton. */
  apply(sk: Skeleton) {
    let sum = 0
    for (const name of this.order) {
      const t = this.tracks.get(name)!
      if (t.weight <= 1e-6) continue
      if (sum === 0) {
        sk.reset()
        t.move.pose(sk, this.time(name))
        sum = t.weight
        continue
      }
      const so = takePose(sk)
      sk.reset()
      t.move.pose(sk, this.time(name))
      sum += t.weight
      // what's posed so far holds sum − w of the total, this move w of it
      blendPose(sk, so, t.weight / sum)
    }
  }

  private track(name: string) {
    const t = this.tracks.get(name)
    if (!t) throw new Error(`no move ${name}`)
    return t
  }

  /** While a fade runs, the moves going out share what the one coming in hasn't taken yet. */
  private normalize() {
    let sum = 0
    for (const t of this.tracks.values()) sum += t.weight
    if (sum <= 1e-9) return
    for (const t of this.tracks.values()) t.weight /= sum
  }
}
