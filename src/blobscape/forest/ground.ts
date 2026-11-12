import { Blobs, quatFacing, type Quat, type Vec3 } from '../../splat-core/blobs.ts'
import { mix, rng, spots, type Creature } from '../../splat-engine/body.ts'
import { Skeleton, emptySkin, mulQ, setWeights } from '../../splat-engine/rig.ts'
import type { Season } from './plants.ts'
import { HALF_WIDTH, TILE, pathHalf, pathX } from './world.ts'

/**
 * One tile of forest floor: grass lying flat, upright blades thickest along
 * the path's edges, a worn dirt path with pebbles, and, in autumn, fallen
 * leaves. Built for ring slot `slot` (z from slot·TILE), which the stage moves
 * on by whole periods of the path; one bone, since the ground never moves.
 */

const GRASS: Record<Season, Vec3[]> = {
  summer: [[0.2, 0.42, 0.14], [0.28, 0.5, 0.16], [0.16, 0.34, 0.12]],
  spring: [[0.28, 0.55, 0.2], [0.36, 0.62, 0.22], [0.22, 0.46, 0.16]],
  autumn: [[0.36, 0.42, 0.16], [0.5, 0.46, 0.18], [0.3, 0.34, 0.14]],
}
const DIRT: Vec3 = [0.55, 0.42, 0.28], DIRT_DARK: Vec3 = [0.36, 0.27, 0.18], PEBBLE: Vec3 = [0.6, 0.58, 0.55]
const LEAVES: Vec3[] = [[0.85, 0.4, 0.1], [0.9, 0.65, 0.15], [0.6, 0.22, 0.08]]

/** About how many blobs a tile gets at detail 1. */
export const GROUND_BLOBS = 6000

const up: Vec3 = [0, 1, 0]

export function makeGround(slot: number, detail: number, season: Season): Creature {
  const rand = rng(1000 + slot)
  const n = Math.max(600, Math.round(GROUND_BLOBS * detail))
  const blobs = new Blobs(n)
  const z0 = slot * TILE
  const pal = GRASS[season]
  // blob size grows as detail drops, so the floor stays covered
  const k = Math.sqrt(1 / Math.max(detail, 0.15))
  const lie = (p: Vec3, s: number, c: Vec3, o = 0.95) => {
    const a = rand() * Math.PI
    const q: Quat = [0, Math.sin(a / 2), 0, Math.cos(a / 2)]
    blobs.push({ centre: p, scale: [s, s * (0.6 + rand() * 0.4), s * 0.12], quat: mulQ(q, quatFacing(up)), colour: c, opacity: o })
  }
  const along = () => z0 - 0.1 + rand() * (TILE + 0.2)

  // grass lying flat, all over
  const flats = Math.round(n * 0.42)
  for (let i = 0; i < flats; i++) {
    const z = along(), mid = pathX(z), half = pathHalf(z)
    const x = mid + (rand() * 2 - 1) * HALF_WIDTH
    if (Math.abs(x - mid) < half - 0.1) { i--; continue }
    const p: Vec3 = [x, -0.005, z]
    const c = mix(mix(pal[0], pal[1], spots(p, 1.3, slot)), pal[2], 0.6 * spots(p, 3.1, 7))
    lie(p, (0.16 + rand() * 0.06) * k, shade(c, rand), 0.97)
  }
  // the path: lighter where it's worn in the middle, darker at the edges
  const dirt = Math.round(n * 0.26)
  for (let i = 0; i < dirt; i++) {
    const z = along(), mid = pathX(z), half = pathHalf(z)
    const across = (rand() * 2 - 1) * (half + 0.08)
    const p: Vec3 = [mid + across, 0, z]
    const edge = Math.abs(across) / half
    const c = mix(mix(DIRT, DIRT_DARK, 0.6 * edge * edge + 0.35 * spots(p, 6, 3)), [0.66, 0.55, 0.4], 0.25 * (1 - edge))
    lie(p, (0.09 + rand() * 0.05) * k, shade(c, rand))
  }
  // pebbles along the edges
  const pebbles = Math.round(n * 0.05)
  for (let i = 0; i < pebbles; i++) {
    const z = along(), mid = pathX(z), half = pathHalf(z)
    const side = rand() < 0.5 ? -1 : 1
    const p: Vec3 = [mid + side * (half - 0.1 + (rand() - 0.5) * 0.35), 0.015, z]
    const s = 0.02 + rand() * 0.025
    blobs.push({ centre: p, scale: [s * 1.3, s * 0.6, s], quat: [0, Math.sin(rand() * 3), 0, 1], colour: shade(mix(PEBBLE, [0.45, 0.43, 0.4], rand()), rand), opacity: 1 })
  }
  // blades standing up, thickest along the path, thinning out into the forest
  const blades = n - blobs.count - (season === 'autumn' ? Math.round(n * 0.04) : 0)
  for (let i = 0; i < blades; i++) {
    const z = along(), mid = pathX(z), half = pathHalf(z)
    const side = rand() < 0.5 ? -1 : 1
    const out = half - 0.05 + Math.pow(rand(), 2.2) * (HALF_WIDTH - half)
    const x = mid + side * out
    const h = (0.05 + rand() * 0.07) * (out < half + 1.2 ? 1.2 : 1)
    const lean = (rand() - 0.5) * 0.5, turn = rand() * Math.PI
    const q = mulQ([0, Math.sin(turn / 2), 0, Math.cos(turn / 2)], [Math.sin(lean / 2), 0, 0, Math.cos(lean / 2)])
    const tip = rand()
    const c = mix(mix(pal[1], [0.6, 0.7, 0.25], 0.35 * tip), pal[2], 0.3 * spots([x, 0, z], 3.1, 7))
    blobs.push({ centre: [x, h * 0.9, z], scale: [0.012 * k, h, 0.006 * k], quat: q, colour: shade(c, rand), opacity: 0.95 })
  }
  // fallen leaves, mostly on the path and its edges
  while (blobs.count < n) {
    const z = along(), mid = pathX(z), half = pathHalf(z)
    const p: Vec3 = [mid + (rand() * 2 - 1) * (half + 1.5), 0.01, z]
    lie(p, 0.04 + rand() * 0.03, LEAVES[Math.floor(rand() * LEAVES.length)], 1)
  }

  const skeleton = new Skeleton([{ name: 'ground', parent: -1, head: [0, 0, z0] }])
  const skin = emptySkin(blobs.count)
  for (let i = 0; i < blobs.count; i++) setWeights(skin, i, [[0, 1]])
  return { blobs, skin, skeleton }
}

function shade(c: Vec3, rand: () => number): Vec3 {
  const k = 0.85 + rand() * 0.25
  return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]
}

