import { linearToSrgb } from '../../splat-core/color.ts'
import { STAGE_FOV, type Orbit } from '../../splat-core/orbit.ts'
import { skyWay, type Daylight, type SkyPlace } from '../../splat-engine/daylight.ts'

/**
 * The sky behind Day and Night's scene, painted on a 2D canvas under the splats: a gradient from the horizon's color
 * to the zenith's, the sun and the moon where the scene's lights come from, and stars that turn about the pole. The
 * numbers (`skyColor`, `starWays`, `onScreen`) are pure and tested; `paintSky` puts them on a canvas.
 */

type Vec3 = [number, number, number]
const RAD = Math.PI / 180

/** A star: where it is among the others (hour angle at noon on the March equinox and declination, degrees) and how bright, 0 to 1. */
export interface Star { ra: number; dec: number; bright: number }

/** A sky full of stars from a seed: spread evenly over the sphere, most of them faint. */
export function makeStars(count: number, seed = 7): Star[] {
  let s = seed >>> 0
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
  return Array.from({ length: count }, () => ({ ra: rand() * 360, dec: Math.asin(rand() * 2 - 1) / RAD, bright: 0.25 + 0.75 * rand() ** 3 }))
}

/** The way toward a star at an hour: the whole sky turns once a day about the pole, and a little further each day of the year. */
export function starWay(star: Star, hour: number, place: SkyPlace): Vec3 {
  return skyWay(15 * (hour - 12) + (360 * (place.day - 80)) / 365 - star.ra, star.dec, place.latitude)
}

/**
 * Where a direction in the sky (a unit vector) falls on a view `width` by `height` for an orbit camera: x and y in
 * pixels from the top left, or nothing when it is behind the camera. The sky is infinitely far, so only the camera's
 * turn matters, not where it stands.
 */
export function onScreen(way: readonly number[], orbit: Orbit, width: number, height: number): { x: number; y: number } | undefined {
  const az = orbit.azimuth * RAD, el = Math.max(-89, Math.min(89, orbit.elevation)) * RAD
  // the camera looks from its place back at the target: forward, then right and up from it
  const f: Vec3 = [-Math.sin(az) * Math.cos(el), -Math.sin(el), -Math.cos(az) * Math.cos(el)]
  const r: Vec3 = [Math.cos(az), 0, -Math.sin(az)]
  const u: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]
  const z = way[0] * f[0] + way[1] * f[1] + way[2] * f[2]
  if (z < 0.02) return
  const k = 1 / Math.tan((STAGE_FOV / 2) * RAD)
  const x = (way[0] * r[0] + way[1] * r[1] + way[2] * r[2]) / z, y = (way[0] * u[0] + way[1] * u[1] + way[2] * u[2]) / z
  return { x: width / 2 + (x * k * height) / 2, y: height / 2 - (y * k * height) / 2 }
}

/**
 * When something in the sky comes up and goes down, in hours of the day, from its height (degrees) by the hour: found
 * by stepping through the day five minutes at a time. `up` says whether it is ever above the horizon; where it never
 * crosses it (always up, or never) there is no `rise` or `set`.
 */
export function upTimes(height: (hour: number) => number): { rise?: number; set?: number; up: boolean } {
  const step = 1 / 12
  // from a little after midnight round to the same moment, so a crossing right at midnight is not lost in the join
  const from = 0.013
  let rise: number | undefined, set: number | undefined, up = false, before = height(from)
  for (let h = from + step; h <= from + 24 + 1e-9; h += step) {
    const now = height(h)
    if (now > 0) up = true
    // where it crosses, by the straight line between the two steps
    if (before <= 0 && now > 0) rise = (h - step + (step * -before) / (now - before)) % 24
    if (before > 0 && now <= 0) set = (h - step + (step * before) / (before - now)) % 24
    before = now
  }
  return { rise, set, up }
}

/**
 * The orbit turned to face a direction in the sky (a unit vector, +x east, +y up, +z south), keeping its target and
 * distance: the camera goes round to the far side and looks up from low enough that the thing sits in the upper part
 * of the view, as far as an orbit can tip (it stops short of looking up from under the ground, so things over about 38 degrees up stay out of sight above).
 */
export function facing(way: readonly number[], orbit: Orbit): Orbit {
  const azimuth = (Math.atan2(-way[0], -way[2]) / RAD + 360) % 360
  const height = Math.asin(Math.max(-1, Math.min(1, way[1]))) / RAD
  return { ...orbit, azimuth, elevation: Math.max(-18, Math.min(12, STAGE_FOV / 4 - height)) }
}

/** How high over the horizon (degrees) the middle of a row of the view looks: `y` from 0 at the top to 1 at the bottom. */
export function rowHeight(y: number, orbit: Orbit): number {
  return -orbit.elevation + Math.atan((1 - 2 * y) * Math.tan((STAGE_FOV / 2) * RAD)) / RAD
}

/** The sky's color (linear) at a height over the horizon, in degrees: the horizon's color low down, the zenith's overhead, and dimmer below the horizon, where far land would be. */
export function skyColor(height: number, sky: Daylight): Vec3 {
  if (height < 0) {
    const k = 1 - 0.55 * Math.min(1, -height / 25)
    return [sky.horizon[0] * k, sky.horizon[1] * k, sky.horizon[2] * k]
  }
  const t = Math.sin(Math.min(90, height) * RAD) ** 0.45
  return [0, 1, 2].map((c) => sky.horizon[c] + (sky.zenith[c] - sky.horizon[c]) * t) as Vec3
}

const css = (c: readonly number[], a = 1) => `rgb(${c.map((v) => Math.round(linearToSrgb(Math.max(0, Math.min(1, v))) * 255)).join(' ')} / ${a})`

/**
 * Paints the sky for a view: the gradient by rows, then the stars, the moon (with the part of its face that is lit)
 * and the sun, each only above the horizon. `width` and `height` are the canvas's own pixels.
 */
export function paintSky(ctx: CanvasRenderingContext2D, width: number, height: number, orbit: Orbit, sky: Daylight, hour: number, place: SkyPlace, stars: Star[]) {
  const rows = 24
  const g = ctx.createLinearGradient(0, 0, 0, height)
  for (let i = 0; i <= rows; i++) g.addColorStop(i / rows, css(skyColor(rowHeight(i / rows, orbit), sky)))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, width, height)
  // the glow of a low sun: widest along the horizon, and it lights the haze below it too
  if (sky.sunGlow[0] + sky.sunGlow[1] + sky.sunGlow[2] > 0.01) {
    const flat = [sky.sun[0], 0, sky.sun[2]], len = Math.hypot(flat[0], flat[2]) || 1
    const p = onScreen([flat[0] / len, Math.max(-0.05, Math.min(0.2, sky.sun[1])), flat[2] / len], orbit, width, height)
    if (p) {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.scale(2.4, 1)
      const r = height * 0.55
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
      glow.addColorStop(0, css(sky.sunGlow, 0.95))
      glow.addColorStop(0.35, css(sky.sunGlow, 0.5))
      glow.addColorStop(1, css(sky.sunGlow, 0))
      ctx.fillStyle = glow
      ctx.fillRect(-r, -r, r * 2, r * 2)
      ctx.restore()
    }
  }
  // nothing else in the sky shows below the horizon
  const horizon = onScreen([-Math.sin(orbit.azimuth * RAD), 0, -Math.cos(orbit.azimuth * RAD)], orbit, width, height)?.y ?? (orbit.elevation > 0 ? -1 : height + 1)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, width, Math.max(0, Math.min(height, horizon)))
  ctx.clip()
  const unit = height / 100
  if (sky.stars > 0.01) {
    for (const s of stars) {
      const way = starWay(s, hour, place)
      if (way[1] < 0.02) continue
      const p = onScreen(way, orbit, width, height)
      if (!p || p.x < 0 || p.x > width || p.y < 0) continue
      // stars dim toward the horizon, where there is more air in the way
      ctx.fillStyle = `rgb(235 240 255 / ${Math.min(1, sky.stars * (0.35 + 0.65 * s.bright) * Math.min(1, way[1] * 5)).toFixed(3)})`
      const r = unit * (0.16 + 0.24 * s.bright)
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  const disc = (way: Vec3, r: number, core: string, halo: readonly number[], reach: number, strength: number) => {
    const p = onScreen(way, orbit, width, height)
    if (!p) return
    const glow = ctx.createRadialGradient(p.x, p.y, r * 0.6, p.x, p.y, r * reach)
    glow.addColorStop(0, css(halo, strength))
    glow.addColorStop(1, css(halo, 0))
    ctx.fillStyle = glow
    ctx.fillRect(p.x - r * reach, p.y - r * reach, r * reach * 2, r * reach * 2)
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fill()
    return p
  }
  // the moon: its whole face dimly, then the lit part, whose inner edge is half an ellipse
  if (sky.moonHeight > -3) {
    const r = unit * 2.6, night = 1 - Math.min(1, Math.max(0, (sky.sunHeight + 6) / 12)) * 0.55
    const p = disc(sky.moon, r, `rgb(52 60 84 / ${(0.9 * night).toFixed(3)})`, [0.5, 0.6, 0.85], 5, 0.22 * sky.moonLit * night)
    if (p && sky.moonLit > 0.01) {
      // the lit side faces the sun: a step from the moon toward the sun across the sky gives the way on screen
      const near = [0, 1, 2].map((k) => sky.moon[k] + 0.04 * sky.sun[k]), len = Math.hypot(near[0], near[1], near[2]) || 1
      const q = onScreen(near.map((v) => v / len), orbit, width, height)
      const toward = q && Math.hypot(q.x - p.x, q.y - p.y) > 1e-3 ? Math.atan2(q.y - p.y, q.x - p.x) : -Math.PI / 2
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(toward)
      ctx.fillStyle = `rgb(240 238 222 / ${night.toFixed(3)})`
      ctx.beginPath()
      // the bright limb, then back along the terminator: an ellipse as wide as the phase makes it
      ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2)
      const w = r * Math.abs(1 - 2 * sky.moonLit)
      ctx.ellipse(0, 0, w, r, 0, Math.PI / 2, -Math.PI / 2, sky.moonLit < 0.5)
      ctx.fill()
      ctx.restore()
    }
  }
  if (sky.sunHeight > -3) {
    const warm = sky.sunColor.map((c) => c / Math.max(0.05, sky.sunColor[0]))
    const low = Math.max(0, 1 - sky.sunHeight / 25)
    disc(sky.sun, unit * (2.4 + 0.8 * low), css([1, 0.92 * (0.55 + 0.45 * warm[1]), 0.8 * (0.3 + 0.7 * warm[2])]), [1, 0.75 * (0.5 + 0.5 * warm[1]), 0.5 * warm[2] + 0.1], 7 + 6 * low, 0.5)
  }
  ctx.restore()
}
