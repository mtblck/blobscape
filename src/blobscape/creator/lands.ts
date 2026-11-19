import type { SceneDoc } from '../../splat-engine/sceneDoc.ts'

/**
 * Two plain lands to start a scene from in Scene Creator: a round of turf and a low rock. Data only, as a scene
 * description is (docs/scene-descriptions.md); their palettes hold the greens, stones and earths most props need, and
 * a project joins each prop's own colors on top.
 */

const PALETTE = [
  '#0b1026', '#1b2148', '#27407a', '#3f62a8', '#6fa3d8', '#cfe6f5',
  '#1b3a2a', '#2c5a38', '#3f7a45', '#69b05a', '#a8d67a',
  '#2a1c16', '#4a3020', '#6e4a2e', '#a37a52', '#d8c08f',
  '#2f2d3a', '#4a4758', '#6b6474', '#9d97a6', '#d3cfd6', '#f4f1e4',
  '#7d2836', '#c9485a', '#ffd166', '#fff3b0',
]
const SKY: [string, string] = ['#0b1026', '#3f62a8']
const LOOK = { dither: 0.5, glow: 1.5, outline: true, edges: true }

/** A round of grass on a slab of earth, level at y = 0: room for anything. */
export const PLAIN_TURF: SceneDoc = {
  name: 'Round of turf',
  loop: 12,
  light: { from: [0.4, 0.7, 0.6], ambient: 0.5, shadow: 0.7 },
  palette: PALETTE,
  sky: SKY,
  look: LOOK,
  camera: { target: [0, 0.3, 0], distance: 4.4, azimuth: 24, elevation: 22 },
  parts: [
    {
      shape: { kind: 'rough', by: 0.03, scale: 0.4, shape: { kind: 'cylinder', at: [0, -0.3, 0], height: 0.3, r: 1.5 } },
      paint: { kind: 'faces', top: { kind: 'patches', size: 0.2, colors: ['#2c5a38', '#3f7a45', '#69b05a'] }, side: { kind: 'bands', axis: 'y', size: 0.04, colors: ['#4a3020', '#6e4a2e', '#4a3020', '#2a1c16'] } },
    },
  ],
}

/** A low, worn rock with moss on top, its top about level at y = 0.1. */
export const PLAIN_ROCK: SceneDoc = {
  name: 'Low rock',
  loop: 12,
  light: { from: [0.4, 0.7, 0.6], ambient: 0.5, shadow: 0.7 },
  palette: PALETTE,
  sky: SKY,
  look: LOOK,
  camera: { target: [0, 0.3, 0], distance: 4.4, azimuth: 24, elevation: 22 },
  parts: [
    {
      shape: { kind: 'rough', by: 0.05, scale: 0.5, shape: { kind: 'cut', shape: { kind: 'ball', at: [0, -0.1, 0], r: [1.4, 0.45, 1.1] }, hole: { kind: 'box', at: [0, 0.6, 0], half: [2, 0.5, 2] } } },
      paint: { kind: 'faces', up: 0.75, top: { kind: 'patches', size: 0.25, colors: ['#4a4758', '#3f7a45', '#6b6474'] }, side: { kind: 'bands', axis: 'y', size: 0.03, colors: ['#2f2d3a', '#6b6474', '#6b6474', '#4a4758', '#9d97a6'] } },
    },
  ],
}
