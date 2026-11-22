import type { PropDoc } from '../../splat-engine/project.ts'
import { KOI_POND } from '../diorama/scenes/koi.ts'
import { BAMBOO, CHERRY, CRACKED_STONE, IRIS_LEAVES, LILY_PAD, LILY_PAD_FLOWER, MOSSY_STONE, PINK_IRIS, SNOW_LANTERN, STEPPING_POST, STONE_SLAB, TALL_LANTERN, WHITE_IRIS, type MadeProp } from './garden.ts'

import { CAVE_MADE } from './cave.ts'
import { CAVE_ICE_MADE } from './cave-ice.ts'
import { CANYON_MADE } from './canyon.ts'
import { CABIN_MADE } from './cabin.ts'
import { ISLES_MADE } from './isles.ts'
import { HARVEST_MADE } from './harvest.ts'
import { RUIN_MADE } from './ruin.ts'
import { HUT_MADE } from './hut.ts'
import { GROVE_MADE } from './grove.ts'
import { LAB_MADE } from './lab.ts'
import { WINDOW_MADE } from './window.ts'
import { SPIDER_MADE } from './spider.ts'
import { OCTOPUS_MADE } from './octopus.ts'
import { CROC_MADE } from './croc.ts'
import { REEF_MADE } from './reef.ts'
import { SNAIL_MADE } from './snail.ts'
import { OWL_MADE } from './owl.ts'
import { HAND_MADE } from './hand.ts'
import { FOREST_MADE } from './forest.ts'
import { CAMP_MADE } from './camp.ts'
import { FARM_MADE } from './farm.ts'
import { LIGHTHOUSE_MADE } from './lighthouse.ts'

export type { MadeProp } from './garden.ts'

/**
 * Props and lands written on their own, the library's pieces first (docs/scenes-from-props.md): Scene Creator lists
 * them, and a scene made from props (`composeScene`) names them by id, so a change here reaches every scene that sets
 * one down. New pieces go here, not into a scene.
 */
export const MADE: MadeProp[] = [
  { id: 'koi-pond', tags: ['grassy', 'pond'], kind: 'land', about: 'A koi pond in a moss garden: banks of moss and stone round still water, with five koi circling', prop: KOI_POND },
  { id: 'tall-stone-lantern', tags: ['lamp', 'rock'], kind: 'prop', group: 'buildings', about: 'A tall stone garden lantern whose light comes on when it gets dark', prop: TALL_LANTERN },
  { id: 'snow-lantern', tags: ['lamp', 'rock'], kind: 'prop', group: 'buildings', about: 'A low snow-viewing lantern on three curved legs, lit when it gets dark', prop: SNOW_LANTERN },
  { id: 'cherry-tree', tags: ['tree', 'flower', 'leafy'], kind: 'prop', about: 'A cherry tree in full bloom, swaying, with fallen petals round its foot', prop: CHERRY },
  { id: 'bamboo', tags: ['plant', 'evergreen'], kind: 'prop', about: 'A tall stalk of bamboo with four leaves, swaying; set several down for a grove', prop: BAMBOO },
  { id: 'pink-iris', tags: ['flower', 'plant'], kind: 'prop', about: 'A pink iris in flower over its leaves', prop: PINK_IRIS },
  { id: 'white-iris', tags: ['flower', 'plant'], kind: 'prop', about: 'A white iris in flower over its leaves', prop: WHITE_IRIS },
  { id: 'iris-leaves', tags: ['plant'], kind: 'prop', about: 'A clump of iris leaves, not in flower', prop: IRIS_LEAVES },
  { id: 'lily-pad', tags: ['plant', 'floats'], kind: 'prop', about: 'A lily pad that floats on water and bobs', prop: LILY_PAD },
  { id: 'lily-pad-in-flower', tags: ['plant', 'flower', 'floats'], kind: 'prop', about: 'A lily pad with a water lily in flower, floating on water', prop: LILY_PAD_FLOWER },
  { id: 'mossy-stone', tags: ['rock'], kind: 'prop', about: 'A rough gray stone half sunk in the ground, moss in its hollows', prop: MOSSY_STONE },
  { id: 'cracked-stone', tags: ['rock'], kind: 'prop', about: 'A rough pale stone half sunk in the ground, with cracks', prop: CRACKED_STONE },
  { id: 'stepping-post', tags: ['rock'], kind: 'prop', about: 'A round stone post to step across water on', prop: STEPPING_POST },
  { id: 'stone-slab', tags: ['rock'], kind: 'prop', about: 'A low round slab of speckled stone', prop: STONE_SLAB },
  ...CAVE_MADE,
  ...CAVE_ICE_MADE,
  ...CANYON_MADE,
  ...CABIN_MADE,
  ...ISLES_MADE,
  ...HARVEST_MADE,
  ...RUIN_MADE,
  ...HUT_MADE,
  ...GROVE_MADE,
  ...LAB_MADE,
  ...WINDOW_MADE,
  ...SPIDER_MADE,
  ...OCTOPUS_MADE,
  ...CROC_MADE,
  ...REEF_MADE,
  ...SNAIL_MADE,
  ...OWL_MADE,
  ...HAND_MADE,
  ...FOREST_MADE,
  ...CAMP_MADE,
  ...LIGHTHOUSE_MADE,
  ...FARM_MADE,
]

const BY_ID = new Map(MADE.map((m) => [m.id, m]))

/** A prop or land written on its own, by its id. */
export const madeProp = (id: string): PropDoc | undefined => BY_ID.get(id)?.prop
