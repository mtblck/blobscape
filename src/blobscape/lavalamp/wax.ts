/**
 * The wax of a lava lamp (pure, tested). The wax is a handful of soft blobs and a pool on the bottom of the glass,
 * each with a volume, a temperature, a place and a speed. The bulb heats the pool; once it is hot enough a bud of it
 * swells up out of the middle, tied back to the pool by a stretch of wax, and rises. Warm wax is lighter than the
 * liquid and rises, cool wax heavier and sinks; the liquid takes heat away faster the higher a blob is and the
 * smaller it is. A rising blob stretches into a teardrop with its speed, a long one or one a tie draws out splits in
 * two, two that meet run together, and a blob that sinks back onto the pool is taken into it.
 *
 * Drawn, the blobs and the pool are one surface: each is a shape and the shapes are joined smoothly (surface.ts
 * `waxDistance`), so a bud and the pool share a neck that thins as it rises and snaps, and two blobs about to merge
 * reach for each other first. A particle fluid was tried first: it held together as one lump that rose and sank whole.
 *
 * Stepped at a fixed `WAX_TICK` with the rest of a frame carried, from a seed, so the same frames give the same wax.
 */

/** Seconds of one step. */
export const WAX_TICK = 1 / 60

/** The inside of the glass: its height and its radius at a height, both in world units, standing on y = 0. */
export interface Vessel {
  height: number
  radius: (y: number) => number
}

/** How the wax behaves: the page's sliders change these on a running lamp. */
export interface WaxKnobs {
  /** How hot the bulb is, 0.5 to 1.5: hotter wax buds sooner and stays up longer. */
  heat: number
  /** How fast it all goes, 0.25 to 3: a multiplier on time. */
  pace: number
}

export const WAX_KNOBS: WaxKnobs = { heat: 1, pace: 1 }

/** One blob of wax, free in the liquid. */
export interface Blob {
  id: number
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  /** Its volume, in world units cubed. */
  vol: number
  /** 0 cold to about 1.2 hot. */
  temp: number
  /** How drawn out it is along its way, 1 round: a fast one is a teardrop. */
  stretch: number
  /** A seed for its own slow wobble. */
  wobble: number
  /** Seconds since it budded or split. */
  age: number
}

/** A stretch of wax between two blobs, or a blob and the pool (`b` -1), pulling them together until it snaps. */
export interface Tie { a: number; b: number; rest: number; snap: number; age: number }

/** The temperature at which wax weighs what the liquid does: warmer rises, cooler sinks. */
export const NEUTRAL = 0.5
/** The pool's temperature past which a bud swells out of it. */
export const BUD_AT = 0.72
/** Upward pull a unit of temperature over `NEUTRAL` gives, in vessel heights a second squared. */
const LIFT = 0.9
/** How strongly the liquid holds back a blob of radius `DRAG_R`, a share of its speed a second; a smaller one is held back more. */
const DRAG = 2.4, DRAG_R = 0.04
/** How fast the liquid takes heat from a blob of radius `DRAG_R`, a share a second, at the bottom and the top. */
const COOL_LOW = 0.04, COOL_HIGH = 0.3
/** The liquid's own temperature at the bottom and the top. */
const LIQUID_LOW = 0.6, LIQUID_HIGH = 0.12
/** How fast the bulb heats the pool and a blob lying in it, a share a second at full heat, and how fast the pool loses it. */
const POOL_HEAT = 0.09, POOL_COOL = 0.035
/** A bud's volume, as a share of all the wax: between these. */
const BUD_LEAST = 0.04, BUD_MOST = 0.12
/** The pool never gives up more than this share of all the wax: the rest stays on the bottom. */
const POOL_KEEPS = 0.2
/** A blob more drawn out than this, of at least `SPLIT_SHARE` of the wax, splits in two. */
const SPLIT_STRETCH = 1.75, SPLIT_SHARE = 0.07
/** Two blobs whose middles come within this share of their radii together become one, unless that would hold more than `MERGE_MOST` of the wax. */
const MERGE_AT = 0.55, MERGE_MOST = 0.3
/** How hard two blobs whose skins touch pull together, in vessel heights a second squared. */
const STICK = 0.25
/** How hard a tie pulls, a second squared per unit it is stretched, and how fast it slackens as it is drawn out. */
const TIE_PULL = 7, TIE_GIVE = 0.35
/** Seconds a tie between two blobs holds before it lets go. */
const TIE_LIFE = 4
/** How quickly a blob comes back to its own shape, and how much its speed draws it out. */
const SHAPE_BACK = 1.4, SHAPE_SPEED = 5

/** A tiny seeded random number generator. */
export function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/** The volume of the vessel up to `top`, by slices. */
export function volumeOf(v: Vessel, top = v.height, slices = 200) {
  let sum = 0
  for (let k = 0; k < slices; k++) { const r = v.radius(((k + 0.5) / slices) * top); sum += Math.PI * r * r }
  return (sum * top) / slices
}

/** The radius of a ball of volume `v`. */
export const radiusOf = (v: number) => Math.cbrt((3 * v) / (4 * Math.PI))

/** A blob's two radii as it is drawn out: along its way, and across. Its volume stays the same. */
export function radiiOf(b: Pick<Blob, 'vol' | 'stretch'>): [along: number, across: number] {
  const r = radiusOf(b.vol), s = Math.max(0.5, b.stretch)
  return [r * Math.pow(s, 2 / 3), r / Math.pow(s, 1 / 3)]
}

export class Wax {
  readonly vessel: Vessel
  /** All the wax's volume. */
  readonly total: number
  readonly blobs: Blob[] = []
  readonly ties: Tie[] = []
  /** The pool on the bottom: its volume and temperature, and its depth. */
  pool = { vol: 0, temp: 0.5, depth: 0 }
  knobs: WaxKnobs = { ...WAX_KNOBS }
  /** Seconds simulated, in the wax's own time. */
  time = 0
  /** Counts of what has happened, for the page's line and the tests. */
  readonly events = { buds: 0, splits: 0, merges: 0, landed: 0 }
  private carry = 0
  private next = 1
  private readonly random: () => number

  /** `share` of the vessel's volume is wax. It starts all in the pool, a little under the heat it buds at. */
  constructor(vessel: Vessel, share = 0.12, seed = 7) {
    this.vessel = vessel
    this.total = volumeOf(vessel) * share
    this.random = rng(seed)
    this.pool = { vol: this.total, temp: BUD_AT - 0.06, depth: 0 }
    this.pool.depth = this.depthOf(this.pool.vol)
  }

  /** How deep the pool lies for a volume: filled up the glass's bottom slice by slice. */
  depthOf(vol: number) {
    let y = 0, left = vol
    const dy = this.vessel.height / 400
    while (left > 0 && y < this.vessel.height * 0.5) { const r = this.vessel.radius(y + dy / 2); left -= Math.PI * r * r * dy; y += dy }
    return y
  }

  /** Moves the wax on by `seconds` of the page's time (times the pace), in whole ticks; a long gap is cut short. */
  advance(seconds: number) {
    this.carry += Math.min(seconds * this.knobs.pace, 0.5)
    while (this.carry >= WAX_TICK) { this.step(); this.carry -= WAX_TICK }
  }

  /** Runs `seconds` of the wax's own time at once (a page starting partway in, a test). */
  run(seconds: number) {
    for (let t = 0; t < seconds; t += WAX_TICK) this.step()
  }

  private blobById(id: number) { return this.blobs.find((b) => b.id === id) }

  /** One tick. */
  step() {
    const dt = WAX_TICK, H = this.vessel.height, heat = this.knobs.heat, pool = this.pool, r = this.random
    // the pool: heated by the bulb, cooled a little through its top
    pool.temp = Math.min(0.95, pool.temp + dt * (POOL_HEAT * heat * (1.25 - pool.temp) - POOL_COOL * (pool.temp - LIQUID_LOW)))
    // a bud swells out of it once it is hot enough and has wax to spare
    const spare = pool.vol - this.total * POOL_KEEPS
    if (pool.temp > BUD_AT && spare > this.total * BUD_LEAST) {
      const vol = Math.min(spare, this.total * (BUD_LEAST + (BUD_MOST - BUD_LEAST) * r()))
      const rad = radiusOf(vol), off = this.vessel.radius(0) * 0.35 * r(), a = r() * Math.PI * 2
      const b = this.add({ x: Math.cos(a) * off, y: pool.depth - rad * 0.4, z: Math.sin(a) * off, vx: 0, vy: 0, vz: 0, vol, temp: pool.temp + 0.18, stretch: 1, wobble: r() * 1000, age: 0 })
      this.ties.push({ a: b.id, b: -1, rest: 0, snap: rad * (1.6 + r()), age: 0 })
      pool.vol -= vol
      pool.temp -= 0.12 + 0.1 * r()
      this.events.buds++
    }
    pool.depth = this.depthOf(pool.vol)
    // each blob: heat, lift, drag
    for (const b of this.blobs) {
      const rad = radiusOf(b.vol), u = Math.max(0, b.y / H)
      const liquid = LIQUID_LOW + (LIQUID_HIGH - LIQUID_LOW) * Math.min(1, u * 1.15)
      const small = DRAG_R / Math.max(rad, 0.006)
      b.temp += dt * (COOL_LOW + (COOL_HIGH - COOL_LOW) * u) * small * (liquid - b.temp)
      // lying on the pool it is warmed as the pool is
      if (b.y - rad < pool.depth + rad * 0.3) b.temp += dt * POOL_HEAT * heat * (1.25 - b.temp)
      const keep = Math.exp(-DRAG * Math.min(3, small) * dt)
      b.vy += dt * LIFT * H * (b.temp - NEUTRAL) * Math.min(1, b.age * 2 + 0.2)
      b.vx *= keep; b.vy *= keep; b.vz *= keep
      b.age += dt
    }
    // skins that touch pull together, so two blobs about to meet reach for each other
    for (let i = 0; i < this.blobs.length; i++) for (let j = i + 1; j < this.blobs.length; j++) {
      const a = this.blobs[i], c = this.blobs[j]
      const dx = c.x - a.x, dy = c.y - a.y, dz = c.z - a.z, d = Math.hypot(dx, dy, dz) || 1e-6
      const reach = (radiusOf(a.vol) + radiusOf(c.vol)) * 1.15
      if (d > reach) continue
      const f = (STICK * H * dt * (1 - d / reach)) / d, wa = c.vol / (a.vol + c.vol), wc = 1 - wa
      a.vx += dx * f * wa; a.vy += dy * f * wa; a.vz += dz * f * wa
      c.vx -= dx * f * wc; c.vy -= dy * f * wc; c.vz -= dz * f * wc
    }
    // ties pull, slacken as they are drawn out, and snap
    for (let k = this.ties.length - 1; k >= 0; k--) {
      const t = this.ties[k], a = this.blobById(t.a), c = t.b >= 0 ? this.blobById(t.b) : undefined
      if (!a || (t.b >= 0 && !c)) { this.ties.splice(k, 1); continue }
      const to = c ? [c.x, c.y, c.z] : [a.x * 0.6, pool.depth - radiusOf(a.vol) * 0.2, a.z * 0.6]
      const dx = to[0] - a.x, dy = to[1] - a.y, dz = to[2] - a.z, d = Math.hypot(dx, dy, dz)
      t.age += dt
      // a tie between two blobs gives up after a while: they part or run back together
      if (d > t.snap || (c && t.age > TIE_LIFE)) { this.ties.splice(k, 1); if (!c && d > t.snap) this.events.splits++; continue }
      const over = Math.max(0, d - t.rest)
      t.rest += dt * TIE_GIVE * over
      const f = (TIE_PULL * dt * over) / Math.max(d, 1e-6)
      if (c) {
        const wa = c.vol / (a.vol + c.vol), wc = 1 - wa
        a.vx += dx * f * wa; a.vy += dy * f * wa; a.vz += dz * f * wa
        c.vx -= dx * f * wc; c.vy -= dy * f * wc; c.vz -= dz * f * wc
      } else { a.vx += dx * f * 0.5; a.vy += dy * f * 0.5; a.vz += dz * f * 0.5 }
    }
    // move, drawn out by speed, kept in the glass
    for (const b of this.blobs) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt
      const rad = radiusOf(b.vol), speed = Math.hypot(b.vx, b.vy, b.vz) / H
      const want = 1 + SHAPE_SPEED * speed + this.squeeze(b, rad)
      b.stretch += dt * SHAPE_BACK * (want - b.stretch)
      const [along, across] = radiiOf(b)
      const top = H - along * 0.9, R = Math.max(across * 0.3, this.vessel.radius(Math.max(0, b.y)) - across * 0.9), out = Math.hypot(b.x, b.z)
      if (b.y > top) { b.y = top; b.vy = Math.min(0, b.vy) }
      if (b.y < along * 0.8) { b.y = along * 0.8; b.vy = Math.max(0, b.vy) }
      if (out > R) {
        b.x *= R / out; b.z *= R / out
        const vr = (b.vx * b.x + b.vz * b.z) / Math.max(R, 1e-6)
        if (vr > 0) { b.vx -= (vr * b.x) / R; b.vz -= (vr * b.z) / R }
      }
    }
    // a long blob splits in two along its way, tied together until the tie snaps
    for (const b of [...this.blobs]) {
      if (b.stretch < SPLIT_STRETCH || b.vol < this.total * SPLIT_SHARE || b.age < 1.5) continue
      const way = Math.hypot(b.vx, b.vy, b.vz) || 1, ux = b.vx / way, uy = b.vy / way || 1, uz = b.vz / way
      const share = 0.45 + 0.15 * r(), rad = radiusOf(b.vol), off = rad * 0.45
      const back = this.add({ ...b, x: b.x - ux * off, y: b.y - uy * off, z: b.z - uz * off, vx: b.vx * 0.55, vy: b.vy * 0.55, vz: b.vz * 0.55, vol: b.vol * (1 - share), temp: b.temp - 0.08, stretch: 1.2, wobble: r() * 1000, age: 0 })
      b.vol *= share
      b.x += ux * off; b.y += uy * off; b.z += uz * off
      b.stretch = 1.2
      b.age = 0
      this.ties.push({ a: b.id, b: back.id, rest: off * 2, snap: rad * 1.5, age: 0 })
      this.events.splits++
    }
    // two that meet run together
    for (let i = 0; i < this.blobs.length; i++) for (let j = i + 1; j < this.blobs.length; j++) {
      const a = this.blobs[i], c = this.blobs[j]
      if (this.ties.some((t) => (t.a === a.id && t.b === c.id) || (t.a === c.id && t.b === a.id))) continue
      const d = Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z)
      if (d > (radiusOf(a.vol) + radiusOf(c.vol)) * MERGE_AT || a.vol + c.vol > this.total * MERGE_MOST) continue
      const v = a.vol + c.vol, wa = a.vol / v, wc = c.vol / v
      a.x = a.x * wa + c.x * wc; a.y = a.y * wa + c.y * wc; a.z = a.z * wa + c.z * wc
      a.vx = a.vx * wa + c.vx * wc; a.vy = a.vy * wa + c.vy * wc; a.vz = a.vz * wa + c.vz * wc
      a.temp = a.temp * wa + c.temp * wc; a.vol = v; a.stretch = Math.max(a.stretch, c.stretch)
      for (const t of this.ties) { if (t.a === c.id) t.a = a.id; if (t.b === c.id) t.b = a.id }
      this.blobs.splice(j, 1)
      j--
      this.events.merges++
    }
    for (let k = this.ties.length - 1; k >= 0; k--) if (this.ties[k].a === this.ties[k].b) this.ties.splice(k, 1)
    // one that sinks back onto the pool is taken into it
    for (let k = this.blobs.length - 1; k >= 0; k--) {
      const b = this.blobs[k], rad = radiusOf(b.vol)
      if (b.vy > 0.01 * H || b.y - rad > pool.depth + rad * 0.15 || this.ties.some((t) => t.a === b.id && t.b === -1)) continue
      pool.temp = (pool.temp * pool.vol + b.temp * b.vol) / (pool.vol + b.vol)
      pool.vol += b.vol
      this.blobs.splice(k, 1)
      for (let q = this.ties.length - 1; q >= 0; q--) if (this.ties[q].a === b.id || this.ties[q].b === b.id) this.ties.splice(q, 1)
      this.events.landed++
    }
    this.time += dt
  }

  /** How much the glass squeezes a blob too wide for it at its height: it grows taller instead. */
  private squeeze(b: Blob, rad: number) {
    const room = this.vessel.radius(Math.max(0, Math.min(this.vessel.height, b.y))) * 0.92
    return rad > room ? (rad / room) ** 3 - 1 : 0
  }

  private add(b: Omit<Blob, 'id'>): Blob {
    const made = { ...b, id: this.next++ }
    this.blobs.push(made)
    return made
  }

  /** All the wax's volume as it stands: the pool's and every blob's (it never changes). */
  volume() { return this.pool.vol + this.blobs.reduce((s, b) => s + b.vol, 0) }

  /** How high the highest wax is, as a share of the glass's height. */
  highest() { return Math.max(this.pool.depth, ...this.blobs.map((b) => b.y + radiiOf(b)[0])) / this.vessel.height }
}
