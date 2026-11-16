import { srgbToLinear } from '../../splat-core/color.ts'
import type { Creature } from '../../splat-engine/body.ts'
import { MAX_LIGHTS, type PointLight } from '../../splat-engine/engine.ts'
import { makeProp, poseProp } from './breakables.ts'
import { CRYSTAL_GAP, CRYSTALS, FLAME_GAP, FLAMES, makeBlaze, makeIce, paintFloor, poseBlaze, poseIce } from './elements.ts'
import { BOLT_POP, BOLTS, Game, KINDS, MAX_MP, PROPS, RULES, hopPeriod, type Difficulty, type Element, type Input, type SlimeKind } from './game.ts'
import { Patches } from './ground.ts'
import { TORCHES, flicker, makeFloor, makePillars, makeTorches, makeWalls, poseTorches } from './hall.ts'
import { makeBolt, makeHero, poseBolt, poseHero, type HeroClock } from './hero.ts'
import { COLORS, hideSlime, makeSlime, poseSlime } from './slime.ts'

/**
 * Dungeon Run without the drawing: the game, and every actor it needs built
 * once (the hall, the hero, a pool of slimes of each color, a few bolts of
 * each element, flames and ice for the floor), posed each frame from the
 * game's state. Slimes not out stand hidden. The floor's blobs are recolored
 * as it burns and freezes: `takeRepaint` says when the view should take
 * their colors again.
 */

export interface DungeonOptions {
  /** Blob budget, relative: 1 is about 150k blobs in all. */
  detail: number
  /** The hero's look (forest, dusk, autumn). */
  look: string
  difficulty: Difficulty
  /** Torchlight baked into the stone, or live lights: torches, the orb, bolts and bursts lighting what's near them each frame. */
  light: 'baked' | 'live'
}

/** In live light, everything away from a light is this bright (times its own color). */
export const LIVE_AMBIENT = 0.13
const lin = (c: number[]): [number, number, number] => [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])]

export const HERO_BLOBS = 22000
export const SLIME_BLOBS = 2600

export class Dungeon {
  readonly game: Game
  readonly hero: Creature
  readonly torches: Creature
  readonly slimes: Record<SlimeKind, Creature[]>
  /** A pool of bolts of each element: bolt `slot` of the game is drawn by the one of its element. */
  readonly bolts: Record<Element, Creature[]>
  /** The crates, urns and barrels, in the game's `PROPS` order. */
  readonly props: Creature[]
  readonly floor: Creature
  /** The flames and the ice that stand on the floor where it burns and freezes. */
  readonly blaze: Creature
  readonly ice: Creature
  private readonly floorBase: Float32Array
  private readonly fireSpots = new Patches(FLAMES, FLAME_GAP)
  private readonly iceSpots = new Patches(CRYSTALS, CRYSTAL_GAP, 0.6, 0.12)
  private painted = -1
  private stained = 0
  private repaint = false
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
    const live = opts.light === 'live'
    this.torches = makeTorches(d, live)
    const slimes = {} as Record<SlimeKind, Creature[]>
    for (const k of KINDS) slimes[k] = Array.from({ length: RULES[k].pool }, () => makeSlime(k, Math.round(SLIME_BLOBS * Math.max(0.5, d))))
    this.slimes = slimes
    const bolts = (e: Element) => Array.from({ length: BOLTS }, () => makeBolt(Math.round(900 * Math.max(0.6, d)), e))
    this.bolts = { fire: bolts('fire'), frost: bolts('frost') }
    this.floor = makeFloor(d, live)
    this.floorBase = this.floor.blobs.color.slice(0, this.floor.blobs.count * 3)
    this.blaze = makeBlaze(Math.round(4200 * Math.max(0.5, d)))
    this.ice = makeIce(Math.round(3000 * Math.max(0.5, d)))
    this.props = PROPS.map((p) => makeProp(p.kind, Math.round((p.kind === 'urn' ? 2000 : 3400) * Math.max(0.5, d))))
    this.actors = [this.hero, this.floor, makeWalls(d, live), makePillars(d, live), this.torches, ...KINDS.flatMap((k) => slimes[k]), ...this.bolts.fire, ...this.bolts.frost, this.blaze, this.ice, ...this.props]
    this.update(0, { forward: 0, turn: 0 })
  }

  /** Whether the hero blinks after a hurt (the page turns it off under reduced motion). */
  set flicker(on: boolean) { this.clock.flicker = on }

  get blobCount() { return this.actors.reduce((s, a) => s + a.blobs.count, 0) }

  /** True once after the floor's colors changed: the view then takes them again (`SplatWorld.recolor(floor)`). */
  takeRepaint() {
    const was = this.repaint
    this.repaint = false
    return was
  }

  /** How many of the floor's blobs are not their own color now. */
  get stainedBlobs() { return this.stained }

  /** One frame: step the game, then pose the hero, every slime, every bolt, the flames and the ice. */
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
    for (const e of ['fire', 'frost'] as Element[]) {
      this.bolts[e].forEach((actor, slot) => {
        const b = g.bolts.find((b) => b.slot === slot && b.element === e)
        if (b) poseBolt(actor.skeleton, b)
        else hideSlime(actor.skeleton, at)
      })
    }
    g.props.forEach((p) => poseProp(this.props[p.slot].skeleton, p))
    // the floor: its colors and where the flames and the ice stand change only when the ground did
    const ground = g.ground
    if (ground.version !== this.painted) {
      this.painted = ground.version
      this.fireSpots.update(ground, ground.fire)
      this.iceSpots.update(ground, ground.frost)
      this.stained = paintFloor(this.floor.blobs, this.floorBase, ground, this.opts.light === 'live')
      this.repaint = true
      poseIce(this.ice.skeleton, ground, this.iceSpots.cells)
    }
    poseBlaze(this.blaze.skeleton, ground, this.fireSpots.cells, g.time, !this.clock.flicker)
    poseTorches(this.torches.skeleton, g.time)
  }

  /**
   * The live lights as things stand: the eight torches (flickering with their
   * flames), the orb in the hero's hand (as bright as the magic left), each
   * bolt in its element's color, a flash of a slime's own color as it bursts,
   * and then each flame and each clump of ice on the floor.
   */
  lights(): PointLight[] {
    const g = this.game
    const calm = !this.clock.flicker
    const out: PointLight[] = TORCHES.map((t, i) => {
      // under reduced motion the torches burn steady
      const f = calm ? 0.9 : flicker(g.time, i)
      return { position: [t[0], t[1] + 0.1, t[2]], color: [2.4 * f, 1.0 * f, 0.32 * f], range: 2.9 * (0.8 + 0.2 * f) }
    })
    const sk = this.hero.skeleton, orb = sk.index('orb')
    const k = 0.25 + 0.75 * (g.hero.mp / MAX_MP) + (g.hero.castT >= 0 ? 0.8 : 0)
    // the orb turns orange while it throws fire
    const hot = g.hero.castT >= 0 && g.hero.spell === 'fire'
    out.push({ position: [sk.posedHead[orb * 3], sk.posedHead[orb * 3 + 1] + 0.05, sk.posedHead[orb * 3 + 2]], color: hot ? [1.7 * k, 0.75 * k, 0.3 * k] : [0.4 * k, 0.7 * k, 1.6 * k], range: 1.4 })
    // bolts and bursts, nearest the hero first, then the floor's lights, as many as the engine has room for
    const extra: PointLight[] = []
    for (const b of g.bolts) {
      const k = b.popped ? (calm ? 1.3 : 2.2) * (1 - b.t / BOLT_POP) : 1.3
      extra.push({ position: [b.x, 1, b.z], color: b.element === 'fire' ? [2.1 * k, 0.95 * k, 0.3 * k] : [0.6 * k, 0.9 * k, 2 * k], range: b.popped ? 2.4 : 2 })
    }
    for (const s of g.slimes) {
      if (s.phase !== 'burst' || s.t > 0.5) continue
      // a flash of the slime's color, gentler under reduced motion
      const c = lin(COLORS[s.kind].skin), k = (calm ? 0.9 : 2.5) * (1 - s.t / 0.5)
      extra.push({ position: [s.x, 0.5, s.z], color: [c[0] * k, c[1] * k, c[2] * k], range: 1.8 })
    }
    const far = (l: PointLight) => Math.hypot(l.position[0] - g.hero.x, l.position[2] - g.hero.z)
    extra.sort((a, b) => far(a) - far(b))
    // then what stands on the floor: each flame, and a cold glow from each clump of ice
    const floor: PointLight[] = []
    this.fireSpots.cells.forEach((cell, i) => {
      if (cell < 0) return
      const [x, z] = g.ground.center(cell)
      const k = g.ground.fire[cell] * (calm ? 0.9 : flicker(g.time, i + 3))
      floor.push({ position: [x, 0.45, z], color: [1.9 * k, 0.8 * k, 0.22 * k], range: 2.3 })
    })
    this.iceSpots.cells.forEach((cell) => {
      if (cell < 0) return
      const [x, z] = g.ground.center(cell)
      const k = g.ground.frost[cell]
      floor.push({ position: [x, 0.5, z], color: [0.3 * k, 0.5 * k, 0.85 * k], range: 1.9 })
    })
    floor.sort((a, b) => far(a) - far(b))
    return [...out, ...extra, ...floor].slice(0, MAX_LIGHTS)
  }
}
