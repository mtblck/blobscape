/**
 * The sky over a scene through a day: where the sun and the moon stand for a time, a latitude and a day of the year,
 * and the light that follows from it, ready for `setLights`. The sun's path is the real one (declination by the day,
 * hour angle by the clock); its color comes from how much air its light crosses (red and dim at the horizon, white
 * overhead); the sky's own light, the sky's colors and the stars follow the sun's height. The moon is kept simple: it
 * trails the sun by its age, a full one rides high in winter and low in summer, and it gives light by how much of it
 * is lit. Pure numbers, so a page, a test and a recording get the same sky.
 *
 * Directions are in the scene's frame: +x east, +y up, +z south. Strengths are set for a picture, not for a light
 * meter: real moonlight is a millionth of sunlight, and an eye (or a camera) opens up at night, so here the night is
 * dim, not black.
 */

type Vec3 = [number, number, number]

/** Where and when the sky is: what `daylight` needs besides the hour. */
export interface SkyPlace {
  /** Degrees north of the equator (south is negative). */
  latitude: number
  /** The day of the year, 1 to 365: 80 is the March equinox, 172 the June solstice. */
  day: number
  /** The moon's age: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
  moon: number
}

/** A temperate place at midsummer under a full moon: what `daylight` uses where none is given. */
export const DEFAULT_PLACE: SkyPlace = { latitude: 45, day: 172, moon: 0.5 }

/** The sky at one moment, from `daylight`. Colors are linear RGB; a light's color already holds its strength. */
export interface Daylight {
  /** The way toward the sun (a unit vector), below the horizon too. */
  sun: Vec3
  /** The sun's height over the horizon, in degrees (negative when it is down). */
  sunHeight: number
  /** The sun's light: white overhead, redder and weaker toward the horizon, nothing once it is down. */
  sunColor: Vec3
  /** The way toward the moon (a unit vector). */
  moon: Vec3
  /** The moon's height over the horizon, in degrees. */
  moonHeight: number
  /** The moon's light, by how much of it is lit and how dark the sky is: nothing by day. */
  moonColor: Vec3
  /** How much of the moon's face is lit, 0 (new) to 1 (full). */
  moonLit: number
  /** Light from the whole sky, which reaches into shade: blue by day, warm at dusk, dim and blue at night. */
  ambient: Vec3
  /** The sky's color straight up. */
  zenith: Vec3
  /** The sky's color at the horizon, away from the sun. */
  horizon: Vec3
  /** The warm glow low in the sky round the sun as it rises and sets: nothing while it is high or well down. */
  sunGlow: Vec3
  /** How clearly the stars show, 0 by day to 1 in full night (less under a bright moon). */
  stars: number
  /** How dark it has grown, 0 in daylight to 1 once the sun is well down: when lamps come on. */
  dark: number
}

const RAD = Math.PI / 180
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t) }
const mix3 = (a: readonly number[], b: readonly number[], t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/**
 * The way toward a point of the sky (a unit vector: +x east, +y up, +z south) from its hour angle (degrees west of
 * due south, 15 an hour), its declination (degrees north of the sky's equator) and the latitude it is seen from.
 */
export function skyWay(hourAngle: number, declination: number, latitude: number): Vec3 {
  const h = hourAngle * RAD, d = declination * RAD, p = latitude * RAD
  const east = -Math.cos(d) * Math.sin(h)
  const north = Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(h)
  const up = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(h)
  return [east, up, -north]
}

/** How far north of the sky's equator the sun is on a day of the year, in degrees: 23.44 at the June solstice. */
export function sunDeclination(day: number): number {
  return -23.44 * Math.cos((2 * Math.PI * (day + 10)) / 365)
}

/** The way toward the sun at an hour of the day (0 to 24 by the sun: 12 is when it is highest). */
export function sunWay(hour: number, place: SkyPlace = DEFAULT_PLACE): Vec3 {
  return skyWay(15 * (hour - 12), sunDeclination(place.day), place.latitude)
}

/**
 * The way toward the moon at an hour of the day. It trails the sun across the sky by its age (a full moon is opposite
 * the sun, so it rises as the sun sets), and its declination is the sun's turned by its age, so a full moon is high in
 * winter and low in summer.
 */
export function moonWay(hour: number, place: SkyPlace = DEFAULT_PLACE): Vec3 {
  return skyWay(15 * (hour - 12) - 360 * place.moon, sunDeclination(place.day) * Math.cos(2 * Math.PI * place.moon), place.latitude)
}

/** How much of the moon's face is lit at an age: 0 new, 1 full. */
export function moonLit(age: number): number {
  return (1 - Math.cos(2 * Math.PI * age)) / 2
}

/**
 * When the sun rises and sets, in hours by the sun, from where its center crosses the horizon. Where it never sets
 * (a polar summer) `rise` is 0 and `set` 24; where it never rises, both are 12.
 */
export function sunTimes(place: SkyPlace = DEFAULT_PLACE): { rise: number; set: number } {
  const c = -Math.tan(place.latitude * RAD) * Math.tan(sunDeclination(place.day) * RAD)
  if (c <= -1) return { rise: 0, set: 24 }
  if (c >= 1) return { rise: 12, set: 12 }
  const half = Math.acos(c) / RAD / 15
  return { rise: 12 - half, set: 12 + half }
}

/**
 * How much air light crosses on its way down from a height over the horizon (degrees), as a multiple of the air
 * straight overhead: 1 at the zenith, about 38 at the horizon (Kasten and Young's fit).
 */
export function airMass(height: number): number {
  const h = Math.max(height, 0)
  return 1 / (Math.sin(h * RAD) + 0.50572 * (h + 6.07995) ** -1.6364)
}

/** How much each of red, green and blue the air overhead takes from sunlight (optical depths): blue goes first. */
const AIR = [0.05, 0.1, 0.22]
/** The sun's light overhead on a clear day, before the air takes its share. */
const SUN: Vec3 = [1.5, 1.44, 1.36]
/** A full moon's light, high in a dark sky. */
const MOON: Vec3 = [0.2, 0.26, 0.4]
/** The sky's own light: under a high sun, at night with no moon, and what a full moon adds. */
const SKY_DAY: Vec3 = [0.36, 0.44, 0.58], SKY_NIGHT: Vec3 = [0.022, 0.032, 0.066], SKY_MOON: Vec3 = [0.02, 0.028, 0.05]
/** The warm light the sky gives while the sun is at the horizon. */
const SKY_DUSK: Vec3 = [0.1, 0.05, 0.045]

/** The sky's colors (linear) by the sun's height in degrees: straight up, at the horizon away from the sun, and the glow round the sun. */
const SKIES: [number, Vec3, Vec3, Vec3][] = [
  [-18, [0.001, 0.002, 0.006], [0.003, 0.005, 0.014], [0, 0, 0]],
  [-8, [0.004, 0.008, 0.03], [0.02, 0.022, 0.06], [0.12, 0.03, 0.03]],
  [-2, [0.014, 0.03, 0.13], [0.16, 0.11, 0.17], [0.8, 0.22, 0.06]],
  [3, [0.03, 0.1, 0.36], [0.42, 0.34, 0.36], [1, 0.48, 0.14]],
  [14, [0.035, 0.16, 0.6], [0.4, 0.58, 0.82], [0.5, 0.4, 0.3]],
  [40, [0.025, 0.15, 0.6], [0.44, 0.64, 0.88], [0, 0, 0]],
  [90, [0.02, 0.14, 0.6], [0.45, 0.66, 0.9], [0, 0, 0]],
]

/**
 * The sky and its light at an hour of the day (0 to 24 by the sun; any number wraps) at a place: where the sun and
 * moon stand, their light, the sky's own light and colors, how clearly stars show and how dark it has grown. Every
 * value changes smoothly through the day, so an hour hand dragged across it never jumps.
 */
export function daylight(hour: number, place: SkyPlace = DEFAULT_PLACE): Daylight {
  const sun = sunWay(hour, place), moon = moonWay(hour, place)
  const heightOf = (way: Vec3) => Math.asin(Math.max(-1, Math.min(1, way[1]))) / RAD
  const sunHeight = heightOf(sun), moonHeight = heightOf(moon)
  // the sun through the air: each color loses its share for every air mass crossed beyond the one overhead
  const m = airMass(sunHeight) - 1
  const up = smooth(-1, 1.5, sunHeight)
  const sunColor = SUN.map((c, k) => c * Math.exp(-AIR[k] * m) * up) as Vec3
  // how far the day has gone from the sky: 1 under a high sun, 0 once twilight is over
  const day = smooth(-9, 10, sunHeight)
  const lit = moonLit(place.moon)
  const moonUp = smooth(-1, 8, moonHeight) * lit
  const moonColor = MOON.map((c) => c * moonUp * (1 - smooth(-9, -2, sunHeight))) as Vec3
  const dusk = Math.exp(-((sunHeight / 6) ** 2))
  const night = SKY_NIGHT.map((c, k) => c + SKY_MOON[k] * moonUp)
  const ambient = mix3(night, SKY_DAY, day).map((c, k) => c + SKY_DUSK[k] * dusk) as Vec3
  let i = 0
  while (i < SKIES.length - 2 && sunHeight > SKIES[i + 1][0]) i++
  const t = clamp01((sunHeight - SKIES[i][0]) / (SKIES[i + 1][0] - SKIES[i][0]))
  const glow = moonUp * (1 - day)
  const zenith = mix3(SKIES[i][1], SKIES[i + 1][1], t).map((c, k) => c + SKY_MOON[k] * 0.12 * glow) as Vec3
  const horizon = mix3(SKIES[i][2], SKIES[i + 1][2], t).map((c, k) => c + SKY_MOON[k] * 0.3 * glow) as Vec3
  const sunGlow = mix3(SKIES[i][3], SKIES[i + 1][3], t)
  return {
    sun, sunHeight, sunColor, moon, moonHeight, moonColor, moonLit: lit, ambient, zenith, horizon, sunGlow,
    stars: (1 - smooth(-12, -4, sunHeight)) * (1 - 0.45 * moonUp),
    dark: 1 - smooth(-5, 3, sunHeight),
  }
}

/**
 * The lights a sky gives a scene, for `setLights`: the sun and the moon as lights from a direction (each only while
 * it gives light, so a march for shadows is never spent on a light that is down), casting shadows if asked, and the
 * sky's own light as the ambient color.
 */
export function skyLights(sky: Daylight, shadows = true): { lights: { direction: Vec3; color: Vec3; shadow: boolean }[]; ambient: Vec3 } {
  const lights: { direction: Vec3; color: Vec3; shadow: boolean }[] = []
  const on = (c: Vec3) => c[0] + c[1] + c[2] > 0.004
  if (on(sky.sunColor)) lights.push({ direction: sky.sun, color: sky.sunColor, shadow: shadows })
  if (on(sky.moonColor)) lights.push({ direction: sky.moon, color: sky.moonColor, shadow: shadows })
  return { lights, ambient: sky.ambient }
}
