import { SCENE_SOLVED, SCENE_START, sceneCode } from './scene.ts'
import { SLUG_START, slugCode } from './slug.ts'

/**
 * Every piece of take-away code the engine lessons print, in each shape the controls can give it, so a test can
 * typecheck them all against the package's entry (`scripts/engine-package.test.mjs`).
 */
export function lessonCodes(): { name: string; source: string }[] {
  return [
    { name: 'first-creature', source: slugCode(SLUG_START, false) },
    { name: 'first-creature-swing', source: slugCode({ ...SLUG_START, listens: 'both', blend: 0.12 }, true) },
    { name: 'scene-data', source: sceneCode(SCENE_START) },
    { name: 'scene-data-solved', source: sceneCode(SCENE_SOLVED) },
  ]
}
