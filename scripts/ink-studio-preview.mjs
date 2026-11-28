/**
 * Preview deployments only (Matt, 2026-11-27): puts Silicon Jungle's Ink Studio (MIT, github.com/siliconjungle/
 * shapeshift-labs-ink-studio) next to the built site at `dist/ink-studio/`, for the side-by-side page
 * `/dev/ink-compare/`. It fetches Ink Studio at the pinned commit below, runs its own build, and copies its browser
 * bundle, its LICENSE and the modules its renderer imports. Nothing of it is in this repo, and a production build
 * (or any build that is not a Vercel preview, unless INK_COMPARE=1) does nothing here, as vite.config.ts leaves the
 * page out of it.
 *
 *   node scripts/ink-studio-preview.mjs          # in `npm run build`, after vite build
 *   INK_COMPARE=1 npm run build && npm run preview   # to try it locally with the production headers
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

/** The Ink Studio commit the page is tried against. Move it on by hand to compare with a newer one. */
export const INK_COMMIT = '8e4b878322fce7d377a208d7ca31574eac72cea9'
const REPO = 'https://github.com/siliconjungle/shapeshift-labs-ink-studio.git'
/** The entry the page imports, and the bundle it loads first. */
const ENTRIES = ['webgl.mjs']
const BUNDLE = 'dist/ink-studio.browser.js'

/** Whether this build carries the comparison: Vercel previews, or asked for. */
export function wanted(env = process.env) {
  if (env.INK_COMPARE === '0') return false
  return env.INK_COMPARE === '1' || env.VERCEL_ENV === 'preview'
}

/** The files `entries` reach by static and dynamic imports and `new URL(…, import.meta.url)`, relative to `root`. */
export function reached(root, entries) {
  const seen = new Set()
  const todo = entries.map((e) => resolve(root, e))
  const ref = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|new URL\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g
  while (todo.length) {
    const file = todo.pop()
    if (seen.has(file) || !existsSync(file)) continue
    seen.add(file)
    if (!/\.(m?js)$/.test(file)) continue
    for (const m of readFileSync(file, 'utf8').matchAll(ref)) todo.push(resolve(dirname(file), m[1]))
  }
  return [...seen].map((f) => relative(root, f))
}

function main() {
  if (!wanted()) return
  const out = resolve('dist/ink-studio')
  const src = mkdtempSync(join(tmpdir(), 'ink-studio-'))
  try {
    const git = (...args) => execFileSync('git', args, { cwd: src, stdio: ['ignore', 'ignore', 'inherit'] })
    git('init', '-q')
    git('fetch', '-q', '--depth', '1', REPO, INK_COMMIT)
    git('checkout', '-q', 'FETCH_HEAD')
    // Ink Studio's own build: it joins its kit into one browser script (no dependencies to install)
    execFileSync(process.execPath, ['scripts/build.js', 'development'], { cwd: src, stdio: ['ignore', 'ignore', 'inherit'] })
    rmSync(out, { recursive: true, force: true })
    const files = [...reached(src, ENTRIES), BUNDLE, 'LICENSE']
    for (const f of files) {
      mkdirSync(dirname(join(out, f)), { recursive: true })
      cpSync(join(src, f), join(out, f))
    }
    // what the dev server's status answers there, for the page
    writeFileSync(join(out, 'status.json'), JSON.stringify({ dir: `${REPO.replace(/\.git$/, '')}@${INK_COMMIT.slice(0, 7)}`, built: true, renderer: true }))
    console.log(`ink-studio-preview: ${files.length} files of Ink Studio ${INK_COMMIT.slice(0, 7)} in dist/ink-studio/`)
  } finally {
    rmSync(src, { recursive: true, force: true })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
