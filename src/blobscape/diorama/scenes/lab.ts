import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { LAB_PROJECT } from '../../props/lab.ts'

/**
 * The sprout lab at night, made from props (docs/scenes-from-props.md): its land and its props are written in props/lab.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const LAB: SceneDoc = composeScene(LAB_PROJECT, madeProp)

export { LAB_PROJECT }
