import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { CAMPFIRE_PROJECT } from '../../props/camp.ts'

/**
 * The camp in a pine clearing, made from props (docs/scenes-from-props.md): its land and its props are written in props/camp.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const CAMPFIRE: SceneDoc = composeScene(CAMPFIRE_PROJECT, madeProp)

export { CAMPFIRE_PROJECT }
