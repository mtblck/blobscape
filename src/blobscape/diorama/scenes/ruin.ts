import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'

/**
 * A ruined chapel at dusk in autumn: an arcade of pointed arches broken along its top, brick side walls fallen in
 * places with their bricks lying at their feet, worn steps up to the floor, a leaning fence along the path, a maple
 * dropping its leaves and a lantern by the steps. Built from the wall, steps, fence and arcade shapes (issue #176).
 * Data only: see docs/scene-descriptions.md.
 */
export const RUIN: SceneDoc = {
  name: 'Ruined chapel',
  loop: 12,
  light: { from: [0.55, 0.5, 0.65], ambient: 0.42, shadow: 0.72 },
  palette: [
    '#14101e', '#251b33', '#3b2a48', '#5a3c5a', '#8a5a6a', '#c27a6a', '#f0a070', '#ffd08a',
    '#fff2c8', '#2a2a30', '#45434a', '#67626a', '#8e8790', '#b8aeb0', '#dcd2c8', '#4a3424',
    '#6e4c30', '#93693e', '#1c2a1e', '#2c4428', '#466434', '#6c8a40', '#9aae52', '#7a2418',
    '#b23a1c', '#e0602a', '#f29a3a',
  ],
  sky: ['#3b2a48', '#f0a070'],
  skyReach: 0.75,
  look: { dither: 0.5, glow: 1.6, outline: true, edges: true },
  camera: { target: [0, 0.55, 0], distance: 5.3, azimuth: 22, elevation: 16, swing: 7 },
  cover: { kind: 'moss', color: '#466434', amount: 0.35 },
  air: {
    haze: { color: '#5a3c5a', from: 1.5, to: 8 },
    specks: [
      { kind: 'dust', count: 40, from: [-1.4, 0.2, -1], to: [1.4, 1.6, 1.2], colors: ['#ffd08a', '#f0a070'], glow: true },
      { kind: 'fireflies', count: 8, from: [-1.2, 0.2, 0.2], to: [1.2, 0.9, 1.5], colors: ['#fff2c8'] },
    ],
  },
  bones: [
    { name: 'maple', at: [1.15, 0, -0.35] },
    { name: 'crown', at: [1.15, 0.6, -0.35], parent: 'maple' },
    { name: 'lantern', at: [-0.62, 0.62, 0.12] },
    { name: 'flame', at: [-0.62, 0.48, 0.12], parent: 'lantern' },
  ],
  parts: [
    // the ground, and a worn path up to the steps
    { shape: { kind: 'rough', shape: { kind: 'cylinder', at: [0, -0.3, 0], height: 0.3, r: 1.85 }, by: 0.025, scale: 0.5 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.3, colors: ['#2c4428', '#466434', '#466434', '#6c8a40'] }, side: { kind: 'bands', axis: 'y', size: 0.07, colors: ['#4a3424', '#251b33', '#6e4c30'] } }, ink: { kind: 'tufts', amount: 0.35 } },
    { shape: { kind: 'rough', shape: { kind: 'box', at: [-0.1, -0.01, 0.75], half: [0.32, 0.02, 0.85], round: 0.02 }, by: 0.02, scale: 0.25 }, paint: { kind: 'speckle', size: 0.05, colors: ['#93693e', '#6e4c30', '#b8aeb0'] }, bare: true },
    // the chapel floor, raised on a plinth, and the steps up to it
    { shape: { kind: 'box', at: [-0.2, 0.13, -0.86], half: [1.1, 0.13, 0.22] }, paint: { kind: 'faces', top: { kind: 'hex', size: 0.16, colors: ['#8e8790', '#67626a', '#b8aeb0'], line: '#45434a' }, side: { kind: 'bricks', size: [0.22, 0.087], colors: ['#8e8790', '#67626a'], line: '#45434a' } }, grime: '#2c4428' },
    { shape: { kind: 'steps', at: [-0.1, 0, -0.17], dir: [0, -1], count: 4, rise: 0.065, run: 0.118, width: 0.62, wear: 0.8, seed: 4 }, paint: { kind: 'pieces', colors: ['#b8aeb0', '#8e8790', '#dcd2c8'], line: '#67626a' }, grime: '#2c4428' },
    // the arcade along the back, broken along its top
    { shape: { kind: 'arcade', from: [-1.3, 0.26, -0.96], to: [0.9, 0.26, -0.96], height: 1.45, thick: 0.16, bays: 3, pillar: 0.2, spring: 0.72, arch: 'pointed', course: 0.1, ruin: 0.85, seed: 2 }, paint: { kind: 'pieces', colors: ['#b8aeb0', '#8e8790', '#dcd2c8', '#93693e'], line: '#45434a' }, grime: '#2c4428' },
    // brick walls either side, fallen in places
    { shape: { kind: 'wall', from: [-1.36, 0, -1.02], to: [-1.36, 0, 0.45], height: 1.15, thick: 0.14, brick: [0.15, 0.072], jitter: 0.6, ruin: 0.85, missing: 0.07, fallen: 24, seed: 11 }, paint: { kind: 'pieces', colors: ['#c27a6a', '#8a5a6a', '#b23a1c', '#93693e'], line: '#45434a' }, grime: '#1c2a1e' },
    { shape: { kind: 'wall', from: [0.96, 0, -1.02], to: [1.5, 0, -0.1], height: 0.75, thick: 0.14, brick: [0.15, 0.072], jitter: 0.6, ruin: 0.9, missing: 0.05, fallen: 10, seed: 5 }, paint: { kind: 'pieces', colors: ['#c27a6a', '#8a5a6a', '#b23a1c', '#93693e'], line: '#45434a' }, grime: '#1c2a1e' },
    // ivy up the left wall
    { shape: { kind: 'sweep', path: [[-1.28, 0, 0.1], [-1.27, 0.25, 0.05], [-1.27, 0.45, -0.12], [-1.26, 0.6, -0.08], [-1.27, 0.72, -0.25]], r: 0.022, rTo: 0.01 }, paint: '#2c4428', noShadow: true },
    { shape: { kind: 'grow', style: 'coral', at: [-1.26, 0.35, 0.02], seed: 6, size: 0.18, r: 0.012, depth: 3, tips: 0.035, only: 'tips' }, paint: { kind: 'speckle', size: 0.04, colors: ['#466434', '#6c8a40', '#2c4428'] }, noShadow: true },
    // a fence along the path, posts leaning and rails gone
    { shape: { kind: 'fence', path: [[0.35, 0, 1.65], [0.42, 0, 0.6], [1.0, 0, 0.25], [1.45, 0, 0.35]], bay: 0.34, height: 0.36, post: 0.03, rails: 2, lean: 0.7, missing: 0.35, sag: 0.8, seed: 3 }, paint: { kind: 'pieces', colors: ['#93693e', '#6e4c30', '#b8aeb0'] }, noShadow: true },
    { shape: { kind: 'fence', path: [[-0.55, 0, 1.65], [-0.62, 0, 0.75], [-1.2, 0, 0.6]], bay: 0.34, height: 0.36, post: 0.03, rails: 2, lean: 0.6, missing: 0.45, sag: 0.6, seed: 8 }, paint: { kind: 'pieces', colors: ['#93693e', '#6e4c30', '#b8aeb0'] }, noShadow: true },
    // a maple in autumn
    { shape: { kind: 'grow', style: 'tree', at: [1.15, 0, -0.35], seed: 21, size: 0.62, r: 0.07, depth: 4, tips: 0.11, only: 'twigs' }, paint: '#4a3424', bone: 'maple' },
    { shape: { kind: 'grow', style: 'tree', at: [1.15, 0, -0.35], seed: 21, size: 0.62, r: 0.07, depth: 4, tips: 0.11, only: 'tips' }, paint: { kind: 'speckle', size: 0.045, colors: ['#e0602a', '#b23a1c', '#f29a3a', '#7a2418'] }, bone: 'crown', noShadow: true },
    // a lantern on a post by the steps
    { shape: { kind: 'cylinder', at: [-0.62, 0, 0.12], height: 0.62, r: 0.022 }, paint: '#2a2a30' },
    { shape: { kind: 'box', at: [-0.62, 0.47, 0.12], half: [0.05, 0.065, 0.05] }, paint: '#2a2a30', bone: 'lantern' },
    { shape: { kind: 'sphere', at: [-0.62, 0.47, 0.12], r: 0.04 }, paint: '#ffd08a', bone: 'flame', glow: true },
    // a few stones and leaves on the ground
    { shape: { kind: 'rough', shape: { kind: 'ball', at: [0.7, 0.04, 1.1], r: [0.09, 0.06, 0.08] }, by: 0.015, scale: 0.08 }, paint: '#8e8790' },
    { shape: { kind: 'rough', shape: { kind: 'ball', at: [-0.95, 0.04, 1.0], r: [0.07, 0.05, 0.08] }, by: 0.015, scale: 0.08 }, paint: '#67626a' },
    { shape: { kind: 'rough', shape: { kind: 'cylinder', at: [1.0, 0, 0.62], height: 0.012, r: 0.34 }, by: 0.05, scale: 0.15 }, paint: { kind: 'speckle', size: 0.045, colors: ['#b23a1c', '#e0602a', '#466434', '#7a2418'] }, bare: true, noShadow: true },
  ],
  moves: [
    { kind: 'sway', bone: 'maple', axis: 'z', degrees: 1.5, times: 2 },
    { kind: 'sway', bone: 'crown', axis: 'x', degrees: 2.5, times: 3, phase: 0.2 },
    { kind: 'sway', bone: 'lantern', axis: 'x', degrees: 3, times: 2 },
    { kind: 'pulse', bone: 'flame', size: [0.85, 1.1], times: 9 },
  ],
  lights: [
    { at: [-0.62, 0.47, 0.2], color: '#ffd08a', strength: 1.6, range: 1.3, flicker: { by: 0.2, times: 9 }, shadows: true },
  ],
}
