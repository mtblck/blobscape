import type { Vec3 } from '../../splat-core/blobs.ts'
import type { PropDoc, SceneProject } from '../../splat-engine/project.ts'
import type { BoneDoc, During, MoveDoc, PartDoc, SceneDoc } from '../../splat-engine/sceneDoc.ts'
import type { MadeProp } from './garden.ts'

/**
 * A giant harvest cornucopia on a round of autumn grass on a golden afternoon (Matt, 2026-11-26, Thanksgiving week),
 * and three small animals that come by in turn to look at it before they go: a squirrel scurries in from the left,
 * sits up and nibbles an acorn; a cardinal flutters down onto the big pumpkin and pecks the grapes, which jiggle; a
 * fox trots out from the back, sniffs the gourds and nudges one, which wobbles. Each is a library piece written on its
 * own (docs/scenes-from-props.md), in the scene's own coordinates, so the scene below sets them down where they stand.
 * Data only, as a scene description is: see docs/scene-descriptions.md.
 */

/** The seconds before the scene repeats: one visit by each animal. */
export const CORNUCOPIA_LOOP = 30

/** The colors every piece here carries, so any of them can stand alone in Scene Creator. */
const PALETTE = [
  '#1e1410', '#3a2416', '#5c3a20', '#7a4f24', '#a8723a', '#cf9a52', '#e8c07a', '#f6dfa8',
  '#8a3410', '#c4541a', '#e8782a', '#f6a24a', '#6e1418', '#a82226', '#d8443a', '#b8861c',
  '#e0b430', '#f6dc6a', '#2a3a1a', '#46602a', '#6e8a3a', '#9cb050', '#2e1a3a', '#553068',
  '#8a5a9a', '#fbf3e0', '#6a6460', '#a8a09a', '#7fa8d0', '#f2d49a',
]
const SKY: [string, string] = ['#7fa8d0', '#f2d49a']
const LIGHT: SceneDoc['light'] = { from: [0.45, 0.85, 0.65], ambient: 0.6, shadow: 0.5 }
const LOOK: SceneDoc['look'] = { dither: 0.5, glow: 1.2, outline: true, edges: true }

/** A prop written where it stands in the scene, framed for its card round `foot`. */
function made(name: string, foot: Vec3, tall: number, parts: PartDoc[], more: { bones?: BoneDoc[]; moves?: MoveDoc[] } = {}): PropDoc {
  return {
    name,
    foot,
    doc: {
      name, loop: CORNUCOPIA_LOOP, light: LIGHT, palette: PALETTE, look: LOOK,
      camera: { target: [foot[0], tall / 2, foot[2]], distance: Math.max(0.9, tall * 2.6), azimuth: 14, elevation: 12 },
      parts, ...more,
    },
  }
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

// --- the land ------------------------------------------------------------------------------------------------------

/** Fallen leaves lying flat, a few in each clump so a join stays small. */
const LEAF_COLORS = ['#c4541a', '#e8782a', '#a82226', '#e0b430', '#8a3410']
const leafClump = (at: Vec3, seed: number): PartDoc => ({
  shape: {
    kind: 'join',
    shapes: [0, 1, 2, 3].map((k) => {
      const a = seed * 2.3 + k * 1.7
      return { kind: 'ball', at: [at[0] + Math.cos(a) * 0.09 * (k % 3), 0.012, at[2] + Math.sin(a) * 0.08 * ((k + 1) % 3)], r: [0.045, 0.01, 0.028] }
    }),
  },
  paint: LEAF_COLORS[seed % LEAF_COLORS.length],
  noShadow: true,
})

/** A round of autumn grass on a golden afternoon, with fallen leaves, acorns, stones and the sun low in the west. */
export const AUTUMN_GREEN: PropDoc = {
  name: 'Autumn green',
  foot: [0, 0, 0],
  doc: {
    name: 'Autumn green',
    loop: CORNUCOPIA_LOOP,
    tags: ['grassy', 'farm'],
    light: LIGHT,
    palette: PALETTE,
    sky: SKY,
    skyReach: 0.8,
    look: LOOK,
    camera: { target: [0.15, 0.55, 0], distance: 5, azimuth: 38, elevation: 14, swing: 8 },
    heavens: { sun: { at: [2.6, 2.4, -2.4], r: 0.22, color: '#f6dc6a' } },
    air: { haze: { color: '#f2d49a', from: 2.5, to: 9 } },
    parts: [
      {
        shape: { kind: 'rough', by: 0.02, scale: 0.5, shape: { kind: 'cylinder', at: [0, -0.26, 0], height: 0.26, r: 1.95, rTop: 1.9 } },
        paint: {
          kind: 'faces',
          top: { kind: 'clumps', size: 0.25, base: '#6e8a3a', colors: ['#9cb050', '#46602a', '#b8861c'], amount: 0.3, seed: 11 },
          side: { kind: 'bands', axis: 'y', size: 0.06, colors: ['#5c3a20', '#3a2416', '#7a4f24'] },
        },
      },
      // tufts of long grass round the edge, so the round's outline is not a plain disc
      ...([[-1.55, 0.95], [1.7, -0.75], [-1.2, -1.35], [0.4, 1.78], [1.25, 1.3], [-1.85, -0.25]] as [number, number][]).map(([x, z], i): PartDoc => ({
        shape: { kind: 'join', shapes: [0, 1, 2, 3, 4].map((k) => ({ kind: 'cone', from: [x + k * 0.03 - 0.06, 0, z + ((k * 7) % 5) * 0.015 - 0.03], to: [x + k * 0.05 - 0.11, 0.12 + (k % 2) * 0.05, z + ((k * 3) % 5) * 0.02 - 0.04], r: 0.012, rTo: 0.004 })) },
        paint: i % 2 ? '#9cb050' : '#b8861c',
        noShadow: true,
      })),
      leafClump([-1.2, 0, 0.2], 0), leafClump([-0.5, 0, 1.25], 1), leafClump([0.6, 0, 1.15], 2), leafClump([1.0, 0, -0.9], 3),
      leafClump([-0.4, 0, -1.2], 4), leafClump([1.45, 0, 0.95], 5), leafClump([-1.45, 0, 1.15], 6), leafClump([0.1, 0, -0.95], 7),
      leafClump([-0.95, 0, 1.4], 8), leafClump([0.95, 0, 1.55], 9),
      // stones
      { shape: { kind: 'rough', by: 0.012, scale: 0.15, shape: { kind: 'ball', at: [-1.5, 0.02, -0.6], r: [0.12, 0.07, 0.1] } }, paint: { kind: 'speckle', size: 0.03, colors: ['#a8a09a', '#6a6460'] } },
      { shape: { kind: 'rough', by: 0.01, scale: 0.15, shape: { kind: 'ball', at: [0.75, 0.01, 1.45], r: [0.08, 0.05, 0.07] } }, paint: { kind: 'speckle', size: 0.03, colors: ['#a8a09a', '#6a6460'] } },
      // acorns where the squirrel stops
      { shape: { kind: 'join', shapes: [{ kind: 'ball', at: [0.12, 0.022, 0.72], r: [0.022, 0.02, 0.018] }, { kind: 'ball', at: [0.2, 0.02, 0.55], r: [0.02, 0.018, 0.017] }] }, paint: '#a8723a', noShadow: true },
      { shape: { kind: 'join', shapes: [{ kind: 'ball', at: [0.12, 0.04, 0.72], r: [0.024, 0.01, 0.02] }, { kind: 'ball', at: [0.2, 0.036, 0.55], r: [0.022, 0.01, 0.019] }] }, paint: '#5c3a20', noShadow: true },
    ],
  },
}

// --- the horn ------------------------------------------------------------------------------------------------------

/** The horn's middle line from its mouth (at x = 0.3, opening toward +x) back to its curled tip, and its radius there. */
const HORN_R: [number, number] = [0.52, 0.035]
const HORN_LINE: [number, number][] = [
  [0.3, -0.1], [0, -0.12], [-0.35, -0.14], [-0.7, -0.15], [-1.0, -0.15], [-1.25, -0.13], [-1.42, -0.11],
]
/** The curl: points past the last of `HORN_LINE`, rising and turning back over. */
const HORN_CURL: Vec3[] = [[-1.52, 0.42, -0.1], [-1.53, 0.6, -0.09], [-1.45, 0.75, -0.08], [-1.32, 0.82, -0.07], [-1.2, 0.79, -0.07]]

/** The horn's path, each point along the ground lifted so its underside rests on the grass. */
const HORN_PATH: Vec3[] = (() => {
  const flat: Vec3[] = HORN_LINE.map(([x, z]) => [x, 0, z])
  const all = [...flat, ...HORN_CURL]
  // the radius at each point falls with the length run, as `sweep` tapers it; lengths are measured on the ground line
  // first, which is close enough for the lift
  const lens = all.slice(1).map((q, i) => Math.hypot(q[0] - all[i][0], q[2] - all[i][2], i >= flat.length - 1 ? q[1] - all[i][1] : 0))
  const total = lens.reduce((a, b) => a + b, 0)
  let run = 0
  return all.map((p, i) => {
    if (i) run += lens[i - 1]
    const r = HORN_R[0] + ((HORN_R[1] - HORN_R[0]) * run) / total
    return i < flat.length ? [p[0], r - 0.03, p[2]] : p
  })
})()

/** A ring of `n` points round the horn's line at `at`, facing along x, closed. */
const loopAt = (at: Vec3, r: number, n = 14): Vec3[] =>
  Array.from({ length: n + 1 }, (_, k) => [at[0], at[1] + Math.cos((k / n) * 2 * Math.PI) * r, at[2] + Math.sin((k / n) * 2 * Math.PI) * r])

const hornAt = (i: number): Vec3 => HORN_PATH[i]
const MOUTH = hornAt(0)

const WICKER = { kind: 'bricks' as const, size: [0.1, 0.05] as [number, number], colors: ['#a8723a', '#cf9a52', '#a8723a', '#e8c07a'], line: '#5c3a20' }

/**
 * The heap inside the mouth: a pumpkin at the back with apples and a gourd on it, then apples, a pear, grapes and a
 * squash lower down toward the lip, each resting on the horn's curved floor or on what is under it.
 */
const INSIDE: PartDoc[] = [
  ...pumpkin([-0.05, 0.07, -0.1], 0.24),
  ...pumpkin([0.16, 0.05, -0.27], 0.14, ['#f6dfa8', '#cf9a52', '#a8723a'], null),
  ...apple([-0.08, 0.43, -0.22], undefined, false), ...apple([0.04, 0.41, 0.02], '#d8443a', false), ...apple([0.14, 0.26, 0.1], undefined, false),
  { shape: { kind: 'ball', at: [-0.16, 0.48, 0.0], r: [0.08, 0.065, 0.07] }, paint: { kind: 'bands', axis: 'x', size: 0.03, colors: ['#46602a', '#9cb050', '#46602a', '#f6dc6a'] }, noShadow: true },
  ...grapes([0.08, 0.56, -0.12], 3, undefined, false),
  ...pear([0.2, 0.04, 0.04], 1),
  ...apple([0.26, 0.04, 0.18]), ...apple([0.24, 0.05, -0.1], '#d8443a', false),
  { shape: { kind: 'join', blend: 'smooth', by: 0.04, shapes: [{ kind: 'sphere', at: [0.02, 0.12, 0.2], r: 0.075 }, { kind: 'cone', from: [0.02, 0.12, 0.2], to: [0.2, 0.09, 0.3], r: 0.042, rTo: 0.038 }] }, paint: { kind: 'faces', top: '#f6dfa8', side: '#e8c07a', under: '#cf9a52' }, noShadow: true },
]

/** A giant woven horn of plenty lying on its side, its mouth open toward +x and its tip curled up behind. */
export const CORNUCOPIA: PropDoc = made('Cornucopia', [-0.5, 0, -0.12], 1.1, [
  {
    shape: {
      kind: 'cut',
      shape: { kind: 'sweep', path: HORN_PATH, r: HORN_R[0], rTo: HORN_R[1] },
      hole: { kind: 'sweep', path: [add(MOUTH, [0.25, 0, 0]), MOUTH, hornAt(1), hornAt(2), hornAt(3)], r: 0.5175, rTo: 0.28 },
    },
    paint: WICKER,
    strokes: 0.4,
  },
  // a darker weave lining the hollow, which runs a good way back so the mouth reads as open
  {
    shape: {
      kind: 'cut',
      shape: { kind: 'sweep', path: [add(MOUTH, [-0.03, 0, 0]), hornAt(1), hornAt(2), hornAt(3)], r: 0.476, rTo: 0.28 },
      hole: { kind: 'sweep', path: [add(MOUTH, [0.2, 0, 0]), MOUTH, hornAt(1), hornAt(2), hornAt(3)], r: 0.468, rTo: 0.24 },
    },
    paint: { kind: 'bricks', size: [0.1, 0.05], colors: ['#5c3a20', '#7a4f24'], line: '#3a2416' },
    noShadow: true,
  },
  // the harvest heaped inside, highest at the back, with the wheat and corn pushed into the top of the heap
  ...INSIDE,
  // a braided rim round the mouth and two bands of binding along the horn
  { shape: { kind: 'sweep', path: loopAt(add(MOUTH, [0.01, 0, 0]), HORN_R[0] - 0.015, 15), r: 0.045 }, paint: { kind: 'bands', axis: 'y', size: 0.05, colors: ['#e8c07a', '#a8723a'] } },
  { shape: { kind: 'sweep', path: loopAt(add(hornAt(2), [0, 0, 0]), 0.405, 14), r: 0.028 }, paint: '#7a4f24', noShadow: true },
  { shape: { kind: 'sweep', path: loopAt(add(hornAt(4), [0, 0, 0]), 0.3, 12), r: 0.024 }, paint: '#7a4f24', noShadow: true },
  // wheat and corn standing up out of the top of the mouth
  {
    shape: { kind: 'join', shapes: [[0.42, 1.2, -0.32], [0.55, 1.28, -0.15], [0.6, 1.25, 0.03], [0.5, 1.18, 0.16], [0.68, 1.1, -0.3]].map(([x, y, z]) => ({ kind: 'cone', from: [-0.02, 0.5, -0.12], to: [x, y, z], r: 0.036, rTo: 0.03 })) },
    paint: '#e0b430', noShadow: true,
  },
  {
    shape: { kind: 'join', shapes: [[0.42, 1.2, -0.32], [0.55, 1.28, -0.15], [0.6, 1.25, 0.03], [0.5, 1.18, 0.16], [0.68, 1.1, -0.3]].map(([x, y, z]) => ({ kind: 'ball', at: [x + 0.02, y + 0.05, z], r: [0.05, 0.08, 0.045] })) },
    paint: { kind: 'speckle', size: 0.02, colors: ['#e0b430', '#f6dc6a', '#b8861c'] }, noShadow: true,
  },
  { shape: { kind: 'cone', from: [0.08, 0.42, 0.08], to: [0.55, 0.9, 0.22], r: 0.055, rTo: 0.045 }, paint: { kind: 'speckle', size: 0.025, colors: ['#e0b430', '#f6dc6a', '#b8861c'] }, noShadow: true },
  { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [0.5, 0.86, 0.2], to: [0.72, 0.84, 0.36], r: 0.035, rTo: 0.022 }, { kind: 'cone', from: [0.5, 0.88, 0.21], to: [0.7, 1.02, 0.25], r: 0.035, rTo: 0.022 }] }, paint: '#9cb050', noShadow: true },
])

// --- the harvest spilling out --------------------------------------------------------------------------------------

/** A ribbed pumpkin: lobes round its middle, a stalk on top. */
function pumpkin(at: Vec3, r: number, colors = ['#e8782a', '#c4541a', '#8a3410'], stalk: string | null = '#46602a'): PartDoc[] {
  const h = r * 0.78
  return [
    {
      shape: { kind: 'join', shapes: Array.from({ length: 6 }, (_, k) => ({ kind: 'ball' as const, at: [at[0] + Math.cos((k * Math.PI) / 3) * r * 0.32, at[1] + h, at[2] + Math.sin((k * Math.PI) / 3) * r * 0.32] as Vec3, r: [r * 0.7, h, r * 0.7] as Vec3 })) },
      paint: { kind: 'faces', top: { kind: 'patches', size: r * 0.4, colors: [colors[0], colors[0], '#f6a24a'] }, side: colors[0], under: colors[1] },
      grime: colors[2],
    },
    ...(stalk ? [{ shape: { kind: 'cone', from: [at[0], at[1] + h * 1.85, at[2]], to: [at[0] + r * 0.12, at[1] + h * 2.25, at[2] + r * 0.05], r: r * 0.11, rTo: r * 0.07 }, paint: stalk, noShadow: true } as PartDoc] : []),
  ]
}

/** An apple with a stalk. */
function apple(at: Vec3, color = '#a82226', stalk = true): PartDoc[] {
  return [
  { shape: { kind: 'ball', at: add(at, [0, 0.06, 0]), r: [0.068, 0.062, 0.068] }, paint: { kind: 'faces', top: '#d8443a', side: color, under: '#6e1418' }, noShadow: true },
  ...(stalk ? [{ shape: { kind: 'cone', from: add(at, [0, 0.11, 0]), to: add(at, [0.01, 0.15, 0.005]), r: 0.008 }, paint: '#3a2416', noShadow: true } as PartDoc] : []),
  ]
}

/** A pear lying a little over. */
function pear(at: Vec3, lean: number): PartDoc[] {
  return [
  { shape: { kind: 'join', blend: 'smooth', by: 0.03, shapes: [{ kind: 'sphere', at: add(at, [0, 0.06, 0]), r: 0.065 }, { kind: 'sphere', at: add(at, [lean * 0.05, 0.13, 0]), r: 0.04 }] }, paint: { kind: 'faces', top: '#f6dc6a', side: '#e0b430', under: '#b8861c' }, noShadow: true },
  { shape: { kind: 'cone', from: add(at, [lean * 0.06, 0.17, 0]), to: add(at, [lean * 0.08, 0.21, 0]), r: 0.008 }, paint: '#3a2416', noShadow: true },
  ]
}

/** A bunch of grapes, `n` across, hanging or lying from `at` downward. */
function grapes(at: Vec3, n: number, bone?: string, stalk = true): PartDoc[] {
  const shapes: { kind: 'sphere'; at: Vec3; r: number }[] = []
  for (let row = 0; row < n; row++) {
    const w = n - row
    for (let k = 0; k < w; k++) shapes.push({ kind: 'sphere', at: add(at, [(k - (w - 1) / 2) * 0.05 + (row % 2) * 0.012, -row * 0.045, ((k + row) % 2) * 0.03 - 0.015]), r: 0.03 })
  }
  return [
    { shape: { kind: 'join', shapes }, paint: { kind: 'speckle', size: 0.03, colors: ['#553068', '#8a5a9a', '#2e1a3a'] }, noShadow: true, ...(bone ? { bone } : {}) },
    ...(stalk ? [{ shape: { kind: 'cone', from: add(at, [0, 0.03, 0]), to: add(at, [0.04, 0.09, 0]), r: 0.01 }, paint: '#46602a', noShadow: true, ...(bone ? { bone } : {}) } as PartDoc] : []),
  ]
}

/** The gourd the fox nudges, standing on its round end. */
const GOURD_AT: Vec3 = [1.42, 0, 0.8]
/** The grapes the cardinal pecks, lying on the big pumpkin. */
const PECKED_AT: Vec3 = [0.64, 0.55, -0.28]

/** Pumpkins, squash, gourds, apples, pears, grapes and leaves spilling out of the horn's mouth onto the grass. */
export const HARVEST_SPILL: PropDoc = made('Harvest spill', [0.8, 0, 0.1], 0.8, [
  // tumbling over the lip
  ...apple([0.38, 0, -0.12], undefined, false), ...apple([0.42, 0, 0.06], '#d8443a'),
  // spilling out
  ...pumpkin([0.9, 0, -0.32], 0.32),
  ...pumpkin([1.05, 0, 0.3], 0.22),
  ...pumpkin([0.4, 0, 0.5], 0.14, ['#f6dfa8', '#cf9a52', '#a8723a']),
  // a butternut squash and a striped green gourd
  { shape: { kind: 'join', blend: 'smooth', by: 0.04, shapes: [{ kind: 'sphere', at: [0.72, 0.09, 0.55], r: 0.09 }, { kind: 'cone', from: [0.72, 0.09, 0.55], to: [0.9, 0.06, 0.74], r: 0.05, rTo: 0.045 }] }, paint: { kind: 'faces', top: '#f6dfa8', side: '#e8c07a', under: '#cf9a52' }, noShadow: true },
  { shape: { kind: 'ball', at: [1.38, 0.08, 0.05], r: [0.1, 0.08, 0.085] }, paint: { kind: 'bands', axis: 'x', size: 0.03, colors: ['#46602a', '#9cb050', '#46602a', '#f6dc6a'] }, noShadow: true },
  ...apple([0.5, 0, 0.18]), ...apple([0.98, 0, 0.62]), ...apple([1.3, 0, 0.38]), ...apple([0.25, 0, 0.62], '#d8443a'), ...apple([1.25, 0, -0.32]),
  ...pear([0.56, 0, 0.78], 1), ...pear([1.17, 0, 0.0], -1),
  ...apple([0.62, 0, 0.05]), ...apple([0.8, 0, 0.2], '#d8443a'), ...apple([1.4, 0, 0.55]), ...apple([0.15, 0, 0.42]),
  ...pumpkin([0.42, 0, -0.62], 0.13, ['#f6dfa8', '#cf9a52', '#a8723a']),
  ...grapes([0.3, 0.14, 0.86], 3),
  // an ear of corn lying in its husk
  { shape: { kind: 'cone', from: [0.85, 0.05, 0.95], to: [1.15, 0.05, 1.05], r: 0.045, rTo: 0.035 }, paint: { kind: 'speckle', size: 0.02, colors: ['#e0b430', '#c4541a', '#f6dc6a', '#8a3410'] }, noShadow: true },
  { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [0.85, 0.05, 0.95], to: [0.68, 0.03, 0.86], r: 0.03, rTo: 0.006 }, { kind: 'cone', from: [0.85, 0.05, 0.95], to: [0.7, 0.03, 1.02], r: 0.03, rTo: 0.006 }] }, paint: '#e8c07a', noShadow: true },
  // the grapes the cardinal pecks, on the big pumpkin
  ...grapes(PECKED_AT, 3, 'grapes'),
  // the gourd the fox nudges: a yellow bottle gourd with a green neck
  { shape: { kind: 'join', blend: 'smooth', by: 0.03, shapes: [{ kind: 'sphere', at: add(GOURD_AT, [0, 0.075, 0]), r: 0.075 }, { kind: 'sphere', at: add(GOURD_AT, [0, 0.17, 0]), r: 0.045 }] }, paint: { kind: 'split', axis: 'y', at: 0.14, below: '#f6dc6a', above: '#6e8a3a' }, bone: 'gourd', noShadow: true },
  { shape: { kind: 'cone', from: add(GOURD_AT, [0, 0.21, 0]), to: add(GOURD_AT, [0.02, 0.25, 0]), r: 0.01 }, paint: '#3a2416', bone: 'gourd', noShadow: true },
  // leaves among it all
  { shape: { kind: 'join', shapes: [{ kind: 'ball', at: [0.62, 0.02, 0.32], r: [0.06, 0.012, 0.035] }, { kind: 'ball', at: [0.86, 0.02, 0.45], r: [0.055, 0.012, 0.035] }, { kind: 'ball', at: [1.1, 0.335, 0.31], r: [0.055, 0.012, 0.035] }] }, paint: '#c4541a', noShadow: true },
  { shape: { kind: 'join', shapes: [{ kind: 'ball', at: [0.3, 0.02, 0.34], r: [0.05, 0.012, 0.035] }, { kind: 'ball', at: [1.2, 0.02, 0.55], r: [0.06, 0.012, 0.04] }] }, paint: '#e0b430', noShadow: true },
], {
  bones: [
    { name: 'grapes', at: add(PECKED_AT, [0, 0.03, 0]) },
    { name: 'gourd', at: GOURD_AT },
  ],
  moves: [
    // the grapes jiggle as the cardinal pecks them, and the gourd wobbles where the fox nudged it
    { kind: 'sway', bone: 'grapes', axis: 'x', degrees: 7, times: 5, during: [0.47, 0.51] },
    { kind: 'sway', bone: 'gourd', axis: 'x', degrees: -14, times: 3, during: [0.8, 0.85] },
    { kind: 'sway', bone: 'gourd', axis: 'z', degrees: 6, times: 2, phase: 0.2, during: [0.8, 0.85] },
  ],
})

// --- the corn shocks ----------------------------------------------------------------------------------------------

/** Where the corn shock stands, at the back of the green. */
const SHOCK_AT: Vec3 = [0.3, 0, -1.35]

/** Dry cornstalks bundled upright, tied round the middle, their feet splayed and their tops fanned out over the tie. */
export const CORN_SHOCK: PropDoc = (() => {
  const n = 13, tie = 0.52, top = 1.02
  const stalks: { kind: 'sweep'; path: Vec3[]; r: number; rTo: number }[] = []
  const leaves: { kind: 'cone'; from: Vec3; to: Vec3; r: number; rTo: number }[] = []
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 2 * Math.PI + (k % 3) * 0.2
    const c = Math.cos(a), s = Math.sin(a)
    const foot = 0.16 + (k % 3) * 0.025, tip = 0.1 + ((k * 5) % 4) * 0.03, up = top - ((k * 7) % 5) * 0.04
    const at = (r: number, y: number): Vec3 => [SHOCK_AT[0] + c * r, y, SHOCK_AT[2] + s * r]
    stalks.push({ kind: 'sweep', path: [at(foot, 0), at(0.06, tie), at(tip, up)], r: 0.032, rTo: 0.024 })
    {
      const y = tie + 0.14 + (k % 4) * 0.06
      leaves.push({ kind: 'cone', from: at(0.07, y), to: [SHOCK_AT[0] + Math.cos(a + 0.5) * 0.28, y - 0.12, SHOCK_AT[2] + Math.sin(a + 0.5) * 0.28], r: 0.036, rTo: 0.022 })
    }
  }
  const tied = Array.from({ length: 15 }, (_, k): Vec3 => [SHOCK_AT[0] + Math.cos((k / 14) * 2 * Math.PI) * 0.07, tie, SHOCK_AT[2] + Math.sin((k / 14) * 2 * Math.PI) * 0.07])
  return made('Corn shock', SHOCK_AT, top, [
    { shape: { kind: 'join', shapes: stalks }, paint: { kind: 'bands', axis: 'y', size: 0.09, colors: ['#cf9a52', '#e8c07a', '#a8723a'] }, bone: 'shock' },
    { shape: { kind: 'join', shapes: leaves }, paint: { kind: 'speckle', size: 0.03, colors: ['#e8c07a', '#cf9a52', '#b8861c'] }, bone: 'shock', noShadow: true },
    { shape: { kind: 'sweep', path: tied, r: 0.025 }, paint: '#5c3a20', bone: 'shock', noShadow: true },
  ], {
    bones: [{ name: 'shock', at: SHOCK_AT }],
    moves: [{ kind: 'sway', bone: 'shock', axis: 'z', degrees: 0.8, times: 3, wind: 4 }],
  })
})()

// --- single cornstalks ---------------------------------------------------------------------------------------------

/** How one cornstalk grows: its height, which way and how far it leans, its colors, its ears and how its tassel hangs. */
interface Stalk { at: Vec3; tall: number; lean: [number, number]; green: [string, string]; ears: number; seed: number }

/** A single standing cornstalk: a jointed stem, long arching leaves on alternate sides, ears in their husks and a tassel. */
function cornstalk(name: string, k: Stalk): PropDoc {
  const [x0, , z0] = k.at
  const up = (t: number): Vec3 => [x0 + k.lean[0] * t * t, k.tall * t, z0 + k.lean[1] * t * t]
  const leaves: { kind: 'sweep'; path: Vec3[]; r: number; rTo: number }[] = []
  for (let i = 0; i < 7; i++) {
    const t = 0.16 + i * 0.1, a = k.seed + i * 0.45 + (i % 2) * Math.PI, c = Math.cos(a), s = Math.sin(a)
    const from = up(t), reach = 0.44 - i * 0.035
    leaves.push({ kind: 'sweep', path: [from, [from[0] + c * reach * 0.45, from[1] + 0.14, from[2] + s * reach * 0.45], [from[0] + c * reach, from[1] - 0.04, from[2] + s * reach]], r: 0.04, rTo: 0.022 })
  }
  const ears: PartDoc[] = []
  for (let e = 0; e < k.ears; e++) {
    const t = 0.45 + e * 0.13, a = k.seed + 1.3 + e * 2.4, c = Math.cos(a), s = Math.sin(a), from = up(t)
    const to: Vec3 = [from[0] + c * 0.09, from[1] + 0.17, from[2] + s * 0.09]
    ears.push({ shape: { kind: 'cone', from: [from[0] + c * 0.03, from[1], from[2] + s * 0.03], to, r: 0.045, rTo: 0.025 }, paint: { kind: 'faces', top: k.green[1], side: '#9cb050', under: '#46602a' }, bone: 'stalk', noShadow: true })
    ears.push({ shape: { kind: 'cone', from: to, to: [to[0] + c * 0.05, to[1] + 0.04, to[2] + s * 0.05], r: 0.022, rTo: 0.014 }, paint: '#a8723a', bone: 'stalk', noShadow: true })
  }
  const top = up(1)
  const tassel = [0, 1, 2, 3, 4].map((i) => {
    const a = k.seed + i * 1.26
    return { kind: 'cone' as const, from: top, to: [top[0] + Math.cos(a) * 0.09, top[1] + 0.06 - (i % 2) * 0.06, top[2] + Math.sin(a) * 0.09] as Vec3, r: 0.024, rTo: 0.016 }
  })
  return made(name, k.at, k.tall + 0.1, [
    { shape: { kind: 'sweep', path: [0, 0.25, 0.5, 0.75, 1].map(up), r: 0.042, rTo: 0.03 }, paint: { kind: 'bands', axis: 'y', size: 0.12, colors: [k.green[0], k.green[0], k.green[1]] }, bone: 'stalk' },
    { shape: { kind: 'join', shapes: leaves }, paint: { kind: 'speckle', size: 0.04, colors: [k.green[0], k.green[1], k.green[0]] }, bone: 'stalk', noShadow: true },
    ...ears,
    { shape: { kind: 'join', shapes: [...tassel, { kind: 'cone', from: top, to: [top[0], top[1] + 0.12, top[2]], r: 0.024, rTo: 0.016 }] }, paint: { kind: 'speckle', size: 0.02, colors: ['#e0b430', '#cf9a52', '#f6dc6a'] }, bone: 'stalk', noShadow: true },
  ], {
    bones: [{ name: 'stalk', at: k.at }],
    moves: [{ kind: 'sway', bone: 'stalk', axis: 'z', degrees: 1.2, times: 3, phase: (k.seed % 1), wind: 6 }],
  })
}

/** A tall green stalk with one ear. */
export const CORNSTALK_TALL = cornstalk('Tall cornstalk', { at: [-1.2, 0, -0.72], tall: 1.25, lean: [0.04, 0.02], green: ['#46602a', '#6e8a3a'], ears: 1, seed: 0.4 })
/** A shorter stalk turning gold, with two ears. */
export const CORNSTALK_GOLD = cornstalk('Golden cornstalk', { at: [0.72, 0, -1.58], tall: 1.05, lean: [-0.05, 0.03], green: ['#b8861c', '#e0b430'], ears: 2, seed: 2.1 })
/** A stalk leaning over, half green and half dry. */
export const CORNSTALK_LEANING = cornstalk('Leaning cornstalk', { at: [-0.02, 0, -1.22], tall: 1.15, lean: [0.18, 0.06], green: ['#6e8a3a', '#cf9a52'], ears: 1, seed: 4.3 })

// --- the visitors --------------------------------------------------------------------------------------------------

/** A share `a` to `b` of the way through the window `w`, as shares of the loop (wrapped into 0 to 1). */
const within = (w: During, a: number, b: number): During => {
  const at = (k: number) => { const u = w[0] + (w[1] - w[0]) * k; return Math.round((u - Math.floor(u)) * 10000) / 10000 }
  return [at(a), at(b)]
}

/**
 * A visit, as moves on two bones: `go` (where the animal stands, set halfway along its way) comes from `from` to `to`
 * and goes back over the window `w`, slowing to a stand at `to`; it grows in at `from` and shrinks away there again.
 * `turn` (a child of `go`, at the animal's middle) turns it about once it has stood a while, `way` +1 or -1 saying which
 * way round. The animal is drawn as it comes, facing the way it comes.
 *
 * Moves only go to and fro, so the stand is made from three of them: their sum is how far along it is, as the
 * integral of sin⁵, which is nearly still for a third of the window at `to`. The turn is a spin with two sways that
 * bend it into a quick half turn as the window starts, a long hold, and the other half while it has shrunk away.
 */
function visit(go: string, turn: string, from: Vec3, to: Vec3, w: During, way: 1 | -1): MoveDoc[] {
  // f(d) = -(cos 2πd - cos 6πd / 6 + cos 10πd / 50), from -k to k with k = 1 - 1/6 + 1/50
  const k = 1 - 1 / 6 + 1 / 50
  const half: Vec3 = [0, 1, 2].map((i) => (to[i] - from[i]) / 2 / k) as Vec3
  const times = (s: number): Vec3 => half.map((c) => c * s) as Vec3
  const turning = within(w, 0.56, 1)
  return [
    { kind: 'bob', bone: go, by: half, times: 1, phase: 0.75, during: w },
    { kind: 'bob', bone: go, by: times(1 / 6), times: 3, phase: 0.25, during: w },
    { kind: 'bob', bone: go, by: times(1 / 50), times: 5, phase: 0.75, during: w },
    { kind: 'sprout', bone: go, times: 1, during: w, rise: 0.06, fall: 0.06 },
    { kind: 'spin', bone: turn, axis: 'y', times: way, during: turning },
    { kind: 'sway', bone: turn, axis: 'y', degrees: 76.4 * way, times: 1, during: turning },
    { kind: 'sway', bone: turn, axis: 'y', degrees: 9.55 * way, times: 2, during: turning },
  ]
}

const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]

/**
 * How big the scene sets each visitor down (about the middle of its way, its foot), so they read beside the giant horn
 * while the library keeps them at their own size; their ways are written that much shorter so they still come from and
 * go to where the scene wants them (`written`).
 */
const SQUIRREL_SIZE = 1.5, BIRD_SIZE = 1.4, FOX_SIZE = 1.3
const written = (foot: Vec3, at: Vec3, size: number): Vec3 => [0, 1, 2].map((i) => foot[i] + (at[i] - foot[i]) / size) as Vec3

/** The squirrel's way in from the left edge, and when. */
const SQ = mid([-1.72, 0, 0.66], [-0.12, 0, 0.66])
const SQUIRREL_FROM = written(SQ, [-1.72, 0, 0.66], SQUIRREL_SIZE), SQUIRREL_TO = written(SQ, [-0.12, 0, 0.66], SQUIRREL_SIZE), SQUIRREL_VISIT: During = [0.02, 0.3]
/** A point on the squirrel, from its middle on the ground: x ahead (+x), y up, z to its right. Its parts stand a hop's height up. */
const sq = (x: number, y: number, z: number): Vec3 => [SQ[0] + x, y + 0.03, SQ[2] + z]

/** A red squirrel that scurries in from the left, sits up to nibble an acorn, and scurries off again. */
export const VISITING_SQUIRREL: PropDoc = made('Visiting squirrel', SQ, 0.25, [
  { shape: { kind: 'ball', at: sq(0, 0.075, 0), r: [0.075, 0.05, 0.045] }, paint: { kind: 'faces', top: '#c4541a', side: '#c4541a', under: '#f6dfa8' }, bone: 'sqBody', noShadow: true },
  { shape: { kind: 'ball', at: sq(0.03, 0.065, 0), r: [0.05, 0.035, 0.035] }, paint: '#f6dfa8', bone: 'sqBody', noShadow: true },
  { shape: { kind: 'sphere', at: sq(0.08, 0.12, 0), r: 0.038 }, paint: '#c4541a', bone: 'sqHead', noShadow: true },
  { shape: { kind: 'cone', from: sq(0.1, 0.11, 0), to: sq(0.13, 0.105, 0), r: 0.022, rTo: 0.012 }, paint: '#e8782a', bone: 'sqHead', noShadow: true },
  { shape: { kind: 'sphere', at: sq(0.142, 0.106, 0), r: 0.008 }, paint: '#1e1410', bone: 'sqHead', noShadow: true },
  { shape: { kind: 'sphere', at: sq(0.1, 0.13, 0.028), r: 0.009 }, paint: '#1e1410', bone: 'sqHead', noShadow: true },
  { shape: { kind: 'sphere', at: sq(0.1, 0.13, -0.028), r: 0.009 }, paint: '#1e1410', bone: 'sqHead', noShadow: true },
  { shape: { kind: 'join', shapes: [{ kind: 'cone', from: sq(0.07, 0.15, 0.02), to: sq(0.065, 0.185, 0.026), r: 0.012, rTo: 0.003 }, { kind: 'cone', from: sq(0.07, 0.15, -0.02), to: sq(0.065, 0.185, -0.026), r: 0.012, rTo: 0.003 }] }, paint: '#8a3410', bone: 'sqHead', noShadow: true },
  // the acorn in its forepaws
  { shape: { kind: 'sphere', at: sq(0.105, 0.075, 0), r: 0.016 }, paint: '#a8723a', bone: 'sqBody', noShadow: true },
  { shape: { kind: 'join', shapes: [{ kind: 'cone', from: sq(0.06, 0.06, 0.02), to: sq(0.1, 0.075, 0.012), r: 0.01 }, { kind: 'cone', from: sq(0.06, 0.06, -0.02), to: sq(0.1, 0.075, -0.012), r: 0.01 }] }, paint: '#c4541a', bone: 'sqBody', noShadow: true },
  // haunches and feet
  { shape: { kind: 'join', shapes: [{ kind: 'ball', at: sq(-0.04, 0.045, 0.03), r: [0.04, 0.035, 0.018] }, { kind: 'ball', at: sq(-0.04, 0.045, -0.03), r: [0.04, 0.035, 0.018] }] }, paint: '#a8723a', bone: 'sqBody', noShadow: true },
  { shape: { kind: 'join', shapes: [{ kind: 'ball', at: sq(-0.02, 0.008, 0.03), r: [0.03, 0.008, 0.012] }, { kind: 'ball', at: sq(-0.02, 0.008, -0.03), r: [0.03, 0.008, 0.012] }] }, paint: '#8a3410', bone: 'sqBody', noShadow: true },
  // the bushy tail curled up over its back
  { shape: { kind: 'sweep', path: [sq(-0.07, 0.07, 0), sq(-0.13, 0.1, 0), sq(-0.15, 0.16, 0), sq(-0.12, 0.21, 0), sq(-0.07, 0.22, 0)], r: 0.03, rTo: 0.045 }, paint: { kind: 'speckle', size: 0.02, colors: ['#c4541a', '#e8782a', '#8a3410'] }, bone: 'sqTail', noShadow: true },
], {
  bones: [
    { name: 'squirrel', at: SQ },
    { name: 'sqTurn', at: SQ, parent: 'squirrel' },
    { name: 'sqHop', at: SQ, parent: 'sqTurn' },
    { name: 'sqBody', at: sq(-0.04, 0, 0), parent: 'sqHop' },
    { name: 'sqHead', at: sq(0.06, 0.1, 0), parent: 'sqBody' },
    { name: 'sqTail', at: sq(-0.07, 0.07, 0), parent: 'sqBody' },
  ],
  moves: [
    ...visit('squirrel', 'sqTurn', SQUIRREL_FROM, SQUIRREL_TO, SQUIRREL_VISIT, -1),
    // it scurries in hops, and its tail rocks as it goes
    { kind: 'bob', bone: 'sqHop', by: [0, 0.03, 0], times: 9, phase: 0.75, during: within(SQUIRREL_VISIT, 0.06, 0.42) },
    { kind: 'bob', bone: 'sqHop', by: [0, 0.03, 0], times: 9, phase: 0.75, during: within(SQUIRREL_VISIT, 0.6, 0.94) },
    { kind: 'sway', bone: 'sqTail', axis: 'z', degrees: 10, times: 9, during: within(SQUIRREL_VISIT, 0.06, 0.42) },
    { kind: 'sway', bone: 'sqTail', axis: 'z', degrees: 10, times: 9, during: within(SQUIRREL_VISIT, 0.6, 0.94) },
    // it sits up to nibble, then bends down to sniff the acorns on the ground
    { kind: 'sway', bone: 'sqBody', axis: 'z', degrees: 30, times: 1, during: within(SQUIRREL_VISIT, 0.38, 0.6) },
    { kind: 'sway', bone: 'sqHead', axis: 'z', degrees: 6, times: 3, during: within(SQUIRREL_VISIT, 0.4, 0.52) },
    { kind: 'sway', bone: 'sqTail', axis: 'x', degrees: 12, times: 2, during: within(SQUIRREL_VISIT, 0.4, 0.56) },
  ],
})

/** The cardinal's way down from the sky to the top of the big pumpkin, and when. */
const BD = mid([2.3, 2.35, -0.3], [0.92, 0.5, -0.3])
const BIRD_FROM = written(BD, [2.3, 2.35, -0.3], BIRD_SIZE), BIRD_TO = written(BD, [0.92, 0.5, -0.3], BIRD_SIZE), BIRD_VISIT: During = [0.34, 0.62]
/** A point on the cardinal from its middle at its feet: x behind it (it faces -x), y up, z to its right. */
const bd = (x: number, y: number, z: number): Vec3 => [BD[0] + x, BD[1] + y, BD[2] + z]

/** A red cardinal that flutters down onto the harvest, pecks at the grapes and flies off. */
export const VISITING_CARDINAL: PropDoc = made('Visiting cardinal', BD, 0.2, [
  { shape: { kind: 'ball', at: bd(0.01, 0.065, 0), r: [0.065, 0.045, 0.04] }, paint: { kind: 'faces', top: '#a82226', side: '#d8443a', under: '#a82226' }, bone: 'bdBody', noShadow: true },
  { shape: { kind: 'cone', from: bd(0.05, 0.07, 0), to: bd(0.13, 0.06, 0), r: 0.026, rTo: 0.012 }, paint: '#6e1418', bone: 'bdBody', noShadow: true },
  { shape: { kind: 'sphere', at: bd(-0.055, 0.11, 0), r: 0.034 }, paint: '#d8443a', bone: 'bdHead', noShadow: true },
  { shape: { kind: 'cone', from: bd(-0.05, 0.13, 0), to: bd(-0.02, 0.17, 0), r: 0.018, rTo: 0.006 }, paint: '#d8443a', bone: 'bdHead', noShadow: true },
  { shape: { kind: 'ball', at: bd(-0.075, 0.105, 0), r: [0.018, 0.02, 0.03] }, paint: '#1e1410', bone: 'bdHead', noShadow: true },
  { shape: { kind: 'cone', from: bd(-0.08, 0.103, 0), to: bd(-0.115, 0.098, 0), r: 0.014, rTo: 0.004 }, paint: '#f6a24a', bone: 'bdHead', noShadow: true },
  { shape: { kind: 'join', shapes: [{ kind: 'cone', from: bd(0, 0.03, 0.015), to: bd(0, 0, 0.015), r: 0.005 }, { kind: 'cone', from: bd(0, 0.03, -0.015), to: bd(0, 0, -0.015), r: 0.005 }] }, paint: '#5c3a20', bone: 'bdBody', noShadow: true },
  { shape: { kind: 'ball', at: bd(0.03, 0.08, 0.042), r: [0.055, 0.03, 0.01] }, paint: { kind: 'bands', axis: 'x', size: 0.02, colors: ['#a82226', '#6e1418'] }, bone: 'bdWingL', noShadow: true, touches: true },
  { shape: { kind: 'ball', at: bd(0.03, 0.08, -0.042), r: [0.055, 0.03, 0.01] }, paint: { kind: 'bands', axis: 'x', size: 0.02, colors: ['#a82226', '#6e1418'] }, bone: 'bdWingR', noShadow: true, touches: true },
], {
  bones: [
    { name: 'cardinal', at: BD },
    { name: 'bdTurn', at: bd(0, 0.06, 0), parent: 'cardinal' },
    { name: 'bdBody', at: bd(0, 0.03, 0), parent: 'bdTurn' },
    { name: 'bdHead', at: bd(-0.04, 0.09, 0), parent: 'bdBody' },
    { name: 'bdWingL', at: bd(-0.01, 0.09, 0.035), parent: 'bdBody' },
    { name: 'bdWingR', at: bd(-0.01, 0.09, -0.035), parent: 'bdBody' },
  ],
  moves: [
    ...visit('cardinal', 'bdTurn', BIRD_FROM, BIRD_TO, BIRD_VISIT, 1),
    // wings beat as it flies in and out, and fold while it stands
    { kind: 'sway', bone: 'bdWingL', axis: 'x', degrees: -55, times: 16, during: within(BIRD_VISIT, 0.02, 0.4) },
    { kind: 'sway', bone: 'bdWingR', axis: 'x', degrees: 55, times: 16, during: within(BIRD_VISIT, 0.02, 0.4) },
    { kind: 'sway', bone: 'bdWingL', axis: 'x', degrees: -55, times: 16, during: within(BIRD_VISIT, 0.6, 0.98) },
    { kind: 'sway', bone: 'bdWingR', axis: 'x', degrees: 55, times: 16, during: within(BIRD_VISIT, 0.6, 0.98) },
    // it pecks at the grapes and looks about
    { kind: 'sway', bone: 'bdHead', axis: 'z', degrees: 28, times: 4, during: within(BIRD_VISIT, 0.42, 0.56) },
    { kind: 'sway', bone: 'bdHead', axis: 'y', degrees: 30, times: 1, during: within(BIRD_VISIT, 0.36, 0.44) },
    { kind: 'sway', bone: 'bdBody', axis: 'z', degrees: 10, times: 4, during: within(BIRD_VISIT, 0.42, 0.56) },
  ],
})

/** The fox's way out from the back to the gourds at the front, and when. */
const FX = mid([1.6, 0, -1.25], [1.6, 0, 0.36])
const FOX_FROM = written(FX, [1.6, 0, -1.25], FOX_SIZE), FOX_TO = written(FX, [1.6, 0, 0.36], FOX_SIZE), FOX_VISIT: During = [0.65, 0.97]
/** A point on the fox from its middle on the ground: z ahead (it faces +z, toward the view), y up, x to its left. */
const fx = (x: number, y: number, z: number): Vec3 => [FX[0] + x, y, FX[2] + z]
const LEGS: [number, number, string][] = [[0.055, 0.13, 'fxLegFL'], [-0.055, 0.13, 'fxLegFR'], [0.055, -0.13, 'fxLegBL'], [-0.055, -0.13, 'fxLegBR']]

/** A red fox that trots out from the back, sniffs the gourds, nudges one, and trots away. */
export const VISITING_FOX: PropDoc = made('Visiting fox', FX, 0.5, [
  { shape: { kind: 'ball', at: fx(0, 0.24, 0), r: [0.085, 0.085, 0.2] }, paint: { kind: 'faces', top: '#c4541a', side: '#e8782a', under: '#fbf3e0' }, bone: 'fxBody', noShadow: true },
  { shape: { kind: 'ball', at: fx(0, 0.23, 0.15), r: [0.075, 0.09, 0.07] }, paint: '#fbf3e0', bone: 'fxBody', noShadow: true },
  ...LEGS.map(([x, z, bone]): PartDoc => ({ shape: { kind: 'cone', from: fx(x, 0.2, z), to: fx(x, 0.02, z + 0.01), r: 0.024, rTo: 0.017 }, paint: { kind: 'split', axis: 'y', at: 0.11, below: '#1e1410', above: '#c4541a' }, bone, noShadow: true })),
  { shape: { kind: 'ball', at: fx(0, 0.36, 0.25), r: [0.07, 0.065, 0.075] }, paint: '#e8782a', bone: 'fxHead', noShadow: true },
  { shape: { kind: 'join', shapes: [{ kind: 'ball', at: fx(0.035, 0.335, 0.28), r: [0.04, 0.035, 0.045] }, { kind: 'ball', at: fx(-0.035, 0.335, 0.28), r: [0.04, 0.035, 0.045] }] }, paint: '#fbf3e0', bone: 'fxHead', noShadow: true },
  { shape: { kind: 'cone', from: fx(0, 0.34, 0.3), to: fx(0, 0.325, 0.39), r: 0.032, rTo: 0.014 }, paint: '#e8782a', bone: 'fxHead', noShadow: true },
  { shape: { kind: 'sphere', at: fx(0, 0.328, 0.402), r: 0.015 }, paint: '#1e1410', bone: 'fxHead', noShadow: true },
  { shape: { kind: 'join', shapes: [{ kind: 'sphere', at: fx(0.032, 0.375, 0.31), r: 0.011 }, { kind: 'sphere', at: fx(-0.032, 0.375, 0.31), r: 0.011 }] }, paint: '#1e1410', bone: 'fxHead', noShadow: true },
  { shape: { kind: 'join', shapes: [{ kind: 'cone', from: fx(0.04, 0.41, 0.23), to: fx(0.055, 0.48, 0.22), r: 0.028, rTo: 0.005 }, { kind: 'cone', from: fx(-0.04, 0.41, 0.23), to: fx(-0.055, 0.48, 0.22), r: 0.028, rTo: 0.005 }] }, paint: { kind: 'split', axis: 'y', at: 0.46, below: '#c4541a', above: '#1e1410' }, bone: 'fxHead', noShadow: true },
  { shape: { kind: 'sweep', path: [fx(0, 0.26, -0.18), fx(0, 0.22, -0.3), fx(0, 0.17, -0.4), fx(0, 0.15, -0.47)], r: 0.045, rTo: 0.055 }, paint: { kind: 'split', axis: 'z', at: FX[2] - 0.44, below: '#fbf3e0', above: '#c4541a' }, bone: 'fxTail', noShadow: true },
], {
  bones: [
    { name: 'fox', at: FX },
    { name: 'fxTurn', at: FX, parent: 'fox' },
    { name: 'fxBody', at: fx(0, 0.22, 0), parent: 'fxTurn' },
    { name: 'fxHead', at: fx(0, 0.3, 0.17), parent: 'fxBody' },
    { name: 'fxTail', at: fx(0, 0.26, -0.18), parent: 'fxBody' },
    ...LEGS.map(([x, z, name]): BoneDoc => ({ name, at: fx(x, 0.2, z), parent: 'fxBody' })),
  ],
  moves: [
    ...visit('fox', 'fxTurn', FOX_FROM, FOX_TO, FOX_VISIT, -1),
    // a trot: diagonal legs together
    ...([[0.06, 0.42], [0.6, 0.94]] as [number, number][]).flatMap(([a, b]): MoveDoc[] => LEGS.map(([x, z, bone]) => ({ kind: 'sway', bone, axis: 'x', degrees: 28, times: 7, phase: (x > 0) === (z > 0) ? 0 : 0.5, during: within(FOX_VISIT, a, b) }))),
    ...([[0.06, 0.42], [0.6, 0.94]] as [number, number][]).map(([a, b]): MoveDoc => ({ kind: 'bob', bone: 'fxBody', by: [0, 0.012, 0], times: 14, during: within(FOX_VISIT, a, b) })),
    { kind: 'sway', bone: 'fxTail', axis: 'y', degrees: 14, times: 3, during: within(FOX_VISIT, 0.04, 0.96) },
    // it looks to the gourd, sniffs it, and nudges it with its nose
    { kind: 'sway', bone: 'fxHead', axis: 'y', degrees: -30, times: 1, phase: 0, during: within(FOX_VISIT, 0.36, 0.62) },
    { kind: 'sway', bone: 'fxHead', axis: 'x', degrees: 16, times: 4, during: within(FOX_VISIT, 0.4, 0.52) },
    { kind: 'sway', bone: 'fxBody', axis: 'x', degrees: 6, times: 2, during: within(FOX_VISIT, 0.4, 0.52) },
  ],
})

// --- the library and the scene -------------------------------------------------------------------------------------

/** The cornucopia's pieces the library lists. */
export const CORNUCOPIA_MADE: MadeProp[] = [
  { id: 'autumn-green', tags: ['grassy', 'farm'], kind: 'land', about: 'A round of autumn grass on a golden afternoon, with fallen leaves, acorns and stones', prop: AUTUMN_GREEN },
  { id: 'cornucopia', tags: ['farm', 'thing'], kind: 'prop', about: 'A giant woven horn of plenty lying on its side, with wheat and corn standing out of its mouth', prop: CORNUCOPIA },
  { id: 'corn-shock', tags: ['farm', 'plant'], kind: 'prop', about: 'Dry cornstalks bundled upright and tied round the middle', prop: CORN_SHOCK },
  { id: 'cornstalk-tall', tags: ['farm', 'plant'], kind: 'prop', about: 'A tall green cornstalk with one ear and its tassel', prop: CORNSTALK_TALL },
  { id: 'cornstalk-gold', tags: ['farm', 'plant'], kind: 'prop', about: 'A cornstalk turning gold, with two ears', prop: CORNSTALK_GOLD },
  { id: 'cornstalk-leaning', tags: ['farm', 'plant'], kind: 'prop', about: 'A cornstalk leaning over, half green and half dry', prop: CORNSTALK_LEANING },
  { id: 'harvest-spill', tags: ['farm', 'thing'], kind: 'prop', about: 'Pumpkins, squash, gourds, apples, pears and grapes spilling out over the grass', prop: HARVEST_SPILL },
  { id: 'visiting-squirrel', tags: ['animal'], kind: 'prop', group: 'living', about: 'A red squirrel that scurries in, sits up to nibble an acorn, and scurries off again', prop: VISITING_SQUIRREL },
  { id: 'visiting-cardinal', tags: ['animal'], kind: 'prop', group: 'living', about: 'A red cardinal that flutters down, pecks at grapes and flies off again', prop: VISITING_CARDINAL },
  { id: 'visiting-fox', tags: ['animal'], kind: 'prop', group: 'living', about: 'A red fox that trots in, sniffs and nudges a gourd, and trots away again', prop: VISITING_FOX },
]

const here = (prop: string, at: Vec3): SceneProject['props'][number] => ({ prop, at, turn: 0, size: 1 })

/** The cornucopia on the green, the harvest spilling out of it, a maple and two corn shocks behind, and the three visitors. */
export const CORNUCOPIA_PROJECT: SceneProject = {
  kind: 'blobscape-project',
  version: 1,
  name: 'Harvest cornucopia',
  loop: CORNUCOPIA_LOOP,
  land: 'autumn-green',
  props: [
    here('cornucopia', CORNUCOPIA.foot),
    here('harvest-spill', HARVEST_SPILL.foot),
    { prop: 'autumn-maple', at: [-1.25, 0, -1.3], turn: 0, size: 0.9 },
    here('corn-shock', SHOCK_AT),
    { prop: 'corn-shock', at: [0.98, 0, -1.18], turn: 140, size: 0.85 },
    here('cornstalk-tall', CORNSTALK_TALL.foot),
    here('cornstalk-gold', CORNSTALK_GOLD.foot),
    here('cornstalk-leaning', CORNSTALK_LEANING.foot),
    { ...here('visiting-squirrel', VISITING_SQUIRREL.foot), size: SQUIRREL_SIZE },
    { ...here('visiting-cardinal', VISITING_CARDINAL.foot), size: BIRD_SIZE },
    { ...here('visiting-fox', VISITING_FOX.foot), size: FOX_SIZE },
  ],
}
