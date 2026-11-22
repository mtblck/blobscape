import type { PropDoc } from '../../splat-engine/project.ts'
import type { MadeProp } from './garden.ts'

/**
 * The henge's magic circle and white witch standing still (their coming and going left behind): library props for
 * Scene Creator. In the scene itself they come and go, as props/henge.ts has them.
 * Data only, as a scene description is: see docs/scene-descriptions.md.
 */

/** A glowing circle of rings and a star turning on the ground, giving off blue light. */
export const MAGIC_CIRCLE: PropDoc = {
  name: 'Magic circle',
  foot: [0, -0.017, 0],
  doc: {
    name: 'Magic circle',
    loop: 16,
    light: { from: [-0.45, 0.9, 0.55], ambient: 0.42, shadow: 0.5 },
    palette: [
      '#07061a', '#12102a', '#1d1a3c', '#2a2a44', '#45465e', '#6a6c84', '#9a9cb0', '#c8cad8',
      '#0f2a2a', '#1a4034', '#2c5c3e', '#4a7c48', '#2a0f4a', '#2e2146', '#7f86b4', '#bcc2e2',
      '#e2b598', '#c99a80', '#8a6660', '#7a4a10', '#c08a20', '#f0c040', '#ffe890', '#3ad0ff',
      '#a0f0ff', '#d070ff', '#ff9af0', '#f4f0ff',
    ],
    sky: ['#07061a', '#1d1a3c'],
    skyReach: 0.85,
    look: { dither: 0.5, glow: 1.3, outline: true, edges: true },
    camera: { target: [0, 0.8, 0], distance: 5, azimuth: 12, elevation: 12, swing: 10 },
    bones: [
      { name: 'ringA', at: [0, 0.055, 0] },
      { name: 'star', at: [0, 0.055, 0] },
      { name: 'ringB', at: [0, 0.055, 0] },
    ],
    parts: [
      { shape: { kind: 'ring', at: [0, 0.055, 0], r: 0.74, tube: 0.02 }, paint: '#3ad0ff', bone: 'ringA', glow: true, noShadow: true, bare: true, touches: true },
      { shape: { kind: 'ring', at: [0, 0.055, 0], r: 0.63, tube: 0.012 }, paint: '#d070ff', bone: 'ringA', glow: true, noShadow: true, bare: true, touches: true },
      { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [0.655, 0.055, 0], to: [0.715, 0.055, 0], r: 0.011 }, { kind: 'sphere', at: [0.593, 0.055, 0.342], r: 0.02 }, { kind: 'cone', from: [0.308, 0.055, 0.613], to: [0.377, 0.055, 0.573], r: 0.011 }, { kind: 'cone', from: [0, 0.055, 0.655], to: [0, 0.055, 0.715], r: 0.011 }, { kind: 'sphere', at: [-0.342, 0.055, 0.593], r: 0.02 }, { kind: 'cone', from: [-0.613, 0.055, 0.308], to: [-0.573, 0.055, 0.377], r: 0.011 }] }, paint: '#a0f0ff', bone: 'ringA', glow: true, noShadow: true, bare: true, touches: true },
      { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [-0.655, 0.055, 0], to: [-0.715, 0.055, 0], r: 0.011 }, { kind: 'sphere', at: [-0.593, 0.055, -0.343], r: 0.02 }, { kind: 'cone', from: [-0.308, 0.055, -0.613], to: [-0.377, 0.055, -0.573], r: 0.011 }, { kind: 'cone', from: [0, 0.055, -0.655], to: [0, 0.055, -0.715], r: 0.011 }, { kind: 'sphere', at: [0.343, 0.055, -0.593], r: 0.02 }, { kind: 'cone', from: [0.613, 0.055, -0.308], to: [0.573, 0.055, -0.377], r: 0.011 }] }, paint: '#a0f0ff', bone: 'ringA', glow: true, noShadow: true, bare: true, touches: true },
      { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [0, 0.055, 0.6], to: [-0.52, 0.055, -0.3], r: 0.012 }, { kind: 'cone', from: [-0.52, 0.055, -0.3], to: [0.52, 0.055, -0.3], r: 0.012 }, { kind: 'cone', from: [0.52, 0.055, -0.3], to: [0, 0.055, 0.6], r: 0.012 }] }, paint: '#d070ff', bone: 'star', glow: true, noShadow: true, bare: true, touches: true },
      { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [0, 0.055, -0.6], to: [0.52, 0.055, 0.3], r: 0.012 }, { kind: 'cone', from: [0.52, 0.055, 0.3], to: [-0.52, 0.055, 0.3], r: 0.012 }, { kind: 'cone', from: [-0.52, 0.055, 0.3], to: [0, 0.055, -0.6], r: 0.012 }] }, paint: '#ff9af0', bone: 'star', glow: true, noShadow: true, bare: true, touches: true },
      { shape: { kind: 'ring', at: [0.52, 0.055, 0.3], r: 0.055, tube: 0.011 }, paint: '#a0f0ff', bone: 'star', glow: true, noShadow: true, bare: true, touches: true },
      { shape: { kind: 'ring', at: [0, 0.055, 0.6], r: 0.055, tube: 0.011 }, paint: '#a0f0ff', bone: 'star', glow: true, noShadow: true, bare: true, touches: true },
      { shape: { kind: 'ring', at: [-0.52, 0.055, 0.3], r: 0.055, tube: 0.011 }, paint: '#a0f0ff', bone: 'star', glow: true, noShadow: true, bare: true, touches: true },
      { shape: { kind: 'ring', at: [-0.52, 0.055, -0.3], r: 0.055, tube: 0.011 }, paint: '#a0f0ff', bone: 'star', glow: true, noShadow: true, bare: true, touches: true },
      { shape: { kind: 'ring', at: [0, 0.055, -0.6], r: 0.055, tube: 0.011 }, paint: '#a0f0ff', bone: 'star', glow: true, noShadow: true, bare: true, touches: true },
      { shape: { kind: 'ring', at: [0.52, 0.055, -0.3], r: 0.055, tube: 0.011 }, paint: '#a0f0ff', bone: 'star', glow: true, noShadow: true, bare: true, touches: true },
      { shape: { kind: 'ring', at: [0, 0.055, 0], r: 0.36, tube: 0.016 }, paint: '#3ad0ff', bone: 'ringB', glow: true, noShadow: true, bare: true, touches: true },
      { shape: { kind: 'sphere', at: [0.46, 0.055, 0], r: 0.026 }, paint: '#ffe890', bone: 'ringB', glow: true, noShadow: true, bare: true, touches: true },
      { shape: { kind: 'sphere', at: [0.23, 0.055, 0.398], r: 0.026 }, paint: '#ff9af0', bone: 'ringB', glow: true, noShadow: true, bare: true, touches: true },
      { shape: { kind: 'sphere', at: [-0.23, 0.055, 0.398], r: 0.026 }, paint: '#ffe890', bone: 'ringB', glow: true, noShadow: true, bare: true, touches: true },
      { shape: { kind: 'sphere', at: [-0.46, 0.055, 0], r: 0.026 }, paint: '#ff9af0', bone: 'ringB', glow: true, noShadow: true, bare: true, touches: true },
      { shape: { kind: 'sphere', at: [-0.23, 0.055, -0.398], r: 0.026 }, paint: '#ffe890', bone: 'ringB', glow: true, noShadow: true, bare: true, touches: true },
      { shape: { kind: 'sphere', at: [0.23, 0.055, -0.398], r: 0.026 }, paint: '#ff9af0', bone: 'ringB', glow: true, noShadow: true, bare: true, touches: true },
    ],
    moves: [
      { kind: 'spin', bone: 'ringA', axis: 'y', times: 1 },
      { kind: 'pulse', bone: 'ringA', size: [0.97, 1.03], times: 16 },
      { kind: 'spin', bone: 'star', axis: 'y', times: -1 },
      { kind: 'pulse', bone: 'star', size: [0.97, 1.03], times: 16 },
      { kind: 'spin', bone: 'ringB', axis: 'y', times: 2 },
      { kind: 'pulse', bone: 'ringB', size: [0.97, 1.03], times: 16 },
    ],
    lights: [
      { at: [0, 0.3, 0.5], color: '#3ad0ff', strength: 2.6, range: 2.8, lit: 'always', flicker: { by: 0.2, times: 12 } },
    ],
  },
}

/** A witch in a white robe and hat, holding a wand. */
export const WHITE_WITCH: PropDoc = {
  name: 'White witch',
  foot: [0.344, 0.04, 0],
  doc: {
    name: 'White witch',
    loop: 16,
    light: { from: [-0.45, 0.9, 0.55], ambient: 0.42, shadow: 0.5 },
    palette: [
      '#07061a', '#12102a', '#1d1a3c', '#2a2a44', '#45465e', '#6a6c84', '#9a9cb0', '#c8cad8',
      '#0f2a2a', '#1a4034', '#2c5c3e', '#4a7c48', '#2a0f4a', '#2e2146', '#7f86b4', '#bcc2e2',
      '#e2b598', '#c99a80', '#8a6660', '#7a4a10', '#c08a20', '#f0c040', '#ffe890', '#3ad0ff',
      '#a0f0ff', '#d070ff', '#ff9af0', '#f4f0ff',
    ],
    sky: ['#07061a', '#1d1a3c'],
    skyReach: 0.85,
    look: { dither: 0.5, glow: 1.3, outline: true, edges: true },
    camera: { target: [0, 0.8, 0], distance: 5, azimuth: 12, elevation: 12, swing: 10 },
    bones: [
      { name: 'wiz', at: [0, 0.04, 0] },
      { name: 'head', at: [0, 0.992, 0], parent: 'wiz' },
      { name: 'arm', at: [0.159, 0.906, 0.024], parent: 'wiz' },
      { name: 'wand', at: [0.537, 0.906, 0.067], parent: 'arm' },
    ],
    parts: [
      { shape: { kind: 'lathe', at: [0, 0.04, 0], profile: [[0.329, 0], [0.336, 0.037], [0.207, 0.293], [0.128, 0.573], [0.116, 0.683], [0.146, 0.83], [0.122, 0.915], [0.037, 0.964]] }, paint: { kind: 'split', axis: 'y', at: 0.138, below: { kind: 'bands', axis: 'y', size: 0.03, colors: ['#f0c040', '#ffe890', '#c08a20'] }, above: { kind: 'bands', axis: 'x', size: 0.05, colors: ['#f4f0ff', '#f4f0ff', '#bcc2e2'] } }, bone: 'wiz', bare: true },
      { shape: { kind: 'ball', at: [0, 0.54, -0.146], r: [0.268, 0.488, 0.085] }, paint: { kind: 'bands', axis: 'x', size: 0.07, colors: ['#bcc2e2', '#f4f0ff', '#bcc2e2', '#7f86b4'] }, bone: 'wiz', bare: true },
      { shape: { kind: 'ball', at: [0, 0.925, 0], r: [0.207, 0.061, 0.146] }, paint: '#f4f0ff', bone: 'wiz', bare: true },
      { shape: { kind: 'ring', at: [0, 0.65, 0], r: 0.122, tube: 0.024 }, paint: '#f0c040', bone: 'wiz', bare: true, noShadow: true },
      { shape: { kind: 'cone', from: [0, 0.626, 0.122], to: [0.037, 0.357, 0.232], r: 0.02 }, paint: '#f0c040', bone: 'wiz', bare: true, noShadow: true },
      { shape: { kind: 'sphere', at: [0, 0.894, 0.122], r: 0.037 }, paint: '#3ad0ff', bone: 'wiz', bare: true, glow: true, noShadow: true },
      { shape: { kind: 'cone', from: [-0.159, 0.906, 0.024], to: [-0.201, 0.552, 0.098], r: 0.041, rTo: 0.068 }, paint: { kind: 'bands', axis: 'x', size: 0.05, colors: ['#f4f0ff', '#f4f0ff', '#bcc2e2'] }, bone: 'wiz', bare: true, noShadow: true },
      { shape: { kind: 'sphere', at: [-0.205, 0.498, 0.104], r: 0.037 }, paint: '#e2b598', bone: 'wiz', bare: true, noShadow: true, glow: true },
      { shape: { kind: 'cone', from: [0.159, 0.906, 0.024], to: [0.488, 0.906, 0.061], r: 0.041, rTo: 0.068 }, paint: { kind: 'bands', axis: 'x', size: 0.05, colors: ['#f4f0ff', '#f4f0ff', '#bcc2e2'] }, bone: 'arm', bare: true, noShadow: true },
      { shape: { kind: 'sphere', at: [0.537, 0.906, 0.067], r: 0.037 }, paint: '#e2b598', bone: 'arm', bare: true, noShadow: true, glow: true },
      { shape: { kind: 'cone', from: [0.537, 0.906, 0.067], to: [0.927, 0.955, 0.104], r: 0.017, rTo: 0.011 }, paint: '#c08a20', bone: 'wand', bare: true, noShadow: true },
      { shape: { kind: 'sphere', at: [0.952, 0.959, 0.104], r: 0.046 }, paint: '#ffe890', bone: 'wand', bare: true, glow: true, noShadow: true },
      { shape: { kind: 'cone', from: [0, 0.943, 0.012], to: [0, 1.04, 0.018], r: 0.049 }, paint: '#c99a80', bone: 'head', bare: true, noShadow: true, glow: true },
      { shape: { kind: 'ball', at: [0, 1.126, 0.024], r: [0.122, 0.14, 0.122] }, paint: '#e2b598', bone: 'head', bare: true, glow: true },
      { shape: { kind: 'ball', at: [0, 1.156, -0.061], r: [0.132, 0.14, 0.104] }, paint: '#2e2146', bone: 'head', bare: true, noShadow: true },
      { shape: { kind: 'sweep', path: [[0, 1.15, -0.085], [0.024, 0.906, -0.159], [0.061, 0.626, -0.207]], r: 0.122, rTo: 0.061 }, paint: '#2e2146', bone: 'head', bare: true, noShadow: true },
      { shape: { kind: 'cone', from: [-0.116, 1.175, 0.037], to: [-0.14, 0.87, 0.073], r: 0.037, rTo: 0.022 }, paint: '#2e2146', bone: 'head', bare: true, noShadow: true },
      { shape: { kind: 'sphere', at: [-0.049, 1.138, 0.132], r: 0.021 }, paint: '#07061a', bone: 'head', bare: true, noShadow: true },
      { shape: { kind: 'cone', from: [0.116, 1.175, 0.037], to: [0.14, 0.87, 0.073], r: 0.037, rTo: 0.022 }, paint: '#2e2146', bone: 'head', bare: true, noShadow: true },
      { shape: { kind: 'sphere', at: [0.049, 1.138, 0.132], r: 0.021 }, paint: '#07061a', bone: 'head', bare: true, noShadow: true },
      { shape: { kind: 'sphere', at: [0, 1.071, 0.128], r: 0.017 }, paint: '#ff9af0', bone: 'head', bare: true, noShadow: true },
      { shape: { kind: 'ball', at: [0, 1.242, 0.012], r: [0.305, 0.027, 0.305] }, paint: { kind: 'faces', top: '#f4f0ff', side: '#bcc2e2' }, bone: 'head', bare: true, noShadow: true },
      { shape: { kind: 'sweep', path: [[0, 1.236, 0.012], [0.006, 1.48, 0], [0.037, 1.675, -0.049], [0.11, 1.785, -0.122]], r: 0.14, rTo: 0.015 }, paint: { kind: 'bands', axis: 'x', size: 0.05, colors: ['#f4f0ff', '#f4f0ff', '#bcc2e2'] }, bone: 'head', bare: true, noShadow: true },
      { shape: { kind: 'ring', at: [0, 1.284, 0.012], r: 0.137, tube: 0.024 }, paint: '#f0c040', bone: 'head', bare: true, noShadow: true },
    ],
  },
}

/** The pieces above as the library lists them. */
export const HENGE_STILL_MADE: MadeProp[] = [
  { id: 'magic-circle', tags: ['magic', 'rock'], kind: 'prop', about: 'A glowing circle of rings and a star turning on the ground, giving off blue light', prop: MAGIC_CIRCLE },
  { id: 'white-witch', tags: ['person', 'magic'], kind: 'prop', group: 'living', about: 'A witch in a white robe and hat, holding a wand', prop: WHITE_WITCH },
]

