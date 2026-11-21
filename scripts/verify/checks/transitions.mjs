// Screen transitions on Diorama: the old scene's last picture gives way to the next.

export default [
  {
    name: 'diorama-transition',
    about: 'Diorama: changing scenes with a wipe lays the old picture over the new scene and wipes it away left to right; a cut lays nothing',
    entries: ['src/blobscape/PixelDiorama.tsx', 'src/blobscape/diorama/transitionOverlay.ts', 'src/splat-core/transition.ts'],
    async run({ shots, join, fails, ok, open }) {
      for (const kind of ['wipe', 'cut']) {
        const d = await open(`/experiments/pixel-diorama/?offscreen=1&scene=campfire&detail=chunky&transition=${kind}`, { viewport: { width: 1280, height: 900 } })
        const p = d.page
        await p.waitForFunction(() => window.__diorama, null, { timeout: 90000 }).catch(() => {})
        await p.evaluate(async () => { const s = window.__diorama.stage; window.__stageKept = s; await s.frame(0.5); await s.frame(0.6) })
        const first = await p.evaluate(() => window.__stageKept.time)
        await p.getByTestId('diorama-next').click()
        // the overlay at each moment: hidden, or how much of its left and right quarters is covered
        const look = () => p.evaluate(async () => {
          const s = window.__stageKept
          await s.frame(s.time + 0.08)
          const el = document.querySelector('[data-testid=diorama-transition]')
          if (!el || el.hidden) return null
          const t = document.createElement('canvas'); t.width = 64; t.height = 48
          const g = t.getContext('2d', { willReadFrequently: true }); g.drawImage(el, 0, 0, 64, 48)
          const px = g.getImageData(0, 0, 64, 48).data
          const share = (x0, x1) => { let n = 0, on = 0; for (let y = 0; y < 48; y++) for (let x = x0; x < x1; x++) { n++; if (px[(y * 64 + x) * 4 + 3] > 128) on++ } return on / n }
          return { left: share(0, 16), right: share(48, 64) }
        })
        const seen = []
        let ended = false
        const until = Date.now() + 300000
        while (Date.now() < until) {
          const o = await look()
          if (o) seen.push(o)
          else if (seen.length) { ended = true; break }
          if (kind === 'cut' && await p.evaluate(() => window.__stageKept.time) > first + 1.6) break
          await p.waitForTimeout(40)
        }
        if (kind === 'cut') {
          if (seen.length) fails.push(`blobscape diorama transition: a cut laid an overlay ${JSON.stringify(seen.slice(0, 3))}`)
          else ok('blobscape diorama transition: a cut lays nothing over the view')
          continue
        }
        const whole = seen.some((o) => o.left > 0.95 && o.right > 0.95)
        const wiping = seen.some((o) => o.left < 0.05 && o.right > 0.95)
        if (whole && wiping && ended) ok(`blobscape diorama transition: the wipe covered the view with the old picture, cleared it left to right and went (${seen.length} looks)`)
        else fails.push(`blobscape diorama transition: wipe ${JSON.stringify({ whole, wiping, ended, looks: seen.length, some: seen.filter((_, i) => i % Math.max(1, Math.floor(seen.length / 6)) === 0) })}`)
        await p.screenshot({ path: join(shots, 'blobscape-diorama-transition.png') })
      }
    },
  },
]
