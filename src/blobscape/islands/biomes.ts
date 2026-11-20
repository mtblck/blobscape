import type { SceneDoc, SpeckDoc } from '../../splat-engine/sceneDoc.ts'

/**
 * Biome recipes: what kind of place an island is, as data. A recipe names materials from the library
 * (materials.ts) and kinds of thing from things.ts, and says how many of each and where; `planIsland` (island.ts)
 * turns one and a seed into an island. A new biome is a new entry here.
 */

/** The kinds of thing a recipe can ask for (things.ts makes each). */
export type ThingKind = 'tree' | 'bush' | 'boulder' | 'flowers' | 'stump' | 'stones'

/** One kind of thing living on an island. */
export interface Population {
  kind: ThingKind
  /** What a list calls one of them, and several. */
  name: string
  plural: string
  /** How many, least and most. */
  count: [number, number]
  /** How big, least and most: 1 is the thing's own size. */
  size: [number, number]
  /** How far from the middle it may stand, as shares of the way to the edge. */
  zone: [number, number]
  /** Material choices by what they are for (`wood`, `leaf`, `rock`, `bloom`): each thing takes one of each list by its own seed. */
  made: Record<string, string[]>
  /** Likes high ground (a tree on a knoll) or low (flowers in a dip): -1 to 1, 0 when left out. */
  high?: number
}

export interface Biome {
  id: string
  name: string
  /** One line for the page. */
  about: string
  /** The sky behind, top and bottom. */
  sky: [string, string]
  /** Colors between the two, for the palette: without them pixel art fills the middle of the sky with whatever is nearest. */
  skyBetween: string[]
  /** The baked sun. */
  light: NonNullable<SceneDoc['light']>
  /** The ground: its top, the earth at its broken edge, and the rock hanging under it (one of these by the seed). */
  ground: { top: string; soil: string; rock: string[]; path: string }
  /** The shape of the land: how many hills, how high, how rough, how worn by water. */
  land: { hills: [number, number]; height: [number, number]; noise: number; drops: number; slump: number }
  /** What lives there. The first population listed is placed first, so it gets the best spots. */
  lives: Population[]
  /** One thing that makes the island a place: picked by the seed. */
  landmarks: Population[]
  /** What drifts in its air: boxes are filled in by the island's size. */
  air: Pick<SpeckDoc, 'kind' | 'count' | 'colors' | 'land'>[]
  /** Small rocks that float beside it, least and most. */
  drifters: [number, number]
}

export const MEADOW: Biome = {
  id: 'meadow',
  name: 'Meadow',
  about: 'Rolling turf with oaks and birches, flowers in the dips and old stones on the high ground',
  sky: ['#3f62a8', '#cfe6f5'],
  skyBetween: ['#6fa3d8', '#9cc4e8'],
  light: { from: [0.5, 0.75, 0.55], ambient: 0.5, shadow: 0.65 },
  ground: { top: 'meadow-turf', soil: 'loam', rock: ['granite', 'slate'], path: 'loam' },
  land: { hills: [2, 4], height: [0.12, 0.34], noise: 0.05, drops: 5000, slump: 0.3 },
  lives: [
    { kind: 'tree', name: 'oak', plural: 'oaks', count: [2, 4], size: [0.8, 1.2], zone: [0.1, 0.85], made: { wood: ['oak'], leaf: ['oak-leaf'] }, high: 0.6 },
    { kind: 'tree', name: 'birch', plural: 'birches', count: [2, 4], size: [0.8, 1.15], zone: [0.3, 0.9], made: { wood: ['birch'], leaf: ['birch-leaf'] } },
    { kind: 'boulder', name: 'boulder', plural: 'boulders', count: [2, 4], size: [0.5, 1.1], zone: [0.2, 0.9], made: { rock: ['granite', 'slate'] } },
    { kind: 'bush', name: 'bush', plural: 'bushes', count: [3, 5], size: [0.5, 0.9], zone: [0.2, 0.9], made: { leaf: ['oak-leaf', 'birch-leaf'] } },
    { kind: 'flowers', name: 'patch of flowers', plural: 'patches of flowers', count: [4, 7], size: [0.8, 1.2], zone: [0.1, 0.95], made: { bloom: ['poppy', 'buttercup', 'daisy', 'bluebell'], leaf: ['birch-leaf'] }, high: -0.6 },
    { kind: 'stump', name: 'stump', plural: 'stumps', count: [0, 2], size: [0.7, 1], zone: [0.2, 0.8], made: { wood: ['oak'] } },
  ],
  landmarks: [
    { kind: 'stones', name: 'ring of standing stones', plural: 'rings of standing stones', count: [1, 1], size: [0.9, 1.1], zone: [0, 0.35], made: { rock: ['granite'] }, high: 1 },
    { kind: 'tree', name: 'great oak', plural: 'great oaks', count: [1, 1], size: [1.6, 1.9], zone: [0, 0.3], made: { wood: ['oak'], leaf: ['oak-leaf'] }, high: 1 },
  ],
  air: [
    { kind: 'dust', count: 36, colors: ['#fff3b0', '#f4f1e4'] },
    { kind: 'leaves', count: 14, colors: ['#9aae52', '#6c8a40'], land: true },
  ],
  drifters: [2, 4],
}

export const BIOMES: Biome[] = [MEADOW]

/** A biome by its id, the meadow when it names none we have. */
export const biomeOf = (id: string | null | undefined): Biome => BIOMES.find((b) => b.id === id) ?? MEADOW
