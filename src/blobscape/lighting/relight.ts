import { Blobs, quatFacing } from '../../splat-core/blobs.ts'

/**
 * The Lighting is baked lesson's scene: a ball and a box on a table, "captured"
 * under one lamp. Every blob knows its true color (albedo) and its surface
 * normal, so the page can show the real thing under any lamp and score each
 * way of relighting the capture against it.
 *
 * Light here is plain diffuse: ambient + the lamp's facing (n·l), with hard
 * shadows from the ball and the box. A capture stores albedo × that light at
 * the moment of capture: the light is baked into the color.
 */

type V3 = [number, number, number]

export const AMBIENT = 0.28
export const STRENGTH = 0.95
/** The lamp sits on a circle round the scene, this far out and this high. */
export const LAMP_RADIUS = 2.4
export const LAMP_HEIGHT = 2
/** Where the lamp stood when the scene was captured (degrees round the circle). */
export const CAPTURED_AT = -55

const BALL = { center: [-0.35, 0.36, 0.1] as V3, radius: 0.36 }
const BOX = { lo: [0.12, 0, -0.38] as V3, hi: [0.62, 0.5, 0.12] as V3 }

export interface Scene {
  blobs: Blobs
  normal: Float32Array
  albedo: Float32Array
  /** 1 for blobs on the table (where shadows fall), 0 on the ball and box. */
  table: Uint8Array
}

export function lampAt(angleDeg: number): V3 {
  const a = (angleDeg * Math.PI) / 180
  return [Math.sin(a) * LAMP_RADIUS, LAMP_HEIGHT, Math.cos(a) * LAMP_RADIUS]
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildScene(detail = 1): Scene {
  const r = rng(3)
  const pos: V3[] = [], nrm: V3[] = [], alb: V3[] = [], size: number[] = [], onTable: number[] = []
  const add = (p: V3, n: V3, c: V3, s: number, t = 0) => { pos.push(p); nrm.push(n); alb.push(c); size.push(s); onTable.push(t) }
  // The table: a cloth with a faint check, so shadows and light show on it
  const N = Math.round(70 * Math.sqrt(detail))
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = -1.3 + (2.6 * (i + r())) / N, z = -1.1 + (2.2 * (j + r())) / N
    const check = (Math.floor((x + 2) * 3) + Math.floor((z + 2) * 3)) % 2 ? 0.06 : 0
    add([x, 0, z], [0, 1, 0], [0.78 - check, 0.74 - check, 0.68 - check], 1.5 / N, 1)
  }
  // The ball: terracotta
  const B = Math.round(2600 * detail)
  for (let k = 0; k < B; k++) {
    const y = 1 - (2 * (k + 0.5)) / B, ring = Math.sqrt(1 - y * y), phi = k * 2.399963
    const n: V3 = [ring * Math.cos(phi), y, ring * Math.sin(phi)]
    if (BALL.center[1] + n[1] * BALL.radius < 0.005) continue
    add([BALL.center[0] + n[0] * BALL.radius, BALL.center[1] + n[1] * BALL.radius, BALL.center[2] + n[2] * BALL.radius], n, [0.86, 0.42, 0.26], 0.03)
  }
  // The box: pale blue, five faces (the bottom sits on the table)
  const F = Math.round(26 * Math.sqrt(detail))
  const faces: { n: V3; at: (s: number, t: number) => V3 }[] = [
    { n: [0, 1, 0], at: (s, t) => [lerp(BOX.lo[0], BOX.hi[0], s), BOX.hi[1], lerp(BOX.lo[2], BOX.hi[2], t)] },
    { n: [1, 0, 0], at: (s, t) => [BOX.hi[0], lerp(BOX.lo[1], BOX.hi[1], t), lerp(BOX.lo[2], BOX.hi[2], s)] },
    { n: [-1, 0, 0], at: (s, t) => [BOX.lo[0], lerp(BOX.lo[1], BOX.hi[1], t), lerp(BOX.lo[2], BOX.hi[2], s)] },
    { n: [0, 0, 1], at: (s, t) => [lerp(BOX.lo[0], BOX.hi[0], s), lerp(BOX.lo[1], BOX.hi[1], t), BOX.hi[2]] },
    { n: [0, 0, -1], at: (s, t) => [lerp(BOX.lo[0], BOX.hi[0], s), lerp(BOX.lo[1], BOX.hi[1], t), BOX.lo[2]] },
  ]
  for (const f of faces) for (let i = 0; i < F; i++) for (let j = 0; j < F; j++) add(f.at((i + 0.5) / F, (j + 0.5) / F), f.n, [0.5, 0.66, 0.86], 0.5 / F / 1.3)

  const b = new Blobs(pos.length)
  for (let i = 0; i < pos.length; i++) b.push({ center: pos[i], scale: [size[i], size[i], size[i] * 0.15], quat: quatFacing(nrm[i]), color: alb[i], opacity: 0.98 })
  return { blobs: b, normal: Float32Array.from(nrm.flat()), albedo: Float32Array.from(alb.flat()), table: Uint8Array.from(onTable) }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Whether the segment from p toward the lamp is blocked by the ball or the box. */
function shadowed(p: ArrayLike<number>, lamp: V3): boolean {
  const d = [lamp[0] - p[0], lamp[1] - p[1], lamp[2] - p[2]]
  // Start a hair off the surface so a blob doesn't shadow itself
  const o = [p[0] + d[0] * 1e-3, p[1] + d[1] * 1e-3, p[2] + d[2] * 1e-3]
  // Ball: solve |o + t·d − c|² = r² for t in (0, 1)
  const oc = [o[0] - BALL.center[0], o[1] - BALL.center[1], o[2] - BALL.center[2]]
  const A = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], Bq = 2 * (oc[0] * d[0] + oc[1] * d[1] + oc[2] * d[2])
  const C = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - BALL.radius * BALL.radius * 0.995
  const disc = Bq * Bq - 4 * A * C
  if (disc > 0) {
    const t = (-Bq - Math.sqrt(disc)) / (2 * A)
    if (t > 0 && t < 1) return true
  }
  // Box: slab test
  let t0 = 0, t1 = 1
  for (let k = 0; k < 3; k++) {
    const lo = BOX.lo[k] + 1e-3, hi = BOX.hi[k] - 1e-3
    if (Math.abs(d[k]) < 1e-12) { if (o[k] < lo || o[k] > hi) return false; continue }
    let a = (lo - o[k]) / d[k], c = (hi - o[k]) / d[k]
    if (a > c) [a, c] = [c, a]
    t0 = Math.max(t0, a)
    t1 = Math.min(t1, c)
    if (t0 > t1) return false
  }
  return true
}

/** The light reaching blob i from a lamp: ambient plus facing, with or without the scene's shadows. */
export function lightOn(s: Scene, i: number, lamp: V3, shadows: boolean): number {
  const p = s.blobs.center.subarray(i * 3, i * 3 + 3)
  const d = [lamp[0] - p[0], lamp[1] - p[1], lamp[2] - p[2]]
  const len = Math.hypot(d[0], d[1], d[2])
  const facing = Math.max(0, (s.normal[i * 3] * d[0] + s.normal[i * 3 + 1] * d[1] + s.normal[i * 3 + 2] * d[2]) / len)
  if (facing > 0 && shadows && shadowed(p, lamp)) return AMBIENT
  return AMBIENT + STRENGTH * facing
}

export type Relight = 'captured' | 'add' | 'remove'

export interface RelightOptions {
  /** Where the new lamp stands (degrees). */
  lamp: number
  mode: Relight
  /** Your guess at where the capture's lamp stood, for taking its light out. */
  guess: number
  /** Whether the relighter knows the scene's shape, so it can take out and cast shadows. */
  shape: boolean
}

/** What the real scene looks like under the new lamp. */
export function truth(s: Scene, lamp: number): Float32Array {
  const L = lampAt(lamp)
  const out = new Float32Array(s.albedo.length)
  for (let i = 0; i < s.blobs.count; i++) {
    const k = lightOn(s, i, L, true)
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.min(1, s.albedo[i * 3 + c] * k)
  }
  return out
}

/** The capture: what the camera saw under the capture lamp. */
export function capture(s: Scene): Float32Array {
  return truth(s, CAPTURED_AT)
}

/**
 * The capture relit:
 *   captured  colors as stored, whatever the lamp does
 *   add       the stored colors times the new lamp, as live lights do (on top of the old light)
 *   remove    divide out a guess at the old light first, then light with the new one
 */
export function relight(s: Scene, captured: Float32Array, o: RelightOptions): Float32Array {
  if (o.mode === 'captured') return captured
  const L = lampAt(o.lamp), G = lampAt(o.guess)
  const out = new Float32Array(captured.length)
  for (let i = 0; i < s.blobs.count; i++) {
    let k: number
    if (o.mode === 'add') {
      // Live lights brighten the stored color by how much the new lamp faces it, round a mid gray
      k = lightOn(s, i, L, false) / (AMBIENT + STRENGTH * 0.5)
    } else {
      k = lightOn(s, i, L, o.shape) / lightOn(s, i, G, o.shape)
    }
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.min(1, captured[i * 3 + c] * k)
  }
  return out
}

/**
 * How close a relit capture is to the real thing under the same lamp: 1 is
 * exact. Errors are measured against how much the lamp itself changes the
 * scene, so leaving the capture as it is scores about 0 with the lamp far round.
 */
export function closeness(relit: Float32Array, real: Float32Array, captured: Float32Array): number {
  let err = 0, moved = 0
  for (let k = 0; k < real.length; k++) {
    err += Math.abs(relit[k] - real[k])
    moved += Math.abs(captured[k] - real[k])
  }
  return moved < 1e-6 ? 1 : 1 - err / moved
}

/** Mean error on the table only, where cast shadows fall (0–1 per channel). */
export function tableError(s: Scene, relit: Float32Array, real: Float32Array): number {
  let err = 0, n = 0
  for (let i = 0; i < s.blobs.count; i++) {
    if (!s.table[i]) continue
    for (let c = 0; c < 3; c++) err += Math.abs(relit[i * 3 + c] - real[i * 3 + c])
    n += 3
  }
  return n ? err / n : 0
}
