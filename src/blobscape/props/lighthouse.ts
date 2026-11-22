import type { PropDoc, SceneProject } from '../../splat-engine/project.ts'
import type { MadeProp } from './garden.ts'

/**
 * The lighthouse on its rock (Diorama's lighthouse scene) as a land and props (docs/scenes-from-props.md): the rock and
 * its sea are the land, and the lighthouse, the keeper's cottage, three pines, the jetty, the boat and the buoy are
 * library props set down on it. Each was written where it stood in the scene, so its foot is where it stood; the boat
 * and the buoy ride whatever water they are set down in (`PropDoc.water`). The sky, moon and clouds are the shared
 * recipes' (`heavens`). Data only, as a scene description is: see docs/scene-descriptions.md.
 */

/** A grassy rock in a round of sea at dusk, with rocks, bushes, flowers, gulls, clouds, the moon and stars. */
export const LIGHTHOUSE_ROCK: PropDoc = {
  name: 'Lighthouse rock',
  foot: [0, 0, 0],
  doc: {
    name: 'Lighthouse rock',
    loop: 12,
    light: { from: [0.4, 0.55, 0.72], ambient: 0.5, shadow: 0.75 },
    palette: [
      '#0b1026', '#1b2148', '#27407a', '#3f62a8', '#6fa3d8', '#cfe6f5', '#22402f', '#3f7a45',
      '#69b05a', '#3b3848', '#514c5e', '#6b6474', '#9d97a6', '#d3cfd6', '#6b4a35', '#a37a52',
      '#d8c08f', '#7d2836', '#c9485a', '#f4f1e4', '#ffd166', '#fff3b0', '#f5f7ff', '#ccd6e6',
      '#ffffe6', '#cce0e6',
    ],
    sky: ['#090d20', '#3c5ea4'],
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    grid: 0.72,
    disc: 0.75,
    camera: { target: [0.05, 0.84, 0.05], distance: 3.7, azimuth: 28, elevation: 10 },
    bones: [
      { name: 'gull0', at: [0.05, 1.72, -0.05] },
      { name: 'gull0L', at: [0.67, 1.72, -0.05], parent: 'gull0' },
      { name: 'gull0R', at: [0.67, 1.72, -0.05], parent: 'gull0' },
      { name: 'gull1', at: [0.05, 1.5, -0.05] },
      { name: 'gull1L', at: [1, 1.5, -0.05], parent: 'gull1' },
      { name: 'gull1R', at: [1, 1.5, -0.05], parent: 'gull1' },
      { name: 'gull2', at: [0.05, 1.85, -0.05] },
      { name: 'gull2L', at: [0.75, 1.85, -0.05], parent: 'gull2' },
      { name: 'gull2R', at: [0.75, 1.85, -0.05], parent: 'gull2' },
      { name: 'foam0', at: [-0.9, 0, 0.85] },
      { name: 'foam1', at: [0.3, 0, 1.15] },
      { name: 'foam2', at: [1.15, 0, -0.35] },
      { name: 'foam3', at: [-0.45, 0, -1.1] },
      { name: 'foam4', at: [-1.15, 0, -0.2] },
      { name: 'foam5', at: [0.75, 0, 0.25] },
      { name: '~moon', at: [-1.95, 2.15, -1] },
      { name: '~star0', at: [-0.4463, 1.7105, -1.1297] },
      { name: '~star1', at: [0.9737, 2.5849, -0.7846] },
      { name: '~star2', at: [-0.303, 2.6731, -1.1504] },
      { name: '~star3', at: [-0.2686, 1.7754, -0.7833] },
      { name: '~star4', at: [-0.3704, 1.2814, -1.5496] },
      { name: '~star5', at: [1.0333, 2.6624, -0.741] },
      { name: '~star6', at: [-0.0093, 1.9711, -1.6045] },
      { name: '~star7', at: [-0.4471, 2.6637, -0.8279] },
      { name: '~star8', at: [1.4929, 2.0803, -1.5245] },
      { name: '~star9', at: [-0.4846, 1.1518, -1.4535] },
      { name: '~star10', at: [0.4522, 2.0302, -1.3454] },
      { name: '~star11', at: [-1.6643, 2.6176, -1.5201] },
      { name: '~star12', at: [-1.3477, 1.7358, -0.6141] },
      { name: '~star13', at: [0.896, 2.2788, -0.5767] },
      { name: '~star14', at: [-1.6261, 1.205, -1.4999] },
      { name: '~star15', at: [-1.1357, 1.6267, -1.3619] },
      { name: '~star16', at: [-1.2126, 1.6145, -1.0379] },
      { name: '~star17', at: [0.7365, 2.6696, -1.0277] },
    ],
    parts: [
      { shape: { kind: 'rough', by: 0.02, scale: 1, shape: { kind: 'cylinder', at: [0, -0.32, 0], height: 0.24, r: 1.42 } }, paint: { kind: 'faces', up: 0.5, top: { kind: 'near', shape: { kind: 'rough', by: 0.035, scale: 0.588, shape: { kind: 'join', shapes: [{ kind: 'ball', at: [0, 0.02, 0], r: [0.8, 0.3, 0.62] }, { kind: 'ball', at: [-0.35, 0.02, 0.25], r: [0.5, 0.24, 0.42] }] } }, within: 0.035, at: 0, near: '#bddbe6', far: { kind: 'near', shape: { kind: 'rough', by: 0.035, scale: 0.588, shape: { kind: 'join', shapes: [{ kind: 'ball', at: [0, 0.02, 0], r: [0.8, 0.3, 0.62] }, { kind: 'ball', at: [-0.35, 0.02, 0.25], r: [0.5, 0.24, 0.42] }] } }, within: 0.1, at: 0, near: { kind: 'patches', size: 0.125, colors: ['#336ba8', '#4d85bd'] }, far: { kind: 'waves', size: 0.157, colors: ['#1a3873', '#4d85bd', '#244d8c'] } } }, side: { kind: 'split', axis: 'y', at: -0.08, below: '#12214d', above: '#1a336b' } }, bare: true },
      { shape: { kind: 'rough', by: 0.035, scale: 0.588, shape: { kind: 'join', shapes: [{ kind: 'ball', at: [0, 0.02, 0], r: [0.8, 0.3, 0.62] }, { kind: 'ball', at: [-0.35, 0.02, 0.25], r: [0.5, 0.24, 0.42] }] } }, paint: { kind: 'split', axis: 'y', at: 0.05, below: { kind: 'speckle', size: 0.025, colors: ['#d1b880', '#b3996b'] }, above: { kind: 'split', axis: 'y', at: 0.14, below: { kind: 'bands', axis: 'y', size: 0.0125, colors: ['#4d454f', '#857873', '#857873', '#857873', '#4d454f', '#6b6166', '#6b6166', '#6b6166'] }, above: { kind: 'faces', up: 0.72, side: { kind: 'bands', axis: 'y', size: 0.0125, colors: ['#4d454f', '#857873', '#857873', '#857873', '#4d454f', '#6b6166', '#6b6166', '#6b6166'] }, top: { kind: 'near', shape: { kind: 'sweep', path: [[0.19, 0, 0.15], [0.62, 0, 0.34]], r: 0.01 }, within: 0.03, at: 0, near: { kind: 'speckle', size: 0.02, colors: ['#bda170', '#9e8561'] }, far: { kind: 'patches', size: 0.167, colors: ['#336b42', '#4d8c4a', '#6bad57'] } } } } } },
      { shape: { kind: 'rough', by: 0.02, scale: 0.333, shape: { kind: 'ball', at: [-1.1, 0, 0.5], r: [0.14, 0.175, 0.126] } }, paint: { kind: 'split', axis: 'y', at: 0.03, below: '#4d4752', above: { kind: 'faces', top: '#8f8580', side: { kind: 'bands', axis: 'y', size: 0.045, colors: ['#615961', '#73696b'] } } } },
      { shape: { kind: 'rough', by: 0.02, scale: 0.333, shape: { kind: 'ball', at: [0.87, 0, -0.78], r: [0.18, 0.225, 0.162] } }, paint: { kind: 'split', axis: 'y', at: 0.03, below: '#4d4752', above: { kind: 'faces', top: '#8f8580', side: { kind: 'bands', axis: 'y', size: 0.045, colors: ['#615961', '#73696b'] } } } },
      { shape: { kind: 'rough', by: 0.02, scale: 0.333, shape: { kind: 'ball', at: [1.12, 0, -0.5], r: [0.1, 0.125, 0.09] } }, paint: { kind: 'split', axis: 'y', at: 0.03, below: '#4d4752', above: { kind: 'faces', top: '#8f8580', side: { kind: 'bands', axis: 'y', size: 0.045, colors: ['#615961', '#73696b'] } } } },
      { shape: { kind: 'rough', by: 0.02, scale: 0.333, shape: { kind: 'ball', at: [-0.95, 0, -0.75], r: [0.12, 0.15, 0.108] } }, paint: { kind: 'split', axis: 'y', at: 0.03, below: '#4d4752', above: { kind: 'faces', top: '#8f8580', side: { kind: 'bands', axis: 'y', size: 0.045, colors: ['#615961', '#73696b'] } } } },
      { shape: { kind: 'rough', by: 0.02, scale: 0.333, shape: { kind: 'ball', at: [0.2, 0, 1.2], r: [0.08, 0.1, 0.072] } }, paint: { kind: 'split', axis: 'y', at: 0.03, below: '#4d4752', above: { kind: 'faces', top: '#8f8580', side: { kind: 'bands', axis: 'y', size: 0.045, colors: ['#615961', '#73696b'] } } } },
      { shape: { kind: 'rough', by: 0.02, scale: 0.333, shape: { kind: 'ball', at: [-0.2, 0, -1.15], r: [0.11, 0.138, 0.099] } }, paint: { kind: 'split', axis: 'y', at: 0.03, below: '#4d4752', above: { kind: 'faces', top: '#8f8580', side: { kind: 'bands', axis: 'y', size: 0.045, colors: ['#615961', '#73696b'] } } } },
      { shape: { kind: 'rough', by: 0.012, scale: 0.111, shape: { kind: 'ball', at: [0.36, 0.272, 0.22], r: [0.07, 0.056, 0.07] } }, paint: { kind: 'faces', up: 0.5, top: { kind: 'speckle', size: 0.02, colors: ['#4d8c4d', '#73b35c'] }, side: '#295c3d', under: '#295c3d' } },
      { shape: { kind: 'rough', by: 0.012, scale: 0.111, shape: { kind: 'ball', at: [-0.12, 0.276, 0.42], r: [0.06, 0.048, 0.06] } }, paint: { kind: 'faces', up: 0.5, top: { kind: 'speckle', size: 0.02, colors: ['#4d8c4d', '#73b35c'] }, side: '#295c3d', under: '#295c3d' } },
      { shape: { kind: 'rough', by: 0.012, scale: 0.111, shape: { kind: 'ball', at: [0.3, 0.288, -0.3], r: [0.08, 0.064, 0.08] } }, paint: { kind: 'faces', up: 0.5, top: { kind: 'speckle', size: 0.02, colors: ['#4d8c4d', '#73b35c'] }, side: '#295c3d', under: '#295c3d' } },
      { shape: { kind: 'rough', by: 0.012, scale: 0.111, shape: { kind: 'ball', at: [-0.2, 0.264, -0.36], r: [0.06, 0.048, 0.06] } }, paint: { kind: 'faces', up: 0.5, top: { kind: 'speckle', size: 0.02, colors: ['#4d8c4d', '#73b35c'] }, side: '#295c3d', under: '#295c3d' } },
      { shape: { kind: 'rough', by: 0.012, scale: 0.111, shape: { kind: 'ball', at: [-0.62, 0.244, 0.36], r: [0.07, 0.056, 0.07] } }, paint: { kind: 'faces', up: 0.5, top: { kind: 'speckle', size: 0.02, colors: ['#4d8c4d', '#73b35c'] }, side: '#295c3d', under: '#295c3d' } },
      { shape: { kind: 'rough', by: 0.012, scale: 0.111, shape: { kind: 'ball', at: [0.55, 0.282, 0.05], r: [0.055, 0.044, 0.055] } }, paint: { kind: 'faces', up: 0.5, top: { kind: 'speckle', size: 0.02, colors: ['#4d8c4d', '#73b35c'] }, side: '#295c3d', under: '#295c3d' } },
      { shape: { kind: 'join', shapes: [{ kind: 'sphere', at: [-0.425, 0.2, -0.316], r: 0.012 }, { kind: 'sphere', at: [0.644, 0.228, -0.184], r: 0.012 }, { kind: 'sphere', at: [0.411, 0.244, -0.293], r: 0.012 }, { kind: 'sphere', at: [-0.338, 0.236, 0.399], r: 0.012 }, { kind: 'sphere', at: [0.452, 0.192, 0.404], r: 0.012 }, { kind: 'sphere', at: [0.082, 0.264, -0.384], r: 0.012 }, { kind: 'sphere', at: [-0.595, 0.212, 0.425], r: 0.012 }, { kind: 'sphere', at: [0.214, 0.288, -0.396], r: 0.012 }] }, paint: '#e6d159', glow: true },
      { shape: { kind: 'join', shapes: [{ kind: 'sphere', at: [0.376, 0.252, -0.134], r: 0.012 }, { kind: 'sphere', at: [0.619, 0.232, 0.039], r: 0.012 }, { kind: 'sphere', at: [-0.231, 0.284, 0.322], r: 0.012 }, { kind: 'sphere', at: [-0.358, 0.204, -0.406], r: 0.012 }, { kind: 'sphere', at: [-0.403, 0.24, -0.305], r: 0.012 }, { kind: 'sphere', at: [0.331, 0.236, 0.464], r: 0.012 }, { kind: 'sphere', at: [0.615, 0.228, -0.129], r: 0.012 }, { kind: 'sphere', at: [-0.065, 0.312, 0.311], r: 0.012 }] }, paint: '#e0e0d6', glow: true },
      { shape: { kind: 'join', shapes: [{ kind: 'sphere', at: [-0.228, 0.244, 0.442], r: 0.012 }, { kind: 'sphere', at: [0.217, 0.22, -0.474], r: 0.012 }, { kind: 'sphere', at: [-0.278, 0.268, -0.291], r: 0.012 }, { kind: 'sphere', at: [0.288, 0.268, -0.284], r: 0.012 }, { kind: 'sphere', at: [-0.098, 0.304, 0.343], r: 0.012 }, { kind: 'sphere', at: [-0.603, 0.248, 0.316], r: 0.012 }, { kind: 'sphere', at: [-0.318, 0.236, 0.418], r: 0.012 }, { kind: 'sphere', at: [0.06, 0.296, 0.342], r: 0.012 }] }, paint: '#d96673', glow: true },
      { shape: { kind: 'ball', at: [0.67, 1.72, -0.05], r: [0.018, 0.018, 0.07] }, paint: '#e6e6db', bone: 'gull0', glow: true },
      { shape: { kind: 'box', at: [0.74, 1.72, -0.05], half: [0.07, 0.012, 0.035] }, paint: { kind: 'split', axis: 'x', at: 0.785, below: '#e6e6db', above: '#808aa3' }, bone: 'gull0L', glow: true },
      { shape: { kind: 'box', at: [0.6, 1.72, -0.05], half: [0.07, 0.012, 0.035] }, paint: { kind: 'split', axis: 'x', at: 0.555, below: '#808aa3', above: '#e6e6db' }, bone: 'gull0R', glow: true },
      { shape: { kind: 'ball', at: [1, 1.5, -0.05], r: [0.018, 0.018, 0.07] }, paint: '#e6e6db', bone: 'gull1', glow: true },
      { shape: { kind: 'box', at: [1.07, 1.5, -0.05], half: [0.07, 0.012, 0.035] }, paint: { kind: 'split', axis: 'x', at: 1.115, below: '#e6e6db', above: '#808aa3' }, bone: 'gull1L', glow: true },
      { shape: { kind: 'box', at: [0.93, 1.5, -0.05], half: [0.07, 0.012, 0.035] }, paint: { kind: 'split', axis: 'x', at: 0.885, below: '#808aa3', above: '#e6e6db' }, bone: 'gull1R', glow: true },
      { shape: { kind: 'ball', at: [0.75, 1.85, -0.05], r: [0.018, 0.018, 0.07] }, paint: '#e6e6db', bone: 'gull2', glow: true },
      { shape: { kind: 'box', at: [0.82, 1.85, -0.05], half: [0.07, 0.012, 0.035] }, paint: { kind: 'split', axis: 'x', at: 0.865, below: '#e6e6db', above: '#808aa3' }, bone: 'gull2L', glow: true },
      { shape: { kind: 'box', at: [0.68, 1.85, -0.05], half: [0.07, 0.012, 0.035] }, paint: { kind: 'split', axis: 'x', at: 0.635, below: '#808aa3', above: '#e6e6db' }, bone: 'gull2R', glow: true },
      { shape: { kind: 'ball', at: [-0.99, 0.01, 0.85], r: [0.15, 0.02, 0.028] }, paint: '#c7e0e8', bone: 'foam0', glow: true, bare: true },
      { shape: { kind: 'ball', at: [0.21, 0.01, 1.15], r: [0.15, 0.02, 0.028] }, paint: '#c7e0e8', bone: 'foam1', glow: true, bare: true },
      { shape: { kind: 'ball', at: [1.06, 0.01, -0.35], r: [0.15, 0.02, 0.028] }, paint: '#c7e0e8', bone: 'foam2', glow: true, bare: true },
      { shape: { kind: 'ball', at: [-0.54, 0.01, -1.1], r: [0.15, 0.02, 0.028] }, paint: '#c7e0e8', bone: 'foam3', glow: true, bare: true },
      { shape: { kind: 'ball', at: [-1.24, 0.01, -0.2], r: [0.15, 0.02, 0.028] }, paint: '#c7e0e8', bone: 'foam4', glow: true, bare: true },
      { shape: { kind: 'ball', at: [0.66, 0.01, 0.25], r: [0.15, 0.02, 0.028] }, paint: '#c7e0e8', bone: 'foam5', glow: true, bare: true },
      { shape: { kind: 'sphere', at: [-1.95, 2.15, -1], r: 0.17 }, paint: { kind: 'near', shape: { kind: 'join', shapes: [{ kind: 'ball', at: [-1.9, 2.19, -1], r: [0.06, 0.06, 0.408] }, { kind: 'ball', at: [-2.02, 2.1, -1], r: [0.05, 0.05, 0.408] }, { kind: 'ball', at: [-1.93, 2.06, -1], r: [0.04, 0.04, 0.408] }] }, within: 0, near: '#ccd6e6', far: '#f5f7ff' }, bone: '~moon', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-0.4463, 1.7105, -1.1297], r: 0.016 }, paint: '#cce0e6', bone: '~star0', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [0.9737, 2.5849, -0.7846], r: 0.016 }, paint: '#ffffe6', bone: '~star1', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-0.303, 2.6731, -1.1504], r: 0.016 }, paint: '#cce0e6', bone: '~star2', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-0.2686, 1.7754, -0.7833], r: 0.016 }, paint: '#ffffe6', bone: '~star3', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-0.3704, 1.2814, -1.5496], r: 0.016 }, paint: '#cce0e6', bone: '~star4', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [1.0333, 2.6624, -0.741], r: 0.016 }, paint: '#cce0e6', bone: '~star5', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-0.0093, 1.9711, -1.6045], r: 0.016 }, paint: '#cce0e6', bone: '~star6', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-0.4471, 2.6637, -0.8279], r: 0.016 }, paint: '#ffffe6', bone: '~star7', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [1.4929, 2.0803, -1.5245], r: 0.016 }, paint: '#ffffe6', bone: '~star8', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-0.4846, 1.1518, -1.4535], r: 0.016 }, paint: '#cce0e6', bone: '~star9', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [0.4522, 2.0302, -1.3454], r: 0.016 }, paint: '#cce0e6', bone: '~star10', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-1.6643, 2.6176, -1.5201], r: 0.016 }, paint: '#ffffe6', bone: '~star11', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-1.3477, 1.7358, -0.6141], r: 0.016 }, paint: '#ffffe6', bone: '~star12', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [0.896, 2.2788, -0.5767], r: 0.016 }, paint: '#ffffe6', bone: '~star13', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-1.6261, 1.205, -1.4999], r: 0.016 }, paint: '#cce0e6', bone: '~star14', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-1.1357, 1.6267, -1.3619], r: 0.016 }, paint: '#ffffe6', bone: '~star15', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [-1.2126, 1.6145, -1.0379], r: 0.016 }, paint: '#cce0e6', bone: '~star16', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
      { shape: { kind: 'sphere', at: [0.7365, 2.6696, -1.0277], r: 0.016 }, paint: '#ffffe6', bone: '~star17', lit: 'night', unlit: 'gone', glow: true, noShadow: true, bare: true },
    ],
    moves: [
      { kind: 'spin', bone: 'gull0', axis: 'y', times: 1, phase: 0 },
      { kind: 'bob', bone: 'gull0', by: [0, 0.05, 0], times: 3, phase: 0 },
      { kind: 'sway', bone: 'gull0L', axis: 'z', degrees: 34.377, times: 24, phase: 0 },
      { kind: 'sway', bone: 'gull0R', axis: 'z', degrees: -34.377, times: 24, phase: 0 },
      { kind: 'spin', bone: 'gull1', axis: 'y', times: -1, phase: 0.35 },
      { kind: 'bob', bone: 'gull1', by: [0, 0.05, 0], times: 3, phase: 0.35 },
      { kind: 'sway', bone: 'gull1L', axis: 'z', degrees: 34.377, times: 24, phase: 0.05 },
      { kind: 'sway', bone: 'gull1R', axis: 'z', degrees: -34.377, times: 24, phase: 0.05 },
      { kind: 'spin', bone: 'gull2', axis: 'y', times: 1, phase: 0.653 },
      { kind: 'bob', bone: 'gull2', by: [0, 0.05, 0], times: 3, phase: 0.653 },
      { kind: 'sway', bone: 'gull2L', axis: 'z', degrees: 34.377, times: 24, phase: 0.958 },
      { kind: 'sway', bone: 'gull2R', axis: 'z', degrees: -34.377, times: 24, phase: 0.958 },
      { kind: 'drift', bone: 'foam0', by: [0.18, 0, 0], times: 3, phase: 0 },
      { kind: 'drift', bone: 'foam1', by: [0.18, 0, 0], times: 3, phase: 0.167 },
      { kind: 'drift', bone: 'foam2', by: [0.18, 0, 0], times: 3, phase: 0.333 },
      { kind: 'drift', bone: 'foam3', by: [0.18, 0, 0], times: 3, phase: 0.5 },
      { kind: 'drift', bone: 'foam4', by: [0.18, 0, 0], times: 3, phase: 0.667 },
      { kind: 'drift', bone: 'foam5', by: [0.18, 0, 0], times: 3, phase: 0.833 },
    ],
    water: { level: 0, from: [-1.42, -1.42], to: [1.42, 1.42], color: '#1a3a6e', clear: 0.35, cell: 0.022, speed: 0.12, damping: 0.1, ripple: 6, deep: 0.08, swells: [{ from: 208, height: 0.006, times: 2 }, { from: 238, height: 0.003, times: 3, phase: 0.3 }, { from: 120, height: 0.002, times: 2 }], foam: 1, floats: [] },
    heavens: { clouds: { cover: 'partly', colors: ['#70a3d9', '#cfe6e8', '#e0e6e3'], glow: true } },
  },
}

/** A red and white lighthouse with a turning lamp that sweeps two beams of light round it. */
export const LIGHTHOUSE: PropDoc = {
  name: 'Lighthouse',
  foot: [0.05, 0.18, -0.05],
  doc: {
    name: 'Lighthouse',
    loop: 12,
    light: { from: [0.4, 0.55, 0.72], ambient: 0.5, shadow: 0.75 },
    palette: [
      '#0b1026', '#1b2148', '#27407a', '#3f62a8', '#6fa3d8', '#cfe6f5', '#22402f', '#3f7a45',
      '#69b05a', '#3b3848', '#514c5e', '#6b6474', '#9d97a6', '#d3cfd6', '#6b4a35', '#a37a52',
      '#d8c08f', '#7d2836', '#c9485a', '#f4f1e4', '#ffd166', '#fff3b0', '#f5f7ff', '#ccd6e6',
      '#ffffe6', '#cce0e6',
    ],
    sky: ['#090d20', '#3c5ea4'],
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    grid: 0.72,
    disc: 0.75,
    camera: { target: [0.05, 0.84, 0.05], distance: 3.7, azimuth: 28, elevation: 10 },
    bones: [
      { name: 'lamp', at: [0.05, 1.4, -0.05] },
    ],
    parts: [
      { shape: { kind: 'cylinder', at: [0.05, 0.2, -0.05], height: 1.05, r: 0.21, rTop: 0.135 }, paint: { kind: 'split', axis: 'y', at: 0.41, below: { kind: 'bands', axis: 'y', size: 0.016, colors: ['#bcbec4', '#ebedf5', '#ebedf5'] }, above: { kind: 'split', axis: 'y', at: 0.62, below: { kind: 'bands', axis: 'y', size: 0.016, colors: ['#99292d', '#bf3338', '#bf3338'] }, above: { kind: 'split', axis: 'y', at: 0.83, below: { kind: 'bands', axis: 'y', size: 0.016, colors: ['#bcbec4', '#ebedf5', '#ebedf5'] }, above: { kind: 'split', axis: 'y', at: 1.04, below: { kind: 'bands', axis: 'y', size: 0.016, colors: ['#99292d', '#bf3338', '#bf3338'] }, above: { kind: 'bands', axis: 'y', size: 0.016, colors: ['#bcbec4', '#ebedf5', '#ebedf5'] } } } } } },
      { shape: { kind: 'cylinder', at: [0.05, 0.18, -0.05], height: 0.13, r: 0.25, rTop: 0.235 }, paint: { kind: 'speckle', size: 0.045, colors: ['#66616b', '#807880'] } },
      { shape: { kind: 'cylinder', at: [0.05, 1.25, -0.05], height: 0.05, r: 0.21 }, paint: '#292638' },
      { shape: { kind: 'ring', at: [0.05, 1.385, -0.05], r: 0.2, tube: 0.011 }, paint: '#9e99ad', noShadow: true },
      { shape: { kind: 'join', shapes: [{ kind: 'box', at: [0.25, 1.343, -0.05], half: [0.011, 0.042, 0.011] }, { kind: 'box', at: [0.212, 1.343, 0.068], half: [0.011, 0.042, 0.011] }, { kind: 'box', at: [0.112, 1.343, 0.14], half: [0.011, 0.042, 0.011] }, { kind: 'box', at: [-0.012, 1.343, 0.14], half: [0.011, 0.042, 0.011] }, { kind: 'box', at: [-0.112, 1.343, 0.068], half: [0.011, 0.042, 0.011] }, { kind: 'box', at: [-0.15, 1.343, -0.05], half: [0.011, 0.042, 0.011] }, { kind: 'box', at: [-0.112, 1.343, -0.168], half: [0.011, 0.042, 0.011] }, { kind: 'box', at: [-0.012, 1.343, -0.24], half: [0.011, 0.042, 0.011] }, { kind: 'box', at: [0.112, 1.343, -0.24], half: [0.011, 0.042, 0.011] }, { kind: 'box', at: [0.212, 1.343, -0.168], half: [0.011, 0.042, 0.011] }] }, paint: '#9e99ad', noShadow: true },
      { shape: { kind: 'cylinder', at: [0.05, 1.3, -0.05], height: 0.2, r: 0.11 }, paint: '#ffeb8c', glow: true, lit: 'dark' },
      { shape: { kind: 'join', shapes: [{ kind: 'box', at: [0.16, 1.4, -0.016], half: [0.011, 0.1, 0.011] }, { kind: 'box', at: [0.076, 1.4, 0.062], half: [0.011, 0.1, 0.011] }, { kind: 'box', at: [-0.034, 1.4, 0.028], half: [0.011, 0.1, 0.011] }, { kind: 'box', at: [-0.06, 1.4, -0.084], half: [0.011, 0.1, 0.011] }, { kind: 'box', at: [0.024, 1.4, -0.162], half: [0.011, 0.1, 0.011] }, { kind: 'box', at: [0.134, 1.4, -0.128], half: [0.011, 0.1, 0.011] }] }, paint: '#292638', noShadow: true },
      { shape: { kind: 'cylinder', at: [0.05, 1.5, -0.05], height: 0.03, r: 0.15 }, paint: '#292638' },
      { shape: { kind: 'cone', from: [0.05, 1.54, -0.05], to: [0.05, 1.74, -0.05], r: 0.16, rTo: 0.01 }, paint: { kind: 'bands', axis: 'y', size: 0.04, colors: ['#9d2a2e', '#bf3338'] } },
      { shape: { kind: 'join', shapes: [{ kind: 'box', at: [0.05, 1.8, -0.05], half: [0.01, 0.07, 0.01] }, { kind: 'sphere', at: [0.05, 1.88, -0.05], r: 0.028 }] }, paint: '#dbb34d', noShadow: true },
      { shape: { kind: 'box', at: [0.175, 0.32, 0.105], half: [0.068, 0.115, 0.05] }, paint: '#8f878c' },
      { shape: { kind: 'box', at: [0.185, 0.3, 0.115], half: [0.05, 0.09, 0.05] }, paint: { kind: 'bands', axis: 'x', size: 0.03, colors: ['#6b452e', '#573626'] } },
      { shape: { kind: 'box', at: [0.155, 0.72, 0.075], half: [0.047, 0.062, 0.035] }, paint: '#292638' },
      { shape: { kind: 'box', at: [0.167, 0.72, 0.087], half: [0.035, 0.05, 0.035] }, paint: '#ffeb8c', glow: true, lit: 'dark', unlit: '#a9c3d4' },
      { shape: { kind: 'box', at: [0.14, 1.05, 0.06], half: [0.042, 0.057, 0.03] }, paint: '#292638' },
      { shape: { kind: 'box', at: [0.152, 1.05, 0.072], half: [0.03, 0.045, 0.03] }, paint: '#ffeb8c', glow: true, lit: 'dark', unlit: '#a9c3d4' },
      { shape: { kind: 'box', at: [0.05, 1.4, -0.05], half: [0.17, 0.035, 0.035] }, paint: '#ffffd9', bone: 'lamp', glow: true, lit: 'dark', unlit: 'gone' },
    ],
    moves: [
      { kind: 'spin', bone: 'lamp', axis: 'y', times: 2 },
    ],
    lights: [
      { at: [0.05, 0.3, -0.05], color: '#ffe9ab', strength: 3.2, range: 0.55, lit: 'dark', circle: { r: 1, times: 2, phase: 0 } },
      { at: [0.05, 0.3, -0.05], color: '#ffe9ab', strength: 3.2, range: 0.55, lit: 'dark', circle: { r: 1, times: 2, phase: 0.5 } },
      { at: [0.05, 1.47, -0.05], color: '#ffe9ab', strength: 3, range: 0.2, lit: 'dark', circle: { r: 0.3, times: 2, phase: 0 } },
      { at: [0.05, 1.47, -0.05], color: '#ffe9ab', strength: 3, range: 0.2, lit: 'dark', circle: { r: 0.3, times: 2, phase: 0.5 } },
    ],
  },
}

/** A white cottage with a red tiled roof, a lit window and smoke rising from its chimney. */
export const KEEPERS_COTTAGE: PropDoc = {
  name: 'Keeper\'s cottage',
  foot: [-0.36, 0.24, 0.1691],
  doc: {
    name: 'Keeper\'s cottage',
    loop: 12,
    light: { from: [0.4, 0.55, 0.72], ambient: 0.5, shadow: 0.75 },
    palette: [
      '#0b1026', '#1b2148', '#27407a', '#3f62a8', '#6fa3d8', '#cfe6f5', '#22402f', '#3f7a45',
      '#69b05a', '#3b3848', '#514c5e', '#6b6474', '#9d97a6', '#d3cfd6', '#6b4a35', '#a37a52',
      '#d8c08f', '#7d2836', '#c9485a', '#f4f1e4', '#ffd166', '#fff3b0', '#f5f7ff', '#ccd6e6',
      '#ffffe6', '#cce0e6',
    ],
    sky: ['#090d20', '#3c5ea4'],
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    grid: 0.72,
    disc: 0.75,
    camera: { target: [0.05, 0.84, 0.05], distance: 3.7, azimuth: 28, elevation: 10 },
    bones: [
      { name: 'smoke0', at: [-0.43, 0.62, 0.16] },
      { name: 'smoke1', at: [-0.43, 0.62, 0.16] },
      { name: 'smoke2', at: [-0.43, 0.62, 0.16] },
    ],
    parts: [
      { shape: { kind: 'box', at: [-0.36, 0.365, 0.16], half: [0.15, 0.125, 0.11] }, paint: { kind: 'split', axis: 'y', at: 0.34, below: '#99918f', above: { kind: 'speckle', size: 0.033, colors: ['#ede6d1', '#ede6d1', '#d6cfbd'] } } },
      { shape: { kind: 'roof', at: [-0.36, 0.48, 0.16], half: [0.175, 0.14], height: 0.15 }, paint: { kind: 'split', axis: 'x', at: -0.525, below: '#ede6d1', above: { kind: 'split', axis: 'x', at: -0.195, below: { kind: 'bricks', size: [0.05, 0.04], colors: ['#bf4d3d', '#b34238'], line: '#9e3d33' }, above: '#ede6d1' } } },
      { shape: { kind: 'box', at: [-0.43, 0.62, 0.16], half: [0.03, 0.07, 0.03] }, paint: { kind: 'split', axis: 'y', at: 0.66, below: '#856b66', above: '#4d454f' } },
      { shape: { kind: 'box', at: [-0.3, 0.38, 0.265], half: [0.054, 0.052, 0.02] }, paint: '#292638' },
      { shape: { kind: 'box', at: [-0.3, 0.38, 0.275], half: [0.042, 0.04, 0.02] }, paint: '#ffeb8c', glow: true, lit: 'dark', unlit: '#a9c3d4' },
      { shape: { kind: 'box', at: [-0.43, 0.35, 0.27], half: [0.035, 0.075, 0.02] }, paint: '#406b80' },
      { shape: { kind: 'sphere', at: [-0.43, 0.62, 0.16], r: 0.04 }, paint: '#9ea3b3', bone: 'smoke0', glow: true },
      { shape: { kind: 'sphere', at: [-0.43, 0.62, 0.16], r: 0.04 }, paint: '#9ea3b3', bone: 'smoke1', glow: true },
      { shape: { kind: 'sphere', at: [-0.43, 0.62, 0.16], r: 0.04 }, paint: '#9ea3b3', bone: 'smoke2', glow: true },
    ],
    moves: [
      { kind: 'drift', bone: 'smoke0', by: [0.22, 0.3, 0], times: 4, grow: [0.5, 1.4], phase: 0 },
      { kind: 'drift', bone: 'smoke1', by: [0.22, 0.3, 0], times: 4, grow: [0.5, 1.4], phase: 0.333 },
      { kind: 'drift', bone: 'smoke2', by: [0.22, 0.3, 0], times: 4, grow: [0.5, 1.4], phase: 0.667 },
    ],
  },
}

/** A tall pine that sways in the wind. */
export const TALL_PINE: PropDoc = {
  name: 'Tall pine',
  foot: [-0.613, 0.1068, -0.2],
  doc: {
    name: 'Tall pine',
    loop: 12,
    light: { from: [0.4, 0.55, 0.72], ambient: 0.5, shadow: 0.75 },
    palette: [
      '#0b1026', '#1b2148', '#27407a', '#3f62a8', '#6fa3d8', '#cfe6f5', '#22402f', '#3f7a45',
      '#69b05a', '#3b3848', '#514c5e', '#6b6474', '#9d97a6', '#d3cfd6', '#6b4a35', '#a37a52',
      '#d8c08f', '#7d2836', '#c9485a', '#f4f1e4', '#ffd166', '#fff3b0', '#f5f7ff', '#ccd6e6',
      '#ffffe6', '#cce0e6',
    ],
    sky: ['#090d20', '#3c5ea4'],
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    grid: 0.72,
    disc: 0.75,
    camera: { target: [0.05, 0.84, 0.05], distance: 3.7, azimuth: 28, elevation: 10 },
    bones: [
      { name: 'tree0', at: [-0.62, 0.15, -0.2] },
    ],
    parts: [
      { shape: { kind: 'cone', from: [-0.62, 0.15, -0.2], to: [-0.613, 0.375, -0.2], r: 0.022, rTo: 0.022 }, paint: '#5c402e', bone: 'tree0' },
      { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [-0.615, 0.3, -0.2], to: [-0.611, 0.44, -0.2], r: 0.15, rTo: 0.05 }, { kind: 'cone', from: [-0.612, 0.41, -0.2], to: [-0.608, 0.55, -0.2], r: 0.115, rTo: 0.035 }, { kind: 'cone', from: [-0.609, 0.525, -0.2], to: [-0.605, 0.65, -0.2], r: 0.08, rTo: 0.01 }] }, paint: { kind: 'faces', up: 0.45, top: { kind: 'speckle', size: 0.022, colors: ['#387345', '#4d8c4d'] }, side: '#245238', under: '#143329' }, bone: 'tree0' },
    ],
    moves: [
      { kind: 'sway', bone: 'tree0', axis: 'z', degrees: -2.005, times: 5, phase: 0, wind: 3 },
    ],
  },
}

/** A pine that sways in the wind. */
export const PINE: PropDoc = {
  name: 'Pine',
  foot: [0.4645, 0.0708, -0.4],
  doc: {
    name: 'Pine',
    loop: 12,
    light: { from: [0.4, 0.55, 0.72], ambient: 0.5, shadow: 0.75 },
    palette: [
      '#0b1026', '#1b2148', '#27407a', '#3f62a8', '#6fa3d8', '#cfe6f5', '#22402f', '#3f7a45',
      '#69b05a', '#3b3848', '#514c5e', '#6b6474', '#9d97a6', '#d3cfd6', '#6b4a35', '#a37a52',
      '#d8c08f', '#7d2836', '#c9485a', '#f4f1e4', '#ffd166', '#fff3b0', '#f5f7ff', '#ccd6e6',
      '#ffffe6', '#cce0e6',
    ],
    sky: ['#090d20', '#3c5ea4'],
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    grid: 0.72,
    disc: 0.75,
    camera: { target: [0.05, 0.84, 0.05], distance: 3.7, azimuth: 28, elevation: 10 },
    bones: [
      { name: 'tree1', at: [0.46, 0.15, -0.4] },
    ],
    parts: [
      { shape: { kind: 'cone', from: [0.459, 0.114, -0.4], to: [0.465, 0.303, -0.4], r: 0.022, rTo: 0.022 }, paint: '#5c402e', bone: 'tree1' },
      { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [0.463, 0.24, -0.4], to: [0.466, 0.358, -0.4], r: 0.126, rTo: 0.042 }, { kind: 'cone', from: [0.465, 0.332, -0.4], to: [0.469, 0.45, -0.4], r: 0.097, rTo: 0.029 }, { kind: 'cone', from: [0.468, 0.429, -0.4], to: [0.472, 0.534, -0.4], r: 0.067, rTo: 0.01 }] }, paint: { kind: 'faces', up: 0.45, top: { kind: 'speckle', size: 0.022, colors: ['#387345', '#4d8c4d'] }, side: '#245238', under: '#143329' }, bone: 'tree1' },
    ],
    moves: [
      { kind: 'sway', bone: 'tree1', axis: 'z', degrees: -2.005, times: 5, phase: 0.271, wind: 3 },
    ],
  },
}

/** A small pine that sways in the wind. */
export const SMALL_PINE: PropDoc = {
  name: 'Small pine',
  foot: [-0.7385, -0.0132, 0.02],
  doc: {
    name: 'Small pine',
    loop: 12,
    light: { from: [0.4, 0.55, 0.72], ambient: 0.5, shadow: 0.75 },
    palette: [
      '#0b1026', '#1b2148', '#27407a', '#3f62a8', '#6fa3d8', '#cfe6f5', '#22402f', '#3f7a45',
      '#69b05a', '#3b3848', '#514c5e', '#6b6474', '#9d97a6', '#d3cfd6', '#6b4a35', '#a37a52',
      '#d8c08f', '#7d2836', '#c9485a', '#f4f1e4', '#ffd166', '#fff3b0', '#f5f7ff', '#ccd6e6',
      '#ffffe6', '#cce0e6',
    ],
    sky: ['#090d20', '#3c5ea4'],
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    grid: 0.72,
    disc: 0.75,
    camera: { target: [0.05, 0.84, 0.05], distance: 3.7, azimuth: 28, elevation: 10 },
    bones: [
      { name: 'tree2', at: [-0.74, 0.15, 0.02] },
    ],
    parts: [
      { shape: { kind: 'cone', from: [-0.744, 0.03, 0.02], to: [-0.739, 0.192, 0.02], r: 0.022, rTo: 0.022 }, paint: '#5c402e', bone: 'tree2' },
      { shape: { kind: 'join', shapes: [{ kind: 'cone', from: [-0.74, 0.138, 0.02], to: [-0.737, 0.239, 0.02], r: 0.108, rTo: 0.036 }, { kind: 'cone', from: [-0.738, 0.217, 0.02], to: [-0.735, 0.318, 0.02], r: 0.083, rTo: 0.025 }, { kind: 'cone', from: [-0.735, 0.3, 0.02], to: [-0.733, 0.39, 0.02], r: 0.058, rTo: 0.01 }] }, paint: { kind: 'faces', up: 0.45, top: { kind: 'speckle', size: 0.022, colors: ['#387345', '#4d8c4d'] }, side: '#245238', under: '#143329' }, bone: 'tree2' },
    ],
    moves: [
      { kind: 'sway', bone: 'tree2', axis: 'z', degrees: -2.005, times: 5, phase: 0.541, wind: 3 },
    ],
  },
}

/** A wooden jetty on posts with a lantern at its end. */
export const JETTY: PropDoc = {
  name: 'Jetty',
  foot: [0.6243, -0.05, 0.6359],
  doc: {
    name: 'Jetty',
    loop: 12,
    light: { from: [0.4, 0.55, 0.72], ambient: 0.5, shadow: 0.75 },
    palette: [
      '#0b1026', '#1b2148', '#27407a', '#3f62a8', '#6fa3d8', '#cfe6f5', '#22402f', '#3f7a45',
      '#69b05a', '#3b3848', '#514c5e', '#6b6474', '#9d97a6', '#d3cfd6', '#6b4a35', '#a37a52',
      '#d8c08f', '#7d2836', '#c9485a', '#f4f1e4', '#ffd166', '#fff3b0', '#f5f7ff', '#ccd6e6',
      '#ffffe6', '#cce0e6',
    ],
    sky: ['#090d20', '#3c5ea4'],
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    grid: 0.72,
    disc: 0.75,
    camera: { target: [0.05, 0.84, 0.05], distance: 3.7, azimuth: 28, elevation: 10 },
    parts: [
      { shape: { kind: 'box', at: [0.62, 0.085, 0.62], half: [0.075, 0.014, 0.32] }, paint: { kind: 'bands', axis: 'z', size: 0.0125, colors: ['#5c402e', '#a88054', '#a88054', '#a88054', '#5c402e', '#946e4a', '#946e4a', '#946e4a'] } },
      { shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [0.545, -0.05, 0.5], height: 0.165, r: 0.018 }, { kind: 'cylinder', at: [0.695, -0.05, 0.5], height: 0.165, r: 0.018 }, { kind: 'cylinder', at: [0.545, -0.05, 0.72], height: 0.165, r: 0.018 }, { kind: 'cylinder', at: [0.695, -0.05, 0.72], height: 0.165, r: 0.018 }, { kind: 'cylinder', at: [0.545, -0.05, 0.92], height: 0.225, r: 0.018 }, { kind: 'cylinder', at: [0.695, -0.05, 0.92], height: 0.225, r: 0.018 }] }, paint: { kind: 'split', axis: 'y', at: 0.03, below: '#33423d', above: '#6b4d36' } },
      { shape: { kind: 'box', at: [0.695, 0.285, 0.92], half: [0.011, 0.11, 0.011] }, paint: '#292638', noShadow: true },
      { shape: { kind: 'sphere', at: [0.695, 0.415, 0.92], r: 0.03 }, paint: '#ffcc66', glow: true, lit: 'dark' },
    ],
  },
}

/** A small sailing boat with a lantern, rocking on the swell. */
export const SAILING_BOAT: PropDoc = {
  name: 'Sailing boat',
  foot: [0.9441, -0.055, 0.62],
  water: { rides: [{ bone: 'boat', at: [0.95, 0, 0.62], size: 0.2 }] },
  doc: {
    name: 'Sailing boat',
    loop: 12,
    light: { from: [0.4, 0.55, 0.72], ambient: 0.5, shadow: 0.75 },
    palette: [
      '#0b1026', '#1b2148', '#27407a', '#3f62a8', '#6fa3d8', '#cfe6f5', '#22402f', '#3f7a45',
      '#69b05a', '#3b3848', '#514c5e', '#6b6474', '#9d97a6', '#d3cfd6', '#6b4a35', '#a37a52',
      '#d8c08f', '#7d2836', '#c9485a', '#f4f1e4', '#ffd166', '#fff3b0', '#f5f7ff', '#ccd6e6',
      '#ffffe6', '#cce0e6',
    ],
    sky: ['#090d20', '#3c5ea4'],
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    grid: 0.72,
    disc: 0.75,
    camera: { target: [0.05, 0.84, 0.05], distance: 3.7, azimuth: 28, elevation: 10 },
    bones: [
      { name: 'boat', at: [0.95, 0.03, 0.62] },
    ],
    parts: [
      { shape: { kind: 'cut', shape: { kind: 'ball', at: [0.95, 0.03, 0.62], r: [0.24, 0.085, 0.11] }, hole: { kind: 'ball', at: [0.95, 0.115, 0.62], r: [0.19, 0.07, 0.075] } }, paint: { kind: 'split', axis: 'y', at: 0.045, below: '#7a4d33', above: { kind: 'split', axis: 'y', at: 0.075, below: { kind: 'faces', top: '#9e754d', side: '#b33d38' }, above: { kind: 'faces', top: '#9e754d', side: '#dbd6c7' } } }, bone: 'boat', noShadow: true },
      { shape: { kind: 'box', at: [0.95, 0.27, 0.62], half: [0.012, 0.2, 0.012] }, paint: '#593d2e', bone: 'boat', noShadow: true },
      { shape: { kind: 'box', at: [1.035, 0.3, 0.62], half: [0.075, 0.13, 0.012] }, paint: { kind: 'bands', axis: 'y', size: 0.045, colors: ['#d6c7a8', '#f5ebcc'] }, bone: 'boat', noShadow: true },
      { shape: { kind: 'sphere', at: [0.75, 0.15, 0.62], r: 0.03 }, paint: '#ffcc66', bone: 'boat', glow: true, lit: 'dark' },
    ],
  },
}

/** A red and white buoy with a light on top, nodding in the swell. */
export const BUOY: PropDoc = {
  name: 'Buoy',
  foot: [-0.7, -0.03, 1],
  water: { rides: [{ bone: 'buoy', at: [-0.7, 0, 1], size: 0.06 }] },
  doc: {
    name: 'Buoy',
    loop: 12,
    light: { from: [0.4, 0.55, 0.72], ambient: 0.5, shadow: 0.75 },
    palette: [
      '#0b1026', '#1b2148', '#27407a', '#3f62a8', '#6fa3d8', '#cfe6f5', '#22402f', '#3f7a45',
      '#69b05a', '#3b3848', '#514c5e', '#6b6474', '#9d97a6', '#d3cfd6', '#6b4a35', '#a37a52',
      '#d8c08f', '#7d2836', '#c9485a', '#f4f1e4', '#ffd166', '#fff3b0', '#f5f7ff', '#ccd6e6',
      '#ffffe6', '#cce0e6',
    ],
    sky: ['#090d20', '#3c5ea4'],
    look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
    grid: 0.72,
    disc: 0.75,
    camera: { target: [0.05, 0.84, 0.05], distance: 3.7, azimuth: 28, elevation: 10 },
    bones: [
      { name: 'buoy', at: [-0.7, 0, 1] },
    ],
    parts: [
      { shape: { kind: 'join', shapes: [{ kind: 'sphere', at: [-0.7, 0.03, 1], r: 0.06 }, { kind: 'cone', from: [-0.7, 0.06, 1], to: [-0.7, 0.17, 1], r: 0.035, rTo: 0.011 }] }, paint: { kind: 'split', axis: 'y', at: 0.045, below: '#e6e0d1', above: { kind: 'split', axis: 'y', at: 0.1, below: '#c73838', above: '#e6e0d1' } }, bone: 'buoy', noShadow: true },
      { shape: { kind: 'sphere', at: [-0.7, 0.2, 1], r: 0.024 }, paint: '#ff8059', bone: 'buoy', glow: true, lit: 'dark' },
    ],
  },
}

/** The pieces above as the library lists them. */
export const LIGHTHOUSE_MADE: MadeProp[] = [
  { id: 'lighthouse-rock', tags: ['grassy', 'sea', 'night'], kind: 'land', about: 'A grassy rock in a round of sea at dusk, with rocks, bushes, flowers, gulls, clouds, the moon and stars', prop: LIGHTHOUSE_ROCK },
  { id: 'lighthouse', tags: ['building', 'lamp'], kind: 'prop', group: 'buildings', about: 'A red and white lighthouse with a turning lamp that sweeps two beams of light round it', prop: LIGHTHOUSE },
  { id: 'keepers-cottage', tags: ['building', 'lamp'], kind: 'prop', group: 'buildings', about: 'A white cottage with a red tiled roof, a lit window and smoke rising from its chimney', prop: KEEPERS_COTTAGE },
  { id: 'tall-pine', tags: ['tree', 'evergreen'], kind: 'prop', about: 'A tall pine that sways in the wind', prop: TALL_PINE },
  { id: 'pine', tags: ['tree', 'evergreen'], kind: 'prop', about: 'A pine that sways in the wind', prop: PINE },
  { id: 'small-pine', tags: ['tree', 'evergreen'], kind: 'prop', about: 'A small pine that sways in the wind', prop: SMALL_PINE },
  { id: 'jetty', tags: ['building', 'lamp'], kind: 'prop', group: 'buildings', about: 'A wooden jetty on posts with a lantern at its end', prop: JETTY },
  { id: 'sailing-boat', tags: ['boat', 'lamp', 'floats'], kind: 'prop', about: 'A small sailing boat with a lantern, rocking on the swell', prop: SAILING_BOAT },
  { id: 'buoy', tags: ['lamp', 'floats'], kind: 'prop', about: 'A red and white buoy with a light on top, nodding in the swell', prop: BUOY },
]

/** Lighthouse as a land and the props set down on it: what Diorama draws and what Scene Creator opens. */
export const LIGHTHOUSE_PROJECT: SceneProject = {
  kind: 'blobscape-project',
  version: 1,
  name: 'Lighthouse',
  loop: 12,
  land: 'lighthouse-rock',
  props: [
    { prop: 'lighthouse', at: [0.05, 0.18, -0.05], turn: 0, size: 1 },
    { prop: 'keepers-cottage', at: [-0.36, 0.24, 0.1691], turn: 0, size: 1 },
    { prop: 'tall-pine', at: [-0.613, 0.1068, -0.2], turn: 0, size: 1 },
    { prop: 'pine', at: [0.4645, 0.0708, -0.4], turn: 0, size: 1 },
    { prop: 'small-pine', at: [-0.7385, -0.0132, 0.02], turn: 0, size: 1 },
    { prop: 'jetty', at: [0.6243, -0.05, 0.6359], turn: 0, size: 1 },
    { prop: 'sailing-boat', at: [0.9441, -0.055, 0.62], turn: 0, size: 1 },
    { prop: 'buoy', at: [-0.7, -0.03, 1], turn: 0, size: 1 },
  ],
}
