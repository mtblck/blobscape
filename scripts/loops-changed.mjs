/**
 * Names the Pixel Diorama scenes whose own files changed between two commits, for
 * .github/workflows/loops.yml to record again:
 *   node --experimental-strip-types scripts/loops-changed.mjs <before> <after>
 * prints the scene ids on one line, or nothing.
 *
 * Only a scene's own files count (`sceneFor`): its description, the lighthouse's code, the fox
 * meadow's builder. A change to something every scene shares (the cutter, the pixel pass, the
 * recorder) could change every loop or none, and only a person can say which, so that is left
 * to a run by hand (Actions, Loops, Run workflow).
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { LOOPS } from '../src/blobscape/diorama/loops.ts'

/** The scene a changed file belongs to, if it is one scene's own. */
export function sceneFor(file) {
  const own = /^src\/blobscape\/diorama\/scenes\/([^/.]+)\.ts$/.exec(file)
  if (own) return LOOPS.some((l) => l.id === own[1]) ? own[1] : undefined
  if (file === 'src/blobscape/diorama/scene.ts') return 'lighthouse'
  if (/^src\/blobscape\/fourways\/meadow\/(build|doc)\.ts$/.test(file)) return 'meadow'
  return undefined
}

/** The scenes a list of changed files touches, in the gallery's order. */
export function scenesFor(files) {
  const hit = new Set(files.map(sceneFor))
  return LOOPS.map((l) => l.id).filter((id) => hit.has(id))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [before, after = 'HEAD'] = process.argv.slice(2)
  if (!before) throw new Error('usage: loops-changed.mjs <before> [after]')
  const files = execFileSync('git', ['diff', '--name-only', before, after], { encoding: 'utf8' }).split('\n').filter(Boolean)
  console.log(scenesFor(files).join(' '))
}
