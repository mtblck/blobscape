import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { HENGE_PROJECT } from '../../props/henge.ts'

/**
 * The henge: a magic circle flares, a witch comes in sparks, waves her wand and goes, made from props (docs/scenes-from-props.md): its land and its props are written in props/henge.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const HENGE: SceneDoc = composeScene(HENGE_PROJECT, madeProp)

export { HENGE_PROJECT }
