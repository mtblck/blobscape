import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { HUT_PROJECT } from '../../props/hut.ts'

/**
 * The heron hut over a mangrove lagoon, made from props (docs/scenes-from-props.md): its land and its props are written in props/hut.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const HUT: SceneDoc = composeScene(HUT_PROJECT, madeProp)

export { HUT_PROJECT }
