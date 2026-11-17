// Splat to Sprite: renders, previews, bakes sheets, opens a .ply, dark theme.

export default [
  {
    name: 'sprite',
    core: true,
    about: 'desktop and phone: the splat loads, the sprite preview draws, sheets bake',
    entries: ['src/splat-to-sprite/main.tsx'],
    files: ['experiments/splat-to-sprite/'],
    async run({ shots, join, fails, ok, open, tabClick, axe, solidPixels }) {
      for (const [label, opts] of [['desktop', { viewport: { width: 1440, height: 1000 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
        const { page, ctx } = await open('/experiments/splat-to-sprite/', opts)
        await page.waitForFunction(() => /[1-9]/.test(document.querySelector('[data-testid=splat-count]')?.textContent ?? ''), null, { timeout: 30000 })
        ok(`${label}: ${await page.textContent('[data-testid=splat-count]')} loaded`)
        await page.waitForFunction(() => {
          const c = document.querySelector('[data-testid=sprite-preview]')
          if (!c || !c.width) return false
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
          let n = 0
          for (let i = 3; i < d.length; i += 4) if (d[i]) n++
          return n > 50
        }, null, { timeout: 30000 }).catch(() => {})
        const n = await solidPixels(page, '[data-testid=sprite-preview]')
        if (n < 50) fails.push(`${label}: sprite preview has only ${n} solid pixels`)
        else ok(`${label}: sprite preview has ${n} solid pixels`)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        if (overflow > 0) fails.push(`${label}: page scrolls sideways by ${overflow}px`)
        await axe(page, label)
        if (label === 'desktop') {
          // Settings sit in tabs: arrow keys move between them, and only one panel shows
          await page.getByRole('tab', { name: /Prop Type/ }).focus()
          await page.keyboard.press('ArrowRight')
          await page.keyboard.press('ArrowRight')
          const colorOn = (await page.getByRole('tab', { name: /Finish/ }).getAttribute('aria-selected')) === 'true'
          const paletteShows = await page.getByRole('combobox', { name: 'Palette' }).isVisible()
          const turnHidden = !(await page.getByRole('slider', { name: 'Turn' }).isVisible())
          if (!colorOn || !paletteShows || !turnHidden) fails.push(`tabs: color selected ${colorOn}, palette visible ${paletteShows}, camera hidden ${turnHidden}`)
          else ok('arrow keys move through the settings tabs')
          await axe(page, 'desktop color tab')
          await page.getByRole('tab', { name: /View/ }).click()
          // The header stays on screen once the page scrolls
          await page.evaluate(() => window.scrollTo(0, 900))
          const top = await page.getByRole('banner').evaluate((h) => h.getBoundingClientRect().top)
          if (top !== 0) fails.push(`header scrolled away (top ${top})`)
          else ok('header stays stuck to the top while scrolling')
          await page.evaluate(() => window.scrollTo(0, 0))
          await tabClick(page.getByRole('button', { name: 'Isometric' }))
          if ((await page.getByRole('button', { name: 'Isometric' }).getAttribute('aria-pressed')) !== 'true') fails.push('Isometric preset does not show as selected')
          else ok('Isometric preset shows as selected')
          await tabClick(page.getByRole('button', { name: '¾ view' }))
          await page.getByRole('slider', { name: 'Turn' }).fill('30')
          await tabClick(page.getByRole('button', { name: 'Bake sprite sheet' }))
          await page.waitForSelector('[data-testid=sheet] img', { timeout: 60000 })
          const dims = await page.evaluate(async () => {
            const img = document.querySelector('[data-testid=sheet] img')
            await img.decode()
            return [img.naturalWidth, img.naturalHeight]
          })
          if (dims[0] !== 32 || dims[1] !== 128) fails.push(`4-direction sheet is ${dims.join('×')}, expected 32×128`)
          else ok('baked a 4-direction 32×128 sheet')
          const frames = await page.locator('[data-testid=sheet] ol li').count()
          if (frames !== 4) fails.push(`sheet shows ${frames} frames, expected 4`)
          else ok('sheet shows its 4 frames, labeled')
          await axe(page, 'desktop baked')
          await page.getByRole('slider', { name: 'Turn' }).fill('60')
          if (!(await page.getByRole('status').filter({ hasText: 'changed since' }).count())) fails.push('changing a setting does not mark the sheet out of date')
          else ok('changing a setting marks the sheet out of date')
        }
        await page.waitForTimeout(500)
        await page.screenshot({ path: join(shots, `splat-to-sprite-${label}.png`), fullPage: true })
        await ctx.close()
      }
    },
  },
  {
    name: 'sprite-ply',
    about: "a user's .ply opens and makes a sprite; a bad file shows an error",
    entries: ['src/splat-to-sprite/main.tsx'],
    files: ['experiments/splat-to-sprite/'],
    async run({ shots, join, fails, ok, open, solidPixels, ballPly }) {
      const buf = ballPly()
      const { page, ctx } = await open('/experiments/splat-to-sprite/', { viewport: { width: 1280, height: 900 } })
      await page.waitForFunction(() => /[1-9]/.test(document.querySelector('[data-testid=splat-count]')?.textContent ?? ''), null, { timeout: 30000 })
      await page.setInputFiles('input[type=file]', { name: 'ball.ply', mimeType: 'application/octet-stream', buffer: buf })
      await page.waitForFunction(() => document.querySelector('[data-testid=splat-count]')?.textContent?.startsWith('2,000'), null, { timeout: 30000 }).catch(() => {})
      const count = await page.textContent('[data-testid=splat-count]')
      if (!count.startsWith('2,000')) fails.push(`.ply upload shows "${count}", expected 2,000 splats`)
      else {
        await page.waitForFunction(() => {
          const c = document.querySelector('[data-testid=sprite-preview]')
          if (!c || !c.width) return false
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
          let n = 0
          for (let i = 3; i < d.length; i += 4) if (d[i]) n++
          return n >= 100
        }, null, { timeout: 30000 }).catch(() => {})
        const solid = await solidPixels(page, '[data-testid=sprite-preview]')
        if (solid < 100) fails.push(`.ply sprite has only ${solid} solid pixels`)
        else ok(`a dropped .ply loads (2,000 splats) and makes a ${solid}-pixel sprite`)
      }
      // A file that isn't a splat: an error shows, and the object on screen keeps its name
      await page.setInputFiles('input[type=file]', { name: 'junk.ply', mimeType: 'application/octet-stream', buffer: Buffer.from('not a splat at all') })
      const alert = await page.getByRole('alert').textContent({ timeout: 15000 }).catch(() => '')
      const stillBall = await page.getByRole('button', { name: 'ball' }).count()
      if (!alert.includes("didn't load")) fails.push(`bad file: no error shown (got "${alert}")`)
      else if (!stillBall) fails.push('bad file relabeled the loaded object')
      else ok('a bad file shows an error and keeps the loaded object and its name')
      await page.screenshot({ path: join(shots, 'splat-to-sprite-ply.png') })
      await ctx.close()
    },
  },
  {
    name: 'sprite-dark',
    about: 'dark preference before first paint, axe in dark',
    entries: ['src/splat-to-sprite/main.tsx'],
    files: ['experiments/splat-to-sprite/', 'src/shared/theme.css', 'public/theme.js'],
    async run({ shots, join, fails, ok, open, axe }) {
      const { page, ctx } = await open('/experiments/splat-to-sprite/', { colorScheme: 'dark', viewport: { width: 1280, height: 900 } })
      // Nothing stored: the page follows the system, so a dark preference gives the dark paper
      const paper = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      if (paper !== 'rgb(20, 22, 31)') fails.push(`dark preference gave a ${paper} page`)
      else ok('dark preference applied before first paint')
      await page.waitForTimeout(2500)
      await axe(page, 'dark')
      await page.screenshot({ path: join(shots, 'splat-to-sprite-dark.png') })
      await ctx.close()
    },
  },
]
