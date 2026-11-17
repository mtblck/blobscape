import type { GameEvent } from './game.ts'

/**
 * Hit stop and shake: a landed blow freezes the fight for a moment and nudges the camera, so it feels heavy. Pure
 * (time in, numbers out) so tests can hold the lengths; the stage asks it how much game time a step may run and
 * where the camera sits off its path.
 */

/** Per kind of blow: how long the fight holds still (seconds) and how hard the camera shakes (world units). */
export const BLOWS = {
  sword: { hold: 0.05, shake: 0.035 },
  magic: { hold: 0.025, shake: 0.02 },
  burst: { hold: 0.07, shake: 0.07 },
  knock: { hold: 0.04, shake: 0.03 },
  break: { hold: 0.06, shake: 0.06 },
  barrel: { hold: 0.1, shake: 0.16 },
  hurt: { hold: 0.045, shake: 0.06 },
} as const

/** No hold lasts longer than this, however many blows land at once. */
export const MAX_HOLD = 0.12
/** Shake never goes past this, however many blows add up. */
export const MAX_SHAKE = 0.2
/** How fast shake dies away: e-folds a second. */
const SETTLE = 14

/** The blow an event is, if it is one. */
export function blowOf(e: GameEvent): keyof typeof BLOWS | undefined {
  switch (e.type) {
    case 'hit': return e.by === 'sword' ? 'sword' : e.by === 'blast' ? 'break' : e.by === 'magic' ? 'magic' : undefined
    case 'burst': return 'burst'
    case 'knock': return 'knock'
    case 'break': return e.kind === 'barrel' ? 'barrel' : 'break'
    case 'hurt': return 'hurt'
    default: return undefined
  }
}

export class Impact {
  /** Seconds of hold left. */
  hold = 0
  /** How hard the camera shakes now. */
  shake = 0
  /** Time run, for the shake's wobble. */
  private t = 0
  private readonly calm: boolean

  /** `calm` (reduced motion) keeps the hold, which moves nothing, but never shakes. */
  constructor(calm = false) { this.calm = calm }

  /** Takes a step's events: holds take the longest, shakes add up, both capped. */
  add(events: readonly GameEvent[]) {
    for (const e of events) {
      const b = blowOf(e)
      if (!b) continue
      this.hold = Math.min(MAX_HOLD, Math.max(this.hold, BLOWS[b].hold))
      if (!this.calm) this.shake = Math.min(MAX_SHAKE, this.shake + BLOWS[b].shake)
    }
  }

  /** Runs `dt` of real time and says how much of it the game gets: none while held, the rest after. */
  pass(dt: number): number {
    this.t += dt
    this.shake *= Math.exp(-dt * SETTLE)
    if (this.shake < 1e-4) this.shake = 0
    const held = Math.min(this.hold, dt)
    this.hold -= held
    return dt - held
  }

  /** Where the camera sits off its path now: a wobble of three unrelated rates, sized by the shake. */
  offset(): [number, number, number] {
    if (!this.shake) return [0, 0, 0]
    const t = this.t
    return [Math.sin(t * 71) * this.shake, Math.sin(t * 89 + 1.3) * this.shake * 0.7, Math.sin(t * 53 + 2.1) * this.shake]
  }
}
