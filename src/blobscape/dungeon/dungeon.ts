import { srgbToLinear } from '../../splat-core/color.ts'
import type { Creature } from '../../splat-engine/body.ts'
import { MAX_LIGHTS, type PointLight } from '../../splat-engine/engine.ts'
import { makeProp, poseProp, type PropBody } from './breakables.ts'
import { BODY_FLAMES, CRYSTAL_GAP, CRYSTALS, FLAME_GAP, FLAMES, climbCells, makeBlaze, makeIce, makeSteam, paintClimb, paintFloor, poseBlaze, poseBodyFlames, poseIce, poseSteam } from './elements.ts'
import { BOLT_POP, BOLTS, Game, KINDS, MAX_MP, PROP_TOP, PROPS, RULES, SLIME_TOP, hopPeriod, type Difficulty, type Element, type Input, type SlimeKind } from './game.ts'
import { Glow, gather, type Want } from './glow.ts'
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

/** The most lights the fire on the floor and on bodies, and the ice, are gathered into. */
export const FIRE_LIGHTS = 5
export const ICE_LIGHTS = 2

export class Dungeon {
  readonly game: Game
  readonly hero: Creature
  readonly torches: Creature
  readonly slimes: Record<SlimeKind, Creature[]>
  /** A pool of bolts of each element: bolt `slot` of the game is drawn by the one of its element. */
  readonly bolts: Record<Element, Creature[]>
  /** The crates, urns and barrels, in the game's `PROPS` order. */
  readonly props: PropBody[]
  readonly floor: Creature
  /** The flames and the ice that stand on the floor where it burns and freezes. */
  readonly blaze: Creature
  readonly ice: Creature
  /** Flames riding on burning slimes and props, and puffs of steam where fire met frost. */
  readonly bodyFlames: Creature
  readonly steam: Creature
  /** The walls and the pillars: frost climbs them and flames lick their lowest courses. */
  readonly walls: Creature
  readonly pillars: Creature
  private readonly floorBase: Float32Array
  private readonly climb: { actor: Creature; base: Float32Array; at: Int32Array; was: number }[]
  private readonly fireSpots = new Patches(FLAMES, FLAME_GAP)
  private readonly iceSpots = new Patches(CRYSTALS, CRYSTAL_GAP, 0.6, 0.12)
  private painted = -1
  private stained = 0
  private repaint: Creature[] = []
  /** Every actor for the SplatWorld. */
  readonly actors: Creature[]
  private clock: HeroClock = { idle: 0, walk: 0, down: -1, flicker: true }
  /** Lights that come and go, eased in and out (glow.ts), and the game time they were last eased to. */
  private readonly glow = new Glow()
  private litAt = 0
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
    this.bodyFlames = makeBlaze(Math.round(1800 * Math.max(0.5, d)), BODY_FLAMES, 61)
    this.steam = makeSteam(Math.round(1400 * Math.max(0.5, d)))
    this.walls = makeWalls(d, live)
    this.pillars = makePillars(d, live)
    this.climb = [this.walls, this.pillars].map((actor) => ({ actor, base: actor.blobs.color.slice(0, actor.blobs.count * 3), at: climbCells(actor.blobs, this.game.ground), was: 0 }))
    this.actors = [this.hero, this.floor, this.walls, this.pillars, this.torches, ...KINDS.flatMap((k) => slimes[k]), ...this.bolts.fire, ...this.bolts.frost, this.blaze, this.ice, this.bodyFlames, this.steam, ...this.props]
    this.update(0, { forward: 0, turn: 0 })
  }

  /** Whether the hero blinks after a hurt (the page turns it off under reduced motion). */
  set flicker(on: boolean) { this.clock.flicker = on }
  /** Whether the live lights cast shadows (the engine's grid of shadows); on unless turned off. */
  shadows = true

  get blobCount() { return this.actors.reduce((s, a) => s + a.blobs.count, 0) }

  /** The actors whose colors changed since last asked (the floor, the walls, the pillars): the view takes them again (`SplatWorld.recolor`). */
  takeRepaint() {
    const was = this.repaint
    this.repaint = []
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
    g.props.forEach((p) => poseProp(this.props[p.slot], p))
    // the floor: its colors and where the flames and the ice stand change only when the ground did
    const ground = g.ground
    if (ground.version !== this.painted) {
      this.painted = ground.version
      this.fireSpots.update(ground, ground.fire)
      this.iceSpots.update(ground, ground.frost)
      const live = this.opts.light === 'live'
      this.stained = paintFloor(this.floor.blobs, this.floorBase, ground, live)
      this.repaint = [this.floor]
      for (const c of this.climb) {
        // a wall goes up again only while something is on it, or once more as the last of it goes
        const n = paintClimb(c.actor.blobs, c.base, c.at, ground, live)
        if (n || c.was) this.repaint.push(c.actor)
        c.was = n
        this.stained += n
      }
      poseIce(this.ice.skeleton, ground, this.iceSpots.cells)
    }
    poseBlaze(this.blaze.skeleton, ground, this.fireSpots.cells, g.time, !this.clock.flicker)
    const burning = [
      ...g.slimes.filter((s) => s.phase === 'live').map((s) => ({ x: s.x, z: s.z, alight: s.alight, top: SLIME_TOP })),
      ...g.props.filter((p) => p.phase === 'whole').map((p) => ({ x: p.x, z: p.z, alight: p.alight, top: PROP_TOP })),
    ]
    poseBodyFlames(this.bodyFlames.skeleton, burning, g.time, !this.clock.flicker)
    poseSteam(this.steam.skeleton, ground.puffs(), !this.clock.flicker)
    poseTorches(this.torches.skeleton, g.time)
  }

  /**
   * The live lights as things stand: the eight torches (flickering with their
   * flames), then, eased in and out by `Glow` so nothing pops: the orb in the
   * hero's hand (as bright as the magic left), each bolt in its element's color,
   * a glow of a slime's own color as it bursts, the fire on the floor and on
   * burning bodies gathered into at most `FIRE_LIGHTS` lights, and the ice into
   * `ICE_LIGHTS`. Call it once a drawn frame: it moves the easing on.
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
    const k = 0.25 + 0.75 * (g.hero.mp / MAX_MP) + (g.hero.castT >= 0 ? 0.7 : 0)
    // the orb turns orange while it throws fire
    const hot = g.hero.castT >= 0 && g.hero.spell === 'fire'
    const wants: Want[] = [{ kind: 'orb', follow: true, position: [sk.posedHead[orb * 3], sk.posedHead[orb * 3 + 1] + 0.05, sk.posedHead[orb * 3 + 2]], color: hot ? [1.5 * k, 0.68 * k, 0.28 * k] : [0.4 * k, 0.7 * k, 1.5 * k], range: 1.4 }]
    // bolts ride on the bolt (no easing after it), and pop with a glow on the wall they hit; bursts are a soft glow
    for (const b of g.bolts) {
      const k = b.popped ? 1.9 * (1 - b.t / BOLT_POP) : 1.2
      wants.push({ kind: b.element, follow: true, position: [b.x, 1, b.z], color: b.element === 'fire' ? [2 * k, 0.9 * k, 0.28 * k] : [0.6 * k, 0.9 * k, 1.9 * k], range: b.popped ? 2.3 : 2 })
    }
    for (const s of g.slimes) {
      if (s.phase !== 'burst' || s.t > 0.5) continue
      const c = lin(COLORS[s.kind].skin), k = (calm ? 0.9 : 1.5) * (1 - s.t / 0.5)
      wants.push({ kind: `burst-${s.kind}`, position: [s.x, 0.5, s.z], color: [c[0] * k, c[1] * k, c[2] * k], range: 1.8 })
    }
    // the floor's flames and burning bodies, gathered into a few lights of fire with one slow, shared flicker
    // (many small lights each flickering on its own, and swapping in and out of the budget, is what looked wrong)
    const fires: Want[] = []
    this.fireSpots.cells.forEach((cell) => {
      if (cell < 0) return
      const [x, z] = g.ground.center(cell)
      const k = g.ground.fire[cell]
      fires.push({ kind: 'fire', position: [x, 0.45, z], color: [1.8 * k, 0.78 * k, 0.22 * k], range: 2.3 })
    })
    for (const t of [...g.slimes.filter((s) => s.phase === 'live'), ...g.props.filter((p) => p.phase === 'whole')]) {
      if (t.alight < 0.1) continue
      fires.push({ kind: 'fire', position: [t.x, 0.6, t.z], color: [1.7 * t.alight, 0.72 * t.alight, 0.2 * t.alight], range: 1.8 })
    }
    const sway = calm ? 0.95 : 0.93 + 0.05 * Math.sin(g.time * 5.3) + 0.02 * Math.sin(g.time * 8.9)
    for (const f of gather(fires, FIRE_LIGHTS)) wants.push({ ...f, kind: 'fire', color: [f.color[0] * sway, f.color[1] * sway, f.color[2] * sway] })
    const ice: Want[] = []
    this.iceSpots.cells.forEach((cell) => {
      if (cell < 0) return
      const [x, z] = g.ground.center(cell)
      const k = g.ground.frost[cell]
      ice.push({ kind: 'ice', position: [x, 0.5, z], color: [0.3 * k, 0.5 * k, 0.85 * k], range: 1.9 })
    })
    wants.push(...gather(ice, ICE_LIGHTS))
    const dt = g.time - this.litAt
    if (dt < 0 || dt > 1) this.glow.clear()
    this.litAt = g.time
    const extra = this.glow.update(wants, Math.max(0, Math.min(dt, 0.1)), MAX_LIGHTS - out.length)
    const all = [...out, ...extra].slice(0, MAX_LIGHTS)
    if (this.shadows) for (const l of all) l.shadow = true
    return all
  }
}
