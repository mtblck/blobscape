import type { PropDoc, SceneProject } from '../../splat-engine/project.ts'
import type { MadeProp } from './garden.ts'

/**
 * The farm on the windmill's hill (Diorama's windmill scene) as a land and props (docs/scenes-from-props.md): the hill,
 * its fields, path and pond are the land, and the windmill, three apple trees, the duck, two haystacks and three sheep
 * are library props set down on it. Each was written where it stood in the scene, so its foot is where it stood; the
 * duck pushes through whatever water it is set down in (`PropDoc.water`). The sky and clouds are the shared recipes'.
 * Data only, as a scene description is: see docs/scene-descriptions.md.
 */

/** The green hill the windmill stands on, with its path, fields and pond. */
export const WINDMILL_HILL: PropDoc = {
  name: 'Windmill hill',
  foot: [0, 0, 0],
  doc: {
    name: 'Windmill hill',
    loop: 12,
    light: { from: [0.4, 0.8, 0.6], ambient: 0.7, shadow: 0.5 },
    palette: [
      '#22202b', '#3b2a20', '#5e4230', '#8a6242', '#b98d60', '#2f5d34', '#4a8a3c', '#76b04a',
      '#a8d05e', '#b88a2e', '#e0b648', '#f3d977', '#ffd84a', '#5a5863', '#8b8894', '#bdbac4',
      '#ebe8e2', '#fbf7ea', '#8c2f2a', '#c4483a', '#e58fa8', '#2e62a8', '#3b6fb5', '#5fa8e0',
      '#9fd0ee', '#dff1f8',
    ],
    sky: ['#5fa8e0', '#dff1f8'],
    look: { dither: 0.5, glow: 0.5, outline: true, edges: true, steps: true },
    camera: { target: [0, 1.05, 0], distance: 5.4, azimuth: -16, elevation: 12 },
    focus: { at: [-0.25, 0.7, -0.25], r: 1.3 },
    air: { haze: { color: '#9fd0ee', from: 2, to: 14 }, specks: [{ kind: 'dust', count: 20, from: [-1.5, 0.2, -1], to: [1.5, 1.2, 1.2], colors: ['#f3d977', '#fbf7ea'] }, { kind: 'leaves', count: 10, size: 0.018, from: [0.98, 0.5, -0.97], to: [1.42, 0.9, -0.53], colors: ['#4a8a3c', '#76b04a', '#a8d05e'], land: true, shaken: true }, { kind: 'leaves', count: 12, size: 0.018, from: [-1.5, 0.6, -1.05], to: [-1, 1.05, -0.55], colors: ['#4a8a3c', '#76b04a', '#a8d05e'], land: true, shaken: true }, { kind: 'leaves', count: 8, size: 0.018, from: [0.27, 0.45, -1.43], to: [0.63, 0.75, -1.07], colors: ['#4a8a3c', '#76b04a', '#a8d05e'], land: true, shaken: true }] },
    water: { level: -0.015, from: [-1.36, -0.16], to: [-0.64, 0.56], color: '#2e62a8', clear: 0.45, cell: 0.018, ripple: 5, deep: 0.05, bodies: [], floats: [] },
    bones: [
      { name: 'bird0', at: [-0.25, 2, -0.25] },
      { name: 'bird0L', at: [0.65, 2, -0.25], parent: 'bird0' },
      { name: 'bird0R', at: [0.65, 2, -0.25], parent: 'bird0' },
      { name: 'bird1', at: [-0.25, 2.35, -0.25] },
      { name: 'bird1L', at: [0.95, 2.35, -0.25], parent: 'bird1' },
      { name: 'bird1R', at: [0.95, 2.35, -0.25], parent: 'bird1' },
      { name: '~sun', at: [1.75, 2.35, -1.9] },
    ],
    parts: [
      { shape: { kind: 'cut', shape: { kind: 'rough', shape: { kind: 'cylinder', at: [0, -0.3, 0], height: 0.3, r: 1.8 }, by: 0.03, scale: 0.7 }, hole: { kind: 'cylinder', at: [-1, -0.07, 0.2], height: 0.12, r: 0.35 } }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.4, colors: ['#4a8a3c', '#76b04a', '#76b04a', '#a8d05e'] }, side: { kind: 'bands', axis: 'y', size: 0.07, colors: ['#8a6242', '#5e4230', '#b98d60'] } } },
      { shape: { kind: 'rough', shape: { kind: 'box', at: [0.95, 0.05, 0.45], half: [0.5, 0.07, 0.5], round: 0.03 }, by: 0.015, scale: 0.08 }, paint: { kind: 'faces', top: { kind: 'bands', axis: 'x', size: 0.07, colors: ['#e0b648', '#f3d977', '#b88a2e'] }, side: { kind: 'bands', axis: 'x', size: 0.07, colors: ['#b88a2e', '#e0b648'] } } },
      { shape: { kind: 'box', at: [-0.25, 0, 0.75], half: [0.11, 0.022, 0.7] }, paint: { kind: 'speckle', size: 0.05, colors: ['#b98d60', '#b98d60', '#8a6242', '#ebe8e2'] } },
      { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [-1.45, 0, 0.95], height: 0.2, r: 0.022 }, { kind: 'cylinder', at: [-1.26, 0, 0.95], height: 0.2, r: 0.022 }, { kind: 'cylinder', at: [-1.07, 0, 0.95], height: 0.2, r: 0.022 }, { kind: 'cylinder', at: [-0.88, 0, 0.95], height: 0.2, r: 0.022 }, { kind: 'cylinder', at: [-0.69, 0, 0.95], height: 0.2, r: 0.022 }, { kind: 'cylinder', at: [-0.5, 0, 0.95], height: 0.2, r: 0.022 }, { kind: 'cone', from: [-1.45, 0.08, 0.95], to: [-0.5, 0.08, 0.95], r: 0.014 }, { kind: 'cone', from: [-1.45, 0.16, 0.95], to: [-0.5, 0.16, 0.95], r: 0.014 }] }, paint: { kind: 'speckle', size: 0.06, colors: ['#b98d60', '#8a6242'] } },
      { shape: { kind: 'cylinder', at: [-1, -0.13, 0.2], height: 0.06, r: 0.36 }, paint: { kind: 'patches', size: 0.08, colors: ['#5e4230', '#3b2a20', '#5a5863'] } },
      { shape: { kind: 'rough', shape: { kind: 'ring', at: [-1, 0.02, 0.2], r: 0.37, tube: 0.035 }, by: 0.012, scale: 0.06 }, paint: { kind: 'speckle', size: 0.07, colors: ['#8b8894', '#bdbac4', '#5a5863'] } },
      { shape: { kind: 'sphere', at: [-0.6, 0.03, 0.5], r: 0.022 }, paint: '#e58fa8', glow: true },
      { shape: { kind: 'sphere', at: [-0.5, 0.03, 0.3], r: 0.022 }, paint: '#ffd84a', glow: true },
      { shape: { kind: 'sphere', at: [0.1, 0.03, 0.4], r: 0.022 }, paint: '#fbf7ea', glow: true },
      { shape: { kind: 'sphere', at: [0.2, 0.03, 0.2], r: 0.022 }, paint: '#e58fa8', glow: true },
      { shape: { kind: 'sphere', at: [-0.7, 0.03, -0.75], r: 0.022 }, paint: '#ffd84a', glow: true },
      { shape: { kind: 'sphere', at: [0.2, 0.03, -0.8], r: 0.022 }, paint: '#fbf7ea', glow: true },
      { shape: { kind: 'sphere', at: [-1.4, 0.03, 0.6], r: 0.022 }, paint: '#e58fa8', glow: true },
      { shape: { kind: 'sphere', at: [0, 0.03, 1.35], r: 0.022 }, paint: '#ffd84a', glow: true },
      { shape: { kind: 'sphere', at: [-0.6, 0.03, 1.3], r: 0.022 }, paint: '#fbf7ea', glow: true },
      { shape: { kind: 'sphere', at: [1.3, 0.03, -0.2], r: 0.022 }, paint: '#e58fa8', glow: true },
      { shape: { kind: 'sphere', at: [0.9, 0.03, -0.4], r: 0.022 }, paint: '#ffd84a', glow: true },
      { shape: { kind: 'sphere', at: [-0.05, 0.03, 0.75], r: 0.022 }, paint: '#fbf7ea', glow: true },
      { shape: { kind: 'sphere', at: [-0.5, 0.03, 1.05], r: 0.022 }, paint: '#e58fa8', glow: true },
      { shape: { kind: 'sphere', at: [0.75, 0.03, 1.2], r: 0.022 }, paint: '#ffd84a', glow: true },
      { shape: { kind: 'ball', at: [0.65, 2, -0.25], r: [0.02, 0.02, 0.07] }, paint: '#22202b', bone: 'bird0', glow: true },
      { shape: { kind: 'box', at: [0.72, 2, -0.25], half: [0.07, 0.012, 0.035] }, paint: '#22202b', bone: 'bird0L', glow: true },
      { shape: { kind: 'box', at: [0.58, 2, -0.25], half: [0.07, 0.012, 0.035] }, paint: '#22202b', bone: 'bird0R', glow: true },
      { shape: { kind: 'ball', at: [0.95, 2.35, -0.25], r: [0.02, 0.02, 0.07] }, paint: '#22202b', bone: 'bird1', glow: true },
      { shape: { kind: 'box', at: [1.02, 2.35, -0.25], half: [0.07, 0.012, 0.035] }, paint: '#22202b', bone: 'bird1L', glow: true },
      { shape: { kind: 'box', at: [0.88, 2.35, -0.25], half: [0.07, 0.012, 0.035] }, paint: '#22202b', bone: 'bird1R', glow: true },
      { shape: { kind: 'sphere', at: [1.75, 2.35, -1.9], r: 0.24 }, paint: '#ffd84a', bone: '~sun', lit: 'day', unlit: 'gone', glow: true, noShadow: true, bare: true },
    ],
    moves: [
      { kind: 'spin', bone: 'bird0', axis: 'y', times: 1, phase: 0 },
      { kind: 'sway', bone: 'bird0L', axis: 'z', degrees: 35, times: 24 },
      { kind: 'sway', bone: 'bird0R', axis: 'z', degrees: -35, times: 24 },
      { kind: 'spin', bone: 'bird1', axis: 'y', times: -1, phase: 0.4 },
      { kind: 'sway', bone: 'bird1L', axis: 'z', degrees: 35, times: 24 },
      { kind: 'sway', bone: 'bird1R', axis: 'z', degrees: -35, times: 24 },
    ],
    heavens: { clouds: { cover: 'partly', colors: ['#bdbac4', '#ebe8e2', '#fbf7ea'], glow: true } },
  },
}

/** A windmill whose sails turn. */
export const WINDMILL: PropDoc = {
  name: 'Windmill',
  foot: [-0.25, 0, -0.184],
  doc: {
    name: 'Windmill',
    loop: 12,
    light: { from: [0.4, 0.8, 0.6], ambient: 0.7, shadow: 0.5 },
    palette: [
      '#22202b', '#3b2a20', '#5e4230', '#8a6242', '#b98d60', '#2f5d34', '#4a8a3c', '#76b04a',
      '#a8d05e', '#b88a2e', '#e0b648', '#f3d977', '#ffd84a', '#5a5863', '#8b8894', '#bdbac4',
      '#ebe8e2', '#fbf7ea', '#8c2f2a', '#c4483a', '#e58fa8', '#2e62a8', '#3b6fb5', '#5fa8e0',
      '#9fd0ee', '#dff1f8',
    ],
    sky: ['#5fa8e0', '#dff1f8'],
    look: { dither: 0.5, glow: 0.5, outline: true, edges: true, steps: true },
    camera: { target: [0, 1.05, 0], distance: 5.4, azimuth: -16, elevation: 12 },
    bones: [
      { name: 'sails', at: [-0.25, 1.02, 0.17] },
    ],
    parts: [
      { shape: { kind: 'cylinder', at: [-0.25, 0, -0.25], height: 1.15, r: 0.37, rTop: 0.25 }, paint: { kind: 'split', axis: 'y', at: 0.16, below: { kind: 'bricks', size: [0.16, 0.08], colors: ['#8b8894', '#5a5863'], line: '#22202b' }, above: { kind: 'bricks', size: [0.16, 0.075], colors: ['#fbf7ea', '#fbf7ea', '#ebe8e2'], line: '#bdbac4' } } },
      { shape: { kind: 'cylinder', at: [-0.25, 1.15, -0.25], height: 0.05, r: 0.3 }, paint: '#5e4230' },
      { shape: { kind: 'cylinder', at: [-0.25, 1.2, -0.25], height: 0.34, r: 0.28, rTop: 0.04 }, paint: { kind: 'bands', axis: 'y', size: 0.055, colors: ['#c4483a', '#8c2f2a'] } },
      { shape: { kind: 'sphere', at: [-0.25, 1.56, -0.25], r: 0.035 }, paint: '#ffd84a' },
      { shape: { kind: 'box', at: [-0.25, 0.17, 0.085], half: [0.085, 0.17, 0.035] }, paint: '#5e4230' },
      { shape: { kind: 'box', at: [-0.25, 0.155, 0.1], half: [0.065, 0.155, 0.03] }, paint: { kind: 'bands', axis: 'x', size: 0.035, colors: ['#8a6242', '#5e4230'] } },
      { shape: { kind: 'box', at: [-0.25, 0.66, 0.025], half: [0.065, 0.075, 0.03] }, paint: '#5e4230' },
      { shape: { kind: 'box', at: [-0.25, 0.66, 0.04], half: [0.045, 0.055, 0.025] }, paint: '#3b6fb5' },
      { shape: { kind: 'cone', from: [-0.25, 1.02, -0.05], to: [-0.25, 1.02, 0.19], r: 0.04 }, paint: '#3b2a20' },
      { shape: { kind: 'box', at: [-0.25, 1.02, 0.17], half: [0.022, 0.8, 0.016] }, paint: '#5e4230', bone: 'sails', noShadow: true },
      { shape: { kind: 'box', at: [-0.25, 1.02, 0.17], half: [0.8, 0.022, 0.016] }, paint: '#5e4230', bone: 'sails', noShadow: true },
      { shape: { kind: 'sphere', at: [-0.25, 1.02, 0.18], r: 0.05 }, paint: '#3b2a20', bone: 'sails', noShadow: true },
      { shape: { kind: 'box', at: [-0.15, 1.49, 0.182], half: [0.08, 0.3, 0.012] }, paint: { kind: 'bands', axis: 'y', size: 0.07, colors: ['#fbf7ea', '#bdbac4'] }, bone: 'sails', noShadow: true },
      { shape: { kind: 'box', at: [-0.35, 0.55, 0.182], half: [0.08, 0.3, 0.012] }, paint: { kind: 'bands', axis: 'y', size: 0.07, colors: ['#fbf7ea', '#bdbac4'] }, bone: 'sails', noShadow: true },
      { shape: { kind: 'box', at: [0.22, 0.92, 0.182], half: [0.3, 0.08, 0.012] }, paint: { kind: 'bands', axis: 'x', size: 0.07, colors: ['#fbf7ea', '#bdbac4'] }, bone: 'sails', noShadow: true },
      { shape: { kind: 'box', at: [-0.72, 1.12, 0.182], half: [0.3, 0.08, 0.012] }, paint: { kind: 'bands', axis: 'x', size: 0.07, colors: ['#fbf7ea', '#bdbac4'] }, bone: 'sails', noShadow: true },
    ],
    moves: [
      { kind: 'spin', bone: 'sails', axis: 'z', times: -1, wind: -7 },
    ],
  },
}

/** An apple tree. */
export const APPLE_TREE: PropDoc = {
  name: 'Apple tree',
  foot: [1.2, 0, -0.75],
  doc: {
    name: 'Apple tree',
    loop: 12,
    light: { from: [0.4, 0.8, 0.6], ambient: 0.7, shadow: 0.5 },
    palette: [
      '#22202b', '#3b2a20', '#5e4230', '#8a6242', '#b98d60', '#2f5d34', '#4a8a3c', '#76b04a',
      '#a8d05e', '#b88a2e', '#e0b648', '#f3d977', '#ffd84a', '#5a5863', '#8b8894', '#bdbac4',
      '#ebe8e2', '#fbf7ea', '#8c2f2a', '#c4483a', '#e58fa8', '#2e62a8', '#3b6fb5', '#5fa8e0',
      '#9fd0ee', '#dff1f8',
    ],
    sky: ['#5fa8e0', '#dff1f8'],
    look: { dither: 0.5, glow: 0.5, outline: true, edges: true, steps: true },
    camera: { target: [0, 1.05, 0], distance: 5.4, azimuth: -16, elevation: 12 },
    bones: [
      { name: 'tree0', at: [1.2, 0, -0.75] },
    ],
    parts: [
      { shape: { kind: 'cylinder', at: [1.2, 0, -0.75], height: 0.522, r: 0.05, rTop: 0.035 }, paint: { kind: 'bands', axis: 'y', size: 0.07, colors: ['#5e4230', '#3b2a20'] }, bone: 'tree0' },
      { shape: { kind: 'rough', shape: { kind: 'join', shapes: [{ kind: 'sphere', at: [1.2, 0.684, -0.75], r: 0.285 }, { kind: 'sphere', at: [1.371, 0.57, -0.674], r: 0.19 }, { kind: 'sphere', at: [1.038, 0.589, -0.797], r: 0.199 }] }, by: 0.03, scale: 0.12 }, paint: { kind: 'faces', top: { kind: 'speckle', size: 0.06, colors: ['#76b04a', '#76b04a', '#a8d05e', '#c4483a'] }, side: { kind: 'speckle', size: 0.06, colors: ['#4a8a3c', '#4a8a3c', '#2f5d34', '#c4483a'] }, under: '#2f5d34' }, bone: 'tree0' },
    ],
    moves: [
      { kind: 'sway', bone: 'tree0', axis: 'z', degrees: 2, times: 3, phase: 0, wind: 4 },
    ],
  },
}

/** A big apple tree. */
export const BIG_APPLE_TREE: PropDoc = {
  name: 'Big apple tree',
  foot: [-1.25, 0, -0.8],
  doc: {
    name: 'Big apple tree',
    loop: 12,
    light: { from: [0.4, 0.8, 0.6], ambient: 0.7, shadow: 0.5 },
    palette: [
      '#22202b', '#3b2a20', '#5e4230', '#8a6242', '#b98d60', '#2f5d34', '#4a8a3c', '#76b04a',
      '#a8d05e', '#b88a2e', '#e0b648', '#f3d977', '#ffd84a', '#5a5863', '#8b8894', '#bdbac4',
      '#ebe8e2', '#fbf7ea', '#8c2f2a', '#c4483a', '#e58fa8', '#2e62a8', '#3b6fb5', '#5fa8e0',
      '#9fd0ee', '#dff1f8',
    ],
    sky: ['#5fa8e0', '#dff1f8'],
    look: { dither: 0.5, glow: 0.5, outline: true, edges: true, steps: true },
    camera: { target: [0, 1.05, 0], distance: 5.4, azimuth: -16, elevation: 12 },
    bones: [
      { name: 'tree1', at: [-1.25, 0, -0.8] },
    ],
    parts: [
      { shape: { kind: 'cylinder', at: [-1.25, 0, -0.8], height: 0.632, r: 0.05, rTop: 0.035 }, paint: { kind: 'bands', axis: 'y', size: 0.07, colors: ['#5e4230', '#3b2a20'] }, bone: 'tree1' },
      { shape: { kind: 'rough', shape: { kind: 'join', shapes: [{ kind: 'sphere', at: [-1.25, 0.828, -0.8], r: 0.345 }, { kind: 'sphere', at: [-1.043, 0.69, -0.708], r: 0.23 }, { kind: 'sphere', at: [-1.446, 0.713, -0.858], r: 0.241 }] }, by: 0.03, scale: 0.12 }, paint: { kind: 'faces', top: { kind: 'speckle', size: 0.06, colors: ['#76b04a', '#76b04a', '#a8d05e', '#c4483a'] }, side: { kind: 'speckle', size: 0.06, colors: ['#4a8a3c', '#4a8a3c', '#2f5d34', '#c4483a'] }, under: '#2f5d34' }, bone: 'tree1' },
    ],
    moves: [
      { kind: 'sway', bone: 'tree1', axis: 'z', degrees: 2, times: 4, phase: 0.2, wind: 4 },
    ],
  },
}

/** A small apple tree. */
export const SMALL_APPLE_TREE: PropDoc = {
  name: 'Small apple tree',
  foot: [0.45, 0, -1.25],
  doc: {
    name: 'Small apple tree',
    loop: 12,
    light: { from: [0.4, 0.8, 0.6], ambient: 0.7, shadow: 0.5 },
    palette: [
      '#22202b', '#3b2a20', '#5e4230', '#8a6242', '#b98d60', '#2f5d34', '#4a8a3c', '#76b04a',
      '#a8d05e', '#b88a2e', '#e0b648', '#f3d977', '#ffd84a', '#5a5863', '#8b8894', '#bdbac4',
      '#ebe8e2', '#fbf7ea', '#8c2f2a', '#c4483a', '#e58fa8', '#2e62a8', '#3b6fb5', '#5fa8e0',
      '#9fd0ee', '#dff1f8',
    ],
    sky: ['#5fa8e0', '#dff1f8'],
    look: { dither: 0.5, glow: 0.5, outline: true, edges: true, steps: true },
    camera: { target: [0, 1.05, 0], distance: 5.4, azimuth: -16, elevation: 12 },
    bones: [
      { name: 'tree2', at: [0.45, 0, -1.25] },
    ],
    parts: [
      { shape: { kind: 'cylinder', at: [0.45, 0, -1.25], height: 0.44, r: 0.05, rTop: 0.035 }, paint: { kind: 'bands', axis: 'y', size: 0.07, colors: ['#5e4230', '#3b2a20'] }, bone: 'tree2' },
      { shape: { kind: 'rough', shape: { kind: 'join', shapes: [{ kind: 'sphere', at: [0.45, 0.576, -1.25], r: 0.24 }, { kind: 'sphere', at: [0.594, 0.48, -1.186], r: 0.16 }, { kind: 'sphere', at: [0.314, 0.496, -1.29], r: 0.168 }] }, by: 0.03, scale: 0.12 }, paint: { kind: 'faces', top: { kind: 'speckle', size: 0.06, colors: ['#76b04a', '#76b04a', '#a8d05e', '#c4483a'] }, side: { kind: 'speckle', size: 0.06, colors: ['#4a8a3c', '#4a8a3c', '#2f5d34', '#c4483a'] }, under: '#2f5d34' }, bone: 'tree2' },
    ],
    moves: [
      { kind: 'sway', bone: 'tree2', axis: 'z', degrees: 2, times: 5, phase: 0.4, wind: 4 },
    ],
  },
}

/** A duck that paddles round a pond, leaving a wake. */
export const DUCK: PropDoc = {
  name: 'Duck',
  foot: [-0.9535, -0.062, 0.2],
  water: { rides: [{ bone: 'duck', at: [-1, -0.015, 0.2], size: 0.07 }], wakes: [{ bone: 'duck', at: [-1, 0, 0.2], r: 0.05, draft: 0.008 }] },
  doc: {
    name: 'Duck',
    loop: 12,
    light: { from: [0.4, 0.8, 0.6], ambient: 0.7, shadow: 0.5 },
    palette: [
      '#22202b', '#3b2a20', '#5e4230', '#8a6242', '#b98d60', '#2f5d34', '#4a8a3c', '#76b04a',
      '#a8d05e', '#b88a2e', '#e0b648', '#f3d977', '#ffd84a', '#5a5863', '#8b8894', '#bdbac4',
      '#ebe8e2', '#fbf7ea', '#8c2f2a', '#c4483a', '#e58fa8', '#2e62a8', '#3b6fb5', '#5fa8e0',
      '#9fd0ee', '#dff1f8',
    ],
    sky: ['#5fa8e0', '#dff1f8'],
    look: { dither: 0.5, glow: 0.5, outline: true, edges: true, steps: true },
    camera: { target: [0, 1.05, 0], distance: 5.4, azimuth: -16, elevation: 12 },
    bones: [
      { name: 'duck', at: [-1, -0.005, 0.2] },
    ],
    parts: [
      { shape: { kind: 'join', shapes: [{ kind: 'ball', at: [-1, 0.01, 0.2], r: [0.065, 0.04, 0.045] }, { kind: 'sphere', at: [-0.95, 0.06, 0.2], r: 0.03 }] }, paint: '#fbf7ea', bone: 'duck', noShadow: true },
      { shape: { kind: 'cone', from: [-0.925, 0.055, 0.2], to: [-0.895, 0.05, 0.2], r: 0.014 }, paint: '#ffd84a', bone: 'duck', noShadow: true },
    ],
    moves: [
      { kind: 'spin', bone: 'duck', axis: 'y', times: 1 },
      { kind: 'bob', bone: 'duck', by: [0.12, 0, 0.08], times: 1 },
    ],
  },
}

/** A haystack. */
export const HAYSTACK: PropDoc = {
  name: 'Haystack',
  foot: [0.35, 0, 0.85],
  doc: {
    name: 'Haystack',
    loop: 12,
    light: { from: [0.4, 0.8, 0.6], ambient: 0.7, shadow: 0.5 },
    palette: [
      '#22202b', '#3b2a20', '#5e4230', '#8a6242', '#b98d60', '#2f5d34', '#4a8a3c', '#76b04a',
      '#a8d05e', '#b88a2e', '#e0b648', '#f3d977', '#ffd84a', '#5a5863', '#8b8894', '#bdbac4',
      '#ebe8e2', '#fbf7ea', '#8c2f2a', '#c4483a', '#e58fa8', '#2e62a8', '#3b6fb5', '#5fa8e0',
      '#9fd0ee', '#dff1f8',
    ],
    sky: ['#5fa8e0', '#dff1f8'],
    look: { dither: 0.5, glow: 0.5, outline: true, edges: true, steps: true },
    camera: { target: [0, 1.05, 0], distance: 5.4, azimuth: -16, elevation: 12 },
    parts: [
      { shape: { kind: 'box', at: [0.35, 0.09, 0.85], half: [0.13, 0.09, 0.09], round: 0.04 }, paint: { kind: 'bands', axis: 'x', size: 0.045, colors: ['#e0b648', '#b88a2e', '#f3d977'] } },
    ],
  },
}

/** A grazing sheep. */
export const SHEEP: PropDoc = {
  name: 'Sheep',
  foot: [-0.813, 0, -0.3],
  doc: {
    name: 'Sheep',
    loop: 12,
    light: { from: [0.4, 0.8, 0.6], ambient: 0.7, shadow: 0.5 },
    palette: [
      '#22202b', '#3b2a20', '#5e4230', '#8a6242', '#b98d60', '#2f5d34', '#4a8a3c', '#76b04a',
      '#a8d05e', '#b88a2e', '#e0b648', '#f3d977', '#ffd84a', '#5a5863', '#8b8894', '#bdbac4',
      '#ebe8e2', '#fbf7ea', '#8c2f2a', '#c4483a', '#e58fa8', '#2e62a8', '#3b6fb5', '#5fa8e0',
      '#9fd0ee', '#dff1f8',
    ],
    sky: ['#5fa8e0', '#dff1f8'],
    look: { dither: 0.5, glow: 0.5, outline: true, edges: true, steps: true },
    camera: { target: [0, 1.05, 0], distance: 5.4, azimuth: -16, elevation: 12 },
    bones: [
      { name: 'sheep0', at: [-0.75, 0.16, -0.3] },
    ],
    parts: [
      { shape: { kind: 'rough', shape: { kind: 'ball', at: [-0.85, 0.17, -0.3], r: [0.13, 0.095, 0.09] }, by: 0.015, scale: 0.05 }, paint: { kind: 'faces', top: '#fbf7ea', side: '#fbf7ea', under: '#bdbac4' } },
      { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [-0.92, 0, -0.345], height: 0.1, r: 0.018 }, { kind: 'cylinder', at: [-0.92, 0, -0.255], height: 0.1, r: 0.018 }, { kind: 'cylinder', at: [-0.78, 0, -0.345], height: 0.1, r: 0.018 }, { kind: 'cylinder', at: [-0.78, 0, -0.255], height: 0.1, r: 0.018 }] }, paint: '#22202b' },
      { shape: { kind: 'join', shapes: [{ kind: 'ball', at: [-0.7, 0.2, -0.3], r: [0.05, 0.045, 0.04] }, { kind: 'ball', at: [-0.72, 0.235, -0.26], r: [0.02, 0.012, 0.02] }, { kind: 'ball', at: [-0.72, 0.235, -0.34], r: [0.02, 0.012, 0.02] }] }, paint: '#22202b', bone: 'sheep0' },
    ],
    moves: [
      { kind: 'sway', bone: 'sheep0', axis: 'z', degrees: 14, times: 2, phase: 0 },
    ],
  },
}

/** The pieces above as the library lists them. */
export const FARM_MADE: MadeProp[] = [
  { id: 'windmill-hill', tags: ['grassy', 'farm', 'pond'], kind: 'land', about: 'The green hill the windmill stands on, with its path, fields and pond', prop: WINDMILL_HILL },
  { id: 'windmill', tags: ['building', 'farm'], kind: 'prop', group: 'buildings', about: 'A windmill whose sails turn', prop: WINDMILL },
  { id: 'apple-tree', tags: ['tree', 'leafy', 'farm'], kind: 'prop', about: 'An apple tree', prop: APPLE_TREE },
  { id: 'big-apple-tree', tags: ['tree', 'leafy', 'farm'], kind: 'prop', about: 'A big apple tree', prop: BIG_APPLE_TREE },
  { id: 'small-apple-tree', tags: ['tree', 'leafy', 'farm'], kind: 'prop', about: 'A small apple tree', prop: SMALL_APPLE_TREE },
  { id: 'duck', tags: ['animal', 'floats'], kind: 'prop', group: 'living', about: 'A duck that paddles round a pond, leaving a wake', prop: DUCK },
  { id: 'haystack', tags: ['farm'], kind: 'prop', about: 'A haystack', prop: HAYSTACK },
  { id: 'sheep', tags: ['animal', 'farm'], kind: 'prop', group: 'living', about: 'A grazing sheep', prop: SHEEP },
]

/** Windmill as a land and the props set down on it: what Diorama draws and what Scene Creator opens. */
export const WINDMILL_PROJECT: SceneProject = {
  kind: 'blobscape-project',
  version: 1,
  name: 'Windmill',
  loop: 12,
  land: 'windmill-hill',
  props: [
    { prop: 'windmill', at: [-0.25, 0, -0.184], turn: 0, size: 1 },
    { prop: 'apple-tree', at: [1.2, 0, -0.75], turn: 0, size: 1 },
    { prop: 'big-apple-tree', at: [-1.25, 0, -0.8], turn: 0, size: 1 },
    { prop: 'small-apple-tree', at: [0.45, 0, -1.25], turn: 0, size: 1 },
    { prop: 'duck', at: [-0.9535, -0.062, 0.2], turn: 0, size: 1 },
    { prop: 'haystack', at: [0.35, 0, 0.85], turn: 0, size: 1 },
    { prop: 'haystack', at: [0.2, 0, 1.1], turn: 0, size: 1, phase: 0.22 },
    { prop: 'sheep', at: [-0.813, 0, -0.3], turn: 0, size: 1 },
    { prop: 'sheep', at: [-1.263, 0, -0.1], turn: 0, size: 1, phase: 0.96 },
    { prop: 'sheep', at: [0.587, 0, -0.55], turn: 0, size: 1, phase: 0.33 },
  ],
}
