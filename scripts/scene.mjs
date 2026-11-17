/**
 * Looks over a pixel scene description without opening the site, and can take its pictures.
 *
 *   npm run scene -- my-scene.json                 check it, cut it, and say what is wrong
 *   npm run scene -- my-scene.json --shots out/    then draw it as pixel art (needs `npm run build` first)
 *   npm run scene -- --example campfire            print one of the site's scenes as JSON, to start from
 *   npm run scene -- --list                        the site's scenes
 *
 * The file is JSON, or a .ts/.mjs module (its default export, or its first export that is a scene). It ends with a
 * status of 1 when there is anything that must be fixed, so it can gate a loop: write, check, fix, look.
 * How to write a scene: docs/scene-descriptions.md.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1] ?? '' }
const file = args.find((a, i) => !a.startsWith('--') && !['--shots', '--example'].includes(args[i - 1]))
const say = (s = '') => process.stdout.write(`${s}\n`)

if (args.includes('--list') || args.includes('--example')) {
  const { DIORAMAS } = await import('../src/blobscape/diorama/scenes.ts')
  const { readdirSync } = await import('node:fs')
  const dir = new URL('../src/blobscape/diorama/scenes/', import.meta.url)
  const ids = readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => f.slice(0, -3))
  if (args.includes('--list')) {
    for (const id of ids) say(`${id.padEnd(10)} ${DIORAMAS.find((d) => d.id === id)?.about ?? ''}`)
    process.exit(0)
  }
  const id = flag('--example')
  if (!ids.includes(id)) { console.error(`No scene '${id}'. Try one of: ${ids.join(', ')}`); process.exit(2) }
  const mod = await import(new URL(`${id}.ts`, dir).href)
  say(JSON.stringify(Object.values(mod).find((v) => v && typeof v === 'object' && Array.isArray(v.parts)), null, 1))
  process.exit(0)
}

if (!file) {
  console.error('Which scene? npm run scene -- <file.json> [--shots <folder>] | --example <id> | --list')
  process.exit(2)
}

const { readScene, reviewScene } = await import('../src/blobscape/diorama/review.ts')
const path = resolve(file)
let doc, problems = []
if (/\.json$/i.test(path)) {
  ({ doc, problems } = readScene(readFileSync(path, 'utf8')))
} else {
  const mod = await import(pathToFileURL(path).href)
  doc = mod.default ?? Object.values(mod).find((v) => v && typeof v === 'object' && Array.isArray(v.parts))
  if (!doc) problems = ['file: no scene found in its exports']
}

const review = doc ? reviewScene(doc) : { problems, warnings: [] }
const f = review.facts
if (f) say(`${f.name}: ${f.parts} parts, ${f.bones} bones, ${f.blobs.toLocaleString('en-US')} blobs at the coarsest detail, ${f.colors} colors, a ${f.loop} s loop; values ${f.dark.toFixed(2)} to ${f.light.toFixed(2)}, ${Math.round(f.mud * 100)}% gray; cut in ${f.seconds.toFixed(1)} s`)
for (const p of review.problems) say(`fix   ${p}`)
for (const w of review.warnings) say(`look  ${w}`)
if (!review.problems.length) say(review.warnings.length ? 'Sound, with things to look at.' : 'Sound.')

const out = flag('--shots')
if (out !== undefined && doc && f) {
  const { serveDist, launch, dist } = await import('./verify/lib.mjs')
  if (!existsSync(join(dist, 'experiments', 'pixel-diorama', 'index.html'))) { console.error('No built site to draw with: run `npm run build` first.'); process.exit(2) }
  const folder = resolve(out || 'scene-shots')
  mkdirSync(folder, { recursive: true })
  const json = join(folder, `${basename(path).replace(/\.[^.]+$/, '')}.json`)
  writeFileSync(json, JSON.stringify(doc))
  let served
  for (let port = 4300; !served && port < 4320; port++) served = await serveDist(port).catch(() => undefined)
  if (!served) { console.error('No free port to serve the built site on.'); process.exit(2) }
  const browser = await launch()
  try {
    const page = await (await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1280, height: 900 } })).newPage()
    await page.goto(`${served.base}/experiments/pixel-diorama/?offscreen=1`)
    await page.waitForFunction(() => window.__diorama, null, { timeout: 180000 })
    await page.getByTestId('diorama-model').setInputFiles(json)
    await page.waitForFunction(() => /^(Opened|Could not)/.test(document.querySelector('[data-testid=diorama-model-note]')?.textContent ?? ''), null, { timeout: 60000 })
    const note = await page.getByTestId('diorama-model-note').innerText()
    if (!note.startsWith('Opened')) throw new Error(note)
    await page.waitForFunction((n) => window.__diorama?.blobs() > 0 && document.querySelector('[data-testid=diorama-view]')?.getAttribute('aria-label')?.includes(n), f.name, { timeout: 240000 }).catch(() => {})
    const shoot = async (name, t) => {
      await page.evaluate(async (at) => { const s = window.__diorama.stage; await s.frame(at); await s.frame(at) }, t)
      const to = join(folder, `${name}.png`)
      await page.getByTestId('diorama-view').screenshot({ path: to })
      say(`drew  ${to}`)
    }
    for (const [name, label, share] of [['front', 'From the front', 0.1], ['above', 'From above', 0.1], ['close', 'Close up', 0.1], ['later', 'From the front', 0.6]]) {
      await page.getByRole('button', { name: label, exact: true }).click()
      await page.waitForTimeout(200)
      await shoot(name, f.loop * share)
    }
  } catch (e) {
    console.error(`Could not draw it: ${e instanceof Error ? e.message : e}`)
    process.exitCode = 2
  } finally {
    await browser.close()
    served.server.close()
  }
}
if (review.problems.length) process.exitCode = 1
