// The engine page, the rigged-splat spec page and the unlisted engine lab.

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
      if (wide > 0 || cards !== 7) fails.push(`engine page on a phone: ${wide}px wider than the screen, ${cards} experiments listed`)
      else ok('engine page: fits a phone and lists the six experiments built on the engine')
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
    name: 'engine-lab',
    about: 'engine lab on WebGPU and WebGL: draws, poses reach the draw, picks, lights, .glb in three.js, timing',
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
