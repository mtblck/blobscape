import type { Vec3 } from '../../splat-core/blobs.ts'
import { buildBody, mirror, mix, type BodySpec, type Part } from '../body.ts'
import type { Bone, Skeleton } from '../rig.ts'
import { X, Y, Z, aim, dir, env, set, turn } from '../posing.ts'
import { flatten, membrane, sculptToCount, smooth, type SculptPart, type SculptSpec } from '../sculpt.ts'
import { box, cone, cut, ellipsoid } from '../voxel.ts'
import type { Species } from './species.ts'

/**
 * An elf, standing, facing +z: a humanoid of 29 bones (a spine of three, a
 * neck and head, arms with hands and fingers, legs with feet and toes, a plait
 * of hair and a cape of two each side). More of its detail is in shape than
 * in blobs: a tunic over the body, a belt and buckle, boots, bracers, a
 * quiver, pointed ears and a face.
 */

const SIDES = [['l', 1], ['r', -1]] as const
const sided = (x: number, p: Vec3): Vec3 => (x > 0 ? p : mirror(p))

const BONES: Bone[] = [
  { name: 'hips', parent: -1, head: [0, 0.98, 0] },
  { name: 'spine', parent: 0, head: [0, 1.1, 0] },
  { name: 'chest', parent: 1, head: [0, 1.28, 0] },
  { name: 'neck', parent: 2, head: [0, 1.5, 0] },
  { name: 'head', parent: 3, head: [0, 1.6, 0.01], tail: [0, 1.86, 0.01] },
  { name: 'hair1', parent: 4, head: [0, 1.7, -0.1] },
  { name: 'hair2', parent: 5, head: [0, 1.48, -0.13], tail: [0, 1.22, -0.14] },
]
for (const [s, x] of SIDES) {
  const clav = BONES.length
  BONES.push(
    { name: `${s}Shoulder`, parent: 2, head: sided(x, [0.04, 1.44, 0]) },
    { name: `${s}Arm`, parent: clav, head: sided(x, [0.2, 1.44, -0.01]) },
    { name: `${s}Forearm`, parent: clav + 1, head: sided(x, [0.27, 1.17, -0.02]) },
    { name: `${s}Hand`, parent: clav + 2, head: sided(x, [0.31, 0.94, 0.01]) },
    { name: `${s}Fingers`, parent: clav + 3, head: sided(x, [0.325, 0.87, 0.02]), tail: sided(x, [0.335, 0.79, 0.025]) },
  )
}
for (const [s, x] of SIDES) {
  const thigh = BONES.length
  BONES.push(
    { name: `${s}Thigh`, parent: 0, head: sided(x, [0.1, 0.94, 0]) },
    { name: `${s}Shin`, parent: thigh, head: sided(x, [0.105, 0.52, 0.015]) },
    { name: `${s}Foot`, parent: thigh + 1, head: sided(x, [0.11, 0.09, -0.02]) },
    { name: `${s}Toe`, parent: thigh + 2, head: sided(x, [0.11, 0.025, 0.1]), tail: sided(x, [0.11, 0.02, 0.18]) },
  )
}
for (const [s, x] of SIDES) {
  const cape = BONES.length
  BONES.push(
    { name: `${s}Cape1`, parent: 2, head: sided(x, [0.12, 1.42, -0.13]) },
    { name: `${s}Cape2`, parent: cape, head: sided(x, [0.16, 1.05, -0.18]), tail: sided(x, [0.2, 0.62, -0.22]) },
  )
}

interface Colors { tunic: Vec3; trim: Vec3; cape: Vec3; hair: Vec3; skin: Vec3 }
const LOOKS: Record<string, Colors & { label: string }> = {
  forest: { label: 'Forest', tunic: [0.2, 0.46, 0.28], trim: [0.86, 0.7, 0.3], cape: [0.13, 0.3, 0.26], hair: [0.94, 0.84, 0.56], skin: [0.95, 0.79, 0.67] },
  dusk: { label: 'Dusk', tunic: [0.32, 0.25, 0.55], trim: [0.82, 0.84, 0.9], cape: [0.16, 0.14, 0.3], hair: [0.88, 0.9, 0.94], skin: [0.72, 0.56, 0.48] },
  autumn: { label: 'Autumn', tunic: [0.66, 0.3, 0.14], trim: [0.94, 0.78, 0.36], cape: [0.4, 0.2, 0.1], hair: [0.52, 0.22, 0.1], skin: [0.96, 0.82, 0.72] },
}
const LEATHER: Vec3 = [0.36, 0.22, 0.12], DARK_LEATHER: Vec3 = [0.2, 0.13, 0.08], LEGGINGS: Vec3 = [0.3, 0.27, 0.2], EYE: Vec3 = [0.1, 0.22, 0.3], WHITE: Vec3 = [0.95, 0.95, 0.92], LIPS: Vec3 = [0.75, 0.42, 0.4]

function spec(c: Colors): BodySpec {
  const head: Vec3 = [0, 1.71, 0.015]
  // the face shows at the front; hair covers the top and back, swept behind the ears
  const scalp = (p: Vec3, n: Vec3): Vec3 => (n[2] > 0.35 && p[1] < 1.79 ? c.skin : n[1] > -0.1 || n[2] < 0.1 ? c.hair : c.skin)
  const tunic = (p: Vec3): Vec3 => (Math.abs(p[1] - 1.42) < 0.015 || Math.abs(p[1] - 0.74) < 0.02 ? c.trim : c.tunic)
  const parts: Part[] = [
    // head, face and features
    { shape: { ball: head, r: [0.092, 0.115, 0.108] }, color: scalp, bones: ['head'], density: 2 },
    { shape: { ball: [0, 1.655, 0.045], r: [0.068, 0.06, 0.07] }, color: c.skin, bones: ['head'], density: 2 },
    { shape: { tube: [[0, 1.72, 0.105], [0, 1.68, 0.125]], r: [0.012, 0.016] }, color: c.skin, bones: ['head'], density: 4 },
    { shape: { tube: [[-0.02, 1.638, 0.112], [0.02, 1.638, 0.112]], r: [0.008, 0.008] }, color: LIPS, bones: ['head'], density: 4 },
    { shape: { ball: [0, 1.81, -0.02], r: [0.1, 0.05, 0.11] }, color: c.hair, bones: ['head'] },
    { shape: { tube: [[0, 1.7, -0.1], [0, 1.24, -0.14]], r: [0.06, 0.025], flat: 0.7 }, color: (p) => (Math.sin(p[1] * 70) > 0.6 ? mix(c.hair, [0, 0, 0], 0.18) : c.hair), bones: ['head', 'hair1', 'hair2'] },
    { shape: { tube: [[0, 1.55, 0], [0, 1.43, 0]], r: [0.045, 0.055] }, color: c.skin, bones: ['neck', 'chest'] },
    // body: a tunic belted at the waist, flaring to a skirt
    { shape: { tube: [[0, 1.03, 0], [0, 1.38, 0]], r: [0.125, 0.16], flat: 0.62 }, color: tunic, bones: ['hips', 'spine', 'chest'] },
    { shape: { tube: [[0, 1.0, 0], [0, 1.045, 0]], r: [0.13, 0.132], flat: 0.7 }, color: (_p, n) => (n[2] > 0.85 ? c.trim : LEATHER), bones: ['hips', 'spine'], density: 1.5 },
    { shape: { tube: [[0, 0.99, 0], [0, 0.72, 0]], r: [0.132, 0.2], flat: 0.75 }, color: tunic, bones: ['hips', 'lThigh', 'rThigh'] },
    // a quiver slung across the back, with fletching
    { shape: { tube: [[-0.12, 1.06, -0.13], [0.1, 1.5, -0.15]], r: [0.045, 0.05] }, color: LEATHER, bones: ['chest', 'spine'] },
    { shape: { ball: [0.12, 1.55, -0.15], r: [0.05, 0.035, 0.04] }, color: WHITE, bones: ['chest'], density: 2 },
  ]
  for (const [s, x] of SIDES) {
    const elbow = sided(x, [0.27, 1.17, -0.02]), wrist = sided(x, [0.31, 0.94, 0.01])
    parts.push(
      // eyes: white, then a colored iris
      { shape: { ball: sided(x, [0.033, 1.705, 0.111]), r: [0.017, 0.011, 0.008] }, color: (_p, n) => (n[2] > 0.82 ? EYE : WHITE), bones: ['head'], density: 6 },
      { shape: { tube: [sided(x, [0.012, 1.733, 0.12]), sided(x, [0.054, 1.737, 0.108])], r: [0.006, 0.004] }, color: mix(c.hair, [0, 0, 0], 0.35), bones: ['head'], density: 6 },
      // long pointed ears, sweeping back
      { shape: { tube: [sided(x, [0.085, 1.7, 0.0]), sided(x, [0.18, 1.8, -0.06])], r: [0.028, 0.004], flat: 0.45 }, color: c.skin, bones: ['head'], density: 3 },
      { shape: { ball: sided(x, [0.175, 1.43, -0.01]), r: [0.07, 0.065, 0.07] }, color: c.tunic, bones: ['chest', `${s}Shoulder`, `${s}Arm`] },
      { shape: { tube: [sided(x, [0.2, 1.42, -0.01]), elbow], r: [0.05, 0.042] }, color: c.tunic, bones: [`${s}Arm`, `${s}Forearm`] },
      { shape: { tube: [elbow, wrist], r: [0.044, 0.034] }, color: (p) => (p[1] < 1.08 ? DARK_LEATHER : c.tunic), bones: [`${s}Arm`, `${s}Forearm`, `${s}Hand`] },
      { shape: { ball: sided(x, [0.315, 0.905, 0.015]), r: [0.022, 0.045, 0.038] }, color: c.skin, bones: [`${s}Hand`, `${s}Forearm`], density: 2 },
      { shape: { tube: [sided(x, [0.325, 0.87, 0.02]), sided(x, [0.335, 0.795, 0.025])], r: [0.02, 0.012], flat: 0.6 }, color: c.skin, bones: [`${s}Fingers`], density: 2 },
      { shape: { tube: [sided(x, [0.31, 0.91, 0.04]), sided(x, [0.3, 0.86, 0.065])], r: [0.011, 0.008] }, color: c.skin, bones: [`${s}Hand`], density: 3 },
    )
    const knee = sided(x, [0.105, 0.52, 0.015]), ankle = sided(x, [0.11, 0.09, -0.02])
    parts.push(
      { shape: { tube: [sided(x, [0.09, 0.9, 0]), knee], r: [0.078, 0.055] }, color: LEGGINGS, bones: ['hips', `${s}Thigh`, `${s}Shin`] },
      // boots to the knee, with a turned-down cuff
      { shape: { tube: [knee, ankle], r: [0.06, 0.042] }, color: (p) => (p[1] > 0.45 ? LEATHER : DARK_LEATHER), bones: [`${s}Thigh`, `${s}Shin`, `${s}Foot`] },
      { shape: { tube: [sided(x, [0.11, 0.07, -0.05]), sided(x, [0.11, 0.04, 0.12])], r: [0.045, 0.038], flat: 0.7 }, color: DARK_LEATHER, bones: [`${s}Shin`, `${s}Foot`, `${s}Toe`] },
      { shape: { tube: [sided(x, [0.11, 0.035, 0.11]), sided(x, [0.11, 0.03, 0.18])], r: [0.036, 0.02], flat: 0.6 }, color: DARK_LEATHER, bones: [`${s}Toe`] },
    )
    // half the cape: from the shoulder down the back, weighted to its two bones so it sways
    const top = sided(x, [0.0, 1.43, -0.12]), shoulder = sided(x, [0.17, 1.44, -0.11])
    const mid = [sided(x, [0.0, 1.05, -0.18]), sided(x, [0.22, 1.05, -0.17])] as const
    const hem = [sided(x, [0.0, 0.62, -0.23]), sided(x, [0.27, 0.62, -0.2])] as const
    parts.push({
      shape: { sheet: [[top, shoulder, mid[1]], [top, mid[1], mid[0]], [mid[0], mid[1], hem[1]], [mid[0], hem[1], hem[0]]] },
      color: (p) => (p[1] < 0.66 ? c.trim : c.cape), bones: ['chest', `${s}Cape1`, `${s}Cape2`], opacity: 0.95,
    })
  }
  return { bones: BONES, parts, blend: 0.07 }
}

/** The elf's bones and parts in a look, for building something on top of it (Dungeon Run's hero adds a sword). */
export function elfSpec(look = 'forest'): BodySpec {
  return spec(LOOKS[look] ?? LOOKS.forest)
}

export function makeElf(count = 40000, look = 'forest') {
  const b = buildBody(spec(LOOKS[look] ?? LOOKS.forest), count, 5)
  return { blobs: b.blobs, skin: b.skin, skeleton: b.skeleton }
}

/**
 * The elf for the Creature page, cut the way the pixel scenes are (sculpt.ts)
 * on the same bones: a face with features, strands in the hair and a plait
 * tied at the end, a laced and embroidered tunic, a belt with a buckle and a
 * pouch, strapped bracers, cuffed and laced boots, arrows in the quiver.
 * Forest Walk and Dungeon Run keep the quick body.ts elf above, because they
 * build it among a whole world and add to its parts.
 */
function fine(c: Colors, s: number): SculptSpec {
  const fat = (r: number) => Math.max(r, s * 0.6)
  const lit = (v: Vec3, k = 1.2): Vec3 => [Math.min(1, v[0] * k), Math.min(1, v[1] * k), Math.min(1, v[2] * k)]
  const tunicC = lit(c.tunic), dark = mix(tunicC, [0, 0, 0], 0.3), shadeHair = mix(c.hair, [0, 0, 0], 0.22)
  const hair = (p: Vec3): Vec3 => (Math.sin(p[0] * 210 + p[2] * 60) > 0.35 ? shadeHair : c.hair)
  const face = (p: Vec3, n: Vec3): Vec3 => {
    if (n[2] > 0.3 && p[1] < 1.79 && p[1] > 1.6) return p[1] < 1.675 && p[1] > 1.655 && Math.abs(p[0]) > 0.03 && n[2] > 0.5 ? mix(c.skin, LIPS, 0.16) : c.skin
    return n[1] > -0.1 || n[2] < 0.1 ? hair(p) : c.skin
  }
  // the tunic: trimmed at the collar, open in a V at the neck, laced down the front, with a strap across for the quiver
  const tunic = (p: Vec3, n: Vec3): Vec3 => {
    if (Math.abs(p[1] - 1.415) < 0.014) return c.trim
    if (n[2] > 0.3) {
      if (p[1] > 1.3 && Math.abs(p[0]) < (p[1] - 1.3) * 0.42) return c.skin
      if (p[1] > 1.12 && p[1] < 1.31 && Math.abs(p[0]) < 0.012) return dark
      if (p[1] > 1.12 && p[1] < 1.31 && Math.abs(p[0]) < 0.034 && Math.sin(p[1] * 190) > 0.55) return c.trim
    }
    if (Math.abs(p[0] * 0.8 + (p[1] - 1.24) * 0.62) < 0.017) return LEATHER
    return Math.sin(p[1] * 330) > 0.86 ? dark : tunicC
  }
  // the skirt of it: pleats, a hem in the trim color and a row of leaves stitched above the hem
  const skirt = (p: Vec3): Vec3 => {
    if (p[1] < 0.752) return c.trim
    const a = Math.atan2(p[0], p[2])
    if (p[1] > 0.775 && p[1] < 0.83 && Math.abs(Math.sin(a * 9)) > 1 - (0.83 - p[1]) * 9) return c.trim
    return Math.sin(a * 22) > 0.72 ? dark : tunicC
  }
  const head: Vec3 = [0, 1.71, 0.015]
  const plait: Vec3[] = Array.from({ length: 7 }, (_, k): Vec3 => [0.012 * (k % 2 ? 1 : -1), 1.66 - k * 0.066, -0.105 - k * 0.006])
  const parts: SculptPart[] = [
    // head: skull, jaw, cheeks and nose as one skin
    {
      shape: smooth(0.022, ellipsoid(head, [0.092, 0.115, 0.108]), ellipsoid([0, 1.655, 0.045], [0.068, 0.06, 0.07]), cone([0, 1.72, 0.108], [0, 1.682, 0.128], fat(0.011), fat(0.016)),
        ellipsoid([0.045, 1.675, 0.078], [0.03, 0.025, 0.03]), ellipsoid([-0.045, 1.675, 0.078], [0.03, 0.025, 0.03])),
      color: face, bones: ['head'],
    },
    { shape: cone([-0.02, 1.64, 0.113], [0.02, 1.64, 0.113], fat(0.008)), color: LIPS, bones: ['head'] },
    // hair: a cap swept back, a fringe, and the plait as a row of knots tied off in the trim color
    { shape: smooth(0.02, ellipsoid([0, 1.81, -0.02], [0.102, 0.052, 0.112]), ellipsoid([0, 1.73, -0.06], [0.098, 0.1, 0.07]), ellipsoid([0.035, 1.8, 0.075], [0.05, 0.022, 0.035]), ellipsoid([-0.04, 1.795, 0.072], [0.045, 0.02, 0.035])), color: hair, bones: ['head'] },
    ...plait.map((q, k): SculptPart => ({ shape: ellipsoid(q, [0.046 - k * 0.0035, 0.044, 0.038 - k * 0.003]), color: (p) => (Math.sin((p[0] + p[1]) * 260) > 0.3 ? shadeHair : c.hair), bones: ['head', 'hair1', 'hair2'] })),
    { shape: cone([0, 1.215, -0.142], [0, 1.19, -0.143], 0.03), color: c.trim, bones: ['hair2'] },
    { shape: cone([0, 1.19, -0.143], [0, 1.13, -0.146], 0.024, fat(0.008)), color: hair, bones: ['hair2'] },
    { shape: cone([0, 1.55, 0], [0, 1.43, 0], 0.045, 0.055), color: c.skin, bones: ['neck', 'chest'] },
    // body: the tunic, belted at the waist and flaring to a skirt
    { shape: flatten(cone([0, 1.03, 0], [0, 1.38, 0], 0.125, 0.16), 0.66), color: tunic, bones: ['hips', 'spine', 'chest'] },
    { shape: flatten(cone([0, 1.0, 0], [0, 1.045, 0], 0.135, 0.137), 0.72), color: (p) => (Math.sin(Math.atan2(p[0], p[2]) * 30) > 0.9 ? DARK_LEATHER : LEATHER), bones: ['hips', 'spine'] },
    { shape: box([0, 1.022, 0.1], [0.03, 0.026, fat(0.012)], 0.006), color: (p) => (Math.abs(p[0]) < 0.014 && Math.abs(p[1] - 1.022) < 0.011 ? DARK_LEATHER : c.trim), bones: ['hips', 'spine'] },
    { shape: ellipsoid([0.135, 0.97, 0.03], [0.035, 0.05, 0.045]), color: (p) => (p[1] > 0.99 ? DARK_LEATHER : LEATHER), bones: ['hips'] },
    { shape: cut(flatten(cone([0, 0.99, 0], [0, 0.72, 0], 0.132, 0.2), 0.78), box([0, 0.52, 0], [0.4, 0.21, 0.4])), color: (p, n) => (n[1] < -0.6 && p[1] < 0.745 ? mix(dark, [0, 0, 0], 0.4) : skirt(p)), bones: ['hips', 'lThigh', 'rThigh'] },
    // a leaf brooch at the throat
    { shape: ellipsoid([0, 1.405, 0.105], [0.018, 0.024, fat(0.008)]), color: [0.3, 0.9, 0.5], bones: ['chest'], glow: true },
    // a quiver slung across the back, banded, with three arrows in it
    { shape: cone([-0.12, 1.06, -0.13], [0.1, 1.5, -0.15], 0.045, 0.05), color: (p) => (Math.abs(p[1] - 1.12) < 0.012 || Math.abs(p[1] - 1.44) < 0.012 ? c.trim : Math.sin(p[1] * 150) > 0.8 ? DARK_LEATHER : LEATHER), bones: ['chest', 'spine'] },
    ...[[-0.02, 0], [0.012, 0.018], [0.0, -0.02]].flatMap(([dx, dz], k): SculptPart[] => {
      const a: Vec3 = [0.1 + dx, 1.5, -0.15 + dz], b: Vec3 = [0.14 + dx * 1.6, 1.6 + k * 0.012, -0.156 + dz * 1.6]
      return [
        { shape: cone(a, b, fat(0.006)), color: [0.8, 0.7, 0.5], bones: ['chest'], noShadow: true },
        { shape: ellipsoid(mix(a, b, 0.72), [0.018, 0.034, fat(0.008)]), color: k === 1 ? [0.85, 0.25, 0.2] : WHITE, bones: ['chest'], noShadow: true },
      ]
    }),
  ]
  for (const [side, x] of SIDES) {
    const at = (p: Vec3) => sided(x, p)
    const elbow = at([0.27, 1.17, -0.02]), wrist = at([0.31, 0.94, 0.01])
    const eye = at([0.033, 1.705, 0.108])
    parts.push(
      // eyes: white, a colored iris, a dark pupil; a brow over each
      { shape: ellipsoid(eye, [0.018, 0.012, fat(0.01)]), color: (p) => { const d = Math.hypot(p[0] - eye[0], p[1] - eye[1]); return d < 0.004 ? [0.03, 0.03, 0.05] : d < 0.0095 ? EYE : WHITE }, bones: ['head'], group: 'eyes' },
      { shape: cone(at([0.012, 1.734, 0.119]), at([0.056, 1.739, 0.106]), fat(0.006), fat(0.004)), color: mix(c.hair, [0, 0, 0], 0.4), bones: ['head'] },
      // long pointed ears, sweeping back
      { shape: flatten(cone(at([0.085, 1.7, 0.0]), at([0.19, 1.81, -0.06]), 0.03, fat(0.005)), 0.5, -0.03), color: (p) => (Math.abs(p[0]) > 0.1 && Math.abs(p[0]) < 0.15 && p[1] < 1.76 ? mix(c.skin, LIPS, 0.4) : c.skin), bones: ['head'] },
      // shoulder, sleeve, and a bracer of leather with two straps
      { shape: smooth(0.02, ellipsoid(at([0.175, 1.43, -0.01]), [0.07, 0.065, 0.07]), cone(at([0.2, 1.42, -0.01]), elbow, 0.05, 0.042)), color: (p) => (Math.abs(p[1] - 1.2) < 0.012 ? c.trim : Math.sin(p[1] * 330) > 0.86 ? dark : tunicC), bones: ['chest', `${side}Shoulder`, `${side}Arm`, `${side}Forearm`] },
      { shape: cone(elbow, wrist, 0.045, 0.036), color: (p) => (p[1] >= 1.08 ? tunicC : Math.abs(p[1] - 1.05) < 0.008 || Math.abs(p[1] - 0.98) < 0.008 ? c.trim : Math.sin(p[1] * 400) > 0.6 ? LEATHER : DARK_LEATHER), bones: [`${side}Arm`, `${side}Forearm`, `${side}Hand`] },
      { shape: smooth(0.008, ellipsoid(at([0.315, 0.905, 0.015]), [0.022, 0.045, 0.038]), cone(at([0.325, 0.87, 0.02]), at([0.335, 0.795, 0.025]), 0.019, 0.012)), color: (p) => (p[1] < 0.86 && Math.sin(p[2] * 520) > 0.75 ? mix(c.skin, [0, 0, 0], 0.25) : c.skin), bones: [`${side}Hand`, `${side}Fingers`] },
      { shape: cone(at([0.31, 0.91, 0.04]), at([0.3, 0.86, 0.065]), fat(0.011), fat(0.008)), color: c.skin, bones: [`${side}Hand`] },
    )
    const knee = at([0.105, 0.52, 0.015]), ankle = at([0.11, 0.09, -0.02])
    parts.push(
      { shape: cone(at([0.09, 0.9, 0]), knee, 0.078, 0.055), color: (p) => (Math.sin(p[1] * 260) > 0.9 ? mix(LEGGINGS, [0, 0, 0], 0.3) : LEGGINGS), bones: ['hips', `${side}Thigh`, `${side}Shin`] },
      // boots to the knee: a turned-down cuff, laces up the front, a darker foot and a sole
      { shape: smooth(0.012, cone(knee, ankle, 0.06, 0.042), cone([knee[0], knee[1] - 0.005, knee[2]], [knee[0], knee[1] - 0.06, knee[2]], 0.07, 0.066)), color: (p, n) => (p[1] > 0.455 ? mix(LEATHER, c.trim, p[1] > 0.5 ? 0 : 0.5) : n[2] > 0.55 && Math.abs(Math.abs(p[0]) - 0.108) < 0.02 ? (Math.sin(p[1] * 150) > 0.4 ? c.trim : DARK_LEATHER) : LEATHER), bones: [`${side}Thigh`, `${side}Shin`, `${side}Foot`] },
      { shape: flatten(smooth(0.012, cone(at([0.11, 0.07, -0.05]), at([0.11, 0.045, 0.12]), 0.046, 0.04), cone(at([0.11, 0.04, 0.11]), at([0.11, 0.034, 0.185]), 0.037, 0.022)), 1), color: (p) => (p[1] < 0.018 ? [0.1, 0.07, 0.05] : DARK_LEATHER), bones: [`${side}Shin`, `${side}Foot`, `${side}Toe`] },
    )
    // half the cape: from the shoulder down the back, weighted to its two bones so it sways
    const top = at([0.0, 1.43, -0.12]), shoulder = at([0.17, 1.44, -0.11])
    const mid = [at([0.0, 1.05, -0.18]), at([0.22, 1.05, -0.17])] as const
    const hem = [at([0.0, 0.62, -0.23]), at([0.27, 0.62, -0.2])] as const
    parts.push({
      shape: membrane([[top, shoulder, mid[1]], [top, mid[1], mid[0]], [mid[0], mid[1], hem[1]], [mid[0], hem[1], hem[0]]], fat(0.012)),
      color: (p) => (p[1] < 0.655 ? c.trim : p[1] < 0.72 && Math.sin(p[0] * 130) > 0.2 ? c.trim : Math.sin(p[0] * 75) > 0.8 ? mix(c.cape, [0, 0, 0], 0.3) : c.cape),
      bones: ['chest', `${side}Cape1`, `${side}Cape2`], group: 'cape', noShadow: true,
    })
  }
  return { bones: BONES, parts, blend: 0.07, light: { ambient: 0.68, shadow: 0.45 } }
}

/** The detailed elf of the Creature page. */
export function makeFineElf(count = 40000, look = 'forest') {
  const c = LOOKS[look] ?? LOOKS.forest
  const b = sculptToCount((s) => fine(c, s), count, 0.03)
  return { blobs: b.blobs, skin: b.skin, skeleton: b.skeleton }
}

/** The arms hang from an A-pose, so every clip starts by bringing them down to the sides. */
function relax(sk: Skeleton) {
  for (const [s, x] of SIDES) {
    aim(sk, `${s}Arm`, dir([0.12 * x, -1, -0.02]))
    aim(sk, `${s}Forearm`, dir([0.04 * x, -1, 0.12]))
    aim(sk, `${s}Hand`, dir([0.02 * x, -1, 0.05]))
    set(sk, `${s}Fingers`, X, -0.15)
  }
}

/** Hair and cape trailing behind whatever the body did, with a lag. */
function trail(sk: Skeleton, sway: number, lift: number) {
  set(sk, 'hair1', X, -0.08 * lift)
  turn(sk, 'hair1', Z, 0.12 * sway)
  set(sk, 'hair2', Z, 0.1 * sway)
  for (const [s] of SIDES) {
    set(sk, `${s}Cape1`, X, -0.1 * lift)
    set(sk, `${s}Cape2`, X, -0.12 * lift)
    turn(sk, `${s}Cape2`, Z, 0.08 * sway)
  }
}

/** Standing: breathing, the weight shifting from foot to foot, a look round. Loops every four seconds. */
export function elfIdle(sk: Skeleton, t: number) {
  sk.reset()
  const ph = (t / 4) * Math.PI * 2
  const breath = Math.sin(ph * 2)
  sk.offset.set([0.012 * Math.sin(ph), 0.004 * breath, 0], 0)
  set(sk, 'hips', Z, 0.025 * Math.sin(ph))
  set(sk, 'chest', X, -0.02 * breath)
  turn(sk, 'chest', Z, -0.03 * Math.sin(ph))
  set(sk, 'head', Y, 0.35 * Math.sin(ph) * env((t % 4) / 4, 0.1, 0.3, 0.6, 0.85))
  for (const [s, x] of SIDES) set(sk, `${s}Thigh`, Z, -0.025 * x * Math.sin(ph))
  relax(sk)
  trail(sk, Math.sin(ph - 0.6), 0.2 * breath)
  sk.update()
}

const STRIDE = 1.1

/**
 * A walk on the spot: legs swinging from the hip with the knee folding as
 * the foot comes through, arms swinging against them, the body rising over
 * each step and turning against the hips.
 */
export function elfWalk(sk: Skeleton, t: number) {
  sk.reset()
  const ph = (t / STRIDE) * Math.PI * 2
  sk.offset.set([0, 0.025 * Math.cos(ph * 2) - 0.015, 0], 0)
  set(sk, 'hips', Y, 0.1 * Math.sin(ph))
  set(sk, 'spine', Y, -0.08 * Math.sin(ph))
  set(sk, 'chest', Y, -0.06 * Math.sin(ph))
  turn(sk, 'chest', X, 0.04)
  set(sk, 'head', Y, 0.08 * Math.sin(ph))
  relax(sk)
  for (const [s, x] of SIDES) {
    const side = x > 0 ? 0 : Math.PI
    const swing = Math.sin(ph + side)
    // the thigh swings forward and back; the knee folds while the foot passes under the body
    set(sk, `${s}Thigh`, X, -0.45 * swing)
    set(sk, `${s}Shin`, X, 0.85 * Math.max(0, Math.cos(ph + side - 0.4)) ** 1.5)
    set(sk, `${s}Foot`, X, -0.25 * Math.max(0, -swing))
    set(sk, `${s}Toe`, X, -0.35 * Math.max(0, Math.sin(ph + side - 0.9)))
    // the opposite arm swings with it
    turn(sk, `${s}Arm`, X, 0.35 * swing)
    turn(sk, `${s}Forearm`, X, -0.3 - 0.2 * swing)
  }
  trail(sk, Math.sin(ph - 0.8), 0.6 + 0.3 * Math.cos(ph * 2))
  sk.update()
}

const WAVE = 4

/** A wave: the right arm up, the hand waving from the elbow, the head tipped. */
export function elfWave(sk: Skeleton, t: number) {
  const u = (t % WAVE) / WAVE
  elfIdle(sk, u * 4)
  const up = env(u, 0.05, 0.22, 0.78, 0.95)
  aim(sk, 'rArm', dir([-0.75, 0.55, 0.2]), up)
  aim(sk, 'rForearm', dir([-0.25 + 0.4 * Math.sin(u * Math.PI * 2 * 5), 1, 0.15]), up)
  aim(sk, 'rHand', dir([-0.2 + 0.5 * Math.sin(u * Math.PI * 2 * 5 - 0.6), 1, 0.2]), up)
  set(sk, 'rFingers', X, -0.15 * (1 - up))
  turn(sk, 'head', Z, -0.12 * up)
  turn(sk, 'chest', Z, 0.04 * up)
  sk.update()
}

export const ELF: Species = {
  id: 'elf',
  name: 'elf',
  blurb: 'An elf of twenty-nine bones, in a laced tunic with a belt, bracers and boots, with a plait of hair, arrows on the back and a cape that sways.',
  detail: [10000, 40000, 100000, 200000],
  start: 40000,
  looks: Object.entries(LOOKS).map(([id, l]) => ({ id, label: l.label })),
  make: makeFineElf,
  moves: [
    { name: 'walk', label: 'Walk', doing: 'walking on the spot', seconds: STRIDE, fps: 30, pose: elfWalk },
    { name: 'wave', label: 'Wave', doing: 'waving', seconds: WAVE, fps: 24, pose: elfWave },
    { name: 'idle', label: 'Stand', doing: 'standing and looking round', seconds: 4, fps: 12, pose: elfIdle },
  ],
  view: { target: [0, 0.95, 0], distance: 3.6, azimuth: 30, elevation: 8 },
}
