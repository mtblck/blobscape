import { Blobs, quatFacing, type Vec3 } from '../splat-core/blobs.ts'
import { Skeleton, emptySkin, type Bone, type Skin } from './rig.ts'

/**
 * Small procedural models for the rig lessons: each is a tube of flat surface
 * blobs lying along +x, plus the bones that move it. They're built so the
 * interesting joint sits at x = 0 and the blobs' weights can be rewritten
 * cheaply from a lesson's sliders (see `weightByX`).
 */
export interface RigModel {
  blobs: Blobs
  skin: Skin
  skeleton: Skeleton
}

interface TubeOptions {
  from: number
  to: number
  /** Radius across y and z at a point along the tube (z may be wider, for a flat hand). */
  radius: (x: number) => [ry: number, rz: number]
  /** Height of the tube's axis. */
  y: number
  count: number
  color: (x: number, angle: number, n: Vec3) => Vec3
  seed?: number
}

const r2 = (i: number): [number, number] => [(0.5 + i * 0.7548776662466927) % 1, (0.5 + i * 0.5698402909980532) % 1]

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}

const LIGHT: Vec3 = (() => { const l = [-0.4, 0.8, 0.45]; const n = Math.hypot(...l); return [l[0] / n, l[1] / n, l[2] / n] })()

/**
 * Flat blobs over an elliptical tube from x = from to x = to, closed by round
 * ends. Blobs are spread evenly by surface area and lit from above, so the
 * shape reads without any real lighting.
 */
export function tube(o: TubeOptions, into = new Blobs(o.count + 8)): Blobs {
  const rand = rng(o.seed ?? 3)
  const len = o.to - o.from
  // area weights: side strips along the length, plus the two end caps
  const [ra0, rz0] = o.radius(o.from), [ra1, rz1] = o.radius(o.to)
  const capA = Math.PI * ra0 * rz0 * 2, capB = Math.PI * ra1 * rz1 * 2
  let side = 0
  for (let k = 0; k < 64; k++) { const [a, b] = o.radius(o.from + ((k + 0.5) / 64) * len); side += Math.PI * (a + b) * (len / 64) }
  const total = side + capA + capB
  const size = Math.sqrt(total / o.count) * 0.8
  for (let i = 0; i < o.count; i++) {
    const [u, v] = r2(i)
    const ang = v * Math.PI * 2
    let p: Vec3, n: Vec3, x: number
    const pick = u * total
    if (pick < capA || pick > total - capB) {
      // a half-ellipsoid cap: h runs from the rim (0) to the pole (1)
      const atA = pick < capA
      const h = atA ? pick / capA : (total - pick) / capB
      const [ry, rz] = atA ? [ra0, rz0] : [ra1, rz1]
      const rim = Math.sqrt(Math.max(0, 1 - h * h))
      const reach = Math.min(ry, rz) * h
      x = atA ? o.from - reach : o.to + reach
      p = [x, o.y + Math.cos(ang) * ry * rim, Math.sin(ang) * rz * rim]
      n = norm([(atA ? -1 : 1) * h, Math.cos(ang) * rim / ry, Math.sin(ang) * rim / rz])
    } else {
      x = o.from + ((pick - capA) / side) * len
      const [ry, rz] = o.radius(x)
      p = [x, o.y + Math.cos(ang) * ry, Math.sin(ang) * rz]
      n = norm([0, Math.cos(ang) / ry, Math.sin(ang) / rz])
    }
    const base = o.color(x, ang, n)
    const lit = 0.62 + 0.38 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2])
    const k = lit * (0.94 + rand() * 0.12)
    const j = 0.8 + rand() * 0.4
    into.push({
      center: p,
      scale: [size * j, size * j * (0.75 + rand() * 0.5), size * 0.22],
      quat: quatFacing(n),
      color: [Math.min(1, base[0] * k), Math.min(1, base[1] * k), Math.min(1, base[2] * k)],
      opacity: 0.94,
    })
  }
  return into
}

/**
 * Two-bone weights from a blob's rest x: 0 means it follows bone 0 only, 1
 * bone 1 only. `center` is where the switch happens and `width` how far it is
 * spread (0 is a hard cut). A smoothstep, so the blend has no corners.
 */
export function blendAt(x: number, center: number, width: number) {
  if (width <= 1e-4) return x >= center ? 1 : 0
  const t = Math.min(1, Math.max(0, (x - (center - width / 2)) / width))
  return t * t * (3 - 2 * t)
}

/** Rewrites every blob's weights between bones 0 and 1 by its rest x. */
export function weightByX(m: RigModel, center: number, width: number) {
  const { blobs, skin } = m
  for (let i = 0; i < blobs.count; i++) {
    const w = blendAt(blobs.center[i * 3], center, width)
    skin.joints[i * 4] = 0; skin.joints[i * 4 + 1] = 1; skin.joints[i * 4 + 2] = 0; skin.joints[i * 4 + 3] = 0
    skin.weights[i * 4] = 1 - w; skin.weights[i * 4 + 1] = w; skin.weights[i * 4 + 2] = 0; skin.weights[i * 4 + 3] = 0
  }
}

function twoBones(names: [string, string], y: number, back: number): Skeleton {
  const bones: Bone[] = [
    { name: names[0], parent: -1, head: [back, y, 0] },
    { name: names[1], parent: 0, head: [0, y, 0] },
  ]
  return new Skeleton(bones)
}

const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/**
 * A caterpillar lying on the floor along x, head at +x, with a body bone from
 * its tail and a second bone from its middle (x = 0) to its head.
 */
export function caterpillar(count = 2600): RigModel {
  const R = 0.2
  const GREEN: Vec3 = [0.42, 0.72, 0.24], DARK: Vec3 = [0.2, 0.42, 0.14], BELLY: Vec3 = [0.84, 0.88, 0.5], RED: Vec3 = [0.86, 0.3, 0.2]
  const seg = (x: number) => 0.5 + 0.5 * Math.cos(((x + 1.25) / 0.25) * Math.PI * 2)
  const blobs = tube({
    from: -1.15, to: 1.0, y: R, count,
    radius: (x) => {
      const r = R * (0.86 + 0.14 * seg(x)) * (x > 0.75 ? 1.05 : 1) * (x < -0.9 ? 0.85 + (x + 1.15) * 0.6 : 1)
      return [r, r * 1.05]
    },
    color: (x, _a, n) => {
      if (x > 0.82) {
        // the head: red, with two dark eyes facing forward
        const eye = n[0] > 0.55 && Math.abs(Math.abs(n[2]) - 0.42) < 0.17 && n[1] > 0.05
        return eye ? [0.08, 0.06, 0.05] : RED
      }
      if (n[1] < -0.45) return BELLY
      return mix(GREEN, DARK, seg(x) < 0.12 ? 1 : 0)
    },
  })
  const skin = emptySkin(blobs.count)
  const skeleton = twoBones(['body', 'front'], R, -1.15)
  const m = { blobs, skin, skeleton }
  weightByX(m, 0, 0)
  return m
}

/**
 * An arm along x: upper arm from the shoulder (x = −1.2) to the elbow (x = 0),
 * forearm to a rounded fist at x ≈ 1.2. Stripes round the sleeve make bending
 * and stretching easy to see.
 */
export function arm(count = 3200): RigModel {
  const SLEEVE: Vec3 = [0.27, 0.5, 0.86], STRIPE: Vec3 = [0.95, 0.85, 0.35], SKIN: Vec3 = [0.93, 0.7, 0.55]
  const blobs = tube({
    from: -1.2, to: 1.15, y: 0.9, count,
    radius: (x) => {
      const r = x < 0 ? 0.24 - 0.03 * ((x + 1.2) / 1.2) : x < 0.85 ? 0.21 - 0.04 * (x / 0.85) : 0.2
      return [r, r]
    },
    color: (x) => (x > 0.85 ? SKIN : Math.abs(((x + 1.3) / 0.2) % 2) < 1 ? SLEEVE : STRIPE),
  })
  const skin = emptySkin(blobs.count)
  const skeleton = twoBones(['upper', 'fore'], 0.9, -1.2)
  const m = { blobs, skin, skeleton }
  weightByX(m, 0, 0)
  return m
}

/**
 * A forearm and a flat hand along x, wrist at x = 0, to twist. A stripe runs
 * along the top of the arm and the back of the hand, so a half turn shows.
 */
export function wrist(count = 3200): RigModel {
  const SLEEVE: Vec3 = [0.78, 0.36, 0.3], LINE: Vec3 = [0.98, 0.92, 0.72], SKIN: Vec3 = [0.93, 0.7, 0.55], PALM: Vec3 = [0.98, 0.83, 0.72]
  const blobs = tube({
    from: -1.25, to: 0.75, y: 0.9, count,
    radius: (x) => {
      if (x < -0.05) return [0.2, 0.2]
      // the hand widens in z and flattens in y
      const t = Math.min(1, (x + 0.05) / 0.3)
      return [0.2 - 0.1 * t, 0.2 + 0.12 * t]
    },
    color: (x, ang, n) => {
      if (x < -0.05) return Math.abs(Math.sin(ang)) < 0.28 && n[1] > 0 ? LINE : SLEEVE
      return n[1] > 0.3 ? (Math.abs(n[2]) < 0.25 ? LINE : SKIN) : PALM
    },
  })
  const skin = emptySkin(blobs.count)
  const skeleton = twoBones(['forearm', 'hand'], 0.9, -1.25)
  const m = { blobs, skin, skeleton }
  weightByX(m, 0, 0.5)
  return m
}

function norm(a: Vec3): Vec3 { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
