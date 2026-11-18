/**
 * The parts of the `<blobscape-creature>` element (element.ts) that need no browser: how a creature is framed,
 * which bone looks, which clip a name means.
 */
import type { Blobs } from '../splat-core/blobs.ts'
import { STAGE_FOV, type Orbit } from '../splat-core/orbit.ts'
import type { Clip } from './glb.ts'

/** The element's tag name. */
export const CREATURE_TAG = 'blobscape-creature'
/** Seconds one move takes to blend into the next. */
export const FADE = 0.25
/**
 * The view that fits a creature: its blobs' box (each blob out to twice its size) in the middle, far enough away
 * that it fits the stage's lens at any turn. `aspect` is the view's width over its height.
 */
export function fitOrbit(blobs: Blobs, aspect: number, azimuth = 30, elevation = 10): Orbit {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < blobs.count; i++) {
    // faint blobs are haze at most: they don't decide the frame
    if (blobs.opacity[i] < 0.05) continue
    const r = 2 * Math.max(blobs.scale[i * 3], blobs.scale[i * 3 + 1], blobs.scale[i * 3 + 2])
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], blobs.center[i * 3 + k] - r)
      hi[k] = Math.max(hi[k], blobs.center[i * 3 + k] + r)
    }
  }
  if (!(hi[0] >= lo[0])) return { target: [0, 0, 0], distance: 4, azimuth, elevation }
  const half = [0, 1, 2].map((k) => (hi[k] - lo[k]) / 2)
  // seen from any side it is as wide as its footprint's diagonal
  const wide = Math.hypot(half[0], half[2])
  const tan = Math.tan((STAGE_FOV * Math.PI) / 360)
  const distance = Math.max(half[1] / tan, wide / (tan * Math.max(0.2, aspect))) * 1.04 + wide * 0.6
  return { target: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], distance, azimuth, elevation }
}

/** The bone a creature looks with: one called head (the first, so not a headband or a head's child), else a neck, else none. */
export function headBone(names: readonly string[]): string | undefined {
  return names.find((n) => /^head$/i.test(n)) ?? names.find((n) => /head/i.test(n)) ?? names.find((n) => /neck/i.test(n))
}

/** The clip called `name` (any letter case), or the first when there is none by that name. */
export function clipNamed(clips: readonly Clip[], name: string | null | undefined): Clip | undefined {
  const want = name?.trim().toLowerCase()
  return (want ? clips.find((c) => c.name.toLowerCase() === want) : undefined) ?? clips[0]
}
