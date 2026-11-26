/**
 * Veggie Slayer drawn (pure, tested): what is in the air put where the game says, bursts thrown as cubes, the words
 * that pop up, and the shake of a blow. Everything is posed from the stage's clock, so the same moments give the
 * same picture. The cubes and words come from fixed pools; when a pool runs dry its oldest piece is taken back, so a
 * flurry of bursts never costs more than the pools hold.
 */
import type { Skeleton } from '../../splat-engine/rig.ts'
import { GRAVITY, KINDS, kindOf, rng, type Flyer, type Game, type GameEvent } from './game.ts'
import { WORDS, modelOf, type Debris, type Veggies, type Words } from './models.ts'

/** How long a burst's cubes fly before they are gone, and when they start to shrink away. */
export const DEBRIS_LIFE = 1.15, DEBRIS_FADE = 0.6
/** How long a word stays up. */
export const WORD_LIFE = 0.95
/** How long a thing swells when hit without bursting. */
const HIT_PULSE = 0.22
/** A blow's shake: how far (play plane units, at strength 1), and how fast it dies (an e-fold every this many seconds). */
const SHAKE = 0.06, SHAKE_LIFE = 0.11

interface Piece { bone: number; head: readonly number[]; born: number; p: [number, number, number]; v: [number, number, number]; axis: [number, number, number]; rate: number; size: number }
interface Pop { bone: number; head: readonly number[]; born: number; x: number; y: number; tilt: number }

const turn = (axis: readonly number[], a: number): [number, number, number, number] => {
  const s = Math.sin(a / 2)
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(a / 2)]
}
const mul = (a: readonly number[], b: readonly number[]): [number, number, number, number] => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]

/** How a thing in the air is turned: rolled about the line of sight and rocked a little about the upright, so its face stays toward you. */
export function flyerTurn(f: Flyer) {
  return mul(turn([0, 0, 1], f.spin), turn([0, 1, 0], 0.4 * Math.sin(f.wobble * 2.3)))
}

/** The show: the three actors' poses, kept from the game and the bursts. */
export class Show {
  private readonly pieces: Piece[] = []
  private readonly pops: Pop[] = []
  private readonly shakes: { at: number; strength: number }[] = []
  private readonly random: () => number
  /** Which cube of each color goes next, round its pool. */
  private readonly next = new Map<string, number>()
  private readonly nextWord = new Map<string, number>()
  private words = 0

  readonly veggies: Veggies
  readonly debris: Debris
  readonly wordsOf: Words
  constructor(veggies: Veggies, debris: Debris, words: Words, seed = 7) {
    this.veggies = veggies
    this.debris = debris
    this.wordsOf = words
    this.random = rng(seed)
  }

  /** Cubes and words in the air now. */
  get busy() { return { cubes: this.pieces.length, words: this.pops.length } }

  /** What the game said happened, at the stage's time `now`: cubes, words and shakes. */
  hear(events: readonly GameEvent[], now: number, game: Game) {
    for (const e of events) {
      if (e.type === 'burst' || e.type === 'treat') {
        const f = e.flyer, k = kindOf(f.kind)
        this.throwCubes(f.x, f.y, modelOf(f.kind, f.variant).debris, now, k.id === 'pumpkin' ? 1.25 : 1, game.halfH)
        const list = k.group === 'golden' ? WORDS.golden : k.group === 'treat' ? WORDS.treat : WORDS.veggie
        this.pop(list[this.words++ % list.length], f.x, f.y + k.radius * 0.6, now, game.halfW)
        this.shakes.push({ at: now, strength: k.group === 'veggie' ? 0.6 + 0.15 * k.points : 1.4 })
      } else if (e.type === 'chip') {
        // the side that cracked off flies off its own way
        const f = e.flyer, side = e.piece === 0 ? 1 : -1, r = kindOf(f.kind).radius
        const [main, flesh] = modelOf(f.kind, f.variant).debris
        this.throwCubes(f.x + side * r * 0.6, f.y, [[main[0], 7], [flesh[0], 3]], now, 0.8, game.halfH, side)
        this.shakes.push({ at: now, strength: 0.7 })
      } else if (e.type === 'miss') {
        this.shakes.push({ at: now, strength: 0.9 })
      }
    }
  }

  private throwCubes(x: number, y: number, colors: readonly (readonly [string, number])[], now: number, power: number, halfH: number, lean = 0) {
    const r = this.random, speed = halfH * 1.1 * power
    for (const [color, count] of colors) {
      const pool = this.debris.pools.get(color)
      if (!pool) continue
      for (let i = 0; i < count; i++) {
        const at = (this.next.get(color) ?? 0) % pool.length
        this.next.set(color, at + 1)
        const { bone, head } = pool[at]
        // a cube taken back from an earlier burst leaves it
        const was = this.pieces.findIndex((p) => p.bone === bone)
        if (was >= 0) this.pieces.splice(was, 1)
        const a = r() * Math.PI * 2, s = speed * (0.35 + r() * 0.75)
        const ax = [r() - 0.5, r() - 0.5, r() - 0.5], al = Math.hypot(ax[0], ax[1], ax[2]) || 1
        this.pieces.push({
          bone, head, born: now, p: [x + (r() - 0.5) * 0.3, y + (r() - 0.5) * 0.3, 0.2 + r() * 0.3],
          v: [Math.cos(a) * s + lean * speed * 0.5, Math.sin(a) * s * 0.8 + speed * 0.55, (r() - 0.3) * s * 0.4],
          axis: [ax[0] / al, ax[1] / al, ax[2] / al], rate: (r() - 0.5) * 18, size: 0.7 + r() * 0.8,
        })
      }
    }
  }

  private pop(word: string, x: number, y: number, now: number, halfW: number) {
    const pool = this.wordsOf.pools.get(word)
    if (!pool) return
    const at = (this.nextWord.get(word) ?? 0) % pool.bones.length
    this.nextWord.set(word, at + 1)
    const { bone, head } = pool.bones[at]
    const was = this.pops.findIndex((p) => p.bone === bone)
    if (was >= 0) this.pops.splice(was, 1)
    // kept inside the view, so a word by the edge can be read whole
    const most = Math.max(0, halfW - pool.width * 0.6 - 0.1)
    this.pops.push({ bone, head, born: now, x: Math.max(-most, Math.min(most, x)), y, tilt: (this.random() - 0.5) * 0.4 })
  }

  /** Puts every model where the game has it (`sk` is the veggies' skeleton). */
  poseVeggies(sk: Skeleton, game: Game) {
    sk.reset()
    for (const slot of this.veggies.slots.values()) sk.size[slot.bone] = 0
    for (const f of game.flying) {
      const slot = this.veggies.slots.get(`${f.kind}/${f.variant}/${f.copy}`)
      if (!slot) continue
      const k = kindOf(f.kind), b = slot.bone, h = slot.head
      sk.offset.set([f.x - h[0], f.y - h[1], -h[2]], b * 3)
      sk.rotation.set(flyerTurn(f), b * 4)
      const since = game.t - f.hitAt
      sk.size[b] = since >= 0 && since < HIT_PULSE ? 1 + 0.18 * Math.sin((since / HIT_PULSE) * Math.PI) : 1
      // the pieces a pumpkin has lost so far
      const lost = k.hits - f.hitsLeft
      slot.pieces.forEach((p, i) => { sk.size[p] = i < lost ? 0 : 1 })
    }
    sk.update()
  }

  /**
   * Before a game: every veggie and the golden sprout stood in two rows across the top of the view, bobbing and
   * turning slowly so their sides show.
   */
  poseLineup(sk: Skeleton, now: number, halfW: number, halfH: number) {
    sk.reset()
    for (const slot of this.veggies.slots.values()) sk.size[slot.bone] = 0
    const rows = [LINEUP.slice(0, 6), LINEUP.slice(6)]
    const scale = Math.min(1, (halfW * 2) / (rows[1].length * 1.25))
    rows.forEach((row, r) => row.forEach(([kind, variant], i) => {
      const slot = this.veggies.slots.get(`${kind}/${variant}/0`)
      if (!slot) return
      const x = (i - (row.length - 1) / 2) * ((halfW * 1.85) / row.length), y = halfH * (r === 0 ? 0.55 : 0.08)
      const b = slot.bone, h = slot.head, phase = i * 0.9 + r * 2
      sk.offset.set([x - h[0], y + 0.08 * Math.sin(now * 2 + phase) - h[1], -h[2]], b * 3)
      sk.rotation.set(turn([0, 1, 0], 0.7 * Math.sin(now * 0.8 + phase)), b * 4)
      sk.size[b] = scale * (kind === 'pumpkin' ? 0.8 : 1)
    }))
    sk.update()
  }

  /** Puts the cubes of every burst where they have flown to by `now`, and the words where they have risen to. */
  poseBursts(debris: Skeleton, words: Skeleton, now: number, halfH: number) {
    debris.reset()
    for (let b = 1; b < debris.count; b++) debris.size[b] = 0
    const g = GRAVITY * halfH * 2 * 1.2
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i], age = now - p.born
      if (age >= DEBRIS_LIFE || age < 0) { this.pieces.splice(i, 1); continue }
      const at = [p.p[0] + p.v[0] * age, p.p[1] + p.v[1] * age - 0.5 * g * age * age, p.p[2] + p.v[2] * age]
      debris.offset.set([at[0] - p.head[0], at[1] - p.head[1], at[2] - p.head[2]], p.bone * 3)
      debris.rotation.set(turn(p.axis, p.rate * age), p.bone * 4)
      debris.size[p.bone] = p.size * (age < DEBRIS_FADE ? 1 : 1 - (age - DEBRIS_FADE) / (DEBRIS_LIFE - DEBRIS_FADE))
    }
    debris.update()
    words.reset()
    for (let b = 1; b < words.count; b++) words.size[b] = 0
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const w = this.pops[i], age = now - w.born
      if (age >= WORD_LIFE || age < 0) { this.pops.splice(i, 1); continue }
      words.offset.set([w.x - w.head[0], w.y + age * 0.55 - w.head[1], 0.8 - w.head[2]], w.bone * 3)
      words.rotation.set(turn([0, 0, 1], w.tilt), w.bone * 4)
      words.size[w.bone] = wordSize(age)
    }
    words.update()
  }

  /** How far the view is knocked aside by the blows just struck, at `now` (none under less motion). */
  shakeAt(now: number): [number, number] {
    let x = 0, y = 0
    for (let i = this.shakes.length - 1; i >= 0; i--) {
      const s = this.shakes[i], age = now - s.at
      if (age > SHAKE_LIFE * 6 || age < 0) { this.shakes.splice(i, 1); continue }
      const k = SHAKE * s.strength * Math.exp(-age / SHAKE_LIFE)
      x += k * Math.sin(age * 70 + s.at * 13)
      y += k * Math.cos(age * 61 + s.at * 7)
    }
    return [x, y]
  }

  /** Clears every burst and word (a new game). */
  clear() {
    this.pieces.length = 0
    this.pops.length = 0
    this.shakes.length = 0
  }
}

/** A word swells in, holds, and shrinks away. */
export function wordSize(age: number) {
  if (age < 0 || age >= WORD_LIFE) return 0
  if (age < 0.14) return 0.3 + (age / 0.14) * 0.9
  if (age < 0.22) return 1.2 - ((age - 0.14) / 0.08) * 0.2
  if (age < WORD_LIFE - 0.2) return 1
  return (WORD_LIFE - age) / 0.2
}

/** The line-up before a game: kind and color. */
export const LINEUP: readonly (readonly [Flyer['kind'], number])[] = [
  ['carrot', 0], ['tomato', 0], ['onion', 0], ['cucumber', 0], ['broccoli', 0], ['lettuce', 0],
  ['pepper', 0], ['pepper', 1], ['mushroom', 0], ['eggplant', 0], ['pumpkin', 0], ['pepper', 2], ['sprout', 0],
]

/** Every kind's name for the end tally, in the order the game lists them. */
export const TALLY_ORDER = KINDS.map((k) => k.id)
