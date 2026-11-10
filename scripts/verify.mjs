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
    if (!existsSync(file)) { res.statusCode = 404; return res.end('not found') }
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
    for (const h of headersFor(url)) res.setHeader(h.key, h.value)
    res.end(readFileSync(file))
  })
  await new Promise((r) => server.listen(4181, r))
  base = 'http://localhost:4181'
}

const executablePath = process.env.CHROME_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const browser = await chromium.launch({ executablePath, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] })
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

// 1. Hub
{
  const { page, res, ctx } = await open('/experiments/')
  if (res.status() !== 200) fails.push(`hub status ${res.status()}`)
  const csp = res.headers()['content-security-policy'] ?? ''
  if (!csp.includes('wasm-unsafe-eval')) fails.push('test server is not sending the production CSP')
  if (!(await page.getByRole('link', { name: /Splat to Sprite/ }).count())) fails.push('hub does not link to splat-to-sprite')
  else ok('hub lists splat-to-sprite under the production CSP')
  if (!(await page.getByRole('link', { name: /Fit a Picture/ }).count())) fails.push('hub does not link to fit-a-picture')
  else ok('hub lists fit-a-picture')
  if (!(await page.getByRole('banner').getByRole('link', { name: 'Matt Black' }).count())) fails.push('hub has no site header')
  await axe(page, 'hub')
  // The theme switch flips the palette and remembers it under the portfolio's key
  await page.getByRole('button', { name: /Switch to (light|dark) theme/ }).click()
  const flipped = await page.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('mb-theme')])
  if (flipped[0] !== flipped[1] || !flipped[0]) fails.push(`theme switch gave ${flipped.join(' / ')}`)
  else ok(`theme switch flips to ${flipped[0]} and stores it`)
  await axe(page, 'hub, theme switched')
  await ctx.close()
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

// 3. A user's own .ply: the standard 3DGS layout, 2,000 splats on a sphere
{
  const n = 2000
  const props = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3']
  const header = `ply\nformat binary_little_endian 1.0\nelement vertex ${n}\n${props.map((p) => `property float ${p}`).join('\n')}\nend_header\n`
  const body = new Float32Array(n * props.length)
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), t = i * 2.39996
    // SH DC term: colour = 0.5 + 0.28209 * f_dc; opacity and scale are stored pre-activation
    body.set([Math.cos(t) * r, y, Math.sin(t) * r, 1.5, -1.2, -1.2, 4, -3, -3, -3, 1, 0, 0, 0], i * props.length)
  }
  const buf = Buffer.concat([Buffer.from(header), Buffer.from(body.buffer)])
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
  else if (!stillBall) fails.push('bad file relabelled the loaded object')
  else ok('a bad file shows an error and keeps the loaded object and its name')
  await page.screenshot({ path: join(shots, 'splat-to-sprite-ply.png') })
  await ctx.close()
}

// 4. Dark theme renders with the dark palette
{
  const { page, ctx } = await open('/experiments/splat-to-sprite/', { colorScheme: 'dark', viewport: { width: 1280, height: 900 } })
  const theme = await page.evaluate(() => document.documentElement.dataset.theme)
  if (theme !== 'dark') fails.push(`dark preference gave theme ${theme}`)
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
  const { page, ctx } = await open('/experiments/fit-a-picture/', { colorScheme: 'dark', viewport: { width: 1280, height: 900 } })
  await page.waitForTimeout(2500)
  await axe(page, 'fit dark')
  await page.screenshot({ path: join(shots, 'fit-a-picture-dark.png') })
  await ctx.close()
}

await browser.close()
server?.close()
if (fails.length) {
  console.error('\nFAIL\n' + fails.map((f) => '  - ' + f).join('\n'))
  process.exit(1)
}
console.log('\nverify ok — screenshots in verify-shots/')
