import { rng } from '../../splat-engine/body.ts'

/**
 * The hall's floor as a grid of cells that can burn or freeze. A bolt lights
 * a small patch where it lands, and the patch spreads from cell to cell for a
 * few steps: fire burns for a couple of seconds and leaves the stone scorched
 * (and unable to burn again for a while), frost lies for longer and then
 * melts. Where the two meet they cancel: fire melts frost instead of
 * spreading onto it, and frost puts fire out.
 *
 * Plain numbers stepped at a fixed tick, so the same bolts give the same
 * floor: the game reads it for what a slime or the hero is standing on, and
 * the stage reads it to color the floor.
 */
export type Element = 'fire' | 'frost'

/** Seconds between spread steps. */
export const TICK = 0.1
/** Seconds a cell burns, and seconds frost lies before it starts to melt. */
export const BURN = 2.2
export const FROST_LIFE = 8
/** How far a bolt lights the floor round where it lands, meters. */
export const SPLASH = 0.7
/** How many cells beyond that a patch can spread. */
const REACH: Record<Element, number> = { fire: 4, frost: 5 }
/** The chance, each tick, that a cell passes on to one neighbor. */
const PASS: Record<Element, number> = { fire: 0.28, frost: 0.5 }
/** A cell scorched more than this can't catch again yet. */
const SPENT = 0.45

export class Ground {
  /** Cells across, and the size of one in meters. */
  readonly n: number
  readonly cell: number
  /** How hard each cell burns, how frozen it is, and how scorched: all 0..1, row by row from −half. */
  readonly fire: Float32Array
  readonly frost: Float32Array
  readonly char: Float32Array
  /** Goes up whenever a cell changed, so a view knows to recolor. */
  version = 0
  private readonly left: Record<Element, Float32Array>
  private readonly reach: Record<Element, Int8Array>
  private readonly blocked: Uint8Array
  private acc = 0
  private rand: () => number

  /** Half the hall's width: the grid runs from −half to half. */
  readonly half: number
  private readonly seed: number

  constructor(half: number, pillars: { x: number; z: number; r: number }[] = [], cell = 0.5, seed = 1) {
    this.half = half
    this.seed = seed
    this.cell = cell
    this.n = Math.round((half * 2) / cell)
    const size = this.n * this.n
    this.fire = new Float32Array(size)
    this.frost = new Float32Array(size)
    this.char = new Float32Array(size)
    this.left = { fire: new Float32Array(size), frost: new Float32Array(size) }
    this.reach = { fire: new Int8Array(size), frost: new Int8Array(size) }
    this.blocked = new Uint8Array(size)
    for (let i = 0; i < size; i++) {
      const [x, z] = this.center(i)
      if (pillars.some((p) => Math.hypot(p.x - x, p.z - z) < p.r)) this.blocked[i] = 1
    }
    this.rand = rng(seed * 104729 + 7)
  }

  /** Everything out and melted, and the same luck again. */
  clear() {
    for (const a of [this.fire, this.frost, this.char, this.left.fire, this.left.frost]) a.fill(0)
    this.reach.fire.fill(0)
    this.reach.frost.fill(0)
    this.acc = 0
    this.rand = rng(this.seed * 104729 + 7)
    this.version++
  }

  /** The cell a point is in, or −1 outside the hall. */
  index(x: number, z: number) {
    const c = Math.floor((x + this.half) / this.cell), r = Math.floor((z + this.half) / this.cell)
    return c < 0 || r < 0 || c >= this.n || r >= this.n ? -1 : r * this.n + c
  }

  /** The middle of cell i. */
  center(i: number): [number, number] {
    return [((i % this.n) + 0.5) * this.cell - this.half, (Math.floor(i / this.n) + 0.5) * this.cell - this.half]
  }

  /** What is underfoot at a point. */
  at(x: number, z: number): { fire: number; frost: number; char: number } {
    const i = this.index(x, z)
    return i < 0 ? { fire: 0, frost: 0, char: 0 } : { fire: this.fire[i], frost: this.frost[i], char: this.char[i] }
  }

  /** A field read between cell middles, so a floor colored from it has no steps. */
  sample(field: Float32Array, x: number, z: number) {
    const n = this.n
    const u = Math.min(n - 1, Math.max(0, (x + this.half) / this.cell - 0.5)), v = Math.min(n - 1, Math.max(0, (z + this.half) / this.cell - 0.5))
    const c = Math.min(n - 2, Math.floor(u)), r = Math.min(n - 2, Math.floor(v)), fu = u - c, fv = v - r
    const i = r * n + c
    return (field[i] * (1 - fu) + field[i + 1] * fu) * (1 - fv) + (field[i + n] * (1 - fu) + field[i + n + 1] * fu) * fv
  }

  /** A bolt lands: every free cell within `SPLASH` of the point catches. */
  light(x: number, z: number, what: Element) {
    const k = Math.ceil(SPLASH / this.cell)
    const c0 = Math.floor((x + this.half) / this.cell), r0 = Math.floor((z + this.half) / this.cell)
    for (let r = r0 - k; r <= r0 + k; r++) for (let c = c0 - k; c <= c0 + k; c++) {
      if (c < 0 || r < 0 || c >= this.n || r >= this.n) continue
      const i = r * this.n + c
      const [cx, cz] = this.center(i)
      // a bolt forces its way: fresh fire takes scorched stone too
      if (Math.hypot(cx - x, cz - z) <= SPLASH) this.set(i, what, REACH[what], true)
    }
    this.version++
  }

  /** Cell i catches, with `reach` more steps to spread. Where the other element lies the two cancel and nothing catches. */
  private set(i: number, what: Element, reach: number, force = false) {
    if (this.blocked[i]) return
    if (what === 'fire') {
      if (this.frost[i] > 0.05) { this.frost[i] = 0; this.left.frost[i] = 0; this.reach.frost[i] = 0; return }
      if (!force && (this.fire[i] > 0 || this.char[i] > SPENT)) return
      this.fire[i] = Math.max(this.fire[i], 0.3)
      this.left.fire[i] = BURN
    } else {
      if (this.fire[i] > 0.05) { this.fire[i] = 0; this.left.fire[i] = 0; this.reach.fire[i] = 0; return }
      if (!force && this.frost[i] > 0) return
      this.frost[i] = Math.max(this.frost[i], 0.3)
      this.left.frost[i] = FROST_LIFE
    }
    this.reach[what][i] = Math.max(this.reach[what][i], reach)
  }

  step(dt: number) {
    this.acc += dt
    while (this.acc >= TICK) { this.acc -= TICK; this.tick() }
  }

  private tick() {
    const n = this.n, size = n * n
    let changed = false
    // what catches this tick is found first and set after, so a patch grows a cell a tick whichever way the loop runs
    const caught: [number, Element, number][] = []
    for (let i = 0; i < size; i++) {
      for (const what of ['fire', 'frost'] as Element[]) {
        const level = what === 'fire' ? this.fire : this.frost
        if (level[i] <= 0) continue
        changed = true
        const left = this.left[what]
        left[i] -= TICK
        if (left[i] > 0) level[i] = Math.min(1, level[i] + 0.35)
        else level[i] = Math.max(0, level[i] - (what === 'fire' ? 0.25 : 0.08))
        if (level[i] === 0) { this.reach[what][i] = 0; continue }
        if (what === 'fire') this.char[i] = Math.max(this.char[i], level[i])
        const reach = this.reach[what][i]
        if (reach <= 0 || level[i] < 0.6) continue
        const c = i % n, r = Math.floor(i / n)
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const cc = c + dc, rr = r + dr
          if (cc < 0 || rr < 0 || cc >= n || rr >= n || this.rand() >= PASS[what]) continue
          // an uneven edge: now and then a step costs two
          caught.push([rr * n + cc, what, reach - 1 - (this.rand() < 0.3 ? 1 : 0)])
        }
      }
      // scorched stone cools slowly, and only once the fire has left it
      if (this.char[i] > 0 && this.fire[i] === 0) { this.char[i] = Math.max(0, this.char[i] - TICK * 0.04); changed = true }
    }
    for (const [i, what, reach] of caught) this.set(i, what, Math.max(0, reach))
    if (changed || caught.length) this.version++
  }

  /** How many cells are burning or frozen at all. */
  count(what: Element) {
    const level = what === 'fire' ? this.fire : this.frost
    let k = 0
    for (let i = 0; i < level.length; i++) if (level[i] > 0) k++
    return k
  }
}

/**
 * Keeps a few things (flames, ice crystals) standing on the strongest cells of
 * a field, spaced apart. One stays on its cell while the cell is still above
 * `keep`, so they don't hop about as the patch changes; a free one takes the
 * strongest cell above `take` that is far enough from the rest.
 */
export class Patches {
  /** The cell each one stands on, or −1. */
  readonly cells: Int32Array
  readonly count: number
  private readonly spacing: number
  private readonly take: number
  private readonly keep: number

  constructor(count: number, spacing: number, take = 0.6, keep = 0.25) {
    this.count = count
    this.spacing = spacing
    this.take = take
    this.keep = keep
    this.cells = new Int32Array(count).fill(-1)
  }

  update(g: Ground, field: Float32Array) {
    for (let k = 0; k < this.count; k++) if (this.cells[k] >= 0 && field[this.cells[k]] < this.keep) this.cells[k] = -1
    const free = () => this.cells.indexOf(-1)
    if (free() < 0) return
    const strong: number[] = []
    for (let i = 0; i < field.length; i++) if (field[i] >= this.take) strong.push(i)
    strong.sort((a, b) => field[b] - field[a] || a - b)
    for (const i of strong) {
      const k = free()
      if (k < 0) return
      const [x, z] = g.center(i)
      let clear = true
      for (let j = 0; j < this.count && clear; j++) {
        if (this.cells[j] < 0) continue
        const [ox, oz] = g.center(this.cells[j])
        if (Math.hypot(ox - x, oz - z) < this.spacing) clear = false
      }
      if (clear) this.cells[k] = i
    }
  }
}
