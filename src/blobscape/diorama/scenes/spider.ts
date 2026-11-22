import type { SceneDoc } from '../../../splat-engine/sceneDoc.ts'
import { composeScene } from '../../../splat-engine/compose.ts'
import { madeProp } from '../../props/index.ts'
import { SPIDER_PROJECT } from '../../props/spider.ts'

/**
 * The lantern spider in its web, made from props (docs/scenes-from-props.md): its land and its props are written in props/spider.ts, and
 * this is them set down together as one description, which Diorama draws.
 */
export const SPIDER: SceneDoc = composeScene(SPIDER_PROJECT, madeProp)

export { SPIDER_PROJECT }
