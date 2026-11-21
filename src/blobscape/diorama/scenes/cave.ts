import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'

/**
 * An ice cave cut open at night: icicles along the broken rim of its roof, stalactites and stalagmites joining into
 * columns, flowstone down the back wall, basalt columns stepping into a still pool, a geode broken open on a ledge,
 * and clusters of glowing crystals, one growing as you watch. Built from the formation shapes (issue #177).
 * Data only: see docs/scene-descriptions.md.
 */
export const CAVE: SceneDoc = {
  name: 'Crystal cave',
  loop: 12,
  light: { from: [0.2, 0.7, 0.8], ambient: 0.55, shadow: 0.55 },
  lamps: 'always',
  palette: [
    '#070a16', '#0e1630', '#18264a', '#243a66', '#33558a', '#4a78aa', '#6fa0c8', '#a0c8e0',
    '#d4ecf4', '#f4fbff', '#1e1a30', '#2e2a44', '#45405c', '#615a78', '#8a84a0', '#2a1640',
    '#45215e', '#6a2f86', '#9446ac', '#c070d0', '#e8a8ec', '#16353a', '#22585a', '#3a8a84',
    '#f2b25a', '#ffe2a0',
  ],
  sky: ['#070a16', '#18264a'],
  skyReach: 0.6,
  look: { dither: 0.5, glow: 1.8, outline: true, edges: true },
  disc: 0.7,
  camera: { target: [0, 0.65, -0.1], distance: 5.0, azimuth: 16, elevation: 14, swing: 6 },
  air: {
    haze: { color: '#0e1630', from: 1.5, to: 8 },
    specks: [{ kind: 'dust', count: 50, from: [-1.4, 0.2, -1.1], to: [1.4, 1.5, 0.6], colors: ['#d4ecf4', '#e8a8ec'], glow: true }],
  },
  bones: [
    { name: 'sprout', at: [0.35, 0.02, 0.55] },
    { name: 'drop0', at: [-0.62, 1.05, 0.1] },
    { name: 'drop1', at: [-0.62, 1.05, 0.1] },
  ],
  parts: [
    // the floor and the cave round it, cut open toward the view
    { shape: { kind: 'rough', shape: { kind: 'cylinder', at: [0, -0.3, -0.1], height: 0.3, r: 1.85 }, by: 0.03, scale: 0.4 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.3, colors: ['#45405c', '#2e2a44', '#615a78'] }, side: { kind: 'bands', axis: 'y', size: 0.06, colors: ['#2e2a44', '#1e1a30', '#45405c'] } }, ink: { kind: 'cracks', amount: 0.3 } },
    { shape: { kind: 'rough', shape: { kind: 'cut', shape: { kind: 'cut', shape: { kind: 'cut', shape: { kind: 'sphere', at: [0, -0.25, -0.15], r: 1.92 }, hole: { kind: 'ball', at: [0, -0.25, -0.15], r: [1.74, 1.8, 1.62] } }, hole: { kind: 'box', at: [0, 1, 1.4], half: [2.2, 2.2, 1.25] } }, hole: { kind: 'box', at: [0, -1.2, 0], half: [2.2, 1.15, 2.2] } }, by: 0.07, scale: 0.35 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.25, colors: ['#d4ecf4', '#a0c8e0'] }, side: { kind: 'patches', size: 0.3, colors: ['#33558a', '#243a66', '#4a78aa'] }, under: { kind: 'patches', size: 0.3, colors: ['#243a66', '#18264a'] } }, grime: '#0e1630' },
    // icicles along the broken front rim of the roof
    { shape: { kind: 'icicles', on: { kind: 'rough', shape: { kind: 'cut', shape: { kind: 'cut', shape: { kind: 'cut', shape: { kind: 'sphere', at: [0, -0.25, -0.15], r: 1.92 }, hole: { kind: 'ball', at: [0, -0.25, -0.15], r: [1.74, 1.8, 1.62] } }, hole: { kind: 'box', at: [0, 1, 1.4], half: [2.2, 2.2, 1.25] } }, hole: { kind: 'box', at: [0, -1.2, 0], half: [2.2, 1.15, 2.2] } }, by: 0.07, scale: 0.35 }, every: 0.07, length: 0.32, above: 0.3, seed: 3 }, paint: { kind: 'pieces', colors: ['#d4ecf4', '#a0c8e0', '#f4fbff'] }, noShadow: true },
    // stalactites and stalagmites through the middle, flowstone down the back
    { shape: { kind: 'drips', at: [0.4, 0, -0.55], r: 0.65, roof: 1.45, count: 20, length: 0.7, seed: 7 }, paint: { kind: 'pieces', colors: ['#a0c8e0', '#6fa0c8', '#d4ecf4'] }, grime: '#33558a' },
    { shape: { kind: 'flowstone', at: [-1.2, 1.0, -0.85], along: [1, 0.9], width: 0.6, drop: 0.8, folds: 5, seed: 2 }, paint: { kind: 'bands', axis: 'y', size: 0.06, colors: ['#a0c8e0', '#6fa0c8', '#d4ecf4'] } },
    // basalt columns stepping down into a still pool
    { shape: { kind: 'columns', at: [-0.95, 0, 0.35], r: 0.62, cell: 0.17, height: 0.62, rise: 'steps', seed: 5 }, paint: { kind: 'faces', top: { kind: 'pieces', colors: ['#8a84a0', '#a0c8e0', '#615a78'] }, side: { kind: 'pieces', colors: ['#45405c', '#615a78', '#2e2a44'] } }, grime: '#16353a' },
    { shape: { kind: 'cylinder', at: [-0.35, -0.02, 0.75], height: 0.05, r: 0.62 }, paint: '#22585a', glass: { see: 0.6, mirror: 0.45, top: true }, bare: true },
    // a geode broken open on a ledge at the back
    { shape: { kind: 'rough', shape: { kind: 'box', at: [-0.4, 0.2, -1.1], half: [0.45, 0.2, 0.28], round: 0.08 }, by: 0.03, scale: 0.15 }, paint: { kind: 'faces', top: '#615a78', side: '#2e2a44' } },
    { shape: { kind: 'geode', at: [-0.4, 0.68, -1.0], r: 0.32, open: [0.15, 0.35, 1], bands: 3, seed: 4 }, paint: { kind: 'pieces', colors: ['#615a78', '#c070d0', '#e8a8ec'], line: '#9446ac', ordered: true } },
    // glowing crystals on the right, and one growing in front
    { shape: { kind: 'crystals', at: [0.95, 0, -0.35], count: 11, size: 0.68, r: 0.08, spread: 55, chips: 2, seed: 9 }, paint: { kind: 'pieces', colors: ['#c070d0', '#e8a8ec', '#9446ac'] } },
    { shape: { kind: 'crystals', at: [-0.15, 0, -0.2], count: 5, size: 0.3, r: 0.05, spread: 45, seed: 13 }, paint: { kind: 'pieces', colors: ['#6fa0c8', '#a0c8e0'] } },
    { shape: { kind: 'crystals', at: [0.35, 0.02, 0.55], count: 6, size: 0.28, r: 0.04, spread: 40, seed: 17 }, paint: { kind: 'pieces', colors: ['#3a8a84', '#a0c8e0'] }, bone: 'sprout', glow: true },
    { shape: { kind: 'crystal', at: [1.15, 0, 0.45], dir: [-0.3, 1, 0.2], length: 0.36, r: 0.07, chips: 3, seed: 1 }, paint: '#8a84a0' },
    // a lantern left on a stone, and drops falling from a stalactite into the pool
    { shape: { kind: 'rough', shape: { kind: 'ball', at: [0.65, 0.07, 0.6], r: [0.14, 0.08, 0.12] }, by: 0.015, scale: 0.08 }, paint: '#45405c' },
    { shape: { kind: 'lathe', at: [0.65, 0.14, 0.6], profile: [[0.04, 0], [0.045, 0.02], [0.04, 0.11], [0.02, 0.14], [0.01, 0.16]] }, paint: '#ffe2a0', glow: true, lit: 'dark' },
    { shape: { kind: 'sphere', at: [-0.62, 1.05, 0.1], r: 0.018 }, paint: '#d4ecf4', bone: 'drop0', glow: true, noShadow: true },
    { shape: { kind: 'sphere', at: [-0.62, 1.05, 0.1], r: 0.018 }, paint: '#d4ecf4', bone: 'drop1', glow: true, noShadow: true },
  ],
  moves: [
    { kind: 'sprout', bone: 'sprout', times: 1 },
    { kind: 'drift', bone: 'drop0', by: [0, -1.05, 0], times: 4 },
    { kind: 'drift', bone: 'drop1', by: [0, -1.05, 0], times: 4, phase: 0.5 },
  ],
  lights: [
    { at: [0.75, 0.5, 0], color: '#c070d0', strength: 2.6, range: 1.6, lit: 'always', flicker: { by: 0.15, times: 3 } },
    { at: [0.65, 0.3, 0.62], color: '#f2b25a', strength: 1.4, range: 1.1, lit: 'dark', flicker: { by: 0.2, times: 8 }, shadows: true },
    { at: [-0.15, 0.25, -0.15], color: '#6fa0c8', strength: 1.2, range: 1.0, lit: 'always' },
  ],
}
