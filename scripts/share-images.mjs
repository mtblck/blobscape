/**
 * Makes the pictures a link to the site shows when it is shared (og:image):
 * public/og.png for the front page and every page without its own, and
 * public/share/<name>.jpg for each experiment, cut from its cover to the
 * 1200 × 630 that link previews use. Run it after adding or changing a cover:
 *   node --experimental-strip-types scripts/share-images.mjs
 * meta.ts points each experiment's page at its picture (`shareImage`), and a
 * test holds that every experiment has one.
 */
import { chromium } from 'playwright-core'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXPERIMENTS } from '../src/blobscape/site.ts'
import { shareImage } from '../src/blobscape/meta.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SIZE = { width: 1200, height: 630 }
const data = (file, type) => `data:${type};base64,${readFileSync(join(root, file)).toString('base64')}`
const cover = (e) => data(join('public', e.cover), 'image/webp')
const font = (name) => data(`src/shared/fonts/${name}-latin-wght-normal.woff2`, 'font/woff2')

/** The front page's picture: the logo and what the site is, beside four of the experiments. */
const FRONT = ['diorama', 'creature', 'pond', 'daynight']
const front = `<!doctype html><meta charset="utf-8"><style>
  @font-face { font-family: Fredoka; src: url('${font('fredoka')}') format('woff2-variations'); font-weight: 300 700; }
  @font-face { font-family: Figtree; src: url('${font('figtree')}') format('woff2-variations'); font-weight: 300 900; }
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: #fbf6ee; color: #1d2440; display: flex; gap: 48px; padding: 56px 56px 68px; border-bottom: 14px solid #f2553a; }
  .words { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 28px; }
  .words img { width: 330px; }
  h1 { font: 600 58px/1.08 Fredoka; }
  p { font: 500 27px/1.35 Figtree; color: #454b66; }
  .pictures { width: 520px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-content: center; }
  .pictures img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 18px; display: block; }
</style>
<div class="words">
  <img src="${data('.github/readme/logo-light.svg', 'image/svg+xml')}" alt="">
  <h1>Learn 3D Gaussian splats by taking them apart</h1>
  <p>Hands-on lessons, a sandbox and a shelf of experiments. Free, in your browser.</p>
</div>
<div class="pictures">${FRONT.map((id) => `<img src="${cover(EXPERIMENTS.find((e) => e.id === id))}" alt="">`).join('')}</div>`

const one = (e) => `<!doctype html><meta charset="utf-8"><style>* { margin: 0 } img { display: block; width: 1200px; height: 630px; object-fit: cover }</style><img src="${cover(e)}" alt="">`

const executablePath = process.env.CHROME_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 })
const shoot = async (html, file, options) => {
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode())) })
  await page.screenshot({ path: join(root, 'public', file), ...options })
}
mkdirSync(join(root, 'public', 'share'), { recursive: true })
await shoot(front, 'og.png', { type: 'png' })
for (const e of EXPERIMENTS) await shoot(one(e), shareImage(e), { type: 'jpeg', quality: 88 })
await browser.close()
console.log(`share images: og.png and ${EXPERIMENTS.length} experiments`)
