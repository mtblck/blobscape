import type { LightDoc, MoveDoc, PaintDoc, PartDoc, SceneDoc, ShapeDoc } from '../../../splat-engine/sceneDoc.ts'

/**
 * A lighthouse and its keeper's cottage on a rock in the sea at dusk: a turning lamp, pines that lean in the wind, a
 * jetty, a boat and a buoy riding the swell, gulls, clouds and smoke. It was the one scene written as code; this is the
 * same scene as a description, so its tower, cottage, boat and the rest can be lifted out as props (issue #333). The
 * file is written with a few loops and helpers, but what it exports is data alone, as a .json file would hold.
 */

type Rgb = [number, number, number]
type V3 = [number, number, number]

/** A color given in 0 to 1, as the old code wrote them. */
const c = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(Math.min(1, v) * 255).toString(16).padStart(2, '0')).join('')
const cv = (v: Rgb) => c(...v)
const shade = (v: Rgb, k: number) => c(v[0] * k, v[1] * k, v[2] * k)
/** A repeatable number in 0..1 for a pair of whole numbers: which star is blue. */
const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v) }
const TAU = Math.PI * 2
const r3 = (v: number) => Math.round(v * 1000) / 1000

const WHITE: Rgb = [0.92, 0.93, 0.96], RED: Rgb = [0.75, 0.2, 0.22], DARK = c(0.16, 0.15, 0.22)
const LAMP = c(1, 0.92, 0.55), MOON = c(0.96, 0.97, 1)
// unlit colors that stay under the glow line: bright, but not lamps
const GULL = c(0.9, 0.9, 0.86), FOAM = c(0.78, 0.88, 0.91)
/** The thinnest a shape is drawn: the builder fattens anything thinner to a grid cell's reach. */
const THIN = 0.012

const [tx, tz] = [0.05, -0.05]
const LAMP_Y = 1.4
const SEA = 1.42
const GULLS = [
  { r: 0.62, y: 1.72, phase: 0, way: 1 },
  { r: 0.95, y: 1.5, phase: 2.2, way: -1 },
  { r: 0.7, y: 1.85, phase: 4.1, way: 1 },
]
const CLOUDS: V3[] = [[-0.9, 1.9, -0.85], [0.95, 1.95, -1.0]]
const FOAMS: V3[] = [[-0.9, 0, 0.85], [0.3, 0, 1.15], [1.15, 0, -0.35], [-0.45, 0, -1.1], [-1.15, 0, -0.2], [0.75, 0, 0.25]]
const BOAT: V3 = [0.95, 0.03, 0.62]
const BUOY: V3 = [-0.7, 0, 1.0]
/** Pines: x, z, height, and the height of the rock under them. */
const TREES: [number, number, number, number][] = [[-0.62, -0.2, 0.5, 0.18], [0.46, -0.4, 0.42, 0.144], [-0.74, 0.02, 0.36, 0.06]]
/** Bushes: x, z, size, and the height of the rock under them. */
const BUSHES: [number, number, number, number][] = [[0.36, 0.22, 0.07, 0.244], [-0.12, 0.42, 0.06, 0.252], [0.3, -0.3, 0.08, 0.256], [-0.2, -0.36, 0.06, 0.24], [-0.62, 0.36, 0.07, 0.216], [0.55, 0.05, 0.055, 0.26]]
/** Flowers in the grass, where they land on the rock (clear of the path, the tower and the cottage). */
const FLOWERS: V3[] = [[-0.425, 0.188, -0.316], [0.376, 0.24, -0.134], [-0.228, 0.232, 0.442], [0.644, 0.216, -0.184], [0.619, 0.22, 0.039], [0.217, 0.208, -0.474], [0.411, 0.232, -0.293], [-0.231, 0.272, 0.322], [-0.278, 0.256, -0.291], [-0.338, 0.224, 0.399], [-0.358, 0.192, -0.406], [0.288, 0.256, -0.284], [0.452, 0.18, 0.404], [-0.403, 0.228, -0.305], [-0.098, 0.292, 0.343], [0.082, 0.252, -0.384], [0.331, 0.224, 0.464], [-0.603, 0.236, 0.316], [-0.595, 0.2, 0.425], [0.615, 0.216, -0.129], [-0.318, 0.224, 0.418], [0.214, 0.276, -0.396], [-0.065, 0.3, 0.311], [0.06, 0.284, 0.342]]
const PETALS = [c(0.9, 0.82, 0.35), c(0.88, 0.88, 0.84), c(0.85, 0.4, 0.45)]
const COTTAGE: [number, number] = [-0.36, 0.16]
/** Where the cottage's walls start: a little into the rock under it. */
const CY = 0.24, WALL_TOP = CY + 0.25
const JETTY = { x: 0.62, z0: 0.3, z1: 0.94, y: 0.085 }

/** The rock everything stands on; the sea and the path ask where it is. */
const ROCK: ShapeDoc = { kind: 'rough', by: 0.035, scale: 0.588, shape: { kind: 'join', shapes: [{ kind: 'ball', at: [0, 0.02, 0], r: [0.8, 0.3, 0.62] }, { kind: 'ball', at: [-0.35, 0.02, 0.25], r: [0.5, 0.24, 0.42] }] } }
/** The worn path from the tower's door to the jetty, as a line at the water's height. */
const PATH: ShapeDoc = { kind: 'sweep', path: [[tx + 0.14, 0, tz + 0.2], [JETTY.x, 0, JETTY.z0 + 0.04]], r: 0.01 }
/** Layered stone: bands that a darker crack runs between. */
const STRATA: PaintDoc = { kind: 'bands', axis: 'y', size: 0.0125, colors: [c(0.3, 0.27, 0.31), c(0.52, 0.47, 0.45), c(0.52, 0.47, 0.45), c(0.52, 0.47, 0.45), c(0.3, 0.27, 0.31), c(0.42, 0.38, 0.4), c(0.42, 0.38, 0.4), c(0.42, 0.38, 0.4)] }
/** Brick: a course with its mortar under it, one grid row each. */
const brick = (base: Rgb): PaintDoc => ({ kind: 'bands', axis: 'y', size: 0.016, colors: [shade(base, 0.8), cv(base), cv(base)] })
/** The tower's red and white bands, each 0.21 high from its foot at 0.2. */
const towerPaint = (k = 1): PaintDoc => (k > 4 ? brick(WHITE) : { kind: 'split', axis: 'y', at: r3(0.2 + 0.21 * k), below: brick(k % 2 ? WHITE : RED), above: towerPaint(k + 1) })

const parts: PartDoc[] = []
const bones: SceneDoc['bones'] = [{ name: 'lamp', at: [tx, LAMP_Y, tz] }, { name: 'boat', at: BOAT }]

// the sea: a round slab with a ripple on top, pale where it breaks on the rock, lighter in the shallows
parts.push({
  shape: { kind: 'rough', by: 0.02, scale: 1, shape: { kind: 'cylinder', at: [0, -0.26, 0], height: 0.24, r: SEA } },
  paint: {
    kind: 'faces', up: 0.5,
    top: { kind: 'near', shape: ROCK, within: 0.035, at: 0, near: c(0.74, 0.86, 0.9), far: { kind: 'near', shape: ROCK, within: 0.1, at: 0, near: { kind: 'patches', size: 0.125, colors: [c(0.2, 0.42, 0.66), c(0.3, 0.52, 0.74)] }, far: { kind: 'waves', size: 0.157, colors: [c(0.1, 0.22, 0.45), c(0.3, 0.52, 0.74), c(0.14, 0.3, 0.55)] } } },
    side: { kind: 'split', axis: 'y', at: -0.08, below: c(0.07, 0.13, 0.3), above: c(0.1, 0.2, 0.42) },
  },
  bare: true,
})

// sandy at the waterline, layered stone on the sides, grass and a worn path on top
parts.push({
  shape: ROCK,
  paint: {
    kind: 'split', axis: 'y', at: 0.05,
    below: { kind: 'speckle', size: 0.025, colors: [c(0.82, 0.72, 0.5), c(0.7, 0.6, 0.42)] },
    above: { kind: 'split', axis: 'y', at: 0.14, below: STRATA, above: { kind: 'faces', up: 0.72, side: STRATA, top: { kind: 'near', shape: PATH, within: 0.03, at: 0, near: { kind: 'speckle', size: 0.02, colors: [c(0.74, 0.63, 0.44), c(0.62, 0.52, 0.38)] }, far: { kind: 'patches', size: 0.167, colors: [c(0.2, 0.42, 0.26), c(0.3, 0.55, 0.29), c(0.42, 0.68, 0.34)] } } } },
  },
})
for (const [x, z, r] of [[-1.1, 0.5, 0.14], [0.87, -0.78, 0.18], [1.12, -0.5, 0.1], [-0.95, -0.75, 0.12], [0.2, 1.2, 0.08], [-0.2, -1.15, 0.11]]) {
  parts.push({
    shape: { kind: 'rough', by: 0.02, scale: 0.333, shape: { kind: 'ball', at: [x, 0, z], r: [r, r3(r * 1.25), r3(r * 0.9)] } },
    paint: { kind: 'split', axis: 'y', at: 0.03, below: c(0.3, 0.28, 0.32), above: { kind: 'faces', top: c(0.56, 0.52, 0.5), side: { kind: 'bands', axis: 'y', size: 0.045, colors: [c(0.38, 0.35, 0.38), c(0.45, 0.41, 0.42)] } } },
  })
}

// the tower: brick in red and white bands on a stone foot, a railed gallery, the lamp room and its cap
const railY = 1.385
parts.push({ shape: { kind: 'cylinder', at: [tx, 0.2, tz], height: 1.05, r: 0.21, rTop: 0.135 }, paint: towerPaint() })
parts.push({ shape: { kind: 'cylinder', at: [tx, 0.18, tz], height: 0.13, r: 0.25, rTop: 0.235 }, paint: { kind: 'speckle', size: 0.045, colors: [c(0.4, 0.38, 0.42), c(0.5, 0.47, 0.5)] } })
parts.push({ shape: { kind: 'cylinder', at: [tx, 1.25, tz], height: 0.05, r: 0.21 }, paint: DARK })
parts.push({ shape: { kind: 'ring', at: [tx, railY, tz], r: 0.2, tube: 0.011 }, paint: c(0.62, 0.6, 0.68), noShadow: true })
parts.push({
  shape: { kind: 'join', shapes: Array.from({ length: 10 }, (_, i): ShapeDoc => { const a = (i / 10) * TAU; return { kind: 'box', at: [r3(tx + Math.cos(a) * 0.2), r3((1.3 + railY) / 2), r3(tz + Math.sin(a) * 0.2)], half: [0.011, r3((railY - 1.3) / 2), 0.011] } }) },
  paint: c(0.62, 0.6, 0.68), noShadow: true,
})
parts.push({ shape: { kind: 'cylinder', at: [tx, 1.3, tz], height: 0.2, r: 0.11 }, paint: LAMP, glow: true, lit: 'dark' })
// glazing bars round the lamp room
parts.push({
  shape: { kind: 'join', shapes: Array.from({ length: 6 }, (_, i): ShapeDoc => { const a = (i / 6) * TAU + 0.3; return { kind: 'box', at: [r3(tx + Math.cos(a) * 0.115), 1.4, r3(tz + Math.sin(a) * 0.115)], half: [0.011, 0.1, 0.011] } }) },
  paint: DARK, noShadow: true,
})
parts.push({ shape: { kind: 'cylinder', at: [tx, 1.5, tz], height: 0.03, r: 0.15 }, paint: DARK })
parts.push({ shape: { kind: 'cone', from: [tx, 1.54, tz], to: [tx, 1.74, tz], r: 0.16, rTo: 0.01 }, paint: { kind: 'bands', axis: 'y', size: 0.04, colors: [shade(RED, 0.82), cv(RED)] } })
parts.push({ shape: { kind: 'join', shapes: [{ kind: 'box', at: [tx, 1.8, tz], half: [0.01, 0.07, 0.01] }, { kind: 'sphere', at: [tx, 1.88, tz], r: 0.028 }] }, paint: c(0.86, 0.7, 0.3), noShadow: true })
// a door in a stone frame and two lit windows in dark frames, on the side the first view sees
parts.push({ shape: { kind: 'box', at: [r3(tx + 0.125), 0.32, r3(tz + 0.155)], half: [0.068, 0.115, 0.05] }, paint: c(0.56, 0.53, 0.55) })
parts.push({ shape: { kind: 'box', at: [r3(tx + 0.135), 0.3, r3(tz + 0.165)], half: [0.05, 0.09, 0.05] }, paint: { kind: 'bands', axis: 'x', size: 0.03, colors: [c(0.42, 0.27, 0.18), c(0.34, 0.21, 0.15)] } })
for (const [y, out, r] of [[0.72, 0.105, 0.035], [1.05, 0.09, 0.03]]) {
  parts.push({ shape: { kind: 'box', at: [r3(tx + out), y, r3(tz + out + 0.02)], half: [r3(r + THIN), r3(r + 0.015 + THIN), r] }, paint: DARK })
  parts.push({ shape: { kind: 'box', at: [r3(tx + out + 0.012), y, r3(tz + out + 0.032)], half: [r, r3(r + 0.015), r] }, paint: LAMP, glow: true, lit: 'dark', unlit: '#a9c3d4' })
}
// the lens: a bright bar through the lamp room, turning with the lamp (its two beams are the scene's lights)
parts.push({ shape: { kind: 'box', at: [tx, LAMP_Y, tz], half: [0.17, 0.035, 0.035] }, paint: c(1, 1, 0.85), bone: 'lamp', glow: true, lit: 'dark', unlit: 'gone' })

// the keeper's cottage: plastered walls, a tiled roof, a chimney, a door and a lit window
const [cx, cz] = COTTAGE
const plaster = c(0.93, 0.9, 0.82)
parts.push({ shape: { kind: 'box', at: [cx, r3((CY + WALL_TOP) / 2), cz], half: [0.15, r3((WALL_TOP - CY) / 2), 0.11] }, paint: { kind: 'split', axis: 'y', at: r3(CY + 0.1), below: c(0.6, 0.57, 0.56), above: { kind: 'speckle', size: 0.033, colors: [plaster, plaster, c(0.84, 0.81, 0.74)] } } })
parts.push({
  shape: { kind: 'roof', at: [cx, r3(WALL_TOP - 0.01), cz], half: [0.175, 0.14], height: 0.15 },
  // plaster on the gable ends, tiles in courses between
  paint: { kind: 'split', axis: 'x', at: r3(cx - 0.165), below: plaster, above: { kind: 'split', axis: 'x', at: r3(cx + 0.165), below: { kind: 'bricks', size: [0.05, 0.04], colors: [c(0.75, 0.3, 0.24), c(0.7, 0.26, 0.22)], line: c(0.62, 0.24, 0.2) }, above: plaster } },
})
parts.push({ shape: { kind: 'box', at: [r3(cx - 0.07), r3(WALL_TOP + 0.13), cz], half: [0.03, 0.07, 0.03] }, paint: { kind: 'split', axis: 'y', at: r3(WALL_TOP + 0.17), below: c(0.52, 0.42, 0.4), above: c(0.3, 0.27, 0.31) } })
parts.push({ shape: { kind: 'box', at: [r3(cx + 0.06), r3(CY + 0.14), r3(cz + 0.105)], half: [r3(0.042 + THIN), r3(0.04 + THIN), 0.02] }, paint: DARK })
parts.push({ shape: { kind: 'box', at: [r3(cx + 0.06), r3(CY + 0.14), r3(cz + 0.115)], half: [0.042, 0.04, 0.02] }, paint: LAMP, glow: true, lit: 'dark', unlit: '#a9c3d4' })
parts.push({ shape: { kind: 'box', at: [r3(cx - 0.07), r3(CY + 0.11), r3(cz + 0.11)], half: [0.035, 0.075, 0.02] }, paint: c(0.25, 0.42, 0.5) })

// pines on bones of their own that lean a little downwind and sway, and bushes
TREES.forEach(([x, z, h, g], i) => {
  const y = g - 0.03
  // leaning 0.03 of a turn's radian about the bone: each point moves along x by that much of its height over the bone
  const at = (yy: number): V3 => [r3(x + 0.03 * (yy - 0.15)), r3(yy), z]
  bones.push({ name: `tree${i}`, at: [x, 0.15, z] })
  parts.push({ shape: { kind: 'cone', from: at(y), to: at(y + h * 0.45), r: 0.022, rTo: 0.022 }, paint: c(0.36, 0.25, 0.18), bone: `tree${i}` })
  parts.push({
    shape: { kind: 'join', shapes: [
      { kind: 'cone', from: at(y + h * 0.3), to: at(y + h * 0.58), r: r3(h * 0.3), rTo: r3(h * 0.1) },
      { kind: 'cone', from: at(y + h * 0.52), to: at(y + h * 0.8), r: r3(h * 0.23), rTo: r3(h * 0.07) },
      { kind: 'cone', from: at(y + h * 0.75), to: at(y + h), r: r3(h * 0.16), rTo: 0.01 },
    ] },
    paint: { kind: 'faces', up: 0.45, top: { kind: 'speckle', size: 0.022, colors: [c(0.22, 0.45, 0.27), c(0.3, 0.55, 0.3)] }, side: c(0.14, 0.32, 0.22), under: c(0.08, 0.2, 0.16) },
    bone: `tree${i}`,
  })
})
for (const [x, z, r, g] of BUSHES) {
  parts.push({
    shape: { kind: 'rough', by: 0.012, scale: 0.111, shape: { kind: 'ball', at: [x, r3(g + r * 0.4), z], r: [r, r3(r * 0.8), r] } },
    paint: { kind: 'faces', up: 0.5, top: { kind: 'speckle', size: 0.02, colors: [c(0.3, 0.55, 0.3), c(0.45, 0.7, 0.36)] }, side: c(0.16, 0.36, 0.24), under: c(0.16, 0.36, 0.24) },
  })
}
// flowers in the grass: single cells of color (unlit, so they stay bright at dusk, but under the glow line)
PETALS.forEach((petal, k) => {
  const mine = FLOWERS.filter((_, i) => i % PETALS.length === k)
  parts.push({ shape: { kind: 'join', shapes: mine.map(([x, y, z]): ShapeDoc => ({ kind: 'sphere', at: [x, r3(y + THIN), z], r: THIN })) }, paint: petal, glow: true })
})

// the jetty: planks on posts, with a lantern at the far end
const J = JETTY
parts.push({
  shape: { kind: 'box', at: [J.x, J.y, r3((J.z0 + J.z1) / 2)], half: [0.075, 0.014, r3((J.z1 - J.z0) / 2)] },
  paint: { kind: 'bands', axis: 'z', size: 0.0125, colors: [c(0.36, 0.25, 0.18), c(0.66, 0.5, 0.33), c(0.66, 0.5, 0.33), c(0.66, 0.5, 0.33), c(0.36, 0.25, 0.18), c(0.58, 0.43, 0.29), c(0.58, 0.43, 0.29), c(0.58, 0.43, 0.29)] },
})
const posts: ShapeDoc[] = []
for (const z of [0.5, 0.72, 0.92]) for (const side of [-1, 1]) posts.push({ kind: 'cylinder', at: [r3(J.x + side * 0.075), -0.05, z], height: r3(J.y + (z > 0.9 ? 0.09 : 0.03) + 0.05), r: 0.018 })
parts.push({ shape: { kind: 'join', shapes: posts }, paint: { kind: 'split', axis: 'y', at: 0.03, below: c(0.2, 0.26, 0.24), above: c(0.42, 0.3, 0.21) } })
parts.push({ shape: { kind: 'box', at: [r3(J.x + 0.075), r3(J.y + 0.2), 0.92], half: [0.011, 0.11, 0.011] }, paint: DARK, noShadow: true })
parts.push({ shape: { kind: 'sphere', at: [r3(J.x + 0.075), r3(J.y + 0.33), 0.92], r: 0.03 }, paint: c(1, 0.8, 0.4), glow: true, lit: 'dark' })

// a little boat with a sail and a lantern
const [bx, by, bz] = BOAT
parts.push({
  shape: { kind: 'cut', shape: { kind: 'ball', at: BOAT, r: [0.24, 0.085, 0.11] }, hole: { kind: 'ball', at: [bx, r3(by + 0.085), bz], r: [0.19, 0.07, 0.075] } },
  paint: { kind: 'split', axis: 'y', at: r3(by + 0.015), below: c(0.48, 0.3, 0.2), above: { kind: 'split', axis: 'y', at: r3(by + 0.045), below: { kind: 'faces', top: c(0.62, 0.46, 0.3), side: c(0.7, 0.24, 0.22) }, above: { kind: 'faces', top: c(0.62, 0.46, 0.3), side: c(0.86, 0.84, 0.78) } } },
  bone: 'boat', noShadow: true,
})
parts.push({ shape: { kind: 'box', at: [bx, r3(by + 0.24), bz], half: [THIN, 0.2, THIN] }, paint: c(0.35, 0.24, 0.18), bone: 'boat', noShadow: true })
parts.push({ shape: { kind: 'box', at: [r3(bx + 0.085), r3(by + 0.27), bz], half: [0.075, 0.13, THIN] }, paint: { kind: 'bands', axis: 'y', size: 0.045, colors: [c(0.84, 0.78, 0.66), c(0.96, 0.92, 0.8)] }, bone: 'boat', noShadow: true })
parts.push({ shape: { kind: 'sphere', at: [r3(bx - 0.2), r3(by + 0.12), bz], r: 0.03 }, paint: c(1, 0.8, 0.4), bone: 'boat', glow: true, lit: 'dark' })

// a buoy that nods in the swell
const [ux, , uz] = BUOY
bones.push({ name: 'buoy', at: BUOY })
const buoyWhite = c(0.9, 0.88, 0.82)
parts.push({
  shape: { kind: 'join', shapes: [{ kind: 'sphere', at: [ux, 0.03, uz], r: 0.06 }, { kind: 'cone', from: [ux, 0.06, uz], to: [ux, 0.17, uz], r: 0.035, rTo: 0.011 }] },
  paint: { kind: 'split', axis: 'y', at: 0.045, below: buoyWhite, above: { kind: 'split', axis: 'y', at: 0.1, below: c(0.78, 0.22, 0.22), above: buoyWhite } },
  bone: 'buoy', noShadow: true,
})
parts.push({ shape: { kind: 'sphere', at: [ux, 0.2, uz], r: 0.024 }, paint: c(1, 0.5, 0.35), bone: 'buoy', glow: true, lit: 'dark' })

// smoke from the chimney: puffs that rise, drift downwind and swell
for (let i = 0; i < 3; i++) {
  bones.push({ name: `smoke${i}`, at: [r3(cx - 0.07), r3(WALL_TOP + 0.13), cz] })
  parts.push({ shape: { kind: 'sphere', at: [r3(cx - 0.07), r3(WALL_TOP + 0.13), cz], r: 0.04 }, paint: c(0.62, 0.64, 0.7), bone: `smoke${i}`, glow: true })
}

// gulls circling the tower: a body on the pivot bone and a wing on each wing bone, unlit so they stay white against the sky
GULLS.forEach((g, i) => {
  const at: V3 = [r3(tx + g.r), g.y, tz]
  const tip = c(0.5, 0.54, 0.64)
  bones.push({ name: `gull${i}`, at: [tx, g.y, tz] }, { name: `gull${i}L`, at, parent: `gull${i}` }, { name: `gull${i}R`, at, parent: `gull${i}` })
  parts.push({ shape: { kind: 'ball', at, r: [0.018, 0.018, 0.07] }, paint: GULL, bone: `gull${i}`, glow: true })
  parts.push({ shape: { kind: 'box', at: [r3(at[0] + 0.07), at[1], at[2]], half: [0.07, THIN, 0.035] }, paint: { kind: 'split', axis: 'x', at: r3(at[0] + 0.115), below: GULL, above: tip }, bone: `gull${i}L`, glow: true })
  parts.push({ shape: { kind: 'box', at: [r3(at[0] - 0.07), at[1], at[2]], half: [0.07, THIN, 0.035] }, paint: { kind: 'split', axis: 'x', at: r3(at[0] - 0.115), below: tip, above: GULL }, bone: `gull${i}R`, glow: true })
})

// clouds, the moon (with a few craters) and stars
CLOUDS.forEach((p, i) => {
  bones.push({ name: `cloud${i}`, at: p })
  parts.push({
    shape: { kind: 'join', shapes: [
      { kind: 'ball', at: p, r: [0.34, 0.1, 0.16] },
      { kind: 'sphere', at: [r3(p[0] - 0.12), r3(p[1] + 0.07), p[2]], r: 0.13 },
      { kind: 'sphere', at: [r3(p[0] + 0.1), r3(p[1] + 0.09), p[2]], r: 0.15 },
      { kind: 'sphere', at: [r3(p[0] + 0.26), r3(p[1] + 0.03), p[2]], r: 0.09 },
    ] },
    paint: { kind: 'split', axis: 'y', at: r3(p[1] + 0.02), below: c(0.44, 0.64, 0.85), above: { kind: 'split', axis: 'y', at: r3(p[1] + 0.1), below: c(0.81, 0.9, 0.91), above: c(0.88, 0.9, 0.89) } },
    bone: `cloud${i}`, glow: true,
  })
})
const MOON_AT: V3 = [-1.95, 2.15, -1.0]
parts.push({
  shape: { kind: 'sphere', at: MOON_AT, r: 0.17 },
  // craters: round marks on the face, as deep columns through the moon so only their outline on the face counts
  paint: { kind: 'near', shape: { kind: 'join', shapes: [[0.05, 0.04, 0.06], [-0.07, -0.05, 0.05], [0.02, -0.09, 0.04]].map(([a, b, r]): ShapeDoc => ({ kind: 'ball', at: [r3(MOON_AT[0] + a), r3(MOON_AT[1] + b), MOON_AT[2]], r: [r, r, 0.4] })) }, within: 0, near: c(0.8, 0.84, 0.9), far: MOON },
  glow: true, lit: 'night', unlit: 'gone',
})
const STARS: V3[] = [[-0.6, 2.6, -1.6], [0.2, 2.75, -1.6], [1.3, 2.55, -1.6], [-1.6, 1.7, -1.3], [1.6, 1.9, -1.5], [0.6, 2.05, -1.7], [-0.2, 2.2, -1.7], [1.05, 2.9, -1.4], [-1.0, 2.9, -1.5], [-1.65, 2.5, -0.6], [1.7, 2.6, -0.5], [-1.2, 2.2, -1.6], [0.9, 1.6, -1.7], [-0.9, 1.5, -1.7], [1.7, 1.3, -1.2], [-1.7, 1.1, -0.9], [0.4, 3.0, -1.2], [-0.3, 1.7, -1.75]]
// one part each: a join's box would span the whole sky, and the builder walks every cell of it
STARS.forEach((p, i) => parts.push({ shape: { kind: 'sphere', at: p, r: 0.016 }, paint: hash(i, 2) > 0.6 ? c(0.8, 0.88, 0.9) : c(1, 1, 0.9), glow: true, lit: 'night', unlit: 'gone' }))

// foam: thin streaks that swell and fade as they drift
FOAMS.forEach((f, i) => {
  bones.push({ name: `foam${i}`, at: f })
  parts.push({ shape: { kind: 'ball', at: [r3(f[0] - 0.09), 0.01, f[2]], r: [0.15, 0.02, 0.028] }, paint: FOAM, bone: `foam${i}`, glow: true, bare: true })
})

const deg = (rad: number) => r3((rad * 180) / Math.PI)
/** A phase given in radians, as the old code wrote them, as a share of a turn within -1 to 1. */
const turn = (rad: number) => r3((rad / TAU) % 1)
const moves: MoveDoc[] = [
  // the lamp turns twice a loop
  { kind: 'spin', bone: 'lamp', axis: 'y', times: 2 },
  // the boat rides the swell: up and down, rolling and pitching a little out of step
  { kind: 'sway', bone: 'boat', axis: 'z', degrees: deg(0.1), times: 4, phase: turn(1) },
  { kind: 'sway', bone: 'boat', axis: 'x', degrees: deg(0.07), times: 3 },
  { kind: 'bob', bone: 'boat', by: [0, 0.014, 0], times: 4 },
  ...GULLS.flatMap((g, i): MoveDoc[] => [
    { kind: 'spin', bone: `gull${i}`, axis: 'y', times: g.way, phase: turn(g.phase) },
    { kind: 'bob', bone: `gull${i}`, by: [0, 0.05, 0], times: 3, phase: turn(g.phase) },
    // wings beat about the way the gull flies, up on one side as on the other
    { kind: 'sway', bone: `gull${i}L`, axis: 'z', degrees: deg(0.6), times: 24, phase: turn(g.phase * 3) },
    { kind: 'sway', bone: `gull${i}R`, axis: 'z', degrees: -deg(0.6), times: 24, phase: turn(g.phase * 3) },
  ]),
  ...CLOUDS.map((_, i): MoveDoc => ({ kind: 'bob', bone: `cloud${i}`, by: [0.22, 0, 0], times: 1, phase: turn(i * 2.4) })),
  // the pines spring back from the wind, each a little out of step
  ...TREES.map((_, i): MoveDoc => ({ kind: 'sway', bone: `tree${i}`, axis: 'z', degrees: -deg(0.035), times: 5, phase: turn(i * 1.7) })),
  // the buoy nods and rides the swell
  { kind: 'sway', bone: 'buoy', axis: 'z', degrees: deg(0.22), times: 5 },
  { kind: 'sway', bone: 'buoy', axis: 'x', degrees: deg(0.15), times: 4, phase: turn(0.8) },
  { kind: 'bob', bone: 'buoy', by: [0, 0.012, 0], times: 4, phase: turn(2) },
  // each puff rises from the chimney, drifts downwind and swells, then starts again
  ...[0, 1, 2].map((i): MoveDoc => ({ kind: 'drift', bone: `smoke${i}`, by: [0.22, 0.3, 0], times: 4, grow: [0.5, 1.4], phase: r3(i / 3) })),
  // each patch of foam lives a third of a loop, starting at its own moment
  ...FOAMS.map((_, i): MoveDoc => ({ kind: 'drift', bone: `foam${i}`, by: [0.18, 0, 0], times: 3, phase: r3(i / FOAMS.length) })),
]

export const LIGHTHOUSE: SceneDoc = {
  name: 'Lighthouse',
  loop: 12,
  light: { from: [0.4, 0.55, 0.72], ambient: 0.5, shadow: 0.75 },
  palette: ['#0b1026', '#1b2148', '#27407a', '#3f62a8', '#6fa3d8', '#cfe6f5', '#22402f', '#3f7a45', '#69b05a', '#3b3848', '#514c5e', '#6b6474', '#9d97a6', '#d3cfd6', '#6b4a35', '#a37a52', '#d8c08f', '#7d2836', '#c9485a', '#f4f1e4', '#ffd166', '#fff3b0'],
  sky: ['#090d20', '#3c5ea4'],
  look: { dither: 0.5, glow: 1.5, outline: true, edges: true },
  // the island is small beside the other scenes' subjects, so a brick, a tile or a window gets as many cells as a scale on the dragon
  grid: 0.72,
  // round walls seen close: wider discs, or the far side and the lit windows show through the near one (Matt saw it)
  disc: 0.75,
  camera: { target: [0.05, 0.84, 0.05], distance: 3.7, azimuth: 28, elevation: 10 },
  bones,
  parts,
  moves,
  // the lamp's two beams: a pool of warm light on each side of the tower, sweeping over the sea and the rock with the lens
  // and the same two beams where they cross the gallery: each stands just past the railing and a little above it, so
  // the stretch of rail, floor and cap the beam passes over is lit on the faces a viewer sees (cubes too, whose faces
  // only take light they are turned to) and falls dark again behind it
  lights: [
    ...[0, 0.5].map((phase): LightDoc => ({ at: [tx, 0.3, tz], color: '#ffe9ab', strength: 3.2, range: 0.55, lit: 'dark', circle: { r: 1, times: 2, phase } })),
    ...[0, 0.5].map((phase): LightDoc => ({ at: [tx, r3(LAMP_Y + 0.07), tz], color: '#ffe9ab', strength: 3, range: 0.2, lit: 'dark', circle: { r: 0.3, times: 2, phase } })),
  ],
}
