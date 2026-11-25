import { Blobs } from '../../splat-core/blobs.ts'
import { rng } from '../../splat-engine/body.ts'
import type { PropDoc, SceneProject } from '../../splat-engine/project.ts'
import type { SceneDoc } from '../../splat-engine/sceneDoc.ts'

/**
 * Destructible Diorama (issue #462): a prop tapped in a scene falls apart into its own blobs, which scatter, land on
 * the scene's ground and lie there, then fly back one after another and build it again where it now stands. Pure: the
 * page hands it the scene's cut and the skeleton as posed, and puts what it gives back on the stage.
 */

/** The skeleton as the page has posed it: a skin matrix (column-major 4×4) per bone, and each bone's turn and scale. */
export interface Posed { matrix: ArrayLike<number>; quat: ArrayLike<number>; scale: ArrayLike<number> }

/** The cut scene: its blobs, how they hang on the bones, and which part each came from. */
export interface Cut {
  blobs: Blobs
  skin: { joints: ArrayLike<number>; weights: ArrayLike<number> }
  partOf: ArrayLike<number>
}

/** A thing in the scene that can be broken: its name and the cut's blobs that make it. */
export interface Breakable { key: string; label: string; blobs: Uint32Array }

/**
 * Which prop each part of a scene made of props came from (`composeScene` lays the land's parts first, then each prop's
 * in turn, then the sky's), as the prop's place in the project, or -1 for the land and the sky.
 */
export function partOwners(doc: SceneDoc, project: SceneProject, find: (id: string) => PropDoc | undefined): Int16Array {
  const owners = new Int16Array(doc.parts.length).fill(-1)
  const get = (ref: SceneProject['land']) => (typeof ref === 'string' ? find(ref) : ref)
  let at = get(project.land)?.doc.parts.length ?? 0
  project.props.forEach((placed, i) => {
    const n = get(placed.prop)?.doc.parts.length ?? 0
    for (let k = 0; k < n && at + k < owners.length; k++) owners[at + k] = i
    at += n
  })
  return owners
}

/** A prop's name for people: its library name without the scene's numbering. */
export function propLabel(name: string) {
  return name.replace(/[0-9]+$/, '').replace(/-/g, ' ').trim()
}

/**
 * The breakable things in a scene: every prop with at least `least` blobs, each listing its blobs. A prop's parts may
 * ride bones of its own or stand still on the land's, so they are told apart by part, not by bone.
 */
export function breakables(cut: Cut, owners: ArrayLike<number>, names: string[], least = 30): Breakable[] {
  const counts = new Map<number, number>()
  for (let i = 0; i < cut.blobs.count; i++) {
    const o = owners[cut.partOf[i]] ?? -1
    if (o >= 0) counts.set(o, (counts.get(o) ?? 0) + 1)
  }
  const out: Breakable[] = []
  for (const [o, n] of [...counts].sort((a, b) => a[0] - b[0])) {
    if (n < least) continue
    const blobs = new Uint32Array(n)
    let k = 0
    for (let i = 0; i < cut.blobs.count; i++) if (owners[cut.partOf[i]] === o) blobs[k++] = i
    out.push({ key: String(o), label: propLabel(names[o] ?? `thing ${o + 1}`), blobs })
  }
  // three sheep are sheep, sheep 2 and sheep 3, so each has a name of its own
  const seen = new Map<string, number>()
  for (const t of out) {
    const n = (seen.get(t.label) ?? 0) + 1
    seen.set(t.label, n)
    if (n > 1) t.label = `${t.label} ${n}`
  }
  return out
}

/** Where blob `i` of the cut stands as posed: Σ w · M · [c, 1] over its four bones. */
export function posedCenter(cut: Cut, sk: Posed, i: number, out: Float32Array, o: number) {
  const c = cut.blobs.center, m = sk.matrix
  const x = c[i * 3], y = c[i * 3 + 1], z = c[i * 3 + 2]
  let ox = 0, oy = 0, oz = 0
  for (let k = 0; k < 4; k++) {
    const w = cut.skin.weights[i * 4 + k]
    if (!w) continue
    const b = cut.skin.joints[i * 4 + k] * 16
    ox += w * (m[b] * x + m[b + 4] * y + m[b + 8] * z + m[b + 12])
    oy += w * (m[b + 1] * x + m[b + 5] * y + m[b + 9] * z + m[b + 13])
    oz += w * (m[b + 2] * x + m[b + 6] * y + m[b + 10] * z + m[b + 14])
  }
  out[o] = ox; out[o + 1] = oy; out[o + 2] = oz
}

/** The ground's height under a point, asked on a grid once and read between its points after. */
export class HeightMap {
  readonly lo: [number, number]
  readonly step: number
  readonly side: number
  readonly heights: Float32Array
  readonly least: number
  /** Which cells the land covers (one ring round its points), where there is a land to go by. */
  land?: Uint8Array

  constructor(ground: (x: number, z: number) => number, lo: [number, number], hi: [number, number], least: number, side = 48) {
    this.lo = lo
    this.side = side
    this.least = least
    this.step = Math.max(hi[0] - lo[0], hi[1] - lo[1]) / (side - 1) || 1
    this.heights = new Float32Array(side * side)
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) {
        const h = ground(lo[0] + i * this.step, lo[1] + j * this.step)
        this.heights[j * side + i] = Number.isFinite(h) ? Math.max(least, h) : least
      }
    }
  }

  /** The ground as the highest of some points over each cell (the land's own blobs, so a thing never lands on itself); a cell with none takes its neighbors'. */
  static fromPoints(points: Float32Array, lo: [number, number], hi: [number, number], least: number, side = 48) {
    const step = Math.max(hi[0] - lo[0], hi[1] - lo[1]) / (side - 1) || 1
    let top = new Float32Array(side * side).fill(NaN)
    const land = new Uint8Array(side * side)
    for (let k = 0; k + 2 < points.length; k += 3) {
      const i = Math.round((points[k] - lo[0]) / step), j = Math.round((points[k + 2] - lo[1]) / step)
      if (i < 0 || j < 0 || i >= side || j >= side) continue
      const c = j * side + i
      if (!(top[c] >= points[k + 1])) top[c] = points[k + 1]
      for (let b = Math.max(0, j - 1); b <= Math.min(side - 1, j + 1); b++) for (let a = Math.max(0, i - 1); a <= Math.min(side - 1, i + 1); a++) land[b * side + a] = 1
    }
    // fill the holes from the cells round them, ring by ring
    for (let pass = 0; pass < side; pass++) {
      let empty = 0
      const next = top.slice()
      for (let j = 0; j < side; j++) {
        for (let i = 0; i < side; i++) {
          if (!Number.isNaN(top[j * side + i])) continue
          let sum = 0, n = 0
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const a = i + di, b = j + dj
            if (a < 0 || b < 0 || a >= side || b >= side) continue
            const h = top[b * side + a]
            if (!Number.isNaN(h)) { sum += h; n++ }
          }
          if (n) next[j * side + i] = sum / n
          else empty++
        }
      }
      top = next
      if (!empty) break
    }
    const map = new HeightMap((x, z) => top[Math.round((z - lo[1]) / step) * side + Math.round((x - lo[0]) / step)], lo, hi, least, side)
    map.land = land
    return map
  }

  /** Whether a point is over the land (always, for a map made from a function). */
  onLand(x: number, z: number) {
    if (!this.land) return true
    const i = Math.round((x - this.lo[0]) / this.step), j = Math.round((z - this.lo[1]) / this.step)
    return i >= 0 && j >= 0 && i < this.side && j < this.side && this.land[j * this.side + i] === 1
  }

  at(x: number, z: number) {
    const s = this.side
    const fx = Math.min(s - 1.0001, Math.max(0, (x - this.lo[0]) / this.step)), fz = Math.min(s - 1.0001, Math.max(0, (z - this.lo[1]) / this.step))
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j
    const h = this.heights
    const a = h[j * s + i] * (1 - u) + h[j * s + i + 1] * u, b = h[(j + 1) * s + i] * (1 - u) + h[(j + 1) * s + i + 1] * u
    return a * (1 - v) + b * v
  }
}

/** How a crumble goes, in seconds and in shares of the scene's size (`span`). */
export const CRUMBLE = {
  /** How fast pieces are thrown, a share of the scene's size a second, and how much of it is upward. */
  throw: 0.45, up: 0.7,
  /** Gravity, a share of the scene's size a second squared. */
  gravity: 1.6,
  /** How long each piece takes to fly home, and how long after the first the last one sets off. */
  fly: 0.9, spread: 1.4,
  /** How high a piece arcs on its way home, a share of the scene's size. */
  arc: 0.08,
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))

/**
 * One thing broken: where each of its blobs was when it broke, how it was thrown, where it came down, and when it sets
 * off for home. Everything is a function of the time, so a moment drawn twice is the same.
 */
export class Crumble {
  readonly count: number
  /** When it broke, and when the first piece sets off for home. */
  readonly at: number
  readonly back: number
  private readonly start: Float32Array
  private readonly vel: Float32Array
  /** How long each piece is in the air, and where it lies once down. */
  private readonly flight: Float32Array
  private readonly lies: Float32Array
  /** When each piece sets off home, after `back`. */
  private readonly delay: Float32Array
  private readonly g: number
  private readonly arc: number

  /**
   * `start`: where its blobs stand as it breaks (three a blob), `tap` where it was struck, `span` the scene's size,
   * `stay` how long the pieces lie before they start home, and `homes` where they stand now, for the order they go back in.
   */
  constructor(start: Float32Array, tap: ArrayLike<number>, at: number, span: number, stay: number, ground: HeightMap, seed = 1) {
    const n = (this.count = start.length / 3)
    this.at = at
    this.back = at + stay
    this.start = start
    this.g = CRUMBLE.gravity * span
    this.arc = CRUMBLE.arc * span
    this.vel = new Float32Array(n * 3)
    this.flight = new Float32Array(n)
    this.lies = new Float32Array(n * 3)
    this.delay = new Float32Array(n)
    const random = rng(seed * 7919 + 13)
    // the middle of the thing, so pieces burst outward from where it was struck and from its own middle
    let mx = 0, my = 0, mz = 0, low = Infinity, high = -Infinity
    for (let i = 0; i < n; i++) {
      mx += start[i * 3] / n; my += start[i * 3 + 1] / n; mz += start[i * 3 + 2] / n
      low = Math.min(low, start[i * 3 + 1]); high = Math.max(high, start[i * 3 + 1])
    }
    const speed = CRUMBLE.throw * span
    for (let i = 0; i < n; i++) {
      const x = start[i * 3], y = start[i * 3 + 1], z = start[i * 3 + 2]
      let dx = (x - tap[0]) * 0.6 + (x - mx), dz = (z - tap[2]) * 0.6 + (z - mz)
      const l = Math.hypot(dx, dz) || 1
      dx /= l; dz /= l
      const k = speed * (0.35 + 0.9 * random())
      let vx = dx * k + (random() - 0.5) * speed * 0.4, vz = dz * k + (random() - 0.5) * speed * 0.4
      const vy = speed * CRUMBLE.up * (0.3 + random()) + (y - my) * 0.5
      // a piece thrown past the land's edge is thrown less far, so it lands on the land and not on the air beside it
      const roughly = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * this.g * Math.max(0, y - ground.at(x, z))))) / this.g
      for (let tries = 0; tries < 6 && !ground.onLand(x + vx * roughly, z + vz * roughly); tries++) { vx *= 0.6; vz *= 0.6 }
      this.vel.set([vx, vy, vz], i * 3)
      // the time it comes down: where its fall meets the ground, found on steps and then halved down
      const height = (t: number) => y + vy * t - 0.5 * this.g * t * t - ground.at(x + vx * t, z + vz * t)
      let t0 = 0, t1 = 0
      if (height(0) <= 0) t1 = 0
      else {
        for (let t = 0.05; t < 6; t += 0.05) { if (height(t) <= 0) { t1 = t; break } t0 = t }
        if (!t1) t1 = 6
        for (let s = 0; s < 12; s++) { const m = (t0 + t1) / 2; if (height(m) > 0) t0 = m; else t1 = m }
      }
      this.flight[i] = t1
      const lx = x + vx * t1, lz = z + vz * t1
      this.lies.set([lx, ground.at(lx, lz), lz], i * 3)
      // the lowest pieces go home first, so it builds up from its foot
      const rise = high > low ? (y - low) / (high - low) : 0
      this.delay[i] = (rise * 0.8 + random() * 0.2) * CRUMBLE.spread
    }
  }

  /** The moment the last piece is home. */
  get done() { return this.back + CRUMBLE.spread + CRUMBLE.fly }

  /**
   * Where each piece is at time `t` (three a blob into `out` from `o`), given where its blob stands now in the scene
   * (`homes`), so a thing that sways is built back where it has swayed to.
   */
  place(t: number, homes: Float32Array, out: Float32Array, o = 0) {
    const g = this.g, since = t - this.at
    for (let i = 0; i < this.count; i++) {
      const p = i * 3, q = o + p
      const go = t - this.back - this.delay[i]
      if (go > 0) {
        // flying home from where it lay, up over an arc
        const u = smooth(go / CRUMBLE.fly)
        const lift = Math.sin(Math.PI * Math.min(1, go / CRUMBLE.fly)) * this.arc
        out[q] = this.lies[p] + (homes[p] - this.lies[p]) * u
        out[q + 1] = this.lies[p + 1] + (homes[p + 1] - this.lies[p + 1]) * u + lift
        out[q + 2] = this.lies[p + 2] + (homes[p + 2] - this.lies[p + 2]) * u
      } else if (since < this.flight[i]) {
        const s = Math.max(0, since)
        out[q] = this.start[p] + this.vel[p] * s
        out[q + 1] = this.start[p + 1] + this.vel[p + 1] * s - 0.5 * g * s * s
        out[q + 2] = this.start[p + 2] + this.vel[p + 2] * s
      } else {
        out[q] = this.lies[p]; out[q + 1] = this.lies[p + 1]; out[q + 2] = this.lies[p + 2]
      }
    }
  }

  /** Where piece `i` lies once down, for tests. */
  lying(i: number): [number, number, number] { return [this.lies[i * 3], this.lies[i * 3 + 1], this.lies[i * 3 + 2]] }
}

/**
 * The pieces' own look: a copy of each blob as it stands when the thing breaks (its color and opacity, its size by its
 * bone's scale, its facing by its bone's turn), written into `into` from slot `from`. `keep` is every how-manyeth blob is
 * kept when a thing has more than there is room for, the kept ones grown to cover for the rest.
 */
export function copyPieces(cut: Cut, sk: Posed, blobs: ArrayLike<number>, into: Blobs, from: number, grow = 1) {
  const b = cut.blobs
  for (let k = 0; k < blobs.length; k++) {
    const i = blobs[k], s = from + k, j = cut.skin.joints[i * 4]
    const qa = [sk.quat[j * 4], sk.quat[j * 4 + 1], sk.quat[j * 4 + 2], sk.quat[j * 4 + 3]]
    const qb = [b.quat[i * 4], b.quat[i * 4 + 1], b.quat[i * 4 + 2], b.quat[i * 4 + 3]]
    // the bone's turn, then the blob's own
    into.quat[s * 4] = qa[3] * qb[0] + qa[0] * qb[3] + qa[1] * qb[2] - qa[2] * qb[1]
    into.quat[s * 4 + 1] = qa[3] * qb[1] - qa[0] * qb[2] + qa[1] * qb[3] + qa[2] * qb[0]
    into.quat[s * 4 + 2] = qa[3] * qb[2] + qa[0] * qb[1] - qa[1] * qb[0] + qa[2] * qb[3]
    into.quat[s * 4 + 3] = qa[3] * qb[3] - qa[0] * qb[0] - qa[1] * qb[1] - qa[2] * qb[2]
    const sc = sk.scale[j] * grow
    for (let a = 0; a < 3; a++) {
      into.scale[s * 3 + a] = b.scale[i * 3 + a] * sc
      into.color[s * 3 + a] = b.color[i * 3 + a]
    }
    into.opacity[s] = b.opacity[i]
  }
}

/** Which of a thing's blobs to keep when only `room` fit: an even spread, and how much to grow each to cover for the rest. */
export function thinned(blobs: Uint32Array, room: number): { blobs: Uint32Array; grow: number } {
  if (blobs.length <= room) return { blobs, grow: 1 }
  const out = new Uint32Array(room)
  for (let k = 0; k < room; k++) out[k] = blobs[Math.floor((k * blobs.length) / room)]
  // flat discs cover by area: grow each by the root of how many it stands for, but not into blotches
  return { blobs: out, grow: Math.min(1.8, Math.sqrt(blobs.length / room)) }
}

/** An empty pool of `count` pieces, all clear and tiny until a thing breaks into them. */
export function emptyPieces(count: number): Blobs {
  const b = new Blobs(count)
  for (let i = 0; i < count; i++) b.push({ center: [0, -50, 0], scale: [1e-4, 1e-4, 1e-4], quat: [0, 0, 0, 1], color: [0, 0, 0], opacity: 0 })
  return b
}
