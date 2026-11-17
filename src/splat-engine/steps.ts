import type { Vec3 } from '../splat-core/blobs.ts'

/**
 * Footstep planning (issue #160): instead of a walk clip moving the legs and the feet being pinned to the ground
 * after, each foot keeps a spot on the ground and only leaves it to step. A foot steps when its spot has fallen
 * too far from where it would stand under the body now (`reach`), aiming up to `reach` ahead of the body's motion, so
 * one planner walks, turns on the spot, sidesteps, backs up and stops with every foot still where it landed.
 * Feet in one `group` step together (a trot's diagonal pair); only one group is ever in the air, and the group
 * furthest behind goes first. Pure, plain numbers: the same motion gives the same steps.
 */

/** One foot for `Steps` to plan. */
export interface StepFoot {
  /** Where the foot stands under the body at rest, in the body's frame: x to its left, z ahead. */
  home: [number, number]
}

/** How `Steps` steps: how far a foot may trail, how long and how high a step is, and which feet go together. */
export interface StepOptions {
  /** How far a planted foot may fall from its home under the body before it steps, meters. */
  reach: number
  /** Seconds a step takes in the air, at most: a body moving fast enough to cover two `reach`es in that time steps
   * quicker, so the feet still under it don't fall far behind before the step lands. */
  duration: number
  /** How high a step lifts the foot at its middle, meters. */
  lift: number
  /** Which feet step together: a list of groups of foot indices (each foot in one). Left out, each foot alone. */
  groups?: number[][]
  /** How far ahead along the body's motion a step aims past where home will be when it lands, in seconds of that
   * motion (half a second by default), never more than `reach`: a slow walk takes short steps, a fast one lands a
   * whole `reach` ahead so the foot spends its time under the body evenly before and behind. */
  lead?: number
  /** Below this distance from home a still body's foot is left where it is; above it, it steps home to stand square. */
  settle?: number
  /** Radians the body may turn from where it faced when a foot landed before that counts as the whole `reach`
   * (so turning on the spot steps even when a narrow stance hardly moves the feet). */
  twist?: number
}

/** The body as the planner sees it: where it stands and faces, and how it moves (per second). */
export interface StepBody {
  x: number
  z: number
  /** Turned from +z toward +x, radians. */
  heading: number
  vx: number
  vz: number
  /** Radians a second. */
  turn: number
}

/** Where one foot is in its stepping: planted, or part way through a step. */
export interface FootState {
  /** Where the foot stands, or stood when it lifted. */
  at: [number, number]
  /** Where a foot in the air lands. */
  to: [number, number]
  /** How far through its step, 0 to 1, or −1 while planted. */
  t: number
  /** Which way the body faced (heading) when the foot last landed, or will face where it lands. */
  facing: number
  /** Which way the foot faced when it lifted, so a foot in the air can turn from it to `facing`. */
  faced: number
  /** Seconds this step takes in the air. */
  span: number
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/**
 * A footstep planner. Give it the feet and where the body starts, then call `update` each frame with where the body
 * is now: each foot stays planted until it falls too far from its home under the body, then steps to where the body
 * is going.
 */
export class Steps {
  /** Each foot's state, in the order the feet were given. */
  readonly feet: FootState[]
  /** The options in use, with the defaults filled in. */
  readonly opts: Required<StepOptions>
  private readonly homes: [number, number][]
  /** How far the farthest home is from the body's center. */
  private readonly spread: number
  /** Steps taken so far, by every foot. */
  taken = 0

  constructor(feet: StepFoot[], body: StepBody, opts: StepOptions) {
    this.homes = feet.map((f) => f.home)
    this.spread = Math.max(...this.homes.map(([x, z]) => Math.hypot(x, z)))
    this.opts = { groups: feet.map((_, i) => [i]), lead: 0.5, settle: opts.reach * 0.3, twist: 0.5, ...opts }
    this.feet = feet.map((_, i) => { const at = this.home(i, body); return { at, to: at, t: -1, facing: body.heading, faced: body.heading, span: opts.duration } })
  }

  /** Where foot i stands under the body, `ahead` seconds along its motion. */
  home(i: number, b: StepBody, ahead = 0): [number, number] {
    const h = b.heading + b.turn * ahead, [hx, hz] = this.homes[i]
    const c = Math.cos(h), s = Math.sin(h)
    // x to the body's left is −x of the world when it faces +z, as heading turns +z toward +x
    return [b.x + b.vx * ahead + hz * s + hx * c, b.z + b.vz * ahead + hz * c - hx * s]
  }

  /** How far foot i has fallen (or will have, `ahead` seconds on) from where it should stand under the body: its distance from home plus its turn, as a share of `twist` times `reach`. */
  off(i: number, b: StepBody, ahead = 0) {
    const h = this.home(i, b, ahead), f = this.feet[i]
    return Math.hypot(f.at[0] - h[0], f.at[1] - h[1]) + (Math.abs(b.heading + b.turn * ahead - f.facing) / this.opts.twist) * this.opts.reach
  }

  /** Which way foot i faces now: as it landed, or partway round to where it lands. */
  turned(i: number) {
    const f = this.feet[i]
    return f.t < 0 ? f.facing : f.faced + (f.facing - f.faced) * smooth(Math.min(1, f.t))
  }

  /** The foot is in the air. */
  stepping(i: number) {
    return this.feet[i].t >= 0
  }

  /** Moves the plan on by `dt` with the body now at `b`. Returns each foot's place: x, height above the ground, z. */
  update(b: StepBody, dt: number): Vec3[] {
    const { groups, duration, reach, settle } = this.opts
    // feet in the air go on, aimed again at where the body is going now (it may have slowed or turned), and land
    const v = Math.hypot(b.vx, b.vz), moving = v > 0.02 || Math.abs(b.turn) > 0.05
    this.feet.forEach((f, i) => {
      if (f.t < 0) return
      f.t += dt / f.span
      this.aim(i, b, moving ? Math.max(0, 1 - f.t) * f.span : 0)
      if (f.t >= 1) { f.at = f.to; f.t = -1; this.taken++ }
    })
    // a group lifts when none is in the air and it is the furthest behind
    if (!this.feet.some((f) => f.t >= 0)) {
      // how fast the quickest foot's home moves, turning included
      const pace = v + Math.abs(b.turn) * this.spread
      const span = Math.min(duration, (2 * reach) / Math.max(pace, 1e-9)), ahead = moving ? span : 0
      // judged a step's time ahead: a foot that would be too far behind by the time another step could land goes now
      let best = -1, worst = moving ? reach : settle
      groups.forEach((g, k) => {
        const off = Math.max(...g.map((i) => this.off(i, b, ahead)))
        if (off > worst) { worst = off; best = k }
      })
      if (best >= 0) for (const i of groups[best]) {
        this.feet[i].faced = this.feet[i].facing
        this.feet[i].span = span
        this.feet[i].t = 0
        this.aim(i, b, ahead)
      }
    }
    return this.feet.map((f) => {
      if (f.t < 0) return [f.at[0], 0, f.at[1]]
      const u = smooth(Math.min(1, f.t))
      return [f.at[0] + (f.to[0] - f.at[0]) * u, this.opts.lift * Math.sin(Math.PI * Math.min(1, f.t)), f.at[1] + (f.to[1] - f.at[1]) * u]
    })
  }

  /** Sets where foot i lands: its home `ahead` seconds on, and a little further along the body's motion. */
  private aim(i: number, b: StepBody, ahead: number) {
    const v = Math.hypot(b.vx, b.vz), to = this.home(i, b, ahead)
    const far = v > 1e-9 ? Math.min(this.opts.reach, v * this.opts.lead) / v : 0
    this.feet[i].to = [to[0] + b.vx * far, to[1] + b.vz * far]
    this.feet[i].facing = b.heading + b.turn * ahead
  }

  /** Puts every foot back under the body, planted (after a jump in place, or a new start). */
  reset(b: StepBody) {
    this.feet.forEach((f, i) => { f.at = this.home(i, b); f.to = f.at; f.t = -1; f.facing = f.faced = b.heading })
  }
}
