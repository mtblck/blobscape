/**
 * Lava Lamp (pure): the lamp's glass, the bases and caps it can stand in, the colors of wax and liquid, and the blobs
 * that draw them. The base and cap are cut by voxel.ts like any scene's parts, so every style draws them; the glass,
 * the liquid and the wax are soft actors, which stay blobs among the cubes when the stage draws blocks.
 */
import { Blobs } from '../../splat-core/blobs.ts'
import { rng } from '../../splat-engine/body.ts'
import { Skeleton, emptySkin } from '../../splat-engine/rig.ts'
import { buildVoxels, lathe, sphere, torus, cone, type VoxelPart } from '../../splat-engine/voxel.ts'
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

/** Turned walnut: rings round the upright, broken by a slow wave. */
function walnut(p: Vec3): Vec3 {
  const r = Math.hypot(p[0], p[2]), a = Math.atan2(p[2], p[0])
  const ring = Math.sin((p[1] * 55 + Math.sin(a * 3 + p[1] * 8) * 1.2 + r * 20) * 2)
  const v = 0.82 + 0.12 * ring + 0.06 * Math.sin(a * 9 + p[1] * 3)
  return [0.4 * v, 0.23 * v, 0.13 * v]
}

/** Copper beaten by hand: small dents catching the light. */
function hammered(p: Vec3, n: Vec3): Vec3 {
  const a = Math.atan2(p[2], p[0])
  const dent = Math.sin(a * 46) * Math.sin(p[1] * 140) + Math.sin(a * 31 + 2) * Math.sin(p[1] * 90 + 1)
  const v = 0.84 + 0.13 * dent * 0.5 + 0.1 * Math.max(0, n[1])
  return [0.78 * v, 0.42 * v, 0.24 * v]
}

const glossBlack = metal([0.24, 0.24, 0.28], 0.6)
const gold: Vec3 = [0.86, 0.66, 0.26]

export const LAMP_STYLES: LampStyle[] = [
  {
    id: 'rocket', label: 'Classic rocket', bulb: [1, 0.72, 0.4],
    parts: () => [
      // the tall cone base, with a dark foot and the ring the glass sits in
      { shape: lathe(at0, [[0.235, 0], [0.235, 0.016], [0.226, 0.026], [FOOT_R + 0.02, GLASS_FLOOR + 0.02], [FOOT_R + 0.012, GLASS_FLOOR + 0.035], [FOOT_R + 0.002, GLASS_FLOOR + 0.035], [FOOT_R + 0.002, GLASS_FLOOR]]), color: brushed([0.78, 0.8, 0.84]), bone: BONE },
      { shape: lathe(at0, [[0.24, -0.002], [0.24, 0.018], [0.2, 0.018], [0.2, -0.002]]), color: [0.12, 0.12, 0.13], bone: BONE },
      { shape: torus([0, 0.33, 0], 0.172, 0.007), color: [0.42, 0.44, 0.48], bone: BONE },
      // the cap: a little cone, like a rocket's nose
      { shape: lathe([0, TOP - 0.03, 0], [[NECK_R + 0.006, 0], [NECK_R + 0.01, 0.02], [0.06, 0.1], [0.03, 0.15], [0.012, 0.165]]), color: brushed([0.8, 0.82, 0.86]), bone: BONE },
    ],
  },
  {
    id: 'chrome', label: 'Retro chrome', bulb: [1, 0.8, 0.55],
    parts: () => [
      // a bell of chrome, flared at the foot, with bright bands round it
      { shape: lathe(at0, [[0.2, 0], [0.205, 0.022], [0.19, 0.05], [0.15, 0.1], [0.128, 0.2], [0.132, 0.33], [FOOT_R + 0.03, GLASS_FLOOR + 0.0], [FOOT_R + 0.02, GLASS_FLOOR + 0.04], [FOOT_R + 0.002, GLASS_FLOOR + 0.04], [FOOT_R + 0.002, GLASS_FLOOR]]), color: metal([1, 1, 1]), bone: BONE },
      { shape: torus([0, 0.115, 0], 0.142, 0.01), color: metal([1, 1, 1]), bone: BONE },
      { shape: torus([0, 0.29, 0], 0.13, 0.009), color: metal([1, 1, 1]), bone: BONE },
      // a dome cap with a ball on top
      { shape: lathe([0, TOP - 0.035, 0], [[NECK_R + 0.012, 0], [NECK_R + 0.016, 0.02], [NECK_R + 0.006, 0.06], [0.05, 0.085], [0.02, 0.1], [0.008, 0.104]]), color: metal([1, 1, 1]), bone: BONE },
      { shape: sphere([0, TOP + 0.085, 0], 0.022), color: metal([1, 1, 1]), bone: BONE },
    ],
  },
  {
    id: 'walnut', label: 'Turned walnut', bulb: [1, 0.66, 0.32],
    parts: () => [
      // a turned wooden base with beads, a brass collar where the glass goes in
      { shape: lathe(at0, [[0.21, 0], [0.215, 0.03], [0.2, 0.05], [0.16, 0.07], [0.15, 0.1], [0.17, 0.125], [0.15, 0.15], [0.13, 0.22], [0.135, 0.32], [0.155, 0.36], [0.15, 0.39], [FOOT_R + 0.025, GLASS_FLOOR - 0.02], [FOOT_R + 0.025, GLASS_FLOOR], [FOOT_R + 0.002, GLASS_FLOOR]]), color: walnut, bone: BONE },
      { shape: lathe(at0, [[FOOT_R + 0.018, GLASS_FLOOR - 0.005], [FOOT_R + 0.02, GLASS_FLOOR + 0.035], [FOOT_R + 0.002, GLASS_FLOOR + 0.035], [FOOT_R + 0.002, GLASS_FLOOR - 0.005]]), color: metal(gold), bone: BONE },
      // a wooden cap, turned to a knob
      { shape: lathe([0, TOP - 0.03, 0], [[NECK_R + 0.012, 0], [NECK_R + 0.014, 0.035], [0.05, 0.05], [0.035, 0.08], [0.04, 0.1], [0.02, 0.12], [0.006, 0.124]]), color: walnut, bone: BONE },
    ],
  },
  {
    id: 'noir', label: 'Black and gold', bulb: [1, 0.7, 0.38],
    parts: () => [
      { shape: lathe(at0, [[0.22, 0], [0.22, 0.02], [0.2, 0.04], [0.15, 0.25], [FOOT_R + 0.02, GLASS_FLOOR + 0.03], [FOOT_R + 0.002, GLASS_FLOOR + 0.03], [FOOT_R + 0.002, GLASS_FLOOR]]), color: glossBlack, bone: BONE },
      { shape: torus([0, 0.03, 0], 0.207, 0.01), color: metal(gold), bone: BONE },
      { shape: torus([0, 0.25, 0], 0.151, 0.008), color: metal(gold), bone: BONE },
      { shape: torus([0, GLASS_FLOOR + 0.03, 0], FOOT_R + 0.014, 0.008), color: metal(gold), bone: BONE },
      { shape: lathe([0, TOP - 0.03, 0], [[NECK_R + 0.008, 0], [NECK_R + 0.01, 0.02], [0.05, 0.08], [0.026, 0.12], [0.006, 0.13]]), color: glossBlack, bone: BONE },
      { shape: sphere([0, TOP + 0.105, 0], 0.016), color: metal(gold), bone: BONE },
      { shape: torus([0, TOP - 0.008, 0], NECK_R + 0.012, 0.006), color: metal(gold), bone: BONE },
    ],
  },
  {
    id: 'copper', label: 'Hammered copper', bulb: [1, 0.68, 0.36],
    parts: () => [
      { shape: lathe(at0, [[0.23, 0], [0.232, 0.02], [0.22, 0.035], [FOOT_R + 0.03, GLASS_FLOOR + 0.01], [FOOT_R + 0.018, GLASS_FLOOR + 0.035], [FOOT_R + 0.002, GLASS_FLOOR + 0.035], [FOOT_R + 0.002, GLASS_FLOOR]]), color: hammered, bone: BONE },
      { shape: lathe([0, TOP - 0.03, 0], [[NECK_R + 0.008, 0], [NECK_R + 0.012, 0.02], [0.06, 0.09], [0.028, 0.14], [0.01, 0.152]]), color: hammered, bone: BONE },
    ],
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
