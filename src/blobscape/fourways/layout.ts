/**
 * The campfire written out by hand, as someone building it without Blobscape would: where things stand and how they
 * move, as plain numbers. The shader panel and the three.js panel both read it; the Blobscape and Spark panels do not
 * (they use the scene's description, `diorama/scenes/campfire.ts`). Kept free of any renderer so Node can test it.
 */
export type V3 = [number, number, number]

export const LOOP = 12
const TAU = Math.PI * 2

/** Where the fire is, and its two flames: the cone each is, the point it turns and swells about. */
export const FIRE: V3 = [0.1, 0.05, 0.25]
export const FIRE_LIGHT = { at: [0.1, 0.3, 0.25] as V3, color: '#f59a2a', strength: 3, range: 1.3 }
export const LANTERN_LIGHT = { at: [-0.3, 0.45, -0.5] as V3, color: '#ffd166', strength: 1.2, range: 0.4 }
/** The moon's light: where it comes from, how much there is without it, and how dark its shadows are. */
export const MOONLIGHT = { from: [-0.4, 0.8, 0.45] as V3, ambient: 0.5, shadow: 0.7 }
export const HAZE = { color: '#141c36', from: 1, to: 7 }
export const SKY: [string, string] = ['#0a0f1e', '#1f2d55']

/** Seven pines: where each stands, how tall its trunk is, and how it sways (degrees, times a loop, share of a turn it starts at). */
export const PINES = [
  { at: [-1.25, -0.85], trunk: 0.6 }, { at: [-0.55, -1.3], trunk: 0.78 }, { at: [0.3, -1.35], trunk: 0.64 }, { at: [1.0, -1.0], trunk: 0.74 },
  { at: [1.42, -0.2], trunk: 0.52 }, { at: [-1.5, 0.1], trunk: 0.48 }, { at: [1.3, 0.8], trunk: 0.36 },
].map((p, i) => ({ ...p, sway: [1.6, 1.9, 2.2][i % 3], times: i % 2 ? 4 : 3, phase: i * 0.13 }))

/** A pine's four tiers of needles for a trunk of height `h`: each a cone frustum from `y`, `height` tall, `r` wide at its foot. */
export const tiers = (h: number) => [0, 1, 2, 3].map((k) => ({ y: h * (0.55 + 0.475 * k), height: h * 0.675, r: h * (0.675 - 0.1375 * k), top: h * (0.675 - 0.1375 * k) * 0.2 }))
export const trunkRadius = (h: number) => 0.03 + 0.03 * h

/** The ring of nine stones round the fire. */
export const STONES = Array.from({ length: 9 }, (_, k) => ({ at: [0.1 + 0.22 * Math.cos((k * TAU) / 9), 0.03, 0.25 + 0.22 * Math.sin((k * TAU) / 9)] as V3, r: k % 2 ? 0.055 : 0.065 }))
export const LOGS: [V3, V3][] = [[[-0.05, 0.03, 0.2], [0.24, 0.1, 0.3]], [[0.22, 0.03, 0.14], [0.02, 0.1, 0.34]], [[0.1, 0.03, 0.4], [0.1, 0.11, 0.12]]]
export const ROCKS: { at: V3; r: V3 }[] = [{ at: [0.9, 0.08, -0.35], r: [0.24, 0.18, 0.2] }, { at: [-1.1, 0.06, 0.75], r: [0.2, 0.14, 0.17] }, { at: [0.55, 0.04, 1.15], r: [0.13, 0.09, 0.11] }]
export const BUSHES: { at: V3; r: number }[] = [
  { at: [-0.2, 0.07, -0.95], r: 0.13 }, { at: [0.65, 0.06, -0.85], r: 0.11 }, { at: [-1.2, 0.06, -0.3], r: 0.1 },
  { at: [1.25, 0.06, 0.3], r: 0.11 }, { at: [-0.75, 0.05, 1.1], r: 0.09 }, { at: [0.1, 0.05, 1.3], r: 0.08 },
]
export const MUSHROOMS: [number, number][] = [[0.75, 0.2], [0.82, 0.28], [-0.55, 0.95], [1.05, -0.6], [-1.0, 0.35], [0.3, 0.95]]
export const MOON = { at: [-1.5, 2.7, -1.7] as V3, r: 0.2, color: '#f4f1e4' }
export const STARS: V3[] = [
  [-0.6, 2.9, -1.8], [0.3, 3.1, -1.8], [1.3, 2.8, -1.7], [1.8, 2.2, -1.4], [0.8, 2.4, -1.9], [-0.1, 2.5, -1.9], [-1.9, 2.0, -1.2],
  [1.0, 3.3, -1.5], [-1.0, 3.3, -1.6], [1.9, 3.0, -0.8], [-2.0, 2.9, -0.7], [0.5, 2.0, -1.9],
]

const wave = (x: number) => Math.sin(x * TAU)

/** The two flames at `u` (the share of the loop gone by): how big each is and how far it leans, in radians. */
export function flames(u: number) {
  return {
    flame: { size: 0.82 + 0.3 * (0.5 + 0.5 * wave(u * 9)), lean: (wave(u * 7) * 7 * Math.PI) / 180 },
    core: { size: 0.75 + 0.45 * (0.5 + 0.5 * wave(u * 13 + 0.3)), lean: (wave(u * 8) * 9 * Math.PI) / 180 },
  }
}

/** How far a pine leans at `u`, in radians. */
export const pineLean = (i: number, u: number) => (wave(u * PINES[i].times + PINES[i].phase) * PINES[i].sway * Math.PI) / 180

/** How bright the fire is at `u`, about 1: two flickers out of step. */
export const flicker = (u: number) => 1 + 0.25 * (0.6 * wave(u * 11) + 0.4 * Math.sin(u * 33 * TAU + 1.3))

/** A small thing that gives off light: a spark, an ember, a firefly, a star, the moon. */
export interface Speck { at: V3; r: number; color: string }

/** A run of numbers from 0 up to 1 that is the same every time. */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

const SPARKS: V3[] = [[0.16, 0.75, 0.05], [-0.12, 0.85, 0.1], [0.05, 0.95, -0.14], [-0.06, 0.75, -0.05], [0.2, 0.85, 0.12], [-0.18, 0.95, -0.1]]
const FLIES: V3[] = [[-0.5, 0.5, 0.9], [0.9, 0.7, 0.9], [1.2, 0.45, -0.5], [-1.1, 0.8, -0.5], [0.4, 0.9, -0.9], [-0.2, 0.35, 1.2], [0.6, 0.3, 0.45]]
const rand = seeded(7)
const EMBERS = Array.from({ length: 30 }, () => {
  const seconds = 2.2 * (0.7 + 0.6 * rand())
  return { x: -0.05 + 0.3 * rand(), z: 0.1 + 0.3 * rand(), times: Math.max(1, Math.round(LOOP / seconds)), phase: rand(), wx: 1 + Math.floor(rand() * 2), wz: 1 + Math.floor(rand() * 2), px: rand(), pz: rand(), color: ['#f59a2a', '#ffd166', '#d9541e'][Math.floor(rand() * 3)] }
})

/** How big a speck is at its biggest: about one pixel of the art from where the camera starts, or it would fall between pixels. */
const SPECK = 0.024

/** How many specks `specks` gives: the same count every frame. */
export const SPECKS = SPARKS.length + FLIES.length + EMBERS.length + STARS.length + 1

/** Every glowing speck at `u`: sparks thrown by the fire, embers rising, fireflies, the stars and the moon. A speck that is out for now has no size. */
export function specks(u: number): Speck[] {
  const out: Speck[] = []
  const frac = (x: number) => x - Math.floor(x)
  SPARKS.forEach((by, i) => {
    const life = frac(u * (i % 2 ? 4 : 3) + i / 6), size = Math.sin(Math.PI * life) ** 0.6 * (1.2 - 0.7 * life)
    out.push({ at: [0.1 + by[0] * life, 0.4 + by[1] * life, 0.25 + by[2] * life], r: SPECK * size, color: i % 2 ? '#ffd166' : '#f59a2a' })
  })
  FLIES.forEach((at, i) => {
    const a = wave(u * (i % 2 ? 3 : 2) + i * 0.17), b = wave(u * 5 + ((i * 0.31) % 1))
    const size = 0.2 + 1.1 * (0.5 + 0.5 * wave(u * (4 + (i % 3)) + ((i * 0.23) % 1)))
    out.push({ at: [at[0] + (i % 2 ? 0.16 : -0.12) * a, at[1] + 0.07 * a + 0.09 * b, at[2] + (i % 2 ? 0.1 : i % 4 ? 0.1 : -0.14) * a], r: SPECK * size, color: '#fff3b0' })
  })
  for (const e of EMBERS) {
    const life = frac(u * e.times + e.phase), size = Math.sin(Math.PI * life) ** 0.6 * (1 - 0.6 * life)
    out.push({ at: [e.x + 0.05 * life * wave(u * e.wx * e.times + e.px), 0.25 + 1.55 * life, e.z + 0.05 * life * wave(u * e.wz * e.times + e.pz)], r: SPECK * size, color: e.color })
  }
  STARS.forEach((at, i) => out.push({ at, r: SPECK, color: i % 3 ? '#f4f1e4' : '#c2c0cc' }))
  out.push({ at: MOON.at, r: MOON.r, color: MOON.color })
  return out
}

/** A hex color as three numbers from 0 to 1. */
export const rgb = (hex: string): V3 => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255]
/** sRGB to linear light, one channel. */
export const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
