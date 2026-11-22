import type { PropPick } from '../../splat-engine/project.ts'

/**
 * Which parts of a Diorama scene make which prop for Scene Creator (docs/scene-editor-plan.md): the start of
 * its library. A scene's parts are listed by their place in its description, so a pick by part number must follow
 * the description when it changes; `picks.test.ts` holds that every pick still takes something and that a scene
 * split into its land and props cuts as it did whole.
 */

/**
 * Turkey Run (scenes/turkey.ts): the giant turkey and the cook, each with the dust its feet kick up, and from along
 * the road the billboard, the mailbox, the haystack and two trees, which stand still instead of going by.
 */
export const TURKEY_PICKS: PropPick[] = [
  { name: 'Giant turkey', bones: ['turkey', 'dustT0', 'dustT1', 'dustT2', 'feather0', 'feather1', 'feather2', 'feather3'] },
  { name: 'Cook', bones: ['cook', 'dustC0', 'dustC1'] },
  { name: 'Billboard', bones: ['by11'], drop: ['pass'] },
  { name: 'Mailbox', bones: ['by20'], drop: ['pass'] },
  { name: 'Roadside haystack', bones: ['by10'], drop: ['pass'] },
  { name: 'Roadside tree', bones: ['by8'], drop: ['pass'] },
  { name: 'Second roadside tree', bones: ['by9'], drop: ['pass'] },
]

const SPARKS = Array.from({ length: 56 }, (_, i) => `spark${i}`)

/**
 * The henge (scenes/henge.ts): the white witch standing (her coming and going left behind) and the magic circle
 * turning on the ground with its blue light always on. Her sparks are lifted out too, so the turf is left bare.
 */
export const HENGE_PICKS: PropPick[] = [
  { name: 'Magic circle', bones: ['ringA', 'star', 'ringB'], drop: ['during'], lights: [0] },
  { name: 'White witch', bones: ['wiz'], drop: ['during'], lights: [] },
  { name: 'Sparks', bones: SPARKS, lights: [] },
]

/** The henge's witch as she is in the scene: she arrives in a burst of sparks, waves her wand with two flashes, and goes. */
export const WITCH_IN_SPARKS_PICKS: PropPick[] = [
  { name: 'White witch, coming and going', bones: ['wiz', ...SPARKS], lights: [1, 2] },
]

