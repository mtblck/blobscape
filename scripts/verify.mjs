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
 *   output: a line a check, then each failure once; every step of every check is in verify-shots/report.txt (--loud prints it all).
 *   A failed check runs once more on its own before it counts (--no-retry to skip that).
 *
 * The checks live in scripts/verify/checks/*.mjs. Each names the source files
 * it covers (`entries`, followed through imports, and `files`, taken as they
 * are); see docs/testing.md for which command to run for which change.
 */
import { readdirSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs'
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
const EVERYTHING = /^(package(-lock)?\.json|vite\.config\.ts|vercel\.json|tsconfig\.json|scripts\/verify\.mjs|scripts\/verify\/(lib|graph)\.mjs|scripts\/verify\/known-failures\.json|scripts\/check\.mjs|scripts\/quiet-reporter\.mjs|scripts\/check-hosting\.mjs)$/
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
  const files = [...new Set([...sh(`git diff --name-only ${base}`), ...sh('git ls-files --others --exclude-standard')])]
  return files.includes('package.json') ? packageChanges(files, execSync(`git show ${base}:package.json`, { cwd: root, encoding: 'utf8' })) : files
}

/**
 * A change to package.json that only adds, bumps or drops runtime `dependencies`
 * reaches just the checks whose files import those packages: each becomes a
 * `pkg:<name>` entry, and the lock file goes with them. Anything else in it
 * (scripts, devDependencies, which build and test the site) still reaches every check.
 */
function packageChanges(files, before) {
  const was = JSON.parse(before), now = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const { dependencies: a = {}, ...restWas } = was, { dependencies: b = {}, ...restNow } = now
  if (JSON.stringify(restWas) !== JSON.stringify(restNow)) return files
  const names = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((n) => a[n] !== b[n])
  return [...files.filter((f) => f !== 'package.json' && f !== 'package-lock.json'), ...names.map((n) => `pkg:${n}`)]
}

/**
 * A file most checks reach through imports (the blobs, the controls, the lesson
 * shell) is checked by the `core` checks only, which between them draw on Spark,
 * on the engine's two backends, in pixel art, in the lessons and the sandbox.
 * Every check still runs when the harness or the build changes, or with --wide.
 */
const WIDE = 0.5

/** At most this many failed checks are run again alone; more than that is a break, not a flake. */
const RETRY_MOST = 5
/** Checks known to fail on main: `{ check, issue, until: 'YYYY-MM-DD' }`. Keep it empty; see docs/testing.md. */
const KNOWN = JSON.parse(readFileSync(join(root, 'scripts/verify/known-failures.json'), 'utf8'))

/** Which checks (and which parts of them) the changed files reach, and why. */
function affected(files) {
  const graph = makeGraph(root)
  const inFiles = (list, f) => (list ?? []).some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p))
  const hits = new Map(files.map((f) => [f, []])) // file → [check, part or null (all of it)]
  for (const c of checks) {
    const own = graph.closure(c.entries ?? [], (f) => LEAF.test(f))
    const usesPkg = (f, reach) => f.startsWith('pkg:') && [...graph.packagesOf(reach)].some((n) => n === f.slice(4) || n.startsWith(f.slice(4) + '/'))
    for (const f of files) if (EVERYTHING.test(f) || usesPkg(f, own) || f === `scripts/verify/checks/${c.group}.mjs` || own.has(f) || inFiles(c.files, f)) hits.get(f).push([c, null])
    for (const [key, entries] of Object.entries(c.parts ?? {})) {
      const reach = graph.closure(entries, (f) => LEAF.test(f))
      for (const f of files) if (reach.has(f) || usesPkg(f, reach)) hits.get(f).push([c, key])
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
const loud = flag('loud')
console.log(`${run.length} checks, ${jobs} at a time${run.length < checks.length && (loud || run.length <= 12) ? `: ${run.map((c) => c.name).join(', ')}` : ''}`)

// Everything a check says goes to the report; the terminal gets a line a check
// (and the whole of it with --loud), then each failure once at the end.
const reportFile = join(shots, 'report.txt')
mkdirSync(shots, { recursive: true })
writeFileSync(reportFile, `${new Date().toISOString()}  ${process.argv.slice(2).join(' ')}\n\n`)

const started = Date.now()
async function runOne(browser, c) {
  const t = checkContext(browser, base, partsFor(c))
  const t0 = Date.now()
  let timer
  try {
    await Promise.race([c.run(t), new Promise((_, j) => { timer = setTimeout(() => j(new Error(`still running after ${LIMIT / 60000} minutes`)), LIMIT) })])
  } catch (e) {
    // where it stopped: the last step that passed
    const last = [...(t.log ?? [])].reverse().find((l) => l.startsWith('  ok  '))
    t.fails.push(`${c.name} stopped: ${e.message.split('\n')[0]}${last ? ` (after "${last.slice(6, 90)}")` : ' (before its first step passed)'}`)
  }
  clearTimeout(timer)
  await t.cleanup()
  const secs = (Date.now() - t0) / 1000
  const head = `${t.fails.length ? 'FAIL' : 'pass'} ${c.name} (${secs.toFixed(1)} s${t.fails.length ? `, ${t.fails.length} failed` : ''})`
  const whole = `${head}\n${t.log.join('\n')}${t.fails.length ? '\n' + t.fails.map((f) => '  FAIL ' + f).join('\n') : ''}\n`
  appendFileSync(reportFile, whole + '\n')
  console.log(loud ? whole : head)
  return { name: c.name, secs, fails: t.fails }
}
const results = []
async function worker() {
  let browser = await launch()
  for (let c = queue.shift(); c; c = queue.shift()) {
    results.push(await runOne(browser, c))
    if (!browser.isConnected()) browser = await launch()
  }
  await browser.close()
}
await Promise.all(Array.from({ length: jobs }, worker))

// A check that failed runs once more, on its own: side by side, software
// rendering misses a wait now and then, and a check that passes alone is flaky,
// not broken. Not when many failed (that is a real break) or with --no-retry.
const flaky = []
const firstFailed = results.filter((r) => r.fails.length)
if (firstFailed.length && firstFailed.length <= RETRY_MOST && !flag('no-retry')) {
  console.log(`\n${firstFailed.length} failed; running ${firstFailed.length > 1 ? 'each' : 'it'} again alone`)
  appendFileSync(reportFile, 'Again, one at a time:\n\n')
  const browser = await launch()
  for (const r of firstFailed) {
    const again = await runOne(browser, run.find((c) => c.name === r.name))
    if (!again.fails.length) flaky.push({ name: r.name, first: r.fails })
    r.fails = again.fails
  }
  await browser.close()
}
served?.server.close()

const wall = (Date.now() - started) / 1000
writeFileSync(timesFile, JSON.stringify({ ...lastTimes, ...Object.fromEntries(results.map((r) => [r.name, Math.round(r.secs * 10) / 10])) }, null, 1))
appendFileSync(reportFile, `times: ${[...results].sort((a, b) => b.secs - a.secs).map((r) => `${r.name} ${r.secs.toFixed(0)}s`).join(', ')}\n`)

// Known failures: checks already red on main, each with its issue and the day
// it stops being excused. They are named in a line and don't fail the run.
const today = new Date().toISOString().slice(0, 10)
const knownNow = new Map(KNOWN.filter((k) => k.until >= today).map((k) => [k.check, k]))
const failed = results.filter((r) => r.fails.length && !knownNow.has(r.name))
const excused = results.filter((r) => r.fails.length && knownNow.has(r.name))
const mended = results.filter((r) => !r.fails.length && KNOWN.some((k) => k.check === r.name))

/** The same line many times over is said once with its count; a long one is cut (the report has it whole). */
function brief(fails) {
  const count = new Map()
  for (const f of fails) count.set(f, (count.get(f) ?? 0) + 1)
  return [...count].map(([f, n]) => `${f.length > 400 ? f.slice(0, 400) + '…' : f}${n > 1 ? `  (×${n})` : ''}`)
}
console.log(`\n${results.length - failed.length - excused.length} of ${results.length} checks pass in ${Math.floor(wall / 60)}m ${Math.floor(wall % 60)}s`)
if (flaky.length) console.log(`flaky (failed side by side, passed alone): ${flaky.map((f) => `${f.name} [${brief(f.first)[0]}]`).join('; ')}`)
if (excused.length) console.log(`known failures, not counted: ${excused.map((r) => `${r.name} (${knownNow.get(r.name).issue}, until ${knownNow.get(r.name).until})`).join(', ')}`)
if (mended.length) console.log(`passes now, so take it off scripts/verify/known-failures.json: ${mended.map((r) => r.name).join(', ')}`)
if (failed.length) {
  console.error('\nFAIL\n' + failed.flatMap((r) => brief(r.fails).map((f) => `  - [${r.name}] ${f}`)).join('\n'))
  console.error(`\nevery step of every check: verify-shots/report.txt; one check again: npm run verify -- ${failed[0].name}`)
  process.exit(1)
}
console.log('verify ok (steps in verify-shots/report.txt, screenshots beside it)')
