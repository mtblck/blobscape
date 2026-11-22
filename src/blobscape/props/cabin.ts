import type { PropDoc, SceneProject } from '../../splat-engine/project.ts'
import type { MadeProp } from './garden.ts'

/**
 * The snowed-in cabin (Diorama's cabin scene) as a land and props (docs/scenes-from-props.md): the drifted ground is the
 * land, and the cabin, the woodpile, the firs, the fence and the lamp are library props set down where they stood. Its
 * falling snow is the shared snow now (Diorama.weather), not its own.
 * Data only, as a scene description is: see docs/scene-descriptions.md.
 */

/** A square of snowy ground at night, drifts piled deep downwind, with stones. */
export const WINTER_DRIFTS: PropDoc = {
  name: 'Winter drifts',
  foot: [0, 0, 0],
  doc: {
    name: 'Winter drifts',
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
    camera: { target: [0, 0.32, 0.05], distance: 5, azimuth: 22, elevation: 22, swing: 8 },
    cover: { kind: 'snow', color: '#f4f8ff', amount: 0.5 },
    air: { haze: { color: '#22304e', from: 2, to: 9 }, specks: [] },
    parts: [
      { shape: { kind: 'box', at: [0, -0.1, 0], half: [1.55, 0.1, 1.35] }, paint: { kind: 'faces', top: '#34486e', side: { kind: 'bands', axis: 'y', size: 0.05, colors: ['#2a1a18', '#4a2e22'] } } },
      { shape: { kind: 'rough', shape: { kind: 'ball', at: [-0.9, -0.1, -1.05], r: [0.75, 0.38, 0.4] }, by: 0.04, scale: 0.3 }, paint: '#4e6890' },
      { shape: { kind: 'rough', shape: { kind: 'ball', at: [0.95, -0.1, -1.1], r: [0.65, 0.3, 0.35] }, by: 0.04, scale: 0.3 }, paint: '#4e6890' },
      { shape: { kind: 'rough', shape: { kind: 'ball', at: [0.85, 0.05, 0.3], r: [0.17, 0.13, 0.14] }, by: 0.02, scale: 0.12 }, paint: { kind: 'faces', top: '#8a8aa0', side: '#5a5a6e' } },
      { shape: { kind: 'rough', shape: { kind: 'ball', at: [-0.95, 0.04, 0.2], r: [0.13, 0.1, 0.12] }, by: 0.02, scale: 0.12 }, paint: { kind: 'faces', top: '#8a8aa0', side: '#5a5a6e' } },
      { shape: { kind: 'drift', at: [0, 0, 0], half: [1.5, 1.3], depth: 0.035, wind: [1, 0.3], pile: 0.18, reach: 3, path: [[-0.14, 0, 0.05], [-0.25, 0, 0.55], [-0.16, 0, 1.08], [-0.1, 0, 1.35]], pathWidth: 0.24, seed: 2 }, paint: { kind: 'patches', size: 0.2, colors: ['#f4f8ff', '#d4e0f0'] }, bare: true },
    ],
  },
}

/** A snowed-in log cabin with a lit window growing frost, and smoke from its chimney. */
export const LOG_CABIN: PropDoc = {
  name: 'Log cabin',
  foot: [0.1, 0, -0.3],
  doc: {
    name: 'Log cabin',
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
    camera: { target: [0, 0.32, 0.05], distance: 5, azimuth: 22, elevation: 22, swing: 8 },
    bones: [
      { name: 'frost0', at: [0.27, 0.34, 0.035] },
      { name: 'frost1', at: [0.27, 0.34, 0.035] },
      { name: 'frost2', at: [0.27, 0.34, 0.035] },
      { name: 'smoke0', at: [0.42, 1.12, -0.42] },
      { name: 'smoke1', at: [0.42, 1.12, -0.42] },
      { name: 'smoke2', at: [0.42, 1.12, -0.42] },
      { name: 'smoke3', at: [0.42, 1.12, -0.42] },
    ],
    parts: [
      { shape: { kind: 'box', at: [0.1, 0.3, -0.3], half: [0.46, 0.3, 0.32], round: 0.02 }, paint: { kind: 'bands', axis: 'y', size: 0.055, colors: ['#6e4630', '#4a2e22', '#94643e'] } },
      { shape: { kind: 'roof', at: [0.1, 0.6, -0.3], half: [0.56, 0.42], height: 0.36 }, paint: { kind: 'faces', top: '#4a2e22', side: '#2a1a18', under: '#2a1a18' } },
      { shape: { kind: 'box', at: [0.42, 0.82, -0.42], half: [0.07, 0.28, 0.07] }, paint: { kind: 'bricks', size: [0.06, 0.035], colors: ['#5a5a6e', '#8a8aa0'], line: '#22304e' } },
      { shape: { kind: 'box', at: [-0.14, 0.22, 0.03], half: [0.1, 0.22, 0.02] }, paint: { kind: 'bands', axis: 'x', size: 0.04, colors: ['#4a2e22', '#2a1a18'] } },
      { shape: { kind: 'box', at: [0.27, 0.34, 0.03], half: [0.13, 0.11, 0.015] }, paint: '#2a1a18' },
      { shape: { kind: 'box', at: [0.27, 0.34, 0.035], half: [0.1, 0.085, 0.012] }, paint: '#ffb840', glow: true, lit: 'dark', unlit: '#a9c3d4', bare: true },
      { shape: { kind: 'frost', at: [0.27, 0.34, 0.035], facing: [0, 0, 1], r: 0.1, arms: 6, stage: [0, 0.34], seed: 3 }, paint: { kind: 'pieces', colors: ['#f4f8ff', '#d4e0f0', '#a8bcd8', '#a8bcd8'], ordered: true }, bone: 'frost0', noShadow: true },
      { shape: { kind: 'frost', at: [0.27, 0.34, 0.035], facing: [0, 0, 1], r: 0.1, arms: 6, stage: [0.34, 0.67], seed: 3 }, paint: { kind: 'pieces', colors: ['#f4f8ff', '#d4e0f0', '#a8bcd8', '#a8bcd8'], ordered: true }, bone: 'frost1', noShadow: true },
      { shape: { kind: 'frost', at: [0.27, 0.34, 0.035], facing: [0, 0, 1], r: 0.1, arms: 6, stage: [0.67, 1], seed: 3 }, paint: { kind: 'pieces', colors: ['#f4f8ff', '#d4e0f0', '#a8bcd8', '#a8bcd8'], ordered: true }, bone: 'frost2', noShadow: true },
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
      { at: [0.27, 0.34, 0.25], color: '#ffb840', strength: 1.6, range: 1, lit: 'dark', flicker: { by: 0.08, times: 4 } },
    ],
  },
}

/** A stack of cut logs. */
export const WOODPILE: PropDoc = {
  name: 'Woodpile',
  foot: [-0.46, -0.01, -0.3],
  doc: {
    name: 'Woodpile',
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
    camera: { target: [0, 0.32, 0.05], distance: 5, azimuth: 22, elevation: 22, swing: 8 },
    parts: [
      { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [-0.42, 0.05, -0.5], to: [-0.42, 0.05, -0.1], r: 0.045 }, { kind: 'cone', from: [-0.5, 0.05, -0.5], to: [-0.5, 0.05, -0.1], r: 0.045 }, { kind: 'cone', from: [-0.46, 0.13, -0.5], to: [-0.46, 0.13, -0.1], r: 0.045 }] }, paint: { kind: 'faces', top: '#94643e', side: '#6e4630' } },
    ],
  },
}

/** A small fir weighed down with snow. */
export const SNOWY_FIR: PropDoc = {
  name: 'Snowy fir',
  foot: [-1.05, 0, -0.45],
  doc: {
    name: 'Snowy fir',
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
    camera: { target: [0, 0.32, 0.05], distance: 5, azimuth: 22, elevation: 22, swing: 8 },
    parts: [
      { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [-1.05, 0, -0.45], height: 0.12, r: 0.035 }, { kind: 'cylinder', at: [-1.05, 0.1, -0.45], height: 0.4, r: 0.24, rTop: 0.1 }, { kind: 'cylinder', at: [-1.05, 0.34, -0.45], height: 0.34, r: 0.18, rTop: 0.05 }, { kind: 'cylinder', at: [-1.05, 0.56, -0.45], height: 0.3, r: 0.12, rTop: 0.01 }] }, paint: { kind: 'faces', top: '#2c5a44', side: { kind: 'patches', size: 0.08, colors: ['#1a3c30', '#0e2620'] } } },
    ],
  },
}

/** A second small fir weighed down with snow. */
export const SNOWY_FIR_2: PropDoc = {
  name: 'Snowy fir 2',
  foot: [1.1, 0, -0.55],
  doc: {
    name: 'Snowy fir 2',
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
    camera: { target: [0, 0.32, 0.05], distance: 5, azimuth: 22, elevation: 22, swing: 8 },
    parts: [
      { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [1.1, 0, -0.55], height: 0.1, r: 0.03 }, { kind: 'cylinder', at: [1.1, 0.08, -0.55], height: 0.34, r: 0.2, rTop: 0.08 }, { kind: 'cylinder', at: [1.1, 0.28, -0.55], height: 0.3, r: 0.15, rTop: 0.04 }, { kind: 'cylinder', at: [1.1, 0.48, -0.55], height: 0.26, r: 0.1, rTop: 0.01 }] }, paint: { kind: 'faces', top: '#2c5a44', side: { kind: 'patches', size: 0.08, colors: ['#1a3c30', '#0e2620'] } } },
    ],
  },
}

/** A third small fir weighed down with snow. */
export const SNOWY_FIR_3: PropDoc = {
  name: 'Snowy fir 3',
  foot: [-0.75, 0, -0.95],
  doc: {
    name: 'Snowy fir 3',
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
    camera: { target: [0, 0.32, 0.05], distance: 5, azimuth: 22, elevation: 22, swing: 8 },
    parts: [
      { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [-0.75, 0, -0.95], height: 0.1, r: 0.03 }, { kind: 'cylinder', at: [-0.75, 0.08, -0.95], height: 0.3, r: 0.17, rTop: 0.06 }, { kind: 'cylinder', at: [-0.75, 0.26, -0.95], height: 0.26, r: 0.12, rTop: 0.01 }] }, paint: { kind: 'faces', top: '#2c5a44', side: { kind: 'patches', size: 0.08, colors: ['#1a3c30', '#0e2620'] } } },
    ],
  },
}

/** A fence half buried in drifts, its posts leaning. */
export const SNOWY_FENCE: PropDoc = {
  name: 'Snowy fence',
  foot: [0, -0.0679, 0.9163],
  doc: {
    name: 'Snowy fence',
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
    camera: { target: [0, 0.32, 0.05], distance: 5, azimuth: 22, elevation: 22, swing: 8 },
    parts: [
      { shape: { kind: 'fence', path: [[-1.4, 0, 0.75], [-0.7, 0, 1.05], [-0.38, 0, 1.08]], bay: 0.3, height: 0.24, post: 0.03, rails: 2, lean: 0.25, seed: 4 }, paint: { kind: 'pieces', colors: ['#6e4630', '#4a2e22', '#94643e'] } },
      { shape: { kind: 'fence', path: [[0.05, 0, 1.08], [0.7, 0, 1.05], [1.4, 0, 0.8]], bay: 0.3, height: 0.24, post: 0.03, rails: 2, lean: 0.25, sag: 0.3, seed: 6 }, paint: { kind: 'pieces', colors: ['#6e4630', '#4a2e22', '#94643e'] } },
    ],
  },
}

/** A lamp on a short post, glowing warm. */
export const LAMP_POST: PropDoc = {
  name: 'Lamp post',
  foot: [-0.42, 0, 0.42],
  doc: {
    name: 'Lamp post',
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
    camera: { target: [0, 0.32, 0.05], distance: 5, azimuth: 22, elevation: 22, swing: 8 },
    parts: [
      { shape: { kind: 'cylinder', at: [-0.42, 0, 0.42], height: 0.3, r: 0.024 }, paint: '#2a1a18' },
      { shape: { kind: 'lathe', at: [-0.42, 0.3, 0.42], profile: [[0.042, 0], [0.048, 0.024], [0.042, 0.096], [0.018, 0.12], [0.01, 0.144]] }, paint: '#ffe0a0', glow: true, lit: 'dark' },
    ],
    lights: [
      { at: [-0.42, 0.36, 0.48], color: '#ffe0a0', strength: 1.3, range: 0.9, lit: 'dark', flicker: { by: 0.15, times: 6 }, shadows: true },
    ],
  },
}

/** The pieces above as the library lists them. */
export const CABIN_MADE: MadeProp[] = [
  { id: 'winter-drifts', tags: ['snowy', 'night'], kind: 'land', about: 'A square of snowy ground at night, drifts piled deep downwind, with stones', prop: WINTER_DRIFTS },
  { id: 'log-cabin', tags: ['building', 'lamp', 'snowy'], kind: 'prop', group: 'buildings', about: 'A snowed-in log cabin with a lit window growing frost, and smoke from its chimney', prop: LOG_CABIN },
  { id: 'woodpile', tags: ['thing'], kind: 'prop', about: 'A stack of cut logs', prop: WOODPILE },
  { id: 'snowy-fir', tags: ['tree', 'evergreen', 'snowy'], kind: 'prop', about: 'A small fir weighed down with snow', prop: SNOWY_FIR },
  { id: 'snowy-fir-2', tags: ['tree', 'evergreen', 'snowy'], kind: 'prop', about: 'A second small fir weighed down with snow', prop: SNOWY_FIR_2 },
  { id: 'snowy-fir-3', tags: ['tree', 'evergreen', 'snowy'], kind: 'prop', about: 'A third small fir weighed down with snow', prop: SNOWY_FIR_3 },
  { id: 'snowy-fence', tags: ['wall', 'farm', 'snowy'], kind: 'prop', about: 'A fence half buried in drifts, its posts leaning', prop: SNOWY_FENCE },
  { id: 'lamp-post', tags: ['lamp'], kind: 'prop', about: 'A lamp on a short post, glowing warm', prop: LAMP_POST },
]

/** Snowed-in cabin as a land and the props set down on it: what Diorama draws and what Scene Creator opens. */
export const CABIN_PROJECT: SceneProject = {
  kind: 'blobscape-project',
  version: 1,
  name: 'Snowed-in cabin',
  loop: 12,
  land: 'winter-drifts',
  props: [
    { prop: 'log-cabin', at: [0.1, 0, -0.3], turn: 0, size: 1 },
    { prop: 'woodpile', at: [-0.46, -0.01, -0.3], turn: 0, size: 1 },
    { prop: 'snowy-fir', at: [-1.05, 0, -0.45], turn: 0, size: 1 },
    { prop: 'snowy-fir-2', at: [1.1, 0, -0.55], turn: 0, size: 1 },
    { prop: 'snowy-fir-3', at: [-0.75, 0, -0.95], turn: 0, size: 1 },
    { prop: 'snowy-fence', at: [0, -0.0679, 0.9163], turn: 0, size: 1 },
    { prop: 'lamp-post', at: [-0.42, 0, 0.42], turn: 0, size: 1 },
  ],
}
