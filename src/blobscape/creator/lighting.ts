import type { Vec3 } from '../../splat-core/blobs.ts'
import type { Light, PointLight } from '../../splat-engine/engine.ts'
import { MAX_LIGHTS } from '../../splat-engine/engine.ts'
import { daylight, skyLights, type Daylight } from '../../splat-engine/daylight.ts'
import { MAX_PROJECT_LAMPS, sunOf, type CompiledProject, type ProjectLight, type ProjectWeather, type SceneProject } from '../../splat-engine/project.ts'
import type { CloudId, WeatherId, WindId } from '../../splat-engine/skyRecipes.ts'
import { TIMES, type TimeId } from '../timeOfDay.ts'
import { lightsAt, type LightDoc } from '../../splat-engine/sceneDoc.ts'
import { MAX_LAMPS } from '../../splat-engine/voxel.ts'

/**
 * Light mode (Scene Creator, #338), pure so it is tested: the project's light changed as an edit, the live sun at an
 * hour, the lamps the visitor sets down, and the budget of lights.
 */

/** The project with its light changed; a change to nothing is the project as it was, so it is no step to undo. */
export function lit(p: SceneProject, change: Partial<ProjectLight>): SceneProject {
  const light: ProjectLight = { ...p.light, ...change }
  for (const k of Object.keys(light) as (keyof ProjectLight)[]) if (light[k] === undefined) delete light[k]
  if (JSON.stringify(light) === JSON.stringify(p.light ?? {})) return p
  return { ...p, light: Object.keys(light).length ? light : undefined }
}

/** The sun as the project has it, or as the land was written. */
export const sunNow = (cp: CompiledProject, l: ProjectLight | undefined) => l?.sun ?? sunOf(cp.land.prop.doc.light?.from)
/** The shade as the project has it, or as the land was written. */
export const shadeNow = (cp: CompiledProject, l: ProjectLight | undefined) => l?.shade ?? cp.land.prop.doc.light?.ambient ?? 0.45

/** A lamp the visitor sets down at `at`: a warm lantern that reaches about a prop's width. */
export const newLamp = (at: Vec3): LightDoc => ({ at: [round(at[0]), round(at[1]), round(at[2])], color: '#ffb060', strength: 1.5, range: 0.6 })

/** Lamp `i` changed. */
export const lampChanged = (p: SceneProject, i: number, change: Partial<LightDoc>): SceneProject =>
  lit(p, { lamps: (p.light?.lamps ?? []).map((l, k) => (k === i ? { ...l, ...change, at: change.at ? [round(change.at[0]), round(change.at[1]), round(change.at[2])] : l.at } : l)) })

/** A lamp added, last; the project as it was when it holds as many as it may. */
export const lampAdded = (p: SceneProject, at: Vec3): SceneProject =>
  (p.light?.lamps?.length ?? 0) >= MAX_PROJECT_LAMPS ? p : lit(p, { lamps: [...(p.light?.lamps ?? []), newLamp(at)] })

/** Lamp `i` gone. */
export const lampRemoved = (p: SceneProject, i: number): SceneProject => {
  const lamps = (p.light?.lamps ?? []).filter((_, k) => k !== i)
  return lit(p, { lamps: lamps.length ? lamps : undefined })
}

/** The visitor's lamps as they shine `t` seconds into a loop of `loop`. */
export const lampLights = (l: ProjectLight | undefined, t: number, loop: number): PointLight[] => lightsAt(l?.lamps ?? [], (t / loop) % 1)

/** The sky at a live sun's hour, and the lights it gives: sun and moon from their directions, and the sky's own light. */
export function liveSky(hour: number, shadows: boolean): { sky: Daylight; lights: Light[]; ambient: Vec3 } {
  const sky = daylight(hour)
  const { lights, ambient } = skyLights(sky, shadows)
  const k = LIVE_GAIN
  return { sky, lights: lights.map((l) => ({ ...l, color: [l.color[0] * k, l.color[1] * k, l.color[2] * k] })), ambient: [ambient[0] * k, ambient[1] * k, ambient[2] * k] }
}

/**
 * How bright the live sky is drawn. Day and Night's strengths are for its own scene; on a scene's colors, painted to
 * be seen under its baked sun, full strength washed the afternoon out.
 */
export const LIVE_GAIN = 0.7

/** A linear color as a CSS hex, for the sky behind the picture. */
export const hexOf = (c: readonly number[]) => '#' + c.slice(0, 3).map((v) => {
  const x = Math.max(0, Math.min(1, v))
  const s = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
  return Math.round(s * 255).toString(16).padStart(2, '0')
}).join('')

/** The sky behind the picture at a live sun's hour: straight up, and low down with the sun's glow in it. */
export const liveSkyColors = (sky: Daylight): [string, string] => [hexOf(sky.zenith), hexOf(sky.horizon.map((c, k) => c + sky.sunGlow[k] * 0.6))]

/** A CSS hex as 0 to 255 a channel, as the pixel pass's sky takes it. */
export const rgbOf = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]

/** An hour as a clock reads it: "2:30 PM". */
export function clock(hour: number): string {
  const m = Math.round(((hour % 24) + 24) % 24 * 60) % (24 * 60)
  const h = Math.floor(m / 60), mm = m % 60
  return `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** How many lights a project uses against what the engine allows: live ones, and those with baked shadows. */
export function budget(cp: CompiledProject, l: ProjectLight | undefined): { live: [number, number]; baked: [number, number] } {
  const own = [cp.land.prop.doc, ...cp.props.map((p) => p.prop.doc)].flatMap((d) => d.lights ?? [])
  const sun = l?.live ? liveSky(l.live.hour, false).lights.length : 0
  return {
    live: [own.length + (l?.lamps?.length ?? 0) + sun, MAX_LIGHTS],
    baked: [own.filter((x) => x.shadows && !x.circle).length, MAX_LAMPS],
  }
}

const round = (v: number) => Math.round(v * 1e4) / 1e4

/** A shared weather picked (or none, `id` left out): a weather brings its own clouds and wind, a cover is clouds alone. */
export function weatherPicked(r: ProjectWeather | undefined, kind: 'weather' | 'clouds', id: WeatherId | CloudId | undefined): ProjectWeather | undefined {
  return tidy({ overhead: r?.overhead, ...(kind === 'weather' ? { weather: id as WeatherId | undefined } : { clouds: id as CloudId | undefined }) })
}

/** A wind picked, in place of the weather's own. */
export const windPicked = (r: ProjectWeather | undefined, id: WindId): ProjectWeather | undefined => tidy({ ...r, wind: id })

/** The clouds over the scene, or left out (over it is the default, so it is not kept). */
export const overheadPicked = (r: ProjectWeather | undefined, on: boolean): ProjectWeather | undefined => tidy({ ...r, overhead: on ? undefined : false })

/** The time of day (Morning, Afternoon, Night) a project's live sun stands at, if it stands at one's hour. */
export const timeIn = (l: ProjectLight | undefined): TimeId | undefined => (l?.live ? TIMES.find((t) => t.hour === l.live!.hour)?.id : undefined)

function tidy(r: ProjectWeather): ProjectWeather | undefined {
  const out = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)) as ProjectWeather
  return Object.keys(out).length ? out : undefined
}
