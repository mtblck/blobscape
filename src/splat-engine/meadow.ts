/**
 * Grass that burns and grows back (issue #179): a field as a grid of cells, each holding how much grass stands
 * there, how hard it burns and how scorched the ground is. Fire eats the grass under it and passes to neighbors
 * in proportion to the grass they hold (more readily downwind), so it runs through a meadow and stops at bare
 * ground; a burnt cell is left black and can't catch again until grass has grown back over the scar.
 *
 * Plain numbers stepped at a fixed tick from a seed, so the same sparks give the same field (tested in Node). The
 * grid can wrap along z, for a world built from a ring of tiles. Ideas from Silicon Jungle's Inkwell and Ink Studio
 * play kits; our own code.
 */

/** Seconds between steps. */
export const MEADOW_TICK = 0.1
/** Seconds a cell of full grass takes to burn away. */
export const BURN_TIME = 1.6
/** Seconds before scorched ground starts to green again, then seconds for grass to grow back in full. */
export const SCAR_TIME = 6
export const REGROW_TIME = 14
/** The chance, each tick, that fire passes to a neighbor full of grass (less with less grass, more downwind). */
const PASS = 0.35
/** A cell with less grass than this won't catch. */
const DRY = 0.25

export interface MeadowSpec {
  /** The grid runs from x0 along x for nx cells, and from z0 along z for nz cells, each `cell` meters. */
  x0: number
  z0: number
  nx: number
  nz: number
  cell: number
  /** Wraps along z (a ring of tiles): row nz − 1 is beside row 0. */
  wrap?: boolean
  /** Which way the wind blows, [x, z] (none). */
  wind?: [number, number]
  seed?: number
}

export class Meadow {
  readonly spec: Required<MeadowSpec>
  /** How much grass stands in each cell, 0 bare to 1 full; how hard it burns; how scorched the ground is; all 0..1, row by row along z. */
  readonly grass: Float32Array
  readonly fire: Float32Array
  readonly char: Float32Array
  /** Seconds since each cell burnt out (for the scar's slow greening). */
  readonly since: Float32Array
  /** How much grass each cell can hold: 0 on a path or bare rock. */
  readonly room: Float32Array
  /** Goes up whenever something changed, so a view knows to repaint. */
  version = 0
  /** Seconds of ticks so far. */
  time = 0
  private acc = 0
  private state: number

  constructor(spec: MeadowSpec, room?: (x: number, z: number) => number) {
    this.spec = { wrap: false, wind: [0, 0], seed: 1, ...spec }
    const n = spec.nx * spec.nz
    this.grass = new Float32Array(n); this.fire = new Float32Array(n); this.char = new Float32Array(n); this.since = new Float32Array(n)
    this.room = new Float32Array(n).fill(1)
    if (room) for (let j = 0; j < spec.nz; j++) for (let i = 0; i < spec.nx; i++) { const [x, z] = this.center(j * spec.nx + i); this.room[j * spec.nx + i] = Math.max(0, Math.min(1, room(x, z))) }
    this.grass.set(this.room)
    this.state = ((this.spec.seed * 2654435761) >>> 0) || 1
  }

  /** The cell holding (x, z), or -1 off the grid. */
  index(x: number, z: number): number {
    const { x0, z0, nx, nz, cell, wrap } = this.spec
    const i = Math.floor((x - x0) / cell)
    let j = Math.floor((z - z0) / cell)
    if (wrap) j = ((j % nz) + nz) % nz
    if (i < 0 || i >= nx || j < 0 || j >= nz) return -1
    return j * nx + i
  }

  center(k: number): [number, number] {
    const { x0, z0, nx, cell } = this.spec
    return [x0 + ((k % nx) + 0.5) * cell, z0 + (Math.floor(k / nx) + 0.5) * cell]
  }

  /** Sets fire to the grass within `r` of (x, z): only where there is grass to burn. Returns how many cells caught. */
  light(x: number, z: number, r = 0.4): number {
    const { cell } = this.spec
    let caught = 0
    // the cell it lands in, and every cell whose middle is within r
    const n = Math.ceil(r / cell)
    for (let b = -n; b <= n; b++) for (let a = -n; a <= n; a++) {
      const k = this.index(x + a * cell, z + b * cell)
      if (k < 0) continue
      if (a || b) { const [cx, cz] = this.center(k); if (Math.hypot(cx - x, cz - z) > r) continue }
      if (this.fire[k] > 0 || this.grass[k] < DRY) continue
      this.fire[k] = 0.5
      caught++
    }
    if (caught) this.version++
    return caught
  }

  /** Puts every cell in rows z0 to z1 (meters, z0 inclusive) back as it was: full grass, no fire, no scar. For a tile handed a new stretch. */
  reset(z0: number, z1: number) {
    const { nx, cell } = this.spec
    for (let z = z0 + cell / 2; z < z1; z += cell) {
      const k0 = this.index(this.spec.x0 + cell / 2, z)
      if (k0 < 0) continue
      for (let i = 0; i < nx; i++) { const k = k0 + i; this.grass[k] = this.room[k]; this.fire[k] = 0; this.char[k] = 0; this.since[k] = 0 }
    }
    this.version++
  }

  /** Whether anything is burning, scorched or growing back: a view needs repainting as the field steps. */
  get busy() {
    for (let k = 0; k < this.fire.length; k++) if (this.fire[k] > 0 || this.char[k] > 0 || this.grass[k] < this.room[k]) return true
    return false
  }

  /** How many cells burn now. */
  get burning() { let n = 0; for (const f of this.fire) if (f > 0) n++; return n }

  step(dt: number) {
    this.acc += dt
    while (this.acc >= MEADOW_TICK) { this.acc -= MEADOW_TICK; this.tick() }
  }

  private rand() {
    let s = this.state
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0
    this.state = s
    return s / 4294967296
  }

  private tick() {
    const { nx, nz, wrap, wind } = this.spec
    const dt = MEADOW_TICK
    this.time += dt
    const wl = Math.hypot(wind[0], wind[1])
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
    // fire passes on from what burned at the start of the tick, so the order cells are visited in doesn't matter
    const was = this.fire.slice()
    let changed = false
    for (let k = 0; k < was.length; k++) {
      if (was[k] <= 0) continue
      const i = k % nx, j = Math.floor(k / nx)
      for (const [di, dj] of near) {
        const ii = i + di
        let jj = j + dj
        if (ii < 0 || ii >= nx) continue
        if (wrap) jj = (jj + nz) % nz
        else if (jj < 0 || jj >= nz) continue
        const m = jj * nx + ii
        if (was[m] > 0 || this.fire[m] > 0 || this.grass[m] < DRY) continue
        // downwind it catches readily, upwind hardly at all
        const along = wl > 0 ? (di * wind[0] + dj * wind[1]) / wl : 0
        const chance = PASS * this.grass[m] * was[k] * (1 + 0.8 * along * Math.min(1, wl))
        if (this.rand() < chance) { this.fire[m] = 0.35; changed = true }
      }
    }
    for (let k = 0; k < was.length; k++) {
      if (this.fire[k] > 0) {
        // it flares up, eats the grass, and goes out when there is none left
        this.fire[k] = Math.min(1, this.fire[k] + dt * 2.5)
        this.grass[k] = Math.max(0, this.grass[k] - dt / BURN_TIME)
        this.char[k] = Math.max(this.char[k], 1 - this.grass[k] / Math.max(this.room[k], 1e-6))
        if (this.grass[k] <= 0.02) { this.fire[k] = 0; this.grass[k] = 0; this.char[k] = 1; this.since[k] = 0 }
        changed = true
      } else if (this.grass[k] < this.room[k] || this.char[k] > 0) {
        // a scar greens slowly: after a while grass starts back, and the black fades as it grows
        this.since[k] += dt
        if (this.since[k] > SCAR_TIME) {
          this.grass[k] = Math.min(this.room[k], this.grass[k] + (dt / REGROW_TIME) * this.room[k])
          this.char[k] = Math.max(0, Math.min(this.char[k], 1 - this.grass[k] / Math.max(this.room[k], 1e-6)) - dt / REGROW_TIME)
        }
        changed = true
      }
    }
    if (changed) this.version++
  }
}
