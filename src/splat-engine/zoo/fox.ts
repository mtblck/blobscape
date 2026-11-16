import type { Vec3 } from '../../splat-core/blobs.ts'
import { mix } from '../body.ts'
import { COATS, foxBones, poseIdle, poseWalk, type Coat } from '../creature.ts'
import { growFur, type FurryPart } from '../fur.ts'
import { flatten, sculptToCount, smooth, type SculptSpec } from '../sculpt.ts'
import { cone, ellipsoid } from '../voxel.ts'
import type { Species } from './species.ts'

const LABELS: Record<keyof typeof COATS, string> = { red: 'Red', arctic: 'Arctic', silver: 'Silver' }

/** The share of the fox's blobs that are its skin; the rest are strands of fur (fur.ts). */
const SKIN = 0.36

/**
 * The fox of the Creature page, on the bones and moves of the first creature
 * (creature.ts, which the rig lessons still use as it was), its tail hung a
 * little lower and longer. A slim body on long dark legs, a deep chest under
 * a white ruff, a narrow muzzle, big ears dark behind and pale within, amber
 * eyes, and a full brush of a tail tipped in white. The skin is cut the way
 * the pixel scenes are (sculpt.ts) and furred with strands that lie the way
 * a fox's coat runs: back along the body and head, down the legs and chest,
 * out from the cheeks, and out along the tail.
 */
function spec(c: Coat, s: number): SculptSpec & { parts: FurryPart[] } {
  const fat = (r: number) => Math.max(r, s * 0.6)
  const fur = c.fur
  const deep: Vec3 = mix(c.fur, c.dark, 0.28)
  const bones = foxBones()
  const bone = (name: string) => bones.find((b) => b.name === name)!
  // a fox's brush hangs low behind it
  bone('tail1').head = [0, 0.84, -0.58]
  bone('tail1').tail = [0, 0.8, -1.04]
  bone('tail2').head = [0, 0.8, -1.04]
  bone('tail2').tail = [0, 0.7, -1.62]

  // the coat: darker along the spine, pale underneath
  const coat = (_p: Vec3, n: Vec3): Vec3 => {
    if (n[1] < -0.45) return c.pale
    if (n[1] < -0.1) return mix(fur, c.pale, (-0.1 - n[1]) / 0.35)
    return n[1] > 0.7 ? mix(fur, deep, (n[1] - 0.7) / 0.3) : fur
  }
  // the white of the throat and chest, from the chin down between the front legs
  const bib = (p: Vec3, n: Vec3) => n[2] > 0.1 && n[1] < 0.35 && p[1] < 1.02 && Math.abs(p[0]) < 0.14 - (1.1 - p[1]) * 0.04 && p[1] > 0.52 && p[2] > 0.3

  const parts: FurryPart[] = [
    // the body: haunches, a long back and a deep chest
    {
      shape: smooth(0.12, cone([0, 0.8, -0.48], [0, 0.82, 0.3], 0.18, 0.2), ellipsoid([0, 0.8, 0.32], [0.19, 0.25, 0.21]), ellipsoid([0, 0.82, -0.42], [0.17, 0.19, 0.19])),
      color: (p, n) => (bib(p, n) ? c.pale : coat(p, n)), bones: ['hips', 'chest'],
      fur: { length: 0.055, flow: [0, -0.25, -1], lift: 0.3, long: (p, n) => (bib(p, n) ? 1.6 : n[1] < -0.4 ? 0.7 : 1) },
    },
    // the neck under its ruff, running up into the head
    {
      shape: smooth(0.08, cone([0, 0.88, 0.48], [0, 1.12, 0.8], 0.17, 0.12), ellipsoid([0, 0.92, 0.55], [0.18, 0.2, 0.17])),
      color: (p, n) => (bib(p, n) ? c.pale : coat(p, n)), bones: ['chest', 'neck', 'head'],
      // the ruff hangs down the front and lies back along the sides
      fur: { length: 0.08, flow: (_p, n) => (n[2] > 0.2 ? [0, -1, 0.15] : [0, -0.2, -1]), lift: 0.4, wild: 0.5, density: 1.4 },
    },
    // the head: a rounded skull and a long, narrow muzzle
    {
      shape: smooth(0.06, ellipsoid([0, 1.2, 0.9], [0.125, 0.115, 0.135]), cone([0, 1.17, 1.0], [0, 1.115, 1.31], 0.075, 0.026)),
      color: (p, n) => {
        // a dark line from the eye down the side of the muzzle
        if (p[2] > 1.06 && p[2] < 1.2 && Math.abs(Math.abs(p[0]) - (0.07 - (p[2] - 1.06) * 0.25)) < 0.012 && p[1] > 1.13 && p[1] < 1.19) return c.dark
        // the lip line
        if (p[2] > 1.04 && Math.abs(p[1] - (1.125 - (p[2] - 1.04) * 0.12)) < 0.006 && n[1] < 0.2) return c.dark
        if (n[1] < -0.15 || (p[2] > 1.04 && n[1] < 0.35)) return c.pale
        return coat(p, n)
      },
      bones: ['head'],
      fur: { length: 0.02, flow: (p) => [0, 0.15, p[2] > 1.05 ? 1 : -1], lift: 0.15, wild: 0.25, under: 0.85 },
    },
    // the nose
    { shape: ellipsoid([0, 1.122, 1.33], [0.028, 0.022, 0.024]), color: [0.08, 0.06, 0.06], bones: ['head'] },
    // the brush: full in the middle, tipped white
    {
      shape: smooth(0.1, cone([0, 0.84, -0.58], [0, 0.8, -1.04], 0.07, 0.15), cone([0, 0.8, -1.04], [0, 0.72, -1.52], 0.15, 0.06)),
      color: (p) => (p[2] < -1.46 ? c.pale : fur), bones: ['hips', 'tail1', 'tail2'],
      fur: {
        length: 0.14, flow: [0, -0.12, -1], lift: 0.38, wild: 0.5, density: 1.3,
        long: (p) => 0.6 + 0.5 * Math.min(1, (-0.58 - p[2]) / 0.35),
        color: (p) => (p[2] < -1.5 ? c.pale : p[2] < -1.4 ? mix(fur, c.pale, (-1.4 - p[2]) / 0.1) : fur),
      },
    },
  ]
  for (const x of [1, -1]) {
    const at = (p: Vec3): Vec3 => [p[0] * x, p[1], p[2]]
    const eye = at([0.078, 1.228, 1.035])
    parts.push(
      // cheek ruffs: white tufts that stand out and back under the ears
      {
        shape: ellipsoid(at([0.1, 1.13, 0.9]), [0.07, 0.065, 0.085]), color: c.pale, bones: ['head'],
        fur: { length: 0.065, flow: at([1, -0.45, -0.7]), lift: 0.45, wild: 0.45, density: 1.4 },
      },
      // big ears: dark behind and at the tip, pale within
      {
        shape: flatten(cone(at([0.085, 1.29, 0.87]), at([0.17, 1.57, 0.85]), 0.095, fat(0.014)), 0.42, 0.87),
        color: (p, n) => (p[1] > 1.47 || n[2] < -0.25 ? c.dark : n[2] > 0.3 && p[1] > 1.31 ? c.pale : fur), bones: ['head'],
        // short fur, and pale tufts standing up out of the ear
        fur: { length: 0.018, flow: [0, 1, 0], lift: 0.25, wild: 0.3, long: (p, n) => (n[2] > 0.3 && p[1] < 1.42 ? 2.2 : 1), under: 0.9 },
      },
      // amber eyes with a dark pupil, set into the head
      { shape: flatten(ellipsoid(eye, [0.026, 0.02, 0.03]), 0.7, eye[2]), color: (p) => (Math.abs(p[0] - eye[0]) < Math.max(0.007, s * 0.45) && Math.abs(p[1] - eye[1]) < 0.012 ? [0.04, 0.03, 0.03] : [0.95, 0.62, 0.12]), bones: ['head'], group: 'eyes', glow: true },
    )
  }
  // legs: an orange haunch or shoulder running into a slim dark leg and a small paw
  for (const leg of ['fl', 'fr', 'bl', 'br'] as const) {
    const up = bone(`${leg}Upper`).head, knee = bone(`${leg}Lower`).head, foot = bone(`${leg}Lower`).tail!
    const front = leg[0] === 'f'
    // the black stockings reach the elbow in front, the hock behind
    const top = front ? 0.5 : 0.36
    parts.push(
      {
        shape: smooth(0.06, ellipsoid([up[0] * 0.85, up[1] + 0.05, up[2] + (front ? 0 : -0.02)], front ? [0.085, 0.15, 0.1] : [0.11, 0.2, 0.15]), cone([up[0], up[1] + 0.04, up[2]], knee, 0.07, 0.048), cone(knee, [foot[0], foot[1] + 0.05, foot[2]], 0.045, 0.04)),
        color: (p, n) => (p[1] < top ? c.dark : p[1] < top + 0.06 ? mix(c.dark, coat(p, n), (p[1] - top) / 0.06) : coat(p, n)), bones: [front ? 'chest' : 'hips', `${leg}Upper`, `${leg}Lower`],
        fur: { length: 0.025, flow: [0, -1, 0], lift: 0.2, wild: 0.3, long: (p) => (p[1] > top + 0.05 ? 1.6 : 1) },
      },
      { shape: flatten(ellipsoid([foot[0], 0.035, foot[2] + 0.035], [0.05, 0.04, 0.08]), 1), color: c.dark, bones: [`${leg}Lower`] },
    )
  }
  return { bones, parts, blend: 0.1, skirt: Math.max(0.03, s * 2), light: { ambient: 0.62, shadow: 0.45 } }
}

export function makeFox(count = 20000, look = 'red') {
  const c = COATS[look as keyof typeof COATS] ?? COATS.red
  const skin = sculptToCount((s) => spec(c, s), count * SKIN, 0.05)
  const b = growFur(skin, spec(c, skin.spacing).parts, count)
  return { blobs: b.blobs, skin: b.skin, skeleton: b.skeleton }
}

export const FOX: Species = {
  id: 'fox',
  name: 'fox',
  blurb: 'A fox of fourteen bones in a coat of blob strands, with a white ruff, dark stockings and a white-tipped brush, with a trot and a look round.',
  detail: [5000, 20000, 60000, 120000],
  start: 20000,
  looks: (Object.keys(COATS) as (keyof typeof COATS)[]).map((id) => ({ id, label: LABELS[id] })),
  make: makeFox,
  moves: [
    { name: 'trot', label: 'Trot', doing: 'trotting on the spot', seconds: 1 / 1.4, fps: 24, pose: poseWalk },
    { name: 'idle', label: 'Stand', doing: 'standing and looking round', seconds: 4, fps: 12, pose: poseIdle },
  ],
  view: { target: [0, 0.72, 0], distance: 4.2, azimuth: 40, elevation: 12 },
}
