import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { CAMPFIRE_PROJECT, CAMPFIRE_SHAPED } from '../../props/camp.ts'

/**
 * The camp in a pine clearing, made from props (docs/scenes-from-props.md): its land and its props are written in props/camp.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const CAMPFIRE: SceneDoc = composeScene(CAMPFIRE_PROJECT, madeProp)

/** The same camp with a flame made of shapes in place of the simulated fire (`CAMPFIRE_SHAPED`): what One Scene, Four Ways draws. */
export const CAMPFIRE_WITH_SHAPES: SceneDoc = composeScene(CAMPFIRE_PROJECT, (id) => (id === 'campfire' ? CAMPFIRE_SHAPED : madeProp(id)))

export { CAMPFIRE_PROJECT }
