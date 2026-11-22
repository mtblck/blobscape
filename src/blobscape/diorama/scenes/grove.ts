import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { GROVE_PROJECT } from '../../props/grove.ts'

/**
 * The lantern grove in the snow, made from props (docs/scenes-from-props.md): its land and its props are written in props/grove.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const GROVE: SceneDoc = composeScene(GROVE_PROJECT, madeProp)

export { GROVE_PROJECT }
