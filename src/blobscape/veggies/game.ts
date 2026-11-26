/**
 * Veggie Slayer's rules in plain numbers (pure, tested): vegetables thrown up from below the view, taps and swipes
 * that burst them, treats that cost a heart when hit, hearts lost to the ones that fall back, and the tally. Lengths
 * are in the play plane's units (the view's middle at 0, y up); times in seconds. The page draws it (`view.ts`).
 */

/** What can be thrown up. */
export type KindId =
  | 'carrot' | 'tomato' | 'onion' | 'cucumber'
  | 'broccoli' | 'lettuce' | 'pepper' | 'mushroom'
  | 'eggplant' | 'pumpkin'
  | 'sprout'
  | 'cookie' | 'icecream' | 'cupcake' | 'donut'

/** A vegetable to burst, the rare golden one, or a treat to leave alone. */
export type Group = 'veggie' | 'golden' | 'treat'

/** One kind of thing in the air. */
export interface Kind {
  id: KindId
  /** One of them, and more than one, for the tally. */
  name: string
  plural: string
  group: Group
  /** Points for bursting one (a treat's is 0: it costs a heart). */
  points: number
  /** How often it comes, against the others of its group. */
  weight: number
  /** How many hits it takes: a pumpkin cracks a piece off with each before it bursts. */
  hits: number
  /** Its size in the play plane, a radius (the page's models are cut to it). */
  radius: number
  /** How many colors it comes in (bell peppers: red, yellow, green). */
  variants: number
  /** How many of each color can be in the air at once (the page keeps one model for each). */
  copies: number
}

/** Common ones are worth 1, the middle ones 3, rare ones 5; the golden sprout 25. */
export const KINDS: readonly Kind[] = [
  { id: 'carrot', name: 'Carrot', plural: 'Carrots', group: 'veggie', points: 1, weight: 10, hits: 1, radius: 0.74, variants: 1, copies: 4 },
  { id: 'tomato', name: 'Tomato', plural: 'Tomatoes', group: 'veggie', points: 1, weight: 10, hits: 1, radius: 0.46, variants: 1, copies: 4 },
  { id: 'onion', name: 'Onion', plural: 'Onions', group: 'veggie', points: 1, weight: 10, hits: 1, radius: 0.58, variants: 1, copies: 4 },
  { id: 'cucumber', name: 'Cucumber', plural: 'Cucumbers', group: 'veggie', points: 1, weight: 10, hits: 1, radius: 0.66, variants: 1, copies: 4 },
  { id: 'broccoli', name: 'Broccoli', plural: 'Broccoli', group: 'veggie', points: 3, weight: 5, hits: 1, radius: 0.6, variants: 1, copies: 3 },
  { id: 'lettuce', name: 'Head of lettuce', plural: 'Heads of lettuce', group: 'veggie', points: 3, weight: 5, hits: 1, radius: 0.6, variants: 1, copies: 3 },
  { id: 'pepper', name: 'Bell pepper', plural: 'Bell peppers', group: 'veggie', points: 3, weight: 5, hits: 1, radius: 0.52, variants: 3, copies: 2 },
  { id: 'mushroom', name: 'Mushroom', plural: 'Mushrooms', group: 'veggie', points: 3, weight: 5, hits: 1, radius: 0.6, variants: 1, copies: 3 },
  { id: 'eggplant', name: 'Eggplant', plural: 'Eggplants', group: 'veggie', points: 5, weight: 2.2, hits: 1, radius: 0.66, variants: 1, copies: 2 },
  { id: 'pumpkin', name: 'Pumpkin', plural: 'Pumpkins', group: 'veggie', points: 5, weight: 2, hits: 3, radius: 0.8, variants: 1, copies: 2 },
  { id: 'sprout', name: 'Golden Brussels sprout', plural: 'Golden Brussels sprouts', group: 'golden', points: 25, weight: 1, hits: 1, radius: 0.4, variants: 1, copies: 1 },
  { id: 'cookie', name: 'Cookie', plural: 'Cookies', group: 'treat', points: 0, weight: 1, hits: 1, radius: 0.52, variants: 1, copies: 2 },
  { id: 'icecream', name: 'Ice cream cone', plural: 'Ice cream cones', group: 'treat', points: 0, weight: 1, hits: 1, radius: 0.66, variants: 1, copies: 2 },
  { id: 'cupcake', name: 'Cupcake', plural: 'Cupcakes', group: 'treat', points: 0, weight: 1, hits: 1, radius: 0.52, variants: 1, copies: 2 },
  { id: 'donut', name: 'Donut', plural: 'Donuts', group: 'treat', points: 0, weight: 1, hits: 1, radius: 0.52, variants: 1, copies: 2 },
]

export const kindOf = (id: KindId) => KINDS.find((k) => k.id === id)!

/** Hearts at the start. */
export const HEARTS = 5
/** Gravity, as a share of the view's height a second squared: so a throw takes about as long however big the view. */
export const GRAVITY = 0.9
/** Seconds between throws at the start, at the fastest, and how quickly it gets there (an e-fold every this many seconds). */
export const GAP_FIRST = 1.6, GAP_LEAST = 0.45, GAP_FALL = 75
/** No treats in the first seconds, and none of the golden sprout before this. */
export const TREATS_FROM = 12, GOLDEN_FROM = 20
/** The chance a throw is a treat, at first and at most. */
export const TREAT_FIRST = 0.07, TREAT_MOST = 0.15
/** The chance a throw is the golden sprout. */
export const GOLDEN_CHANCE = 0.012
/** The most things in the air at once (a phone draws them all, and bursts besides). */
export const MOST_FLYING = 9
/** Throws start coming two or three at once after this many seconds. */
export const VOLLEYS_FROM = 25

/** A thing in the air. */
export interface Flyer {
  /** Numbered from 1 in the order thrown. */
  id: number
  kind: KindId
  /** Which color, for kinds with several. */
  variant: number
  /** Which of its kind's models it is, while it flies (0 to `copies` − 1). */
  copy: number
  x: number
  y: number
  vx: number
  vy: number
  /** How far it has rolled about the line of sight, in radians, and how fast. */
  spin: number
  spinRate: number
  /** How far it has turned about the upright, rocking, and its own phase in that. */
  wobble: number
  /** Hits it can still take. */
  hitsLeft: number
  /** When it was last hit (for the shake a pumpkin gives), -Infinity before. */
  hitAt: number
  /** The stroke that last hit it: one stroke hits a thing once. */
  stroke: number
}

/** What happened, for the page to draw and play. */
export type GameEvent =
  | { type: 'throw'; flyer: Flyer }
  | { type: 'burst'; flyer: Flyer; points: number; at: number; stroke: number }
  | { type: 'chip'; flyer: Flyer; piece: number; at: number }
  | { type: 'treat'; flyer: Flyer; at: number }
  | { type: 'miss'; flyer: Flyer; at: number }
  | { type: 'combo'; count: number; bonus: number; x: number; y: number; at: number }
  | { type: 'over'; at: number }

/** A small seeded random number source (mulberry32), so a seed plays the same game. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Seconds until the next throw, `t` seconds into a game. */
export function gapAt(t: number) { return GAP_LEAST + (GAP_FIRST - GAP_LEAST) * Math.exp(-t / GAP_FALL) }

/** How many go up together in a throw, at most, `t` seconds into a game. */
export function volleyAt(t: number) { return t < VOLLEYS_FROM ? 1 : t < VOLLEYS_FROM + 40 ? 2 : t < VOLLEYS_FROM + 100 ? 3 : 4 }

/** The bonus for bursting `count` things with one swipe. */
export function comboBonus(count: number) { return count < 2 ? 0 : count * (count - 1) }

/** The nearest a segment from (ax, ay) to (bx, by) comes to (px, py). */
export function segmentDistance(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy
  const s = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0
  return Math.hypot(ax + dx * s - px, ay + dy * s - py)
}

/** How many of each kind were burst, and the score: the end of a game's list. */
export type Tally = Partial<Record<KindId, number>>

/** One game: `step` it on, `slash` with a tap (a = b) or a piece of a swipe, `endStroke` when the finger lifts. */
export class Game {
  readonly random: () => number
  /** Seconds since the game began. */
  t = 0
  state: 'playing' | 'over' = 'playing'
  hearts = HEARTS
  score = 0
  /** What was burst, by kind (treats hit are counted too, apart from the veggies). */
  readonly tally: Tally = {}
  /** The most burst in one swipe. */
  bestCombo = 0
  /** How many fell back down unburst. */
  missed = 0
  readonly flying: Flyer[] = []
  /** The view's half width and half height in the play plane; the page sets them as the view changes. */
  halfW = 4
  halfH = 3
  /** Whether treats are thrown in among the veggies (a setting). */
  treats = true
  private nextAt = 0.6
  private nextId = 1
  /** Copies of each kind and color in use. */
  private readonly inUse = new Map<string, Set<number>>()
  /** Things burst by each stroke still down: its combo. */
  private readonly strokes = new Map<number, { count: number; x: number; y: number }>()

  readonly seed: number
  constructor(seed = 1) {
    this.seed = seed
    this.random = rng(seed)
  }

  /** The view: its half width and height in the play plane. */
  setView(halfW: number, halfH: number) {
    this.halfW = halfW
    this.halfH = halfH
  }

  /** Moves the game on by `dt` seconds: throws, flight, and what fell. */
  step(dt: number): GameEvent[] {
    const out: GameEvent[] = []
    if (this.state !== 'playing' || dt <= 0) return out
    this.t += dt
    const g = GRAVITY * this.halfH * 2
    for (const f of this.flying) {
      f.vy -= g * dt
      f.x += f.vx * dt
      f.y += f.vy * dt
      f.spin += f.spinRate * dt
      f.wobble += dt
    }
    // what fell back below the view: a heart for a veggie, nothing for a treat or the golden sprout
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i], k = kindOf(f.kind)
      if (f.vy < 0 && f.y < -this.halfH - k.radius * 1.2) {
        this.remove(i)
        if (k.group === 'veggie') {
          this.missed++
          this.hearts = Math.max(0, this.hearts - 1)
          out.push({ type: 'miss', flyer: f, at: this.t })
        }
      }
    }
    if (this.hearts <= 0) { this.end(out); return out }
    while (this.t >= this.nextAt) {
      const n = 1 + Math.floor(this.random() * volleyAt(this.t))
      for (let k = 0; k < n; k++) {
        const f = this.throwOne()
        if (f) out.push({ type: 'throw', flyer: f })
      }
      this.nextAt += gapAt(this.t) * (n > 1 ? 1.35 : 1) * (0.8 + this.random() * 0.4)
    }
    return out
  }

  /** After the end: what is still up falls on out of the view, with nothing more to lose. */
  drift(dt: number) {
    if (this.state !== 'over' || dt <= 0) return
    const g = GRAVITY * this.halfH * 2
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i]
      f.vy -= g * dt
      f.x += f.vx * dt
      f.y += f.vy * dt
      f.spin += f.spinRate * dt
      f.wobble += dt
      if (f.vy < 0 && f.y < -this.halfH - kindOf(f.kind).radius * 1.2) this.remove(i)
    }
  }

  /** Picks what to throw next. */
  pick(): { kind: KindId; variant: number } {
    const r = this.random()
    const goldenFlying = this.flying.some((f) => f.kind === 'sprout')
    if (this.t >= GOLDEN_FROM && !goldenFlying && r < GOLDEN_CHANCE) return { kind: 'sprout', variant: 0 }
    const treat = this.t < TREATS_FROM ? 0 : Math.min(TREAT_MOST, TREAT_FIRST + (this.t - TREATS_FROM) / 1500)
    const group: Group = this.treats && r < GOLDEN_CHANCE + treat && this.t >= TREATS_FROM ? 'treat' : 'veggie'
    const pool = KINDS.filter((k) => k.group === group)
    const total = pool.reduce((s, k) => s + k.weight, 0)
    let w = this.random() * total
    for (const k of pool) {
      w -= k.weight
      if (w <= 0) return { kind: k.id, variant: Math.floor(this.random() * k.variants) }
    }
    return { kind: pool[0].id, variant: 0 }
  }

  /** Throws one thing up from below the view, if there is room; undefined when there is none. */
  throwOne(asked?: { kind: KindId; variant: number }): Flyer | undefined {
    if (this.flying.length >= MOST_FLYING) return
    const { kind, variant } = asked ?? this.pick()
    const k = kindOf(kind)
    const used = this.copies(kind, variant)
    let copy = 0
    while (used.has(copy)) copy++
    if (copy >= k.copies) return
    used.add(copy)
    const { halfW, halfH, random } = this
    const H = halfH * 2, g = GRAVITY * H
    // from below the bottom edge, up to between half and nine tenths of the way, coming down somewhere else
    const x0 = (random() * 2 - 1) * halfW * 0.75
    const y0 = -halfH - k.radius
    const apex = -halfH + H * (0.5 + random() * 0.4)
    const vy = Math.sqrt(2 * g * (apex - y0))
    const flight = (2 * vy) / g
    const x1 = Math.max(-halfW * 0.8, Math.min(halfW * 0.8, x0 + (random() * 2 - 1) * halfW * 0.9))
    const f: Flyer = {
      id: this.nextId++, kind, variant, copy, x: x0, y: y0, vx: (x1 - x0) / flight, vy,
      spin: random() * Math.PI * 2, spinRate: (random() < 0.5 ? -1 : 1) * (0.8 + random() * 2.2), wobble: random() * 10,
      hitsLeft: k.hits, hitAt: -Infinity, stroke: -1,
    }
    this.flying.push(f)
    return f
  }

  /**
   * A tap (a = b) or a piece of a swipe from a to b, with `reach` added to every thing's own radius (a fingertip's
   * width). `stroke` names the touch it is part of: one stroke hits a thing once.
   */
  slash(stroke: number, ax: number, ay: number, bx: number, by: number, reach: number): GameEvent[] {
    const out: GameEvent[] = []
    if (this.state !== 'playing') return out
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i], k = kindOf(f.kind)
      if (f.stroke === stroke) continue
      if (segmentDistance(ax, ay, bx, by, f.x, f.y) > k.radius + reach) continue
      f.stroke = stroke
      f.hitAt = this.t
      f.hitsLeft--
      if (k.group === 'treat') {
        this.remove(i)
        this.hearts = Math.max(0, this.hearts - 1)
        this.tally[f.kind] = (this.tally[f.kind] ?? 0) + 1
        out.push({ type: 'treat', flyer: f, at: this.t })
        continue
      }
      if (f.hitsLeft > 0) {
        // a crack, and it is knocked a little higher
        f.vy = Math.max(f.vy, 0) + GRAVITY * this.halfH * 0.35
        out.push({ type: 'chip', flyer: f, piece: k.hits - f.hitsLeft - 1, at: this.t })
        continue
      }
      this.remove(i)
      this.score += k.points
      this.tally[f.kind] = (this.tally[f.kind] ?? 0) + 1
      const s = this.strokes.get(stroke) ?? { count: 0, x: 0, y: 0 }
      s.count++
      s.x = f.x
      s.y = f.y
      this.strokes.set(stroke, s)
      out.push({ type: 'burst', flyer: f, points: k.points, at: this.t, stroke })
    }
    if (this.hearts <= 0) this.end(out)
    return out
  }

  /** The finger lifted: a swipe that burst two or more is a combo, worth a bonus. */
  endStroke(stroke: number): GameEvent[] {
    const s = this.strokes.get(stroke)
    this.strokes.delete(stroke)
    if (!s || s.count < 2 || this.state !== 'playing') return []
    const bonus = comboBonus(s.count)
    this.score += bonus
    this.bestCombo = Math.max(this.bestCombo, s.count)
    return [{ type: 'combo', count: s.count, bonus, x: s.x, y: s.y, at: this.t }]
  }

  /** The veggie that will fall out of the view soonest, for keyboard play: Space slices it. */
  nearestToFalling(): Flyer | undefined {
    let best: Flyer | undefined, soonest = Infinity
    const g = GRAVITY * this.halfH * 2
    for (const f of this.flying) {
      if (kindOf(f.kind).group === 'treat') continue
      // time until it is back at the bottom edge: y + vy t − g t²/2 = −halfH
      const c = f.y + this.halfH
      const t = (f.vy + Math.sqrt(Math.max(0, f.vy * f.vy + 2 * g * c))) / g
      // one still below the edge on its way up is not in reach yet
      if (f.y < -this.halfH && f.vy > 0) continue
      if (t < soonest) { soonest = t; best = f }
    }
    return best
  }

  /** How many veggies were burst in all, and the treats hit. */
  counts() {
    let veggies = 0, treats = 0
    for (const k of KINDS) {
      const n = this.tally[k.id] ?? 0
      if (k.group === 'treat') treats += n
      else veggies += n
    }
    return { veggies, treats }
  }

  private copies(kind: KindId, variant: number) {
    const key = `${kind}/${variant}`
    let s = this.inUse.get(key)
    if (!s) this.inUse.set(key, (s = new Set()))
    return s
  }

  private remove(i: number) {
    const [f] = this.flying.splice(i, 1)
    this.copies(f.kind, f.variant).delete(f.copy)
  }

  private end(out: GameEvent[]) {
    if (this.state === 'over') return
    this.state = 'over'
    out.push({ type: 'over', at: this.t })
  }
}

/** A best score kept on this device (`localStorage`); none where storage is missing or refused. */
export const BEST_KEY = 'blobscape-veggie-best'
