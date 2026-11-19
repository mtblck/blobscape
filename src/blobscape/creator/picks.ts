import type { PropPick } from '../../splat-engine/project.ts'

/**
 * Which parts of a Pixel Diorama scene make which prop for Scene Creator (docs/scene-editor-plan.md): the start of
 * its library. A scene's parts are listed by their place in its description, so a pick by part number must follow
 * the description when it changes; `picks.test.ts` holds that every pick still takes something and that a scene
 * split into its land and props cuts as it did whole.
 */

/** The windmill (scenes/windmill.ts): the mill with its sails, the three trees, the duck, two haystacks and three sheep. */
export const WINDMILL_PICKS: PropPick[] = [
  { name: 'Windmill', parts: [3, 4, 5, 6, 7, 8, 9, 10, 11], bones: ['sails'] },
  { name: 'Apple tree', bones: ['tree0'] },
  { name: 'Big apple tree', bones: ['tree1'] },
  { name: 'Small apple tree', bones: ['tree2'] },
  { name: 'Duck', bones: ['duck'] },
  { name: 'Haystack', parts: [30] },
  { name: 'Second haystack', parts: [31] },
  { name: 'Sheep', parts: [32, 33], bones: ['sheep0'] },
  { name: 'Second sheep', parts: [35, 36], bones: ['sheep1'] },
  { name: 'Third sheep', parts: [38, 39], bones: ['sheep2'] },
]

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

/** The lava dragon (scenes/dragon.ts): its body, wings and swaying neck; the pool's glow stays in the cave. Its body is sunk into the cave floor, so its foot is set at the floor. */
export const LAVA_DRAGON_PICKS: PropPick[] = [
  { name: 'Lava dragon', parts: Array.from({ length: 22 }, (_, i) => 27 + i), bones: ['lining', 'wingL', 'wingR', 'neck0'], lights: [], foot: [0, 0, -0.6] },
]

/** The lighthouse (scenes/lighthouse.ts): the tower with its turning lamp and beams, the cottage, three pines, the jetty, the boat and the buoy. Gulls, clouds and foam stay with the sea. */
export const LIGHTHOUSE_PICKS: PropPick[] = [
  { name: 'Lighthouse', parts: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], bones: ['lamp'] },
  { name: "Keeper's cottage", parts: [25, 26, 27, 28, 29, 30], bones: ['smoke0', 'smoke1', 'smoke2'] },
  { name: 'Tall pine', bones: ['tree0'] },
  { name: 'Pine', bones: ['tree1'] },
  { name: 'Small pine', bones: ['tree2'] },
  { name: 'Jetty', parts: [46, 47, 48, 49] },
  { name: 'Sailing boat', bones: ['boat'] },
  { name: 'Buoy', bones: ['buoy'] },
]

/** The lighthouse (scenes/lighthouse.ts): the tower with its turning lamp and beams, the cottage, three pines, the jetty, the boat and the buoy. Gulls, clouds and foam stay with the sea. */
export const LIGHTHOUSE_PICKS: PropPick[] = [
  { name: 'Lighthouse', parts: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], bones: ['lamp'] },
  { name: "Keeper's cottage", parts: [25, 26, 27, 28, 29, 30], bones: ['smoke0', 'smoke1', 'smoke2'] },
  { name: 'Tall pine', bones: ['tree0'] },
  { name: 'Pine', bones: ['tree1'] },
  { name: 'Small pine', bones: ['tree2'] },
  { name: 'Jetty', parts: [46, 47, 48, 49] },
  { name: 'Sailing boat', bones: ['boat'] },
  { name: 'Buoy', bones: ['buoy'] },
]
