import { rng } from '../../splat-engine/body.ts'
import { Ground, type Element } from './ground.ts'

export type { Element } from './ground.ts'

/**
 * Dungeon Run's rules, without any drawing: a square hall with four pillars
 * and three doors, a hero who runs, swings a sword and casts bolts of magic,
 * and slimes that come through the doors in waves and hop toward the hero.
 * A bolt is fire or frost, and where it lands the floor catches and spreads
 * (ground.ts): fire burns whatever stands in it, frost slows it.
 * Everything is plain numbers, stepped by `step(dt, input)`, so it runs in
 * Node tests; the stage poses the blobs from what it finds here.
 *
 * Seen from behind the hero at the start, +z is ahead and +x is to the left
 * (as in Forest Walk). Headings are radians, 0 facing +z, positive turning
 * toward +x.
 */

/** Half the hall's width: it runs from −HALF to HALF in x and z. */
export const HALF = 7
export const PILLARS: { x: number; z: number; r: number }[] = [
  { x: 3.3, z: 3.3, r: 0.45 }, { x: -3.3, z: 3.3, r: 0.45 }, { x: 3.3, z: -3.3, r: 0.45 }, { x: -3.3, z: -3.3, r: 0.45 },
]
/** Where slimes come in: the far wall's middle, and one in each side wall. */
export const DOORS: { x: number; z: number; heading: number }[] = [
  { x: 0, z: HALF - 0.4, heading: Math.PI },
  { x: HALF - 0.4, z: 1.5, heading: -Math.PI / 2 },
  { x: -HALF + 0.4, z: 1.5, heading: Math.PI / 2 },
]

/**
 * Things standing about the hall that break: a crate takes two blows and has a little health in it, an urn takes one
 * and holds magic, and a barrel is full of oil, so breaking it sets the floor alight and throws back the slimes near
 * it. Whole, each is a circle nothing walks through; fire on the floor burns crates and barrels like anything else.
 */
export type PropKind = 'crate' | 'urn' | 'barrel'
export const PROP_RULES: Record<PropKind, { label: string; hp: number; r: number; burns: boolean }> = {
  crate: { label: 'crate', hp: 2, r: 0.33, burns: true },
  urn: { label: 'urn', hp: 1, r: 0.22, burns: false },
  barrel: { label: 'barrel', hp: 2, r: 0.3, burns: true },
}
/** Where they stand: by the pillars and in the corners, clear of the doors and the middle of the hall, and no barrel within a swing of anything else. */
export const PROPS: { kind: PropKind; x: number; z: number }[] = [
  { kind: 'crate', x: 4.25, z: 3.3 }, { kind: 'urn', x: -4.15, z: 3.5 }, { kind: 'barrel', x: -3.3, z: -4.2 },
  { kind: 'urn', x: 2.5, z: -3.6 }, { kind: 'crate', x: -5.9, z: -5.8 }, { kind: 'barrel', x: 6.1, z: -1.2 },
  { kind: 'crate', x: 5.7, z: 5.9 }, { kind: 'urn', x: 6.1, z: -5.2 }, { kind: 'barrel', x: -6.0, z: 5.6 },
]
/** What breaking one gives: a crate's health, an urn's magic, and how far a barrel's blast reaches and what it takes off a slime. */
export const CRATE_HEAL = 10
export const URN_MAGIC = 25
export const BARREL_BLAST = 1.5
export const BARREL_HARM = 2

export const KINDS = ['green', 'blue', 'red', 'purple', 'gold'] as const
export type SlimeKind = (typeof KINDS)[number]

export interface KindRule {
  label: string
  hp: number
  /** Average ground speed, meters a second (they cover it all while in the air). */
  speed: number
  /** Seconds from one hop to the next. */
  hop: number
  /** Health a touch takes off the hero, at normal difficulty. */
  damage: number
  /** Size, relative: radius is SLIME_R times this. */
  size: number
  /** How many of this color can be out at once (the stage builds this many). */
  pool: number
  /** First wave it comes in. */
  from: number
}

export const RULES: Record<SlimeKind, KindRule> = {
  green: { label: 'green', hp: 2, speed: 1.2, hop: 1.0, damage: 10, size: 1, pool: 4, from: 1 },
  blue: { label: 'blue', hp: 3, speed: 1.4, hop: 0.9, damage: 12, size: 1.05, pool: 3, from: 2 },
  red: { label: 'red', hp: 2, speed: 2.3, hop: 0.7, damage: 14, size: 0.9, pool: 3, from: 3 },
  purple: { label: 'purple', hp: 6, speed: 1.0, hop: 1.3, damage: 20, size: 1.45, pool: 2, from: 4 },
  gold: { label: 'gold', hp: 3, speed: 1.9, hop: 0.8, damage: 8, size: 0.95, pool: 1, from: 2 },
}
/** A slime's radius at size 1, meters. */
export const SLIME_R = 0.36
/** Bursting a gold slime gives this much health and magic back. */
export const GOLD_HEAL = 25

export const HERO_R = 0.3
export const MAX_HP = 100
export const MAX_MP = 100
export const RUN_SPEED = 2.6
const BACK_SPEED = 1.3
const TURN_RATE = 2.6

/** The sword: one swing takes SWING seconds and can hit between HIT_FROM and HIT_TO of it. */
export const SWING = 0.42
const HIT_FROM = 0.1, HIT_TO = 0.24
export const SWORD_REACH = 1.25
/** A swing turns the hero to a slime within this far, and steps in up to LUNGE meters to reach it. */
export const LUNGE_RANGE = 2.4
const LUNGE = 0.9
const SWORD_ARC = 1.25
/** Magic: a bolt costs SPELL_COST, leaves the hand CAST_AT into a cast of CAST seconds. */
export const SPELL_COST = 25
export const CAST = 0.45
const CAST_AT = 0.18
const MP_REGEN = 7
export const BOLT_SPEED = 9
const BOLT_LIFE = 1.5
export const BOLT_POP = 0.45
export const BOLTS = 4
/** Seconds flames stay on a body after it leaves the fire. */
export const ALIGHT_FOR = 1.5
/** How high flames and steam sit on a slime and on a prop, meters. */
export const SLIME_TOP = 0.35
export const PROP_TOP = 0.5

/** What a bolt takes off the slime it hits: fire hits harder, frost chills. */
export const BOLT_HARM: Record<Element, number> = { fire: 2, frost: 1 }
/** Seconds a slime stays chilled after a frost bolt or leaving frozen floor, and how much of its speed it keeps. */
export const CHILL = 3
export const CHILL_SPEED = 0.4
/** Standing in fire: a slime loses a point of health this often; the hero loses HERO_BURN health this often. */
export const BURN_EVERY = 0.7
export const HERO_BURN = 4
const HERO_BURN_EVERY = 0.5
/** The share of its speed the hero keeps on frozen floor. */
const ICE_SPEED = 0.65
/** Seconds a slime takes to grow in at a door, and to burst. */
export const SPAWN = 0.6
export const BURST = 1.6
/** Seconds the hero can't be hurt again after a touch. */
const GRACE = 0.9

export type Difficulty = 'gentle' | 'normal' | 'hard'
const HARM: Record<Difficulty, number> = { gentle: 0.5, normal: 1, hard: 1.6 }
const HASTE: Record<Difficulty, number> = { gentle: 0.85, normal: 1, hard: 1.2 }

export interface Input {
  /** −1 (back) to 1 (forward). */
  forward: number
  /** −1 (left) to 1 (right). */
  turn: number
  /** Held or tapped since the last step: start a swing / a cast when free. */
  swing?: boolean
  /** A bolt of fire. */
  cast?: boolean
  /** A bolt of frost. */
  frost?: boolean
}

export interface Hero {
  x: number
  z: number
  heading: number
  speed: number
  hp: number
  mp: number
  /** Knock-back velocity, fading. */
  vx: number
  vz: number
  /** Time into the current swing, or −1. */
  swingT: number
  /** Counts swings, so a slime is hit once per swing. */
  swingN: number
  castT: number
  /** What the cast under way (or the last one) throws. */
  spell: Element
  /** Seconds of grace left after being hurt. */
  hurt: number
  /** Seconds until fire underfoot burns again. */
  burn: number
}

export interface Slime {
  /** Which of its color's pool it is drawn by. */
  slot: number
  kind: SlimeKind
  phase: 'spawn' | 'live' | 'burst'
  /** Seconds into the phase. */
  t: number
  x: number
  z: number
  heading: number
  hp: number
  /** Seconds into its hop cycle. */
  hopT: number
  vx: number
  vz: number
  /** The swing that last hit it. */
  hitBy: number
  /** Seconds since it was last hit (for a wobble), large when never. */
  struck: number
  /** Seconds of chill left: it moves slowly while above 0. */
  chill: number
  /** Seconds until fire underfoot burns it again. */
  burn: number
  /** How much it is on fire, 0 to 1: flames on its body, caught from the floor or a fire bolt; frost puts them out in steam. */
  alight: number
}

export interface Prop {
  /** Its place in `PROPS`, and the actor that draws it. */
  slot: number
  kind: PropKind
  x: number
  z: number
  hp: number
  phase: 'whole' | 'broken'
  /** Seconds into the phase: a prop put back grows in, a broken one's pieces fly and settle. */
  t: number
  /** The swing that last hit it. */
  hitBy: number
  /** Seconds since it was last hit (for a wobble), large when never. */
  struck: number
  /** The way the last blow was going, so the pieces fly on from it. */
  dx: number
  dz: number
  /** Seconds until fire underfoot burns it again. */
  burn: number
  /** How much it is on fire, 0 to 1 (only what can burn catches). */
  alight: number
}

export interface Bolt {
  /** Pool index. */
  slot: number
  x: number
  z: number
  heading: number
  /** Seconds since cast; once it hits something, seconds since the pop. */
  t: number
  popped: boolean
  target: Slime | null
  element: Element
}

export type GameEvent =
  | { type: 'swing' } | { type: 'cast' } | { type: 'fizzle' }
  | { type: 'hit'; kind: SlimeKind; by: 'sword' | 'magic' | 'fire' | 'blast' }
  /** A prop was struck; a prop broke. */
  | { type: 'knock'; kind: PropKind } | { type: 'break'; kind: PropKind }
  /** A bolt landed and the floor caught; the hero stood in fire. */
  | { type: 'lit'; element: Element } | { type: 'scorch'; damage: number }
  | { type: 'burst'; kind: SlimeKind }
  | { type: 'hurt'; kind: SlimeKind; damage: number }
  | { type: 'wave'; wave: number } | { type: 'cleared'; wave: number } | { type: 'down'; wave: number }

export class Game {
  hero: Hero = newHero()
  slimes: Slime[] = []
  bolts: Bolt[] = []
  /** Everything that can break, in `PROPS` order. */
  props: Prop[] = newProps()
  /** The floor: what burns and what is frozen. */
  readonly ground: Ground
  wave = 0
  /** Slimes burst, all told. */
  score = 0
  time = 0
  state: 'playing' | 'down' = 'playing'
  /** A line across the view ("Wave 2"), until `banner.until`. */
  banner: { text: string; until: number } | null = null
  difficulty: Difficulty
  private toSpawn = 0
  private spawnAt = 0
  private nextWaveAt = 0
  private rand: () => number
  private lastSwing = false
  private lastCast = false
  private lastFrost = false
  /** What happened in the last step, for sounds, words and effects. */
  events: GameEvent[] = []

  constructor(difficulty: Difficulty = 'normal', seed = 1) {
    this.difficulty = difficulty
    this.rand = rng(seed * 7919 + 1)
    this.ground = new Ground(HALF, PILLARS, 0.5, seed)
    this.startWave(1)
  }

  /** Back to the start: full health, wave 1. */
  restart() {
    this.hero = newHero()
    this.slimes = []
    this.bolts = []
    this.props = newProps()
    this.ground.clear()
    this.score = 0
    this.state = 'playing'
    this.startWave(1)
  }

  get alive() { return this.slimes.filter((s) => s.phase !== 'burst').length }

  private startWave(w: number) {
    this.wave = w
    this.toSpawn = Math.min(20, 3 + 2 * (w - 1))
    this.spawnAt = this.time + 1.2
    this.nextWaveAt = 0
    // a new wave finds the hall set out again: whatever was broken is back, unless someone is standing there
    for (const p of this.props) {
      if (p.phase !== 'broken') continue
      const near = (x: number, z: number, r: number) => Math.hypot(x - p.x, z - p.z) < PROP_RULES[p.kind].r + r + 0.15
      if (near(this.hero.x, this.hero.z, HERO_R) || this.slimes.some((s) => s.phase !== 'burst' && near(s.x, s.z, slimeR(s)))) continue
      Object.assign(p, { hp: PROP_RULES[p.kind].hp, phase: 'whole', t: 0, hitBy: -1, struck: 99, burn: 0.25, alight: 0 })
    }
    this.banner = { text: `Wave ${w}`, until: this.time + 2 }
    this.events.push({ type: 'wave', wave: w })
  }

  step(dt: number, input: Input) {
    this.events = []
    this.time += dt
    const h = this.hero
    if (this.state === 'playing') {
      this.moveHero(dt, input)
      this.attack(dt, input)
    } else {
      h.speed = 0
      h.swingT = h.castT = -1
    }
    this.lastSwing = !!input.swing
    this.lastCast = !!input.cast
    this.lastFrost = !!input.frost
    this.ground.step(dt)
    this.stepProps(dt)
    this.moveBolts(dt)
    this.moveSlimes(dt)
    this.spawn()
    if (this.banner && this.time > this.banner.until) this.banner = null
  }

  private moveHero(dt: number, input: Input) {
    const h = this.hero
    // turning is slower mid-swing, so a swing commits
    const busy = h.swingT >= 0 ? 0.45 : 1
    h.heading -= input.turn * TURN_RATE * dt * busy
    const under = this.ground.at(h.x, h.z)
    const want = (input.forward >= 0 ? input.forward * RUN_SPEED : input.forward * BACK_SPEED) * (h.swingT >= 0 || h.castT >= 0 ? 0.4 : 1) * (under.frost > 0.4 ? ICE_SPEED : 1)
    h.speed += (want - h.speed) * (1 - Math.exp(-dt * 8))
    const fade = Math.exp(-dt * 6)
    h.vx *= fade
    h.vz *= fade
    h.x += (Math.sin(h.heading) * h.speed + h.vx) * dt
    h.z += (Math.cos(h.heading) * h.speed + h.vz) * dt
    ;[h.x, h.z] = this.keep(h.x, h.z, HERO_R)
    h.hurt = Math.max(0, h.hurt - dt)
    h.mp = Math.min(MAX_MP, h.mp + MP_REGEN * dt)
    // the hero's own fire burns too: a little, often, with no knock-back and no grace
    if (under.fire > 0.5) {
      h.burn -= dt
      if (h.burn <= 0) {
        h.burn = HERO_BURN_EVERY
        const dmg = Math.max(1, Math.round(HERO_BURN * HARM[this.difficulty]))
        h.hp = Math.max(0, h.hp - dmg)
        this.events.push({ type: 'scorch', damage: dmg })
        if (h.hp <= 0) { this.state = 'down'; this.banner = null; this.events.push({ type: 'down', wave: this.wave }) }
      }
    } else h.burn = 0.25
  }

  private attack(dt: number, input: Input) {
    const h = this.hero
    // a fresh press starts a swing at once; held, it swings again as soon as the last one ends
    const swing = input.swing && (!this.lastSwing || h.swingT < 0)
    // fire and frost share the casting hand: whichever is pressed (fire, if both)
    const fire = !!input.cast && (!this.lastCast || h.castT < 0), ice = !!input.frost && (!this.lastFrost || h.castT < 0)
    const cast = fire || ice
    if (swing && h.swingT < 0 && h.castT < 0) {
      h.swingT = 0
      h.swingN++
      // a little help: turn to face a slime that's roughly in front and close, and step in if the blade would fall short of it
      const near = this.nearest(LUNGE_RANGE, 1.2)
      if (near) {
        const dx = near.x - h.x, dz = near.z - h.z, d = Math.hypot(dx, dz) || 1
        h.heading = Math.atan2(dx, dz)
        // the push fades at 6 a second (see moveHero): 8.5 × the gap covers the gap by the time the blade comes round,
        // and carries on a little way after, still well short of the slime
        const gap = d - (SWORD_REACH + slimeR(near) - 0.2)
        if (gap > 0) { const v = 8.5 * Math.min(gap, LUNGE); h.vx += (dx / d) * v; h.vz += (dz / d) * v }
      }
      this.events.push({ type: 'swing' })
    } else if (cast && h.castT < 0 && h.swingT < 0) {
      if (h.mp >= SPELL_COST) {
        h.castT = 0
        h.spell = fire ? 'fire' : 'frost'
        h.mp -= SPELL_COST
        const near = this.nearest(12, 0.7)
        if (near) h.heading = Math.atan2(near.x - h.x, near.z - h.z)
        this.events.push({ type: 'cast' })
      } else if (fire ? !this.lastCast : !this.lastFrost) this.events.push({ type: 'fizzle' })
    }
    if (h.swingT >= 0) {
      const was = h.swingT
      h.swingT += dt
      if (h.swingT >= HIT_FROM && was < HIT_TO) {
        for (const s of this.slimes) {
          if (s.phase !== 'live' || s.hitBy === h.swingN) continue
          const dx = s.x - h.x, dz = s.z - h.z, d = Math.hypot(dx, dz)
          const off = Math.abs(angleTo(h.heading, Math.atan2(dx, dz)))
          if (d < SWORD_REACH + slimeR(s) && off < SWORD_ARC) {
            s.hitBy = h.swingN
            this.damage(s, 1, 'sword', dx / (d || 1), dz / (d || 1))
          }
        }
        for (const p of this.props) {
          if (p.phase !== 'whole' || p.hitBy === h.swingN) continue
          const dx = p.x - h.x, dz = p.z - h.z, d = Math.hypot(dx, dz)
          if (d < SWORD_REACH + PROP_RULES[p.kind].r && Math.abs(angleTo(h.heading, Math.atan2(dx, dz))) < SWORD_ARC) {
            p.hitBy = h.swingN
            this.strike(p, 1, dx / (d || 1), dz / (d || 1))
          }
        }
      }
      if (h.swingT >= SWING) h.swingT = -1
    }
    if (h.castT >= 0) {
      const was = h.castT
      h.castT += dt
      if (was < CAST_AT && h.castT >= CAST_AT) this.release()
      if (h.castT >= CAST) h.castT = -1
    }
  }

  /** The nearest live slime within `range`, no more than `cone` radians off the hero's heading. */
  nearest(range: number, cone: number): Slime | null {
    const h = this.hero
    let best: Slime | null = null, bd = Infinity
    for (const s of this.slimes) {
      if (s.phase !== 'live') continue
      const dx = s.x - h.x, dz = s.z - h.z, d = Math.hypot(dx, dz)
      if (d > range || Math.abs(angleTo(h.heading, Math.atan2(dx, dz))) > cone) continue
      if (d < bd) { bd = d; best = s }
    }
    return best
  }

  private release() {
    const h = this.hero
    const used = new Set(this.bolts.map((b) => b.slot))
    let slot = 0
    while (used.has(slot)) slot++
    if (slot >= BOLTS) {
      // every bolt is still out: the oldest makes way
      const old = this.bolts.shift()!
      slot = old.slot
    }
    const s = Math.sin(h.heading), c = Math.cos(h.heading)
    this.bolts.push({ slot, x: h.x + s * 0.5, z: h.z + c * 0.5, heading: h.heading, t: 0, popped: false, target: this.nearest(12, 0.7), element: h.spell })
  }

  private moveBolts(dt: number) {
    for (const b of this.bolts) {
      b.t += dt
      if (b.popped) continue
      // bolts curve a little toward the slime they were cast at
      if (b.target && b.target.phase !== 'burst') {
        const want = Math.atan2(b.target.x - b.x, b.target.z - b.z)
        const d = angleTo(b.heading, want)
        b.heading += Math.max(-3 * dt, Math.min(3 * dt, d))
      }
      b.x += Math.sin(b.heading) * BOLT_SPEED * dt
      b.z += Math.cos(b.heading) * BOLT_SPEED * dt
      const hit = this.slimes.find((s) => s.phase === 'live' && Math.hypot(s.x - b.x, s.z - b.z) < slimeR(s) + 0.2)
      const wall = Math.abs(b.x) > HALF - 0.2 || Math.abs(b.z) > HALF - 0.2 || PILLARS.some((p) => Math.hypot(p.x - b.x, p.z - b.z) < p.r + 0.1)
      if (hit) {
        this.damage(hit, BOLT_HARM[b.element], 'magic', Math.sin(b.heading), Math.cos(b.heading))
        if (b.element === 'frost') hit.chill = CHILL
        this.kindle(hit, b.element, SLIME_TOP)
      }
      const prop = hit ? undefined : this.props.find((p) => p.phase === 'whole' && Math.hypot(p.x - b.x, p.z - b.z) < PROP_RULES[p.kind].r + 0.15)
      if (prop) {
        this.strike(prop, BOLT_HARM[b.element], Math.sin(b.heading), Math.cos(b.heading))
        if (PROP_RULES[prop.kind].burns || b.element === 'frost') this.kindle(prop, b.element, PROP_TOP)
      }
      if (hit || prop || wall || b.t > BOLT_LIFE) {
        b.popped = true
        b.t = 0
        // where it lands, the floor catches
        this.ground.light(b.x, b.z, b.element)
        this.events.push({ type: 'lit', element: b.element })
      }
    }
    this.bolts = this.bolts.filter((b) => !(b.popped && b.t > BOLT_POP))
  }

  /** Inside the walls and out of the pillars and whatever props still stand. */
  private keep(x: number, z: number, r: number): [number, number] {
    for (const p of this.props) {
      if (p.phase !== 'whole') continue
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz), min = PROP_RULES[p.kind].r + r
      if (d < min && d > 1e-6) { x = p.x + (dx / d) * min; z = p.z + (dz / d) * min }
    }
    return keepIn(x, z, r)
  }

  /**
   * A bolt meets something: fire sets it alight, frost puts its flames out in a puff of steam at `top`, how high
   * the flames sit on it.
   */
  private kindle(t: { x: number; z: number; alight: number }, what: Element, top: number) {
    if (what === 'fire') t.alight = 1
    else if (t.alight > 0.15) { this.ground.puff(t.x, top, t.z); t.alight = 0 }
  }

  /** Flames on a body: lit by the floor under it, dying down after it leaves; frost underfoot puts them out in steam. */
  private smoulder(t: { x: number; z: number; alight: number }, under: { fire: number; frost: number }, top: number, dt: number) {
    if (under.fire > 0.5) t.alight = Math.max(t.alight, under.fire)
    else if (under.frost > 0.4 && t.alight > 0.15) { this.ground.puff(t.x, top, t.z); t.alight = 0 }
    else t.alight = Math.max(0, t.alight - dt / ALIGHT_FOR)
  }

  /** Props age, and fire on the floor burns the ones that can burn. */
  private stepProps(dt: number) {
    for (const p of this.props) {
      p.t += dt
      p.struck += dt
      if (p.phase !== 'whole') { p.alight = 0; continue }
      if (PROP_RULES[p.kind].burns) this.smoulder(p, this.ground.at(p.x, p.z), PROP_TOP, dt)
      if (!PROP_RULES[p.kind].burns || this.state !== 'playing') continue
      if (this.ground.at(p.x, p.z).fire > 0.5) {
        p.burn -= dt
        if (p.burn <= 0) { p.burn = BURN_EVERY; this.strike(p, 1, 0, 0) }
      } else p.burn = 0.25
    }
  }

  /** A blow to a prop going the way (dx, dz); at no health it breaks and gives what it holds. */
  private strike(p: Prop, n: number, dx: number, dz: number) {
    if (this.state !== 'playing' || p.phase !== 'whole') return
    p.hp -= n
    p.struck = 0
    p.dx = dx
    p.dz = dz
    if (p.hp > 0) { this.events.push({ type: 'knock', kind: p.kind }); return }
    p.phase = 'broken'
    p.t = 0
    this.events.push({ type: 'break', kind: p.kind })
    if (p.kind === 'crate') this.hero.hp = Math.min(MAX_HP, this.hero.hp + CRATE_HEAL)
    else if (p.kind === 'urn') this.hero.mp = Math.min(MAX_MP, this.hero.mp + URN_MAGIC)
    else {
      // oil: the floor catches where it stood, and the slimes close by are thrown back
      this.ground.light(p.x, p.z, 'fire')
      for (const s of this.slimes) {
        if (s.phase !== 'live') continue
        const sx = s.x - p.x, sz = s.z - p.z, d = Math.hypot(sx, sz)
        if (d < BARREL_BLAST + slimeR(s)) this.damage(s, BARREL_HARM, 'blast', sx / (d || 1), sz / (d || 1))
      }
    }
  }

  private damage(s: Slime, n: number, by: 'sword' | 'magic' | 'fire' | 'blast', dx: number, dz: number) {
    // a bolt still in flight when the hero goes down hits nothing that counts
    if (this.state !== 'playing') return
    s.hp -= n
    s.struck = 0
    const push = by === 'magic' ? 3 : by === 'fire' ? 0 : by === 'blast' ? 6 : 4.5
    s.vx += dx * push
    s.vz += dz * push
    this.events.push({ type: 'hit', kind: s.kind, by })
    if (s.hp <= 0) {
      s.phase = 'burst'
      s.t = 0
      this.score++
      this.events.push({ type: 'burst', kind: s.kind })
      if (s.kind === 'gold') {
        this.hero.hp = Math.min(MAX_HP, this.hero.hp + GOLD_HEAL)
        this.hero.mp = Math.min(MAX_MP, this.hero.mp + GOLD_HEAL * 1.6)
      }
    }
  }

  private moveSlimes(dt: number) {
    const h = this.hero
    const haste = HASTE[this.difficulty]
    for (const s of this.slimes) {
      s.t += dt
      s.struck += dt
      if (s.phase === 'burst') continue
      if (s.phase === 'spawn') {
        if (s.t >= SPAWN) { s.phase = 'live'; s.t = 0 }
        continue
      }
      const r = RULES[s.kind]
      const period = hopPeriod(s.kind, this.difficulty)
      // what it stands on: frost chills it for as long as it stays and a little after, fire burns it again and again
      const under = this.ground.at(s.x, s.z)
      s.chill = under.frost > 0.4 ? Math.max(s.chill, 0.6) : Math.max(0, s.chill - dt)
      this.smoulder(s, under, SLIME_TOP, dt)
      if (under.fire > 0.5 && this.state === 'playing') {
        s.burn -= dt
        if (s.burn <= 0) {
          s.burn = BURN_EVERY
          this.damage(s, 1, 'fire', 0, 0)
          if (s.phase !== 'live') continue
        }
      } else s.burn = 0.25
      const slow = s.chill > 0 ? CHILL_SPEED : 1
      // a chilled slime hops more slowly as well as less far
      s.hopT = (s.hopT + dt * (s.chill > 0 ? 0.6 : 1)) % period
      const air = hopShape(s.hopT, period).air
      // face the hero while on the ground (turning slowly), and go that way while in the air
      const want = Math.atan2(h.x - s.x, h.z - s.z)
      s.heading += angleTo(s.heading, want) * (1 - Math.exp(-dt * (air ? 1.5 : 5)))
      const v = air ? (r.speed * haste * slow) / AIR_SHARE : 0
      const fade = Math.exp(-dt * 5)
      s.vx *= fade
      s.vz *= fade
      if (this.state !== 'playing') continue
      s.x += (Math.sin(s.heading) * v + s.vx) * dt
      s.z += (Math.cos(s.heading) * v + s.vz) * dt
    }
    // slimes keep apart, out of the pillars and inside the walls
    const live = this.slimes.filter((s) => s.phase !== 'burst')
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j]
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = slimeR(a) + slimeR(b)
      if (d < min && d > 1e-6) {
        const push = (min - d) / 2
        a.x -= (dx / d) * push; a.z -= (dz / d) * push
        b.x += (dx / d) * push; b.z += (dz / d) * push
      }
    }
    for (const s of live) [s.x, s.z] = this.keep(s.x, s.z, slimeR(s))
    // touching the hero hurts, unless the hero was just hurt
    if (this.state !== 'playing') return
    for (const s of live) {
      if (s.phase !== 'live') continue
      const dx = h.x - s.x, dz = h.z - s.z, d = Math.hypot(dx, dz)
      if (d > slimeR(s) + HERO_R || d < 1e-6) continue
      // push them apart either way, so a slime doesn't sit inside the hero
      const min = slimeR(s) + HERO_R
      s.x -= (dx / d) * (min - d)
      s.z -= (dz / d) * (min - d)
      if (h.hurt > 0) continue
      const dmg = Math.round(RULES[s.kind].damage * HARM[this.difficulty])
      h.hp = Math.max(0, h.hp - dmg)
      h.hurt = GRACE
      h.vx += (dx / d) * 5
      h.vz += (dz / d) * 5
      s.vx -= (dx / d) * 2
      s.vz -= (dz / d) * 2
      this.events.push({ type: 'hurt', kind: s.kind, damage: dmg })
      if (h.hp <= 0) {
        this.state = 'down'
        this.banner = null
        this.events.push({ type: 'down', wave: this.wave })
        return
      }
    }
  }

  private spawn() {
    // burst slimes leave once their splats have faded
    this.slimes = this.slimes.filter((s) => !(s.phase === 'burst' && s.t > BURST))
    if (this.state !== 'playing') return
    if (this.toSpawn === 0) {
      if (this.alive > 0) return
      if (!this.nextWaveAt) {
        this.nextWaveAt = this.time + 3
        this.banner = { text: `Wave ${this.wave} cleared`, until: this.time + 2.4 }
        // a breather: some health back
        this.hero.hp = Math.min(MAX_HP, this.hero.hp + 20)
        this.events.push({ type: 'cleared', wave: this.wave })
      } else if (this.time >= this.nextWaveAt) this.startWave(this.wave + 1)
      return
    }
    if (this.time < this.spawnAt || this.alive >= Math.min(2 + this.wave, 7)) return
    const kinds = KINDS.filter((k) => RULES[k].from <= this.wave && this.free(k) >= 0 && (k !== 'gold' || this.rand() < 0.35))
    if (!kinds.length) return
    // the newest color comes more often in its own wave
    const kind = kinds.find((k) => RULES[k].from === this.wave && k !== 'gold' && this.rand() < 0.5) ?? kinds[Math.floor(this.rand() * kinds.length)]
    // from the door farthest from the hero, so nothing lands on top of them
    const door = [...DOORS].sort((a, b) => Math.hypot(b.x - this.hero.x, b.z - this.hero.z) - Math.hypot(a.x - this.hero.x, a.z - this.hero.z))[this.rand() < 0.7 ? 0 : 1]
    this.slimes.push({
      slot: this.free(kind), kind, phase: 'spawn', t: 0, x: door.x, z: door.z, heading: door.heading,
      hp: RULES[kind].hp, hopT: this.rand() * RULES[kind].hop, vx: 0, vz: 0, hitBy: -1, struck: 99, chill: 0, burn: 0.25, alight: 0,
    })
    this.toSpawn--
    this.spawnAt = this.time + 1.1
  }

  /** A free pool slot for this color, or −1. */
  private free(kind: SlimeKind) {
    const used = new Set(this.slimes.filter((s) => s.kind === kind).map((s) => s.slot))
    for (let i = 0; i < RULES[kind].pool; i++) if (!used.has(i)) return i
    return -1
  }

  /** For tests and the verify script: puts a slime of `kind` at (x, z), live. */
  place(kind: SlimeKind, x: number, z: number) {
    const slot = this.free(kind)
    if (slot < 0) throw new Error(`no ${kind} slime free`)
    const s: Slime = { slot, kind, phase: 'live', t: 0, x, z, heading: 0, hp: RULES[kind].hp, hopT: 0, vx: 0, vz: 0, hitBy: -1, struck: 99, chill: 0, burn: 0.25, alight: 0 }
    this.slimes.push(s)
    return s
  }

  /** For tests: stop the waves (nothing more comes through the doors). */
  hold() { this.toSpawn = 0; this.nextWaveAt = Infinity }
}

function newHero(): Hero {
  return { x: 0, z: -2.5, heading: 0, speed: 0, hp: MAX_HP, mp: MAX_MP, vx: 0, vz: 0, swingT: -1, swingN: 0, castT: -1, spell: 'fire', hurt: 0, burn: 0.25 }
}

/** Seconds from one hop to the next for this color at this difficulty. */
export const hopPeriod = (kind: SlimeKind, d: Difficulty) => RULES[kind].hop / HASTE[d]

export const slimeR = (s: { kind: SlimeKind }) => SLIME_R * RULES[s.kind].size

/** Shortest turn from a to b, in −π…π. */
export function angleTo(a: number, b: number) {
  const d = b - a
  return Math.atan2(Math.sin(d), Math.cos(d))
}

/** Pushes a body of radius r out of the pillars and back inside the walls. */
function newProps(): Prop[] {
  return PROPS.map((p, slot) => ({ slot, kind: p.kind, x: p.x, z: p.z, hp: PROP_RULES[p.kind].hp, phase: 'whole', t: 99, hitBy: -1, struck: 99, dx: 0, dz: 1, burn: 0.25, alight: 0 }))
}

export function keepIn(x: number, z: number, r: number): [number, number] {
  for (const p of PILLARS) {
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz), min = p.r + r
    if (d < min && d > 1e-6) { x = p.x + (dx / d) * min; z = p.z + (dz / d) * min }
  }
  const lim = HALF - r - 0.15
  return [Math.max(-lim, Math.min(lim, x)), Math.max(-lim, Math.min(lim, z))]
}

/** The share of a hop spent in the air. */
const AIR_SHARE = 0.45

/**
 * A slime's shape through one hop: a crouch, a leap that stretches it, a
 * landing that squashes it and a wobble back. `squash` is positive when
 * flattened, negative when stretched tall; `y` is its height off the floor.
 */
export function hopShape(t: number, period: number): { y: number; squash: number; air: boolean } {
  const u = t / period
  const up = 1 - AIR_SHARE
  if (u < up) {
    // on the ground: settle from the landing, then crouch for the next jump
    const g = u / up
    const settle = Math.min(1, g * 14) * Math.exp(-g * 6) * Math.cos(g * 14) * 0.6
    const crouch = Math.max(0, (g - 0.7) / 0.3) ** 2 * 0.6
    return { y: 0, squash: settle + crouch, air: false }
  }
  const a = (u - up) / AIR_SHARE
  return { y: Math.sin(Math.PI * a) * 0.38, squash: -0.35 * Math.sin(Math.PI * Math.min(1, a * 1.6)), air: true }
}
