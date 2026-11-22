import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { SNAIL_PROJECT } from '../../props/snail.ts'

/**
 * The giant snail with a house for a shell, made from props (docs/scenes-from-props.md): its land and its props are written in props/snail.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const SNAIL: SceneDoc = composeScene(SNAIL_PROJECT, madeProp)

export { SNAIL_PROJECT }
