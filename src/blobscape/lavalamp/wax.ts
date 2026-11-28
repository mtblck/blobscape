/**
 * The wax of a lava lamp (pure, tested): a pool on the bottom of the glass and a handful of soft blobs, each with a
 * volume, a temperature, a place and a speed, behaving as real lava lamp wax does.
 *
 * - Heat and weight: the wax weighs almost what the liquid does, a little more cold and a little less warm
 *   (`NEUTRAL`). The bulb warms the pool from below; the liquid is warm only just over the bulb and cool everywhere
 *   above, so a blob that leaves the pool carries its own heat up with it and loses it through its skin as it rises,
 *   faster the smaller it is (a small blob has more skin for its wax). It slows, turns over and sinks all the way back
 *   to the pool: nothing finds a height to hang at, and a big blob, which keeps its heat longest, lingers at the top.
 * - Rising: warm wax lying under cooler wax rises through it as a finger (a Rayleigh-Taylor instability). A bud swells
 *   out of the pool fed by it (`GROW`), held to it by a neck of wax; the neck is drawn out as the bud lifts and thins
 *   until it pinches off, as a thread of liquid does (Plateau-Rayleigh), leaving a tail on the bud and a spike on the
 *   pool that both draw back in (`tails`). A rising blob is drawn out by its speed into a teardrop, and one drawn out
 *   long enough necks in two the same way.
 * - Meeting: blobs do not pass through each other. Two that meet press together and flatten against each other while
 *   the film of liquid between them drains (`DRAIN_LEAST` to `DRAIN_MOST`), and they may part again before it has;
 *   once it has drained a bridge of wax opens between them and widens, and the smaller runs into the larger over a
 *   second or two (`RUN`). A blob that sinks onto the pool runs into it the same way.
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
  /** How hot the bulb is, 0.5 to 1.5: hotter wax buds sooner and rises higher. */
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
  /** While it buds out of the pool, the volume it is growing to (the pool feeds it); 0 once grown. */
  grow: number
  /** While it runs into another blob (its id) or the pool (-1), how far along that is (`run`, 0 to 1). */
  into?: number
  run: number
  /** Its volume when it began to run in, and how many seconds that takes. */
  from: number
  takes: number
}

/** A neck of wax between a blob and another (`b`) or the pool (`b` -1), drawn out until it pinches off. */
export interface Tie { a: number; b: number; rest: number; snap: number; age: number }

/** What is left of a neck after it pinches off: a tail on a blob (or a spike on the pool, `blob` -1) drawing back in. */
export interface Tail {
  blob: number
  /** Where a spike stands on the pool, and the way the tail points. */
  x: number; z: number
  dx: number; dy: number; dz: number
  /** How long and thick it was when the neck pinched, and how long it has been drawing back. */
  len: number
  thick: number
  age: number
}

/** The temperature at which wax weighs what the liquid does: warmer rises, cooler sinks. */
export const NEUTRAL = 0.5
/** The pool's temperature past which a bud swells out of it. */
export const BUD_AT = 0.7
/** Seconds a tail takes to draw back in after a neck pinches off. */
export const TAIL_LIFE = 0.9
/** Upward pull a unit of temperature over `NEUTRAL` gives, in vessel heights a second squared. */
const LIFT = 0.8
/** How strongly the liquid holds back a blob of radius `DRAG_R`, a share of its speed a second; a smaller one is held back more. */
const DRAG = 2.2, DRAG_R = 0.04
/** How fast the liquid takes heat from a blob of radius `DRAG_R`, a share a second. */
const COOL = 0.08
/** The liquid's temperature on the floor (times the heat), how high the bulb's warmth reaches (a share of the height), and its temperature above that and at the top. */
const LIQUID_FLOOR = 0.62, WARM_REACH = 0.1, LIQUID_LOW = 0.34, LIQUID_TOP = 0.16
/** How fast the bulb heats the pool and a blob lying in it, a share a second at full heat, and how fast the pool loses it. */
const POOL_HEAT = 0.1, POOL_COOL = 0.03
/** A bud's volume, as a share of all the wax: between these. */
const BUD_LEAST = 0.05, BUD_MOST = 0.14
/** How fast the pool feeds a bud, a share of the bud's full volume a second, and how much it holds when it first shows. */
const GROW = 0.55, BUD_START = 0.3
/** The pool never gives up more than this share of all the wax: the rest stays on the bottom. */
const POOL_KEEPS = 0.35
/** A blob more drawn out than this, of at least `SPLIT_SHARE` of the wax, necks in two. */
const SPLIT_STRETCH = 1.7, SPLIT_SHARE = 0.06
/** No blob grows past this share of the wax by running together. */
const MERGE_MOST = 0.45
/** Seconds the film between two blobs pressed together takes to drain before they run together, between these. */
const DRAIN_LEAST = 0.6, DRAIN_MOST = 2.6
/** Seconds the smaller of two blobs takes to run into the larger once they have joined, for a blob of radius `DRAG_R`. */
const RUN = 1.6
/** How hard two blobs pressed together push back, a second squared per share of their radii they overlap. */
const PRESS = 9
/** How far two blobs may press into each other (a share of the smaller radius), flattening where they meet. */
const SQUASH = 0.22
/** How hard a neck pulls, a second squared per unit it is stretched, and how fast it slackens as it is drawn out. */
const TIE_PULL = 6, TIE_GIVE = 0.3
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
export const radiusOf = (v: number) => Math.cbrt((3 * Math.max(0, v)) / (4 * Math.PI))

/** A blob's two radii as it is drawn out: along its way, and across. Its volume stays the same. */
export function radiiOf(b: Pick<Blob, 'vol' | 'stretch'>): [along: number, across: number] {
  const r = radiusOf(b.vol), s = Math.max(0.5, b.stretch)
  return [r * Math.pow(s, 2 / 3), r / Math.pow(s, 1 / 3)]
}

/** Eases 0 to 1 slowly at both ends. */
export const ease = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u) }

export class Wax {
  readonly vessel: Vessel
  /** All the wax's volume. */
  readonly total: number
  readonly blobs: Blob[] = []
  readonly ties: Tie[] = []
  readonly tails: Tail[] = []
  /** The pool on the bottom: its volume and temperature, and its depth. */
  pool = { vol: 0, temp: 0.5, depth: 0 }
  knobs: WaxKnobs = { ...WAX_KNOBS }
  /** Seconds simulated, in the wax's own time. */
  time = 0
  /** What has happened, for the page's line and the tests: buds that pinched off the pool and rose, blobs that necked in two, blobs that ran together, blobs that ran back into the pool. */
  readonly events = { buds: 0, splits: 0, merges: 0, landed: 0 }
  /** Seconds each pair of blobs pressed together has been touching (key `a:b`, a < b). */
  private readonly touching = new Map<string, number>()
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

  /** The liquid's temperature at a height: warm only just over the bulb, cool above. */
  liquidAt(y: number) {
    const u = Math.max(0, y / this.vessel.height)
    const low = LIQUID_LOW + (LIQUID_FLOOR * this.knobs.heat - LIQUID_LOW) * Math.exp(-u / WARM_REACH)
    return low + (LIQUID_TOP - LIQUID_LOW) * Math.min(1, u)
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

  blobById(id: number) { return this.blobs.find((b) => b.id === id) }

  /** One tick. */
  step() {
    const dt = WAX_TICK, H = this.vessel.height, heat = this.knobs.heat, pool = this.pool, r = this.random
    // the pool: heated by the bulb, cooled a little through its top
    pool.temp = Math.min(0.95, pool.temp + dt * (POOL_HEAT * heat * (1.2 - pool.temp) - POOL_COOL * (pool.temp - LIQUID_LOW)))
    // a bud swells out of it once it is hot enough and has wax to spare (one at a time)
    const spare = pool.vol - this.total * POOL_KEEPS
    if (!this.blobs.some((b) => b.grow > 0) && pool.temp > BUD_AT && spare > this.total * BUD_LEAST) {
      const full = Math.min(spare, this.total * (BUD_LEAST + (BUD_MOST - BUD_LEAST) * r()))
      const vol = full * BUD_START, rad = radiusOf(vol), off = this.vessel.radius(0) * 0.4 * r(), a = r() * Math.PI * 2
      const b = this.add({ x: Math.cos(a) * off, y: pool.depth - rad * 0.2, z: Math.sin(a) * off, vx: 0, vy: 0, vz: 0, vol, temp: pool.temp + 0.12, stretch: 1, wobble: r() * 1000, age: 0, grow: full })
      this.ties.push({ a: b.id, b: -1, rest: 0, snap: radiusOf(full) * (2.2 + 1.2 * r()), age: 0 })
      pool.vol -= vol
      pool.temp -= 0.1 + 0.08 * r()
    }
    // a bud is fed by the pool while it is still joined to it
    for (const b of this.blobs) {
      if (b.grow <= 0) continue
      const joined = this.ties.some((t) => t.a === b.id && t.b === -1)
      const want = Math.min(b.grow - b.vol, GROW * b.grow * dt, pool.vol - this.total * POOL_KEEPS * 0.8)
      if (!joined || want <= 0) { b.grow = 0; continue }
      b.vol += want; pool.vol -= want
    }
    // each blob: heat, lift, drag
    for (const b of this.blobs) {
      const rad = radiusOf(b.vol)
      const small = DRAG_R / Math.max(rad, 0.006)
      b.temp += dt * COOL * small * (this.liquidAt(b.y) - b.temp)
      // lying on the pool it is warmed as the pool is
      if (b.y - rad < pool.depth + rad * 0.3) b.temp += dt * POOL_HEAT * heat * (1.2 - b.temp)
      const keep = Math.exp(-DRAG * Math.min(3, small) * dt)
      if (b.into === undefined) b.vy += dt * LIFT * H * (b.temp - NEUTRAL)
      b.vx *= keep; b.vy *= keep; b.vz *= keep
      b.age += dt
    }
    // blobs never pass through each other: pressed together they push back, flattening where they meet, while the
    // film between them drains; then they run together
    const seen = new Set<string>()
    for (let i = 0; i < this.blobs.length; i++) for (let j = i + 1; j < this.blobs.length; j++) {
      const a = this.blobs[i], c = this.blobs[j]
      if (a.into === c.id || c.into === a.id || a.into === -1 || c.into === -1) continue
      const dx = c.x - a.x, dy = c.y - a.y, dz = c.z - a.z, d = Math.hypot(dx, dy, dz) || 1e-6
      const ra = radiiOf(a)[1], rc = radiiOf(c)[1], touch = ra + rc
      if (d > touch * 1.02) continue
      const key = a.id < c.id ? `${a.id}:${c.id}` : `${c.id}:${a.id}`
      seen.add(key)
      const held = (this.touching.get(key) ?? 0) + dt
      this.touching.set(key, held)
      // pushed apart by how far they press in past what a soft skin allows
      const press = Math.max(0, touch - d - Math.min(ra, rc) * SQUASH * Math.min(1, held)) / Math.min(ra, rc)
      const f = (PRESS * H * dt * press) / d, wa = c.vol / (a.vol + c.vol), wc = 1 - wa
      a.vx -= dx * f * wa; a.vy -= dy * f * wa; a.vz -= dz * f * wa
      c.vx += dx * f * wc; c.vy += dy * f * wc; c.vz += dz * f * wc
      // the film drains, at its own pace for each pair
      const drain = DRAIN_LEAST + (DRAIN_MOST - DRAIN_LEAST) * (((a.id * 7919 + c.id * 104729) % 97) / 96)
      const tied = this.ties.some((t) => (t.a === a.id && t.b === c.id) || (t.a === c.id && t.b === a.id))
      if (held > drain && !tied && a.into === undefined && c.into === undefined && a.vol + c.vol <= this.total * MERGE_MOST) {
        const [small, big] = a.vol < c.vol ? [a, c] : [c, a]
        this.startRun(small, big.id)
      }
    }
    for (const key of [...this.touching.keys()]) if (!seen.has(key)) this.touching.delete(key)
    // necks pull, slacken as they are drawn out, and pinch off
    for (let k = this.ties.length - 1; k >= 0; k--) {
      const t = this.ties[k], a = this.blobById(t.a), c = t.b >= 0 ? this.blobById(t.b) : undefined
      if (!a || (t.b >= 0 && !c)) { this.ties.splice(k, 1); continue }
      const to = c ? [c.x, c.y, c.z] : [a.x * 0.7, pool.depth, a.z * 0.7]
      const dx = to[0] - a.x, dy = to[1] - a.y, dz = to[2] - a.z, d = Math.hypot(dx, dy, dz)
      t.age += dt
      if (d > t.snap) { this.ties.splice(k, 1); this.pinch(a, c, to, d); continue }
      const over = Math.max(0, d - t.rest)
      t.rest += dt * TIE_GIVE * over
      const f = (TIE_PULL * dt * over) / Math.max(d, 1e-6)
      if (c) {
        const wa = c.vol / (a.vol + c.vol), wc = 1 - wa
        a.vx += dx * f * wa; a.vy += dy * f * wa; a.vz += dz * f * wa
        c.vx -= dx * f * wc; c.vy -= dy * f * wc; c.vz -= dz * f * wc
      } else { a.vx += dx * f * 0.5; a.vy += dy * f * 0.5; a.vz += dz * f * 0.5 }
    }
    // running together: the bridge widens, the smaller is drawn into the larger and its wax flows across
    for (const b of [...this.blobs]) {
      if (b.into === undefined) continue
      const host = b.into >= 0 ? this.blobById(b.into) : undefined
      if (b.into >= 0 && !host) { b.into = undefined; continue }
      const was = ease(b.run)
      b.run = Math.min(1, b.run + dt / b.takes)
      const now = ease(b.run), give = Math.min(b.vol, b.from * (now - was))
      b.vol -= give
      const w = Math.min(1, (dt * 3) / b.takes)
      if (host) {
        host.temp = (host.temp * host.vol + b.temp * give) / (host.vol + give)
        host.vol += give
        // drawn toward the host's middle, ending inside it
        const dx = host.x - b.x, dy = host.y - b.y, dz = host.z - b.z, d = Math.hypot(dx, dy, dz) || 1e-6
        const want = Math.max(0, d - Math.max(0, radiusOf(host.vol) - radiusOf(b.vol)) * (1 - now)) * w
        b.x += (dx / d) * want; b.y += (dy / d) * want; b.z += (dz / d) * want
        b.vx += (host.vx - b.vx) * w; b.vy += (host.vy - b.vy) * w; b.vz += (host.vz - b.vz) * w
      } else {
        pool.temp = (pool.temp * pool.vol + b.temp * give) / (pool.vol + give)
        pool.vol += give
        b.vx *= 1 - w; b.vz *= 1 - w
        b.vy = Math.min(b.vy, 0)
        b.y += (pool.depth - b.y) * w
      }
      if (b.run >= 1) {
        if (host) host.vol += b.vol; else pool.vol += b.vol
        b.vol = 0
        this.remove(b)
        if (host) this.events.merges++; else this.events.landed++
      }
    }
    pool.depth = this.depthOf(pool.vol)
    // move, drawn out by speed, kept in the glass
    for (const b of this.blobs) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt
      const rad = radiusOf(b.vol), speed = Math.hypot(b.vx, b.vy, b.vz) / H
      const want = 1 + SHAPE_SPEED * speed + this.squeeze(b, rad)
      b.stretch += dt * SHAPE_BACK * (want - b.stretch)
      const [along, across] = radiiOf(b)
      const top = H - along * 0.9, R = Math.max(across * 0.3, this.vessel.radius(Math.max(0, b.y)) - across * 0.9), out = Math.hypot(b.x, b.z)
      if (b.y > top) { b.y = top; b.vy = Math.min(0, b.vy) }
      if (b.y < along * 0.6) { b.y = along * 0.6; b.vy = Math.max(0, b.vy) }
      if (out > R) {
        b.x *= R / out; b.z *= R / out
        const vr = (b.vx * b.x + b.vz * b.z) / Math.max(R, 1e-6)
        if (vr > 0) { b.vx -= (vr * b.x) / R; b.vz -= (vr * b.z) / R }
      }
    }
    // a long blob necks in two along its way: two halves still joined by a neck that thins until it pinches off
    for (const b of [...this.blobs]) {
      if (b.stretch < SPLIT_STRETCH || b.vol < this.total * SPLIT_SHARE || b.age < 1.5 || b.into !== undefined || b.grow > 0) continue
      const way = Math.hypot(b.vx, b.vy, b.vz) || 1, ux = b.vx / way, uy = b.vy / way || 1, uz = b.vz / way
      const share = 0.45 + 0.15 * r(), rad = radiusOf(b.vol), off = rad * 0.4
      const back = this.add({ ...b, x: b.x - ux * off, y: b.y - uy * off, z: b.z - uz * off, vx: b.vx * 0.6, vy: b.vy * 0.6, vz: b.vz * 0.6, vol: b.vol * (1 - share), temp: b.temp - 0.08, stretch: 1.3, wobble: r() * 1000, age: 0, grow: 0 })
      b.vol *= share
      b.x += ux * off; b.y += uy * off; b.z += uz * off
      b.stretch = 1.3
      b.age = 0
      this.ties.push({ a: b.id, b: back.id, rest: off * 2, snap: rad * 1.4, age: 0 })
    }
    // a blob that sinks onto the pool presses into it and runs back in
    for (const b of [...this.blobs]) {
      if (b.into !== undefined || b.grow > 0 || b.vy > 0.005 * H) continue
      const [, across] = radiiOf(b)
      if (b.y - across > pool.depth + across * 0.1 || this.ties.some((t) => t.a === b.id && t.b === -1)) continue
      this.startRun(b, -1)
    }
    // tails draw back in
    for (let k = this.tails.length - 1; k >= 0; k--) {
      const t = this.tails[k]
      t.age += dt
      if (t.age >= TAIL_LIFE || (t.blob >= 0 && !this.blobById(t.blob))) this.tails.splice(k, 1)
    }
    this.time += dt
  }

  /** Starts a blob running into another (`into` its id) or the pool (-1); a bigger one takes longer. */
  private startRun(b: Blob, into: number) {
    b.into = into
    b.run = 0
    b.from = b.vol
    b.takes = RUN * Math.max(0.6, Math.min(1.8, radiusOf(b.vol) / DRAG_R))
    b.grow = 0
    for (let q = this.ties.length - 1; q >= 0; q--) if (this.ties[q].a === b.id || this.ties[q].b === b.id) this.ties.splice(q, 1)
  }

  /** A neck pinched off between a blob and another or the pool: each end keeps a tail that draws back in. */
  private pinch(a: Blob, c: Blob | undefined, to: number[], d: number) {
    const ux = (to[0] - a.x) / d, uy = (to[1] - a.y) / d, uz = (to[2] - a.z) / d
    const ra = radiusOf(a.vol), rc = c ? radiusOf(c.vol) : ra
    const thick = Math.min(ra, rc) * 0.3
    const len = Math.max(0, d - ra - (c ? rc : 0)) * 0.5 + thick
    this.tails.push({ blob: a.id, x: 0, z: 0, dx: ux, dy: uy, dz: uz, len, thick, age: 0 })
    if (c) { this.tails.push({ blob: c.id, x: 0, z: 0, dx: -ux, dy: -uy, dz: -uz, len, thick, age: 0 }); this.events.splits++ }
    else { this.tails.push({ blob: -1, x: to[0], z: to[2], dx: -ux, dy: -uy, dz: -uz, len: len * 0.8, thick: thick * 1.2, age: 0 }); this.events.buds++ }
  }

  /** How much the glass squeezes a blob too wide for it at its height: it grows taller instead. */
  private squeeze(b: Blob, rad: number) {
    const room = this.vessel.radius(Math.max(0, Math.min(this.vessel.height, b.y))) * 0.92
    return rad > room ? (rad / room) ** 3 - 1 : 0
  }

  private add(b: Omit<Blob, 'id' | 'run' | 'from' | 'takes' | 'into'>): Blob {
    const made: Blob = { ...b, into: undefined, run: 0, from: 0, takes: 0, id: this.next++ }
    this.blobs.push(made)
    return made
  }

  private remove(b: Blob) {
    const k = this.blobs.indexOf(b)
    if (k >= 0) this.blobs.splice(k, 1)
    for (let q = this.ties.length - 1; q >= 0; q--) if (this.ties[q].a === b.id || this.ties[q].b === b.id) this.ties.splice(q, 1)
    // anything running into it runs on into what it ran into
    for (const o of this.blobs) if (o.into === b.id) o.into = b.into ?? -1
  }

  /** All the wax's volume as it stands: the pool's and every blob's (it never changes). */
  volume() { return this.pool.vol + this.blobs.reduce((s, b) => s + b.vol, 0) }

  /** How high the highest wax is, as a share of the glass's height. */
  highest() { return Math.max(this.pool.depth, ...this.blobs.map((b) => b.y + radiiOf(b)[0])) / this.vessel.height }
}
