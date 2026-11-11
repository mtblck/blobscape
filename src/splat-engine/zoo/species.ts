import type { Orbit } from '../../splat-core/view.ts'
import type { Creature } from '../body.ts'
import type { Skeleton } from '../rig.ts'

/** One of a creature's moves, as a function of time, recorded into a clip when the creature is made. */
export interface Move {
  /** The clip's name in a file. */
  name: string
  /** Its name on the page. */
  label: string
  /** What the creature is doing, for the view's description: "jumping on the spot". */
  doing: string
  seconds: number
  fps?: number
  pose: (sk: Skeleton, t: number) => void
}

export interface Look { id: string; label: string }

/** A procedural creature the Creature page can show. */
export interface Species {
  id: string
  /** "frog": used in sentences. */
  name: string
  /** One line for the page. */
  blurb: string
  /** Blob counts on the detail chips, and the one picked first. */
  detail: number[]
  start: number
  looks: Look[]
  make: (count: number, look: string) => Creature
  moves: Move[]
  /** Where the camera starts. */
  view: Orbit
}
