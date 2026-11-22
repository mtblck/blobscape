import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { CROC_PROJECT } from '../../props/croc.ts'

/**
 * The garden crocodile basking on a sandbar, made from props (docs/scenes-from-props.md): its land and its props are written in props/croc.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const CROC: SceneDoc = composeScene(CROC_PROJECT, madeProp)

export { CROC_PROJECT }
