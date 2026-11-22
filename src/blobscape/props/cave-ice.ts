import type { PropDoc, SceneProject } from '../../splat-engine/project.ts'
import type { MadeProp } from './garden.ts'

/**
 * The crystal cave (Diorama's cave scene) as a land and props (docs/scenes-from-props.md): the cave with its icicles,
 * drips, flowstone and pool is the land, and the columns, the geode, the crystals and the lantern are library props set
 * down in it, each where it stood in the scene.
 * Data only, as a scene description is: see docs/scene-descriptions.md.
 */

/** An ice cave cut open at night, icicles on its broken rim, stalactites and stalagmites, flowstone and a pool, water dripping. */
export const ICE_CAVE: PropDoc = {
  name: 'Ice cave',
  foot: [0, 0, 0],
  doc: {
    name: 'Ice cave',
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
    camera: { target: [0, 0.65, -0.1], distance: 5, azimuth: 16, elevation: 14, swing: 6 },
    air: { haze: { color: '#0e1630', from: 1.5, to: 8 }, specks: [{ kind: 'dust', count: 50, from: [-1.4, 0.2, -1.1], to: [1.4, 1.5, 0.6], colors: ['#d4ecf4', '#e8a8ec'], glow: true }] },
    bones: [
      { name: 'drop0', at: [-0.62, 1.05, 0.1] },
      { name: 'drop1', at: [-0.62, 1.05, 0.1] },
    ],
    parts: [
      { shape: { kind: 'rough', shape: { kind: 'cylinder', at: [0, -0.3, -0.1], height: 0.3, r: 1.85 }, by: 0.03, scale: 0.4 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.3, colors: ['#45405c', '#2e2a44', '#615a78'] }, side: { kind: 'bands', axis: 'y', size: 0.06, colors: ['#2e2a44', '#1e1a30', '#45405c'] } }, ink: { kind: 'cracks', amount: 0.3 } },
      { shape: { kind: 'rough', shape: { kind: 'cut', shape: { kind: 'cut', shape: { kind: 'cut', shape: { kind: 'sphere', at: [0, -0.25, -0.15], r: 1.92 }, hole: { kind: 'ball', at: [0, -0.25, -0.15], r: [1.74, 1.8, 1.62] } }, hole: { kind: 'box', at: [0, 1, 1.4], half: [2.2, 2.2, 1.25] } }, hole: { kind: 'box', at: [0, -1.2, 0], half: [2.2, 1.15, 2.2] } }, by: 0.07, scale: 0.35 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.25, colors: ['#d4ecf4', '#a0c8e0'] }, side: { kind: 'patches', size: 0.3, colors: ['#33558a', '#243a66', '#4a78aa'] }, under: { kind: 'patches', size: 0.3, colors: ['#243a66', '#18264a'] } }, grime: '#0e1630' },
      { shape: { kind: 'icicles', on: { kind: 'rough', shape: { kind: 'cut', shape: { kind: 'cut', shape: { kind: 'cut', shape: { kind: 'sphere', at: [0, -0.25, -0.15], r: 1.92 }, hole: { kind: 'ball', at: [0, -0.25, -0.15], r: [1.74, 1.8, 1.62] } }, hole: { kind: 'box', at: [0, 1, 1.4], half: [2.2, 2.2, 1.25] } }, hole: { kind: 'box', at: [0, -1.2, 0], half: [2.2, 1.15, 2.2] } }, by: 0.07, scale: 0.35 }, every: 0.07, length: 0.32, above: 0.3, seed: 3 }, paint: { kind: 'pieces', colors: ['#d4ecf4', '#a0c8e0', '#f4fbff'] }, noShadow: true },
      { shape: { kind: 'drips', at: [0.4, 0, -0.55], r: 0.65, roof: 1.45, count: 20, length: 0.7, seed: 7 }, paint: { kind: 'pieces', colors: ['#a0c8e0', '#6fa0c8', '#d4ecf4'] }, grime: '#33558a' },
      { shape: { kind: 'flowstone', at: [-1.2, 1, -0.85], along: [1, 0.9], width: 0.6, drop: 0.8, folds: 5, seed: 2 }, paint: { kind: 'bands', axis: 'y', size: 0.06, colors: ['#a0c8e0', '#6fa0c8', '#d4ecf4'] } },
      { shape: { kind: 'cylinder', at: [-0.35, -0.02, 0.75], height: 0.05, r: 0.62 }, paint: '#22585a', glass: { see: 0.6, mirror: 0.45, top: true }, bare: true },
      { shape: { kind: 'sphere', at: [-0.62, 1.05, 0.1], r: 0.018 }, paint: '#d4ecf4', bone: 'drop0', glow: true, noShadow: true },
      { shape: { kind: 'sphere', at: [-0.62, 1.05, 0.1], r: 0.018 }, paint: '#d4ecf4', bone: 'drop1', glow: true, noShadow: true },
    ],
    moves: [
      { kind: 'drift', bone: 'drop0', by: [0, -1.05, 0], times: 4 },
      { kind: 'drift', bone: 'drop1', by: [0, -1.05, 0], times: 4, phase: 0.5 },
    ],
    lights: [
      { at: [-0.15, 0.25, -0.15], color: '#6fa0c8', strength: 1.2, range: 1, lit: 'always' },
    ],
  },
}

/** A cluster of hexagonal basalt columns stepping up. */
export const BASALT_COLUMNS: PropDoc = {
  name: 'Basalt columns',
  foot: [-0.95, -0.054, 0.35],
  doc: {
    name: 'Basalt columns',
    loop: 12,
    light: { from: [0.2, 0.7, 0.8], ambient: 0.55, shadow: 0.55 },
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
    camera: { target: [0, 0.65, -0.1], distance: 5, azimuth: 16, elevation: 14, swing: 6 },
    parts: [
      { shape: { kind: 'columns', at: [-0.95, 0, 0.35], r: 0.62, cell: 0.17, height: 0.62, rise: 'steps', seed: 5 }, paint: { kind: 'faces', top: { kind: 'pieces', colors: ['#8a84a0', '#a0c8e0', '#615a78'] }, side: { kind: 'pieces', colors: ['#45405c', '#615a78', '#2e2a44'] } }, grime: '#16353a' },
    ],
  },
}

/** A geode broken open on a rock, banded and lined with crystals. */
export const GEODE: PropDoc = {
  name: 'Geode',
  foot: [-0.4, -0.036, -1.0368],
  doc: {
    name: 'Geode',
    loop: 12,
    light: { from: [0.2, 0.7, 0.8], ambient: 0.55, shadow: 0.55 },
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
    camera: { target: [0, 0.65, -0.1], distance: 5, azimuth: 16, elevation: 14, swing: 6 },
    parts: [
      { shape: { kind: 'rough', shape: { kind: 'box', at: [-0.4, 0.2, -1.1], half: [0.45, 0.2, 0.28], round: 0.08 }, by: 0.03, scale: 0.15 }, paint: { kind: 'faces', top: '#615a78', side: '#2e2a44' } },
      { shape: { kind: 'geode', at: [-0.4, 0.68, -1], r: 0.32, open: [0.15, 0.35, 1], bands: 3, seed: 4 }, paint: { kind: 'pieces', colors: ['#615a78', '#c070d0', '#e8a8ec'], line: '#9446ac', ordered: true } },
    ],
  },
}

/** Two clusters of glowing crystals. */
export const CRYSTAL_CLUSTER: PropDoc = {
  name: 'Glowing crystals',
  foot: [0.4496, -0.1319, -0.3431],
  doc: {
    name: 'Glowing crystals',
    loop: 12,
    light: { from: [0.2, 0.7, 0.8], ambient: 0.55, shadow: 0.55 },
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
    camera: { target: [0, 0.65, -0.1], distance: 5, azimuth: 16, elevation: 14, swing: 6 },
    parts: [
      { shape: { kind: 'crystals', at: [0.95, 0, -0.35], count: 11, size: 0.68, r: 0.08, spread: 55, chips: 2, seed: 9 }, paint: { kind: 'pieces', colors: ['#c070d0', '#e8a8ec', '#9446ac'] } },
      { shape: { kind: 'crystals', at: [-0.15, 0, -0.2], count: 5, size: 0.3, r: 0.05, spread: 45, seed: 13 }, paint: { kind: 'pieces', colors: ['#6fa0c8', '#a0c8e0'] } },
    ],
    lights: [
      { at: [0.75, 0.5, 0], color: '#c070d0', strength: 2.6, range: 1.6, lit: 'always', flicker: { by: 0.15, times: 3 } },
    ],
  },
}

/** Glowing crystals that grow from nothing, hold and shrink away. */
export const GROWING_CRYSTALS: PropDoc = {
  name: 'Growing crystals',
  foot: [0.351, 0, 0.5456],
  doc: {
    name: 'Growing crystals',
    loop: 12,
    light: { from: [0.2, 0.7, 0.8], ambient: 0.55, shadow: 0.55 },
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
    camera: { target: [0, 0.65, -0.1], distance: 5, azimuth: 16, elevation: 14, swing: 6 },
    bones: [
      { name: 'sprout', at: [0.35, 0.02, 0.55] },
    ],
    parts: [
      { shape: { kind: 'crystals', at: [0.35, 0.02, 0.55], count: 6, size: 0.28, r: 0.04, spread: 40, seed: 17 }, paint: { kind: 'pieces', colors: ['#3a8a84', '#a0c8e0'] }, bone: 'sprout', glow: true },
    ],
    moves: [
      { kind: 'sprout', bone: 'sprout', times: 1 },
    ],
  },
}

/** A single tall crystal, chipped. */
export const LONE_CRYSTAL: PropDoc = {
  name: 'Lone crystal',
  foot: [1.0992, -0.072, 0.4839],
  doc: {
    name: 'Lone crystal',
    loop: 12,
    light: { from: [0.2, 0.7, 0.8], ambient: 0.55, shadow: 0.55 },
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
    camera: { target: [0, 0.65, -0.1], distance: 5, azimuth: 16, elevation: 14, swing: 6 },
    parts: [
      { shape: { kind: 'crystal', at: [1.15, 0, 0.45], dir: [-0.3, 1, 0.2], length: 0.36, r: 0.07, chips: 3, seed: 1 }, paint: '#8a84a0' },
    ],
  },
}

/** A lantern standing on a stone. */
export const CAVE_LANTERN: PropDoc = {
  name: 'Cave lantern',
  foot: [0.65, -0.028, 0.6],
  doc: {
    name: 'Cave lantern',
    loop: 12,
    light: { from: [0.2, 0.7, 0.8], ambient: 0.55, shadow: 0.55 },
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
    camera: { target: [0, 0.65, -0.1], distance: 5, azimuth: 16, elevation: 14, swing: 6 },
    parts: [
      { shape: { kind: 'rough', shape: { kind: 'ball', at: [0.65, 0.07, 0.6], r: [0.14, 0.08, 0.12] }, by: 0.015, scale: 0.08 }, paint: '#45405c' },
      { shape: { kind: 'lathe', at: [0.65, 0.14, 0.6], profile: [[0.04, 0], [0.045, 0.02], [0.04, 0.11], [0.02, 0.14], [0.01, 0.16]] }, paint: '#ffe2a0', glow: true, lit: 'dark' },
    ],
    lights: [
      { at: [0.65, 0.3, 0.62], color: '#f2b25a', strength: 1.4, range: 1.1, lit: 'dark', flicker: { by: 0.2, times: 8 }, shadows: true },
    ],
  },
}

/** The pieces above as the library lists them. */
export const CAVE_ICE_MADE: MadeProp[] = [
  { id: 'ice-cave', tags: ['rocky', 'night'], kind: 'land', about: 'An ice cave cut open at night, icicles on its broken rim, stalactites and stalagmites, flowstone and a pool, water dripping', prop: ICE_CAVE },
  { id: 'basalt-columns', tags: ['rock'], kind: 'prop', about: 'A cluster of hexagonal basalt columns stepping up', prop: BASALT_COLUMNS },
  { id: 'geode', tags: ['rock', 'crystal'], kind: 'prop', about: 'A geode broken open on a rock, banded and lined with crystals', prop: GEODE },
  { id: 'crystal-cluster', tags: ['crystal', 'magic', 'lamp'], kind: 'prop', about: 'Two clusters of glowing crystals', prop: CRYSTAL_CLUSTER },
  { id: 'growing-crystals', tags: ['crystal', 'magic'], kind: 'prop', about: 'Glowing crystals that grow from nothing, hold and shrink away', prop: GROWING_CRYSTALS },
  { id: 'lone-crystal', tags: ['crystal'], kind: 'prop', about: 'A single tall crystal, chipped', prop: LONE_CRYSTAL },
  { id: 'cave-lantern', tags: ['lamp'], kind: 'prop', about: 'A lantern standing on a stone', prop: CAVE_LANTERN },
]

/** Crystal cave as a land and the props set down on it: what Diorama draws and what Scene Creator opens. */
export const CAVE_PROJECT: SceneProject = {
  kind: 'blobscape-project',
  version: 1,
  name: 'Crystal cave',
  loop: 12,
  land: 'ice-cave',
  props: [
    { prop: 'basalt-columns', at: [-0.95, -0.054, 0.35], turn: 0, size: 1 },
    { prop: 'geode', at: [-0.4, -0.036, -1.0368], turn: 0, size: 1 },
    { prop: 'crystal-cluster', at: [0.4496, -0.1319, -0.3431], turn: 0, size: 1 },
    { prop: 'growing-crystals', at: [0.351, 0, 0.5456], turn: 0, size: 1 },
    { prop: 'lone-crystal', at: [1.0992, -0.072, 0.4839], turn: 0, size: 1 },
    { prop: 'cave-lantern', at: [0.65, -0.028, 0.6], turn: 0, size: 1 },
  ],
}
