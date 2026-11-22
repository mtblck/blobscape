import type { PropDoc, SceneProject } from '../../splat-engine/project.ts'
import type { MadeProp } from './garden.ts'

/**
 * The desert canyon (Diorama's canyon scene) as a land and props (docs/scenes-from-props.md): the worn canyon, its mesa,
 * mud and pebbles are the land, and the hoodoos, the arch, the cacti, the agaves, the tree, the bones, the ammonite
 * and the hawk are library props set down on it, each where it stood in the scene.
 * Data only, as a scene description is: see docs/scene-descriptions.md.
 */

/** A desert canyon worn by water: banded cliffs and ledges, scree, a mesa, cracked mud and pebbles. */
export const CANYON_WORN: PropDoc = {
  name: 'Worn canyon',
  foot: [0, 0, 0],
  doc: {
    name: 'Worn canyon',
    loop: 12,
    light: { from: [-0.7, 0.5, 0.5], ambient: 0.55, shadow: 0.65 },
    palette: [
      '#1a0e1e', '#2e1626', '#4a1e2a', '#6e2a2a', '#8e3a26', '#b8542e', '#d8743a', '#e09a5c',
      '#f0c08a', '#fbe4b8', '#c98a52', '#7a5a3a', '#4e3a2a', '#2a3a26', '#3e5a30', '#5e7e3a',
      '#8aa04a', '#3a3a5a', '#5a5a86', '#8e7eb0', '#e8d8c8', '#fff4e0', '#f2b25a',
    ],
    sky: ['#3a3a5a', '#f2b25a'],
    skyReach: 0.8,
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    camera: { target: [0, 0.45, 0], distance: 5.4, azimuth: 14, elevation: 20, swing: 6 },
    air: { haze: { color: '#8e7eb0', from: 1.5, to: 9 }, specks: [{ kind: 'dust', count: 40, from: [-1.5, 0.1, -1.4], to: [1.5, 1.2, 1.4], colors: ['#fbe4b8', '#f0c08a'] }] },
    parts: [
      { shape: { kind: 'land', at: [0, 0, 0], half: [1.6, 1.6], base: 0.25, peaks: [{ at: [-1.25, -0.9], h: 1.05, r: 1 }, { at: [-1.35, 0.4], h: 0.85, r: 0.85 }, { at: [1.3, -0.6], h: 0.95, r: 0.95 }, { at: [1.35, 0.8], h: 0.6, r: 0.7 }, { at: [0, -1.5], h: 0.5, r: 0.8 }], noise: 0.12, drops: 22000, slump: 0.55, beds: [{ thick: 0.12, hard: 0.9 }, { thick: 0.16, hard: 0.25 }, { thick: 0.08, hard: 0.95 }, { thick: 0.17, hard: 0.3 }], seed: 7 }, paint: { kind: 'pieces', colors: ['#b8542e', '#e09a5c', '#8e3a26', '#f0c08a'], line: '#c98a52', ordered: true }, grime: '#6e2a2a' },
      { shape: { kind: 'butte', at: [0.02, 0.28, -1.25], r: 0.36, height: 0.95, beds: [{ thick: 0.12, hard: 0.9 }, { thick: 0.16, hard: 0.25 }, { thick: 0.08, hard: 0.95 }, { thick: 0.17, hard: 0.3 }], wear: 0.35, cap: 0.15, seed: 3 }, paint: { kind: 'pieces', colors: ['#b8542e', '#e09a5c', '#8e3a26', '#f0c08a'], line: '#c98a52', ordered: true } },
      { shape: { kind: 'mud', at: [-0.05, 0.02, 1.05], r: 0.34, plate: 0.13, curl: 0.7, seed: 2 }, paint: { kind: 'pieces', colors: ['#c98a52', '#e09a5c', '#d8743a'], line: '#4e3a2a' }, bare: true },
      { shape: { kind: 'pebbles', path: [[-0.05, 0.06, -0.7], [0.05, 0.06, -0.15], [0.42, 0.06, 0.08], [0.3, 0.07, 0.8], [0.12, 0.06, 1.45]], width: 0.32, count: 70, size: 0.045, seed: 3 }, paint: { kind: 'pieces', colors: ['#8e7eb0', '#e8d8c8', '#7a5a3a', '#5a5a86'] }, noShadow: true },
    ],
  },
}

/** Three hoodoos of banded rock worn back under their caps. */
export const HOODOOS: PropDoc = {
  name: 'Hoodoos',
  foot: [0.4858, 0, -0.2387],
  doc: {
    name: 'Hoodoos',
    loop: 12,
    light: { from: [-0.7, 0.5, 0.5], ambient: 0.55, shadow: 0.65 },
    palette: [
      '#1a0e1e', '#2e1626', '#4a1e2a', '#6e2a2a', '#8e3a26', '#b8542e', '#d8743a', '#e09a5c',
      '#f0c08a', '#fbe4b8', '#c98a52', '#7a5a3a', '#4e3a2a', '#2a3a26', '#3e5a30', '#5e7e3a',
      '#8aa04a', '#3a3a5a', '#5a5a86', '#8e7eb0', '#e8d8c8', '#fff4e0', '#f2b25a',
    ],
    sky: ['#3a3a5a', '#f2b25a'],
    skyReach: 0.8,
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    camera: { target: [0, 0.45, 0], distance: 5.4, azimuth: 14, elevation: 20, swing: 6 },
    parts: [
      { shape: { kind: 'hoodoo', at: [0.42, 0, -0.45], height: 0.6, r: 0.075, seed: 1 }, paint: { kind: 'pieces', colors: ['#e09a5c', '#f0c08a', '#d8743a', '#b8542e', '#8e3a26'], ordered: true } },
      { shape: { kind: 'hoodoo', at: [0.58, 0.04, -0.22], height: 0.44, r: 0.06, seed: 4 }, paint: { kind: 'pieces', colors: ['#e09a5c', '#f0c08a', '#d8743a', '#b8542e', '#8e3a26'], ordered: true } },
      { shape: { kind: 'hoodoo', at: [0.5, 0.05, 0.02], height: 0.3, r: 0.05, seed: 9 }, paint: { kind: 'pieces', colors: ['#e09a5c', '#f0c08a', '#d8743a', '#b8542e', '#8e3a26'], ordered: true } },
    ],
  },
}

/** A fin of banded rock with an arch worn through its soft bed. */
export const STONE_ARCH: PropDoc = {
  name: 'Canyon arch',
  foot: [-0.26, 0.02, -0.71],
  doc: {
    name: 'Canyon arch',
    loop: 12,
    light: { from: [-0.7, 0.5, 0.5], ambient: 0.55, shadow: 0.65 },
    palette: [
      '#1a0e1e', '#2e1626', '#4a1e2a', '#6e2a2a', '#8e3a26', '#b8542e', '#d8743a', '#e09a5c',
      '#f0c08a', '#fbe4b8', '#c98a52', '#7a5a3a', '#4e3a2a', '#2a3a26', '#3e5a30', '#5e7e3a',
      '#8aa04a', '#3a3a5a', '#5a5a86', '#8e7eb0', '#e8d8c8', '#fff4e0', '#f2b25a',
    ],
    sky: ['#3a3a5a', '#f2b25a'],
    skyReach: 0.8,
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    camera: { target: [0, 0.45, 0], distance: 5.4, azimuth: 14, elevation: 20, swing: 6 },
    parts: [
      { shape: { kind: 'arch', from: [-0.5, 0.02, -0.5], to: [-0.02, 0.02, -0.92], height: 0.72, thick: 0.17, beds: [{ thick: 0.12, hard: 0.9 }, { thick: 0.16, hard: 0.25 }, { thick: 0.08, hard: 0.95 }, { thick: 0.17, hard: 0.3 }], seed: 5 }, paint: { kind: 'pieces', colors: ['#b8542e', '#e09a5c', '#8e3a26', '#f0c08a'], line: '#c98a52', ordered: true } },
    ],
  },
}

/** A ribbed saguaro cactus with arms bending up. */
export const SAGUARO: PropDoc = {
  name: 'Saguaro',
  foot: [0.88, 0.1, 0.32],
  doc: {
    name: 'Saguaro',
    loop: 12,
    light: { from: [-0.7, 0.5, 0.5], ambient: 0.55, shadow: 0.65 },
    palette: [
      '#1a0e1e', '#2e1626', '#4a1e2a', '#6e2a2a', '#8e3a26', '#b8542e', '#d8743a', '#e09a5c',
      '#f0c08a', '#fbe4b8', '#c98a52', '#7a5a3a', '#4e3a2a', '#2a3a26', '#3e5a30', '#5e7e3a',
      '#8aa04a', '#3a3a5a', '#5a5a86', '#8e7eb0', '#e8d8c8', '#fff4e0', '#f2b25a',
    ],
    sky: ['#3a3a5a', '#f2b25a'],
    skyReach: 0.8,
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    camera: { target: [0, 0.45, 0], distance: 5.4, azimuth: 14, elevation: 20, swing: 6 },
    parts: [
      { shape: { kind: 'cactus', at: [0.88, 0.1, 0.32], height: 0.62, r: 0.06, arms: 2, seed: 1 }, paint: { kind: 'faces', top: '#8aa04a', side: '#5e7e3a' }, ink: { kind: 'stipple', amount: 0.3, color: '#2a3a26' } },
    ],
  },
}

/** A smaller ribbed saguaro cactus. */
export const SAGUARO_SMALL: PropDoc = {
  name: 'Saguaro 2',
  foot: [-0.25, 0.03, -0.25],
  doc: {
    name: 'Saguaro 2',
    loop: 12,
    light: { from: [-0.7, 0.5, 0.5], ambient: 0.55, shadow: 0.65 },
    palette: [
      '#1a0e1e', '#2e1626', '#4a1e2a', '#6e2a2a', '#8e3a26', '#b8542e', '#d8743a', '#e09a5c',
      '#f0c08a', '#fbe4b8', '#c98a52', '#7a5a3a', '#4e3a2a', '#2a3a26', '#3e5a30', '#5e7e3a',
      '#8aa04a', '#3a3a5a', '#5a5a86', '#8e7eb0', '#e8d8c8', '#fff4e0', '#f2b25a',
    ],
    sky: ['#3a3a5a', '#f2b25a'],
    skyReach: 0.8,
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    camera: { target: [0, 0.45, 0], distance: 5.4, azimuth: 14, elevation: 20, swing: 6 },
    parts: [
      { shape: { kind: 'cactus', at: [-0.25, 0.03, -0.25], height: 0.42, r: 0.045, arms: 1, seed: 6 }, paint: { kind: 'faces', top: '#8aa04a', side: '#5e7e3a' } },
    ],
  },
}

/** An agave rosette of pointed leaves. */
export const AGAVE: PropDoc = {
  name: 'Agave',
  foot: [0.9394, 0, 1.3072],
  doc: {
    name: 'Agave',
    loop: 12,
    light: { from: [-0.7, 0.5, 0.5], ambient: 0.55, shadow: 0.65 },
    palette: [
      '#1a0e1e', '#2e1626', '#4a1e2a', '#6e2a2a', '#8e3a26', '#b8542e', '#d8743a', '#e09a5c',
      '#f0c08a', '#fbe4b8', '#c98a52', '#7a5a3a', '#4e3a2a', '#2a3a26', '#3e5a30', '#5e7e3a',
      '#8aa04a', '#3a3a5a', '#5a5a86', '#8e7eb0', '#e8d8c8', '#fff4e0', '#f2b25a',
    ],
    sky: ['#3a3a5a', '#f2b25a'],
    skyReach: 0.8,
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    camera: { target: [0, 0.45, 0], distance: 5.4, azimuth: 14, elevation: 20, swing: 6 },
    parts: [
      { shape: { kind: 'rosette', at: [0.95, 0.06, 1.3], r: 0.13, leaves: 21, seed: 2 }, paint: { kind: 'split', axis: 'y', at: 0.09, below: '#3e5a30', above: '#8aa04a' }, noShadow: true },
    ],
  },
}

/** A smaller agave rosette. */
export const AGAVE_SMALL: PropDoc = {
  name: 'Agave 2',
  foot: [-0.991, -0.03, 1.2647],
  doc: {
    name: 'Agave 2',
    loop: 12,
    light: { from: [-0.7, 0.5, 0.5], ambient: 0.55, shadow: 0.65 },
    palette: [
      '#1a0e1e', '#2e1626', '#4a1e2a', '#6e2a2a', '#8e3a26', '#b8542e', '#d8743a', '#e09a5c',
      '#f0c08a', '#fbe4b8', '#c98a52', '#7a5a3a', '#4e3a2a', '#2a3a26', '#3e5a30', '#5e7e3a',
      '#8aa04a', '#3a3a5a', '#5a5a86', '#8e7eb0', '#e8d8c8', '#fff4e0', '#f2b25a',
    ],
    sky: ['#3a3a5a', '#f2b25a'],
    skyReach: 0.8,
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    camera: { target: [0, 0.45, 0], distance: 5.4, azimuth: 14, elevation: 20, swing: 6 },
    parts: [
      { shape: { kind: 'rosette', at: [-1, 0.03, 1.28], r: 0.1, leaves: 16, seed: 5 }, paint: { kind: 'split', axis: 'y', at: 0.09, below: '#3e5a30', above: '#8e7eb0' }, noShadow: true },
    ],
  },
}

/** A gnarled desert tree, swaying a little. */
export const DESERT_TREE: PropDoc = {
  name: 'Desert tree',
  foot: [-0.4398, -0.01, 0.7602],
  doc: {
    name: 'Desert tree',
    loop: 12,
    light: { from: [-0.7, 0.5, 0.5], ambient: 0.55, shadow: 0.65 },
    palette: [
      '#1a0e1e', '#2e1626', '#4a1e2a', '#6e2a2a', '#8e3a26', '#b8542e', '#d8743a', '#e09a5c',
      '#f0c08a', '#fbe4b8', '#c98a52', '#7a5a3a', '#4e3a2a', '#2a3a26', '#3e5a30', '#5e7e3a',
      '#8aa04a', '#3a3a5a', '#5a5a86', '#8e7eb0', '#e8d8c8', '#fff4e0', '#f2b25a',
    ],
    sky: ['#3a3a5a', '#f2b25a'],
    skyReach: 0.8,
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    camera: { target: [0, 0.45, 0], distance: 5.4, azimuth: 14, elevation: 20, swing: 6 },
    bones: [
      { name: 'tree', at: [-0.45, 0.05, 0.75] },
    ],
    parts: [
      { shape: { kind: 'tree', at: [-0.45, 0.05, 0.75], height: 0.22, crown: [0.32, 0.18, 0.28], r: 0.045, points: 110, seed: 4 }, paint: '#4e3a2a', bone: 'tree' },
      { shape: { kind: 'tree', at: [-0.45, 0.05, 0.75], height: 0.22, crown: [0.32, 0.18, 0.28], r: 0.045, points: 110, leaves: 0.045, only: 'leaves', seed: 4 }, paint: { kind: 'speckle', size: 0.04, colors: ['#8aa04a', '#5e7e3a', '#3e5a30'] }, bone: 'tree', noShadow: true },
    ],
    moves: [
      { kind: 'sway', bone: 'tree', axis: 'x', degrees: 1.2, times: 2, wind: 4 },
    ],
  },
}

/** A horned skull and a ribcage bleached by the sun. */
export const BLEACHED_BONES: PropDoc = {
  name: 'Bleached bones',
  foot: [-0.0221, -0.0991, 1.1071],
  doc: {
    name: 'Bleached bones',
    loop: 12,
    light: { from: [-0.7, 0.5, 0.5], ambient: 0.55, shadow: 0.65 },
    palette: [
      '#1a0e1e', '#2e1626', '#4a1e2a', '#6e2a2a', '#8e3a26', '#b8542e', '#d8743a', '#e09a5c',
      '#f0c08a', '#fbe4b8', '#c98a52', '#7a5a3a', '#4e3a2a', '#2a3a26', '#3e5a30', '#5e7e3a',
      '#8aa04a', '#3a3a5a', '#5a5a86', '#8e7eb0', '#e8d8c8', '#fff4e0', '#f2b25a',
    ],
    sky: ['#3a3a5a', '#f2b25a'],
    skyReach: 0.8,
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    camera: { target: [0, 0.45, 0], distance: 5.4, azimuth: 14, elevation: 20, swing: 6 },
    parts: [
      { shape: { kind: 'join', shapes: [{ kind: 'ball', at: [0.62, 0.09, 1], r: [0.08, 0.07, 0.1] }, { kind: 'cone', from: [0.62, 0.08, 1.04], to: [0.62, 0.04, 1.16], r: 0.05, rTo: 0.03 }] }, paint: '#e8d8c8' },
      { shape: { kind: 'sphere', at: [0.59, 0.1, 1.08], r: 0.018 }, paint: '#2e1626' },
      { shape: { kind: 'sphere', at: [0.65, 0.1, 1.08], r: 0.018 }, paint: '#2e1626' },
      { shape: { kind: 'horn', at: [0.56, 0.13, 0.98], dir: [-0.7, 0.6, -0.2], length: 0.3, r: 0.032, curl: 0.95, twist: 0.35, ridges: 14 }, paint: '#fbe4b8' },
      { shape: { kind: 'horn', at: [0.68, 0.13, 0.98], dir: [0.7, 0.6, -0.2], length: 0.3, r: 0.032, curl: 0.95, twist: -0.35, ridges: 14 }, paint: '#fbe4b8' },
      { shape: { kind: 'ribs', from: [-0.78, 0.13, 1.22], to: [-0.38, 0.11, 1.02], count: 6, span: 0.15, drop: 0.16, r: 0.012 }, paint: '#e8d8c8', noShadow: true },
    ],
  },
}

/** A coiled ammonite fossil shell. */
export const AMMONITE: PropDoc = {
  name: 'Ammonite',
  foot: [-0.1894, -0.0215, 1.4239],
  doc: {
    name: 'Ammonite',
    loop: 12,
    light: { from: [-0.7, 0.5, 0.5], ambient: 0.55, shadow: 0.65 },
    palette: [
      '#1a0e1e', '#2e1626', '#4a1e2a', '#6e2a2a', '#8e3a26', '#b8542e', '#d8743a', '#e09a5c',
      '#f0c08a', '#fbe4b8', '#c98a52', '#7a5a3a', '#4e3a2a', '#2a3a26', '#3e5a30', '#5e7e3a',
      '#8aa04a', '#3a3a5a', '#5a5a86', '#8e7eb0', '#e8d8c8', '#fff4e0', '#f2b25a',
    ],
    sky: ['#3a3a5a', '#f2b25a'],
    skyReach: 0.8,
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    camera: { target: [0, 0.45, 0], distance: 5.4, azimuth: 14, elevation: 20, swing: 6 },
    parts: [
      { shape: { kind: 'shell', at: [-0.2, 0.09, 1.42], size: 0.2, turns: 3, facing: 20 }, paint: { kind: 'pieces', colors: ['#e8d8c8', '#c98a52'], ordered: true } },
    ],
  },
}

/** A hawk circling high overhead. */
export const CIRCLING_HAWK: PropDoc = {
  name: 'Circling hawk',
  foot: [0.75, 1.628, -0.254],
  doc: {
    name: 'Circling hawk',
    loop: 12,
    light: { from: [-0.7, 0.5, 0.5], ambient: 0.55, shadow: 0.65 },
    palette: [
      '#1a0e1e', '#2e1626', '#4a1e2a', '#6e2a2a', '#8e3a26', '#b8542e', '#d8743a', '#e09a5c',
      '#f0c08a', '#fbe4b8', '#c98a52', '#7a5a3a', '#4e3a2a', '#2a3a26', '#3e5a30', '#5e7e3a',
      '#8aa04a', '#3a3a5a', '#5a5a86', '#8e7eb0', '#e8d8c8', '#fff4e0', '#f2b25a',
    ],
    sky: ['#3a3a5a', '#f2b25a'],
    skyReach: 0.8,
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    camera: { target: [0, 0.45, 0], distance: 5.4, azimuth: 14, elevation: 20, swing: 6 },
    bones: [
      { name: 'sky', at: [0, 1.7, -0.2] },
      { name: 'hawk', at: [0.75, 1.7, -0.2], parent: 'sky' },
      { name: 'wingL', at: [0.75, 1.7, -0.2], parent: 'hawk' },
      { name: 'wingR', at: [0.75, 1.7, -0.2], parent: 'hawk' },
    ],
    parts: [
      { shape: { kind: 'join', shapes: [{ kind: 'ball', at: [0.75, 1.7, -0.2], r: [0.025, 0.02, 0.06] }, { kind: 'cone', from: [0.75, 1.7, -0.26], to: [0.75, 1.69, -0.32], r: 0.02, rTo: 0.006 }] }, paint: '#2e1626', bone: 'hawk', noShadow: true },
      { shape: { kind: 'cone', from: [0.75, 1.7, -0.2], to: [0.6, 1.72, -0.22], r: 0.02, rTo: 0.006 }, paint: '#2e1626', bone: 'wingL', noShadow: true },
      { shape: { kind: 'cone', from: [0.75, 1.7, -0.2], to: [0.9, 1.72, -0.22], r: 0.02, rTo: 0.006 }, paint: '#2e1626', bone: 'wingR', noShadow: true },
    ],
    moves: [
      { kind: 'spin', bone: 'sky', axis: 'y', times: 1 },
      { kind: 'sway', bone: 'wingL', axis: 'z', degrees: 14, times: 6 },
      { kind: 'sway', bone: 'wingR', axis: 'z', degrees: -14, times: 6 },
    ],
  },
}

/** The pieces above as the library lists them. */
export const CANYON_MADE: MadeProp[] = [
  { id: 'canyon-worn', tags: ['sandy', 'rocky'], kind: 'land', about: 'A desert canyon worn by water: banded cliffs and ledges, scree, a mesa, cracked mud and pebbles', prop: CANYON_WORN },
  { id: 'hoodoos', tags: ['rock', 'sandy'], kind: 'prop', about: 'Three hoodoos of banded rock worn back under their caps', prop: HOODOOS },
  { id: 'stone-arch', tags: ['rock', 'sandy'], kind: 'prop', about: 'A fin of banded rock with an arch worn through its soft bed', prop: STONE_ARCH },
  { id: 'saguaro', tags: ['plant', 'sandy'], kind: 'prop', about: 'A ribbed saguaro cactus with arms bending up', prop: SAGUARO },
  { id: 'saguaro-small', tags: ['plant', 'sandy'], kind: 'prop', about: 'A smaller ribbed saguaro cactus', prop: SAGUARO_SMALL },
  { id: 'agave', tags: ['plant', 'sandy'], kind: 'prop', about: 'An agave rosette of pointed leaves', prop: AGAVE },
  { id: 'agave-small', tags: ['plant', 'sandy'], kind: 'prop', about: 'A smaller agave rosette', prop: AGAVE_SMALL },
  { id: 'desert-tree', tags: ['tree', 'leafy', 'sandy'], kind: 'prop', about: 'A gnarled desert tree, swaying a little', prop: DESERT_TREE },
  { id: 'bleached-bones', tags: ['thing', 'sandy'], kind: 'prop', about: 'A horned skull and a ribcage bleached by the sun', prop: BLEACHED_BONES },
  { id: 'ammonite', tags: ['thing', 'rock'], kind: 'prop', about: 'A coiled ammonite fossil shell', prop: AMMONITE },
  { id: 'circling-hawk', tags: ['animal', 'floats'], kind: 'prop', group: 'living', about: 'A hawk circling high overhead', prop: CIRCLING_HAWK },
]

/** Desert canyon as a land and the props set down on it: what Diorama draws and what Scene Creator opens. */
export const CANYON_PROJECT: SceneProject = {
  kind: 'blobscape-project',
  version: 1,
  name: 'Desert canyon',
  loop: 12,
  land: 'canyon-worn',
  props: [
    { prop: 'hoodoos', at: [0.4858, 0, -0.2387], turn: 0, size: 1 },
    { prop: 'stone-arch', at: [-0.26, 0.02, -0.71], turn: 0, size: 1 },
    { prop: 'saguaro', at: [0.88, 0.1, 0.32], turn: 0, size: 1 },
    { prop: 'saguaro-small', at: [-0.25, 0.03, -0.25], turn: 0, size: 1 },
    { prop: 'agave', at: [0.9394, 0, 1.3072], turn: 0, size: 1 },
    { prop: 'agave-small', at: [-0.991, -0.03, 1.2647], turn: 0, size: 1 },
    { prop: 'desert-tree', at: [-0.4398, -0.01, 0.7602], turn: 0, size: 1 },
    { prop: 'bleached-bones', at: [-0.0221, -0.0991, 1.1071], turn: 0, size: 1 },
    { prop: 'ammonite', at: [-0.1894, -0.0215, 1.4239], turn: 0, size: 1 },
    { prop: 'circling-hawk', at: [0.75, 1.628, -0.254], turn: 0, size: 1 },
  ],
}
