import type { Vec3 } from '../splat-core/blobs.ts'
import type { Rgb } from '../splat-core/pixel.ts'
import { hash } from './built.ts'
import type { BoneDoc, MoveDoc, PartDoc, SceneDoc, SpeckDoc } from './sceneDoc.ts'

/**
 * Weather and cloud cover as recipes (Matt, 2026-11-21: reusable recipes applied to every scene the same way, so a
 * change to rain changes rain everywhere, and a thunderstorm on the campfire is one switch). Pure and tested.
 *
 * A recipe is a few numbers (`SkyState`): how much rain and snow falls, how much of the sky is cloud, what the light
 * is multiplied by, how gray and dark the sky turns, how thick the air is, and whether lightning flashes. Nothing in
 * it knows a scene. What is drawn is laid over a scene, never cut into it: the rain, snow and clouds are three small
 * descriptions of their own (`weatherDocs`), compiled against the scene's ground so drops land on it, and the light,
 * sky and haze are numbers a page hands the stage each frame. So going from one weather to another is a change of
 * numbers, eased by `SkyEase`, and the scene is never cut again for it.
 */

export type WeatherId = 'rain' | 'heavy-rain' | 'thunderstorm' | 'snow' | 'heavy-snow' | 'fog'
export type CloudId = 'partly' | 'cloudy' | 'overcast'
export type WindId = 'calm' | 'breeze' | 'windy' | 'gale'

/** What the sky is doing, as numbers that can be mixed. */
export interface SkyState {
  /** How much of the rain falls, 0 to 1 (a share of `RAIN_MOST` drops). */
  rain: number
  /** How much of the snow falls, 0 to 1 (a share of `SNOW_MOST` flakes). */
  snow: number
  /** How much of the sky is cloud, 0 to 1 (a share of `CLOUDS` clouds). */
  clouds: number
  /** What multiplies everything but the scene's own lamps and what glows (linear). */
  light: Vec3
  /** How far the sky's colors turn to an overcast gray, 0 to 1. */
  gray: number
  /** How much darker the sky is drawn, 0 to 1. */
  dark: number
  /** How thick the air is, 0 (the scene's own) to 1 (fog). */
  haze: number
  /** How strong the lightning is, 0 for none. */
  lightning: number
  /** How hard the wind blows, in levels from 0 (calm: the scene's own) to `WIND_MOST`: it slants what falls and raises waves on water. */
  wind: number
}

/** The sky left as the scene has it. */
export const CLEAR: SkyState = { rain: 0, snow: 0, clouds: 0, light: [1, 1, 1], gray: 0, dark: 0, haze: 0, lightning: 0, wind: 0 }

export interface CloudCover {
  id: CloudId
  label: string
  /** The share of the clouds that are out. */
  clouds: number
  light: Vec3
  gray: number
  dark: number
}

/** The numbers are mine, not Matt's yet. */
export const CLOUD_COVERS: CloudCover[] = [
  { id: 'partly', label: 'Partly cloudy', clouds: 0.375, light: [0.97, 0.97, 0.98], gray: 0.1, dark: 0 },
  { id: 'cloudy', label: 'Cloudy', clouds: 0.75, light: [0.86, 0.88, 0.92], gray: 0.55, dark: 0.08 },
  { id: 'overcast', label: 'Heavy clouds', clouds: 1, light: [0.74, 0.77, 0.84], gray: 0.9, dark: 0.22 },
]

export interface WeatherRecipe {
  id: WeatherId
  label: string
  /** The least cloud it comes with: rain does not fall from a clear sky. */
  clouds: CloudId
  rain?: number
  snow?: number
  haze: number
  /** What it multiplies the light by, on top of its clouds'. */
  light?: Vec3
  /** How much darker again it draws the sky. */
  dark?: number
  lightning?: number
  /** The least wind it comes with, a level of `WINDS` (Matt, 2026-11-21: water a level rougher under rain, two under heavy rain, three in a thunderstorm). */
  wind?: number
  /** Whether it is gloomy enough by day that lamps waiting for the dark come on. */
  gloom?: boolean
}

/** The numbers are mine, not Matt's yet. */
export const WEATHERS: WeatherRecipe[] = [
  { id: 'rain', label: 'Rain', clouds: 'cloudy', rain: 0.4, haze: 0.2, wind: 1 },
  { id: 'heavy-rain', label: 'Heavy rain', clouds: 'overcast', rain: 1, haze: 0.35, light: [0.92, 0.92, 0.94], dark: 0.1, wind: 2, gloom: true },
  { id: 'thunderstorm', label: 'Thunderstorm', clouds: 'overcast', rain: 1, haze: 0.35, light: [0.8, 0.82, 0.9], dark: 0.3, lightning: 1, wind: 3, gloom: true },
  { id: 'snow', label: 'Snow', clouds: 'cloudy', snow: 0.4, haze: 0.25, wind: 1 },
  { id: 'heavy-snow', label: 'Heavy snow', clouds: 'overcast', snow: 1, haze: 0.5, light: [1.08, 1.08, 1.08], wind: 2 },
  { id: 'fog', label: 'Fog', clouds: 'cloudy', haze: 1, light: [0.95, 0.95, 0.96] },
]

export const weatherAsked = (q: string | null | undefined): WeatherId | undefined => WEATHERS.find((w) => w.id === q)?.id
export const cloudsAsked = (q: string | null | undefined): CloudId | undefined => CLOUD_COVERS.find((c) => c.id === q)?.id

/**
 * The sky for a weather and a cloud cover, either left out. Weather brings at least its own clouds; more cloud than
 * that may be asked for, less may not.
 */
export function skyState(weather?: WeatherId, clouds?: CloudId, wind?: WindId): SkyState {
  const w = WEATHERS.find((k) => k.id === weather)
  const asked = CLOUD_COVERS.findIndex((c) => c.id === clouds), least = w ? CLOUD_COVERS.findIndex((c) => c.id === w.clouds) : -1
  const c = CLOUD_COVERS[Math.max(asked, least)]
  const blow = Math.max(w?.wind ?? 0, WINDS.findIndex((k) => k.id === wind))
  if (!w && !c && blow <= 0) return CLEAR
  const wl = w?.light ?? [1, 1, 1], cl = c?.light ?? [1, 1, 1]
  return {
    rain: w?.rain ?? 0, snow: w?.snow ?? 0, clouds: c?.clouds ?? 0,
    light: [wl[0] * cl[0], wl[1] * cl[1], wl[2] * cl[2]],
    gray: c?.gray ?? 0, dark: Math.min(1, (c?.dark ?? 0) + (w?.dark ?? 0)), haze: w?.haze ?? 0, lightning: w?.lightning ?? 0, wind: Math.max(0, blow),
  }
}

/** Whether lamps that wait for the dark come on under this weather though it is day. */
export const gloomy = (weather?: WeatherId) => !!WEATHERS.find((k) => k.id === weather)?.gloom

/** Whether a sky is the scene's own, with nothing laid over it. */
export const isClear = (s: SkyState) => !s.rain && !s.snow && !s.clouds && !s.gray && !s.dark && !s.haze && !s.lightning && !s.wind && s.light.every((v) => v === 1)

const mix = (a: number, b: number, k: number) => a + (b - a) * k

/** A sky `k` of the way from one to another. */
export function mixSky(a: SkyState, b: SkyState, k: number): SkyState {
  if (k <= 0) return a
  if (k >= 1) return b
  return {
    rain: mix(a.rain, b.rain, k), snow: mix(a.snow, b.snow, k), clouds: mix(a.clouds, b.clouds, k),
    light: [mix(a.light[0], b.light[0], k), mix(a.light[1], b.light[1], k), mix(a.light[2], b.light[2], k)],
    gray: mix(a.gray, b.gray, k), dark: mix(a.dark, b.dark, k), haze: mix(a.haze, b.haze, k), lightning: mix(a.lightning, b.lightning, k), wind: mix(a.wind, b.wind, k),
  }
}

/** How hard the wind blows: a level each, calm first. `slant` is how far sideways it carries rain for each unit it falls. */
export const WINDS: { id: WindId; label: string; slant: number }[] = [
  { id: 'calm', label: 'Calm', slant: 0 },
  { id: 'breeze', label: 'Breeze', slant: 0.18 },
  { id: 'windy', label: 'Windy', slant: 0.5 },
  { id: 'gale', label: 'Gale', slant: 1 },
]
/** The hardest wind, a level (`SkyState.wind`). */
export const WIND_MOST = WINDS.length - 1
export const windAsked = (q: string | null | undefined): WindId | undefined => WINDS.find((w) => w.id === q)?.id
/** Where the wind blows, x and z (one long), the same in every scene. */
export const WIND_WAY: readonly [number, number] = [0.949, 0.316]

/**
 * The wind at `t` seconds into a loop of `loop`, for a sky: how far sideways it carries rain a unit of fall, [x, z].
 * Its level's slant (between levels, between their slants), in gusts a whole number of times a loop so a loop joins.
 */
export function windAt(s: SkyState, t: number, loop: number): [number, number] {
  if (s.wind <= 0) return [0, 0]
  const lo = Math.min(WIND_MOST - 1, Math.floor(s.wind)), k = s.wind - lo
  const slant = WINDS[lo].slant + (WINDS[lo + 1].slant - WINDS[lo].slant) * k
  const u = t / loop
  const gust = 1 + 0.22 * Math.sin(u * 3 * Math.PI * 2) + 0.12 * Math.sin(u * 7 * Math.PI * 2 + 1.3)
  return [WIND_WAY[0] * slant * gust, WIND_WAY[1] * slant * gust]
}

/** Seconds a change of weather takes. */
export const SKY_EASE = 3

/**
 * The sky on its way from what it was to what was asked for: `set` a new one at a time (seconds on any clock) and
 * `at` gives the sky for a later time, there after `SKY_EASE` seconds. A change made while another is under way
 * starts from wherever the sky had got to.
 */
export class SkyEase {
  private from: SkyState = CLEAR
  private to: SkyState = CLEAR
  private since = -Infinity
  readonly seconds: number
  constructor(seconds = SKY_EASE) { this.seconds = seconds }
  /** The sky asked for. */
  get target() { return this.to }
  /** `now` of Infinity puts the sky there at once. */
  set(to: SkyState, now: number) {
    this.from = Number.isFinite(now) ? this.at(now) : to
    this.to = to
    this.since = now
  }
  /** Whether it is still changing at `now`. */
  moving(now: number) { return Number.isFinite(this.since) && now - this.since < this.seconds }
  at(now: number): SkyState {
    if (!Number.isFinite(this.since)) return this.to
    const k = this.seconds > 0 ? Math.min(1, Math.max(0, (now - this.since) / this.seconds)) : 1
    return mixSky(this.from, this.to, k * k * (3 - 2 * k))
  }
}

// --- Lightning

/** Seconds between bolts, about. */
export const BOLT_EVERY = 6
/** Seconds one bolt's light lasts. */
export const BOLT_SECONDS = 0.75

/**
 * How bright lightning is `t` seconds into a loop of `loop`, 0 to 1: a bolt about every `BOLT_EVERY` seconds, each
 * at its own moment by a hash, as a flash, a dip and a second flash that dies away. At most two flashes a bolt, so
 * never more than three a second. The same in every loop, so a loop joins.
 */
export function lightningAt(t: number, loop: number): number {
  const n = Math.max(1, Math.round(loop / BOLT_EVERY)), slot = loop / n
  const u = ((t % loop) + loop) % loop, k = Math.floor(u / slot)
  // each bolt falls somewhere in the first part of its slot, so its light is over before the slot is
  const start = k * slot + hash(k + 1, n, 7) * Math.max(0, slot - BOLT_SECONDS)
  const dt = u - start
  if (dt < 0 || dt >= BOLT_SECONDS) return 0
  if (dt < 0.1) return 1
  if (dt < 0.2) return 0.2
  if (dt < 0.3) return 0.85
  return 0.85 * (1 - (dt - 0.3) / (BOLT_SECONDS - 0.3)) ** 2
}

/** How much a full flash adds to the light, a channel: bluish white. */
export const FLASH_LIGHT: Vec3 = [0.85, 0.95, 1.2]
/** The sky at the top of a flash (sRGB 0 to 255). */
export const FLASH_SKY: Rgb = [214, 222, 246]

/** The light under a sky, with `flash` (0 to 1) of a bolt in it. */
export function lightUnder(s: SkyState, flash = 0): Vec3 {
  const f = flash * s.lightning
  return [s.light[0] + FLASH_LIGHT[0] * f, s.light[1] + FLASH_LIGHT[1] * f, s.light[2] + FLASH_LIGHT[2] * f]
}

/** A sky color (sRGB 0 to 255) under a sky: turned toward an overcast gray, darkened, and lit by a flash. */
export function skyUnder(c: readonly number[], s: SkyState, flash = 0): Rgb {
  const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
  // overcast is a gray a little to the blue, and pulled toward the middle so a bright day's sky dulls
  const g = [l * 0.9 + 12, l * 0.93 + 13, l * 0.98 + 17]
  const f = flash * s.lightning * 0.7
  return [0, 1, 2].map((k) => {
    const v = mix(c[k], g[k], s.gray) * (1 - 0.55 * s.dark)
    return Math.round(Math.min(255, Math.max(0, mix(v, FLASH_SKY[k], f))))
  }) as Rgb
}

/**
 * The haze a sky lays on a scene seen from `distance`, in units past the view's target as a scene's own haze is
 * (`from` where it starts, `to` where it would be total), or none where the sky brings none. Thin for rain, a wall for fog.
 */
export function hazeUnder(s: SkyState, distance: number): { from: number; to: number } | undefined {
  if (s.haze <= 0) return undefined
  const r = distance * 0.45, k = (1 - s.haze) ** 2
  return { from: r * mix(-1.2, 0.5, k), to: r * mix(2.6, 40, k) }
}

// --- What falls and what floats: descriptions of their own

/** The most drops of rain and flakes of snow: each is a bone, and a blob names its bones in a byte. */
export const RAIN_MOST = 230, SNOW_MOST = 230
/** How many clouds there are at full cover. */
export const CLOUDS = 8

const RAIN_COLORS = ['#9fb4d0', '#c4d4e8'], SNOW_COLORS = ['#ffffff', '#e6eef8']
const CLOUD_COLORS = ['#f4f6f8', '#d9dfe8', '#b3bccb']
/** The colors weather brings: a palette that pixel art snaps to needs them. */
export const WEATHER_COLORS = [...CLOUD_COLORS, ...RAIN_COLORS, ...SNOW_COLORS]

type View = SceneDoc['camera']

/** How high over the view's target the clouds float, as a share of the view's distance: near the top of the picture as the view starts. */
export const CLOUD_HEIGHT = 0.3
/** The height of the clouds' flat undersides for a view: what falls starts there, so rain comes down from under the clouds. */
export const cloudBase = (camera: View) => round(camera.target[1] + Math.max(0.9, camera.distance * CLOUD_HEIGHT))

/** Rain or snow over the middle of a view, falling from the clouds' height onto whatever stands there: one swarm, for any scene. */
export function falling(kind: 'rain' | 'snow', camera: View, count = kind === 'rain' ? RAIN_MOST : SNOW_MOST): SpeckDoc {
  const [x, y, z] = camera.target, r = Math.max(0.8, camera.distance * 0.45)
  return {
    kind, count, colors: kind === 'rain' ? RAIN_COLORS : SNOW_COLORS, land: true,
    // fine streaks of rain and small flakes, in proportion to the view rather than the scene's own specks
    ...(kind === 'rain' ? { size: 0.003, long: round(Math.max(0.03, camera.distance * 0.011)) } : { size: round(Math.max(0.006, camera.distance * 0.0025)) }),
    from: [round(x - r), round(y - 1), round(z - r)], to: [round(x + r), cloudBase(camera), round(z + r)],
    // no wind of its own: the sky's wind of the moment blows it (`CompiledScene.blow`)
  }
}

/**
 * Where each cloud floats over a scene, across the view and away from the eye, in shares of the scene's half width:
 * over the scene itself, not only behind it (Matt, 2026-11-21: rain comes down from under clouds). The first few are
 * well apart, for a sky with only some of them out; together they roof the scene.
 */
const CLOUD_SPOTS: [number, number][] = [[0.55, 0.5], [-0.65, 0.15], [-0.05, 1.05], [0.1, -0.2], [0.95, -0.1], [-0.95, 0.9], [-0.5, -0.55], [0.6, -0.65]]

/** Where cloud `i` floats for a view: its flat underside at `cloudBase`, over the scene. */
export function cloudAt(i: number, camera: View): Vec3 {
  const [x, , z] = camera.target, r = Math.max(0.8, camera.distance * 0.45)
  const [across, away] = CLOUD_SPOTS[i % CLOUDS]
  const a = (camera.azimuth * Math.PI) / 180
  // across the view is (cos a, -sin a), away from the eye (-sin a, -cos a)
  const dx = across * Math.cos(a) - away * Math.sin(a), dz = -across * Math.sin(a) - away * Math.cos(a)
  return [round(x + dx * r), round(cloudBase(camera) + 0.02 * camera.distance * hash(i + 1, 3, 2)), round(z + dz * r)]
}

/** How a sky's clouds look: their colors from underneath up, and whether they glow to keep them. The recipe's own when left out. */
export interface CloudLook { colors?: readonly [string, string, string]; glow?: boolean }

function cloudPart(i: number, camera: View, look: CloudLook = {}): PartDoc {
  const [under, middle, top] = look.colors ?? [CLOUD_COLORS[2], CLOUD_COLORS[1], CLOUD_COLORS[0]]
  const p = cloudAt(i, camera), s = (camera.distance / 3.7) * (1 + 0.4 * hash(i + 1, 3, 3))
  // heaped, flat underneath, wide enough that together they roof the scene
  const a = (camera.azimuth * Math.PI) / 180, ax = Math.cos(a), az = -Math.sin(a)
  const at = (k: number, back: number, h: number): Vec3 => [round(p[0] + (ax * k + az * back) * s), round(p[1] + h * s), round(p[2] + (az * k - ax * back) * s)]
  return {
    shape: { kind: 'join', shapes: [
      { kind: 'ball', at: at(0, 0, 0.06), r: [round(0.46 * s), round(0.09 * s), round(0.46 * s)] },
      { kind: 'sphere', at: at(-0.2, 0.05, 0.12), r: round(0.15 * s) },
      { kind: 'sphere', at: at(0.08, -0.08, 0.15), r: round(0.18 * s) },
      { kind: 'sphere', at: at(0.28, 0.1, 0.1), r: round(0.12 * s) },
      { kind: 'sphere', at: at(0, 0.24, 0.1), r: round(0.13 * s) },
    ] },
    paint: { kind: 'split', axis: 'y', at: round(p[1] + 0.07 * s), below: under, above: { kind: 'split', axis: 'y', at: round(p[1] + 0.16 * s), below: middle, above: top } },
    bone: `cloud${i}`, noShadow: true, bare: true, ...(look.glow ? { glow: true } : {}),
  }
}

/**
 * The weather for a view, as three descriptions laid over any scene: the clouds, the rain and the snow. Each holds
 * the most there can be; `poseWeather` shows the share a sky asks for. Compile them with the scene's `ground`, so what
 * falls lands on the scene.
 */
export function weatherDocs(camera: View, loop: number, look: CloudLook = {}): { clouds: SceneDoc; rain: SceneDoc; snow: SceneDoc } {
  const view = { target: camera.target, distance: camera.distance, azimuth: camera.azimuth, elevation: camera.elevation }
  const bones: BoneDoc[] = [], parts: PartDoc[] = [], moves: MoveDoc[] = []
  for (let i = 0; i < CLOUDS; i++) {
    bones.push({ name: `cloud${i}`, at: cloudAt(i, camera) })
    parts.push(cloudPart(i, camera, look))
    const a = (camera.azimuth * Math.PI) / 180, by = camera.distance * 0.06
    // each drifts to and fro across the view once a loop, out of step with the next
    moves.push({ kind: 'bob', bone: `cloud${i}`, by: [round(Math.cos(a) * by), 0, round(-Math.sin(a) * by)], times: 1, phase: round(hash(i + 1, 3, 4)) })
  }
  const base = { loop, camera: view, light: { from: [0.3, 1, 0.2] as Vec3, ambient: 0.7 } }
  // a description must hold a part: this one is never shown
  const none = { bones: [{ name: HIDDEN, at: camera.target }] as BoneDoc[], parts: [{ shape: { kind: 'sphere', at: camera.target, r: 0.02 }, paint: SNOW_COLORS[0], bone: HIDDEN, noShadow: true, bare: true }] as PartDoc[] }
  return {
    clouds: { ...base, name: 'Clouds', palette: [...(look.colors ?? CLOUD_COLORS)], bones, parts, moves },
    rain: { ...base, ...none, name: 'Rain', palette: RAIN_COLORS, air: { specks: [falling('rain', camera)] } },
    snow: { ...base, ...none, name: 'Snow', palette: SNOW_COLORS, air: { specks: [falling('snow', camera)] } },
  }
}

const HIDDEN = 'hidden'

/** How much of thing `i` of `n` is out when `share` of them are: all of the first ones, none of the last, one in between. */
export const shareOut = (i: number, n: number, share: number) => Math.min(1, Math.max(0, share * n - i))

/** The bones of a compiled weather description that a sky shows more or fewer of. */
export interface WeatherBones { clouds: number[]; specks: number[]; hidden: number[] }
export function weatherBones(names: readonly string[]): WeatherBones {
  const pick = (start: string) => names.map((n, i) => (n.startsWith(start) ? i : -1)).filter((i) => i >= 0)
  return { clouds: pick('cloud'), specks: pick('~speck'), hidden: pick(HIDDEN) }
}

/**
 * After a weather description's own pose (before the bones are worked out): shows `falls` of its drops or flakes and
 * `clouds` of its clouds, by size, so a sky on its way from one weather to another has its rain thin out or come on
 * a drop at a time.
 */
export function showWeather(size: Float32Array, bones: WeatherBones, falls: number, clouds: number) {
  bones.specks.forEach((b, i) => { size[b] *= shareOut(i, bones.specks.length, falls) })
  bones.clouds.forEach((b, i) => { size[b] *= shareOut(i, bones.clouds.length, clouds) })
  for (const b of bones.hidden) size[b] = 0
}

const round = (v: number) => Math.round(v * 1e4) / 1e4
