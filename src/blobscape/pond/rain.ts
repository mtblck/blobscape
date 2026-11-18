import { Blobs } from '../../splat-core/blobs.ts'
import type { Creature } from '../../splat-engine/body.ts'
import { Skeleton, emptySkin, setWeights } from '../../splat-engine/rig.ts'

/**
 * Rain you can see: every drop is in the air before it lands. A drop starts `FALL_FROM` meters up and falls at
 * `FALL` (a big raindrop's steady speed), drawn as the short streak it is over a frame; only when it reaches the
 * water or the ground under it is the water told. So the ring comes when the streak arrives, where it arrives.
 *
 * The streaks are blobs on one still bone, as many as could be in the air at once; one not falling is clear. Their
 * count never changes, so the world only takes their places again (`SplatWorld.reshape`).
 */

/** How fast a drop falls, meters a second. */
export const FALL = 9
/** How high over the water a drop is first seen, meters. */
export const FALL_FROM = 5
/** The most drops in the air at once. */
export const RAIN_MOST = 320
/** A streak's half length and half width, meters: about what a drop covers in a sixtieth of a second. */
const LONG = 0.07, WIDE = 0.006

/** A drop in the air. */
export interface Drop { x: number; z: number; y: number; /** Where it lands. */ floor: number }

export class Rain {
  /** The streaks, for the world. */
  readonly actor: Creature
  /** The drops in the air now. */
  readonly drops: Drop[] = []
  /** Whether the streaks' places changed in the last `place`. */
  changed = false
  private shown = 0
  private readonly box: { x0: number; x1: number; z0: number; z1: number; level: number }

  /** `box` is where rain can fall: x and z bounds, and the level `FALL_FROM` is counted from. */
  constructor(box: { x0: number; x1: number; z0: number; z1: number; level: number }) {
    this.box = box
    const blobs = new Blobs(RAIN_MOST)
    for (let k = 0; k < RAIN_MOST; k++) {
      // spread through the whole space rain falls in, so the world's bounds hold every place a streak will be
      const u = (k % 13) / 12, v = ((k * 7) % 11) / 10, w = ((k * 5) % 17) / 16
      blobs.push({ center: [box.x0 + (box.x1 - box.x0) * u, box.level + FALL_FROM * w, box.z0 + (box.z1 - box.z0) * v], scale: [WIDE, LONG, WIDE], quat: [0, 0, 0, 1], color: [0.72, 0.8, 0.86], opacity: 0 })
    }
    const skeleton = new Skeleton([{ name: 'rain', parent: -1, head: [(box.x0 + box.x1) / 2, box.level, (box.z0 + box.z1) / 2] }])
    const skin = emptySkin(blobs.count)
    for (let k = 0; k < blobs.count; k++) setWeights(skin, k, [[0, 1]])
    this.actor = { blobs, skeleton, skin } as Creature
  }

  /** A new drop over (x, z), which will land at height `floor`. Dropped if the air is full. */
  add(x: number, z: number, floor: number) {
    if (this.drops.length < RAIN_MOST) this.drops.push({ x, z, y: this.box.level + FALL_FROM, floor })
  }

  /** Lets every drop fall for `dt` seconds; `landed` hears of each that reaches its floor. */
  step(dt: number, landed: (d: Drop) => void) {
    const drops = this.drops
    for (let k = drops.length - 1; k >= 0; k--) {
      const d = drops[k]
      d.y -= FALL * dt
      if (d.y > d.floor) continue
      landed(d)
      drops[k] = drops[drops.length - 1]
      drops.pop()
    }
  }

  /** Puts the streaks where the drops are. */
  place() {
    const b = this.actor.blobs, n = this.drops.length
    this.changed = n > 0 || this.shown > 0
    for (let k = 0; k < n; k++) {
      const d = this.drops[k]
      b.center[k * 3] = d.x
      b.center[k * 3 + 1] = Math.max(d.floor + LONG, d.y)
      b.center[k * 3 + 2] = d.z
      b.opacity[k] = 0.55
    }
    for (let k = n; k < this.shown; k++) b.opacity[k] = 0
    this.shown = n
  }
}
