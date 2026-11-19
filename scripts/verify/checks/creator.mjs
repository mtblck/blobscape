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
  {
    name: 'scene-creator-arrange',
    about: 'Scene Creator, Arrange: a prop picked by a tap and from the list, moved by a drag and by the arrow keys, turned by its handle and by brackets, copied and deleted, and each undone',
    entries: ['src/blobscape/SceneCreator.tsx', 'src/blobscape/creator/arrange.ts'],
    async run({ shots, join, fails, ok, open, axe }) {
      const c = await open('/scene-creator/?offscreen=1&detail=chunky', { viewport: { width: 1280, height: 900 } })
      const p = c.page
      const up = await p.waitForFunction(() => window.__creator?.ready(), null, { timeout: 180000 }).then(() => true, () => false)
      if (!up) { fails.push('blobscape scene creator arrange: the windmill never opened'); return }
      const frame = () => p.evaluate(async () => { const s = window.__creator.stage; await s.frame(1); await s.frame(1) })
      const props = () => p.evaluate(() => window.__creator.props())
      const view = await p.getByTestId('creator-view').boundingBox()
      const onView = async (i) => { const s = await p.evaluate((k) => window.__creator.screenOf(k), i); return s && { x: view.x + s.x, y: view.y + s.y } }
      await frame()
      const start = await props()
      const steps = []
      // a tap picks the windmill and opens Arrange
      const mill = await onView(0)
      await p.mouse.click(mill.x, mill.y)
      const picked = await p.evaluate(() => window.__creator.picked())
      const arrange = await p.getByTestId('creator-arrange').isVisible().catch(() => false)
      steps.push(['tap picks', picked === 0 && arrange])
      // a drag along the ground moves it
      await frame()
      const from = await onView(0)
      await p.mouse.move(from.x, from.y); await p.mouse.down()
      for (let k = 1; k <= 6; k++) await p.mouse.move(from.x + k * 12, from.y + k * 3)
      await p.mouse.up()
      const dragged = await props()
      steps.push(['drag moves', dragged[0].at[0] !== start[0].at[0] && dragged.length === start.length])
      // its handle turns it
      await frame()
      const handle = await p.getByTestId('creator-turn-handle').boundingBox()
      await p.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await p.mouse.down()
      for (let k = 1; k <= 6; k++) await p.mouse.move(handle.x + handle.width / 2 - k * 10, handle.y + handle.height / 2 + k * 4)
      await p.mouse.up()
      const handled = await props()
      steps.push(['handle turns', handled[0].turn !== dragged[0].turn])
      // keys: an arrow moves it, a bracket turns it
      await p.getByTestId('creator-view').focus()
      await p.keyboard.press('ArrowRight')
      const keyed = await props()
      await p.keyboard.press(']')
      const bracket = await props()
      steps.push(['arrow moves', keyed[0].at[0] !== handled[0].at[0]], ['bracket turns', bracket[0].turn !== keyed[0].turn])
      // copy, then delete the copy by its key
      await p.getByTestId('creator-copy').click()
      const copied = await props()
      await p.getByTestId('creator-view').focus()
      await p.keyboard.press('Delete')
      const deleted = await props()
      steps.push(['copy adds', copied.length === start.length + 1], ['delete removes', deleted.length === start.length])
      // the list picks too
      await p.getByRole('button', { name: 'Duck', exact: true }).first().click().catch(() => {})
      steps.push(['list picks', (await p.evaluate(() => window.__creator.picked())) === 4])
      await frame()
      await p.screenshot({ path: join(shots, 'blobscape-scene-creator-arrange.png') })
      await axe(p, 'blobscape scene creator arrange')
      // every step undone, by the button and by the keys, back to the windmill as it opened
      await p.getByTestId('creator-undo').click()
      steps.push(['undo brings the copy back', (await props()).length === start.length + 1])
      await p.getByTestId('creator-view').focus()
      for (let k = 0; k < 5; k++) await p.keyboard.press('Control+z')
      const undone = await props()
      steps.push(['all undone', JSON.stringify(undone) === JSON.stringify(start)])
      await p.keyboard.press('Control+Shift+z')
      steps.push(['redo', JSON.stringify((await props())[0].at) === JSON.stringify(dragged[0].at)])
      const said = await p.getByTestId('creator-status').innerText().catch(() => '')
      const bad = steps.filter(([, good]) => !good).map(([name]) => name)
      if (bad.length) fails.push(`blobscape scene creator arrange: ${bad.join(', ')} failed`)
      else ok(`blobscape scene creator arrange: picked by a tap and the list, moved, turned, copied and deleted by pointer and keys, every step undone and redone ("${said}")`)
    },
  },
  {
    name: 'scene-creator-props',
    about: 'Scene Creator, Props: the giant turkey found by search and added to the windmill hill, another prop dragged onto the view, the land swapped under them; the counts and the picture follow, and undo takes each back',
    entries: ['src/blobscape/SceneCreator.tsx', 'src/blobscape/creator/adding.ts', 'src/blobscape/creator/library.ts'],
    async run({ shots, join, fails, ok, open, axe }) {
      const c = await open('/scene-creator/?offscreen=1&detail=chunky&mode=props', { viewport: { width: 1280, height: 900 } })
      const p = c.page
      const ready = () => p.waitForFunction(() => window.__creator?.ready(), null, { timeout: 180000 }).then(() => true, () => false)
      if (!(await ready())) { fails.push('blobscape scene creator props: the windmill never opened'); return }
      // the picture, small, to tell whether it changed
      const picture = () => p.evaluate(async () => {
        const s = window.__creator.stage
        await s.frame(1); await s.frame(1)
        const t = document.createElement('canvas'); t.width = 96; t.height = 72
        const g = t.getContext('2d', { willReadFrequently: true }); g.drawImage(document.querySelector('[data-testid=creator-view]'), 0, 0, 96, 72)
        return Array.from(g.getImageData(0, 0, 96, 72).data)
      })
      const differ = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++; return n }
      const state = () => p.evaluate(() => ({ props: window.__creator.props(), land: window.__creator.land(), blobs: window.__creator.blobs(), picked: window.__creator.picked() }))
      const count = () => p.getByTestId('creator-prop-count').innerText().catch(() => '')
      const steps = []
      const start = await state(), first = await picture()
      // found by search and added in the middle of the view, picked
      await p.getByRole('searchbox', { name: 'Find a prop or land' }).fill('turkey')
      const shownCards = await p.locator('[data-testid^=creator-card-]').count()
      await p.getByTestId('creator-card-giant-turkey').click()
      await ready()
      const turkey = await state(), withTurkey = await picture()
      steps.push(['search finds it', shownCards === 1],
        ['turkey added', turkey.props.length === start.props.length + 1 && turkey.props.at(-1).prop === 'giant-turkey' && turkey.picked === start.props.length],
        ['count follows', (await count()) === String(start.props.length + 1) && turkey.blobs > start.blobs],
        ['picture follows', differ(first, withTurkey) > 40])
      await p.screenshot({ path: join(shots, 'blobscape-scene-creator-props.png') })
      await axe(p, 'blobscape scene creator props')
      // a card dragged onto the view lands where it is dropped
      await p.getByRole('searchbox', { name: 'Find a prop or land' }).fill('')
      const view = await p.getByTestId('creator-view').boundingBox()
      await p.getByTestId('creator-card-haystack').dragTo(p.getByTestId('creator-view'), { targetPosition: { x: view.width * 0.3, y: view.height * 0.6 } }).catch(() => {})
      await ready()
      const dropped = await state()
      steps.push(['drop adds', dropped.props.length === turkey.props.length + 1 && dropped.props.at(-1).prop === 'haystack'])
      // a land swaps what everything stands on; props keep their places across it
      await p.getByTestId('creator-card-plain-turf').click()
      await ready()
      const swapped = await state(), onTurf = await picture()
      steps.push(['land swaps', swapped.land === 'plain-turf' && swapped.props.length === dropped.props.length],
        ['props keep their places', swapped.props.every((x, i) => x.at[0] === dropped.props[i].at[0] && x.at[2] === dropped.props[i].at[2])],
        ['picture follows the land', differ(withTurkey, onTurf) > 200])
      await p.screenshot({ path: join(shots, 'blobscape-scene-creator-props-land.png') })
      // undo takes the land, the drop and the turkey back
      await p.getByTestId('creator-undo').click(); await p.getByTestId('creator-undo').click(); await p.getByTestId('creator-undo').click()
      await ready()
      const back = await state()
      steps.push(['undone', back.land === start.land && JSON.stringify(back.props) === JSON.stringify(start.props)])
      const room = await p.getByTestId('creator-room').innerText().catch(() => '')
      const bad = steps.filter(([, good]) => !good).map(([name]) => name)
      if (bad.length) fails.push(`blobscape scene creator props: ${bad.join(', ')} failed ${JSON.stringify({ start: start.props.length, turkey: turkey.props.length, dropped: dropped.props.length, land: swapped.land, room })}`)
      else ok(`blobscape scene creator props: the turkey found and added to the windmill hill, a haystack dropped on the view, the land swapped to turf, counts and picture following, and all undone ("${room}")`)
    },
  },
]
