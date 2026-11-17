/**
 * Real-browser checks of the production build under the production headers.
 * Fails on console errors, page errors, CSP violations and axe violations, and
 * on what each page's own checks find. Run `npm run build` first.
 *
 *   npm run verify                      every check (the full run)
 *   npm run verify -- --changed         only the checks the files changed since main can reach
 *   npm run verify -- diorama creature  checks by name, or a whole file (site, lessons, sandbox, experiments, engine, sprite, fit)
 *   npm run verify -- --list            what there is, with each check's last time
 *   npm run verify -- --files=a.ts,b.ts --why --list   which checks those files would run, and why
 *   --wide: a file most checks reach runs all of them, not just the core ones
 *   options: --jobs=N (checks side by side, default 3), --base=URL (default: serves ./dist on :4181), --why
 *
 * The checks live in scripts/verify/checks/*.mjs. Each names the source files
 * it covers (`entries`, followed through imports, and `files`, taken as they
 * are); see docs/testing.md for which command to run for which change.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { cpus } from 'node:os'
import { root, shots, serveDist, launch, checkContext } from './verify/lib.mjs'
import { makeGraph } from './verify/graph.mjs'

const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
const value = (name, d) => { const f = flag(name); return f?.includes('=') ? f.slice(f.indexOf('=') + 1) : d }
const named = args.filter((a) => !a.startsWith('--') && !/^https?:/.test(a))
const urlArg = args.find((a) => /^https?:/.test(a))

// every check, in file order (heaviest groups first when there is no timing yet)
const dir = join(root, 'scripts/verify/checks')
const ORDER = ['experiments', 'engine', 'lessons', 'sandbox', 'fit', 'sprite', 'site']
const groups = readdirSync(dir).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4))
  .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99))
const checks = []
for (const g of groups) for (const c of (await import(join(dir, `${g}.mjs`))).default) checks.push({ ...c, group: g })
{
  const seen = new Set()
  for (const c of checks) { if (seen.has(c.name)) throw new Error(`two checks are called ${c.name}`); seen.add(c.name) }
}

const timesFile = join(shots, 'timings.json')
const lastTimes = existsSync(timesFile) ? JSON.parse(readFileSync(timesFile, 'utf8')) : {}

/**
 * Changes that reach every check: the build, the hosting headers and the
 * check harness itself. Tests, docs and recording scripts reach none.
 */
const EVERYTHING = /^(package(-lock)?\.json|vite\.config\.ts|vercel\.json|tsconfig\.json|scripts\/verify\.mjs|scripts\/verify\/(lib|graph)\.mjs|scripts\/check-hosting\.mjs)$/
const NOTHING = /(\.test\.ts$|^docs\/(?!rigged-splats\.md$)|^[^/]+\.md$|^\.gitignore$|^LICENSE$|^scripts\/(record-loops\.mjs|rigged-samples\.ts)$|^\.claude\/)/
// Files no check follows imports into unless it names them itself. Scene
// descriptions are each one diorama-scenes part. The app shell and the site's
// chrome and copy reach every page, but what they can break is the chrome,
// which the site, pages-*, layout and lessons-basics checks name.
const LEAF = /^src\/(blobscape\/diorama\/scenes\/[^/]+\.ts|blobscape\/(App|ssr|main)\.tsx|blobscape\/(site|meta|engineCopy|specCopy)\.ts|shared\/(SiteHeader|Footer|Logo)\.tsx|shared\/logoPaths\.ts)$/

function changedFiles(ref) {
  const sh = (c) => execSync(c, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
  if (!ref) ref = ['origin/main', 'main'].find((r) => { try { sh(`git rev-parse --verify -q ${r}`); return true } catch { return false } })
  const base = sh(`git merge-base ${ref} HEAD`)[0]
  return [...new Set([...sh(`git diff --name-only ${base}`), ...sh('git ls-files --others --exclude-standard')])]
}

/**
 * A file most checks reach through imports (the blobs, the controls, the lesson
 * shell) is checked by the `core` checks only, which between them draw on Spark,
 * on the engine's two backends, in pixel art, in the lessons and the sandbox.
 * Every check still runs when the harness or the build changes, or with --wide.
 */
const WIDE = 0.8

/** Which checks (and which parts of them) the changed files reach, and why. */
function affected(files) {
  const graph = makeGraph(root)
  const inFiles = (list, f) => (list ?? []).some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p))
  const hits = new Map(files.map((f) => [f, []])) // file → [check, part or null (all of it)]
  for (const c of checks) {
    const own = graph.closure(c.entries ?? [], (f) => LEAF.test(f))
    for (const f of files) if (EVERYTHING.test(f) || f === `scripts/verify/checks/${c.group}.mjs` || own.has(f) || inFiles(c.files, f)) hits.get(f).push([c, null])
    for (const [key, entries] of Object.entries(c.parts ?? {})) {
      const reach = graph.closure(entries, (f) => LEAF.test(f))
      for (const f of files) if (reach.has(f)) hits.get(f).push([c, key])
    }
  }
  const picks = new Map()
  const wide = []
  for (const [f, list] of hits) {
    let use = list
    const reached = new Set(list.map(([c]) => c.name)).size
    if (!flag('wide') && !EVERYTHING.test(f) && !f.startsWith('scripts/verify/') && reached >= checks.length * WIDE) {
      use = list.filter(([c]) => c.core)
      wide.push(f)
    }
    for (const [c, part] of use) {
      if (!picks.has(c.name)) picks.set(c.name, { why: f, parts: new Set(), all: false })
      const p = picks.get(c.name)
      if (part === null) p.all = true
      else p.parts.add(part)
    }
  }
  const loose = files.filter((f) => !hits.get(f).length && !NOTHING.test(f))
  return { picks, loose, wide }
}

// pick the checks
let run = checks
let partsFor = () => null
if (flag('changed') || flag('files')) {
  const files = flag('files') ? value('files', '').split(',').filter(Boolean) : changedFiles(value('changed', '') || undefined)
  const { picks, loose, wide } = affected(files)
  run = checks.filter((c) => picks.has(c.name))
  partsFor = (c) => (picks.get(c.name).all ? null : picks.get(c.name).parts)
  console.log(`${files.length} files ${flag('files') ? 'named' : 'changed since main'}: ${run.length} of ${checks.length} checks reach them`)
  if (flag('why')) for (const c of run) { const p = picks.get(c.name); console.log(`  ${c.name.padEnd(22)} ${p.all ? 'all' : [...p.parts].join(', ')}  (${p.why})`) }
  if (wide.length) console.log(`  reached by most checks, so only the core ones run for them (--wide for all): ${wide.join(', ')}`)
  if (loose.length) console.log(`  no check covers: ${loose.join(', ')}`)
}
if (named.length) {
  const want = new Set(named)
  for (const n of want) if (!checks.some((c) => c.name === n || c.group === n)) { console.error(`no check or group called ${n}; try --list`); process.exit(2) }
  run = run.filter((c) => want.has(c.name) || want.has(c.group))
}
if (flag('list')) {
  for (const g of groups) {
    console.log(g)
    for (const c of checks.filter((k) => k.group === g)) console.log(`  ${c.name.padEnd(22)} ${lastTimes[c.name] ? `${lastTimes[c.name].toFixed(0).padStart(4)} s` : '      '}  ${c.about}`)
  }
  process.exit(0)
}
if (!run.length) { console.log('no browser checks to run'); process.exit(0) }

// run them, the longest first, side by side in their own browsers
const jobs = Math.max(1, Math.min(Number(value('jobs', Math.min(3, cpus().length - 1))), run.length))
const LIMIT = Number(value('limit', 15 * 60)) * 1000 // a check that takes longer than this has hung
const queue = [...run].sort((a, b) => (lastTimes[b.name] ?? 0) - (lastTimes[a.name] ?? 0))
let base = value('base', urlArg)
const served = base ? null : await serveDist()
base ??= served.base
console.log(`${run.length} checks, ${jobs} at a time${run.length < checks.length ? `: ${run.map((c) => c.name).join(', ')}` : ''}\n`)

const started = Date.now()
const results = []
async function worker() {
  let browser = await launch()
  for (let c = queue.shift(); c; c = queue.shift()) {
    const t = checkContext(browser, base, partsFor(c))
    const t0 = Date.now()
    let timer
    try {
      await Promise.race([c.run(t), new Promise((_, j) => { timer = setTimeout(() => j(new Error(`still running after ${LIMIT / 60000} minutes`)), LIMIT) })])
    } catch (e) {
      t.fails.push(`${c.name} stopped: ${e.message.split('\n')[0]}`)
    }
    clearTimeout(timer)
    await t.cleanup()
    const secs = (Date.now() - t0) / 1000
    results.push({ name: c.name, secs, fails: t.fails })
    console.log(`${t.fails.length ? 'FAIL' : 'pass'} ${c.name} (${secs.toFixed(1)} s${t.fails.length ? `, ${t.fails.length} failed` : ''})\n${t.log.join('\n')}${t.fails.length ? '\n' + t.fails.map((f) => '  FAIL ' + f).join('\n') : ''}\n`)
    if (!browser.isConnected()) browser = await launch()
  }
  await browser.close()
}
await Promise.all(Array.from({ length: jobs }, worker))
served?.server.close()

const wall = (Date.now() - started) / 1000
writeFileSync(timesFile, JSON.stringify({ ...lastTimes, ...Object.fromEntries(results.map((r) => [r.name, Math.round(r.secs * 10) / 10])) }, null, 1))
console.log(`times: ${results.sort((a, b) => b.secs - a.secs).map((r) => `${r.name} ${r.secs.toFixed(0)}s`).join(', ')}`)
const failed = results.filter((r) => r.fails.length)
console.log(`\n${results.length} checks in ${Math.floor(wall / 60)}m ${Math.floor(wall % 60)}s (${jobs} at a time)`)
if (failed.length) {
  console.error('\nFAIL\n' + failed.flatMap((r) => r.fails.map((f) => `  - [${r.name}] ${f}`)).join('\n'))
  process.exit(1)
}
console.log('verify ok — screenshots in verify-shots/')
