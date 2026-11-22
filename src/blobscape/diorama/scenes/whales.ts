import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { WHALES_PROJECT } from '../../props/whales.ts'

/**
 * Space whales: a pod of whales swimming through space, made from props (docs/scenes-from-props.md): its land and its props are written in props/whales.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const WHALES: SceneDoc = composeScene(WHALES_PROJECT, madeProp)

export { WHALES_PROJECT }
