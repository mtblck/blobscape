import type { Vec3 } from '../../splat-core/blobs.ts'
import { buildBody, mix, type Creature, type Part } from '../../splat-engine/body.ts'
import type { PointLight } from '../../splat-engine/engine.ts'
import { axisAngle, mulQ, type Skeleton } from '../../splat-engine/rig.ts'
import { gather, type Want } from '../dungeon/glow.ts'

/**
 * The candles' flames and their light. Every flame is a small cone of bright blobs on a bone of its own, so it can
 * stretch, shrink and lean; each has its own rhythm, slow breathing with quick flutters. The light is the flames
 * gathered into a few of the engine's live lights that brighten and dim with the flames they stand for and cast
 * shadows, so what a flame does shows on the wall behind it, on the water and on whoever wades past.
 */

/** How many live lights the candles become. */
export const CANDLE_LIGHTS = 2
/** How tall a flame is, meters, and how wide at its foot. */
const FLAME_H = 0.15, FLAME_R = 0.034

/** The flames for wicks at `wicks` (world, the top of each candle), one bone each after the root. */
export function makeFlames(wicks: Vec3[], blobs = 1400): Creature {
  const bones = [{ name: 'root', parent: -1, head: [0, 0, 0] as Vec3 }]
  const parts: Part[] = []
  wicks.forEach((w, i) => {
    bones.push({ name: `flame${i}`, parent: 0, head: w })
    parts.push(
      // the wick, then the flame: white at its foot, yellow, then orange and thin at the tip
      { shape: { tube: [[w[0], w[1] - 0.004, w[2]], [w[0], w[1] + 0.02, w[2]]], r: [0.005, 0.003] }, color: [0.08, 0.06, 0.05], bones: ['root'], density: 2, size: 0.5 },
      {
        shape: { fill: [[w[0], w[1] + 0.012, w[2]], [w[0], w[1] + FLAME_H, w[2]]], r: [FLAME_R, 0.004] },
        color: (_p, _n, u) => (u < 0.35 ? mix([1, 0.97, 0.82], [1, 0.86, 0.45], u / 0.35) : mix([1, 0.86, 0.45], [1, 0.45, 0.1], (u - 0.35) / 0.65)),
        glow: true, opacity: (_p, u) => 0.95 * (1 - u * 0.55), bones: [`flame${i}`], density: 6, size: 0.55,
      },
    )
  })
  const b = buildBody({ bones, parts, blend: 0.02 }, blobs, 31)
  return { blobs: b.blobs, skin: b.skin, skeleton: b.skeleton }
}

/**
 * What flame `i` is doing at time `t`: its `height` (about 0.75 to 1.15 of its rest height), how far it leans
 * (radians, about x and about z) and how bright it burns (about 0.8 to 1.1). Slow breathing with quick flutters on
 * top, each flame on its own rhythm. With `calm` it burns steady.
 */
export function flameAt(t: number, i: number, calm = false): { height: number; lean: [number, number]; bright: number } {
  if (calm) return { height: 1, lean: [0, 0], bright: 0.95 }
  const a = i * 2.39996, b = i * 1.1
  const breathe = Math.sin(t * 1.3 + a) * 0.5 + Math.sin(t * 2.9 + b * 3) * 0.5
  const flutter = Math.sin(t * 13.1 + a * 2) * 0.5 + Math.sin(t * 22.7 + b * 5) * 0.3 + Math.sin(t * 37 + a) * 0.2
  const height = 0.95 + 0.1 * breathe + 0.09 * flutter
  // a draft now and then bends them all the same way, each a little late
  const draft = Math.max(0, Math.sin(t * 0.37 - i * 0.25)) ** 6
  return {
    height,
    lean: [0.1 * Math.sin(t * 4.3 + a) + 0.06 * Math.sin(t * 9.7 + b) + 0.3 * draft, 0.08 * Math.sin(t * 5.1 + b * 2) + 0.05 * Math.sin(t * 11.3 + a)],
    bright: 0.94 + 0.1 * breathe + 0.07 * flutter - 0.1 * draft,
  }
}

/** Poses every flame for time `t`. */
export function poseFlames(sk: Skeleton, t: number, calm = false) {
  for (let b = 1; b < sk.count; b++) {
    const f = flameAt(t, b - 1, calm)
    sk.size[b] = f.height
    sk.setRotation(b, mulQ(axisAngle([1, 0, 0], f.lean[0]), axisAngle([0, 0, 1], f.lean[1])))
  }
  sk.update()
}

/**
 * The flames' light at time `t`: each flame a small warm light as bright as it burns, gathered into
 * `CANDLE_LIGHTS` lights that cast shadows. Gathering keeps the light where the flames are (a group's light sits at
 * its brightness-weighted middle, so it shifts as they flutter) without spending a light on every candle.
 */
export function candleLights(wicks: Vec3[], t: number, calm = false): PointLight[] {
  const each: Want[] = wicks.map((w, i) => {
    const k = flameAt(t, i, calm).bright
    // a little over the flames and out toward the niche's mouth, so the light stands in open air
    return { kind: 'candle', position: [w[0], w[1] + 0.3, w[2] + 0.3], color: [1.3 * k, 0.62 * k, 0.2 * k], range: 2.4 }
  })
  const span = Math.max(...wicks.map((w) => w[0])) - Math.min(...wicks.map((w) => w[0]))
  return gather(each, CANDLE_LIGHTS, Math.max(0.2, span * 0.3)).map((l) => ({ position: l.position, color: l.color, range: l.range, shadow: true }))
}

/**
 * The flames themselves as the water sees them, for its glints: one small light in the middle of each flame. The
 * gathered lights above would mirror as two wide discs; the water mirrors eleven small flames, each drawn out
 * toward the eye by the ripples.
 */
export function candleGlints(wicks: Vec3[], t: number, calm = false): PointLight[] {
  return wicks.map((w, i) => {
    const f = flameAt(t, i, calm)
    return { position: [w[0], w[1] + FLAME_H * 0.5 * f.height, w[2]], color: [0.6 * f.bright, 0.33 * f.bright, 0.1 * f.bright], range: 1.8 }
  })
}
