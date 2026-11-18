// The site itself: prerendered pages, header, menu and theme, the Experiments list, old links.

export default [
  {
    name: 'site',
    core: true,
    about: 'prerendered HTML for every page, 404, sitemap, in-place navigation, theme, Experiments list and dates, old #/ links',
    entries: ['scripts/prerender.ts', 'src/blobscape/routes.ts', 'src/blobscape/meta.ts', 'src/blobscape/site.ts', 'src/blobscape/Landing.tsx', 'src/blobscape/Experiments.tsx', 'src/blobscape/Chrome.tsx', 'src/shared/SiteHeader.tsx', 'src/shared/Footer.tsx', 'src/shared/Logo.tsx', 'src/blobscape/engineCopy.ts', 'src/blobscape/specCopy.ts'],
    files: ['src/blobscape/App.tsx', 'src/blobscape/main.tsx', 'src/blobscape/ssr.tsx', 'index.html', 'public/theme.js'],
    async run({ base, join, fails, ok, open, axe, DESKTOP, PHONE }) {
      // Prerendered: each page's HTML carries its own title, canonical and content before any script runs
      for (const [path, title] of [['/', 'Blobscape: learn'], ['/lessons/', 'Lessons ·'], ['/lessons/order/', 'Order matters · Lesson 3'], ['/sandbox/', 'Sandbox ·'], ['/experiments/creature/', 'Splat Creatures ·'], ['/experiments/forest-walk/', 'Forest Walk ·'], ['/experiments/clockwork/', 'Clockwork ·'], ['/experiments/shape-shifter/', 'Shape Shifter ·'], ['/experiments/pixel-diorama/', 'Pixel Diorama ·'], ['/experiments/dungeon-run/', 'Dungeon Run ·'], ['/experiments/scan-studio/', 'Scan Studio ·'], ['/experiments/', 'Experiments ·'], ['/engine/', 'The Blobscape engine ·'], ['/engine/rigged-splats/', 'Rigged Gaussian splats in glTF ·']]) {
        const html = await (await fetch(base + path)).text()
        if (!html.includes(`<title>${title}`)) fails.push(`${path}: prerendered title is not "${title}…"`)
        else if (!html.includes(`<link rel="canonical" href="https://blobscape.dev${path}"`)) fails.push(`${path}: prerendered canonical is wrong`)
        else if (!/<main id="main"[^>]*>[\s\S]*<h1/.test(html)) fails.push(`${path}: prerendered page has no content`)
        else ok(`${path} is prerendered with its own title, canonical and content`)
      }
      // The page before any script runs is the page the app then shows: the heading and the first paragraph are the same
      // size in the same place (an experiment once started as a stand-in with bigger text, which jumped as the app took over)
      const placed = (page) => page.evaluate(() => ['main h1', 'main p'].map((q) => { const el = document.querySelector(q); const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height, parseFloat(getComputedStyle(el).fontSize)].map(Math.round) }))
      for (const path of ['/experiments/clockwork/', '/experiments/pixel-diorama/', '/sandbox/', '/lessons/one-blob/', '/lessons/']) {
        for (const [size, device] of [['desktop', DESKTOP], ['phone', PHONE]]) {
          const first = await open(path, { ...device, javaScriptEnabled: false })
          // scripts are off only to hold the app back: the notice for visitors without scripts is not part of anyone's first paint
          await first.page.evaluate(() => document.body.querySelectorAll('noscript').forEach((n) => n.remove()))
          const before = await placed(first.page)
          await first.ctx.close()
          // off-screen, as every check opens an engine page: headless Chromium can lose the GPU device presenting to a canvas
          const live = await open(`${path}?offscreen=1`, device)
          await live.page.waitForTimeout(800)
          const after = await placed(live.page)
          // closing a page whose engine is still starting drops its GPU device, which the page reports as errors: stop listening first
          live.page.removeAllListeners('console')
          live.page.removeAllListeners('pageerror')
          await live.ctx.close()
          if (JSON.stringify(before) !== JSON.stringify(after)) fails.push(`${path} (${size}): the heading and first paragraph are at ${JSON.stringify(before)} before the app starts and ${JSON.stringify(after)} after`)
          else ok(`${path} (${size}): the first paint has the heading and first paragraph where the app puts them`)
        }
      }
      const missing = await fetch(base + '/no-such-page/')
      if (missing.status !== 404 || !(await missing.text()).includes('noindex')) fails.push('an unknown page is not a noindex 404')
      else ok('unknown pages get the noindex 404 page')
      const sitemap = await (await fetch(base + '/sitemap.xml')).text()
      if (!sitemap.includes('https://blobscape.dev/lessons/model/') || !sitemap.includes('/experiments/fit-a-picture/') || !sitemap.includes('/experiments/creature/') || !sitemap.includes('/experiments/forest-walk/') || !sitemap.includes('/experiments/clockwork/') || !sitemap.includes('/experiments/shape-shifter/') || !sitemap.includes('/experiments/pixel-diorama/') || !sitemap.includes('/experiments/dungeon-run/') || !sitemap.includes('/experiments/scan-studio/')) fails.push('sitemap.xml is missing pages')
      else ok('sitemap.xml lists the lessons and tools')

      const { page, res, ctx } = await open('/')
      if (res.status() !== 200) fails.push(`front page status ${res.status()}`)
      const csp = res.headers()['content-security-policy'] ?? ''
      if (!csp.includes('wasm-unsafe-eval')) fails.push('test server is not sending the production CSP')
      if (!(await page.getByRole('banner').getByRole('link', { name: 'Blobscape home' }).count())) fails.push('no Blobscape logo link in the header')
      else ok('header has the Blobscape logo')
      for (const name of ['Fit a Picture', 'Splat to Sprite']) {
        if (!(await page.locator('main').getByRole('link', { name: new RegExp(name) }).count())) fails.push(`front page does not link to ${name}`)
      }
      // Links between pages swap the page in place: no reload, focus on the new heading
      await page.evaluate(() => { window.__stayed = true })
      await page.locator('main').getByRole('link', { name: /See all .* lessons/ }).click()
      await page.waitForURL('**/lessons/')
      await page.waitForFunction(() => document.title.startsWith('Lessons'), null, { timeout: 3000 }).catch(() => {})
      if (!(await page.evaluate(() => window.__stayed))) fails.push('following a link reloaded the page')
      else if ((await page.title()) !== 'Lessons · Blobscape') fails.push(`after navigating, the title is ${await page.title()}`)
      else ok('links between pages navigate in place and update the title')
      await page.goBack()
      await page.waitForURL(base + '/')
      if (!(await page.getByRole('heading', { level: 1, name: /Learn 3D splats/ }).count())) fails.push('Back did not return to the front page')
      else ok('Back returns to the front page')
      // The theme has its own button in the header: system, light or dark, stored under Blobscape's own key
      await page.getByTestId('theme-button').click()
      await page.getByRole('button', { name: /^dark$/i }).click()
      const picked = await page.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('blobscape-theme')])
      if (picked[0] !== 'dark' || picked[1] !== 'dark') fails.push(`theme choice gave ${picked.join(' / ')}`)
      else if ((await page.getByTestId('theme-button').getAttribute('aria-label')) !== 'Theme: dark') fails.push('the theme button does not say Dark is picked')
      else ok('the theme button sets and stores the theme')
      await page.waitForTimeout(600) // let color transitions (the tip button's) finish before measuring contrast
      await axe(page, 'front page, theme list open, dark')
      await page.getByRole('button', { name: /^system$/i }).click()
      if (await page.evaluate(() => document.documentElement.dataset.theme || localStorage.getItem('blobscape-theme'))) fails.push('System did not clear the theme')
      await ctx.close()

      // Experiments page: every experiment listed, reached from the header, which marks it current
      {
        const ex = await open('/lessons/')
        await ex.page.getByRole('banner').getByRole('link', { name: 'Experiments', exact: true }).click()
        await ex.page.waitForURL('**/experiments/')
        await ex.page.getByRole('heading', { level: 1, name: 'Experiments' }).waitFor({ timeout: 5000 }).catch(() => {})
        const cards = ex.page.locator('main').getByRole('link', { name: /Creature|Forest Walk|Fit a Picture|Splat to Sprite/ })
        if ((await cards.count()) < 4) fails.push('experiments page does not list every experiment')
        else if ((await ex.page.getByRole('banner').getByRole('link', { name: 'Experiments', exact: true }).getAttribute('aria-current')) !== 'page') fails.push('header does not mark Experiments as the current page')
        else ok('header Experiments link opens the experiments page, which lists every experiment')
        // listed like posts: each card dated, newest first, and the order can be turned round and is kept
        const listed = () => ex.page.locator('[data-testid=experiment-list] > li').evaluateAll((lis) => lis.map((li) => [li.querySelector('a').textContent.replace(' →', ''), li.querySelector('time')?.dateTime ?? '']))
        const newest = await listed()
        await ex.page.getByRole('button', { name: 'Oldest first' }).click()
        const oldest = await listed()
        await ex.page.reload()
        await ex.page.getByRole('button', { name: 'Oldest first', pressed: true }).waitFor({ timeout: 5000 }).catch(() => {})
        const kept = await listed()
        const sorted = newest.every((c, i) => /^\d{4}-\d\d-\d\d$/.test(c[1]) && (i === 0 || newest[i - 1][1] >= c[1]))
        if (newest.length < 8 || !sorted || JSON.stringify(oldest) !== JSON.stringify([...newest].reverse()) || JSON.stringify(kept) !== JSON.stringify(oldest)) fails.push(`experiments page dates: ${JSON.stringify({ newest, oldest: oldest.map((c) => c[0]), kept: kept.map((c) => c[0]) })}`)
        else ok(`experiments page: ${newest.length} dated cards, newest first (${newest[0][0]}, ${newest[0][1]}), and "Oldest first" turns the list round and is kept`)
        await ex.page.getByRole('button', { name: 'Newest first' }).click()
        // a filter by kind (issue #104): Games shows only the games, kept in the address, and All brings every card back
        await ex.page.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'Games' }).click()
        const games = (await listed()).map((c) => c[0])
        const gameUrl = new URL(ex.page.url()).searchParams.get('tag')
        await ex.page.goto(base + '/experiments/?tag=pixel')
        await ex.page.getByRole('button', { name: 'Pixel art', pressed: true }).waitFor({ timeout: 5000 }).catch(() => {})
        const pixel = (await listed()).map((c) => c[0])
        await ex.page.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'All' }).click()
        const all = await listed()
        if (JSON.stringify(games) !== JSON.stringify(['Wading Pond', 'Dungeon Run', 'Forest Walk']) || gameUrl !== 'game' || !pixel.includes('Pixel Diorama') || pixel.includes('Dungeon Run') || all.length !== newest.length) fails.push(`experiments page filter: ${JSON.stringify({ games, gameUrl, pixel, all: all.length })}`)
        else ok(`experiments page: Games shows ${games.join(' and ')}, ?tag=pixel opens on ${pixel.length} pixel-art experiments, All shows every one`)
        await axe(ex.page, 'experiments page')
        // an experiment's own page carries the dates too: drawn by the app, and in the HTML a crawler reads
        const html = await (await fetch(base + '/experiments/creature/')).text()
        await ex.page.goto(base + '/experiments/fit-a-picture/')
        const pageDates = await ex.page.getByTestId('page-dates').textContent({ timeout: 10000 }).catch(() => '')
        if (!/^Published [A-Z][a-z]{2} \d{1,2}, \d{4}( · Updated [A-Z][a-z]{2} \d{1,2}, \d{4})?$/.test(pageDates ?? '') || !/data-testid="page-dates">Published (?:<!-- -->)?<time date[tT]ime="\d{4}-\d\d-\d\d">/.test(html) || !/"datePublished":"\d{4}-\d\d-\d\d","dateModified":"\d{4}-\d\d-\d\d"/.test(html)) fails.push(`experiment page dates: the page reads "${pageDates}", or the prerendered HTML lacks them`)
        else ok(`an experiment's page says when it was published ("${pageDates}"), and its HTML carries published and updated dates`)
        await ex.ctx.close()
      }

      // A link to a section of the front page lands on that section
      const tools = await open('/#experiments')
      await tools.page.waitForTimeout(800)
      const top = await tools.page.evaluate(() => document.getElementById('experiments')?.getBoundingClientRect().top ?? -1)
      if (top < 0 || top > 200) fails.push(`/#experiments: the section is ${top}px down, not in view`)
      else ok('/#experiments opens at the experiments section')
      await tools.ctx.close()

      // Old #/ links (from mattblack.space/experiments/blobscape/#/…) land on the page they meant
      const old = await open('/#/lesson/order')
      await old.page.waitForTimeout(500)
      if (new URL(old.page.url()).pathname !== '/lessons/order/') fails.push(`#/lesson/order went to ${old.page.url()}`)
      else ok('an old #/lesson/ link lands on its lesson page')
      await old.ctx.close()
    },
  },
]
