/**
 * Real-browser check of the production build under the production headers.
 * Fails on console errors, page errors and CSP violations, and checks the
 * splat actually renders into a sprite and a sheet, and that Fit a Picture
 * trains. Run `npm run build` first.
 *   node scripts/verify.mjs [baseUrl]   (default: serves ./dist on :4181)
 */
import { chromium } from 'playwright-core'
import { AxeBuilder } from '@axe-core/playwright'
import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const shots = join(root, 'verify-shots')
mkdirSync(shots, { recursive: true })
const blocks = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')).headers
const headersFor = (url) => blocks.filter((b) => new RegExp(`^${b.source}$`).test(url)).flatMap((b) => b.headers)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' }

let base = process.argv[2]
let server
if (!base) {
  server = createServer((req, res) => {
    const url = req.url.split('?')[0]
    let file = join(dist, url)
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!existsSync(file)) { res.statusCode = 404; res.setHeader('Content-Type', 'text/html'); return res.end(readFileSync(join(dist, '404.html'))) }
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
    for (const h of headersFor(url)) res.setHeader(h.key, h.value)
    res.end(readFileSync(file))
  })
  await new Promise((r) => server.listen(4181, r))
  base = 'http://localhost:4181'
}

const executablePath = process.env.CHROME_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const browser = await chromium.launch({ executablePath, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] })
const fails = []
const ok = (m) => console.log(`  ok  ${m}`)

async function open(path, opts = {}) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ...opts })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') fails.push(`${path} console: ${m.text()}`) })
  page.on('pageerror', (e) => fails.push(`${path} pageerror: ${e.message}`))
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP blocked ${e.blockedURI} (${e.violatedDirective})`)))
  const res = await page.goto(base + path, { waitUntil: 'load' })
  return { page, res, ctx }
}

/** Options sit in tabs: open the tab that holds a control, then click the control. */
async function tabClick(control) {
  const shows = () => control.first().isVisible().catch(() => false)
  if (!(await shows())) {
    // a control in a closed tab is hidden from every query, so try each tab until it shows
    for (const tab of await control.page().locator('section[aria-label=Options] [role=tab]').all()) {
      await tab.click()
      if (await shows()) break
    }
  }
  await control.click()
}

// axe-core on the rendered page; any violation fails the run
async function axe(page, label) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze()
  for (const v of violations) fails.push(`${label} axe ${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`)
  if (!violations.length) ok(`${label}: no axe violations`)
}

const solidPixels = (page, sel) => page.evaluate((sel) => {
  const c = document.querySelector(sel)
  if (!c || !c.width) return 0
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let n = 0
  for (let i = 3; i < d.length; i += 4) if (d[i]) n++
  return n
}, sel)

// 1. The site: every page is its own prerendered file, the chrome works, old links land
{
  // Prerendered: each page's HTML carries its own title, canonical and content before any script runs
  for (const [path, title] of [['/', 'Blobscape: learn'], ['/lessons/', 'Lessons ·'], ['/lessons/order/', 'Order matters · Lesson 3'], ['/sandbox/', 'Sandbox ·'], ['/experiments/creature/', 'Splat Creatures ·'], ['/experiments/forest-walk/', 'Forest Walk ·'], ['/experiments/clockwork/', 'Clockwork ·'], ['/experiments/pixel-diorama/', 'Pixel Diorama ·'], ['/experiments/dungeon-run/', 'Dungeon Run ·'], ['/experiments/scan-studio/', 'Scan Studio ·'], ['/experiments/', 'Experiments ·'], ['/engine/', 'The Blobscape engine ·']]) {
    const html = await (await fetch(base + path)).text()
    if (!html.includes(`<title>${title}`)) fails.push(`${path}: prerendered title is not "${title}…"`)
    else if (!html.includes(`<link rel="canonical" href="https://blobscape.dev${path}"`)) fails.push(`${path}: prerendered canonical is wrong`)
    else if (!/<main id="main"[^>]*>[\s\S]*<h1/.test(html)) fails.push(`${path}: prerendered page has no content`)
    else ok(`${path} is prerendered with its own title, canonical and content`)
  }
  const missing = await fetch(base + '/no-such-page/')
  if (missing.status !== 404 || !(await missing.text()).includes('noindex')) fails.push('an unknown page is not a noindex 404')
  else ok('unknown pages get the noindex 404 page')
  const sitemap = await (await fetch(base + '/sitemap.xml')).text()
  if (!sitemap.includes('https://blobscape.dev/lessons/model/') || !sitemap.includes('/experiments/fit-a-picture/') || !sitemap.includes('/experiments/creature/') || !sitemap.includes('/experiments/forest-walk/') || !sitemap.includes('/experiments/clockwork/') || !sitemap.includes('/experiments/pixel-diorama/') || !sitemap.includes('/experiments/dungeon-run/') || !sitemap.includes('/experiments/scan-studio/')) fails.push('sitemap.xml is missing pages')
  else ok('sitemap.xml lists the lessons and tools')

  const { page, res, ctx } = await open('/')
  if (res.status() !== 200) fails.push(`front page status ${res.status()}`)
  const csp = res.headers()['content-security-policy'] ?? ''
  if (!csp.includes('wasm-unsafe-eval')) fails.push('test server is not sending the production CSP')
  if (!(await page.getByRole('banner').getByRole('link', { name: 'Blobscape home' }).count())) fails.push('no Blobscape logo link in the header')
  else ok('header has the Blobscape logo')
  for (const name of ['Fit a Picture', 'Splat to Sprite']) {
    if (!(await page.locator('main').getByRole('link', { name: new RegExp(name) }).count())) fails.push(`front page does not link to ${name}`)
  }
  // Links between pages swap the page in place: no reload, focus on the new heading
  await page.evaluate(() => { window.__stayed = true })
  await page.locator('main').getByRole('link', { name: /See all .* lessons/ }).click()
  await page.waitForURL('**/lessons/')
  await page.waitForFunction(() => document.title.startsWith('Lessons'), null, { timeout: 3000 }).catch(() => {})
  if (!(await page.evaluate(() => window.__stayed))) fails.push('following a link reloaded the page')
  else if ((await page.title()) !== 'Lessons · Blobscape') fails.push(`after navigating, the title is ${await page.title()}`)
  else ok('links between pages navigate in place and update the title')
  await page.goBack()
  await page.waitForURL(base + '/')
  if (!(await page.getByRole('heading', { level: 1, name: /Learn 3D splats/ }).count())) fails.push('Back did not return to the front page')
  else ok('Back returns to the front page')
  // The theme lives in the menu: system, light or dark, stored under Blobscape's own key
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('button', { name: /^dark$/i }).click()
  const picked = await page.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('blobscape-theme')])
  if (picked[0] !== 'dark' || picked[1] !== 'dark') fails.push(`theme choice gave ${picked.join(' / ')}`)
  else ok('the menu sets and stores the theme')
  await page.waitForTimeout(600) // let color transitions (the tip button's) finish before measuring contrast
  await axe(page, 'front page, menu open, dark')
  await page.getByRole('button', { name: /^system$/i }).click()
  if (await page.evaluate(() => document.documentElement.dataset.theme || localStorage.getItem('blobscape-theme'))) fails.push('System did not clear the theme')
  await ctx.close()

  // Experiments page: every experiment listed, reached from the header, which marks it current
  {
    const ex = await open('/lessons/')
    await ex.page.getByRole('banner').getByRole('link', { name: 'Experiments', exact: true }).click()
    await ex.page.waitForURL('**/experiments/')
    await ex.page.getByRole('heading', { level: 1, name: 'Experiments' }).waitFor({ timeout: 5000 }).catch(() => {})
    const cards = ex.page.locator('main').getByRole('link', { name: /Creature|Forest Walk|Fit a Picture|Splat to Sprite/ })
    if ((await cards.count()) < 4) fails.push('experiments page does not list every experiment')
    else if ((await ex.page.getByRole('banner').getByRole('link', { name: 'Experiments', exact: true }).getAttribute('aria-current')) !== 'page') fails.push('header does not mark Experiments as the current page')
    else ok('header Experiments link opens the experiments page, which lists every experiment')
    // listed like posts: each card dated, newest first, and the order can be turned round and is kept
    const listed = () => ex.page.locator('[data-testid=experiment-list] > li').evaluateAll((lis) => lis.map((li) => [li.querySelector('a').textContent.replace(' →', ''), li.querySelector('time')?.dateTime ?? '']))
    const newest = await listed()
    await ex.page.getByRole('button', { name: 'Oldest first' }).click()
    const oldest = await listed()
    await ex.page.reload()
    await ex.page.getByRole('button', { name: 'Oldest first', pressed: true }).waitFor({ timeout: 5000 }).catch(() => {})
    const kept = await listed()
    const sorted = newest.every((c, i) => /^\d{4}-\d\d-\d\d$/.test(c[1]) && (i === 0 || newest[i - 1][1] >= c[1]))
    if (newest.length < 8 || !sorted || JSON.stringify(oldest) !== JSON.stringify([...newest].reverse()) || JSON.stringify(kept) !== JSON.stringify(oldest)) fails.push(`experiments page dates: ${JSON.stringify({ newest, oldest: oldest.map((c) => c[0]), kept: kept.map((c) => c[0]) })}`)
    else ok(`experiments page: ${newest.length} dated cards, newest first (${newest[0][0]}, ${newest[0][1]}), and "Oldest first" turns the list round and is kept`)
    await ex.page.getByRole('button', { name: 'Newest first' }).click()
    await axe(ex.page, 'experiments page')
    // an experiment's own page carries the dates too: drawn by the app, and in the HTML a crawler reads
    const html = await (await fetch(base + '/experiments/creature/')).text()
    await ex.page.goto(base + '/experiments/fit-a-picture/')
    const pageDates = await ex.page.getByTestId('page-dates').textContent({ timeout: 10000 }).catch(() => '')
    if (!/^Published [A-Z][a-z]{2} \d{1,2}, \d{4}( · Updated [A-Z][a-z]{2} \d{1,2}, \d{4})?$/.test(pageDates ?? '') || !/data-testid="page-dates">Published <time datetime="\d{4}-\d\d-\d\d">/.test(html) || !/"datePublished":"\d{4}-\d\d-\d\d","dateModified":"\d{4}-\d\d-\d\d"/.test(html)) fails.push(`experiment page dates: the page reads "${pageDates}", or the prerendered HTML lacks them`)
    else ok(`an experiment's page says when it was published ("${pageDates}"), and its HTML carries published and updated dates`)
    await ex.ctx.close()
  }

  // A link to a section of the front page lands on that section
  const tools = await open('/#experiments')
  await tools.page.waitForTimeout(800)
  const top = await tools.page.evaluate(() => document.getElementById('experiments')?.getBoundingClientRect().top ?? -1)
  if (top < 0 || top > 200) fails.push(`/#experiments: the section is ${top}px down, not in view`)
  else ok('/#experiments opens at the experiments section')
  await tools.ctx.close()

  // Old #/ links (from mattblack.space/experiments/blobscape/#/…) land on the page they meant
  const old = await open('/#/lesson/order')
  await old.page.waitForTimeout(500)
  if (new URL(old.page.url()).pathname !== '/lessons/order/') fails.push(`#/lesson/order went to ${old.page.url()}`)
  else ok('an old #/lesson/ link lands on its lesson page')
  await old.ctx.close()
}

// 2. Splat to Sprite: renders, previews, bakes
for (const [label, opts] of [['desktop', { viewport: { width: 1440, height: 1000 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
  const { page, ctx } = await open('/experiments/splat-to-sprite/', opts)
  await page.waitForFunction(() => /[1-9]/.test(document.querySelector('[data-testid=splat-count]')?.textContent ?? ''), null, { timeout: 30000 })
  ok(`${label}: ${await page.textContent('[data-testid=splat-count]')} loaded`)
  await page.waitForFunction(() => {
    const c = document.querySelector('[data-testid=sprite-preview]')
    if (!c || !c.width) return false
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]) n++
    return n > 50
  }, null, { timeout: 30000 }).catch(() => {})
  const n = await solidPixels(page, '[data-testid=sprite-preview]')
  if (n < 50) fails.push(`${label}: sprite preview has only ${n} solid pixels`)
  else ok(`${label}: sprite preview has ${n} solid pixels`)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow > 0) fails.push(`${label}: page scrolls sideways by ${overflow}px`)
  await axe(page, label)
  if (label === 'desktop') {
    // Settings sit in tabs: arrow keys move between them, and only one panel shows
    await page.getByRole('tab', { name: /Prop Type/ }).focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    const colorOn = (await page.getByRole('tab', { name: /Finish/ }).getAttribute('aria-selected')) === 'true'
    const paletteShows = await page.getByRole('combobox', { name: 'Palette' }).isVisible()
    const turnHidden = !(await page.getByRole('slider', { name: 'Turn' }).isVisible())
    if (!colorOn || !paletteShows || !turnHidden) fails.push(`tabs: color selected ${colorOn}, palette visible ${paletteShows}, camera hidden ${turnHidden}`)
    else ok('arrow keys move through the settings tabs')
    await axe(page, 'desktop color tab')
    await page.getByRole('tab', { name: /View/ }).click()
    // The header stays on screen once the page scrolls
    await page.evaluate(() => window.scrollTo(0, 900))
    const top = await page.getByRole('banner').evaluate((h) => h.getBoundingClientRect().top)
    if (top !== 0) fails.push(`header scrolled away (top ${top})`)
    else ok('header stays stuck to the top while scrolling')
    await page.evaluate(() => window.scrollTo(0, 0))
    await tabClick(page.getByRole('button', { name: 'Isometric' }))
    if ((await page.getByRole('button', { name: 'Isometric' }).getAttribute('aria-pressed')) !== 'true') fails.push('Isometric preset does not show as selected')
    else ok('Isometric preset shows as selected')
    await tabClick(page.getByRole('button', { name: '¾ view' }))
    await page.getByRole('slider', { name: 'Turn' }).fill('30')
    await tabClick(page.getByRole('button', { name: 'Bake sprite sheet' }))
    await page.waitForSelector('[data-testid=sheet] img', { timeout: 60000 })
    const dims = await page.evaluate(async () => {
      const img = document.querySelector('[data-testid=sheet] img')
      await img.decode()
      return [img.naturalWidth, img.naturalHeight]
    })
    if (dims[0] !== 32 || dims[1] !== 128) fails.push(`4-direction sheet is ${dims.join('×')}, expected 32×128`)
    else ok('baked a 4-direction 32×128 sheet')
    const frames = await page.locator('[data-testid=sheet] ol li').count()
    if (frames !== 4) fails.push(`sheet shows ${frames} frames, expected 4`)
    else ok('sheet shows its 4 frames, labeled')
    await axe(page, 'desktop baked')
    await page.getByRole('slider', { name: 'Turn' }).fill('60')
    if (!(await page.getByRole('status').filter({ hasText: 'changed since' }).count())) fails.push('changing a setting does not mark the sheet out of date')
    else ok('changing a setting marks the sheet out of date')
  }
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(shots, `splat-to-sprite-${label}.png`), fullPage: true })
  await ctx.close()
}

// A user's own .ply: the standard 3DGS layout, 2,000 splats on a sphere
function ballPly(n = 2000) {
  const props = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3']
  const header = `ply\nformat binary_little_endian 1.0\nelement vertex ${n}\n${props.map((p) => `property float ${p}`).join('\n')}\nend_header\n`
  const body = new Float32Array(n * props.length)
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), t = i * 2.39996
    // SH DC term: color = 0.5 + 0.28209 * f_dc; opacity and scale are stored pre-activation
    body.set([Math.cos(t) * r, y, Math.sin(t) * r, 1.5, -1.2, -1.2, 4, -3, -3, -3, 1, 0, 0, 0], i * props.length)
  }
  return Buffer.concat([Buffer.from(header), Buffer.from(body.buffer)])
}

// 3. The .ply in Splat to Sprite
{
  const buf = ballPly()
  const { page, ctx } = await open('/experiments/splat-to-sprite/', { viewport: { width: 1280, height: 900 } })
  await page.waitForFunction(() => /[1-9]/.test(document.querySelector('[data-testid=splat-count]')?.textContent ?? ''), null, { timeout: 30000 })
  await page.setInputFiles('input[type=file]', { name: 'ball.ply', mimeType: 'application/octet-stream', buffer: buf })
  await page.waitForFunction(() => document.querySelector('[data-testid=splat-count]')?.textContent?.startsWith('2,000'), null, { timeout: 30000 }).catch(() => {})
  const count = await page.textContent('[data-testid=splat-count]')
  if (!count.startsWith('2,000')) fails.push(`.ply upload shows "${count}", expected 2,000 splats`)
  else {
    await page.waitForTimeout(1500)
    const solid = await solidPixels(page, '[data-testid=sprite-preview]')
    if (solid < 100) fails.push(`.ply sprite has only ${solid} solid pixels`)
    else ok(`a dropped .ply loads (2,000 splats) and makes a ${solid}-pixel sprite`)
  }
  // A file that isn't a splat: an error shows, and the object on screen keeps its name
  await page.setInputFiles('input[type=file]', { name: 'junk.ply', mimeType: 'application/octet-stream', buffer: Buffer.from('not a splat at all') })
  const alert = await page.getByRole('alert').textContent({ timeout: 15000 }).catch(() => '')
  const stillBall = await page.getByRole('button', { name: 'ball' }).count()
  if (!alert.includes("didn't load")) fails.push(`bad file: no error shown (got "${alert}")`)
  else if (!stillBall) fails.push('bad file relabeled the loaded object')
  else ok('a bad file shows an error and keeps the loaded object and its name')
  await page.screenshot({ path: join(shots, 'splat-to-sprite-ply.png') })
  await ctx.close()
}

// 4. Dark theme renders with the dark palette
{
  const { page, ctx } = await open('/experiments/splat-to-sprite/', { colorScheme: 'dark', viewport: { width: 1280, height: 900 } })
  // Nothing stored: the page follows the system, so a dark preference gives the dark paper
  const paper = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  if (paper !== 'rgb(20, 22, 31)') fails.push(`dark preference gave a ${paper} page`)
  else ok('dark preference applied before first paint')
  await page.waitForTimeout(2500)
  await axe(page, 'dark')
  await page.screenshot({ path: join(shots, 'splat-to-sprite-dark.png') })
  await ctx.close()
}

// 5. Fit a Picture: trains in a worker, graphs the loss, views, pause/step, adding blobs, own pictures
const stepNow = (page) => page.textContent('[data-testid=step]').then((t) => Number(t.replace(/,/g, '')))
const blobsNow = (page) => page.textContent('[data-testid=blob-count]').then((t) => Number(t.replace(/\D/g, '')))
for (const [label, opts] of [['desktop', { viewport: { width: 1440, height: 1000 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
  const { page, ctx } = await open('/experiments/fit-a-picture/', opts)
  await page.waitForFunction(() => Number(document.querySelector('[data-testid=step]')?.textContent?.replace(/,/g, '')) > 30, null, { timeout: 30000 }).catch(() => {})
  const steps = await stepNow(page)
  if (steps <= 30) fails.push(`fit ${label}: training stuck at step ${steps}`)
  else ok(`fit ${label}: training runs in the worker (step ${steps})`)
  const points = Number(await page.getAttribute('[data-testid=loss-graph]', 'data-points'))
  if (points < 30) fails.push(`fit ${label}: loss graph has ${points} points`)
  else ok(`fit ${label}: loss graph has ${points} points`)
  const lit = await page.evaluate(() => {
    const c = document.querySelector('[data-testid=fit]')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let sum = 0
    for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]
    return sum / (d.length / 4) / 3
  })
  if (lit < 20) fails.push(`fit ${label}: the fit canvas is blank (mean ${lit.toFixed(1)})`)
  else ok(`fit ${label}: the fit canvas is drawn (mean level ${lit.toFixed(0)})`)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow > 0) fails.push(`fit ${label}: page scrolls sideways by ${overflow}px`)
  await axe(page, `fit ${label}`)
  if (label === 'desktop') {
    // Pause holds the step; Step once moves it by exactly one
    await tabClick(page.getByRole('button', { name: 'Pause' }))
    await page.waitForTimeout(300)
    const held = await stepNow(page)
    await page.waitForTimeout(500)
    if ((await stepNow(page)) !== held) fails.push('fit: pause does not stop training')
    await tabClick(page.getByRole('button', { name: 'Step once' }))
    await page.waitForFunction((h) => Number(document.querySelector('[data-testid=step]').textContent.replace(/,/g, '')) === h + 1, held, { timeout: 5000 }).catch(() => {})
    if ((await stepNow(page)) !== held + 1) fails.push(`fit: step once went from ${held} to ${await stepNow(page)}`)
    else ok('fit: pause holds, step once moves one step')
    // A click on the fit adds blobs there
    const before = await blobsNow(page)
    await page.getByTestId('fit').click({ position: { x: 100, y: 80 } })
    await page.waitForFunction((b) => Number(document.querySelector('[data-testid=blob-count]').textContent.replace(/\D/g, '')) > b, before, { timeout: 5000 }).catch(() => {})
    const after = await blobsNow(page)
    if (after <= before) fails.push(`fit: clicking did not add blobs (${before} → ${after})`)
    else ok(`fit: a click adds blobs (${before} → ${after})`)
    // Keyboard: focus the fit, aim with the arrows, Enter adds
    await page.getByTestId('fit').focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Enter')
    await page.waitForFunction((b) => Number(document.querySelector('[data-testid=blob-count]').textContent.replace(/\D/g, '')) > b, after, { timeout: 5000 }).catch(() => {})
    if ((await blobsNow(page)) <= after) fails.push('fit: Enter on the focused fit does not add blobs')
    else ok('fit: keyboard adds blobs (arrows aim, Enter adds)')
    // The loss graph reads out values from the keyboard
    await page.getByTestId('loss-graph').locator('svg').focus()
    await page.keyboard.press('Home')
    const said = await page.getByTestId('loss-graph').locator('[aria-live]').textContent()
    if (!/^Step \d/.test(said)) fails.push(`fit: loss graph keyboard readout is "${said}"`)
    else ok(`fit: loss graph reads out from the keyboard ("${said}")`)
    // Views, from the Picture tab
    for (const v of ['Blobs', 'Error']) {
      await tabClick(page.getByRole('button', { name: v, exact: true }))
      await page.waitForTimeout(400)
      if ((await page.getByRole('button', { name: v, exact: true }).getAttribute('aria-pressed')) !== 'true') fails.push(`fit: ${v} view not selected`)
      await page.screenshot({ path: join(shots, `fit-a-picture-${v.toLowerCase()}.png`) })
    }
    ok('fit: blobs and error views switch')
    await axe(page, 'fit error view')
    await tabClick(page.getByRole('button', { name: 'Fit', exact: true }))
    await tabClick(page.getByRole('button', { name: 'Resume' }))
    // Prune now and add 100, from the Training tab
    await page.getByRole('tab', { name: /Training/ }).click()
    const b0 = await blobsNow(page)
    await tabClick(page.getByRole('button', { name: "Add 100 where it's wrong" }))
    await page.waitForTimeout(600)
    if ((await blobsNow(page)) < b0 + 50) fails.push(`fit: add 100 went ${b0} → ${await blobsNow(page)}`)
    else ok('fit: "Add 100 where it\'s wrong" adds blobs')
    await tabClick(page.getByRole('button', { name: 'Prune now' }))
    await page.waitForFunction(() => /prune/i.test(document.querySelector('[data-testid=log]').textContent), null, { timeout: 5000 }).catch(() => {})
    if (!/prune/i.test(await page.textContent('[data-testid=log]'))) fails.push('fit: prune now leaves no log line')
    else ok('fit: prune now is logged')
    await axe(page, 'fit blobs tab')
    // The user's own picture: a PNG made from a screenshot, then a file that isn't a picture
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: 300, height: 200 } })
    await page.getByRole('tab', { name: /Picture/ }).click()
    await page.setInputFiles('input[type=file]', { name: 'mine.png', mimeType: 'image/png', buffer: png })
    await page.waitForFunction(() => /mine/.test(document.body.textContent), null, { timeout: 10000 }).catch(() => {})
    if (!(await page.getByRole('button', { name: 'mine' }).count())) fails.push('fit: own picture did not load')
    else ok('fit: an own picture loads and the fit restarts')
    await page.setInputFiles('input[type=file]', { name: 'junk.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') })
    const alert = await page.getByRole('alert').textContent({ timeout: 5000 }).catch(() => '')
    if (!alert.includes("didn't open")) fails.push(`fit: bad file shows "${alert}"`)
    else ok('fit: a bad file shows an error')
    await tabClick(page.getByRole('button', { name: 'Marbles' }))
  }
  await page.waitForTimeout(3000)
  await page.screenshot({ path: join(shots, `fit-a-picture-${label}.png`), fullPage: true })
  await ctx.close()
}
{
  const { page, ctx } = await open('/experiments/fit-a-picture/', { colorScheme: 'dark', viewport: { width: 1280, height: 900 } })
  await page.waitForTimeout(2500)
  await axe(page, 'fit dark')
  await page.screenshot({ path: join(shots, 'fit-a-picture-dark.png') })
  await ctx.close()
}

// 6. Blobscape: lessons render and tick goals, the order lesson draws in software, the sandbox edits and undoes
{
  const B = '/'
  const count = (page) => page.textContent('[data-testid=blob-count]').then((t) => Number(t.replace(/\D/g, '')))
  for (const [label, opts] of [['desktop', { viewport: { width: 1440, height: 1000 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
    const { page, ctx } = await open(B, opts)
    const lessons = await page.locator('main a[href^="/lessons/"]:not([href="/lessons/"])').evaluateAll((as) => new Set(as.map((a) => a.getAttribute('href'))).size)
    if (lessons < 17) fails.push(`blobscape ${label}: home lists ${lessons} lessons`)
    else ok(`blobscape ${label}: home lists the lessons`)
    await axe(page, `blobscape ${label} home`)
    await page.screenshot({ path: join(shots, `blobscape-home-${label}.png`), fullPage: true })
    for (const id of ['lessons', 'one-blob', 'footprint', 'order', 'many', 'angle', 'paint', 'formats', 'break', 'one-bone', 'weights', 'twist', 'walk', 'model', 'shoot', 'fuzzy', 'floaters', 'lighting', 'sandbox', 'creature', 'forest-walk', 'clockwork', 'pixel-diorama', 'dungeon-run', 'scan-studio', 'contact']) {
      // headless WebGPU can't present to a canvas, so Creature and Forest Walk draw off-screen here
      await page.goto(base + (['creature', 'forest-walk', 'clockwork', 'pixel-diorama', 'dungeon-run', 'scan-studio'].includes(id) ? `/experiments/${id}/?offscreen=1` : ['sandbox', 'lessons', 'contact'].includes(id) ? `/${id}/` : `/lessons/${id}/`))
      await page.waitForTimeout(1500)
      const focused = await page.evaluate(() => document.activeElement?.tagName)
      if (focused !== 'H1') fails.push(`blobscape ${label} ${id}: focus is on ${focused}, not the heading`)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      if (overflow > 0) fails.push(`blobscape ${label} ${id}: page scrolls sideways by ${overflow}px`)
      await axe(page, `blobscape ${label} ${id}`)
      await page.screenshot({ path: join(shots, `blobscape-${id}-${label}.png`), fullPage: label === 'phone' })
    }
    await ctx.close()
  }

  const { page, ctx } = await open('/lessons/one-blob/', { viewport: { width: 1440, height: 1000 } })
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForTimeout(500)
  const caseTop = () => page.locator('.case').first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
  const topBefore = await caseTop()
  await page.getByRole('button', { name: 'Pancake' }).click()
  await page.getByRole('slider', { name: 'Roll (z)' }).fill('40')
  await page.waitForFunction(() => document.querySelector('[data-testid=goal-count]')?.textContent.startsWith('2 of'), null, { timeout: 5000 }).catch(() => {})
  const goals = await page.textContent('[data-testid=goal-count]')
  if (!goals.startsWith('2 of')) fails.push(`blobscape: one blob goals show "${goals}" after pancake and turn`)
  else ok('blobscape: lesson goals tick off (pancake, turn)')
  // A ticked goal is a toast over the page: nothing on the page moves to make room for it
  const stepToasts = await page.getByTestId('toast-step').count()
  const moved = (await caseTop()) - topBefore
  if (stepToasts < 1 || Math.abs(moved) > 0.5) fails.push(`blobscape toasts: ${stepToasts} step toasts, the view moved ${moved}px`)
  else ok(`blobscape toasts: ${stepToasts} goal toasts, and the view stayed put`)
  await page.screenshot({ path: join(shots, 'blobscape-toast-step.png') })
  await axe(page, 'blobscape lesson with toasts')
  // Finishing every goal shows the lesson toast, with its links
  await page.getByRole('button', { name: 'Needle' }).click()
  await page.getByRole('slider', { name: 'Opacity' }).fill('0.1')
  await page.waitForFunction(() => document.querySelector('[data-testid=goal-count]')?.textContent.startsWith('4 of'), null, { timeout: 5000 }).catch(() => {})
  if (!(await page.getByTestId('toast-lesson').count())) fails.push(`blobscape toasts: no lesson toast at ${await page.textContent('[data-testid=goal-count]')}`)
  else ok('blobscape toasts: finishing the lesson shows the lesson toast')
  await page.screenshot({ path: join(shots, 'blobscape-toast-lesson.png') })
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForTimeout(300)
  if (await page.locator('[data-testid^=toast-]').count()) fails.push('blobscape toasts: a reload brought old toasts back')
  // goals ticked by the steps above are back to two for the checks that follow
  await page.getByRole('button', { name: 'Pancake' }).click()
  await page.getByRole('slider', { name: 'Roll (z)' }).fill('40')
  await page.waitForFunction(() => document.querySelector('[data-testid=goal-count]')?.textContent.startsWith('2 of'), null, { timeout: 5000 }).catch(() => {})
  {
    // Phone: the controls tab stays where you put it when a goal ticks (it used to jump to the next goal's tab)
    const phone = await open('/lessons/one-blob/', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await phone.page.evaluate(() => localStorage.clear())
    await phone.page.reload()
    await phone.page.waitForTimeout(500)
    const pressed = () => phone.page.locator('[aria-label="Show controls for"] [aria-pressed=true]').textContent()
    const tabBefore = await pressed()
    await phone.page.getByRole('button', { name: 'Pancake' }).click()
    await phone.page.getByRole('button', { name: 'Needle' }).click()
    await phone.page.waitForTimeout(300)
    const tabAfter = await pressed()
    if (!/Shape/.test(tabBefore) || tabAfter !== tabBefore) fails.push(`blobscape phone tabs: "${tabBefore}" became "${tabAfter}" when the shape goals ticked`)
    else ok('blobscape phone tabs: ticking goals leaves the controls tab alone')
    await phone.page.screenshot({ path: join(shots, 'blobscape-toast-phone.png') })
    await phone.ctx.close()
  }
  await page.reload()
  await page.waitForSelector('[data-testid=goal-count]')
  if (!(await page.textContent('[data-testid=goal-count]')).startsWith('2 of')) fails.push('blobscape: goals are not kept after a reload')
  else ok('blobscape: goals are kept in this browser')

  // Order: the software views draw something, and list order is reported wrong at the start
  await page.goto(base + '/lessons/order/')
  await page.waitForTimeout(800)
  const lit = await solidPixels(page, '[data-testid=view-yours]')
  if (lit < 1000) fails.push(`blobscape order: software view has ${lit} lit pixels`)
  else ok(`blobscape order: software renderer draws (${lit} pixels)`)
  if (!(await page.getByText('Your order: wrong').count())) fails.push('blobscape order: list order not reported wrong from the front')
  await page.getByRole('slider', { name: 'Turn' }).fill('180')
  if (!(await page.getByText('Your order: right by luck').count())) fails.push('blobscape order: list order not right from behind')
  else ok('blobscape order: list order is wrong from the front and right from behind')

  // Front page chrome: the menu, the footer, the tip button and the search metadata
  await page.goto(base + '/')
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Menu' }).click()
  const menuLinks = await page.locator('[popover] a').count()
  if (!(await page.locator('[popover]:popover-open').count()) || menuLinks < 6) fails.push(`blobscape menu: open ${await page.locator('[popover]:popover-open').count()}, ${menuLinks} links`)
  else ok(`blobscape menu: opens with ${menuLinks} links`)
  await axe(page, 'blobscape menu open')
  await page.screenshot({ path: join(shots, 'blobscape-menu.png') })
  await page.keyboard.press('Escape')
  if (await page.locator('[popover]:popover-open').count()) fails.push('blobscape menu: Escape left it open')
  if (!(await page.locator('a.tipjar').count())) fails.push('blobscape: no tip button on the front page')
  const ld = await page.evaluate(() => { try { return JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'].length } catch { return 0 } })
  const og = await page.getAttribute('meta[property="og:image"]', 'content')
  if (!ld || !og) fails.push(`blobscape seo: structured data ${ld}, og:image ${og}`)
  else ok('blobscape seo: structured data parses and the share image is set')
  const shareImage = await page.request.get(base + B + 'og.png')
  if (!shareImage.ok()) fails.push(`blobscape seo: og.png gave ${shareImage.status()}`)
  await page.locator('footer').scrollIntoViewIfNeeded()
  // the footer's Experiments column stays short: the three newest, then the way to the rest
  const footLinks = await page.locator('footer nav[aria-label="Experiments"] a').evaluateAll((as) => as.map((a) => [a.textContent, a.getAttribute('href')]))
  if (footLinks.length !== 4 || footLinks[3][0] !== 'All experiments' || footLinks[3][1] !== '/experiments/') fails.push(`blobscape footer: expected three experiments and "All experiments", got ${JSON.stringify(footLinks)}`)
  else ok(`blobscape footer: lists ${footLinks.slice(0, 3).map((l) => l[0]).join(', ')} and a link to all experiments`)
  await page.waitForTimeout(600)
  if (!(await page.locator('a.tipjar[data-tucked]').count())) fails.push('blobscape: the tip button stays over the footer')
  else ok('blobscape: the tip button tucks away at the footer')
  await page.goto(base + '/lessons/paint/')
  await page.waitForTimeout(500)
  if (!(await page.title()).startsWith('Paint · Lesson 6')) fails.push(`blobscape: lesson title is "${await page.title()}"`)
  else ok('blobscape: each page sets its own title')
  if (await page.locator('a.tipjar').count()) fails.push('blobscape: the tip button covers a lesson')

  // Color by angle: degree 3 keeps up with a soft shine and falls behind a sharp one
  const goalCount = () => page.textContent('[data-testid=goal-count]')
  await page.goto(base + '/lessons/angle/')
  await page.waitForTimeout(800)
  const peakAt = async (d, s) => {
    await page.getByRole('slider', { name: 'Degree' }).fill(String(d))
    await page.getByRole('slider', { name: 'Sharpness' }).fill(String(s))
    return Number((await page.textContent('[data-testid=sh-readout]')).match(/(\d+)% as bright/)[1])
  }
  const soft = await peakAt(3, 8), sharp = await peakAt(3, 120), low = await peakAt(1, 120)
  if (!(soft > 90 && sharp < 70 && low < sharp)) fails.push(`blobscape angle: stored highlight ${soft}% / ${sharp}% / ${low}%`)
  else ok(`blobscape angle: degree 3 keeps ${soft}% of a soft shine, ${sharp}% of a sharp one, degree 1 ${low}%`)

  // Paint: spraying the square covers it
  await page.goto(base + '/lessons/paint/')
  await page.waitForTimeout(800)
  const pbox = await page.getByTestId('viewport').boundingBox()
  for (let row = 0; row < 8; row++) {
    await page.mouse.move(pbox.x + pbox.width * 0.3, pbox.y + pbox.height * (0.3 + row * 0.06))
    await page.mouse.down()
    for (let k = 0; k <= 20; k++) await page.mouse.move(pbox.x + pbox.width * (0.3 + k * 0.02), pbox.y + pbox.height * (0.3 + row * 0.06))
    await page.mouse.up()
  }
  const covered = Number((await page.textContent('[data-testid=coverage]')).replace(/\D/g, ''))
  if (covered < 90) fails.push(`blobscape paint: spraying covered ${covered}%`)
  else ok(`blobscape paint: spraying covers ${covered}% of the square`)
  const painted = await count(page)
  await page.getByRole('button', { name: 'Erase', exact: true }).click()
  await page.mouse.move(pbox.x + pbox.width * 0.4, pbox.y + pbox.height * 0.45)
  await page.mouse.down()
  for (let k = 0; k <= 10; k++) await page.mouse.move(pbox.x + pbox.width * (0.4 + k * 0.02), pbox.y + pbox.height * 0.45)
  await page.mouse.up()
  const erased = await count(page)
  if (!(erased < painted)) fails.push(`blobscape paint: erasing went ${painted} → ${erased} blobs`)
  else ok(`blobscape paint: the eraser rubs out ${painted - erased} blobs`)

  // Splat files: .spz is the smallest of the three and is read back
  await page.goto(base + '/lessons/formats/')
  await page.waitForFunction(() => /\.spz \d/.test(document.body.textContent), null, { timeout: 15000 }).catch(() => {})
  await page.getByRole('button', { name: /^\.spz/ }).click()
  await page.waitForFunction(() => /as \.spz:/.test(document.querySelector('[data-testid=file-readout]')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {})
  const fileText = await page.textContent('[data-testid=file-readout]')
  const perBlob = Number(fileText.match(/([\d.]+) bytes each/)?.[1])
  if (!(perBlob > 4 && perBlob < 20)) fails.push(`blobscape formats: .spz readout "${fileText}"`)
  else ok(`blobscape formats: .spz is ${perBlob} bytes per blob, read back and shown`)

  // Photo shoot: one front photo fits only the front; four round it fit every side, and the back goal ticks
  await page.goto(base + '/lessons/shoot/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const shootScore = async () => {
    await page.waitForFunction(() => /Every side/.test(document.querySelector('[data-testid=shoot-score]')?.textContent ?? ''), null, { timeout: 60000 }).catch(() => {})
    return Number((await page.textContent('[data-testid=shoot-score]')).match(/Every side: (\d+)%/)?.[1])
  }
  const oneSide = await shootScore()
  await page.getByRole('slider', { name: 'Turn' }).fill('180')
  await page.waitForTimeout(300)
  const backDone = await page.textContent('[data-testid=goal-count]')
  for (const deg of [90, 180, 270]) await page.getByRole('button', { name: new RegExp(`\\(${deg}°\\)`) }).click()
  await page.waitForTimeout(600)
  const allSides = await shootScore()
  if (!(oneSide < 40 && allSides > 90 && /^1 of/.test(backDone))) fails.push(`blobscape shoot: front photo ${oneSide}%, four round ${allSides}%, goals after the back ${backDone}`)
  else ok(`blobscape shoot: one front photo fits ${oneSide}% of every side, four round it ${allSides}%`)

  // Fuzzy things: the grass mesh loses its blade tips, the splats keep them; light gets through the splat fluff only
  await page.goto(base + '/lessons/fuzzy/')
  await page.waitForTimeout(1500)
  const grassText = await page.textContent('[data-testid=fuzzy-readout]')
  await page.getByRole('button', { name: 'Dandelion clock' }).click()
  await page.waitForTimeout(1500)
  const fluffText = await page.textContent('[data-testid=fuzzy-readout]')
  if (!/splats 28 of 28, mesh 0 of 28/.test(grassText) || !/splats [1-9]\d%, mesh (0%|no fluff left)/.test(fluffText)) fails.push(`blobscape fuzzy: "${grassText}" / "${fluffText}"`)
  else ok('blobscape fuzzy: splats keep every blade and let light through the fluff; the mesh does neither')

  // Floaters: a two-photo capture trains, the floater cut lifts every side a little, eight photos lift it a lot
  await page.goto(base + '/lessons/floaters/')
  const floatersText = async () => {
    await page.waitForFunction(() => /Every side/.test(document.querySelector('[data-testid=floaters-readout]')?.textContent ?? ''), null, { timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(600)
    return page.textContent('[data-testid=floaters-readout]')
  }
  const sides = (t) => t.match(/Every side (\d+)% → (\d+)%/)?.slice(1).map(Number) ?? []
  const [rawQuick] = sides(await floatersText())
  await page.getByRole('slider', { name: 'Floaters' }).fill('0.8')
  const [, cleanedQuick] = sides(await floatersText())
  await page.getByRole('button', { name: 'Eight all round' }).click()
  const [rawRound] = sides(await floatersText())
  if (!(cleanedQuick > rawQuick && rawRound > cleanedQuick + 15)) fails.push(`blobscape floaters: quick ${rawQuick}% → ${cleanedQuick}% cleaned, eight photos ${rawRound}%`)
  else ok(`blobscape floaters: cleanup lifts two photos from ${rawQuick}% to ${cleanedQuick}%, eight photos give ${rawRound}%`)

  // Lighting is baked: moving the lamp leaves the scan behind; taking the old light out with the shape known catches up
  await page.goto(base + '/lessons/lighting/')
  await page.waitForTimeout(1500)
  await page.getByRole('slider', { name: 'Lamp', exact: true }).fill('125')
  await page.waitForTimeout(300)
  const lightingScore = async () => Number((await page.textContent('[data-testid=lighting-readout]')).match(/(\d+)%/)?.[1])
  const stuck = await lightingScore()
  await page.getByRole('button', { name: 'Take the old light out' }).click()
  await page.getByRole('slider', { name: 'Where the capture’s lamp was' }).fill('-55')
  await page.getByLabel('Know the scene’s shape').check()
  await page.waitForTimeout(300)
  const relitScore = await lightingScore()
  if (!(stuck <= 5 && relitScore >= 95)) fails.push(`blobscape lighting: as captured ${stuck}%, relit with the shape ${relitScore}%`)
  else ok(`blobscape lighting: the scan stays at ${stuck}% when the lamp moves, ${relitScore}% once the old light and shadows come out`)

  // Break it: shrink, explode, and put it back
  await page.goto(base + '/lessons/break/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForTimeout(800)
  await page.getByRole('slider', { name: 'Size' }).fill('0.1')
  await page.getByRole('slider', { name: 'Explode' }).fill('0.8')
  await page.getByRole('slider', { name: 'Explode' }).fill('0')
  await page.getByRole('slider', { name: 'Size' }).fill('1')
  if (!(await goalCount()).startsWith('3 of')) fails.push(`blobscape break: goals show "${await goalCount()}"`)
  else ok('blobscape break: shrink, explode and put back tick all three goals')

  // Rigs: each new lesson's goals tick from the model's state
  const goalsAt = async (n) => {
    await page.waitForFunction((k) => document.querySelector('[data-testid=goal-count]')?.textContent.startsWith(`${k} of`), n, { timeout: 8000 }).catch(() => {})
    return goalCount()
  }
  const fresh = async (id) => { await page.goto(base + `/lessons/${id}/`); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(800) }
  const slider = (name) => page.getByRole('slider', { name, exact: true })
  await fresh('one-bone')
  await slider('Lift').fill('60')
  await slider('Cut').fill('0.5')
  await slider('Cut').fill('-0.5')
  await slider('Cut').fill('0')
  if (!(await goalsAt(4)).startsWith('4 of')) fails.push(`blobscape one bone: goals show "${await goalCount()}"`)
  else ok('blobscape one bone: lift, tear, swing and seam tick')

  await fresh('weights')
  await slider('Bend').fill('90')
  const gapText = await page.textContent('[data-testid=gap]')
  await slider('Blend over').fill('0.4')
  const smoothText = await page.textContent('[data-testid=gap]')
  await slider('Blend over').fill('2')
  await slider('Blend over').fill('0.4')
  await slider('Centerd at').fill('0.5')
  if (!(await goalsAt(4)).startsWith('4 of')) fails.push(`blobscape weights: goals show "${await goalCount()}" (hard: ${gapText} / blended: ${smoothText})`)
  else ok('blobscape weights: crack, smooth, rubber and offset tick')

  await fresh('twist')
  await slider('Twist').fill('170')
  await slider('Twist').fill('30')
  await slider('Blend over').fill('0')
  await slider('Twist').fill('170')
  if (!(await goalsAt(3)).startsWith('3 of')) fails.push(`blobscape twist: goals show "${await goalCount()}" (${await page.textContent('[data-testid=kept]')})`)
  else ok('blobscape twist: flat, small and hard tick')
  const kept = await page.textContent('[data-testid=kept]')
  const [plainPct, avgPct] = [...kept.matchAll(/(\d+)%/g)].map((m) => Number(m[1]))
  await slider('Blend over').fill('0.5')
  const [p2, a2] = [...(await page.textContent('[data-testid=kept]')).matchAll(/(\d+)%/g)].map((m) => Number(m[1]))
  if (!(p2 < 10 && a2 > 80)) fails.push(`blobscape twist: at 170° blended matrices keep ${p2}%, averaged turns ${a2}%`)
  else ok(`blobscape twist: at 170° blended matrices keep ${p2}% of a blob, averaged turns ${a2}% (hard weights ${plainPct}/${avgPct}%)`)

  await fresh('walk')
  await page.getByRole('button', { name: '2: contacts only' }).click()
  await page.waitForTimeout(2000)
  await page.getByRole('button', { name: '4: with passing' }).click()
  await page.getByLabel('Hold each key (no in-betweens)').check()
  await slider('Step time').fill('1.5')
  await page.waitForTimeout(2000)
  await page.getByLabel('Hold each key (no in-betweens)').uncheck()
  await slider('Step time').fill('0.9')
  const feet = Number((await page.textContent('[data-testid=slip]')).match(/([\d.]+) m\/s/)[1])
  await slider('Speed').fill(String(Math.round(feet * 20) / 20))
  await page.waitForTimeout(300)
  await slider('Step time').fill('0.45')
  await slider('Speed').fill(String(Math.round(feet * 2 * 20) / 20))
  if (!(await goalsAt(4)).startsWith('4 of')) fails.push(`blobscape walk: goals show "${await goalCount()}" (${await page.textContent('[data-testid=slip]')})`)
  else ok(`blobscape walk: two keys, held keys, grip and run tick (feet at ${feet} m/s)`)

  await fresh('model')
  await slider('Level').fill('8')
  await page.waitForTimeout(600)
  await slider('Level').fill('1')
  await page.getByRole('button', { name: '16', exact: true }).click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: '48', exact: true }).click()
  if (!(await goalsAt(3)).startsWith('3 of')) fails.push(`blobscape model: goals show "${await goalCount()}" (${await page.textContent('[data-testid=mesh-readout]')})`)
  else ok(`blobscape model: falls apart, goes lumpy and keeps a good mesh (${await page.textContent('[data-testid=mesh-readout]')})`)

  // Creature: our engine draws the fox off-screen; both files come out
  {
    const c = await open('/experiments/creature/?offscreen=1', { viewport: { width: 1280, height: 900 } })
    if (!(await c.page.locator('[data-testid=creature-loading]').count())) fails.push('blobscape creature: no loading note while the engine starts')
    await c.page.waitForFunction(() => window.__creature, null, { timeout: 60000 }).catch(() => {})
    const orange = await c.page.evaluate(async () => {
      const cr = window.__creature
      if (!cr) return -1
      await cr.stage.frame(0.3)
      const cv = document.querySelector('[data-testid=creature-view]')
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
      let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] > 50 && d[i + 1] < 140 && d[i + 2] < 80) n++
      return n
    })
    if (orange < 2000) fails.push(`blobscape creature: ${orange} fox-orange pixels`)
    else ok(`blobscape creature: our engine draws the fox (${orange} orange pixels)`)
    await c.page.waitForTimeout(100)
    if (await c.page.locator('[data-testid=creature-loading]').count()) fails.push('blobscape creature: the loading note stays after the fox is drawn')
    else ok('blobscape creature: a loading note shows until the first frame, then goes')
    const sizes = await c.page.evaluate(() => ({ splats: window.__creature?.glb().byteLength, mesh: window.__creature?.mesh(48).byteLength }))
    if (!(sizes.splats > 100000 && sizes.mesh > 10000)) fails.push(`blobscape creature: files ${JSON.stringify(sizes)}`)
    else ok(`blobscape creature: writes splats (${Math.round(sizes.splats / 1024)} KB) and mesh (${Math.round(sizes.mesh / 1024)} KB) .glb`)
    // a new fox replaces the old one, freeing its GPU buffers, and still draws
    await tabClick(c.page.getByRole('button', { name: '5k', exact: true }))
    await c.page.waitForFunction(() => window.__creature?.blobs() < 6000, null, { timeout: 30000 }).catch(() => {})
    const again = await c.page.evaluate(async () => {
      await window.__creature.stage.frame(0.5)
      const cv = document.querySelector('[data-testid=creature-view]')
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
      let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] > 50 && d[i + 1] < 140 && d[i + 2] < 80) n++
      return { n, blobs: window.__creature.blobs() }
    })
    if (!(again.blobs < 6000 && again.n > 2000)) fails.push(`blobscape creature: after switching to 5k, ${JSON.stringify(again)}`)
    else ok(`blobscape creature: swaps to a ${again.blobs}-blob fox and draws it`)
    await c.page.screenshot({ path: join(shots, 'blobscape-creature-offscreen.png') })
    // pixels in the view that pass a test, after drawing `t` seconds into the clip
    const pixels = (t, kind) => c.page.evaluate(async ([t, kind]) => {
      await window.__creature.stage.frame(t)
      const cv = document.querySelector('[data-testid=creature-view]')
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
      const test = {
        fox: (r, g, b) => r > 150 && g > 50 && g < 140 && b < 80,
        bone: (r, g, b) => r > 190 && g > 190 && b > 195 && Math.abs(r - b) < 30,
        frog: (r, g, b) => g > 120 && g > r * 1.4 && b < 110,
        elf: (r, g, b) => g > 90 && g > r * 1.5 && g > b * 1.3,
        fire: (r, g, b) => r > 200 && g > 70 && g < 210 && b < 120,
        // a monster's colors come from its seed: anything bright and saturated
        colorful: (r, g, b) => Math.max(r, g, b) > 110 && Math.max(r, g, b) - Math.min(r, g, b) > 50,
      }[kind]
      let n = 0; for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i + 1], d[i + 2])) n++
      return n
    }, [t, kind])
    const FOX = 'fox', BONE = 'bone'
    // the bones view hides every blob and draws the rig
    await tabClick(c.page.getByRole('button', { name: 'Bones', exact: true }))
    await c.page.waitForTimeout(100)
    const bones = { fox: await pixels(0.5, FOX), bone: await pixels(0.5, BONE) }
    // the joints are coral, which reads as a little fox-orange; the fox itself is thousands
    if (!(bones.fox < 2000 && bones.bone > 300)) fails.push(`blobscape creature: bones view ${JSON.stringify(bones)}`)
    else ok(`blobscape creature: Bones hides the blobs and draws the rig (${bones.bone} bone pixels)`)
    await c.page.screenshot({ path: join(shots, 'blobscape-creature-bones.png') })
    await tabClick(c.page.getByRole('button', { name: 'Both', exact: true }))
    await c.page.waitForTimeout(100)
    const both = { fox: await pixels(0.5, FOX), bone: await pixels(0.5, BONE) }
    if (!(both.fox > 1000 && both.bone > 300)) fails.push(`blobscape creature: both view ${JSON.stringify(both)}`)
    else ok('blobscape creature: Both draws the bones over the blobs')
    await tabClick(c.page.getByRole('button', { name: 'Blobs', exact: true }))
    // every other creature builds, draws, and has its own clips
    for (const [name, bonesWanted, color, clip, t] of [
      ['Frog', 20, 'frog', 'Tongue', 1.15],
      ['Elf', 29, 'elf', 'Wave', 1],
      ['Dragon', 43, 'fire', 'Breathe fire', 2],
    ]) {
      await tabClick(c.page.getByRole('button', { name, exact: true }))
      await c.page.waitForFunction((n) => window.__creature?.bones() === n && !document.querySelector('[data-testid=creature-loading]'), bonesWanted, { timeout: 60000 }).catch(() => {})
      // the Sprites panel has a chip per move too: pick the one that plays it
      await tabClick(c.page.getByRole('region', { name: 'Options' }).getByRole('button', { name: clip, exact: true }))
      await c.page.waitForTimeout(150)
      const got = { bones: await c.page.evaluate(() => window.__creature?.bones()), n: await pixels(t, color), url: new URL(c.page.url()).searchParams.get('creature') }
      if (!(got.bones === bonesWanted && got.n > 1500 && got.url === name.toLowerCase())) fails.push(`blobscape creature: ${name} ${JSON.stringify(got)}`)
      else ok(`blobscape creature: the ${name.toLowerCase()} draws on ${got.bones} bones, playing ${clip.toLowerCase()} (${got.n} pixels of its color)`)
      await c.page.screenshot({ path: join(shots, `blobscape-creature-${name.toLowerCase()}.png`) })
    }
    // the dragon's flame is bones that grow: it leaves in the file as scale keys, and comes back
    const fire = await c.page.evaluate(() => {
      const bytes = window.__creature.glb()
      const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true)
      const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)))
      const anim = json.animations.find((a) => a.name === 'fire')
      return { scales: anim?.channels.filter((ch) => ch.target.path === 'scale').length, kb: Math.round(bytes.byteLength / 1024) }
    })
    // the dragon's other looks: ember is red, not ice blue
    await tabClick(c.page.getByRole('button', { name: 'Ember', exact: true }))
    await c.page.waitForTimeout(300)
    await c.page.waitForFunction(() => !document.querySelector('[data-testid=creature-loading]'), null, { timeout: 60000 }).catch(() => {})
    const ember = await c.page.evaluate(async () => {
      await window.__creature.stage.frame(0.5)
      const cv = document.querySelector('[data-testid=creature-view]')
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
      let red = 0, ice = 0
      for (let i = 0; i < d.length; i += 4) { if (d[i] > 120 && d[i] > d[i + 2] * 1.8 && d[i] > d[i + 1] * 1.6) red++; if (d[i + 2] > 150 && d[i + 2] > d[i] * 1.4) ice++ }
      return { red, ice }
    })
    if (!(ember.red > 2000 && ember.red > ember.ice)) fails.push(`blobscape creature: ember dragon ${JSON.stringify(ember)}`)
    else ok(`blobscape creature: the ember dragon is red (${ember.red} red, ${ember.ice} ice-blue pixels)`)
    await c.page.screenshot({ path: join(shots, 'blobscape-creature-ember.png') })
    if (fire.scales !== 6) fails.push(`blobscape creature: dragon file ${JSON.stringify(fire)}`)
    else ok(`blobscape creature: the dragon's .glb keys its fire as scale on six bones (${fire.kb} KB)`)
    // the Sprites panel: the frog's tongue flick and its still pose from 8 sides, as 32 px pixel art
    await tabClick(c.page.getByRole('button', { name: 'Frog', exact: true }))
    await c.page.waitForFunction(() => window.__creature?.bones() === 20 && !document.querySelector('[data-testid=creature-loading]'), null, { timeout: 60000 }).catch(() => {})
    const sheet = await c.page.evaluate(() => window.__sprites({ moves: ['tongue', 'still'], directions: 8, size: 32, frames: 6, colors: 16, outline: true }))
    const tongueLeft = Math.max(...sheet.solid.slice(12, 18)), stillLeft = sheet.solid[50]
    if (sheet.cols !== 6 || sheet.rows !== 16 || sheet.solid.length !== 56 || sheet.solid.some((k) => k < 20)) fails.push(`blobscape creature sprites: ${JSON.stringify({ ...sheet, solid: sheet.solid.slice(0, 8) })}`)
    else if (!(tongueLeft > stillLeft * 1.05)) fails.push(`blobscape creature sprites: the tongue doesn't show from the side (${tongueLeft} vs ${stillLeft} solid pixels)`)
    else ok(`blobscape creature sprites: 16 rows of the frog from 8 sides, every frame drawn, tongue out from the side (${tongueLeft} vs ${stillLeft} solid pixels)`)
    await c.page.locator('[data-testid=sprites] img').waitFor({ timeout: 10000 }).catch(() => {})
    if (!(await c.page.locator('[data-testid=sprites] img').count())) fails.push('blobscape creature sprites: no sheet preview')
    // the live view comes back after drawing the sheet
    const after = await pixels(0.4, 'frog')
    if (after < 1500) fails.push(`blobscape creature sprites: the view is empty after drawing a sheet (${after} frog pixels)`)
    else ok('blobscape creature sprites: the live view comes back after the sheet')
    await c.page.locator('[data-testid=sprites]').screenshot({ path: join(shots, 'blobscape-creature-sprites.png') })
    // Make me a monster: a new creature from a seed, in the address so the link makes it again, with its own sprite sheet
    const monster = async () => {
      await c.page.waitForFunction(() => new URL(location.href).searchParams.get('creature') === 'monster' && !document.querySelector('[data-testid=creature-loading]'), null, { timeout: 30000 }).catch(() => {})
      await c.page.waitForTimeout(200)
      return { seed: new URL(c.page.url()).searchParams.get('seed'), bones: await c.page.evaluate(() => window.__creature?.bones()), n: await pixels(0.3, 'colorful'), label: await c.page.getByTestId('make-monster').textContent(), note: await c.page.getByTestId('creature-note').textContent() }
    }
    await tabClick(c.page.getByTestId('species').getByRole('button', { name: 'Monster', exact: true }))
    const m1 = await monster()
    await tabClick(c.page.getByTestId('make-monster'))
    await c.page.waitForFunction((s) => new URL(location.href).searchParams.get('seed') !== s, m1.seed, { timeout: 10000 }).catch(() => {})
    const m2 = await monster()
    if (!(m1.seed && m2.seed && m1.seed !== m2.seed && m1.bones >= 14 && m1.n > 1500 && m2.n > 1500 && m2.label === 'Generate a new monster' && /^Made a .*legged/.test(m2.note))) fails.push(`blobscape creature monster: ${JSON.stringify({ m1, m2 })}`)
    else ok(`blobscape creature monster: seeds ${m1.seed} and ${m2.seed} make two monsters (${m1.bones} and ${m2.bones} bones) that draw`)
    await c.page.screenshot({ path: join(shots, 'blobscape-creature-monster.png') })
    const mSheet = await c.page.evaluate(() => window.__sprites({ moves: ['walk', 'roar'], directions: 4, size: 32, frames: 6, colors: 16, outline: true }))
    if (mSheet.rows !== 8 || mSheet.solid.some((k) => k < 20)) fails.push(`blobscape creature monster sprites: ${JSON.stringify({ ...mSheet, solid: mSheet.solid.slice(0, 8) })}`)
    else ok('blobscape creature monster sprites: the monster walks and roars from 4 sides as a sheet')
    // the address makes the same monster again
    const relink = await open(`/experiments/creature/?offscreen=1&creature=monster&seed=${m2.seed}`, { viewport: { width: 1280, height: 900 } })
    await relink.page.waitForFunction(() => window.__creature && !document.querySelector('[data-testid=creature-loading]'), null, { timeout: 60000 }).catch(() => {})
    const same = { bones: await relink.page.evaluate(() => window.__creature?.bones()), seed: new URL(relink.page.url()).searchParams.get('seed') }
    if (same.bones !== m2.bones || same.seed !== m2.seed) fails.push(`blobscape creature monster link: ${JSON.stringify(same)} vs ${JSON.stringify(m2)}`)
    else ok(`blobscape creature monster: the link with seed ${m2.seed} opens the same monster`)
    await relink.ctx.close()
    await axe(c.page, 'blobscape creature sprites')
    await c.ctx.close()
  }

  // Pixel Diorama: the scene draws as pixel art in the palette's colors, the GPU pass agrees with its CPU twin on both backends, and it moves
  for (const q of ['', '&webgl=1']) {
    const d = await open(`/experiments/pixel-diorama/?offscreen=1${q}`, { viewport: { width: 1280, height: 900 } })
    await d.page.waitForFunction(() => window.__diorama, null, { timeout: 90000 }).catch(() => {})
    const shot = (t) => d.page.evaluate(async (t) => {
      const { stage, look } = window.__diorama
      await stage.frame(t)
      const f = await stage.pixelFrames()
      const pal = new Set([...look().palette, look().outline].map((c) => (c[0] << 16) | (c[1] << 8) | c[2]))
      let solid = 0, off = 0, soft = 0
      for (let i = 0; i < f.art.data.length; i += 4) {
        const a = f.art.data[i + 3]
        if (a !== 0 && a !== 255) soft++
        if (!a) continue
        solid++
        if (!pal.has((f.art.data[i] << 16) | (f.art.data[i + 1] << 8) | f.art.data[i + 2])) off++
      }
      return { backend: stage.backend, w: f.art.width, h: f.art.height, solid, off, soft, small: Array.from(f.small.data), art: Array.from(f.art.data), before: f.before && Array.from(f.before.data), parts: f.parts && Array.from(f.parts.data), look: look() }
    }, t)
    const a = await shot(2), b = await shot(5)
    // the same frame through the CPU twin (the page's own module isn't reachable from a production build, so it runs here)
    const { pixelArt } = await import('../src/splat-core/pixel.ts')
    const frame = (data) => data && { width: a.w, height: a.h, data: Uint8ClampedArray.from(data) }
    const want = pixelArt(frame(a.small), a.look, frame(a.before), frame(a.parts))
    let alpha = 0, color = 0, moved = 0
    for (let i = 0; i < want.data.length; i += 4) {
      if (want.data[i + 3] !== a.art[i + 3]) alpha++
      else if (Math.abs(want.data[i] - a.art[i]) + Math.abs(want.data[i + 1] - a.art[i + 1]) + Math.abs(want.data[i + 2] - a.art[i + 2]) > 6) color++
      if (a.art[i] !== b.art[i] || a.art[i + 1] !== b.art[i + 1] || a.art[i + 3] !== b.art[i + 3]) moved++
    }
    const label = `blobscape pixel diorama (${a.backend})`
    if ((q ? 'webgl' : 'webgpu') !== a.backend) fails.push(`${label}: wanted the ${q ? 'webgl' : 'webgpu'} backend`)
    if (!(a.solid > 3000 && a.off === 0 && a.soft === 0)) fails.push(`${label}: ${JSON.stringify({ solid: a.solid, offPalette: a.off, soft: a.soft })}`)
    else ok(`${label}: ${a.w}×${a.h} art, ${a.solid} solid pixels, every one a palette color, none half transparent`)
    // dither sits pixels on the line between two colors, where 8-bit rounding can tip them either way
    if (!(alpha === 0 && color < a.solid * 0.05)) fails.push(`${label}: the pixel pass and its CPU twin differ (${alpha} in shape, ${color} of ${a.solid} in color)`)
    else ok(`${label}: the pixel pass matches its CPU twin (same shape, ${color} of ${a.solid} pixels a neighboring color)`)
    // lines between parts: the pass drew a map of the scene's parts beside the picture, and the lines it adds are the ones the twin adds
    {
      const none = pixelArt(frame(a.small), { ...a.look, parts: false }, frame(a.before))
      const ids = new Set()
      let lines = 0
      for (let i = 0; i < want.data.length; i += 4) {
        if (a.parts?.[i + 3]) ids.add(a.parts[i] | (a.parts[i + 1] << 8) | (a.parts[i + 2] << 16))
        if (want.data[i] !== none.data[i] || want.data[i + 1] !== none.data[i + 1] || want.data[i + 2] !== none.data[i + 2]) lines++
      }
      if (!(a.look.parts && ids.size > 20 && lines > 200)) fails.push(`${label}: lines between parts: ${JSON.stringify({ on: a.look.parts, parts: ids.size, lines })}`)
      else ok(`${label}: lines between parts: a map of ${ids.size} parts, ${lines} pixels of line that color alone would not draw`)
    }
    if (!(moved > 150)) fails.push(`${label}: only ${moved} pixels change in a few seconds`)
    else ok(`${label}: ${moved} pixels change in a few seconds`)
    // steady pixels: the frame after is drawn against this one, as the CPU twin does given the same two; and fewer pixels flip there and back than with it off
    {
      const c = await shot(5 + 1 / 60)
      const again = pixelArt(frame(c.small), c.look, frame(c.before), frame(c.parts))
      let held = 0, differ = 0
      const plain = pixelArt(frame(c.small), { ...c.look, steady: 0 }, undefined, frame(c.parts))
      for (let i = 0; i < again.data.length; i += 4) {
        if (Math.abs(again.data[i] - c.art[i]) + Math.abs(again.data[i + 1] - c.art[i + 1]) + Math.abs(again.data[i + 2] - c.art[i + 2]) > 6 || again.data[i + 3] !== c.art[i + 3]) differ++
        if (plain.data[i] !== again.data[i] || plain.data[i + 1] !== again.data[i + 1] || plain.data[i + 2] !== again.data[i + 2]) held++
      }
      if (!(c.look.steady > 0 && c.before && differ < a.solid * 0.05 && held > 20)) fails.push(`${label}: steady pixels: ${JSON.stringify({ steady: c.look.steady, before: !!c.before, differ, held })}`)
      else ok(`${label}: steady pixels: drawn against the frame before as the CPU twin is (${differ} pixels a neighboring color), ${held} pixels keep their color that would have flipped`)
    }
    // held frames: with a step, the scene only moves on every step, so two moments inside one step are one picture
    {
      const held = await d.page.evaluate(async () => {
        const { stage } = window.__diorama
        const grab = async (t) => { await stage.frame(t); return (await stage.pixelFrames()).art.data }
        stage.step = 1 / 8
        const x = await grab(3.01), y = await grab(3.1), z = await grab(3.26)
        const at = stage.time
        stage.step = 0
        const differ = (p, q) => { let n = 0; for (let i = 0; i < p.length; i += 4) if (p[i] !== q[i] || p[i + 1] !== q[i + 1] || p[i + 2] !== q[i + 2]) n++; return n }
        return { same: differ(x, y), next: differ(x, z), at }
      })
      if (!(held.same === 0 && held.next > 20 && Math.abs(held.at - 3.25) < 1e-6)) fails.push(`${label}: held frames: ${JSON.stringify(held)}`)
      else ok(`${label}: held frames: two moments inside one eighth of a second are the same picture, the next eighth moves ${held.next} pixels`)
    }
    // the same moment drawn twice is the same picture: blobs at one depth keep one order, so edges (a window in its frame) do not flicker
    const twice = await d.page.evaluate(async () => {
      const { stage } = window.__diorama
      const grab = async () => { await stage.frame(2); return (await stage.pixelFrames()).small.data }
      const x = await grab(), y = await grab()
      let n = 0
      for (let i = 0; i < x.length; i += 4) if (x[i] !== y[i] || x[i + 1] !== y[i + 1] || x[i + 2] !== y[i + 2]) n++
      return n
    })
    if (twice > 40) fails.push(`${label}: one moment drawn twice differs in ${twice} pixels (blobs at one depth are changing order)`)
    else ok(`${label}: one moment drawn twice is the same picture (${twice} pixels differ)`)
    if (!q) {
      // pixels off: the same scene as blobs, in far more colors
      await tabClick(d.page.getByRole('button', { name: 'Blobs', exact: true }))
      await d.page.waitForFunction(() => !window.__diorama.stage.artSize)
      const colors = await d.page.evaluate(async () => {
        await window.__diorama.stage.frame(2)
        const cv = document.querySelector('[data-testid=diorama-view]')
        const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
        const s = new Set()
        for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 200) s.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2])
        return s.size
      })
      if (!(colors > 500)) fails.push(`${label}: as blobs it shows only ${colors} colors`)
      else ok(`${label}: with pixels off it draws the blobs (${colors} colors)`)
      await tabClick(d.page.getByRole('button', { name: 'Pixel art', exact: true }))
      // offscreen draws only when asked: draw until pixel mode is back on
      await d.page.waitForFunction(async () => { await window.__diorama.stage.frame(4.5); return !!window.__diorama.stage.artSize })
      await d.page.screenshot({ path: join(shots, 'blobscape-pixel-diorama.png') })
      await axe(d.page, 'blobscape pixel diorama')
      // the shared layout: options in tabs beside the preview, which stays in sight on scroll and can fill the screen
      const tabNames = await d.page.getByRole('tab').allTextContents()
      await d.page.getByRole('tab', { name: 'Finish' }).click()
      const finishShown = await d.page.getByRole('button', { name: 'Save this frame' }).isVisible()
      await d.page.setViewportSize({ width: 390, height: 700 })
      await d.page.evaluate(() => window.scrollTo(0, 500))
      const stuck = await d.page.getByTestId('diorama-view').evaluate((c) => { const r = c.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.height > 200 })
      await d.page.getByTestId('full-screen').click()
      const filled = await d.page.waitForFunction(() => { const c = document.querySelector('[data-testid=diorama-view]'); return !!document.querySelector('[data-full]') && c.clientWidth >= innerWidth - 2 && c.clientHeight > innerHeight * 0.8 }, null, { timeout: 5000 }).then(() => true, () => false)
      await d.page.getByTestId('full-screen').click()
      const back = await d.page.waitForFunction(() => !document.querySelector('[data-full]'), null, { timeout: 5000 }).then(() => true, () => false)
      if (tabNames.join() !== 'Scene,Pixels,Finish' || !finishShown || !stuck || !filled || !back) fails.push(`${label} layout: ${JSON.stringify({ tabNames, finishShown, stuck, filled, back })}`)
      else ok(`${label} layout: options in ${tabNames.length} tabs, the preview stays in sight on a phone as the page scrolls, and it fills the screen and comes back`)
    }
    await d.ctx.close()
  }

  // picking another scene: the one in the view keeps its own palette until the new scene has been cut and takes its place
  {
    const d = await open('/experiments/pixel-diorama/?offscreen=1&scene=campfire', { viewport: { width: 1280, height: 900 } })
    await d.page.waitForFunction(() => window.__diorama, null, { timeout: 90000 }).catch(() => {})
    const strip = () => [...document.querySelectorAll('[data-testid=palette-strip] span')].map((e) => e.style.background).join()
    const before = await d.page.evaluate(strip)
    const justAfter = await d.page.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Windmill').click()
      return [...document.querySelectorAll('[data-testid=palette-strip] span')].map((e) => e.style.background).join()
    }).catch(() => '')
    const changed = await d.page.waitForFunction((was) => { const now = [...document.querySelectorAll('[data-testid=palette-strip] span')].map((e) => e.style.background).join(); return !!window.__diorama && now !== was }, before, { timeout: 90000 }).then(() => true, () => false)
    if (!before || justAfter !== before || !changed) fails.push(`blobscape pixel diorama: on picking another scene the palette ${justAfter !== before ? 'changed before the scene did' : 'never changed'}`)
    else ok('blobscape pixel diorama: a newly picked scene brings its palette only when it reaches the view')
    await d.ctx.close()
  }

  // the scenes written as descriptions: each opens by its address, draws in its own palette, and moves
  for (const [id, name] of [['bee', 'Forest bee'], ['campfire', 'Campfire'], ['croc', 'Garden crocodile'], ['dragon', 'Lava dragon'], ['grove', 'Lantern grove'], ['hand', 'Stone hand'], ['harvest', 'Pumpkin watch'], ['hut', 'Heron hut'], ['isles', 'Sky islands'], ['lab', 'Sprout lab'], ['octopus', 'Storm octopus'], ['owl', 'Owl and cauldron'], ['reef', 'Jellyfish reef'], ['snail', 'Snail house'], ['spider', 'Lantern spider'], ['window', 'Sunrise window'], ['windmill', 'Windmill']]) {
    const d = await open(`/experiments/pixel-diorama/?offscreen=1&scene=${id}`, { viewport: { width: 1280, height: 900 } })
    const label = `blobscape pixel diorama ${id}`
    if (!await d.page.waitForFunction(() => window.__diorama, null, { timeout: 90000 }).then(() => true, () => false)) {
      fails.push(`${label}: the scene never started`)
      await d.ctx.close()
      continue
    }
    const shot = (t) => d.page.evaluate(async (t) => {
      const { stage, look, bones } = window.__diorama
      await stage.frame(t)
      const f = await stage.pixelFrames()
      const pal = new Set([...look().palette, look().outline].filter(Boolean).map((c) => (c[0] << 16) | (c[1] << 8) | c[2]))
      let off = 0
      const used = new Set()
      for (let i = 0; i < f.art.data.length; i += 4) {
        const c = (f.art.data[i] << 16) | (f.art.data[i + 1] << 8) | f.art.data[i + 2]
        // a scene with no sky leaves the background clear
        if (!f.art.data[i + 3]) { if (look().sky) off++; continue }
        if (!pal.has(c)) off++
        used.add(c)
      }
      return { off, used: used.size, bones: bones(), turned: stage.orbit.azimuth, art: Array.from(f.art.data), small: Array.from(f.small.data), before: f.before && Array.from(f.before.data), parts: f.parts && Array.from(f.parts.data), w: f.art.width, h: f.art.height, look: look() }
    }, t)
    // a view that swings stands at the same angle at t and at half a loop less t (half a loop is given here), so what changes between those is the scene itself
    const half = { bee: 6, dragon: 8, hand: 8, reef: 6 }[id]
    const a = await shot(2), b = await shot(half ? half - 2 : 5)
    if (half) {
      const c = await shot(half / 2)
      if (Math.abs(a.turned - b.turned) > 0.01 || Math.abs(c.turned - a.turned) < 0.5) fails.push(`${label}: the view should swing and come back: ${JSON.stringify([a.turned, c.turned, b.turned])}`)
      else ok(`${label}: the view swings (${a.turned.toFixed(1)}° at 2 s, ${c.turned.toFixed(1)}° at ${half / 2} s) and the bones move on their own`)
    }
    if (id === 'dragon') {
      // the one scene whose sky stops short: that path of the pass against its CPU twin
      const { pixelArt } = await import('../src/splat-core/pixel.ts')
      const want = pixelArt({ width: a.w, height: a.h, data: Uint8ClampedArray.from(a.small) }, a.look, a.before && { width: a.w, height: a.h, data: Uint8ClampedArray.from(a.before) }, a.parts && { width: a.w, height: a.h, data: Uint8ClampedArray.from(a.parts) })
      let alpha = 0, color = 0
      for (let i = 0; i < want.data.length; i += 4) {
        if (want.data[i + 3] !== a.art[i + 3]) alpha++
        else if (Math.abs(want.data[i] - a.art[i]) + Math.abs(want.data[i + 1] - a.art[i + 1]) + Math.abs(want.data[i + 2] - a.art[i + 2]) > 6) color++
      }
      if (!(a.look.sky?.[2] < 1 && alpha === 0 && color < a.w * a.h * 0.05)) fails.push(`${label}: with a sky that stops short, the pixel pass and its CPU twin differ (${alpha} in shape, ${color} of ${a.w * a.h} in color, reach ${a.look.sky?.[2]})`)
      else ok(`${label}: with a sky that stops short, the pixel pass matches its CPU twin (${color} of ${a.w * a.h} pixels a neighboring color)`)
    }
    let moved = 0
    for (let i = 0; i < a.art.length; i += 4) if (a.art[i] !== b.art[i] || a.art[i + 1] !== b.art[i + 1] || a.art[i + 2] !== b.art[i + 2]) moved++
    const chip = await d.page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed')
    if (!(a.off === 0 && a.used >= 12 && a.bones > 10 && moved > 100 && chip === 'true')) fails.push(`${label}: ${JSON.stringify({ offPalette: a.off, colors: a.used, bones: a.bones, moved, chip })}`)
    else ok(`${label}: built from its description (${a.bones} bones), ${a.used} palette colors in the picture, ${moved} pixels change in a few seconds`)
    await d.page.screenshot({ path: join(shots, `blobscape-pixel-diorama-${id}.png`) })
    await d.ctx.close()
  }

  // Clockwork: the watch draws, its gold train turns by the right amount, and the hands read the time it's set to
  {
    const k = await open('/experiments/clockwork/?offscreen=1', { viewport: { width: 1280, height: 900 } })
    await k.page.waitForFunction(() => window.__clock, null, { timeout: 90000 }).catch(() => {})
    const shot = (s) => k.page.evaluate(async (s) => {
      await window.__clock.stage.frame(s)
      const cv = document.querySelector('[data-testid=clock-view]')
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
      let gold = 0, blue = 0
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 170 && d[i + 1] > 110 && d[i + 2] < 120 && d[i] > d[i + 2] * 1.8) gold++
        if (d[i + 2] > 110 && d[i + 2] > d[i] * 2 && d[i + 2] > d[i + 1] * 1.6) blue++
      }
      return { gold, blue, d: Array.from(d) }
    }, s)
    await tabClick(k.page.getByRole('button', { name: 'Dial', exact: true }))
    const a = await shot(3 * 3600 + 41 * 60 + 17), b = await shot(3 * 3600 + 41 * 60 + 47)
    let moved = 0
    for (let i = 0; i < a.d.length; i += 4) if (Math.abs(a.d[i] - b.d[i]) + Math.abs(a.d[i + 1] - b.d[i + 1]) > 60) moved++
    const bones = await k.page.evaluate(() => window.__clock.bones())
    if (!(a.gold > 8000 && a.blue > 300 && moved > 500 && bones === 9)) fails.push(`blobscape clockwork: ${JSON.stringify({ gold: a.gold, blue: a.blue, moved, bones })}`)
    else ok(`blobscape clockwork: the movement draws (${a.gold} gold, ${a.blue} blued pixels) on ${bones} bones, and ${moved} pixels change in thirty seconds`)
    await k.page.waitForFunction(() => /\d+:\d\d:\d\d/.test(document.querySelector('[data-testid=clock-reading]')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => {})
    const read = await k.page.getByTestId('clock-reading').textContent()
    if (!/^(1[0-2]|[1-9]):[0-5]\d:[0-5]\d$/.test(read ?? '')) fails.push(`blobscape clockwork: the reading is "${read}"`)
    else ok(`blobscape clockwork: the hands' reading shows (${read})`)
    await tabClick(k.page.getByRole('button', { name: 'Escapement', exact: true }))
    await shot(100.02)
    await k.page.screenshot({ path: join(shots, 'blobscape-clockwork.png') })
    await axe(k.page, 'blobscape clockwork')
    await k.ctx.close()
  }

  // Scan Studio: the sample scan is leveled and cleaned, cut blobs show red, a lamp relights it, the .ply round-trips, and the sandbox gets it
  {
    const k = await open('/experiments/scan-studio/?offscreen=1', { viewport: { width: 1280, height: 900 } })
    await k.page.waitForFunction(() => window.__scan?.kept() > 0, null, { timeout: 90000 }).catch(() => {})
    const look = () => k.page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 400))
      await window.__scan.stage.frame(0)
      const cv = document.querySelector('[data-testid=scan-view]')
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
      let teal = 0, red = 0, sum = 0
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 1] > 80 && d[i + 2] > 80 && d[i + 1] > d[i] * 1.4) teal++
        if (d[i] > 120 && d[i] > d[i + 1] * 2 && d[i] > d[i + 2] * 2) red++
        sum += d[i] + d[i + 1] + d[i + 2]
      }
      return { teal, red, sum }
    })
    const st = await k.page.evaluate(() => ({ kept: window.__scan.kept(), total: window.__scan.total(), level: window.__scan.level() }))
    const a = await look()
    if (!(st.level === true && st.kept > 0.45 * st.total && st.kept < 0.7 * st.total && a.teal > 20000 && a.red < 500)) fails.push(`blobscape scan: sample ${JSON.stringify({ ...st, ...a })}`)
    else ok(`blobscape scan: the sample's table is found and the clean keeps ${st.kept.toLocaleString()} of ${st.total.toLocaleString()} blobs (${a.teal} mug pixels)`)
    await tabClick(k.page.getByRole('button', { name: 'Kept and cut' }))
    const b = await look()
    await tabClick(k.page.getByRole('button', { name: 'Kept', exact: true }))
    await tabClick(k.page.getByRole('button', { name: 'Lamp' }))
    const c = await look()
    if (!(b.red > 50000 && Math.abs(c.sum - a.sum) > a.sum * 0.03)) fails.push(`blobscape scan: cut/lamp ${JSON.stringify({ red: b.red, before: a.sum, lamp: c.sum })}`)
    else ok(`blobscape scan: cut blobs show red (${b.red} pixels) and the lamp relights the mug (brightness ${Math.round((100 * c.sum) / a.sum)}%)`)
    await k.page.screenshot({ path: join(shots, 'blobscape-scan.png') })
    await axe(k.page, 'blobscape scan')
    const [dl] = await Promise.all([k.page.waitForEvent('download'), k.page.getByRole('button', { name: 'Download .ply' }).click()])
    const file = join(shots, 'scan-clean.ply')
    await dl.saveAs(file)
    await tabClick(k.page.getByRole('button', { name: 'As scanned' }))
    await k.page.locator('input[type=file]').setInputFiles(file)
    await k.page.waitForFunction(() => /Opened scan-clean/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {})
    const back = await k.page.evaluate(() => window.__scan.total())
    if (back !== st.kept) fails.push(`blobscape scan: the saved .ply holds ${back} blobs, not ${st.kept}`)
    else ok(`blobscape scan: the saved .ply opens again with all ${back.toLocaleString()} kept blobs`)
    const kept = await k.page.evaluate(() => window.__scan.kept())
    await tabClick(k.page.getByRole('button', { name: 'Open in the sandbox' }))
    await k.page.waitForURL('**/sandbox/', { timeout: 30000 }).catch(() => {})
    const count = (await k.page.getByTestId('blob-count').textContent({ timeout: 30000 }).catch(() => '')) ?? ''
    if (Number(count.replace(/\D/g, '')) !== kept) fails.push(`blobscape scan: the sandbox shows "${count}" for ${kept} kept blobs`)
    else ok(`blobscape scan: Open in the sandbox hands over the ${kept.toLocaleString()} kept blobs`)
    await k.ctx.close()
  }

  // Dungeon Run: the hall draws, a swing bursts a slime into splats, a bolt costs magic, a touch takes health off the bar, and down shows Try again
  {
    const k = await open('/experiments/dungeon-run/?offscreen=1', { viewport: { width: 1280, height: 900 } })
    await k.page.waitForFunction(() => window.__dungeon?.stage.dungeon, null, { timeout: 90000 }).catch(() => {})
    const look = () => k.page.evaluate(() => {
      const cv = document.querySelector('[data-testid=dungeon-view]')
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
      let warm = 0, green = 0
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 90 && d[i] > d[i + 2] * 1.4 && d[i + 1] > d[i + 2]) warm++
        if (d[i + 1] > 120 && d[i + 1] > d[i] * 1.4 && d[i + 1] > d[i + 2] * 1.4) green++
      }
      return { warm, green }
    })
    const run = (s, input) => k.page.evaluate(async ([s, input]) => { await window.__dungeon.stage.frame(s, input) }, [s, input])
    await k.page.evaluate(() => { const g = window.__dungeon.stage.dungeon.game; g.hold(); g.place('green', 0.7, g.hero.z + 1.1) })
    await run(0.2, { forward: 0, turn: 0 })
    const a = await look()
    // a few swings (running after it when knocked back) burst a green slime
    for (let i = 0; i < 5 && !(await k.page.evaluate(() => window.__dungeon.stage.dungeon.game.score)); i++) { await run(0.05, { forward: 0, turn: 0, swing: true }); await run(0.5, { forward: 0.6, turn: 0 }) }
    const fight = await k.page.evaluate(() => { const g = window.__dungeon.stage.dungeon.game; return { score: g.score, phase: g.slimes[0]?.phase } })
    await run(0.15, { forward: 0, turn: 0, cast: true })
    await run(0.5, { forward: 0, turn: 0 })
    const meters = async () => Object.fromEntries(await k.page.getByRole('meter').evaluateAll((els) => els.map((e) => [e.getAttribute('aria-label'), +e.getAttribute('aria-valuenow')])))
    const m = await meters()
    if (!(a.warm > 20000 && a.green > 150 && fight.score === 1 && fight.phase === 'burst' && m.Magic < 100 && m.Health >= 80)) fails.push(`blobscape dungeon: ${JSON.stringify({ a, fight, m })}`)
    else ok(`blobscape dungeon: the hall draws (${a.warm} torchlit, ${a.green} slime pixels), swings burst the slime, a bolt spends magic (${m.Magic} left)`)
    await k.page.screenshot({ path: join(shots, 'blobscape-dungeon.png') })
    await axe(k.page, 'blobscape dungeon')
    // a red slime at the hero's feet with health nearly gone: down, and Try again starts over
    await k.page.evaluate(() => { const g = window.__dungeon.stage.dungeon.game; g.hero.hp = 4; g.place('red', 0, g.hero.z + 0.5) })
    await run(2, { forward: 0, turn: 0 })
    const over = await k.page.getByRole('button', { name: 'Try again' }).count()
    const hurt = await meters()
    if (over) await tabClick(k.page.getByRole('button', { name: 'Try again' }))
    await run(0.1, { forward: 0, turn: 0 })
    const after = await meters()
    if (!(over === 1 && hurt.Health === 0 && after.Health === 100)) fails.push(`blobscape dungeon down: ${JSON.stringify({ over, hurt, after })}`)
    else ok('blobscape dungeon: a slime takes the last health, the hero goes down, and Try again starts over at full health')
    // light: live where WebGPU runs (each blob lit by the torches and the orb), and the Baked chip rebuilds the hall with it worked in
    const was = await k.page.evaluate(() => ({ light: window.__dungeon.stage.dungeon.opts.light, backend: window.__dungeon.stage.backend }))
    await run(0.1, { forward: 0, turn: 0 })
    const liveLook = await look()
    await tabClick(k.page.getByRole('button', { name: 'Baked', exact: true }))
    await k.page.waitForFunction(() => window.__dungeon.stage.dungeon.opts.light === 'baked', null, { timeout: 30000 }).catch(() => {})
    await run(0.1, { forward: 0, turn: 0 })
    const bakedLook = await look()
    const want = was.backend === 'webgpu' ? 'live' : 'baked'
    if (!(was.light === want && bakedLook.warm > 20000 && liveLook.warm > 5000 && liveLook.warm !== bakedLook.warm)) fails.push(`blobscape dungeon light: ${JSON.stringify({ was, live: liveLook, baked: bakedLook })}`)
    else ok(`blobscape dungeon: starts with ${want} light on ${was.backend}; live and baked both draw (${liveLook.warm} and ${bakedLook.warm} torchlit pixels)`)
    await k.ctx.close()
  }

  // Forest Walk: the elf walks down the path, tiles move on ahead, plants grow round it
  {
    const f = await open('/experiments/forest-walk/?offscreen=1', { viewport: { width: 1280, height: 900 } })
    if (!(await f.page.locator('[data-testid=forest-loading]').count())) fails.push('blobscape forest: no loading note while the engine starts')
    await f.page.waitForFunction(() => window.__forest?.stage.forest, null, { timeout: 90000 }).catch(() => {})
    // green of leaves and grass, brown of the path, the elf's tunic (from behind)
    const look = (seconds, forward, turn = 0) => f.page.evaluate(async ([s, fw, t]) => {
      await window.__forest.stage.frame(s, { forward: fw, turn: t })
      const cv = document.querySelector('[data-testid=forest-view]')
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
      let green = 0, path = 0
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 1] > d[i] + 25 && d[i + 1] > d[i + 2] + 25) green++
        if (d[i] > 100 && d[i] > d[i + 1] + 20 && d[i + 1] > d[i + 2] + 15) path++
      }
      const fo = window.__forest.stage.forest
      return { green, path, z: fo.walker.z, growing: fo.growing, tiles: fo.tiles }
    }, [seconds, forward, turn])
    const start = await look(0.1, 0)
    const walked = await look(12, 1)
    if (!(start.green > 20000 && start.path > 5000)) fails.push(`blobscape forest: first frame ${JSON.stringify(start)}`)
    else ok(`blobscape forest: grass, path and plants draw (${start.green} green, ${start.path} path pixels)`)
    if (!(walked.z > 12 && walked.growing > 30 && walked.green > 20000 && Math.min(...walked.tiles) > Math.min(...start.tiles))) fails.push(`blobscape forest: after walking ${JSON.stringify(walked)}`)
    else ok(`blobscape forest: the elf walks ${walked.z.toFixed(1)} m, tiles move on ahead and ${walked.growing} plants grow round it`)
    if (await f.page.locator('[data-testid=forest-loading]').count()) fails.push('blobscape forest: the loading note stays after the forest is drawn')
    await f.page.screenshot({ path: join(shots, 'blobscape-forest.png') })
    // a new season rebuilds the forest and keeps the elf where it was
    await tabClick(f.page.getByRole('button', { name: 'Autumn', exact: true }).first())
    await f.page.waitForFunction(() => window.__forest?.stage.forest?.opts.season === 'autumn', null, { timeout: 30000 }).catch(() => {})
    const autumn = await look(1.5, 0)
    if (!(Math.abs(autumn.z - walked.z) < 0.5 && autumn.growing > 20)) fails.push(`blobscape forest: autumn ${JSON.stringify(autumn)}`)
    else ok(`blobscape forest: autumn regrows ${autumn.growing} plants round the elf where it stood`)
    await f.page.screenshot({ path: join(shots, 'blobscape-forest-autumn.png') })
    await f.ctx.close()
  }

  // Every experiment shares one layout: the same two columns, the page's own tabs, a preview that stays in sight on a phone
  {
    const PAGES = [
      ['pixel-diorama', 'Scene,Pixels,Finish'], ['creature', 'Creature Type,Movement & Details,Export & Import'], ['forest-walk', 'Forest Type,Character Style,View'],
      ['dungeon-run', 'Game Settings,Character Style,View'], ['scan-studio', 'Import,Level & Crop,Clean,Lighting'], ['clockwork', 'Time,View'],
      ['fit-a-picture', 'Picture,Training'], ['splat-to-sprite', 'Prop Type,Pixels,Finish,View'],
    ]
    const sizes = new Set()
    let bad = 0
    for (const [id, want] of PAGES) {
      const w = await open(`/experiments/${id}/`, { viewport: { width: 1280, height: 900 } })
      // only the layout is looked at, and the page is closed while its engine is still starting: each page's own check listens for errors
      w.page.removeAllListeners('console')
      w.page.removeAllListeners('pageerror')
      await w.page.getByRole('tab').first().waitFor({ timeout: 30000 }).catch(() => {})
      const at = await w.page.evaluate(() => {
        const view = document.querySelector('[data-testid=full-screen]')?.parentElement.getBoundingClientRect()
        const panel = document.querySelector('section[aria-label=Options]')?.getBoundingClientRect()
        return {
          tabs: [...document.querySelectorAll('section[aria-label=Options] [role=tab]')].map((t) => t.textContent).join(),
          cut: [...document.querySelectorAll('section[aria-label=Options] [role=tab] span')].filter((e) => e.scrollWidth > e.clientWidth).length,
          view: view ? `${Math.round(view.width)}×${Math.round(view.height)}` : 'none', panel: panel ? Math.round(panel.width) : 0, beside: !!view && !!panel && panel.left > view.right,
        }
      })
      await w.page.setViewportSize({ width: 390, height: 700 })
      await w.page.evaluate(() => window.scrollTo(0, 420))
      await w.page.waitForTimeout(150)
      const phone = await w.page.evaluate(() => {
        const r = document.querySelector('[data-testid=full-screen]')?.parentElement.getBoundingClientRect()
        return { stuck: !!r && r.top >= 0 && r.bottom <= innerHeight && r.height > 200, wide: document.documentElement.scrollWidth - innerWidth }
      })
      sizes.add(`${at.view}+${at.panel}`)
      if (at.tabs !== want || at.cut || !at.beside || !phone.stuck || phone.wide > 0) { bad++; fails.push(`layout ${id}: ${JSON.stringify({ ...at, ...phone })}`) }
      await w.ctx.close()
    }
    if (sizes.size !== 1) fails.push(`layout: the columns differ between experiments (${[...sizes].join(', ')})`)
    else if (!bad) ok(`layout: all ${PAGES.length} experiments have their tabs beside a preview of the same size (${[...sizes][0]}), which stays in sight on a phone`)
  }

  // Lesson → sandbox carries the scene
  await page.goto(base + '/lessons/many/')
  await page.waitForTimeout(800)
  const lessonCount = await count(page)
  await page.getByRole('button', { name: 'Open this scene in the sandbox' }).click()
  await page.waitForTimeout(800)
  if ((await count(page)) !== lessonCount) fails.push(`blobscape: sandbox got ${await count(page)} blobs from a ${lessonCount}-blob lesson`)
  else ok(`blobscape: "Open in the sandbox" carries the lesson's ${lessonCount} blobs`)

  // Sandbox: spray onto an empty floor, undo, redo, select, delete
  await page.getByRole('tab', { name: /Scene/ }).click()
  await page.getByRole('button', { name: 'Empty', exact: true }).click()
  await page.getByRole('button', { name: 'Spray', exact: true }).click()
  const box = await page.getByTestId('viewport').boundingBox()
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.7)
  await page.mouse.down()
  for (let k = 1; k <= 12; k++) await page.mouse.move(box.x + box.width * 0.4 + k * 20, box.y + box.height * 0.7)
  await page.mouse.up()
  const sprayed = await count(page)
  if (sprayed < 20) fails.push(`blobscape sandbox: spray made ${sprayed} blobs`)
  else ok(`blobscape sandbox: spray puts down ${sprayed} blobs`)
  await page.getByRole('button', { name: 'Undo' }).click()
  const undone = await count(page)
  await page.getByRole('button', { name: 'Redo' }).click()
  if (undone !== 0 || (await count(page)) !== sprayed) fails.push(`blobscape sandbox: undo/redo gave ${undone} then ${await count(page)}`)
  else ok('blobscape sandbox: undo and redo the stroke')
  await page.getByRole('tab', { name: /Selection/ }).click()
  await page.getByRole('button', { name: 'Select all' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  if ((await count(page)) !== 0) fails.push('blobscape sandbox: delete left blobs behind')
  await page.keyboard.press('Control+z')
  if ((await count(page)) !== sprayed) fails.push('blobscape sandbox: Ctrl+Z did not bring the deleted blobs back')
  else ok('blobscape sandbox: select all, delete, Ctrl+Z')
  // Keyboard: Enter on the focused view uses the tool at its center
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const beforeKey = await count(page)
  await page.getByTestId('viewport').focus()
  await page.keyboard.press('Enter')
  if ((await count(page)) !== beforeKey + 1) fails.push(`blobscape sandbox: Enter with Add went ${beforeKey} → ${await count(page)}`)
  else ok('blobscape sandbox: Enter on the view adds a blob at the center')
  // The skip link jumps to the content without leaving the page
  await page.keyboard.press('Shift+Tab')
  await page.goto(base + '/lessons/footprint/')
  await page.keyboard.press('Tab')
  await page.getByRole('link', { name: 'Skip to content' }).press('Enter')
  await page.waitForTimeout(300)
  if (!(await page.getByRole('heading', { level: 1, name: /Footprint/ }).count())) fails.push('blobscape: the skip link left the lesson')
  else ok('blobscape: the skip link stays on the lesson')
  await axe(page, 'blobscape sandbox after edits')
  await ctx.close()

  const dark = await open('/sandbox/', { colorScheme: 'dark', viewport: { width: 1280, height: 900 } })
  await dark.page.waitForTimeout(2500)
  await axe(dark.page, 'blobscape dark sandbox')
  await dark.page.screenshot({ path: join(shots, 'blobscape-dark.png') })
  await dark.page.goto(base + '/lessons/footprint/')
  await dark.page.waitForTimeout(1500)
  await axe(dark.page, 'blobscape dark footprint')
  await dark.page.screenshot({ path: join(shots, 'blobscape-footprint-dark.png') })
  await dark.page.goto(base + '/')
  await dark.page.waitForTimeout(800)
  await axe(dark.page, 'blobscape dark home')
  await dark.page.goto(base + '/lessons/angle/')
  await dark.page.waitForTimeout(1500)
  await axe(dark.page, 'blobscape dark angle')
  await dark.page.screenshot({ path: join(shots, 'blobscape-angle-dark.png') })
  await dark.ctx.close()
}

// 7. Blobscape sandbox tools: open a file, box and lasso select, move, a live effect, bake, save
{
  const B = '/'
  const { page, ctx } = await open('/sandbox/', { viewport: { width: 1280, height: 900 }, acceptDownloads: true })
  await page.waitForTimeout(1500)
  const count = async () => Number((await page.textContent('[data-testid=blob-count]')).replace(/\D/g, ''))
  const selected = async () => Number(((await page.textContent('[data-testid=selected-count]').catch(() => '0')) ?? '0').replace(/\D/g, ''))
  const shot = async () => page.getByTestId('viewport').screenshot()
  // Pixels that changed clearly (any channel by more than 24), decoded in the page
  const differs = (a, b) => page.evaluate(async ([a, b]) => {
    const px = async (s) => { const i = await createImageBitmap(new Blob([Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0))], { type: 'image/png' })); const c = new OffscreenCanvas(i.width, i.height); const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height).data }
    const [p, q] = await Promise.all([px(a), px(b)])
    let n = 0
    for (let k = 0; k < p.length; k += 4) if (Math.abs(p[k] - q[k]) > 24 || Math.abs(p[k + 1] - q[k + 1]) > 24 || Math.abs(p[k + 2] - q[k + 2]) > 24) n++
    return n
  }, [a.toString('base64'), b.toString('base64')])

  await page.getByRole('tab', { name: /Scene/ }).click()
  await page.setInputFiles('input[type=file]', { name: 'ball.ply', mimeType: 'application/octet-stream', buffer: ballPly() })
  await page.waitForFunction(() => document.querySelector('[data-testid=blob-count]')?.textContent === '2,000', null, { timeout: 30000 }).catch(() => {})
  if ((await count()) !== 2000) fails.push(`blobscape sandbox: opening ball.ply gave ${await count()} blobs`)
  else ok('blobscape sandbox: opens a .ply (2,000 blobs)')
  await page.waitForTimeout(1200)

  // Box select the middle of the view, then lasso the left half
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  const box = await page.getByTestId('viewport').boundingBox()
  const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy]
  await page.mouse.move(...at(0.3, 0.2)); await page.mouse.down()
  for (let k = 1; k <= 8; k++) await page.mouse.move(...at(0.3 + k * 0.05, 0.2 + k * 0.075))
  await page.mouse.up()
  const boxed = await selected()
  if (boxed < 50 || boxed >= 2000) fails.push(`blobscape sandbox: box select picked ${boxed}`)
  else ok(`blobscape sandbox: box select picks ${boxed} blobs`)
  await page.getByRole('button', { name: 'Lasso', exact: true }).click()
  const ring = [[0.15, 0.1], [0.5, 0.1], [0.5, 0.95], [0.15, 0.95]]
  await page.mouse.move(...at(...ring[0])); await page.mouse.down()
  for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0]]) for (let k = 1; k <= 6; k++) await page.mouse.move(...at(ring[i][0] + (ring[j][0] - ring[i][0]) * k / 6, ring[i][1] + (ring[j][1] - ring[i][1]) * k / 6))
  await page.mouse.up()
  const lassoed = await selected()
  if (lassoed < 200 || lassoed >= 2000) fails.push(`blobscape sandbox: lasso picked ${lassoed}`)
  else ok(`blobscape sandbox: lasso picks ${lassoed} blobs`)

  // Move the selection: the picture changes, and Undo puts it back
  const still = await shot()
  await page.getByRole('button', { name: 'Move', exact: true }).click()
  await page.mouse.move(...at(0.3, 0.5)); await page.mouse.down(); await page.mouse.move(...at(0.2, 0.5), { steps: 5 }); await page.mouse.up()
  await page.waitForTimeout(600)
  const moved = await differs(still, await shot())
  if (moved < 300) fails.push(`blobscape sandbox: moving the selection changed ${moved} pixels`)
  else ok('blobscape sandbox: Move slides the selection')
  await page.getByRole('button', { name: 'Undo' }).click()

  // A live effect on the GPU: explode the whole scene
  await page.getByRole('tab', { name: /Effects/ }).click()
  const calm = await shot()
  await page.getByRole('button', { name: 'Explode', exact: true }).click()
  await page.getByRole('slider', { name: 'Amount' }).focus()
  await page.keyboard.press('End')
  // Software WebGL is slow to re-run the effect and re-sort; a real GPU does it within a frame
  await page.waitForTimeout(2500)
  const blown = await shot()
  const changed = await differs(calm, blown)
  if (changed < 2000) fails.push(`blobscape sandbox: Explode changed ${changed} pixels`)
  else ok('blobscape sandbox: Explode runs on the GPU')
  await page.screenshot({ path: join(shots, 'blobscape-explode.png') })
  await axe(page, 'blobscape sandbox effects')
  // Make it permanent: the preview turns off and the blobs keep the look
  await page.getByRole('button', { name: 'Make it permanent' }).click()
  await page.waitForTimeout(2500)
  const baked = await differs(blown, await shot())
  const noneOn = await page.getByRole('group', { name: 'Effect' }).getByRole('button', { name: 'None' }).getAttribute('aria-pressed')
  if (noneOn !== 'true') fails.push('blobscape sandbox: effect still on after making it permanent')
  else if (baked > changed / 50) fails.push(`blobscape sandbox: baked picture differs from the preview in ${baked} pixels (the effect changed ${changed})`)
  else ok(`blobscape sandbox: a baked effect matches its preview (${baked} of ${changed} changed pixels differ)`)
  // Wave loops on its own clock
  await page.getByRole('button', { name: 'Wave', exact: true }).click()
  const w1 = await shot(); await page.waitForTimeout(500); const w2 = await shot()
  if ((await differs(w1, w2)) < 200) fails.push('blobscape sandbox: Wave does not animate')
  else ok('blobscape sandbox: Wave animates')
  await page.getByRole('button', { name: 'None', exact: true }).click()

  // Save as .ply: a standard header and every blob
  await page.getByRole('tab', { name: /Scene/ }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save as .ply' }).click()])
  const saved = readFileSync(await download.path())
  const head = saved.subarray(0, 400).toString('latin1')
  if (download.suggestedFilename() !== 'ball.ply' || !head.includes('element vertex 2000') || !head.includes('property float rot_3')) fails.push(`blobscape sandbox: saved ${download.suggestedFilename()} with header ${JSON.stringify(head.slice(0, 120))}`)
  else ok('blobscape sandbox: saves a standard .ply')

  // A file that isn't a splat: an error, and the scene stays
  await page.setInputFiles('input[type=file]', { name: 'junk.ply', mimeType: 'application/octet-stream', buffer: Buffer.from('not a splat at all') })
  const alert = await page.getByRole('alert').textContent({ timeout: 15000 }).catch(() => '')
  if (!alert.includes("Couldn't open junk.ply") || (await count()) !== 2000) fails.push(`blobscape sandbox: bad file gave "${alert}" and ${await count()} blobs`)
  else ok('blobscape sandbox: a bad file shows an error and keeps the scene')
  // A header that promises two billion splats is caught before Spark's decoder sees it, so a good file still opens after
  const lying = Buffer.from(ballPly(500).toString('latin1').replace('element vertex 500', 'element vertex 2000000000'), 'latin1')
  await page.setInputFiles('input[type=file]', { name: 'liar.ply', mimeType: 'application/octet-stream', buffer: lying })
  await page.waitForFunction(() => document.querySelector('[role=alert]')?.textContent?.includes('liar.ply'), null, { timeout: 15000 }).catch(() => {})
  await page.setInputFiles('input[type=file]', { name: 'small.ply', mimeType: 'application/octet-stream', buffer: ballPly(500) })
  await page.waitForFunction(() => document.querySelector('[data-testid=blob-count]')?.textContent === '500', null, { timeout: 30000 }).catch(() => {})
  if ((await count()) !== 500) fails.push(`blobscape sandbox: after a lying header, a good file gave ${await count()} blobs`)
  else ok('blobscape sandbox: a lying .ply header is refused and the next file still opens')
  // Keyboard: Move nudges the selection with the arrow keys; Delete keeps focus in the panel
  await page.getByRole('tab', { name: /Selection/ }).click()
  await page.getByRole('button', { name: 'Select all' }).click()
  await page.getByRole('button', { name: 'Delete' }).focus()
  await page.keyboard.press('Enter')
  const focusTag = await page.evaluate(() => document.activeElement?.tagName)
  if (focusTag === 'BODY') fails.push('blobscape sandbox: focus fell to the page after Delete')
  else ok('blobscape sandbox: focus stays in the panel after Delete')
  await page.screenshot({ path: join(shots, 'blobscape-sandbox-tools.png') })
  await ctx.close()
}

// 7c. Things from other experiments in the sandbox: a slime (that bursts and grows back) and the watch
{
  const { page, ctx } = await open('/sandbox/', { viewport: { width: 1280, height: 900 } })
  await page.waitForTimeout(1500)
  const inCreatures = async () => Number(((await page.textContent('[data-testid=creature-blob-count]', { timeout: 1000 }).catch(() => '0')) ?? '0').replace(/\D/g, ''))
  await page.getByRole('tab', { name: /Scene/ }).click()
  await page.getByRole('button', { name: 'Empty' }).click()
  await page.getByRole('tab', { name: /Creatures/ }).click()
  await page.getByTestId('add-creature').getByRole('button', { name: 'Slime' }).click()
  await page.waitForTimeout(400)
  const slime = await inCreatures()
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await page.getByRole('button', { name: 'Burst', exact: true }).click()
  await page.getByRole('button', { name: 'Bring to the middle of the view' }).click()
  await page.waitForTimeout(2000)
  const a = await page.getByTestId('viewport').screenshot()
  await page.waitForTimeout(600)
  const b = await page.getByTestId('viewport').screenshot()
  await page.getByTestId('add-creature').getByRole('button', { name: 'Watch' }).click()
  await page.waitForTimeout(800)
  const both = await inCreatures()
  if (!(slime >= 2500 && both - slime >= 25000 && !a.equals(b))) fails.push(`blobscape sandbox props: ${JSON.stringify({ slime, both, same: a.equals(b) })}`)
  else ok(`blobscape sandbox props: adds a slime (${slime.toLocaleString()} blobs) that bursts, and the watch (${(both - slime).toLocaleString()})`)
  await page.screenshot({ path: join(shots, 'blobscape-sandbox-props.png') })
  await axe(page, 'blobscape sandbox props')
  await ctx.close()
}

// 7b. Creatures in the sandbox: add, play, drag with Move, bones, freeze, undo, save
{
  const { page, ctx } = await open('/sandbox/', { viewport: { width: 1280, height: 900 }, acceptDownloads: true })
  await page.waitForTimeout(1500)
  const count = async () => Number((await page.textContent('[data-testid=blob-count]')).replace(/\D/g, ''))
  const inCreatures = async () => Number(((await page.textContent('[data-testid=creature-blob-count]', { timeout: 1000 }).catch(() => '0')) ?? '0').replace(/\D/g, ''))
  const shot = async () => page.getByTestId('viewport').screenshot()
  const differs = (a, b) => page.evaluate(async ([a, b]) => {
    const px = async (s) => { const i = await createImageBitmap(new Blob([Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0))], { type: 'image/png' })); const c = new OffscreenCanvas(i.width, i.height); const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height).data }
    const [p, q] = await Promise.all([px(a), px(b)])
    let n = 0
    for (let k = 0; k < p.length; k += 4) if (Math.abs(p[k] - q[k]) > 24 || Math.abs(p[k + 1] - q[k + 1]) > 24 || Math.abs(p[k + 2] - q[k + 2]) > 24) n++
    return n
  }, [a.toString('base64'), b.toString('base64')])

  await page.getByRole('tab', { name: /Scene/ }).click()
  await page.getByRole('button', { name: 'Empty' }).click()
  await page.getByRole('tab', { name: /Creatures/ }).click()
  await page.getByTestId('add-creature').getByRole('button', { name: 'Fox' }).click()
  await page.waitForTimeout(400)
  const foxBlobs = await inCreatures()
  if (foxBlobs < 4000) fails.push(`blobscape sandbox creatures: a fox added ${foxBlobs} blobs`)
  else ok(`blobscape sandbox creatures: adds a fox of ${foxBlobs.toLocaleString()} blobs beside the scene`)
  await page.getByRole('button', { name: 'Bring to the middle of the view' }).click()
  await page.waitForTimeout(2500)
  // It moves on its own
  const a = await shot()
  await page.waitForTimeout(700)
  const moving = await differs(a, await shot())
  if (moving < 200) fails.push(`blobscape sandbox creatures: the fox didn't move (${moving} px)`)
  else ok(`blobscape sandbox creatures: the fox trots (${moving} px changed)`)
  // Still, then a drag with Move takes it across the floor
  await page.getByRole('button', { name: 'Still', exact: true }).click()
  await page.waitForTimeout(1500)
  const still = await shot()
  await page.getByRole('button', { name: 'Move', exact: true }).click()
  const box = await page.getByTestId('viewport').boundingBox()
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  let grabbed = false
  for (const dy of [-10, -25, -45, 5]) {
    await page.mouse.move(cx, cy + dy)
    await page.mouse.down()
    await page.mouse.move(cx + 80, cy + dy, { steps: 4 })
    await page.mouse.move(cx + 160, cy + dy, { steps: 4 })
    await page.mouse.up()
    await page.waitForTimeout(1500)
    if ((await differs(still, await shot())) > 500) { grabbed = true; break }
  }
  if (!grabbed) fails.push('blobscape sandbox creatures: dragging with Move did not move the fox')
  else ok('blobscape sandbox creatures: Move drags the fox across the floor')
  if ((await count()) !== 0) fails.push(`blobscape sandbox creatures: dragging the fox added ${await count()} scene blobs`)
  // Bones over the blobs
  const blobsOnly = await shot()
  await page.getByRole('group', { name: 'Show creatures as' }).getByRole('button', { name: 'Bones' }).click()
  await page.waitForTimeout(1200)
  if ((await differs(blobsOnly, await shot())) < 500) fails.push('blobscape sandbox creatures: Bones looks the same as Blobs')
  else ok('blobscape sandbox creatures: shows the bones instead of the blobs')
  await page.getByRole('group', { name: 'Show creatures as' }).getByRole('button', { name: 'Blobs' }).click()
  // Saved files hold the creature as it stands
  const [dl] = await Promise.all([page.waitForEvent('download'), (async () => { await page.getByRole('tab', { name: /Scene/ }).click(); await page.getByRole('button', { name: 'Save as .ply' }).click() })()])
  const saved = readFileSync(await dl.path(), 'latin1').match(/element vertex (\d+)/)?.[1]
  if (Number(saved) !== foxBlobs) fails.push(`blobscape sandbox creatures: saved .ply has ${saved} blobs, expected the fox's ${foxBlobs}`)
  else ok('blobscape sandbox creatures: Save as .ply includes the fox')
  // Freeze: its blobs join the scene; Undo brings the creature back
  await page.getByRole('tab', { name: /Creatures/ }).click()
  await page.getByRole('button', { name: 'Freeze into the scene' }).click()
  await page.waitForTimeout(500)
  if ((await count()) !== foxBlobs || (await inCreatures()) !== 0) fails.push(`blobscape sandbox creatures: freezing gave ${await count()} scene blobs and ${await inCreatures()} in creatures`)
  else ok('blobscape sandbox creatures: Freeze turns the fox into ordinary blobs')
  await page.getByRole('button', { name: 'Undo' }).click()
  await page.waitForTimeout(500)
  if ((await count()) !== 0 || (await inCreatures()) !== foxBlobs) fails.push(`blobscape sandbox creatures: undoing the freeze gave ${await count()} / ${await inCreatures()}`)
  else ok('blobscape sandbox creatures: Undo brings the live fox back')
  for (const n of ['Frog', 'Elf', 'Dragon']) await page.getByTestId('add-creature').getByRole('button', { name: n }).click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: join(shots, 'blobscape-sandbox-creatures.png') })
  await axe(page, 'blobscape sandbox with creatures')
  await ctx.close()
  const phone = await open('/sandbox/', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  await phone.page.waitForTimeout(1500)
  await phone.page.getByRole('tab', { name: /Creatures/ }).click()
  await phone.page.getByTestId('add-creature').getByRole('button', { name: 'Frog' }).click()
  await phone.page.waitForTimeout(2000)
  await phone.page.screenshot({ path: join(shots, 'blobscape-sandbox-creatures-phone.png'), fullPage: true })
  await axe(phone.page, 'blobscape phone sandbox with creatures')
  await phone.ctx.close()
}

// The engine page: each of its three live demos draws, and an experiment built on the engine links to it
{
  console.log('engine page')
  for (const demo of ['creature', 'world', 'pixel']) {
    const e = await open(`/engine/?offscreen=1&demo=${demo}`, { viewport: { width: 1280, height: 900 } })
    await e.page.waitForFunction(() => window.__engine?.blobs() > 0 && !document.querySelector('[data-testid=engine-loading]'), null, { timeout: 120000 }).catch(() => {})
    const got = await e.page.evaluate(async () => {
      const en = window.__engine
      if (!en) return null
      await en.stage.frame(en.demo === 'world' ? 2 : 0.7, { forward: 1, turn: 0 })
      const cv = document.querySelector('[data-testid=engine-view]')
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
      // anything brighter than the case behind it
      let lit = 0
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 150) lit++
      return { demo: en.demo, blobs: en.blobs(), lit, status: document.querySelector('[data-testid=engine-status]').textContent, pressed: document.querySelector('[data-testid=engine-demos] [aria-pressed=true]')?.textContent }
    })
    if (!got || got.demo !== demo || !(got.blobs > 5000) || !(got.lit > 5000) || !/blobs, drawn live on Web/.test(got.status)) fails.push(`engine page ${demo}: ${JSON.stringify(got)}`)
    else ok(`engine page: "${got.pressed}" draws ${got.blobs} blobs (${got.lit} lit pixels)`)
    if (demo === 'creature') {
      await e.page.screenshot({ path: join(shots, 'engine-page.png') })
      await axe(e.page, 'engine page')
      // the chips swap the demo in the same view
      await e.page.getByRole('button', { name: 'A pixel scene' }).click()
      await e.page.waitForFunction(() => window.__engine?.demo === 'pixel' && window.__engine.blobs() > 0, null, { timeout: 120000 }).catch(() => {})
      const now = await e.page.evaluate(() => window.__engine?.demo)
      if (now !== 'pixel') fails.push(`engine page: picking "A pixel scene" left the demo as ${now}`)
      else ok('engine page: the chips swap the demo')
    }
    await e.ctx.close()
  }
  const p = await open('/engine/?offscreen=1', { viewport: { width: 390, height: 800 } })
  // closing a page while its engine is still starting loses the device mid-start, so wait for the demo
  await p.page.waitForFunction(() => window.__engine?.blobs() > 0 && !document.querySelector('[data-testid=engine-loading]'), null, { timeout: 120000 }).catch(() => {})
  const wide = await p.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  const cards = await p.page.locator('[data-testid=engine-built] a').count()
  if (wide > 0 || cards !== 6) fails.push(`engine page on a phone: ${wide}px wider than the screen, ${cards} experiments listed`)
  else ok('engine page: fits a phone and lists the six experiments built on the engine')
  await axe(p.page, 'engine page on a phone')
  await p.ctx.close()
  const x = await open('/experiments/clockwork/?offscreen=1', { viewport: { width: 1280, height: 900 } })
  const link = await x.page.getByTestId('built-on').getAttribute('href', { timeout: 10000 }).catch(() => null)
  const html = await (await fetch(base + '/experiments/clockwork/')).text()
  if (link !== '/engine/' || !html.includes('data-testid="built-on"')) fails.push(`an engine experiment's link to the engine page: ${link}, prerendered ${html.includes('data-testid="built-on"')}`)
  else ok('an experiment built on the engine links to the engine page, in its prerendered HTML too')
  await x.ctx.close()
}

// Engine lab (unlisted): the splat engine on WebGPU and on WebGL. Headless
// software WebGPU can render but not present to a canvas, so the lab draws
// off-screen and copies frames to the page.
{
  console.log('engine lab')
  for (const webgl of [false, true]) {
    const label = webgl ? 'webgl' : 'webgpu'
    const { page, ctx } = await open(`/engine-lab/?which=engine&n=12000&walk=0&herd=2&offscreen=1${webgl ? '&webgl=1' : ''}`, { viewport: { width: 1000, height: 1000 } })
    await page.waitForFunction(() => window.__lab || window.__labError, null, { timeout: 60000 })
    const err = await page.evaluate(() => window.__labError)
    if (err) { fails.push(`engine lab ${label}: ${err}`); await ctx.close(); continue }
    const backend = await page.evaluate(() => window.__lab.info)
    if (!backend.includes(label)) fails.push(`engine lab: asked for ${label}, got ${backend}`)
    // GPU deform matches the CPU twin, both ways of turning blobs (WebGPU only; WebGL deforms on the CPU)
    if (!webgl) {
      for (const mode of ['quat', 'linear']) {
        const r = await page.evaluate(async (m) => { const l = window.__lab; l.setWalk(true); l.setMode(m); await l.frame(0.37); return l.world.checkAgainstCPU(l.renderer) }, mode)
        if (!(r.center < 1e-3 && r.cov < r.covScale * 0.01)) fails.push(`engine lab ${mode}: GPU and CPU differ ${JSON.stringify(r)}`)
        else ok(`engine lab: GPU skinning matches the CPU (${mode}, center ±${r.center.toExponential(1)})`)
      }
    }
    if (!webgl) {
      const so = await page.evaluate(async () => { const l = window.__lab; await l.frame(0.3); return l.world.checkSort(l.renderer) })
      if (so.missing || so.outOfOrder || so.unsettled) fails.push(`engine lab: GPU sort ${JSON.stringify(so)}`)
      else ok(`engine lab: GPU sort draws every blob once, farthest first, and blobs at one depth in index order (at most ${so.biggest} at one depth)`)
    }
    const steps = await page.evaluate(() => window.__lab.profile(2))
    if (!(steps.draw > 0) || (!webgl && !(steps.deform > 0 && steps.project > 0 && steps.order > 0))) fails.push(`engine lab ${label}: step times ${JSON.stringify(steps)}`)
    else ok(`engine lab ${label}: times each step (move ${steps.deform.toFixed(0)}, project ${steps.project.toFixed(0)}, sort ${steps.order.toFixed(0)}, draw ${steps.draw.toFixed(0)} ms; CPU ${steps.cpuSkin.toFixed(0)}+${steps.cpuSort.toFixed(0)})`)
    // it draws something fox-colored in the middle of the frame
    await page.evaluate(() => window.__lab.frame(0.2))
    const orange = await page.evaluate(() => {
      const c = document.querySelector('canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] > 50 && d[i + 1] < 140 && d[i + 2] < 80) n++
      return n
    })
    if (orange < 2000) fails.push(`engine lab ${label}: only ${orange} fox-orange pixels`)
    else ok(`engine lab ${label}: draws the foxes (${orange} orange pixels)`)
    // the bones reach the GPU every frame: growing the foxes from their roots makes them bigger on screen
    const grown = await page.evaluate(async () => {
      const l = window.__lab
      l.setWalk(true) // standing still resets the pose, root scale included
      for (const a of l.world.actors) a.skeleton.rootScale = 1.5
      await l.frame(0.2)
      const c = document.querySelector('canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] > 50 && d[i + 1] < 140 && d[i + 2] < 80) n++
      for (const a of l.world.actors) a.skeleton.rootScale = 1
      await l.frame(0.2)
      return n
    })
    if (!(grown > orange * 1.5)) fails.push(`engine lab ${label}: posing doesn't reach the draw (${orange} → ${grown} orange pixels at 1.5× size)`)
    else ok(`engine lab ${label}: posing reaches the draw (${orange} → ${grown} orange pixels at 1.5× size)`)
    const bench = await page.evaluate(() => window.__lab.bench(3))
    if (!(bench.alone > 0)) fails.push(`engine lab ${label}: bench ${JSON.stringify(bench)}`)
    else ok(`engine lab ${label}: times frames (${bench.alone.toFixed(0)} ms in software)`)
    await page.screenshot({ path: join(shots, `engine-lab-${label}.png`) })
    if (!webgl) {
      // our rigged .glb opens in three.js's own loader as a still splat, with its animation
      const g = await page.evaluate(() => window.__glbCheck())
      if (!(g.splats > 4000 && g.animations === 1)) fails.push(`engine lab glb: ${JSON.stringify(g)}`)
      else ok(`engine lab: three.js opens our rigged .glb (${g.splats} splats, ${g.animations} animation)`)
      const m = await page.evaluate(() => window.__meshGlbCheck())
      if (!(m.skinned && m.triangles > 1000 && m.animations === 1)) fails.push(`engine lab mesh glb: ${JSON.stringify(m)}`)
      else ok(`engine lab: three.js opens our mesh .glb as a skinned mesh (${m.triangles} triangles, ${m.animations} animation)`)
      // the walk sheet: 4 rows × 8 frames, every frame drawn, side views wider than front views
      const s = await page.evaluate(() => window.__sheet())
      const side = s.solid.slice(8, 24), front = s.solid.slice(0, 8)
      if (s.cols !== 8 || s.rows !== 4 || s.solid.some((k) => k < 100) || Math.min(...side) <= Math.max(...front)) fails.push(`engine lab sheet: ${JSON.stringify(s)}`)
      else ok('engine lab: walk sheet has 32 drawn frames, side views wider than front')
      await axe(page, 'engine lab')
    }
    await ctx.close()
  }
}

// Engine lab, Spark's run: the same fox walked by Spark 2.4's own SplatSkinning, both joint rules.
{
  for (const mode of ['quat', 'linear']) {
    const label = `spark ${mode === 'quat' ? 'dual quaternions' : 'linear blend'}`
    const { page, ctx } = await open(`/engine-lab/?which=spark&n=12000&walk=1&herd=2&mode=${mode}&offscreen=1`, { viewport: { width: 1000, height: 1000 } })
    await page.waitForFunction(() => window.__lab || window.__labError, null, { timeout: 60000 })
    const err = await page.evaluate(() => window.__labError)
    if (err) { fails.push(`engine lab ${label}: ${err}`); await ctx.close(); continue }
    const look = (t) => page.evaluate(async (t) => {
      await window.__lab.frame(t)
      const c = document.querySelector('canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      let n = 0; const on = new Uint8Array(d.length / 4)
      for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] > 50 && d[i + 1] < 140 && d[i + 2] < 80) { n++; on[i / 4] = 1 }
      return { n, on: Array.from(on) }
    }, t)
    const a = await look(0.1), b = await look(0.45)
    const moved = a.on.reduce((s, v, i) => s + (v !== b.on[i] ? 1 : 0), 0)
    if (a.n < 2000) fails.push(`engine lab ${label}: only ${a.n} fox-orange pixels`)
    else if (moved < a.n / 20) fails.push(`engine lab ${label}: the foxes don't move (${moved} pixels changed)`)
    else ok(`engine lab ${label}: Spark draws the foxes and walks them (${a.n} orange pixels, ${moved} change mid-stride)`)
    const bench = await page.evaluate(() => window.__lab.bench(3))
    if (!(bench.alone > 0)) fails.push(`engine lab ${label}: bench ${JSON.stringify(bench)}`)
    else ok(`engine lab ${label}: times frames (${bench.alone.toFixed(0)} ms in software)`)
    await page.screenshot({ path: join(shots, `engine-lab-spark-${mode}.png`) })
    await ctx.close()
  }
}

await browser.close()
server?.close()
if (fails.length) {
  console.error('\nFAIL\n' + fails.map((f) => '  - ' + f).join('\n'))
  process.exit(1)
}
console.log('\nverify ok — screenshots in verify-shots/')
