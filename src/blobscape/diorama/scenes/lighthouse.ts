import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { LIGHTHOUSE_PROJECT } from '../../props/lighthouse.ts'

/**
 * The lighthouse on its rock, made from props (docs/scenes-from-props.md): its land and its props are written in props/lighthouse.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const LIGHTHOUSE: SceneDoc = composeScene(LIGHTHOUSE_PROJECT, madeProp)

export { LIGHTHOUSE_PROJECT }
