import type { Vec3 } from '../../../splat-core/blobs.ts'
import type { PartDoc, SceneDoc, ShapeDoc } from '../../../splat-engine/sceneDoc.ts'

/**
 * A boy sitting on the edge of a floating island with a fishing rod, his line down in a cloud, with the moon and the
 * sun, stars, a tree, a lantern and a sea of clouds below.
 *
 * This is everything that is in the picture and what moves by itself (the island bobs, clouds drift, the crown
 * sways). The story, casting the line and pulling the moon and then the sun up out of the cloud, is told in order
 * and can't be written as moves that repeat, so it is posed by `diorama/fishing.ts`, which also says what the
 * places below (`TIP`, `HOLE`, `ZENITH` and the rest) are for.
 */

/** Seconds for one whole story: the moon caught and flung up, then the sun. */
export const LOOP = 24

/** Where the boy sits: his hips, on the island's left edge. */
export const SEAT: Vec3 = [-0.12, 1.0, 0.25]
/** His shoulder, which his arms and the rod swing about. */
export const SHOULDER: Vec3 = [SEAT[0] - 0.02, SEAT[1] + 0.27, SEAT[2]]
/** The angle the rod is drawn at, in degrees from upright, leaning out over the clouds. */
export const ROD_REST = 55
const HAND: Vec3 = [SEAT[0] - 0.2, SEAT[1] + 0.2, SEAT[2]]
const ROD = 1.0
/** The rod's tip as drawn. */
export const TIP: Vec3 = [HAND[0] - ROD * Math.sin((ROD_REST * Math.PI) / 180), HAND[1] + ROD * Math.cos((ROD_REST * Math.PI) / 180), SEAT[2]]
/** The line is this many straight pieces, each this long, laid end over end between the tip and the float. */
export const LINE_PIECES = 5, LINE_PIECE = 0.44
/** Where the line goes into the cloud. */
export const HOLE: Vec3 = [-1.5, 0.5, 0.25]
/** Where a catch hangs once it has been flung into the sky. */
export const ZENITH: Vec3 = [0.75, 3.05, -0.8]
/** Where the one in the sky goes down into the clouds when the next is caught. */
export const WEST: Vec3 = [2.7, -0.1, -1.2]
/** The radius of the moon and of the sun's disc. */
export const BODY_R = 0.32
/** Where the lantern hangs. */
export const LANTERN: Vec3 = [0.42, 1.38, 0.42]
export const STARS: Vec3[] = [
  [-2.5, 3.3, -1.4], [-1.9, 2.5, -1.5], [-1.3, 3.5, -1.3], [-0.9, 2.2, -1.6], [-0.3, 3.2, -1.5], [0.1, 2.3, -1.6], [1.5, 3.7, -1.4],
  [1.7, 2.3, -1.6], [2.3, 3.1, -1.4], [2.6, 2.0, -1.5], [-2.6, 1.6, -1.5], [-0.5, 3.9, -1.4], [2.0, 1.4, -1.6], [-1.6, 1.5, -1.6],
]
/** Wisps of cloud thrown up where the line goes in, and when a catch breaks out. */
export const PUFFS = 6

// day colors, then what each turns to under the night's blue light (fishing.ts `ambientAt`)
const C = {
  cloud: '#f2f6fb', cloudMid: '#cfdcee', cloudLow: '#9db3d6',
  grass: '#93d25c', grassMid: '#5fae48', grassLow: '#3a7f42',
  rock: '#b98f63', rockMid: '#8c6248', rockLow: '#5c3f38',
  skin: '#f3c394', skinLow: '#c98a6a', red: '#d84a3c', blue: '#3e5fad', straw: '#f0d98a', dark: '#2a2136',
  moon: '#fff6c4', moonLow: '#f0d98a', sun: '#ffd23e', sunLow: '#ff9a2a', star: '#ffffff',
}
/** The sky by day and by night, top and bottom, and the color low in the sky as one turns to the other. */
export const SKIES = { day: ['#3f8fe0', '#bfe4fa'], night: ['#0b0f2e', '#27357a'], dusk: ['#3d4a9c', '#f2a37a'], plum: '#6b3a52' } as const
const NIGHT = ['#151a3d', '#1d2a5c', '#31468c', '#5a6fb0', '#8296cc', '#2a5560', '#3a2f4a', '#6b3a52']

const [sx, sy, sz] = SEAT
const isle = (shape: ShapeDoc, paint: PartDoc['paint'], more: Partial<PartDoc> = {}): PartDoc => ({ shape, paint, bone: 'isle', ...more })
const cloud = (bone: string, balls: [number, number, number, number, number, number][]): PartDoc => ({
  shape: { kind: 'join', blend: 'smooth', by: 0.12, shapes: balls.map(([x, y, z, rx, ry, rz]) => ({ kind: 'ball', at: [x, y, z], r: [rx, ry, rz] })) },
  paint: { kind: 'faces', top: C.cloud, side: { kind: 'patches', size: 0.3, colors: [C.cloud, C.cloudMid] }, under: C.cloudLow },
  bone, noShadow: true,
})

const parts: PartDoc[] = [
  // the island: a cap of grass on a root of rock that tapers to a point
  isle({ kind: 'rough', shape: { kind: 'ball', at: [0.75, 0.93, 0], r: [1.0, 0.12, 0.9] }, by: 0.015, scale: 0.4 }, { kind: 'faces', top: { kind: 'patches', size: 0.3, colors: [C.grass, C.grassMid, C.grass] }, side: C.grassMid, under: C.grassLow }, { ink: { kind: 'tufts', amount: 0.3 } }),
  isle({ kind: 'rough', shape: { kind: 'lathe', at: [0.75, 0.02, 0], profile: [[0.04, 0], [0.16, 0.2], [0.3, 0.42], [0.58, 0.66], [0.84, 0.84], [0.9, 0.93]] }, by: 0.05, scale: 0.35 }, { kind: 'bands', axis: 'y', size: 0.11, colors: [C.rockMid, C.rock, C.rockLow, C.rockMid] }, { ink: { kind: 'cracks', amount: 0.3 } }),
  // grass hanging over the rim
  isle({ kind: 'join', shapes: [-0.1, 0.3, 0.75, 1.2, 1.6].map((x, i) => ({ kind: 'cone', from: [x, 0.93, 0.8 - Math.abs(x - 0.75) * 0.35], to: [x + 0.02, 0.74 - (i % 2) * 0.06, 0.84 - Math.abs(x - 0.75) * 0.35], r: 0.05, rTo: 0.015 } as ShapeDoc)) }, C.grassLow, { noShadow: true }),
  // rocks adrift under it
  { shape: { kind: 'rough', shape: { kind: 'ball', at: [0.2, 0.2, 0.3], r: [0.1, 0.13, 0.1] }, by: 0.02, scale: 0.2 }, paint: { kind: 'faces', top: C.grassMid, side: C.rockMid, under: C.rockLow }, bone: 'chip0' },
  { shape: { kind: 'rough', shape: { kind: 'ball', at: [1.25, 0.3, 0.2], r: [0.08, 0.1, 0.08] }, by: 0.02, scale: 0.2 }, paint: { kind: 'faces', top: C.grassMid, side: C.rock, under: C.rockLow }, bone: 'chip1' },
  // a crooked tree
  isle({ kind: 'sweep', path: [[1.3, 0.98, -0.2], [1.26, 1.25, -0.2], [1.36, 1.5, -0.2], [1.33, 1.7, -0.2]], r: 0.075, rTo: 0.04 }, { kind: 'bands', axis: 'y', size: 0.09, colors: [C.rockMid, C.rockLow] }),
  { shape: { kind: 'join', blend: 'smooth', by: 0.08, shapes: [{ kind: 'sphere', at: [1.33, 1.9, -0.2], r: 0.3 }, { kind: 'sphere', at: [1.08, 1.78, -0.12], r: 0.2 }, { kind: 'sphere', at: [1.58, 1.8, -0.22], r: 0.21 }, { kind: 'sphere', at: [1.3, 2.12, -0.25], r: 0.19 }] }, paint: { kind: 'faces', top: C.grass, side: { kind: 'patches', size: 0.16, colors: [C.grassMid, C.grass, C.grassLow] }, under: C.grassLow }, bone: 'crown', ink: { kind: 'stipple', amount: 0.35 } },
  { shape: { kind: 'join', shapes: [[1.12, 1.86, 0.06], [1.45, 1.98, 0.08], [1.6, 1.72, -0.03], [1.25, 1.7, 0.07]].map((at) => ({ kind: 'sphere', at: at as Vec3, r: 0.035 })) }, paint: C.red, bone: 'crown', noShadow: true },
  // the lantern on its crook
  isle({ kind: 'sweep', path: [[0.55, 0.98, 0.42], [0.55, 1.5, 0.42], [0.5, 1.56, 0.42], [0.42, 1.54, 0.42]], r: 0.018 }, C.rockLow, { noShadow: true }),
  { shape: { kind: 'box', at: [LANTERN[0], LANTERN[1] + 0.02, LANTERN[2]], half: [0.045, 0.06, 0.045], round: 0.01 }, paint: C.sun, bone: 'lantern', glow: true, noShadow: true },
  { shape: { kind: 'join', shapes: [{ kind: 'box', at: [LANTERN[0], LANTERN[1] + 0.095, LANTERN[2]], half: [0.06, 0.015, 0.06] }, { kind: 'box', at: [LANTERN[0], LANTERN[1] - 0.05, LANTERN[2]], half: [0.055, 0.012, 0.055] }] }, paint: C.dark, bone: 'lantern', noShadow: true },
  // a bucket with two small stars in it, flowers and stones
  isle({ kind: 'cylinder', at: [0.2, 0.98, 0.5], height: 0.13, r: 0.06, rTop: 0.075 }, { kind: 'bands', axis: 'y', size: 0.045, colors: [C.rockMid, C.rock] }, { noShadow: true }),
  isle({ kind: 'join', shapes: [{ kind: 'sphere', at: [0.18, 1.12, 0.5], r: 0.03 }, { kind: 'sphere', at: [0.23, 1.13, 0.52], r: 0.024 }] }, C.moon, { glow: true, noShadow: true }),
  isle({ kind: 'join', shapes: [[0.75, 1.07, 0.6], [0.95, 1.06, 0.45], [1.55, 1.03, 0.2], [0.6, 1.06, -0.4]].map((at) => ({ kind: 'sphere', at: at as Vec3, r: 0.028 })) }, C.star, { glow: true, noShadow: true }),
  isle({ kind: 'join', shapes: [[0.85, 1.07, 0.52], [1.4, 1.05, 0.4], [0.35, 1.05, -0.3]].map((at) => ({ kind: 'sphere', at: at as Vec3, r: 0.028 })) }, C.red, { glow: true, noShadow: true }),
  isle({ kind: 'rough', shape: { kind: 'join', shapes: [{ kind: 'ball', at: [1.0, 1.04, 0.62], r: [0.1, 0.06, 0.07] }, { kind: 'ball', at: [1.14, 1.03, 0.56], r: [0.06, 0.045, 0.05] }] }, by: 0.01, scale: 0.1 }, { kind: 'faces', top: C.cloudMid, side: C.cloudLow, under: C.rockLow }),

  // the boy: body, then legs, head and arms each on its own bone
  { shape: { kind: 'ball', at: [sx + 0.01, sy + 0.17, sz], r: [0.085, 0.14, 0.1] }, paint: { kind: 'bands', axis: 'y', size: 0.045, colors: [C.red, C.cloud] }, bone: 'boy', noShadow: true },
  { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [sx + 0.01, sy + 0.05, sz - 0.05], to: [sx - 0.14, sy + 0.04, sz - 0.05], r: 0.048 }, { kind: 'cone', from: [sx + 0.01, sy + 0.05, sz + 0.05], to: [sx - 0.14, sy + 0.04, sz + 0.05], r: 0.048 }] }, paint: C.blue, bone: 'boy', noShadow: true, touches: true },
  ...[-0.05, 0.05].map((dz, i): PartDoc => ({ shape: { kind: 'join', shapes: [{ kind: 'cone', from: [sx - 0.16, sy + 0.02, sz + dz], to: [sx - 0.18, sy - 0.17, sz + dz], r: 0.036 }] }, paint: C.skin, bone: `leg${i}`, noShadow: true, touches: true })),
  ...[-0.05, 0.05].map((dz, i): PartDoc => ({ shape: { kind: 'ball', at: [sx - 0.2, sy - 0.2, sz + dz], r: [0.055, 0.035, 0.04] }, paint: C.rockLow, bone: `leg${i}`, noShadow: true, touches: true })),
  { shape: { kind: 'sphere', at: [sx - 0.01, sy + 0.4, sz], r: 0.1 }, paint: C.skin, bone: 'head', noShadow: true },
  { shape: { kind: 'ball', at: [sx + 0.05, sy + 0.42, sz], r: [0.075, 0.088, 0.09] }, paint: C.rockLow, bone: 'head', noShadow: true },
  { shape: { kind: 'sphere', at: [sx - 0.075, sy + 0.41, sz + 0.07], r: 0.018 }, paint: C.dark, bone: 'head', noShadow: true },
  { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [sx - 0.01, sy + 0.47, sz], height: 0.025, r: 0.2 }, { kind: 'cylinder', at: [sx - 0.01, sy + 0.48, sz], height: 0.08, r: 0.1, rTop: 0.085 }] }, paint: { kind: 'split', axis: 'y', at: sy + 0.5, below: C.straw, above: { kind: 'split', axis: 'y', at: sy + 0.525, below: C.red, above: C.straw } }, bone: 'head', noShadow: true },
  { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [SHOULDER[0], SHOULDER[1], sz + 0.08], to: [HAND[0], HAND[1], sz + 0.04], r: 0.034 }, { kind: 'cone', from: [SHOULDER[0], SHOULDER[1], sz - 0.08], to: [HAND[0], HAND[1], sz - 0.04], r: 0.034 }] }, paint: { kind: 'split', axis: 'x', at: sx - 0.1, below: C.skin, above: C.red }, bone: 'arms', noShadow: true, touches: true },
  { shape: { kind: 'cone', from: [HAND[0] + 0.07 * Math.sin((ROD_REST * Math.PI) / 180), HAND[1] - 0.07 * Math.cos((ROD_REST * Math.PI) / 180), sz], to: TIP, r: 0.016, rTo: 0.008 }, paint: C.rockMid, bone: 'arms', noShadow: true, touches: true },

  // the line, in pieces, and its float
  ...Array.from({ length: LINE_PIECES }, (_, i): PartDoc => ({ shape: { kind: 'cone', from: [TIP[0], TIP[1] - i * LINE_PIECE, TIP[2]], to: [TIP[0], TIP[1] - (i + 1) * LINE_PIECE, TIP[2]], r: 0.004 }, paint: C.cloud, bone: `line${i}`, noShadow: true, touches: true })),
  { shape: { kind: 'sphere', at: [TIP[0], 0.9, TIP[2]], r: 0.04 }, paint: { kind: 'split', axis: 'y', at: 0.9, below: C.cloud, above: C.red }, bone: 'float', glow: true, noShadow: true, touches: true },

  // the moon, a crescent, and the sun with rays that turn
  { shape: { kind: 'cut', shape: { kind: 'ball', at: ZENITH, r: [BODY_R, BODY_R, 0.11] }, hole: { kind: 'ball', at: [ZENITH[0] + 0.17, ZENITH[1] + 0.09, ZENITH[2]], r: [0.27, 0.27, 0.5] } }, paint: { kind: 'patches', size: 0.14, colors: [C.moon, C.moon, C.moonLow] }, bone: 'moon', glow: true, noShadow: true, touches: true },
  { shape: { kind: 'sphere', at: ZENITH, r: BODY_R * 0.8 }, paint: { kind: 'split', axis: 'y', at: ZENITH[1] - 0.1, below: C.sunLow, above: C.sun }, bone: 'sun', glow: true, noShadow: true, touches: true },
  { shape: { kind: 'join', shapes: Array.from({ length: 8 }, (_, k) => { const a = (k / 8) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); return { kind: 'cone', from: [ZENITH[0] + c * 0.31, ZENITH[1] + s * 0.31, ZENITH[2]], to: [ZENITH[0] + c * 0.42, ZENITH[1] + s * 0.42, ZENITH[2]], r: 0.04, rTo: 0.012 } as ShapeDoc }) }, paint: C.sunLow, bone: 'rays', glow: true, noShadow: true, touches: true },

  // stars, some with points
  ...STARS.map((at, i): PartDoc => ({
    shape: i % 3 === 0 ? { kind: 'join', shapes: [{ kind: 'box', at, half: [0.07, 0.014, 0.014] }, { kind: 'box', at, half: [0.014, 0.07, 0.014] }, { kind: 'sphere', at, r: 0.028 }] } : { kind: 'sphere', at, r: 0.026 },
    paint: i % 4 === 1 ? C.moon : C.star, bone: `star${i}`, glow: true, noShadow: true,
  })),

  // the sea of clouds: the one he fishes in, then the others, front to back
  cloud('cloud0', [[-1.5, 0.12, 0.25, 0.6, 0.34, 0.5], [-2.05, 0.05, 0.35, 0.42, 0.26, 0.4], [-0.98, 0.02, 0.4, 0.4, 0.26, 0.38], [-1.55, 0.2, -0.15, 0.4, 0.3, 0.36], [-1.75, -0.1, 0.7, 0.45, 0.22, 0.35]]),
  cloud('cloud1', [[1.5, -0.2, 0.95, 0.6, 0.28, 0.45], [2.05, -0.12, 0.8, 0.42, 0.26, 0.4], [1.05, -0.3, 1.05, 0.4, 0.2, 0.35], [1.6, -0.02, 0.7, 0.36, 0.26, 0.34]]),
  cloud('cloud2', [[0.1, -0.35, 1.1, 0.62, 0.22, 0.42], [-0.45, -0.42, 1.25, 0.4, 0.18, 0.34], [0.55, -0.4, 1.3, 0.36, 0.17, 0.3]]),
  cloud('cloud3', [[0.2, -0.05, -1.25, 0.75, 0.36, 0.5], [-0.5, -0.1, -1.15, 0.5, 0.3, 0.42], [0.85, 0.0, -1.35, 0.5, 0.34, 0.4], [0.25, 0.22, -1.4, 0.4, 0.28, 0.36]]),
  cloud('cloud4', [[2.2, 0.0, -0.9, 0.65, 0.36, 0.5], [2.75, -0.08, -0.8, 0.42, 0.28, 0.4], [1.75, -0.1, -0.7, 0.4, 0.26, 0.36], [2.3, 0.28, -1.05, 0.38, 0.26, 0.34]]),
  cloud('cloud5', [[-2.3, 0.1, -1.0, 0.6, 0.34, 0.46], [-1.7, 0.0, -1.2, 0.45, 0.28, 0.4], [-2.8, 0.0, -0.9, 0.38, 0.24, 0.36]]),
  // far small clouds high up
  cloud('cloud6', [[-2.2, 2.05, -1.7, 0.36, 0.1, 0.2], [-2.05, 2.12, -1.7, 0.16, 0.12, 0.16], [-2.4, 2.1, -1.7, 0.13, 0.09, 0.14]]),
  cloud('cloud7', [[2.45, 2.7, -1.7, 0.32, 0.09, 0.2], [2.35, 2.77, -1.7, 0.15, 0.11, 0.15]]),
  // wisps thrown up where the line goes in
  ...Array.from({ length: PUFFS }, (_, i): PartDoc => ({ shape: { kind: 'sphere', at: HOLE, r: 0.085 }, paint: i % 2 ? C.cloud : C.cloudMid, bone: `puff${i}`, noShadow: true, touches: true })),
]

export const FISHING: SceneDoc = {
  name: 'Fishing for the moon',
  loop: LOOP,
  light: { from: [-0.35, 0.85, 0.5], ambient: 0.74, shadow: 0.5, ramp: 0.25 },
  palette: [...Object.values(C), ...SKIES.day, ...SKIES.night, SKIES.dusk[1], ...NIGHT].filter((c, i, all) => all.indexOf(c) === i),
  sky: [SKIES.day[0], SKIES.day[1]],
  look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
  camera: { target: [0.1, 1.55, 0], distance: 6.0, azimuth: 10, elevation: 4, swing: 5 },
  bones: [
    { name: 'isle', at: [0.75, 0.9, 0] },
    { name: 'crown', at: [1.33, 1.65, -0.2], parent: 'isle' },
    { name: 'lantern', at: [LANTERN[0], LANTERN[1] + 0.16, LANTERN[2]], parent: 'isle' },
    { name: 'boy', at: SEAT, parent: 'isle' },
    { name: 'leg0', at: [sx - 0.15, sy + 0.04, sz - 0.05], parent: 'boy' },
    { name: 'leg1', at: [sx - 0.15, sy + 0.04, sz + 0.05], parent: 'boy' },
    { name: 'head', at: [sx, sy + 0.3, sz], parent: 'boy' },
    { name: 'arms', at: SHOULDER, parent: 'boy' },
    ...Array.from({ length: LINE_PIECES }, (_, i) => ({ name: `line${i}`, at: [TIP[0], TIP[1] - i * LINE_PIECE, TIP[2]] as Vec3 })),
    { name: 'float', at: [TIP[0], 0.9, TIP[2]] },
    { name: 'moon', at: ZENITH },
    { name: 'sun', at: ZENITH },
    { name: 'rays', at: ZENITH, parent: 'sun' },
    ...STARS.map((at, i) => ({ name: `star${i}`, at })),
    ...[[-1.5, 0.1, 0.25], [1.5, -0.2, 0.95], [0.1, -0.35, 1.1], [0.2, -0.05, -1.25], [2.2, 0, -0.9], [-2.3, 0.1, -1.0], [-2.2, 2.05, -1.7], [2.45, 2.7, -1.7]].map((at, i) => ({ name: `cloud${i}`, at: at as Vec3 })),
    ...Array.from({ length: PUFFS }, (_, i) => ({ name: `puff${i}`, at: HOLE })),
    { name: 'chip0', at: [0.2, 0.2, 0.3] },
    { name: 'chip1', at: [1.25, 0.3, 0.2] },
  ],
  parts,
  moves: [
    { kind: 'bob', bone: 'isle', by: [0, 0.03, 0], times: 3 },
    { kind: 'sway', bone: 'crown', axis: 'z', degrees: 2.5, times: 6, wind: 4 },
    { kind: 'sway', bone: 'lantern', axis: 'z', degrees: 7, times: 9, phase: 0.2, wind: 10 },
    { kind: 'spin', bone: 'rays', axis: 'z', times: 2 },
    { kind: 'bob', bone: 'chip0', by: [0, 0.05, 0], times: 4, phase: 0.3 },
    { kind: 'bob', bone: 'chip1', by: [0, 0.04, 0], times: 5, phase: 0.7 },
    { kind: 'bob', bone: 'cloud0', by: [0.03, 0.012, 0], times: 2 },
    { kind: 'bob', bone: 'cloud1', by: [0.07, 0.015, 0], times: 1, phase: 0.3 },
    { kind: 'bob', bone: 'cloud2', by: [0.09, 0.01, 0], times: 2, phase: 0.6 },
    { kind: 'bob', bone: 'cloud3', by: [0.08, 0.015, 0], times: 1, phase: 0.8 },
    { kind: 'bob', bone: 'cloud4', by: [0.05, 0.012, 0], times: 2, phase: 0.1 },
    { kind: 'bob', bone: 'cloud5', by: [0.06, 0.014, 0], times: 1, phase: 0.5 },
    { kind: 'bob', bone: 'cloud6', by: [0.12, 0, 0], times: 1, phase: 0.2 },
    { kind: 'bob', bone: 'cloud7', by: [0.1, 0, 0], times: 1, phase: 0.7 },
  ],
}
