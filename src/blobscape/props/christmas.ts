import type { PropDoc, SceneProject } from '../../splat-engine/project.ts'
import type { LightDoc, MoveDoc, PartDoc, SceneDoc } from '../../splat-engine/sceneDoc.ts'
import type { MadeProp } from './garden.ts'

/**
 * Christmas things (Matt, 2026-11-23, for the Ugly Sweater experiment: single props as scenes of their own, and a
 * couple of fuller ones made from them): a snowy knoll to stand them on, a decorated tree, a big ornament on a candy
 * cane hook, and three presents. Each is written on its own, standing on the origin, in a few flat, strong colors,
 * so it reads when it is knitted in a handful of yarns; the scenes below only set them down
 * (docs/scenes-from-props.md). Data only, as a scene description is: see docs/scene-descriptions.md.
 */

/** The colors every Christmas piece carries, so any of them can stand alone in Scene Creator. */
const PALETTE = [
  '#0b1020', '#16203a', '#26365c', '#3f5a94', '#0e3b22', '#16602f', '#22863f', '#4fb35a',
  '#3d2414', '#6b3e1e', '#a8703a', '#6e1019', '#a81822', '#d42a33', '#f0606a', '#b9801c',
  '#e8b530', '#ffe27a', '#8fa6c4', '#c4d3e6', '#eef3f8', '#ffffff', '#1f5fa8', '#3b8fd6',
  '#8ac6f0', '#f4ecdb', '#3a3f4a', '#6c7482',
]
const SKY: [string, string] = ['#0b1020', '#26365c']
const LIGHT: SceneDoc['light'] = { from: [0.35, 1, 0.55], ambient: 0.62, shadow: 0.45 }
const LOOK: SceneDoc['look'] = { dither: 0.5, glow: 1.4, outline: true, edges: true }

/** A prop standing on the origin, framed for its card by how tall it is. */
function made(name: string, tall: number, parts: PartDoc[], more: { bones?: SceneDoc['bones']; moves?: MoveDoc[]; lights?: LightDoc[] } = {}): PropDoc {
  return {
    name,
    foot: [0, 0, 0],
    doc: {
      name, loop: 12, light: LIGHT, palette: PALETTE, look: LOOK,
      camera: { target: [0, tall / 2, 0], distance: Math.max(0.9, tall * 2.5), azimuth: 14, elevation: 12 },
      parts, ...more,
    },
  }
}

/** A low round knoll under snow, level at y = 0, on a winter night: the shared moon and stars over it. */
export const SNOWY_KNOLL: PropDoc = {
  name: 'Snowy knoll',
  foot: [0, 0, 0],
  doc: {
    name: 'Snowy knoll',
    loop: 12,
    tags: ['snowy', 'night'],
    light: LIGHT,
    palette: PALETTE,
    sky: SKY,
    look: LOOK,
    camera: { target: [0, 0.72, 0], distance: 4.3, azimuth: 14, elevation: 10, swing: 6 },
    heavens: {
      moon: { at: [-1.25, 2.05, -1.6], r: 0.13, colors: ['#eef3f8', '#c4d3e6'] },
      stars: { count: 22, from: [-2, 1.2, -1.8], to: [2, 2.4, -1.3], size: 0.014, colors: ['#ffffff', '#ffe27a', '#c4d3e6'] },
    },
    air: { haze: { color: '#16203a', from: 2, to: 9 } },
    parts: [
      { shape: { kind: 'rough', by: 0.02, scale: 0.5, shape: { kind: 'cylinder', at: [0, -0.26, 0], height: 0.26, r: 1.25, rTop: 1.18 } }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.3, colors: ['#eef3f8', '#eef3f8', '#ffffff', '#c4d3e6'] }, side: { kind: 'bands', axis: 'y', size: 0.06, colors: ['#8fa6c4', '#c4d3e6', '#8fa6c4', '#3f5a94'] } } },
      // soft drifts round the edge, so the knoll's outline is not a plain disc
      { shape: { kind: 'ball', at: [-0.82, 0, 0.42], r: [0.3, 0.07, 0.24] }, paint: '#ffffff', noShadow: true },
      { shape: { kind: 'ball', at: [0.88, 0, 0.2], r: [0.26, 0.06, 0.3] }, paint: '#ffffff', noShadow: true },
      { shape: { kind: 'ball', at: [0.3, 0, -0.9], r: [0.34, 0.08, 0.22] }, paint: '#eef3f8', noShadow: true },
      { shape: { kind: 'ball', at: [-0.5, 0, -0.8], r: [0.28, 0.06, 0.24] }, paint: '#eef3f8', noShadow: true },
    ],
  },
}

// ---- the tree ----

/** The tree's tiers, from the bottom: where each starts, how tall it is, and its radius at its foot and its top. */
const TIERS: [number, number, number, number][] = [[0.2, 0.46, 0.52, 0.17], [0.52, 0.42, 0.42, 0.12], [0.82, 0.38, 0.32, 0.08], [1.09, 0.32, 0.21, 0.012]]
const GREENS = ['#16602f', '#22863f', '#16602f', '#22863f']
/** A point on a tier's side: `up` is the share of its height, `turn` the degrees round it from the front. */
function onTier(tier: number, up: number, turn: number, out = 0): [number, number, number] {
  const [y, h, r, rTop] = TIERS[tier]
  const rad = r + (rTop - r) * up + out, a = (turn * Math.PI) / 180
  return [+(Math.sin(a) * rad).toFixed(3), +(y + h * up).toFixed(3), +(Math.cos(a) * rad).toFixed(3)]
}
const BAUBLES = ['#d42a33', '#e8b530', '#3b8fd6', '#f4ecdb']
/** Where the baubles hang: tier, share of its height, degrees round. */
const HUNG: [number, number, number][] = [
  [0, 0.18, -50], [0, 0.22, 20], [0, 0.15, 95], [0, 0.2, 170], [0, 0.18, -120],
  [1, 0.2, -15], [1, 0.22, 60], [1, 0.18, 140], [1, 0.2, -95], [1, 0.2, -170],
  [2, 0.22, 30], [2, 0.2, -60], [2, 0.2, 120], [2, 0.22, -150],
  [3, 0.25, -10], [3, 0.22, 110], [3, 0.24, -130],
]
/** Where the small lights sit, in two strings that twinkle in turn. */
const BULBS: [number, number, number][] = [
  [0, 0.55, -20], [0, 0.6, 60], [0, 0.5, 135], [0, 0.58, -100], [0, 0.55, -165],
  [1, 0.58, 25], [1, 0.55, 100], [1, 0.6, -50], [1, 0.55, -135], [1, 0.58, 175],
  [2, 0.58, -20], [2, 0.6, 75], [2, 0.55, 160], [2, 0.58, -105],
  [3, 0.6, 40], [3, 0.58, -70], [3, 0.6, 170],
]
const STAR_AT: [number, number, number] = [0, 1.5, 0]
/** A five-point star standing upright, facing the front: a middle and five rays. */
const starShape = (at: [number, number, number], r: number): PartDoc['shape'] => ({
  kind: 'join',
  shapes: [
    { kind: 'ball', at, r: [r * 0.42, r * 0.42, r * 0.22] },
    ...Array.from({ length: 5 }, (_, i) => {
      const a = (i * 72 * Math.PI) / 180
      return { kind: 'cone' as const, from: at, to: [+(at[0] + Math.sin(a) * r).toFixed(3), +(at[1] + Math.cos(a) * r).toFixed(3), at[2]] as [number, number, number], r: r * 0.3, rTo: r * 0.03 }
    }),
  ],
})

/** A Christmas tree in four tiers with a garland on each, baubles, two strings of lights that twinkle in turn after dark, and a gold star. */
export const CHRISTMAS_TREE = made('Christmas tree', 1.65, [
  { shape: { kind: 'cylinder', at: [0, 0, 0], height: 0.24, r: 0.075, rTop: 0.06 }, paint: { kind: 'bands', axis: 'x', size: 0.03, colors: ['#6b3e1e', '#3d2414'] } },
  ...TIERS.map(([y, height, r, rTop], i): PartDoc => ({ shape: { kind: 'cylinder', at: [0, y, 0], height, r, rTop }, paint: { kind: 'faces', side: GREENS[i], under: '#0e3b22', top: GREENS[i] } })),
  // a garland round each tier
  ...TIERS.slice(0, 3).map(([y, height, r, rTop], i): PartDoc => ({ shape: { kind: 'ring', at: [0, +(y + height * 0.38).toFixed(3), 0], r: +(r + (rTop - r) * 0.38 + 0.004).toFixed(3), tube: 0.02 }, paint: i % 2 ? '#e8b530' : '#f4ecdb', noShadow: true })),
  ...HUNG.map(([tier, up, turn], i): PartDoc => ({ shape: { kind: 'sphere', at: onTier(tier, up, turn, 0.015), r: tier === 3 ? 0.036 : 0.046 }, paint: BAUBLES[i % BAUBLES.length], noShadow: true })),
  ...BULBS.map(([tier, up, turn], i): PartDoc => ({ shape: { kind: 'sphere', at: onTier(tier, up, turn, 0.008), r: 0.024 }, paint: i % 2 ? '#ffe27a' : '#f0606a', bone: i % 2 ? 'bulbsB' : 'bulbsA', glow: true, lit: 'dark', unlit: i % 2 ? '#b9801c' : '#a81822', noShadow: true })),
  { shape: starShape(STAR_AT, 0.15), paint: '#e8b530', bone: 'star', glow: true, noShadow: true },
], {
  bones: [{ name: 'bulbsA', at: [0, 0.8, 0] }, { name: 'bulbsB', at: [0, 0.8, 0] }, { name: 'star', at: STAR_AT }],
  moves: [
    { kind: 'pulse', bone: 'star', size: [0.92, 1.1], times: 6 },
    { kind: 'sway', bone: 'star', axis: 'z', degrees: 5, times: 3 },
  ],
  lights: [{ at: [0, 0.85, 0.55], color: '#ffe27a', strength: 1.1, range: 1.5, lit: 'dark', flicker: { by: 0.15, times: 6 } }],
})

// ---- the ornament ----

const HOOK_TOP: [number, number, number] = [0, 1.36, 0]
/** A big striped glass ornament swinging from a candy cane hook. */
export const ORNAMENT = made('Ornament on a candy cane', 1.6, [
  // the cane: a post that curls over, striped red and white
  { shape: { kind: 'sweep', path: [[-0.56, 0, 0], [-0.56, 1.2, 0], [-0.5, 1.42, 0], [-0.32, 1.54, 0], [-0.12, 1.5, 0], HOOK_TOP], r: 0.045 }, paint: { kind: 'bands', axis: 'y', size: 0.075, colors: ['#d42a33', '#ffffff'] } },
  { shape: { kind: 'ball', at: [-0.56, 0, 0], r: [0.16, 0.05, 0.16] }, paint: '#ffffff', noShadow: true },
  // the string, the cap and its loop
  { shape: { kind: 'cylinder', at: [0, 1.1, 0], height: 0.26, r: 0.008 }, paint: '#e8b530', bone: 'swing', noShadow: true },
  { shape: { kind: 'ring', at: [0, 1.12, 0], r: 0.03, tube: 0.01 }, paint: '#e8b530', bone: 'swing', noShadow: true },
  { shape: { kind: 'cylinder', at: [0, 1.01, 0], height: 0.09, r: 0.085, rTop: 0.07 }, paint: { kind: 'bands', axis: 'x', size: 0.022, colors: ['#e8b530', '#b9801c'] }, bone: 'swing' },
  // the ball: red, with a wide cream band that carries a zigzag of gold dots, and thin gold lines either side
  { shape: { kind: 'sphere', at: [0, 0.64, 0], r: 0.39 }, paint: { kind: 'split', axis: 'y', at: 0.5, below: { kind: 'split', axis: 'y', at: 0.46, below: '#d42a33', above: '#e8b530' }, above: { kind: 'split', axis: 'y', at: 0.78, below: '#f4ecdb', above: { kind: 'split', axis: 'y', at: 0.82, below: '#e8b530', above: '#d42a33' } } }, bone: 'swing' },
  ...Array.from({ length: 10 }, (_, i): PartDoc => {
    const a = (i * 36 * Math.PI) / 180, y = 0.64 + (i % 2 ? 0.06 : -0.06), r = Math.sqrt(0.39 * 0.39 - (y - 0.64) ** 2) + 0.004
    return { shape: { kind: 'sphere', at: [+(Math.sin(a) * r).toFixed(3), +y.toFixed(3), +(Math.cos(a) * r).toFixed(3)], r: 0.04 }, paint: i % 2 ? '#22863f' : '#d42a33', bone: 'swing', noShadow: true }
  }),
  // a bright spot where the light catches it
  { shape: { kind: 'ball', at: [0.16, 0.86, 0.3], r: [0.06, 0.08, 0.03] }, paint: '#ffffff', bone: 'swing', noShadow: true },
], {
  bones: [{ name: 'swing', at: HOOK_TOP }],
  moves: [{ kind: 'sway', bone: 'swing', axis: 'z', degrees: 6, times: 2, wind: 8 }, { kind: 'sway', bone: 'swing', axis: 'y', degrees: 14, times: 1 }],
})

// ---- presents ----

/** A wrapped box with a ribbon both ways and a bow: `half` is half its width, height and depth. */
function present(name: string, half: [number, number, number], wrap: PartDoc['paint'], ribbon: string): PropDoc {
  const [w, h, d] = half, top = h * 2, band = Math.min(w, d) * 0.24
  return made(name, top + 0.1, [
    { shape: { kind: 'box', at: [0, h, 0], half, round: 0.012 }, paint: wrap },
    { shape: { kind: 'box', at: [0, h + 0.004, 0], half: [band, h + 0.006, d + 0.008] }, paint: ribbon, noShadow: true },
    { shape: { kind: 'box', at: [0, h + 0.004, 0], half: [w + 0.008, h + 0.006, band] }, paint: ribbon, noShadow: true },
    { shape: { kind: 'ball', at: [-band * 1.5, top + band * 0.8, 0], r: [band * 1.5, band * 0.9, band] }, paint: ribbon, noShadow: true },
    { shape: { kind: 'ball', at: [band * 1.5, top + band * 0.8, 0], r: [band * 1.5, band * 0.9, band] }, paint: ribbon, noShadow: true },
    { shape: { kind: 'sphere', at: [0, top + band * 0.6, 0], r: band * 0.75 }, paint: ribbon, noShadow: true },
  ])
}
/** A red present with a gold ribbon. */
export const RED_PRESENT = present('Red present', [0.17, 0.15, 0.17], '#d42a33', '#e8b530')
/** A tall green present with a red ribbon. */
export const GREEN_PRESENT = present('Green present', [0.13, 0.21, 0.13], { kind: 'bands', axis: 'y', size: 0.07, colors: ['#22863f', '#16602f'] }, '#d42a33')
/** A wide blue present with a cream ribbon. */
export const BLUE_PRESENT = present('Blue present', [0.24, 0.1, 0.16], { kind: 'speckle', size: 0.05, colors: ['#3b8fd6', '#3b8fd6', '#1f5fa8'] }, '#f4ecdb')

/** The Christmas pieces the library lists. */
export const CHRISTMAS_MADE: MadeProp[] = [
  { id: 'snowy-knoll', tags: ['snowy', 'night'], kind: 'land', about: 'A low round knoll under snow on a winter night, with the moon and stars over it', prop: SNOWY_KNOLL },
  { id: 'christmas-tree', tags: ['tree', 'evergreen', 'lamp'], kind: 'prop', about: 'A Christmas tree with garlands, baubles, lights that twinkle after dark and a gold star', prop: CHRISTMAS_TREE },
  { id: 'ornament', tags: ['thing'], kind: 'prop', about: 'A big striped glass ornament swinging from a candy cane hook', prop: ORNAMENT },
  { id: 'red-present', tags: ['thing'], kind: 'prop', about: 'A red present with a gold ribbon and bow', prop: RED_PRESENT },
  { id: 'green-present', tags: ['thing'], kind: 'prop', about: 'A tall striped green present with a red ribbon and bow', prop: GREEN_PRESENT },
  { id: 'blue-present', tags: ['thing'], kind: 'prop', about: 'A wide blue present with a cream ribbon and bow', prop: BLUE_PRESENT },
]

const project = (name: string, props: SceneProject['props']): SceneProject => ({ kind: 'blobscape-project', version: 1, name, loop: 12, land: 'snowy-knoll', props })

/** The tree alone on the knoll. */
export const TREE_PROJECT = project('Christmas tree', [{ prop: 'christmas-tree', at: [0, 0, 0], turn: 0, size: 1 }])
/** The ornament alone on the knoll. */
export const ORNAMENT_PROJECT = project('Christmas ornament', [{ prop: 'ornament', at: [0.2, 0, 0], turn: 0, size: 1 }])
/** The tree with presents round its foot. */
export const PRESENTS_PROJECT = project('Presents under the tree', [
  { prop: 'christmas-tree', at: [0, 0, -0.15], turn: 0, size: 1 },
  { prop: 'red-present', at: [-0.5, 0, 0.42], turn: 18, size: 1 },
  { prop: 'green-present', at: [0.62, 0, 0.2], turn: -12, size: 1 },
  { prop: 'blue-present', at: [0.14, 0, 0.62], turn: 6, size: 1 },
  { prop: 'red-present', at: [0.82, 0, 0.56], turn: 40, size: 0.62 },
  { prop: 'green-present', at: [-0.82, 0, 0.1], turn: 30, size: 0.7 },
  { prop: 'blue-present', at: [-0.32, 0, 0.78], turn: -25, size: 0.6 },
])
