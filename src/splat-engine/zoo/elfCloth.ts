import { posedPoint, type Skeleton } from '../rig.ts'
import { aim, dir } from '../posing.ts'
import { Xpbd, type Capsule, type Vec3 } from '../xpbd.ts'
import { clearCloak } from './elf.ts'

/**
 * The elf's cloak and plait as cloth (issue #161): each cloak side and the
 * plait is a chain of three points (hung at the top, the fold, the hem),
 * pinned where the body carries the top and pulled loosely toward where the
 * move puts the rest, so they swing and lag when the elf turns or stops. The
 * two sides are tied at the fold and the hem, as one cloak. Legs, the body and
 * the head are capsules the points can't enter; `clearCloak` still runs after,
 * so no leg ever passes through the cloak between points.
 *
 *   const cloth = new ElfCloth(sk)        // once
 *   ...pose the move, place the elf...
 *   cloth.update(sk, dt)                  // turns the cloak and hair bones
 */

const CHAINS = [
  { bones: ['lCape1', 'lCape2'], follow: [0.004, 0.006] },
  { bones: ['rCape1', 'rCape2'], follow: [0.004, 0.006] },
  { bones: ['hair1', 'hair2'], follow: [0.0025, 0.004] },
] as const
/** Leg tubes, a little fatter than the legs (as in `clearCloak`). */
const LEGS = [['Thigh', 'Shin', 0.11], ['Shin', 'Foot', 0.09]] as const
/** If a pinned point jumps further than this in a frame, the elf was moved, not walked: start still. */
const JUMP = 0.75

export class ElfCloth {
  readonly sim: Xpbd
  private started = false

  constructor(sk: Skeleton) {
    this.sim = new Xpbd(CHAINS.length * 3)
    // lengths are measured at the rest pose, then the pose is put back
    const was = { rotation: sk.rotation.slice(), offset: sk.offset.slice(), size: sk.size.slice(), rootScale: sk.rootScale }
    sk.reset()
    sk.rootScale = was.rootScale
    this.goals(sk, (i, p) => this.sim.place(i, p))
    CHAINS.forEach((_, c) => {
      const o = c * 3
      this.sim.fix(o)
      this.sim.link(o, o + 1)
      this.sim.link(o + 1, o + 2)
      // a soft bend, so a chain folds but doesn't kink back on itself
      this.sim.link(o, o + 2, 0.002)
    })
    // the cloak's two halves are one piece of cloth: tied across at the fold and the hem, with a little give
    this.sim.link(1, 4, 0.0005)
    this.sim.link(2, 5, 0.001)
    sk.rotation.set(was.rotation); sk.offset.set(was.offset); sk.size.set(was.size); sk.rootScale = was.rootScale
    sk.update()
  }

  /** Where the move puts each point now: tops at their bone heads, the rest at the next head or the tail. */
  private goals(sk: Skeleton, put: (i: number, p: Vec3) => void) {
    sk.update()
    CHAINS.forEach((ch, c) => {
      const a = sk.index(ch.bones[0]), b = sk.index(ch.bones[1]), tail = sk.bones[b].tail!
      put(c * 3, posedPoint(sk, a, sk.bones[a].head))
      put(c * 3 + 1, posedPoint(sk, b, sk.bones[b].head))
      put(c * 3 + 2, posedPoint(sk, b, tail))
    })
  }

  /** The body as capsules, as posed now. */
  private body(sk: Skeleton): Capsule[] {
    const head = (name: string): Vec3 => { const b = sk.index(name); return [sk.posedHead[b * 3], sk.posedHead[b * 3 + 1], sk.posedHead[b * 3 + 2]] }
    const out: Capsule[] = [
      { a: head('hips'), b: head('chest'), r: 0.1 },
      { a: posedPoint(sk, sk.index('head'), [0, 1.73, 0.02]), b: posedPoint(sk, sk.index('head'), [0, 1.73, 0.02]), r: 0.1 },
    ]
    for (const s of ['l', 'r']) for (const [from, to, r] of LEGS) out.push({ a: head(`${s}${from}`), b: head(`${s}${to}`), r })
    return out
  }

  /**
   * Moves the cloth on by `dt` seconds after the move has been posed and the elf placed, then turns the cloak and
   * hair bones to it and clears the cloak of the legs. Leaves the pose updated.
   */
  update(sk: Skeleton, dt: number) {
    const sim = this.sim
    let jumped = !this.started
    this.goals(sk, (i, p) => {
      if (sim.invMass[i] === 0) {
        if (Math.hypot(p[0] - sim.pos[i * 3], p[1] - sim.pos[i * 3 + 1], p[2] - sim.pos[i * 3 + 2]) > JUMP) jumped = true
        sim.pin(i, p)
      } else {
        // aimed as far above the pose as the pull lets gravity sag it, so standing still it hangs where the move put it
        const c = CHAINS[(i / 3) | 0].follow[(i % 3) - 1], g = sim.gravity
        sim.follow(i, [p[0] - g[0] * c, p[1] - g[1] * c, p[2] - g[2] * c], c)
      }
    })
    if (jumped) {
      this.goals(sk, (i, p) => sim.place(i, p))
      sim.settle()
    }
    this.started = true
    sim.capsules = this.body(sk)
    sim.advance(Math.min(dt, 0.1))
    CHAINS.forEach((ch, c) => {
      const p = (k: number): Vec3 => [sim.pos[(c * 3 + k) * 3], sim.pos[(c * 3 + k) * 3 + 1], sim.pos[(c * 3 + k) * 3 + 2]]
      const [p0, p1, p2] = [p(0), p(1), p(2)]
      aim(sk, ch.bones[0], dir([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]))
      aim(sk, ch.bones[1], dir([p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]]))
    })
    clearCloak(sk)
  }
}
