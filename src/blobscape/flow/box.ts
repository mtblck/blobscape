/**
 * One box of Sand, Snow and Goo: a material, a test and what the test needs
 * (a spout that pours, a pile and a thing to drop in it, a column to let go),
 * on the simulation in splat-engine/mpm.ts and the solids in
 * splat-engine/solids.ts. The page draws what `frame` hands it; the worker
 * only keeps the clock. Everything is in the simulation's units: the box is
 * [0, 1] each way.
 *
 * Pure and tested.
 */
import { Mpm, MATERIALS, PER_CELL, type Material, type PartialKnobs } from '../../splat-engine/mpm.ts'
import { Solid } from '../../splat-engine/solids.ts'
import { box, cut, sphere, type Shape } from '../../splat-engine/voxel.ts'

type Vec3 = [number, number, number]

/** What happens to the material. */
export type Test = 'pour' | 'drop' | 'collapse'
/** What it lands on, or lies in. */
export type Ground = 'floor' | 'block' | 'steps' | 'bowl'
/** What is dropped into it. */
export type Thing = 'ball' | 'cube' | 'rock'
/** How fine the simulation is. */
export type Detail = 'light' | 'full' | 'fine'

export const TESTS: { id: Test; label: string; note: string; grounds: Ground[] }[] = [
  { id: 'pour', label: 'Pour', note: 'A stream from a spout, onto whatever is under it.', grounds: ['block', 'floor', 'steps', 'bowl'] },
  { id: 'drop', label: 'Drop something in', note: 'A pile of it, and something solid that falls in.', grounds: ['floor', 'bowl'] },
  { id: 'collapse', label: 'Collapse', note: 'A column of it, let go.', grounds: ['floor', 'block', 'steps'] },
]
export const GROUNDS: Record<Ground, { label: string; pile?: string }> = {
  floor: { label: 'The floor', pile: 'A pile on the floor' },
  block: { label: 'A block' },
  steps: { label: 'Steps' },
  bowl: { label: 'A bowl', pile: 'A full bowl' },
}
export const THINGS: { id: Thing; label: string }[] = [{ id: 'ball', label: 'Ball' }, { id: 'cube', label: 'Cube' }, { id: 'rock', label: 'Rock' }]
/** Grid cells a side, and the most particles a box holds, per detail. Every particle is a blob, so the view keeps this many and hides the unused. */
export const DETAILS: Record<Detail, { label: string; cells: number; capacity: number }> = {
  light: { label: 'Light', cells: 18, capacity: 2600 },
  full: { label: 'Full', cells: 24, capacity: 6000 },
  fine: { label: 'Fine', cells: 32, capacity: 14000 },
}

/** Everything that says what a box starts as. Changing any of it starts the box again. */
export interface Setup {
  material: Material
  test: Test
  ground: Ground
  thing: Thing
  /** 0 to 1: how big the thing is. */
  size: number
  /** The thing's weight for its size, against the material's 1. */
  weight: number
  detail: Detail
}
export const SETUP: Setup = { material: 'sand', test: 'pour', ground: 'block', thing: 'ball', size: 0.5, weight: 3, detail: 'full' }

/** The ground a test can use: the one asked for, else the test's first. */
export function groundFor(test: Test, ground: Ground): Ground {
  const t = TESTS.find((k) => k.id === test)!
  return t.grounds.includes(ground) ? ground : t.grounds[0]
}

/** A thing's radius in box units for a size from 0 to 1. */
export const thingRadius = (size: number) => 0.055 + 0.04 * Math.min(1, Math.max(0, size))
/** The size every thing's blobs are built at; the view scales them to `thingRadius`. */
export const THING_BUILT = 0.08

/** A rock: a ball cut by planes at uneven depths, so it has faces and corners but no hollow. The same rock every time. */
function rockPlanes(): [Vec3, number][] {
  const planes: [Vec3, number][] = []
  let s = 7
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  const N = 18
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), t = i * 2.399963229728653 + rand() * 0.6
    planes.push([[Math.cos(t) * r, y * 0.9, Math.sin(t) * r], 0.62 + 0.3 * rand()])
  }
  return planes.map(([n, d]) => { const l = Math.hypot(...n); return [[n[0] / l, n[1] / l, n[2] / l], d] })
}
const ROCK = rockPlanes()

/** A thing's shape about its own middle, `r` in radius. */
export function thingShape(thing: Thing, r: number): Shape {
  if (thing === 'ball') return sphere([0, 0, 0], r)
  if (thing === 'cube') { const h = r * 0.8; return box([0, 0, 0], [h, h, h], h * 0.12) }
  return {
    sdf: (x, y, z) => {
      let d = Math.hypot(x, y, z) - r
      for (const [n, k] of ROCK) d = Math.max(d, n[0] * x + n[1] * y + n[2] * z - k * r)
      return d
    },
    min: [-r, -r, -r], max: [r, r, r],
  }
}
/** A cube's corners, for meeting the floor on. */
function corners(thing: Thing, r: number): Vec3[] {
  if (thing !== 'cube') return []
  const h = r * 0.8 * 0.96
  return [-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [-1, 1].map((c): Vec3 => [a * h, b * h, c * h])))
}

/** The fixed shapes of a ground, standing on a floor at height `f`. Empty for the bare floor. */
export function groundShapes(ground: Ground, f: number): Shape[] {
  if (ground === 'block') return [box([0.5, f + 0.075, 0.5], [0.15, 0.075, 0.15], 0.012)]
  if (ground === 'steps') return STEPS.map(([x0, x1, h]) => box([(x0 + x1) / 2, f + h / 2, 0.5], [(x1 - x0) / 2, h / 2, 0.42], 0.008))
  if (ground === 'bowl') {
    const c: Vec3 = [0.5, f + BOWL.r - BOWL.sunk, 0.5]
    const shell = cut(sphere(c, BOWL.r), sphere(c, BOWL.r - BOWL.wall))
    // the lower part of a hollow ball, standing on a flat foot where the floor cuts it
    return [cut(cut(shell, box([0.5, f + BOWL.rim + 1, 0.5], [1, 1, 1])), box([0.5, f - 1, 0.5], [1, 1, 1]))]
  }
  return []
}
/** Three steps going down toward +x: each from x0 to x1, this tall. */
const STEPS: [number, number, number][] = [[0.07, 0.3, 0.21], [0.3, 0.54, 0.14], [0.54, 0.78, 0.07]]
/** The bowl: a hollow ball of radius `r` with walls `wall` thick, sunk `sunk` into the floor, cut off `rim` above it. */
const BOWL = { r: 0.42, wall: 0.075, sunk: 0.03, rim: 0.2 }

/** Where the spout is, and where a column stands or a thing falls: over the top step, else the middle. */
function over(ground: Ground): [x: number, z: number] { return ground === 'steps' ? [0.19, 0.5] : [0.5, 0.5] }
/** How high the ground is under `over`. */
function topOf(ground: Ground, f: number): number {
  return f + (ground === 'block' ? 0.15 : ground === 'steps' ? 0.21 : ground === 'bowl' ? BOWL.wall - BOWL.sunk : 0)
}

/** How high the spout is, how wide, how fast its stream leaves it, and how much one pour is (as a share of the box). */
export const SPOUT = { y: 0.66, r: 0.042, speed: 0.8, amount: 0.03 }
/** The column a collapse starts as. */
export const COLUMN = { r: 0.095, h: 0.42 }
/** How much the floor grips each material: goo slides on it where sand and snow catch. */
const FLOOR_GRIP: Record<Material, number> = { sand: 0.6, snow: 0.5, goo: 0.12 }
/** Seconds before the thing is let go, and the height it falls from. */
export const DROP = { after: 0.5, y: 0.78 }

/** What `FlowBox.frame` hands the view. */
export interface FlowFrame {
  /** How many particles. */
  count: number
  /** Where each is, three numbers a particle, in box units. */
  x: Float32Array
  /** How lit each is, 0 to 255: its surface's facing against the sun, found from how the material thins out round it. */
  shade: Uint8Array
  /** A second reading per particle, 0 to 255: for snow, how packed it is. */
  tone: Uint8Array
  /** The thing: where it is (3), how it is turned (4) and its radius, or empty when there is none. */
  body: Float32Array
  /** Seconds simulated. */
  time: number
  /** Whether the box holds as many particles as it can. */
  full: boolean
  /** Whether the spout is running. */
  pouring: boolean
}

/** The sun the view's shapes are lit by (voxel.ts's `DEFAULT_LIGHT`), so the material is shaded from the same side. */
const SUN: Vec3 = (() => { const d = [-0.45, 0.75, 0.5], l = Math.hypot(...d); return [d[0] / l, d[1] / l, d[2] / l] as Vec3 })()

/** One box: a material and its test. */
export class FlowBox {
  readonly sim: Mpm
  readonly setup: Setup
  /** The thing dropped in, once there is one. */
  body?: Solid
  private bodyR = 0
  /** Particles the spout still owes. */
  private owed = 0
  /** How far the stream has moved since the spout last let a layer go. */
  private run = 0
  private seed = 1
  private dropAt = Infinity

  constructor(setup: Setup, knobs: PartialKnobs = {}, gravity = 4) {
    const d = DETAILS[setup.detail]
    this.setup = { ...setup, ground: groundFor(setup.test, setup.ground) }
    this.sim = new Mpm({ cells: d.cells, capacity: d.capacity, gravity, knobs })
    const { sim } = this, f = sim.floor, { material, test, ground } = this.setup
    sim.floorGrip = FLOOR_GRIP[material]
    for (const s of groundShapes(ground, f)) sim.addSolid(new Solid(s, { friction: 0.6 }))
    const [cx, cz] = over(ground), top = topOf(ground, f)
    if (test === 'pour') this.pourMore()
    else if (test === 'collapse') {
      // a round column, so what it runs into owes nothing to corners
      const r = COLUMN.r
      sim.fillBox([cx - r, top, cz - r], [cx + r, top + COLUMN.h, cz + r], material, this.seed++, [0, 0, 0], (x, _y, z) => Math.hypot(x - cx, z - cz) < r)
    } else {
      if (ground === 'bowl') {
        const c: Vec3 = [0.5, f + BOWL.r - BOWL.sunk, 0.5], inner = BOWL.r - BOWL.wall - sim.dx * 0.3
        const level = f + BOWL.rim - 0.035
        sim.fillBox([0.1, f, 0.1], [0.9, level, 0.9], material, this.seed++, [0, 0, 0], (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) < inner)
      } else {
        // a low dome: part of a ball whose middle is under the floor
        const a = 0.3, h = 0.17, R = (a * a + h * h) / (2 * h)
        sim.fillBox([0.5 - a, f, 0.5 - a], [0.5 + a, f + h, 0.5 + a], material, this.seed++, [0, 0, 0], (x, y, z) => Math.hypot(x - 0.5, y - (f + h - R), z - 0.5) < R)
      }
      this.dropAt = DROP.after
    }
  }

  /** Whether the spout is running. */
  get pouring() { return this.owed > 0 && this.sim.count < this.sim.capacity }
  /** Whether the box holds as many particles as it can. */
  get full() { return this.sim.count >= this.sim.capacity }

  /** Starts the spout for one more pour's worth. */
  pourMore() { this.owed += Math.round(SPOUT.amount * (this.sim.n * PER_CELL) ** 3) }

  /** Lets a thing fall from over the middle, in place of the last one. */
  drop(thing = this.setup.thing, size = this.setup.size, weight = this.setup.weight) {
    const { sim } = this
    if (this.body) sim.removeSolid(this.body)
    const r = thingRadius(size), [cx, cz] = over(this.setup.ground)
    this.bodyR = r
    this.body = sim.addSolid(new Solid(thingShape(thing, r), { at: [cx, DROP.y, cz], density: weight, friction: 0.5, corners: corners(thing, r), round: thing === 'ball' ? r : 0 }))
    if (thing !== 'ball') {
      // not flat on: a corner first
      this.body.quat.set(TILT)
      this.body.turned()
    }
    this.dropAt = Infinity
  }

  /** Moves the box on by about `seconds`, in whole steps. Returns the seconds it moved. */
  advance(seconds: number): number {
    const { sim } = this
    const steps = Math.max(1, Math.round(seconds / sim.dt))
    for (let s = 0; s < steps; s++) {
      if (sim.time >= this.dropAt) this.drop()
      if (this.owed > 0) this.spout()
      sim.step()
    }
    return steps * sim.dt
  }

  /** The spout: each time the stream has fallen a particle's spacing, it lets go one more layer. */
  private spout() {
    const { sim } = this, step = sim.dx / PER_CELL
    this.run += SPOUT.speed * sim.dt
    if (this.run < step) return
    this.run -= step
    const [cx, cz] = over(this.setup.ground), r = SPOUT.r
    const y = SPOUT.y, v: Vec3 = [0, -SPOUT.speed, 0]
    const before = sim.count
    sim.fillBox([cx - r, y, cz - r], [cx + r, y + step, cz + r], this.setup.material, this.seed++, v, (x, _y, z) => Math.hypot(x - cx, z - cz) < r)
    this.owed -= sim.count - before
    if (sim.count >= sim.capacity) this.owed = 0
  }

  /** What the view needs to draw the box now. */
  frame(): FlowFrame {
    const { sim } = this, n = sim.count
    const x = new Float32Array(n * 3), shade = new Uint8Array(n), tone = new Uint8Array(n)
    const { gm, dx } = sim, N = sim.n, inv = 1 / dx
    // the mass a full cell holds: the material thins out toward its surface, and the way it thins is the way out
    const at = (gx: number, gy: number, gz: number) => gm[(Math.min(N - 1, Math.max(0, gx)) * N + Math.min(N - 1, Math.max(0, gy))) * N + Math.min(N - 1, Math.max(0, gz))]
    const snow = MATERIALS.indexOf('snow')
    for (let p = 0; p < n; p++) {
      const o = p * 3
      x[o] = sim.x[o]; x[o + 1] = sim.x[o + 1]; x[o + 2] = sim.x[o + 2]
      const gx = Math.round(sim.x[o] * inv), gy = Math.round(sim.x[o + 1] * inv), gz = Math.round(sim.x[o + 2] * inv)
      const nx = at(gx - 1, gy, gz) - at(gx + 1, gy, gz), ny = at(gx, gy - 1, gz) - at(gx, gy + 1, gz), nz = at(gx, gy, gz - 1) - at(gx, gy, gz + 1)
      const l = Math.hypot(nx, ny, nz)
      // deep inside, where nothing thins, the light is the sky's alone
      const edge = Math.min(1, l / (sim.mass * PER_CELL ** 3 * 0.5))
      const facing = l > 0 ? Math.max(0, (nx * SUN[0] + ny * SUN[1] + nz * SUN[2]) / l) : 0
      shade[p] = Math.round(255 * (0.42 + 0.58 * facing * edge + 0.1 * (1 - edge)))
      tone[p] = sim.mat[p] === snow ? Math.min(255, Math.round(sim.packed[p] * 1200)) : 0
    }
    const b = this.body
    const body = b ? new Float32Array([b.pos[0], b.pos[1], b.pos[2], b.quat[0], b.quat[1], b.quat[2], b.quat[3], this.bodyR]) : new Float32Array(0)
    return { count: n, x, shade, tone, body, time: sim.time, full: this.full, pouring: this.pouring }
  }
}

/** How a cube or rock is turned as it is let go. */
const TILT = (() => { const q = [0.28, 0.12, 0.36, 0.88], l = Math.hypot(...q); return q.map((v) => v / l) })()
