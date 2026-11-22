import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { HAND_PROJECT } from '../../props/hand.ts'

/**
 * The giant stone hand in a desert ruin, made from props (docs/scenes-from-props.md): its land and its props are written in props/hand.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const HAND: SceneDoc = composeScene(HAND_PROJECT, madeProp)

export { HAND_PROJECT }
