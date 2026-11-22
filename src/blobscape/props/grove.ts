import type { PropDoc, SceneProject } from '../../splat-engine/project.ts'
import type { MadeProp } from './garden.ts'

/**
 * The lantern grove (Diorama's grove scene) as a land and props (docs/scenes-from-props.md): the snow is the land, and the birches hung with paper lamps and the sleeping fox are library props set down on it, each where it
 * stood in the scene. Its falling snow is the shared snow now (Diorama.weather), and its aurora the shared sky effect (Diorama.skyEffect,
 * splat-engine/skyEffects.ts), not its own.
 * Data only, as a scene description is: see docs/scene-descriptions.md.
 */

/** A round of snow at night with drifts, stones and a frozen puddle. */
export const AURORA_SNOW: PropDoc = {
  name: 'Snow at night',
  foot: [0, 0, 0],
  doc: {
    name: 'Snow at night',
    loop: 12,
    light: { from: [-0.35, 1, 0.6], ambient: 0.5, shadow: 0.45 },
    palette: [
      '#0c1224', '#1c2848', '#34487c', '#6c88b8', '#a8c0dc', '#e4f0f8', '#2c2c3c', '#5c6880',
      '#8c98ac', '#d4dce4', '#e8641c', '#ff9c28', '#ffd870', '#e84838', '#b85420', '#e88838',
      '#f8c890', '#143c34', '#246054', '#38d8a0', '#a0f8d0', '#2cb890',
    ],
    sky: ['#0c1224', '#1c2848'],
    skyReach: 0.8,
    look: { dither: 0.5, glow: 1.15, outline: true, edges: true },
    camera: { target: [0, 1.4, 0], distance: 6.4, azimuth: 14, elevation: 7, swing: 14 },
    air: { haze: { color: '#0c1224', from: 0.5, to: 7 }, mist: [{ at: [0, 0.06, 0.2], half: [1.8, 0.06, 1.2], color: '#34487c', thick: 0.4 }], specks: [] },
    cover: { kind: 'snow', color: '#e4f0f8', amount: 0.3 },
    parts: [
      { shape: { kind: 'rough', shape: { kind: 'cylinder', at: [0, -0.26, 0], height: 0.26, r: 1.75 }, by: 0.04, scale: 0.4 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.25, colors: ['#a8c0dc', '#e4f0f8', '#a8c0dc', '#6c88b8'] }, side: { kind: 'bands', axis: 'y', size: 0.07, colors: ['#34487c', '#1c2848', '#0c1224'] } } },
      { shape: { kind: 'ball', at: [-0.9, 0, 0.9], r: [0.4, 0.12, 0.3] }, paint: { kind: 'faces', top: '#e4f0f8', side: '#a8c0dc' }, noShadow: true },
      { shape: { kind: 'ball', at: [1.1, 0, 0.6], r: [0.36, 0.1, 0.3] }, paint: { kind: 'faces', top: '#e4f0f8', side: '#a8c0dc' }, noShadow: true },
      { shape: { kind: 'ball', at: [0.2, 0, -1.2], r: [0.5, 0.14, 0.3] }, paint: { kind: 'faces', top: '#e4f0f8', side: '#a8c0dc' }, noShadow: true },
      { shape: { kind: 'ball', at: [-1.3, 0, -0.3], r: [0.3, 0.1, 0.3] }, paint: { kind: 'faces', top: '#e4f0f8', side: '#a8c0dc' }, noShadow: true },
      { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [1.35, 0.105, 0.75], height: 0.252, r: 0.238, rTop: 0.035 }, { kind: 'cylinder', at: [1.35, 0.287, 0.75], height: 0.252, r: 0.182, rTop: 0.035 }, { kind: 'cylinder', at: [1.35, 0.469, 0.75], height: 0.252, r: 0.126, rTop: 0.035 }] }, paint: { kind: 'faces', top: '#e4f0f8', side: { kind: 'speckle', size: 0.05, colors: ['#246054', '#143c34', '#246054', '#a8c0dc'] }, under: '#143c34' } },
      { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [-1.45, 0.12, -0.75], height: 0.288, r: 0.272, rTop: 0.04 }, { kind: 'cylinder', at: [-1.45, 0.328, -0.75], height: 0.288, r: 0.208, rTop: 0.04 }, { kind: 'cylinder', at: [-1.45, 0.536, -0.75], height: 0.288, r: 0.144, rTop: 0.04 }] }, paint: { kind: 'faces', top: '#e4f0f8', side: { kind: 'speckle', size: 0.05, colors: ['#246054', '#143c34', '#246054', '#a8c0dc'] }, under: '#143c34' } },
      { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [1.45, 0.09, -0.8], height: 0.216, r: 0.204, rTop: 0.03 }, { kind: 'cylinder', at: [1.45, 0.246, -0.8], height: 0.216, r: 0.156, rTop: 0.03 }, { kind: 'cylinder', at: [1.45, 0.402, -0.8], height: 0.216, r: 0.108, rTop: 0.03 }] }, paint: { kind: 'faces', top: '#e4f0f8', side: { kind: 'speckle', size: 0.05, colors: ['#246054', '#143c34', '#246054', '#a8c0dc'] }, under: '#143c34' } },
      { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [-0.35, 0.068, 1.25], height: 0.162, r: 0.153, rTop: 0.023 }, { kind: 'cylinder', at: [-0.35, 0.185, 1.25], height: 0.162, r: 0.117, rTop: 0.023 }, { kind: 'cylinder', at: [-0.35, 0.302, 1.25], height: 0.162, r: 0.081, rTop: 0.023 }] }, paint: { kind: 'faces', top: '#e4f0f8', side: { kind: 'speckle', size: 0.05, colors: ['#246054', '#143c34', '#246054', '#a8c0dc'] }, under: '#143c34' } },
      { shape: { kind: 'join', shapes: [{ kind: 'ball', at: [-1.3, 0.012, 1.05], r: [0.035, 0.012, 0.028] }, { kind: 'ball', at: [-1.1, 0.012, 1.02], r: [0.035, 0.012, 0.028] }, { kind: 'ball', at: [-0.9, 0.012, 0.91], r: [0.035, 0.012, 0.028] }, { kind: 'ball', at: [-0.7, 0.012, 0.88], r: [0.035, 0.012, 0.028] }, { kind: 'ball', at: [-0.5, 0.012, 0.77], r: [0.035, 0.012, 0.028] }, { kind: 'ball', at: [-0.3, 0.012, 0.74], r: [0.035, 0.012, 0.028] }, { kind: 'ball', at: [-0.1, 0.012, 0.63], r: [0.035, 0.012, 0.028] }, { kind: 'ball', at: [0.1, 0.012, 0.6], r: [0.035, 0.012, 0.028] }] }, paint: '#6c88b8', noShadow: true },
    ],
  },
}

/** A snowy birch with a face lit from inside like a lantern, hung with two paper lamps, swaying. */
export const LANTERN_BIRCH: PropDoc = {
  name: 'Lantern birch',
  foot: [-0.15, -0.29, -0.232],
  doc: {
    name: 'Lantern birch',
    loop: 12,
    light: { from: [-0.35, 1, 0.6], ambient: 0.5, shadow: 0.45 },
    palette: [
      '#0c1224', '#1c2848', '#34487c', '#6c88b8', '#a8c0dc', '#e4f0f8', '#2c2c3c', '#5c6880',
      '#8c98ac', '#d4dce4', '#e8641c', '#ff9c28', '#ffd870', '#e84838', '#b85420', '#e88838',
      '#f8c890', '#143c34', '#246054', '#38d8a0', '#a0f8d0', '#2cb890',
    ],
    sky: ['#0c1224', '#1c2848'],
    skyReach: 0.8,
    look: { dither: 0.5, glow: 1.15, outline: true, edges: true },
    camera: { target: [0, 1.4, 0], distance: 6.4, azimuth: 14, elevation: 7, swing: 14 },
    bones: [
      { name: 'tree0', at: [-0.15, 0, -0.25] },
      { name: 'tree0in', at: [-0.15, 0, -0.25], parent: 'tree0' },
      { name: 'lamp0', at: [-0.94, 2.432, -0.28], parent: 'tree0' },
      { name: 'lamp1', at: [0.64, 2.739, -0.12], parent: 'tree0' },
    ],
    parts: [
      { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [-0.15, -0.03, -0.25], to: [-0.115, 1.595, -0.25], r: 0.26, rTo: 0.208 }, { kind: 'cone', from: [-0.115, 1.595, -0.25], to: [-0.05, 2.9, -0.25], r: 0.208, rTo: 0.078 }] }, paint: { kind: 'faces', top: '#e4f0f8', side: { kind: 'bands', axis: 'y', size: 0.11, colors: ['#d4dce4', '#d4dce4', '#8c98ac', '#d4dce4', '#2c2c3c'] }, under: '#8c98ac' }, bone: 'tree0', strokes: 0.6 },
      { shape: { kind: 'cone', from: [-0.15, 0.1, -0.25], to: [-0.115, 1.595, -0.25], r: 0.182, rTo: 0.143 }, paint: '#2c2c3c', bone: 'tree0in', noShadow: true },
      { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [-0.115, 1.682, -0.25], to: [-0.61, 1.944, -0.33], r: 0.088, rTo: 0.057 }, { kind: 'cone', from: [-0.61, 1.944, -0.33], to: [-0.94, 2.432, -0.28], r: 0.057, rTo: 0.014 }, { kind: 'cone', from: [-0.61, 1.944, -0.33], to: [-0.79, 2.394, -0.43], r: 0.042, rTo: 0.012 }, { kind: 'cone', from: [-0.11, 1.914, -0.25], to: [0.34, 2.203, -0.17], r: 0.088, rTo: 0.057 }, { kind: 'cone', from: [0.34, 2.203, -0.17], to: [0.64, 2.739, -0.12], r: 0.057, rTo: 0.014 }, { kind: 'cone', from: [0.34, 2.203, -0.17], to: [0.52, 2.653, -0.27], r: 0.042, rTo: 0.012 }, { kind: 'cone', from: [-0.101, 2.378, -0.25], to: [-0.371, 2.562, -0.33], r: 0.088, rTo: 0.057 }, { kind: 'cone', from: [-0.371, 2.562, -0.33], to: [-0.551, 2.903, -0.28], r: 0.057, rTo: 0.014 }, { kind: 'cone', from: [-0.371, 2.562, -0.33], to: [-0.551, 3.012, -0.43], r: 0.042, rTo: 0.012 }, { kind: 'cone', from: [-0.097, 2.552, -0.25], to: [0.128, 2.71, -0.17], r: 0.088, rTo: 0.057 }, { kind: 'cone', from: [0.128, 2.71, -0.17], to: [0.278, 3.002, -0.12], r: 0.057, rTo: 0.014 }, { kind: 'cone', from: [0.128, 2.71, -0.17], to: [0.308, 3.16, -0.27], r: 0.042, rTo: 0.012 }] }, paint: { kind: 'bands', axis: 'y', size: 0.1, colors: ['#d4dce4', '#8c98ac', '#d4dce4', '#2c2c3c'] }, bone: 'tree0', noShadow: true },
      { shape: { kind: 'ball', at: [-0.05, 2.92, -0.25], r: [0.13, 0.04, 0.13] }, paint: '#e4f0f8', bone: 'tree0', noShadow: true },
      { shape: { kind: 'ball', at: [-0.26, 1.194, -0.026], r: [0.063, 0.098, 0.04] }, paint: '#ff9c28', bone: 'tree0', glow: true, lit: 'dark', noShadow: true },
      { shape: { kind: 'ball', at: [0, 1.194, -0.026], r: [0.063, 0.098, 0.04] }, paint: '#ff9c28', bone: 'tree0', glow: true, lit: 'dark', noShadow: true },
      { shape: { kind: 'join', shapes: [{ kind: 'ball', at: [-0.282, 0.919, -0.026], r: [0.075, 0.053, 0.04] }, { kind: 'ball', at: [-0.207, 0.906, -0.026], r: [0.075, 0.053, 0.04] }, { kind: 'ball', at: [-0.132, 0.894, -0.026], r: [0.075, 0.053, 0.04] }, { kind: 'ball', at: [-0.057, 0.906, -0.026], r: [0.075, 0.053, 0.04] }, { kind: 'ball', at: [0.018, 0.919, -0.026], r: [0.075, 0.053, 0.04] }] }, paint: '#e8641c', bone: 'tree0', glow: true, lit: 'dark', noShadow: true },
      { shape: { kind: 'cone', from: [-0.94, 2.432, -0.28], to: [-0.94, 2.272, -0.28], r: 0.007 }, paint: '#2c2c3c', bone: 'lamp0', noShadow: true },
      { shape: { kind: 'ball', at: [-0.94, 2.192, -0.28], r: [0.06, 0.08, 0.06] }, paint: '#e84838', bone: 'lamp0', glow: true, lit: 'dark', noShadow: true },
      { shape: { kind: 'cylinder', at: [-0.94, 2.262, -0.28], height: 0.02, r: 0.035 }, paint: '#2c2c3c', bone: 'lamp0', noShadow: true },
      { shape: { kind: 'cone', from: [0.64, 2.739, -0.12], to: [0.64, 2.519, -0.12], r: 0.007 }, paint: '#2c2c3c', bone: 'lamp1', noShadow: true },
      { shape: { kind: 'ball', at: [0.64, 2.439, -0.12], r: [0.06, 0.08, 0.06] }, paint: '#ff9c28', bone: 'lamp1', glow: true, lit: 'dark', noShadow: true },
      { shape: { kind: 'cylinder', at: [0.64, 2.509, -0.12], height: 0.02, r: 0.035 }, paint: '#2c2c3c', bone: 'lamp1', noShadow: true },
    ],
    moves: [
      { kind: 'sway', bone: 'tree0', axis: 'z', degrees: 1.4, times: 2, phase: 0, wind: 3 },
      { kind: 'sway', bone: 'lamp0', axis: 'z', degrees: 9, times: 2, phase: 0, wind: 10 },
      { kind: 'sway', bone: 'lamp1', axis: 'z', degrees: 9, times: 3, phase: 0.17, wind: 10 },
    ],
    lights: [
      { at: [-0.1, 1.05, 0.5], color: '#ff9c28', strength: 1.8, range: 1.8, lit: 'dark', flicker: { by: 0.15, times: 5 } },
    ],
  },
}

/** A shorter snowy birch with a face lit from inside like a lantern, hung with two paper lamps, swaying. */
export const LANTERN_BIRCH_SHORT: PropDoc = {
  name: 'Lantern birch 2',
  foot: [-1.22, -0.2, 0.189],
  doc: {
    name: 'Lantern birch 2',
    loop: 12,
    light: { from: [-0.35, 1, 0.6], ambient: 0.5, shadow: 0.45 },
    palette: [
      '#0c1224', '#1c2848', '#34487c', '#6c88b8', '#a8c0dc', '#e4f0f8', '#2c2c3c', '#5c6880',
      '#8c98ac', '#d4dce4', '#e8641c', '#ff9c28', '#ffd870', '#e84838', '#b85420', '#e88838',
      '#f8c890', '#143c34', '#246054', '#38d8a0', '#a0f8d0', '#2cb890',
    ],
    sky: ['#0c1224', '#1c2848'],
    skyReach: 0.8,
    look: { dither: 0.5, glow: 1.15, outline: true, edges: true },
    camera: { target: [0, 1.4, 0], distance: 6.4, azimuth: 14, elevation: 7, swing: 14 },
    bones: [
      { name: 'tree1', at: [-1.15, 0, 0.2] },
      { name: 'tree1in', at: [-1.15, 0, 0.2], parent: 'tree1' },
      { name: 'lamp2', at: [-1.742, 1.718, 0.17], parent: 'tree1' },
      { name: 'lamp3', at: [-0.698, 1.936, 0.33], parent: 'tree1' },
    ],
    parts: [
      { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [-1.15, -0.03, 0.2], to: [-1.192, 1.155, 0.2], r: 0.17, rTo: 0.136 }, { kind: 'cone', from: [-1.192, 1.155, 0.2], to: [-1.27, 2.1, 0.2], r: 0.136, rTo: 0.051 }] }, paint: { kind: 'faces', top: '#e4f0f8', side: { kind: 'bands', axis: 'y', size: 0.11, colors: ['#d4dce4', '#d4dce4', '#8c98ac', '#d4dce4', '#2c2c3c'] }, under: '#8c98ac' }, bone: 'tree1', strokes: 0.6 },
      { shape: { kind: 'cone', from: [-1.15, 0.1, 0.2], to: [-1.192, 1.155, 0.2], r: 0.119, rTo: 0.094 }, paint: '#2c2c3c', bone: 'tree1in', noShadow: true },
      { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [-1.192, 1.218, 0.2], to: [-1.522, 1.393, 0.12], r: 0.058, rTo: 0.037 }, { kind: 'cone', from: [-1.522, 1.393, 0.12], to: [-1.742, 1.718, 0.17], r: 0.037, rTo: 0.014 }, { kind: 'cone', from: [-1.522, 1.393, 0.12], to: [-1.642, 1.693, 0.02], r: 0.027, rTo: 0.012 }, { kind: 'cone', from: [-1.198, 1.386, 0.2], to: [-0.898, 1.579, 0.28], r: 0.058, rTo: 0.037 }, { kind: 'cone', from: [-0.898, 1.579, 0.28], to: [-0.698, 1.936, 0.33], r: 0.037, rTo: 0.014 }, { kind: 'cone', from: [-0.898, 1.579, 0.28], to: [-0.778, 1.879, 0.18], r: 0.027, rTo: 0.012 }, { kind: 'cone', from: [-1.209, 1.722, 0.2], to: [-1.389, 1.845, 0.12], r: 0.058, rTo: 0.037 }, { kind: 'cone', from: [-1.389, 1.845, 0.12], to: [-1.509, 2.072, 0.17], r: 0.037, rTo: 0.014 }, { kind: 'cone', from: [-1.389, 1.845, 0.12], to: [-1.509, 2.144, 0.02], r: 0.027, rTo: 0.012 }, { kind: 'cone', from: [-1.213, 1.848, 0.2], to: [-1.063, 1.953, 0.28], r: 0.058, rTo: 0.037 }, { kind: 'cone', from: [-1.063, 1.953, 0.28], to: [-0.963, 2.148, 0.33], r: 0.037, rTo: 0.014 }, { kind: 'cone', from: [-1.063, 1.953, 0.28], to: [-0.943, 2.253, 0.18], r: 0.027, rTo: 0.012 }] }, paint: { kind: 'bands', axis: 'y', size: 0.1, colors: ['#d4dce4', '#8c98ac', '#d4dce4', '#2c2c3c'] }, bone: 'tree1', noShadow: true },
      { shape: { kind: 'ball', at: [-1.27, 2.12, 0.2], r: [0.085, 0.04, 0.085] }, paint: '#e4f0f8', bone: 'tree1', noShadow: true },
      { shape: { kind: 'ball', at: [-1.259, 0.856, 0.346], r: [0.042, 0.065, 0.04] }, paint: '#ff9c28', bone: 'tree1', glow: true, lit: 'dark', noShadow: true },
      { shape: { kind: 'ball', at: [-1.089, 0.856, 0.346], r: [0.042, 0.065, 0.04] }, paint: '#ff9c28', bone: 'tree1', glow: true, lit: 'dark', noShadow: true },
      { shape: { kind: 'join', shapes: [{ kind: 'ball', at: [-1.272, 0.681, 0.346], r: [0.05, 0.035, 0.04] }, { kind: 'ball', at: [-1.222, 0.668, 0.346], r: [0.05, 0.035, 0.04] }, { kind: 'ball', at: [-1.172, 0.656, 0.346], r: [0.05, 0.035, 0.04] }, { kind: 'ball', at: [-1.122, 0.668, 0.346], r: [0.05, 0.035, 0.04] }, { kind: 'ball', at: [-1.072, 0.681, 0.346], r: [0.05, 0.035, 0.04] }] }, paint: '#e8641c', bone: 'tree1', glow: true, lit: 'dark', noShadow: true },
      { shape: { kind: 'cone', from: [-1.742, 1.718, 0.17], to: [-1.742, 1.438, 0.17], r: 0.007 }, paint: '#2c2c3c', bone: 'lamp2', noShadow: true },
      { shape: { kind: 'ball', at: [-1.742, 1.358, 0.17], r: [0.06, 0.08, 0.06] }, paint: '#ffd870', bone: 'lamp2', glow: true, lit: 'dark', noShadow: true },
      { shape: { kind: 'cylinder', at: [-1.742, 1.428, 0.17], height: 0.02, r: 0.035 }, paint: '#2c2c3c', bone: 'lamp2', noShadow: true },
      { shape: { kind: 'cone', from: [-0.698, 1.936, 0.33], to: [-0.698, 1.776, 0.33], r: 0.007 }, paint: '#2c2c3c', bone: 'lamp3', noShadow: true },
      { shape: { kind: 'ball', at: [-0.698, 1.696, 0.33], r: [0.06, 0.08, 0.06] }, paint: '#e84838', bone: 'lamp3', glow: true, lit: 'dark', noShadow: true },
      { shape: { kind: 'cylinder', at: [-0.698, 1.766, 0.33], height: 0.02, r: 0.035 }, paint: '#2c2c3c', bone: 'lamp3', noShadow: true },
    ],
    moves: [
      { kind: 'sway', bone: 'tree1', axis: 'z', degrees: 1.4, times: 3, phase: 0.21, wind: 3 },
      { kind: 'sway', bone: 'lamp2', axis: 'z', degrees: 9, times: 2, phase: 0.34, wind: 10 },
      { kind: 'sway', bone: 'lamp3', axis: 'z', degrees: 9, times: 3, phase: 0.51, wind: 10 },
    ],
    lights: [
      { at: [-1.15, 0.8, 0.7], color: '#ff9c28', strength: 1.4, range: 1.3, lit: 'dark', flicker: { by: 0.15, times: 7 } },
    ],
  },
}

/** A snowy birch of middle height with a face lit from inside like a lantern, hung with two paper lamps, swaying. */
export const LANTERN_BIRCH_MID: PropDoc = {
  name: 'Lantern birch 3',
  foot: [1.0745, -0.22, -0.1025],
  doc: {
    name: 'Lantern birch 3',
    loop: 12,
    light: { from: [-0.35, 1, 0.6], ambient: 0.5, shadow: 0.45 },
    palette: [
      '#0c1224', '#1c2848', '#34487c', '#6c88b8', '#a8c0dc', '#e4f0f8', '#2c2c3c', '#5c6880',
      '#8c98ac', '#d4dce4', '#e8641c', '#ff9c28', '#ffd870', '#e84838', '#b85420', '#e88838',
      '#f8c890', '#143c34', '#246054', '#38d8a0', '#a0f8d0', '#2cb890',
    ],
    sky: ['#0c1224', '#1c2848'],
    skyReach: 0.8,
    look: { dither: 0.5, glow: 1.15, outline: true, edges: true },
    camera: { target: [0, 1.4, 0], distance: 6.4, azimuth: 14, elevation: 7, swing: 14 },
    bones: [
      { name: 'tree2', at: [1.05, 0, -0.1] },
      { name: 'tree2in', at: [1.05, 0, -0.1], parent: 'tree2' },
      { name: 'lamp4', at: [0.494, 1.884, -0.13], parent: 'tree2' },
      { name: 'lamp5', at: [1.655, 2.123, 0.03], parent: 'tree2' },
    ],
    parts: [
      { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [1.05, -0.03, -0.1], to: [1.099, 1.265, -0.1], r: 0.19, rTo: 0.152 }, { kind: 'cone', from: [1.099, 1.265, -0.1], to: [1.19, 2.3, -0.1], r: 0.152, rTo: 0.057 }] }, paint: { kind: 'faces', top: '#e4f0f8', side: { kind: 'bands', axis: 'y', size: 0.11, colors: ['#d4dce4', '#d4dce4', '#8c98ac', '#d4dce4', '#2c2c3c'] }, under: '#8c98ac' }, bone: 'tree2', strokes: 0.6 },
      { shape: { kind: 'cone', from: [1.05, 0.1, -0.1], to: [1.099, 1.265, -0.1], r: 0.133, rTo: 0.105 }, paint: '#2c2c3c', bone: 'tree2in', noShadow: true },
      { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [1.099, 1.334, -0.1], to: [0.736, 1.526, -0.18], r: 0.065, rTo: 0.042 }, { kind: 'cone', from: [0.736, 1.526, -0.18], to: [0.494, 1.884, -0.13], r: 0.042, rTo: 0.014 }, { kind: 'cone', from: [0.736, 1.526, -0.18], to: [0.604, 1.857, -0.28], r: 0.03, rTo: 0.012 }, { kind: 'cone', from: [1.105, 1.518, -0.1], to: [1.435, 1.73, -0.02], r: 0.065, rTo: 0.042 }, { kind: 'cone', from: [1.435, 1.73, -0.02], to: [1.655, 2.123, 0.03], r: 0.042, rTo: 0.014 }, { kind: 'cone', from: [1.435, 1.73, -0.02], to: [1.567, 2.06, -0.12], r: 0.03, rTo: 0.012 }, { kind: 'cone', from: [1.119, 1.886, -0.1], to: [0.921, 2.021, -0.18], r: 0.065, rTo: 0.042 }, { kind: 'cone', from: [0.921, 2.021, -0.18], to: [0.789, 2.271, -0.13], r: 0.042, rTo: 0.014 }, { kind: 'cone', from: [0.921, 2.021, -0.18], to: [0.789, 2.351, -0.28], r: 0.03, rTo: 0.012 }, { kind: 'cone', from: [1.124, 2.024, -0.1], to: [1.289, 2.139, -0.02], r: 0.065, rTo: 0.042 }, { kind: 'cone', from: [1.289, 2.139, -0.02], to: [1.399, 2.354, 0.03], r: 0.042, rTo: 0.014 }, { kind: 'cone', from: [1.289, 2.139, -0.02], to: [1.421, 2.47, -0.12], r: 0.03, rTo: 0.012 }] }, paint: { kind: 'bands', axis: 'y', size: 0.1, colors: ['#d4dce4', '#8c98ac', '#d4dce4', '#2c2c3c'] }, bone: 'tree2', noShadow: true },
      { shape: { kind: 'ball', at: [1.19, 2.32, -0.1], r: [0.095, 0.04, 0.095] }, paint: '#e4f0f8', bone: 'tree2', noShadow: true },
      { shape: { kind: 'ball', at: [0.983, 0.938, 0.063], r: [0.046, 0.072, 0.04] }, paint: '#ff9c28', bone: 'tree2', glow: true, lit: 'dark', noShadow: true },
      { shape: { kind: 'ball', at: [1.173, 0.938, 0.063], r: [0.046, 0.072, 0.04] }, paint: '#ff9c28', bone: 'tree2', glow: true, lit: 'dark', noShadow: true },
      { shape: { kind: 'join', shapes: [{ kind: 'ball', at: [0.965, 0.743, 0.063], r: [0.055, 0.039, 0.04] }, { kind: 'ball', at: [1.02, 0.73, 0.063], r: [0.055, 0.039, 0.04] }, { kind: 'ball', at: [1.075, 0.718, 0.063], r: [0.055, 0.039, 0.04] }, { kind: 'ball', at: [1.13, 0.73, 0.063], r: [0.055, 0.039, 0.04] }, { kind: 'ball', at: [1.185, 0.743, 0.063], r: [0.055, 0.039, 0.04] }] }, paint: '#e8641c', bone: 'tree2', glow: true, lit: 'dark', noShadow: true },
      { shape: { kind: 'cone', from: [0.494, 1.884, -0.13], to: [0.494, 1.664, -0.13], r: 0.007 }, paint: '#2c2c3c', bone: 'lamp4', noShadow: true },
      { shape: { kind: 'ball', at: [0.494, 1.584, -0.13], r: [0.06, 0.08, 0.06] }, paint: '#ff9c28', bone: 'lamp4', glow: true, lit: 'dark', noShadow: true },
      { shape: { kind: 'cylinder', at: [0.494, 1.654, -0.13], height: 0.02, r: 0.035 }, paint: '#2c2c3c', bone: 'lamp4', noShadow: true },
      { shape: { kind: 'cone', from: [1.655, 2.123, 0.03], to: [1.655, 1.843, 0.03], r: 0.007 }, paint: '#2c2c3c', bone: 'lamp5', noShadow: true },
      { shape: { kind: 'ball', at: [1.655, 1.763, 0.03], r: [0.06, 0.08, 0.06] }, paint: '#ffd870', bone: 'lamp5', glow: true, lit: 'dark', noShadow: true },
      { shape: { kind: 'cylinder', at: [1.655, 1.833, 0.03], height: 0.02, r: 0.035 }, paint: '#2c2c3c', bone: 'lamp5', noShadow: true },
    ],
    moves: [
      { kind: 'sway', bone: 'tree2', axis: 'z', degrees: 1.4, times: 2, phase: 0.42, wind: 3 },
      { kind: 'sway', bone: 'lamp4', axis: 'z', degrees: 9, times: 2, phase: 0.68, wind: 10 },
      { kind: 'sway', bone: 'lamp5', axis: 'z', degrees: 9, times: 3, phase: 0.85, wind: 10 },
    ],
    lights: [
      { at: [1.1, 0.85, 0.5], color: '#ff9c28', strength: 1.4, range: 1.3, lit: 'dark', flicker: { by: 0.15, times: 6 } },
    ],
  },
}

/** A bare birch with snow on its crown, hung with two paper lamps, swaying. */
export const SNOWY_BIRCH: PropDoc = {
  name: 'Snowy birch',
  foot: [0.7475, -0.17, -1.119],
  doc: {
    name: 'Snowy birch',
    loop: 12,
    light: { from: [-0.35, 1, 0.6], ambient: 0.5, shadow: 0.45 },
    palette: [
      '#0c1224', '#1c2848', '#34487c', '#6c88b8', '#a8c0dc', '#e4f0f8', '#2c2c3c', '#5c6880',
      '#8c98ac', '#d4dce4', '#e8641c', '#ff9c28', '#ffd870', '#e84838', '#b85420', '#e88838',
      '#f8c890', '#143c34', '#246054', '#38d8a0', '#a0f8d0', '#2cb890',
    ],
    sky: ['#0c1224', '#1c2848'],
    skyReach: 0.8,
    look: { dither: 0.5, glow: 1.15, outline: true, edges: true },
    camera: { target: [0, 1.4, 0], distance: 6.4, azimuth: 14, elevation: 7, swing: 14 },
    bones: [
      { name: 'tree3', at: [0.75, 0, -1.1] },
      { name: 'tree3in', at: [0.75, 0, -1.1], parent: 'tree3' },
      { name: 'lamp6', at: [0.3, 1.527, -1.13], parent: 'tree3' },
      { name: 'lamp7', at: [1.195, 1.721, -0.97], parent: 'tree3' },
    ],
    parts: [
      { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [0.75, -0.03, -1.1], to: [0.767, 1.045, -1.1], r: 0.14, rTo: 0.112 }, { kind: 'cone', from: [0.767, 1.045, -1.1], to: [0.8, 1.9, -1.1], r: 0.112, rTo: 0.042 }] }, paint: { kind: 'faces', top: '#e4f0f8', side: { kind: 'bands', axis: 'y', size: 0.11, colors: ['#d4dce4', '#d4dce4', '#8c98ac', '#d4dce4', '#2c2c3c'] }, under: '#8c98ac' }, bone: 'tree3', strokes: 0.6 },
      { shape: { kind: 'cone', from: [0.75, 0.1, -1.1], to: [0.767, 1.045, -1.1], r: 0.098, rTo: 0.077 }, paint: '#2c2c3c', bone: 'tree3in', noShadow: true },
      { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [0.767, 1.102, -1.1], to: [0.487, 1.251, -1.18], r: 0.048, rTo: 0.031 }, { kind: 'cone', from: [0.487, 1.251, -1.18], to: [0.3, 1.527, -1.13], r: 0.031, rTo: 0.014 }, { kind: 'cone', from: [0.487, 1.251, -1.18], to: [0.385, 1.506, -1.28], r: 0.022, rTo: 0.012 }, { kind: 'cone', from: [0.77, 1.254, -1.1], to: [1.025, 1.418, -1.02], r: 0.048, rTo: 0.031 }, { kind: 'cone', from: [1.025, 1.418, -1.02], to: [1.195, 1.721, -0.97], r: 0.031, rTo: 0.014 }, { kind: 'cone', from: [1.025, 1.418, -1.02], to: [1.127, 1.673, -1.12], r: 0.022, rTo: 0.012 }, { kind: 'cone', from: [0.775, 1.558, -1.1], to: [0.622, 1.662, -1.18], r: 0.048, rTo: 0.031 }, { kind: 'cone', from: [0.622, 1.662, -1.18], to: [0.52, 1.855, -1.13], r: 0.031, rTo: 0.014 }, { kind: 'cone', from: [0.622, 1.662, -1.18], to: [0.52, 1.917, -1.28], r: 0.022, rTo: 0.012 }, { kind: 'cone', from: [0.776, 1.672, -1.1], to: [0.904, 1.761, -1.02], r: 0.048, rTo: 0.031 }, { kind: 'cone', from: [0.904, 1.761, -1.02], to: [0.989, 1.927, -0.97], r: 0.031, rTo: 0.014 }, { kind: 'cone', from: [0.904, 1.761, -1.02], to: [1.006, 2.016, -1.12], r: 0.022, rTo: 0.012 }] }, paint: { kind: 'bands', axis: 'y', size: 0.1, colors: ['#d4dce4', '#8c98ac', '#d4dce4', '#2c2c3c'] }, bone: 'tree3', noShadow: true },
      { shape: { kind: 'ball', at: [0.8, 1.92, -1.1], r: [0.07, 0.04, 0.07] }, paint: '#e4f0f8', bone: 'tree3', noShadow: true },
      { shape: { kind: 'cone', from: [0.3, 1.527, -1.13], to: [0.3, 1.367, -1.13], r: 0.007 }, paint: '#2c2c3c', bone: 'lamp6', noShadow: true },
      { shape: { kind: 'ball', at: [0.3, 1.287, -1.13], r: [0.06, 0.08, 0.06] }, paint: '#e84838', bone: 'lamp6', glow: true, lit: 'dark', noShadow: true },
      { shape: { kind: 'cylinder', at: [0.3, 1.357, -1.13], height: 0.02, r: 0.035 }, paint: '#2c2c3c', bone: 'lamp6', noShadow: true },
      { shape: { kind: 'cone', from: [1.195, 1.721, -0.97], to: [1.195, 1.501, -0.97], r: 0.007 }, paint: '#2c2c3c', bone: 'lamp7', noShadow: true },
      { shape: { kind: 'ball', at: [1.195, 1.421, -0.97], r: [0.06, 0.08, 0.06] }, paint: '#ff9c28', bone: 'lamp7', glow: true, lit: 'dark', noShadow: true },
      { shape: { kind: 'cylinder', at: [1.195, 1.491, -0.97], height: 0.02, r: 0.035 }, paint: '#2c2c3c', bone: 'lamp7', noShadow: true },
    ],
    moves: [
      { kind: 'sway', bone: 'tree3', axis: 'z', degrees: 1.4, times: 3, phase: 0.63, wind: 3 },
      { kind: 'sway', bone: 'lamp6', axis: 'z', degrees: 9, times: 2, phase: 0.02, wind: 10 },
      { kind: 'sway', bone: 'lamp7', axis: 'z', degrees: 9, times: 3, phase: 0.19, wind: 10 },
    ],
  },
}

/** A taller bare birch with snow on its crown, swaying. */
export const SNOWY_BIRCH_TALL: PropDoc = {
  name: 'Snowy birch 2',
  foot: [-0.895, -0.18, -1.075],
  doc: {
    name: 'Snowy birch 2',
    loop: 12,
    light: { from: [-0.35, 1, 0.6], ambient: 0.5, shadow: 0.45 },
    palette: [
      '#0c1224', '#1c2848', '#34487c', '#6c88b8', '#a8c0dc', '#e4f0f8', '#2c2c3c', '#5c6880',
      '#8c98ac', '#d4dce4', '#e8641c', '#ff9c28', '#ffd870', '#e84838', '#b85420', '#e88838',
      '#f8c890', '#143c34', '#246054', '#38d8a0', '#a0f8d0', '#2cb890',
    ],
    sky: ['#0c1224', '#1c2848'],
    skyReach: 0.8,
    look: { dither: 0.5, glow: 1.15, outline: true, edges: true },
    camera: { target: [0, 1.4, 0], distance: 6.4, azimuth: 14, elevation: 7, swing: 14 },
    bones: [
      { name: 'tree4', at: [-0.85, 0, -1.05] },
      { name: 'tree4in', at: [-0.85, 0, -1.05], parent: 'tree4' },
    ],
    parts: [
      { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [-0.85, -0.03, -1.05], to: [-0.871, 1.1, -1.05], r: 0.15, rTo: 0.12 }, { kind: 'cone', from: [-0.871, 1.1, -1.05], to: [-0.91, 2, -1.05], r: 0.12, rTo: 0.045 }] }, paint: { kind: 'faces', top: '#e4f0f8', side: { kind: 'bands', axis: 'y', size: 0.11, colors: ['#d4dce4', '#d4dce4', '#8c98ac', '#d4dce4', '#2c2c3c'] }, under: '#8c98ac' }, bone: 'tree4', strokes: 0.6 },
      { shape: { kind: 'cone', from: [-0.85, 0.1, -1.05], to: [-0.871, 1.1, -1.05], r: 0.105, rTo: 0.083 }, paint: '#2c2c3c', bone: 'tree4in', noShadow: true },
      { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [-0.871, 1.16, -1.05], to: [-1.168, 1.317, -1.13], r: 0.051, rTo: 0.033 }, { kind: 'cone', from: [-1.168, 1.317, -1.13], to: [-1.366, 1.61, -1.08], r: 0.033, rTo: 0.014 }, { kind: 'cone', from: [-1.168, 1.317, -1.13], to: [-1.276, 1.587, -1.23], r: 0.024, rTo: 0.012 }, { kind: 'cone', from: [-0.874, 1.32, -1.05], to: [-0.604, 1.493, -0.97], r: 0.051, rTo: 0.033 }, { kind: 'cone', from: [-0.604, 1.493, -0.97], to: [-0.424, 1.815, -0.92], r: 0.033, rTo: 0.014 }, { kind: 'cone', from: [-0.604, 1.493, -0.97], to: [-0.496, 1.763, -1.07], r: 0.024, rTo: 0.012 }, { kind: 'cone', from: [-0.88, 1.64, -1.05], to: [-1.042, 1.75, -1.13], r: 0.051, rTo: 0.033 }, { kind: 'cone', from: [-1.042, 1.75, -1.13], to: [-1.15, 1.955, -1.08], r: 0.033, rTo: 0.014 }, { kind: 'cone', from: [-1.042, 1.75, -1.13], to: [-1.15, 2.02, -1.23], r: 0.024, rTo: 0.012 }, { kind: 'cone', from: [-0.882, 1.76, -1.05], to: [-0.747, 1.855, -0.97], r: 0.051, rTo: 0.033 }, { kind: 'cone', from: [-0.747, 1.855, -0.97], to: [-0.657, 2.03, -0.92], r: 0.033, rTo: 0.014 }, { kind: 'cone', from: [-0.747, 1.855, -0.97], to: [-0.639, 2.125, -1.07], r: 0.024, rTo: 0.012 }] }, paint: { kind: 'bands', axis: 'y', size: 0.1, colors: ['#d4dce4', '#8c98ac', '#d4dce4', '#2c2c3c'] }, bone: 'tree4', noShadow: true },
      { shape: { kind: 'ball', at: [-0.91, 2.02, -1.05], r: [0.075, 0.04, 0.075] }, paint: '#e4f0f8', bone: 'tree4', noShadow: true },
    ],
    moves: [
      { kind: 'sway', bone: 'tree4', axis: 'z', degrees: 1.4, times: 2, phase: 0.84, wind: 3 },
    ],
  },
}

/** A fox curled up asleep, breathing. */
export const SLEEPING_FOX: PropDoc = {
  name: 'Sleeping fox',
  foot: [0.501, -0.015, 0.711],
  doc: {
    name: 'Sleeping fox',
    loop: 12,
    light: { from: [-0.35, 1, 0.6], ambient: 0.5, shadow: 0.45 },
    palette: [
      '#0c1224', '#1c2848', '#34487c', '#6c88b8', '#a8c0dc', '#e4f0f8', '#2c2c3c', '#5c6880',
      '#8c98ac', '#d4dce4', '#e8641c', '#ff9c28', '#ffd870', '#e84838', '#b85420', '#e88838',
      '#f8c890', '#143c34', '#246054', '#38d8a0', '#a0f8d0', '#2cb890',
    ],
    sky: ['#0c1224', '#1c2848'],
    skyReach: 0.8,
    look: { dither: 0.5, glow: 1.15, outline: true, edges: true },
    camera: { target: [0, 1.4, 0], distance: 6.4, azimuth: 14, elevation: 7, swing: 14 },
    bones: [
      { name: 'fox', at: [0.42, 0.02, 0.62] },
    ],
    parts: [
      { shape: { kind: 'ball', at: [0.42, 0.12, 0.62], r: [0.24, 0.13, 0.18] }, paint: { kind: 'faces', top: '#e88838', side: '#b85420', under: '#f8c890' }, bone: 'fox', bare: true },
      { shape: { kind: 'join', shapes: [{ kind: 'sphere', at: [0.62, 0.11, 0.72], r: 0.095 }, { kind: 'cone', from: [0.68, 0.1, 0.76], to: [0.78, 0.07, 0.82], r: 0.05, rTo: 0.02 }, { kind: 'cone', from: [0.58, 0.18, 0.68], to: [0.56, 0.27, 0.66], r: 0.035, rTo: 0.008 }, { kind: 'cone', from: [0.66, 0.18, 0.69], to: [0.68, 0.27, 0.67], r: 0.035, rTo: 0.008 }] }, paint: '#e88838', bone: 'fox', bare: true, noShadow: true },
      { shape: { kind: 'sphere', at: [0.79, 0.07, 0.83], r: 0.02 }, paint: '#0c1224', bone: 'fox', bare: true, noShadow: true },
      { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [0.22, 0.08, 0.67], to: [0.3, 0.07, 0.86], r: 0.08, rTo: 0.075 }, { kind: 'cone', from: [0.3, 0.07, 0.86], to: [0.5, 0.06, 0.9], r: 0.075, rTo: 0.06 }] }, paint: '#b85420', bone: 'fox', bare: true, noShadow: true },
      { shape: { kind: 'sphere', at: [0.55, 0.06, 0.91], r: 0.06 }, paint: '#e4f0f8', bone: 'fox', bare: true, noShadow: true },
    ],
    moves: [
      { kind: 'pulse', bone: 'fox', size: [0.97, 1.04], times: 4 },
    ],
  },
}

/** The pieces above as the library lists them. */
export const GROVE_MADE: MadeProp[] = [
  { id: 'aurora-snow', tags: ['snowy', 'night'], kind: 'land', about: 'A round of snow at night with drifts, stones and a frozen puddle', prop: AURORA_SNOW },
  { id: 'lantern-birch', tags: ['tree', 'lamp', 'magic', 'snowy'], kind: 'prop', about: 'A snowy birch with a face lit from inside like a lantern, hung with two paper lamps, swaying', prop: LANTERN_BIRCH },
  { id: 'lantern-birch-short', tags: ['tree', 'lamp', 'magic', 'snowy'], kind: 'prop', about: 'A shorter snowy birch with a face lit from inside like a lantern, hung with two paper lamps, swaying', prop: LANTERN_BIRCH_SHORT },
  { id: 'lantern-birch-mid', tags: ['tree', 'lamp', 'magic', 'snowy'], kind: 'prop', about: 'A snowy birch of middle height with a face lit from inside like a lantern, hung with two paper lamps, swaying', prop: LANTERN_BIRCH_MID },
  { id: 'snowy-birch', tags: ['tree', 'snowy'], kind: 'prop', about: 'A bare birch with snow on its crown, hung with two paper lamps, swaying', prop: SNOWY_BIRCH },
  { id: 'snowy-birch-tall', tags: ['tree', 'snowy'], kind: 'prop', about: 'A taller bare birch with snow on its crown, swaying', prop: SNOWY_BIRCH_TALL },
  { id: 'sleeping-fox', tags: ['animal'], kind: 'prop', group: 'living', about: 'A fox curled up asleep, breathing', prop: SLEEPING_FOX },
]

/** Lantern grove as a land and the props set down on it: what Diorama draws and what Scene Creator opens. */
export const GROVE_PROJECT: SceneProject = {
  kind: 'blobscape-project',
  version: 1,
  name: 'Lantern grove',
  loop: 12,
  land: 'aurora-snow',
  props: [
    { prop: 'lantern-birch', at: [-0.15, -0.29, -0.232], turn: 0, size: 1 },
    { prop: 'lantern-birch-short', at: [-1.22, -0.2, 0.189], turn: 0, size: 1 },
    { prop: 'lantern-birch-mid', at: [1.0745, -0.22, -0.1025], turn: 0, size: 1 },
    { prop: 'snowy-birch', at: [0.7475, -0.17, -1.119], turn: 0, size: 1 },
    { prop: 'snowy-birch-tall', at: [-0.895, -0.18, -1.075], turn: 0, size: 1 },
    { prop: 'sleeping-fox', at: [0.501, -0.015, 0.711], turn: 0, size: 1 },
  ],
}
