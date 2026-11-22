import type { CelLook } from '../splat-core/cel.ts'
import { srgbToLinear } from '../splat-core/color.ts'
import { LIT_MAX } from '../splat-engine/voxel.ts'
import { STEADY, darkest, heatPace, screenWay, type PixelLook, type Rgb } from '../splat-core/pixel.ts'
import type { Orbit } from '../splat-core/view.ts'
import type { Diorama } from './diorama/scenes.ts'
import { isPixelStyle, lightsItself, type Style } from './diorama/styles.ts'
import { GLITCH_START, type GlitchChoice } from './glitchLooks.ts'

/**
 * One layer of style settings that Diorama and Scene Creator both draw with (Matt, 2026-11-21: any new setting made
 * for a style is then on both pages). It holds what the visitor picks (`StyleSettings`), how a scene's own finish and
 * the address start it, the pixel look it gives, and what of it means cutting the scene again. Pure, so it is tested;
 * the controls are `StyleControls.tsx`.
 */

/** Pixel art's settings, as the Style and Finish controls set them. */
export interface PixelSettings {
  /** The palette's id: 'own' is the scene's, else one of the shared ones. */
  palette: string
  /** Each art pixel this many device pixels across. */
  size: number
  /** Frames a second the scene moves at; 0 is every frame the screen shows. */
  rate: number
  dither: number
  /** How strongly glowing things light what is round them and shine into the pixels beside them. */
  glow: number
  /** A line round the scene, and whether it takes a darker tone of each thing it goes round. */
  outline: boolean
  own: boolean
  /** Lines inside the scene: where things meet (and, where the scene asks, where colors jump). */
  lines: boolean
  sky: boolean
  /** Heat haze over glowing things, in art pixels; 0 is none. */
  heat: number
  /** Glow in flat rings. */
  bands: number
  /** A softer outline on lit sides. */
  selout: boolean
  /** Color cycling, where the scene has one. */
  cycle: boolean
  /** Painted in steps of the palette as the scene is cut. */
  steps: boolean
  /** Light in this many bands a blob, as the scene is cut; 0 is smooth light. */
  texel: number
  /** Light worked out a pixel at a time (cel shading in the small picture), with the scene cut unlit. */
  shade: boolean
  /** The scene's own gentle rocking of the view. */
  rock: boolean
  /** The exact (radix) sort. */
  exact: boolean
}

/** Everything about how a scene is drawn. */
export interface StyleSettings {
  style: Style
  glitch: GlitchChoice
  pixel: PixelSettings
}

/** Pixel sizes and paces on offer. */
export const PIXEL_SIZES = [2, 3, 4, 6]
export const PIXEL_RATES = [0, 12, 8]
/** How many steps of sun Light in bands gives (`banded`): three, none, half and full, kept the paint's texture best. */
export const TEXEL_BANDS = 3

/** What a scene's finish is: the settings it asks for. */
export type Finish = Diorama['finish']

/** A number the address asks for, held to whole numbers from 0 to `most`, or `own` where it asks nothing. */
function whole(q: URLSearchParams, key: string, most: number, own: number): number {
  const s = q.get(key), v = s === null ? NaN : Number(s)
  return Number.isInteger(v) ? Math.min(most, Math.max(0, v)) : own
}

/** Pixel art as a scene's finish starts it, with what the address asks (`?px=`, `?glow=`, `?texel=`, `?steps=`, `?shade=1`, …). */
export function pixelStart(finish: Finish, q: URLSearchParams = new URLSearchParams()): PixelSettings {
  const glowQ = q.get('glow'), glow = glowQ === null ? NaN : Number(glowQ)
  const steps = q.get('steps'), texel = Number(q.get('texel'))
  return {
    palette: 'own',
    size: PIXEL_SIZES.includes(Number(q.get('px'))) ? Number(q.get('px')) : 2,
    rate: 0,
    dither: finish.dither,
    glow: Number.isFinite(glow) ? Math.min(4, Math.max(0, glow)) : finish.glow,
    outline: finish.outline,
    own: q.get('own') !== '0',
    lines: q.get('parts') !== '0',
    sky: finish.sky,
    heat: whole(q, 'heat', 3, finish.heat ?? 0),
    bands: whole(q, 'bands', 2, finish.bands ?? 2),
    selout: whole(q, 'selout', 1, 1) > 0,
    cycle: q.get('cycle') !== '0',
    steps: steps === null ? finish.steps : steps !== '0',
    texel: texel > 1 ? Math.round(texel) : 0,
    shade: q.get('shade') === '1',
    rock: q.get('rock') !== '0',
    exact: q.get('sort') === 'radix',
  }
}

/** The settings start: pixel art, with the scene's own finish. */
export const styleStart = (finish: Finish, q?: URLSearchParams): StyleSettings => ({ style: 'pixel', glitch: GLITCH_START, pixel: pixelStart(finish, q) })

/** A new scene's own finish over the settings the visitor has: its palette, dither, glow, outline, sky and art-pixel effects. */
export const pixelFor = (s: PixelSettings, finish: Finish): PixelSettings => ({
  ...s, palette: 'own', dither: finish.dither, glow: finish.glow, outline: finish.outline, sky: finish.sky, bands: finish.bands ?? 2, heat: finish.heat ?? 0,
})

/**
 * Settings kept by an older page read back over a start: each field kept where it has the start's type. Scene
 * Creator once kept `edges` and `parts` in place of `lines`; either brings lines back.
 */
export function pixelFrom(start: PixelSettings, x: unknown): PixelSettings {
  if (!x || typeof x !== 'object') return start
  const got = x as Record<string, unknown>
  const out = { ...start } as Record<string, unknown>
  for (const [k, v] of Object.entries(start)) {
    const g = got[k]
    if (typeof g === typeof v && (typeof g !== 'number' || Number.isFinite(g))) out[k] = g
  }
  if (got.lines === undefined && (typeof got.edges === 'boolean' || typeof got.parts === 'boolean')) out.lines = !!got.edges || !!got.parts
  return out as unknown as PixelSettings
}

/** Switches of pixel art that only the address turns off (`?steady=0`, `?calm=0`, …): every one is on by default. */
export interface PixelFlags { steady: boolean; tidy: boolean; calm: boolean; flat: boolean; fine: boolean; shine: boolean; rim: boolean; surface: boolean; across: boolean; solid: boolean }

/** The flags as the address has them. */
export function pixelFlags(q: URLSearchParams = new URLSearchParams()): PixelFlags {
  const on = (k: string) => q.get(k) !== '0'
  return { steady: on('steady'), tidy: on('tidy'), calm: on('calm'), flat: on('flat'), fine: on('fine'), shine: on('shine'), rim: on('rim'), surface: on('surface'), across: on('across'), solid: on('solid') }
}

/** What a scene gives the pixel look besides the settings. */
export interface PixelScene {
  /** The palette's colors (none: every pixel keeps its own color). */
  colors: Rgb[]
  /** The sky, and whether it is behind whatever the Sky behind switch says (a time of day, weather, a sky set in Light mode). */
  sky?: PixelLook['sky']
  skyForced?: boolean
  finish: Finish
  /** The way toward the scene's sun, and the view it starts from: the lit rim goes by them. */
  sun?: readonly [number, number, number]
  start?: Orbit
  loop: number
}

/** The pixel look for the settings and the scene. */
export function pixelLookOf(s: PixelSettings, scene: PixelScene, f: PixelFlags = pixelFlags()): PixelLook {
  const { colors, finish } = scene
  return {
    palette: colors, dither: s.dither, outline: s.outline ? (colors.length ? darkest(colors) : [11, 16, 38]) : null, glow: s.glow,
    edges: s.lines && finish.edges ? 1 : 0, parts: s.lines, across: f.across, solid: f.solid,
    sky: s.sky || scene.skyForced ? scene.sky : undefined,
    steady: f.steady ? STEADY : 0, tidy: f.tidy, calm: f.calm, flat: f.flat, fine: f.fine, shine: f.shine,
    // the rim goes by the scene's starting view, so it holds still while the view rocks
    rim: f.rim && scene.sun && scene.start ? screenWay([...scene.sun] as [number, number, number], scene.start.azimuth, scene.start.elevation) : undefined,
    own: s.own, surface: f.surface, snap: true,
    bands: s.bands, heat: s.heat ? { pixels: s.heat, pace: heatPace(scene.loop) } : undefined, selout: s.selout, cycle: s.cycle ? finish.cycle : undefined,
  }
}

/** What the settings ask of the cut: no light baked in, steps of the palette, light in bands. */
export interface CutAsk {
  plain: boolean
  /** Paint in steps of these colors (none: as painted). */
  steps: Rgb[]
  texel: number
}

/** The cut the settings want, with `colors` the palette picked: only a style that lights the scene itself changes it. */
export function cutAsk(s: StyleSettings, colors: Rgb[]): CutAsk {
  const pixels = isPixelStyle(s.style)
  return {
    plain: pixels ? s.pixel.shade : lightsItself(s.style),
    // painted and banded light stay whatever the style, so changing style never cuts the scene again for them
    steps: s.pixel.steps ? colors : [],
    texel: s.pixel.texel,
  }
}

/** How far cel shading's light is smoothed over a surface for pixel art shaded a pixel at a time, in the small picture's pixels (two to an art pixel with four samples). */
const PIXEL_SMOOTH = 3

/**
 * Cel shading's look for pixel art shaded a pixel at a time (Shade each pixel): lit by the scene's own sun, as its
 * baked light would have been, in two tones (a third, brighter tone goes toward white, which turns dark paint gray;
 * the pixel pass's own highlights do that job), the shade at the scene's own share of light and a touch cool, and
 * everything held under the baked light's brightest (`LIT_MAX`), so only what gives its own light reaches the glow.
 */
export function pixelCelLook(sun: readonly [number, number, number] | undefined, share = 0.5): CelLook {
  // the shade is sRGB and the ambient linear, as `CelLook` takes them
  const s = Math.min(0.9, share / LIT_MAX), top = srgbToLinear(LIT_MAX)
  return { from: sun ? [sun[0], sun[1], sun[2]] : undefined, tones: 2, smooth: PIXEL_SMOOTH, line: 0, shade: [s * 0.96, s * 0.96, Math.min(1, s * 1.12)], ambient: [top, top, top] }
}
