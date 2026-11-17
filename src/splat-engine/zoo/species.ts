import type { Orbit } from '../../splat-core/orbit.ts'
import type { Creature } from '../body.ts'
import type { Skeleton } from '../rig.ts'
import type { SwingSpec } from '../swing.ts'

/** One of a creature's moves, as a function of time, recorded into a clip when the creature is made. */
export interface Move {
  /** The clip's name in a file. */
  name: string
  /** Its name on the page. */
  label: string
  /** What the creature is doing, for the view's description: "jumping on the spot". */
  doing: string
  /** How long one loop takes. */
  seconds: number
  /** Keys a second when it is recorded as a clip. */
  fps?: number
  /** Poses the skeleton `t` seconds into the move. */
  pose: (sk: Skeleton, t: number) => void
}

export interface Look { id: string; label: string }

/** A procedural creature the Creature page can show. */
export interface Species {
  /** Its id in addresses and lists. */
  id: string
  /** "frog": used in sentences. */
  name: string
  /** One line for the page. */
  blurb: string
  /** Blob counts on the detail chips, and the one picked first. */
  detail: number[]
  /** The blob count picked first. */
  start: number
  /** Its looks, the first the default. */
  looks: Look[]
  /** Builds it with about `count` blobs in a look. */
  make: (count: number, look: string) => Creature
  /** Its moves, the first played first. */
  moves: Move[]
  /** Where the camera starts. */
  view: Orbit
  /** For a made-up monster, the seed that makes it again. */
  seed?: number
  /** Loose parts (a tail, ears, a cloak) that swing after the body when it's played live (swing.ts); files and sheets keep the move as it is. */
  swing?: SwingSpec
}
