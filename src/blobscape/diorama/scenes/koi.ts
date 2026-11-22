import type { PropDoc, SceneProject } from '../../../splat-engine/project.ts'

/**
 * The koi pond in a moss garden, made from props (Matt, 2026-11-21): the land is the pond itself (its banks, its
 * water and the koi circling in it), and everything else is a library prop set down on it (props/garden.ts): two
 * stone lanterns, a cherry tree in bloom, bamboo, irises, lily pads, stones round the edge, stepping posts and a slab.
 * A change to one of those props reaches this scene, and Scene Creator opens it as these same pieces.
 *
 * It has no rain of its own: Diorama starts it under the shared Light rain (skyRecipes.ts), whose drops ring the
 * water where they land; any other weather, or none, can be picked instead.
 * Data only (it would read the same as a .json file): see docs/scenes-from-props.md.
 */

/** The pond and its koi: a bank of moss and stone round two joined hollows of water, with five koi leaving wakes. Petals from the cherry tree drift down over it. */
export const KOI_POND: PropDoc = {
  name: 'Koi pond',
  foot: [0, 0, 0],
  doc: {
    name: 'Koi pond',
    loop: 12,
    light: { from: [0.25, 1, 0.4], ambient: 0.72, shadow: 0.35, ramp: 0.2 },
    palette: [
      '#0d1418', '#16242a', '#24363c', '#1a3022', '#284a2e', '#3c6838', '#5a8a44', '#86ac5a',
      '#343c42', '#4e585e', '#6c787c', '#929c9e', '#bcc4c2', '#103038', '#184650', '#286470',
      '#4a8a94', '#84b8ba', '#34261e', '#58402e', '#d24c2a', '#ec8038', '#b05c7a', '#e08ca6',
      '#f6c2d0', '#f6a23c', '#ffd27a', '#fff0c4', '#f0e8d6', '#5a6c7e', '#8a9ca8', '#b6c2c6',
    ],
    sky: ['#5a6c7e', '#b6c2c6'],
    look: { dither: 0.5, glow: 1.2, outline: true, edges: true },
    camera: { target: [0, 0.36, 0.1], distance: 3.65, azimuth: 14, elevation: 21, swing: 8 },
    // the shared moon and stars, out only at night (Diorama's koi pond is a day as written: `byDay`), in the pond's own pale colors
    heavens: {
      moon: { at: [-0.19, 1.32, -1.29], r: 0.085, colors: ['#f0e8d6', '#bcc4c2'] },
      stars: { count: 26, from: [-1.9, 0.95, -1.7], to: [1.9, 1.55, -1.2], size: 0.012, colors: ['#fff0c4', '#f0e8d6', '#bcc4c2'] },
    },
    air: { haze: { color: '#8a9ca8', from: 1.5, to: 10 }, specks: [{ kind: 'leaves', count: 14, size: 0.012, from: [0.2, 0, -1.3], to: [1.5, 1.2, 0.2], colors: ['#f6c2d0', '#e08ca6', '#f0e8d6'], land: true, wind: [-0.25, 0.1] }] },
    water: {
      level: -0.045, from: [-1.3, -0.72], to: [1.3, 1.1], color: '#184650', sky: ['#8a9ca8', '#b6c2c6'], clear: 0.25, speed: 0.3, damping: 0.6, cell: 0.018, ripple: 6, deep: 0.05, splash: { r: 0.07, depth: 0.02 },
      bodies: [
        { bone: 'koi0', at: [-0.03, -0.09, 0.005], r: 0.057 },
        { bone: 'koi0', at: [-0.03, -0.09, 0.155], r: 0.051 },
        { bone: 'koi1', at: [0.48, -0.085, 0.134], r: 0.05 },
        { bone: 'koi1', at: [0.48, -0.085, 0.266], r: 0.045 },
        { bone: 'koi2', at: [0.49, -0.094, 0.019], r: 0.062 },
        { bone: 'koi2', at: [0.49, -0.094, 0.181], r: 0.055 },
        { bone: 'koi3', at: [0.77, -0.079, 0.107], r: 0.043 },
        { bone: 'koi3', at: [0.77, -0.079, -0.007], r: 0.039 },
        { bone: 'koi4', at: [-0.3, -0.081, 0.09], r: 0.046 },
        { bone: 'koi4', at: [-0.3, -0.081, 0.21], r: 0.041 },
      ],
    },
    bones: [
      { name: 'koi0', at: [-0.35, -0.09, 0.08] },
      { name: 'tail0', at: [-0.03, -0.09, 0.2], parent: 'koi0' },
      { name: 'koi1', at: [0.2, -0.085, 0.2] },
      { name: 'tail1', at: [0.48, -0.085, 0.306], parent: 'koi1' },
      { name: 'koi2', at: [0.05, -0.094, 0.1] },
      { name: 'tail2', at: [0.49, -0.094, 0.23], parent: 'koi2' },
      { name: 'koi3', at: [0.55, -0.079, 0.05] },
      { name: 'tail3', at: [0.77, -0.079, -0.041], parent: 'koi3' },
      { name: 'koi4', at: [-0.5, -0.081, 0.15] },
      { name: 'tail4', at: [-0.3, -0.081, 0.246], parent: 'koi4' },
    ],
    parts: [
      { shape: { kind: 'cut', shape: { kind: 'cylinder', at: [0, -0.34, 0], height: 0.34, r: 1.6 }, hole: { kind: 'join', blend: 'smooth', by: 0.08, shapes: [{ kind: 'ball', at: [-0.2, 0, 0.2], r: [0.98, 0.26, 0.72] }, { kind: 'ball', at: [0.55, 0, 0.05], r: [0.62, 0.22, 0.55] }] } }, paint: { kind: 'split', axis: 'y', at: -0.03, below: '#184650', above: { kind: 'faces', top: { kind: 'patches', size: 0.15, colors: ['#3c6838', '#284a2e', '#3c6838', '#5a8a44'] }, side: { kind: 'bands', axis: 'y', size: 0.07, colors: ['#34261e', '#343c42', '#58402e'] } } }, ink: { kind: 'tufts', amount: 0.25 } },
      { shape: { kind: 'ball', at: [-0.03, -0.09, 0.05], r: [0.06, 0.054, 0.165] }, paint: { kind: 'patches', size: 0.105, colors: ['#ec8038', '#f0e8d6', '#d24c2a'] }, bone: 'koi0', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'cone', from: [-0.03, -0.09, 0.185], to: [-0.03, -0.09, 0.38], r: 0.039, rTo: 0.018 }, paint: '#ec8038', bone: 'tail0', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'ball', at: [-0.03, -0.09, 0.425], r: [0.068, 0.015, 0.053] }, paint: '#f0e8d6', bone: 'tail0', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'ball', at: [0.48, -0.085, 0.174], r: [0.053, 0.048, 0.145] }, paint: { kind: 'patches', size: 0.092, colors: ['#f0e8d6', '#ec8038', '#f0e8d6'] }, bone: 'koi1', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'cone', from: [0.48, -0.085, 0.292], to: [0.48, -0.085, 0.464], r: 0.034, rTo: 0.016 }, paint: '#f0e8d6', bone: 'tail1', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'ball', at: [0.48, -0.085, 0.504], r: [0.059, 0.013, 0.046] }, paint: '#ec8038', bone: 'tail1', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'ball', at: [0.49, -0.094, 0.068], r: [0.065, 0.058, 0.178] }, paint: { kind: 'patches', size: 0.113, colors: ['#d24c2a', '#ec8038', '#0d1418'] }, bone: 'koi2', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'cone', from: [0.49, -0.094, 0.213], to: [0.49, -0.094, 0.424], r: 0.042, rTo: 0.019 }, paint: '#d24c2a', bone: 'tail2', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'ball', at: [0.49, -0.094, 0.473], r: [0.073, 0.016, 0.057] }, paint: '#ec8038', bone: 'tail2', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'ball', at: [0.77, -0.079, 0.073], r: [0.046, 0.041, 0.125] }, paint: { kind: 'patches', size: 0.08, colors: ['#f6a23c', '#ffd27a', '#f0e8d6'] }, bone: 'koi3', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'cone', from: [0.77, -0.079, -0.03], to: [0.77, -0.079, -0.178], r: 0.03, rTo: 0.014 }, paint: '#f6a23c', bone: 'tail3', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'ball', at: [0.77, -0.079, -0.212], r: [0.051, 0.011, 0.04] }, paint: '#ffd27a', bone: 'tail3', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'ball', at: [-0.3, -0.081, 0.126], r: [0.048, 0.043, 0.132] }, paint: { kind: 'patches', size: 0.084, colors: ['#f0e8d6', '#0d1418', '#ec8038'] }, bone: 'koi4', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'cone', from: [-0.3, -0.081, 0.234], to: [-0.3, -0.081, 0.39], r: 0.031, rTo: 0.014 }, paint: '#f0e8d6', bone: 'tail4', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'ball', at: [-0.3, -0.081, 0.426], r: [0.054, 0.012, 0.042] }, paint: '#0d1418', bone: 'tail4', glow: true, noShadow: true, bare: true },
    ],
    moves: [
      { kind: 'spin', bone: 'koi0', axis: 'y', times: 1, phase: 0 },
      { kind: 'bob', bone: 'koi0', by: [0, 0.021, 0], times: 3, phase: 0.437 },
      { kind: 'sway', bone: 'tail0', axis: 'y', degrees: 22, times: 10, phase: 0.059 },
      { kind: 'spin', bone: 'koi1', axis: 'y', times: 1, phase: 0 },
      { kind: 'bob', bone: 'koi1', by: [0, 0.018, 0], times: 4, phase: 0.871 },
      { kind: 'sway', bone: 'tail1', axis: 'y', degrees: 22, times: 12, phase: 0.454 },
      { kind: 'spin', bone: 'koi2', axis: 'y', times: 1, phase: 0.55 },
      { kind: 'bob', bone: 'koi2', by: [0, 0.023, 0], times: 3, phase: 0.017 },
      { kind: 'sway', bone: 'tail2', axis: 'y', degrees: 22, times: 14, phase: 0.514 },
      { kind: 'spin', bone: 'koi3', axis: 'y', times: -2, phase: 0.8 },
      { kind: 'bob', bone: 'koi3', by: [0, 0.016, 0], times: 4, phase: 0.744 },
      { kind: 'sway', bone: 'tail3', axis: 'y', degrees: 22, times: 16, phase: 0.289 },
      { kind: 'spin', bone: 'koi4', axis: 'y', times: 2, phase: 0.15 },
      { kind: 'bob', bone: 'koi4', by: [0, 0.017, 0], times: 3, phase: 0.396 },
      { kind: 'sway', bone: 'tail4', axis: 'y', degrees: 22, times: 18, phase: 0.569 },
    ],
  },
}

const at = (prop: string, x: number, y: number, z: number, turn = 0, size = 1, phase?: number) => ({ prop, at: [x, y, z] as [number, number, number], turn, size, ...(phase === undefined ? {} : { phase }) })

/** The koi pond as a land and the props set down on it: what Diorama draws and what Scene Creator opens. */
export const KOI_PROJECT: SceneProject = {
  kind: 'blobscape-project',
  version: 1,
  name: 'Koi pond in the rain',
  loop: 12,
  land: 'koi-pond',
  props: [
    // the lanterns: the snow-viewing one stands with its legs in the shallows
    at('tall-stone-lantern', -0.98, 0, -0.6),
    at('snow-lantern', 1.07, -0.12, 0.7),
    at('cherry-tree', 0.98, 0, -0.8),
    // a grove of one bamboo stalk, set down five times turned, sized and swaying apart
    at('bamboo', -1.36, 0, -0.42, 0, 1, 0),
    at('bamboo', -1.2, 0, -0.86, 140, 0.97, 0.15),
    at('bamboo', -0.9, 0, -1.1, 250, 1.1, 0.4),
    at('bamboo', -0.55, 0, -1.22, 35, 1.09, 0.6),
    at('bamboo', -1.42, 0, -0.05, 190, 0.98, 0.8),
    at('pink-iris', 0.05, 0, -0.5, 0, 1, 0.2),
    at('white-iris', 0.22, 0, -0.47, 0, 1, 0.5),
    at('pink-iris', -0.35, 0, -0.5, 170, 1, 0.7),
    at('iris-leaves', 1.05, 0, 0.02, 0, 1, 0.1),
    at('iris-leaves', -1.12, 0, 0.3, 120, 1, 0.4),
    // lily pads float on the water's surface
    at('lily-pad-in-flower', 0.95, -0.045, -0.2, 0, 1, 0.1),
    at('lily-pad', 1, -0.045, 0.1, 30, 0.83, 0.35),
    at('lily-pad', 0.78, -0.045, -0.3, -50, 0.67, 0.6),
    at('lily-pad-in-flower', -0.95, -0.045, 0.12, 160, 0.9, 0.2),
    at('lily-pad', -0.82, -0.045, -0.1, 200, 0.78, 0.8),
    at('lily-pad', 0.1, -0.045, 0.78, 100, 0.72, 0.5),
    // three posts to step across the water on, and a slab at the bank
    at('stepping-post', -0.78, -0.28, 0.52, 0),
    at('stepping-post', -0.52, -0.28, 0.66, 70),
    at('stepping-post', -0.24, -0.28, 0.6, 140),
    at('stone-slab', -0.9, -0.02, 0.95),
    // stones round the edge
    { prop: 'mossy-stone', at: [-1.2, 0, 0.5], turn: 0, size: 1.39 },
    { prop: 'cracked-stone', at: [-1.05, 0, 0.82], turn: 115, size: 0.98 },
    { prop: 'cracked-stone', at: [-0.72, 0, 0.98], turn: -20, size: 0.98 },
    { prop: 'mossy-stone', at: [-0.3, 0, 1.02], turn: 40, size: 0.89 },
    { prop: 'cracked-stone', at: [0.2, 0, 0.9], turn: -35, size: 0.97 },
    { prop: 'cracked-stone', at: [0.62, 0, 0.7], turn: 15, size: 0.84 },
    { prop: 'mossy-stone', at: [1.22, 0, 0.3], turn: -10, size: 1.06 },
    { prop: 'cracked-stone', at: [1.28, 0, -0.1], turn: 120, size: 1.23 },
    { prop: 'cracked-stone', at: [0.95, 0, -0.52], turn: -25, size: 0.94 },
    { prop: 'mossy-stone', at: [0.45, 0, -0.6], turn: 110, size: 1.12 },
    { prop: 'cracked-stone', at: [-0.1, 0, -0.62], turn: -40, size: 0.79 },
    { prop: 'cracked-stone', at: [-0.6, 0, -0.58], turn: 10, size: 1.2 },
    { prop: 'mossy-stone', at: [-1.08, 0, -0.3], turn: 35, size: 1.07 },
    { prop: 'cracked-stone', at: [-1.28, 0, 0.1], turn: -15, size: 0.86 },
  ],
}
