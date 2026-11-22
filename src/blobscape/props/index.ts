import type { PropDoc } from '../../splat-engine/project.ts'
import { KOI_POND } from '../diorama/scenes/koi.ts'
import { BAMBOO, CHERRY, CRACKED_STONE, IRIS_LEAVES, LILY_PAD, LILY_PAD_FLOWER, MOSSY_STONE, PINK_IRIS, SNOW_LANTERN, STEPPING_POST, STONE_SLAB, TALL_LANTERN, WHITE_IRIS, type MadeProp } from './garden.ts'

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
]

const BY_ID = new Map(MADE.map((m) => [m.id, m]))

/** A prop or land written on its own, by its id. */
export const madeProp = (id: string): PropDoc | undefined => BY_ID.get(id)?.prop
