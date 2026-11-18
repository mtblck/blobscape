import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'

/**
 * The still half of the fox's meadow, as a description: a round of turf with a standing stone in the middle, a few
 * rocks and flowers, the moon and stars, and the wisp with its three motes (posed by `build.ts`, which also adds the
 * fox and the grass, neither of which a description can hold yet). Data only.
 */
export const MEADOW: SceneDoc = {
  name: 'Fox and wisp',
  loop: 12,
  light: { from: [-0.4, 0.8, 0.45], ambient: 0.5, shadow: 0.7 },
  palette: [
    '#0a0f1e', '#141c36', '#1f2d55', '#2f477d', '#4a6fae', '#10241c', '#1b3a2a', '#2c5a38',
    '#4a8048', '#79a85a', '#b5d67a', '#2a1c16', '#4a3020', '#6e4a2e', '#8f3a1c', '#c85a22',
    '#e8823a', '#f5b060', '#3a3a48', '#5d5c6c', '#8a8898', '#c2c0cc', '#e8dcc0', '#f4f1e4',
    '#ffd166', '#fff3b0', '#7b2f45', '#b9485a',
  ],
  sky: ['#0a0f1e', '#1f2d55'],
  look: { dither: 0.1, glow: 1.75, outline: true, edges: true },
  camera: { target: [0, 0.62, 0], distance: 4.1, azimuth: 24, elevation: 14 },
  air: { haze: { color: '#141c36', from: 1, to: 7 } },
  bones: [
    { name: 'wisp', at: [0, 0, 0] },
    { name: 'mote0', at: [0, 0, 0] },
    { name: 'mote1', at: [0, 0, 0] },
    { name: 'mote2', at: [0, 0, 0] },
  ],
  parts: [
    // the turf
    { shape: { kind: 'rough', shape: { kind: 'cylinder', at: [0, -0.3, 0], height: 0.3, r: 1.75 }, by: 0.03, scale: 0.6 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.3, colors: ['#10241c', '#1b3a2a', '#1b3a2a', '#2c5a38'] }, side: { kind: 'bands', axis: 'y', size: 0.07, colors: ['#4a3020', '#2a1c16', '#6e4a2e'] } } },
    // the standing stone, leaning a little, and the moss on its shoulder
    { shape: { kind: 'rough', shape: { kind: 'cone', from: [0, 0, 0], to: [0.06, 0.78, -0.03], r: 0.2, rTo: 0.11 }, by: 0.03, scale: 0.25 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.1, colors: ['#8a8898', '#4a8048', '#8a8898'] }, side: { kind: 'bands', axis: 'y', size: 0.11, colors: ['#5d5c6c', '#3a3a48', '#5d5c6c', '#8a8898'] } } },
    { shape: { kind: 'rough', shape: { kind: 'ball', at: [0.42, 0.05, 0.12], r: [0.16, 0.11, 0.13] }, by: 0.025, scale: 0.2 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.12, colors: ['#8a8898', '#4a8048', '#8a8898'] }, side: { kind: 'bands', axis: 'y', size: 0.06, colors: ['#5d5c6c', '#3a3a48'] } } },
    { shape: { kind: 'rough', shape: { kind: 'ball', at: [-0.3, 0.04, -0.3], r: [0.12, 0.08, 0.1] }, by: 0.025, scale: 0.2 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.12, colors: ['#8a8898', '#4a8048', '#8a8898'] }, side: { kind: 'bands', axis: 'y', size: 0.06, colors: ['#5d5c6c', '#3a3a48'] } } },
    { shape: { kind: 'rough', shape: { kind: 'ball', at: [1.45, 0.05, -0.55], r: [0.15, 0.1, 0.12] }, by: 0.025, scale: 0.2 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.12, colors: ['#8a8898', '#4a8048', '#8a8898'] }, side: { kind: 'bands', axis: 'y', size: 0.06, colors: ['#5d5c6c', '#3a3a48'] } } },
    { shape: { kind: 'rough', shape: { kind: 'ball', at: [-1.35, 0.04, 0.75], r: [0.12, 0.08, 0.1] }, by: 0.025, scale: 0.2 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.12, colors: ['#8a8898', '#4a8048', '#8a8898'] }, side: { kind: 'bands', axis: 'y', size: 0.06, colors: ['#5d5c6c', '#3a3a48'] } } },
    // flowers: a stalk and a head
    { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [1.4, 0, 0.5], height: 0.2, r: 0.012 }, { kind: 'ball', at: [1.4, 0.22, 0.5], r: [0.04, 0.03, 0.04] }] }, paint: { kind: 'split', axis: 'y', at: 0.19, below: '#4a8048', above: '#b9485a' } },
    { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [-1.5, 0, -0.2], height: 0.24, r: 0.012 }, { kind: 'ball', at: [-1.5, 0.26, -0.2], r: [0.04, 0.03, 0.04] }] }, paint: { kind: 'split', axis: 'y', at: 0.23, below: '#4a8048', above: '#e8dcc0' } },
    { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [0.5, 0, -1.5], height: 0.22, r: 0.012 }, { kind: 'ball', at: [0.5, 0.24, -1.5], r: [0.04, 0.03, 0.04] }] }, paint: { kind: 'split', axis: 'y', at: 0.21, below: '#4a8048', above: '#b9485a' } },
    { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [-0.6, 0, 1.5], height: 0.2, r: 0.012 }, { kind: 'ball', at: [-0.6, 0.22, 1.5], r: [0.04, 0.03, 0.04] }] }, paint: { kind: 'split', axis: 'y', at: 0.19, below: '#4a8048', above: '#e8dcc0' } },
    { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [0.35, 0, 0.4], height: 0.18, r: 0.012 }, { kind: 'ball', at: [0.35, 0.2, 0.4], r: [0.04, 0.03, 0.04] }] }, paint: { kind: 'split', axis: 'y', at: 0.17, below: '#4a8048', above: '#b9485a' } },
    // the wisp and the motes that trail it
    { shape: { kind: 'sphere', at: [0, 0, 0], r: 0.055 }, paint: '#fff3b0', bone: 'wisp', glow: true },
    { shape: { kind: 'sphere', at: [0, 0, 0], r: 0.02 }, paint: '#ffd166', bone: 'mote0', glow: true },
    { shape: { kind: 'sphere', at: [0, 0, 0], r: 0.017 }, paint: '#ffd166', bone: 'mote1', glow: true },
    { shape: { kind: 'sphere', at: [0, 0, 0], r: 0.014 }, paint: '#f5b060', bone: 'mote2', glow: true },
    // the moon and the stars
    { shape: { kind: 'sphere', at: [-1.5, 2.05, -1.7], r: 0.2 }, paint: { kind: 'patches', size: 0.1, colors: ['#f4f1e4', '#f4f1e4', '#c2c0cc'] }, glow: true },
    { shape: { kind: 'sphere', at: [-0.6, 2.9, -1.8], r: 0.018 }, paint: '#c2c0cc', glow: true },
    { shape: { kind: 'sphere', at: [0.3, 3.1, -1.8], r: 0.018 }, paint: '#f4f1e4', glow: true },
    { shape: { kind: 'sphere', at: [1.3, 2.8, -1.7], r: 0.018 }, paint: '#f4f1e4', glow: true },
    { shape: { kind: 'sphere', at: [1.8, 2.2, -1.4], r: 0.018 }, paint: '#c2c0cc', glow: true },
    { shape: { kind: 'sphere', at: [0.8, 2.4, -1.9], r: 0.018 }, paint: '#f4f1e4', glow: true },
    { shape: { kind: 'sphere', at: [-0.1, 2.5, -1.9], r: 0.018 }, paint: '#f4f1e4', glow: true },
    { shape: { kind: 'sphere', at: [-1.9, 2.0, -1.2], r: 0.018 }, paint: '#c2c0cc', glow: true },
    { shape: { kind: 'sphere', at: [1.0, 3.3, -1.5], r: 0.018 }, paint: '#f4f1e4', glow: true },
    { shape: { kind: 'sphere', at: [-1.0, 3.3, -1.6], r: 0.018 }, paint: '#f4f1e4', glow: true },
    { shape: { kind: 'sphere', at: [1.9, 3.0, -0.8], r: 0.018 }, paint: '#c2c0cc', glow: true },
    { shape: { kind: 'sphere', at: [-2.0, 2.9, -0.7], r: 0.018 }, paint: '#f4f1e4', glow: true },
    { shape: { kind: 'sphere', at: [0.5, 2.0, -1.9], r: 0.018 }, paint: '#f4f1e4', glow: true },
  ],
}
