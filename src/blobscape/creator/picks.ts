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

/** Turkey Run (scenes/turkey.ts): the giant turkey and the cook, each with the dust its feet kick up. */
export const TURKEY_PICKS: PropPick[] = [
  { name: 'Giant turkey', bones: ['turkey', 'dustT0', 'dustT1', 'dustT2', 'feather0', 'feather1', 'feather2', 'feather3'] },
  { name: 'Cook', bones: ['cook', 'dustC0', 'dustC1'] },
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
