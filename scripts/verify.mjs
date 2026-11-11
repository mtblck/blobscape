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
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' }

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
  for (const [path, title] of [['/', 'Blobscape: learn'], ['/lessons/', 'Lessons ·'], ['/lessons/order/', 'Order matters · Lesson 3'], ['/sandbox/', 'Sandbox ·'], ['/creature/', 'Creature ·'], ['/experiments/', 'Experiments ·']]) {
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
  if (!sitemap.includes('https://blobscape.dev/lessons/model/') || !sitemap.includes('/tools/fit-a-picture/')) fails.push('sitemap.xml is missing pages')
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
  await page.waitForTimeout(600) // let colour transitions (the tip button's) finish before measuring contrast
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
    const cards = ex.page.locator('main').getByRole('link', { name: /Creature|Fit a Picture|Splat to Sprite/ })
    if ((await cards.count()) < 3) fails.push('experiments page does not list every experiment')
    else if ((await ex.page.getByRole('banner').getByRole('link', { name: 'Experiments', exact: true }).getAttribute('aria-current')) !== 'page') fails.push('header does not mark Experiments as the current page')
    else ok('header Experiments link opens the experiments page, which lists every experiment')
    await axe(ex.page, 'experiments page')
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
  const { page, ctx } = await open('/tools/splat-to-sprite/', opts)
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
    await page.getByRole('tab', { name: /Camera/ }).focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    const colourOn = (await page.getByRole('tab', { name: /Colour/ }).getAttribute('aria-selected')) === 'true'
    const paletteShows = await page.getByRole('combobox', { name: 'Palette' }).isVisible()
    const turnHidden = !(await page.getByRole('slider', { name: 'Turn' }).isVisible())
    if (!colourOn || !paletteShows || !turnHidden) fails.push(`tabs: colour selected ${colourOn}, palette visible ${paletteShows}, camera hidden ${turnHidden}`)
    else ok('arrow keys move through the settings tabs')
    await axe(page, 'desktop colour tab')
    await page.getByRole('tab', { name: /Camera/ }).click()
    // The header stays on screen once the page scrolls
    await page.evaluate(() => window.scrollTo(0, 900))
    const top = await page.getByRole('banner').evaluate((h) => h.getBoundingClientRect().top)
    if (top !== 0) fails.push(`header scrolled away (top ${top})`)
    else ok('header stays stuck to the top while scrolling')
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.getByRole('button', { name: 'Isometric' }).click()
    if ((await page.getByRole('button', { name: 'Isometric' }).getAttribute('aria-pressed')) !== 'true') fails.push('Isometric preset does not show as selected')
    else ok('Isometric preset shows as selected')
    await page.getByRole('button', { name: '¾ view' }).click()
    await page.getByRole('slider', { name: 'Turn' }).fill('30')
    await page.getByRole('button', { name: 'Bake sprite sheet' }).click()
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
    else ok('sheet shows its 4 frames, labelled')
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
    // SH DC term: colour = 0.5 + 0.28209 * f_dc; opacity and scale are stored pre-activation
    body.set([Math.cos(t) * r, y, Math.sin(t) * r, 1.5, -1.2, -1.2, 4, -3, -3, -3, 1, 0, 0, 0], i * props.length)
  }
  return Buffer.concat([Buffer.from(header), Buffer.from(body.buffer)])
}

// 3. The .ply in Splat to Sprite
{
  const buf = ballPly()
  const { page, ctx } = await open('/tools/splat-to-sprite/', { viewport: { width: 1280, height: 900 } })
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
  else if (!stillBall) fails.push('bad file relabelled the loaded object')
  else ok('a bad file shows an error and keeps the loaded object and its name')
  await page.screenshot({ path: join(shots, 'splat-to-sprite-ply.png') })
  await ctx.close()
}

// 4. Dark theme renders with the dark palette
{
  const { page, ctx } = await open('/tools/splat-to-sprite/', { colorScheme: 'dark', viewport: { width: 1280, height: 900 } })
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
  const { page, ctx } = await open('/tools/fit-a-picture/', opts)
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
    await page.getByRole('button', { name: 'Pause' }).click()
    await page.waitForTimeout(300)
    const held = await stepNow(page)
    await page.waitForTimeout(500)
    if ((await stepNow(page)) !== held) fails.push('fit: pause does not stop training')
    await page.getByRole('button', { name: 'Step once' }).click()
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
    // Views, through the tabs
    await page.getByRole('tab', { name: /View/ }).click()
    for (const v of ['Blobs', 'Error']) {
      await page.getByRole('button', { name: v, exact: true }).click()
      await page.waitForTimeout(400)
      if ((await page.getByRole('button', { name: v, exact: true }).getAttribute('aria-pressed')) !== 'true') fails.push(`fit: ${v} view not selected`)
      await page.screenshot({ path: join(shots, `fit-a-picture-${v.toLowerCase()}.png`) })
    }
    ok('fit: blobs and error views switch')
    await axe(page, 'fit error view')
    await page.getByRole('button', { name: 'Fit', exact: true }).click()
    await page.getByRole('button', { name: 'Resume' }).click()
    // Prune now and add 100, from the Blobs tab
    await page.getByRole('tab', { name: /Blobs/ }).click()
    const b0 = await blobsNow(page)
    await page.getByRole('button', { name: "Add 100 where it's wrong" }).click()
    await page.waitForTimeout(600)
    if ((await blobsNow(page)) < b0 + 50) fails.push(`fit: add 100 went ${b0} → ${await blobsNow(page)}`)
    else ok('fit: "Add 100 where it\'s wrong" adds blobs')
    await page.getByRole('button', { name: 'Prune now' }).click()
    await page.waitForFunction(() => /prune/i.test(document.querySelector('[data-testid=log]').textContent), null, { timeout: 5000 }).catch(() => {})
    if (!/prune/i.test(await page.textContent('[data-testid=log]'))) fails.push('fit: prune now leaves no log line')
    else ok('fit: prune now is logged')
    await axe(page, 'fit blobs tab')
    // The user's own picture: a PNG made from a screenshot, then a file that isn't a picture
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: 300, height: 200 } })
    await page.setInputFiles('input[type=file]', { name: 'mine.png', mimeType: 'image/png', buffer: png })
    await page.waitForFunction(() => /mine/.test(document.body.textContent), null, { timeout: 10000 }).catch(() => {})
    if (!(await page.getByRole('button', { name: 'mine' }).count())) fails.push('fit: own picture did not load')
    else ok('fit: an own picture loads and the fit restarts')
    await page.setInputFiles('input[type=file]', { name: 'junk.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') })
    const alert = await page.getByRole('alert').textContent({ timeout: 5000 }).catch(() => '')
    if (!alert.includes("didn't open")) fails.push(`fit: bad file shows "${alert}"`)
    else ok('fit: a bad file shows an error')
    await page.getByRole('button', { name: 'Marbles' }).click()
  }
  await page.waitForTimeout(3000)
  await page.screenshot({ path: join(shots, `fit-a-picture-${label}.png`), fullPage: true })
  await ctx.close()
}
{
  const { page, ctx } = await open('/tools/fit-a-picture/', { colorScheme: 'dark', viewport: { width: 1280, height: 900 } })
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
    if (lessons < 13) fails.push(`blobscape ${label}: home lists ${lessons} lessons`)
    else ok(`blobscape ${label}: home lists the lessons`)
    await axe(page, `blobscape ${label} home`)
    await page.screenshot({ path: join(shots, `blobscape-home-${label}.png`), fullPage: true })
    for (const id of ['lessons', 'one-blob', 'footprint', 'order', 'many', 'angle', 'paint', 'formats', 'break', 'one-bone', 'weights', 'twist', 'walk', 'model', 'sandbox', 'creature']) {
      // headless WebGPU can't present to a canvas, so Creature draws off-screen here
      await page.goto(base + (id === 'creature' ? '/creature/?offscreen=1' : ['sandbox', 'lessons'].includes(id) ? `/${id}/` : `/lessons/${id}/`))
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
  await page.getByRole('button', { name: 'Pancake' }).click()
  await page.getByRole('slider', { name: 'Roll (z)' }).fill('40')
  await page.waitForFunction(() => document.querySelector('[data-testid=goal-count]')?.textContent.startsWith('2 of'), null, { timeout: 5000 }).catch(() => {})
  const goals = await page.textContent('[data-testid=goal-count]')
  if (!goals.startsWith('2 of')) fails.push(`blobscape: one blob goals show "${goals}" after pancake and turn`)
  else ok('blobscape: lesson goals tick off (pancake, turn)')
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
  await page.waitForTimeout(600)
  if (!(await page.locator('a.tipjar[data-tucked]').count())) fails.push('blobscape: the tip button stays over the footer')
  else ok('blobscape: the tip button tucks away at the footer')
  await page.goto(base + '/lessons/paint/')
  await page.waitForTimeout(500)
  if (!(await page.title()).startsWith('Paint · Lesson 6')) fails.push(`blobscape: lesson title is "${await page.title()}"`)
  else ok('blobscape: each page sets its own title')
  if (await page.locator('a.tipjar').count()) fails.push('blobscape: the tip button covers a lesson')

  // Colour by angle: degree 3 keeps up with a soft shine and falls behind a sharp one
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
  await slider('Centred at').fill('0.5')
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
    const c = await open('/creature/?offscreen=1', { viewport: { width: 1280, height: 900 } })
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
    await c.page.getByRole('button', { name: '5k', exact: true }).click()
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
    await c.ctx.close()
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
  // Keyboard: Enter on the focused view uses the tool at its centre
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const beforeKey = await count(page)
  await page.getByTestId('viewport').focus()
  await page.keyboard.press('Enter')
  if ((await count(page)) !== beforeKey + 1) fails.push(`blobscape sandbox: Enter with Add went ${beforeKey} → ${await count(page)}`)
  else ok('blobscape sandbox: Enter on the view adds a blob at the centre')
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
        if (!(r.centre < 1e-3 && r.cov < r.covScale * 0.01)) fails.push(`engine lab ${mode}: GPU and CPU differ ${JSON.stringify(r)}`)
        else ok(`engine lab: GPU skinning matches the CPU (${mode}, centre ±${r.centre.toExponential(1)})`)
      }
    }
    if (!webgl) {
      const so = await page.evaluate(async () => { const l = window.__lab; await l.frame(0.3); return l.world.checkSort(l.renderer) })
      if (so.missing || so.outOfOrder) fails.push(`engine lab: GPU sort ${JSON.stringify(so)}`)
      else ok('engine lab: GPU sort draws every blob once, farthest first')
    }
    const steps = await page.evaluate(() => window.__lab.profile(2))
    if (!(steps.draw > 0) || (!webgl && !(steps.deform > 0 && steps.project > 0 && steps.order > 0))) fails.push(`engine lab ${label}: step times ${JSON.stringify(steps)}`)
    else ok(`engine lab ${label}: times each step (move ${steps.deform.toFixed(0)}, project ${steps.project.toFixed(0)}, sort ${steps.order.toFixed(0)}, draw ${steps.draw.toFixed(0)} ms; CPU ${steps.cpuSkin.toFixed(0)}+${steps.cpuSort.toFixed(0)})`)
    // it draws something fox-coloured in the middle of the frame
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

await browser.close()
server?.close()
if (fails.length) {
  console.error('\nFAIL\n' + fails.map((f) => '  - ' + f).join('\n'))
  process.exit(1)
}
console.log('\nverify ok — screenshots in verify-shots/')
