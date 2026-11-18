import type { PaintDoc, PartDoc, SceneDoc, ShapeDoc } from '../../splat-engine/sceneDoc.ts'
import { bird, leafy } from './cabin.ts'
import { GRASS, SNOW, SNOW_SHADE, falling, type Season } from './season.ts'

/**
 * A few city blocks for Day and Night: towers and low brick buildings round two streets, a small park, street lamps,
 * a sign on a roof and a beacon on the tallest mast. Nothing here is lit: the sun, the moon, the sky and the lamps
 * light it live. Every floor is a band of dark glass, and in front of some stretches of it lies a lit pane. The lit
 * panes are dealt into `WINDOW_GROUPS` groups, each on a bone of its own (`lit<n>`), so the page can bring the city's
 * windows on a group at a time as it gets dark and put the offices out through the night. Streets run east to west
 * and north to south; the tall towers stand to the north so the skyline reads from the south. Data only, though
 * written by the loops below: see docs/scene-descriptions.md.
 */

/** How many groups the lit windows are dealt into: each comes on and goes out at its own time. */
export const WINDOW_GROUPS = 12

type Vec3 = [number, number, number]
/** Three decimals and never -0, so the description survives a trip through JSON unchanged. */
const r3 = (v: number) => Math.round(v * 1000) / 1000 + 0
const v3 = (x: number, y: number, z: number): Vec3 => [r3(x), r3(y), r3(z)]

const GLASS = '#1e2a40'
const WARM = '#ffc864', COOL = '#d8ecff', AMBER = '#ffa850'

/** A building: where it stands, half its width (x) and depth (z), its height, its floor pitch, its wall and which light its windows give. */
interface Tower { x: number; z: number; hw: number; hd: number; h: number; floor: number; wall: string[]; lit: string; brick?: boolean }
const TOWERS: Tower[] = [
  { x: -1.05, z: -1.0, hw: 0.28, hd: 0.28, h: 1.7, floor: 0.1, wall: ['#8a94a8', '#7a8498'], lit: WARM },
  { x: -0.48, z: -0.95, hw: 0.24, hd: 0.3, h: 2.5, floor: 0.1, wall: ['#5a6e8a', '#4e6280'], lit: COOL },
  { x: -1.0, z: -0.2, hw: 0.32, hd: 0.3, h: 1.1, floor: 0.11, wall: ['#b8a890', '#a89880'], lit: WARM },
  { x: -0.45, z: -0.15, hw: 0.22, hd: 0.28, h: 1.5, floor: 0.1, wall: ['#9a9aa8', '#8a8a98'], lit: AMBER },
  { x: 0.6, z: -1.0, hw: 0.28, hd: 0.3, h: 2.1, floor: 0.1, wall: ['#6a7a84', '#5c6c78'], lit: COOL },
  { x: 1.12, z: -0.9, hw: 0.2, hd: 0.34, h: 1.35, floor: 0.11, wall: ['#a8a090', '#989080'], lit: WARM },
  { x: 0.62, z: -0.15, hw: 0.3, hd: 0.3, h: 1.2, floor: 0.1, wall: ['#7a6a7a', '#6c5e6e'], lit: AMBER },
  { x: 1.15, z: -0.08, hw: 0.2, hd: 0.26, h: 0.85, floor: 0.12, wall: ['#a05a48', '#8a4a3c', '#b06a54'], lit: WARM, brick: true },
  { x: -1.0, z: 1.05, hw: 0.3, hd: 0.28, h: 0.6, floor: 0.12, wall: ['#a05a48', '#8a4a3c', '#b06a54'], lit: WARM, brick: true },
  { x: 0.65, z: 1.05, hw: 0.3, hd: 0.26, h: 0.75, floor: 0.12, wall: ['#b8a890', '#a89880'], lit: AMBER },
  { x: 1.18, z: 1.05, hw: 0.16, hd: 0.26, h: 0.5, floor: 0.12, wall: ['#8a94a8', '#7a8498'], lit: WARM },
]

/** A steady number from 0 to 1 for a few whole numbers: which windows are lit is the same every time. */
function chance(a: number, b: number, c: number, d = 0) {
  let h = 2166136261
  for (const v of [a, b, c, d]) h = Math.imul(h ^ (v + 0x9e37), 16777619)
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/** A tower's walls: a band of glass on every floor above the street door, the wall between; the roof is plain. */
function wallPaint(t: Tower): PaintDoc {
  const wall: PaintDoc = t.brick ? { kind: 'bricks', size: [0.07, 0.035], colors: t.wall, line: '#5a3a32' } : { kind: 'bands', axis: 'x', size: 0.9, colors: t.wall.slice(0, 2) }
  // each floor: wall below the sill, then glass
  const floors: PaintDoc = { kind: 'bands', axis: 'y', size: r3(t.floor / 2), colors: [t.wall[0], GLASS] }
  return { kind: 'faces', top: '#4a4a56', side: t.brick ? { kind: 'split', axis: 'y', at: 0.06, below: wall, above: { kind: 'bands', axis: 'y', size: r3(t.floor / 4), colors: [t.wall[0], t.wall[1], GLASS, GLASS] } } : floors }
}

/**
 * The lit panes of one tower, dealt into groups: on each floor of each face, maybe one stretch of the glass band is
 * lit (a room, or most of an office floor), a box lying just proud of the wall.
 */
function litPanes(t: Tower, n: number): ShapeDoc[][] {
  const groups: ShapeDoc[][] = Array.from({ length: WINDOW_GROUPS }, () => [])
  const floors = Math.floor((t.h - 0.04) / t.floor)
  // the glass is the upper half of each floor
  const half = t.floor * 0.21, proud = 0.02, thick = 0.01
  for (let f = 1; f < floors; f++) {
    const y = f * t.floor + t.floor * 0.75
    for (let face = 0; face < 4; face++) {
      if (chance(n, f, face) > 0.6) continue
      // faces 0 and 1 look south and north (they run along x), 2 and 3 east and west (along z)
      const alongX = face < 2, run = (alongX ? t.hw : t.hd) - 0.045
      const share = chance(n, f, face, 1), wide = share < 0.55 ? 0.05 + 0.05 * chance(n, f, face, 2) : share < 0.85 ? 0.1 + 0.08 * chance(n, f, face, 2) : run
      const w = Math.min(run, wide), c = (chance(n, f, face, 3) * 2 - 1) * (run - w)
      const sign = face % 2 ? -1 : 1
      const at = alongX ? v3(t.x + c, y, t.z + sign * (t.hd + proud)) : v3(t.x + sign * (t.hw + proud), y, t.z + c)
      const halfBox: Vec3 = alongX ? v3(w, half, thick) : v3(thick, half, w)
      // a whole office floor goes with its neighbors; a single room goes its own way
      const g = Math.floor(chance(n, share < 0.85 ? f * 7 + face : Math.floor(f / 3), 5, 9) * WINDOW_GROUPS) % WINDOW_GROUPS
      groups[g].push({ kind: 'box', at, half: halfBox })
    }
  }
  return groups
}

/** A street lamp: a post with an arm over the road, and under the arm a lamp on a bone so it can be lit. */
const STREET_LAMPS: { at: [number, number]; arm: [number, number] }[] = [
  { at: [-0.22, 0.26], arm: [0.1, 0.06] },
  { at: [0.32, 0.74], arm: [-0.1, -0.06] },
  { at: [-0.75, 0.74], arm: [0.02, -0.1] },
]
const LAMP_H = 0.34
const lampHead = (k: number): Vec3 => v3(STREET_LAMPS[k].at[0] + STREET_LAMPS[k].arm[0], LAMP_H - 0.02, STREET_LAMPS[k].at[1] + STREET_LAMPS[k].arm[1])
function streetLamp(k: number): PartDoc[] {
  const [x, z] = STREET_LAMPS[k].at, head = lampHead(k)
  return [
    { shape: { kind: 'join', shapes: [
      { kind: 'cylinder', at: v3(x, 0, z), height: LAMP_H, r: 0.012 },
      { kind: 'cone', from: v3(x, LAMP_H, z), to: v3(head[0], LAMP_H, head[2]), r: 0.01 },
      { kind: 'ball', at: v3(head[0], LAMP_H, head[2]), r: [0.035, 0.012, 0.035] },
    ] }, paint: '#2a2a34', noShadow: true },
    { shape: { kind: 'ball', at: head, r: [0.04, 0.024, 0.04] }, paint: '#ffe0a0', glow: true, bone: `lamp${k}`, noShadow: true },
  ]
}

const BIRDS: { at: Vec3; r: number }[] = [
  { at: [0.1, 2.2, -0.3], r: 1.0 },
  { at: [-0.3, 1.5, 0.3], r: 0.8 },
  { at: [0.4, 2.75, -0.6], r: 0.6 },
]
const VENT: Vec3 = [0.75, 2.14, -1.1]
const MAST: Vec3 = [-0.48, 2.5, -0.95]
const SIGN: Vec3 = [0.62, 1.4, 0.1]
const CARS: [number, number, boolean, string][] = [
  [-0.9, 0.42, true, '#c84a3a'], [0.75, 0.58, true, '#e8e4d8'], [1.2, 0.42, true, '#3a6ab0'], [-0.02, -0.7, false, '#e0b040'], [0.12, 1.1, false, '#4a8a6a'],
]

const panes = TOWERS.map(litPanes)

/** The city in a season: the park's trees and grass turn with it, petals and leaves fall in the park, and in winter snow falls on all of it and lies on the roofs and streets. */
export const city = (season: Season): SceneDoc => ({
  name: 'City blocks',
  loop: 12,
  // nothing baked but the creases: the sun, moon, sky and lamps are live
  light: { ambient: 1, shadow: 0, ramp: 0, crevice: 0.3, wear: 0.2, bounce: 0 },
  palette: [
    '#14141e', '#1e2a40', '#2a2a34', '#4a4a56', '#5a6e8a', '#7a8498', '#9a9aa8', '#b8a890',
    '#8a4a3c', '#a05a48', '#4a8a3c', '#6aa84a', '#e8e4d8', '#ffc864', '#d8ecff', '#ff5a8a', '#ff4030',
    ...(season === 'fall' ? ['#e8862a', '#f0b030'] : season === 'winter' ? [SNOW, SNOW_SHADE] : season === 'spring' ? ['#f8c8dc'] : []),
  ],
  ...(season === 'winter' ? { cover: { kind: 'snow' as const, color: SNOW, amount: 0.7 } } : {}),
  ...(season === 'summer' ? {} : { air: { specks: season === 'winter' ? falling(season, [-1.5, 0, -1.5], [1.5, 2.6, 1.5], 1.15) : falling(season, [-0.75, 0, 0.7], [-0.1, 0.75, 1.45], 0.3, 0.55) } }),
  look: { dither: 0.1, glow: 1.2, outline: true, edges: true },
  disc: 0.78,
  camera: { target: [0, 0.95, 0], distance: 6.5, azimuth: 24, elevation: 8 },
  bones: [
    ...Array.from({ length: WINDOW_GROUPS }, (_, g) => ({ name: `lit${g}`, at: [0, 1, 0] as Vec3 })),
    ...STREET_LAMPS.map((_, k) => ({ name: `lamp${k}`, at: lampHead(k) })),
    { name: 'sign', at: SIGN },
    { name: 'beacon', at: v3(MAST[0], MAST[1] + 0.47, MAST[2]) },
    { name: 'tree0', at: [-0.5, 0, 1.0] },
    { name: 'tree1', at: [-0.3, 0, 1.3] },
    ...[0, 1, 2, 3].map((k) => ({ name: `steam${k}`, at: VENT })),
    ...BIRDS.flatMap((b, n) => [
      { name: `bird${n}`, at: b.at },
      { name: `bird${n}L`, at: v3(b.at[0] + b.r, b.at[1], b.at[2]), parent: `bird${n}` },
      { name: `bird${n}R`, at: v3(b.at[0] + b.r, b.at[1], b.at[2]), parent: `bird${n}` },
    ]),
  ],
  parts: [
    // the ground: pavement on a slab, two streets crossing, a park in the southwest block
    { shape: { kind: 'box', at: [0, -0.15, 0], half: [1.55, 0.15, 1.55], round: 0.03 }, paint: { kind: 'faces', top: { kind: 'speckle', size: 0.08, colors: ['#9a9aa8', '#8e8e9c', '#a4a4b0'] }, side: { kind: 'bands', axis: 'y', size: 0.06, colors: ['#5a5a66', '#4a4a56'] } } },
    { shape: { kind: 'box', at: [0, 0.004, 0.5], half: [1.5, 0.008, 0.13] }, paint: { kind: 'speckle', size: 0.06, colors: ['#3a3a44', '#34343e'] }, noShadow: true },
    { shape: { kind: 'box', at: [0.05, 0.004, 0], half: [0.13, 0.008, 1.5] }, paint: { kind: 'speckle', size: 0.06, colors: ['#3a3a44', '#34343e'] }, noShadow: true },
    { shape: { kind: 'box', at: [-0.42, 0.006, 1.08], half: [0.24, 0.01, 0.3], round: 0.01 }, paint: { kind: 'patches', size: 0.2, colors: GRASS[season] }, noShadow: true },
    // the buildings, each with a parapet round its roof
    ...TOWERS.flatMap((t): PartDoc[] => [
      { shape: { kind: 'box', at: v3(t.x, t.h / 2, t.z), half: v3(t.hw, t.h / 2, t.hd) }, paint: wallPaint(t) },
      { shape: { kind: 'cut', shape: { kind: 'box', at: v3(t.x, t.h + 0.02, t.z), half: v3(t.hw + 0.012, 0.03, t.hd + 0.012) }, hole: { kind: 'box', at: v3(t.x, t.h + 0.04, t.z), half: v3(t.hw - 0.03, 0.04, t.hd - 0.03) } }, paint: t.wall[1], noShadow: true },
    ]),
    // their lit windows, a part for each group a tower has panes in
    ...TOWERS.flatMap((t, n) => panes[n].flatMap((shapes, g): PartDoc[] => (shapes.length ? [{ shape: shapes.length === 1 ? shapes[0] : { kind: 'join', shapes }, paint: t.lit, glow: true, bone: `lit${g}`, noShadow: true }] : []))),
    // on the roofs: a mast with a beacon, a water tank, a vent that steams, a sign
    { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: MAST, height: 0.45, r: 0.014, rTop: 0.006 }, { kind: 'box', at: v3(MAST[0] + 0.1, MAST[1] + 0.05, MAST[2] + 0.1), half: [0.07, 0.05, 0.06] }] }, paint: '#5a5a66' },
    { shape: { kind: 'sphere', at: v3(MAST[0], MAST[1] + 0.47, MAST[2]), r: 0.032 }, paint: '#ff4030', glow: true, bone: 'beacon', noShadow: true },
    { shape: { kind: 'join', shapes: [
      { kind: 'cylinder', at: [1.15, 0.97, -0.1], height: 0.17, r: 0.085 },
      { kind: 'cylinder', at: [1.15, 1.14, -0.1], height: 0.06, r: 0.09, rTop: 0.01 },
      { kind: 'cylinder', at: [1.09, 0.85, -0.16], height: 0.13, r: 0.01 }, { kind: 'cylinder', at: [1.21, 0.85, -0.16], height: 0.13, r: 0.01 },
      { kind: 'cylinder', at: [1.09, 0.85, -0.04], height: 0.13, r: 0.01 }, { kind: 'cylinder', at: [1.21, 0.85, -0.04], height: 0.13, r: 0.01 },
    ] }, paint: { kind: 'bands', axis: 'x', size: 0.03, colors: ['#8a5a3a', '#6e4630'] } },
    { shape: { kind: 'join', shapes: [{ kind: 'box', at: v3(VENT[0], 2.14, VENT[2]), half: [0.06, 0.04, 0.06] }, { kind: 'box', at: [0.45, 2.13, -0.85], half: [0.08, 0.03, 0.05] }] }, paint: '#7a8498' },
    { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [0.42, 1.2, 0.1], height: 0.1, r: 0.01 }, { kind: 'cylinder', at: [0.82, 1.2, 0.1], height: 0.1, r: 0.01 }, { kind: 'box', at: v3(SIGN[0], 1.29, 0.1), half: [0.24, 0.008, 0.012] }] }, paint: '#2a2a34', noShadow: true },
    { shape: { kind: 'text', at: v3(SIGN[0], SIGN[1] + 0.03, SIGN[2]), text: 'INN', size: 0.25, depth: 0.02 }, paint: '#7a3a52', noShadow: true },
    { shape: { kind: 'text', at: v3(SIGN[0], SIGN[1] + 0.03, SIGN[2] + 0.09), text: 'INN', size: 0.25, depth: 0.02 }, paint: '#ff5a8a', glow: true, bone: 'sign', noShadow: true },
    // on the street: lamps, parked cars, trees in the park and a bench
    ...STREET_LAMPS.flatMap((_, k) => streetLamp(k)),
    ...CARS.map(([x, z, alongX, color]): PartDoc => ({
      shape: { kind: 'join', shapes: [
        { kind: 'box', at: v3(x, 0.032, z), half: alongX ? [0.075, 0.022, 0.036] : [0.036, 0.022, 0.075], round: 0.01 },
        { kind: 'box', at: v3(x, 0.066, z), half: alongX ? [0.042, 0.016, 0.032] : [0.032, 0.016, 0.042], round: 0.008 },
      ] },
      paint: { kind: 'split', axis: 'y', at: 0.054, below: color, above: GLASS }, noShadow: true,
    })),
    ...leafy('tree0', -0.5, 1.0, 0.42, season),
    ...leafy('tree1', -0.3, 1.3, 0.34, season),
    // steam off the tall roof, and pigeons over the towers
    ...[0, 1, 2, 3].map((k): PartDoc => ({ shape: { kind: 'rough', shape: { kind: 'ball', at: VENT, r: [0.04, 0.032, 0.038] }, by: 0.01, scale: 0.05 }, paint: k % 2 ? '#e4e4ec' : '#d0d0dc', bone: `steam${k}`, noShadow: true, bare: true })),
    ...BIRDS.flatMap((b, n) => bird(n, b.at, b.r)),
  ],
  moves: [
    { kind: 'sway', bone: 'tree0', axis: 'z', degrees: 2, times: 3, phase: 0.2 },
    { kind: 'sway', bone: 'tree1', axis: 'z', degrees: 2, times: 4, phase: 0.7 },
    { kind: 'pulse', bone: 'beacon', size: [0.25, 1.3], times: 6 },
    ...[0, 1, 2, 3].map((k) => ({ kind: 'drift' as const, bone: `steam${k}`, by: [0.3, 0.45, 0.05] as Vec3, times: 2, grow: [0.4, 1.8] as [number, number], phase: k / 4 })),
    ...BIRDS.flatMap((_, n) => [
      { kind: 'spin' as const, bone: `bird${n}`, axis: 'y' as const, times: n === 1 ? -1 : 1, phase: n * 0.37 },
      { kind: 'sway' as const, bone: `bird${n}L`, axis: 'z' as const, degrees: 35, times: 24 },
      { kind: 'sway' as const, bone: `bird${n}R`, axis: 'z' as const, degrees: -35, times: 24 },
    ]),
  ],
  // the lamps that throw light, in the order scene.ts names them: three street lamps, then the sign
  lights: [
    ...STREET_LAMPS.map((_, k) => ({ at: v3(lampHead(k)[0], LAMP_H - 0.06, lampHead(k)[2]), color: '#ffd090', strength: 1.7, range: 0.75 })),
    { at: v3(SIGN[0], SIGN[1], SIGN[2] + 0.3), color: '#ff5a8a', strength: 1.3, range: 0.8, flicker: { by: 0.08, times: 7 } },
  ],
})

/** The city in summer. */
export const CITY: SceneDoc = city('summer')
