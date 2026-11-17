// The lessons and the sandbox: goals tick, toasts, readouts, the sandbox edits and undoes, dark pages.

export default [
  {
    name: 'lesson-goals',
    about: 'One blob: goals tick, toasts never move the page, the phone tab stays, goals are kept',
    entries: ['src/blobscape/lessons/OneBlob.tsx', 'src/shared/Toast.tsx', 'src/blobscape/progress.ts'],
    async run({ shots, join, fails, ok, open, axe }) {
      const { page, ctx } = await open('/lessons/one-blob/', { viewport: { width: 1440, height: 1000 } })
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForTimeout(500)
      const caseTop = () => page.locator('.case').first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
      const topBefore = await caseTop()
      await page.getByRole('button', { name: 'Pancake' }).click()
      await page.getByRole('slider', { name: 'Roll (z)' }).fill('40')
      await page.waitForFunction(() => document.querySelector('[data-testid=goal-count]')?.textContent.startsWith('2 of'), null, { timeout: 5000 }).catch(() => {})
      const goals = await page.textContent('[data-testid=goal-count]')
      if (!goals.startsWith('2 of')) fails.push(`blobscape: one blob goals show "${goals}" after pancake and turn`)
      else ok('blobscape: lesson goals tick off (pancake, turn)')
      // A ticked goal is a toast over the page: nothing on the page moves to make room for it
      const stepToasts = await page.getByTestId('toast-step').count()
      const moved = (await caseTop()) - topBefore
      if (stepToasts < 1 || Math.abs(moved) > 0.5) fails.push(`blobscape toasts: ${stepToasts} step toasts, the view moved ${moved}px`)
      else ok(`blobscape toasts: ${stepToasts} goal toasts, and the view stayed put`)
      await page.screenshot({ path: join(shots, 'blobscape-toast-step.png') })
      await axe(page, 'blobscape lesson with toasts')
      // Finishing every goal shows the lesson toast, with its links
      await page.getByRole('button', { name: 'Needle' }).click()
      await page.getByRole('slider', { name: 'Opacity' }).fill('0.1')
      await page.waitForFunction(() => document.querySelector('[data-testid=goal-count]')?.textContent.startsWith('4 of'), null, { timeout: 5000 }).catch(() => {})
      if (!(await page.getByTestId('toast-lesson').count())) fails.push(`blobscape toasts: no lesson toast at ${await page.textContent('[data-testid=goal-count]')}`)
      else ok('blobscape toasts: finishing the lesson shows the lesson toast')
      await page.screenshot({ path: join(shots, 'blobscape-toast-lesson.png') })
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForTimeout(300)
      if (await page.locator('[data-testid^=toast-]').count()) fails.push('blobscape toasts: a reload brought old toasts back')
      // goals ticked by the steps above are back to two for the checks that follow
      await page.getByRole('button', { name: 'Pancake' }).click()
      await page.getByRole('slider', { name: 'Roll (z)' }).fill('40')
      await page.waitForFunction(() => document.querySelector('[data-testid=goal-count]')?.textContent.startsWith('2 of'), null, { timeout: 5000 }).catch(() => {})
      {
        // Phone: the controls tab stays where you put it when a goal ticks (it used to jump to the next goal's tab)
        const phone = await open('/lessons/one-blob/', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
        await phone.page.evaluate(() => localStorage.clear())
        await phone.page.reload()
        await phone.page.waitForTimeout(500)
        const pressed = () => phone.page.locator('[aria-label="Show controls for"] [aria-pressed=true]').textContent()
        const tabBefore = await pressed()
        await phone.page.getByRole('button', { name: 'Pancake' }).click()
        await phone.page.getByRole('button', { name: 'Needle' }).click()
        await phone.page.waitForTimeout(300)
        const tabAfter = await pressed()
        if (!/Shape/.test(tabBefore) || tabAfter !== tabBefore) fails.push(`blobscape phone tabs: "${tabBefore}" became "${tabAfter}" when the shape goals ticked`)
        else ok('blobscape phone tabs: ticking goals leaves the controls tab alone')
        await phone.page.screenshot({ path: join(shots, 'blobscape-toast-phone.png') })
        await phone.ctx.close()
      }
      await page.reload()
      await page.waitForSelector('[data-testid=goal-count]')
      if (!(await page.textContent('[data-testid=goal-count]')).startsWith('2 of')) fails.push('blobscape: goals are not kept after a reload')
      else ok('blobscape: goals are kept in this browser')
      await ctx.close()
    },
  },
  {
    name: 'lessons-basics',
    core: true,
    about: 'Order, front page chrome (menu, footer, tip button, SEO), Color by angle, Paint, Splat files',
    entries: ['src/blobscape/lessons/Order.tsx', 'src/blobscape/Landing.tsx', 'src/blobscape/Chrome.tsx', 'src/shared/Footer.tsx', 'src/shared/SiteHeader.tsx', 'src/blobscape/lessons/Angle.tsx', 'src/blobscape/lessons/Paint.tsx', 'src/blobscape/lessons/Formats.tsx'],
    async run({ base, shots, join, fails, ok, open, axe, solidPixels }) {
      const B = '/'
      const count = (page) => page.textContent('[data-testid=blob-count]').then((t) => Number(t.replace(/\D/g, '')))
      const { page, ctx } = await open('/', { viewport: { width: 1440, height: 1000 } })
      await page.goto(base + '/lessons/order/')
      await page.waitForTimeout(800)
      const lit = await solidPixels(page, '[data-testid=view-yours]')
      if (lit < 1000) fails.push(`blobscape order: software view has ${lit} lit pixels`)
      else ok(`blobscape order: software renderer draws (${lit} pixels)`)
      if (!(await page.getByText('Your order: wrong').count())) fails.push('blobscape order: list order not reported wrong from the front')
      await page.getByRole('slider', { name: 'Turn' }).fill('180')
      if (!(await page.getByText('Your order: right by luck').count())) fails.push('blobscape order: list order not right from behind')
      else ok('blobscape order: list order is wrong from the front and right from behind')

      // Front page chrome: the menu, the footer, the tip button and the search metadata
      await page.goto(base + '/')
      await page.waitForTimeout(800)
      await page.getByRole('button', { name: 'Menu' }).click()
      const menuLinks = await page.locator('[popover] a').count()
      if (!(await page.locator('[popover]:popover-open').count()) || menuLinks < 6) fails.push(`blobscape menu: open ${await page.locator('[popover]:popover-open').count()}, ${menuLinks} links`)
      else ok(`blobscape menu: opens with ${menuLinks} links`)
      await axe(page, 'blobscape menu open')
      await page.screenshot({ path: join(shots, 'blobscape-menu.png') })
      await page.keyboard.press('Escape')
      if (await page.locator('[popover]:popover-open').count()) fails.push('blobscape menu: Escape left it open')
      if (!(await page.locator('a.tipjar').count())) fails.push('blobscape: no tip button on the front page')
      const ld = await page.evaluate(() => { try { return JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'].length } catch { return 0 } })
      const og = await page.getAttribute('meta[property="og:image"]', 'content')
      if (!ld || !og) fails.push(`blobscape seo: structured data ${ld}, og:image ${og}`)
      else ok('blobscape seo: structured data parses and the share image is set')
      const shareImage = await page.request.get(base + B + 'og.png')
      if (!shareImage.ok()) fails.push(`blobscape seo: og.png gave ${shareImage.status()}`)
      await page.locator('footer').scrollIntoViewIfNeeded()
      // the footer's Experiments column stays short: the three newest, then the way to the rest
      const footLinks = await page.locator('footer nav[aria-label="Experiments"] a').evaluateAll((as) => as.map((a) => [a.textContent, a.getAttribute('href')]))
      if (footLinks.length !== 4 || footLinks[3][0] !== 'All experiments' || footLinks[3][1] !== '/experiments/') fails.push(`blobscape footer: expected three experiments and "All experiments", got ${JSON.stringify(footLinks)}`)
      else ok(`blobscape footer: lists ${footLinks.slice(0, 3).map((l) => l[0]).join(', ')} and a link to all experiments`)
      await page.waitForTimeout(600)
      if (!(await page.locator('a.tipjar[data-tucked]').count())) fails.push('blobscape: the tip button stays over the footer')
      else ok('blobscape: the tip button tucks away at the footer')
      await page.goto(base + '/lessons/paint/')
      await page.waitForTimeout(500)
      if (!(await page.title()).startsWith('Paint · Lesson 6')) fails.push(`blobscape: lesson title is "${await page.title()}"`)
      else ok('blobscape: each page sets its own title')
      if (await page.locator('a.tipjar').count()) fails.push('blobscape: the tip button covers a lesson')

      // Color by angle: degree 3 keeps up with a soft shine and falls behind a sharp one
      const goalCount = () => page.textContent('[data-testid=goal-count]')
      await page.goto(base + '/lessons/angle/')
      await page.waitForTimeout(800)
      const peakAt = async (d, s) => {
        await page.getByRole('slider', { name: 'Degree' }).fill(String(d))
        await page.getByRole('slider', { name: 'Sharpness' }).fill(String(s))
        return Number((await page.textContent('[data-testid=sh-readout]')).match(/(\d+)% as bright/)[1])
      }
      const soft = await peakAt(3, 8), sharp = await peakAt(3, 120), low = await peakAt(1, 120)
      if (!(soft > 90 && sharp < 70 && low < sharp)) fails.push(`blobscape angle: stored highlight ${soft}% / ${sharp}% / ${low}%`)
      else ok(`blobscape angle: degree 3 keeps ${soft}% of a soft shine, ${sharp}% of a sharp one, degree 1 ${low}%`)

      // Paint: spraying the square covers it
      await page.goto(base + '/lessons/paint/')
      await page.waitForTimeout(800)
      const pbox = await page.getByTestId('viewport').boundingBox()
      for (let row = 0; row < 8; row++) {
        await page.mouse.move(pbox.x + pbox.width * 0.3, pbox.y + pbox.height * (0.3 + row * 0.06))
        await page.mouse.down()
        for (let k = 0; k <= 20; k++) await page.mouse.move(pbox.x + pbox.width * (0.3 + k * 0.02), pbox.y + pbox.height * (0.3 + row * 0.06))
        await page.mouse.up()
      }
      const covered = Number((await page.textContent('[data-testid=coverage]')).replace(/\D/g, ''))
      if (covered < 90) fails.push(`blobscape paint: spraying covered ${covered}%`)
      else ok(`blobscape paint: spraying covers ${covered}% of the square`)
      const painted = await count(page)
      await page.getByRole('button', { name: 'Erase', exact: true }).click()
      await page.mouse.move(pbox.x + pbox.width * 0.4, pbox.y + pbox.height * 0.45)
      await page.mouse.down()
      for (let k = 0; k <= 10; k++) await page.mouse.move(pbox.x + pbox.width * (0.4 + k * 0.02), pbox.y + pbox.height * 0.45)
      await page.mouse.up()
      const erased = await count(page)
      if (!(erased < painted)) fails.push(`blobscape paint: erasing went ${painted} → ${erased} blobs`)
      else ok(`blobscape paint: the eraser rubs out ${painted - erased} blobs`)

      // Splat files: .spz is the smallest of the three and is read back
      await page.goto(base + '/lessons/formats/')
      await page.waitForFunction(() => /\.spz \d/.test(document.body.textContent), null, { timeout: 15000 }).catch(() => {})
      await page.getByRole('button', { name: /^\.spz/ }).click()
      await page.waitForFunction(() => /as \.spz:/.test(document.querySelector('[data-testid=file-readout]')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {})
      const fileText = await page.textContent('[data-testid=file-readout]')
      const perBlob = Number(fileText.match(/([\d.]+) bytes each/)?.[1])
      if (!(perBlob > 4 && perBlob < 20)) fails.push(`blobscape formats: .spz readout "${fileText}"`)
      else ok(`blobscape formats: .spz is ${perBlob} bytes per blob, read back and shown`)
      await ctx.close()
    },
  },
  {
    name: 'lessons-capture',
    about: 'Photo shoot, Fuzzy things, Floaters, Lighting is baked, Break it',
    entries: ['src/blobscape/lessons/Shoot.tsx', 'src/blobscape/lessons/Fuzzy.tsx', 'src/blobscape/lessons/Floaters.tsx', 'src/blobscape/lessons/Lighting.tsx', 'src/blobscape/lessons/Break.tsx'],
    async run({ base, fails, ok, open }) {
      const { page, ctx } = await open('/', { viewport: { width: 1440, height: 1000 } })
      const goalCount = () => page.textContent('[data-testid=goal-count]')
      await page.goto(base + '/lessons/shoot/')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      const shootScore = async () => {
        await page.waitForFunction(() => /Every side/.test(document.querySelector('[data-testid=shoot-score]')?.textContent ?? ''), null, { timeout: 60000 }).catch(() => {})
        return Number((await page.textContent('[data-testid=shoot-score]')).match(/Every side: (\d+)%/)?.[1])
      }
      const oneSide = await shootScore()
      await page.getByRole('slider', { name: 'Turn' }).fill('180')
      await page.waitForTimeout(300)
      const backDone = await page.textContent('[data-testid=goal-count]')
      for (const deg of [90, 180, 270]) await page.getByRole('button', { name: new RegExp(`\\(${deg}°\\)`) }).click()
      await page.waitForTimeout(600)
      const allSides = await shootScore()
      if (!(oneSide < 40 && allSides > 90 && /^1 of/.test(backDone))) fails.push(`blobscape shoot: front photo ${oneSide}%, four round ${allSides}%, goals after the back ${backDone}`)
      else ok(`blobscape shoot: one front photo fits ${oneSide}% of every side, four round it ${allSides}%`)

      // Fuzzy things: the grass mesh loses its blade tips, the splats keep them; light gets through the splat fluff only
      await page.goto(base + '/lessons/fuzzy/')
      await page.waitForTimeout(1500)
      const grassText = await page.textContent('[data-testid=fuzzy-readout]')
      await page.getByRole('button', { name: 'Dandelion clock' }).click()
      await page.waitForTimeout(1500)
      const fluffText = await page.textContent('[data-testid=fuzzy-readout]')
      if (!/splats 28 of 28, mesh 0 of 28/.test(grassText) || !/splats [1-9]\d%, mesh (0%|no fluff left)/.test(fluffText)) fails.push(`blobscape fuzzy: "${grassText}" / "${fluffText}"`)
      else ok('blobscape fuzzy: splats keep every blade and let light through the fluff; the mesh does neither')

      // Floaters: a two-photo capture trains, the floater cut lifts every side a little, eight photos lift it a lot
      await page.goto(base + '/lessons/floaters/')
      const floatersText = async () => {
        await page.waitForFunction(() => /Every side/.test(document.querySelector('[data-testid=floaters-readout]')?.textContent ?? ''), null, { timeout: 60000 }).catch(() => {})
        await page.waitForTimeout(600)
        return page.textContent('[data-testid=floaters-readout]')
      }
      const sides = (t) => t.match(/Every side (\d+)% → (\d+)%/)?.slice(1).map(Number) ?? []
      const [rawQuick] = sides(await floatersText())
      await page.getByRole('slider', { name: 'Floaters' }).fill('0.8')
      const [, cleanedQuick] = sides(await floatersText())
      await page.getByRole('button', { name: 'Eight all round' }).click()
      const [rawRound] = sides(await floatersText())
      if (!(cleanedQuick > rawQuick && rawRound > cleanedQuick + 15)) fails.push(`blobscape floaters: quick ${rawQuick}% → ${cleanedQuick}% cleaned, eight photos ${rawRound}%`)
      else ok(`blobscape floaters: cleanup lifts two photos from ${rawQuick}% to ${cleanedQuick}%, eight photos give ${rawRound}%`)

      // Lighting is baked: moving the lamp leaves the scan behind; taking the old light out with the shape known catches up
      await page.goto(base + '/lessons/lighting/')
      await page.waitForTimeout(1500)
      await page.getByRole('slider', { name: 'Lamp', exact: true }).fill('125')
      await page.waitForTimeout(300)
      const lightingScore = async () => Number((await page.textContent('[data-testid=lighting-readout]')).match(/(\d+)%/)?.[1])
      const stuck = await lightingScore()
      await page.getByRole('button', { name: 'Take the old light out' }).click()
      await page.getByRole('slider', { name: 'Where the capture’s lamp was' }).fill('-55')
      await page.getByLabel('Know the scene’s shape').check()
      await page.waitForTimeout(300)
      const relitScore = await lightingScore()
      if (!(stuck <= 5 && relitScore >= 95)) fails.push(`blobscape lighting: as captured ${stuck}%, relit with the shape ${relitScore}%`)
      else ok(`blobscape lighting: the scan stays at ${stuck}% when the lamp moves, ${relitScore}% once the old light and shadows come out`)

      // Break it: shrink, explode, and put it back
      await page.goto(base + '/lessons/break/')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForTimeout(800)
      await page.getByRole('slider', { name: 'Size' }).fill('0.1')
      await page.getByRole('slider', { name: 'Explode' }).fill('0.8')
      await page.getByRole('slider', { name: 'Explode' }).fill('0')
      await page.getByRole('slider', { name: 'Size' }).fill('1')
      if (!(await goalCount()).startsWith('3 of')) fails.push(`blobscape break: goals show "${await goalCount()}"`)
      else ok('blobscape break: shrink, explode and put back tick all three goals')
      await ctx.close()
    },
  },
  {
    name: 'lessons-rigs',
    core: true,
    about: 'One bone, Weights, Morphs, Fur, Twist, Walk, Feet, Model: each goal ticks',
    entries: ['src/blobscape/lessons/OneBone.tsx', 'src/blobscape/lessons/Weights.tsx', 'src/blobscape/lessons/Morphs.tsx', 'src/blobscape/lessons/Fur.tsx', 'src/blobscape/lessons/Twist.tsx', 'src/blobscape/lessons/Walk.tsx', 'src/blobscape/lessons/Feet.tsx', 'src/blobscape/lessons/Model.tsx'],
    async run({ base, fails, ok, open }) {
      const { page, ctx } = await open('/', { viewport: { width: 1440, height: 1000 } })
      const goalCount = () => page.textContent('[data-testid=goal-count]')
      const goalsAt = async (n) => {
        await page.waitForFunction((k) => document.querySelector('[data-testid=goal-count]')?.textContent.startsWith(`${k} of`), n, { timeout: 8000 }).catch(() => {})
        return goalCount()
      }
      const fresh = async (id) => { await page.goto(base + `/lessons/${id}/`); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(800) }
      const slider = (name) => page.getByRole('slider', { name, exact: true })
      await fresh('one-bone')
      await slider('Lift').fill('60')
      await slider('Cut').fill('0.5')
      await slider('Cut').fill('-0.5')
      await slider('Cut').fill('0')
      if (!(await goalsAt(4)).startsWith('4 of')) fails.push(`blobscape one bone: goals show "${await goalCount()}"`)
      else ok('blobscape one bone: lift, tear, swing and seam tick')

      await fresh('weights')
      await slider('Bend').fill('90')
      const gapText = await page.textContent('[data-testid=gap]')
      await slider('Blend over').fill('0.4')
      const smoothText = await page.textContent('[data-testid=gap]')
      await slider('Blend over').fill('2')
      await slider('Blend over').fill('0.4')
      await slider('Centerd at').fill('0.5')
      if (!(await goalsAt(4)).startsWith('4 of')) fails.push(`blobscape weights: goals show "${await goalCount()}" (hard: ${gapText} / blended: ${smoothText})`)
      else ok('blobscape weights: crack, smooth, rubber and offset tick')

      await fresh('morphs')
      await slider('Spikes').fill('1')
      await slider('Puff').fill('1')
      const puffed = await page.textContent('[data-testid=morph-readout]')
      await slider('Puff').fill('-0.5')
      await slider('Swing').fill('-1.5')
      const swung = await page.textContent('[data-testid=morph-readout]')
      const spread = Number(puffed.match(/sit ([\d.]+)×/)?.[1]), tail = Number(swung.match(/tail is (\d+)%/)?.[1])
      if (!(await goalsAt(3)).startsWith('3 of') || !(spread >= 1.4 && tail >= 110)) fails.push(`blobscape morphs: goals show "${await goalCount()}" (${puffed} / ${swung})`)
      else ok(`blobscape morphs: spikes, thin and past tick (body blobs ${spread}× apart puffed, tail ${tail}% of its length swung past its shape)`)

      await fresh('fur')
      await slider('Width').fill('0.4')
      await slider('Width').fill('0.07')
      await page.getByRole('checkbox', { name: 'Skin under the strands' }).uncheck()
      await slider('Lift').fill('0')
      await slider('Length').fill('0.2')
      const hollow = await page.textContent('[data-testid=fur-readout]')
      await page.getByRole('button', { name: 'Lawn', exact: true }).click()
      await slider('Breeze').fill('1')
      await slider('Blobs per strand').fill('5')
      await slider('Blobs per strand').fill('2')
      const lawn = await page.textContent('[data-testid=fur-readout]')
      if (!(await goalsAt(4)).startsWith('4 of')) fails.push(`blobscape fur: goals show "${await goalCount()}" (${hollow} / ${lawn})`)
      else ok(`blobscape fur: felt, skin, bend and budget tick (${lawn.trim()})`)

      await fresh('twist')
      await slider('Twist').fill('170')
      await slider('Twist').fill('30')
      await slider('Blend over').fill('0')
      await slider('Twist').fill('170')
      if (!(await goalsAt(3)).startsWith('3 of')) fails.push(`blobscape twist: goals show "${await goalCount()}" (${await page.textContent('[data-testid=kept]')})`)
      else ok('blobscape twist: flat, small and hard tick')
      const kept = await page.textContent('[data-testid=kept]')
      const [plainPct, avgPct] = [...kept.matchAll(/(\d+)%/g)].map((m) => Number(m[1]))
      await slider('Blend over').fill('0.5')
      const [p2, a2] = [...(await page.textContent('[data-testid=kept]')).matchAll(/(\d+)%/g)].map((m) => Number(m[1]))
      if (!(p2 < 10 && a2 > 80)) fails.push(`blobscape twist: at 170° blended matrices keep ${p2}%, averaged turns ${a2}%`)
      else ok(`blobscape twist: at 170° blended matrices keep ${p2}% of a blob, averaged turns ${a2}% (hard weights ${plainPct}/${avgPct}%)`)

      await fresh('walk')
      await page.getByRole('button', { name: '2: contacts only' }).click()
      await page.waitForTimeout(2000)
      await page.getByRole('button', { name: '4: with passing' }).click()
      await page.getByLabel('Hold each key (no in-betweens)').check()
      await slider('Step time').fill('1.5')
      await page.waitForTimeout(2000)
      await page.getByLabel('Hold each key (no in-betweens)').uncheck()
      await slider('Step time').fill('0.9')
      const feet = Number((await page.textContent('[data-testid=slip]')).match(/([\d.]+) m\/s/)[1])
      await slider('Speed').fill(String(Math.round(feet * 20) / 20))
      await page.waitForTimeout(300)
      await slider('Step time').fill('0.45')
      await slider('Speed').fill(String(Math.round(feet * 2 * 20) / 20))
      if (!(await goalsAt(4)).startsWith('4 of')) fails.push(`blobscape walk: goals show "${await goalCount()}" (${await page.textContent('[data-testid=slip]')})`)
      else ok(`blobscape walk: two keys, held keys, grip and run tick (feet at ${feet} m/s)`)

      await fresh('feet')
      await page.getByRole('button', { name: 'Steps', exact: true }).click()
      await slider('Step height').fill('0.15')
      await page.waitForTimeout(2500)
      await page.getByLabel('Bend the legs to the ground').check()
      await page.waitForTimeout(2500)
      await page.getByLabel('Move the hips to the lower foot').uncheck()
      await slider('Step height').fill('0.3')
      await page.waitForTimeout(2500)
      await page.getByLabel('Move the hips to the lower foot').check()
      await page.waitForTimeout(2500)
      await page.getByRole('button', { name: 'Slope', exact: true }).click()
      await slider('Steepness').fill('20')
      if (!(await goalsAt(4)).startsWith('4 of')) fails.push(`blobscape feet: goals show "${await goalCount()}" (${await page.textContent('[data-testid=feet-readout]')})`)
      else ok(`blobscape feet: sunk, planted, reached and tilted tick (${(await page.textContent('[data-testid=feet-readout]')).trim()})`)

      await fresh('model')
      await slider('Level').fill('8')
      await page.waitForTimeout(600)
      await slider('Level').fill('1')
      await page.getByRole('button', { name: '16', exact: true }).click()
      await page.waitForTimeout(600)
      await page.getByRole('button', { name: '48', exact: true }).click()
      if (!(await goalsAt(3)).startsWith('3 of')) fails.push(`blobscape model: goals show "${await goalCount()}" (${await page.textContent('[data-testid=mesh-readout]')})`)
      else ok(`blobscape model: falls apart, goes lumpy and keeps a good mesh (${await page.textContent('[data-testid=mesh-readout]')})`)
      await ctx.close()
    },
  },
  {
    name: 'sandbox-basics',
    about: 'a lesson opens in the sandbox; spray, undo, redo, delete, keyboard, skip link',
    entries: ['src/blobscape/Sandbox.tsx', 'src/blobscape/lessons/Many.tsx', 'src/blobscape/lessons/Footprint.tsx'],
    async run({ base, fails, ok, open, axe }) {
      const count = (page) => page.textContent('[data-testid=blob-count]').then((t) => Number(t.replace(/\D/g, '')))
      const { page, ctx } = await open('/', { viewport: { width: 1440, height: 1000 } })
      await page.goto(base + '/lessons/many/')
      await page.waitForTimeout(800)
      const lessonCount = await count(page)
      await page.getByRole('button', { name: 'Open this scene in the sandbox' }).click()
      await page.waitForTimeout(800)
      if ((await count(page)) !== lessonCount) fails.push(`blobscape: sandbox got ${await count(page)} blobs from a ${lessonCount}-blob lesson`)
      else ok(`blobscape: "Open in the sandbox" carries the lesson's ${lessonCount} blobs`)

      // Sandbox: spray onto an empty floor, undo, redo, select, delete
      await page.getByRole('tab', { name: /Scene/ }).click()
      await page.getByRole('button', { name: 'Empty', exact: true }).click()
      await page.getByRole('button', { name: 'Spray', exact: true }).click()
      const box = await page.getByTestId('viewport').boundingBox()
      await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.7)
      await page.mouse.down()
      for (let k = 1; k <= 12; k++) await page.mouse.move(box.x + box.width * 0.4 + k * 20, box.y + box.height * 0.7)
      await page.mouse.up()
      const sprayed = await count(page)
      if (sprayed < 20) fails.push(`blobscape sandbox: spray made ${sprayed} blobs`)
      else ok(`blobscape sandbox: spray puts down ${sprayed} blobs`)
      await page.getByRole('button', { name: 'Undo' }).click()
      const undone = await count(page)
      await page.getByRole('button', { name: 'Redo' }).click()
      if (undone !== 0 || (await count(page)) !== sprayed) fails.push(`blobscape sandbox: undo/redo gave ${undone} then ${await count(page)}`)
      else ok('blobscape sandbox: undo and redo the stroke')
      await page.getByRole('tab', { name: /Selection/ }).click()
      await page.getByRole('button', { name: 'Select all' }).click()
      await page.getByRole('button', { name: 'Delete' }).click()
      if ((await count(page)) !== 0) fails.push('blobscape sandbox: delete left blobs behind')
      await page.keyboard.press('Control+z')
      if ((await count(page)) !== sprayed) fails.push('blobscape sandbox: Ctrl+Z did not bring the deleted blobs back')
      else ok('blobscape sandbox: select all, delete, Ctrl+Z')
      // Keyboard: Enter on the focused view uses the tool at its center
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      const beforeKey = await count(page)
      await page.getByTestId('viewport').focus()
      await page.keyboard.press('Enter')
      if ((await count(page)) !== beforeKey + 1) fails.push(`blobscape sandbox: Enter with Add went ${beforeKey} → ${await count(page)}`)
      else ok('blobscape sandbox: Enter on the view adds a blob at the center')
      // The skip link jumps to the content without leaving the page
      await page.keyboard.press('Shift+Tab')
      await page.goto(base + '/lessons/footprint/')
      await page.keyboard.press('Tab')
      await page.getByRole('link', { name: 'Skip to content' }).press('Enter')
      await page.waitForTimeout(300)
      if (!(await page.getByRole('heading', { level: 1, name: /Footprint/ }).count())) fails.push('blobscape: the skip link left the lesson')
      else ok('blobscape: the skip link stays on the lesson')
      await axe(page, 'blobscape sandbox after edits')
      await ctx.close()
    },
  },
  {
    name: 'dark-pages',
    about: 'axe in dark on the sandbox, a lesson, the front page and Color by angle',
    entries: ['src/blobscape/Sandbox.tsx', 'src/blobscape/lessons/Footprint.tsx', 'src/blobscape/Landing.tsx', 'src/blobscape/lessons/Angle.tsx'],
    files: ['src/shared/theme.css'],
    async run({ base, shots, join, open, axe }) {
      const dark = await open('/sandbox/', { colorScheme: 'dark', viewport: { width: 1280, height: 900 } })
      await dark.page.waitForTimeout(2500)
      await axe(dark.page, 'blobscape dark sandbox')
      await dark.page.screenshot({ path: join(shots, 'blobscape-dark.png') })
      await dark.page.goto(base + '/lessons/footprint/')
      await dark.page.waitForTimeout(1500)
      await axe(dark.page, 'blobscape dark footprint')
      await dark.page.screenshot({ path: join(shots, 'blobscape-footprint-dark.png') })
      await dark.page.goto(base + '/')
      await dark.page.waitForTimeout(800)
      await axe(dark.page, 'blobscape dark home')
      await dark.page.goto(base + '/lessons/angle/')
      await dark.page.waitForTimeout(1500)
      await axe(dark.page, 'blobscape dark angle')
      await dark.page.screenshot({ path: join(shots, 'blobscape-angle-dark.png') })
      await dark.ctx.close()
    },
  },
]
