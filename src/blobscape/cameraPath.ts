import type { Orbit } from '../splat-core/orbit.ts'

/**
 * A camera path through the sandbox (issue #212), pure and tested: a few views saved as stops, and a smooth way
 * through them. The path is a Catmull-Rom curve through the stops' targets, distances (by ratio, so a zoom feels even),
 * heights and turns, each turn going the short way round from the stop before; it starts and ends gently.
 */

/** No path holds more stops than this. */
export const MAX_STOPS = 12
/** Frames a second a saved path is drawn at. */
export const PATH_FPS = 30

/** How long a path through `stops` takes at `leg` seconds from one stop to the next. */
export function pathSeconds(stops: number, leg: number): number {
  return Math.max(0, stops - 1) * leg
}

/** The stops' turns as one run of angles in which each is within half a turn of the one before. */
function unwound(stops: Orbit[]): number[] {
  const out: number[] = []
  for (const s of stops) {
    const was = out.length ? out[out.length - 1] : s.azimuth
    out.push(was + ((((s.azimuth - was) % 360) + 540) % 360) - 180)
  }
  return out
}

/** Catmull-Rom through b and c at t 0 to 1, with a before and d after. */
const curve = (a: number, b: number, c: number, d: number, t: number) =>
  0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t)

/**
 * The view `u` of the way along the path (0 at the first stop, 1 at the last). Stops are evenly spaced in time once
 * the gentle start and end are taken out: `eased` is that timing, so stop k of n is reached at `eased` = k / (n - 1).
 */
export function pathAt(stops: Orbit[], u: number): Orbit {
  if (!stops.length) throw new Error('a path needs a stop')
  if (stops.length === 1) return { ...stops[0], target: [...stops[0].target] }
  const x = eased(Math.min(1, Math.max(0, u))) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x)), t = x - i
  const at = (k: number) => Math.min(stops.length - 1, Math.max(0, k))
  const turns = unwound(stops)
  const of = (get: (k: number) => number) => curve(get(at(i - 1)), get(i), get(i + 1), get(at(i + 2)), t)
  return {
    target: [of((k) => stops[k].target[0]), of((k) => stops[k].target[1]), of((k) => stops[k].target[2])],
    distance: Math.exp(of((k) => Math.log(stops[k].distance))),
    azimuth: of((k) => turns[k]),
    elevation: Math.min(89, Math.max(-89, of((k) => stops[k].elevation))),
  }
}

/** Slow out of the first stop and into the last, even in between. */
export function eased(u: number): number {
  return u * u * (3 - 2 * u)
}

/** The `u` at which the path is at stop `k` of `n`: the inverse of `eased` at k / (n - 1). */
export function stopAt(k: number, n: number): number {
  if (n < 2) return 0
  const y = k / (n - 1)
  // smoothstep's inverse
  return 0.5 - Math.sin(Math.asin(1 - 2 * y) / 3)
}
