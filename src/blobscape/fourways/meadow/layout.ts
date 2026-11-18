/**
 * The fox's meadow written out by hand, as someone building it without Blobscape would: where things stand, how the
 * fox is put together and how it trots, as plain numbers. The shader panel and the three.js panel both read it; the
 * Blobscape and Spark panels do not (they use `doc.ts` and `build.ts`). Kept free of any renderer so Node can test it.
 */
export type V3 = [number, number, number]

export const LOOP = 12
const TAU = Math.PI * 2

/** The ring the fox trots round the stone, its size (the fox below is written a meter long), and its strides a lap. */
export const RING = 1.05
export const FOX_SIZE = 0.5
export const STRIDES = 16
/** The wisp's path round the fox: how far it swings ahead and to the side, how high, and how many times a loop it goes round. */
export const WISP = { ahead: 1.1, aside: 0.5, height: 0.55, times: 5 }

export const WISP_LIGHT = { color: '#ffd9a0', strength: 3.4, range: 1.25 }
/** How much of its own color everything keeps away from the wisp. */
export const AMBIENT = 0.7
/** The moon's light: where it comes from, how much there is without it, and how dark its shadows are. */
export const MOONLIGHT = { from: [-0.4, 0.8, 0.45] as V3, ambient: 0.5, shadow: 0.7 }
export const HAZE = { color: '#141c36', from: 1, to: 7 }

/** The turf, the standing stone (a tapered bar, leaning), the rocks and the flowers (where, how tall, the head's color). */
export const TURF = { r: 1.75, depth: 0.3 }
export const STONE = { from: [0, 0, 0] as V3, to: [0.06, 0.78, -0.03] as V3, r: 0.2, rTo: 0.11 }
export const ROCKS: { at: V3; r: V3 }[] = [
  { at: [0.42, 0.05, 0.12], r: [0.16, 0.11, 0.13] }, { at: [-0.3, 0.04, -0.3], r: [0.12, 0.08, 0.1] },
  { at: [1.45, 0.05, -0.55], r: [0.15, 0.1, 0.12] }, { at: [-1.35, 0.04, 0.75], r: [0.12, 0.08, 0.1] },
]
export const FLOWERS: { at: [number, number]; height: number; color: string }[] = [
  { at: [1.4, 0.5], height: 0.2, color: '#b9485a' }, { at: [-1.5, -0.2], height: 0.24, color: '#e8dcc0' }, { at: [0.5, -1.5], height: 0.22, color: '#b9485a' },
  { at: [-0.6, 1.5], height: 0.2, color: '#e8dcc0' }, { at: [0.35, 0.4], height: 0.18, color: '#b9485a' },
]
export const MOON = { at: [-1.5, 2.05, -1.7] as V3, r: 0.2, color: '#f4f1e4' }
export const STARS: V3[] = [
  [-0.6, 2.9, -1.8], [0.3, 3.1, -1.8], [1.3, 2.8, -1.7], [1.8, 2.2, -1.4], [0.8, 2.4, -1.9], [-0.1, 2.5, -1.9], [-1.9, 2.0, -1.2],
  [1.0, 3.3, -1.5], [-1.0, 3.3, -1.6], [1.9, 3.0, -0.8], [-2.0, 2.9, -0.7], [0.5, 2.0, -1.9],
]

/** The grass: blades stand on a grid this far apart, one a square, and sway this far at the tip, this many times a loop. */
export const GRASS = { grid: 0.04, sway: 0.035, times: 4, colors: ['#10241c', '#1b3a2a', '#2c5a38', '#4a8048'] }
/** How tall grass grows at a spot, as a share of full height: none in the stone or past the edge, short where the fox has worn its ring. */
export function grown(x: number, z: number) {
  const r = Math.hypot(x, z)
  if (r < 0.26 || r > 1.7) return 0
  const worn = Math.abs(r - RING) / 0.2
  return (worn < 1 ? 0.22 + 0.78 * worn ** 3 : 1) * (r > 1.5 ? ((1.7 - r) / 0.2) * 0.5 + 0.5 : 1)
}
/** A blade's height from two numbers between 0 and 1 (most are short, one in ten stands tall), before `grown`. */
export const bladeHeight = (a: number, b: number) => 0.09 + 0.13 * a * a + (b < 0.1 ? 0.14 : 0)

/** Where the fox stands at `u` (the share of the loop gone by) and the turn about the upright that faces it along the ring. */
export function foxAt(u: number): { at: V3; turn: number } {
  const a = TAU * u
  return { at: [RING * Math.sin(a), 0, RING * Math.cos(a)], turn: a + Math.PI / 2 }
}

/** Where the wisp is at `u`: circling the fox as it goes, bobbing. `behind` trails a mote along the same path. */
export function wispAt(u: number, behind = 0): V3 {
  const { at, turn } = foxAt(u), b = TAU * WISP.times * u - behind
  const x = WISP.aside * Math.sin(b), z = WISP.ahead * Math.cos(b)
  return [at[0] + x * Math.cos(turn) + z * Math.sin(turn), WISP.height + 0.07 * Math.sin(TAU * 7 * u - behind * 3) - behind * 0.12, at[2] + z * Math.cos(turn) - x * Math.sin(turn)]
}
/** The wisp and the three motes after it: how far behind each is, how big, and its color. */
export const LIGHTS = [{ behind: 0, r: 0.055, color: '#fff3b0' }, { behind: 0.3, r: 0.024, color: '#ffd166' }, { behind: 0.55, r: 0.024, color: '#ffd166' }, { behind: 0.78, r: 0.024, color: '#f5b060' }]

/**
 * The fox, standing, a meter long and facing +z, as round bars and balls: where each joint is. A leg is a thigh from
 * `top` to `elbow` that rides the body, a bar from the elbow to the `wrist` that swings about the elbow, and one from
 * the wrist to the `paw` that folds about the wrist.
 */
export const FOX = {
  body: { from: [0, 0.8, -0.48] as V3, to: [0, 0.82, 0.3] as V3, r: 0.18, rTo: 0.2, chest: { at: [0, 0.8, 0.32] as V3, r: [0.19, 0.25, 0.21] as V3 }, rump: { at: [0, 0.82, -0.42] as V3, r: [0.17, 0.19, 0.19] as V3 } },
  neck: { from: [0, 0.88, 0.48] as V3, to: [0, 1.12, 0.8] as V3, r: 0.17, rTo: 0.12 },
  head: { at: [0, 1.2, 0.9] as V3, r: [0.125, 0.115, 0.135] as V3 },
  muzzle: { from: [0, 1.17, 1.0] as V3, to: [0, 1.115, 1.31] as V3, r: 0.075, rTo: 0.026 },
  nose: { at: [0, 1.122, 1.33] as V3, r: 0.026 },
  cheek: { at: [0.1, 1.13, 0.9] as V3, r: [0.07, 0.065, 0.085] as V3 },
  ear: { from: [0.085, 1.29, 0.87] as V3, to: [0.17, 1.57, 0.85] as V3, r: 0.095, thin: 0.42 },
  eye: { at: [0.078, 1.228, 1.035] as V3, r: 0.024 },
  tail: [{ at: [0, 0.84, -0.58] as V3, r: 0.08 }, { at: [0, 0.8, -1.04] as V3, r: 0.17 }, { at: [0, 0.72, -1.52] as V3, r: 0.07 }],
  front: { x: 0.15, top: [0.135, 0.84, 0.44] as V3, elbow: [0.15, 0.6, 0.33] as V3, wrist: [0.15, 0.13, 0.37] as V3, paw: [0.15, 0.02, 0.41] as V3, r: [0.07, 0.05, 0.04, 0.036], dark: 0.48 },
  hind: { x: 0.16, top: [0.144, 0.8, -0.44] as V3, elbow: [0.16, 0.5, -0.28] as V3, wrist: [0.16, 0.22, -0.52] as V3, paw: [0.16, 0.02, -0.45] as V3, r: [0.085, 0.055, 0.044, 0.04], dark: 0.3 },
  colors: { fur: '#c85a22', deep: '#8f3a1c', pale: '#e8dcc0', dark: '#2a1c16', eye: '#f5b060' },
}
export const LEGS = ['fl', 'fr', 'bl', 'br'] as const
export type Leg = (typeof LEGS)[number]

/**
 * The trot at `u`: diagonal legs together. A paw pushes back while it is down and comes forward lifted, the front one
 * folded back at the wrist and the hind one tucked up. Angles in radians, about the fox's left-to-right line; the body
 * bobs twice a stride and the brush swings behind.
 */
export function trot(u: number) {
  const ph = TAU * STRIDES * u
  const leg = (front: boolean, off: number) => {
    const swing = Math.sin(ph + off), lift = Math.max(0, -Math.cos(ph + off))
    return front ? { upper: 0.4 * swing - 0.25 * lift, lower: 1.5 * lift } : { upper: 0.35 * swing + 0.25 * lift, lower: -0.8 * lift }
  }
  return {
    bob: 0.025 * Math.sin(ph * 2),
    legs: { fl: leg(true, 0), br: leg(false, 0), fr: leg(true, Math.PI), bl: leg(false, Math.PI) } as Record<Leg, { upper: number; lower: number }>,
    /** The brush: each half's swing to the side, and how far the first droops. */
    tail: { first: 0.35 * Math.sin(ph), second: 0.4 * Math.sin(ph - 0.8), droop: 0.15 },
  }
}

const turnX = (p: V3, a: number): V3 => [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)]
const turnY = (p: V3, a: number): V3 => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], p[2] * Math.cos(a) - p[0] * Math.sin(a)]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

/**
 * Every joint of the trotting fox at `u`, in the fox's own frame (a meter long, facing +z): for a renderer that wants
 * points, not turns. Each leg is [top, elbow, wrist, paw]; the tail its three points.
 */
export function foxJoints(u: number): { bob: number; legs: Record<Leg, V3[]>; tail: V3[] } {
  const g = trot(u), lift: V3 = [0, g.bob, 0]
  const legs = {} as Record<Leg, V3[]>
  for (const id of LEGS) {
    const k = id[0] === 'f' ? FOX.front : FOX.hind, side = id[1] === 'l' ? 1 : -1
    const at = (p: V3): V3 => [p[0] * side, p[1] + g.bob, p[2]]
    const top = at(k.top), elbow = at(k.elbow), a = g.legs[id]
    const wrist = add(elbow, turnX(sub(k.wrist, k.elbow), a.upper))
    const paw = add(wrist, turnX(sub(k.paw, k.wrist), a.upper + a.lower))
    legs[id] = [top, elbow, wrist, paw]
  }
  const [t0, t1, t2] = FOX.tail.map((t) => t.at)
  const mid = add(add(t0, lift), turnY(turnX(sub(t1, t0), g.tail.droop), g.tail.first))
  const tip = add(mid, turnY(turnX(sub(t2, t1), g.tail.droop), g.tail.first + g.tail.second))
  return { bob: g.bob, legs, tail: [add(t0, lift), mid, tip] }
}

/** A hex color as three numbers from 0 to 1. */
export const rgb = (hex: string): V3 => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255]
/** sRGB to linear light, one channel. */
export const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
