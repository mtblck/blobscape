import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { OWL_PROJECT } from '../../props/owl.ts'

/**
 * The owl and its cauldron, made from props (docs/scenes-from-props.md): its land and its props are written in props/owl.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const OWL: SceneDoc = composeScene(OWL_PROJECT, madeProp)

export { OWL_PROJECT }
