/**
 * Records a highlight reel of an experiment: a list of short shots (a few settings, a camera move, a caption),
 * with a title card first and last, cut together into one MP4. It works as scripts/record-loops.mjs does: the
 * production build in headless Chromium, every frame stepped with `stage.frame(t)`, so a reel is the same every
 * run and takes as long as it takes. Run `npm run build` first. Needs ffmpeg.
 *   npm run reel -- <name> [out] [--lanes=N] [--only=3,4] [--scale=0.5] [--stills]
 * `<name>` is a file in scripts/reels/ (see seasonal-bouquets.mjs for what a reel is). Writes <out>/<name>.mp4
 * (default out: reels/) and keeps each shot beside it in <out>/<name>-shots/, so `--only` can record a few again
 * and cut the reel from those and the ones already there. `--scale` makes it smaller for a quick look, `--stills`
 * draws only the middle frame of each shot into one sheet (<out>/<name>-stills.png).
 *
 * What is recorded is the view alone: the page's canvas over its own backdrop, blown up to fill the window, with
 * every button and hint over it hidden; a shot's caption is laid over that in the site's own type.
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { join, resolve } from 'node:path'
import { once } from 'node:events'
import { root, serveDist, launch } from './verify/lib.mjs'
import { AXIS, BLOB, WORD } from '../src/shared/logoPaths.ts'

const args = process.argv.slice(2)
const flags = args.filter((a) => a.startsWith('--'))
const [name, outArg] = args.filter((a) => !a.startsWith('--'))
for (const f of flags) if (!/^--(stills|lanes=\d+|only=[\d,]+|scale=[\d.]+)$/.test(f)) throw new Error(`unknown option ${f}`)
if (!name) throw new Error('which reel? npm run reel -- <name>')
const flag = (k) => flags.find((f) => f.startsWith(`--${k}=`))?.slice(k.length + 3)
const stills = flags.includes('--stills')
const scale = Number(flag('scale') ?? 1)
const reel = (await import(`./reels/${name}.mjs`)).default
const FPS = reel.fps ?? 30
const even = (n) => Math.max(2, Math.round(n / 2) * 2)
const W = even((reel.size?.[0] ?? 1920) * scale), H = even((reel.size?.[1] ?? 1080) * scale)
const out = resolve(root, outArg ?? 'reels')
const shotsDir = join(out, `${name}-shots`)
mkdirSync(shotsDir, { recursive: true })

const card = (words) => ({ card: true, seconds: 1.6, ...words })
const shots = [card({ title: reel.title, line: reel.line }), ...reel.shots, card({ title: reel.title, line: 'blobscape.dev', seconds: 2, last: true })]
const only = flag('only')?.split(',').map(Number)
const todo = shots.map((_, i) => i).filter((i) => !only || only.includes(i))

const { server, base } = await serveDist(Number(process.env.PORT ?? 4183))
const browser = await launch()
const pad = (i) => String(i).padStart(2, '0')

/** An ffmpeg that takes PNG frames on its input and writes one shot. Every shot is encoded alike, so they join without encoding again. */
function encoder(file) {
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-vf', `scale=${W}:${H}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-video_track_timescale', '15360', file], { stdio: ['pipe', 'inherit', 'inherit'] })
  return {
    async add(png) { if (!ff.stdin.write(png)) await once(ff.stdin, 'drain') },
    async end() { ff.stdin.end(); const [code] = await once(ff, 'close'); if (code) throw new Error(`ffmpeg left with ${code}`) },
  }
}

/** In the page: a title card in the site's own type and colors, in place of whatever the page held. `u` from 0 to 1 moves it. */
function drawCard({ title, line, logo, last }) {
  document.documentElement.style.overflow = 'hidden'
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;place-content:center;justify-items:center;gap:5vh;background:#fbf6ee;color:#1d2440;'
  box.innerHTML = `<div data-part="logo" style="width:${last ? 46 : 30}vw">${logo}</div>
    <div data-part="title" style="font-family:'Fredoka Variable',sans-serif;font-weight:600;font-size:${last ? 5 : 11}vh;line-height:1;letter-spacing:-0.01em;text-align:center">${title}</div>
    <div data-part="line" style="font-family:'Figtree Variable',sans-serif;font-weight:500;font-size:${last ? 4.4 : 3.3}vh;color:${last ? '#b3250a' : '#565d7a'};text-align:center">${line ?? ''}</div>`
  document.body.replaceChildren(box)
  const part = (k) => box.querySelector(`[data-part=${k}]`)
  const back = (x) => { const c = 1.9; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2 }
  const span = (u, a, b) => Math.min(1, Math.max(0, (u - a) / (b - a)))
  window.__card = (u) => {
    // the logo lands with a little bounce, then the name rises, then the line under it
    const a = span(u, 0, 0.3), b = span(u, 0.14, 0.42), c = span(u, 0.3, 0.55)
    part('logo').style.transform = `scale(${0.6 + 0.4 * back(a)})`
    part('logo').style.opacity = String(Math.min(1, a * 3))
    part('title').style.transform = `translateY(${(1 - back(b)) * 6}vh)`
    part('title').style.opacity = String(Math.min(1, b * 2.5))
    part('line').style.transform = `translateY(${(1 - c) ** 2 * 3}vh)`
    part('line').style.opacity = String(c)
  }
  return document.fonts.ready.then(() => true)
}

/** In the page: the view alone, filling the window. Everything over the canvas that is not a canvas or its backdrop is hidden. */
function bareView({ view }) {
  // kept on the window: if the page draws its view afresh, the next frame lays it bare again
  window.__bare = () => bareView({ view })
  const canvas = document.querySelector(view)
  const box = canvas.parentElement
  document.querySelectorAll('[data-reel-caption]').forEach((e) => e.remove())
  document.documentElement.style.overflow = 'hidden'
  // a see-through backdrop must not show the page behind: give the box the color of the frame it sits in
  let behind = 'transparent'
  for (let e = box.parentElement; e && behind === 'transparent'; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\(.*,\s*0\)$/.test(c) && c !== 'transparent') behind = c }
  box.style.background = behind
  Object.assign(box.style, { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', maxHeight: 'none', minHeight: '0', aspectRatio: 'auto', zIndex: '99999' })
  for (let e = box.parentElement; e && e !== document.body; e = e.parentElement) Object.assign(e.style, { zIndex: '99999', overflow: 'visible', transform: 'none', contain: 'none' })
  const keep = (el) => el instanceof HTMLCanvasElement || !!el.querySelector('canvas') || (el.getAttribute('aria-hidden') === 'true' && !el.firstElementChild && !el.textContent && el.getBoundingClientRect().width > innerWidth / 2)
  for (const el of box.children) if (!keep(el)) el.style.display = 'none'
  const caption = document.createElement('div')
  caption.dataset.reelCaption = '1'
  caption.style.cssText = "position:absolute;left:5vw;bottom:8vh;z-index:5;font-family:'Fredoka Variable',sans-serif;font-weight:600;font-size:9vh;line-height:1;letter-spacing:-0.01em;pointer-events:none;opacity:0"
  const small = document.createElement('div')
  small.style.cssText = "font-family:'Figtree Variable',sans-serif;font-weight:600;font-size:2.6vh;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:1.4vh;opacity:0.75"
  const big = document.createElement('div')
  caption.append(small, big)
  box.append(caption)
  window.__caption = (words, u, dark) => {
    if (!words) { caption.style.opacity = '0'; return }
    const [over, main] = Array.isArray(words) ? words : ['', words]
    small.textContent = over
    big.textContent = main
    caption.style.color = dark ? '#fbf6ee' : '#1d2440'
    caption.style.textShadow = dark ? '0 0.3vh 2vh rgb(0 0 0 / 0.45)' : '0 0.2vh 1.6vh rgb(251 246 238 / 0.7)'
    // in from the left over the first fifth, away over the last tenth
    const a = Math.min(1, u / 0.2), z = Math.min(1, (1 - u) / 0.1)
    caption.style.opacity = String(Math.min(a, z))
    caption.style.transform = `translateX(${-((1 - a) ** 3) * 4}vw)`
  }
}

const EASE = { linear: (u) => u, inout: (u) => u * u * (3 - 2 * u), out: (u) => 1 - (1 - u) ** 3, in: (u) => u * u }

async function record(i) {
  const shot = shots[i], started = Date.now()
  const file = join(shotsDir, `${pad(i)}.mp4`)
  const count = stills ? 1 : Math.max(1, Math.round(shot.seconds * FPS))
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'no-preference' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.error(`shot ${i}: ${e.message}`))
  const enc = stills ? undefined : encoder(file)
  let still
  const take = async () => { const png = await page.screenshot({ type: 'png' }); if (enc) await enc.add(png); else { still = png; writeFileSync(join(shotsDir, `still-${pad(i)}.png`), png) } }
  const uOf = (f) => (stills ? 0.6 : count > 1 ? f / (count - 1) : 0)
  if (shot.card) {
    await page.goto(`${base}/contact/`)
    const logo = `<svg viewBox="0 0 1155.48 187.2" style="display:block;width:100%"><g transform="translate(-4 -80)"><path d="${BLOB}" fill="#f2553a" fill-rule="evenodd"/><path d="${AXIS}" fill="#1d2440"/></g><path d="${WORD}" fill="#1d2440"/></svg>`
    await page.evaluate(drawCard, { title: shot.title, line: shot.line, logo, last: !!shot.last })
    for (let f = 0; f < count; f++) {
      // a title card moves in during its first second and then holds
      await page.evaluate((u) => window.__card(u), stills ? 1 : Math.min(1, (f / FPS) / 1.6))
      await take()
    }
  } else {
    const query = new URLSearchParams({ offscreen: '1', ...reel.params, ...shot.params })
    await page.goto(`${base}${reel.page}?${query}`)
    const ready = () => page.waitForFunction(async ({ hook, loading }) => { const h = window[hook]; if (!h || (loading && document.querySelector(loading))) return false; await h.stage.frame(0); return true }, { hook: reel.hook, loading: reel.loading }, { timeout: 600000, polling: 500 })
    await ready()
    await page.evaluate(bareView, { view: reel.view })
    await page.waitForTimeout(800)
    await ready()
    await page.evaluate(() => document.fonts.ready.then(() => true))
    // the view the page itself starts from: a shot's camera is told from it
    const home = await page.evaluate(async ({ hook }) => { while (!window[hook]) await new Promise((r) => setTimeout(r, 50)); const s = window[hook].stage; s.playing = false; return s.orbit }, { hook: reel.hook })
    const from = { azimuth: home.azimuth, elevation: home.elevation, zoom: 1, lift: 0, ...shot.from }, to = { ...from, ...shot.to }
    const ease = EASE[shot.ease ?? 'linear']
    const done = new Set()
    for (let f = 0; f < count; f++) {
      const u = uOf(f), e = ease(u), mix = (k) => from[k] + (to[k] - from[k]) * e
      const at = stills ? shot.seconds * 0.6 : f / FPS
      const t = (shot.at ?? 0) + at
      const orbit = { target: [home.target[0], home.target[1] + mix('lift') * home.distance, home.target[2]], distance: home.distance / mix('zoom'), azimuth: mix('azimuth'), elevation: mix('elevation') }
      // things the page can be asked to do at a moment of the shot (a petal let go)
      const calls = (shot.calls ?? []).filter((c, k) => c.at <= at && !done.has(k) && done.add(k)).map((c) => c.call)
      await page.evaluate(async ({ hook, view, orbit, t, calls, caption, u, dark }) => {
        // the page sets its hook again whenever the bouquet changes, so wait out the moment it is gone
        while (!window[hook]) await new Promise((r) => setTimeout(r, 50))
        // a page that draws its view afresh (or React putting its own styles back) undoes the bare view: lay it bare again
        const c = document.querySelector(view)
        if (!c || getComputedStyle(c.parentElement).position !== 'fixed' || !c.parentElement.querySelector('[data-reel-caption]')) window.__bare()
        const h = window[hook]
        h.stage.orbit = orbit
        await h.stage.frame(t)
        if (calls.length) { for (const c of calls) h[c](); await h.stage.frame(t) }
        window.__caption(caption, u, dark)
      }, { hook: reel.hook, view: reel.view, orbit, t, calls, caption: shot.caption, u, dark: !!shot.dark })
      await take()
    }
  }
  await enc?.end()
  await ctx.close()
  console.log(`shot ${pad(i)}${shot.card ? ' (card)' : ''}: ${count} frame${count > 1 ? 's' : ''} in ${((Date.now() - started) / 1000).toFixed(0)} s${shot.caption ? `  ${[shot.caption].flat().join(' ')}` : ''}`)
  return still
}

const lanes = Math.max(1, Math.min(todo.length, Number(flag('lanes') ?? Math.min(4, availableParallelism() - 1))))
const waiting = [...todo], failed = [], sheet = new Map()
await Promise.all(Array.from({ length: lanes }, async () => {
  for (let i = waiting.shift(); i !== undefined; i = waiting.shift()) {
    try { sheet.set(i, await record(i)) } catch (e) { failed.push(i); console.error(`shot ${i}: ${e.message}`) }
  }
}))
await browser.close()
server.close()
if (failed.length) { console.error(`not recorded: ${failed.join(' ')} (--only=${failed.join(',')} records them again)`); process.exit(1) }

if (stills) {
  // the stills of shots not asked for this time are the ones already there
  const files = shots.map((_, i) => join(shotsDir, `still-${pad(i)}.png`)).filter((f) => existsSync(f))
  const cols = Math.ceil(Math.sqrt(files.length))
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-filter_complex', `${files.map((_, k) => `[${k}:v]scale=640:-2[s${k}]`).join(';')};${files.map((_, k) => `[s${k}]`).join('')}xstack=inputs=${files.length}:layout=${files.map((_, k) => `${(k % cols) * 640}_${Math.floor(k / cols) * Math.round((640 * H) / W / 2) * 2}`).join('|')}:fill=black`, '-frames:v', '1', join(out, `${name}-stills.png`)])
  console.log(`${join(out, `${name}-stills.png`)}`)
} else {
  const missing = shots.map((_, i) => join(shotsDir, `${pad(i)}.mp4`)).filter((f) => !existsSync(f))
  if (missing.length) { console.log(`recorded ${todo.length} shot${todo.length > 1 ? 's' : ''}; the reel is cut once these are there too: ${missing.join(' ')}`); process.exit(0) }
  const list = join(shotsDir, 'list.txt')
  writeFileSync(list, shots.map((_, i) => `file '${pad(i)}.mp4'\n`).join(''))
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', join(out, `${name}.mp4`)])
  const seconds = shots.reduce((s, x) => s + Math.round(x.seconds * FPS) / FPS, 0)
  console.log(`${join(out, `${name}.mp4`)}: ${shots.length} shots, ${seconds.toFixed(1)} s at ${W} × ${H}`)
}
