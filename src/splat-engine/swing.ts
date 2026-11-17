import { posedPoint, type Skeleton } from './rig.ts'
import { aim, dir } from './posing.ts'
import { Xpbd, type Capsule, type Vec3 } from './xpbd.ts'

/**
 * Loose parts that swing after the body: tails, ears, cloaks, plaits. Each
 * chain is a run of bones, each the child of the one before; its points are
 * every bone's head and the last bone's tail. The first point is pinned where
 * the body carries it, and the rest are pulled loosely toward where the move
 * puts them (`follow`, a compliance: bigger is looser), so they lag, swing and
 * settle (xpbd.ts). Afterwards each bone is turned to point at the next point,
 * so the move still shapes the part and the swing rides on top.
 *
 *   const s = new Swing(sk, FOX_SWING)   // once
 *   ...pose the move, place the creature...
 *   s.update(sk, dt)                     // turns the chains' bones
 *
 * Pure and tested.
 */

export interface Chain {
  bones: readonly string[]
  /** How loosely each point after the first follows the move: one number for all, or one per point. */
  follow: number | readonly number[]
  /** A soft link from each point to the one after next, so a chain bends but doesn't fold back (compliance). */
  bend?: number
}

export interface SwingSpec {
  /** What swings, for a sentence: "tail", "cloak and plait". */
  parts: string
  chains: readonly Chain[]
  /** Links between chains, as [chain, point, chain, point, compliance]: a cloak's two halves, say. */
  ties?: readonly (readonly [number, number, number, number, number])[]
  /** The body, as posed now, as capsules the points stay out of. */
  body?: (sk: Skeleton) => Capsule[]
  /** How quickly swinging dies away, per second (the solver's 1.5 if left out). Stiff tails driven fast want more, or they ring. */
  damping?: number
  /** A pinned point that moves further than this in a frame means the creature was moved, not walked: start still. */
  jump?: number
  /** Runs after the bones are turned, before the pose is updated: the elf clears its cloak of the legs. */
  after?: (sk: Skeleton) => void
}

export class Swing {
  readonly sim: Xpbd
  /** Each chain's bone indices and where its points start in the solver. */
  private chains: { bones: number[]; at: number; follow: number[] }[]
  private started = false
  private jump: number
  readonly spec: SwingSpec

  constructor(sk: Skeleton, spec: SwingSpec) {
    this.spec = spec
    let at = 0
    this.chains = spec.chains.map((c) => {
      const bones = c.bones.map((n) => sk.index(n))
      bones.forEach((b, k) => {
        if (b < 0) throw new Error(`swing: no bone ${c.bones[k]}`)
        if (k && sk.bones[b].parent !== bones[k - 1]) throw new Error(`swing: ${c.bones[k]} doesn't hang from ${c.bones[k - 1]}`)
      })
      if (!sk.bones[bones[bones.length - 1]].tail) throw new Error(`swing: ${c.bones[c.bones.length - 1]} has no tail`)
      const follow = bones.map((_, k) => (typeof c.follow === 'number' ? c.follow : c.follow[k] ?? c.follow[c.follow.length - 1]))
      const out = { bones, at, follow }
      at += bones.length + 1
      return out
    })
    this.jump = spec.jump ?? 0.75
    this.sim = new Xpbd(at)
    if (spec.damping !== undefined) this.sim.damping = spec.damping
    // lengths are measured at the rest pose, at the creature's size, then the pose is put back
    const was = { rotation: sk.rotation.slice(), offset: sk.offset.slice(), size: sk.size.slice(), rootScale: sk.rootScale }
    sk.reset()
    sk.rootScale = was.rootScale
    this.goals(sk, (i, p) => this.sim.place(i, p))
    spec.chains.forEach((c, ci) => {
      const { at: o, bones } = this.chains[ci]
      this.sim.fix(o)
      for (let k = 0; k < bones.length; k++) this.sim.link(o + k, o + k + 1)
      if (c.bend !== undefined) for (let k = 0; k + 2 <= bones.length; k++) this.sim.link(o + k, o + k + 2, c.bend)
    })
    for (const [a, i, b, j, compliance] of spec.ties ?? []) this.sim.link(this.chains[a].at + i, this.chains[b].at + j, compliance)
    sk.rotation.set(was.rotation); sk.offset.set(was.offset); sk.size.set(was.size); sk.rootScale = was.rootScale
    sk.update()
  }

  /** Where the move puts every point now. */
  private goals(sk: Skeleton, put: (i: number, p: Vec3) => void) {
    sk.update()
    for (const { bones, at } of this.chains) {
      bones.forEach((b, k) => put(at + k, posedPoint(sk, b, sk.bones[b].head)))
      const last = bones[bones.length - 1]
      put(at + bones.length, posedPoint(sk, last, sk.bones[last].tail!))
    }
  }

  /** Moves the parts on by `dt` seconds once the move is posed and the creature placed, and turns their bones. Leaves the pose updated. */
  update(sk: Skeleton, dt: number) {
    const sim = this.sim, g = sim.gravity
    let jumped = !this.started
    const loose = new Float64Array(sim.n)
    for (const c of this.chains) c.follow.forEach((f, k) => { loose[c.at + k + 1] = f })
    this.goals(sk, (i, p) => {
      if (sim.invMass[i] === 0) {
        if (Math.hypot(p[0] - sim.pos[i * 3], p[1] - sim.pos[i * 3 + 1], p[2] - sim.pos[i * 3 + 2]) > this.jump) jumped = true
        sim.pin(i, p)
      } else {
        // aimed as far above the pose as the pull lets gravity sag it, so standing still it hangs where the move put it
        const c = loose[i]
        sim.follow(i, [p[0] - g[0] * c, p[1] - g[1] * c, p[2] - g[2] * c], c)
      }
    })
    if (jumped) {
      this.goals(sk, (i, p) => sim.place(i, p))
      sim.settle()
    }
    this.started = true
    sim.capsules = this.spec.body?.(sk) ?? []
    sim.advance(Math.min(Math.max(dt, 0), 0.1))
    const p = (i: number): Vec3 => [sim.pos[i * 3], sim.pos[i * 3 + 1], sim.pos[i * 3 + 2]]
    for (const { bones, at } of this.chains) {
      bones.forEach((b, k) => {
        const a = p(at + k), z = p(at + k + 1)
        aim(sk, sk.bones[b].name, dir([z[0] - a[0], z[1] - a[1], z[2] - a[2]]))
      })
    }
    this.spec.after?.(sk)
    sk.update()
  }

  /** Forgets the motion: the next update starts still, where the move puts everything. */
  reset() { this.started = false }
}

/** A capsule between two bones' posed heads (or a ball at one), for `SwingSpec.body`. */
export function between(sk: Skeleton, a: string, b: string, r: number): Capsule {
  const at = (name: string): Vec3 => { const i = sk.index(name); return [sk.posedHead[i * 3], sk.posedHead[i * 3 + 1], sk.posedHead[i * 3 + 2]] }
  return { a: at(a), b: at(b), r }
}
