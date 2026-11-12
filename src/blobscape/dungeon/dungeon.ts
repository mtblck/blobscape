import type { Creature } from '../../splat-engine/body.ts'
import { BOLTS, Game, KINDS, RULES, hopPeriod, type Difficulty, type Input, type SlimeKind } from './game.ts'
import { makeFloor, makePillars, makeTorches, makeWalls, poseTorches } from './hall.ts'
import { makeBolt, makeHero, poseBolt, poseHero, type HeroClock } from './hero.ts'
import { hideSlime, makeSlime, poseSlime } from './slime.ts'

/**
 * Dungeon Run without the drawing: the game, and every actor it needs built
 * once (the hall, the hero, a pool of slimes of each colour, a few bolts),
 * posed each frame from the game's state. Slimes not out stand hidden.
 */

export interface DungeonOptions {
  /** Blob budget, relative: 1 is about 150k blobs in all. */
  detail: number
  /** The hero's look (forest, dusk, autumn). */
  look: string
  difficulty: Difficulty
}

export const HERO_BLOBS = 22000
export const SLIME_BLOBS = 2600

export class Dungeon {
  readonly game: Game
  readonly hero: Creature
  readonly torches: Creature
  readonly slimes: Record<SlimeKind, Creature[]>
  readonly bolts: Creature[]
  /** Every actor for the SplatWorld. */
  readonly actors: Creature[]
  private clock: HeroClock = { idle: 0, walk: 0, down: -1, flicker: true }
  readonly opts: DungeonOptions

  constructor(opts: DungeonOptions, game?: Game) {
    this.opts = opts
    this.game = game ?? new Game(opts.difficulty)
    this.game.difficulty = opts.difficulty
    const d = Math.max(0.3, opts.detail)
    this.hero = makeHero(Math.round(HERO_BLOBS * Math.max(0.5, d)), opts.look)
    this.torches = makeTorches(d)
    const slimes = {} as Record<SlimeKind, Creature[]>
    for (const k of KINDS) slimes[k] = Array.from({ length: RULES[k].pool }, () => makeSlime(k, Math.round(SLIME_BLOBS * Math.max(0.5, d))))
    this.slimes = slimes
    this.bolts = Array.from({ length: BOLTS }, () => makeBolt(Math.round(900 * Math.max(0.6, d))))
    this.actors = [this.hero, makeFloor(d), makeWalls(d), makePillars(d), this.torches, ...KINDS.flatMap((k) => slimes[k]), ...this.bolts]
    this.update(0, { forward: 0, turn: 0 })
  }

  /** Whether the hero blinks after a hurt (the page turns it off under reduced motion). */
  set flicker(on: boolean) { this.clock.flicker = on }

  get blobCount() { return this.actors.reduce((s, a) => s + a.blobs.count, 0) }

  /** One frame: step the game, then pose the hero, every slime, every bolt and the torch flames. */
  update(dt: number, input: Input) {
    const g = this.game
    g.step(dt, input)
    if (g.state === 'down' && this.clock.down < 0) this.clock.down = 0
    if (g.state === 'playing') this.clock.down = -1
    poseHero(this.hero.skeleton, g.hero, this.clock, dt)
    const at: [number, number, number] = [g.hero.x, 0, g.hero.z]
    for (const k of KINDS) {
      this.slimes[k].forEach((actor, slot) => {
        const s = g.slimes.find((s) => s.kind === k && s.slot === slot)
        if (s) poseSlime(actor.skeleton, s, hopPeriod(k, g.difficulty))
        else hideSlime(actor.skeleton, at)
      })
    }
    this.bolts.forEach((actor, slot) => {
      const b = g.bolts.find((b) => b.slot === slot)
      if (b) poseBolt(actor.skeleton, b)
      else hideSlime(actor.skeleton, at)
    })
    poseTorches(this.torches.skeleton, g.time)
  }
}
