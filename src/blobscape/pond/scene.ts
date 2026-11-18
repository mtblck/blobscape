import type { Vec3 } from '../../splat-core/blobs.ts'
import type { PartDoc, SceneDoc } from '../../splat-engine/sceneDoc.ts'

/**
 * The pond's place, written as a scene description like Pixel Diorama's: a ruined arcade on a terrace, steps down
 * into a shallow pond, a shrine wall with a niche of candles at the water's edge, a broken column standing in the
 * water, banks with a tree and ferns. It is written at the descriptions' own size (a scene about 4 across) and
 * stood in the world `SCALE` times larger, so the elf, at its own size, is small beside the arches.
 *
 * The pond is not drawn here: the water fills whatever lies under `LEVEL` (pond.ts asks the shapes), so moving a
 * bank or a rock moves the shore and what the ripples bounce off with it.
 */

/** How many times larger the scene stands in the world than it is written. */
export const SCALE = 4
/** Where the water's surface stands, in the scene's own units: ankle deep on the elf. */
export const LEVEL = 0.04

/** The niche's floor, and each candle on it: where it stands (x, z) and how tall it is, in the scene's units. */
export const NICHE_FLOOR = 0.1
export const CANDLES: { x: number; z: number; h: number }[] = [
  { x: -1.25, z: -0.93, h: 0.03 }, { x: -1.17, z: -1.03, h: 0.06 }, { x: -1.1, z: -0.9, h: 0.02 },
  { x: -1.03, z: -1.0, h: 0.045 }, { x: -0.95, z: -1.06, h: 0.075 }, { x: -0.9, z: -0.92, h: 0.03 },
  { x: -0.83, z: -1.02, h: 0.055 }, { x: -0.76, z: -0.9, h: 0.025 }, { x: -0.7, z: -1.0, h: 0.04 },
  { x: -1.0, z: -0.87, h: 0.016 }, { x: -0.65, z: -0.91, h: 0.02 },
]
/** A candle's radius, in the scene's units. */
export const CANDLE_R = 0.009

const STONE = ['#a9b0a2', '#8d9788', '#c3c8b8', '#737d72']
const MORTAR = '#3a4442'
const MOSS = '#3f6a3a'

const fern = (at: Vec3, r: number, seed: number): PartDoc => ({ shape: { kind: 'rosette', at, r, leaves: 16, seed }, paint: { kind: 'speckle', size: 0.03, colors: ['#5f9a3c', '#3f7a34', '#8cc04a'] }, noShadow: true, bare: true })
const bush = (at: Vec3, r: Vec3, seed: number): PartDoc => ({ shape: { kind: 'rough', shape: { kind: 'ball', at, r }, by: 0.03, scale: 0.08 + seed * 0.001 }, paint: { kind: 'speckle', size: 0.035, colors: ['#3f7a34', '#2c5a2c', '#6aa540', '#8cc04a'] }, bare: true })

/**
 * Ivy along a path that lies on a surface: a stem, and leaves set on it every few centimeters, each touching the
 * stem so none hangs in the air.
 */
function ivy(path: Vec3[], seed: number): PartDoc[] {
  let r = seed * 9301 + 49297
  const rand = () => { r = (r * 9301 + 49297) % 233280; return r / 233280 - 0.5 }
  const leaves: { kind: 'ball'; at: Vec3; r: Vec3 }[] = []
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k], b = path[k + 1], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.05))
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      leaves.push({ kind: 'ball', at: [a[0] + (b[0] - a[0]) * t + rand() * 0.05, a[1] + (b[1] - a[1]) * t + rand() * 0.05, a[2] + (b[2] - a[2]) * t + rand() * 0.02], r: [0.034 + rand() * 0.012, 0.03 + rand() * 0.012, 0.022] })
    }
  }
  return [
    { shape: { kind: 'sweep', path, r: 0.018, rTo: 0.01 }, paint: '#2c5a2c', noShadow: true, bare: true },
    { shape: { kind: 'join', shapes: leaves }, paint: { kind: 'speckle', size: 0.04, colors: ['#3f7a34', '#5f9a3c', '#2c5a2c'] }, noShadow: true, bare: true },
  ]
}

export const POND_SCENE: SceneDoc = {
  name: 'Wading pond',
  loop: 24,
  // a moon from the left, a little in front: it lights the arches' faces and throws the tree's shadow over the pond
  light: { from: [-0.75, 0.7, 0.25], ambient: 0.4, shadow: 0.8 },
  // discs wide enough that walls are solid seen close
  disc: 0.75,
  palette: ['#0b1216', '#16262a', '#24403f', '#3a4442', '#57635f', '#6f7c78', '#8f9a94', '#aab3aa', '#2c5a2c', '#3f7a34', '#5f9a3c', '#8cc04a', '#5a4630', '#7b6242', '#ffd58a', '#fff3cf'],
  camera: { target: [0, 0.3, -0.1], distance: 6.2, azimuth: 24, elevation: 24 },
  cover: { kind: 'moss', color: MOSS, amount: 0.3 },
  air: {
    shafts: [
      { from: [-1.5, 2.3, -2.2], to: [-0.2, 0, 0.3], r: 0.3, color: '#d8e6c8', strength: 0.5 },
      { from: [-0.6, 2.3, -2.4], to: [0.8, 0, 0.9], r: 0.22, color: '#d8e6c8', strength: 0.4 },
    ],
    specks: [
      { kind: 'fireflies', count: 10, from: [-1.5, 0.15, -0.6], to: [1.5, 0.9, 1.6], colors: ['#d9f27a', '#eaffb0'], size: 0.004 },
    ],
  },
  bones: [
    { name: 'tree', at: [1.62, 0.15, -0.45] },
    { name: 'crown', at: [1.5, 0.95, -0.35], parent: 'tree' },
  ],
  parts: [
    // the slab everything stands on: its top is the pond's bed
    { shape: { kind: 'rough', shape: { kind: 'box', at: [0, -0.22, 0], half: [1.9, 0.22, 1.9], round: 0.03 }, by: 0.012, scale: 0.22 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.26, colors: ['#24403f', '#1b3334', '#2f5148', '#3a4442'] }, side: { kind: 'bands', axis: 'y', size: 0.08, colors: ['#3a4442', '#24403f', '#57635f'] } }, bare: true },
    // paving stones lying on the bed, worn and half sunk
    { shape: { kind: 'pebbles', path: [[-1.1, -0.03, 1.4], [-0.4, -0.03, 0.5], [0.5, -0.03, 0.1], [0.55, -0.03, -0.35]], width: 0.9, count: 60, size: 0.075, seed: 9 }, paint: { kind: 'pieces', colors: ['#57635f', '#6f7c78', '#3a4442'] }, bare: true },
    // the terrace along the back, and the steps down into the water
    // (it steps back behind the shrine, which stands on the pond's bed)
    { shape: { kind: 'join', shapes: [{ kind: 'box', at: [0.76, 0.15, -1.4], half: [1.14, 0.15, 0.5] }, { kind: 'box', at: [-1.14, 0.15, -1.675], half: [0.76, 0.15, 0.225] }] }, paint: { kind: 'faces', top: { kind: 'hex', size: 0.2, colors: STONE, line: MORTAR }, side: { kind: 'bricks', size: [0.24, 0.1], colors: STONE, line: MORTAR } }, grime: '#24403f' },
    { shape: { kind: 'steps', at: [0.55, 0, -0.39], dir: [0, -1], count: 6, rise: 0.05, run: 0.085, width: 0.8, wear: 0.8, seed: 4 }, paint: { kind: 'pieces', colors: ['#aab3aa', '#8f9a94', '#6f7c78'], line: MORTAR }, grime: '#24403f' },
    // the arcade on the terrace, broken along its top
    { shape: { kind: 'arcade', from: [-0.4, 0.3, -1.5], to: [1.85, 0.3, -1.5], height: 1.7, thick: 0.26, bays: 3, pillar: 0.24, spring: 0.8, arch: 'pointed', course: 0.085, ruin: 0.45, seed: 2 }, paint: { kind: 'pieces', colors: STONE, line: MORTAR }, grime: '#24403f' },
    // the shrine wall at the water's edge, with the niche the candles stand in
    {
      shape: {
        kind: 'cut',
        shape: { kind: 'box', at: [-0.95, 0.5, -1.15], half: [0.56, 0.5, 0.3], round: 0.015 },
        hole: { kind: 'join', shapes: [{ kind: 'box', at: [-0.95, NICHE_FLOOR + 0.22, -0.95], half: [0.38, 0.22, 0.22] }, { kind: 'ball', at: [-0.95, NICHE_FLOOR + 0.44, -0.95], r: [0.38, 0.3, 0.22] }] },
      },
      paint: { kind: 'bricks', size: [0.2, 0.085], colors: STONE, line: MORTAR }, grime: '#24403f',
    },
    // the candles themselves (their flames are their own actor, on bones that flicker)
    ...CANDLES.map((c): PartDoc => ({ shape: { kind: 'cylinder', at: [c.x, NICHE_FLOOR, c.z], height: c.h, r: CANDLE_R }, paint: '#e9dfc4', bare: true, noShadow: true })),
    // a broken column standing in the pond, and a drum of it lying half under
    { shape: { kind: 'lathe', at: [0.95, 0, 0.55], profile: [[0.13, 0], [0.13, 0.05], [0.1, 0.07], [0.095, 0.4], [0.07, 0.43], [0, 0.44]] }, paint: { kind: 'bands', axis: 'y', size: 0.11, colors: ['#aab3aa', '#8f9a94'] }, grime: '#24403f' },
    { shape: { kind: 'cone', from: [-0.62, 0.05, 1.0], to: [-0.3, 0.05, 1.16], r: 0.1 }, paint: { kind: 'bands', axis: 'x', size: 0.1, colors: ['#8f9a94', '#aab3aa'] }, grime: '#24403f' },
    { shape: { kind: 'rough', shape: { kind: 'ball', at: [0.2, 0.02, 1.25], r: [0.16, 0.1, 0.13] }, by: 0.02, scale: 0.1 }, paint: '#57635f', grime: '#24403f' },
    // banks either side, and a low broken wall along the front
    { shape: { kind: 'rough', shape: { kind: 'box', at: [-1.66, 0.04, 0.5], half: [0.24, 0.11, 1.4], round: 0.06 }, by: 0.03, scale: 0.3 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.2, colors: ['#3f7a34', '#2c5a2c', '#5f9a3c'] }, side: { kind: 'patches', size: 0.2, colors: ['#5a4630', '#3a4442', '#7b6242'] } }, ink: { kind: 'tufts', amount: 0.4 }, bare: true },
    { shape: { kind: 'rough', shape: { kind: 'box', at: [1.68, 0.04, 0.5], half: [0.22, 0.11, 1.4], round: 0.06 }, by: 0.03, scale: 0.3 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.2, colors: ['#3f7a34', '#2c5a2c', '#5f9a3c'] }, side: { kind: 'patches', size: 0.2, colors: ['#5a4630', '#3a4442', '#7b6242'] } }, ink: { kind: 'tufts', amount: 0.4 }, bare: true },
    { shape: { kind: 'box', at: [0.02, 0.03, 1.78], half: [1.46, 0.06, 0.075], round: 0.02 }, paint: { kind: 'bricks', size: [0.22, 0.07], colors: STONE, line: MORTAR }, grime: '#24403f' },
    { shape: { kind: 'wall', from: [-1.42, 0, 1.78], to: [1.46, 0, 1.78], height: 0.2, thick: 0.13, brick: [0.2, 0.066], jitter: 0.7, ruin: 0.5, missing: 0.04, seed: 7 }, paint: { kind: 'pieces', colors: STONE, line: MORTAR }, grime: '#24403f' },
    // a tree on the right bank, leaning over the water
    { shape: { kind: 'tree', at: [1.62, 0.15, -0.45], height: 0.75, crown: [0.8, 0.45, 0.75], r: 0.075, points: 400, leaves: 0.085, only: 'limbs', seed: 5 }, paint: '#5a4630', bone: 'tree' },
    { shape: { kind: 'tree', at: [1.62, 0.15, -0.45], height: 0.75, crown: [0.8, 0.45, 0.75], r: 0.075, points: 400, leaves: 0.085, only: 'leaves', seed: 5 }, paint: { kind: 'speckle', size: 0.05, colors: ['#5f9a3c', '#3f7a34', '#8cc04a', '#2c5a2c'] }, bone: 'crown', noShadow: false, bare: true },
    // ivy lying on the stone: up the shrine's front and over its top, down its far corner, and up the first pillar
    ...ivy([[-1.4, 0.12, -0.84], [-1.35, 0.5, -0.84], [-1.3, 0.96, -0.84], [-1.2, 1.01, -1.0], [-0.98, 1.01, -1.14]], 6),
    ...ivy([[-0.72, 1.01, -1.2], [-0.56, 1.01, -0.96], [-0.5, 0.97, -0.84], [-0.53, 0.72, -0.84], [-0.47, 0.5, -0.84]], 16),
    ...ivy([[-0.3, 0.3, -1.36], [-0.31, 0.6, -1.36], [-0.27, 0.9, -1.36], [-0.32, 1.2, -1.36]], 26),
    // ferns and bushes on the banks
    fern([-1.6, 0.15, 1.3], 0.2, 1), fern([-1.66, 0.15, 0.4], 0.17, 2), fern([-1.58, 0.15, -0.5], 0.19, 3),
    fern([1.62, 0.15, 1.2], 0.2, 4), fern([1.7, 0.15, 0.3], 0.16, 5), fern([-1.5, 0.3, -1.1], 0.15, 6),
    bush([-1.72, 0.2, 0.85], [0.16, 0.13, 0.2], 1), bush([1.74, 0.2, 0.75], [0.14, 0.12, 0.2], 2), bush([1.72, 0.2, -1.1], [0.16, 0.14, 0.16], 3),
  ],
  moves: [
    { kind: 'sway', bone: 'tree', axis: 'z', degrees: 0.8, times: 3 },
    { kind: 'sway', bone: 'crown', axis: 'x', degrees: 1.6, times: 5, phase: 0.2 },
  ],
}
