import type { PropDoc } from '../../splat-engine/project.ts'
import type { MadeProp } from './garden.ts'

/**
 * The things along Turkey Run's road (Diorama's turkey scene), standing still instead of going by: library props for
 * Scene Creator. In the scene itself they are part of its land, props/turkey.ts.
 * Data only, as a scene description is: see docs/scene-descriptions.md.
 */

/** A roadside billboard on two posts. */
export const BILLBOARD: PropDoc = {
  name: 'Billboard',
  foot: [1, 0, -0.855],
  doc: {
    name: 'Billboard',
    loop: 8,
    light: { from: [0.35, 0.8, 0.5], ambient: 0.58, shadow: 0.55 },
    palette: [
      '#2b4a78', '#4f7fae', '#8fb7cf', '#f6d9a0', '#27401f', '#3f5f2a', '#648238', '#93a84a',
      '#b8892e', '#dcae4a', '#f1d57a', '#7a2a1a', '#b8401f', '#e0662a', '#f39a3c', '#24160f',
      '#3e2617', '#5e3b22', '#85552f', '#ad7a48', '#cfa272', '#e6c79c', '#3a3a44', '#6f6e78',
      '#a9a8b0', '#dedbd2', '#fbf7ea', '#c57b57', '#e8a57c', '#f6c9a4', '#d83a2c',
    ],
    sky: ['#4f7fae', '#8fb7cf'],
    look: { dither: 0.5, glow: 1, outline: true, edges: true },
    camera: { target: [0, 0.72, 0], distance: 5, azimuth: 20, elevation: 12, swing: 6 },
    bones: [
      { name: 'by11', at: [1, 0, -0.86] },
    ],
    parts: [
      { shape: { kind: 'cylinder', at: [0.2, 0, -0.86], height: 0.6, r: 0.04 }, paint: '#5e3b22', bone: 'by11', noShadow: true },
      { shape: { kind: 'cylinder', at: [1.8, 0, -0.86], height: 0.6, r: 0.04 }, paint: '#5e3b22', bone: 'by11', noShadow: true },
      { shape: { kind: 'box', at: [1, 0.86, -0.86], half: [1.14, 0.31, 0.025] }, paint: '#fbf7ea', bone: 'by11', noShadow: true },
      { shape: { kind: 'box', at: [1, 0.86, -0.88], half: [1.18, 0.35, 0.02] }, paint: '#5e3b22', bone: 'by11', noShadow: true },
      { shape: { kind: 'blocks', at: [0.06, 0.66, -0.8], size: 0.04, layers: [['rrrrrr'], ['rrrrrr'], ['rr....'], ['rr....'], ['rrrr..'], ['rrrr..'], ['rr....'], ['rr....'], ['rrrrrr'], ['rrrrrr']] }, paint: { kind: 'key', colors: { r: '#d83a2c' } }, bone: 'by11', noShadow: true },
      { shape: { kind: 'blocks', at: [0.38, 0.66, -0.8], size: 0.04, layers: [['rr..rr'], ['rr..rr'], ['rr..rr'], ['rr..rr'], ['rrrrrr'], ['rrrrrr'], ['rr..rr'], ['rr..rr'], ['..rr..'], ['..rr..']] }, paint: { kind: 'key', colors: { r: '#d83a2c' } }, bone: 'by11', noShadow: true },
      { shape: { kind: 'blocks', at: [0.7, 0.66, -0.8], size: 0.04, layers: [['..rr..'], ['..rr..'], ['..rr..'], ['..rr..'], ['..rr..'], ['..rr..'], ['..rr..'], ['..rr..'], ['rrrrrr'], ['rrrrrr']] }, paint: { kind: 'key', colors: { r: '#d83a2c' } }, bone: 'by11', noShadow: true },
      { shape: { kind: 'blocks', at: [1.14, 0.66, -0.8], size: 0.04, layers: [['rr..rr'], ['rr..rr'], ['rr..rr'], ['rr..rr'], ['rrrrrr'], ['rrrrrr'], ['rr..rr'], ['rr..rr'], ['rr..rr'], ['rr..rr']] }, paint: { kind: 'key', colors: { r: '#d83a2c' } }, bone: 'by11', noShadow: true },
      { shape: { kind: 'blocks', at: [1.46, 0.66, -0.8], size: 0.04, layers: [['rr..rr'], ['rr..rr'], ['rr..rr'], ['rr..rr'], ['rrrrrr'], ['rrrrrr'], ['rr..rr'], ['rr..rr'], ['..rr..'], ['..rr..']] }, paint: { kind: 'key', colors: { r: '#d83a2c' } }, bone: 'by11', noShadow: true },
      { shape: { kind: 'blocks', at: [1.86, 0.66, -0.8], size: 0.04, layers: [['rr......rr'], ['rr......rr'], ['rr......rr'], ['rr......rr'], ['rr..rr..rr'], ['rr..rr..rr'], ['rrrr..rrrr'], ['rrrr..rrrr'], ['rr......rr'], ['rr......rr']] }, paint: { kind: 'key', colors: { r: '#d83a2c' } }, bone: 'by11', noShadow: true },
    ],
  },
}

/** A mailbox on a post. */
export const MAILBOX: PropDoc = {
  name: 'Mailbox',
  foot: [-0.05, -0.06, 0.7015],
  doc: {
    name: 'Mailbox',
    loop: 8,
    light: { from: [0.35, 0.8, 0.5], ambient: 0.58, shadow: 0.55 },
    palette: [
      '#2b4a78', '#4f7fae', '#8fb7cf', '#f6d9a0', '#27401f', '#3f5f2a', '#648238', '#93a84a',
      '#b8892e', '#dcae4a', '#f1d57a', '#7a2a1a', '#b8401f', '#e0662a', '#f39a3c', '#24160f',
      '#3e2617', '#5e3b22', '#85552f', '#ad7a48', '#cfa272', '#e6c79c', '#3a3a44', '#6f6e78',
      '#a9a8b0', '#dedbd2', '#fbf7ea', '#c57b57', '#e8a57c', '#f6c9a4', '#d83a2c',
    ],
    sky: ['#4f7fae', '#8fb7cf'],
    look: { dither: 0.5, glow: 1, outline: true, edges: true },
    camera: { target: [0, 0.72, 0], distance: 5, azimuth: 20, elevation: 12, swing: 6 },
    bones: [
      { name: 'by20', at: [-0.05, 0, 0.68] },
    ],
    parts: [
      { shape: { kind: 'cylinder', at: [-0.05, 0, 0.68], height: 0.3, r: 0.022 }, paint: '#5e3b22', bone: 'by20', noShadow: true },
      { shape: { kind: 'box', at: [-0.05, 0.35, 0.68], half: [0.1, 0.055, 0.05], round: 0.03 }, paint: { kind: 'split', axis: 'x', at: 0.02, below: '#b8401f', above: '#7a2a1a' }, bone: 'by20', noShadow: true },
      { shape: { kind: 'box', at: [-0.09, 0.44, 0.735], half: [0.012, 0.05, 0.008] }, paint: '#dcae4a', bone: 'by20', noShadow: true },
      { shape: { kind: 'ball', at: [-0.05, 0.012, 0.68], r: [0.1, 0.008, 0.06] }, paint: '#27401f', bone: 'by20', noShadow: true, bare: true },
    ],
  },
}

/** A tall haystack. */
export const ROADSIDE_HAYSTACK: PropDoc = {
  name: 'Roadside haystack',
  foot: [-0.1, 0, -0.8],
  doc: {
    name: 'Roadside haystack',
    loop: 8,
    light: { from: [0.35, 0.8, 0.5], ambient: 0.58, shadow: 0.55 },
    palette: [
      '#2b4a78', '#4f7fae', '#8fb7cf', '#f6d9a0', '#27401f', '#3f5f2a', '#648238', '#93a84a',
      '#b8892e', '#dcae4a', '#f1d57a', '#7a2a1a', '#b8401f', '#e0662a', '#f39a3c', '#24160f',
      '#3e2617', '#5e3b22', '#85552f', '#ad7a48', '#cfa272', '#e6c79c', '#3a3a44', '#6f6e78',
      '#a9a8b0', '#dedbd2', '#fbf7ea', '#c57b57', '#e8a57c', '#f6c9a4', '#d83a2c',
    ],
    sky: ['#4f7fae', '#8fb7cf'],
    look: { dither: 0.5, glow: 1, outline: true, edges: true },
    camera: { target: [0, 0.72, 0], distance: 5, azimuth: 20, elevation: 12, swing: 6 },
    bones: [
      { name: 'by10', at: [-0.1, 0, -0.8] },
    ],
    parts: [
      { shape: { kind: 'lathe', at: [-0.1, 0, -0.8], profile: [[0.24, 0], [0.26, 0.12], [0.2, 0.3], [0.08, 0.42], [0.01, 0.46]] }, paint: { kind: 'bands', axis: 'y', size: 0.06, colors: ['#dcae4a', '#b8892e', '#f1d57a'] }, bone: 'by10', noShadow: true, ink: { kind: 'hatch', amount: 0.4, color: '#85552f' } },
    ],
  },
}

/** A roadside tree. */
export const ROADSIDE_TREE: PropDoc = {
  name: 'Roadside tree',
  foot: [-1.4382, -0.06, -0.82],
  doc: {
    name: 'Roadside tree',
    loop: 8,
    light: { from: [0.35, 0.8, 0.5], ambient: 0.58, shadow: 0.55 },
    palette: [
      '#2b4a78', '#4f7fae', '#8fb7cf', '#f6d9a0', '#27401f', '#3f5f2a', '#648238', '#93a84a',
      '#b8892e', '#dcae4a', '#f1d57a', '#7a2a1a', '#b8401f', '#e0662a', '#f39a3c', '#24160f',
      '#3e2617', '#5e3b22', '#85552f', '#ad7a48', '#cfa272', '#e6c79c', '#3a3a44', '#6f6e78',
      '#a9a8b0', '#dedbd2', '#fbf7ea', '#c57b57', '#e8a57c', '#f6c9a4', '#d83a2c',
    ],
    sky: ['#4f7fae', '#8fb7cf'],
    look: { dither: 0.5, glow: 1, outline: true, edges: true },
    camera: { target: [0, 0.72, 0], distance: 5, azimuth: 20, elevation: 12, swing: 6 },
    bones: [
      { name: 'by8', at: [-1.45, 0, -0.82] },
    ],
    parts: [
      { shape: { kind: 'cylinder', at: [-1.45, 0, -0.82], height: 0.6325, r: 0.06, rTop: 0.04 }, paint: { kind: 'bands', axis: 'y', size: 0.08, colors: ['#5e3b22', '#3e2617'] }, bone: 'by8', noShadow: true },
      { shape: { kind: 'join', shapes: [{ kind: 'sphere', at: [-1.45, 0.828, -0.82], r: 0.345 }, { kind: 'sphere', at: [-1.68, 0.69, -0.78], r: 0.23 }, { kind: 'sphere', at: [-1.208, 0.713, -0.84], r: 0.2415 }, { kind: 'sphere', at: [-1.4, 1.092, -0.82], r: 0.23 }] }, paint: { kind: 'patches', size: 0.14, colors: ['#e0662a', '#b8401f', '#f39a3c', '#7a2a1a'] }, bone: 'by8', noShadow: true },
      { shape: { kind: 'ball', at: [-1.45, 0.012, -0.82], r: [0.345, 0.008, 0.12] }, paint: '#5e3b22', bone: 'by8', noShadow: true, bare: true },
    ],
    moves: [
      { kind: 'sway', bone: 'by8', axis: 'z', degrees: 1.5, times: 2, wind: 4 },
    ],
  },
}

/** Another roadside tree. */
export const SECOND_ROADSIDE_TREE: PropDoc = {
  name: 'Second roadside tree',
  foot: [-0.6102, -0.06, -0.8],
  doc: {
    name: 'Second roadside tree',
    loop: 8,
    light: { from: [0.35, 0.8, 0.5], ambient: 0.58, shadow: 0.55 },
    palette: [
      '#2b4a78', '#4f7fae', '#8fb7cf', '#f6d9a0', '#27401f', '#3f5f2a', '#648238', '#93a84a',
      '#b8892e', '#dcae4a', '#f1d57a', '#7a2a1a', '#b8401f', '#e0662a', '#f39a3c', '#24160f',
      '#3e2617', '#5e3b22', '#85552f', '#ad7a48', '#cfa272', '#e6c79c', '#3a3a44', '#6f6e78',
      '#a9a8b0', '#dedbd2', '#fbf7ea', '#c57b57', '#e8a57c', '#f6c9a4', '#d83a2c',
    ],
    sky: ['#4f7fae', '#8fb7cf'],
    look: { dither: 0.5, glow: 1, outline: true, edges: true },
    camera: { target: [0, 0.72, 0], distance: 5, azimuth: 20, elevation: 12, swing: 6 },
    bones: [
      { name: 'by9', at: [-0.62, 0, -0.8] },
    ],
    parts: [
      { shape: { kind: 'cylinder', at: [-0.62, 0, -0.8], height: 0.5225, r: 0.06, rTop: 0.04 }, paint: { kind: 'bands', axis: 'y', size: 0.08, colors: ['#5e3b22', '#3e2617'] }, bone: 'by9', noShadow: true },
      { shape: { kind: 'join', shapes: [{ kind: 'sphere', at: [-0.62, 0.684, -0.8], r: 0.285 }, { kind: 'sphere', at: [-0.81, 0.57, -0.76], r: 0.19 }, { kind: 'sphere', at: [-0.42, 0.589, -0.82], r: 0.1995 }, { kind: 'sphere', at: [-0.57, 0.903, -0.8], r: 0.19 }] }, paint: { kind: 'patches', size: 0.14, colors: ['#dcae4a', '#b8892e', '#f39a3c', '#f1d57a'] }, bone: 'by9', noShadow: true },
      { shape: { kind: 'ball', at: [-0.62, 0.012, -0.8], r: [0.285, 0.008, 0.12] }, paint: '#5e3b22', bone: 'by9', noShadow: true, bare: true },
    ],
    moves: [
      { kind: 'sway', bone: 'by9', axis: 'z', degrees: 1.5, times: 2, wind: 4 },
    ],
  },
}

/** The pieces above as the library lists them. */
export const ROADSIDE_MADE: MadeProp[] = [
  { id: 'billboard', tags: ['sign'], kind: 'prop', group: 'buildings', about: 'A roadside billboard on two posts', prop: BILLBOARD },
  { id: 'mailbox', tags: ['thing'], kind: 'prop', about: 'A mailbox on a post', prop: MAILBOX },
  { id: 'roadside-haystack', tags: ['farm'], kind: 'prop', about: 'A tall haystack', prop: ROADSIDE_HAYSTACK },
  { id: 'roadside-tree', tags: ['tree', 'leafy'], kind: 'prop', about: 'A roadside tree', prop: ROADSIDE_TREE },
  { id: 'second-roadside-tree', tags: ['tree', 'leafy'], kind: 'prop', about: 'Another roadside tree', prop: SECOND_ROADSIDE_TREE },
]

