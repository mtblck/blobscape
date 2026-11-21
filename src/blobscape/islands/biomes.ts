import type { Bed } from '../../splat-engine/erode.ts'
import type { SceneDoc, SpeckDoc } from '../../splat-engine/sceneDoc.ts'

/**
 * Biome recipes: what kind of place an island is, as data. A recipe names materials from the library
 * (materials.ts) and kinds of thing from things.ts, and says how many of each and where; `planIsland` (island.ts)
 * turns one and a seed into an island. A new biome is a new entry here.
 */

/** The kinds of thing a recipe can ask for (things.ts makes each). */
export type ThingKind = 'tree' | 'pine' | 'bush' | 'boulder' | 'flowers' | 'stump' | 'cactus' | 'stones' | 'tor' | 'hoodoos'

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

/**
 * A kind of place inside an island: a grove, a glade, a rocky rise. Each island has a few, spread over it, and the
 * populations it names crowd into it, so walking across one you pass from one kind of place to the next.
 */
export interface Patch {
  name: string
  /** The populations (by name) that gather here, and how strongly. */
  likes: Record<string, number>
  /** How far it reaches, least and most. */
  r: [number, number]
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
  /** The wildflowers that grow in bunches through its grass (bloom materials), commonest first. */
  wildflowers: string[]
  /** The shape of the land: how many hills, how high, how rough, how worn by water, and its beds of rock if it is terraced. */
  land: { hills: [number, number]; height: [number, number]; noise: number; drops: number; slump: number; beds?: Bed[] }
  /** What lives there. The first population listed is placed first, so it gets the best spots. */
  lives: Population[]
  /** The things that make the island a place: the seed picks two, set far apart. */
  landmarks: Population[]
  /** The kinds of place inside an island. */
  patches: Patch[]
  /** What drifts in its air: boxes are filled in by the island's size. */
  air: Pick<SpeckDoc, 'kind' | 'count' | 'colors' | 'land'>[]
  /** Small rocks that float beside it, least and most. */
  drifters: [number, number]
}

export const MEADOW: Biome = {
  id: 'meadow',
  name: 'Meadow',
  about: 'Rolling turf with oak groves and birch stands, flowers in the dips and old stones on the high ground',
  sky: ['#3f62a8', '#cfe6f5'],
  skyBetween: ['#6fa3d8', '#9cc4e8'],
  light: { from: [0.5, 0.75, 0.55], ambient: 0.5, shadow: 0.65 },
  ground: { top: 'meadow-turf', soil: 'loam', rock: ['granite', 'slate'], path: 'loam' },
  wildflowers: ['buttercup', 'daisy', 'poppy', 'bluebell'],
  land: { hills: [4, 7], height: [0.18, 0.55], noise: 0.06, drops: 12000, slump: 0.3 },
  lives: [
    { kind: 'tree', name: 'oak', plural: 'oaks', count: [6, 9], size: [0.8, 1.2], zone: [0.05, 0.85], made: { wood: ['oak'], leaf: ['oak-leaf'] }, high: 0.5 },
    { kind: 'tree', name: 'birch', plural: 'birches', count: [6, 8], size: [0.8, 1.15], zone: [0.2, 0.9], made: { wood: ['birch'], leaf: ['birch-leaf'] } },
    { kind: 'boulder', name: 'boulder', plural: 'boulders', count: [6, 9], size: [0.5, 1.2], zone: [0.1, 0.9], made: { rock: ['granite', 'slate'] }, high: 0.3 },
    { kind: 'bush', name: 'bush', plural: 'bushes', count: [7, 10], size: [0.5, 0.95], zone: [0.1, 0.92], made: { leaf: ['oak-leaf', 'birch-leaf'] } },
    { kind: 'flowers', name: 'patch of flowers', plural: 'patches of flowers', count: [10, 14], size: [0.8, 1.3], zone: [0.05, 0.95], made: { bloom: ['poppy', 'buttercup', 'daisy', 'bluebell'], leaf: ['birch-leaf'] }, high: -0.6 },
    { kind: 'stump', name: 'stump', plural: 'stumps', count: [2, 5], size: [0.7, 1], zone: [0.1, 0.85], made: { wood: ['oak'] } },
  ],
  landmarks: [
    { kind: 'stones', name: 'ring of standing stones', plural: 'rings of standing stones', count: [1, 1], size: [1.1, 1.4], zone: [0, 0.6], made: { rock: ['granite'] }, high: 1 },
    { kind: 'tree', name: 'great oak', plural: 'great oaks', count: [1, 1], size: [1.6, 1.9], zone: [0, 0.6], made: { wood: ['oak'], leaf: ['oak-leaf'] }, high: 1 },
    { kind: 'tor', name: 'granite tor', plural: 'granite tors', count: [1, 1], size: [1.1, 1.4], zone: [0.2, 0.7], made: { rock: ['granite'] }, high: 1 },
  ],
  patches: [
    { name: 'oak grove', likes: { oak: 2.5, bush: 1, stump: 1.5 }, r: [0.9, 1.3] },
    { name: 'birch stand', likes: { birch: 2.5, bush: 0.8 }, r: [0.8, 1.2] },
    { name: 'flower glade', likes: { 'patch of flowers': 2.5 }, r: [0.8, 1.2] },
    { name: 'stony rise', likes: { boulder: 2.5 }, r: [0.6, 1] },
  ],
  air: [
    { kind: 'dust', count: 70, colors: ['#fff3b0', '#f4f1e4'] },
    { kind: 'leaves', count: 30, colors: ['#9aae52', '#6c8a40'], land: true },
  ],
  drifters: [3, 6],
}

export const PINEWOOD: Biome = {
  id: 'pinewood',
  name: 'Pinewood',
  about: 'Stepped highland of pines and ferns, granite tors and heather on the ledges',
  sky: ['#34508c', '#c4d6ea'],
  skyBetween: ['#5871a3', '#7c93bb', '#a0b4d2'],
  light: { from: [-0.55, 0.65, 0.5], ambient: 0.48, shadow: 0.7 },
  ground: { top: 'alpine-turf', soil: 'loam', rock: ['granite', 'slate'], path: 'loam' },
  wildflowers: ['heather', 'bluebell', 'daisy'],
  land: { hills: [3, 5], height: [0.4, 0.85], noise: 0.05, drops: 9000, slump: 0.5, beds: [{ thick: 0.12, hard: 0.9 }, { thick: 0.16, hard: 0.3 }, { thick: 0.1, hard: 0.85 }, { thick: 0.18, hard: 0.35 }] },
  lives: [
    { kind: 'pine', name: 'pine', plural: 'pines', count: [13, 18], size: [0.75, 1.3], zone: [0.05, 0.9], made: { wood: ['pine'], leaf: ['pine-needle'] }, high: 0.3 },
    { kind: 'boulder', name: 'boulder', plural: 'boulders', count: [6, 9], size: [0.5, 1.2], zone: [0.1, 0.9], made: { rock: ['granite'] }, high: 0.4 },
    { kind: 'bush', name: 'clump of ferns', plural: 'clumps of ferns', count: [7, 10], size: [0.5, 0.85], zone: [0.1, 0.92], made: { leaf: ['fern'] }, high: -0.4 },
    { kind: 'flowers', name: 'patch of heather', plural: 'patches of heather', count: [8, 11], size: [0.8, 1.2], zone: [0.1, 0.95], made: { bloom: ['heather'], leaf: ['fern'] }, high: 0.6 },
    { kind: 'stump', name: 'stump', plural: 'stumps', count: [3, 6], size: [0.7, 1], zone: [0.1, 0.85], made: { wood: ['pine'] } },
  ],
  landmarks: [
    { kind: 'tor', name: 'granite tor', plural: 'granite tors', count: [1, 1], size: [1.2, 1.5], zone: [0, 0.6], made: { rock: ['granite'] }, high: 1 },
    { kind: 'pine', name: 'great pine', plural: 'great pines', count: [1, 1], size: [1.8, 2.1], zone: [0, 0.6], made: { wood: ['pine'], leaf: ['pine-needle'] }, high: 1 },
    { kind: 'stones', name: 'ring of standing stones', plural: 'rings of standing stones', count: [1, 1], size: [1.1, 1.3], zone: [0.2, 0.7], made: { rock: ['slate'] }, high: 0.8 },
  ],
  patches: [
    { name: 'dark pinewood', likes: { pine: 2.5, 'clump of ferns': 1.2, stump: 1 }, r: [1, 1.4] },
    { name: 'heather moor', likes: { 'patch of heather': 2.5, boulder: 0.8 }, r: [0.9, 1.3] },
    { name: 'boulder field', likes: { boulder: 2.5 }, r: [0.6, 1] },
  ],
  air: [
    { kind: 'dust', count: 50, colors: ['#e8eef8', '#c8d8f0'] },
    { kind: 'leaves', count: 20, colors: ['#2f7058', '#1a4a40'], land: true },
  ],
  drifters: [3, 6],
}

export const MESA: Biome = {
  id: 'mesa',
  name: 'Mesa',
  about: 'Layered red rock and dry grass, cactus flats, sagebrush and hoodoos',
  sky: ['#4a5aa8', '#f4d8b0'],
  skyBetween: ['#7a86c0', '#c8b8c0'],
  light: { from: [0.6, 0.7, 0.4], ambient: 0.52, shadow: 0.7 },
  ground: { top: 'dry-turf', soil: 'red-earth', rock: ['sandstone'], path: 'sand' },
  wildflowers: ['buttercup', 'cactus-flower', 'daisy'],
  land: { hills: [3, 5], height: [0.3, 0.75], noise: 0.04, drops: 14000, slump: 0.25, beds: [{ thick: 0.1, hard: 0.95 }, { thick: 0.2, hard: 0.2 }, { thick: 0.08, hard: 0.9 }, { thick: 0.16, hard: 0.25 }] },
  lives: [
    { kind: 'cactus', name: 'cactus', plural: 'cacti', count: [11, 15], size: [0.7, 1.4], zone: [0.05, 0.9], made: { leaf: ['cactus'] }, high: -0.2 },
    { kind: 'bush', name: 'sagebrush', plural: 'sagebrushes', count: [9, 13], size: [0.45, 0.8], zone: [0.05, 0.95], made: { leaf: ['sage'] } },
    { kind: 'boulder', name: 'boulder', plural: 'boulders', count: [7, 10], size: [0.5, 1.3], zone: [0.1, 0.9], made: { rock: ['sandstone'] }, high: 0.5 },
    { kind: 'flowers', name: 'patch of cactus flowers', plural: 'patches of cactus flowers', count: [8, 12], size: [0.8, 1.1], zone: [0.1, 0.95], made: { bloom: ['cactus-flower', 'buttercup'], leaf: ['sage'] }, high: -0.6 },
    { kind: 'tree', name: 'juniper', plural: 'junipers', count: [3, 6], size: [0.8, 1.2], zone: [0.1, 0.85], made: { wood: ['driftwood'], leaf: ['sage'] } },
    { kind: 'stump', name: 'stump', plural: 'stumps', count: [2, 4], size: [0.7, 1], zone: [0.1, 0.85], made: { wood: ['driftwood'] } },
  ],
  landmarks: [
    { kind: 'hoodoos', name: 'stand of hoodoos', plural: 'stands of hoodoos', count: [1, 1], size: [1.2, 1.5], zone: [0, 0.6], made: { rock: ['sandstone'] }, high: 0.8 },
    { kind: 'tor', name: 'stack of red rock', plural: 'stacks of red rock', count: [1, 1], size: [1.1, 1.4], zone: [0, 0.6], made: { rock: ['sandstone'] }, high: 1 },
  ],
  patches: [
    { name: 'cactus flat', likes: { cactus: 2.5, 'patch of cactus flowers': 1 }, r: [1, 1.4] },
    { name: 'sage scrub', likes: { sagebrush: 2.5 }, r: [0.9, 1.3] },
    { name: 'rockfall', likes: { boulder: 2.5, juniper: 1 }, r: [0.6, 1] },
  ],
  air: [
    { kind: 'dust', count: 80, colors: ['#f4d8b0', '#d8b07a'] },
  ],
  drifters: [3, 6],
}

export const BIOMES: Biome[] = [MEADOW, PINEWOOD, MESA]

/** A biome by its id, the meadow when it names none we have. */
export const biomeOf = (id: string | null | undefined): Biome => BIOMES.find((b) => b.id === id) ?? MEADOW
