/**
 * What every browser check shares: the production server (dist under the
 * vercel.json headers), a pool of Chromium browsers, and the helpers a check
 * gets as `t` (open, ok, fails, axe, tabClick, solidPixels, ballPly).
 */
import { chromium } from 'playwright-core'
import { AxeBuilder } from '@axe-core/playwright'
import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const dist = join(root, 'dist')
export const shots = join(root, 'verify-shots')

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.glb': 'model/gltf-binary', '.mp4': 'video/mp4' }

/** Serves ./dist with the production headers; resolves to its base URL. */
export async function serveDist(port = 4181) {
  const blocks = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')).headers
  const headersFor = (url) => blocks.filter((b) => new RegExp(`^${b.source}$`).test(url)).flatMap((b) => b.headers)
  const server = createServer((req, res) => {
    const url = req.url.split('?')[0]
    let file = join(dist, url)
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!existsSync(file)) { res.statusCode = 404; res.setHeader('Content-Type', 'text/html'); return res.end(readFileSync(join(dist, '404.html'))) }
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
    for (const h of headersFor(url)) res.setHeader(h.key, h.value)
    res.end(readFileSync(file))
  })
  await new Promise((r, j) => server.once('error', j).listen(port, r))
  return { server, base: `http://localhost:${port}` }
}

export function launch() {
  const executablePath = process.env.CHROME_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
  return chromium.launch({ executablePath, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] })
}

/** How many times longer than Playwright's 30 seconds an action may take: `VERIFY_SLOW=3` on a shared runner. */
const SLOW = Number(process.env.VERIFY_SLOW) || 0

export const DESKTOP = { viewport: { width: 1440, height: 1000 } }
export const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }

/** A user's own .ply: the standard 3DGS layout, 2,000 splats on a sphere. */
export function ballPly(n = 2000) {
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

/**
 * The `t` a check runs with. Its own list of failures and its own log, so
 * checks running side by side don't mix their output.
 */
export function checkContext(browser, base, parts) {
  mkdirSync(shots, { recursive: true })
  const fails = []
  const log = []
  const ok = (m) => log.push(`  ok  ${m}`)
  const contexts = new Set()

  async function open(path, opts = {}) {
    const ctx = await browser.newContext({ deviceScaleFactor: 1, ...opts })
    // a shared runner (GitHub's) can be several times slower from one run to the next: clicks, loads and pictures get longer to finish there
    if (SLOW) { ctx.setDefaultTimeout(30000 * SLOW); ctx.setDefaultNavigationTimeout(30000 * SLOW) }
    contexts.add(ctx)
    ctx.once('close', () => contexts.delete(ctx))
    const page = await ctx.newPage()
    if (SLOW) { const wait = page.waitForFunction.bind(page); page.waitForFunction = (fn, arg, o) => wait(fn, arg, o?.timeout ? { ...o, timeout: o.timeout * SLOW } : o) }
    page.on('console', (m) => { if (m.type() === 'error') fails.push(`${path} console: ${m.text()}`) })
    page.on('pageerror', (e) => fails.push(`${path} pageerror: ${e.message}`))
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP blocked ${e.blockedURI} (${e.violatedDirective})`)))
    const res = await page.goto(base + path, { waitUntil: 'load' })
    return { page, res, ctx }
  }

  /** Options sit in tabs (the sandbox's in modes, some in folded sections): open the tab and section that hold a control, then click the control. */
  async function tabClick(control) {
    const page = control.page()
    const shows = () => control.first().isVisible().catch(() => false)
    // a control in a folded section (the sandbox's Scene) is hidden from every query too: open each section in turn
    const unfold = async () => {
      for (const summary of await page.locator('[role=tabpanel]:not([hidden]) details > summary, section[aria-label=Options] details > summary').all()) {
        if (await shows()) return
        if (!(await summary.evaluate((el) => el.parentElement.open).catch(() => true))) await summary.click().catch(() => {})
      }
    }
    if (!(await shows())) await unfold()
    if (!(await shows())) {
      // a control in a closed tab is hidden from every query, so try each tab until it shows
      for (const tab of await page.locator('section[aria-label=Options] [role=tab], [role=tablist][aria-label="Sandbox modes"] [role=tab]').all()) {
        await tab.click()
        if (await shows()) break
        await unfold()
        if (await shows()) break
      }
    }
    await control.click()
  }


  // axe-core on the rendered page; any violation fails the run
  async function axe(page, label) {
    // let transitions and one-off animations finish first: under load a fading color is caught mid-way and fails contrast
    await page.evaluate(() => Promise.race([
      Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))),
      new Promise((r) => setTimeout(r, 3000)),
    ])).catch(() => {})
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

  /** Whether to run one part of a check (a scene, a page): all of them unless --changed narrowed it. */
  const wants = (key) => !parts || parts.has(key)

  // closes whatever a failed check left open
  const cleanup = () => Promise.all([...contexts].map((c) => c.close().catch(() => {})))

  return { base, root, readFileSync, shots, join, fails, ok, log, open, tabClick, axe, solidPixels, ballPly, wants, DESKTOP, PHONE, cleanup }
}
