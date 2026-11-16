import { Blobs, type Vec3 } from '../splat-core/blobs.ts'
import type { Built } from './body.ts'
import { applyMorphs, shares, targetFrom, type Morph } from './morph.ts'
import { neighborPairs, stretch } from './pose.ts'
import { buildVoxels, cone, ellipsoid, sphere, type VoxelPart } from './voxel.ts'

/**
 * A pufferfish for the Morphs lesson, with three morphs (morph.ts) and no
 * moving bones:
 *
 * - puff: the body swells from an egg into a ball. Run backward it goes thin.
 * - spikes: every spike grows from a nub to its full length, many times over.
 * - tail: the tail swings round to one side. A morph is a straight line, so
 *   with one target the tail takes the short cut and shrinks on the way;
 *   in-between targets (`TAIL_STEPS`) carry it round.
 *
 * The eyes, mouth, fins and spikes ride on the body: a morph of the body
 * shifts each as a whole from where it is fixed, and does not stretch it.
 */
const C: Vec3 = [0, 1, 0]
/** The body at rest, and puffed: radii along x (nose to tail), y and z. */
const BODY: Vec3 = [0.6, 0.46, 0.46]
const PUFFED: Vec3 = [0.8, 0.78, 0.78]
/** A spike is built at full length, then kept as a nub this share of it. */
const NUB = 0.14
const SPIKE = 0.26
/** Where the tail turns, and how far. */
const TAIL_ROOT: Vec3 = [-0.52, 1, 0]
export const TAIL_TURN = (115 * Math.PI) / 180
/** The choices of shapes for the tail's swing, counting the last. */
export const TAIL_STEPS = [1, 2, 4] as const

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const unit = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
/** The point of the body's skin in a direction from its middle. */
const onBody = (d: Vec3): Vec3 => { const k = 1 / Math.hypot(d[0] / BODY[0], d[1] / BODY[1], d[2] / BODY[2]); return [C[0] + d[0] * k, C[1] + d[1] * k, C[2] + d[2] * k] }
/** A cheap 3D hash in 0..1, for the spots. */
const hash = (x: number, y: number, z: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s) }

interface Spike { base: Vec3; axis: Vec3 }

/** Spikes spread evenly round the body, leaving the face, the tail and the fins clear. */
function spikes(): Spike[] {
  const out: Spike[] = []
  const n = 64, golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - ((i + 0.5) / n) * 2, r = Math.sqrt(1 - y * y), a = i * golden
    const d: Vec3 = [Math.cos(a) * r, y, Math.sin(a) * r]
    if (d[0] > 0.62 || d[0] < -0.8 || (Math.abs(d[2]) > 0.8 && Math.abs(d[1]) < 0.35 && d[0] > -0.2)) continue
    const base = onBody(d)
    const q = sub(base, C)
    out.push({ base, axis: unit([q[0] / BODY[0] ** 2, q[1] / BODY[1] ** 2, q[2] / BODY[2] ** 2]) })
  }
  return out
}

export interface Puffer {
  body: Built
  puff: Morph
  spikes: Morph
  /** The tail's swing with 1, 2 and 4 targets (pick one). */
  tails: Morph[]
  /** Neighboring blobs on the body's flank, for measuring how far a puff pulls them apart. */
  flankPairs: Uint32Array
  /** The blobs at the tail's tip. */
  tip: number[]
}

export function makePuffer(spacing = 0.028): Puffer {
  const all = spikes()
  // what rides on the body, and the point of the skin each is fixed at
  const riders: { part: VoxelPart; at: Vec3 }[] = []
  const ride = (at: Vec3, shape: VoxelPart['shape'], color: VoxelPart['color']) => riders.push({ part: { shape, color, bone: 'on' }, at })
  for (const side of [-1, 1]) {
    const eye = onBody([0.62, 0.42, side * 0.5]), out = unit(sub(eye, C))
    ride(eye, sphere(eye, 0.095), (_p, n) => { const f = n[0] * out[0] + n[1] * out[1] + n[2] * out[2]; return f > 0.84 ? [0.06, 0.06, 0.1] : f > 0.3 ? [0.98, 0.98, 0.95] : [0.85, 0.6, 0.2] })
    const fin = onBody([0.15, -0.1, side])
    ride(fin, ellipsoid([fin[0] - 0.05, fin[1], fin[2] + side * 0.08], [0.15, 0.1, 0.1]), [0.95, 0.6, 0.22])
  }
  const lips = onBody([1, -0.06, 0])
  ride(lips, ellipsoid(lips, [0.06, 0.07, 0.11]), [0.88, 0.45, 0.4])
  const top = onBody([-0.25, 1, 0])
  ride(top, ellipsoid([top[0], top[1] + 0.05, 0], [0.16, 0.12, 0.05]), [0.95, 0.6, 0.22])
  const firstSpike = 1 + riders.length
  for (const s of all) {
    const tip: Vec3 = [s.base[0] + s.axis[0] * SPIKE, s.base[1] + s.axis[1] * SPIKE, s.base[2] + s.axis[2] * SPIKE]
    ride(s.base, cone([s.base[0] - s.axis[0] * 0.03, s.base[1] - s.axis[1] * 0.03, s.base[2] - s.axis[2] * 0.03], tip, 0.055, 0.012), [0.99, 0.95, 0.82])
  }
  const firstTail = 1 + riders.length
  const built = buildVoxels({
    spacing,
    light: { dir: [0.3, 0.7, 0.65], ambient: 0.55, shadow: 0.3 },
    // one bone each for the body, what rides on it and the tail, so no part hides another's blobs
    bones: [{ name: 'body', parent: -1, head: [0, 0, 0] }, { name: 'on', parent: 0, head: [0, 0, 0] }, { name: 'tail', parent: 0, head: [0, 0, 0] }],
    parts: [
      {
        shape: ellipsoid(C, BODY), bone: 'body',
        // sandy on top with brown spots, pale underneath
        color: (p, n) => {
          const cell = 0.11, gx = Math.round(p[0] / cell), gy = Math.round(p[1] / cell), gz = Math.round(p[2] / cell)
          const spot = n[1] > -0.1 && hash(gx, gy, gz) > 0.62 && Math.hypot(p[0] - gx * cell, p[1] - gy * cell, p[2] - gz * cell) < 0.042
          const back: Vec3 = spot ? [0.5, 0.32, 0.12] : [0.96, 0.74, 0.28]
          const t = Math.min(1, Math.max(0, (n[1] + 0.45) / 0.5))
          return [0.99 + (back[0] - 0.99) * t, 0.95 + (back[1] - 0.95) * t, 0.86 + (back[2] - 0.86) * t]
        },
      },
      ...riders.map((r) => r.part),
      { shape: cone([-0.45, 1, 0], [-0.82, 1, 0], 0.17, 0.07), bone: 'tail', color: [0.96, 0.74, 0.28] },
      { shape: ellipsoid([-0.98, 1, 0], [0.2, 0.27, 0.05]), bone: 'tail', color: [0.95, 0.6, 0.22] },
    ],
  })
  const partOf = built.partOf
  const riderOf = (i: number) => (partOf[i] >= 1 && partOf[i] < firstTail ? riders[partOf[i] - 1] : undefined)
  const spikeOf = (i: number) => (partOf[i] >= firstSpike && partOf[i] < firstTail ? all[partOf[i] - firstSpike] : undefined)
  const isTail = (i: number) => partOf[i] >= firstTail

  // the spikes are cut at full length and kept as nubs: the rest shape is the cut with every spike pulled in
  const along = (p: Vec3, s: Spike, k: number): Vec3 => { const q = sub(p, s.base), h = (q[0] * s.axis[0] + q[1] * s.axis[1] + q[2] * s.axis[2]) * (k - 1); return [p[0] + s.axis[0] * h, p[1] + s.axis[1] * h, p[2] + s.axis[2] * h] }
  const rest = built.blobs.clone()
  applyMorphs(built.blobs, [{ name: 'nubs', targets: [targetFrom(built.blobs, (p, i) => { const s = spikeOf(i); return s ? along(p, s, NUB) : null })] }], [1], rest)
  const body: Built = { ...built, blobs: rest }

  const swell = (p: Vec3): Vec3 => [C[0] + ((p[0] - C[0]) * PUFFED[0]) / BODY[0], C[1] + ((p[1] - C[1]) * PUFFED[1]) / BODY[1], C[2] + ((p[2] - C[2]) * PUFFED[2]) / BODY[2]]
  const tailShift = sub(swell(TAIL_ROOT), TAIL_ROOT)
  const puff: Morph = {
    name: 'puff',
    targets: [targetFrom(rest, (p, i) => {
      if (partOf[i] === 0) return swell(p)
      // a rider keeps its shape and goes where its patch of skin goes
      const d = isTail(i) ? tailShift : sub(swell(riderOf(i)!.at), riderOf(i)!.at)
      return [p[0] + d[0], p[1] + d[1], p[2] + d[2]]
    })],
  }
  const grow: Morph = { name: 'spikes', targets: [targetFrom(rest, (p, i) => { const s = spikeOf(i); return s ? along(p, s, 1 / NUB) : null })] }
  const swing = (p: Vec3, a: number): Vec3 => {
    const x = p[0] - TAIL_ROOT[0], z = p[2] - TAIL_ROOT[2], c = Math.cos(a), s = Math.sin(a)
    return [TAIL_ROOT[0] + c * x + s * z, p[1], TAIL_ROOT[2] - s * x + c * z]
  }
  const tails = TAIL_STEPS.map((steps): Morph => ({
    name: 'tail',
    targets: Array.from({ length: steps }, (_, k) => targetFrom(rest, (p, i) => (isTail(i) ? swing(p, (TAIL_TURN * (k + 1)) / steps) : null))),
  }))

  const flank = onBody([0.1, 0.5, 1])
  const flankPairs = neighborPairs(rest, (i) => partOf[i] === 0 && Math.hypot(rest.center[i * 3] - flank[0], rest.center[i * 3 + 1] - flank[1], rest.center[i * 3 + 2] - flank[2]) < 0.16)
  const tip: number[] = []
  for (let i = 0; i < rest.count; i++) if (isTail(i) && rest.center[i * 3] < -1.05) tip.push(i)
  return { body, puff, spikes: grow, tails, flankPairs, tip }
}

/** How far apart a pose has pulled the blobs of the flank: 1 is as built, 2 is twice the spacing. */
export function flankSpread(fish: Puffer, posed: Blobs) {
  return stretch(fish.flankPairs, fish.body.blobs, posed, 0.9)
}

/** How many times its built length a spike is with the spikes morph at `w`. */
export function spikeLength(w: number) {
  return Math.max(0, 1 + w * (1 / NUB - 1))
}

/**
 * How long the tail is with its swing at `w`, as a share of its real length
 * (root to tip): 1 all the way round. A tail moving in a straight line between
 * two shapes cuts the corner, and is shorter in the middle.
 */
export function tailLength(fish: Puffer, tail: Morph, w: number) {
  const [a, b, u] = shares(tail.targets.length, w)
  const rest = fish.body.blobs.center
  let sum = 0
  for (const i of fish.tip) {
    const p = [0, 1, 2].map((k) => rest[i * 3 + k] + (a >= 0 ? tail.targets[a].delta[i * 3 + k] * (1 - u) : 0) + tail.targets[b].delta[i * 3 + k] * u)
    sum += Math.hypot(p[0] - TAIL_ROOT[0], p[1] - TAIL_ROOT[1], p[2] - TAIL_ROOT[2]) / Math.hypot(rest[i * 3] - TAIL_ROOT[0], rest[i * 3 + 1] - TAIL_ROOT[1], rest[i * 3 + 2] - TAIL_ROOT[2])
  }
  return fish.tip.length ? sum / fish.tip.length : 1
}

/** The shortest the tail gets anywhere on its way round. */
export function shortestTail(fish: Puffer, tail: Morph) {
  let least = 1
  for (let k = 0; k <= 32; k++) least = Math.min(least, tailLength(fish, tail, k / 32))
  return least
}
