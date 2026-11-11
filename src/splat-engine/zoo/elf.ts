import type { Vec3 } from '../../splat-core/blobs.ts'
import { buildBody, mirror, mix, type BodySpec, type Part } from '../body.ts'
import type { Bone, Skeleton } from '../rig.ts'
import { X, Y, Z, aim, dir, env, set, turn } from '../posing.ts'
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

interface Colours { tunic: Vec3; trim: Vec3; cape: Vec3; hair: Vec3; skin: Vec3 }
const LOOKS: Record<string, Colours & { label: string }> = {
  forest: { label: 'Forest', tunic: [0.2, 0.46, 0.28], trim: [0.86, 0.7, 0.3], cape: [0.13, 0.3, 0.26], hair: [0.94, 0.84, 0.56], skin: [0.95, 0.79, 0.67] },
  dusk: { label: 'Dusk', tunic: [0.32, 0.25, 0.55], trim: [0.82, 0.84, 0.9], cape: [0.16, 0.14, 0.3], hair: [0.88, 0.9, 0.94], skin: [0.72, 0.56, 0.48] },
  autumn: { label: 'Autumn', tunic: [0.66, 0.3, 0.14], trim: [0.94, 0.78, 0.36], cape: [0.4, 0.2, 0.1], hair: [0.52, 0.22, 0.1], skin: [0.96, 0.82, 0.72] },
}
const LEATHER: Vec3 = [0.36, 0.22, 0.12], DARK_LEATHER: Vec3 = [0.2, 0.13, 0.08], LEGGINGS: Vec3 = [0.3, 0.27, 0.2], EYE: Vec3 = [0.1, 0.22, 0.3], WHITE: Vec3 = [0.95, 0.95, 0.92], LIPS: Vec3 = [0.75, 0.42, 0.4]

function spec(c: Colours): BodySpec {
  const head: Vec3 = [0, 1.71, 0.015]
  // the face shows at the front; hair covers the top and back, swept behind the ears
  const scalp = (p: Vec3, n: Vec3): Vec3 => (n[2] > 0.35 && p[1] < 1.79 ? c.skin : n[1] > -0.1 || n[2] < 0.1 ? c.hair : c.skin)
  const tunic = (p: Vec3): Vec3 => (Math.abs(p[1] - 1.42) < 0.015 || Math.abs(p[1] - 0.74) < 0.02 ? c.trim : c.tunic)
  const parts: Part[] = [
    // head, face and features
    { shape: { ball: head, r: [0.092, 0.115, 0.108] }, colour: scalp, bones: ['head'], density: 2 },
    { shape: { ball: [0, 1.655, 0.045], r: [0.068, 0.06, 0.07] }, colour: c.skin, bones: ['head'], density: 2 },
    { shape: { tube: [[0, 1.72, 0.105], [0, 1.68, 0.125]], r: [0.012, 0.016] }, colour: c.skin, bones: ['head'], density: 4 },
    { shape: { tube: [[-0.02, 1.638, 0.112], [0.02, 1.638, 0.112]], r: [0.008, 0.008] }, colour: LIPS, bones: ['head'], density: 4 },
    { shape: { ball: [0, 1.81, -0.02], r: [0.1, 0.05, 0.11] }, colour: c.hair, bones: ['head'] },
    { shape: { tube: [[0, 1.7, -0.1], [0, 1.24, -0.14]], r: [0.06, 0.025], flat: 0.7 }, colour: (p) => (Math.sin(p[1] * 70) > 0.6 ? mix(c.hair, [0, 0, 0], 0.18) : c.hair), bones: ['head', 'hair1', 'hair2'] },
    { shape: { tube: [[0, 1.55, 0], [0, 1.43, 0]], r: [0.045, 0.055] }, colour: c.skin, bones: ['neck', 'chest'] },
    // body: a tunic belted at the waist, flaring to a skirt
    { shape: { tube: [[0, 1.03, 0], [0, 1.38, 0]], r: [0.125, 0.16], flat: 0.62 }, colour: tunic, bones: ['hips', 'spine', 'chest'] },
    { shape: { tube: [[0, 1.0, 0], [0, 1.045, 0]], r: [0.13, 0.132], flat: 0.7 }, colour: (_p, n) => (n[2] > 0.85 ? c.trim : LEATHER), bones: ['hips', 'spine'], density: 1.5 },
    { shape: { tube: [[0, 0.99, 0], [0, 0.72, 0]], r: [0.132, 0.2], flat: 0.75 }, colour: tunic, bones: ['hips', 'lThigh', 'rThigh'] },
    // a quiver slung across the back, with fletching
    { shape: { tube: [[-0.12, 1.06, -0.13], [0.1, 1.5, -0.15]], r: [0.045, 0.05] }, colour: LEATHER, bones: ['chest', 'spine'] },
    { shape: { ball: [0.12, 1.55, -0.15], r: [0.05, 0.035, 0.04] }, colour: WHITE, bones: ['chest'], density: 2 },
  ]
  for (const [s, x] of SIDES) {
    const elbow = sided(x, [0.27, 1.17, -0.02]), wrist = sided(x, [0.31, 0.94, 0.01])
    parts.push(
      // eyes: white, then a coloured iris
      { shape: { ball: sided(x, [0.033, 1.705, 0.111]), r: [0.017, 0.011, 0.008] }, colour: (_p, n) => (n[2] > 0.82 ? EYE : WHITE), bones: ['head'], density: 6 },
      { shape: { tube: [sided(x, [0.012, 1.733, 0.12]), sided(x, [0.054, 1.737, 0.108])], r: [0.006, 0.004] }, colour: mix(c.hair, [0, 0, 0], 0.35), bones: ['head'], density: 6 },
      // long pointed ears, sweeping back
      { shape: { tube: [sided(x, [0.085, 1.7, 0.0]), sided(x, [0.18, 1.8, -0.06])], r: [0.028, 0.004], flat: 0.45 }, colour: c.skin, bones: ['head'], density: 3 },
      { shape: { ball: sided(x, [0.175, 1.43, -0.01]), r: [0.07, 0.065, 0.07] }, colour: c.tunic, bones: ['chest', `${s}Shoulder`, `${s}Arm`] },
      { shape: { tube: [sided(x, [0.2, 1.42, -0.01]), elbow], r: [0.05, 0.042] }, colour: c.tunic, bones: [`${s}Arm`, `${s}Forearm`] },
      { shape: { tube: [elbow, wrist], r: [0.044, 0.034] }, colour: (p) => (p[1] < 1.08 ? DARK_LEATHER : c.tunic), bones: [`${s}Arm`, `${s}Forearm`, `${s}Hand`] },
      { shape: { ball: sided(x, [0.315, 0.905, 0.015]), r: [0.022, 0.045, 0.038] }, colour: c.skin, bones: [`${s}Hand`, `${s}Forearm`], density: 2 },
      { shape: { tube: [sided(x, [0.325, 0.87, 0.02]), sided(x, [0.335, 0.795, 0.025])], r: [0.02, 0.012], flat: 0.6 }, colour: c.skin, bones: [`${s}Fingers`], density: 2 },
      { shape: { tube: [sided(x, [0.31, 0.91, 0.04]), sided(x, [0.3, 0.86, 0.065])], r: [0.011, 0.008] }, colour: c.skin, bones: [`${s}Hand`], density: 3 },
    )
    const knee = sided(x, [0.105, 0.52, 0.015]), ankle = sided(x, [0.11, 0.09, -0.02])
    parts.push(
      { shape: { tube: [sided(x, [0.09, 0.9, 0]), knee], r: [0.078, 0.055] }, colour: LEGGINGS, bones: ['hips', `${s}Thigh`, `${s}Shin`] },
      // boots to the knee, with a turned-down cuff
      { shape: { tube: [knee, ankle], r: [0.06, 0.042] }, colour: (p) => (p[1] > 0.45 ? LEATHER : DARK_LEATHER), bones: [`${s}Thigh`, `${s}Shin`, `${s}Foot`] },
      { shape: { tube: [sided(x, [0.11, 0.07, -0.05]), sided(x, [0.11, 0.04, 0.12])], r: [0.045, 0.038], flat: 0.7 }, colour: DARK_LEATHER, bones: [`${s}Shin`, `${s}Foot`, `${s}Toe`] },
      { shape: { tube: [sided(x, [0.11, 0.035, 0.11]), sided(x, [0.11, 0.03, 0.18])], r: [0.036, 0.02], flat: 0.6 }, colour: DARK_LEATHER, bones: [`${s}Toe`] },
    )
    // half the cape: from the shoulder down the back, weighted to its two bones so it sways
    const top = sided(x, [0.0, 1.43, -0.12]), shoulder = sided(x, [0.17, 1.44, -0.11])
    const mid = [sided(x, [0.0, 1.05, -0.18]), sided(x, [0.22, 1.05, -0.17])] as const
    const hem = [sided(x, [0.0, 0.62, -0.23]), sided(x, [0.27, 0.62, -0.2])] as const
    parts.push({
      shape: { sheet: [[top, shoulder, mid[1]], [top, mid[1], mid[0]], [mid[0], mid[1], hem[1]], [mid[0], hem[1], hem[0]]] },
      colour: (p) => (p[1] < 0.66 ? c.trim : c.cape), bones: ['chest', `${s}Cape1`, `${s}Cape2`], opacity: 0.95,
    })
  }
  return { bones: BONES, parts, blend: 0.07 }
}

export function makeElf(count = 40000, look = 'forest') {
  const b = buildBody(spec(LOOKS[look] ?? LOOKS.forest), count, 5)
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
  blurb: 'An elf of twenty-nine bones: a spine, hands with fingers, feet with toes, a plait of hair and a cape that sways.',
  detail: [10000, 40000, 100000, 200000],
  start: 40000,
  looks: Object.entries(LOOKS).map(([id, l]) => ({ id, label: l.label })),
  make: makeElf,
  moves: [
    { name: 'walk', label: 'Walk', doing: 'walking on the spot', seconds: STRIDE, fps: 30, pose: elfWalk },
    { name: 'wave', label: 'Wave', doing: 'waving', seconds: WAVE, fps: 24, pose: elfWave },
    { name: 'idle', label: 'Stand', doing: 'standing and looking round', seconds: 4, fps: 12, pose: elfIdle },
  ],
  view: { target: [0, 0.95, 0], distance: 3.6, azimuth: 30, elevation: 8 },
}
