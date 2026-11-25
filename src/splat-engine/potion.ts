import type { Vec3 } from '../splat-core/blobs.ts'
import { lavaHash, planBubbles, type LavaBubble, type LavaGrid } from './lava.ts'

/**
 * A potion that brews (a scene's `potion`, sceneDoc.ts): a shared recipe, as water and lava are. Its surface is the
 * water's own height field (water.ts), a little thicker than water, in a round pool (a cauldron, a bowl, a well).
 * Over it lie two fields carried by the way the brew turns:
 *
 * - `dye`, 0 to 1, how much of the potion's second color a cell holds: the brew is stirred round the middle (`stir`
 *   turns a loop, faster partway out than at the middle or the wall, as a stirred pot goes) with a few small eddies
 *   wandering round it, so the two colors are drawn out into spirals and marbled;
 * - `fizz`, 0 to 1, froth: where a bubble breaks, a ring of froth is left that the turning carries off and that fades
 *   over `fizzLife` seconds.
 *
 * Bubbles come up at hashed places and times: each swells the surface into a dome over `rise` seconds (laid on the
 * heights as they are shown, `domeAt`), then pops, leaving a crater in the height field whose rings run out over the
 * pool, a patch of the color from below (one or the other by a hash, so the marbling is fed fresh streaks) and froth.
 *
 * Everything is a function of the plan and the time, stepped at a fixed rate, so the same plan gives the same brew.
 * `SceneWater` runs it through the loop with the heights and keeps the two fields a byte a cell per moment.
 */

/** A small eddy that wanders round the pool: `at` a share of its radius out, going round `times` a loop from `phase`, turning the brew round itself one way or the other. */
export interface PotionEddy {
  /** How far out from the middle it goes round, a share of the pool's radius. */
  out: number
  /** How many times a loop it goes round the pool. */
  times: number
  /** Where in its round it starts, 0 to 1. */
  phase: number
  /** Which way it turns the brew: 1 with the stir, −1 against it. */
  spin: 1 | -1
}

/** A scene's potion as compiled (`WaterPlan.potion`). */
export interface PotionPlan {
  /** The pool's middle, along x. */
  x: number
  /** The pool's middle, along z. */
  z: number
  /** The pool's radius. */
  r: number
  /** How many times a loop the brew is stirred round (a whole number; under 0 the other way). */
  stir: number
  /** Small eddies wandering round in it. */
  eddies: PotionEddy[]
  /** How many bubbles break a loop. */
  bubbles: number
  /** Half the width of a bubble. */
  pop: number
  /** Seconds a bubble swells before it pops. */
  rise: number
  /** How high a bubble's dome stands just before it pops. */
  dome: number
  /** Seconds froth takes to fade to a third. */
  fizzLife: number
  /** Its colors (sRGB, 0 to 1 as blobs hold them): deep (in the hollows), its own, its second (marbled through it), froth. */
  ramp: [Vec3, Vec3, Vec3, Vec3]
  /** How brightly it glows, 0 (not at all, lit like anything else) to 1. */
  glow: number
}

const TAU = Math.PI * 2
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

/** Where an eddy stands `t` seconds into a loop of `loop`, in a pool round (x, z) of radius `r`. */
export function eddyAt(e: PotionEddy, p: Pick<PotionPlan, 'x' | 'z' | 'r'>, t: number, loop: number): [number, number] {
  const a = (t / loop * e.times + e.phase) * TAU
  return [p.x + Math.cos(a) * e.out * p.r, p.z + Math.sin(a) * e.out * p.r]
}

/**
 * How fast the stirred brew goes round at `d` from the middle of a pool of radius `r`, units a second (along the way
 * round, with the stir): still at the middle and at the wall, fastest a little over halfway out, and on average
 * going round `stir` times a loop.
 */
export function stirSpeed(d: number, r: number, stir: number, loop: number): number {
  const s = Math.min(1, d / r)
  // d·(1 − s²) peaks at 0.385 r; 1.6 brings its mean turn near the stir's own
  return (TAU * stir / loop) * d * (1 - s * s) * 1.6
}

/**
 * Where a dome stands over a bubble about to pop, as a share of its full height at `d` from the bubble's middle, `u`
 * of the way through its swelling (0 to 1): it grows wider and taller together, round on top.
 */
export function domeShape(d: number, r: number, u: number): number {
  if (u <= 0 || u > 1) return 0
  const w = r * (0.45 + 0.55 * u), x = d / w
  return x >= 1 ? 0 : u * u * (1 - x * x) * (1 - x * x)
}

/** The color of a point of potion (sRGB, 0 to 1): `dye` of the second color in its own, `shade` from −1 (deep, in a hollow) to 1 (lit, on a crest), `fizz` of froth. */
export function potionColor(dye: number, shade: number, fizz: number, ramp: PotionPlan['ramp'], out: number[] = [0, 0, 0]): number[] {
  const m = smooth(0.25, 0.75, dye)
  const deep = Math.max(0, -shade), lit = Math.max(0, shade) * 0.55, f = Math.min(1, Math.max(0, fizz))
  for (let c = 0; c < 3; c++) {
    let v = ramp[1][c] + (ramp[2][c] - ramp[1][c]) * m
    v += (ramp[0][c] - v) * deep
    v += (ramp[3][c] - v) * lit
    v += (ramp[3][c] - v) * f * 0.85
    out[c] = Math.min(1, Math.max(0, v))
  }
  return out
}

/**
 * The dye and froth over a potion's pool: stepped by `step`, read by `write`. The pure half of the potion, worked on
 * typed arrays, so Node tests run it as the page does.
 */
export class PotionMix {
  /** How much of the second color each cell holds, 0 to 1. */
  readonly dye: Float32Array
  /** How much froth lies on each cell, 0 to 1. */
  readonly fizz: Float32Array
  /** The brew's way of moving at each cell as last worked out, along x, units a second. */
  readonly u: Float32Array
  /** Along z. */
  readonly w: Float32Array
  /** Every bubble that breaks in the loop, in order. */
  readonly bubbles: LavaBubble[]
  private readonly dye2: Float32Array
  private readonly fizz2: Float32Array
  private nextBubble = 0

  /** The grid it lies on. */
  readonly grid: LavaGrid
  /** The plan it runs. */
  readonly plan: PotionPlan
  /** Seconds before it all repeats: the scene's loop. */
  readonly loop: number

  constructor(grid: LavaGrid, plan: PotionPlan, loop: number) {
    this.grid = grid; this.plan = plan; this.loop = loop
    const n = grid.nx * grid.nz
    this.bubbles = planBubbles(grid, loop, plan.bubbles, plan.pop, 7)
    this.dye = new Float32Array(n); this.dye2 = new Float32Array(n)
    this.fizz = new Float32Array(n); this.fizz2 = new Float32Array(n)
    this.u = new Float32Array(n); this.w = new Float32Array(n)
    // it starts in three arms of the second color, which the stir winds into spirals
    for (let k = 0; k < n; k++) {
      const dx = this.cx(k) - plan.x, dz = this.cz(k) - plan.z
      this.dye[k] = 0.5 + 0.5 * Math.sin(3 * Math.atan2(dz, dx) + (Math.hypot(dx, dz) / plan.r) * 4)
    }
  }

  private cx(k: number) { return this.grid.x0 + ((k % this.grid.nx) + 0.5) * this.grid.cell }
  private cz(k: number) { return this.grid.z0 + (Math.floor(k / this.grid.nx) + 0.5) * this.grid.cell }

  /** The way the brew moves at `t`: round with the stir, round each eddy, and never into the wall. */
  flowAt(t: number) {
    const { grid, plan, u, w, loop } = this, { nx, nz, wet } = grid
    const er = plan.r * 0.28, peak = Math.abs(stirSpeed(plan.r * 0.58, plan.r, plan.stir || 1, loop))
    const eddies = plan.eddies.map((e) => ({ e, at: eddyAt(e, plan, t, loop) }))
    const way = plan.stir < 0 ? -1 : 1
    for (let k = 0; k < u.length; k++) {
      u[k] = 0; w[k] = 0
      if (!wet[k]) continue
      const x = this.cx(k), z = this.cz(k)
      const dx = x - plan.x, dz = z - plan.z, d = Math.hypot(dx, dz) || 1e-6
      // round the middle, counterclockwise seen from above for a positive stir
      const s = stirSpeed(d, plan.r, plan.stir, loop)
      u[k] += (-dz / d) * s; w[k] += (dx / d) * s
      for (const { e, at } of eddies) {
        const ex = x - at[0], ez = z - at[1], q = Math.hypot(ex, ez) / er
        if (q > 3) continue
        // a little whirl: as fast as the stir partway out, at its own radius, dying away past it
        const v = way * e.spin * peak * 0.8 * q * Math.exp(0.5 * (1 - q * q))
        const len = Math.hypot(ex, ez) || 1e-6
        u[k] += (-ez / len) * v; w[k] += (ex / len) * v
      }
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
   * Moves the brew on `dt` seconds to `t + dt`: the turning carries the dye and froth along (each cell takes what was
   * upstream of it), froth fades, and every bubble due pops (`burst` is told, to mark the height field). Bubbles are
   * taken in loop order; call `rewind` when the loop starts again.
   */
  step(dt: number, t: number, burst?: (b: LavaBubble) => void) {
    const { dye, fizz, dye2, fizz2, u, w } = this, { wet } = this.grid
    this.flowAt(t)
    const keep = Math.exp(-dt / this.plan.fizzLife)
    for (let k = 0; k < dye.length; k++) {
      if (!wet[k]) { dye2[k] = dye[k]; fizz2[k] = 0; continue }
      const x = this.cx(k) - u[k] * dt, z = this.cz(k) - w[k] * dt
      dye2[k] = this.sample(dye, x, z, dye[k])
      fizz2[k] = this.sample(fizz, x, z, fizz[k]) * keep
    }
    dye.set(dye2); fizz.set(fizz2)
    for (; this.nextBubble < this.bubbles.length && this.bubbles[this.nextBubble].at < t + dt; this.nextBubble++) {
      const b = this.bubbles[this.nextBubble]
      this.pop(b, this.nextBubble)
      burst?.(b)
    }
  }

  /** Starts the loop's bubbles again from the first: call as each run through the loop starts. */
  rewind() { this.nextBubble = 0 }

  /** A bubble popping: the color from below where it was, and a ring of froth round it. */
  private pop(b: LavaBubble, n: number) {
    const { nx, nz, x0, z0, cell, wet } = this.grid, r = b.r * 2.2
    const color = lavaHash(n * 131 + 17) < 0.5 ? 0 : 1
    const i0 = Math.max(0, Math.floor((b.x - r - x0) / cell)), i1 = Math.min(nx - 1, Math.floor((b.x + r - x0) / cell))
    const j0 = Math.max(0, Math.floor((b.z - r - z0) / cell)), j1 = Math.min(nz - 1, Math.floor((b.z + r - z0) / cell))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * nx + i
      if (!wet[k]) continue
      const d = Math.hypot(x0 + (i + 0.5) * cell - b.x, z0 + (j + 0.5) * cell - b.z) / b.r
      const inner = 1 - smooth(0.5, 1.1, d)
      this.dye[k] += (color - this.dye[k]) * inner
      // froth gathers in a ring where the bubble's skin fell
      const ring = Math.exp(-((d - 1) * (d - 1)) / 0.18) * (d < 2.2 ? 1 : 0)
      this.fizz[k] = Math.max(this.fizz[k], ring)
    }
  }

  /** Writes the dye then the froth of every cell, 0 to 255, into `out` from `at` (two blocks of a cell each). */
  write(out: Uint8Array, at = 0) {
    const n = this.dye.length, { wet } = this.grid
    for (let k = 0; k < n; k++) {
      out[at + k] = wet[k] ? Math.round(Math.min(1, Math.max(0, this.dye[k])) * 255) : 0
      out[at + n + k] = wet[k] ? Math.round(Math.min(1, this.fizz[k]) * 255) : 0
    }
  }
}
