import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { WINDOW_PROJECT } from '../../props/window.ts'

/**
 * The sunrise window in a ruined library, made from props (docs/scenes-from-props.md): its land and its props are written in props/window.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const WINDOW: SceneDoc = composeScene(WINDOW_PROJECT, madeProp)

export { WINDOW_PROJECT }
