/**
 * Lava Lamp (pure): the lamp's glass, the bases and caps it can stand in, the colors of wax and liquid, and the blobs
 * that draw them. The base and cap are cut by voxel.ts like any scene's parts, so every style draws them; the glass,
 * the liquid and the wax are soft actors, which stay blobs among the cubes when the stage draws blocks.
 */
import { Blobs } from '../../splat-core/blobs.ts'
import { rng } from '../../splat-engine/body.ts'
import { Skeleton, emptySkin } from '../../splat-engine/rig.ts'
import { buildVoxels, lathe, sphere, torus, cone, cylinder, displace, ellipsoid, sweep, union, type Shape, type VoxelPart } from '../../splat-engine/voxel.ts'
import type { Light } from '../../splat-engine/engine.ts'
import type { Vessel } from './wax.ts'
import { WAX_DISC, type WaxDiscs } from './surface.ts'

type Vec3 = [number, number, number]

/** Where the inside of the glass starts, and how tall it is inside. */
export const GLASS_FLOOR = 0.47, GLASS_HEIGHT = 0.86
/** How thick the glass is. */
export const GLASS_THICK = 0.007

/** The inside of the glass, from the bottom up: [share of the height, radius]. The classic rocket: a swell a quarter up, tapering to a narrow neck. */
const PROFILE: [number, number][] = [[0, 0.118], [0.08, 0.134], [0.24, 0.157], [0.45, 0.149], [0.72, 0.114], [1, 0.074]]

/** The radius of the inside of the glass at a height above its floor. */
export function glassRadius(y: number): number {
  const u = Math.max(0, Math.min(1, y / GLASS_HEIGHT))
  let k = 0
  while (k < PROFILE.length - 2 && u > PROFILE[k + 1][0]) k++
  const [u0, r0] = PROFILE[k], [u1, r1] = PROFILE[k + 1]
  const t = (u - u0) / (u1 - u0), s = (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t)))) / 2
  return r0 + (r1 - r0) * s
}

export const VESSEL: Vessel = { height: GLASS_HEIGHT, radius: glassRadius }

/** A color of wax in its liquid: the wax cool and hot, and the liquid round it. */
export interface WaxColor {
  id: string
  label: string
  /** The wax where it has cooled, and where it is hot (sRGB 0–1). */
  cool: Vec3
  hot: Vec3
  /** The liquid's tint. */
  liquid: Vec3
}

export const WAX_COLORS: WaxColor[] = [
  { id: 'lava', label: 'Lava red', cool: [0.6, 0.06, 0.03], hot: [1, 0.45, 0.12], liquid: [1, 0.78, 0.3] },
  { id: 'acid', label: 'Acid green', cool: [0.26, 0.58, 0.03], hot: [0.78, 1, 0.18], liquid: [0.62, 0.92, 0.95] },
  { id: 'violet', label: 'Neon violet', cool: [0.36, 0.06, 0.6], hot: [0.86, 0.42, 1], liquid: [0.25, 0.4, 0.98] },
  { id: 'pink', label: 'Hot pink', cool: [0.72, 0.05, 0.38], hot: [1, 0.52, 0.78], liquid: [0.55, 0.22, 0.88] },
  { id: 'sunset', label: 'Sunset', cool: [0.82, 0.3, 0.03], hot: [1, 0.78, 0.26], liquid: [0.9, 0.16, 0.32] },
  { id: 'ocean', label: 'Ocean', cool: [0.72, 0.8, 0.86], hot: [1, 1, 1], liquid: [0.1, 0.42, 0.9] },
  { id: 'glacier', label: 'Glacier blue', cool: [0.1, 0.42, 0.82], hot: [0.55, 0.92, 1], liquid: [0.88, 0.94, 1] },
  { id: 'gold', label: 'Molten gold', cool: [0.66, 0.42, 0.04], hot: [1, 0.88, 0.32], liquid: [0.48, 0.14, 0.52] },
]

/** A base and cap the glass stands in. */
export interface LampStyle {
  id: string
  label: string
  /** The base's and the cap's parts, around the glass. */
  parts: () => VoxelPart[]
  /** How warm the bulb's light is through the base's top. */
  bulb: Vec3
}

const BONE = 'lamp'
const at0: Vec3 = [0, 0, 0]
const TOP = GLASS_FLOOR + GLASS_HEIGHT
/** The glass's outside radius at its floor and its top, which a base and a cap must hold. */
const FOOT_R = glassRadius(0) + GLASS_THICK, NECK_R = glassRadius(GLASS_HEIGHT) + GLASS_THICK

/** Metal that mirrors a dim room: bright from above, a dark band at the horizon, a warm floor below; `tint` colors it. */
function metal(tint: Vec3, sharp = 1): (p: Vec3, n: Vec3) => Vec3 {
  return (p, n) => {
    const y = n[1] + 0.12 * Math.sin(p[1] * 60) * sharp
    const sky = y > 0.25 ? 0.95 : y > -0.05 ? 0.22 + ((y + 0.05) / 0.3) * 0.1 : 0.48 - Math.min(0.2, -y * 0.25)
    // a long bright window on the left, as from a room's lamp
    const side = Math.max(0, -n[0] * 0.8 + n[2] * 0.4)
    const v = Math.min(1, sky * (0.75 + 0.25 * side) + Math.pow(side, 8) * 0.5 * sharp)
    return [tint[0] * v, tint[1] * v, tint[2] * v]
  }
}

/** Brushed metal: flat light with fine streaks up and down. */
function brushed(tint: Vec3): (p: Vec3, n: Vec3) => Vec3 {
  return (p) => {
    const a = Math.atan2(p[2], p[0])
    const v = 0.88 + 0.08 * Math.sin(a * 140) * Math.sin(a * 37 + 1.3) + 0.04 * Math.sin(p[1] * 30)
    return [tint[0] * v, tint[1] * v, tint[2] * v]
  }
}

/** Glossy paint, a little of the room in it: `tint` lit brighter where it faces up and toward the room's lamp. */
function gloss(tint: Vec3): (p: Vec3, n: Vec3) => Vec3 {
  return (_p, n) => {
    const side = Math.max(0, -n[0] * 0.8 + n[2] * 0.4)
    const v = 0.82 + 0.12 * Math.max(0, n[1]) + Math.pow(side, 10) * 0.45
    return [Math.min(1, tint[0] * v + Math.pow(side, 10) * 0.25), Math.min(1, tint[1] * v + Math.pow(side, 10) * 0.25), Math.min(1, tint[2] * v + Math.pow(side, 10) * 0.25)]
  }
}

const glossBlack = metal([0.24, 0.24, 0.28], 0.6)
const gold: Vec3 = [0.86, 0.66, 0.26]

/** The signed distance from (px, py) to a closed polygon, negative inside. */
function polygonDistance(v: [number, number][], px: number, py: number) {
  let d = (px - v[0][0]) ** 2 + (py - v[0][1]) ** 2, sign = 1
  for (let i = 0, j = v.length - 1; i < v.length; j = i, i++) {
    const ex = v[j][0] - v[i][0], ey = v[j][1] - v[i][1], wx = px - v[i][0], wy = py - v[i][1]
    const t = Math.min(1, Math.max(0, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1e-12)))
    d = Math.min(d, (wx - ex * t) ** 2 + (wy - ey * t) ** 2)
    const a = py >= v[i][1], b = py < v[j][1], c = ex * wy > ey * wx
    if ((a && b && c) || (!a && !b && !c)) sign = -sign
  }
  return sign * Math.sqrt(d)
}

/**
 * A flat plate standing on edge, out from the upright: `outline` is [distance out, height] corners in the plane at
 * angle `a` round the upright, and it is `half` thick either side of that plane, its edges rounded. Fins, mostly.
 */
function plate(a: number, outline: [number, number][], half: number): Shape {
  const ca = Math.cos(a), sa = Math.sin(a), R = Math.max(...outline.map((q) => q[0])) + half
  const lo = Math.min(...outline.map((q) => q[1])), hi = Math.max(...outline.map((q) => q[1]))
  const round = half * 0.8
  return {
    sdf: (x, y, z) => {
      const along = x * ca + z * sa, across = -x * sa + z * ca
      const d2 = polygonDistance(outline, along, y) + round, t = Math.abs(across) - half + round
      return Math.hypot(Math.max(d2, 0), Math.max(t, 0)) + Math.min(Math.max(d2, t), 0) - round
    },
    min: [-R, lo - half, -R], max: [R, hi + half, R],
  }
}

/** Points round a circle of radius `r` about `c`, in the plane of the unit ways `u` and `v`, from angle `a0` to `a1`. */
function arc(c: Vec3, u: Vec3, v: Vec3, r: number, a0: number, a1: number, steps = 16): Vec3[] {
  return Array.from({ length: steps + 1 }, (_, k) => {
    const a = a0 + ((a1 - a0) * k) / steps, cu = Math.cos(a) * r, sv = Math.sin(a) * r
    return [c[0] + u[0] * cu + v[0] * sv, c[1] + u[1] * cu + v[1] * sv, c[2] + u[2] * cu + v[2] * sv] as Vec3
  })
}

/** Rough rock: lumps at several sizes, as a distance to push a surface by. */
const lumps = (x: number, y: number, z: number) =>
  0.006 * Math.sin(x * 61 + y * 23) * Math.sin(z * 57 - y * 31) + 0.004 * Math.sin(x * 143 - z * 97 + y * 51) + 0.0025 * Math.sin(y * 230 + x * 170)

/** Basalt, dark and a little warm where the lava's light catches it from below. */
function basalt(p: Vec3, n: Vec3): Vec3 {
  const grain = 0.85 + 0.15 * Math.sin(p[0] * 300 + p[1] * 170) * Math.sin(p[2] * 260 - p[1] * 90)
  const warm = Math.max(0, -n[1]) * 0.2 + Math.max(0, 0.18 - p[1]) * 0.6
  return [(0.29 + warm * 0.5) * grain, (0.25 + warm * 0.15) * grain, 0.23 * grain]
}

const VOLCANO_R: [number, number][] = [[0.28, 0], [0.265, 0.03], [0.225, 0.11], [0.18, 0.23], [0.15, 0.34], [FOOT_R + 0.05, GLASS_FLOOR - 0.015]]
/** The volcano's slope's radius at a height, for laying lava on it. */
function volcanoR(y: number) {
  for (let k = 0; k < VOLCANO_R.length - 1; k++) {
    const [r0, y0] = VOLCANO_R[k], [r1, y1] = VOLCANO_R[k + 1]
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0)
  }
  return VOLCANO_R[VOLCANO_R.length - 1][0]
}

/** The light bulb's screw: a shell whose radius runs up in a helix. */
function screwShell(y0: number, y1: number, r: number, pitch: number, depth: number): Shape {
  const body = cylinder([0, 0], y0, y1, r)
  return displace(body, (x, y, z) => {
    const fade = Math.min(1, (y - y0) / 0.012, (y1 - y) / 0.012)
    return fade > 0 ? depth * fade * Math.sin(((y - y0) / pitch) * Math.PI * 2 - Math.atan2(z, x)) : 0
  }, depth)
}

/** Porcelain with a diner's red stripe round it, and coffee with crema where the cup is open at the top. */
function cupColor(p: Vec3, n: Vec3): Vec3 {
  const r = Math.hypot(p[0], p[2])
  if (n[1] > 0.6 && r < CUP_RIM - 0.004 && p[1] > GLASS_FLOOR - 0.02) {
    // crema: pale toward the rim, a swirl of it round the glass
    const a = Math.atan2(p[2], p[0]), swirl = 0.5 + 0.5 * Math.sin(a * 2 + r * 90)
    const k = Math.min(1, Math.max(0, (r - FOOT_R) / (CUP_RIM - FOOT_R))) * 0.7 + swirl * 0.3
    return [0.36 + 0.34 * k, 0.2 + 0.24 * k, 0.1 + 0.14 * k]
  }
  if (p[1] > 0.37 && p[1] < 0.405) return [0.8, 0.12, 0.12]
  const v = 0.9 + 0.08 * Math.max(0, n[1])
  return [0.97 * v, 0.95 * v, 0.9 * v]
}
const CUP_RIM = 0.198

export const LAMP_STYLES: LampStyle[] = [
  {
    id: 'rocket', label: 'Pulp rocket', bulb: [1, 0.72, 0.4],
    parts: () => {
      const red = gloss([0.84, 0.12, 0.1]), silver = gloss([0.8, 0.82, 0.86])
      // three big swept fins hold the rocket up off the floor, standing on their tips
      const fins: VoxelPart[] = [0, 1, 2].map((k) => ({
        shape: plate((k / 3) * Math.PI * 2 + Math.PI / 6, [[0.07, 0.37], [0.12, 0.38], [0.19, 0.27], [0.285, 0.05], [0.3, 0], [0.245, 0], [0.21, 0.04], [0.14, 0.11], [0.07, 0.13]], 0.011),
        color: red, bone: BONE,
      }))
      return [
        ...fins,
        // the hull: round in the middle, narrowing to the engine below and to the collar the glass sits in
        { shape: lathe(at0, [[0.05, 0.1], [0.1, 0.13], [0.145, 0.19], [0.165, 0.27], [0.16, 0.35], [0.14, 0.41], [FOOT_R + 0.022, GLASS_FLOOR - 0.01], [FOOT_R + 0.022, GLASS_FLOOR + 0.03], [FOOT_R + 0.002, GLASS_FLOOR + 0.03], [FOOT_R + 0.002, GLASS_FLOOR]]), color: silver, bone: BONE },
        // a red band of rivets round the hull, and a red collar
        { shape: torus([0, 0.305, 0], 0.162, 0.008), color: red, bone: BONE },
        { shape: torus([0, GLASS_FLOOR + 0.03, 0], FOOT_R + 0.018, 0.007), color: red, bone: BONE },
        // the engine bell, and the glow inside it
        { shape: lathe(at0, [[0.075, 0.035], [0.07, 0.05], [0.05, 0.09], [0.045, 0.11], [0.035, 0.11], [0.03, 0.06], [0.0, 0.06]]), color: metal([0.5, 0.48, 0.5]), bone: BONE },
        { shape: cylinder([0, 0], 0.055, 0.065, 0.055), color: [1, 0.55, 0.15], bone: BONE, glow: true },
        // a porthole on the front, lit from inside
        { shape: sweep(arc([0, 0.25, 0.165], [1, 0, 0], [0, 1, 0], 0.032, 0, Math.PI * 2, 20), 0.007), color: metal(gold), bone: BONE },
        { shape: ellipsoid([0, 0.25, 0.157], [0.03, 0.03, 0.012]), color: [1, 0.78, 0.4], bone: BONE, glow: true },
        // the nose cone: red and pointed, with a silver band and a tip
        { shape: lathe([0, TOP - 0.03, 0], [[NECK_R + 0.008, 0], [NECK_R + 0.012, 0.03], [0.072, 0.07], [0.06, 0.13], [0.035, 0.19], [0.01, 0.235], [0.004, 0.24]]), color: red, bone: BONE },
        { shape: torus([0, TOP + 0.005, 0], NECK_R + 0.014, 0.007), color: silver, bone: BONE },
        { shape: sphere([0, TOP + 0.215, 0], 0.012), color: silver, bone: BONE },
      ]
    },
  },
  {
    id: 'atomic', label: 'Atomic mint', bulb: [1, 0.82, 0.6],
    parts: () => {
      const mint: Vec3 = [0.55, 0.84, 0.74], cream: Vec3 = [0.95, 0.9, 0.78]
      const legs: VoxelPart[] = [0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2 + 0.5
        return { shape: cone([Math.cos(a) * 0.22, 0.005, Math.sin(a) * 0.22], [Math.cos(a) * 0.1, 0.2, Math.sin(a) * 0.1], 0.011, 0.016), color: cream, bone: BONE }
      })
      return [
        ...legs,
        // a drum on three splayed legs, mint with a cream band, a cream ring for the glass
        { shape: lathe([0, 0.16, 0], [[0.13, 0], [0.165, 0.03], [0.17, 0.12], [0.15, 0.2], [FOOT_R + 0.025, GLASS_FLOOR - 0.16 + 0.0], [FOOT_R + 0.002, GLASS_FLOOR - 0.16], [FOOT_R + 0.002, GLASS_FLOOR - 0.16 - 0.04], [0, GLASS_FLOOR - 0.16 - 0.04]]), color: mint, bone: BONE },
        { shape: torus([0, 0.235, 0], 0.17, 0.012), color: cream, bone: BONE },
        { shape: lathe(at0, [[FOOT_R + 0.022, GLASS_FLOOR - 0.01], [FOOT_R + 0.022, GLASS_FLOOR + 0.03], [FOOT_R + 0.002, GLASS_FLOOR + 0.03], [FOOT_R + 0.002, GLASS_FLOOR - 0.01]]), color: cream, bone: BONE },
        { shape: lathe([0, TOP - 0.03, 0], [[NECK_R + 0.01, 0], [NECK_R + 0.012, 0.025], [0.045, 0.1], [0.02, 0.15], [0.006, 0.16]]), color: cream, bone: BONE },
        { shape: sphere([0, TOP + 0.14, 0], 0.018), color: mint, bone: BONE },
      ]
    },
  },
  {
    id: 'bulb', label: 'Light bulb', bulb: [1, 0.86, 0.62],
    parts: () => {
      const shell = brushed([0.8, 0.8, 0.82]), porcelain: Vec3 = [0.95, 0.94, 0.9]
      return [
        // the glass is the bulb: it stands in a screw base on its black glass and brass tip, in a porcelain socket
        { shape: lathe(at0, [[0.2, 0], [0.205, 0.02], [0.195, 0.045], [0.16, 0.065], [0.12, 0.07], [0.0, 0.07]]), color: porcelain, bone: BONE },
        { shape: lathe(at0, [[0.04, 0.06], [0.045, 0.085], [0.03, 0.095], [0, 0.097]]), color: metal(gold), bone: BONE },
        { shape: lathe(at0, [[0.06, 0.08], [0.09, 0.105], [0.11, 0.13], [0.0, 0.13]]), color: glossBlack, bone: BONE },
        { shape: screwShell(0.125, 0.37, 0.112, 0.05, 0.011), color: shell, bone: BONE },
        // the crimped neck where shell meets glass
        { shape: lathe(at0, [[0.112, 0.365], [0.12, 0.4], [FOOT_R + 0.012, GLASS_FLOOR - 0.02], [FOOT_R + 0.012, GLASS_FLOOR + 0.02], [FOOT_R + 0.002, GLASS_FLOOR + 0.02], [FOOT_R + 0.002, GLASS_FLOOR], [0, GLASS_FLOOR]]), color: shell, bone: BONE },
        { shape: torus([0, 0.39, 0], 0.122, 0.006), color: metal([0.7, 0.7, 0.74]), bone: BONE },
        // the top: the frosted tip a bulb is sealed at
        { shape: lathe([0, TOP - 0.03, 0], [[NECK_R + 0.006, 0], [NECK_R + 0.006, 0.02], [NECK_R - 0.01, 0.045], [0.03, 0.065], [0.012, 0.08], [0.008, 0.095], [0.004, 0.1]]), color: [0.96, 0.95, 0.92], bone: BONE },
      ]
    },
  },
  {
    id: 'volcano', label: 'Volcano', bulb: [1, 0.55, 0.22],
    parts: () => {
      const lava: Vec3 = [1, 0.42, 0.08]
      // three streams of lava down the slope from the crater, wandering as they go
      const streams: VoxelPart[] = [0.4, 2.3, 4.2].map((a0, k) => {
        const path: Vec3[] = []
        for (let y = GLASS_FLOOR - 0.03; y > 0.02 + k * 0.05; y -= 0.012) {
          const a = a0 + 0.25 * Math.sin(y * 18 + k) + (GLASS_FLOOR - y) * 0.6, r = volcanoR(y) + 0.003
          path.push([Math.cos(a) * r, y, Math.sin(a) * r])
        }
        return { shape: sweep(path, 0.013, 0.006), color: lava, bone: BONE, glow: true }
      })
      const cloud = (x: number, y: number, z: number, r: number) => sphere([x, TOP + y, z], r)
      return [
        // a cone of rough basalt with a crater, the glass rising out of it
        { shape: displace(lathe(at0, [...VOLCANO_R, [FOOT_R + 0.045, GLASS_FLOOR + 0.03], [FOOT_R + 0.02, GLASS_FLOOR + 0.025], [FOOT_R + 0.002, GLASS_FLOOR - 0.005], [0, GLASS_FLOOR - 0.005]]), lumps, 0.013), color: basalt, bone: BONE },
        ...streams,
        // lava pooled round the glass in the crater
        { shape: torus([0, GLASS_FLOOR + 0.008, 0], FOOT_R + 0.016, 0.01), color: lava, bone: BONE, glow: true },
        // a puff of ash for a cap
        { shape: union(cloud(0, 0.02, 0, NECK_R + 0.018), cloud(0.04, 0.07, 0.01, 0.05), cloud(-0.035, 0.09, -0.01, 0.045), cloud(0.005, 0.13, 0.005, 0.04), cloud(0.03, 0.17, -0.01, 0.028)), color: (_p, n) => { const v = 0.55 + 0.25 * Math.max(0, n[1]); return [v * 0.92, v * 0.9, v * 0.9] }, bone: BONE },
      ]
    },
  },
  {
    id: 'cup', label: 'Coffee cup', bulb: [1, 0.76, 0.48],
    parts: () => {
      const porcelain: Vec3 = [0.97, 0.95, 0.9]
      return [
        // a saucer, then a diner cup full to the top, the glass standing in the coffee
        { shape: lathe(at0, [[0.13, 0], [0.15, 0.008], [0.27, 0.02], [0.3, 0.03], [0.295, 0.038], [0.16, 0.03], [0, 0.03]]), color: (p, n) => (Math.hypot(p[0], p[2]) > 0.27 && Math.hypot(p[0], p[2]) < 0.285 && n[1] > 0.5 ? [0.8, 0.12, 0.12] : porcelain), bone: BONE },
        { shape: lathe(at0, [[0.1, 0.028], [0.115, 0.05], [0.16, 0.16], [0.185, 0.3], [CUP_RIM, 0.44], [CUP_RIM + 0.004, GLASS_FLOOR + 0.03], [CUP_RIM - 0.008, GLASS_FLOOR + 0.03], [CUP_RIM - 0.01, GLASS_FLOOR + 0.005], [0, GLASS_FLOOR + 0.005]]), color: cupColor, bone: BONE },
        // the handle, a loop out to the right
        { shape: sweep(arc([0.19, 0.28, 0], [1, 0, 0], [0, 1, 0], 0.075, -1.75, 1.75, 18), 0.017), color: porcelain, bone: BONE },
        // a porcelain lid with a knob
        { shape: lathe([0, TOP - 0.03, 0], [[NECK_R + 0.014, 0], [NECK_R + 0.018, 0.02], [NECK_R + 0.012, 0.035], [0.06, 0.06], [0.03, 0.075], [0, 0.077]]), color: porcelain, bone: BONE },
        { shape: torus([0, TOP - 0.008, 0], NECK_R + 0.018, 0.005), color: [0.8, 0.12, 0.12], bone: BONE },
        { shape: sphere([0, TOP + 0.065, 0], 0.022), color: porcelain, bone: BONE },
      ]
    },
  },
]

/** The base and cap cut into blobs at a grid of side `spacing`, with the room's light baked in from the upper left. */
export function buildLamp(style: LampStyle, spacing: number) {
  return buildVoxels({
    bones: [{ name: BONE, parent: -1, head: [0, 0, 0] }],
    parts: style.parts(),
    spacing, disc: 0.75, trueShell: true,
    light: { dir: [-0.5, 0.7, 0.55], ambient: 0.55, shadow: 0.5 },
  })
}

/** An actor of blobs that stand still on one bone. */
export function stillActor(blobs: Blobs, name: string) {
  const skeleton = new Skeleton([{ name, parent: -1, head: [0, 0, 0] }])
  const skin = emptySkin(blobs.count)
  for (let i = 0; i < blobs.count; i++) skin.weights[i * 4] = 1
  return { blobs, skin, skeleton }
}

/** The quaternion (x, y, z, w) that turns +z onto the unit vector n. */
export function facing(nx: number, ny: number, nz: number): [number, number, number, number] {
  if (nz < -0.999999) return [1, 0, 0, 0]
  const x = -ny, y = nx, w = 1 + nz, l = Math.hypot(x, y, w)
  return [x / l, y / l, 0, w / l]
}

/** How see-through the glass is, and its streaks of light. */
export const GLASS = { opacity: 0.05, shine: 0.45, pixels: 0.1 }

/**
 * The glass: faint discs over its outside, tinted by the liquid in it, and two long streaks of light down its left
 * where it catches the room's lamp. Pixel art cuts what is faint, so it asks for the glass more solid (`GLASS.pixels`).
 */
export function glassBlobs(liquid: Vec3, spacing: number, opacity = GLASS.opacity): Blobs {
  const b = new Blobs(4000)
  const step = spacing * 2.2
  for (let y = step * 0.5; y < GLASS_HEIGHT; y += step) {
    const R = glassRadius(y) + GLASS_THICK, n = Math.max(8, Math.round((Math.PI * 2 * R) / step))
    // the glass leans in or out: its facing tips with the slope of its outline
    const slope = (glassRadius(y + 0.005) - glassRadius(y - 0.005)) / 0.01
    for (let k = 0; k < n; k++) {
      const a = ((k + (Math.round(y / step) % 2) * 0.5) / n) * Math.PI * 2
      const nl = Math.hypot(1, slope), nx = Math.cos(a) / nl, nz = Math.sin(a) / nl, ny = -slope / nl
      // solid enough for pixel art, it is the liquid's own color, or it reads as frosted white
      const tint: Vec3 = opacity > GLASS.opacity ? [liquid[0] * 0.6, liquid[1] * 0.6, liquid[2] * 0.6] : [0.8 + 0.2 * liquid[0], 0.8 + 0.2 * liquid[1], 0.8 + 0.2 * liquid[2]]
      b.push({ center: [Math.cos(a) * R, GLASS_FLOOR + y, Math.sin(a) * R], scale: [step * 0.62, step * 0.62, step * 0.05], quat: facing(nx, ny, nz), color: tint, opacity })
    }
  }
  // the streaks: down the left of the glass as it is first seen from the front (+z)
  for (const [az, wide, from, to] of [[-0.75, 1, 0.06, 0.9], [-0.48, 0.5, 0.15, 0.7], [0.95, 0.35, 0.2, 0.55]] as const) {
    const steps = Math.ceil(((to - from) * GLASS_HEIGHT) / (spacing * 0.8))
    for (let k = 0; k < steps; k++) {
      const u = from + ((to - from) * k) / (steps - 1), y = u * GLASS_HEIGHT, R = glassRadius(y) + GLASS_THICK * 1.4
      const a = Math.PI / 2 + az, fade = Math.sin(((k + 0.5) / steps) * Math.PI)
      const s = 0.006 * wide
      b.push({ center: [Math.cos(a) * R, GLASS_FLOOR + y, Math.sin(a) * R], scale: [s, spacing * 0.9, s * 0.2], quat: facing(Math.cos(a), 0, Math.sin(a)), color: [1, 1, 1], opacity: GLASS.shine * fade })
    }
  }
  return b
}

/**
 * The liquid: big faint blobs through the glass in its tint, brighter low down where the bulb lights it, so the glass
 * reads as full and glowing. `glow` (0 to 1) is how lit it is.
 */
export function liquidBlobs(liquid: Vec3, count: number, seed = 5): Blobs {
  const b = new Blobs(count)
  const r = rng(seed)
  for (let i = 0; i < count * 6 && b.count < count; i++) {
    const y = Math.pow(r(), 1.2) * GLASS_HEIGHT, R = glassRadius(y) * 0.82, a = r() * Math.PI * 2, d = Math.sqrt(r()) * R
    const lit = 0.55 + 0.45 * (1 - y / GLASS_HEIGHT)
    const s = glassRadius(y) * 0.32
    b.push({ center: [Math.cos(a) * d, GLASS_FLOOR + y, Math.sin(a) * d], scale: [s, s, s], quat: [0, 0, 0, 1], color: [liquid[0] * lit, liquid[1] * lit, liquid[2] * lit], opacity: 0.045 })
  }
  return b
}

/** The wax's blobs: `capacity` flat discs, those not in use clear and of no size. */
export function waxBlobs(capacity: number): Blobs {
  const b = new Blobs(capacity)
  for (let i = 0; i < capacity; i++) b.push({ center: [0, GLASS_FLOOR, 0], scale: [0, 0, 0], quat: [0, 0, 0, 1], color: [0, 0, 0], opacity: 0 })
  return b
}

/** How strongly the wax gives its own light (a byte): it glows from within, lit by the bulb through it. */
export const WAX_GLOW = 120

/** Lays the wax's discs into its blobs, colored by how hot each is; the rest are cleared. */
export function placeWax(discs: WaxDiscs, cell: number, color: WaxColor, b: Blobs) {
  const n = Math.min(discs.count, b.count), s = cell * WAX_DISC
  for (let i = 0; i < b.count; i++) {
    if (i >= n) { b.scale.fill(0, i * 3, i * 3 + 3); b.opacity[i] = 0; continue }
    b.center[i * 3] = discs.center[i * 3]; b.center[i * 3 + 1] = discs.center[i * 3 + 1] + GLASS_FLOOR; b.center[i * 3 + 2] = discs.center[i * 3 + 2]
    b.scale[i * 3] = s; b.scale[i * 3 + 1] = s; b.scale[i * 3 + 2] = cell * 0.14
    b.quat.set(facing(discs.normal[i * 3], discs.normal[i * 3 + 1], discs.normal[i * 3 + 2]), i * 4)
    // hot wax glows toward its hot color; the underside, toward the bulb, a little more
    const t = Math.max(0, Math.min(1, (discs.temp[i] - 0.3) / 0.6)), under = Math.max(0, -discs.normal[i * 3 + 1]) * 0.15
    const k = Math.min(1, t * t * (3 - 2 * t) + under)
    for (let c = 0; c < 3; c++) b.color[i * 3 + c] = color.cool[c] + (color.hot[c] - color.cool[c]) * k
    b.opacity[i] = 1
  }
}

/** The bulb's light up through the glass and the dim room's light from the upper left. */
export function lampLights(style: LampStyle, heat: number, on: boolean): Light[] {
  const b = style.bulb, k = on ? 0.9 + 0.5 * heat : 0
  return [
    { position: [0, GLASS_FLOOR - 0.02, 0], color: [b[0] * k, b[1] * k, b[2] * k], range: 0.5 },
    { position: [0, GLASS_FLOOR + GLASS_HEIGHT * 0.45, 0], color: [b[0] * k * 0.35, b[1] * k * 0.35, b[2] * k * 0.35], range: 0.45 },
    { direction: [-0.5, 0.7, 0.6], color: [0.42, 0.42, 0.5] },
  ]
}
