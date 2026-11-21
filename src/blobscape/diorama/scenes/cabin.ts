import type { PaintDoc, SceneDoc } from '../../../splat-engine/sceneDoc.ts'

/**
 * A log cabin snowed in on a winter night: snow falling and settling where it lands, drifts piled deep downwind of
 * the cabin, the rocks and the fence and scoured thin where the wind meets them, a path trodden through to the gate,
 * frost growing across the lit window a branch at a time and melting back, smoke from the chimney, a woodpile and a
 * lantern. Built from the weather shapes (issue #174). Data only: see docs/scene-descriptions.md.
 */
const PINE: PaintDoc = { kind: 'faces', top: '#2c5a44', side: { kind: 'patches', size: 0.08, colors: ['#1a3c30', '#0e2620'] } }
const LOGS: PaintDoc = { kind: 'bands', axis: 'y', size: 0.055, colors: ['#6e4630', '#4a2e22', '#94643e'] }
const FROST: PaintDoc = { kind: 'pieces', colors: ['#f4f8ff', '#d4e0f0', '#a8bcd8', '#a8bcd8'], ordered: true }
const WINDOW: [number, number, number] = [0.27, 0.34, 0.035]

export const CABIN: SceneDoc = {
  name: 'Snowed-in cabin',
  loop: 12,
  light: { from: [-0.6, 0.75, 0.45], ambient: 0.55, shadow: 0.55 },
  palette: [
    '#0b1020', '#141c34', '#22304e', '#34486e', '#4e6890', '#7890b8', '#a8bcd8', '#d4e0f0',
    '#f4f8ff', '#2a1a18', '#4a2e22', '#6e4630', '#94643e', '#0e2620', '#1a3c30', '#2c5a44',
    '#ffb840', '#ffe0a0', '#f07a30', '#5a5a6e', '#8a8aa0',
  ],
  sky: ['#0b1020', '#34486e'],
  skyReach: 0.8,
  look: { dither: 0.5, glow: 1.4, outline: true, edges: true },
  camera: { target: [0, 0.32, 0.05], distance: 5.0, azimuth: 22, elevation: 22, swing: 8 },
  cover: { kind: 'snow', color: '#f4f8ff', amount: 0.5 },
  air: {
    haze: { color: '#22304e', from: 2, to: 9 },
    specks: [{ kind: 'snow', count: 150, from: [-1.4, 0, -1.2], to: [1.4, 2.0, 1.25], colors: ['#f4f8ff', '#d4e0f0'], land: true, wind: [0.3, 0.09] }],
  },
  bones: [
    { name: 'frost0', at: WINDOW },
    { name: 'frost1', at: WINDOW },
    { name: 'frost2', at: WINDOW },
    { name: 'smoke0', at: [0.42, 1.12, -0.42] },
    { name: 'smoke1', at: [0.42, 1.12, -0.42] },
    { name: 'smoke2', at: [0.42, 1.12, -0.42] },
    { name: 'smoke3', at: [0.42, 1.12, -0.42] },
  ],
  parts: [
    // frozen ground, and low hills behind
    { shape: { kind: 'box', at: [0, -0.1, 0], half: [1.55, 0.1, 1.35] }, paint: { kind: 'faces', top: '#34486e', side: { kind: 'bands', axis: 'y', size: 0.05, colors: ['#2a1a18', '#4a2e22'] } } },
    { shape: { kind: 'rough', shape: { kind: 'ball', at: [-0.9, -0.1, -1.05], r: [0.75, 0.38, 0.4] }, by: 0.04, scale: 0.3 }, paint: '#4e6890' },
    { shape: { kind: 'rough', shape: { kind: 'ball', at: [0.95, -0.1, -1.1], r: [0.65, 0.3, 0.35] }, by: 0.04, scale: 0.3 }, paint: '#4e6890' },
    // the cabin: log walls, a pitched roof, a stone chimney, a door and a lit window
    { shape: { kind: 'box', at: [0.1, 0.3, -0.3], half: [0.46, 0.3, 0.32], round: 0.02 }, paint: LOGS },
    { shape: { kind: 'roof', at: [0.1, 0.6, -0.3], half: [0.56, 0.42], height: 0.36 }, paint: { kind: 'faces', top: '#4a2e22', side: '#2a1a18', under: '#2a1a18' } },
    { shape: { kind: 'box', at: [0.42, 0.82, -0.42], half: [0.07, 0.28, 0.07] }, paint: { kind: 'bricks', size: [0.06, 0.035], colors: ['#5a5a6e', '#8a8aa0'], line: '#22304e' } },
    { shape: { kind: 'box', at: [-0.14, 0.22, 0.03], half: [0.1, 0.22, 0.02] }, paint: { kind: 'bands', axis: 'x', size: 0.04, colors: ['#4a2e22', '#2a1a18'] } },
    { shape: { kind: 'box', at: [0.27, 0.34, 0.03], half: [0.13, 0.11, 0.015] }, paint: '#2a1a18' },
    { shape: { kind: 'box', at: [0.27, 0.34, 0.035], half: [0.1, 0.085, 0.012] }, paint: '#ffb840', glow: true, lit: 'dark', unlit: '#a9c3d4', bare: true },
    // a woodpile against the west wall, rocks, three pines and a fence
    { shape: { kind: 'join', shapes: [
      { kind: 'cone', from: [-0.42, 0.05, -0.5], to: [-0.42, 0.05, -0.1], r: 0.045 },
      { kind: 'cone', from: [-0.5, 0.05, -0.5], to: [-0.5, 0.05, -0.1], r: 0.045 },
      { kind: 'cone', from: [-0.46, 0.13, -0.5], to: [-0.46, 0.13, -0.1], r: 0.045 },
    ] }, paint: { kind: 'faces', top: '#94643e', side: '#6e4630' } },
    { shape: { kind: 'rough', shape: { kind: 'ball', at: [0.85, 0.05, 0.3], r: [0.17, 0.13, 0.14] }, by: 0.02, scale: 0.12 }, paint: { kind: 'faces', top: '#8a8aa0', side: '#5a5a6e' } },
    { shape: { kind: 'rough', shape: { kind: 'ball', at: [-0.95, 0.04, 0.2], r: [0.13, 0.1, 0.12] }, by: 0.02, scale: 0.12 }, paint: { kind: 'faces', top: '#8a8aa0', side: '#5a5a6e' } },
    { shape: { kind: 'join', shapes: [
      { kind: 'cylinder', at: [-1.05, 0, -0.45], height: 0.12, r: 0.035 },
      { kind: 'cylinder', at: [-1.05, 0.1, -0.45], height: 0.4, r: 0.24, rTop: 0.1 },
      { kind: 'cylinder', at: [-1.05, 0.34, -0.45], height: 0.34, r: 0.18, rTop: 0.05 },
      { kind: 'cylinder', at: [-1.05, 0.56, -0.45], height: 0.3, r: 0.12, rTop: 0.01 },
    ] }, paint: PINE },
    { shape: { kind: 'join', shapes: [
      { kind: 'cylinder', at: [1.1, 0, -0.55], height: 0.1, r: 0.03 },
      { kind: 'cylinder', at: [1.1, 0.08, -0.55], height: 0.34, r: 0.2, rTop: 0.08 },
      { kind: 'cylinder', at: [1.1, 0.28, -0.55], height: 0.3, r: 0.15, rTop: 0.04 },
      { kind: 'cylinder', at: [1.1, 0.48, -0.55], height: 0.26, r: 0.1, rTop: 0.01 },
    ] }, paint: PINE },
    { shape: { kind: 'join', shapes: [
      { kind: 'cylinder', at: [-0.75, 0, -0.95], height: 0.1, r: 0.03 },
      { kind: 'cylinder', at: [-0.75, 0.08, -0.95], height: 0.3, r: 0.17, rTop: 0.06 },
      { kind: 'cylinder', at: [-0.75, 0.26, -0.95], height: 0.26, r: 0.12, rTop: 0.01 },
    ] }, paint: PINE },
    { shape: { kind: 'fence', path: [[-1.4, 0, 0.75], [-0.7, 0, 1.05], [-0.38, 0, 1.08]], bay: 0.3, height: 0.24, post: 0.03, rails: 2, lean: 0.25, seed: 4 }, paint: { kind: 'pieces', colors: ['#6e4630', '#4a2e22', '#94643e'] } },
    { shape: { kind: 'fence', path: [[0.05, 0, 1.08], [0.7, 0, 1.05], [1.4, 0, 0.8]], bay: 0.3, height: 0.24, post: 0.03, rails: 2, lean: 0.25, sag: 0.3, seed: 6 }, paint: { kind: 'pieces', colors: ['#6e4630', '#4a2e22', '#94643e'] } },
    // a lantern on a post by the path
    { shape: { kind: 'cylinder', at: [-0.42, 0, 0.42], height: 0.3, r: 0.018 }, paint: '#2a1a18' },
    { shape: { kind: 'lathe', at: [-0.42, 0.3, 0.42], profile: [[0.035, 0], [0.04, 0.02], [0.035, 0.08], [0.015, 0.1], [0.008, 0.12]] }, paint: '#ffe0a0', glow: true, lit: 'dark' },
    // the snow: drifts over all of it, a path trodden from the door to the gate
    { shape: { kind: 'drift', at: [0, 0, 0], half: [1.5, 1.3], depth: 0.035, wind: [1, 0.3], pile: 0.18, reach: 3, path: [[-0.14, 0, 0.05], [-0.25, 0, 0.55], [-0.16, 0, 1.08], [-0.1, 0, 1.35]], pathWidth: 0.24, seed: 2 }, paint: { kind: 'patches', size: 0.2, colors: ['#f4f8ff', '#d4e0f0'] }, bare: true },
    // frost across the window, growing a branch at a time and melting back
    { shape: { kind: 'frost', at: WINDOW, facing: [0, 0, 1], r: 0.1, arms: 6, stage: [0, 0.34], seed: 3 }, paint: FROST, bone: 'frost0', noShadow: true },
    { shape: { kind: 'frost', at: WINDOW, facing: [0, 0, 1], r: 0.1, arms: 6, stage: [0.34, 0.67], seed: 3 }, paint: FROST, bone: 'frost1', noShadow: true },
    { shape: { kind: 'frost', at: WINDOW, facing: [0, 0, 1], r: 0.1, arms: 6, stage: [0.67, 1], seed: 3 }, paint: FROST, bone: 'frost2', noShadow: true },
    // smoke from the chimney
    { shape: { kind: 'sphere', at: [0.42, 1.12, -0.42], r: 0.05 }, paint: '#7890b8', bone: 'smoke0', noShadow: true },
    { shape: { kind: 'sphere', at: [0.42, 1.12, -0.42], r: 0.05 }, paint: '#a8bcd8', bone: 'smoke1', noShadow: true },
    { shape: { kind: 'sphere', at: [0.42, 1.12, -0.42], r: 0.05 }, paint: '#7890b8', bone: 'smoke2', noShadow: true },
    { shape: { kind: 'sphere', at: [0.42, 1.12, -0.42], r: 0.05 }, paint: '#a8bcd8', bone: 'smoke3', noShadow: true },
  ],
  moves: [
    { kind: 'sprout', bone: 'frost0', times: 1 },
    { kind: 'sprout', bone: 'frost1', times: 1, phase: -0.12 },
    { kind: 'sprout', bone: 'frost2', times: 1, phase: -0.24 },
    { kind: 'drift', bone: 'smoke0', by: [0.45, 0.7, 0.1], times: 2, grow: [0.5, 1.8], phase: 0 },
    { kind: 'drift', bone: 'smoke1', by: [0.45, 0.7, 0.1], times: 2, grow: [0.5, 1.8], phase: 0.25 },
    { kind: 'drift', bone: 'smoke2', by: [0.45, 0.7, 0.1], times: 2, grow: [0.5, 1.8], phase: 0.5 },
    { kind: 'drift', bone: 'smoke3', by: [0.45, 0.7, 0.1], times: 2, grow: [0.5, 1.8], phase: 0.75 },
  ],
  lights: [
    { at: [0.27, 0.34, 0.25], color: '#ffb840', strength: 1.6, range: 1.0, lit: 'dark', flicker: { by: 0.08, times: 4 } },
    { at: [-0.42, 0.36, 0.48], color: '#ffe0a0', strength: 1.3, range: 0.9, lit: 'dark', flicker: { by: 0.15, times: 6 }, shadows: true },
  ],
}
