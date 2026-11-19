// Scene Creator (epic #329): the workspace that opens a scene split into a land and props.

export default [
  {
    name: 'scene-creator',
    about: 'Scene Creator: the windmill opens split into its hill and ten props, cut in a worker and drawn; a scene that cannot be split opens whole and says why; a bare land opens alone; unlisted',
    entries: ['src/blobscape/SceneCreator.tsx'],
    async run({ shots, join, fails, ok, open, axe }) {
      const c = await open('/scene-creator/?offscreen=1', { viewport: { width: 1280, height: 900 } })
      const ready = () => c.page.waitForFunction(() => window.__creator?.ready(), null, { timeout: 180000 }).then(() => true, () => false)
      // how much of the picture is scene, not sky: the windmill's greens and the mill's grays
      const drawn = () => c.page.evaluate(async () => {
        const s = window.__creator.stage
        await s.frame(1); await s.frame(1)
        const cv = document.querySelector('[data-testid=creator-view]')
        const t = document.createElement('canvas'); t.width = 160; t.height = 120
        const g = t.getContext('2d', { willReadFrequently: true }); g.drawImage(cv, 0, 0, 160, 120)
        const px = g.getImageData(0, 0, 160, 120).data
        let green = 0
        for (let i = 0; i < px.length; i += 4) if (px[i + 1] > px[i] + 20 && px[i + 1] > px[i + 2] + 10) green++
        return green
      })
      {
        const up = await ready()
        const items = await c.page.evaluate(() => window.__creator?.items() ?? [])
        const props = items.filter((i) => i.kind === 'prop').length
        const green = up ? await drawn() : 0
        const counted = await c.page.getByTestId('creator-prop-count').innerText().catch(() => '')
        const listed = await c.page.locator('[data-testid=creator-items] li').count()
        const robots = await c.page.locator('meta[name=robots]').getAttribute('content').catch(() => null)
        await c.page.screenshot({ path: join(shots, 'blobscape-scene-creator.png') })
        if (!(up && items[0]?.kind === 'land' && props === 10 && counted === '10' && listed === 11 && green > 800 && robots === 'noindex')) fails.push(`blobscape scene creator: windmill ${JSON.stringify({ up, land: items[0], props, counted, listed, green, robots })}`)
        else ok(`blobscape scene creator: the windmill opens as its hill and ${props} props, listed beside the picture and drawn (${green} green pixels in 160 × 120); the page is noindex`)
        await axe(c.page, 'blobscape scene creator')
      }
      // a scene drawn by code opens whole and says so
      {
        const m = await open('/scene-creator/?offscreen=1&scene=meadow', { viewport: { width: 1280, height: 900 } })
        const up = await m.page.waitForFunction(() => window.__creator?.ready(), null, { timeout: 180000 }).then(() => true, () => false)
        const items = await m.page.evaluate(() => window.__creator?.items() ?? [])
        const note = await m.page.getByTestId('creator-whole-note').innerText().catch(() => '')
        if (!(up && items.length === 1 && items[0].kind === 'scene' && /code/.test(note))) fails.push(`blobscape scene creator: meadow ${JSON.stringify({ up, items, note })}`)
        else ok('blobscape scene creator: the fox meadow opens whole and says it is drawn by code')
      }
      // a bare land from its card: the land alone, and the address says which
      {
        await c.page.getByRole('button', { name: 'Round of turf' }).click()
        const up = await ready()
        const items = await c.page.evaluate(() => window.__creator?.items() ?? [])
        const address = await c.page.evaluate(() => location.search)
        if (!(up && items.length === 1 && items[0].kind === 'land' && /land=plain-turf/.test(address))) fails.push(`blobscape scene creator: bare land ${JSON.stringify({ up, items, address })}`)
        else ok('blobscape scene creator: a bare land opens by itself and the address keeps it')
      }
    },
  },
]
