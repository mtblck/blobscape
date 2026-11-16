import { Blobs, quatFacing } from '../../splat-core/blobs.ts'
import { groundNormal, plantFeet, type Ground, type Leg } from '../../splat-engine/ik.ts'
import { worldQuat } from '../../splat-engine/posing.ts'
import { posedPoint, rotate, type Skeleton } from '../../splat-engine/rig.ts'
import { clearCloak } from '../../splat-engine/zoo/elf.ts'

/**
 * Feet on the ground (the lesson): the elf's walk, made on flat ground, laid
 * over steps, a slope or rocks with `plantFeet`, and measured: how far each
 * foot is from where it should be, whether a leg came up short, and how far a
 * sole is off the slope under it. Pure, so the lesson's goals are tested in Node.
 */

export type GroundKind = 'flat' | 'steps' | 'slope' | 'rocks'

export interface GroundSpec {
  kind: GroundKind
  /** Steps and rocks: how tall, in meters. Slope: how steep, in degrees. */
  height: number
  /** Where the elf stands along the ground, in meters: slides the steps and rocks under it. */
  at: number
}

/** How deep each step is, front to back: about half a stride, so a walk keeps one foot on each. */
export const STEP_DEPTH = 0.32

/** The elf's two legs, hip to ankle. Knees point forward (+z) if a leg is ever dead straight. */
export const ELF_LEGS: Leg[] = ['l', 'r'].map((s) => ({ upper: `${s}Thigh`, lower: `${s}Shin`, foot: `${s}Foot`, pole: [0, 0, 1] }))

/** The ground's height under (x, z), with 0 under the middle of the elf (the origin), so it always starts standing on it. */
export function groundOf(spec: GroundSpec): Ground {
  const raw = rawGround(spec)
  const zero = raw(0, 0)
  return (x, z) => raw(x, z) - zero
}

function rawGround({ kind, height, at }: GroundSpec): Ground {
  switch (kind) {
    case 'flat': return () => 0
    // uphill ahead (+z), one flat tread after another
    case 'steps': return (_x, z) => height * Math.floor((z + at) / STEP_DEPTH + 0.5)
    case 'slope': { const k = Math.tan((height * Math.PI) / 180); return (_x, z) => k * (z + at) }
    // a few smooth lumps, different under each foot
    case 'rocks': return (x, z) => {
      const u = z + at
      return height * 0.5 * (Math.sin(x * 9.1 + 0.7) * Math.cos(u * 5.3) + 0.6 * Math.sin(u * 11.7 + x * 4.1 + 1.9))
    }
  }
}

/** The ground's way up at (x, z), as `plantFeet` reads it (level beside a step's edge). */
export const normalOf = (g: Ground, x: number, z: number) => groundNormal(g, x, z)

/**
 * The ground as blobs: flat discs on a grid, lying on the surface, shaded by
 * how much they face up, and on steps a darker riser at each edge so the
 * steps read. Alternate treads are a shade apart.
 */
export function groundBlobs(spec: GroundSpec, { width = 2.2, depth = 3.2, spacing = 0.05 } = {}): Blobs {
  const g = groundOf(spec)
  const out = new Blobs(4096)
  const nx = Math.round(width / spacing), nz = Math.round(depth / spacing)
  const r = spacing * 0.62
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      const x = -width / 2 + i * spacing, z = -depth / 2 + j * spacing
      const y = g(x, z)
      const n = normalOf(g, x, z)
      const tread = spec.kind === 'steps' ? Math.floor((z + spec.at) / STEP_DEPTH + 0.5) : Math.floor((x + 10) / 0.4) + Math.floor((z + spec.at + 10) / 0.4)
      const base = (tread & 1) ? 0.42 : 0.48
      const k = base * (0.65 + 0.35 * n[1])
      // fade out toward the edges, so the ground has no hard border
      const edge = Math.min(1, (width / 2 - Math.abs(x)) / 0.3, (depth / 2 - Math.abs(z)) / 0.4)
      out.push({ center: [x, y, z], scale: [r, r, spacing * 0.06], quat: quatFacing(n), color: [k * 0.95, k, k * 0.9], opacity: Math.max(0, edge) * 0.97 })
    }
  }
  if (spec.kind === 'steps' && spec.height > 0.005) {
    // a riser at each tread's front edge
    for (let e = -20; e <= 20; e++) {
      const z = (e - 0.5) * STEP_DEPTH - spec.at
      if (z < -depth / 2 || z > depth / 2) continue
      const lo = g(-1, z - 0.001), hi = g(-1, z + 0.001)
      const rows = Math.max(1, Math.round(Math.abs(hi - lo) / spacing))
      for (let i = 0; i <= nx; i++) {
        const x = -width / 2 + i * spacing
        const edge = Math.min(1, (width / 2 - Math.abs(x)) / 0.3, (depth / 2 - Math.abs(z)) / 0.4)
        for (let k = 0; k < rows; k++) {
          const y = lo + ((k + 0.5) / rows) * (hi - lo)
          out.push({ center: [x, y, z], scale: [r, Math.abs(hi - lo) / rows * 0.62, spacing * 0.06], quat: [0, 0, 0, 1], color: [0.26, 0.27, 0.25], opacity: Math.max(0, edge) * 0.97 })
        }
      }
    }
  }
  return out
}

export interface FeetOptions {
  /** Bend the legs to the ground at all. */
  ik: boolean
  /** Move the hips so the lower foot can reach. */
  hips: boolean
  /** Turn each foot to the slope under it. */
  tilt: boolean
}

export interface Standing {
  /** The foot furthest from where it should be: below 0 sunk into the ground, above 0 floating over it, in meters. */
  worst: number
  /** How deep the lowest foot is in the ground (0 when none is), in meters. */
  sunk: number
  /** The most any leg came up short of its target, in meters. */
  short: number
  /** The most any sole is off the ground's slope under it, in degrees. */
  tilt: number
  /** How much higher one foot's ground is than the other's, in meters. */
  spread: number
  /** How far the hips moved. */
  hipShift: number
}

/**
 * Lays the pose in `sk` (made for flat ground) over the ground, as the options
 * say, and measures the result. Leaves the skeleton posed and updated.
 */
export function stand(sk: Skeleton, spec: GroundSpec, opts: FeetOptions): Standing {
  const g = groundOf(spec)
  sk.update()
  const ids = ELF_LEGS.map((l) => ({ lower: sk.index(l.lower), foot: sk.index(l.foot!) }))
  // where the walk put each ankle and which way each sole faced, on flat ground
  const flat = ids.map(({ lower, foot }) => posedPoint(sk, lower, sk.bones[foot].head))
  const soles = ids.map(({ foot }) => rotate(worldQuat(sk, foot), [0, 1, 0]))
  const under = flat.map((p) => g(p[0], p[2]))
  let hipShift = 0, short = 0
  if (opts.ik) {
    const p = plantFeet(sk, ELF_LEGS, g, { hips: opts.hips, tilt: opts.tilt })
    hipShift = p.hipShift
    short = Math.max(...p.legs.map((l) => l.miss))
    clearCloak(sk)
  }
  let worst = 0, tilt = 0, sunk = 0
  ids.forEach(({ lower, foot }, i) => {
    const now = posedPoint(sk, lower, sk.bones[foot].head)
    // it should be as high over its own ground as the walk had it over flat ground
    const off = now[1] - flat[i][1] - under[i]
    if (Math.abs(off) > Math.abs(worst)) worst = off
    sunk = Math.max(sunk, -off)
    // its sole should be turned from the walk's by the slope under it
    const n = normalOf(g, flat[i][0], flat[i][2])
    const want = turnUp(soles[i], n)
    const up = rotate(worldQuat(sk, foot), [0, 1, 0])
    const c = Math.max(-1, Math.min(1, up[0] * want[0] + up[1] * want[1] + up[2] * want[2]))
    tilt = Math.max(tilt, (Math.acos(c) * 180) / Math.PI)
  })
  return { worst, sunk, short, tilt, spread: Math.max(...under) - Math.min(...under), hipShift }
}

/** `v` turned by the turn that takes straight up to `n`. */
function turnUp(v: ArrayLike<number>, n: ArrayLike<number>): number[] {
  // Rodrigues about y × n
  const ax = [n[2], 0, -n[0]]
  const s = Math.hypot(ax[0], ax[2]), c = n[1]
  if (s < 1e-9) return [v[0], v[1], v[2]]
  const k = [ax[0] / s, 0, ax[2] / s]
  const kv = k[0] * v[0] + k[2] * v[2]
  const cross = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]]
  return [0, 1, 2].map((i) => v[i] * c + cross[i] * s + k[i] * kv * (1 - c))
}
