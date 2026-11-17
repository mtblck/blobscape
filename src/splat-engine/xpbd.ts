/**
 * A small position-based dynamics solver (XPBD, "small steps" form: many
 * substeps, one pass over the constraints in each), for cloth and hair hung
 * on a rig. Points carry an inverse mass (0 = pinned, moved by the caller);
 * links keep two points at a length, goals pull a point toward where the
 * animation puts it, and capsules push points out of the body. Compliance is
 * the inverse of stiffness: 0 is rigid.
 *
 * It always steps by `STEP`, carrying what's left of a frame to the next, so
 * the same frames give the same motion and a recorded loop can be played back.
 * Pure and tested.
 */

export type Vec3 = [number, number, number]

/** A segment from `a` to `b` with a radius; `a` and `b` the same is a ball. */
export interface Capsule { a: Vec3; b: Vec3; r: number }

/** Seconds per step, and substeps per step. */
export const STEP = 1 / 120
export const SUBSTEPS = 4

interface Link { a: number; b: number; rest: number; compliance: number }

export class Xpbd {
  readonly n: number
  readonly pos: Float64Array
  readonly vel: Float64Array
  readonly invMass: Float64Array
  readonly links: Link[] = []
  /** Where the animation puts each point, and how loosely it follows (Infinity: not at all). */
  readonly goal: Float64Array
  readonly goalCompliance: Float64Array
  capsules: Capsule[] = []
  gravity: Vec3 = [0, -9.8, 0]
  /** Share of velocity lost per second. */
  damping = 1.5
  private prev: Float64Array
  private pinFrom: Float64Array
  private pinTo: Float64Array
  private left = 0

  constructor(n: number) {
    this.n = n
    this.pos = new Float64Array(n * 3)
    this.vel = new Float64Array(n * 3)
    this.prev = new Float64Array(n * 3)
    this.invMass = new Float64Array(n).fill(1)
    this.goal = new Float64Array(n * 3)
    this.goalCompliance = new Float64Array(n).fill(Infinity)
    this.pinFrom = new Float64Array(n * 3)
    this.pinTo = new Float64Array(n * 3)
  }

  /** Keeps `a` and `b` at `rest` (their distance now if not given). */
  link(a: number, b: number, compliance = 0, rest = this.distance(a, b)) {
    this.links.push({ a, b, rest, compliance })
  }

  distance(a: number, b: number): number {
    const p = this.pos
    return Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2])
  }

  /** Puts point `i` at `p`, still. */
  place(i: number, p: ArrayLike<number>) {
    for (let k = 0; k < 3; k++) {
      this.pos[i * 3 + k] = this.pinFrom[i * 3 + k] = this.pinTo[i * 3 + k] = p[k]
      this.vel[i * 3 + k] = 0
    }
  }

  /** Pins point `i`: from now on it moves only where `pin` sends it. */
  fix(i: number) { this.invMass[i] = 0 }

  /** Where pinned point `i` should be at the end of the next `advance`; it gets there evenly over the frame. */
  pin(i: number, p: ArrayLike<number>) {
    for (let k = 0; k < 3; k++) { this.pinFrom[i * 3 + k] = this.pos[i * 3 + k]; this.pinTo[i * 3 + k] = p[k] }
  }

  /** Where the animation wants point `i`, and how loosely it follows. */
  follow(i: number, p: ArrayLike<number>, compliance: number) {
    for (let k = 0; k < 3; k++) this.goal[i * 3 + k] = p[k]
    this.goalCompliance[i] = compliance
  }

  /** Runs whole steps for `dt` seconds (carrying the rest); returns how many ran. */
  advance(dt: number): number {
    const total = this.left + dt
    const count = Math.floor(total / STEP + 1e-9)
    const start = this.left
    // how far through the frame a step starts and ends, for the pins
    const at = (k: number) => (dt > 0 ? Math.min(1, Math.max(0, (k * STEP - start) / dt)) : 1)
    for (let k = 1; k <= count; k++) this.stepOnce(at(k - 1), at(k))
    this.left = total - count * STEP
    return count
  }

  /** Kinetic energy, for a unit mass per free point. */
  energy(): number {
    let e = 0
    for (let i = 0; i < this.n; i++) if (this.invMass[i] > 0) e += 0.5 * (this.vel[i * 3] ** 2 + this.vel[i * 3 + 1] ** 2 + this.vel[i * 3 + 2] ** 2)
    return e
  }

  private stepOnce(f0: number, f1: number) {
    const h = STEP / SUBSTEPS, { pos, vel, prev, invMass, n } = this
    const keep = Math.exp(-this.damping * h)
    for (let s = 0; s < SUBSTEPS; s++) {
      prev.set(pos)
      for (let i = 0; i < n; i++) {
        if (invMass[i] === 0) continue
        for (let k = 0; k < 3; k++) {
          vel[i * 3 + k] += this.gravity[k] * h
          pos[i * 3 + k] += vel[i * 3 + k] * h
        }
      }
      this.movePins(f0 + ((f1 - f0) * (s + 1)) / SUBSTEPS)
      for (const l of this.links) this.solveLink(l, h)
      for (let i = 0; i < n; i++) if (invMass[i] > 0 && this.goalCompliance[i] < Infinity) this.solveGoal(i, h)
      for (let i = 0; i < n; i++) if (invMass[i] > 0) this.collide(i)
      for (let i = 0; i < n * 3; i++) vel[i] = invMass[(i / 3) | 0] === 0 ? (pos[i] - prev[i]) / h : ((pos[i] - prev[i]) / h) * keep
    }
  }

  // pinned points slide from where they were at the frame's start to where they go by its end
  private movePins(u: number) {
    const { pos, invMass, pinFrom, pinTo } = this
    for (let i = 0; i < this.n; i++) {
      if (invMass[i] !== 0) continue
      for (let k = 0; k < 3; k++) pos[i * 3 + k] = pinFrom[i * 3 + k] + (pinTo[i * 3 + k] - pinFrom[i * 3 + k]) * u
    }
  }

  private solveLink(l: Link, h: number) {
    const { pos, invMass } = this, a = l.a * 3, b = l.b * 3
    const w = invMass[l.a] + invMass[l.b]
    if (w === 0) return
    const dx = pos[a] - pos[b], dy = pos[a + 1] - pos[b + 1], dz = pos[a + 2] - pos[b + 2]
    const d = Math.hypot(dx, dy, dz)
    if (d < 1e-9) return
    const lambda = -(d - l.rest) / (w + l.compliance / (h * h))
    const sa = (lambda * invMass[l.a]) / d, sb = (lambda * invMass[l.b]) / d
    pos[a] += dx * sa; pos[a + 1] += dy * sa; pos[a + 2] += dz * sa
    pos[b] -= dx * sb; pos[b + 1] -= dy * sb; pos[b + 2] -= dz * sb
  }

  private solveGoal(i: number, h: number) {
    const { pos, goal, invMass } = this, o = i * 3, w = invMass[i]
    const share = w / (w + this.goalCompliance[i] / (h * h))
    for (let k = 0; k < 3; k++) pos[o + k] += (goal[o + k] - pos[o + k]) * share
  }

  private collide(i: number) {
    const p = this.pos, o = i * 3
    for (const c of this.capsules) {
      const q = closestOnSegment(c.a, c.b, p[o], p[o + 1], p[o + 2])
      const dx = p[o] - q[0], dy = p[o + 1] - q[1], dz = p[o + 2] - q[2]
      const d = Math.hypot(dx, dy, dz)
      if (d >= c.r) continue
      // straight out from the axis; a point right on it goes back (-z), where cloth and hair hang
      const [nx, ny, nz] = d > 1e-9 ? [dx / d, dy / d, dz / d] : [0, 0, -1]
      p[o] = q[0] + nx * c.r; p[o + 1] = q[1] + ny * c.r; p[o + 2] = q[2] + nz * c.r
    }
  }

  /** Every point still, where it is (after a jump, say). */
  settle() {
    this.vel.fill(0)
    this.left = 0
    this.pinFrom.set(this.pos)
    this.pinTo.set(this.pos)
  }
}

/** The point on segment a–b nearest (x, y, z). */
export function closestOnSegment(a: Vec3, b: Vec3, x: number, y: number, z: number): Vec3 {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
  const len2 = ux * ux + uy * uy + uz * uz
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - a[0]) * ux + (y - a[1]) * uy + (z - a[2]) * uz) / len2)) : 0
  return [a[0] + ux * t, a[1] + uy * t, a[2] + uz * t]
}
