// Fit a Picture: trains in a worker, graphs the loss, views, pause and step, own pictures.

export default [
  {
    name: 'fit',
    core: true,
    about: 'desktop and phone: training, the loss graph, views, pause/step, adding blobs, own pictures',
    entries: ['src/fit-a-picture/main.tsx', 'src/fit-a-picture/trainer.worker.ts'],
    files: ['experiments/fit-a-picture/'],
    async run({ shots, join, fails, ok, open, tabClick, axe }) {
      const stepNow = (page) => page.textContent('[data-testid=step]').then((t) => Number(t.replace(/,/g, '')))
      const blobsNow = (page) => page.textContent('[data-testid=blob-count]').then((t) => Number(t.replace(/\D/g, '')))
      for (const [label, opts] of [['desktop', { viewport: { width: 1440, height: 1000 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
        const { page, ctx } = await open('/experiments/fit-a-picture/', opts)
        await page.waitForFunction(() => Number(document.querySelector('[data-testid=step]')?.textContent?.replace(/,/g, '')) > 30, null, { timeout: 30000 }).catch(() => {})
        const steps = await stepNow(page)
        if (steps <= 30) fails.push(`fit ${label}: training stuck at step ${steps}`)
        else ok(`fit ${label}: training runs in the worker (step ${steps})`)
        const points = Number(await page.getAttribute('[data-testid=loss-graph]', 'data-points'))
        if (points < 30) fails.push(`fit ${label}: loss graph has ${points} points`)
        else ok(`fit ${label}: loss graph has ${points} points`)
        const lit = await page.evaluate(() => {
          const c = document.querySelector('[data-testid=fit]')
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
          let sum = 0
          for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]
          return sum / (d.length / 4) / 3
        })
        if (lit < 20) fails.push(`fit ${label}: the fit canvas is blank (mean ${lit.toFixed(1)})`)
        else ok(`fit ${label}: the fit canvas is drawn (mean level ${lit.toFixed(0)})`)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        if (overflow > 0) fails.push(`fit ${label}: page scrolls sideways by ${overflow}px`)
        await axe(page, `fit ${label}`)
        if (label === 'desktop') {
          // Pause holds the step; Step once moves it by exactly one
          await tabClick(page.getByRole('button', { name: 'Pause' }))
          await page.waitForTimeout(300)
          const held = await stepNow(page)
          await page.waitForTimeout(500)
          if ((await stepNow(page)) !== held) fails.push('fit: pause does not stop training')
          await tabClick(page.getByRole('button', { name: 'Step once' }))
          await page.waitForFunction((h) => Number(document.querySelector('[data-testid=step]').textContent.replace(/,/g, '')) === h + 1, held, { timeout: 5000 }).catch(() => {})
          if ((await stepNow(page)) !== held + 1) fails.push(`fit: step once went from ${held} to ${await stepNow(page)}`)
          else ok('fit: pause holds, step once moves one step')
          // A click on the fit adds blobs there
          const before = await blobsNow(page)
          await page.getByTestId('fit').click({ position: { x: 100, y: 80 } })
          await page.waitForFunction((b) => Number(document.querySelector('[data-testid=blob-count]').textContent.replace(/\D/g, '')) > b, before, { timeout: 5000 }).catch(() => {})
          const after = await blobsNow(page)
          if (after <= before) fails.push(`fit: clicking did not add blobs (${before} → ${after})`)
          else ok(`fit: a click adds blobs (${before} → ${after})`)
          // Keyboard: focus the fit, aim with the arrows, Enter adds
          await page.getByTestId('fit').focus()
          await page.keyboard.press('ArrowLeft')
          await page.keyboard.press('Enter')
          await page.waitForFunction((b) => Number(document.querySelector('[data-testid=blob-count]').textContent.replace(/\D/g, '')) > b, after, { timeout: 5000 }).catch(() => {})
          if ((await blobsNow(page)) <= after) fails.push('fit: Enter on the focused fit does not add blobs')
          else ok('fit: keyboard adds blobs (arrows aim, Enter adds)')
          // The loss graph reads out values from the keyboard
          await page.getByTestId('loss-graph').locator('svg').focus()
          await page.keyboard.press('Home')
          const said = await page.getByTestId('loss-graph').locator('[aria-live]').textContent()
          if (!/^Step \d/.test(said)) fails.push(`fit: loss graph keyboard readout is "${said}"`)
          else ok(`fit: loss graph reads out from the keyboard ("${said}")`)
          // Views, from the Picture tab
          for (const v of ['Blobs', 'Error']) {
            await tabClick(page.getByRole('button', { name: v, exact: true }))
            await page.waitForTimeout(400)
            if ((await page.getByRole('button', { name: v, exact: true }).getAttribute('aria-pressed')) !== 'true') fails.push(`fit: ${v} view not selected`)
            await page.screenshot({ path: join(shots, `fit-a-picture-${v.toLowerCase()}.png`) })
          }
          ok('fit: blobs and error views switch')
          await axe(page, 'fit error view')
          await tabClick(page.getByRole('button', { name: 'Fit', exact: true }))
          await tabClick(page.getByRole('button', { name: 'Resume' }))
          // Prune now and add 100, from the Training tab
          await page.getByRole('tab', { name: /Training/ }).click()
          const b0 = await blobsNow(page)
          await tabClick(page.getByRole('button', { name: "Add 100 where it's wrong" }))
          // the worker adds them on its next frame, which is slower when other checks share the machine
          await page.waitForFunction((b0) => Number(document.querySelector('[data-testid=blob-count]')?.textContent.replace(/\D/g, '')) >= b0 + 50, b0, { timeout: 10000 }).catch(() => {})
          if ((await blobsNow(page)) < b0 + 50) fails.push(`fit: add 100 went ${b0} → ${await blobsNow(page)}`)
          else ok('fit: "Add 100 where it\'s wrong" adds blobs')
          await tabClick(page.getByRole('button', { name: 'Prune now' }))
          await page.waitForFunction(() => /prune/i.test(document.querySelector('[data-testid=log]').textContent), null, { timeout: 5000 }).catch(() => {})
          if (!/prune/i.test(await page.textContent('[data-testid=log]'))) fails.push('fit: prune now leaves no log line')
          else ok('fit: prune now is logged')
          await axe(page, 'fit blobs tab')
          // The user's own picture: a PNG made from a screenshot, then a file that isn't a picture
          const png = await page.screenshot({ clip: { x: 0, y: 0, width: 300, height: 200 } })
          await page.getByRole('tab', { name: /Picture/ }).click()
          await page.setInputFiles('input[type=file]', { name: 'mine.png', mimeType: 'image/png', buffer: png })
          await page.waitForFunction(() => /mine/.test(document.body.textContent), null, { timeout: 10000 }).catch(() => {})
          if (!(await page.getByRole('button', { name: 'mine' }).count())) fails.push('fit: own picture did not load')
          else ok('fit: an own picture loads and the fit restarts')
          await page.setInputFiles('input[type=file]', { name: 'junk.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') })
          const alert = await page.getByRole('alert').textContent({ timeout: 5000 }).catch(() => '')
          if (!alert.includes("didn't open")) fails.push(`fit: bad file shows "${alert}"`)
          else ok('fit: a bad file shows an error')
          await tabClick(page.getByRole('button', { name: 'Marbles' }))
        }
        await page.waitForTimeout(3000)
        await page.screenshot({ path: join(shots, `fit-a-picture-${label}.png`), fullPage: true })
        await ctx.close()
      }
    },
  },
  {
    name: 'fit-dark',
    about: 'dark theme, axe',
    entries: ['src/fit-a-picture/main.tsx'],
    files: ['experiments/fit-a-picture/', 'src/shared/theme.css'],
    async run({ shots, join, open, axe }) {
      const { page, ctx } = await open('/experiments/fit-a-picture/', { colorScheme: 'dark', viewport: { width: 1280, height: 900 } })
      await page.waitForTimeout(2500)
      await axe(page, 'fit dark')
      await page.screenshot({ path: join(shots, 'fit-a-picture-dark.png') })
      await ctx.close()
    },
  },
]
