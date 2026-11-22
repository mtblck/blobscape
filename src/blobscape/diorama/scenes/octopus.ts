import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { OCTOPUS_PROJECT } from '../../props/octopus.ts'

/**
 * The storm octopus on its bell buoy, made from props (docs/scenes-from-props.md): its land and its props are written in props/octopus.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const OCTOPUS: SceneDoc = composeScene(OCTOPUS_PROJECT, madeProp)

export { OCTOPUS_PROJECT }
