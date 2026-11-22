import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { WINDMILL_PROJECT } from '../../props/farm.ts'

/**
 * The windmill on its farm, made from props (docs/scenes-from-props.md): its land and its props are written in props/farm.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const WINDMILL: SceneDoc = composeScene(WINDMILL_PROJECT, madeProp)

export { WINDMILL_PROJECT }
