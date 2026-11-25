/**
 * The six looks laid over the whole picture as the pages offer them (Matt picked them, 2026-11-25): claymation,
 * blueprint, thermal camera, paper cutout, mosaic and CRT / VHS. Each one's chip, its choices, what the page's
 * controls start at, the color behind the canvas, and the look for the stage (`Stage.setFilter`).
 */
import { BLUEPRINT_INK, BLUEPRINT_PAPER, CLAY_BACK, CRT_BACK, CUTOUT_CARD, MOSAIC_GROUT, luma, paletteRamp, toLinear, type BlueprintLook, type ClayLook, type CrtLook, type CutoutLook, type MosaicLook, type Sky01, type ThermalLook } from '../../splat-core/filters.ts'
import type { Rgb01 } from '../../splat-core/halftone.ts'

/** Claymation's chip beside the drawn looks (brushLooks.ts). */
export const CLAY = { id: 'clay' as const, label: 'Claymation', note: 'Soft matte clay with thumbprints pressed into it, moving in held frames as stop motion does.' }
/** The blueprint's chip. */
export const BLUEPRINT = { id: 'blueprint' as const, label: 'Blueprint', note: 'White drafting lines on blue paper over a grid, with dimension lines across the subject.' }
/** The thermal camera's chip. */
export const THERMAL = { id: 'thermal' as const, label: 'Thermal camera', note: 'Seen by heat: fires, lamps and lit things run hot, the sky cold, in a camera’s heat colors.' }
/** Paper cutout's chip. */
export const CUTOUT = { id: 'cutout' as const, label: 'Paper cutout', note: 'Layers of cut colored paper, each casting a soft shadow on the one behind, like a diorama in a box.' }
/** The mosaic's chip. */
export const MOSAIC = { id: 'mosaic' as const, label: 'Mosaic', note: 'Small tiles, each one color, set in grout, each a little different from the next.' }
/** CRT / VHS's chip. */
export const CRT = { id: 'crt' as const, label: 'CRT / VHS', note: 'An old television playing a tape: scanlines, color that smears, rows that wander and a tracking band.' }
/** All six, in the order the Style tab lists them. */
export const FILTERS = [CLAY, BLUEPRINT, THERMAL, CUTOUT, MOSAIC, CRT] as const
/** Which of them. */
export type FilterId = (typeof FILTERS)[number]['id']
/** Whether a style is one of them. */
export const isFilter = (id: string | undefined): id is FilterId => FILTERS.some((f) => f.id === id)

type Sky255 = readonly [readonly number[], readonly number[]]
const one = (v: readonly number[]): Rgb01 => [v[0] / 255, v[1] / 255, v[2] / 255]
const skyOf = (sky: Sky255 | undefined, or: Sky01): Sky01 => (sky ? [one(sky[0]), one(sky[1])] : or)
const css = (c: readonly number[]) => `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`
const gradient = (s: Sky01) => `linear-gradient(${css(s[0])}, ${css(s[1])})`
/** A palette's colors (sRGB 0–255) from darkest to lightest (sRGB 0–1). */
const byLight = (colors: readonly (readonly number[])[]) => colors.map(one).sort((a, b) => luma(toLinear(a)) - luma(toLinear(b)))

// ————— Thermal camera —————

/** The heat colors a thermal camera can show, cold to hot (sRGB 0–1). */
export const THERMAL_RAMPS: { id: string; label: string; about: string; ramp: Rgb01[] }[] = [
  { id: 'iron', label: 'Ironbow', about: 'Black through purple, red and orange to white, as most heat cameras show it.', ramp: [[0, 0, 0.02], [0.16, 0.02, 0.38], [0.55, 0.05, 0.55], [0.88, 0.22, 0.14], [0.98, 0.56, 0.05], [1, 0.86, 0.3], [1, 1, 0.92]] },
  { id: 'rainbow', label: 'Rainbow', about: 'Blue through green and yellow to red and white: small differences of heat stand apart.', ramp: [[0, 0, 0.25], [0, 0.25, 0.95], [0, 0.85, 0.85], [0.2, 0.95, 0.2], [1, 0.95, 0], [1, 0.4, 0], [0.9, 0, 0], [1, 1, 1]] },
  { id: 'white', label: 'White hot', about: 'Gray, hotter is lighter.', ramp: [[0.02, 0.02, 0.02], [1, 1, 1]] },
  { id: 'black', label: 'Black hot', about: 'Gray, hotter is darker.', ramp: [[1, 1, 1], [0.02, 0.02, 0.02]] },
]
/** What the page's controls make. */
export interface ThermalChoice {
  /** The heat colors, an id of `THERMAL_RAMPS`. */
  colors: string
  /** How hot what gives its own light runs, 0 to 1.5. */
  hot: number
  /** How far its heat spreads, in CSS pixels. */
  spread: number
  /** How warm lit things are. */
  warm: number
  /** The sensor's grain. */
  noise: number
  /** A palette whose colors, darkest to lightest, are the heat colors in place of `colors`: 'none' keeps the camera's own. */
  palette: string
}
/** Where the thermal camera's settings start. */
export const THERMAL_START: ThermalChoice = { colors: 'iron', hot: 1, spread: 20, warm: 0.8, noise: 0.3, palette: 'none' }
/** The look for the stage; `palette` is the palette picked (sRGB 0–255), if any. */
export function thermalLook(c: ThermalChoice, palette?: readonly (readonly number[])[], still?: boolean): ThermalLook {
  const own = THERMAL_RAMPS.find((r) => r.id === c.colors) ?? THERMAL_RAMPS[0]
  const steps = palette?.length ? paletteRamp(palette) : undefined
  return { kind: 'thermal', ramp: steps && steps.length >= 2 ? steps : own.ramp, stepped: !!steps && steps.length >= 2, hot: c.hot, spread: c.spread, warm: c.warm, noise: c.noise, still }
}
/** The color behind the canvas before the camera's picture is drawn. */
export const thermalGround = (c: ThermalChoice) => css((THERMAL_RAMPS.find((r) => r.id === c.colors) ?? THERMAL_RAMPS[0]).ramp[0])

// ————— CRT / VHS —————

/** What the page's controls make. */
export interface CrtChoice {
  /** How dark the gaps between scanlines are. */
  scan: number
  /** How tall a scanline is, in CSS pixels. */
  every: number
  /** How far color smears. */
  bleed: number
  /** How much rows wander and the tracking band rolls. */
  wobble: number
  /** Tape noise. */
  noise: number
  /** How much the glass bulges. */
  curve: number
  /** The palette the scene is painted from first: 'none' keeps its own colors, 'own' is the scene's, else a shared one. */
  palette: string
}
/** Where CRT / VHS's settings start. */
export const CRT_START: CrtChoice = { scan: 0.5, every: 3, bleed: 0.5, wobble: 0.4, noise: 0.3, curve: 0.4, palette: 'none' }
/** The look for the stage; `sky` is the subject's own, top and bottom (sRGB 0–255); `loop` the seconds it comes round in. */
export function crtLook(c: CrtChoice, sky?: Sky255, loop?: number, still?: boolean): CrtLook {
  return { kind: 'crt', scan: c.scan, every: c.every, bleed: c.bleed, wobble: c.wobble, noise: c.noise, curve: c.curve, sky: skyOf(sky, CRT_BACK), period: loop && loop > 0 ? loop : 12, still }
}
/** The color behind the canvas: the screen's black. */
export const CRT_GROUND = 'rgb(0 0 0)'

// ————— Blueprint —————

/** The papers a blueprint can be drawn on, each with its lines (sRGB 0–1). */
export const BLUEPRINT_PAPERS: { id: string; label: string; paper: Rgb01; ink: Rgb01 }[] = [
  { id: 'blue', label: 'Blueprint', paper: BLUEPRINT_PAPER, ink: BLUEPRINT_INK },
  { id: 'navy', label: 'Navy', paper: [0.06, 0.12, 0.25], ink: [0.84, 0.9, 0.98] },
  { id: 'white', label: 'Whiteprint', paper: [0.95, 0.95, 0.92], ink: [0.13, 0.27, 0.56] },
  { id: 'graph', label: 'Graph paper', paper: [0.97, 0.96, 0.92], ink: [0.17, 0.17, 0.19] },
]
/** What the page's controls make. */
export interface BlueprintChoice {
  /** The paper and its lines, an id of `BLUEPRINT_PAPERS`. */
  paper: string
  /** The outline's width, in CSS pixels. */
  line: number
  /** How strong the lines between parts are. */
  inner: number
  /** How far apart the grid's lines are, in CSS pixels (0 for none). */
  grid: number
  /** Whether dimension lines are drawn. */
  dims: boolean
  /** How strongly the subject is washed in the line color. */
  fill: number
  /** A palette whose darkest color is the paper and lightest the lines, in place of `paper`: 'none' keeps the paper's own. */
  palette: string
}
/** Where the blueprint's settings start. */
export const BLUEPRINT_START: BlueprintChoice = { paper: 'blue', line: 1.5, inner: 0.6, grid: 16, dims: true, fill: 0.25, palette: 'none' }
/** The paper and lines a blueprint is drawn in: the paper's own, or a palette's darkest and lightest (sRGB 0–255). */
export function blueprintColors(c: BlueprintChoice, palette?: readonly (readonly number[])[]): { paper: Rgb01; ink: Rgb01 } {
  if (palette && palette.length >= 2) { const s = byLight(palette); return { paper: s[0], ink: s[s.length - 1] } }
  const p = BLUEPRINT_PAPERS.find((x) => x.id === c.paper) ?? BLUEPRINT_PAPERS[0]
  return { paper: p.paper, ink: p.ink }
}
/** The look for the stage. */
export function blueprintLook(c: BlueprintChoice, palette?: readonly (readonly number[])[]): BlueprintLook {
  return { kind: 'blueprint', ...blueprintColors(c, palette), line: c.line, inner: c.inner, grid: c.grid, dims: c.dims, fill: c.fill }
}
/** The color behind the canvas: the paper. */
export const blueprintGround = (c: BlueprintChoice, palette?: readonly (readonly number[])[]) => css(blueprintColors(c, palette).paper)

// ————— Mosaic —————

/** The grouts a mosaic can be set in (sRGB 0–1). */
export const MOSAIC_GROUTS: { id: string; label: string; color: Rgb01 }[] = [
  { id: 'light', label: 'Pale', color: MOSAIC_GROUT },
  { id: 'dark', label: 'Dark', color: [0.2, 0.19, 0.18] },
  { id: 'gold', label: 'Gold', color: [0.78, 0.62, 0.3] },
]
/** What the page's controls make. */
export interface MosaicChoice {
  /** A tile's side, in CSS pixels. */
  tile: number
  /** The grout's width, in CSS pixels. */
  grout: number
  /** The grout, an id of `MOSAIC_GROUTS`. */
  groutColor: string
  /** How much tiles differ. */
  vary: number
  /** How much each tile's edges catch light. */
  bevel: number
  /** Rows set like bricks. */
  brick: boolean
  /** Whether the subject's sky is set behind it in tiles, or plain stone tiles. */
  sky: boolean
  /** The palette the scene is painted from first: 'none' keeps its own colors, 'own' is the scene's, else a shared one. */
  palette: string
}
/** Where the mosaic's settings start. */
export const MOSAIC_START: MosaicChoice = { tile: 10, grout: 1.5, groutColor: 'light', vary: 0.5, bevel: 0.5, brick: false, sky: true, palette: 'none' }
/** The sky set in tiles behind a subject with no sky of its own (sRGB 0–1). */
export const MOSAIC_SKY: Sky01 = [[0.45, 0.63, 0.82], [0.88, 0.85, 0.76]]
/** The look for the stage; `sky` is the subject's own, top and bottom (sRGB 0–255). */
export function mosaicLook(c: MosaicChoice, sky?: Sky255): MosaicLook {
  const g = MOSAIC_GROUTS.find((x) => x.id === c.groutColor) ?? MOSAIC_GROUTS[0]
  return { kind: 'mosaic', tile: c.tile, grout: c.grout, groutColor: g.color, vary: c.vary, bevel: c.bevel, brick: c.brick, sky: c.sky ? skyOf(sky, MOSAIC_SKY) : undefined }
}
/** The color behind the canvas: the grout. */
export const mosaicGround = (c: MosaicChoice) => css((MOSAIC_GROUTS.find((x) => x.id === c.groutColor) ?? MOSAIC_GROUTS[0]).color)

// ————— Paper cutout —————

/** What the page's controls make. */
export interface CutoutChoice {
  /** How far a layer's shadow falls, in CSS pixels. */
  shadow: number
  /** How soft the shadow is. */
  soft: number
  /** Where the light comes from on the screen, in degrees (0 from the right, 90 from above). */
  light: number
  /** The paper's fibers. */
  grain: number
  /** The pale cut edge toward the light, in CSS pixels. */
  edge: number
  /** How ragged the cut edges are. */
  ragged: number
  /** How many flat colors each part's own are gathered into (each a sheet of paper). */
  fills: number
  /** Whether the subject's sky is the card behind it, or plain card. */
  sky: boolean
  /** The palette the paper is cut from: 'none' keeps its own colors, 'own' is the scene's, else a shared one. */
  palette: string
}
/** Where paper cutout's settings start. */
export const CUTOUT_START: CutoutChoice = { shadow: 6, soft: 0.5, light: 120, grain: 0.5, edge: 1, ragged: 0.4, fills: 2, sky: true, palette: 'none' }
/** The look for the stage; `sky` is the subject's own, top and bottom (sRGB 0–255). */
export function cutoutLook(c: CutoutChoice, sky?: Sky255): CutoutLook {
  return { kind: 'cutout', shadow: c.shadow, soft: c.soft, light: c.light, grain: c.grain, edge: c.edge, ragged: c.ragged, sky: c.sky ? skyOf(sky, CUTOUT_CARD) : CUTOUT_CARD }
}
/** The color behind the canvas: the card. */
export const cutoutGround = (c: CutoutChoice, sky?: Sky255) => gradient(c.sky ? skyOf(sky, CUTOUT_CARD) : CUTOUT_CARD)

// ————— Claymation —————

/** How fast claymation moves, as the page offers it. */
export const CLAY_RATES: { id: number; label: string; about: string }[] = [
  { id: 12, label: '12 a second', about: 'Held for two frames of film each, as most stop motion is shot.' },
  { id: 8, label: '8 a second', about: 'Choppier, as quick home-made stop motion.' },
  { id: 0, label: 'Smooth', about: 'Every frame, with no stop-motion stepping.' },
]
/** What the page's controls make. */
export interface ClayChoice {
  /** Frames a second; 0 moves every frame. */
  fps: number
  /** How deep the thumbprints are. */
  prints: number
  /** How big a thumbprint is, as a share of the scene. */
  size: number
  /** How smooth the clay is. */
  smooth: number
  /** How much the clay shines. */
  sheen: number
  /** How much the thumbprints shift from frame to frame. */
  boil: number
  /** The palette the clay is mixed from: 'none' keeps its own colors, 'own' is the scene's, else a shared one. */
  palette: string
}
/** Where claymation's settings start. */
export const CLAY_START: ClayChoice = { fps: 12, prints: 0.6, size: 0.05, smooth: 0.5, sheen: 0.3, boil: 0.4, palette: 'none' }
/** The look for the stage; `sky` is the subject's own, top and bottom (sRGB 0–255). Under reduced motion it moves smoothly and the prints hold. */
export function clayLook(c: ClayChoice, sky?: Sky255, still?: boolean): ClayLook {
  return { kind: 'clay', fps: still ? 0 : c.fps, prints: c.prints, size: c.size, smooth: c.smooth, sheen: c.sheen, boil: still ? 0 : c.boil, sky: skyOf(sky, CLAY_BACK) }
}
/** The color behind the canvas: the backdrop. */
export const clayGround = (sky?: Sky255) => gradient(skyOf(sky, CLAY_BACK))
