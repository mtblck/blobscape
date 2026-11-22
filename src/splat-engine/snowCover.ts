import { Blobs, quatFacing } from '../splat-core/blobs.ts'
import { Skeleton, emptySkin } from './rig.ts'

/**
 * Snow that lies and builds up (Matt, 2026-11-21: snow and heavy snow should pile up over time and cover the ground).
 *
 * A layer of flat white blobs laid once over whatever stays put under a stretch of sky, found the way falling snow
 * finds where it lands (`ground`, a scene's `CompiledScene.ground`): the tops of the land, roofs, walls and rocks, on
 * faces no steeper than `STEEPEST`. Every blob has its turn to come (`rank`): flat, open ground first and in clumps
 * (value noise over a few cells), so snow starts as patches that spread and join. `pileSnow(cover, depth)` sets the
 * layer for a depth from 0 (none) to 1 (all of it lying, a little deeper than a blob is thick): a blob whose turn has
 * come grows from nothing, and the whole layer rises as it deepens. How deep it is, is the page's: snow builds up
 * over the time it falls (`pileStep`), which no scene's loop knows.
 */

/** The steepest face snow lies on: the up part of its normal. */
export const STEEPEST = 0.55
/** The depth over which a blob grows from nothing to its full size once its turn has come. */
const GROW = 0.3
/** How deep the layer is at depth 1, in blob sizes. */
const DEEPEST = 0.9

export interface SnowCover {
  blobs: Blobs
  skin: ReturnType<typeof emptySkin>
  skeleton: Skeleton
  /** Drawn as blobs while the stage draws blocks, beside the weather. */
  soft: true
  weather: true
  lies: true
  /** When each blob comes, 0 to 1: at depth `rank · (1 − GROW)` it starts to grow. */
  rank: Float32Array
  /** Where each blob lies on the surface, x y z, and the surface's normal there. */
  at: Float32Array
  normal: Float32Array
  /** Each blob's full radius. */
  size: Float32Array
  /** The depth the layer was last set for. */
  depth: number
}

/** A number from 0 to 1 for two whole numbers, the same everywhere. */
function hash2(i: number, j: number): number {
  let x = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1)
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b)
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

/** Smooth noise from 0 to 1 over cells of side 1. */
function valueNoise(x: number, z: number): number {
  const i = Math.floor(x), j = Math.floor(z), u = x - i, w = z - j
  const su = u * u * (3 - 2 * u), sw = w * w * (3 - 2 * w)
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1)
  return (a * (1 - su) + b * su) * (1 - sw) + (c * (1 - su) + d * su) * sw
}

/**
 * Lays the layer over a disc of `radius` round (`x`, `z`) at `spacing` between blobs. `ground(x, z, top, bottom)` is
 * where something falling from `top` comes to rest (`bottom` where it meets nothing); `dry(x, y, z)` leaves out a
 * spot (water: snow falling on it melts). `sun` (toward the light) shades faces turned away a little blue.
 */
export function makeSnowCover(
  ground: (x: number, z: number, top: number, bottom: number) => number,
  { x, z, radius, top, bottom, spacing, sun = [0.4, 0.8, 0.4], dry, warm = [] }: {
    x: number; z: number; radius: number; top: number; bottom: number; spacing: number
    sun?: readonly number[]; dry?: (x: number, y: number, z: number) => boolean
    /** Fires and lamps: snow does not lie within `reach` of one (it melts as it lands). */
    warm?: readonly { at: readonly number[]; reach: number }[]
  },
): SnowCover {
  const blobs = new Blobs(1024)
  const rank: number[] = [], at: number[] = [], normal: number[] = [], size: number[] = []
  const sl = Math.hypot(sun[0], sun[1], sun[2]) || 1
  const n = Math.ceil(radius / spacing), clump = spacing * 7, r = spacing * 1.05
  const height = (px: number, pz: number) => ground(px, pz, top, bottom)
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    // a little off the grid, so the layer has no rows
    const px = x + (i + (hash2(i, j) - 0.5) * 0.6) * spacing, pz = z + (j + (hash2(j + 7, i) - 0.5) * 0.6) * spacing
    if (Math.hypot(px - x, pz - z) > radius) continue
    const y = height(px, pz)
    if (!(y > bottom + 1e-6) || dry?.(px, y, pz)) continue
    if (warm.some((w) => Math.hypot(px - w.at[0], y - w.at[1], pz - w.at[2]) < w.reach)) continue
    // the face's slope from the ground round it; a step bigger than a blob is an edge, where snow does not lie flat
    const e = spacing * 0.5
    const dx = height(px + e, pz) - height(px - e, pz), dz = height(px, pz + e) - height(px, pz - e)
    if (Math.abs(dx) > spacing * 1.5 || Math.abs(dz) > spacing * 1.5) continue
    const nx = -dx / (2 * e), nz = -dz / (2 * e), nl = Math.hypot(nx, 1, nz)
    const up = 1 / nl
    if (up < STEEPEST) continue
    const facing: [number, number, number] = [nx / nl, up, nz / nl]
    // flat ground first, in clumps that spread and join
    const flat = (up - STEEPEST) / (1 - STEEPEST)
    rank.push(Math.min(0.999, 0.55 * valueNoise(px / clump, pz / clump) + 0.25 * (1 - flat) + 0.2 * hash2(i + 101, j - 33)))
    at.push(px, y, pz)
    normal.push(...facing)
    const s = r * (0.85 + 0.3 * hash2(i - 5, j + 11))
    size.push(s)
    // white, a shade blue on faces turned from the sun
    const lit = Math.max(0, (facing[0] * sun[0] + facing[1] * sun[1] + facing[2] * sun[2]) / sl)
    const b = 0.8 + 0.2 * lit
    blobs.push({ center: [px, y, pz], scale: [0, 0, 0], quat: quatFacing(facing), color: [0.9 * b, 0.93 * b, Math.min(1, 1.0 * b + 0.02)], opacity: 0.95 })
  }
  const skeleton = new Skeleton([{ name: 'snow', parent: -1, head: [x, 0, z] }])
  const skin = emptySkin(blobs.count)
  for (let k = 0; k < blobs.count; k++) skin.weights[k * 4] = 1
  const cover: SnowCover = {
    blobs, skin, skeleton, soft: true, weather: true, lies: true,
    rank: Float32Array.from(rank), at: Float32Array.from(at), normal: Float32Array.from(normal), size: Float32Array.from(size), depth: NaN,
  }
  pileSnow(cover, 0)
  return cover
}

/** Sets the layer for a depth from 0 to 1. Returns whether anything changed (then hand it to `Stage.reshape`). */
export function pileSnow(cover: SnowCover, depth: number): boolean {
  const d = Math.max(0, Math.min(1, depth))
  if (d === cover.depth) return false
  cover.depth = d
  const { blobs, rank, at, normal, size } = cover
  for (let k = 0; k < rank.length; k++) {
    const grown = Math.max(0, Math.min(1, (d - rank[k] * (1 - GROW)) / GROW))
    const s = size[k] * grown, thick = size[k] * 0.22 * grown
    // it lies on the surface, and the layer rises as it deepens
    const lift = thick * 0.5 + size[k] * DEEPEST * 0.3 * d * grown
    for (let c = 0; c < 3; c++) blobs.center[k * 3 + c] = at[k * 3 + c] + normal[k * 3 + c] * lift
    blobs.scale[k * 3] = s; blobs.scale[k * 3 + 1] = s; blobs.scale[k * 3 + 2] = thick
  }
  return true
}

/** How far round a light snow melts, as a share of its range at a strength of one: a campfire clears the ground round it, a lamp its own cap. */
export const MELT_SHARE = 0.3

/** The places a scene's lights keep clear of snow: warm ones only (more red than blue), by how strong they are. */
export function warmthOf(lights: readonly { position: readonly number[]; color: readonly number[]; range: number }[]) {
  return lights.filter((l) => l.color[0] > l.color[2]).map((l) => ({ at: l.position, reach: l.range * MELT_SHARE * Math.min(2, Math.max(...l.color)) }))
}

/** How fast the snow lying builds up: a whole cover in about this many seconds of heavy snow. */
export const PILE_SECONDS = 45
/** How many seconds snow takes to melt away once none falls. */
export const MELT_SECONDS = 90

/**
 * The most a snowfall of `snow` (0 to 1) lays: heavy snow covers everything, a lighter fall only dusts
 * (Matt, 2026-11-21: light snow covered too quickly).
 */
export const pileMost = (snow: number) => Math.min(1, snow * 1.5)

/**
 * The depth after `dt` seconds more of `snow` (the share of the swarm falling, 0 to 1): it builds by the square of
 * how much falls, so light snow (0.4) lays about a sixth as fast as heavy, up to `pileMost`; above that, and when
 * none falls, it melts.
 */
export function pileStep(depth: number, snow: number, dt: number): number {
  const most = snow > 0.01 ? pileMost(snow) : 0
  const next = depth < most ? Math.min(most, depth + (snow * snow * dt) / PILE_SECONDS) : Math.max(most, depth - dt / MELT_SECONDS)
  return Math.max(0, Math.min(1, next))
}
