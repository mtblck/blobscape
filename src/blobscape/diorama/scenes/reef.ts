import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { REEF_PROJECT } from '../../props/reef.ts'

/**
 * The jellyfish over a coral reef, made from props (docs/scenes-from-props.md): its land and its props are written in props/reef.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const REEF: SceneDoc = composeScene(REEF_PROJECT, madeProp)

export { REEF_PROJECT }
