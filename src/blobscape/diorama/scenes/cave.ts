import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { CAVE_PROJECT } from '../../props/cave-ice.ts'

/**
 * The crystal cave at night, made from props (docs/scenes-from-props.md): its land and its props are written in props/cave-ice.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const CAVE: SceneDoc = composeScene(CAVE_PROJECT, madeProp)

export { CAVE_PROJECT }
