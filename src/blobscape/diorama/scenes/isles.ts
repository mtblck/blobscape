import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { ISLES_PROJECT } from '../../props/isles.ts'

/**
 * The sky islands adrift at night, made from props (docs/scenes-from-props.md): its land and its props are written in props/isles.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const ISLES: SceneDoc = composeScene(ISLES_PROJECT, madeProp)

export { ISLES_PROJECT }
