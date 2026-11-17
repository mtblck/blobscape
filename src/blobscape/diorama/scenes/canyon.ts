import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'

/**
 * A desert canyon at sunset, worn by water: banded cliffs with ledges where hard beds stand out, fans of scree, a mesa
 * with a caprock, hoodoos, a natural arch, a dry stream bed of pebbles and cracked mud, saguaros, succulents, a gnarled
 * tree grown by space colonization, a ram's skull with curled horns, the ribs of something long gone, a fossil shell,
 * and a hawk circling. Built from the worn-land (issue #175) and living-form (issue #178) shapes. Data only: see
 * docs/scene-descriptions.md.
 */
const BEDS = [{ thick: 0.12, hard: 0.9 }, { thick: 0.16, hard: 0.25 }, { thick: 0.08, hard: 0.95 }, { thick: 0.17, hard: 0.3 }]
const ROCK = { kind: 'pieces', colors: ['#b8542e', '#e09a5c', '#8e3a26', '#f0c08a'], line: '#c98a52', ordered: true } as const

export const CANYON: SceneDoc = {
  name: 'Desert canyon',
  loop: 12,
  light: { from: [-0.7, 0.5, 0.5], ambient: 0.55, shadow: 0.65 },
  palette: [
    '#1a0e1e', '#2e1626', '#4a1e2a', '#6e2a2a', '#8e3a26', '#b8542e', '#d8743a', '#e09a5c',
    '#f0c08a', '#fbe4b8', '#c98a52', '#7a5a3a', '#4e3a2a', '#2a3a26', '#3e5a30', '#5e7e3a',
    '#8aa04a', '#3a3a5a', '#5a5a86', '#8e7eb0', '#e8d8c8', '#fff4e0', '#f2b25a',
  ],
  sky: ['#3a3a5a', '#f2b25a'],
  skyReach: 0.8,
  look: { dither: 0.12, glow: 1.5, outline: true, edges: true },
  camera: { target: [0, 0.45, 0], distance: 5.4, azimuth: 14, elevation: 20, swing: 6 },
  air: {
    haze: { color: '#8e7eb0', from: 1.5, to: 9 },
    specks: [{ kind: 'dust', count: 40, from: [-1.5, 0.1, -1.4], to: [1.5, 1.2, 1.4], colors: ['#fbe4b8', '#f0c08a'] }],
  },
  bones: [
    { name: 'sky', at: [0, 1.7, -0.2] },
    { name: 'hawk', at: [0.75, 1.7, -0.2], parent: 'sky' },
    { name: 'wingL', at: [0.75, 1.7, -0.2], parent: 'hawk' },
    { name: 'wingR', at: [0.75, 1.7, -0.2], parent: 'hawk' },
    { name: 'tree', at: [-0.45, 0.05, 0.75] },
  ],
  parts: [
    // the land: two ridges of banded rock with a dry valley between, worn by water and slumped to scree
    {
      shape: { kind: 'land', at: [0, 0, 0], half: [1.6, 1.6], base: 0.25, peaks: [{ at: [-1.25, -0.9], h: 1.05, r: 1.0 }, { at: [-1.35, 0.4], h: 0.85, r: 0.85 }, { at: [1.3, -0.6], h: 0.95, r: 0.95 }, { at: [1.35, 0.8], h: 0.6, r: 0.7 }, { at: [0, -1.5], h: 0.5, r: 0.8 }], noise: 0.12, drops: 22000, slump: 0.55, beds: BEDS, seed: 7 },
      paint: ROCK, grime: '#6e2a2a',
    },
    // a mesa at the back, with a caprock
    { shape: { kind: 'butte', at: [0.02, 0.28, -1.25], r: 0.36, height: 0.95, beds: BEDS, wear: 0.35, cap: 0.15, seed: 3 }, paint: ROCK },
    // hoodoos and a natural arch
    { shape: { kind: 'hoodoo', at: [0.42, 0.0, -0.45], height: 0.6, r: 0.075, seed: 1 }, paint: { kind: 'pieces', colors: ['#e09a5c', '#f0c08a', '#d8743a', '#b8542e', '#8e3a26'], ordered: true } },
    { shape: { kind: 'hoodoo', at: [0.58, 0.04, -0.22], height: 0.44, r: 0.06, seed: 4 }, paint: { kind: 'pieces', colors: ['#e09a5c', '#f0c08a', '#d8743a', '#b8542e', '#8e3a26'], ordered: true } },
    { shape: { kind: 'hoodoo', at: [0.5, 0.05, 0.02], height: 0.3, r: 0.05, seed: 9 }, paint: { kind: 'pieces', colors: ['#e09a5c', '#f0c08a', '#d8743a', '#b8542e', '#8e3a26'], ordered: true } },
    { shape: { kind: 'arch', from: [-0.5, 0.02, -0.5], to: [-0.02, 0.02, -0.92], height: 0.72, thick: 0.17, beds: BEDS, seed: 5 }, paint: ROCK },
    // a dry stream bed: cracked mud and pebbles
    { shape: { kind: 'mud', at: [-0.05, 0.02, 1.05], r: 0.34, plate: 0.13, curl: 0.7, seed: 2 }, paint: { kind: 'pieces', colors: ['#c98a52', '#e09a5c', '#d8743a'], line: '#4e3a2a' }, bare: true },
    { shape: { kind: 'pebbles', path: [[-0.05, 0.06, -0.7], [0.05, 0.06, -0.15], [0.42, 0.06, 0.08], [0.3, 0.07, 0.8], [0.12, 0.06, 1.45]], width: 0.32, count: 70, size: 0.045, seed: 3 }, paint: { kind: 'pieces', colors: ['#8e7eb0', '#e8d8c8', '#7a5a3a', '#5a5a86'] }, noShadow: true },
    // saguaros and succulents
    { shape: { kind: 'cactus', at: [0.88, 0.1, 0.32], height: 0.62, r: 0.06, arms: 2, seed: 1 }, paint: { kind: 'faces', top: '#8aa04a', side: '#5e7e3a' }, ink: { kind: 'stipple', amount: 0.3, color: '#2a3a26' } },
    { shape: { kind: 'cactus', at: [-0.25, 0.03, -0.25], height: 0.42, r: 0.045, arms: 1, seed: 6 }, paint: { kind: 'faces', top: '#8aa04a', side: '#5e7e3a' } },
    { shape: { kind: 'rosette', at: [0.95, 0.06, 1.3], r: 0.13, leaves: 21, seed: 2 }, paint: { kind: 'split', axis: 'y', at: 0.09, below: '#3e5a30', above: '#8aa04a' }, noShadow: true },
    { shape: { kind: 'rosette', at: [-1.0, 0.03, 1.28], r: 0.1, leaves: 16, seed: 5 }, paint: { kind: 'split', axis: 'y', at: 0.09, below: '#3e5a30', above: '#8e7eb0' }, noShadow: true },
    // a gnarled tree grown by space colonization
    { shape: { kind: 'tree', at: [-0.45, 0.05, 0.75], height: 0.22, crown: [0.32, 0.18, 0.28], r: 0.045, points: 110, seed: 4 }, paint: '#4e3a2a', bone: 'tree' },
    { shape: { kind: 'tree', at: [-0.45, 0.05, 0.75], height: 0.22, crown: [0.32, 0.18, 0.28], r: 0.045, points: 110, leaves: 0.045, only: 'leaves', seed: 4 }, paint: { kind: 'speckle', size: 0.04, colors: ['#8aa04a', '#5e7e3a', '#3e5a30'] }, bone: 'tree', noShadow: true },
    // a ram's skull with curled horns, the ribs of something long gone, and a fossil shell
    { shape: { kind: 'join', shapes: [{ kind: 'ball', at: [0.62, 0.09, 1.0], r: [0.08, 0.07, 0.1] }, { kind: 'cone', from: [0.62, 0.08, 1.04], to: [0.62, 0.04, 1.16], r: 0.05, rTo: 0.03 }] }, paint: '#e8d8c8' },
    { shape: { kind: 'sphere', at: [0.59, 0.1, 1.08], r: 0.018 }, paint: '#2e1626' },
    { shape: { kind: 'sphere', at: [0.65, 0.1, 1.08], r: 0.018 }, paint: '#2e1626' },
    { shape: { kind: 'horn', at: [0.56, 0.13, 0.98], dir: [-0.7, 0.6, -0.2], length: 0.3, r: 0.032, curl: 0.95, twist: 0.35, ridges: 14 }, paint: '#fbe4b8' },
    { shape: { kind: 'horn', at: [0.68, 0.13, 0.98], dir: [0.7, 0.6, -0.2], length: 0.3, r: 0.032, curl: 0.95, twist: -0.35, ridges: 14 }, paint: '#fbe4b8' },
    { shape: { kind: 'ribs', from: [-0.78, 0.13, 1.22], to: [-0.38, 0.11, 1.02], count: 6, span: 0.15, drop: 0.16, r: 0.012 }, paint: '#e8d8c8', noShadow: true },
    { shape: { kind: 'shell', at: [-0.2, 0.09, 1.42], size: 0.2, turns: 3, facing: 20 }, paint: { kind: 'pieces', colors: ['#e8d8c8', '#c98a52'], ordered: true } },
    // a hawk circling high over the valley
    { shape: { kind: 'join', shapes: [{ kind: 'ball', at: [0.75, 1.7, -0.2], r: [0.025, 0.02, 0.06] }, { kind: 'cone', from: [0.75, 1.7, -0.26], to: [0.75, 1.69, -0.32], r: 0.02, rTo: 0.006 }] }, paint: '#2e1626', bone: 'hawk', noShadow: true },
    { shape: { kind: 'cone', from: [0.75, 1.7, -0.2], to: [0.6, 1.72, -0.22], r: 0.02, rTo: 0.006 }, paint: '#2e1626', bone: 'wingL', noShadow: true },
    { shape: { kind: 'cone', from: [0.75, 1.7, -0.2], to: [0.9, 1.72, -0.22], r: 0.02, rTo: 0.006 }, paint: '#2e1626', bone: 'wingR', noShadow: true },
  ],
  moves: [
    { kind: 'spin', bone: 'sky', axis: 'y', times: 1 },
    { kind: 'sway', bone: 'wingL', axis: 'z', degrees: 14, times: 6 },
    { kind: 'sway', bone: 'wingR', axis: 'z', degrees: -14, times: 6 },
    { kind: 'sway', bone: 'tree', axis: 'x', degrees: 1.2, times: 2 },
  ],
}
