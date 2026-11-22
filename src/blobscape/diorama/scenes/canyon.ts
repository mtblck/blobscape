import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { CANYON_PROJECT } from '../../props/canyon.ts'

/**
 * The desert canyon at sunset, made from props (docs/scenes-from-props.md): its land and its props are written in props/canyon.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const CANYON: SceneDoc = composeScene(CANYON_PROJECT, madeProp)

export { CANYON_PROJECT }
