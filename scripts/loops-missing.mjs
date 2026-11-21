/**
 * Names the Diorama scenes in the gallery that have no recorded loop yet at a commit,
 * for .github/workflows/loops.yml to record:
 *   node --experimental-strip-types scripts/loops-missing.mjs [commit]
 * prints the scene ids on one line, or nothing.
 *
 * Only brand new scenes are recorded by themselves (Matt, 2026-11-21). A change to a scene that
 * already has a loop, or to something every scene shares, starts nothing: re-recording on every
 * edit opened pull requests of loops that had hardly changed. Record those by hand (Actions,
 * Loops, Run workflow, with the scenes' ids or `all`) when the pictures really changed.
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { LOOPS } from '../src/blobscape/diorama/loops.ts'

/** The gallery's scenes, in its order, for which `has(path)` finds no recorded loop. */
export function missingLoops(has) {
  return LOOPS.map((l) => l.id).filter((id) => !has(`public/loops/${id}.webp`))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv[2] ?? 'HEAD'
  const has = (path) => {
    try { execFileSync('git', ['cat-file', '-e', `${at}:${path}`], { stdio: 'ignore' }); return true } catch { return false }
  }
  console.log(missingLoops(has).join(' '))
}
