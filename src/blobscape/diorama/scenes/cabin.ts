import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { CABIN_PROJECT } from '../../props/cabin.ts'

/**
 * The snowed-in cabin on a winter night, made from props (docs/scenes-from-props.md): its land and its props are written in props/cabin.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const CABIN: SceneDoc = composeScene(CABIN_PROJECT, madeProp)

export { CABIN_PROJECT }
