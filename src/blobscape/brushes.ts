import type { Blob, Vec3 } from '../splat-core/blobs.ts'
import { quatFromAxes } from '../splat-engine/fur.ts'
import { grow } from '../splat-engine/grow.ts'

/**
 * The sandbox's brushes (issue #210), pure and tested: each paints with blobs onto whatever is under the pointer and
 * lays out its strands or shapes by its own rule. Grass is bent blades of a few blobs each, fur is one long thin blob
 * a strand lying along the stroke (the engine's fur.ts idea), moss is low soft clumps, stones are lumps of a few
 * blobs half sunk in the surface, and leaves are sprigs grown by the engine's grower (grow.ts) with leaves at the tips.
 */

export type BrushId = 'grass' | 'fur' | 'moss' | 'stones' | 'leaves'

export const BRUSHES: { id: BrushId; name: string; note: string; color: Vec3 }[] = [
  { id: 'grass', name: 'Grass', note: 'Blades that stand up from the surface and bend.', color: [0.33, 0.6, 0.2] },
  { id: 'fur', name: 'Fur', note: 'Strands that lie the way you drag.', color: [0.62, 0.4, 0.22] },
  { id: 'moss', name: 'Moss', note: 'Low soft clumps that hug the surface.', color: [0.36, 0.5, 0.16] },
  { id: 'stones', name: 'Stones', note: 'Lumps half sunk in the surface, no two alike.', color: [0.52, 0.5, 0.47] },
  { id: 'leaves', name: 'Leaves', note: 'Sprigs that branch, with leaves at the tips.', color: [0.25, 0.55, 0.22] },
]

/** The small blobs that make a stone's shape, round its body. */
export const LUMPS = 6

export interface Dab {
  /** Where the brush touches, and the way the surface faces there (unit). */
  p: Vec3
  n: Vec3
  /** The ring's radius on the surface. */
  radius: number
  /** How big a thing is: a blade's or strand's length, about three stones, a sprig's height over two. */
  size: number
  /** How many things a dab lays, as the sandbox's Density (1 to 30). */
  density: number
  /** The brush's main color; left out, its own (`BRUSHES`). */
  color?: Vec3
  /** The way the stroke is going, for fur to lie along. Left out, fur hangs down the surface. */
  along?: Vec3
  seed: number
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
const shade = (c: Vec3, k: number): Vec3 => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]

function rng(seed: number) {
  let s = (Math.floor(seed) * 2654435761) >>> 0 || 1
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
}

/** Two unit directions across a surface that faces `n`. */
function across(n: Vec3): [Vec3, Vec3] {
  const u = unit(cross(Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], n))
  return [u, cross(n, u)]
}

/** A blob stretched from `a` to `b`: `wide` and `thin` are its other two sizes, the thin one along `flatTo` as nearly as it can be. */
function stick(a: Vec3, b: Vec3, wide: number, thin: number, flatTo: Vec3, color: Vec3, opacity: number): Blob {
  const y = unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]])
  let x = cross(y, flatTo)
  if (Math.hypot(x[0], x[1], x[2]) < 1e-4) x = cross(y, Math.abs(y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])
  x = unit(x)
  const z = cross(x, y)
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  // A blob shows to about twice its size either way, so half the length and a bit joins it to the next
  return { center: mix(a, b, 0.5), scale: [wide, Math.max(wide, len * 0.36), thin], quat: quatFromAxes(x, y, z), color, opacity }
}

/** A flat or squashed round blob facing `n`. */
function disc(center: Vec3, n: Vec3, r: number, thick: number, color: Vec3, opacity: number, long = 1, turn = 0): Blob {
  const [u, v] = across(n)
  const c = Math.cos(turn), s = Math.sin(turn)
  const x: Vec3 = [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s]
  return { center, scale: [r * long, r, thick], quat: quatFromAxes(x, cross(n, x), n), color, opacity }
}

/** The blobs one dab of a brush lays. The same dab always lays the same blobs. */
export function brushDab(kind: BrushId, d: Dab): Blob[] {
  const rand = rng(d.seed)
  const base = d.color ?? BRUSHES.find((b) => b.id === kind)!.color
  const [u, v] = across(d.n)
  const up: Vec3 = [0, 1, 0]
  /** A point in the ring, even over its area. */
  const spot = (): Vec3 => {
    const r = d.radius * Math.sqrt(rand()), a = rand() * Math.PI * 2
    return [d.p[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, d.p[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r, d.p[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r]
  }
  /** A unit direction across the surface, any way round. */
  const sideways = (): Vec3 => { const a = rand() * Math.PI * 2; return [u[0] * Math.cos(a) + v[0] * Math.sin(a), u[1] * Math.cos(a) + v[1] * Math.sin(a), u[2] * Math.cos(a) + v[2] * Math.sin(a)] }
  const out: Blob[] = []

  if (kind === 'grass') {
    // Blades grow out of the surface and turn toward the sky, each bending over to one side toward its tip
    const grows = unit(add(d.n, up, 0.8))
    for (let k = 0; k < d.density * 2; k++) {
      const root = spot(), side = sideways()
      const len = d.size * (0.55 + rand() * 0.7), bend = 0.25 + rand() * 0.6, wide = len * (0.035 + rand() * 0.02)
      const tint = shade(base, 0.8 + rand() * 0.45)
      const PARTS = 3
      let from = root
      for (let i = 0; i < PARTS; i++) {
        // further up, the blade leans further over
        const lean = bend * ((i + 0.5) / PARTS) ** 1.5
        const dir = unit(add(grows, side, lean * 1.6))
        const to = add(from, dir, len / PARTS)
        const t = (i + 0.5) / PARTS
        out.push(stick(from, to, wide * (1 - t * 0.6), wide * 0.3, side, shade(tint, 0.6 + t * 0.6), 0.95))
        from = to
      }
    }
  } else if (kind === 'fur') {
    // One long thin blob a strand, lifted a little off the skin and lying along the stroke (or hanging down the surface)
    let flow: Vec3 = d.along ? add(d.along, d.n, -dot(d.along, d.n)) : add([0, -1, 0], d.n, d.n[1])
    if (Math.hypot(flow[0], flow[1], flow[2]) < 1e-3) flow = u
    flow = unit(flow)
    const sideOf = cross(d.n, flow)
    for (let k = 0; k < d.density * 5; k++) {
      const root = spot()
      const wild = (rand() - 0.5) * 0.7, lift = 0.25 + rand() * 0.35
      const lies = unit(add(flow, sideOf, Math.tan(wild)))
      const dir = unit(add(lies, d.n, Math.tan(lift)))
      const len = d.size * (0.6 + rand() * 0.6)
      out.push(stick(root, add(root, dir, len), len * 0.035, len * 0.035, d.n, shade(base, 0.7 + rand() * 0.55), 0.9))
    }
  } else if (kind === 'moss') {
    // Cushions: soft squashed blobs sitting on the surface, a few pale tips among them
    for (let k = 0; k < d.density * 6; k++) {
      const at = spot()
      const r = d.size * (0.05 + rand() * 0.06)
      const pale = rand() < 0.2
      const tint = pale ? shade(mix(base, [0.75, 0.8, 0.3], 0.5), 1.1) : shade(base, 0.65 + rand() * 0.5)
      out.push(disc(add(at, d.n, r * (pale ? 0.75 : 0.35)), d.n, pale ? r * 0.45 : r, pale ? r * 0.4 : r * 0.5, tint, 0.92, 1 + rand() * 0.4, rand() * Math.PI))
    }
  } else if (kind === 'stones') {
    // Each stone is a few blobs that overlap into one lump, wider than tall, sunk a third into the surface
    const count = Math.max(1, Math.round(d.density / 4))
    const placed: { at: Vec3; r: number }[] = []
    for (let k = 0; k < count; k++) {
      const r = d.size * (0.12 + rand() * 0.22)
      let at = spot()
      // look for room beside the stones already laid
      for (let tries = 0; tries < 8 && placed.some((s) => Math.hypot(s.at[0] - at[0], s.at[1] - at[1], s.at[2] - at[2]) < (s.r + r) * 0.9); tries++) at = spot()
      placed.push({ at, r })
      const tint = shade(mix(base, [0.5, 0.42, 0.34], rand() * 0.5), 0.7 + rand() * 0.5)
      const turn = rand() * Math.PI, long = 1 + rand() * 0.5
      const mid = add(at, d.n, r * 0.25)
      out.push(disc(mid, d.n, r * 0.42, r * 0.3, tint, 1, long, turn))
      for (let i = 0; i < LUMPS; i++) {
        const off = sideways(), far = r * (0.2 + rand() * 0.3), high = r * (rand() * 0.45 - 0.05)
        const lump = r * (0.2 + rand() * 0.1)
        // lit from above: higher lumps are paler
        out.push(disc(add(add(mid, off, far), d.n, high), unit(add(d.n, off, 0.5)), lump, lump * 0.75, shade(tint, 0.85 + (high / r) * 0.6), 1, 1 + rand() * 0.3, rand() * Math.PI))
      }
    }
  } else {
    // Sprigs from the engine's grower, stood on the surface: thin twigs, and a few leaves round every tip
    const count = Math.max(1, Math.round(d.density / 6))
    const bark = mix(shade(base, 0.5), [0.36, 0.24, 0.14], 0.7)
    for (let k = 0; k < count; k++) {
      const root = spot(), turn = rand() * Math.PI * 2
      const height = d.size * (1.4 + rand() * 1.2)
      const { twigs, tips } = grow({ style: 'tree', at: [0, 0, 0], seed: 1 + Math.floor(rand() * 1e6), size: height * 0.45, r: height * 0.018, depth: 2, branches: 2 })
      // the grower's own up is +y: stand it along the surface's facing, turned any way round
      const x: Vec3 = [u[0] * Math.cos(turn) + v[0] * Math.sin(turn), u[1] * Math.cos(turn) + v[1] * Math.sin(turn), u[2] * Math.cos(turn) + v[2] * Math.sin(turn)]
      const z = cross(x, d.n)
      const place = (q: Vec3): Vec3 => [root[0] + x[0] * q[0] + d.n[0] * q[1] + z[0] * q[2], root[1] + x[1] * q[0] + d.n[1] * q[1] + z[1] * q[2], root[2] + x[2] * q[0] + d.n[2] * q[1] + z[2] * q[2]]
      for (const t of twigs) out.push(stick(place(t.from), place(t.to), Math.max(t.r, height * 0.008), Math.max(t.r, height * 0.008), d.n, bark, 1))
      for (const tip of tips) {
        const at = place(tip)
        for (let i = 0; i < 3; i++) {
          const way = unit(add(add(sideways(), d.n, 0.3 + rand() * 0.8), up, 0.2))
          const r = height * (0.06 + rand() * 0.04)
          const faces = unit(add(cross(way, sideways()), d.n, 0.6))
          const leaf = stick(at, add(at, way, r * 2.6), r * 0.5, r * 0.08, faces, shade(base, 0.7 + rand() * 0.6), 0.95)
          out.push(leaf)
        }
      }
    }
  }
  return out
}
