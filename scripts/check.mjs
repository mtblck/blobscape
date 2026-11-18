/**
 * `npm run check`: the unit tests, the build, then the browser checks the
 * changed files reach. Each step prints a line or two when it passes and what
 * failed when it doesn't; everything else it had to say is in verify-shots/.
 * Arguments go to the browser checks (`npm run check -- --wide`).
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'verify-shots')
mkdirSync(out, { recursive: true })
const npm = (args, opts) => spawnSync('npm', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, ...opts })

/** A step whose output is only worth reading when it fails: kept in a file, its end shown on failure. */
function hushed(name, args) {
  const t0 = Date.now()
  const r = npm(args)
  const text = (r.stdout ?? '') + (r.stderr ?? '')
  writeFileSync(join(out, `${name}.txt`), text)
  if (r.status !== 0) {
    console.error(`${name} failed; the last of verify-shots/${name}.txt:\n${text.trimEnd().split('\n').slice(-40).join('\n')}`)
    process.exit(r.status ?? 1)
  }
  console.log(`${name} ok (${Math.round((Date.now() - t0) / 1000)} s)`)
}
/** A step that already keeps itself short. */
function shown(args) {
  const r = npm(args, { stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

hushed('docs-deps', ['run', '--silent', 'docs:deps'])
shown(['run', '--silent', 'test'])
hushed('build', ['run', 'build'])
shown(['run', '--silent', 'verify', '--', '--changed', ...process.argv.slice(2)])
