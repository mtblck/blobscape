import type { CelLook } from '../splat-core/cel.ts'
import { srgbToLinear } from '../splat-core/color.ts'
import { LIT_MAX } from '../splat-engine/voxel.ts'
import { FULL_LEVELS, MAX_RAMPED, STEADY, darkest, heatPace, rampPalette, screenWay, type PixelLook, type Rgb } from '../splat-core/pixel.ts'
import type { Orbit } from '../splat-core/view.ts'
import type { Diorama } from './diorama/scenes.ts'
import { DEFAULT_STYLE, isPixelStyle, lightsItself, type Style } from './diorama/styles.ts'
import { GLITCH_START, type GlitchChoice } from './glitchLooks.ts'
import { zoomStep } from './diorama/zoom.ts'
import { PIXEL, PIXEL_RATES, PIXEL_SIZES, TEXEL_BANDS, fromAddress, type PixelSettings } from './styles/catalog.ts'

export { PIXEL_RATES, PIXEL_SIZES, TEXEL_BANDS, type PixelSettings }

/**
 * One layer of style settings that Diorama and Scene Creator both draw with (Matt, 2026-11-21: any new setting made
 * for a style is then on both pages). It holds what the visitor picks (`StyleSettings`), how a scene's own finish and
 * the address start it, the pixel look it gives, and what of it means cutting the scene again. Pure, so it is tested;
 * the controls are `StyleControls.tsx`.
 */

/** Everything about how a scene is drawn. */
export interface StyleSettings {
  style: Style
  glitch: GlitchChoice
  pixel: PixelSettings
}


/**
 * The detail a page starts a style at, as a place in the detail levels (Chunky, Medium, Fine, Finest), until the
 * visitor picks one: Finest (Matt, 2026-11-20); a phone starts pixel art at Fine (he found the dragon slow at Finest
 * on his) and at Chunky the styles that draw the whole screen several times a frame. Plain blobs start at Finest on a
 * phone too (Matt, 2026-11-25).
 */
export const detailStart = (style: Style, coarse: boolean): number =>
  (coarse ? (style === 'blobs' ? 3 : isPixelStyle(style) ? 2 : 0) : 3)

/** Whether zooming in on pixel art grows its pixels (`?pixelzoom=0` turns it off). */
export const pixelZoomAsked = (q: URLSearchParams = new URLSearchParams()): boolean => q.get('pixelzoom') !== '0'

/**
 * Device pixels to an art pixel for a view `now` from its target, in a scene that starts `start` from it: zooming in
 * grows the pixels a whole step at a time, not the blobs (diorama/zoom.ts), so edges stay pixel edges.
 */
export const pixelSizeAt = (s: PixelSettings, start: number, now: number, zoom = true): number => (zoom ? s.size * zoomStep(start, now) : s.size)

/** What a scene's finish is: the settings it asks for. */
export type Finish = Diorama['finish']

/** Pixel art as a scene's finish starts it, with what the address asks (`?px=`, `?glow=`, `?texel=`, `?steps=`, `?shade=1`, …): the catalog reads it. */
export function pixelStart(finish: Finish, q: URLSearchParams = new URLSearchParams()): PixelSettings {
  const own: PixelSettings = { ...PIXEL.start, dither: finish.dither, glow: finish.glow, outline: finish.outline, sky: finish.sky, heat: finish.heat ?? 0, bands: finish.bands ?? 2, steps: finish.steps }
  const s = fromAddress(PIXEL, own, q)
  // one band is smooth light
  return { ...s, texel: s.texel > 1 ? s.texel : 0 }
}

/** The settings start: the style every page starts in, with the scene's own finish for pixel art. */
export const styleStart = (finish: Finish, q?: URLSearchParams): StyleSettings => ({ style: DEFAULT_STYLE, glitch: GLITCH_START, pixel: pixelStart(finish, q) })

/** A new scene's own finish over the settings the visitor has: its palette, dither, glow, outline, sky and art-pixel effects. */
export const pixelFor = (s: PixelSettings, finish: Finish): PixelSettings => ({
  ...s, palette: 'none', dither: finish.dither, glow: finish.glow, outline: finish.outline, sky: finish.sky, bands: finish.bands ?? 2, heat: finish.heat ?? 0,
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
export interface PixelFlags { steady: boolean; tidy: boolean; calm: boolean; flat: boolean; fine: boolean; shine: boolean; rim: boolean; surface: boolean; across: boolean; solid: boolean; ramps: boolean }

/** The flags as the address has them. */
export function pixelFlags(q: URLSearchParams = new URLSearchParams()): PixelFlags {
  const on = (k: string) => q.get(k) !== '0'
  return { steady: on('steady'), tidy: on('tidy'), calm: on('calm'), flat: on('flat'), fine: on('fine'), shine: on('shine'), rim: on('rim'), surface: on('surface'), across: on('across'), solid: on('solid'), ramps: on('ramps') }
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
  const { finish } = scene
  // Full color (the start, Matt 2026-11-28) is no palette whatever colors the page hands in; the outline still takes
  // the darkest of them
  const given = scene.colors, colors = s.palette === 'none' ? [] : given
  // a scene's own palette gains a step darker and lighter of each color, so texture has shades to fall into (Matt,
  // 2026-11-28); a shared palette is a set someone chose, so it is kept as it is, and a color that cycles gets no steps
  const cycling = s.cycle ? (finish.cycle ?? []).flatMap((c) => c.colors) : []
  const palette = f.ramps && s.palette === 'own' && colors.length ? rampPalette(colors, MAX_RAMPED, cycling) : colors
  return {
    palette, base: colors.length, levels: colors.length ? undefined : FULL_LEVELS, dither: s.dither, outline: s.outline ? (given.length ? darkest(given) : [11, 16, 38]) : null, glow: s.glow,
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
