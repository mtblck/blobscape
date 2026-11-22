import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { RUIN_PROJECT } from '../../props/ruin.ts'

/**
 * The ruined chapel at dusk, made from props (docs/scenes-from-props.md): its land and its props are written in props/ruin.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const RUIN: SceneDoc = composeScene(RUIN_PROJECT, madeProp)

export { RUIN_PROJECT }
