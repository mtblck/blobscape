import type { Vec3 } from '../../splat-core/blobs.ts'
import { mix } from '../body.ts'
import { COATS, foxBones, poseIdle, poseWalk, type Coat } from '../creature.ts'
import { flatten, scales, sculptToCount, smooth, type SculptPart, type SculptSpec } from '../sculpt.ts'
import { cone, displace, ellipsoid, type Shape } from '../voxel.ts'
import type { Species } from './species.ts'

const LABELS: Record<keyof typeof COATS, string> = { red: 'Red', arctic: 'Arctic', silver: 'Silver' }

/**
 * The fox of the Creature page, on the bones and moves of the first creature
 * (creature.ts, which the rig lessons still use as it was): cut the way the
 * pixel scenes are (sculpt.ts), with fur in tufts, a pale bib and belly,
 * cheek ruffs, a muzzle with a nose, amber eyes, ears dark behind and pale
 * within, socks with toes, and a brush of a tail tipped in white.
 */
function spec(c: Coat, s: number): SculptSpec {
  const fat = (r: number) => Math.max(r, s * 0.6)
  const fur: Vec3 = [Math.min(1, c.fur[0] * 1.13), Math.min(1, c.fur[1] * 1.13), Math.min(1, c.fur[2] * 1.13)]
  const TUFT = 0.055
  /** Fur stands in tufts: every cell of the pattern a low bump, deeper on the tail. */
  // a lock of fur is a scale drawn out along the body and lying back a little
  const lock = (p: ArrayLike<number>, a: number) => scales([p[0], p[1] + p[2] * 0.3, p[2] * 0.36], a)
  const tufty = (shape: Shape, h = 0.012, a = TUFT) => displace(shape, (x, y, z) => h * (1 - lock([x, y, z], a).out), h)
  // tufts a shade lighter or darker, a darker stripe down the back, pale underneath
  const coat = (p: Vec3, n: Vec3): Vec3 => {
    if (n[1] < -0.4) return c.pale
    const t = lock(p, TUFT)
    let base = t.id > 0.7 ? mix(fur, c.pale, 0.22) : t.id < 0.25 ? mix(fur, c.dark, 0.2) : fur
    if (n[1] > 0.75 && Math.abs(p[0]) < 0.07) base = mix(base, c.dark, 0.4)
    return t.out > 0.84 ? mix(base, c.dark, 0.25) : n[1] < -0.15 ? mix(base, c.pale, (-0.15 - n[1]) * 4) : base
  }
  const parts: SculptPart[] = [
    // trunk and neck as one coat, with a pale bib down the chest
    {
      shape: tufty(smooth(0.1, cone([0, 0.78, -0.55], [0, 0.84, 0.5], 0.25, 0.27), cone([0, 0.9, 0.55], [0, 1.15, 0.84], 0.18, 0.15), ellipsoid([0, 0.8, 0.5], [0.2, 0.24, 0.2]))),
      color: (p, n) => (p[2] > 0.52 && n[2] > 0.25 && p[1] < 1.1 && Math.abs(p[0]) < 0.14 ? c.pale : coat(p, n)), bones: ['hips', 'chest', 'neck', 'head'],
    },
    // the head: skull, cheek ruffs and muzzle
    {
      shape: tufty(smooth(0.05, cone([0, 1.2, 0.8], [0, 1.16, 1.02], 0.19, 0.16), ellipsoid([0.15, 1.12, 0.9], [0.1, 0.09, 0.1]), ellipsoid([-0.15, 1.12, 0.9], [0.1, 0.09, 0.1]), cone([0, 1.13, 1.0], [0, 1.1, 1.27], 0.09, 0.04)), 0.007),
      color: (p, n) => {
        if (p[2] > 1.0 && n[1] < 0.35) return Math.abs(p[1] - 1.085) < 0.008 && p[2] > 1.06 ? c.dark : c.pale
        if (n[1] < -0.2 || (Math.abs(p[0]) > 0.13 && p[1] < 1.14)) return c.pale
        return coat(p, n)
      },
      bones: ['head'],
    },
    { shape: ellipsoid([0, 1.115, 1.3], [0.036, 0.03, 0.03]), color: c.dark, bones: ['head'] },
    // the brush: thick, tufted deeper than the body, tipped pale
    { shape: tufty(smooth(0.06, cone([0, 0.86, -0.6], [0, 0.96, -1.1], 0.1, 0.19), cone([0, 0.96, -1.1], [0, 1.0, -1.52], 0.19, 0.07)), 0.03, 0.08), color: (p, n) => (p[2] < -1.34 ? c.pale : coat(p, n)), bones: ['hips', 'tail1', 'tail2'] },
  ]
  for (const x of [1, -1]) {
    const at = (p: Vec3): Vec3 => [p[0] * x, p[1], p[2]]
    const eye = at([0.1, 1.248, 1.08])
    parts.push(
      // ears: dark behind and at the tip, pale within
      { shape: flatten(cone(at([0.1, 1.33, 0.85]), at([0.135, 1.54, 0.83]), 0.07, fat(0.012)), 0.55, 0.84), color: (p, n) => (p[1] > 1.47 || n[2] < -0.3 ? c.dark : n[2] > 0.4 && p[1] > 1.36 ? c.pale : fur), bones: ['head'] },
      // amber eyes with a slit, under a dark lid
      { shape: ellipsoid(eye, [0.03, 0.027, 0.03]), color: (p) => (Math.abs(p[0] - eye[0]) < Math.max(0.008, s * 0.5) ? [0.04, 0.03, 0.03] : p[1] > eye[1] + 0.017 ? c.dark : [0.95, 0.66, 0.15]), bones: ['head'], group: 'eyes', glow: true },
      { shape: cone(at([0.05, 1.285, 1.12]), at([0.15, 1.295, 1.04]), fat(0.012), fat(0.008)), color: c.dark, bones: ['head'] },
    )
  }
  // legs: a haunch or shoulder running into a slim leg, a dark sock, a paw with three toes
  const bones = foxBones()
  for (const leg of ['fl', 'fr', 'bl', 'br'] as const) {
    const up = bones.find((b) => b.name === `${leg}Upper`)!.head, knee = bones.find((b) => b.name === `${leg}Lower`)!.head, foot = bones.find((b) => b.name === `${leg}Lower`)!.tail!
    const front = leg[0] === 'f'
    parts.push(
      {
        shape: tufty(smooth(0.05, ellipsoid([up[0] * 0.9, up[1] + 0.04, up[2]], front ? [0.1, 0.16, 0.12] : [0.12, 0.2, 0.17]), cone([up[0], up[1] + 0.06, up[2]], knee, 0.085, 0.06), cone(knee, [foot[0], foot[1] + 0.05, foot[2]], 0.06, 0.05)), 0.007),
        color: (p, n) => (p[1] < 0.26 ? c.dark : p[1] < 0.3 ? mix(c.dark, fur, (p[1] - 0.26) / 0.04) : coat(p, n)), bones: [front ? 'chest' : 'hips', `${leg}Upper`, `${leg}Lower`],
      },
      { shape: flatten(ellipsoid([foot[0], 0.04, foot[2] + 0.04], [0.065, 0.045, 0.095]), 1), color: (p) => (Math.abs(Math.abs(p[0] - foot[0]) - 0.022) < 0.006 && p[2] > foot[2] + 0.07 ? mix(c.dark, [0, 0, 0], 0.5) : c.dark), bones: [`${leg}Lower`] },
    )
  }
  return { bones, parts, blend: 0.1, light: { ambient: 0.7, shadow: 0.45 } }
}

export function makeFox(count = 20000, look = 'red') {
  const c = COATS[look as keyof typeof COATS] ?? COATS.red
  const b = sculptToCount((s) => spec(c, s), count, 0.05)
  return { blobs: b.blobs, skin: b.skin, skeleton: b.skeleton }
}

export const FOX: Species = {
  id: 'fox',
  name: 'fox',
  blurb: 'A fox of fourteen bones, in tufted fur with a white bib and a brush of a tail, with a trot and a look round.',
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
