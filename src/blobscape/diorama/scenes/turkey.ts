import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { TURKEY_PROJECT } from '../../props/turkey.ts'

/**
 * Turkey Run: a giant turkey chasing a cook down a country road, made from props (docs/scenes-from-props.md): its land and its props are written in props/turkey.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const TURKEY: SceneDoc = composeScene(TURKEY_PROJECT, madeProp)

export { TURKEY_PROJECT }
