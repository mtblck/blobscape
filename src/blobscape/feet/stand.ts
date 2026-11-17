import { Blobs, quatFacing, type Quat, type Vec3 } from '../../splat-core/blobs.ts'
import { groundNormal, hipDrop, plantFeet, setWorldQuat, twoBoneIK, type Ground, type Leg } from '../../splat-engine/ik.ts'
import { fromTo, worldQuat } from '../../splat-engine/posing.ts'
import { mulQ, posedPoint, rotate, Skeleton } from '../../splat-engine/rig.ts'
import { ELF_BONES, clearCloak, elfWalk } from '../../splat-engine/zoo/elf.ts'

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
  /** How far the ground has slid back under the elf, in meters: walking moves it on, standing sets it. */
  at: number
}

/**
 * How the elf walks on each ground. A casual walk on the flat: long steps, heel down first and off the toes. Slower,
 * shorter and flat-footed up steps; shorter again over stones, each foot lifted high. `step` is one step's length (on
 * steps, a tread's depth, so each foot lands on the tread after next); `period` the seconds for a stride of two steps;
 * `stance` the share of it a foot is down (over half, so one always is); `lift` how high a foot clears the highest ground
 * it passes; `heel` and `toe` how far (radians) the foot rolls at heel strike and toe-off.
 */
export interface Gait { step: number; period: number; stance: number; lift: number; heel: number; toe: number }
export const GAITS: Record<GroundKind, Gait> = {
  flat: { step: 0.4, period: 1.05, stance: 0.6, lift: 0.07, heel: 0.3, toe: 0.55 },
  slope: { step: 0.34, period: 1.15, stance: 0.62, lift: 0.07, heel: 0.15, toe: 0.45 },
  steps: { step: 0.32, period: 1.3, stance: 0.62, lift: 0.05, heel: 0, toe: 0.25 },
  rocks: { step: 0.28, period: 1.3, stance: 0.62, lift: 0.11, heel: 0.12, toe: 0.3 },
}
/** How deep each step is, front to back: one step of the stair gait. */
export const STEP_DEPTH = GAITS.steps.step
/** How fast the ground slides back under a gait: two steps a stride, so a planted foot moves with the ground. */
export const speedOf = (g: Gait) => (2 * g.step) / g.period
/** The walk clip's own stride in seconds: each gait plays it at its own pace. */
const CLIP = 1.1
/** The ankle's height over the sole, and where the sole runs from and to along the foot (from the ankle, meters). */
export const ANKLE = 0.09
const SOLE = [-0.05, 0.03, 0.12, 0.2]
/** Where the heel and the ball of the foot are from the ankle: what a foot rolls about. */
const HEEL: Vec3 = [0, -ANKLE, -0.05], BALL: Vec3 = [0, -ANKLE, 0.12]

/** The elf's two legs, hip to ankle. Knees point forward (+z) if a leg is ever dead straight. */
export const ELF_LEGS: Leg[] = ['l', 'r'].map((s) => ({ upper: `${s}Thigh`, lower: `${s}Shin`, foot: `${s}Foot`, pole: [0, 0, 1] }))
const SIDE_X = [0.11, -0.11]

/**
 * The ground's height under (x, z), near 0 under the elf. As it slides back it also sinks, one step's height for each
 * step's depth (and a slope by its own rise), like an escalator, so the elf climbs without going anywhere.
 */
export function groundOf(spec: GroundSpec): Ground {
  const raw = rawGround(spec)
  const drop = sinking(spec)
  return (x, z) => raw(x, z + spec.at) - drop
}

/** How far the ground has sunk for having slid `at` back. */
function sinking({ kind, height, at }: GroundSpec) {
  if (kind === 'steps') return (height * at) / STEP_DEPTH
  if (kind === 'slope') return Math.tan((height * Math.PI) / 180) * at
  return 0
}

/** The ground in its own frame: u runs along it. */
function rawGround({ kind, height }: GroundSpec): (x: number, u: number) => number {
  switch (kind) {
    case 'flat': return () => 0
    // uphill ahead (+z), one flat tread after another
    case 'steps': return (_x, u) => height * Math.floor(u / STEP_DEPTH + 0.5)
    case 'slope': { const k = Math.tan((height * Math.PI) / 180); return (_x, u) => k * u }
    // rounded stones bedded in the path, one at most to each cell of a grid
    case 'rocks': return (x, u) => {
      let top = 0
      const i0 = Math.floor(x / ROCK_CELL), j0 = Math.floor(u / ROCK_CELL)
      for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) {
        const r = rockAt(i, j)
        if (!r) continue
        const d = Math.hypot((x - r.x) / r.rx, (u - r.u) / r.ru)
        if (d < 1) top = Math.max(top, height * r.h * Math.sqrt(1 - d * d) ** 0.8)
      }
      return top
    }
  }
}

const ROCK_CELL = 0.3
const hash = (i: number, j: number, k: number) => {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
/** The stone in grid cell (i, j), if it has one: where, how wide each way, and its height as a share of the slider's. */
function rockAt(i: number, j: number) {
  if (hash(i, j, 1) < 0.5) return null
  return {
    x: (i + 0.25 + 0.5 * hash(i, j, 2)) * ROCK_CELL, u: (j + 0.25 + 0.5 * hash(i, j, 3)) * ROCK_CELL,
    rx: 0.1 + 0.07 * hash(i, j, 4), ru: 0.1 + 0.07 * hash(i, j, 5), h: 0.55 + 0.45 * hash(i, j, 6),
  }
}

/** The ground's way up at (x, z), as `plantFeet` reads it (level beside a step's edge). */
export const normalOf = (g: Ground, x: number, z: number) => groundNormal(g, x, z)

/** The highest ground under a level sole whose ankle is over (x, z): what a foot there stands on. */
export const underFoot = (g: Ground, x: number, z: number) => Math.max(...SOLE.map((o) => g(x, z + o)))

/** The highest ground under a sole anywhere from ankle z0 to ankle z1. */
const along = (g: Ground, x: number, z0: number, z1: number) => {
  let top = -Infinity
  for (let z = z0 + SOLE[0]; z <= z1 + SOLE[SOLE.length - 1] + 1e-9; z += 0.02) top = Math.max(top, g(x, z))
  return top
}

const smooth = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t) }

/** Which leg lands first in the clip's stride, and when: found once from the clip, so the arms swing with the planned feet. */
let landing: number[] | undefined
function landings(): number[] {
  if (landing) return landing
  const sk = new Skeleton(ELF_BONES.map((b) => ({ ...b })))
  const best = [-Infinity, -Infinity], when = [0, 0]
  for (let k = 0; k < 220; k++) {
    const t = (k / 220) * CLIP
    elfWalk(sk, t)
    ELF_LEGS.forEach((l, i) => {
      const z = posedPoint(sk, sk.index(l.lower), sk.bones[sk.index(l.foot!)].head)[2]
      if (z > best[i]) { best[i] = z; when[i] = t / CLIP }
    })
  }
  return (landing = when)
}

/** Where a planted ankle lands, ahead of the hips, at the start of its time down: the time down is centered under them. */
const landAt = (g: Gait) => g.step * g.stance

/** How far the ground has slid after walking t seconds on this kind of ground: placed so every sole lands mid-tread. */
export function slidAt(kind: GroundKind, t: number): number {
  const g = GAITS[kind], first = landings()[0]
  const mid = (SOLE[0] + SOLE[SOLE.length - 1]) / 2
  // the left sole lands (at time first × period) centered on tread 0
  return speedOf(g) * (t - first * g.period) - landAt(g) - mid
}

export interface Footing {
  /** Where the ankle is over the ground, in the elf's frame (x, z), and its height when planted (sole on the ground). */
  x: number
  z: number
  /** The planted height for its ground, or for flat ground. */
  y: number
  /** Whether it is down. */
  down: boolean
  /** The ground the foot stands on or is passing over (the highest under its sole). */
  ground: number
  /** How far the foot is rolled about the heel (below 0, toes up) or the ball (above 0, heel up), in radians. */
  roll: number
}

/** How far the ankle moves along the walk when the foot rolls by `roll` about its heel or ball, which stay put. */
export function rollShift(roll: number): number {
  const P = roll < 0 ? HEEL : BALL
  return P[2] - (P[1] * Math.sin(roll) + P[2] * Math.cos(roll))
}

/**
 * Where each foot is at time t of a walk over moving ground (`spec.at` is where the ground has slid to): down, it rides
 * back with the ground, landing heel first and rolling off its toes; up, it swings to where it lands next, rising early
 * enough to clear every step between and settling on its new tread. With `flat`, the same steps as if the ground were
 * flat (the walk as it was made).
 */
export function footings(spec: GroundSpec, t: number, flat = false): Footing[] {
  const gait = GAITS[spec.kind], speed = speedOf(gait), { period, stance, lift, heel, toe } = gait
  const g = groundOf(spec)
  const land = landAt(gait)
  return landings().map((l0, i) => {
    const x = SIDE_X[i]
    const p = (((t / period - l0) % 1) + 1) % 1
    const back = land - speed * stance * period
    if (p < stance) {
      const q = p / stance
      const roll = q < 0.15 ? -heel * (1 - q / 0.15) : q > 0.55 ? toe * ((q - 0.55) / 0.45) ** 1.5 : 0
      const z = land - speed * p * period + rollShift(roll)
      const ground = underFoot(g, x, z)
      return { x, z, y: (flat ? 0 : ground) + ANKLE, down: true, ground, roll }
    }
    const s = (p - stance) / (1 - stance)
    const roll = toe * (1 - smooth(0, 0.55, s)) - heel * smooth(0.6, 1, s)
    // up: where it left and where it will land, both riding back with the ground meanwhile
    const left = back - speed * (p - stance) * period, lands = land + speed * (1 - p) * period
    const z = left + (lands - left) * (0.5 - 0.5 * Math.cos(Math.PI * s)) + rollShift(roll)
    const g0 = underFoot(g, x, left), g1 = underFoot(g, x, lands), top = along(g, x, left, lands)
    const ground = underFoot(g, x, z)
    let base = flat ? 0 : s < 0.5 ? g0 + (top - g0) * smooth(0, 0.35, s) : top + (g1 - top) * smooth(0.65, 1, s)
    if (!flat) base = Math.max(base, ground)
    return { x, z, y: base + ANKLE + lift * Math.sin(Math.PI * s), down: false, ground, roll }
  })
}

/**
 * The ground as blobs, laid in the ground's own frame so they ride back with it as it slides: on the flat a dirt path,
 * steps of pale stone with a dark riser at each edge, a grassy slope, and gray stones bedded in dirt. It fades out
 * ahead and behind. Writes into `out` when given one: the count is the same for any `at`.
 */
export function groundBlobs(spec: GroundSpec, { width = 2.2, depth = 3.6, spacing = 0.05 } = {}, out?: Blobs): Blobs {
  const g = groundOf(spec)
  const raw = rawGround(spec)
  const nx = Math.round(width / spacing), nz = Math.round(depth / spacing)
  const risers = spec.kind === 'steps' && spec.height > 0.005 ? Math.ceil(depth / STEP_DEPTH) + 1 : 0
  const rows = risers ? Math.max(1, Math.round(spec.height / spacing)) : 0
  const total = (nx + 1) * (nz + 1) + risers * rows * (nx + 1)
  if (!out || out.capacity < total) out = new Blobs(total)
  out.count = total
  const r = spacing * 0.62
  const fade = (x: number, z: number) => Math.max(0, Math.min(1, (width / 2 - Math.abs(x)) / 0.3, (depth / 2 - Math.abs(z)) / 0.7))
  // Rows are laid in the ground's own frame and each keeps one slot while it is in view (a ring: the row leaving at the
  // back hands its slot to the one arriving ahead), so a blob never jumps to another slot. The view sorts a frame
  // behind; a blob that changed slots would be drawn in the wrong order for a frame, which showed as flicker.
  const rowsN = nz + 1, j0 = Math.floor((spec.at - depth / 2) / spacing)
  for (let j = 0; j < rowsN; j++) {
    const row = j0 + j, slot = (((row % rowsN) + rowsN) % rowsN) * (nx + 1)
    for (let i = 0; i <= nx; i++) {
      const x = -width / 2 + i * spacing, u = row * spacing, z = u - spec.at
      const y = g(x, z)
      const n = normalOf(g, x, z)
      const c = paint(spec, x, u, raw(x, u), i, row)
      const k = 0.68 + 0.32 * n[1]
      out.set(slot + i, { center: [x, y, z], scale: [r, r, spacing * 0.06], quat: quatFacing(n), color: [c[0] * k, c[1] * k, c[2] * k], opacity: fade(x, z) * 0.97 })
    }
  }
  // a riser at each tread's front edge, a fixed number of them in a ring of slots of their own
  const e0 = Math.ceil((spec.at - depth / 2) / STEP_DEPTH - 0.5), first = rowsN * (nx + 1)
  for (let e = 0; e < risers; e++) {
    const edge = e0 + e, slot = first + (((edge % risers) + risers) % risers) * rows * (nx + 1)
    const z = (edge + 0.5) * STEP_DEPTH - spec.at
    const lo = g(0, z - 0.001), hi = g(0, z + 0.001)
    for (let i = 0; i <= nx; i++) {
      const x = -width / 2 + i * spacing
      for (let k = 0; k < rows; k++) {
        const y = lo + ((k + 0.5) / rows) * (hi - lo)
        const shade = 0.3 + 0.05 * hash(i, edge, k)
        out.set(slot + i * rows + k, { center: [x, y, z], scale: [r, (Math.abs(hi - lo) / rows) * 0.62, spacing * 0.06], quat: [0, 0, 0, 1], color: [shade, shade * 0.98, shade * 0.94], opacity: fade(x, z) * 0.97 })
      }
    }
  }
  return out
}

/** Each kind of ground its own look, from where a blob is on the ground (x, u), how high it stands and its grid place. */
function paint(spec: GroundSpec, x: number, u: number, h: number, i: number, j: number): [number, number, number] {
  const n = hash(i, j, 9) - 0.5
  switch (spec.kind) {
    case 'flat': {
      // a trodden dirt path, paler down its middle, with small stones
      const mid = Math.max(0, 1 - Math.abs(x) / 0.45)
      if (hash(i, j, 11) < 0.03) return [0.5, 0.48, 0.45]
      return [0.42 + 0.08 * mid + 0.06 * n, 0.32 + 0.06 * mid + 0.05 * n, 0.22 + 0.04 * mid + 0.04 * n]
    }
    case 'steps': {
      // pale stone treads, every other one a shade apart, with a worn nose at each front edge
      const tread = Math.floor(u / STEP_DEPTH + 0.5)
      const nose = (tread + 0.5) * STEP_DEPTH - u < 0.04
      const v = ((tread & 1) ? 0.6 : 0.66) + 0.05 * n + (nose ? 0.06 : 0)
      return [v, v * 0.97, v * 0.9]
    }
    case 'slope': {
      // a grassy bank, in bands across it so it reads as rising
      const band = 0.04 * Math.sin(u * 9)
      return [0.3 + band + 0.05 * n, 0.46 + band + 0.07 * n, 0.2 + 0.04 * n]
    }
    case 'rocks': {
      if (h > spec.height * 0.04) { const v = 0.36 + 0.14 * (h / Math.max(spec.height, 1e-6)) + 0.08 * n + 0.05 * (hash(Math.floor(x / ROCK_CELL), Math.floor(u / ROCK_CELL), 7) - 0.5); return [v, v * 0.97, v * 0.92] }
      return [0.38 + 0.06 * n, 0.3 + 0.05 * n, 0.22 + 0.04 * n]
    }
  }
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
  const g0 = groundOf(spec)
  // a foot stands on the highest ground under its sole, so a toe over a step's edge lifts the foot onto it
  const g: Ground = (x, z) => underFoot(g0, x, z)
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

/** The most a planted sole tips to lie along the ground, in radians: a foot on a stone's shoulder stands on it, not up its side. */
const MAX_TILT = (25 * Math.PI) / 180
/** The turn from straight up to n, held to MAX_TILT. */
function tipped(n: Vec3): Quat {
  const a = Math.acos(Math.max(-1, Math.min(1, n[1])))
  if (a <= MAX_TILT || a < 1e-9) return fromTo([0, 1, 0], n)
  const k = Math.sin(MAX_TILT) / Math.hypot(n[0], n[2])
  return fromTo([0, 1, 0], [n[0] * k, Math.cos(MAX_TILT), n[2] * k])
}

const ROLLING = (r: number): Quat => [Math.sin(r / 2), 0, 0, Math.cos(r / 2)]

/** The points of a sole that can touch the ground, from the ankle: heel to ball rolled with the foot, toes kept along the ground. */
function solePoints(foot: Quat, toes: Quat): Vec3[] {
  const ball = rotate(foot, BALL) as Vec3
  return [...SOLE.filter((o) => o <= BALL[2]).map((o) => rotate(foot, [0, -ANKLE, o]) as Vec3), ball.map((v, k) => v + rotate(toes, [0, 0, 0.08])[k]) as Vec3]
}

/** How much of a leg's length is left unstraightened at most: the hips ride as high as the legs allow, so the stance leg is nearly straight. */
const SLACK = 0.975

/**
 * The elf walking for t seconds over ground that slides back under it (`slidAt`, which overrides `spec.at`), in the
 * ground's own gait: the clip swings the arms and body at that pace, and each leg is bent to its planned foot. Without
 * `ik`, the feet are planned for flat ground. Measures it as `stand` does, plus how deep any sole is in the ground,
 * planted or not. Leaves the skeleton posed.
 */
export function walk(sk: Skeleton, spec: GroundSpec, t: number, opts: FeetOptions): Standing {
  const gait = GAITS[spec.kind]
  const on = { ...spec, at: slidAt(spec.kind, t) }
  const g = groundOf(on)
  const level: Ground = () => 0
  // the clip at this gait's pace, its stride matched to ours
  elfWalk(sk, ((((t / gait.period) % 1) + 1) % 1) * CLIP)
  const feet = footings(on, t, !opts.ik)
  // each sole rolled for the step and, once down, lying along the ground under it (at most MAX_TILT off level); the
  // foot rests where its lowest point touches, so a sole on a stone's shoulder or rolling off its toes never cuts in
  const tilts = feet.map((f) => (opts.ik && opts.tilt && f.down ? tipped(normalOf(g, f.x, f.z + 0.07)) : [0, 0, 0, 1] as Quat))
  const turns = feet.map((f, i) => mulQ(tilts[i], ROLLING(f.roll)))
  const aimOn = (under: Ground) => feet.map((f, i) => {
    let y = -Infinity
    for (const d of solePoints(turns[i], tilts[i])) y = Math.max(y, under(f.x + d[0], f.z + d[2]) - d[1])
    return [f.x, f.down ? y : Math.max(f.y, y), f.z]
  })
  const aim = aimOn(opts.ik ? g : level)
  // The hips ride as high as the legs let them: the stance leg nearly straight, lowest as the feet change over. Held,
  // they ride as they would on flat ground, so on deep steps the foot behind can't reach.
  sk.offset[1] = 0
  sk.update()
  const flatDrop = hipDrop(sk, ELF_LEGS, opts.ik ? aimOn(level) : aim, SLACK)
  const drop = opts.ik && opts.hips ? hipDrop(sk, ELF_LEGS, aim, SLACK) : flatDrop
  sk.offset[1] = -drop
  sk.update()
  const hipShift = flatDrop - drop
  const ids = ELF_LEGS.map((l) => ({ upper: sk.index(l.upper), lower: sk.index(l.lower), foot: sk.index(l.foot!), toe: sk.index(l.foot!.replace('Foot', 'Toe')) }))
  let short = 0
  ids.forEach((l, i) => {
    short = Math.max(short, twoBoneIK(sk, l.upper, l.lower, sk.bones[l.foot].head, aim[i], { pole: ELF_LEGS[i].pole }))
    setWorldQuat(sk, l.foot, turns[i])
    sk.update()
    // the toes stay along the ground as the heel lifts
    setWorldQuat(sk, l.toe, tilts[i])
    sk.update()
  })
  clearCloak(sk)
  let worst = 0, sunk = 0, tilt = 0
  ids.forEach((l, i) => {
    const f = feet[i]
    const A = posedPoint(sk, l.lower, sk.bones[l.foot].head)
    for (const d of solePoints(worldQuat(sk, l.foot), worldQuat(sk, l.toe))) sunk = Math.max(sunk, g(A[0] + d[0], A[2] + d[2]) - (A[1] + d[1]))
    if (!f.down) return
    const off = opts.ik ? A[1] - aim[i][1] : A[1] - aim[i][1] - f.ground
    if (Math.abs(off) > Math.abs(worst)) worst = off
    // a sole is judged against the slope only while it lies flat, between heel strike and toe-off
    if (f.roll !== 0) return
    const n = rotate(tipped(normalOf(g, f.x, f.z + 0.07)), [0, 1, 0]), up = rotate(worldQuat(sk, l.foot), [0, 1, 0])
    tilt = Math.max(tilt, (Math.acos(Math.max(-1, Math.min(1, up[0] * n[0] + up[1] * n[1] + up[2] * n[2]))) * 180) / Math.PI)
  })
  return { worst, sunk: Math.max(0, sunk), short, tilt, spread: Math.abs(feet[0].ground - feet[1].ground), hipShift }
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
