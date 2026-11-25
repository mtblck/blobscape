import { Blobs, quatFacing, type Vec3 } from '../../splat-core/blobs.ts'
import { rng } from '../../splat-engine/body.ts'
import { Skeleton, axisAngle, emptySkin, mulQ, setWeights, type Bone, type Skin } from '../../splat-engine/rig.ts'

/**
 * A jellyfish nearly all of whose blobs are nearly clear: a moon jelly's bell (an outer and an inner skin, the gel
 * between them, radial canals, the ring canal round the margin and four horseshoe gonads seen through the top),
 * four frilled oral arms and a fringe of long thin tentacles. What you see of it is where light has passed through
 * many faint blobs at once, which is why its edges, folds and canals read and its middle stays glass.
 *
 * It is two actors on one skeleton: the body, and the lights (`Jelly.lights`): blobs along every canal, round the
 * margin and down every tentacle that give their own light, recolored each frame by `shineLights` so pulses of
 * light run out from the top of the bell with each beat and on down the tentacles.
 *
 * Everything is posed from the time alone (`poseJelly`), and repeats every `LOOP` seconds. Pure, for Node tests.
 */

/** Seconds before it all repeats. */
export const LOOP = 16
/** Beats of the bell a loop. */
export const BEATS = 6
/** Seconds a beat. */
export const BEAT = LOOP / BEATS

/** The bell's radius at the margin, and the height of its dome over the margin. */
export const BELL_R = 0.74
export const BELL_H = 0.44
/** How far round from the top the bell's skin runs (radians): a little past the margin, so it curls in. */
const BELL_A = 1.64
/** Bones round the margin that squeeze the bell in. */
export const RIM_BONES = 12
/** Chains of bones the tentacles hang on, and bones in each. */
export const CHAINS = 16
export const SEGMENTS = 10
/** How long the longest tentacle is. */
export const TENTACLE_LONG = 2.7
/** Tentacles drawn: each hangs between two chains, so there are more of them than chains. */
export const TENTACLES = 48
/** Oral arms, and bones in each. */
export const ARMS = 4
export const ARM_SEGMENTS = 8
export const ARM_LONG = 1.45
/** Radial canals in the bell. */
export const CANALS = 16

const TAU = Math.PI * 2
const UP: Vec3 = [0, 1, 0]

/** The bell's outer skin at `a` round from the top (0) toward the margin and `az` round the axis: point and outward normal. */
export function bellAt(a: number, az: number, inset = 0): { p: Vec3; n: Vec3 } {
  // the margin is scalloped into lappets between the tentacles' roots
  const lap = 1 - 0.035 * Math.max(0, (a - 1.3) / (BELL_A - 1.3)) * Math.abs(Math.sin((az * CHAINS) / 2))
  const rho = BELL_R * Math.sin(a) * lap, y = BELL_H * Math.cos(a)
  const nr = Math.sin(a) / BELL_R, ny = Math.cos(a) / BELL_H, l = Math.hypot(nr, ny)
  const n: Vec3 = [(nr / l) * Math.cos(az), ny / l, (nr / l) * Math.sin(az)]
  return { p: [rho * Math.cos(az) - n[0] * inset, y - n[1] * inset, rho * Math.sin(az) - n[2] * inset], n }
}

/** How thick the bell is at `a`: thick gel over the top, thin at the margin. */
export const thickness = (a: number) => 0.085 * Math.pow(Math.max(0, 1 - a / BELL_A), 1.3) + 0.007

/** Where a tentacle hanging from `az` is, `s` along it, at rest: down from the margin, flaring out a little first. */
export function tentacleAt(az: number, s: number): Vec3 {
  const m = bellAt(BELL_A - 0.04, az).p
  const out = 0.1 * Math.sin(Math.min(1, s / 0.7) * Math.PI / 2) - 0.03 * Math.max(0, s - 0.7)
  return [m[0] + Math.cos(az) * out, m[1] - s, m[2] + Math.sin(az) * out]
}

/** Where an oral arm hanging from `az` is, `s` along it, at rest: down from the mouth and out a little. */
export function armAt(az: number, s: number): Vec3 {
  const out = 0.035 + 0.1 * Math.sqrt(Math.min(1, s / ARM_LONG))
  return [Math.cos(az) * out, -0.03 - s, Math.sin(az) * out]
}

const chainAz = (c: number) => (TAU * (c + 0.5)) / CHAINS
const armAz = (k: number) => TAU * (k + 0.5) / ARMS
const tentAz = (j: number) => (TAU * (j + 0.5)) / TENTACLES
/** How long tentacle `j` is: each a little different, by a hash. */
export const tentacleLength = (j: number) => TENTACLE_LONG * (0.62 + 0.38 * frac(Math.sin(j * 12.9898 + 4.1) * 43758.5453))
const frac = (x: number) => x - Math.floor(x)

/** The skeleton: the bell's root, the margin's bones, the tentacles' chains and the oral arms. */
export function jellyBones(): Bone[] {
  const bones: Bone[] = [{ name: 'bell', parent: -1, head: [0, 0.12, 0], tail: [0, BELL_H, 0] }]
  for (let i = 0; i < RIM_BONES; i++) {
    const az = (TAU * i) / RIM_BONES
    bones.push({ name: `rim${i}`, parent: 0, head: bellAt(BELL_A - 0.06, az).p })
  }
  const seg = TENTACLE_LONG / SEGMENTS
  for (let c = 0; c < CHAINS; c++) {
    const az = chainAz(c)
    const rim = 1 + (Math.round((az / TAU) * RIM_BONES) % RIM_BONES)
    for (let k = 0; k < SEGMENTS; k++) bones.push({ name: `t${c}.${k}`, parent: k ? bones.length - 1 : rim, head: tentacleAt(az, k * seg), tail: tentacleAt(az, (k + 1) * seg) })
  }
  const aseg = ARM_LONG / ARM_SEGMENTS
  for (let k = 0; k < ARMS; k++) {
    const az = armAz(k)
    for (let i = 0; i < ARM_SEGMENTS; i++) bones.push({ name: `arm${k}.${i}`, parent: i ? bones.length - 1 : 0, head: armAt(az, i * aseg), tail: armAt(az, (i + 1) * aseg) })
  }
  return bones
}

const chainBone = (c: number, k: number) => 1 + RIM_BONES + ((c + CHAINS) % CHAINS) * SEGMENTS + Math.min(SEGMENTS - 1, k)
const armBone = (k: number, i: number) => 1 + RIM_BONES + CHAINS * SEGMENTS + k * ARM_SEGMENTS + Math.min(ARM_SEGMENTS - 1, i)

/** A blob on the bell: the root, and the margin's two nearest bones more the nearer the margin it lies. */
function bellWeights(a: number, az: number): [number, number][] {
  const rim = Math.max(0, Math.min(1, (a - 0.55) / (BELL_A - 0.55)))
  const w = rim * rim * (3 - 2 * rim)
  const u = ((az / TAU) * RIM_BONES + RIM_BONES) % RIM_BONES, i0 = Math.floor(u), f = u - i0
  return [[0, 1 - w], [1 + i0, w * (1 - f)], [1 + ((i0 + 1) % RIM_BONES), w * f]]
}

/** A blob on tentacle `j`, `s` along it: the two chains it hangs between, each at the two bones `s` lies between. */
function tentacleWeights(j: number, s: number): [number, number][] {
  const u = (tentAz(j) / TAU) * CHAINS - 0.5
  const c0 = Math.floor(u), f = u - c0
  const seg = TENTACLE_LONG / SEGMENTS
  const k = Math.floor(s / seg), g = s / seg - k
  return [[chainBone(c0, k), (1 - f) * (1 - g)], [chainBone(c0, k + 1), (1 - f) * g], [chainBone(c0 + 1, k), f * (1 - g)], [chainBone(c0 + 1, k + 1), f * g]]
}

function armWeights(k: number, s: number): [number, number][] {
  const seg = ARM_LONG / ARM_SEGMENTS
  const i = Math.floor(s / seg), g = s / seg - i
  if (s < seg * 0.5) return [[0, 1 - s / (seg * 0.5)], [armBone(k, 0), s / (seg * 0.5)]]
  return [[armBone(k, i), 1 - g], [armBone(k, i + 1), g]]
}

/** Where the light that runs out from the top with each beat has reached: its distance along its own path. */
export interface LightPath {
  /** How far along its path from the top of the bell each light blob is. */
  at: Float32Array
  /** Which tentacle a light blob is on (it lights only on some beats), or -1 on a canal or the margin. */
  on: Int16Array
  /** Each light blob's own color at full strength. */
  base: Float32Array
  /** Each light blob's hue for the rainbow, 0 to 1: its tentacle's, or its canal's place round the bell. */
  hue: Float32Array
}

/** A jellyfish's two actors and what the lights need. */
export interface Jelly {
  skeleton: Skeleton
  body: { blobs: Blobs; skin: Skin; skeleton: Skeleton; partOf: Uint16Array }
  lights: { blobs: Blobs; skin: Skin; skeleton: Skeleton; glow: Uint8Array }
  path: LightPath
  /** The body's own opacities, for `seeThrough`. */
  opacity: Float32Array
}

/** Parts, for the map of parts and for tests. */
export const PARTS = ['outer skin', 'inner skin', 'gel', 'canals', 'margin', 'gonads', 'oral arms', 'tentacles', 'mouth'] as const

/** The distance along a light path from the top of the bell to the margin. */
export const CANAL_LONG = BELL_R * 1.45

/**
 * Builds the jellyfish with about `count` blobs in its body. The same count and seed give the same jellyfish.
 */
export function makeJelly(count: number, seed = 5): Jelly {
  const rand = rng(seed)
  const skeleton = new Skeleton(jellyBones())
  const blobs = new Blobs(Math.ceil(count * 1.05))
  const weights: [number, number][][] = []
  const parts: number[] = []
  const add = (part: number, center: Vec3, scale: Vec3, quat: [number, number, number, number], color: Vec3, opacity: number, w: [number, number][]) => {
    blobs.push({ center, scale, quat, color, opacity })
    weights.push(w)
    parts.push(part)
  }
  const share = (s: number) => Math.max(200, Math.round(count * s))

  // the outer skin: the faintest of all, a cool pale blue that gathers into a rim where it is seen edge on
  const skin = (part: number, n: number, inset: (a: number) => number, color: (a: number, az: number) => Vec3, opacity: (a: number, az: number) => number) => {
    const area = TAU * BELL_R * BELL_H * 1.5
    const size = Math.sqrt(area / n) * 0.62
    for (let i = 0; i < n; i++) {
      // even over the dome's area: cos a is uniform in area for a sphere, near enough for this one
      const v = (i + rand()) / n
      const a = Math.acos(1 - v * (1 - Math.cos(BELL_A)))
      const az = TAU * frac(i * 0.6180339887 + rand() * 0.01)
      const { p, n: nn } = bellAt(a, az, inset(a))
      add(part, p, [size, size, size * 0.18], quatFacing(nn), color(a, az), opacity(a, az), bellWeights(a, az))
    }
  }
  skin(0, share(0.2), () => 0,
    (a) => mix3([0.78, 0.86, 1], [0.7, 0.72, 0.98], a / BELL_A),
    (a) => 0.035 + 0.04 * smooth(1.25, BELL_A, a))
  // the inner skin carries the swimming muscle in faint rings
  skin(1, share(0.15), thickness,
    (a) => mix3([0.86, 0.8, 1], [0.95, 0.82, 0.96], a / BELL_A),
    (a) => 0.028 + 0.035 * Math.pow(Math.abs(Math.sin(a * 46)), 6) * smooth(0.5, 1.0, a))

  // the gel between: round, very faint, so the bell has a body and not just two skins
  {
    const n = share(0.05)
    for (let i = 0; i < n; i++) {
      const a = Math.acos(1 - rand() * (1 - Math.cos(BELL_A - 0.1)))
      const az = TAU * rand()
      const t = thickness(a)
      const { p } = bellAt(a, az, t * (0.2 + 0.6 * rand()))
      const r = t * 0.55 + 0.008
      add(2, p, [r, r, r], [0, 0, 0, 1], [0.8, 0.88, 1], 0.01, bellWeights(a, az))
    }
  }

  // radial canals just under the inner skin, every other one forking toward the margin, and the ring canal round it
  {
    const n = share(0.05)
    const per = Math.floor(n / CANALS)
    for (let c = 0; c < CANALS; c++) {
      const az0 = (TAU * c) / CANALS
      const forks = c % 2 === 1
      for (let i = 0; i < per; i++) {
        const v = i / per
        const a = 0.08 + v * (BELL_A - 0.13)
        let az = az0
        if (forks && v > 0.55) az += (i % 2 ? 1 : -1) * 0.11 * smooth(0.55, 1, v)
        const { p, n: nn } = bellAt(a, az, thickness(a) + 0.003)
        const along = bellAt(a + 0.01, az).p, here = bellAt(a, az).p
        const tng = unit([along[0] - here[0], along[1] - here[1], along[2] - here[2]])
        const w = 0.0045 * (1.4 - 0.6 * v)
        add(3, p, [w, w * 0.7, (CANAL_LONG / per) * 1.6], facingAlong(tng, nn), [0.95, 0.86, 1], 0.32, bellWeights(a, az))
      }
    }
    const ring = share(0.012)
    for (let i = 0; i < ring; i++) {
      const az = (TAU * i) / ring
      const { p, n: nn } = bellAt(BELL_A - 0.05, az, 0.006)
      add(4, p, [0.006, 0.004, (TAU * BELL_R / ring) * 1.5], facingAlong([-Math.sin(az), 0, Math.cos(az)], nn), [1, 0.88, 0.95], 0.4, bellWeights(BELL_A - 0.05, az))
    }
    // a bulb at each tentacle's root
    for (let j = 0; j < TENTACLES; j++) {
      const p = tentacleAt(tentAz(j), 0.005)
      add(4, p, [0.012, 0.016, 0.012], [0, 0, 0, 1], [1, 0.72, 0.86], 0.45, tentacleWeights(j, 0.005))
    }
  }

  // four horseshoe gonads seen through the top of the bell, speckled
  {
    const n = share(0.08)
    for (let i = 0; i < n; i++) {
      const k = i % 4
      const az0 = TAU * k / 4 + Math.PI / 4
      const off = BELL_R * 0.28
      const cx = Math.cos(az0) * off, cz = Math.sin(az0) * off
      const top = BELL_H * Math.cos(Math.asin(off / BELL_R)) - 0.11
      // the horseshoe opens toward the bell's middle line between it and the next
      const th = az0 + Math.PI + 0.55 + rand() * (TAU - 1.1)
      const tube = 0.026 * Math.sqrt(rand())
      const ph = TAU * rand()
      const ring = BELL_R * 0.16
      const p: Vec3 = [cx + Math.cos(th) * (ring + tube * Math.cos(ph)), top + tube * Math.sin(ph) - 0.012 * Math.cos(th - az0), cz + Math.sin(th) * (ring + tube * Math.cos(ph))]
      const speck = rand() < 0.12
      const r = speck ? 0.0055 : 0.011
      const a = Math.asin(Math.min(1, Math.hypot(p[0], p[2]) / BELL_R))
      add(5, p, [r, r, r], [0, 0, 0, 1], speck ? [1, 0.82, 0.62] : [1, 0.5, 0.7], speck ? 0.6 : 0.14, bellWeights(a, Math.atan2(p[2], p[0])))
    }
  }

  // the mouth: a short faint cross under the middle, where the arms begin
  {
    const n = share(0.012)
    for (let i = 0; i < n; i++) {
      const az = TAU * rand(), r = 0.05 * Math.sqrt(rand())
      add(8, [Math.cos(az) * r, -0.02 - 0.03 * rand(), Math.sin(az) * r], [0.012, 0.012, 0.012], [0, 0, 0, 1], [0.95, 0.8, 0.95], 0.06, [[0, 1]])
    }
  }

  // oral arms: long frilled curtains, folded, their edges ruffled and densest
  {
    const n = share(0.19)
    const per = Math.floor(n / ARMS)
    for (let k = 0; k < ARMS; k++) {
      const az = armAz(k)
      const side: Vec3 = [-Math.sin(az), 0, Math.cos(az)], out: Vec3 = [Math.cos(az), 0, Math.sin(az)]
      for (let i = 0; i < per; i++) {
        const s = ARM_LONG * Math.pow(rand(), 0.85)
        const u = rand() * 2 - 1
        // more blobs along the frilled edges
        const uu = Math.sign(u) * Math.pow(Math.abs(u), 0.6)
        const width = 0.085 * (1 - 0.55 * (s / ARM_LONG)) * (0.6 + 0.4 * Math.sin(Math.min(1, s / 0.15) * Math.PI / 2))
        const c = armAt(az, s)
        const fold = 0.03 * Math.sin(uu * 7 + s * 9 + k) * Math.abs(uu) + 0.018 * Math.sin(s * 23 + k * 2) * uu * uu
        const p: Vec3 = [c[0] + side[0] * uu * width + out[0] * fold, c[1], c[2] + side[2] * uu * width + out[2] * fold]
        const edge = Math.abs(uu) > 0.88
        const size = edge ? 0.007 : 0.012
        const normal = unit([out[0] + side[0] * Math.cos(uu * 7 + s * 9) * 0.6, 0.1, out[2] + side[2] * Math.cos(uu * 7 + s * 9) * 0.6])
        const pink = 0.5 + 0.5 * Math.sin(s * 5 + k)
        add(6, p, [size, size, size * 0.25], quatFacing(normal), edge ? mix3([1, 0.8, 0.9], [1, 0.62, 0.8], pink) : [0.92, 0.88, 0.98], edge ? 0.3 : 0.06 * (1 - 0.5 * s / ARM_LONG), armWeights(k, s))
      }
    }
  }

  // tentacles: a thin core and a faint sheath round it, long blobs laid along it
  {
    const n = share(0.24)
    let total = 0
    for (let j = 0; j < TENTACLES; j++) total += tentacleLength(j)
    const ds = total / (n / 2)
    for (let j = 0; j < TENTACLES; j++) {
      const az = tentAz(j), len = tentacleLength(j)
      for (let s = 0.01; s < len; s += ds) {
        const p = tentacleAt(az, s), q = tentacleAt(az, s + 0.01)
        const tng = unit([q[0] - p[0], q[1] - p[1], q[2] - p[2]])
        const v = s / len
        const w = 0.0055 * (1 - 0.7 * v)
        const look = facingAlong(tng, [Math.cos(az), 0, Math.sin(az)])
        // nematocysts: the core is beaded
        const bead = 0.75 + 0.25 * Math.pow(Math.abs(Math.sin(s * 90 + j)), 4)
        add(7, p, [w * bead, w * bead, ds * 0.75], look, mix3([0.98, 0.8, 0.95], [0.72, 0.8, 1], v), 0.26 * (1 - 0.45 * v), tentacleWeights(j, s))
        add(7, p, [w * 3.2, w * 3.2, ds * 0.9], look, [0.78, 0.86, 1], 0.045 * (1 - 0.5 * v), tentacleWeights(j, s))
      }
    }
  }

  const skinOut = emptySkin(blobs.count)
  weights.forEach((w, i) => setWeights(skinOut, i, w))
  const partOf = Uint16Array.from(parts)
  const body = { blobs, skin: skinOut, skeleton, partOf }

  // the lights: down the canals, round the margin, down every tentacle
  const lb = new Blobs(4096)
  const lw: [number, number][][] = []
  const at: number[] = [], on: number[] = [], base: number[] = [], hue: number[] = []
  const light = (p: Vec3, r: number, w: [number, number][], d: number, tentacle: number, color: Vec3, h: number) => {
    lb.push({ center: p, scale: [r, r, r], quat: [0, 0, 0, 1], color, opacity: 0 })
    lw.push(w); at.push(d); on.push(tentacle); base.push(...color); hue.push(h)
  }
  for (let c = 0; c < CANALS; c++) {
    const az = (TAU * c) / CANALS
    const steps = 46
    for (let i = 0; i < steps; i++) {
      const v = (i + 0.5) / steps, a = 0.08 + v * (BELL_A - 0.13)
      light(bellAt(a, az, thickness(a) + 0.004).p, 0.011, bellWeights(a, az), v * CANAL_LONG, -1, [0.55, 0.85, 1], az / TAU)
    }
  }
  for (let i = 0; i < 160; i++) {
    const az = (TAU * i) / 160
    light(bellAt(BELL_A - 0.05, az, 0.006).p, 0.009, bellWeights(BELL_A - 0.05, az), CANAL_LONG + 0.02, -1, [0.6, 0.8, 1], az / TAU)
  }
  for (let j = 0; j < TENTACLES; j++) {
    const az = tentAz(j), len = tentacleLength(j)
    for (let s = 0.02; s < len; s += 0.018) light(tentacleAt(az, s), 0.012 * (1 - 0.45 * s / len), tentacleWeights(j, s), CANAL_LONG + s, j, [0.4, 1, 0.95], tentAz(j) / TAU)
  }
  const lskin = emptySkin(lb.count)
  lw.forEach((w, i) => setWeights(lskin, i, w))
  const lights = { blobs: lb, skin: lskin, skeleton, glow: new Uint8Array(lb.count).fill(255) }
  return { skeleton, body, lights, path: { at: Float32Array.from(at), on: Int16Array.from(on), base: Float32Array.from(base), hue: Float32Array.from(hue) }, opacity: blobs.opacity.slice(0, blobs.count) }
}

/** How contracted the bell is at `t` (0 open to 1 squeezed): a quick squeeze, then a slow opening. */
export function squeezeAt(t: number) {
  const u = frac(t / BEAT)
  return u < 0.28 ? smooth(0, 1, u / 0.28) : 1 - smooth(0, 1, (u - 0.28) / 0.72)
}

/** How far the jellyfish has risen over its rest height at `t`: up with each squeeze, sinking back as it opens, so it loops. */
export function riseAt(t: number) {
  const u = frac(t / BEAT)
  return 0.07 * (u < 0.32 ? smooth(0, 1, u / 0.32) : 1 - smooth(0, 1, (u - 0.32) / 0.68)) - 0.035
}

/** Poses the jellyfish for `t` seconds: the bell beats, the whole turns slowly once a loop, tentacles and arms trail in waves. */
export function poseJelly(sk: Skeleton, t: number, turn = true) {
  sk.reset()
  const s = squeezeAt(t)
  const loop = (TAU * t) / LOOP
  // a slow turn, and a lean that wanders and comes back
  const spin = turn ? axisAngle(UP, -loop) : ([0, 0, 0, 1] as [number, number, number, number])
  const lean = mulQ(axisAngle([1, 0, 0], 0.09 * Math.sin(loop * 2)), axisAngle([0, 0, 1], 0.07 * Math.sin(loop * 3 + 1)))
  sk.setRotation(0, mulQ(lean, spin))
  sk.offset[1] = riseAt(t)
  for (let i = 0; i < RIM_BONES; i++) {
    const az = (TAU * i) / RIM_BONES
    const b = 1 + i
    sk.offset[b * 3] = -Math.cos(az) * 0.2 * BELL_R * s
    sk.offset[b * 3 + 1] = 0.045 * s
    sk.offset[b * 3 + 2] = -Math.sin(az) * 0.2 * BELL_R * s
    sk.setRotation(b, axisAngle([-Math.sin(az), 0, Math.cos(az)], 0.35 * s))
  }
  const beat = (TAU * t) / BEAT
  for (let c = 0; c < CHAINS; c++) {
    const az = chainAz(c)
    const tangent: Vec3 = [-Math.sin(az), 0, Math.cos(az)], radial: Vec3 = [Math.cos(az), 0, Math.sin(az)]
    for (let k = 0; k < SEGMENTS; k++) {
      const b = chainBone(c, k)
      // each beat sends a wave down; slower drifts sideways come and go over the loop
      const swing = 0.11 * Math.sin(beat - k * 0.62 + c * 0.4) * (0.4 + 0.06 * k) - (k === 0 ? 0.25 * s : 0)
      const sway = 0.07 * Math.sin(loop * 3 - k * 0.45 + c * 1.7) + 0.04 * Math.sin(loop * 5 - k * 0.8 + c)
      sk.setRotation(b, mulQ(axisAngle(tangent, swing), axisAngle(radial, sway)))
    }
  }
  for (let k = 0; k < ARMS; k++) {
    const az = armAz(k)
    const tangent: Vec3 = [-Math.sin(az), 0, Math.cos(az)], radial: Vec3 = [Math.cos(az), 0, Math.sin(az)]
    for (let i = 0; i < ARM_SEGMENTS; i++) {
      const swing = 0.08 * Math.sin(beat - i * 0.5 + k) * (0.5 + 0.08 * i)
      const sway = 0.09 * Math.sin(loop * 2 - i * 0.4 + k * 2.1)
      sk.setRotation(armBone(k, i), mulQ(axisAngle(tangent, swing), axisAngle(radial, sway)))
    }
  }
  sk.update()
}

/** Light colors a visitor can pick, at full strength: the front of a pulse, and its tail. */
export const LIGHT_COLORS = {
  cyan: { front: [0.45, 1, 0.95] as Vec3, tail: [0.35, 0.45, 1] as Vec3 },
  violet: { front: [0.85, 0.6, 1] as Vec3, tail: [0.45, 0.25, 1] as Vec3 },
  amber: { front: [1, 0.85, 0.45] as Vec3, tail: [1, 0.4, 0.25] as Vec3 },
}
export type LightColor = keyof typeof LIGHT_COLORS | 'rainbow'

/**
 * A strand's color in the rainbow: its own hue at full strength in the tail, paler toward a pulse's front, so each
 * tentacle keeps its color and the front still reads as the brightest part.
 */
export function rainbowAt(hue: number, front: number): Vec3 {
  const h = frac(hue) * 6
  const k = (n: number) => { const x = (n + h) % 6; return 1 - Math.max(0, Math.min(1, Math.min(x, 4 - x))) }
  const c: Vec3 = [k(5), k(3), k(1)]
  return mix3(c, [0.5 + c[0] * 0.5, 0.5 + c[1] * 0.5, 0.5 + c[2] * 0.5], front * 0.6)
}

/** How fast a pulse runs along its path, and how long the light it leaves behind lasts (as a distance). */
export const PULSE_SPEED = 1.05
const TAIL = 0.32
const FRONT = 0.035
/** How bright a light is between pulses. */
const IDLE = 0.03

/** Whether tentacle `j` carries the pulse of beat `b`: a little over half of them, a different half each beat. */
export const carries = (j: number, b: number) => frac(Math.sin(j * 78.233 + b * 37.719) * 43758.5453) < 0.55

/**
 * How bright the light at distance `d` along its path is at `t`, with `j` its tentacle (-1 for a canal or the
 * margin): each beat starts a pulse at the top of the bell as the squeeze begins, which runs down every canal and
 * on down the tentacles that carry it. Beats past the loop's end wrap round, so it loops.
 */
export function pulseAt(d: number, j: number, t: number): { power: number; front: number } {
  let power = 0, front = 0
  for (let b = 0; b < BEATS; b++) {
    if (j >= 0 && !carries(j, b)) continue
    const since = ((t - b * BEAT) % LOOP + LOOP) % LOOP
    const head = since * PULSE_SPEED
    const behind = head - d
    let p = 0
    if (behind >= 0) p = Math.exp(-behind / TAIL) * (0.35 + 0.65 * Math.exp(-behind / (TAIL * 0.25)))
    else p = Math.exp(-((behind / FRONT) ** 2))
    // a pulse dims as it goes, so the tips are fainter than the canals
    p *= 1 / (1 + 0.25 * d)
    power += p
    front = Math.max(front, p * Math.exp(-Math.max(0, behind) / (TAIL * 0.3)))
  }
  return { power: Math.min(1.5, power), front: Math.min(1, front) }
}

/** Recolors the lights for `t`: each light's color by how bright it is there and how near a pulse's front, in `color`. */
export function shineLights(jelly: Jelly, t: number, color: LightColor | 'off') {
  const { blobs } = jelly.lights
  const { at, on } = jelly.path
  const pal = color === 'off' || color === 'rainbow' ? undefined : LIGHT_COLORS[color]
  for (let i = 0; i < blobs.count; i++) {
    if (color === 'off') { blobs.opacity[i] = 0; continue }
    const { power, front } = pulseAt(at[i], on[i], t)
    const p = IDLE + power
    const c = pal ? mix3(pal.tail, pal.front, front) : rainbowAt(jelly.path.hue[i], front)
    const k = Math.min(1, p)
    blobs.color[i * 3] = c[0] * k
    blobs.color[i * 3 + 1] = c[1] * k
    blobs.color[i * 3 + 2] = c[2] * k
    blobs.opacity[i] = Math.min(1, 1.3 * p)
  }
}

/** How bright the bell's own glow is at `t`, for a light inside it: high as each pulse leaves the top. */
export function innerGlowAt(t: number) {
  let g = 0
  for (let b = 0; b < BEATS; b++) {
    const since = ((t - b * BEAT) % LOOP + LOOP) % LOOP
    g += Math.exp(-since / 0.7) * smooth(0, 0.12, since)
  }
  return g
}

/**
 * Sets how see-through the body is: 1 as built; less is clearer, more is milkier. A blob's opacity o becomes
 * 1 − (1 − o)^k, which is what stacking k of it would let through, so the faint skins and the dense canals change
 * by the same rule.
 */
export function seeThrough(jelly: Jelly, k: number) {
  const o = jelly.body.blobs.opacity
  for (let i = 0; i < jelly.opacity.length; i++) o[i] = 1 - Math.pow(1 - jelly.opacity[i], k)
}

function smooth(a: number, b: number, x: number) {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return u * u * (3 - 2 * u)
}
function mix3(a: Vec3, b: Vec3, t: number): Vec3 {
  const u = Math.min(1, Math.max(0, t))
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
}
function unit(v: Vec3): Vec3 { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }

/** A rotation whose z axis lies along `along` and whose x axis is as near `side` as that allows: for a long blob laid along a line. */
function facingAlong(along: Vec3, side: Vec3): [number, number, number, number] {
  const z = unit(along)
  const d = side[0] * z[0] + side[1] * z[1] + side[2] * z[2]
  let x = unit([side[0] - z[0] * d, side[1] - z[1] * d, side[2] - z[2] * d])
  if (!Number.isFinite(x[0]) || Math.hypot(...x) < 0.5) x = unit(Math.abs(z[0]) < 0.9 ? [1 - z[0] * z[0], -z[0] * z[1], -z[0] * z[2]] : [-z[1] * z[0], 1 - z[1] * z[1], -z[1] * z[2]])
  const y: Vec3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]]
  // rotation matrix columns x, y, z to a quaternion
  const m00 = x[0], m11 = y[1], m22 = z[2]
  const tr = m00 + m11 + m22
  let q: [number, number, number, number]
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2
    q = [(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, 0.25 * s]
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2
    q = [0.25 * s, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s]
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2
    q = [(y[0] + x[1]) / s, 0.25 * s, (z[1] + y[2]) / s, (z[0] - x[2]) / s]
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2
    q = [(z[0] + x[2]) / s, (z[1] + y[2]) / s, 0.25 * s, (x[1] - y[0]) / s]
  }
  return q
}
export { facingAlong }

/** Stars far off, faint colored clouds behind them and dust drifting near: the space it floats in, one still actor. */
export function makeSpace(seed = 11, stars = 2600, motes = 360) {
  const rand = rng(seed)
  const bones: Bone[] = [{ name: 'sky', parent: -1, head: [0, 0, 0] }]
  for (let i = 0; i < 6; i++) bones.push({ name: `~dust${i}`, parent: 0, head: [0, 0, 0] })
  const skeleton = new Skeleton(bones)
  const blobs = new Blobs(stars + motes + 80)
  const w: number[] = [], glow: number[] = []
  const sphere = (): Vec3 => { const z = rand() * 2 - 1, a = TAU * rand(), r = Math.sqrt(1 - z * z); return [r * Math.cos(a), z, r * Math.sin(a)] }
  // clouds of faint color far behind
  for (let i = 0; i < 70; i++) {
    const d = sphere(), r = 5 + 7 * rand()
    const hue = rand()
    const c: Vec3 = hue < 0.45 ? [0.35, 0.2, 0.6] : hue < 0.8 ? [0.12, 0.3, 0.55] : [0.5, 0.18, 0.4]
    blobs.push({ center: [d[0] * 52, d[1] * 52, d[2] * 52], scale: [r, r * (0.4 + 0.6 * rand()), r], quat: [rand() - 0.5, rand() - 0.5, rand() - 0.5, 1], color: c, opacity: 0.05 + 0.05 * rand() })
    w.push(0); glow.push(0)
  }
  for (let i = 0; i < stars; i++) {
    const d = sphere(), r = 0.035 + 0.05 * Math.pow(rand(), 6)
    const temp = rand()
    const c: Vec3 = temp < 0.2 ? [0.75, 0.82, 1] : temp < 0.85 ? [1, 0.98, 0.94] : [1, 0.82, 0.6]
    const b = 0.35 + 0.65 * Math.pow(rand(), 3)
    blobs.push({ center: [d[0] * 40, d[1] * 40, d[2] * 40], scale: [r, r, r], quat: [0, 0, 0, 1], color: [c[0] * b, c[1] * b, c[2] * b], opacity: 1 })
    w.push(0); glow.push(255)
  }
  for (let i = 0; i < motes; i++) {
    const d = sphere(), dist = 1.2 + 3.5 * Math.cbrt(rand())
    const r = 0.004 + 0.004 * rand()
    blobs.push({ center: [d[0] * dist, d[1] * dist * 0.8 - 0.4, d[2] * dist], scale: [r, r, r], quat: [0, 0, 0, 1], color: [0.75, 0.8, 0.95], opacity: 0.5 })
    w.push(1 + (i % 6)); glow.push(120)
  }
  const skin = emptySkin(blobs.count)
  w.forEach((b, i) => setWeights(skin, i, [[b, 1]]))
  return { blobs, skin, skeleton, glow: Uint8Array.from(glow) }
}

/** Dust drifts slowly through the view, each cloud of it round a loop of its own. */
export function poseSpace(sk: Skeleton, t: number) {
  const loop = (TAU * t) / LOOP
  for (let i = 1; i < sk.count; i++) {
    sk.offset[i * 3] = 0.25 * Math.sin(loop + i * 1.3)
    sk.offset[i * 3 + 1] = 0.35 * Math.sin(loop * (1 + (i % 2)) + i)
    sk.offset[i * 3 + 2] = 0.25 * Math.cos(loop + i * 2.1)
  }
  sk.update()
}
