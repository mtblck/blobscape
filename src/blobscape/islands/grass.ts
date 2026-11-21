import { Blobs, type Quat, type Vec3 } from '../../splat-core/blobs.ts'
import { Skeleton, emptySkin, type Skin } from '../../splat-engine/rig.ts'
import { hashOf, chance } from './materials.ts'

/**
 * Grass as blobs over an island drawn in blocks (Matt, 2026-11-20: a finer texture among the cubes, so the block style
 * can have dense vegetation). Blades grow on the tops of the turf's cubes: each blade is a few thin blobs standing on
 * the top face of the cube its cell becomes, colored from the cell's own grass toward its ramp's dark at the foot and
 * light at the tip, so the cube and its grass read as one ground. Thick in tussocks, thin between them.
 */

/** What grass is grown from: an island as cut (its blobs in the island's own units, the bone each rides). */
export interface GrassFrom {
  blobs: Blobs
  /** The bone each blob rides most, four a blob (the skin's joints); grass grows only on bone 0, the still ground. */
  joints: ArrayLike<number>
}

export interface GrassLook {
  /** The block's side the island is drawn in: blades stand on its cubes' tops. */
  cell: number
  /** The turf's colors (sRGB 0–1), shade to light: only cells of these colors grow grass. */
  ramp: readonly (readonly number[])[]
  /** The most blades. */
  blades: number
  /** How tall a blade is, least and most, in the island's units. */
  height?: [number, number]
  seed?: number
  /** Bunches of wildflowers through the grass: each kind's colors (sRGB 0–1, shade to light, as a bloom material's ramp), commonest first, and about how many bunches. */
  flowers?: { kinds: readonly (readonly (readonly number[])[])[]; bunches: number }
}

/** Blobs a blade. */
export const PER_BLADE = 3
/** How tall a blade stands by default, in the island's units (a fifth of a meter on the island's scale times five). */
export const BLADE_HEIGHT: [number, number] = [0.05, 0.12]
/** Blobs a flower: a stem, its petals and its middle. */
export const PER_FLOWER = 3
/** Flowers a bunch, least and most. */
const BUNCH: [number, number] = [5, 11]
/** How far a bunch's flowers stand from its middle, in cells. */
const BUNCH_REACH = 1.8
/** How far a face must face up to grow grass: the dot of its normal with up. */
const UPRIGHT = 0.7
/** How near a color's hue must be to one of the turf's to count as turf (channels over the brightest, summed). The cut darkens paint a little even unlit, so lightness is let go within `DIMMED`. */
const SAME = 0.06
const DIMMED: [number, number] = [0.7, 1.1]

function near(c: Float32Array, i: number, r: readonly number[]): boolean {
  const m = Math.max(c[i * 3], c[i * 3 + 1], c[i * 3 + 2]), n = Math.max(r[0], r[1], r[2])
  if (m <= 0 || n <= 0 || m / n < DIMMED[0] || m / n > DIMMED[1]) return false
  return Math.abs(c[i * 3] / m - r[0] / n) + Math.abs(c[i * 3 + 1] / m - r[1] / n) + Math.abs(c[i * 3 + 2] / m - r[2] / n) < SAME
}
const mix = (a: readonly number[], b: readonly number[], t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** A blob's thinnest axis turned by its rotation: the way its disc faces. */
export function facing(blobs: Blobs, i: number): Vec3 {
  const s = blobs.scale, k = s[i * 3] <= s[i * 3 + 1] && s[i * 3] <= s[i * 3 + 2] ? 0 : s[i * 3 + 1] <= s[i * 3 + 2] ? 1 : 2
  const x = blobs.quat[i * 4], y = blobs.quat[i * 4 + 1], z = blobs.quat[i * 4 + 2], w = blobs.quat[i * 4 + 3]
  // the k-th column of the rotation matrix
  if (k === 0) return [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)]
  if (k === 1) return [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)]
  return [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]
}

/** A turn of `a` about the upright then a tip of `t` about its own x: a blade's facing and its lean. */
function bladeQuat(a: number, t: number): Quat {
  const cy = Math.cos(a / 2), sy = Math.sin(a / 2), cx = Math.cos(t / 2), sx = Math.sin(t / 2)
  return [cy * sx, sy * cx, -sy * sx, cy * cx]
}

/** Thick and thin ground: tussocks a meter or two across, from a smooth noise. */
function tussock(x: number, z: number, seed: number): number {
  const o = chance(seed, 1) * 40
  const v = Math.sin(x * 5.1 + o) + Math.sin(z * 4.3 - o * 0.7) + Math.sin((x - z) * 7.7 + o * 1.3) * 0.6
  return Math.max(0, Math.min(1, 0.5 + v / 4.4))
}

/** The grass for an island: at most `look.blades` blades on the tops of its turf, in the island's own units, one bone. */
export function growGrass(from: GrassFrom, look: GrassLook): Blobs {
  const { blobs, joints } = from, c = blobs.color, cell = look.cell, seed = look.seed ?? 1
  const [lo, hi] = look.height ?? BLADE_HEIGHT
  const dark = look.ramp[0], light = look.ramp[look.ramp.length - 1]

  // one candidate a top cell: the cubes' own grid, so each blade stands on one cube's top
  const cells = new Map<string, number>()
  for (let i = 0; i < blobs.count; i++) {
    if (joints[i * 4] !== 0 || blobs.opacity[i] < 0.5 || !look.ramp.some((r) => near(c, i, r))) continue
    if (facing(blobs, i)[1] ** 2 < UPRIGHT * UPRIGHT) continue
    const x = Math.round(blobs.center[i * 3] / cell), z = Math.round(blobs.center[i * 3 + 2] / cell)
    const key = `${x},${z}`, was = cells.get(key)
    // the highest blob of a column is its top
    if (was === undefined || blobs.center[was * 3 + 1] < blobs.center[i * 3 + 1]) cells.set(key, i)
  }
  const tops = [...cells.values()]
  // a blade a cell where it is thickest, fewer between, scaled to the budget
  const share = Math.min(1, look.blades / Math.max(1, tops.length * 0.6))
  const fl = look.flowers, most = fl && fl.kinds.length ? Math.ceil(fl.bunches * 1.5) * BUNCH[1] * PER_FLOWER : 0
  const out = new Blobs(Math.min(look.blades, tops.length) * PER_BLADE + most)
  let n = 0
  for (const i of tops) {
    if (n >= look.blades) break
    const cx = Math.round(blobs.center[i * 3] / cell) * cell, cz = Math.round(blobs.center[i * 3 + 2] / cell) * cell
    const top = Math.round(blobs.center[i * 3 + 1] / cell) * cell + cell / 2
    const h = hashOf(seed, i), r = (k: number) => chance(h, k)
    const thick = tussock(cx, cz, seed)
    if (r(0) > share * (0.25 + 1.5 * thick)) continue
    n++
    const own = [c[i * 3], c[i * 3 + 1], c[i * 3 + 2]]
    const x = cx + (r(1) - 0.5) * cell * 0.8, z = cz + (r(2) - 0.5) * cell * 0.8
    const tall = (lo + (hi - lo) * r(3) * (0.5 + 0.5 * thick)), wide = cell * (0.16 + 0.08 * r(4))
    const yaw = r(5) * Math.PI * 2, lean = 0.15 + 0.35 * r(6)
    for (let k = 0; k < PER_BLADE; k++) {
      // the blade bends over more toward its tip, foot dark and tip light
      const up = (k + 0.5) / PER_BLADE, tilt = lean * (0.4 + 0.6 * k)
      const out2 = Math.sin(tilt) * tall * up * 0.8
      const tone = up < 0.5 ? mix(own, dark, 0.35 * (1 - up * 2)) : mix(own, light, 0.55 * (up * 2 - 1))
      out.push({
        center: [x + Math.sin(yaw) * out2, top + tall * up * Math.cos(tilt * 0.5), z + Math.cos(yaw) * out2],
        scale: [wide * (1 - 0.3 * k), tall / 5.2, wide * 0.15],
        quat: bladeQuat(yaw, tilt),
        color: tone,
        opacity: 1,
      })
    }
  }
  if (fl && fl.kinds.length) flowersIn(out, blobs, cells, tops, cell, [lo, hi], fl, seed, most)
  return out
}

/** Bunches of wildflowers on the turf's tops: a few to a dozen flowers of one kind (now and then two), each a stem with a flat head of petals and a middle, standing a little over the grass. */
function flowersIn(out: Blobs, blobs: Blobs, cells: Map<string, number>, tops: number[], cell: number, [lo, hi]: [number, number], fl: NonNullable<GrassLook['flowers']>, seed: number, most: number) {
  const c = blobs.color, end = out.count + most, chanceOf = fl.bunches / Math.max(1, tops.length)
  const pickKind = (v: number) => fl.kinds[Math.min(fl.kinds.length - 1, Math.floor(v ** 1.5 * fl.kinds.length))]
  for (const i of tops) {
    const h = hashOf(seed + 7919, i), r = (k: number) => chance(h, k)
    if (r(0) >= chanceOf) continue
    const gx = Math.round(blobs.center[i * 3] / cell), gz = Math.round(blobs.center[i * 3 + 2] / cell)
    const kinds = [pickKind(r(1)), pickKind(r(2))], n = BUNCH[0] + Math.floor(r(3) * (BUNCH[1] - BUNCH[0] + 1))
    for (let f = 0; f < n; f++) {
      if (out.count + PER_FLOWER > end) return
      // nearer the middle more often, so a bunch is thick in the middle and thins out
      const a = r(10 + f) * Math.PI * 2, d = Math.sqrt(r(30 + f)) * BUNCH_REACH * cell * (0.4 + 0.6 * r(50 + f))
      const x = gx * cell + Math.cos(a) * d, z = gz * cell + Math.sin(a) * d
      const under = cells.get(`${Math.round(x / cell)},${Math.round(z / cell)}`)
      if (under === undefined) continue
      const top = Math.round(blobs.center[under * 3 + 1] / cell) * cell + cell / 2
      const ramp = r(70 + f) < 0.75 ? kinds[0] : kinds[1], light = ramp[ramp.length - 1], mid = ramp[Math.min(1, ramp.length - 1)]
      const tall = (hi + (hi - lo) * 0.3) * (0.7 + 0.5 * r(90 + f)), yaw = r(110 + f) * Math.PI * 2, lean = 0.1 + 0.2 * r(130 + f)
      const head = cell * (0.13 + 0.08 * r(150 + f)), tip: Vec3 = [x + Math.sin(yaw) * Math.sin(lean) * tall, top + tall * Math.cos(lean), z + Math.cos(yaw) * Math.sin(lean) * tall]
      const stem = mix([c[under * 3], c[under * 3 + 1], c[under * 3 + 2]], [0, 0, 0], 0.25)
      out.push({ center: [(x + tip[0]) / 2, top + tall * 0.5 * Math.cos(lean), (z + tip[2]) / 2], scale: [cell * 0.035, tall / 3.6, cell * 0.035], quat: bladeQuat(yaw, lean), color: stem, opacity: 1 })
      // the head faces up and a little the way the stem leans
      out.push({ center: tip, scale: [head, head * 0.22, head], quat: bladeQuat(yaw, lean * 1.5), color: mix(mid, light, 0.5 * r(170 + f)), opacity: 1 })
      out.push({ center: [tip[0], tip[1] + head * 0.2, tip[2]], scale: [head * 0.4, head * 0.3, head * 0.4], quat: [0, 0, 0, 1], color: mix(light, [1, 0.85, 0.4], 0.5), opacity: 1 })
    }
  }
}

/** Grass as an actor of its own on one bone, `soft` so a stage drawing blocks keeps it as blobs among the cubes. Pose it as its island is placed. */
export function grassActor(blobs: Blobs): { blobs: Blobs; skin: Skin; skeleton: Skeleton; soft: true } {
  const skeleton = new Skeleton([{ name: 'grass', parent: -1, head: [0, 0, 0] }])
  const skin = emptySkin(blobs.count)
  for (let i = 0; i < blobs.count; i++) skin.weights[i * 4] = 1
  return { blobs, skin, skeleton, soft: true }
}
