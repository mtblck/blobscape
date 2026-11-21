import { Blobs, type Vec3 } from '../../splat-core/blobs.ts'
import { Skeleton, emptySkin, type Skin } from '../../splat-engine/rig.ts'
import { hashOf, chance } from './materials.ts'
import type { IslandPlan } from './island.ts'

/**
 * Clouds as soft blobs (Matt, 2026-11-21: light and wispy beside the cubes, where cubed clouds read as heaps). Each of
 * an island's clouds is a few dozen faint, flattened blobs heaped along its length, lighter on top and bluer
 * underneath, with long thin wisps trailing from it, on a bone of its own so it can drift. In the island's own units.
 */

/** Blobs in a cloud's body, and in the wisps trailing from it. */
export const CLOUD_BODY = 70
export const CLOUD_WISPS = 16
const TOP: Vec3 = [1, 1, 1], UNDER: Vec3 = [0.74, 0.8, 0.9]
/** How far a cloud drifts to and fro over a loop, in the island's units. */
const DRIFT = 0.25

const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** An island's clouds as soft blobs, a bone each, `soft` so a stage drawing blocks keeps them blobs. Pose with `poseClouds`. */
export function cloudActor(plan: IslandPlan): { blobs: Blobs; skin: Skin; skeleton: Skeleton; soft: true } {
  const blobs = new Blobs(plan.clouds.length * (CLOUD_BODY + CLOUD_WISPS)), bones: number[] = []
  plan.clouds.forEach((c, n) => {
    const h = hashOf(plan.seed, 700 + n), r = (k: number) => chance(h, k)
    const yaw = r(0) * Math.PI, quat: [number, number, number, number] = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]
    // the blob's own x turned by yaw, and the way beside it
    const ax = Math.cos(yaw), az = -Math.sin(yaw)
    const at = (u: number, side: number, y: number): Vec3 => [c.at[0] + ax * u - az * side, c.at[1] + y, c.at[2] + az * u + ax * side]
    const long = c.r * (1.8 + 1.4 * r(1)), floor = -c.r * 0.2
    for (let k = 0; k < CLOUD_BODY; k++) {
      // thick in the middle and thinning to the ends, heaped higher where thick
      const u = (r(10 + k) + r(110 + k) - 1) * long, bell = Math.max(0, 1 - (u / long) ** 2)
      const up = r(210 + k) * c.r * 0.55 * bell, side = (r(310 + k) - 0.5) * c.r * (0.4 + 0.6 * bell)
      const size = c.r * (0.3 + 0.35 * bell) * (0.7 + 0.6 * r(410 + k))
      const height = (up + c.r * 0.1) / (c.r * 0.65)
      blobs.push({ center: at(u, side, floor + up), scale: [size * 1.5, size * 0.45, size], quat, color: mix(UNDER, TOP, Math.min(1, height * 1.2)), opacity: 0.16 + 0.2 * r(510 + k) * (0.5 + 0.5 * bell) })
      bones.push(n)
    }
    for (let k = 0; k < CLOUD_WISPS; k++) {
      // wisps: long and thin, trailing off either end and below, faintest of all
      const end = r(610 + k) < 0.5 ? -1 : 1, u = end * long * (0.5 + 0.7 * r(710 + k))
      const reach = c.r * (0.6 + 0.9 * r(810 + k))
      blobs.push({ center: at(u, (r(910 + k) - 0.5) * c.r * 0.8, floor + (r(1010 + k) - 0.6) * c.r * 0.3), scale: [reach, c.r * 0.05, c.r * (0.1 + 0.12 * r(1110 + k))], quat, color: mix(UNDER, TOP, 0.6), opacity: 0.06 + 0.08 * r(1210 + k) })
      bones.push(n)
    }
  })
  const skeleton = new Skeleton([{ name: 'clouds', parent: -1, head: [0, 0, 0] }, ...plan.clouds.map((c, n) => ({ name: `cloud${n}`, parent: 0, head: c.at }))])
  const skin = emptySkin(blobs.count)
  for (let i = 0; i < blobs.count; i++) { skin.joints[i * 4] = bones[i] + 1; skin.weights[i * 4] = 1 }
  return { blobs, skin, skeleton, soft: true }
}

/** Each cloud drifting a little to and fro along x on its own phase, once a loop. Call before placing the island. */
export function poseClouds(plan: IslandPlan, sk: Skeleton, t: number, loop: number) {
  plan.clouds.forEach((_, n) => {
    const phase = chance(hashOf(plan.seed, 700 + n), 1500)
    sk.offset[(n + 1) * 3] = Math.sin((t / loop + phase) * Math.PI * 2) * DRIFT
  })
}
