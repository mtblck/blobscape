// Sandbox tools: files, selection, effects, bake, save; props and creatures in the sandbox.

export default [
  {
    name: 'sandbox-tools',
    core: true,
    about: 'open a .ply, box and lasso select, move, a live effect, bake, save, bad files, keyboard',
    entries: ['src/blobscape/Sandbox.tsx'],
    async run({ readFileSync, shots, join, fails, ok, open, axe, ballPly }) {
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
      await page.waitForFunction(() => document.activeElement && document.activeElement !== document.body, null, { timeout: 5000 }).catch(() => {})
      const focusTag = await page.evaluate(() => document.activeElement?.tagName)
      if (focusTag === 'BODY') fails.push('blobscape sandbox: focus fell to the page after Delete')
      else ok('blobscape sandbox: focus stays in the panel after Delete')
      await page.screenshot({ path: join(shots, 'blobscape-sandbox-tools.png') })
      await ctx.close()
    },
  },
  {
    name: 'sandbox-mend',
    about: 'erase a hole, Fill grows it shut, Stamp copies one place to another, Undo',
    entries: ['src/blobscape/Sandbox.tsx', 'src/blobscape/patch.ts'],
    async run({ shots, join, fails, ok, open, ballPly }) {
      const { page, ctx } = await open('/sandbox/', { viewport: { width: 1280, height: 900 } })
      await page.waitForTimeout(1500)
      const count = async () => Number((await page.textContent('[data-testid=blob-count]')).replace(/\D/g, ''))
      await page.getByRole('tab', { name: /Scene/ }).click()
      await page.setInputFiles('input[type=file]', { name: 'ball.ply', mimeType: 'application/octet-stream', buffer: ballPly() })
      await page.waitForFunction(() => document.querySelector('[data-testid=blob-count]')?.textContent === '2,000', null, { timeout: 30000 }).catch(() => {})
      await page.waitForTimeout(1200)
      const box = await page.getByTestId('viewport').boundingBox()
      const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy]
      const click = async (fx, fy) => { await page.mouse.move(...at(fx, fy)); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(400) }

      // Cut a hole in the middle, then grow it shut
      await page.getByRole('button', { name: 'Erase', exact: true }).click()
      await click(0.5, 0.5)
      const holed = await count()
      await page.getByRole('button', { name: 'Fill', exact: true }).click()
      await click(0.5, 0.5)
      const filled = await count()
      if (holed >= 2000 || filled <= holed) fails.push(`blobscape sandbox: erasing left ${holed} blobs and Fill made it ${filled}`)
      else ok(`blobscape sandbox: Fill grows ${filled - holed} blobs into a hole of ${2000 - holed}`)
      await page.waitForTimeout(2000)
      await page.screenshot({ path: join(shots, 'blobscape-sandbox-fill.png') })
      // Filling open space beside the ball adds nothing
      await click(0.06, 0.08)
      if ((await count()) !== filled) fails.push(`blobscape sandbox: Fill in open space added ${(await count()) - filled} blobs`)
      else ok('blobscape sandbox: Fill leaves open space empty')

      // Stamp: a drag before a click copies nothing; click the middle, then drag beside it
      await page.getByRole('button', { name: 'Stamp', exact: true }).click()
      await click(0.5, 0.5)
      await page.mouse.move(...at(0.2, 0.5)); await page.mouse.down()
      for (let k = 1; k <= 6; k++) await page.mouse.move(...at(0.2 + k * 0.01, 0.5 + k * 0.02))
      await page.mouse.up()
      await page.waitForTimeout(500)
      const stamped = await count()
      if (stamped <= filled) fails.push(`blobscape sandbox: Stamp copied ${stamped - filled} blobs`)
      else ok(`blobscape sandbox: Stamp copies ${stamped - filled} blobs somewhere else`)
      await page.screenshot({ path: join(shots, 'blobscape-sandbox-stamp.png') })
      await page.getByRole('button', { name: 'Undo' }).click()
      await page.waitForTimeout(400)
      if ((await count()) !== filled) fails.push(`blobscape sandbox: Undo after a stamp stroke left ${await count()} blobs, not ${filled}`)
      else ok('blobscape sandbox: one Undo takes back a whole stamp stroke')
      await ctx.close()
    },
  },
  {
    name: 'sandbox-paint',
    about: 'the five brushes each paint onto the scene, one Undo a stroke',
    entries: ['src/blobscape/Sandbox.tsx', 'src/blobscape/brushes.ts'],
    async run({ shots, join, fails, ok, open, axe }) {
      const { page, ctx } = await open('/sandbox/', { viewport: { width: 1280, height: 900 } })
      await page.waitForTimeout(1500)
      const count = async () => Number((await page.textContent('[data-testid=blob-count]')).replace(/\D/g, ''))
      const box = await page.getByTestId('viewport').boundingBox()
      const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy]
      await page.getByRole('tab', { name: /Brush/ }).click()
      // Each brush on its own strip of the floor, left to right
      const kinds = ['Leaves', 'Grass', 'Fur', 'Moss', 'Stones']
      for (const [i, kind] of kinds.entries()) {
        await page.getByRole('group', { name: 'Paint with' }).getByRole('button', { name: kind, exact: true }).click()
        const before = await count()
        const fx = 0.14 + i * 0.18
        await page.mouse.move(...at(fx, 0.68)); await page.mouse.down()
        for (let k = 1; k <= 6; k++) await page.mouse.move(...at(fx + k * 0.006, 0.68 + k * 0.025))
        await page.mouse.up()
        await page.waitForTimeout(300)
        const added = (await count()) - before
        if (added < 5) fails.push(`blobscape sandbox: the ${kind} brush added ${added} blobs`)
        else ok(`blobscape sandbox: the ${kind} brush paints ${added} blobs`)
      }
      if ((await page.getByRole('button', { name: 'Paint', exact: true }).getAttribute('aria-pressed')) !== 'true') fails.push('blobscape sandbox: picking a brush did not pick the Paint tool')
      await page.waitForTimeout(2000)
      await page.screenshot({ path: join(shots, 'blobscape-sandbox-paint.png') })
      await axe(page, 'blobscape sandbox brushes')
      const full = await count()
      await page.getByRole('button', { name: 'Undo' }).click()
      await page.waitForTimeout(400)
      const back = await count()
      await page.getByRole('button', { name: 'Undo' }).click()
      await page.waitForTimeout(400)
      if (!(back < full && (await count()) < back)) fails.push(`blobscape sandbox: Undo after painting went ${full}, ${back}, ${await count()}`)
      else ok('blobscape sandbox: each painted stroke is one Undo')
      await ctx.close()
    },
  },
  {
    name: 'sandbox-path',
    about: 'camera stops and playing the path (saving the MP4 only with VERIFY_MP4=1)',
    entries: ['src/blobscape/Sandbox.tsx', 'src/blobscape/cameraPath.ts', 'src/blobscape/diorama/video.ts'],
    async run({ readFileSync, shots, join, fails, ok, open, axe }) {
      const { page, ctx } = await open('/sandbox/', { viewport: { width: 1280, height: 900 }, acceptDownloads: true })
      await page.waitForTimeout(1500)
      const shot = async () => (await page.getByTestId('viewport').screenshot()).toString('base64')
      // The view once it has stopped changing: software rendering sorts seconds behind a turn
      const settled = async () => {
        let was = await shot()
        for (let k = 0; k < 20; k++) { await page.waitForTimeout(700); const now = await shot(); if (now === was) return now; was = now }
        return was
      }
      // Pixels that differ clearly between two pictures of the view
      const differs = (a, b) => page.evaluate(async ([a, b]) => {
        const px = async (s) => { const i = await createImageBitmap(new Blob([Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0))], { type: 'image/png' })); const c = new OffscreenCanvas(i.width, i.height); const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height).data }
        const [p, q] = await Promise.all([px(a), px(b)])
        let n = 0
        for (let k = 0; k < p.length; k += 4) if (Math.abs(p[k] - q[k]) > 24 || Math.abs(p[k + 1] - q[k + 1]) > 24 || Math.abs(p[k + 2] - q[k + 2]) > 24) n++
        return n
      }, [a, b])
      const box = await page.getByTestId('viewport').boundingBox()
      const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy]
      await page.getByRole('button', { name: 'Look', exact: true }).click()
      await page.getByRole('tab', { name: /Scene/ }).click()
      const add = page.getByRole('button', { name: 'Add this view as a stop' })
      const play = page.getByRole('button', { name: 'Play the path' })
      if (!(await play.isDisabled())) fails.push('blobscape sandbox path: Play is on with no stops')
      await add.click()
      const first = await settled()
      // turn the view a good way round, then save the second stop
      await page.mouse.move(...at(0.3, 0.5)); await page.mouse.down(); await page.mouse.move(...at(0.7, 0.4), { steps: 8 }); await page.mouse.up()
      const second = await settled()
      await add.click()
      const said = await page.getByTestId('path-stops').textContent()
      const turned = await differs(first, second)
      if (turned < 2000 || !said.startsWith('2 stops, 2 seconds')) fails.push(`blobscape sandbox path: after two stops it says "${said.slice(0, 40)}"${turned < 2000 ? ' and the view did not turn' : ''}`)
      else ok('blobscape sandbox path: two views saved as stops')
      await axe(page, 'blobscape sandbox path')
      // Play: the view goes back to the first stop and glides; partway it is neither stop, and it ends at the second
      await play.click()
      await page.waitForTimeout(1000)
      const mid = await shot()
      await page.waitForFunction(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Play the path')?.getAttribute('aria-pressed') === 'false', null, { timeout: 15000 }).catch(() => {})
      const end = await settled()
      const fromFirst = await differs(mid, first), fromSecond = await differs(mid, second), short = await differs(end, second)
      if (fromFirst < 500 || fromSecond < 500) fails.push(`blobscape sandbox path: partway through playing, the view is at a stop (${fromFirst} and ${fromSecond} pixels from them)`)
      else if (short > turned / 20) fails.push(`blobscape sandbox path: playing ended ${short} pixels from the last stop (the stops are ${turned} apart)`)
      else ok('blobscape sandbox path: Play glides from the first stop to the last')
      // Save: an MP4 where the browser can make one (headless Chromium may have no H.264 encoder), else a plain reason
      // Saving is checked only where asked (VERIFY_MP4=1, a browser with a working H.264 encoder): headless Chromium
      // says it supports H.264, then sits on the frames and takes the GPU process down with it
      if (process.env.VERIFY_MP4) {
        await page.getByRole('slider', { name: 'Seconds a stop' }).focus()
        await page.keyboard.press('Home')
        const [download] = await Promise.all([page.waitForEvent('download', { timeout: 240000 }), page.getByTestId('path-save').click()])
        const bytes = readFileSync(await download.path())
        if (!download.suggestedFilename().endsWith('-path.mp4') || bytes.subarray(4, 8).toString('latin1') !== 'ftyp' || bytes.length < 20000) fails.push(`blobscape sandbox path: saved ${download.suggestedFilename()}, ${bytes.length} bytes`)
        else ok(`blobscape sandbox path: saves an MP4 (${Math.round(bytes.length / 1024)} KB)`)
        await page.waitForTimeout(800)
        if ((await differs(await shot(), second)) > turned / 20) fails.push('blobscape sandbox path: the view did not come back after saving')
        else ok('blobscape sandbox path: the view comes back after saving')
      } else ok('blobscape sandbox path: saving the MP4 not checked here (no working H.264 encoder in this browser)')
      await page.screenshot({ path: join(shots, 'blobscape-sandbox-path.png') })
      await ctx.close()
    },
  },
  {
    name: 'sandbox-photo',
    about: 'one photo to a shallow scene: the depth model runs in the page, the view opens as the photo and has depth',
    entries: ['src/blobscape/Sandbox.tsx', 'src/blobscape/photo.ts', 'src/blobscape/photo/scene.ts', 'src/blobscape/photo/depth.worker.ts'],
    async run({ readFileSync, root, shots, join, fails, ok, open }) {
      const { page, ctx } = await open('/sandbox/', { viewport: { width: 1280, height: 900 } })
      // nothing but this site may be asked for anything
      const outside = []
      page.on('request', (r) => { if (!/^(http:\/\/localhost|data:|blob:)/.test(r.url())) outside.push(r.url()) })
      await page.waitForTimeout(1500)
      const count = async () => Number((await page.textContent('[data-testid=blob-count]')).replace(/\D/g, ''))
      await page.getByRole('tab', { name: /Scene/ }).click()
      // one of the site's own pictures, the cabin scene's first frame, 410 by 307: shrunk to 256 by 192
      await page.setInputFiles('[data-testid=photo-input]', { name: 'picture.png', mimeType: 'image/png', buffer: readFileSync(join(root, 'public', 'loops', 'cabin.png')) })
      await page.waitForFunction(() => document.querySelector('[data-testid=blob-count]')?.textContent === (256 * 192).toLocaleString('en-US'), null, { timeout: 120000 }).catch(() => {})
      const made = await count()
      const alert = await page.getByRole('alert').textContent({ timeout: 500 }).catch(() => '')
      if (made !== 256 * 192) fails.push(`blobscape sandbox photo: a 410 by 307 photo gave ${made} blobs, not ${256 * 192}. ${alert}`)
      else ok(`blobscape sandbox photo: a photo becomes ${made.toLocaleString()} blobs, a blob a pixel`)
      if (outside.length) fails.push(`blobscape sandbox photo: asked another site for ${outside.slice(0, 3).join(', ')}`)
      else ok('blobscape sandbox photo: the model and its runtime come from this site alone')
      await page.waitForTimeout(3000)
      const front = await page.getByTestId('viewport').screenshot()
      await page.screenshot({ path: join(shots, 'blobscape-sandbox-photo.png') })
      // a small turn of the view
      await page.getByRole('button', { name: 'Look', exact: true }).click()
      const box = await page.getByTestId('viewport').boundingBox()
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5); await page.mouse.down()
      await page.mouse.move(box.x + box.width * 0.36, box.y + box.height * 0.5, { steps: 6 }); await page.mouse.up()
      await page.waitForTimeout(3000)
      const side = await page.getByTestId('viewport').screenshot()
      await page.screenshot({ path: join(shots, 'blobscape-sandbox-photo-turned.png') })
      if (front.equals(side)) fails.push('blobscape sandbox photo: turning the view changed nothing')
      else ok('blobscape sandbox photo: the view turns round the scene')
      await ctx.close()
    },
  },
  {
    name: 'sandbox-agent',
    about: 'WebMCP: the sandbox registers its tools with the browser, an assistant can look, build, cut, recolor, paint, add a creature, save and undo, and leaving takes them away',
    entries: ['src/blobscape/Sandbox.tsx', 'src/blobscape/agentTools.ts'],
    async run({ shots, join, fails, ok, open }) {
      // the browser here has no WebMCP: stand one in on the front page, then walk into the sandbox
      const { page, ctx } = await open('/', { viewport: { width: 1280, height: 900 }, acceptDownloads: true })
      await page.evaluate(() => {
        const tools = (window.__tools = new Map())
        Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool(t, o) { tools.set(t.name, t); o?.signal?.addEventListener('abort', () => tools.delete(t.name)); return Promise.resolve() } } })
      })
      await page.locator('a[href="/sandbox/"]').first().click()
      await page.waitForSelector('[data-testid=blob-count]')
      await page.waitForTimeout(1500)
      const count = async () => Number((await page.textContent('[data-testid=blob-count]')).replace(/\D/g, ''))
      const call = (name, input) => page.evaluate(([n, i]) => window.__tools.get(n).execute(i), [name, input])
      const names = await page.evaluate(() => [...window.__tools.keys()])
      if (names.length !== 8) fails.push(`blobscape sandbox agent: ${names.length} tools registered: ${names.join(', ')}`)
      else ok(`blobscape sandbox agent: registers ${names.join(', ')}`)
      const said = {}
      said.bad = await call('write_scene', { description: '{"name":"x","parts":[]}' })
      const doc = {
        name: 'A box on a hill', loop: 12, light: { from: [-0.5, 0.6, 0.6], ambient: 0.45 }, palette: ['#2c4a2a', '#4a7a3a', '#7aa84e', '#6e4a2e', '#d8c09a', '#8a2f2a'],
        camera: { target: [0, 0.3, 0], distance: 3.2, azimuth: 25, elevation: 18 },
        parts: [
          { shape: { kind: 'cylinder', at: [0, -0.2, 0], height: 0.2, r: 0.9 }, paint: '#4a7a3a' },
          { shape: { kind: 'box', at: [0, 0.25, 0], half: [0.3, 0.25, 0.3] }, paint: '#d8c09a' },
        ],
      }
      said.built = await call('write_scene', { description: JSON.stringify(doc) })
      await page.waitForTimeout(600)
      const built = await count()
      said.look = await call('describe_scene', {})
      said.cut = await call('cut', { center: [0, 0.5, 0], radius: 0.25 })
      await page.waitForTimeout(300)
      const afterCut = await count()
      said.recolor = await call('recolor', { center: [0.6, 0, 0], radius: 0.3, color: '#f2553a' })
      said.paint = await call('paint', { brush: 'grass', at: [-0.5, 0, 0.4], radius: 0.2 })
      await page.waitForTimeout(300)
      const afterPaint = await count()
      said.refused = await call('paint', { brush: 'lava', at: [0, 0, 0], radius: 0.2 })
      said.undo = await call('undo', {})
      await page.waitForTimeout(300)
      const afterUndo = await count()
      said.fox = await call('add_creature', { creature: 'fox' })
      const [download] = await Promise.all([page.waitForEvent('download'), call('save_scene', {})])
      // Spark sorts a whole new scene slowly when drawn in software: give the picture time to be the scene
      await page.waitForTimeout(9000)
      await page.screenshot({ path: join(shots, 'blobscape-sandbox-agent.png') })
      const good = /^Not built\. Fix these/.test(said.bad) && /^Built "A box on a hill"/.test(said.built) && built > 3000 && /A box on a hill.*blobs, in a box from/.test(said.look)
        && /^Cut /.test(said.cut) && afterCut < built && /^Recolored /.test(said.recolor) && /^Painted /.test(said.paint) && afterPaint > afterCut
        && /^Not done: there is no brush "lava"/.test(said.refused) && afterUndo === afterCut && /^Added a /.test(said.fox) && download.suggestedFilename().endsWith('.ply')
      if (!good) fails.push(`blobscape sandbox agent: ${JSON.stringify({ said, built, afterCut, afterPaint, afterUndo, file: download.suggestedFilename() })}`)
      else ok(`blobscape sandbox agent: built ${built.toLocaleString()} blobs from a description, cut to ${afterCut.toLocaleString()}, painted to ${afterPaint.toLocaleString()}, took it back, added a fox and saved ${download.suggestedFilename()}`)
      // leaving the sandbox takes the tools away
      await page.locator('a[href="/"]').first().click()
      await page.waitForTimeout(500)
      const left = await page.evaluate(() => window.__tools.size)
      if (left) fails.push(`blobscape sandbox agent: ${left} tools still registered after leaving`)
      else ok('blobscape sandbox agent: leaving the sandbox unregisters the tools')
      await ctx.close()
    },
  },
  {
    name: 'sandbox-props',
    about: 'a slime that bursts and the watch, added from other experiments',
    entries: ['src/blobscape/Sandbox.tsx', 'src/blobscape/props.ts'],
    async run({ shots, join, fails, ok, open, axe }) {
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
      // the burst moves on its own: look again until the view has changed (a few tries, as frames come slower when other checks share the machine)
      let b = a
      for (let k = 0; k < 6 && b.equals(a); k++) { await page.waitForTimeout(600); b = await page.getByTestId('viewport').screenshot() }
      await page.getByTestId('add-creature').getByRole('button', { name: 'Watch' }).click()
      await page.waitForTimeout(800)
      const both = await inCreatures()
      if (!(slime >= 2500 && both - slime >= 25000 && !a.equals(b))) fails.push(`blobscape sandbox props: ${JSON.stringify({ slime, both, same: a.equals(b) })}`)
      else ok(`blobscape sandbox props: adds a slime (${slime.toLocaleString()} blobs) that bursts, and the watch (${(both - slime).toLocaleString()})`)
      await page.screenshot({ path: join(shots, 'blobscape-sandbox-props.png') })
      await axe(page, 'blobscape sandbox props')
      await ctx.close()
    },
  },
  {
    name: 'sandbox-creatures',
    about: 'add, play, drag with Move, bones, freeze, undo, walk about, look at, effects, save .ply and rigged .glb, open a rigged model; phone',
    entries: ['src/blobscape/Sandbox.tsx', 'src/blobscape/actors.ts', 'src/blobscape/wander.ts', 'src/splat-core/view.ts', 'src/blobscape/sceneFile.ts', 'src/blobscape/modelRig.ts', 'src/splat-engine/skinnedModel.ts'],
    async run({ readFileSync, shots, join, fails, ok, open, axe, tabClick }) {
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
      // Walk about (issue #132): even set to Still, it trots off round its spot, and stands again when switched off
      await page.getByRole('button', { name: 'Still', exact: true }).click()
      await page.waitForTimeout(800)
      const standing = await shot()
      await page.getByLabel('Walk about').check()
      await page.waitForTimeout(2500)
      const roamed = await differs(standing, await shot())
      if (roamed < 500 || !(await page.getByRole('slider', { name: /How far/ }).isVisible())) fails.push(`blobscape sandbox creatures: Walk about didn't take the fox anywhere (${roamed} px)`)
      else ok(`blobscape sandbox creatures: Walk about takes the fox round its spot (${roamed} px changed)`)
      await page.getByLabel('Walk about').uncheck()
      await page.waitForTimeout(800)
      if ((await differs(standing, await shot())) > 200) fails.push('blobscape sandbox creatures: switching Walk about off left the fox away from its spot')
      else ok('blobscape sandbox creatures: switched off, it stands on its spot again')
      // Looks at (issue #133): standing still, it turns its head to the camera
      const ahead = await shot()
      await page.getByRole('group', { name: 'Looks at' }).getByRole('button', { name: 'You' }).click()
      await page.waitForTimeout(800)
      const turned = await differs(ahead, await shot())
      if (turned < 150) fails.push(`blobscape sandbox creatures: Looks at You didn't turn the fox's head (${turned} px)`)
      else ok(`blobscape sandbox creatures: Looks at You turns the fox's head to the camera (${turned} px changed)`)
      await page.getByRole('group', { name: 'Looks at' }).getByRole('button', { name: 'Ahead' }).click()
      // Effects (issue #134): on the whole scene they move the creatures too; on a selection, not
      await page.waitForTimeout(800)
      const whole = await shot()
      await page.getByRole('tab', { name: /Effects/ }).click()
      await page.getByRole('button', { name: 'Explode', exact: true }).click()
      await page.getByRole('slider', { name: 'Amount' }).focus()
      await page.keyboard.press('End')
      await page.waitForTimeout(2500)
      const blownFox = await differs(whole, await shot())
      if (blownFox < 1000) fails.push(`blobscape sandbox creatures: Explode on the whole scene left the fox alone (${blownFox} px)`)
      else ok(`blobscape sandbox creatures: Explode on the whole scene blows the fox apart too (${blownFox} px changed)`)
      await page.getByRole('group', { name: 'Apply to' }).getByRole('button', { name: 'Selection only' }).click()
      await page.waitForTimeout(1500)
      const spared = await differs(whole, await shot())
      if (spared > 200) fails.push(`blobscape sandbox creatures: an effect on the selection still moved the fox (${spared} px)`)
      else ok('blobscape sandbox creatures: an effect on the selection leaves the fox alone')
      await page.getByRole('group', { name: 'Apply to' }).getByRole('button', { name: 'Whole scene' }).click()
      await page.getByRole('group', { name: 'Effect' }).getByRole('button', { name: 'None' }).click()
      await page.getByRole('tab', { name: /Creatures/ }).click()
      for (const n of ['Frog', 'Elf', 'Dragon']) await page.getByTestId('add-creature').getByRole('button', { name: n }).click()
      await page.waitForTimeout(2500)
      await page.screenshot({ path: join(shots, 'blobscape-sandbox-creatures.png') })
      await axe(page, 'blobscape sandbox with creatures')
      // Save as rigged .glb (issue #135): it opens back as the same creatures, and on Splat Creatures as one model
      const live = await inCreatures(), sceneBefore = await count()
      await page.getByRole('tab', { name: /Scene/ }).click()
      const [glbDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save as rigged .glb' }).click()])
      const glbPath = await glbDl.path()
      await page.getByRole('button', { name: 'Empty' }).click()
      await page.setInputFiles('input[type=file]', { name: 'saved-scene.glb', mimeType: 'model/gltf-binary', buffer: readFileSync(glbPath) })
      // Handing 55k blobs to the view holds the page a moment, so wait for the count rather than read it once
      await page.waitForFunction((n) => document.querySelector('[data-testid=creature-blob-count]')?.textContent?.replace(/\D/g, '') === String(n), live, { timeout: 30000 }).catch(() => {})
      const back = await inCreatures(), creaturesBack = await page.getByText(/in 4 creatures/).count()
      if (back !== live || (await count()) !== sceneBefore || !creaturesBack) fails.push(`blobscape sandbox creatures: the saved .glb opened as ${await count()} scene blobs and ${back} in creatures, expected ${sceneBefore} and ${live} in 4`)
      else ok(`blobscape sandbox creatures: a saved rigged .glb opens back as the same 4 creatures (${back.toLocaleString()} blobs)`)
      // The sandbox's page closes first: two pages drawing 55k blobs at once starve software WebGPU
      const glbBytes = readFileSync(glbPath)
      await ctx.close()
      const cp = await open('/experiments/creature/?offscreen=1', { viewport: { width: 1280, height: 900 }, acceptDownloads: true })
      await cp.page.waitForFunction(() => window.__creature?.blobs() > 0, null, { timeout: 60000 }).catch(() => {})
      await cp.page.setInputFiles('input[type=file]', { name: 'saved-scene.glb', mimeType: 'model/gltf-binary', buffer: glbBytes })
      await cp.page.waitForFunction((n) => window.__creature?.blobs() === n, live + sceneBefore, { timeout: 30000 }).catch(() => {})
      const onCreature = await cp.page.evaluate(() => window.__creature?.blobs() ?? 0)
      if (onCreature !== live + sceneBefore) fails.push(`blobscape sandbox creatures: Splat Creatures opened the saved scene with ${onCreature} blobs, expected ${live + sceneBefore}`)
      else ok('blobscape sandbox creatures: Splat Creatures opens the saved scene too')
      // A rigged model (issue #208): the frog saved as an ordinary skinned mesh opens again as blobs on its own bones,
      // here and in the sandbox, with its moves
      await cp.page.goto(cp.page.url().replace(/\?.*/, '?offscreen=1&creature=frog'))
      await cp.page.waitForFunction(() => window.__creature?.blobs() > 0, null, { timeout: 60000 }).catch(() => {})
      await cp.page.waitForTimeout(1500)
      const [meshDl] = await Promise.all([cp.page.waitForEvent('download', { timeout: 120000 }), tabClick(cp.page.getByRole('button', { name: 'As a mesh' }))])
      const meshBytes = readFileSync(await meshDl.path())
      await cp.page.setInputFiles('input[type=file]', { name: 'frog-mesh.glb', mimeType: 'model/gltf-binary', buffer: meshBytes })
      await cp.page.waitForFunction(() => /bones/.test(document.querySelector('[data-testid=creature-note]')?.textContent ?? ''), null, { timeout: 60000 }).catch(() => {})
      const meshNote = await cp.page.textContent('[data-testid=creature-note]')
      const meshBlobs = await cp.page.evaluate(() => window.__creature?.blobs() ?? 0)
      if (!/Opened frog-mesh\.glb: 60,000 blobs, \d+ bones, [1-9]\d* clips?/.test(meshNote ?? '') || meshBlobs !== 60000) fails.push(`blobscape sandbox creatures: the frog as a skinned mesh opened on Splat Creatures as ${meshBlobs} blobs: ${meshNote}`)
      else ok(`blobscape sandbox creatures: a rigged model opens on Splat Creatures as blobs on its own bones (${meshNote})`)
      await cp.page.screenshot({ path: join(shots, 'blobscape-creature-from-model.png') })
      await cp.ctx.close()
      const sb = await open('/sandbox/', { viewport: { width: 1280, height: 900 } })
      await sb.page.waitForTimeout(1500)
      await sb.page.setInputFiles('input[type=file]', { name: 'frog-mesh.glb', mimeType: 'model/gltf-binary', buffer: meshBytes })
      await sb.page.waitForFunction(() => /Added .* blobs on its \d+ bones/.test(document.body.textContent ?? ''), null, { timeout: 60000 }).catch(() => {})
      const added = await sb.page.getByText(/Added .* blobs on its \d+ bones/).first().textContent().catch(() => '')
      if (!added) fails.push('blobscape sandbox creatures: the frog as a skinned mesh did not join the sandbox as a creature')
      else ok(`blobscape sandbox creatures: ${added.trim()}`)
      await sb.ctx.close()
      const phone = await open('/sandbox/', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
      await phone.page.waitForTimeout(1500)
      await phone.page.getByRole('tab', { name: /Creatures/ }).click()
      await phone.page.getByTestId('add-creature').getByRole('button', { name: 'Frog' }).click()
      await phone.page.waitForTimeout(2000)
      await phone.page.screenshot({ path: join(shots, 'blobscape-sandbox-creatures-phone.png'), fullPage: true })
      await axe(phone.page, 'blobscape phone sandbox with creatures')
      await phone.ctx.close()
    },
  },
]
