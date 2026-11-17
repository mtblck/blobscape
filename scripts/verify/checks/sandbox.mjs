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
    about: 'add, play, drag with Move, bones, freeze, undo, walk about, look at, effects, save; phone',
    entries: ['src/blobscape/Sandbox.tsx', 'src/blobscape/actors.ts', 'src/blobscape/wander.ts', 'src/splat-core/view.ts'],
    async run({ readFileSync, shots, join, fails, ok, open, axe }) {
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
      await ctx.close()
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
