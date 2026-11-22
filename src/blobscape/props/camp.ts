import type { PropDoc, SceneProject } from '../../splat-engine/project.ts'
import type { MadeProp } from './garden.ts'

/**
 * The camp in a pine clearing (Diorama's campfire scene) as a land and props (docs/scenes-from-props.md): the clearing,
 * its rocks, bushes and toadstools are the land, and the fire, tent, lantern, pack, log seat, pines and fireflies are
 * library props set down on it. Each was written where it stood in the scene, so its foot is where it stood; the pines
 * are one pine set down at seven sizes. The moon and stars are the shared recipes'.
 * Data only, as a scene description is: see docs/scene-descriptions.md.
 */

/** A round clearing of turf with rocks, bushes and toadstools, under the night sky. */
export const PINE_CLEARING: PropDoc = {
  name: 'Pine clearing',
  foot: [0, 0, 0],
  doc: {
    name: 'Pine clearing',
    loop: 12,
    light: { from: [-0.4, 0.8, 0.45], ambient: 0.5, shadow: 0.7 },
    palette: [
      '#0a0f1e', '#141c36', '#1f2d55', '#2f477d', '#4a6fae', '#10241c', '#1b3a2a', '#2c5a38',
      '#4a8048', '#79a85a', '#2a1c16', '#4a3020', '#6e4a2e', '#9a6d43', '#c79a63', '#3a3a48',
      '#5d5c6c', '#8a8898', '#c2c0cc', '#8f2d1c', '#d9541e', '#f59a2a', '#ffd166', '#fff3b0',
      '#7b2f45', '#b9485a', '#e8dcc0', '#f4f1e4',
    ],
    sky: ['#0a0f1e', '#1f2d55'],
    look: { dither: 0.5, glow: 1.75, outline: true, edges: true, bands: 2, heat: 1, cycle: [{ colors: ['#d9541e', '#f59a2a', '#ffd166'], times: 48 }] },
    camera: { target: [0, 1, 0], distance: 5.2, azimuth: 18, elevation: 13 },
    air: { haze: { color: '#141c36', from: 1, to: 7 }, specks: [{ kind: 'embers', lit: 'dark', count: 30, from: [-0.05, 0.25, 0.1], to: [0.25, 1.8, 0.4], colors: ['#f59a2a', '#ffd166', '#d9541e'] }] },
    bones: [
      { name: '~moon', at: [-1.5, 2.7, -1.7] },
      { name: '~star0', at: [-0.5619, 2.4177, -1.3045] },
      { name: '~star1', at: [1.0669, 3.016, -0.9732] },
      { name: '~star2', at: [-0.3976, 3.0763, -1.3243] },
      { name: '~star3', at: [-0.3581, 2.4621, -0.972] },
      { name: '~star4', at: [-0.4749, 2.1241, -1.7076] },
      { name: '~star5', at: [1.1353, 3.069, -0.9314] },
      { name: '~star6', at: [-0.0607, 2.596, -1.7603] },
      { name: '~star7', at: [-0.5628, 3.0699, -1.0148] },
      { name: '~star8', at: [1.6625, 2.6707, -1.6835] },
      { name: '~star9', at: [-0.6059, 2.0354, -1.6153] },
      { name: '~star10', at: [0.4687, 2.6365, -1.5116] },
      { name: '~star11', at: [-1.959, 3.0384, -1.6793] },
    ],
    parts: [
      { shape: { kind: 'rough', shape: { kind: 'cylinder', at: [0, -0.3, 0], height: 0.3, r: 1.75 }, by: 0.03, scale: 0.6 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.35, colors: ['#1b3a2a', '#2c5a38', '#2c5a38', '#4a8048'] }, side: { kind: 'bands', axis: 'y', size: 0.07, colors: ['#4a3020', '#2a1c16', '#6e4a2e'] } } },
      { shape: { kind: 'rough', shape: { kind: 'ball', at: [0.9, 0.08, -0.35], r: [0.24, 0.18, 0.2] }, by: 0.025, scale: 0.2 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.12, colors: ['#8a8898', '#4a8048', '#8a8898'] }, side: { kind: 'bands', axis: 'y', size: 0.06, colors: ['#5d5c6c', '#3a3a48'] } } },
      { shape: { kind: 'rough', shape: { kind: 'ball', at: [-1.1, 0.06, 0.75], r: [0.2, 0.14, 0.17] }, by: 0.025, scale: 0.2 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.12, colors: ['#8a8898', '#4a8048', '#8a8898'] }, side: { kind: 'bands', axis: 'y', size: 0.06, colors: ['#5d5c6c', '#3a3a48'] } } },
      { shape: { kind: 'rough', shape: { kind: 'ball', at: [0.55, 0.04, 1.15], r: [0.13, 0.09, 0.11] }, by: 0.025, scale: 0.2 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.12, colors: ['#8a8898', '#4a8048', '#8a8898'] }, side: { kind: 'bands', axis: 'y', size: 0.06, colors: ['#5d5c6c', '#3a3a48'] } } },
      { shape: { kind: 'rough', shape: { kind: 'ball', at: [-0.2, 0.07, -0.95], r: [0.13, 0.104, 0.13] }, by: 0.02, scale: 0.1 }, paint: { kind: 'faces', top: { kind: 'speckle', size: 0.04, colors: ['#4a8048', '#2c5a38', '#79a85a'] }, side: '#1b3a2a' } },
      { shape: { kind: 'rough', shape: { kind: 'ball', at: [0.65, 0.06, -0.85], r: [0.11, 0.088, 0.11] }, by: 0.02, scale: 0.1 }, paint: { kind: 'faces', top: { kind: 'speckle', size: 0.04, colors: ['#4a8048', '#2c5a38', '#79a85a'] }, side: '#1b3a2a' } },
      { shape: { kind: 'rough', shape: { kind: 'ball', at: [-1.2, 0.06, -0.3], r: [0.1, 0.08, 0.1] }, by: 0.02, scale: 0.1 }, paint: { kind: 'faces', top: { kind: 'speckle', size: 0.04, colors: ['#4a8048', '#2c5a38', '#79a85a'] }, side: '#1b3a2a' } },
      { shape: { kind: 'rough', shape: { kind: 'ball', at: [1.25, 0.06, 0.3], r: [0.11, 0.088, 0.11] }, by: 0.02, scale: 0.1 }, paint: { kind: 'faces', top: { kind: 'speckle', size: 0.04, colors: ['#4a8048', '#2c5a38', '#79a85a'] }, side: '#1b3a2a' } },
      { shape: { kind: 'rough', shape: { kind: 'ball', at: [-0.75, 0.05, 1.1], r: [0.09, 0.072, 0.09] }, by: 0.02, scale: 0.1 }, paint: { kind: 'faces', top: { kind: 'speckle', size: 0.04, colors: ['#4a8048', '#2c5a38', '#79a85a'] }, side: '#1b3a2a' } },
      { shape: { kind: 'rough', shape: { kind: 'ball', at: [0.1, 0.05, 1.3], r: [0.08, 0.064, 0.08] }, by: 0.02, scale: 0.1 }, paint: { kind: 'faces', top: { kind: 'speckle', size: 0.04, colors: ['#4a8048', '#2c5a38', '#79a85a'] }, side: '#1b3a2a' } },
      { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [0.75, 0, 0.2], height: 0.05, r: 0.014 }, { kind: 'ball', at: [0.75, 0.06, 0.2], r: [0.04, 0.026, 0.04] }] }, paint: { kind: 'split', axis: 'y', at: 0.045, below: '#e8dcc0', above: '#b9485a' } },
      { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [0.82, 0, 0.28], height: 0.05, r: 0.014 }, { kind: 'ball', at: [0.82, 0.06, 0.28], r: [0.04, 0.026, 0.04] }] }, paint: { kind: 'split', axis: 'y', at: 0.045, below: '#e8dcc0', above: '#b9485a' } },
      { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [-0.55, 0, 0.95], height: 0.05, r: 0.014 }, { kind: 'ball', at: [-0.55, 0.06, 0.95], r: [0.04, 0.026, 0.04] }] }, paint: { kind: 'split', axis: 'y', at: 0.045, below: '#e8dcc0', above: '#b9485a' } },
      { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [1.05, 0, -0.6], height: 0.05, r: 0.014 }, { kind: 'ball', at: [1.05, 0.06, -0.6], r: [0.04, 0.026, 0.04] }] }, paint: { kind: 'split', axis: 'y', at: 0.045, below: '#e8dcc0', above: '#b9485a' } },
      { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [-1, 0, 0.35], height: 0.05, r: 0.014 }, { kind: 'ball', at: [-1, 0.06, 0.35], r: [0.04, 0.026, 0.04] }] }, paint: { kind: 'split', axis: 'y', at: 0.045, below: '#e8dcc0', above: '#b9485a' } },
      { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [0.3, 0, 0.95], height: 0.05, r: 0.014 }, { kind: 'ball', at: [0.3, 0.06, 0.95], r: [0.04, 0.026, 0.04] }] }, paint: { kind: 'split', axis: 'y', at: 0.045, below: '#e8dcc0', above: '#b9485a' } },
      { shape: { kind: 'sphere', at: [-1.5, 2.7, -1.7], r: 0.2 }, paint: { kind: 'near', shape: { kind: 'join', shapes: [{ kind: 'ball', at: [-1.4412, 2.7471, -1.7], r: [0.0706, 0.0706, 0.48] }, { kind: 'ball', at: [-1.5824, 2.6412, -1.7], r: [0.0588, 0.0588, 0.48] }, { kind: 'ball', at: [-1.4765, 2.5941, -1.7], r: [0.0471, 0.0471, 0.48] }] }, within: 0, near: '#c2c0cc', far: '#f4f1e4' }, bone: '~moon', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-0.5619, 2.4177, -1.3045], r: 0.018 }, paint: '#c2c0cc', bone: '~star0', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [1.0669, 3.016, -0.9732], r: 0.018 }, paint: '#f4f1e4', bone: '~star1', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-0.3976, 3.0763, -1.3243], r: 0.018 }, paint: '#f4f1e4', bone: '~star2', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-0.3581, 2.4621, -0.972], r: 0.018 }, paint: '#f4f1e4', bone: '~star3', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-0.4749, 2.1241, -1.7076], r: 0.018 }, paint: '#c2c0cc', bone: '~star4', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [1.1353, 3.069, -0.9314], r: 0.018 }, paint: '#c2c0cc', bone: '~star5', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-0.0607, 2.596, -1.7603], r: 0.018 }, paint: '#f4f1e4', bone: '~star6', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-0.5628, 3.0699, -1.0148], r: 0.018 }, paint: '#f4f1e4', bone: '~star7', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [1.6625, 2.6707, -1.6835], r: 0.018 }, paint: '#f4f1e4', bone: '~star8', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-0.6059, 2.0354, -1.6153], r: 0.018 }, paint: '#f4f1e4', bone: '~star9', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [0.4687, 2.6365, -1.5116], r: 0.018 }, paint: '#c2c0cc', bone: '~star10', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-1.959, 3.0384, -1.6793], r: 0.018 }, paint: '#f4f1e4', bone: '~star11', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
    ],
  },
}

/** A ring of stones round a log fire that flickers and throws sparks, lit when it is dark. */
export const CAMPFIRE_FIRE: PropDoc = {
  name: 'Campfire',
  foot: [0.1, -0.0564, 0.25],
  doc: {
    name: 'Campfire',
    loop: 12,
    light: { from: [-0.4, 0.8, 0.45], ambient: 0.5, shadow: 0.7 },
    palette: [
      '#0a0f1e', '#141c36', '#1f2d55', '#2f477d', '#4a6fae', '#10241c', '#1b3a2a', '#2c5a38',
      '#4a8048', '#79a85a', '#2a1c16', '#4a3020', '#6e4a2e', '#9a6d43', '#c79a63', '#3a3a48',
      '#5d5c6c', '#8a8898', '#c2c0cc', '#8f2d1c', '#d9541e', '#f59a2a', '#ffd166', '#fff3b0',
      '#7b2f45', '#b9485a', '#e8dcc0', '#f4f1e4',
    ],
    sky: ['#0a0f1e', '#1f2d55'],
    look: { dither: 0.5, glow: 1.75, outline: true, edges: true, bands: 2, heat: 1, cycle: [{ colors: ['#d9541e', '#f59a2a', '#ffd166'], times: 48 }] },
    camera: { target: [0, 1, 0], distance: 5.2, azimuth: 18, elevation: 13 },
    bones: [
      { name: 'flame', at: [0.1, 0.05, 0.25] },
      { name: 'core', at: [0.1, 0.05, 0.25] },
      { name: 'spark0', at: [0.1, 0.4, 0.25] },
      { name: 'spark1', at: [0.1, 0.4, 0.25] },
      { name: 'spark2', at: [0.1, 0.4, 0.25] },
      { name: 'spark3', at: [0.1, 0.4, 0.25] },
      { name: 'spark4', at: [0.1, 0.4, 0.25] },
      { name: 'spark5', at: [0.1, 0.4, 0.25] },
    ],
    parts: [
      { shape: { kind: 'cylinder', at: [0.1, -0.03, 0.25], height: 0.055, r: 0.5 }, paint: { kind: 'speckle', size: 0.05, colors: ['#6e4a2e', '#4a3020', '#9a6d43'] } },
      { shape: { kind: 'rough', shape: { kind: 'join', shapes: [{ kind: 'sphere', at: [0.32, 0.03, 0.25], r: 0.065 }, { kind: 'sphere', at: [0.269, 0.03, 0.391], r: 0.055 }, { kind: 'sphere', at: [0.138, 0.03, 0.467], r: 0.065 }, { kind: 'sphere', at: [-0.01, 0.03, 0.441], r: 0.055 }, { kind: 'sphere', at: [-0.107, 0.03, 0.325], r: 0.065 }, { kind: 'sphere', at: [-0.107, 0.03, 0.175], r: 0.055 }, { kind: 'sphere', at: [-0.01, 0.03, 0.059], r: 0.065 }, { kind: 'sphere', at: [0.138, 0.03, 0.033], r: 0.055 }, { kind: 'sphere', at: [0.269, 0.03, 0.109], r: 0.065 }] }, by: 0.012, scale: 0.12 }, paint: { kind: 'faces', top: '#8a8898', side: '#5d5c6c', under: '#3a3a48' } },
      { shape: { kind: 'cone', from: [-0.05, 0.03, 0.2], to: [0.24, 0.1, 0.3], r: 0.032 }, paint: { kind: 'speckle', size: 0.04, colors: ['#4a3020', '#2a1c16', '#d9541e'] } },
      { shape: { kind: 'cone', from: [0.22, 0.03, 0.14], to: [0.02, 0.1, 0.34], r: 0.032 }, paint: { kind: 'speckle', size: 0.04, colors: ['#4a3020', '#2a1c16', '#d9541e'] } },
      { shape: { kind: 'cone', from: [0.1, 0.03, 0.4], to: [0.1, 0.11, 0.12], r: 0.032 }, paint: { kind: 'speckle', size: 0.04, colors: ['#4a3020', '#2a1c16', '#d9541e'] } },
      { shape: { kind: 'cone', from: [0.1, 0.1, 0.25], to: [0.1, 0.5, 0.25], r: 0.11, rTo: 0.01 }, paint: { kind: 'split', axis: 'y', at: 0.27, below: '#f59a2a', above: '#d9541e' }, bone: 'flame', glow: true, lit: 'dark', unlit: 'gone' },
      { shape: { kind: 'cone', from: [0.1, 0.09, 0.28], to: [0.12, 0.32, 0.28], r: 0.065, rTo: 0.01 }, paint: { kind: 'split', axis: 'y', at: 0.2, below: '#fff3b0', above: '#ffd166' }, bone: 'core', glow: true, lit: 'dark', unlit: 'gone' },
      { shape: { kind: 'sphere', at: [0.1, 0.4, 0.25], r: 0.018 }, paint: '#f59a2a', bone: 'spark0', glow: true, lit: 'dark', unlit: 'gone' },
      { shape: { kind: 'sphere', at: [0.1, 0.4, 0.25], r: 0.018 }, paint: '#ffd166', bone: 'spark1', glow: true, lit: 'dark', unlit: 'gone' },
      { shape: { kind: 'sphere', at: [0.1, 0.4, 0.25], r: 0.018 }, paint: '#f59a2a', bone: 'spark2', glow: true, lit: 'dark', unlit: 'gone' },
      { shape: { kind: 'sphere', at: [0.1, 0.4, 0.25], r: 0.018 }, paint: '#ffd166', bone: 'spark3', glow: true, lit: 'dark', unlit: 'gone' },
      { shape: { kind: 'sphere', at: [0.1, 0.4, 0.25], r: 0.018 }, paint: '#f59a2a', bone: 'spark4', glow: true, lit: 'dark', unlit: 'gone' },
      { shape: { kind: 'sphere', at: [0.1, 0.4, 0.25], r: 0.018 }, paint: '#ffd166', bone: 'spark5', glow: true, lit: 'dark', unlit: 'gone' },
    ],
    moves: [
      { kind: 'pulse', bone: 'flame', size: [0.82, 1.12], times: 9 },
      { kind: 'sway', bone: 'flame', axis: 'z', degrees: 7, times: 7 },
      { kind: 'pulse', bone: 'core', size: [0.75, 1.2], times: 13, phase: 0.3 },
      { kind: 'sway', bone: 'core', axis: 'x', degrees: 9, times: 8 },
      { kind: 'drift', bone: 'spark0', by: [0.16, 0.75, 0.05], times: 3, grow: [1.2, 0.5], phase: 0 },
      { kind: 'drift', bone: 'spark1', by: [-0.12, 0.85, 0.1], times: 4, grow: [1.2, 0.5], phase: 0.167 },
      { kind: 'drift', bone: 'spark2', by: [0.05, 0.95, -0.14], times: 3, grow: [1.2, 0.5], phase: 0.333 },
      { kind: 'drift', bone: 'spark3', by: [-0.06, 0.75, -0.05], times: 4, grow: [1.2, 0.5], phase: 0.5 },
      { kind: 'drift', bone: 'spark4', by: [0.2, 0.85, 0.12], times: 3, grow: [1.2, 0.5], phase: 0.667 },
      { kind: 'drift', bone: 'spark5', by: [-0.18, 0.95, -0.1], times: 4, grow: [1.2, 0.5], phase: 0.833 },
    ],
    lights: [
      { at: [0.1, 0.3, 0.25], color: '#f59a2a', strength: 3, range: 0.9, lit: 'dark', flicker: { by: 0.25, times: 11 } },
    ],
  },
}

/** A striped tent with its door open and a pole. */
export const TENT: PropDoc = {
  name: 'Tent',
  foot: [-0.76, -0.06, -0.15],
  doc: {
    name: 'Tent',
    loop: 12,
    light: { from: [-0.4, 0.8, 0.45], ambient: 0.5, shadow: 0.7 },
    palette: [
      '#0a0f1e', '#141c36', '#1f2d55', '#2f477d', '#4a6fae', '#10241c', '#1b3a2a', '#2c5a38',
      '#4a8048', '#79a85a', '#2a1c16', '#4a3020', '#6e4a2e', '#9a6d43', '#c79a63', '#3a3a48',
      '#5d5c6c', '#8a8898', '#c2c0cc', '#8f2d1c', '#d9541e', '#f59a2a', '#ffd166', '#fff3b0',
      '#7b2f45', '#b9485a', '#e8dcc0', '#f4f1e4',
    ],
    sky: ['#0a0f1e', '#1f2d55'],
    look: { dither: 0.5, glow: 1.75, outline: true, edges: true, bands: 2, heat: 1, cycle: [{ colors: ['#d9541e', '#f59a2a', '#ffd166'], times: 48 }] },
    camera: { target: [0, 1, 0], distance: 5.2, azimuth: 18, elevation: 13 },
    parts: [
      { shape: { kind: 'cut', shape: { kind: 'roof', at: [-0.8, 0, -0.15], half: [0.42, 0.36], height: 0.52 }, hole: { kind: 'roof', at: [-0.55, -0.02, -0.15], half: [0.3, 0.25], height: 0.38 } }, paint: { kind: 'split', axis: 'x', at: -0.4, below: { kind: 'bands', axis: 'x', size: 0.14, colors: ['#b9485a', '#7b2f45'] }, above: '#141c36' } },
      { shape: { kind: 'box', at: [-1, 0.012, -0.15], half: [0.2, 0.012, 0.2] }, paint: '#2f477d' },
      { shape: { kind: 'cone', from: [-0.36, 0, -0.15], to: [-0.36, 0.56, -0.15], r: 0.015 }, paint: '#9a6d43' },
    ],
    lights: [
      { at: [-0.3, 0.45, -0.5], color: '#ffd166', strength: 1.2, range: 0.4, lit: 'dark' },
    ],
  },
}

/** A lantern on a post, lit when it is dark. */
export const CAMP_LANTERN: PropDoc = {
  name: 'Camp lantern',
  foot: [-0.3, -0.06, -0.55],
  doc: {
    name: 'Camp lantern',
    loop: 12,
    light: { from: [-0.4, 0.8, 0.45], ambient: 0.5, shadow: 0.7 },
    palette: [
      '#0a0f1e', '#141c36', '#1f2d55', '#2f477d', '#4a6fae', '#10241c', '#1b3a2a', '#2c5a38',
      '#4a8048', '#79a85a', '#2a1c16', '#4a3020', '#6e4a2e', '#9a6d43', '#c79a63', '#3a3a48',
      '#5d5c6c', '#8a8898', '#c2c0cc', '#8f2d1c', '#d9541e', '#f59a2a', '#ffd166', '#fff3b0',
      '#7b2f45', '#b9485a', '#e8dcc0', '#f4f1e4',
    ],
    sky: ['#0a0f1e', '#1f2d55'],
    look: { dither: 0.5, glow: 1.75, outline: true, edges: true, bands: 2, heat: 1, cycle: [{ colors: ['#d9541e', '#f59a2a', '#ffd166'], times: 48 }] },
    camera: { target: [0, 1, 0], distance: 5.2, azimuth: 18, elevation: 13 },
    parts: [
      { shape: { kind: 'cone', from: [-0.3, 0, -0.55], to: [-0.3, 0.42, -0.55], r: 0.016 }, paint: '#4a3020' },
      { shape: { kind: 'box', at: [-0.3, 0.47, -0.55], half: [0.035, 0.045, 0.035] }, paint: '#ffd166', glow: true, lit: 'dark' },
      { shape: { kind: 'box', at: [-0.3, 0.53, -0.55], half: [0.045, 0.015, 0.045] }, paint: '#3a3a48' },
    ],
  },
}

/** A blue pack with a leather flap. */
export const PACK: PropDoc = {
  name: 'Pack',
  foot: [-0.38, 0, 0.455],
  doc: {
    name: 'Pack',
    loop: 12,
    light: { from: [-0.4, 0.8, 0.45], ambient: 0.5, shadow: 0.7 },
    palette: [
      '#0a0f1e', '#141c36', '#1f2d55', '#2f477d', '#4a6fae', '#10241c', '#1b3a2a', '#2c5a38',
      '#4a8048', '#79a85a', '#2a1c16', '#4a3020', '#6e4a2e', '#9a6d43', '#c79a63', '#3a3a48',
      '#5d5c6c', '#8a8898', '#c2c0cc', '#8f2d1c', '#d9541e', '#f59a2a', '#ffd166', '#fff3b0',
      '#7b2f45', '#b9485a', '#e8dcc0', '#f4f1e4',
    ],
    sky: ['#0a0f1e', '#1f2d55'],
    look: { dither: 0.5, glow: 1.75, outline: true, edges: true, bands: 2, heat: 1, cycle: [{ colors: ['#d9541e', '#f59a2a', '#ffd166'], times: 48 }] },
    camera: { target: [0, 1, 0], distance: 5.2, azimuth: 18, elevation: 13 },
    parts: [
      { shape: { kind: 'box', at: [-0.38, 0.1, 0.42], half: [0.08, 0.1, 0.06], round: 0.03 }, paint: { kind: 'split', axis: 'y', at: 0.13, below: '#2f477d', above: '#4a6fae' } },
      { shape: { kind: 'box', at: [-0.38, 0.07, 0.49], half: [0.05, 0.04, 0.02], round: 0.01 }, paint: '#c79a63' },
    ],
  },
}

/** A felled log to sit on by the fire. */
export const LOG_SEAT: PropDoc = {
  name: 'Log seat',
  foot: [0.785, 0, 0.665],
  doc: {
    name: 'Log seat',
    loop: 12,
    light: { from: [-0.4, 0.8, 0.45], ambient: 0.5, shadow: 0.7 },
    palette: [
      '#0a0f1e', '#141c36', '#1f2d55', '#2f477d', '#4a6fae', '#10241c', '#1b3a2a', '#2c5a38',
      '#4a8048', '#79a85a', '#2a1c16', '#4a3020', '#6e4a2e', '#9a6d43', '#c79a63', '#3a3a48',
      '#5d5c6c', '#8a8898', '#c2c0cc', '#8f2d1c', '#d9541e', '#f59a2a', '#ffd166', '#fff3b0',
      '#7b2f45', '#b9485a', '#e8dcc0', '#f4f1e4',
    ],
    sky: ['#0a0f1e', '#1f2d55'],
    look: { dither: 0.5, glow: 1.75, outline: true, edges: true, bands: 2, heat: 1, cycle: [{ colors: ['#d9541e', '#f59a2a', '#ffd166'], times: 48 }] },
    camera: { target: [0, 1, 0], distance: 5.2, azimuth: 18, elevation: 13 },
    parts: [
      { shape: { kind: 'cone', from: [0.55, 0.075, 0.78], to: [1.02, 0.075, 0.55], r: 0.075 }, paint: { kind: 'faces', top: { kind: 'bands', axis: 'x', size: 0.05, colors: ['#6e4a2e', '#4a3020'] }, side: '#4a3020', under: '#2a1c16' } },
      { shape: { kind: 'cone', from: [1.02, 0.075, 0.55], to: [1.035, 0.075, 0.543], r: 0.06 }, paint: '#c79a63' },
    ],
  },
}

/** A pine in tiers that sways a little. */
export const CAMP_PINE: PropDoc = {
  name: 'Camp pine pine0',
  foot: [-1.25, 0, -0.85],
  doc: {
    name: 'Camp pine pine0',
    loop: 12,
    light: { from: [-0.4, 0.8, 0.45], ambient: 0.5, shadow: 0.7 },
    palette: [
      '#0a0f1e', '#141c36', '#1f2d55', '#2f477d', '#4a6fae', '#10241c', '#1b3a2a', '#2c5a38',
      '#4a8048', '#79a85a', '#2a1c16', '#4a3020', '#6e4a2e', '#9a6d43', '#c79a63', '#3a3a48',
      '#5d5c6c', '#8a8898', '#c2c0cc', '#8f2d1c', '#d9541e', '#f59a2a', '#ffd166', '#fff3b0',
      '#7b2f45', '#b9485a', '#e8dcc0', '#f4f1e4',
    ],
    sky: ['#0a0f1e', '#1f2d55'],
    look: { dither: 0.5, glow: 1.75, outline: true, edges: true, bands: 2, heat: 1, cycle: [{ colors: ['#d9541e', '#f59a2a', '#ffd166'], times: 48 }] },
    camera: { target: [0, 1, 0], distance: 5.2, azimuth: 18, elevation: 13 },
    bones: [
      { name: 'pine0', at: [-1.25, 0, -0.85] },
    ],
    parts: [
      { shape: { kind: 'cylinder', at: [-1.25, 0, -0.85], height: 0.6, r: 0.048 }, paint: { kind: 'bands', axis: 'y', size: 0.08, colors: ['#4a3020', '#2a1c16'] }, bone: 'pine0' },
      { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [-1.25, 0.33, -0.85], height: 0.405, r: 0.405, rTop: 0.081 }, { kind: 'cylinder', at: [-1.25, 0.615, -0.85], height: 0.405, r: 0.323, rTop: 0.065 }, { kind: 'cylinder', at: [-1.25, 0.9, -0.85], height: 0.405, r: 0.24, rTop: 0.048 }, { kind: 'cylinder', at: [-1.25, 1.185, -0.85], height: 0.405, r: 0.158, rTop: 0.032 }] }, paint: { kind: 'faces', top: { kind: 'speckle', size: 0.05, colors: ['#2c5a38', '#2c5a38', '#4a8048'] }, side: '#1b3a2a', under: '#10241c' }, bone: 'pine0' },
    ],
    moves: [
      { kind: 'sway', bone: 'pine0', axis: 'z', degrees: 1.6, times: 3, phase: 0 },
    ],
  },
}

/** Seven fireflies that drift and blink, out at night. */
export const FIREFLIES: PropDoc = {
  name: 'Fireflies',
  foot: [0.05, 0.228, 0.15],
  doc: {
    name: 'Fireflies',
    loop: 12,
    light: { from: [-0.4, 0.8, 0.45], ambient: 0.5, shadow: 0.7 },
    palette: [
      '#0a0f1e', '#141c36', '#1f2d55', '#2f477d', '#4a6fae', '#10241c', '#1b3a2a', '#2c5a38',
      '#4a8048', '#79a85a', '#2a1c16', '#4a3020', '#6e4a2e', '#9a6d43', '#c79a63', '#3a3a48',
      '#5d5c6c', '#8a8898', '#c2c0cc', '#8f2d1c', '#d9541e', '#f59a2a', '#ffd166', '#fff3b0',
      '#7b2f45', '#b9485a', '#e8dcc0', '#f4f1e4',
    ],
    sky: ['#0a0f1e', '#1f2d55'],
    look: { dither: 0.5, glow: 1.75, outline: true, edges: true, bands: 2, heat: 1, cycle: [{ colors: ['#d9541e', '#f59a2a', '#ffd166'], times: 48 }] },
    camera: { target: [0, 1, 0], distance: 5.2, azimuth: 18, elevation: 13 },
    bones: [
      { name: 'fly0', at: [-0.5, 0.5, 0.9] },
      { name: 'fly1', at: [0.9, 0.7, 0.9] },
      { name: 'fly2', at: [1.2, 0.45, -0.5] },
      { name: 'fly3', at: [-1.1, 0.8, -0.5] },
      { name: 'fly4', at: [0.4, 0.9, -0.9] },
      { name: 'fly5', at: [-0.2, 0.35, 1.2] },
      { name: 'fly6', at: [0.6, 0.3, 0.45] },
    ],
    parts: [
      { shape: { kind: 'sphere', at: [-0.5, 0.5, 0.9], r: 0.016 }, paint: '#fff3b0', bone: 'fly0', glow: true, lit: 'night', unlit: 'gone' },
      { shape: { kind: 'sphere', at: [0.9, 0.7, 0.9], r: 0.016 }, paint: '#fff3b0', bone: 'fly1', glow: true, lit: 'night', unlit: 'gone' },
      { shape: { kind: 'sphere', at: [1.2, 0.45, -0.5], r: 0.016 }, paint: '#fff3b0', bone: 'fly2', glow: true, lit: 'night', unlit: 'gone' },
      { shape: { kind: 'sphere', at: [-1.1, 0.8, -0.5], r: 0.016 }, paint: '#fff3b0', bone: 'fly3', glow: true, lit: 'night', unlit: 'gone' },
      { shape: { kind: 'sphere', at: [0.4, 0.9, -0.9], r: 0.016 }, paint: '#fff3b0', bone: 'fly4', glow: true, lit: 'night', unlit: 'gone' },
      { shape: { kind: 'sphere', at: [-0.2, 0.35, 1.2], r: 0.016 }, paint: '#fff3b0', bone: 'fly5', glow: true, lit: 'night', unlit: 'gone' },
      { shape: { kind: 'sphere', at: [0.6, 0.3, 0.45], r: 0.016 }, paint: '#fff3b0', bone: 'fly6', glow: true, lit: 'night', unlit: 'gone' },
    ],
    moves: [
      { kind: 'bob', bone: 'fly0', by: [-0.12, 0.07, -0.14], times: 2, phase: 0 },
      { kind: 'bob', bone: 'fly0', by: [0, 0.09, 0], times: 5, phase: 0 },
      { kind: 'pulse', bone: 'fly0', size: [0.2, 1.3], times: 4, phase: 0 },
      { kind: 'bob', bone: 'fly1', by: [0.16, 0.07, 0.1], times: 3, phase: 0.17 },
      { kind: 'bob', bone: 'fly1', by: [0, 0.09, 0], times: 5, phase: 0.31 },
      { kind: 'pulse', bone: 'fly1', size: [0.2, 1.3], times: 5, phase: 0.23 },
      { kind: 'bob', bone: 'fly2', by: [-0.12, 0.07, 0.1], times: 2, phase: 0.34 },
      { kind: 'bob', bone: 'fly2', by: [0, 0.09, 0], times: 5, phase: 0.62 },
      { kind: 'pulse', bone: 'fly2', size: [0.2, 1.3], times: 6, phase: 0.46 },
      { kind: 'bob', bone: 'fly3', by: [0.16, 0.07, -0.14], times: 3, phase: 0.51 },
      { kind: 'bob', bone: 'fly3', by: [0, 0.09, 0], times: 5, phase: 0.93 },
      { kind: 'pulse', bone: 'fly3', size: [0.2, 1.3], times: 4, phase: 0.69 },
      { kind: 'bob', bone: 'fly4', by: [-0.12, 0.07, 0.1], times: 2, phase: 0.68 },
      { kind: 'bob', bone: 'fly4', by: [0, 0.09, 0], times: 5, phase: 0.24 },
      { kind: 'pulse', bone: 'fly4', size: [0.2, 1.3], times: 5, phase: 0.92 },
      { kind: 'bob', bone: 'fly5', by: [0.16, 0.07, 0.1], times: 3, phase: 0.85 },
      { kind: 'bob', bone: 'fly5', by: [0, 0.09, 0], times: 5, phase: 0.55 },
      { kind: 'pulse', bone: 'fly5', size: [0.2, 1.3], times: 6, phase: 0.15 },
      { kind: 'bob', bone: 'fly6', by: [-0.12, 0.07, -0.14], times: 2, phase: 0.02 },
      { kind: 'bob', bone: 'fly6', by: [0, 0.09, 0], times: 5, phase: 0.86 },
      { kind: 'pulse', bone: 'fly6', size: [0.2, 1.3], times: 4, phase: 0.38 },
    ],
  },
}

/** The pieces above as the library lists them. */
export const CAMP_MADE: MadeProp[] = [
  { id: 'pine-clearing', tags: ['grassy', 'night'], kind: 'land', about: 'A round clearing of turf with rocks, bushes and toadstools, under the night sky', prop: PINE_CLEARING },
  { id: 'campfire', tags: ['lamp'], kind: 'prop', about: 'A ring of stones round a log fire that flickers and throws sparks, lit when it is dark', prop: CAMPFIRE_FIRE },
  { id: 'tent', tags: ['thing'], kind: 'prop', group: 'buildings', about: 'A striped tent with its door open and a pole', prop: TENT },
  { id: 'camp-lantern', tags: ['lamp'], kind: 'prop', about: 'A lantern on a post, lit when it is dark', prop: CAMP_LANTERN },
  { id: 'pack', tags: ['thing'], kind: 'prop', about: 'A blue pack with a leather flap', prop: PACK },
  { id: 'log-seat', tags: ['tree'], kind: 'prop', about: 'A felled log to sit on by the fire', prop: LOG_SEAT },
  { id: 'camp-pine', tags: ['tree', 'evergreen'], kind: 'prop', about: 'A pine in tiers that sways a little', prop: CAMP_PINE },
  { id: 'fireflies', tags: ['animal', 'lamp'], kind: 'prop', group: 'living', about: 'Seven fireflies that drift and blink, out at night', prop: FIREFLIES },
]

/** Campfire as a land and the props set down on it: what Diorama draws and what Scene Creator opens. */
export const CAMPFIRE_PROJECT: SceneProject = {
  kind: 'blobscape-project',
  version: 1,
  name: 'Campfire',
  loop: 12,
  land: 'pine-clearing',
  props: [
    { prop: 'campfire', at: [0.1, -0.0564, 0.25], turn: 0, size: 1 },
    { prop: 'tent', at: [-0.76, -0.06, -0.15], turn: 0, size: 1 },
    { prop: 'camp-lantern', at: [-0.3, -0.06, -0.55], turn: 0, size: 1 },
    { prop: 'pack', at: [-0.38, 0, 0.455], turn: 0, size: 1 },
    { prop: 'log-seat', at: [0.785, 0, 0.665], turn: 0, size: 1 },
    { prop: 'camp-pine', at: [-1.25, 0, -0.85], turn: 0, size: 1 },
    { prop: 'camp-pine', at: [-0.55, 0, -1.3], turn: 0, size: 1.3, phase: 0.22 },
    { prop: 'camp-pine', at: [0.3, 0, -1.35], turn: 0, size: 1.067, phase: 0.59 },
    { prop: 'camp-pine', at: [1, 0, -1], turn: 0, size: 1.233, phase: 0.96 },
    { prop: 'camp-pine', at: [1.42, 0, -0.2], turn: 0, size: 0.867, phase: 0.33 },
    { prop: 'camp-pine', at: [-1.5, 0, 0.1], turn: 0, size: 0.8, phase: 0.7 },
    { prop: 'camp-pine', at: [1.3, 0, 0.8], turn: 0, size: 0.6, phase: 0.07 },
    { prop: 'fireflies', at: [0.05, 0.228, 0.15], turn: 0, size: 1 },
  ],
}
