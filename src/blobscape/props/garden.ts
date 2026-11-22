import type { PropDoc } from '../../splat-engine/project.ts'
import type { Tag } from '../../splat-engine/tags.ts'
import type { LightDoc, MoveDoc, PartDoc, SceneDoc } from '../../splat-engine/sceneDoc.ts'
import type { LibraryGroup } from '../creator/library.ts'

/**
 * The Japanese garden's props: the koi pond's lanterns, cherry tree, bamboo, irises, lily pads and stones, each written
 * on its own and standing on the origin, so they are the library's pieces first and the koi pond (diorama/scenes/koi.ts)
 * only sets them down. A change here reaches the koi pond and every scene made with them in Scene Creator.
 * Data only, as a scene description is: see docs/scene-descriptions.md and docs/scenes-from-props.md.
 */

/** A prop or land written on its own (not lifted out of a scene): what the library lists, and what a composed scene names. */
export interface MadeProp {
  /** Its id in the library and in a composed scene. */
  id: string
  /** A sentence for its card and for search. */
  about: string
  /** A prop to set down, or a land to set them on. */
  kind: 'prop' | 'land'
  /** Which of Props mode's groups its card is in (props only). */
  group?: LibraryGroup
  /** What it is and how it behaves (splat-engine/tags.ts). */
  tags: Tag[]
  prop: PropDoc
}

/** The garden's colors: every prop carries them all, so any of them can stand alone in Scene Creator. */
const PALETTE = [
  '#0d1418', '#16242a', '#24363c', '#1a3022', '#284a2e', '#3c6838', '#5a8a44', '#86ac5a',
  '#343c42', '#4e585e', '#6c787c', '#929c9e', '#bcc4c2', '#103038', '#184650', '#286470',
  '#4a8a94', '#84b8ba', '#34261e', '#58402e', '#d24c2a', '#ec8038', '#b05c7a', '#e08ca6',
  '#f6c2d0', '#f6a23c', '#ffd27a', '#fff0c4', '#f0e8d6', '#5a6c7e', '#8a9ca8', '#b6c2c6',
]

/** An overcast day's light, which the garden was written under. */
const LIGHT: SceneDoc['light'] = { from: [0.25, 1, 0.4], ambient: 0.72, shadow: 0.35, ramp: 0.2 }

/** A prop standing on the origin, framed for its card by how tall it is. */
function made(name: string, tall: number, parts: PartDoc[], more: { bones?: SceneDoc['bones']; moves?: MoveDoc[]; lights?: LightDoc[] } = {}): PropDoc {
  return {
    name,
    foot: [0, 0, 0],
    doc: {
      name, loop: 12, light: LIGHT, palette: PALETTE, look: { dither: 0.5, glow: 1.2, outline: true, edges: true },
      camera: { target: [0, tall / 2, 0], distance: Math.max(0.8, tall * 2.6), azimuth: 14, elevation: 18 },
      parts, ...more,
    },
  }
}


/** A tall stone lantern on a round foot, a lit box under a wide cap: it waits for the dark. */
export const TALL_LANTERN = made('Tall stone lantern', 1.15, [
      { shape: { kind: 'cylinder', at: [0, 0, 0], height: 0.078, r: 0.195, rTop: 0.169 }, paint: { kind: 'speckle', size: 0.035, colors: ['#6c787c', '#6c787c', '#4e585e'] }, grime: '#284a2e' },
      { shape: { kind: 'lathe', at: [0, 0.078, 0], profile: [[0.091, 0], [0.065, 0.065], [0.059, 0.26], [0.065, 0.468], [0.098, 0.52]] }, paint: { kind: 'speckle', size: 0.035, colors: ['#6c787c', '#6c787c', '#4e585e'] }, grime: '#284a2e' },
      { shape: { kind: 'lathe', at: [0, 0.598, 0], profile: [[0.091, 0], [0.182, 0.039], [0.182, 0.078]] }, paint: { kind: 'speckle', size: 0.035, colors: ['#929c9e', '#929c9e', '#6c787c'] } },
      { shape: { kind: 'cut', shape: { kind: 'box', at: [0, 0.767, 0], half: [0.111, 0.091, 0.111], round: 0.012 }, hole: { kind: 'join', shapes: [{ kind: 'box', at: [0, 0.767, 0], half: [0.075, 0.065, 0.075] }, { kind: 'box', at: [0, 0.767, 0], half: [0.3, 0.052, 0.052] }, { kind: 'box', at: [0, 0.767, 0], half: [0.052, 0.052, 0.3] }] } }, paint: { kind: 'speckle', size: 0.035, colors: ['#6c787c', '#6c787c', '#4e585e'] } },
      { shape: { kind: 'box', at: [0.113, 0.767, 0], half: [0.012, 0.052, 0.052] }, paint: '#ffd27a', glow: true, lit: 'dark', unlit: '#d8d0bc', noShadow: true },
      { shape: { kind: 'box', at: [-0.113, 0.767, 0], half: [0.012, 0.052, 0.052] }, paint: '#ffd27a', glow: true, lit: 'dark', unlit: '#d8d0bc', noShadow: true },
      { shape: { kind: 'box', at: [0, 0.767, 0.113], half: [0.052, 0.052, 0.012] }, paint: '#ffd27a', glow: true, lit: 'dark', unlit: '#d8d0bc', noShadow: true },
      { shape: { kind: 'box', at: [0, 0.767, -0.113], half: [0.052, 0.052, 0.012] }, paint: '#ffd27a', glow: true, lit: 'dark', unlit: '#d8d0bc', noShadow: true },
      { shape: { kind: 'lathe', at: [0, 0.858, 0], profile: [[0.273, 0.026], [0.286, 0.046], [0.195, 0.078], [0.104, 0.13], [0.039, 0.176], [0.016, 0.182]] }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.08, colors: ['#929c9e', '#6c787c', '#929c9e', '#3c6838'] }, side: '#6c787c', under: '#343c42' } },
      { shape: { kind: 'lathe', at: [0, 1.04, 0], profile: [[0.016, 0], [0.052, 0.039], [0.039, 0.078], [0.016, 0.111]] }, paint: '#929c9e', noShadow: true },
], {
  lights: [{ at: [0, 0.787, 0], color: '#ffd27a', strength: 1.8, range: 1, lit: 'dark', flicker: { by: 0.12, times: 5 }, shadows: true, clear: 0.07 }],
})

/** A low snow-viewing lantern on three curved legs, its foot where the legs meet the ground (it stands in shallow water in the koi pond). */
export const SNOW_LANTERN = made('Snow-viewing lantern', 0.72, [
      { shape: { kind: 'sweep', path: [[0.031, 0.39, 0.039], [0.092, 0.32, 0.118], [0.111, 0, 0.142]], r: 0.03, rTo: 0.026 }, paint: { kind: 'speckle', size: 0.035, colors: ['#6c787c', '#6c787c', '#4e585e'] }, grime: '#284a2e', noShadow: true },
      { shape: { kind: 'sweep', path: [[-0.05, 0.39, 0.007], [-0.149, 0.32, 0.021], [-0.178, 0, 0.025]], r: 0.03, rTo: 0.026 }, paint: { kind: 'speckle', size: 0.035, colors: ['#6c787c', '#6c787c', '#4e585e'] }, grime: '#284a2e', noShadow: true },
      { shape: { kind: 'sweep', path: [[0.019, 0.39, -0.046], [0.056, 0.32, -0.139], [0.067, 0, -0.167]], r: 0.03, rTo: 0.026 }, paint: { kind: 'speckle', size: 0.035, colors: ['#6c787c', '#6c787c', '#4e585e'] }, grime: '#284a2e', noShadow: true },
      { shape: { kind: 'cylinder', at: [0, 0.37, 0], height: 0.035, r: 0.13 }, paint: { kind: 'speckle', size: 0.035, colors: ['#929c9e', '#929c9e', '#6c787c'] } },
      { shape: { kind: 'cut', shape: { kind: 'cylinder', at: [0, 0.405, 0], height: 0.13, r: 0.09 }, hole: { kind: 'join', shapes: [{ kind: 'cylinder', at: [0, 0.425, 0], height: 0.08, r: 0.058 }, { kind: 'box', at: [0, 0.47, 0], half: [0.2, 0.036, 0.03] }, { kind: 'box', at: [0, 0.47, 0], half: [0.03, 0.036, 0.2] }] } }, paint: { kind: 'speckle', size: 0.035, colors: ['#6c787c', '#6c787c', '#4e585e'] } },
      { shape: { kind: 'box', at: [0.083, 0.47, 0], half: [0.012, 0.036, 0.03] }, paint: '#ffd27a', glow: true, lit: 'dark', unlit: '#d8d0bc', noShadow: true },
      { shape: { kind: 'box', at: [0, 0.47, 0.083], half: [0.03, 0.036, 0.012] }, paint: '#ffd27a', glow: true, lit: 'dark', unlit: '#d8d0bc', noShadow: true },
      { shape: { kind: 'box', at: [-0.083, 0.47, 0], half: [0.012, 0.036, 0.03] }, paint: '#ffd27a', glow: true, lit: 'dark', unlit: '#d8d0bc', noShadow: true },
      { shape: { kind: 'box', at: [0, 0.47, -0.083], half: [0.03, 0.036, 0.012] }, paint: '#ffd27a', glow: true, lit: 'dark', unlit: '#d8d0bc', noShadow: true },
      { shape: { kind: 'lathe', at: [0, 0.535, 0], profile: [[0.21, 0], [0.22, 0.018], [0.16, 0.05], [0.09, 0.09], [0.04, 0.12], [0.012, 0.128]] }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.08, colors: ['#929c9e', '#6c787c', '#929c9e', '#3c6838'] }, side: '#6c787c', under: '#343c42' } },
      { shape: { kind: 'sphere', at: [0, 0.69, 0], r: 0.035 }, paint: '#929c9e', noShadow: true },
], {
  lights: [{ at: [0, 0.48, 0], color: '#ffd27a', strength: 1.6, range: 0.8, lit: 'dark', flicker: { by: 0.14, times: 7 }, shadows: true, clear: 0.05 }],
})

/** A cherry tree in full bloom, swaying, with petals fallen round its foot. */
export const CHERRY = made('Cherry tree in bloom', 1.15, [
      { shape: { kind: 'tree', at: [0, 0, 0], height: 0.44, crown: [0.92, 0.34, 0.7], r: 0.074, points: 400, leaves: 0.07, seed: 11, only: 'limbs' }, paint: { kind: 'bands', axis: 'y', size: 0.045, colors: ['#34261e', '#34261e', '#58402e'] }, bone: 'cherry' },
      { shape: { kind: 'tree', at: [0, 0, 0], height: 0.44, crown: [0.92, 0.34, 0.7], r: 0.074, points: 400, leaves: 0.07, seed: 11, only: 'leaves' }, paint: { kind: 'faces', top: { kind: 'speckle', size: 0.035, colors: ['#f6c2d0', '#f6c2d0', '#f0e8d6', '#e08ca6'] }, side: { kind: 'speckle', size: 0.035, colors: ['#e08ca6', '#f6c2d0', '#e08ca6', '#b05c7a'] }, under: '#b05c7a' }, bone: 'crown', noShadow: true },
      { shape: { kind: 'join', blend: 'smooth', by: 0.03, shapes: [{ kind: 'sphere', at: [0.062, 0.886, 0.579], r: 0.132 }, { kind: 'sphere', at: [-0.404, 0.987, 0.277], r: 0.108 }, { kind: 'sphere', at: [0.389, 0.952, 0.064], r: 0.133 }, { kind: 'sphere', at: [-0.598, 0.947, -0.129], r: 0.14 }, { kind: 'sphere', at: [0.259, 0.824, 0.343], r: 0.103 }, { kind: 'sphere', at: [-0.482, 0.783, -0.259], r: 0.113 }, { kind: 'sphere', at: [-0.468, 0.899, 0.407], r: 0.14 }, { kind: 'sphere', at: [0.222, 1.026, -0.154], r: 0.114 }, { kind: 'sphere', at: [-0.032, 0.772, 0.365], r: 0.109 }, { kind: 'sphere', at: [0.279, 0.915, 0.445], r: 0.085 }, { kind: 'sphere', at: [-0.394, 0.952, 0.159], r: 0.114 }, { kind: 'sphere', at: [0.417, 0.761, -0.25], r: 0.124 }, { kind: 'sphere', at: [0.261, 0.896, 0.481], r: 0.129 }, { kind: 'sphere', at: [0.464, 0.965, 0.119], r: 0.136 }, { kind: 'sphere', at: [-0.334, 0.766, 0.597], r: 0.11 }, { kind: 'sphere', at: [0.349, 0.878, 0.202], r: 0.14 }, { kind: 'sphere', at: [-0.576, 0.79, 0.163], r: 0.114 }, { kind: 'sphere', at: [-0.75, 0.756, -0.163], r: 0.11 }, { kind: 'sphere', at: [-0.368, 0.805, 0.276], r: 0.122 }, { kind: 'sphere', at: [-0.371, 0.985, 0.41], r: 0.109 }, { kind: 'sphere', at: [0.355, 0.946, 0.427], r: 0.104 }, { kind: 'sphere', at: [0.182, 0.853, 0.434], r: 0.134 }, { kind: 'sphere', at: [0.383, 0.911, -0.018], r: 0.087 }, { kind: 'sphere', at: [-0.538, 0.717, -0.219], r: 0.14 }, { kind: 'sphere', at: [0.296, 1.006, -0.122], r: 0.112 }, { kind: 'sphere', at: [-0.65, 0.811, -0.33], r: 0.134 }, { kind: 'sphere', at: [-0.66, 0.81, 0.393], r: 0.127 }, { kind: 'sphere', at: [-0.229, 0.883, -0.45], r: 0.086 }, { kind: 'sphere', at: [-0.458, 0.904, -0.171], r: 0.132 }, { kind: 'sphere', at: [0.309, 0.97, 0.272], r: 0.087 }, { kind: 'sphere', at: [-0.584, 0.933, 0.015], r: 0.138 }, { kind: 'sphere', at: [-0.248, 0.754, 0.378], r: 0.09 }, { kind: 'sphere', at: [0.823, 0.73, 0.14], r: 0.139 }, { kind: 'sphere', at: [0.238, 1.022, -0.14], r: 0.138 }, { kind: 'sphere', at: [-0.28, 0.991, -0.449], r: 0.086 }, { kind: 'sphere', at: [-0.258, 0.812, -0.375], r: 0.108 }, { kind: 'sphere', at: [0.439, 0.906, 0.299], r: 0.096 }, { kind: 'sphere', at: [-0.541, 0.84, 0.287], r: 0.128 }, { kind: 'sphere', at: [-0.519, 0.798, -0.426], r: 0.137 }, { kind: 'sphere', at: [-0.124, 1.007, 0.235], r: 0.091 }] }, paint: { kind: 'faces', top: { kind: 'speckle', size: 0.03, colors: ['#f6c2d0', '#f6c2d0', '#f0e8d6', '#e08ca6', '#f6c2d0'] }, side: { kind: 'speckle', size: 0.03, colors: ['#e08ca6', '#f6c2d0', '#e08ca6', '#b05c7a'] }, under: { kind: 'speckle', size: 0.03, colors: ['#b05c7a', '#e08ca6', '#b05c7a'] } }, bone: 'crown', noShadow: true, touches: true },
      { shape: { kind: 'cylinder', at: [-0.083, 0.006, 0.508], height: 0.012, r: 0.018 }, paint: '#e08ca6', noShadow: true, bare: true },
      { shape: { kind: 'cylinder', at: [-0.356, 0.006, 0.348], height: 0.012, r: 0.018 }, paint: '#f6c2d0', noShadow: true, bare: true },
      { shape: { kind: 'cylinder', at: [0.406, 0.006, 0.261], height: 0.012, r: 0.017 }, paint: '#e08ca6', noShadow: true, bare: true },
      { shape: { kind: 'cylinder', at: [0.075, 0.006, 0.371], height: 0.012, r: 0.022 }, paint: '#f6c2d0', noShadow: true, bare: true },
      { shape: { kind: 'cylinder', at: [0.204, 0.006, 0.468], height: 0.012, r: 0.021 }, paint: '#f6c2d0', noShadow: true, bare: true },
      { shape: { kind: 'cylinder', at: [-0.545, 0.006, 0.41], height: 0.012, r: 0.017 }, paint: '#e08ca6', noShadow: true, bare: true },
      { shape: { kind: 'cylinder', at: [0.176, 0.006, 0.09], height: 0.012, r: 0.024 }, paint: '#f6c2d0', noShadow: true, bare: true },
      { shape: { kind: 'cylinder', at: [-0.451, 0.006, -0.086], height: 0.012, r: 0.021 }, paint: '#f6c2d0', noShadow: true, bare: true },
      { shape: { kind: 'cylinder', at: [0.221, 0.006, 0.085], height: 0.012, r: 0.021 }, paint: '#e08ca6', noShadow: true, bare: true },
      { shape: { kind: 'cylinder', at: [0.005, 0.006, 0.36], height: 0.012, r: 0.026 }, paint: '#f6c2d0', noShadow: true, bare: true },
      { shape: { kind: 'cylinder', at: [-0.081, 0.006, 0.572], height: 0.012, r: 0.019 }, paint: '#e08ca6', noShadow: true, bare: true },
      { shape: { kind: 'cylinder', at: [-0.384, 0.006, 0.162], height: 0.012, r: 0.025 }, paint: '#f6c2d0', noShadow: true, bare: true },
      { shape: { kind: 'cylinder', at: [-0.43, 0.006, 0.067], height: 0.012, r: 0.022 }, paint: '#f6c2d0', noShadow: true, bare: true },
      { shape: { kind: 'cylinder', at: [0.04, 0.006, 0.216], height: 0.012, r: 0.017 }, paint: '#e08ca6', noShadow: true, bare: true },
], {
  bones: [{ name: 'cherry', at: [0, 0, 0] }, { name: 'crown', at: [-0.08, 0.85, 0.2], parent: 'cherry' }],
  moves: [{ kind: 'sway', bone: 'cherry', axis: 'z', degrees: 1, times: 2, wind: 2 }, { kind: 'sway', bone: 'crown', axis: 'x', degrees: 1.6, times: 3, phase: 0.2, wind: 4 }],
})

/** One stalk of bamboo with four leaves, swaying. Set several down turned and sized apart for a grove. */
export const BAMBOO = made('Bamboo', 1.36, [
      { shape: { kind: 'cylinder', at: [0, 0, 0], height: 1.356, r: 0.026, rTop: 0.016 }, paint: { kind: 'bands', axis: 'y', size: 0.11, colors: ['#5a8a44', '#5a8a44', '#5a8a44', '#284a2e'] }, bone: 'stalk', noShadow: true },
      { shape: { kind: 'cone', from: [0, 0.678, 0], to: [-0.056, 0.722, -0.224], r: 0.03, rTo: 0.008 }, paint: '#5a8a44', bone: 'stalk', noShadow: true },
      { shape: { kind: 'cone', from: [0, 0.854, 0], to: [0.184, 0.876, -0.187], r: 0.03, rTo: 0.008 }, paint: '#86ac5a', bone: 'stalk', noShadow: true },
      { shape: { kind: 'cone', from: [0, 1.031, 0], to: [0.248, 1.073, -0.006], r: 0.03, rTo: 0.008 }, paint: '#5a8a44', bone: 'stalk', noShadow: true },
      { shape: { kind: 'cone', from: [0, 1.207, 0], to: [-0.007, 1.208, 0.292], r: 0.03, rTo: 0.008 }, paint: '#86ac5a', bone: 'stalk', noShadow: true },
], {
  bones: [{ name: 'stalk', at: [0, 0, 0] }],
  moves: [{ kind: 'sway', bone: 'stalk', axis: 'z', degrees: 2, times: 2, wind: 10 }],
})

const IRIS_STEM = { bones: [{ name: 'stem', at: [0, 0, 0] as [number, number, number] }], moves: [{ kind: 'sway' as const, bone: 'stem', axis: 'x' as const, degrees: 3, times: 3, wind: 8 }] }

/** A pink iris in flower over its leaves. */
export const PINK_IRIS = made('Pink iris', 0.4, [
      { shape: { kind: 'cone', from: [0, -0.02, 0], to: [0.096, 0.227, -0.003], r: 0.014, rTo: 0.006 }, paint: '#86ac5a', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0, -0.02, 0], to: [-0.018, 0.314, 0.091], r: 0.014, rTo: 0.006 }, paint: '#5a8a44', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0, -0.02, 0], to: [0.097, 0.204, -0.01], r: 0.014, rTo: 0.006 }, paint: '#86ac5a', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0, -0.02, 0], to: [0.046, 0.337, -0.041], r: 0.014, rTo: 0.006 }, paint: '#5a8a44', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0, -0.02, 0], to: [0.006, 0.317, 0.096], r: 0.014, rTo: 0.006 }, paint: '#86ac5a', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0, 0, 0], to: [0.01, 0.33, 0], r: 0.008 }, paint: '#3c6838', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0.01, 0.33, 0], to: [0.055, 0.36, 0], r: 0.014, rTo: 0.02 }, paint: '#e08ca6', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0.01, 0.33, 0], to: [-0.012, 0.38, 0.039], r: 0.014, rTo: 0.02 }, paint: '#e08ca6', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0.01, 0.33, 0], to: [-0.013, 0.36, -0.039], r: 0.014, rTo: 0.02 }, paint: '#e08ca6', bone: 'stem', noShadow: true },
], IRIS_STEM)

/** A white iris in flower over its leaves. */
export const WHITE_IRIS = made('White iris', 0.4, [
      { shape: { kind: 'cone', from: [0, -0.02, 0], to: [-0.063, 0.226, -0.026], r: 0.014, rTo: 0.006 }, paint: '#86ac5a', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0, -0.02, 0], to: [0.05, 0.219, 0.008], r: 0.014, rTo: 0.006 }, paint: '#5a8a44', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0, -0.02, 0], to: [0.005, 0.251, -0.054], r: 0.014, rTo: 0.006 }, paint: '#86ac5a', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0, -0.02, 0], to: [-0.099, 0.226, 0.006], r: 0.014, rTo: 0.006 }, paint: '#5a8a44', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0, -0.02, 0], to: [-0.071, 0.257, -0.025], r: 0.014, rTo: 0.006 }, paint: '#86ac5a', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0, 0, 0], to: [0.01, 0.33, 0], r: 0.008 }, paint: '#3c6838', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0.01, 0.33, 0], to: [0.034, 0.36, 0.038], r: 0.014, rTo: 0.02 }, paint: '#f0e8d6', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0.01, 0.33, 0], to: [-0.035, 0.38, 0.002], r: 0.014, rTo: 0.02 }, paint: '#f0e8d6', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0.01, 0.33, 0], to: [0.031, 0.36, -0.04], r: 0.014, rTo: 0.02 }, paint: '#f0e8d6', bone: 'stem', noShadow: true },
], IRIS_STEM)

/** A clump of iris leaves, not in flower. */
export const IRIS_LEAVES = made('Iris leaves', 0.32, [
      { shape: { kind: 'cone', from: [0, -0.02, 0], to: [-0.062, 0.248, 0.015], r: 0.014, rTo: 0.006 }, paint: '#86ac5a', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0, -0.02, 0], to: [-0.027, 0.202, -0.059], r: 0.014, rTo: 0.006 }, paint: '#5a8a44', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0, -0.02, 0], to: [0.018, 0.284, -0.076], r: 0.014, rTo: 0.006 }, paint: '#86ac5a', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0, -0.02, 0], to: [0.006, 0.24, -0.076], r: 0.014, rTo: 0.006 }, paint: '#5a8a44', bone: 'stem', noShadow: true },
      { shape: { kind: 'cone', from: [0, -0.02, 0], to: [0.027, 0.311, 0.094], r: 0.014, rTo: 0.006 }, paint: '#86ac5a', bone: 'stem', noShadow: true },
], IRIS_STEM)

const PAD = { bones: [{ name: 'pad', at: [0, 0, 0] as [number, number, number] }], moves: [{ kind: 'bob' as const, bone: 'pad', by: [0, 0.004, 0] as [number, number, number], times: 3 }] }

/** A lily pad with its notch, lying on the water (its foot is the water's surface) and bobbing. */
export const LILY_PAD = made('Lily pad', 0.05, [
      { shape: { kind: 'cut', shape: { kind: 'cylinder', at: [0, 0.004, 0], height: 0.012, r: 0.09 }, hole: { kind: 'cone', from: [0, 0, 0], to: [0.108, 0, 0.036], r: 0.004, rTo: 0.036 } }, paint: { kind: 'faces', top: '#5a8a44', side: '#284a2e' }, bone: 'pad', noShadow: true, bare: true },
], PAD)

/** A bigger lily pad with a water lily in flower. */
export const LILY_PAD_FLOWER = made('Lily pad in flower', 0.1, [
      { shape: { kind: 'cut', shape: { kind: 'cylinder', at: [0, 0.004, 0], height: 0.012, r: 0.1 }, hole: { kind: 'cone', from: [0, 0, 0], to: [0.12, 0, 0.04], r: 0.004, rTo: 0.04 } }, paint: { kind: 'faces', top: '#86ac5a', side: '#284a2e' }, bone: 'pad', noShadow: true, bare: true },
      { shape: { kind: 'cone', from: [0, 0.02, 0], to: [0.04, 0.07, 0], r: 0.018, rTo: 0.006 }, paint: '#f0e8d6', bone: 'pad', glow: true, noShadow: true },
      { shape: { kind: 'cone', from: [0, 0.02, 0], to: [0.02, 0.07, 0.035], r: 0.018, rTo: 0.006 }, paint: '#e08ca6', bone: 'pad', glow: true, noShadow: true },
      { shape: { kind: 'cone', from: [0, 0.02, 0], to: [-0.02, 0.07, 0.035], r: 0.018, rTo: 0.006 }, paint: '#f0e8d6', bone: 'pad', glow: true, noShadow: true },
      { shape: { kind: 'cone', from: [0, 0.02, 0], to: [-0.04, 0.07, 0], r: 0.018, rTo: 0.006 }, paint: '#e08ca6', bone: 'pad', glow: true, noShadow: true },
      { shape: { kind: 'cone', from: [0, 0.02, 0], to: [-0.02, 0.07, -0.035], r: 0.018, rTo: 0.006 }, paint: '#f0e8d6', bone: 'pad', glow: true, noShadow: true },
      { shape: { kind: 'cone', from: [0, 0.02, 0], to: [0.02, 0.07, -0.035], r: 0.018, rTo: 0.006 }, paint: '#e08ca6', bone: 'pad', glow: true, noShadow: true },
], PAD)

/** A rough stone half sunk in the ground, gray with moss in its hollows. */
export const MOSSY_STONE = made('Mossy stone', 0.15, [
  { shape: { kind: 'rough', shape: { kind: 'ball', at: [0, 0.045, 0], r: [0.14, 0.1, 0.12] }, by: 0.018, scale: 0.5 }, paint: { kind: 'patches', size: 0.12, colors: ['#4e585e', '#6c787c', '#284a2e'] }, grime: '#284a2e' },
])

/** A rough pale stone half sunk in the ground, with cracks. */
export const CRACKED_STONE = made('Cracked stone', 0.15, [
  { shape: { kind: 'rough', shape: { kind: 'ball', at: [0, 0.045, 0], r: [0.14, 0.1, 0.12] }, by: 0.018, scale: 0.5 }, paint: { kind: 'patches', size: 0.12, colors: ['#6c787c', '#4e585e', '#929c9e'] }, grime: '#284a2e', ink: { kind: 'cracks', amount: 0.3 } },
])

/** A round stepping post, set in water up to near its top. */
export const STEPPING_POST = made('Stepping post', 0.27, [
  { shape: { kind: 'cylinder', at: [0, 0, 0], height: 0.265, r: 0.1, rTop: 0.092 }, paint: { kind: 'faces', top: { kind: 'speckle', size: 0.04, colors: ['#929c9e', '#6c787c', '#bcc4c2'] }, side: '#4e585e' } },
])

/** A low round slab of speckled stone to step onto. */
export const STONE_SLAB = made('Stone slab', 0.03, [
  { shape: { kind: 'cylinder', at: [0, 0, 0], height: 0.03, r: 0.26 }, paint: { kind: 'speckle', size: 0.035, colors: ['#6c787c', '#929c9e', '#4e585e', '#bcc4c2'] } },
])
