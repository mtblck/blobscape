import type { PaintDoc, PartDoc, SceneDoc } from '../../splat-engine/sceneDoc.ts'

/**
 * A log cabin in a forest clearing in summer, for Day and Night: nothing here is lit. The colors are each thing's own
 * paint (with only its creases darkened), and the sun, the moon, the sky and the lamps light it live, so the same
 * scene serves every hour. The door and two windows face south (+z) and one window faces east (+x). Each window's lit
 * pane and the lantern's flame ride a bone of their own, so they can come on at dusk; the birds and the fireflies are
 * there all day and the page shows them by the hour. Data only: see docs/scene-descriptions.md.
 */
const LOGS: PaintDoc = { kind: 'bands', axis: 'y', size: 0.06, colors: ['#8a5a3a', '#6e4630', '#a06c44'] }
const BARK: PaintDoc = { kind: 'bands', axis: 'y', size: 0.07, colors: ['#5e4230', '#4a3226'] }
const PINE: PaintDoc = { kind: 'faces', top: { kind: 'speckle', size: 0.05, colors: ['#3f7a4a', '#2f6440', '#4c8a52'] }, side: { kind: 'patches', size: 0.08, colors: ['#2a5a3a', '#1f4a30'] } }
const LEAVES: PaintDoc = { kind: 'faces', top: { kind: 'speckle', size: 0.06, colors: ['#6aa84a', '#7fbc54', '#5a9844'] }, side: { kind: 'speckle', size: 0.06, colors: ['#4a8a3c', '#5a9844', '#3f7a38'] } }
const STONE: PaintDoc = { kind: 'faces', top: '#a8a8b4', side: { kind: 'speckle', size: 0.05, colors: ['#8a8a98', '#75758a', '#9a9aa8'] } }
const FRAME = '#4a3226', GLASS = '#2a3a52', LIT = '#ffc864'

/** A window in a wall that faces +z (`south`) or +x: dark glass set in a frame, and in front of the glass a lit pane on its own bone. */
function windowAt(bone: string, at: [number, number, number], south: boolean): PartDoc[] {
  const [x, y, z] = at
  const flat = (w: number, h: number, d: number): [number, number, number] => (south ? [w, h, d] : [d, h, w])
  const out = (by: number): [number, number, number] => (south ? [x, y, z + by] : [x + by, y, z])
  const bar = (dx: number, dy: number, w: number, h: number): PartDoc['shape'] => ({ kind: 'box', at: south ? [x + dx, y + dy, z + 0.03] : [x + 0.03, y + dy, z + dx], half: flat(w, h, 0.03) })
  return [
    { shape: { kind: 'box', at: out(0), half: flat(0.09, 0.08, 0.02) }, paint: GLASS },
    { shape: { kind: 'join', shapes: [bar(0, 0.09, 0.115, 0.016), bar(0, -0.09, 0.115, 0.016), bar(-0.1, 0, 0.016, 0.09), bar(0.1, 0, 0.016, 0.09)] }, paint: FRAME },
    { shape: { kind: 'box', at: out(0.034), half: flat(0.086, 0.076, 0.012) }, paint: LIT, glow: true, bone, noShadow: true },
  ]
}

/** A pine: a trunk and three tiers, swaying on its bone. */
function pine(bone: string, x: number, z: number, k: number): PartDoc[] {
  return [
    { shape: { kind: 'cylinder', at: [x, 0, z], height: 0.16 * k, r: 0.035 * k }, paint: BARK, bone },
    { shape: { kind: 'join', shapes: [
      { kind: 'cylinder', at: [x, 0.12 * k, z], height: 0.42 * k, r: 0.25 * k, rTop: 0.1 * k },
      { kind: 'cylinder', at: [x, 0.4 * k, z], height: 0.36 * k, r: 0.19 * k, rTop: 0.05 * k },
      { kind: 'cylinder', at: [x, 0.66 * k, z], height: 0.32 * k, r: 0.12 * k, rTop: 0.01 },
    ] }, paint: PINE, bone },
  ]
}

/** A leafy tree: a trunk and a crown of three rough balls. */
function leafy(bone: string, x: number, z: number, k: number): PartDoc[] {
  return [
    { shape: { kind: 'cylinder', at: [x, 0, z], height: 0.62 * k, r: 0.055 * k, rTop: 0.035 * k }, paint: BARK, bone },
    { shape: { kind: 'rough', shape: { kind: 'join', shapes: [
      { kind: 'sphere', at: [x, 0.84 * k, z], r: 0.33 * k },
      { kind: 'sphere', at: [x + 0.2 * k, 0.7 * k, z + 0.09 * k], r: 0.22 * k },
      { kind: 'sphere', at: [x - 0.19 * k, 0.72 * k, z - 0.06 * k], r: 0.23 * k },
    ] }, by: 0.03, scale: 0.12 }, paint: LEAVES, bone },
  ]
}

/** A bird that circles `r` out from its bone: a body and two wings that beat. */
function bird(n: number, at: [number, number, number], r: number): PartDoc[] {
  const [x, y, z] = at
  return [
    { shape: { kind: 'join', shapes: [{ kind: 'ball', at: [x + r, y, z], r: [0.016, 0.015, 0.045] }, { kind: 'cone', from: [x + r, y, z + 0.035], to: [x + r, y + 0.004, z + 0.075], r: 0.012, rTo: 0.004 }] }, paint: '#f0f0f4', bone: `bird${n}`, noShadow: true },
    { shape: { kind: 'ball', at: [x + r + 0.05, y, z + 0.004], r: [0.05, 0.007, 0.022] }, paint: '#d0d4e0', bone: `bird${n}L`, noShadow: true },
    { shape: { kind: 'ball', at: [x + r - 0.05, y, z + 0.004], r: [0.05, 0.007, 0.022] }, paint: '#d0d4e0', bone: `bird${n}R`, noShadow: true },
  ]
}

const FLOWERS: [number, number, string][] = [
  [-0.75, 0.55, '#f2a0c0'], [-0.6, 0.85, '#ffe070'], [0.45, 0.7, '#f4f0e8'], [0.75, 0.35, '#f2a0c0'], [0.95, 0.75, '#ffe070'],
  [-1.15, 0.5, '#f4f0e8'], [0.2, 1.15, '#f2a0c0'], [-0.3, 1.3, '#ffe070'], [1.25, 0.1, '#f4f0e8'], [-1.3, -0.2, '#ffe070'],
  [0.6, 1.25, '#f4f0e8'], [-0.95, 1.05, '#f2a0c0'],
]
const BIRDS: { at: [number, number, number]; r: number }[] = [
  { at: [0, 1.55, 0], r: 0.95 },
  { at: [0.15, 1.8, -0.1], r: 0.7 },
  { at: [-0.2, 1.4, 0.15], r: 1.2 },
]
const SMOKE: [number, number, number] = [0.2, 1.2, -0.5]

export const CLEARING: SceneDoc = {
  name: 'Cabin in a clearing',
  loop: 12,
  // nothing baked but the creases: the sun, moon, sky and lamps are live
  light: { ambient: 1, shadow: 0, ramp: 0, crevice: 0.35, wear: 0.25, bounce: 0 },
  palette: [
    '#1a1a26', '#2a3a52', '#4a3226', '#6e4630', '#8a5a3a', '#a06c44', '#1f4a30', '#2f6440',
    '#4a8a3c', '#6aa84a', '#8cc45c', '#75758a', '#a8a8b4', '#f4f0e8', '#ffc864', '#ffe070', '#f2a0c0',
  ],
  look: { dither: 0.1, glow: 1.2, outline: true, edges: true },
  // drawn smooth, not as pixel art: discs wide enough that nothing shows between them
  disc: 0.78,
  camera: { target: [0, 0.62, 0], distance: 5.3, azimuth: 24, elevation: 9 },
  air: {
    specks: [{ kind: 'fireflies', count: 44, from: [-1.35, 0.08, -0.9], to: [1.35, 0.75, 1.35], colors: ['#e6ff8a', '#fff2a0', '#c8ff70'], size: 0.014 }],
  },
  bones: [
    { name: 'win0', at: [-0.05, 0.34, 0.044] },
    { name: 'win1', at: [0.27, 0.34, 0.044] },
    { name: 'win2', at: [0.384, 0.34, -0.35] },
    { name: 'flame', at: [0.72, 0.4, 0.5] },
    { name: 'pine0', at: [-0.95, 0, -1.0] },
    { name: 'pine1', at: [0.8, 0, -1.15] },
    { name: 'pine2', at: [1.3, 0, -0.6] },
    { name: 'pine3', at: [-1.4, 0, -0.45] },
    { name: 'tree0', at: [1.15, 0, 0.45] },
    { name: 'tree1', at: [-1.2, 0, 0.5] },
    ...[0, 1, 2, 3, 4, 5].map((k) => ({ name: `smoke${k}`, at: SMOKE })),
    ...BIRDS.flatMap((b, n) => [
      { name: `bird${n}`, at: b.at },
      { name: `bird${n}L`, at: [b.at[0] + b.r, b.at[1], b.at[2]] as [number, number, number], parent: `bird${n}` },
      { name: `bird${n}R`, at: [b.at[0] + b.r, b.at[1], b.at[2]] as [number, number, number], parent: `bird${n}` },
    ]),
  ],
  parts: [
    // the clearing: grass on a slab of earth, and a trodden path from the door to the edge
    { shape: { kind: 'rough', shape: { kind: 'cylinder', at: [0, -0.3, 0], height: 0.3, r: 1.75 }, by: 0.03, scale: 0.7 }, paint: { kind: 'split', axis: 'y', at: -0.06, above: { kind: 'patches', size: 0.35, colors: ['#5a9844', '#6aa84a', '#6aa84a', '#8cc45c'] }, below: { kind: 'bands', axis: 'y', size: 0.07, colors: ['#8a5a3a', '#6e4630', '#a06c44'] } } },
    { shape: { kind: 'sweep', path: [[-0.4, -0.078, 0.06], [-0.42, -0.078, 0.5], [-0.2, -0.078, 0.95], [-0.25, -0.078, 1.6]], r: 0.1 }, paint: { kind: 'speckle', size: 0.05, colors: ['#b08a5c', '#a06c44', '#c4a070'] }, noShadow: true },
    // the cabin: log walls, a pitched roof, a stone chimney, a door with a step
    { shape: { kind: 'box', at: [-0.1, 0.3, -0.35], half: [0.48, 0.3, 0.36], round: 0.02 }, paint: LOGS },
    { shape: { kind: 'roof', at: [-0.1, 0.6, -0.35], half: [0.58, 0.46], height: 0.36 }, paint: { kind: 'faces', top: { kind: 'bands', axis: 'x', size: 0.08, colors: ['#6a4a3a', '#5a3e32', '#7a5642'] }, side: '#4a3226', under: '#4a3226' } },
    { shape: { kind: 'box', at: [0.2, 0.85, -0.5], half: [0.075, 0.33, 0.075] }, paint: { kind: 'bricks', size: [0.07, 0.04], colors: ['#8a8a98', '#a8a8b4', '#75758a'], line: '#4a4a5a' } },
    { shape: { kind: 'box', at: [-0.4, 0.21, 0.02], half: [0.1, 0.21, 0.02] }, paint: { kind: 'bands', axis: 'x', size: 0.04, colors: ['#5e4230', '#4a3226'] } },
    { shape: { kind: 'box', at: [-0.4, 0.015, 0.1], half: [0.15, 0.015, 0.07] }, paint: STONE },
    ...windowAt('win0', [-0.05, 0.34, 0.01], true),
    ...windowAt('win1', [0.27, 0.34, 0.01], true),
    ...windowAt('win2', [0.38, 0.34, -0.35], false),
    // a woodpile by the west wall, a chopping block, rocks, a bench
    { shape: { kind: 'join', shapes: [
      { kind: 'cone', from: [-0.68, 0.05, -0.6], to: [-0.68, 0.05, -0.2], r: 0.045 },
      { kind: 'cone', from: [-0.77, 0.05, -0.6], to: [-0.77, 0.05, -0.2], r: 0.045 },
      { kind: 'cone', from: [-0.725, 0.13, -0.6], to: [-0.725, 0.13, -0.2], r: 0.045 },
    ] }, paint: { kind: 'faces', top: '#a06c44', side: '#8a5a3a' } },
    { shape: { kind: 'cylinder', at: [-0.85, 0, 0.1], height: 0.1, r: 0.07 }, paint: { kind: 'faces', top: '#c4a070', side: '#6e4630' } },
    { shape: { kind: 'rough', shape: { kind: 'ball', at: [0.95, 0.05, -0.15], r: [0.17, 0.13, 0.14] }, by: 0.02, scale: 0.12 }, paint: STONE },
    { shape: { kind: 'rough', shape: { kind: 'ball', at: [-0.2, 0.03, 1.25], r: [0.1, 0.07, 0.09] }, by: 0.02, scale: 0.1 }, paint: STONE },
    { shape: { kind: 'join', shapes: [
      { kind: 'box', at: [0.3, 0.1, 0.16], half: [0.17, 0.012, 0.05] },
      { kind: 'box', at: [0.17, 0.05, 0.16], half: [0.015, 0.05, 0.045] },
      { kind: 'box', at: [0.43, 0.05, 0.16], half: [0.015, 0.05, 0.045] },
    ] }, paint: '#8a5a3a' },
    // a lantern on a post by the path: its flame rides a bone, so it can be lit
    { shape: { kind: 'cylinder', at: [0.72, 0, 0.5], height: 0.36, r: 0.018 }, paint: '#3a2a22' },
    { shape: { kind: 'join', shapes: [
      { kind: 'cylinder', at: [0.72, 0.345, 0.5], height: 0.02, r: 0.05 },
      { kind: 'cylinder', at: [0.72, 0.445, 0.5], height: 0.03, r: 0.055, rTop: 0.01 },
      { kind: 'cylinder', at: [0.675, 0.36, 0.5], height: 0.09, r: 0.007 },
      { kind: 'cylinder', at: [0.765, 0.36, 0.5], height: 0.09, r: 0.007 },
      { kind: 'cylinder', at: [0.72, 0.36, 0.455], height: 0.09, r: 0.007 },
      { kind: 'cylinder', at: [0.72, 0.36, 0.545], height: 0.09, r: 0.007 },
    ] }, paint: '#2a2630' },
    { shape: { kind: 'ball', at: [0.72, 0.4, 0.5], r: [0.028, 0.036, 0.028] }, paint: '#ffe0a0', glow: true, bone: 'flame', noShadow: true },
    // trees round the clearing, the tall ones east and west so their shadows cross it morning and evening
    ...pine('pine0', -0.95, -1.0, 1.25),
    ...pine('pine1', 0.8, -1.15, 1.45),
    ...pine('pine2', 1.3, -0.6, 1.05),
    ...pine('pine3', -1.4, -0.45, 0.95),
    ...leafy('tree0', 1.15, 0.45, 1.2),
    ...leafy('tree1', -1.2, 0.5, 1.05),
    // a fence along the south edge, with a gap where the path goes out
    { shape: { kind: 'fence', path: [[-1.45, 0, 0.85], [-0.95, 0, 1.25], [-0.5, 0, 1.45]], bay: 0.3, height: 0.22, post: 0.028, rails: 2, lean: 0.12, seed: 4 }, paint: { kind: 'pieces', colors: ['#8a5a3a', '#6e4630', '#a06c44'] } },
    { shape: { kind: 'fence', path: [[0.02, 0, 1.5], [0.6, 0, 1.4], [1.2, 0, 1.05]], bay: 0.3, height: 0.22, post: 0.028, rails: 2, lean: 0.12, seed: 7 }, paint: { kind: 'pieces', colors: ['#8a5a3a', '#6e4630', '#a06c44'] } },
    // flowers in the grass
    ...FLOWERS.map(([x, z, color]): PartDoc => ({ shape: { kind: 'join', shapes: [{ kind: 'cylinder', at: [x, 0, z], height: 0.05, r: 0.006 }, { kind: 'sphere', at: [x, 0.06, z], r: 0.022 }] }, paint: { kind: 'split', axis: 'y', at: 0.042, below: '#4a8a3c', above: color }, noShadow: true })),
    // smoke from the chimney
    ...[0, 1, 2, 3, 4, 5].map((k): PartDoc => ({ shape: { kind: 'rough', shape: { kind: 'ball', at: SMOKE, r: [0.045, 0.036, 0.042] }, by: 0.012, scale: 0.05 }, paint: k % 2 ? '#d4d4dc' : '#bcbcc8', bone: `smoke${k}`, noShadow: true })),
    // birds circling over the clearing
    ...BIRDS.flatMap((b, n) => bird(n, b.at, b.r)),
  ],
  moves: [
    { kind: 'sway', bone: 'pine0', axis: 'z', degrees: 1.5, times: 3, phase: 0.0 },
    { kind: 'sway', bone: 'pine1', axis: 'z', degrees: 1.5, times: 4, phase: 0.3 },
    { kind: 'sway', bone: 'pine2', axis: 'z', degrees: 1.5, times: 5, phase: 0.6 },
    { kind: 'sway', bone: 'pine3', axis: 'x', degrees: 1.5, times: 4, phase: 0.1 },
    { kind: 'sway', bone: 'tree0', axis: 'z', degrees: 2, times: 3, phase: 0.45 },
    { kind: 'sway', bone: 'tree1', axis: 'z', degrees: 2, times: 4, phase: 0.8 },
    ...[0, 1, 2, 3, 4, 5].map((k) => ({ kind: 'drift' as const, bone: `smoke${k}`, by: [0.34, 0.62, 0.08] as [number, number, number], times: 2, grow: [0.4, 1.7] as [number, number], phase: k / 6 })),
    ...BIRDS.flatMap((_, n) => [
      { kind: 'spin' as const, bone: `bird${n}`, axis: 'y' as const, times: n === 1 ? -1 : 1, phase: n * 0.37 },
      { kind: 'sway' as const, bone: `bird${n}L`, axis: 'z' as const, degrees: 35, times: 24 },
      { kind: 'sway' as const, bone: `bird${n}R`, axis: 'z' as const, degrees: -35, times: 24 },
    ]),
  ],
  // the lamps, in the order of `LAMPS` (scene.ts): two south windows, the east window, the lantern
  lights: [
    { at: [-0.05, 0.3, 0.3], color: '#ffb850', strength: 1.5, range: 0.8, flicker: { by: 0.05, times: 5 } },
    { at: [0.27, 0.3, 0.3], color: '#ffb850', strength: 1.5, range: 0.8, flicker: { by: 0.05, times: 7 } },
    { at: [0.64, 0.3, -0.35], color: '#ffb850', strength: 1.4, range: 0.75, flicker: { by: 0.05, times: 6 } },
    { at: [0.72, 0.4, 0.5], color: '#ffd890', strength: 1.9, range: 1.0, flicker: { by: 0.12, times: 9 } },
  ],
}
