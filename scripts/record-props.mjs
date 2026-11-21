/**
 * Records the card pictures of Scene Creator's library (src/blobscape/creator/library.ts) into public/props/:
 *
 *   npm run props                 every entry with no picture yet
 *   npm run props -- --all        every entry
 *   npm run props -- lighthouse duck creature-fox
 *
 * Needs the built site (`npm run build`). A prop or land is handed to Diorama as a scene description, as
 * `npm run scene -- --shots` does, framed on its own box, and its pixel art is shrunk to the card keeping only the colors it was drawn in (some tens of kB each).
 * A creature is drawn on Splat Creatures and its view shrunk to the same card size.
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { serveDist, launch, dist, root } from './verify/lib.mjs'

const { LIBRARY, libraryProp, libraryCreature, creatureLook } = await import('../src/blobscape/creator/library.ts')
const { boxOf } = await import('../src/splat-engine/project.ts')

const args = process.argv.slice(2)
const out = join(root, 'public', 'props')
mkdirSync(out, { recursive: true })
const wanted = args.filter((a) => !a.startsWith('--'))
const todo = LIBRARY.filter((e) => (wanted.length ? wanted.includes(e.id) : args.includes('--all') || !existsSync(join(root, 'public', e.picture))))
if (!todo.length) { console.log('Every entry has its picture.'); process.exit(0) }
if (!existsSync(join(dist, 'experiments', 'diorama', 'index.html'))) { console.error('No built site to draw with: run `npm run build` first.'); process.exit(2) }

/** When in its loop a card is drawn, as a share of it: a tenth in, unless the thing is only there later. */
const MOMENT = { 'white-witch-sparks': 0.5 }

/** Card pictures are this size (4:3), whatever the view was. */
const CARD = [320, 240]

/** A prop's description with the view on it alone: its box in the middle, from a little above and to the side. */
function framed(prop) {
  const { lo, hi } = boxOf(prop.doc)
  const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
  const target = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
  return { ...prop.doc, camera: { target, distance: Math.max(0.8, size * 2.1), azimuth: 28, elevation: 16 } }
}

/** Hides everything drawn over a view (buttons, zoom bar, hints), keeping the canvas and the backdrop behind it. */
async function bare(page, testid) {
  await page.evaluate((id) => {
    const cv = document.querySelector(`[data-testid=${id}]`)
    for (let el = cv; el?.parentElement && el !== document.body; el = el.parentElement)
      for (const sib of el.parentElement.children)
        if (sib !== el && sib.dataset.testid !== 'diorama-ground') sib.style.visibility = 'hidden'
  }, testid)
}

let served
for (let port = 4300; !served && port < 4320; port++) served = await serveDist(port).catch(() => undefined)
if (!served) { console.error('No free port to serve the built site on.'); process.exit(2) }
const browser = await launch()
const tmp = mkdtempSync(join(tmpdir(), 'props-'))
let failed = 0
try {
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1280, height: 900 } })
  for (const e of todo) {
    const page = await context.newPage()
    try {
      let png
      if (e.kind === 'creature') {
        const c = libraryCreature(e.id)
        await page.goto(`${served.base}/experiments/creature/?creature=${c.id}&look=${creatureLook(e.id)}&offscreen=1`)
        await page.waitForFunction(() => window.__creature?.blobs() > 0, null, { timeout: 240000 })
        await page.evaluate(async () => { const s = window.__creature.stage; await s.frame(1); await s.frame(1) })
        await bare(page, 'creature-view')
        png = await page.getByTestId('creature-view').screenshot()
      } else {
        const prop = libraryProp(e.id)
        const doc = e.kind === 'land' ? prop.doc : framed(prop)
        const json = join(tmp, `${e.id}.json`)
        writeFileSync(json, JSON.stringify(doc))
        await page.goto(`${served.base}/experiments/diorama/?offscreen=1`)
        await page.waitForFunction(() => window.__diorama, null, { timeout: 180000 })
        await page.getByTestId('diorama-model').setInputFiles(json)
        await page.waitForFunction(() => /^(Opened|Could not)/.test(document.querySelector('[data-testid=diorama-model-note]')?.textContent ?? ''), null, { timeout: 120000 })
        const note = await page.getByTestId('diorama-model-note').innerText()
        if (!note.startsWith('Opened')) throw new Error(note)
        await page.waitForFunction((n) => window.__diorama?.blobs() > 0 && document.querySelector('[data-testid=diorama-view]')?.getAttribute('aria-label')?.includes(n), doc.name, { timeout: 240000 })
        await page.evaluate(async (t) => { const s = window.__diorama.stage; await s.frame(t); await s.frame(t) }, doc.loop * (MOMENT[e.id] ?? 0.1))
        await bare(page, 'diorama-view')
        png = await page.getByTestId('diorama-view').screenshot()
      }
      // shrink to the card's size in the page, keeping pixels square and sharp
      const card = await page.evaluate(async ([data, w, h]) => {
        const img = new Image()
        img.src = `data:image/png;base64,${data}`
        await img.decode()
        const cv = document.createElement('canvas')
        cv.width = w; cv.height = h
        const g = cv.getContext('2d')
        g.imageSmoothingEnabled = true
        const k = Math.max(w / img.width, h / img.height)
        g.drawImage(img, (w - img.width * k) / 2, (h - img.height * k) / 2, img.width * k, img.height * k)
        // pixel art keeps its own few colors: each card pixel goes to the nearest color the view held, so the file stays small
        const src = document.createElement('canvas')
        src.width = img.width; src.height = img.height
        const sg = src.getContext('2d')
        sg.drawImage(img, 0, 0)
        const all = sg.getImageData(0, 0, img.width, img.height).data
        const seen = new Map()
        for (let i = 0; i < all.length && seen.size <= 256; i += 4) seen.set((all[i] << 16) | (all[i + 1] << 8) | all[i + 2], [all[i], all[i + 1], all[i + 2]])
        if (seen.size <= 256) {
          const colors = [...seen.values()]
          const out = g.getImageData(0, 0, w, h)
          const d = out.data
          for (let i = 0; i < d.length; i += 4) {
            let best = colors[0], far = Infinity
            for (const c of colors) {
              const f = (c[0] - d[i]) ** 2 + (c[1] - d[i + 1]) ** 2 + (c[2] - d[i + 2]) ** 2
              if (f < far) { far = f; best = c }
            }
            d[i] = best[0]; d[i + 1] = best[1]; d[i + 2] = best[2]; d[i + 3] = 255
          }
          g.putImageData(out, 0, 0)
        }
        return cv.toDataURL('image/png').split(',')[1]
      }, [png.toString('base64'), ...CARD])
      writeFileSync(join(root, 'public', e.picture), Buffer.from(card, 'base64'))
      console.log(`drew  ${e.picture}`)
    } catch (err) {
      failed++
      console.error(`could not draw ${e.id}: ${err instanceof Error ? err.message : err}`)
    } finally {
      await page.close()
    }
  }
} finally {
  await browser.close()
  served.close?.()
}
process.exit(failed ? 1 : 0)
