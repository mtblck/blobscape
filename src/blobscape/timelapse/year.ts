/**
 * Time-lapse (issue #460): one scene through a day in each of the four seasons, about thirty seconds for the year.
 * Pure, so it is tested: where in the year a moment is, the weather each season brings (the shared recipes of
 * skyRecipes.ts, eased from one to the next), how deep snow lies, and the live sun, moon and sky at that moment
 * (daylight.ts at the season's own day of the year), dimmed by the weather.
 *
 * Everything is a function of the year's place alone, so dragging the scrubber gives the same picture as waiting.
 */
import type { Rgb } from '../../splat-core/pixel.ts'
import type { Light } from '../../splat-engine/engine.ts'
import { daylight, skyLights, type Daylight } from '../../splat-engine/daylight.ts'
import { CLEAR, lightUnder, mixSky, skyState, skyUnder, type CloudId, type SkyState, type WeatherId, type WindId } from '../../splat-engine/skyRecipes.ts'

export type SeasonId = 'spring' | 'summer' | 'fall' | 'winter'

/** A spell of weather within a season's day: from `from` (a share of the day) on, until the next. */
interface Spell { from: number; weather?: WeatherId; clouds?: CloudId; wind?: WindId }

export interface Season {
  id: SeasonId
  label: string
  /** The day of the year its day is (for the sun's path: high in summer, low in winter). */
  day: number
  /** The moon's age that night. */
  moon: number
  /** Its weather through the day. */
  spells: Spell[]
}

/** The year, in order. Each is one day, from just before dawn to the small hours. */
export const SEASONS: Season[] = [
  { id: 'spring', label: 'Spring', day: 110, moon: 0.25, spells: [{ from: 0, weather: 'light-rain' }, { from: 0.38, clouds: 'partly', wind: 'breeze' }, { from: 0.8, clouds: 'partly' }] },
  { id: 'summer', label: 'Summer', day: 196, moon: 0.5, spells: [{ from: 0, wind: 'calm' }, { from: 0.45, wind: 'breeze' }, { from: 0.62, clouds: 'partly' }, { from: 0.8 }] },
  { id: 'fall', label: 'Fall', day: 290, moon: 0.75, spells: [{ from: 0, clouds: 'cloudy', wind: 'breeze' }, { from: 0.3, clouds: 'overcast', wind: 'windy' }, { from: 0.48, weather: 'rain', wind: 'windy' }, { from: 0.68, clouds: 'cloudy', wind: 'breeze' }] },
  { id: 'winter', label: 'Winter', day: 355, moon: 0.95, spells: [{ from: 0, clouds: 'overcast' }, { from: 0.12, weather: 'snow' }, { from: 0.34, weather: 'heavy-snow', wind: 'breeze' }, { from: 0.62, weather: 'snow' }, { from: 0.85, clouds: 'partly' }] },
]

/** The hour each season's day starts at: a little before dawn, so the year opens on a sunrise. */
export const DAY_FROM = 4.5
/** How much of a season's day a change of weather takes. */
export const EASE = 0.07
/** The year's lengths a visitor can pick, in seconds. */
export const LENGTHS = [{ id: '30', label: '30 seconds', seconds: 30 }, { id: '60', label: 'A minute', seconds: 60 }, { id: '120', label: 'Two minutes', seconds: 120 }] as const
/** Where the sky is seen from: a temperate place, so the seasons' sun differs. */
export const LATITUDE = 48
/** How bright the live sky is drawn on a scene's colors (Scene Creator's `LIVE_GAIN`). */
export const GAIN = 0.7

/** A moment of the year. */
export interface Moment {
  /** Which season, 0 to 3, and how far through its day, 0 to 1. */
  season: number
  through: number
  /** The hour of the day, 0 to 24. */
  hour: number
  /** The weather at this moment. */
  sky: SkyState
  /** How deep snow lies, 0 to 1. */
  snow: number
}

const smooth = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t) }
const wrap = (u: number) => ((u % 1) + 1) % 1

/** A spell's weather as numbers. */
const stateOf = (s: Spell): SkyState => (s.weather || s.clouds || s.wind ? skyState(s.weather, s.clouds, s.wind) : CLEAR)

/** The weather `through` a season's day (0 to 1): its spells, each eased in over `EASE` from the one before (the last day's last, for the first). */
export function weatherAt(season: number, through: number): SkyState {
  const s = SEASONS[season], before = SEASONS[(season + 3) % 4]
  const spells = s.spells
  let k = spells.length - 1
  while (k > 0 && spells[k].from > through) k--
  const was = k > 0 ? spells[k - 1] : before.spells[before.spells.length - 1]
  return mixSky(stateOf(was), stateOf(spells[k]), smooth(spells[k].from, spells[k].from + EASE, through))
}

/** How deep snow lies: it builds while winter's snow falls, lies on into the night, and melts away in spring's first hours. */
export function snowAt(season: number, through: number): number {
  if (season === 3) return smooth(0.14, 0.72, through)
  if (season === 0) return 1 - smooth(0.06, 0.34, through)
  return 0
}

/** The moment at `u` of the year (0 to 1; it wraps). */
export function momentAt(u: number): Moment {
  const y = wrap(u) * 4, season = Math.min(3, Math.floor(y)), through = y - season
  return { season, through, hour: (DAY_FROM + through * 24) % 24, sky: weatherAt(season, through), snow: snowAt(season, through) }
}

/** The sky at a moment: the sun and moon where they stand on the season's day. */
export const skyOf = (m: Moment): Daylight => daylight(m.hour, { latitude: LATITUDE, day: SEASONS[m.season].day, moon: SEASONS[m.season].moon })

/**
 * The live light at a moment: sun and moon (casting shadows where `shadows`), and the sky's own light, at `GAIN`,
 * dimmed and grayed by the weather; `dark`, how dark it has grown (when lamps come on); and the sky behind, top and low.
 */
export function lightAt(m: Moment, shadows: boolean): { lights: Light[]; ambient: [number, number, number]; dark: number; sky: [Rgb, Rgb] } {
  const day = skyOf(m)
  const { lights, ambient } = skyLights(day, shadows)
  const under = lightUnder(m.sky)
  const k = (c: readonly number[]): [number, number, number] => [c[0] * GAIN * under[0], c[1] * GAIN * under[1], c[2] * GAIN * under[2]]
  // under cloud the sun's direct light is mostly gone and the sky's light takes its place
  const direct = 1 - 0.75 * m.sky.clouds
  const out: Light[] = lights.map((l) => ({ ...l, color: k(l.color.map((v) => v * direct)), shadow: l.shadow && direct > 0.5 }))
  const sky = k(ambient.map((v, i) => v + (1 - direct) * 0.5 * (lights[0]?.color[i] ?? 0)))
  const top = skyUnder(srgb(day.zenith), m.sky), low = skyUnder(srgb(day.horizon.map((c, i) => c + day.sunGlow[i] * 0.6 * direct)), m.sky)
  return { lights: out, ambient: sky, dark: Math.min(1, day.dark + 0.35 * m.sky.dark), sky: [top, low] }
}

/** A linear color as 0 to 255 sRGB. */
export function srgb(c: readonly number[]): Rgb {
  return [0, 1, 2].map((i) => {
    const x = Math.max(0, Math.min(1, c[i]))
    return Math.round((x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255)
  }) as Rgb
}

/** The moment's name, as the view says it: "Spring, 7:30 AM". */
export function nameOf(m: Moment): string {
  const minutes = Math.round(m.hour * 4) * 15 % (24 * 60)
  const h = Math.floor(minutes / 60), mm = minutes % 60
  return `${SEASONS[m.season].label}, ${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
