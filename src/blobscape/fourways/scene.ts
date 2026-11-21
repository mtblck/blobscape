import type { PointLight } from '../../splat-engine/engine.ts'
import { compileScene, type SceneDoc } from '../../splat-engine/sceneDoc.ts'
import { CAMPFIRE } from '../diorama/scenes/campfire.ts'

/**
 * The scene all four panels draw: Diorama's campfire, with the fire's light reaching further and casting shadows, so there is more for a live light to do. The Blobscape and
 * Spark panels are made from this description; the shader and three.js panels are the same camp typed out by hand
 * (`layout.ts`), as they would be without it.
 */
export const DOC: SceneDoc = { ...CAMPFIRE, lights: (CAMPFIRE.lights ?? []).map((l, i) => (i === 0 ? { ...l, range: 1.3, shadows: true } : l)) }

export const SCENE = compileScene(DOC)

/** The scene's lights `t` seconds in, with the fire `fire` times as bright as it was written. */
export function lightsAt(t: number, fire: number): PointLight[] {
  return SCENE.lights(t).map((l, i) => (i === 0 ? { ...l, color: [l.color[0] * fire, l.color[1] * fire, l.color[2] * fire] } : l))
}

/** How big the description is, written out as JSON. */
export const DOC_BYTES = JSON.stringify(DOC).length
