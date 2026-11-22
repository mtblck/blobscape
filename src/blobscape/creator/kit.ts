import type { SceneDoc } from '../../splat-engine/sceneDoc.ts'

/**
 * Kit pieces for Scene Creator: building blocks made by rules, not lifted out of a scene, so a scene can be put
 * together from walls, fences, steps, arches, rocks and plants. They are written as one description with every piece
 * on its own bone marked as a prop, in a row, and the library splits it by those marks as it does any scene. Painted in
 * plain, middling colors so they sit in most palettes. An idea from Silicon Jungle's Ink Studio, whose kit builds
 * scenes from pieces.
 */

/** Where each piece stands: four to a row, three rows, a meter and a half apart. */
const at = (k: number): [number, number, number] => [((k % 4) - 1.5) * 1.5, 0, (Math.floor(k / 4) - 1) * 1.5]
/** A place `d` from piece `k`'s spot. */
const p = (k: number, dx: number, y: number, dz: number): [number, number, number] => [at(k)[0] + dx, y, at(k)[2] + dz]

const STONE = ['#b8aeb0', '#8e8790', '#dcd2c8']
const BRICK = ['#c27a6a', '#8a5a6a', '#b23a1c', '#93693e']
const WOOD = ['#93693e', '#6e4c30', '#b88a52']
const LINE = '#45434a'

export const KIT: SceneDoc = {
  name: 'Kit pieces',
  loop: 12,
  palette: [
    '#14101e', '#2a2a30', '#45434a', '#67626a', '#8e8790', '#b8aeb0', '#dcd2c8', '#f4ecdc',
    '#4e3a2a', '#5a3e28', '#6e4c30', '#93693e', '#b88a52', '#d8b07a', '#8a5a6a', '#c27a6a',
    '#b23a1c', '#2c4428', '#466434', '#6c8a40', '#9aae52', '#5e7e3a', '#8aa04a', '#8a84d0',
    '#a0c8e0', '#c8e8f0', '#8ab4d8', '#e8d8b8', '#9446ac', '#c070d0', '#e8a8ec', '#5a2a6a',
  ],
  light: { from: [0.55, 0.6, 0.6], ambient: 0.45, shadow: 0.7 },
  sky: ['#8ab4d8', '#e8d8b8'],
  look: { dither: 0.5, glow: 1, outline: true, edges: true },
  camera: { target: [0, 0.4, 0], distance: 9, azimuth: 20, elevation: 24 },
  bones: [
    { name: 'brickWall', at: at(0), prop: 'Brick wall' },
    { name: 'ruinedWall', at: at(1), prop: 'Ruined wall' },
    { name: 'fence', at: at(2), prop: 'Wooden fence' },
    { name: 'steps', at: at(3), prop: 'Stone steps' },
    { name: 'arch', at: at(4), prop: 'Stone arch' },
    { name: 'oak', at: at(5), prop: 'Oak tree' },
    { name: 'oakCrown', at: p(5, 0, 0.5, 0), parent: 'oak' },
    { name: 'cactus', at: at(6), prop: 'Cactus' },
    { name: 'crystals', at: at(7), prop: 'Crystal cluster' },
    { name: 'boulder', at: at(8), prop: 'Boulder' },
    { name: 'columns', at: at(9), prop: 'Stone columns' },
    { name: 'stump', at: at(10), prop: 'Tree stump' },
    { name: 'bush', at: at(11), prop: 'Round bush' },
  ],
  parts: [
    // a straight brick wall, whole
    { shape: { kind: 'wall', from: p(0, -0.5, 0, 0), to: p(0, 0.5, 0, 0), height: 0.6, thick: 0.14, brick: [0.15, 0.072], jitter: 0.4, seed: 1 }, paint: { kind: 'pieces', colors: BRICK, line: LINE }, bone: 'brickWall' },
    // a stone wall fallen in places, its stones at its feet
    { shape: { kind: 'wall', from: p(1, -0.5, 0, 0), to: p(1, 0.5, 0, 0), height: 0.7, thick: 0.16, brick: [0.18, 0.09], jitter: 0.6, ruin: 0.85, missing: 0.06, fallen: 14, seed: 7 }, paint: { kind: 'pieces', colors: STONE, line: LINE }, bone: 'ruinedWall' },
    // a fence of three bays
    { shape: { kind: 'fence', path: [p(2, -0.5, 0, 0), p(2, 0.5, 0, 0)], bay: 0.34, height: 0.36, post: 0.03, rails: 2, lean: 0.2, seed: 3 }, paint: { kind: 'pieces', colors: WOOD }, bone: 'fence', noShadow: true },
    // four worn steps
    { shape: { kind: 'steps', at: p(3, 0, 0, 0.24), dir: [0, -1], count: 4, rise: 0.065, run: 0.12, width: 0.6, wear: 0.6, seed: 4 }, paint: { kind: 'pieces', colors: STONE, line: LINE }, bone: 'steps' },
    // a single round arch
    { shape: { kind: 'arcade', from: p(4, -0.45, 0, 0), to: p(4, 0.45, 0, 0), height: 0.95, thick: 0.16, bays: 1, pillar: 0.18, spring: 0.5, arch: 'round', course: 0.1, seed: 2 }, paint: { kind: 'pieces', colors: STONE, line: LINE }, bone: 'arch' },
    // an oak: limbs, and leaves on a crown bone that sways
    { shape: { kind: 'tree', at: p(5, 0, 0, 0), height: 0.4, crown: [0.45, 0.32, 0.45], r: 0.06, points: 120, only: 'limbs', seed: 8 }, paint: '#4e3a2a', bone: 'oak' },
    { shape: { kind: 'tree', at: p(5, 0, 0, 0), height: 0.4, crown: [0.45, 0.32, 0.45], r: 0.06, points: 120, leaves: 0.06, only: 'leaves', seed: 8 }, paint: { kind: 'speckle', size: 0.05, colors: ['#466434', '#6c8a40', '#2c4428'] }, bone: 'oakCrown', noShadow: true },
    // a ribbed cactus with two arms
    { shape: { kind: 'cactus', at: p(6, 0, 0, 0), height: 0.66, r: 0.07, arms: 2, seed: 4 }, paint: { kind: 'faces', top: '#8aa04a', side: '#5e7e3a' }, bone: 'cactus' },
    // a cluster of crystals
    { shape: { kind: 'crystals', at: p(7, 0, 0, 0), count: 9, size: 0.6, r: 0.08, spread: 55, chips: 2, seed: 9 }, paint: { kind: 'pieces', colors: ['#c070d0', '#e8a8ec', '#9446ac'] }, bone: 'crystals' },
    // a rough boulder, half sunk
    { shape: { kind: 'rough', shape: { kind: 'ball', at: p(8, 0, 0.12, 0), r: [0.32, 0.24, 0.28] }, by: 0.04, scale: 0.35 }, paint: { kind: 'speckle', size: 0.05, colors: STONE }, bone: 'boulder' },
    // a few stone columns in steps
    { shape: { kind: 'columns', at: p(9, 0, 0, 0), r: 0.38, cell: 0.13, height: 0.5, rise: 'steps', seed: 5 }, paint: { kind: 'faces', top: { kind: 'pieces', colors: STONE }, side: { kind: 'pieces', colors: ['#67626a', '#8e8790', '#45434a'] } }, bone: 'columns' },
    // a tree stump, pale where it was cut
    { shape: { kind: 'cylinder', at: p(10, 0, 0, 0), height: 0.22, r: 0.16, rTop: 0.13 }, paint: { kind: 'faces', top: '#d8b07a', side: { kind: 'bands', axis: 'y', size: 0.04, colors: ['#5a3e28', '#4e3a2a'] } }, bone: 'stump' },
    // a round bush
    { shape: { kind: 'rough', shape: { kind: 'ball', at: p(11, 0, 0.2, 0), r: [0.3, 0.22, 0.28] }, by: 0.05, scale: 0.25 }, paint: { kind: 'speckle', size: 0.045, colors: ['#466434', '#6c8a40', '#2c4428', '#9aae52'] }, bone: 'bush' },
  ],
  moves: [
    { kind: 'sway', bone: 'oakCrown', axis: 'x', degrees: 1.5, times: 2, wind: 4 },
  ],
}
