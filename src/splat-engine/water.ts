import { Blobs, quatFacing, type Vec3 } from '../splat-core/blobs.ts'
import { linearToSrgb } from '../splat-core/color.ts'
import type { Actor, PointLight } from './engine.ts'
import { Skeleton, emptySkin, setWeights } from './rig.ts'

/**
 * Still water that moves when something moves through it: a pond as a grid of heights stepped by the wave equation,
 * and the blobs that draw its surface.
 *
 * `Water` is the pond itself, in plain numbers so it runs in Node tests. Each wet cell holds how far its surface stands
 * above the level and how fast it is rising. A fixed tick moves every cell toward the mean of its neighbors, which is
 * what makes a ring travel outward at `speed`; a dry cell gives its neighbor back its own height, so rings bounce off
 * banks, steps and pillars. Nothing draws rings: a body that enters, leaves or wades through the water (`body`) pushes
 * the water it displaces to the cells round it, and the rings are what the grid does with that.
 *
 * `makeSurface` lays flat blobs over the wet cells, `shapeSurface` lifts and tilts each to the water under it, and
 * `shadeSurface` colors each from the view: clear looking straight down, a mirror of the sky at a low angle
 * (Fresnel), with a glint where it throws the sun or a lamp at the eye.
 */

/** A pond for `Water`: its grid, where its surface stands and where there is water at all. */
export interface WaterSpec {
  /** The grid's corner along x. */
  x0: number
  /** The grid's corner along z. */
  z0: number
  /** Cells along x. */
  nx: number
  /** Cells along z. */
  nz: number
  /** A cell's side, in meters. */
  cell: number
  /** The height (y) the surface stands at when still. */
  level: number
  /** Whether there is water at a point. Left out, the whole grid is wet. */
  wet?: (x: number, z: number) => boolean
  /** How fast a ring travels, meters a second: 0.8 when left out. */
  speed?: number
  /** How quickly the water comes to rest: the share of its motion lost a second, 0.55 when left out. */
  damping?: number
}

/** The water's fixed step, seconds: the same frames give the same water. */
export const WATER_TICK = 1 / 60
/** Once every cell is within this of the mean height and moving slower than this (meters, meters a second), the water counts as still and isn't stepped. */
export const WATER_STILL = 2e-5

/** How far a body must move (or grow) where it crosses the surface before the water is told, meters: a standing leg's sway is not a wave. */
export const BODY_SLACK = 0.004

/** Where a body crosses the water's surface: a disc. */
export interface Crossing {
  /** The disc's middle, along x. */
  x: number
  /** The disc's middle, along z. */
  z: number
  /** The disc's radius. */
  r: number
}

/**
 * Where a capsule from `a` to `b` of radius `r` crosses the level `y`: the disc it cuts out of the surface, or null
 * when it is wholly above or below. A leg is such a capsule from knee to ankle.
 */
export function crossing(a: ArrayLike<number>, b: ArrayLike<number>, r: number, y: number): Crossing | null {
  const lo = a[1] < b[1] ? a : b, hi = a[1] < b[1] ? b : a
  if (lo[1] - r > y || hi[1] + r < y) return null
  // between the ends, the capsule's own width; past an end, the cap's
  if (y <= lo[1]) return { x: lo[0], z: lo[2], r: Math.sqrt(Math.max(0, r * r - (lo[1] - y) ** 2)) }
  if (y >= hi[1]) return { x: hi[0], z: hi[2], r: Math.sqrt(Math.max(0, r * r - (y - hi[1]) ** 2)) }
  const t = (y - lo[1]) / (hi[1] - lo[1])
  return { x: lo[0] + (hi[0] - lo[0]) * t, z: lo[2] + (hi[2] - lo[2]) * t, r }
}

/** A pond: heights on a grid, stepped by the wave equation, moved by what wades through it. */
export class Water {
  /** The pond's grid and level, with the defaults filled in. */
  readonly spec: Required<Omit<WaterSpec, 'wet'>>
  /** Each cell's height above the level, meters. */
  readonly h: Float32Array
  /** Each cell's speed upward, meters a second. */
  readonly v: Float32Array
  /** 1 where a cell holds water. */
  readonly wet: Uint8Array
  /** How many cells hold water. */
  readonly wetCount: number
  /** Seconds stepped so far. */
  time = 0
  /** Goes up whenever the heights change, so a view knows to draw again. */
  version = 0
  private carry = 0
  private moving = false
  private readonly bodies = new Map<string, Crossing>()

  constructor(spec: WaterSpec) {
    this.spec = { speed: 0.8, damping: 0.55, ...spec }
    const { nx, nz, x0, z0, cell } = this.spec
    this.h = new Float32Array(nx * nz)
    this.v = new Float32Array(nx * nz)
    this.wet = new Uint8Array(nx * nz)
    let n = 0
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (spec.wet && !spec.wet(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell)) continue
      this.wet[j * nx + i] = 1
      n++
    }
    this.wetCount = n
  }

  /** The cell holding (x, z), or −1 off the grid. */
  index(x: number, z: number) {
    const { nx, nz, x0, z0, cell } = this.spec
    const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell)
    return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i
  }

  /** Whether there is water at (x, z). */
  wetAt(x: number, z: number) {
    const k = this.index(x, z)
    return k >= 0 && this.wet[k] === 1
  }

  /** Whether every point within `r` of (x, z) is water: room for a body that wide to stand. */
  roomAt(x: number, z: number, r: number) {
    if (!this.wetAt(x, z)) return false
    for (let q = 0; q < 8; q++) {
      const a = (q / 8) * Math.PI * 2
      if (!this.wetAt(x + Math.cos(a) * r, z + Math.sin(a) * r)) return false
    }
    return true
  }

  /** Whether the water is at rest. */
  get still() { return !this.moving }

  /** The surface's height above the level at (x, z), blended between the four cells round it; 0 on dry ground. */
  heightAt(x: number, z: number) {
    const { nx, nz, x0, z0, cell } = this.spec
    const fx = (x - x0) / cell - 0.5, fz = (z - z0) / cell - 0.5
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, w = fz - j
    let sum = 0, weight = 0
    for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
      const a = i + di, b = j + dj
      if (a < 0 || b < 0 || a >= nx || b >= nz || !this.wet[b * nx + a]) continue
      const k = (di ? u : 1 - u) * (dj ? w : 1 - w)
      sum += this.h[b * nx + a] * k
      weight += k
    }
    return weight > 0 ? sum / weight : 0
  }

  /** The surface's slope at (x, z): how much it rises per meter along x and along z. A dry neighbor counts as level with the cell, as it does to the waves. */
  slopeAt(x: number, z: number): [number, number] {
    const { nx, nz, x0, z0, cell } = this.spec
    const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell)
    if (i < 0 || j < 0 || i >= nx || j >= nz || !this.wet[j * nx + i]) return [0, 0]
    const k = j * nx + i, here = this.h[k]
    const at = (a: number, b: number) => (a < 0 || b < 0 || a >= nx || b >= nz || !this.wet[b * nx + a] ? here : this.h[b * nx + a])
    return [(at(i + 1, j) - at(i - 1, j)) / (2 * cell), (at(i, j + 1) - at(i, j - 1)) / (2 * cell)]
  }

  /**
   * The water's energy per wet cell, 0 at rest: its motion (speed squared) plus its tilt (the squared slope between
   * neighbors, times the wave speed squared), which trade places as a wave passes. Waves keep it, damping spends it,
   * and nothing but a body or a drop adds to it.
   */
  get energy() {
    const { speed, cell, nx, nz } = this.spec
    const { h, v, wet } = this
    const k = (speed * speed) / (cell * cell)
    let e = 0
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const c = j * nx + i
      if (!wet[c]) continue
      e += v[c] * v[c]
      if (i < nx - 1 && wet[c + 1]) e += k * (h[c + 1] - h[c]) ** 2
      if (j < nz - 1 && wet[c + nx]) e += k * (h[c + nx] - h[c]) ** 2
    }
    return this.wetCount ? e / (2 * this.wetCount) : 0
  }

  /** How much water stands above the level in all, cubic meters: what a body pushed aside is put back round it, so this stays 0. */
  get volume() {
    let s = 0
    for (let c = 0; c < this.h.length; c++) s += this.h[c]
    return s * this.spec.cell * this.spec.cell
  }

  /**
   * Tells the water where a body crosses its surface now (`at`, from `crossing`; null when it is out of the water or
   * wholly under it). `draft` is how deep the body stands in the water there, meters: a leg on the bed takes the place
   * of the whole column, so its draft is the water's depth. Where the body newly stands, the water it takes the place
   * of (a disc of its radius, `draft` deep, whatever the grid) is pressed out and put on the cells just round it;
   * where it stood, the water comes back the same way. So stepping in raises a ring, wading pushes a wave ahead and
   * leaves a trough behind, and stepping out lets the water fall back in. `id` names the body from call to call.
   */
  body(id: string, at: Crossing | null, draft = 0.02) {
    const was = this.bodies.get(id) ?? null
    if (!at && !was) return
    // a body that has hardly moved since the water last heard of it has not moved the water
    if (at && was && Math.hypot(at.x - was.x, at.z - was.z) + Math.abs(at.r - was.r) < BODY_SLACK) return
    if (at) this.bodies.set(id, { ...at }); else this.bodies.delete(id)
    const { nx, nz, x0, z0, cell } = this.spec
    // how much of a cell at distance d from the middle of a disc of radius r the body covers: all of it well inside, none past the rim
    const cover = (c: Crossing | null, x: number, z: number) => {
      if (!c || c.r <= 0) return 0
      const d = Math.hypot(x - c.x, z - c.z), soft = Math.max(cell, c.r * 0.5)
      const t = Math.max(0, Math.min(1, (c.r + soft * 0.5 - d) / soft))
      return t * t * (3 - 2 * t)
    }
    const round = at ?? was!
    const reach = Math.max(at?.r ?? 0, was?.r ?? 0) * 2.4 + cell * 2
    const minX = Math.min(at?.x ?? Infinity, was?.x ?? Infinity) - reach, maxX = Math.max(at?.x ?? -Infinity, was?.x ?? -Infinity) + reach
    const minZ = Math.min(at?.z ?? Infinity, was?.z ?? Infinity) - reach, maxZ = Math.max(at?.z ?? -Infinity, was?.z ?? -Infinity) + reach
    const i0 = Math.max(0, Math.floor((minX - x0) / cell)), i1 = Math.min(nx - 1, Math.floor((maxX - x0) / cell))
    const j0 = Math.max(0, Math.floor((minZ - z0) / cell)), j1 = Math.min(nz - 1, Math.floor((maxZ - z0) / cell))
    // on a grid coarser than the body, the cells it covers are more than its own cross-section: press each so that
    // what is moved is the body's own volume, a disc of its radius `draft` deep
    const share = (c: Crossing | null) => {
      if (!c || c.r <= 0) return 0
      let sum = 0
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (this.wet[j * nx + i]) sum += cover(c, x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell)
      return sum > 0 ? Math.min(1, (Math.PI * c.r * c.r) / (sum * cell * cell)) : 0
    }
    const now = share(at), before = share(was)
    let moved = 0, ring = 0
    const rim = Math.max(round.r, cell) * 2.2 + cell
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * nx + i
      if (!this.wet[k]) continue
      const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell
      const d = -draft * (now * cover(at, x, z) - before * cover(was, x, z))
      this.h[k] += d
      moved += d
      const far = Math.hypot(x - round.x, z - round.z)
      if (far < rim) ring += rimShare(far, rim)
    }
    // what was pressed down goes up round it (and the other way), so no water is made or lost
    if (ring > 0 && moved !== 0) {
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * nx + i
        if (!this.wet[k]) continue
        const far = Math.hypot(x0 + (i + 0.5) * cell - round.x, z0 + (j + 0.5) * cell - round.z)
        if (far < rim) this.h[k] -= (moved * rimShare(far, rim)) / ring
      }
    }
    this.moving = true
    this.version++
  }

  /** Lays the water flat and still at once, keeping what it knows of the bodies in it: for the start of a scene, where whoever stands in the pond has always stood there. */
  rest() {
    this.h.fill(0)
    this.v.fill(0)
    this.moving = false
    this.version++
  }

  /** Forgets every body, as when the scene is set again: the next `body` call for each is a fresh entry. */
  forget() { this.bodies.clear() }

  /** Lets a drop of `volume` cubic meters fall at (x, z), spread over a radius `r`: a raindrop, a pebble, a tap. Nothing if it lands on dry ground. */
  drop(x: number, z: number, r: number, volume: number) {
    const { nx, nz, x0, z0, cell } = this.spec
    const i0 = Math.max(0, Math.floor((x - r - x0) / cell)), i1 = Math.min(nx - 1, Math.floor((x + r - x0) / cell))
    const j0 = Math.max(0, Math.floor((z - r - z0) / cell)), j1 = Math.min(nz - 1, Math.floor((z + r - z0) / cell))
    let sum = 0
    const share = (i: number, j: number) => {
      if (!this.wet[j * nx + i]) return 0
      const d = Math.hypot(x0 + (i + 0.5) * cell - x, z0 + (j + 0.5) * cell - z) / Math.max(r, cell * 0.75)
      return d >= 1 ? 0 : (1 - d * d) ** 2
    }
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) sum += share(i, j)
    if (sum <= 0) return
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.h[j * nx + i] += (volume / (cell * cell)) * (share(i, j) / sum)
    this.moving = true
    this.version++
  }

  /** Moves the water on by `dt` seconds, in whole ticks (what is left of a frame is carried to the next). */
  step(dt: number) {
    this.carry += dt
    const ticks = Math.floor(this.carry / WATER_TICK + 1e-9)
    this.carry -= ticks * WATER_TICK
    for (let k = 0; k < ticks; k++) {
      this.time += WATER_TICK
      if (this.moving) this.tick()
    }
  }

  private tick() {
    const { nx, nz, cell, speed, damping } = this.spec
    // the step each cell can take without the grid running ahead of the wave: split the tick if the water is fast or the cells small
    const parts = Math.max(1, Math.ceil((speed * WATER_TICK) / (cell * 0.6)))
    const dt = WATER_TICK / parts
    const pull = (speed * speed * dt) / (cell * cell), keep = Math.exp(-damping * dt)
    const { h, v, wet } = this
    for (let p = 0; p < parts; p++) {
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i
        if (!wet[k]) continue
        const here = h[k]
        // a dry cell or the grid's edge is a wall: it gives back the cell's own height
        const l = i > 0 && wet[k - 1] ? h[k - 1] : here, r = i < nx - 1 && wet[k + 1] ? h[k + 1] : here
        const d = j > 0 && wet[k - nx] ? h[k - nx] : here, u = j < nz - 1 && wet[k + nx] ? h[k + nx] : here
        v[k] = (v[k] + pull * (l + r + d + u - 4 * here)) * keep
      }
      for (let k = 0; k < h.length; k++) if (wet[k]) h[k] += v[k] * dt
    }
    // at rest once every cell is level with the rest and hardly moving (a drop has raised the level a hair: that stays)
    let sum = 0
    for (let k = 0; k < h.length; k++) sum += h[k]
    const mean = this.wetCount ? sum / this.wetCount : 0
    let most = 0
    for (let k = 0; k < h.length; k++) if (wet[k]) most = Math.max(most, Math.abs(h[k] - mean), Math.abs(v[k]))
    if (most < WATER_STILL) {
      for (let k = 0; k < h.length; k++) if (wet[k]) h[k] = mean
      v.fill(0)
      this.moving = false
    }
    this.version++
  }
}

/** How much of the water a body pushes aside lands at a distance from it: most just off its rim, none at the reach's end. */
function rimShare(far: number, rim: number) {
  const t = far / rim
  return t * t * (1 - t) * (1 - t)
}

// --- Drawing it

/** The blobs that draw a pond's surface, from `makeSurface`. */
export interface WaterSurface extends Actor {
  /** Where each blob lies on the pond: x then z, a pair a blob. */
  at: Float32Array
  /** Each blob's size at rest, across the surface. */
  size: Float32Array
  /** The surface's slope under each blob as `shapeSurface` last found it: along x then along z, a pair a blob. */
  slope: Float32Array
  /** @internal The cells each blob reads, worked out once since a blob never moves across the pond: four to blend its height from (−1 for a dry one), then its slope's two along x and two along z. */
  taps: Int32Array
  /** @internal The four height cells' shares, summing to 1 over the wet ones. */
  shares: Float32Array
}

/** How a pond's surface looks, for `shadeSurface`. Colors are linear RGB, 0 to 1. */
export interface WaterLook {
  /** The water's own color, seen looking straight down into it. */
  body: Vec3
  /** What the surface mirrors: the sky overhead, or the dark over a night scene. */
  sky: Vec3
  /** The sky low down, where it is lighter: a ripple tips the mirror between the two, which is most of how one is seen. The same as `sky` when left out. */
  horizon?: Vec3
  /** How solid it is looking straight down, 0 to 1: the rest of the way to 1 comes with the angle. */
  clear: number
  /** The way to the sun (or moon), and its color: the surface glints where it throws it at the eye. `glow` is the share of that color the sky round it holds, fading over about a sixth of the sky; none when left out. */
  sun?: { toward: Vec3; color: Vec3; glow?: number }
  /** How tight a glint is: 120 when left out. Lower spreads it into a sheen. */
  gloss?: number
  /** How many times steeper than it is the surface is drawn and lit, so ripples a few millimeters high read from across a scene: 1 when left out. */
  steep?: number
}

/**
 * Flat blobs over every wet cell of a pond, `per` to a cell (2 when left out), on one still bone: the surface that
 * `shapeSurface` moves and `shadeSurface` colors. The count never changes afterward.
 */
export function makeSurface(water: Water, { per = 2, seed = 1 }: { per?: number; seed?: number } = {}): WaterSurface {
  const { nx, nz, x0, z0, cell, level } = water.spec
  const count = water.wetCount * per
  const blobs = new Blobs(Math.max(1, count))
  const at = new Float32Array(count * 2), size = new Float32Array(count)
  let s = (seed * 2654435761) >>> 0
  const rand = () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return s / 4294967296 }
  const up = quatFacing([0, 1, 0])
  // wide enough that neighbors overlap and the surface has no holes
  const r = (cell / Math.sqrt(per)) * 0.8
  let n = 0
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (!water.wet[j * nx + i]) continue
    for (let q = 0; q < per; q++, n++) {
      // spread within the cell, kept in it so every blob lies on water
      const x = x0 + (i + 0.1 + 0.8 * rand()) * cell, z = z0 + (j + 0.1 + 0.8 * rand()) * cell
      at[n * 2] = x
      at[n * 2 + 1] = z
      size[n] = r * (0.9 + 0.2 * rand())
      blobs.push({ center: [x, level, z], scale: [size[n], size[n], size[n] * 0.08], quat: up, color: [0, 0, 0], opacity: 0.5 })
    }
  }
  const skeleton = new Skeleton([{ name: 'water', parent: -1, head: [x0 + (nx * cell) / 2, level, z0 + (nz * cell) / 2] }])
  const skin = emptySkin(blobs.count)
  for (let k = 0; k < blobs.count; k++) setWeights(skin, k, [[0, 1]])
  // the cells `Water.heightAt` and `Water.slopeAt` would read for each blob
  const taps = new Int32Array(count * 8), shares = new Float32Array(count * 4)
  const wetAt = (a: number, b: number) => a >= 0 && b >= 0 && a < nx && b < nz && water.wet[b * nx + a] === 1
  for (let k = 0; k < count; k++) {
    const fx = (at[k * 2] - x0) / cell - 0.5, fz = (at[k * 2 + 1] - z0) / cell - 0.5
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, w = fz - j
    let weight = 0
    for (let q = 0; q < 4; q++) {
      const a = i + (q & 1), b = j + (q >> 1), on = wetAt(a, b)
      taps[k * 8 + q] = on ? b * nx + a : -1
      shares[k * 4 + q] = on ? (q & 1 ? u : 1 - u) * (q >> 1 ? w : 1 - w) : 0
      weight += shares[k * 4 + q]
    }
    for (let q = 0; q < 4; q++) shares[k * 4 + q] /= weight || 1
    const ci = Math.floor((at[k * 2] - x0) / cell), cj = Math.floor((at[k * 2 + 1] - z0) / cell), here = cj * nx + ci
    const or = (a: number, b: number) => (wetAt(a, b) ? b * nx + a : here)
    taps.set([or(ci + 1, cj), or(ci - 1, cj), or(ci, cj + 1), or(ci, cj - 1)], k * 8 + 4)
  }
  return { blobs, skin, skeleton, at, size, slope: new Float32Array(count * 2), taps, shares }
}

/** Lifts each blob of a surface to the water under it and tilts it to the water's slope there. Call after the water moved, then hand the surface to `SplatWorld.reshape`. */
export function shapeSurface(s: WaterSurface, water: Water, steep = 1) {
  const { blobs, slope, taps, shares } = s, n = slope.length / 2
  const up = blobs.quat, { level, cell } = water.spec, h = water.h, half = 1 / (2 * cell)
  for (let k = 0; k < n; k++) {
    // `Water.heightAt` and `Water.slopeAt` on the cells found when the surface was made: this runs for every blob, every frame the water moves
    const t = k * 8
    let y = 0
    for (let q = 0; q < 4; q++) if (taps[t + q] >= 0) y += h[taps[t + q]] * shares[k * 4 + q]
    blobs.center[k * 3 + 1] = level + y
    const sx = (h[taps[t + 4]] - h[taps[t + 5]]) * half, sz = (h[taps[t + 6]] - h[taps[t + 7]]) * half
    slope[k * 2] = sx
    slope[k * 2 + 1] = sz
    // `quatFacing` of the normal (−sx, 1, −sz)·steep, written out
    const nx = -sx * steep, nz = -sz * steep, nl = Math.sqrt(nx * nx + 1 + nz * nz)
    const qx = -1 / nl, qy = nx / nl, qw = 1 + nz / nl, ql = Math.sqrt(qx * qx + qy * qy + qw * qw)
    up[k * 4] = qx / ql; up[k * 4 + 1] = qy / ql; up[k * 4 + 2] = 0; up[k * 4 + 3] = qw / ql
  }
}

/** A point light as the shading loop wants it. */
interface Lamp { x: number; y: number; z: number; r: number; g: number; b: number; range: number }
const lampsOf = (lights: readonly PointLight[]): Lamp[] => lights.map((l) => ({ x: l.position[0], y: l.position[1], z: l.position[2], r: l.color[0], g: l.color[1], b: l.color[2], range: l.range }))
/** Where `shade` leaves its answer: red, green, blue (linear), then how solid. */
const shaded = new Float64Array(4)

/** `surfaceColor` on plain numbers, into `shaded`: nothing is made per call, since `shadeSurface` asks it for every blob. `sun` is the way to the sun, one long. */
function shade(px: number, py: number, pz: number, nx: number, ny: number, nz: number, eye: ArrayLike<number>, look: WaterLook, sun: Vec3 | null, lamps: Lamp[], near = true) {
  let vx = eye[0] - px, vy = eye[1] - py, vz = eye[2] - pz
  const vl = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1
  vx /= vl; vy /= vl; vz /= vl
  const facing = Math.max(0, nx * vx + ny * vy + nz * vz)
  const away = 1 - facing, fresnel = 0.02 + 0.98 * away * away * away * away * away
  // the line of sight, mirrored in the surface
  const rx = 2 * facing * nx - vx, ry = 2 * facing * ny - vy, rz = 2 * facing * nz - vz
  const gloss = look.gloss ?? 120
  let gr = 0, gg = 0, gb = 0, mr = 0, mg = 0, mb = 0
  if (sun && look.sun) {
    const toward = Math.max(0, rx * sun[0] + ry * sun[1] + rz * sun[2])
    if (toward > 0) {
      // under a millionth of the sun's color there is no glint to work out
      const c = look.sun.color, k = toward > 1e-6 ** (1 / gloss) ? toward ** gloss : 0
      gr = c[0] * k; gg = c[1] * k; gb = c[2] * k
      // the lit sky round it is part of what the surface mirrors, so it comes with the angle like the rest of the sky
      const t2 = toward * toward, g = (look.sun.glow ?? 0) * t2 * t2 * t2
      mr = c[0] * g; mg = c[1] * g; mb = c[2] * g
    }
  }
  for (let i = 0; near && i < lamps.length; i++) {
    const l = lamps[i]
    const lx = l.x - px, ly = l.y - py, lz = l.z - pz
    const d2 = lx * lx + ly * ly + lz * lz, far = l.range * 2
    if (d2 > far * far) continue
    const toward = rx * lx + ry * ly + rz * lz
    if (toward <= 0) continue
    const d = Math.sqrt(d2) || 1, u = d / l.range, w = d / far, w2 = w * w
    // as the engine's lights fall off: about a quarter at the range, gone by twice it
    const fall = (1 / (1 + 3 * u * u)) * Math.max(0, 1 - w2 * w2)
    // a lamp is small beside the sun's glint, so its glint is tighter
    const k = (toward / d) ** (gloss * 4) * fall
    gr += l.r * k; gg += l.g * k; gb += l.b * k
  }
  const b = look.body, up = look.sky, low = look.horizon ?? up
  // the sky where the mirrored line of sight meets it: lighter toward the horizon
  const down = 1 - Math.max(0, Math.min(1, ry)), h = down * down * down
  shaded[0] = b[0] * (1 - fresnel) + (up[0] + (low[0] - up[0]) * h + mr) * fresnel + gr
  shaded[1] = b[1] * (1 - fresnel) + (up[1] + (low[1] - up[1]) * h + mg) * fresnel + gg
  shaded[2] = b[2] * (1 - fresnel) + (up[2] + (low[2] - up[2]) * h + mb) * fresnel + gb
  shaded[3] = Math.min(1, look.clear + (1 - look.clear) * fresnel + Math.max(gr, gg, gb))
}

const sunOf = (look: WaterLook): Vec3 | null => {
  if (!look.sun) return null
  const t = look.sun.toward, l = Math.hypot(t[0], t[1], t[2]) || 1
  return [t[0] / l, t[1] / l, t[2] / l]
}

/**
 * What a point of the surface sends to an eye: its color (linear) and how solid it is. Clear and its own color seen
 * from above, more of a mirror of the sky the lower the angle (Schlick's Fresnel for water), plus a glint where the
 * mirrored line of sight runs at the sun or at a lamp. Pure, so tests can ask it.
 */
export function surfaceColor(p: Vec3, normal: Vec3, eye: ArrayLike<number>, look: WaterLook, lights: readonly PointLight[] = []): { color: Vec3; opacity: number } {
  shade(p[0], p[1], p[2], normal[0], normal[1], normal[2], eye, look, sunOf(look), lampsOf(lights))
  return { color: [shaded[0], shaded[1], shaded[2]], opacity: shaded[3] }
}

/** Linear to sRGB by table: `shadeSurface` asks three times a blob. */
const SRGB = Float32Array.from({ length: 4097 }, (_, i) => linearToSrgb(i / 4096))

/**
 * Colors every blob of a surface for an eye at `eye` (`surfaceColor`), on the slopes `shapeSurface` last left. Call
 * when the water (after `shapeSurface`) or the view moved, then hand the surface to `SplatWorld.reshape` or `recolor`.
 */
export function shadeSurface(s: WaterSurface, look: WaterLook, eye: ArrayLike<number>, lights: readonly PointLight[] = []) {
  const { blobs, at, slope } = s, n = at.length / 2, steep = look.steep ?? 1
  const sun = sunOf(look), lamps = lampsOf(lights)
  const { color, opacity, center } = blobs
  // one ball round every lamp's reach: lamps stand together (candles in a niche), and most of a pond is outside it
  let mx = 0, my = 0, mz = 0, reach = 0
  for (const l of lamps) { mx += l.x / lamps.length; my += l.y / lamps.length; mz += l.z / lamps.length }
  for (const l of lamps) reach = Math.max(reach, Math.sqrt((l.x - mx) ** 2 + (l.y - my) ** 2 + (l.z - mz) ** 2) + l.range * 2)
  for (let k = 0; k < n; k++) {
    const x = at[k * 2], z = at[k * 2 + 1]
    const nx = -slope[k * 2] * steep, nz = -slope[k * 2 + 1] * steep, nl = Math.sqrt(nx * nx + 1 + nz * nz)
    const y = center[k * 3 + 1]
    shade(x, y, z, nx / nl, 1 / nl, nz / nl, eye, look, sun, lamps, (x - mx) * (x - mx) + (y - my) * (y - my) + (z - mz) * (z - mz) < reach * reach)
    color[k * 3] = SRGB[Math.round(Math.min(1, shaded[0]) * 4096)]
    color[k * 3 + 1] = SRGB[Math.round(Math.min(1, shaded[1]) * 4096)]
    color[k * 3 + 2] = SRGB[Math.round(Math.min(1, shaded[2]) * 4096)]
    opacity[k] = shaded[3]
  }
}
