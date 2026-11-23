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
  '#8ac6f0', '#f4ecdb', '#3a3f4a', '#6c7482', '#c9925a',
]
const SKY: [string, string] = ['#0b1020', '#26365c']
const LIGHT: SceneDoc['light'] = { from: [0.35, 1, 0.55], ambient: 0.62, shadow: 0.45 }
const LOOK: SceneDoc['look'] = { dither: 0.5, glow: 1.4, outline: true, edges: true }

/** A prop standing on the origin, framed for its card by how tall it is. */
function made(name: string, tall: number, parts: PartDoc[], more: { bones?: SceneDoc['bones']; moves?: MoveDoc[]; lights?: LightDoc[]; fires?: SceneDoc['fires'] } = {}): PropDoc {
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

// ---- the snowflake ----

type V3 = [number, number, number]
const r3 = (v: number[]): V3 => [+v[0].toFixed(3), +v[1].toFixed(3), +v[2].toFixed(3)]
/** A way in the flake's plane (x right, y up), `deg` round from straight up. */
const way = (deg: number): V3 => [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180), 0]
const along = (from: V3, d: V3, by: number): V3 => r3([from[0] + d[0] * by, from[1] + d[1] * by, from[2] + d[2] * by])
const FLAKE_AT: V3 = [0, 0.98, 0]
const FLAKE_R = 0.68
/** One arm of the flake, `deg` round from straight up: a spar with two pairs of branches and a point. */
function flakeArm(deg: number): PartDoc['shape'] {
  const d = way(deg), tip = along(FLAKE_AT, d, FLAKE_R)
  const branch = (at: number, length: number) => [-60, 60].map((turn) => {
    const from = along(FLAKE_AT, d, FLAKE_R * at)
    return { kind: 'cone' as const, from, to: along(from, way(deg + turn), length), r: 0.03, rTo: 0.014 }
  })
  return {
    kind: 'join',
    shapes: [
      { kind: 'cone', from: FLAKE_AT, to: tip, r: 0.042, rTo: 0.02 },
      ...branch(0.42, 0.2), ...branch(0.68, 0.13),
      { kind: 'ball', at: tip, r: [0.045, 0.045, 0.022] },
    ],
  }
}
/** A big six-armed snowflake turning slowly in the air over a drift of snow, a pale blue gem at its heart. */
export const SNOWFLAKE = made('Snowflake', 1.7, [
  ...[0, 60, 120, 180, 240, 300].map((deg): PartDoc => ({ shape: flakeArm(deg), paint: '#eef3f8', bone: 'flake' })),
  // a ring joining the arms near the middle, and the gem
  { shape: { kind: 'join', shapes: [0, 60, 120, 180, 240, 300].map((deg) => ({ kind: 'cone' as const, from: along(FLAKE_AT, way(deg), 0.17), to: along(FLAKE_AT, way(deg + 60), 0.17), r: 0.026 })) }, paint: '#c4d3e6', bone: 'flake' },
  { shape: { kind: 'ball', at: FLAKE_AT, r: [0.1, 0.1, 0.045] }, paint: '#8ac6f0', bone: 'flake' },
  // a little drift of snow under it, so it has somewhere to stand when it is set down elsewhere
  { shape: { kind: 'ball', at: [0, 0, 0], r: [0.34, 0.07, 0.24] }, paint: '#ffffff', noShadow: true },
], {
  bones: [{ name: 'flake', at: FLAKE_AT }],
  moves: [
    { kind: 'spin', bone: 'flake', axis: 'z', times: 1 },
    { kind: 'bob', bone: 'flake', by: [0, 0.05, 0], times: 2 },
  ],
})

// ---- the sleigh and reindeer ----

const GOLD = '#e8b530'
/** A red sleigh on gold runners curling up at the front, its back seat high, a sack of presents in it; reins run forward to where the reindeer stand. Faces +x. */
export const SLEIGH = made('Sleigh', 0.75, [
  // runners, curled up at the front, and the struts that hold the body on them
  ...[-0.19, 0.19].map((z): PartDoc => ({ shape: { kind: 'sweep', path: [[-0.5, 0.03, z], [0.32, 0.03, z], [0.48, 0.08, z], [0.54, 0.2, z], [0.48, 0.28, z], [0.42, 0.24, z]], r: 0.02 }, paint: GOLD })),
  ...[-0.19, 0.19].flatMap((z): PartDoc[] => [-0.32, 0.18].map((x) => ({ shape: { kind: 'cylinder', at: [x, 0.04, z], height: 0.12, r: 0.016 }, paint: GOLD, noShadow: true }))),
  // the body: a low box, a swept front and a high back
  { shape: { kind: 'box', at: [-0.06, 0.28, 0], half: [0.36, 0.11, 0.2], round: 0.04 }, paint: '#d42a33' },
  { shape: { kind: 'box', at: [0.26, 0.35, 0], half: [0.07, 0.15, 0.2], round: 0.06 }, paint: '#d42a33' },
  { shape: { kind: 'box', at: [-0.38, 0.42, 0], half: [0.06, 0.25, 0.2], round: 0.05 }, paint: '#a81822' },
  // gold trim along the side and round the top of the front
  ...[-0.205, 0.205].map((z): PartDoc => ({ shape: { kind: 'sweep', path: [[-0.4, 0.3, z], [0.22, 0.3, z], [0.3, 0.42, z], [0.3, 0.48, z]], r: 0.014 }, paint: GOLD, noShadow: true })),
  // a cushion on the seat
  { shape: { kind: 'box', at: [-0.22, 0.41, 0], half: [0.12, 0.025, 0.18], round: 0.02 }, paint: '#16602f', noShadow: true },
  // the sack and what sticks out of it
  { shape: { kind: 'ball', at: [0.02, 0.5, 0], r: [0.17, 0.16, 0.15] }, paint: { kind: 'speckle', size: 0.04, colors: ['#a8703a', '#a8703a', '#6b3e1e'] } },
  { shape: { kind: 'box', at: [-0.04, 0.68, 0.02], half: [0.06, 0.05, 0.06], round: 0.01 }, paint: '#22863f', noShadow: true },
  { shape: { kind: 'box', at: [0.08, 0.69, -0.03], half: [0.05, 0.06, 0.05], round: 0.01 }, paint: '#3b8fd6', noShadow: true },
  { shape: { kind: 'sphere', at: [0.03, 0.75, 0.05], r: 0.035 }, paint: GOLD, noShadow: true },
  // the reins, out to the reindeer
  ...[-0.13, 0.13].map((z): PartDoc => ({ shape: { kind: 'sweep', path: [[0.3, 0.46, z * 0.5], [0.7, 0.4, z], [1.2, 0.38, z], [1.65, 0.38, z]], r: 0.008 }, paint: '#6e1019', noShadow: true })),
])

/** A reindeer standing facing +x, a red harness with a gold bell, branching antlers; it nods and paws the snow. `nose` is its nose's color, and a red one glows. */
function reindeer(name: string, nose: string, glows: boolean, phase: number): PropDoc {
  const BROWN = '#6b3e1e', LIGHT_BROWN = '#a8703a', DARK = '#3d2414'
  const leg = (x: number, z: number, bone?: string): PartDoc[] => [
    { shape: { kind: 'cylinder', at: [x, 0.03, z], height: 0.26, r: 0.022, rTop: 0.028 }, paint: BROWN, ...(bone ? { bone } : {}) },
    { shape: { kind: 'cylinder', at: [x, 0, z], height: 0.04, r: 0.025 }, paint: DARK, ...(bone ? { bone } : {}) },
  ]
  return made(name, 0.8, [
    { shape: { kind: 'ball', at: [0, 0.36, 0], r: [0.21, 0.11, 0.1] }, paint: { kind: 'split', axis: 'y', at: 0.3, below: LIGHT_BROWN, above: BROWN } },
    ...leg(-0.13, 0.05), ...leg(-0.13, -0.05), ...leg(0.12, -0.05), ...leg(0.12, 0.05, 'paw'),
    { shape: { kind: 'sphere', at: [-0.21, 0.42, 0], r: 0.04 }, paint: '#f4ecdb', noShadow: true },
    // the harness and its bell
    { shape: { kind: 'box', at: [0.03, 0.36, 0], half: [0.03, 0.12, 0.108], round: 0.01 }, paint: '#d42a33', noShadow: true },
    { shape: { kind: 'sphere', at: [0.03, 0.23, 0.06], r: 0.025 }, paint: GOLD, noShadow: true },
    // the neck, and the head on a bone of its own
    { shape: { kind: 'cone', from: [0.13, 0.4, 0], to: [0.23, 0.56, 0], r: 0.065, rTo: 0.045 }, paint: BROWN },
    { shape: { kind: 'ball', at: [0.27, 0.59, 0], r: [0.08, 0.06, 0.055] }, paint: BROWN, bone: 'head' },
    { shape: { kind: 'ball', at: [0.35, 0.565, 0], r: [0.055, 0.04, 0.04] }, paint: LIGHT_BROWN, bone: 'head' },
    { shape: { kind: 'sphere', at: [0.405, 0.57, 0], r: glows ? 0.03 : 0.022 }, paint: nose, bone: 'head', noShadow: true, ...(glows ? { glow: true, lit: 'always' as const } : {}) },
    ...[-0.045, 0.045].map((z): PartDoc => ({ shape: { kind: 'sphere', at: [0.3, 0.615, z], r: 0.012 }, paint: '#0b1020', bone: 'head', noShadow: true })),
    ...[-0.05, 0.05].map((z): PartDoc => ({ shape: { kind: 'cone', from: [0.24, 0.62, z], to: [0.2, 0.66, z * 2.2], r: 0.02, rTo: 0.006 }, paint: BROWN, bone: 'head', noShadow: true })),
    ...[-0.03, 0.03].map((z, i): PartDoc => ({ shape: { kind: 'antler', at: [0.25, 0.64, z], dir: [-0.25, 1, z * 10], length: 0.2, r: 0.013, tines: 3, seed: 3 + i }, paint: '#e8d4a8', bone: 'head', noShadow: true })),
  ], {
    bones: [{ name: 'head', at: [0.22, 0.56, 0] }, { name: 'paw', at: [0.12, 0.29, 0.05] }],
    moves: [
      { kind: 'sway', bone: 'head', axis: 'z', degrees: 7, times: 3, phase },
      { kind: 'sway', bone: 'paw', axis: 'z', degrees: 22, times: 4, phase: phase + 0.25 },
    ],
    ...(glows ? { lights: [{ at: [0.46, 0.57, 0], color: '#f0606a', strength: 0.8, range: 0.5, lit: 'always' as const, flicker: { by: 0.2, times: 4 } }] } : {}),
  })
}
/** A reindeer in a red harness. */
export const REINDEER = reindeer('Reindeer', '#3d2414', false, 0)
/** A reindeer whose red nose glows. */
export const RED_NOSED_REINDEER = reindeer('Red-nosed reindeer', '#d42a33', true, 0.4)

// ---- the fireplace and the room it stands in ----

/** A cozy room: a plank floor, a striped wall behind and a rug, lit by what is in it. */
export const HEARTH_ROOM: PropDoc = {
  name: 'Cozy room',
  foot: [0, 0, 0],
  doc: {
    name: 'Cozy room',
    loop: 12,
    tags: ['indoor', 'night'],
    // a room is never day: what waits for the dark burns at every hour here, and waits again set down outdoors
    lamps: 'always',
    light: { from: [0.3, 1, 0.7], ambient: 0.5, shadow: 0.4 },
    palette: PALETTE,
    sky: ['#3d2414', '#0b1020'],
    look: LOOK,
    camera: { target: [0, 0.82, 0], distance: 4.3, azimuth: 14, elevation: 10, swing: 6 },
    parts: [
      { shape: { kind: 'box', at: [0, -0.06, 0], half: [1.4, 0.06, 1.05] }, paint: { kind: 'faces', top: { kind: 'bands', axis: 'x', size: 0.16, colors: ['#6b3e1e', '#a8703a', '#6b3e1e', '#3d2414'] }, side: '#3d2414' } },
      { shape: { kind: 'box', at: [0, 1.05, -0.99], half: [1.4, 1.05, 0.06] }, paint: { kind: 'bands', axis: 'x', size: 0.14, colors: ['#16602f', '#0e3b22'] } },
      { shape: { kind: 'box', at: [0, 0.07, -0.92], half: [1.4, 0.07, 0.02] }, paint: '#3d2414', noShadow: true },
      { shape: { kind: 'ball', at: [0, 0, 0.42], r: [0.78, 0.014, 0.38] }, paint: { kind: 'bands', axis: 'x', size: 0.1, colors: ['#a81822', '#e8b530', '#a81822', '#6e1019'] }, noShadow: true },
    ],
  },
}

const STOCKINGS: [number, string | PartDoc['paint']][] = [
  [-0.44, '#d42a33'], [0, { kind: 'bands', axis: 'y', size: 0.05, colors: ['#22863f', '#f4ecdb'] }], [0.44, '#a81822'],
]
const CANDLES = [-0.6, 0.6]
/** A brick fireplace with a fire that burns when it is dark (always, in a room), three stockings hung from the mantel, candles, a garland and a wreath above. */
export const FIREPLACE = made('Fireplace with stockings', 1.75, [
  // the chimney breast with the fire's opening cut in, its sooty back, and the breast going up above the mantel
  { shape: { kind: 'cut', shape: { kind: 'box', at: [0, 0.56, 0], half: [0.62, 0.56, 0.22] }, hole: { kind: 'box', at: [0, 0.3, 0.14], half: [0.3, 0.3, 0.2] } }, paint: { kind: 'bricks', size: [0.2, 0.1], colors: ['#c9925a'], line: '#a8703a' } },
  { shape: { kind: 'box', at: [0, 0.3, -0.05], half: [0.3, 0.3, 0.02] }, paint: '#0b1020', noShadow: true },
  { shape: { kind: 'box', at: [0, 1.45, -0.02], half: [0.48, 0.32, 0.18] }, paint: { kind: 'bricks', size: [0.2, 0.1], colors: ['#c9925a'], line: '#a8703a' } },
  // the hearth stone and the mantel shelf
  { shape: { kind: 'box', at: [0, 0.03, 0.3], half: [0.72, 0.03, 0.13] }, paint: '#6c7482' },
  { shape: { kind: 'box', at: [0, 1.15, 0.05], half: [0.74, 0.04, 0.27], round: 0.01 }, paint: '#6b3e1e' },
  // logs across each other
  { shape: { kind: 'cone', from: [-0.22, 0.06, 0.02], to: [0.2, 0.06, 0.1], r: 0.05, rTo: 0.045 }, paint: { kind: 'bands', axis: 'x', size: 0.05, colors: ['#6b3e1e', '#3d2414'] } },
  { shape: { kind: 'cone', from: [-0.14, 0.13, 0.12], to: [0.18, 0.12, -0.02], r: 0.045, rTo: 0.04 }, paint: { kind: 'bands', axis: 'x', size: 0.05, colors: ['#3d2414', '#6b3e1e'] } },
  // a garland along the mantel's front with red berries
  { shape: { kind: 'sweep', path: [[-0.72, 1.2, 0.3], [-0.36, 1.2, 0.31], [0, 1.2, 0.31], [0.36, 1.2, 0.31], [0.72, 1.2, 0.3]], r: 0.04 }, paint: { kind: 'speckle', size: 0.03, colors: ['#16602f', '#22863f', '#0e3b22'] }, noShadow: true },
  ...[-0.6, -0.3, 0.15, 0.45].map((x): PartDoc => ({ shape: { kind: 'sphere', at: [x, 1.23, 0.35], r: 0.022 }, paint: '#d42a33', noShadow: true })),
  // the stockings: a hook, a white cuff, a leg and a foot turned toward the fire's side
  ...STOCKINGS.flatMap(([x, paint], i): PartDoc[] => [
    { shape: { kind: 'sphere', at: [x, 1.1, 0.33], r: 0.018 }, paint: GOLD, bone: `sock${i}`, noShadow: true },
    { shape: { kind: 'box', at: [x, 1.03, 0.34], half: [0.07, 0.045, 0.04], round: 0.02 }, paint: '#ffffff', bone: `sock${i}`, noShadow: true },
    { shape: { kind: 'sweep', path: [[x, 0.97, 0.34], [x, 0.84, 0.34], [x + 0.02, 0.78, 0.34], [x + 0.11, 0.76, 0.34]], r: 0.052 }, paint, bone: `sock${i}`, noShadow: true },
  ]),
  // candles at each end of the mantel and a wreath above
  ...CANDLES.flatMap((x, i): PartDoc[] => [
    { shape: { kind: 'cylinder', at: [x, 1.19, 0.05], height: 0.16, r: 0.03 }, paint: '#f4ecdb' },
    { shape: { kind: 'ball', at: [x, 1.39, 0.05], r: [0.018, 0.035, 0.018] }, paint: '#ffe27a', bone: `flame${i}`, glow: true, lit: 'dark', unlit: 'gone', noShadow: true },
  ]),
  { shape: { kind: 'join', shapes: Array.from({ length: 12 }, (_, i) => ({ kind: 'sphere' as const, at: along([0, 1.47, 0.18], way(i * 30), 0.15), r: 0.055 })) }, paint: { kind: 'speckle', size: 0.03, colors: ['#16602f', '#22863f', '#0e3b22'] } },
  { shape: { kind: 'join', shapes: [{ kind: 'ball', at: [-0.05, 1.31, 0.23], r: [0.05, 0.03, 0.02] }, { kind: 'ball', at: [0.05, 1.31, 0.23], r: [0.05, 0.03, 0.02] }, { kind: 'sphere', at: [0, 1.31, 0.24], r: 0.022 }] }, paint: '#d42a33', noShadow: true },
], {
  bones: [
    ...STOCKINGS.map(([x], i) => ({ name: `sock${i}`, at: [x, 1.12, 0.33] as V3 })),
    ...CANDLES.map((x, i) => ({ name: `flame${i}`, at: [x, 1.36, 0.05] as V3 })),
  ],
  moves: [
    ...STOCKINGS.map((_, i): MoveDoc => ({ kind: 'sway', bone: `sock${i}`, axis: 'z', degrees: 3, times: 2, phase: i * 0.3 })),
    ...CANDLES.map((_, i): MoveDoc => ({ kind: 'pulse', bone: `flame${i}`, size: [0.85, 1.12], times: 12 + i, phase: i * 0.4 })),
  ],
  fires: [{ at: [0, 0.14, 0.06], r: 0.13, height: 0.42, sparks: 1.2, lit: 'dark' }],
  lights: [
    { at: [0, 0.38, 0.4], color: '#f59a2a', strength: 2.6, range: 1.8, lit: 'dark', flicker: { by: 0.25, times: 11 }, fire: 0 },
    { at: [0, 1.5, 0.35], color: '#ffe27a', strength: 0.6, range: 1.0, lit: 'dark' },
  ],
})

/** The Christmas pieces the library lists. */
export const CHRISTMAS_MADE: MadeProp[] = [
  { id: 'snowy-knoll', tags: ['snowy', 'night'], kind: 'land', about: 'A low round knoll under snow on a winter night, with the moon and stars over it', prop: SNOWY_KNOLL },
  { id: 'christmas-tree', tags: ['tree', 'evergreen', 'lamp'], kind: 'prop', about: 'A Christmas tree with garlands, baubles, lights that twinkle after dark and a gold star', prop: CHRISTMAS_TREE },
  { id: 'ornament', tags: ['thing'], kind: 'prop', about: 'A big striped glass ornament swinging from a candy cane hook', prop: ORNAMENT },
  { id: 'red-present', tags: ['thing'], kind: 'prop', about: 'A red present with a gold ribbon and bow', prop: RED_PRESENT },
  { id: 'green-present', tags: ['thing'], kind: 'prop', about: 'A tall striped green present with a red ribbon and bow', prop: GREEN_PRESENT },
  { id: 'blue-present', tags: ['thing'], kind: 'prop', about: 'A wide blue present with a cream ribbon and bow', prop: BLUE_PRESENT },
  { id: 'snowflake', tags: ['thing'], kind: 'prop', about: 'A big six-armed snowflake turning slowly in the air', prop: SNOWFLAKE },
  { id: 'sleigh', tags: ['thing'], kind: 'prop', about: 'A red sleigh on curling gold runners with a sack of presents, its reins running forward', prop: SLEIGH },
  { id: 'reindeer', tags: ['animal'], kind: 'prop', about: 'A reindeer in a red harness with a gold bell, nodding and pawing the snow', prop: REINDEER },
  { id: 'red-nosed-reindeer', tags: ['animal', 'lamp'], kind: 'prop', about: 'A reindeer in a red harness whose red nose glows', prop: RED_NOSED_REINDEER },
  { id: 'cozy-room', tags: ['indoor', 'night'], kind: 'land', about: 'A cozy room: a plank floor, a striped green wall and a rug', prop: HEARTH_ROOM },
  { id: 'fireplace', tags: ['building', 'lamp'], kind: 'prop', about: 'A brick fireplace with a crackling fire, three stockings hung from the mantel, candles, a garland and a wreath', prop: FIREPLACE },
]

const project = (name: string, props: SceneProject['props'], land = 'snowy-knoll'): SceneProject => ({ kind: 'blobscape-project', version: 1, name, loop: 12, land, props })

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
/** The snowflake over the knoll. */
export const SNOWFLAKE_PROJECT = project('Snowflake', [{ prop: 'snowflake', at: [0, 0, 0], turn: 0, size: 1 }])
/** The sleigh with two reindeer, the red-nosed one leading. */
export const SLEIGH_PROJECT = project('Sleigh and reindeer', [
  { prop: 'sleigh', at: [-0.62, 0, 0.05], turn: 0, size: 1 },
  { prop: 'reindeer', at: [0.24, 0, 0.05], turn: 0, size: 1 },
  { prop: 'red-nosed-reindeer', at: [0.72, 0, 0.05], turn: 0, size: 1 },
])
/** The fireplace in the cozy room. */
export const FIREPLACE_PROJECT = project('Fireplace with stockings', [{ prop: 'fireplace', at: [0, 0, -0.7], turn: 0, size: 1 }], 'cozy-room')
