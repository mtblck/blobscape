import type { Vec3 } from '../../splat-core/blobs.ts'
import { Y, set } from '../../splat-engine/posing.ts'
import type { Bone, Skeleton } from '../../splat-engine/rig.ts'
import { smooth, sculptToCount, type SculptSpec, type Sculpted } from '../../splat-engine/sculpt.ts'
import type { SwingSpec } from '../../splat-engine/swing.ts'
import { cone, ellipsoid, sphere } from '../../splat-engine/voxel.ts'

/**
 * Lesson 22's slug: the smallest creature the engine makes, two shapes on two
 * bones, written so the page can print the very code that made it. Pure and
 * tested.
 */

/** Which bones the skin listens to: the body alone, or the body and the tail. */
export type Listens = 'body' | 'both'

export interface SlugOptions {
  /** How far a blob's weight spreads from a bone, in the slug's units: 0 is a hard line between bones. */
  blend: number
  listens: Listens
  count: number
}

export const SLUG_START: SlugOptions = { blend: 0.02, listens: 'body', count: 6000 }
/** The blob counts on the chips. */
export const SLUG_COUNTS = [2000, 6000, 15000]

export const SLUG_BONES: Bone[] = [
  { name: 'body', parent: -1, head: [0, 0.3, -0.1], tail: [0, 0.3, 0.55] },
  { name: 'tail', parent: 0, head: [0, 0.3, -0.1], tail: [0, 0.22, -0.95] },
]

const SKIN: Vec3 = [0.93, 0.62, 0.28]
const BELLY: Vec3 = [1, 0.86, 0.6]

/** The slug's shapes and bones, as `sculptToCount` wants them. */
export function slugSpec(o: SlugOptions): SculptSpec {
  const bones = o.listens === 'both' ? ['body', 'tail'] : ['body']
  return {
    bones: SLUG_BONES,
    blend: o.blend,
    parts: [
      { shape: smooth(0.12, ellipsoid([0, 0.3, 0.15], [0.22, 0.2, 0.42]), sphere([0, 0.42, 0.5], 0.17), cone([0, 0.3, -0.1], [0, 0.22, -0.95], 0.17, 0.03)), color: (_p, n) => (n[1] < -0.3 ? BELLY : SKIN), bones },
      { shape: sphere([0.08, 0.5, 0.62], 0.04), color: [0.1, 0.08, 0.1], bones: ['body'] },
      { shape: sphere([-0.08, 0.5, 0.62], 0.04), color: [0.1, 0.08, 0.1], bones: ['body'] },
    ],
  }
}

export function makeSlug(o: SlugOptions): Sculpted {
  return sculptToCount(() => slugSpec(o), o.count)
}

/** Turns the tail `wag` radians to the side (and the whole slug `heading` radians about the upright). */
export function poseSlug(sk: Skeleton, wag: number, heading = 0) {
  sk.reset()
  set(sk, 'body', Y, heading)
  set(sk, 'tail', Y, wag)
  sk.update()
}

/** The slug turning one way and the other, its tail held straight: what the tail swings behind. */
export function turning(sk: Skeleton, t: number, wag = 0) {
  poseSlug(sk, wag, 0.9 * Math.sin(t * 2.4))
}

export const SLUG_SWING: SwingSpec = { parts: 'tail', chains: [{ bones: ['tail'], follow: 0.012 }], damping: 3 }

/** Where each blob's center is in the slug's pose now (weights times each bone's skin matrix). */
export function posedCenters(c: Sculpted, out = new Float32Array(c.blobs.count * 3)) {
  const m = c.skeleton.matrix, { joints, weights } = c.skin, p = c.blobs.center
  for (let i = 0; i < c.blobs.count; i++) {
    let x = 0, y = 0, z = 0
    for (let k = 0; k < 4; k++) {
      const w = weights[i * 4 + k]
      if (!w) continue
      const o = joints[i * 4 + k] * 16, px = p[i * 3], py = p[i * 3 + 1], pz = p[i * 3 + 2]
      x += w * (m[o] * px + m[o + 4] * py + m[o + 8] * pz + m[o + 12])
      y += w * (m[o + 1] * px + m[o + 5] * py + m[o + 9] * pz + m[o + 13])
      z += w * (m[o + 2] * px + m[o + 6] * py + m[o + 10] * pz + m[o + 14])
    }
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z
  }
  return out
}

/**
 * How far the skin tears where the tail meets the body, as posed now: of each blob near the join and its nearest
 * neighbors at rest, the most any pair has pulled apart, over the grid spacing. Near 0 the skin holds; past 1 a gap
 * a blob wide has opened.
 */
export function tear(c: Sculpted): number {
  const p = c.blobs.center, n = c.blobs.count, at = posedCenters(c)
  const near: number[] = []
  for (let i = 0; i < n; i++) if (Math.abs(p[i * 3 + 2] + 0.1) < 0.18) near.push(i)
  const reach = c.spacing * 1.5
  let most = 0
  for (const i of near) {
    for (const j of near) {
      if (j <= i) continue
      const dx = p[i * 3] - p[j * 3], dy = p[i * 3 + 1] - p[j * 3 + 1], dz = p[i * 3 + 2] - p[j * 3 + 2]
      const rest = Math.hypot(dx, dy, dz)
      if (rest > reach) continue
      const now = Math.hypot(at[i * 3] - at[j * 3], at[i * 3 + 1] - at[j * 3 + 1], at[i * 3 + 2] - at[j * 3 + 2])
      most = Math.max(most, now - rest)
    }
  }
  return most / c.spacing
}

/** How far the tail's tip has moved off the body's line, in the slug's units (0 while it follows the body). */
export function tipOff(sk: Skeleton): number {
  const t = sk.index('tail'), b = sk.index('body'), tip = SLUG_BONES[1].tail!
  const m = sk.matrix
  const at = (o: number): Vec3 => [m[o] * tip[0] + m[o + 4] * tip[1] + m[o + 8] * tip[2] + m[o + 12], 0, m[o + 2] * tip[0] + m[o + 6] * tip[1] + m[o + 10] * tip[2] + m[o + 14]]
  const a = at(t * 16), z = at(b * 16)
  return Math.hypot(a[0] - z[0], a[2] - z[2])
}

const num = (v: number) => (Math.round(v * 1000) / 1000).toString()

/** The code that makes this slug with the package, as a reader would write it. */
export function slugCode(o: SlugOptions, swing: boolean): string {
  const bones = o.listens === 'both' ? "['body', 'tail']" : "['body']"
  return `import { Stage, sculptToCount, smooth, ellipsoid, sphere, cone, set, Y${swing ? ', Swing' : ''}, type Bone } from '@blobscape/engine'

// two bones: the body, and the tail hanging from it
const bones: Bone[] = [
  { name: 'body', parent: -1, head: [0, 0.3, -0.1], tail: [0, 0.3, 0.55] },
  { name: 'tail', parent: 0, head: [0, 0.3, -0.1], tail: [0, 0.22, -0.95] },
]

// shapes on a grid: every cell on a surface becomes one blob, tied to the bones its part lists
const slug = sculptToCount(() => ({
  bones,
  blend: ${num(o.blend)}, // how far a blob's weight spreads from a bone
  parts: [
    // the skin: body, head and tail as one shape
    { shape: smooth(0.12, ellipsoid([0, 0.3, 0.15], [0.22, 0.2, 0.42]), sphere([0, 0.42, 0.5], 0.17), cone([0, 0.3, -0.1], [0, 0.22, -0.95], 0.17, 0.03)), color: [0.93, 0.62, 0.28], bones: ${bones} },
    // the eyes
    { shape: sphere([0.08, 0.5, 0.62], 0.04), color: [0.1, 0.08, 0.1], bones: ['body'] },
    { shape: sphere([-0.08, 0.5, 0.62], 0.04), color: [0.1, 0.08, 0.1], bones: ['body'] },
  ],
}), ${o.count})

const stage = await Stage.start(document.querySelector('canvas')!)
stage.setActor(slug)
stage.orbit = { target: [0, 0.3, 0], distance: 3, azimuth: 60, elevation: 25 }
// a pose is bones turned, from the time
stage.setPoser((sk, t) => {
  sk.reset()
  set(sk, 'body', Y, 0.9 * Math.sin(t * 2.4))
  sk.update()
})
${swing ? `// the tail swings after the body as it turns
stage.setSwing(new Swing(slug.skeleton, { parts: 'tail', chains: [{ bones: ['tail'], follow: 0.012 }], damping: 3 }))
` : ''}`
}
