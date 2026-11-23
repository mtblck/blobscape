import type { Vec3 } from '../splat-core/blobs.ts'

/**
 * Lava that moves (a scene's `lava`, sceneDoc.ts): a shared recipe, as the water is. The pool's surface is the
 * water's own height field (water.ts), run slow and thick, so a bursting bubble sends out a sluggish swell that dies
 * within a few hands' breadth. Over it lies a field of heat, carried by the way molten rock turns over in a pool:
 *
 * - hot rock wells up at `vents` (each wandering slowly round its spot, a whole number of times a loop) and spreads
 *   out over the surface from there, meeting the spread from the next vent along lines where the crust piles up;
 * - the surface loses heat as it goes (`cool` seconds to fall to a third), so it dims from white-hot through orange
 *   and red to a dark crust the farther it has traveled;
 * - the crust is carried as plates: every cell remembers where its rock came from (`ox`, `oz`, moved along with the
 *   heat), and a cellular pattern laid on those first places draws the cracks between plates, which glow faintly
 *   while the crust is thin and stretch as the plates are pulled apart;
 * - bubbles of gas break through at hashed places and times: each leaves a crater in the height field and a patch
 *   of fresh hot rock.
 *
 * Everything is a function of the plan and the time, stepped at a fixed rate, so the same plan gives the same
 * lava. `SceneWater` runs it through the loop with the heights and keeps a glow a cell per moment.
 */

/** A vent where hot rock wells up: round (x, z), `r` across (half), wandering `wander` round that spot `times` a loop from `phase`. */
export interface LavaVent {
  /** Its middle, along x. */
  x: number
  /** Its middle, along z. */
  z: number
  /** Half its width. */
  r: number
  /** How far it wanders from its middle. */
  wander: number
  /** How many times a loop it goes round. */
  times: number
  /** Where in its round it starts, 0 to 1. */
  phase: number
}

/** A bubble bursting at (x, z), `at` seconds into the loop, `r` across (half). */
export interface LavaBubble {
  /** Where it bursts, along x. */
  x: number
  /** Where it bursts, along z. */
  z: number
  /** When it bursts, seconds into the loop. */
  at: number
  /** Half its width. */
  r: number
}

/** A scene's lava as compiled (`WaterPlan.lava`). */
export interface LavaPlan {
  /** Seconds for the surface to lose two thirds of its heat. */
  cool: number
  /** How fast the surface moves out from a vent's edge, units a second. */
  flow: number
  /** How big the crust's plates are, units across. */
  plate: number
  /** Where hot rock wells up. */
  vents: LavaVent[]
  /** How many bubbles burst a loop, and how wide one is (half). Where they burst is drawn from the wet cells (`planBubbles`). */
  bubbles: number
  /** Half the width of a bubble. */
  pop: number
  /** The colors from cold to hot, 0 to 1 as blobs hold them (sRGB): crust, dull red, orange, white-hot. */
  ramp: [Vec3, Vec3, Vec3, Vec3]
}

/** The grid the lava lies on: the pool's own (water.ts `WaterSpec` and its wet cells). */
export interface LavaGrid {
  /** Cells along x. */
  nx: number
  /** Cells along z. */
  nz: number
  /** Where the grid starts, along x. */
  x0: number
  /** Where the grid starts, along z. */
  z0: number
  /** A cell's side. */
  cell: number
  /** 1 for each cell that holds lava, row by row. */
  wet: Uint8Array
}

/** A number from 0 to 1 for a whole number, the same everywhere. */
export function lavaHash(i: number): number {
  let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b)
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

const TAU = Math.PI * 2
/** How far a vent's reach runs out before its push has faded to a third, in vent radii. */
const REACH = 3.5
/** How far round the plates' pattern fresh rock is taken from as the loop goes by, in plates: fresh crust shows new plates, and the loop still joins. */
const FRESH_TURN = 3
/** How wide a crack between two plates is, as a share of a plate. */
const CRACK = 0.09

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

/** Where a vent stands `t` seconds into a loop of `loop`. */
export function ventAt(v: LavaVent, t: number, loop: number): [number, number] {
  const a = (t / loop * v.times + v.phase) * TAU
  return [v.x + Math.cos(a) * v.wander, v.z + Math.sin(a) * v.wander]
}

/**
 * How near (x, z) lies to a crack between the crust's plates, 0 (in a plate) to 1 (on the crack): the plates are the
 * cells nearest each of a jittered grid of points `plate` apart (as stained glass's panes), and a crack runs where
 * the nearest two are nearly as near.
 */
export function crackAt(x: number, z: number, plate: number): number {
  const fx = x / plate, fz = z / plate, ix = Math.floor(fx), iz = Math.floor(fz)
  let d1 = Infinity, d2 = Infinity
  for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
    const cx = ix + a, cz = iz + b, seed = (cx * 73856093) ^ (cz * 19349663)
    const px = cx + 0.15 + 0.7 * lavaHash(seed), pz = cz + 0.15 + 0.7 * lavaHash(seed + 1)
    const d = Math.hypot(px - fx, pz - fz)
    if (d < d1) { d2 = d1; d1 = d } else if (d < d2) d2 = d
  }
  return 1 - smooth(0, CRACK, d2 - d1)
}

/**
 * How brightly a cell glows, 0 (cold crust) to 1 (white-hot), from its heat (0 to 1) and how near it lies to a crack
 * between plates (0 to 1): fresh rock glows as it is, and a crack in the crust glows dull red, brighter where the
 * crust round it is still thin.
 */
export function glowOf(heat: number, crack: number): number {
  return Math.max(heat, crack * (0.36 + 0.5 * heat))
}

/** The color of lava glowing `g` (0 to 1) along the ramp (sRGB, as blobs hold colors): crust to 0.3, dull red to 0.62, orange to 1, white-hot at 1. */
export function lavaColor(g: number, ramp: LavaPlan['ramp'], out: number[] = [0, 0, 0]): number[] {
  const stops = [0, 0.3, 0.62, 1]
  const x = Math.min(1, Math.max(0, g))
  let i = 0
  while (i < 2 && x > stops[i + 1]) i++
  const t = (x - stops[i]) / (stops[i + 1] - stops[i])
  for (let c = 0; c < 3; c++) out[c] = ramp[i][c] + (ramp[i + 1][c] - ramp[i][c]) * t
  return out
}

/** Every bubble that bursts in one loop of `loop` seconds, `count` of them at wet places of the grid, from `seed`. */
export function planBubbles(grid: LavaGrid, loop: number, count: number, r: number, seed = 1): LavaBubble[] {
  const wet: number[] = []
  for (let k = 0; k < grid.wet.length; k++) if (grid.wet[k]) wet.push(k)
  if (!wet.length) return []
  const out: LavaBubble[] = []
  for (let n = 0; n < count; n++) {
    const k = wet[Math.floor(lavaHash(seed * 7919 + n * 2) * wet.length)]
    const i = k % grid.nx, j = Math.floor(k / grid.nx)
    // spread through the loop, each in its own share of it, so they don't come in bunches
    const at = ((n + 0.2 + 0.6 * lavaHash(seed * 7919 + n * 2 + 1)) / count) * loop
    out.push({ x: grid.x0 + (i + 0.5) * grid.cell, z: grid.z0 + (j + 0.5) * grid.cell, at, r: r * (0.7 + 0.6 * lavaHash(seed + n * 31)) })
  }
  return out.sort((a, b) => a.at - b.at)
}

/**
 * The heat over a lava pool and where each cell's rock first came up: stepped by `step`, read by `glow`. The pure
 * half of the lava, worked on typed arrays, so Node tests run it as the page does.
 */
export class LavaHeat {
  /** Each cell's heat, 0 (cold) to 1 (just welled up). */
  readonly heat: Float32Array
  /** Where each cell's rock first came up, x then z, for the crust's plates. */
  readonly ox: Float32Array
  /** Where each cell's rock first came up, along z. */
  readonly oz: Float32Array
  /** The surface's way of moving at each cell as last worked out, units a second. */
  readonly u: Float32Array
  /** The surface's speed along z at each cell, units a second. */
  readonly w: Float32Array
  private readonly heat2: Float32Array
  private readonly ox2: Float32Array
  private readonly oz2: Float32Array
  private nextBubble = 0
  /** Every bubble that bursts in the loop, in order. */
  readonly bubbles: LavaBubble[]

  /** The grid it lies on. */
  readonly grid: LavaGrid
  /** The plan it runs. */
  readonly plan: LavaPlan
  /** Seconds before it all repeats: the scene's loop. */
  readonly loop: number

  constructor(grid: LavaGrid, plan: LavaPlan, loop: number) {
    this.grid = grid; this.plan = plan; this.loop = loop
    const n = grid.nx * grid.nz
    this.bubbles = planBubbles(grid, loop, plan.bubbles, plan.pop)
    this.heat = new Float32Array(n); this.heat2 = new Float32Array(n)
    this.ox = new Float32Array(n); this.oz = new Float32Array(n)
    this.ox2 = new Float32Array(n); this.oz2 = new Float32Array(n)
    this.u = new Float32Array(n); this.w = new Float32Array(n)
    for (let k = 0; k < n; k++) { this.ox[k] = this.cx(k); this.oz[k] = this.cz(k); this.heat[k] = 0.15 }
  }

  private cx(k: number) { return this.grid.x0 + ((k % this.grid.nx) + 0.5) * this.grid.cell }
  private cz(k: number) { return this.grid.z0 + (Math.floor(k / this.grid.nx) + 0.5) * this.grid.cell }

  /** Where fresh rock coming up `t` seconds into the loop is taken to come from: its own place, shifted round a circle once a loop, so new crust shows new plates and the loop still joins. */
  private fresh(x: number, z: number, t: number): [number, number] {
    const a = (t / this.loop) * TAU, r = FRESH_TURN * this.plan.plate
    return [x + Math.cos(a) * r, z + Math.sin(a) * r]
  }

  /**
   * The way the surface moves at `t`: out from every vent (as fast as `flow` at its edge, fading past it), and never
   * into the bank, so the crust piles up along the shore and where two vents' spreads meet.
   */
  flowAt(t: number) {
    const { grid, plan, u, w } = this, { nx, nz, wet } = grid
    const vents = plan.vents.map((v) => ({ v, at: ventAt(v, t, this.loop) }))
    for (let k = 0; k < u.length; k++) {
      u[k] = 0; w[k] = 0
      if (!wet[k]) continue
      const x = this.cx(k), z = this.cz(k)
      for (const { v, at } of vents) {
        const dx = x - at[0], dz = z - at[1], d = Math.hypot(dx, dz) || 1e-6
        const s = plan.flow * (d < v.r ? d / v.r : Math.exp(-(d - v.r) / (v.r * REACH)))
        u[k] += (dx / d) * s; w[k] += (dz / d) * s
      }
      // nothing flows into the bank
      const i = k % nx, j = Math.floor(k / nx)
      if (u[k] > 0 && (i + 1 >= nx || !wet[k + 1])) u[k] = 0
      if (u[k] < 0 && (i - 1 < 0 || !wet[k - 1])) u[k] = 0
      if (w[k] > 0 && (j + 1 >= nz || !wet[k + nx])) w[k] = 0
      if (w[k] < 0 && (j - 1 < 0 || !wet[k - nx])) w[k] = 0
    }
  }

  /** Reads `field` at (x, z) between the four wet cells round it; where none of them is wet, `own`. */
  private sample(field: Float32Array, x: number, z: number, own: number): number {
    const { nx, nz, x0, z0, cell, wet } = this.grid
    const fx = (x - x0) / cell - 0.5, fz = (z - z0) / cell - 0.5
    const i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j
    let sum = 0, weight = 0
    for (let q = 0; q < 4; q++) {
      const ii = i + (q & 1), jj = j + (q >> 1)
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz || !wet[jj * nx + ii]) continue
      const s = (q & 1 ? a : 1 - a) * (q >> 1 ? b : 1 - b)
      sum += field[jj * nx + ii] * s; weight += s
    }
    return weight > 1e-6 ? sum / weight : own
  }

  /**
   * Moves the lava on `dt` seconds to `t + dt`: the surface carries its heat and its first places along (each cell
   * takes what was upstream of it), it cools, the vents fill with fresh rock, and every bubble due bursts (`burst` is
   * told, to mark the height field). Bubbles are taken in loop order; call `rewind` when the loop starts again.
   */
  step(dt: number, t: number, burst?: (b: LavaBubble) => void) {
    const { grid, plan, heat, ox, oz, heat2, ox2, oz2, u, w } = this, { wet } = grid
    this.flowAt(t)
    const keep = Math.exp(-dt / plan.cool)
    for (let k = 0; k < heat.length; k++) {
      if (!wet[k]) { heat2[k] = heat[k]; ox2[k] = ox[k]; oz2[k] = oz[k]; continue }
      const x = this.cx(k) - u[k] * dt, z = this.cz(k) - w[k] * dt
      heat2[k] = this.sample(heat, x, z, heat[k]) * keep
      ox2[k] = this.sample(ox, x, z, ox[k])
      oz2[k] = this.sample(oz, x, z, oz[k])
    }
    heat.set(heat2); ox.set(ox2); oz.set(oz2)
    for (const v of plan.vents) {
      const [vx, vz] = ventAt(v, t + dt, this.loop)
      this.fill(vx, vz, v.r, t + dt, 1)
    }
    for (; this.nextBubble < this.bubbles.length && this.bubbles[this.nextBubble].at < t + dt; this.nextBubble++) {
      const b = this.bubbles[this.nextBubble]
      this.fill(b.x, b.z, b.r * 1.6, t + dt, 0.9)
      burst?.(b)
    }
  }

  /** Starts the loop's bubbles again from the first: call as each run through the loop starts. */
  rewind() { this.nextBubble = 0 }

  /** Fresh rock welling up round (x, z), `r` across: as hot as `most` in the middle, fading to the edge. */
  private fill(x: number, z: number, r: number, t: number, most: number) {
    const { nx, nz, x0, z0, cell, wet } = this.grid
    const i0 = Math.max(0, Math.floor((x - r - x0) / cell)), i1 = Math.min(nx - 1, Math.floor((x + r - x0) / cell))
    const j0 = Math.max(0, Math.floor((z - r - z0) / cell)), j1 = Math.min(nz - 1, Math.floor((z + r - z0) / cell))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * nx + i
      if (!wet[k]) continue
      const cx = x0 + (i + 0.5) * cell, cz = z0 + (j + 0.5) * cell
      const s = most * (1 - smooth(0.4, 1, Math.hypot(cx - x, cz - z) / r))
      if (s <= this.heat[k]) continue
      this.heat[k] = s
      // the hottest of it is new rock: it takes a new place for its plates
      if (s > 0.6) { const [fx, fz] = this.fresh(cx, cz, t); this.ox[k] = fx; this.oz[k] = fz }
    }
  }

  /** How brightly each cell glows now (`glowOf` its heat and its crack), into `out` from offset `at`: 0 to 1 in a float array, 0 to 255 in bytes; 0 on dry cells. */
  glow(out: Float32Array | Uint8Array, at = 0) {
    const { heat, ox, oz, plan } = this, { wet } = this.grid, bytes = out instanceof Uint8Array
    for (let k = 0; k < heat.length; k++) {
      const g = wet[k] ? glowOf(heat[k], crackAt(ox[k], oz[k], plan.plate)) : 0
      out[at + k] = bytes ? Math.round(g * 255) : g
    }
  }

  /** The mean glow over the wet cells, 0 to 1: how much light the pool gives off now. */
  meanGlow(): number {
    const { heat, ox, oz, plan } = this, { wet } = this.grid
    let sum = 0, n = 0
    for (let k = 0; k < heat.length; k++) if (wet[k]) { sum += glowOf(heat[k], crackAt(ox[k], oz[k], plan.plate)); n++ }
    return n ? sum / n : 0
  }
}
