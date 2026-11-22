import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { BEE_PROJECT } from '../../props/forest.ts'

/**
 * The forest clearing where a giant bee visits a flower, made from props (docs/scenes-from-props.md): its land and its props are written in props/forest.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const BEE: SceneDoc = composeScene(BEE_PROJECT, madeProp)

export { BEE_PROJECT }
