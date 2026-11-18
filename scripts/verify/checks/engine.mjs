// The engine page, the rigged-splat spec page and the unlisted engine lab.
import { createServer } from 'node:http'

export default [
  {
    name: 'engine-page',
    about: 'the three live demos draw, chips swap them, phone fit, the built-on link',
    entries: ['src/blobscape/Engine.tsx', 'src/blobscape/engineCopy.ts'],
    files: ['src/blobscape/Clockwork.tsx'],
    async run({ base, shots, join, fails, ok, open, axe }) {
      for (const demo of ['creature', 'world', 'pixel']) {
        const e = await open(`/engine/?offscreen=1&demo=${demo}`, { viewport: { width: 1280, height: 900 } })
        // off-screen there is no frame loop, so the waiting mark stays up until the check draws a frame: wait for the engine, not the mark
        await e.page.waitForFunction(() => window.__engine?.blobs() > 0, null, { timeout: 120000 }).catch(() => {})
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
      await p.page.waitForFunction(() => window.__engine?.blobs() > 0, null, { timeout: 120000 }).catch(() => {})
      const wide = await p.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      const cards = await p.page.locator('[data-testid=engine-built] a').count()
      if (wide > 0 || cards !== 9) fails.push(`engine page on a phone: ${wide}px wider than the screen, ${cards} experiments listed`)
      else ok(`engine page: fits a phone and lists the ${cards} experiments built on the engine`)
      await axe(p.page, 'engine page on a phone')
      await p.ctx.close()
      const x = await open('/experiments/clockwork/?offscreen=1', { viewport: { width: 1280, height: 900 } })
      const link = await x.page.getByTestId('built-on').getAttribute('href', { timeout: 10000 }).catch(() => null)
      const html = await (await fetch(base + '/experiments/clockwork/')).text()
      if (link !== '/engine/' || !html.includes('data-testid="built-on"')) fails.push(`an engine experiment's link to the engine page: ${link}, prerendered ${html.includes('data-testid="built-on"')}`)
      else ok('an experiment built on the engine links to the engine page, in its prerendered HTML too')
      await x.ctx.close()
    },
  },
  {
    name: 'creature-element',
    about: "the <blobscape-creature> tag on another site's plain page: draws on both backends, turns, taps, waits off screen, holds still for reduced motion; live on the engine page",
    entries: ['src/splat-engine/element.ts'],
    files: ['scripts/build-element.mjs', 'public/rigged-splats/', 'src/blobscape/Engine.tsx', 'src/blobscape/engineCopy.ts'],
    async run({ base, shots, join, fails, ok, open }) {
      // a page on another site with nothing but the script tag and the element: the script and the file come from this one
      // another origin on this machine, really served (a browser won't let a page it takes for public reach into localhost); 127.0.0.1 still counts as secure, which WebGPU needs
      let body = ''
      const other = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(body) })
      await new Promise((r) => other.listen(0, '127.0.0.1', r))
      const site = `http://127.0.0.1:${other.address().port}/`
      const page = (attrs, extra = '') => `<!doctype html><html lang="en"><meta charset="utf-8"><title>Another site</title><body style="margin:0;background:#f4efe6">${extra}<script type="module" src="${base}/embed/blobscape-creature.js"></script><blobscape-creature id="c" ${attrs} style="width:400px"><p id="inside">No creature.</p></blobscape-creature></body></html>`
      const visit = async (attrs, opts = {}, extra = '') => {
        const v = await open('/rigged-splats/fox.png', { viewport: { width: 800, height: 600 }, ...opts })
        body = page(attrs, extra)
        await v.page.goto(site)
        return v
      }
      try {
      const fox = `src="${base}/rigged-splats/fox.glb" alt="A fox trotting"`
      const drawn = (v) => v.page.waitForFunction(() => document.querySelector('#c')?.stage, null, { timeout: 90000 }).then(() => true, () => false)

      // off-screen drawing can be read back, on WebGPU and on WebGL: the fox shows, and it moves
      for (const backend of ['webgpu', 'webgl']) {
        const v = await visit(`${fox} move="trot" offscreen ${backend === 'webgl' ? 'backend="webgl"' : ''}`)
        const got = (await drawn(v)) && await v.page.evaluate(async () => {
          const el = document.querySelector('#c')
          const cv = el.shadowRoot.querySelector('canvas')
          const read = async (t) => {
            await el.stage.frame(t)
            return cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
          }
          const a = await read(0.1), b = await read(0.4)
          let solid = 0, changed = 0
          for (let i = 3; i < a.length; i += 4) { if (a[i] > 128) solid++; if (Math.abs(a[i] - b[i]) > 60) changed++ }
          return { backend: el.stage.backend, moves: el.moves, move: el.currentMove, status: el.getAttribute('status'), share: solid / (a.length / 4), changed, label: cv.getAttribute('aria-label'), role: cv.getAttribute('role') }
        })
        if (!got) { fails.push(`creature element on ${backend}: never started`); await v.ctx.close(); return }
        if (got.backend !== backend || got.move !== 'trot' || got.status !== 'ready' || !(got.share > 0.04 && got.share < 0.6) || !(got.changed > 50) || got.role !== 'application' || !/^A fox trotting\. Drag/.test(got.label)) fails.push(`creature element on ${backend}: ${JSON.stringify(got)}`)
        else ok(`creature element on another site's page, ${backend}: the fox fills ${(got.share * 100).toFixed(0)}% of its box and moves (${got.changed} pixels changed between two moments)`)
        await v.ctx.close()
      }

      // on screen (WebGL here): it draws itself, a drag and the arrow keys turn it, a tap plays its move once
      {
        const v = await visit(`${fox} move="trot" tap="idle" look="pointer" backend="webgl"`)
        const ready = await v.page.waitForFunction(() => document.querySelector('#c')?.getAttribute('status') === 'ready', null, { timeout: 90000 }).then(() => true, () => false)
        if (!ready) fails.push(`creature element: never drew on screen (${await v.page.evaluate(() => document.querySelector('#c')?.getAttribute('status'))})`)
        else {
          const az = () => v.page.evaluate(() => document.querySelector('#c').stage.orbit.azimuth)
          const a0 = await az()
          await v.page.mouse.move(200, 200)
          await v.page.mouse.down()
          await v.page.mouse.move(300, 210, { steps: 5 })
          await v.page.mouse.up()
          const a1 = await az()
          await v.page.locator('#c canvas').focus()
          await v.page.keyboard.press('ArrowRight')
          const a2 = await az()
          if (!(a1 < a0 - 20) || !(a2 > a1)) fails.push(`creature element: a drag took the view from ${a0} to ${a1}, an arrow key to ${a2}`)
          else ok(`creature element: a drag turns it (${a0}° to ${a1.toFixed(0)}°) and so do the arrow keys`)
          await v.page.mouse.click(200, 200)
          const tapped = await v.page.evaluate(() => document.querySelector('#c').currentMove)
          await v.page.waitForFunction(() => document.querySelector('#c').currentMove === 'trot', null, { timeout: 30000 }).catch(() => {})
          const back = await v.page.evaluate(() => document.querySelector('#c').currentMove)
          if (tapped !== 'idle' || back !== 'trot') fails.push(`creature element: a tap played ${tapped}, and then ${back}`)
          else ok('creature element: a tap plays its move once, then the first move comes back')
          await v.page.screenshot({ path: join(shots, 'creature-element.png') })
        }
        await v.ctx.close()
      }

      // far down a page it fetches nothing until it nears the screen
      {
        const v = await visit(`${fox} backend="webgl"`, {}, '<div style="height:4000px"></div>')
        let asked = false
        v.page.on('request', (r) => { if (r.url().endsWith('fox.glb')) asked = true })
        await v.page.waitForFunction(() => document.querySelector('#c')?.getAttribute('status'), null, { timeout: 20000 }).catch(() => {})
        await v.page.waitForTimeout(500)
        const before = asked
        await v.page.evaluate(() => document.querySelector('#c').scrollIntoView())
        const then = await v.page.waitForFunction(() => document.querySelector('#c').getAttribute('status') === 'ready', null, { timeout: 90000 }).then(() => true, () => false)
        // and stops again once it is off screen
        await v.page.evaluate(() => scrollTo(0, 0))
        const stopped = await v.page.waitForFunction(() => document.querySelector('#c').stage.playing === false, null, { timeout: 10000 }).then(() => true, () => false)
        if (before || !then || !stopped) fails.push(`creature element far down a page: fetched before it was near ${before}, drew once scrolled to ${then}, stopped when scrolled away ${stopped}`)
        else ok('creature element: fetches nothing until it nears the screen, and stops when it leaves')
        await v.ctx.close()
      }

      // reduced motion: it shows, holding still, and a tap doesn't start it
      {
        const v = await visit(`${fox} tap="idle" backend="webgl"`, { reducedMotion: 'reduce' })
        const ready = await v.page.waitForFunction(() => document.querySelector('#c')?.getAttribute('status') === 'ready', null, { timeout: 90000 }).then(() => true, () => false)
        await v.page.mouse.click(200, 200)
        const got = ready && await v.page.evaluate(async () => {
          const el = document.querySelector('#c')
          const t = el.stage.time
          await new Promise((r) => setTimeout(r, 400))
          return { playing: el.stage.playing, moved: el.stage.time - t, move: el.currentMove }
        })
        if (!got || got.playing || got.moved !== 0 || got.move !== 'trot') fails.push(`creature element with reduced motion: ${JSON.stringify(got)}`)
        else ok('creature element: holds still for a visitor who asked for reduced motion')
        await v.ctx.close()
      }

      // a file that isn't there: what is inside the element shows instead, and the page hears of it
      {
        const v = await visit(`src="${base}/rigged-splats/nobody.glb" backend="webgl"`, {}, '<script>window.heard = []; addEventListener("error", (e) => { if (e.target.id === "c") heard.push(e.type) }, true)</script>')
        await v.page.waitForFunction(() => document.querySelector('#c')?.getAttribute('status') === 'failed', null, { timeout: 30000 }).catch(() => {})
        const got = await v.page.evaluate(() => ({ status: document.querySelector('#c').getAttribute('status'), shown: document.querySelector('#inside').getBoundingClientRect().height > 0, heard: window.heard }))
        // the browser logs the missing file itself: those console errors are the point of this part
        const noise = fails.filter((f) => /console: (Failed to load resource|Access to fetch at \S+nobody\.glb)/.test(f))
        for (const f of noise) fails.splice(fails.indexOf(f), 1)
        if (got.status !== 'failed' || !got.shown || !got.heard.includes('error')) fails.push(`creature element with a missing file: ${JSON.stringify(got)}`)
        else ok('creature element: a missing file shows what is inside the element and fires an error event')
        await v.ctx.close()
      }

      } finally { other.close() }

      // live on the engine page, and in its prerendered HTML with a still picture inside
      {
        const e = await open('/engine/?offscreen=1', { viewport: { width: 1280, height: 900 } })
        await e.page.waitForFunction(() => window.__engine?.blobs() > 0, null, { timeout: 120000 }).catch(() => {})
        await e.page.getByTestId('engine-tag').scrollIntoViewIfNeeded()
        const up = await e.page.waitForFunction(() => document.querySelector('[data-testid=engine-tag]')?.stage, null, { timeout: 90000 }).then(() => true, () => false)
        const got = up && await e.page.evaluate(async () => {
          const el = document.querySelector('[data-testid=engine-tag]')
          await el.stage.frame(0.2)
          const cv = el.shadowRoot.querySelector('canvas')
          const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
          let solid = 0
          for (let i = 3; i < d.length; i += 4) if (d[i] > 128) solid++
          return { solid, status: el.getAttribute('status'), code: document.querySelector('[data-testid=engine-tag-code]').textContent }
        })
        const html = await (await fetch(base + '/engine/')).text()
        const pre = /<blobscape-creature[^>]*src="\/rigged-splats\/fox\.glb"[^>]*>\s*(<!--.*?-->)?\s*<img[^>]*src="\/rigged-splats\/fox\.png"/.test(html)
        if (!got || !(got.solid > 3000) || got.status !== 'ready' || !got.code.includes('<blobscape-creature') || !pre) fails.push(`creature element on the engine page: ${JSON.stringify(got)}, prerendered with its picture ${pre}`)
        else ok(`creature element: live on the engine page beside its code (${got.solid} solid pixels), and prerendered with a still picture inside`)
        await e.page.getByTestId('engine-tag').screenshot({ path: join(shots, 'engine-tag.png') })
        await e.ctx.close()
      }
    },
  },
  {
    name: 'spec-page',
    about: 'the spec page: sections, sample file, prerendered, linked from the engine page',
    entries: ['src/blobscape/Spec.tsx', 'src/blobscape/markdown.ts', 'src/blobscape/specCopy.ts'],
    files: ['docs/rigged-splats.md', 'public/rigged-splats/'],
    async run({ base, fails, ok, open, axe }) {
      const s = await open('/engine/rigged-splats/', { viewport: { width: 390, height: 800 } })
      await s.page.waitForSelector('[data-testid=spec] h2', { timeout: 20000 }).catch(() => {})
      const got = await s.page.evaluate(async () => {
        const spec = document.querySelector('[data-testid=spec]')
        const file = spec?.querySelector('a[download]')?.getAttribute('href')
        const res = file ? await fetch(file) : null
        return { h1: document.querySelector('h1')?.textContent, sections: spec?.querySelectorAll('h2').length, file, bytes: res?.ok ? (await res.arrayBuffer()).byteLength : 0, raw: /\*\*|\]\(/.test(spec?.textContent.replace(/\{[\s\S]*\}/, '') ?? ''), wide: document.documentElement.scrollWidth - window.innerWidth }
      })
      if (!(got.h1 === 'Rigged Gaussian splats in glTF' && got.sections >= 6 && got.file === '/rigged-splats/fox.glb' && got.bytes > 100000 && !got.raw && got.wide <= 0)) fails.push(`spec page: ${JSON.stringify(got)}`)
      else ok(`spec page: ${got.sections} sections, the sample fox downloads (${Math.round(got.bytes / 1024)} KB), fits a phone`)
      await axe(s.page, 'spec page')
      const html = await (await fetch(base + '/engine/rigged-splats/')).text()
      const door = (await (await fetch(base + '/engine/')).text()).includes('href="/engine/rigged-splats/"')
      if (!html.includes('id="the-rule"') || !door) fails.push(`spec page: prerendered rule ${html.includes('id="the-rule"')}, linked from the engine page ${door}`)
      else ok('spec page: its text is in the prerendered HTML, and the engine page links to it')
      await s.ctx.close()
    },
  },
  {
    name: 'api-page',
    about: 'the engine docs: prerendered with the guide and the reference, every section in its part, find a name, fits a phone, the contents follow what is read, linked from the engine page, and an in-app visit loads it',
    entries: ['src/blobscape/api/EngineApi.tsx', 'src/blobscape/api/types.ts', 'src/blobscape/api/guide.ts', 'src/blobscape/api/useActiveEntry.ts'],
    files: ['src/blobscape/engineApi.json', 'packages/engine/README.md'],
    async run({ base, fails, ok, open, axe }) {
      const html = await (await fetch(base + '/engine/docs/')).text()
      const door = (await (await fetch(base + '/engine/')).text()).includes('href="/engine/docs/"')
      const pre = { stage: html.includes('<article id="Stage"'), guide: html.includes('id="a-creature-on-a-canvas"'), data: html.includes('id="engine-api-data"'), door }
      if (!(pre.stage && pre.guide && pre.data && pre.door)) fails.push(`docs page: prerendered ${JSON.stringify(pre)}`)
      else ok('docs page: prerendered with the guide, the reference and its data, and the engine page links to it')
      const s = await open('/engine/docs/', { viewport: { width: 390, height: 800 } })
      await s.page.waitForSelector('[data-testid=api] article', { timeout: 20000 }).catch(() => {})
      const count = () => s.page.evaluate(() => ({ parts: document.querySelectorAll('[data-testid=api-part] > div > h2').length, sections: document.querySelectorAll('[data-testid=api-part] > section > h3').length, names: document.querySelectorAll('[data-testid=api] article').length, guide: document.querySelectorAll('[data-testid=api-guide] pre').length, wide: document.documentElement.scrollWidth - window.innerWidth }))
      const before = await count()
      await s.page.getByLabel('Find a name').fill('setPixels')
      await s.page.waitForTimeout(200)
      const found = await s.page.evaluate(() => [...document.querySelectorAll('[data-testid=api] article h4 code')].map((c) => c.textContent))
      if (!(before.parts >= 6 && before.sections >= 30 && before.names >= 300 && before.guide >= 4 && before.wide <= 0 && found.includes('Stage') && found.length < 12)) fails.push(`docs page: ${JSON.stringify(before)}, finding setPixels shows ${found.join(', ')}`)
      else ok(`docs page: the guide and ${before.names} names in ${before.sections} sections and ${before.parts} parts fit a phone; finding setPixels leaves ${found.length}`)
      await s.page.getByLabel('Find a name').fill('')
      await axe(s.page, 'docs page')
      // on a wide screen the contents mark what is being read, and a name in a type goes to its entry
      await s.page.setViewportSize({ width: 1280, height: 800 })
      await s.page.evaluate(() => document.getElementById('Stage').scrollIntoView())
      await s.page.waitForFunction(() => document.querySelector('nav[aria-label="On this page"] [aria-current]')?.textContent === 'Stage', null, { timeout: 5000 }).catch(() => {})
      const reading = await s.page.evaluate(() => document.querySelector('nav[aria-label="On this page"] [aria-current]')?.textContent)
      await s.page.locator('[id="Stage.orbit"] a[href="#Orbit"]').click()
      await s.page.waitForFunction(() => document.querySelector('nav[aria-label="On this page"] [aria-current]')?.textContent === 'Orbit', null, { timeout: 5000 }).catch(() => {})
      const went = await s.page.evaluate(() => ({ hash: location.hash, top: Math.round(document.getElementById('Orbit').getBoundingClientRect().top), current: document.querySelector('nav[aria-label="On this page"] [aria-current]')?.textContent }))
      if (!(reading === 'Stage' && went.hash === '#Orbit' && went.top >= 0 && went.top < 300 && went.current === 'Orbit')) fails.push(`docs page: reading Stage marks ${reading}; the Orbit link gives ${JSON.stringify(went)}`)
      else ok('docs page: the contents mark the entry being read, and a type links to its entry')
      // the contents: Core is open, a part being read opens itself, and any part opens and shuts by its button
      const nav = s.page.locator('nav[aria-label="On this page"]')
      const openParts = () => nav.locator('button[aria-expanded=true]').allTextContents()
      const first = await openParts()
      await nav.getByRole('button', { name: 'Files and models' }).click()
      const opened = await nav.getByRole('link', { name: 'Rigged .glb files' }).isVisible()
      await nav.getByRole('button', { name: 'Files and models' }).click()
      const shut = !(await nav.getByRole('link', { name: 'Rigged .glb files' }).isVisible())
      await s.page.evaluate(() => document.getElementById('Swing').scrollIntoView())
      await s.page.waitForFunction(() => document.querySelector('nav[aria-label="On this page"] [aria-current]')?.textContent === 'Swing', null, { timeout: 5000 }).catch(() => {})
      const reads = await openParts()
      if (!(first.includes('Core') && !first.includes('Files and models') && opened && shut && reads.includes('Movement'))) fails.push(`docs page: contents open ${first.join(', ')}; Files opens ${opened}, shuts ${shut}; reading Swing opens ${reads.join(', ')}`)
      else ok('docs page: the contents are in parts, Core open, the rest opened by hand or by reading')
      // from another page, the reference loads its data itself (a plain link click navigates in the app)
      await s.page.goto(base + '/contact/')
      await s.page.evaluate(() => { const a = document.createElement('a'); a.href = '/engine/docs/'; a.textContent = 'Docs'; document.querySelector('main').append(a); a.click() })
      await s.page.waitForSelector('[data-testid=api] article', { timeout: 20000 }).catch(() => {})
      const inApp = (await count()).names
      if (inApp !== before.names) fails.push(`docs page: reached from another page it shows ${inApp} names, not ${before.names}`)
      else ok('docs page: reached in the app, it loads the same reference')
      await s.ctx.close()
    },
  },
  {
    name: 'engine-lab',
    core: true,
    about: 'engine lab on WebGPU and WebGL: draws, poses reach the draw, sorts (bins and radix), picks, lights, .glb in three.js, timing',
    entries: ['src/engine-lab/main.tsx'],
    files: ['engine-lab/'],
    async run({ root, shots, join, fails, ok, open, axe }) {
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
        // level of detail: a quarter of the first fox, the same blobs dropped and the rest grown alike on the GPU and the CPU;
        // and with autoDetail, a fox far away keeps a share and one close keeps them all
        if (!webgl) {
          const lod = await page.evaluate(async () => {
            const l = window.__lab, w = l.world
            w.setDetail(0, 0.25)
            await l.frame(0.37)
            const chk = await w.checkAgainstCPU(l.renderer)
            const cov = w.deformCPU().cov
            let dropped = 0
            for (let i = 0; i < w.actors[0].blobs.count; i++) if (cov[i * 6] === 0 && cov[i * 6 + 3] === 0 && cov[i * 6 + 5] === 0) dropped++
            w.setDetail(0, 1)
            const was = l.orbit
            w.autoDetail = { density: 1, min: 0.06 }
            l.orbit = { ...was, distance: 60 }
            await l.frame(0.37)
            const far = w.detail
            l.orbit = { ...was, distance: 3 }
            await l.frame(0.37)
            const near = w.detail
            w.autoDetail = false
            l.orbit = was
            await l.frame(0.37)
            return { chk, dropped, count: w.actors[0].blobs.count, far, near, after: w.detail }
          })
          const share = lod.dropped / lod.count
          if (!(lod.chk.center < 1e-3 && lod.chk.cov < lod.chk.covScale * 0.01) || Math.abs(share - 0.75) > 0.03) fails.push(`engine lab: level of detail ${JSON.stringify(lod)}`)
          else if (!(lod.far.every((d) => d < 1) && lod.near.every((d) => d === 1) && lod.after.every((d) => d === 1))) fails.push(`engine lab: autoDetail shares ${JSON.stringify(lod)}`)
          else ok(`engine lab: level of detail drops ${(share * 100).toFixed(0)}% of a fox at a quarter, GPU matching the CPU; far foxes keep ${lod.far.map((d) => d.toFixed(2)).join(', ')}`)
        }
        if (!webgl) {
          const so = await page.evaluate(async () => { const l = window.__lab; await l.frame(0.3); return l.world.checkSort(l.renderer) })
          if (so.missing || so.outOfOrder || so.unsettled) fails.push(`engine lab: GPU sort ${JSON.stringify(so)}`)
          else ok(`engine lab: GPU sort draws every blob once, farthest first, and blobs at one depth in index order (at most ${so.biggest} at one depth)`)
        }
        // the full radix sort (opt in, `sort: 'radix'`): every blob once, farthest first, ties in index order, and it draws
        {
          const e = await open(`/engine-lab/?which=engine&n=12000&walk=1&herd=2&offscreen=1&sort=radix${webgl ? '&webgl=1' : ''}`, { viewport: { width: 800, height: 800 } })
          await e.page.waitForFunction(() => window.__lab || window.__labError, null, { timeout: 60000 })
          const r = await e.page.evaluate(async (webgl) => {
            const l = window.__lab
            await l.frame(0.3)
            const so = webgl ? null : await l.world.checkSort(l.renderer)
            const cv = document.querySelector('canvas'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
            let orange = 0
            for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] > 50 && d[i + 1] < 140 && d[i + 2] < 80) orange++
            return { so, orange, info: l.info }
          }, webgl)
          if (!r.info.includes('radix') || r.orange < 2000 || (r.so && (r.so.missing || r.so.outOfOrder || r.so.unsettled))) fails.push(`engine lab ${label}: radix sort ${JSON.stringify(r)}`)
          else ok(`engine lab ${label}: radix sort draws the foxes (${r.orange} orange pixels)${r.so ? `, every blob once in exact order (at most ${r.so.biggest} at one key)` : ''}`)
          await e.ctx.close()
        }
        // shape edits: the lab's demo (a box cuts the foxes' heads off, a soft ball paints them blue), the GPU matching the CPU
        {
          const e = await open(`/engine-lab/?which=engine&n=12000&walk=0&herd=2&offscreen=1&edits=1${webgl ? '&webgl=1' : ''}`, { viewport: { width: 1000, height: 1000 } })
          await e.page.waitForFunction(() => window.__lab || window.__labError, null, { timeout: 60000 })
          const r = await e.page.evaluate(async (webgl) => {
            const l = window.__lab
            await l.frame(0.3)
            const chk = webgl ? null : await l.world.checkAgainstCPU(l.renderer)
            const cov = l.world.deformCPU().cov
            let cut = 0
            for (let i = 0; i < l.world.count; i++) if (cov[i * 6] === 0 && cov[i * 6 + 3] === 0 && cov[i * 6 + 5] === 0) cut++
            const cv = document.querySelector('canvas'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
            let orange = 0, blue = 0
            for (let i = 0; i < d.length; i += 4) { if (d[i] > 150 && d[i + 1] > 50 && d[i + 1] < 140 && d[i + 2] < 80) orange++; if (d[i + 2] > 120 && d[i + 2] > d[i] * 1.4) blue++ }
            return { chk, cut, count: l.world.count, orange, blue }
          }, webgl)
          if (!(r.cut > r.count * 0.1 && r.cut < r.count * 0.6 && r.blue > 3000 && r.blue > r.orange && (!r.chk || (r.chk.center < 1e-3 && r.chk.cov < r.chk.covScale * 0.01)))) fails.push(`engine lab ${label}: shape edits ${JSON.stringify(r)}`)
          else ok(`engine lab ${label}: shape edits cut ${r.cut} of ${r.count} blobs${r.chk ? ' (GPU matching the CPU)' : ''} and paint ${r.blue} pixels`)
          await e.ctx.close()
        }
        // clean cuts: big blobs cut down the middle of the picture (the camera stands in the cut's plane). Each pixel
        // tested, the edge is the middle column; whole blobs kept or dropped, it bulges well past it
        {
          const edge = async (cut) => {
            const e = await open(`/engine-lab/?which=engine&walk=0&offscreen=1&cut=${cut}${webgl ? '&webgl=1' : ''}`, { viewport: { width: 900, height: 900 } })
            await e.page.waitForFunction(() => window.__lab || window.__labError, null, { timeout: 60000 })
            const r = await e.page.evaluate(async (webgl) => {
              const l = window.__lab
              await l.frame(0.3)
              const cv = document.querySelector('canvas'), w = cv.width, h = cv.height, d = cv.getContext('2d').getImageData(0, 0, w, h).data
              let rows = 0, near = 0, over = 0
              for (let y = 0; y < h; y++) {
                let last = -1
                for (let x = w - 1; x >= 0; x--) if (d[(y * w + x) * 4 + 3] > 128) { last = x; break }
                if (last < 0) continue
                rows++
                const off = last - (w / 2 - 0.5)
                if (Math.abs(off) <= 2) near++
                over = Math.max(over, off)
              }
              const chk = webgl ? null : await l.world.checkAgainstCPU(l.renderer)
              return { rows, near, over, chk }
            }, webgl)
            if (cut === 'clean') await e.page.screenshot({ path: join(shots, `engine-lab-clean-cut-${label}.png`) })
            await e.ctx.close()
            return r
          }
          const clean = await edge('clean'), rough = await edge('rough')
          if (!(clean.rows > 300 && clean.near > clean.rows * 0.9 && clean.over <= 2 && rough.over > 20 && (!clean.chk || (clean.chk.center < 1e-3 && clean.chk.cov < clean.chk.covScale * 0.01)))) fails.push(`engine lab ${label}: clean cuts ${JSON.stringify({ clean, rough })}`)
          else ok(`engine lab ${label}: a clean cut's edge is the cut's own line (${clean.near} of ${clean.rows} rows within 2 pixels, none past it; whole blobs reach ${Math.round(rough.over)} pixels past)`)
        }
        // color by angle (spherical harmonics): the lab's sheen makes the fox warm from one side and blue from the other,
        // and on WebGPU the colors the GPU gave each blob match `viewColor`
        {
          const e = await open(`/engine-lab/?which=engine&n=12000&walk=1&herd=1&offscreen=1&sh=1${webgl ? '&webgl=1' : ''}`, { viewport: { width: 800, height: 800 } })
          await e.page.waitForFunction(() => window.__lab || window.__labError, null, { timeout: 60000 })
          const side = (az) => e.page.evaluate(async ([az, webgl]) => {
            const l = window.__lab
            l.orbit = { ...l.orbit, azimuth: az }
            await l.frame(0.3)
            const chk = webgl ? null : await l.world.checkViewColors(l.renderer)
            const cv = document.querySelector('canvas'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
            let n = 0, r = 0, b = 0
            for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { n++; r += d[i]; b += d[i + 2] }
            return { n, warmth: (r - b) / Math.max(1, n), chk }
          }, [az, webgl])
          const a = await side(90), b = await side(-90)
          if (!(a.n > 5000 && b.n > 5000 && b.warmth - a.warmth > 60 && (webgl || (a.chk < 2e-3 && b.chk < 2e-3)))) fails.push(`engine lab ${label}: color by angle ${JSON.stringify({ a, b })}`)
          else ok(`engine lab ${label}: color by angle turns the fox from ${a.warmth.toFixed(0)} to ${b.warmth.toFixed(0)} warmth across it${webgl ? '' : ', GPU matching the CPU'}`)
          await e.ctx.close()
        }
        // depth map for post effects (SplatDepth): the two foxes cover pixels, at depths round the camera's distance (7)
        const dm = await page.evaluate(() => window.__lab.depth(0.3))
        if (!(dm.covered > 5000 && dm.near > 4.5 && dm.near < dm.median && dm.median > 5.5 && dm.median < 8.5 && dm.far < 10)) fails.push(`engine lab ${label}: depth map ${JSON.stringify(dm)}`)
        else ok(`engine lab ${label}: depth map covers ${dm.covered} pixels at ${dm.near.toFixed(1)}–${dm.far.toFixed(1)} units`)
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
    },
  },
  {
    name: 'spark-lab',
    about: "the same fox on Spark's own skinning, both joint rules",
    entries: ['src/engine-lab/main.tsx'],
    files: ['engine-lab/'],
    async run({ shots, join, fails, ok, open }) {
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
    },
  },
]
