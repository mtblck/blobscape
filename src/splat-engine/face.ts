import type { Blobs, Vec3 } from '../splat-core/blobs.ts'
import type { Built } from './body.ts'
import { targetFrom, shares, type Morph } from './morph.ts'
import { neighborPairs, stretch } from './pose.ts'
import { buildVoxels, sphere, type Shape } from './voxel.ts'

/**
 * A face for the Morphs lesson: a round head with two eyes, lids, a nose and a
 * painted mouth, and three morphs (morph.ts). No bones move: every change is a
 * morph.
 *
 * - smile: the mouth's corners rise and its middle dips. Run backward it is a frown.
 * - puff: both cheeks swell, which pulls their blobs apart.
 * - blink: each lid turns down round its eye. A morph is a straight line, so
 *   with one target the lid cuts through the eyeball on the way; in-between
 *   targets (`BLINK_STEPS`) keep it on the surface.
 */
const C: Vec3 = [0, 1, 0]
const R = 0.75
const EYE_R = 0.16
const LID_R = EYE_R * 1.15
const EYES: Vec3[] = [[-0.26, 1.15, 0.66], [0.26, 1.15, 0.66]]
const MOUTH: Vec3 = [0, 0.7, 0.68]
const MOUTH_HALF = 0.26
/** The open lid is a cap on the eye's ball, centered this far up from straight ahead, reaching `LID_REACH` each way. */
const LID_UP = (108 * Math.PI) / 180
const LID_REACH = (72 * Math.PI) / 180
/** How far a lid turns to close. */
export const LID_TURN = (80 * Math.PI) / 180
/** The choices of in-between shapes for the blink: its targets, counting the closed one. */
export const BLINK_STEPS = [1, 2, 4] as const

const SKIN: Vec3 = [0.98, 0.78, 0.6]
const LID: Vec3 = [0.8, 0.5, 0.42]
const cheek = (side: number): Vec3 => {
  const d: Vec3 = [side * 0.62, -0.08, 0.5], l = Math.hypot(...d)
  return [C[0] + (d[0] / l) * R, C[1] + (d[1] / l) * R, C[2] + (d[2] / l) * R]
}
const CHEEKS = [cheek(-1), cheek(1)]

/** A lid: a thin shell over the top of the eye's ball, so there is nothing of it inside the eye. */
function lidShape(e: Vec3, spacing: number): Shape {
  const uy = Math.sin(LID_UP), uz = Math.cos(LID_UP), edge = LID_R * Math.cos(LID_REACH), inner = LID_R - spacing * 1.5
  return {
    sdf: (x, y, z) => { const d = Math.hypot(x - e[0], y - e[1], z - e[2]); return Math.max(d - LID_R, inner - d, edge - ((y - e[1]) * uy + (z - e[2]) * uz)) },
    min: [e[0] - LID_R, e[1] - LID_R, e[2] - LID_R], max: [e[0] + LID_R, e[1] + LID_R, e[2] + LID_R],
  }
}

export interface Face {
  body: Built
  /** smile, puff, then the blink with 1, 2 and 4 targets (pick one of the three). */
  smile: Morph
  puff: Morph
  blinks: Morph[]
  /** Neighboring blobs on one cheek, for measuring how far a puff pulls them apart. */
  cheekPairs: Uint32Array
  /** The blobs of the lids, and the eye each rides on. */
  lidBlobs: { i: number; eye: Vec3 }[]
}

/** Where the smile takes a point of the rest face. */
function smileAt(p: Vec3): Vec3 {
  const d2 = (p[0] - MOUTH[0]) ** 2 + (p[1] - MOUTH[1]) ** 2 + (p[2] - MOUTH[2]) ** 2
  const fall = Math.exp(-d2 / (2 * 0.3 * 0.3))
  const x = p[0] / MOUTH_HALF
  return [p[0] + Math.tanh(x) * 0.035 * fall, p[1] + 0.15 * (x * x - 0.35) * fall, p[2]]
}

/** Where the puff takes it: out from the head's middle, most at each cheek. */
function puffAt(p: Vec3): Vec3 {
  let push = 0
  for (const c of CHEEKS) push += 0.42 * Math.exp(-((p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2) / (2 * 0.2 * 0.2))
  const n: Vec3 = [p[0] - C[0], p[1] - C[1], p[2] - C[2]], l = Math.hypot(...n) || 1
  return [p[0] + (n[0] / l) * push, p[1] + (n[1] / l) * push, p[2] + (n[2] / l) * push]
}

/** A point turned about the level axis through an eye, top toward the front. */
function turnLid(p: Vec3, e: Vec3, a: number): Vec3 {
  const y = p[1] - e[1], z = p[2] - e[2], c = Math.cos(a), s = Math.sin(a)
  return [p[0], e[1] + c * y - s * z, e[2] + s * y + c * z]
}

export function makeFace(spacing = 0.028): Face {
  const head = sphere(C, R)
  const body = buildVoxels({
    spacing,
    light: { dir: [-0.35, 0.6, 0.72], ambient: 0.55, shadow: 0.35 },
    bones: [{ name: 'head', parent: -1, head: [0, 0, 0] }, { name: 'lids', parent: 0, head: [0, 0, 0] }],
    parts: [
      {
        shape: head, bone: 'head',
        // the mouth is paint: a dark line that the smile's morph carries with the blobs under it
        color: (p) => (p[2] > 0 && Math.abs(p[0]) < MOUTH_HALF && Math.abs(p[1] - MOUTH[1]) < Math.max(spacing * 0.75, 0.028) ? [0.42, 0.12, 0.14] : SKIN),
      },
      ...EYES.map((e) => ({
        shape: sphere(e, EYE_R), bone: 'head',
        color: (_p: Vec3, n: Vec3): Vec3 => (n[2] > 0.9 ? [0.06, 0.06, 0.1] : n[2] > 0.72 ? [0.2, 0.45, 0.75] : [0.97, 0.97, 0.95]),
      })),
      { shape: sphere([0, 0.99, 0.76], 0.075), bone: 'head', color: [0.95, 0.66, 0.52] as Vec3 },
      ...EYES.map((e) => ({ shape: lidShape(e, spacing), bone: 'lids', color: LID })),
    ],
  })
  const rest = body.blobs
  const firstLid = 2 + EYES.length
  const lidBlobs: Face['lidBlobs'] = []
  for (let i = 0; i < rest.count; i++) if (body.partOf[i] >= firstLid) lidBlobs.push({ i, eye: EYES[body.partOf[i] - firstLid] })
  const eyeOf = new Map(lidBlobs.map((l) => [l.i, l.eye]))
  const still = (i: number) => eyeOf.has(i)

  const smile: Morph = { name: 'smile', targets: [targetFrom(rest, (p, i) => (still(i) ? null : smileAt(p)))] }
  const puff: Morph = { name: 'puff', targets: [targetFrom(rest, (p, i) => (still(i) ? null : puffAt(p)))] }
  const blinks = BLINK_STEPS.map((steps): Morph => ({
    name: 'blink',
    targets: Array.from({ length: steps }, (_, k) => targetFrom(rest, (p, i) => { const e = eyeOf.get(i); return e ? turnLid(p, e, (LID_TURN * (k + 1)) / steps) : null })),
  }))

  const c = CHEEKS[1]
  const cheekPairs = neighborPairs(rest, (i) => !still(i) && Math.hypot(rest.center[i * 3] - c[0], rest.center[i * 3 + 1] - c[1], rest.center[i * 3 + 2] - c[2]) < 0.16)
  return { body, smile, puff, blinks, cheekPairs, lidBlobs }
}

/** How far apart a pose has pulled the blobs of a cheek: 1 is as built, 2 is twice the spacing. */
export function cheekSpread(face: Face, posed: Blobs) {
  return stretch(face.cheekPairs, face.body.blobs, posed, 0.9)
}

/**
 * How far the lids sink toward the middle of their eyes with the blink at `w`,
 * as a share of the radius each of their blobs should ride at: 0 on the surface. A lid
 * moving in a straight line between two shapes cuts the corner.
 */
export function lidDip(face: Face, blink: Morph, w: number) {
  const [a, b, u] = shares(blink.targets.length, w)
  const rest = face.body.blobs.center
  let worst = 0
  for (const { i, eye } of face.lidBlobs) {
    const r0 = Math.hypot(rest[i * 3] - eye[0], rest[i * 3 + 1] - eye[1], rest[i * 3 + 2] - eye[2])
    const p = [0, 1, 2].map((k) => rest[i * 3 + k] + (a >= 0 ? blink.targets[a].delta[i * 3 + k] * (1 - u) : 0) + blink.targets[b].delta[i * 3 + k] * u)
    worst = Math.max(worst, 1 - Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]) / r0)
  }
  return worst
}

/** The deepest the lids sink anywhere on the way from open to shut. */
export function worstLidDip(face: Face, blink: Morph) {
  let worst = 0
  for (let k = 0; k <= 32; k++) worst = Math.max(worst, lidDip(face, blink, k / 32))
  return worst
}
