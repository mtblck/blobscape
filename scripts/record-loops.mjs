/**
 * Records each Diorama scene's loop as pixel art, one art pixel per
 * image pixel, from the production build in headless Chromium. The frames
 * are the engine's own art (`stage.pixelFrames().art`), stepped through
 * `stage.frame(t)`, so a loop is the same every run and joins up end to end.
 * Run `npm run build` first.
 *   npm run loops -- [out] [ids…] [--lanes=N] [--site]   (default out: loops/; all scenes)
 * Writes <out>/<id>.webp (lossless, looping), <id>.mp4 (3× for posting), <id>.png (the first
 * frame) and <id>.json ({ width, height, fps, frames, loop }). Needs ffmpeg. PORT and KEEP_RAW=1 are optional.
 *
 * Several scenes are recorded at once, each in its own page: `--lanes=N` says how many (by default one
 * for every processor but one, at most four; a scene is cut and drawn on the CPU here, so more lanes
 * than processors only slows each one). `--site` also copies each scene's .webp and .png into
 * public/loops/, where the gallery reads them. A scene that fails is named at the end and the run
 * exits with an error, after the others have finished.
 *
 * .github/workflows/loops.yml runs this on GitHub, a scene a job, for brand new scenes a push to
 * main left with no loop (scripts/loops-missing.mjs) or the ones asked for by hand, and opens a pull request
 * with the new loops.
 */
import { chromium } from 'playwright-core'
import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdirSync, statSync, writeFileSync, openSync, writeSync, closeSync, copyFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { join, extname, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { DIORAMAS } from '../src/blobscape/diorama/scenes.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const args = process.argv.slice(2)
const flags = args.filter((a) => a.startsWith('--'))
const [outArg, ...picked] = args.filter((a) => !a.startsWith('--'))
for (const f of flags) if (!/^--(site|lanes=\d+)$/.test(f)) throw new Error(`unknown option ${f}`)
const toSite = flags.includes('--site')
const asked = flags.find((f) => f.startsWith('--lanes='))
const out = resolve(root, outArg ?? 'loops')
mkdirSync(out, { recursive: true })
/** Frames a second: 12 is one of the page's Motion choices and keeps a loop small. */
const FPS = 12
/** The page's width: the preview is two thirds of it, so the art comes out near 210 × 158. */
const VIEW = { width: 1280, height: 900 }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.wasm': 'application/wasm' }
const server = createServer((req, res) => {
  let file = join(dist, req.url.split('?')[0])
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!existsSync(file)) { res.statusCode = 404; return res.end() }
  res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
  res.end(readFileSync(file))
})
const PORT = Number(process.env.PORT ?? 4182)
await new Promise((r) => server.listen(PORT, r))
const base = `http://localhost:${PORT}`

const executablePath = process.env.CHROME_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const browser = await chromium.launch({ executablePath, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] })

const scenes = new Map(DIORAMAS.map((d) => [d.id, d]))
const ids = picked.length ? picked : [...scenes.keys()]
for (const id of ids) if (!scenes.has(id)) throw new Error(`no scene ${id}`)
const lanes = Math.max(1, Math.min(ids.length, asked ? Number(asked.slice(8)) : Math.min(4, availableParallelism() - 1)))

async function record(id) {
  const started = Date.now()
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.error(`${id}: ${e.message}`))
  await page.goto(`${base}/experiments/pixel-diorama/?offscreen=1&scene=${id}`)
  // ready once the scene is cut (no loading mark) and the art has a size; then hold still a moment for late effects
  const ready = () => page.waitForFunction(async () => { const d = window.__diorama; if (!d || document.querySelector('[data-testid=diorama-loading]')) return false; await d.stage.frame(0); return !!d.stage.artSize }, null, { timeout: 300000, polling: 1000 })
  await ready()
  await page.waitForTimeout(1500)
  await ready()
  const loop = scenes.get(id).loop
  const count = Math.round(loop * FPS)
  // play the last half second first, so steady pixels have the frame before frame 0, as they do on the page
  await page.evaluate(async ({ loop, FPS }) => {
    // the page sets this again whenever its look changes, so wait out the moment it is gone
      while (!window.__diorama) await new Promise((r) => setTimeout(r, 50))
      const { stage } = window.__diorama
    stage.playing = false
    for (let i = Math.round(FPS / 2); i > 0; i--) await stage.frame(loop - i / FPS)
  }, { loop, FPS })
  const raw = openSync(join(out, `${id}.rgba`), 'w')
  let size
  for (let f = 0; f < count; f++) {
    const frame = await page.evaluate(async (t) => {
      // the page sets this again whenever its look changes, so wait out the moment it is gone
      while (!window.__diorama) await new Promise((r) => setTimeout(r, 50))
      const { stage } = window.__diorama
      await stage.frame(t)
      const { art } = await stage.pixelFrames()
      // base64 is the cheapest way across; a frame is ~130 KB
      let s = ''
      for (let i = 0; i < art.data.length; i += 0x8000) s += String.fromCharCode.apply(null, art.data.subarray(i, i + 0x8000))
      return { width: art.width, height: art.height, data: btoa(s) }
    }, f / FPS)
    if (size && (frame.width !== size.width || frame.height !== size.height)) throw new Error(`${id}: the art changed size mid-loop`)
    size = { width: frame.width, height: frame.height }
    writeSync(raw, Buffer.from(frame.data, 'base64'))
  }
  closeSync(raw)
  // a lossless animated WebP for the page (pixel art keeps it small), and an MP4 scaled up 3× in whole pixels for posting
  const raw_ = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${size.width}x${size.height}`, '-r', String(FPS), '-i', join(out, `${id}.rgba`)]
  execFileSync('ffmpeg', [...raw_, '-c:v', 'libwebp_anim', '-lossless', '1', '-loop', '0', join(out, `${id}.webp`)])
  execFileSync('ffmpeg', [...raw_, '-vf', 'scale=iw*3:ih*3:flags=neighbor,pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(out, `${id}.mp4`)])
  execFileSync('ffmpeg', [...raw_, '-vf', 'select=eq(n\\,0)', '-frames:v', '1', join(out, `${id}.png`)])
  if (!process.env.KEEP_RAW) rmSync(join(out, `${id}.rgba`))
  writeFileSync(join(out, `${id}.json`), JSON.stringify({ id, ...size, fps: FPS, frames: count, loop }))
  if (toSite) for (const ext of ['webp', 'png']) copyFileSync(join(out, `${id}.${ext}`), join(root, 'public', 'loops', `${id}.${ext}`))
  console.log(`${id}: ${count} frames at ${size.width} × ${size.height} in ${((Date.now() - started) / 1000).toFixed(0)} s`)
  await ctx.close()
}

// each lane takes the next scene not yet started, so a slow scene holds up only its own lane
const waiting = [...ids]
const failed = []
await Promise.all(Array.from({ length: lanes }, async () => {
  for (let id = waiting.shift(); id; id = waiting.shift()) {
    try { await record(id) } catch (e) { failed.push(id); console.error(`${id}: ${e.message}`) }
  }
}))
await browser.close()
server.close()
if (failed.length) { console.error(`not recorded: ${failed.join(' ')}`); process.exit(1) }
