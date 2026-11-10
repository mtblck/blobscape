/**
 * Real-browser check of the production build under the production headers.
 * Fails on console errors, page errors and CSP violations, and checks the
 * splat actually renders into a sprite and a sheet. Run `npm run build` first.
 *   node scripts/verify.mjs [baseUrl]   (default: serves ./dist on :4181)
 */
import { chromium } from 'playwright-core'
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
  if (label === 'desktop') {
    await page.getByRole('button', { name: 'Bake sprite sheet' }).click()
    await page.waitForSelector('[data-testid=sheet] img', { timeout: 60000 })
    const dims = await page.evaluate(async () => {
      const img = document.querySelector('[data-testid=sheet] img')
      await img.decode()
      return [img.naturalWidth, img.naturalHeight]
    })
    if (dims[0] !== 32 || dims[1] !== 128) fails.push(`4-direction sheet is ${dims.join('×')}, expected 32×128`)
    else ok('baked a 4-direction 32×128 sheet')
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
  await page.screenshot({ path: join(shots, 'splat-to-sprite-dark.png') })
  await ctx.close()
}

await browser.close()
server?.close()
if (fails.length) {
  console.error('\nFAIL\n' + fails.map((f) => '  - ' + f).join('\n'))
  process.exit(1)
}
console.log('\nverify ok — screenshots in verify-shots/')
