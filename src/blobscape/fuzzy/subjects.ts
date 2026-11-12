import { Blobs, normalise, type Quat } from '../../splat-core/blobs.ts'

/**
 * Three things to capture, each as a splat of any size (blob count): what a
 * trainer would give you at that budget. Fewer blobs means each one is bigger.
 * Light is baked into the colours, as it is in a real capture, so a mesh
 * wrapped round the blobs inherits the same shading.
 *
 *   grass  thin blades: a needle-shaped blob can be a whole blade segment
 *   fluff  a dandelion clock: see-through seed fluff round a solid centre
 *   block  a painted wooden block: flat faces and sharp corners
 */
export type SubjectId = 'grass' | 'fluff' | 'block'

type V3 = [number, number, number]

export interface Subject {
  blobs: Blobs
  /** Blade tips (grass only), for counting which blades a mesh kept. */
  tips: V3[]
}

/** A light from the upper front left, and some sky, baked into a colour by the surface's facing. */
export function shade(c: V3, n: V3, ambient = 0.55): V3 {
  const l = [-0.45, 0.75, 0.5]
  const ll = Math.hypot(l[0], l[1], l[2])
  const d = Math.abs((n[0] * l[0] + n[1] * l[1] + n[2] * l[2]) / ll)
  const k = ambient + (1 - ambient) * d
  return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]
}

/** The rotation whose x, y and z axes are the given (orthonormal) vectors. */
function quatFromBasis(x: V3, y: V3, z: V3): Quat {
  const m00 = x[0], m10 = x[1], m20 = x[2], m01 = y[0], m11 = y[1], m21 = y[2], m02 = z[0], m12 = z[1], m22 = z[2]
  const tr = m00 + m11 + m22
  let q: Quat
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2
    q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2
    q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2
    q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s]
  }
  return normalise(q)
}

const norm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

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

export const BLADES = 28

/** A tuft of grass blades: each a curved, tapering ribbon about 3 mm thick. */
export function grass(count: number): Subject {
  const r = rng(11)
  const per = Math.max(1, Math.floor(count / BLADES))
  const b = new Blobs(per * BLADES)
  const tips: V3[] = []
  for (let k = 0; k < BLADES; k++) {
    const a = (k / BLADES) * Math.PI * 2 + r() * 0.4
    const base: V3 = [Math.cos(a) * 0.09 * r(), 0, Math.sin(a) * 0.09 * r()]
    const lean = 0.25 + r() * 0.45
    const h = 0.55 + r() * 0.45
    const width = 0.022 + r() * 0.01
    const green: V3 = [0.25 + r() * 0.15, 0.55 + r() * 0.2, 0.15 + r() * 0.08]
    // The blade's centre line: up, curving outward
    const at = (t: number): V3 => [base[0] + Math.cos(a) * lean * t * t * h, h * t * (1 - 0.25 * t * t * lean), base[2] + Math.sin(a) * lean * t * t * h]
    tips.push(at(1))
    const side: V3 = [-Math.sin(a), 0, Math.cos(a)]
    for (let j = 0; j < per; j++) {
      const t = (j + 0.5) / per
      const p = at(t)
      const along = norm([at(Math.min(1, t + 0.01))[0] - at(Math.max(0, t - 0.01))[0], at(Math.min(1, t + 0.01))[1] - at(Math.max(0, t - 0.01))[1], at(Math.min(1, t + 0.01))[2] - at(Math.max(0, t - 0.01))[2]])
      const normal = norm(cross(side, along))
      const sideways = cross(along, normal)
      const w = width * (1 - 0.85 * t)
      const seg = (h / per) * 0.6
      const tone = 0.7 + 0.45 * t
      b.push({
        centre: p,
        scale: [w * 0.5, seg, 0.0015],
        quat: quatFromBasis(sideways, along, normal),
        colour: shade([green[0] * tone, green[1] * tone, green[2] * tone], normal, 0.6),
        opacity: 0.95,
      })
    }
  }
  return { blobs: b, tips }
}

/** A dandelion clock: a stem, a small solid centre, and a ball of faint seed fluff. */
export function fluff(count: number): Subject {
  const r = rng(23)
  const head: V3 = [0, 0.72, 0]
  const stemN = Math.max(6, Math.round(count * 0.06))
  const coreN = Math.max(12, Math.round(count * 0.1))
  const fluffN = Math.max(20, count - stemN - coreN)
  const b = new Blobs(stemN + coreN + fluffN)
  for (let j = 0; j < stemN; j++) {
    const t = (j + 0.5) / stemN
    b.push({ centre: [0.03 * Math.sin(t * 2), t * 0.68, 0], scale: [0.009, (0.68 / stemN) * 0.7, 0.009], quat: [0, 0, 0, 1], colour: shade([0.35, 0.55, 0.25], [1, 0, 0]), opacity: 0.95 })
  }
  for (let j = 0; j < coreN; j++) {
    const n = sphere(j, coreN, r)
    b.push({ centre: [head[0] + n[0] * 0.05, head[1] + n[1] * 0.05, head[2] + n[2] * 0.05], scale: [0.02, 0.02, 0.02], quat: [0, 0, 0, 1], colour: shade([0.75, 0.68, 0.45], n), opacity: 0.95 })
  }
  // Each seed: a fine thread out from the centre ending in a pale, see-through tuft
  const big = Math.min(0.05, 0.03 * Math.sqrt(400 / fluffN))
  for (let j = 0; j < fluffN; j++) {
    const n = sphere(j, fluffN, r)
    const d = 0.08 + 0.17 * Math.pow(r(), 0.35)
    b.push({
      centre: [head[0] + n[0] * d, head[1] + n[1] * d, head[2] + n[2] * d],
      scale: [big, big, big],
      quat: [0, 0, 0, 1],
      colour: shade([0.97, 0.96, 0.92], n, 0.8),
      opacity: 0.05 + 0.06 * r(),
    })
  }
  return { blobs: b, tips: [] }
}

/** The block's six faces: outward normal and the face's own u (right) and v (up) directions. */
export const BLOCK_FACES: { normal: V3; u: V3; v: V3 }[] = [
  { normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { normal: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  { normal: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { normal: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
]
export const BLOCK_SIDE = 0.4

/** The paint at (s, t) on a face, each from −½ to ½: wood, a blue band round the sides, a red square on the front. */
export function paint(normal: V3, s: number, t: number): V3 {
  if (normal[2] === 1 && Math.abs(s) < 0.18 && t > 0.15 && t < 0.42) return [0.85, 0.2, 0.18]
  if (normal[1] === 0 && Math.abs(t) < 0.1) return [0.2, 0.42, 0.85]
  return [0.86, 0.66, 0.42]
}

/** A wooden block, 40 cm a side, painted with a blue band and a red square. */
export function block(count: number): Subject {
  const side = BLOCK_SIDE
  const perFace = Math.max(1, Math.floor(count / 6))
  const n = Math.max(1, Math.floor(Math.sqrt(perFace)))
  const b = new Blobs(n * n * 6)
  const half = side / 2
  const cell = side / n
  for (const f of BLOCK_FACES) {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const s = (i + 0.5) / n - 0.5, t = (j + 0.5) / n - 0.5
      const p: V3 = [f.normal[0] * half + f.u[0] * s * side + f.v[0] * t * side, half + f.normal[1] * half + f.u[1] * s * side + f.v[1] * t * side, f.normal[2] * half + f.u[2] * s * side + f.v[2] * t * side]
      b.push({ centre: p, scale: [cell * 0.6, cell * 0.6, 0.002], quat: quatFromBasis(f.u, f.v, f.normal), colour: shade(paint(f.normal, s, t), f.normal), opacity: 0.98 })
    }
  }
  return { blobs: b, tips: [] }
}

/** Point j of n spread evenly over a unit sphere, with a little jitter. */
function sphere(j: number, n: number, r: () => number): V3 {
  const y = 1 - (2 * (j + 0.5)) / n
  const ring = Math.sqrt(Math.max(0, 1 - y * y))
  const phi = j * 2.399963 + r() * 0.2
  return [ring * Math.cos(phi), y, ring * Math.sin(phi)]
}

export const SUBJECTS: Record<SubjectId, (count: number) => Subject> = { grass, fluff, block }
