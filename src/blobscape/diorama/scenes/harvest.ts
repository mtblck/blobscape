import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { HARVEST_PROJECT } from '../../props/harvest.ts'

/**
 * The pumpkin watch under a huge moon, made from props (docs/scenes-from-props.md): its land and its props are written in props/harvest.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const HARVEST: SceneDoc = composeScene(HARVEST_PROJECT, madeProp)

export { HARVEST_PROJECT }
