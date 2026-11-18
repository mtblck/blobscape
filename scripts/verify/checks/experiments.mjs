// The engine experiments, each on its own page.

// the Pixel Diorama scenes written as descriptions, each checked as one part
const SCENES = [['bee', 'Forest bee'], ['campfire', 'Campfire'], ['croc', 'Garden crocodile'], ['dragon', 'Lava dragon'], ['grove', 'Lantern grove'], ['hand', 'Stone hand'], ['harvest', 'Pumpkin watch'], ['hut', 'Heron hut'], ['isles', 'Sky islands'], ['lab', 'Sprout lab'], ['octopus', 'Storm octopus'], ['owl', 'Owl and cauldron'], ['reef', 'Jellyfish reef'], ['snail', 'Snail house'], ['spider', 'Lantern spider'], ['window', 'Sunrise window'], ['windmill', 'Windmill']]

export default [
  {
    name: 'creature',
    core: true,
    about: 'Splat Creatures: draws, details, bones, every creature, monsters, sprite sheets, files',
    entries: ['src/blobscape/Creature.tsx'],
    async run({ root, shots, join, fails, ok, open, tabClick, axe }) {
      const c = await open('/experiments/creature/?offscreen=1', { viewport: { width: 1280, height: 900 } })
      if (!(await c.page.locator('[data-testid=creature-loading]').count())) fails.push('blobscape creature: no loading note while the engine starts')
      // the stage is there before the fox is: the view waits for the creature asked for to be cut
      await c.page.waitForFunction(() => window.__creature?.blobs() > 0, null, { timeout: 60000 }).catch(() => {})
      const orange = await c.page.evaluate(async () => {
        const cr = window.__creature
        if (!cr) return -1
        await cr.stage.frame(0.3)
        const cv = document.querySelector('[data-testid=creature-view]')
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
        let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] > 50 && d[i + 1] < 140 && d[i + 2] < 80) n++
        return n
      })
      if (orange < 2000) fails.push(`blobscape creature: ${orange} fox-orange pixels`)
      else ok(`blobscape creature: our engine draws the fox (${orange} orange pixels)`)
      await c.page.waitForTimeout(100)
      if (await c.page.locator('[data-testid=creature-loading]').count()) fails.push('blobscape creature: the loading note stays after the fox is drawn')
      else ok('blobscape creature: a loading note shows until the first frame, then goes')
      const sizes = await c.page.evaluate(() => ({ splats: window.__creature?.glb().byteLength, mesh: window.__creature?.mesh(48).byteLength }))
      if (!(sizes.splats > 100000 && sizes.mesh > 10000)) fails.push(`blobscape creature: files ${JSON.stringify(sizes)}`)
      else ok(`blobscape creature: writes splats (${Math.round(sizes.splats / 1024)} KB) and mesh (${Math.round(sizes.mesh / 1024)} KB) .glb`)
      // a new fox replaces the old one, freeing its GPU buffers, and still draws
      await tabClick(c.page.getByRole('button', { name: '5k', exact: true }))
      await c.page.waitForFunction(() => window.__creature?.blobs() < 6000, null, { timeout: 30000 }).catch(() => {})
      const again = await c.page.evaluate(async () => {
        await window.__creature.stage.frame(0.5)
        const cv = document.querySelector('[data-testid=creature-view]')
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
        let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] > 50 && d[i + 1] < 140 && d[i + 2] < 80) n++
        return { n, blobs: window.__creature.blobs() }
      })
      if (!(again.blobs < 6000 && again.n > 2000)) fails.push(`blobscape creature: after switching to 5k, ${JSON.stringify(again)}`)
      else ok(`blobscape creature: swaps to a ${again.blobs}-blob fox and draws it`)
      await c.page.screenshot({ path: join(shots, 'blobscape-creature-offscreen.png') })
      // pixels in the view that pass a test, after drawing `t` seconds into the clip
      const pixels = (t, kind) => c.page.evaluate(async ([t, kind]) => {
        await window.__creature.stage.frame(t)
        const cv = document.querySelector('[data-testid=creature-view]')
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
        const test = {
          fox: (r, g, b) => r > 150 && g > 50 && g < 140 && b < 80,
          bone: (r, g, b) => r > 190 && g > 190 && b > 195 && Math.abs(r - b) < 30,
          frog: (r, g, b) => g > 120 && g > r * 1.4 && b < 110,
          elf: (r, g, b) => g > 90 && g > r * 1.5 && g > b * 1.3,
          fire: (r, g, b) => r > 200 && g > 70 && g < 210 && b < 120,
          // a monster's colors come from its seed: anything bright and saturated
          colorful: (r, g, b) => Math.max(r, g, b) > 110 && Math.max(r, g, b) - Math.min(r, g, b) > 50,
        }[kind]
        let n = 0; for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i + 1], d[i + 2])) n++
        return n
      }, [t, kind])
      const FOX = 'fox', BONE = 'bone'
      // the bones view hides every blob and draws the rig
      await tabClick(c.page.getByRole('button', { name: 'Bones', exact: true }))
      await c.page.waitForTimeout(100)
      const bones = { fox: await pixels(0.5, FOX), bone: await pixels(0.5, BONE) }
      // the joints are coral, which reads as a little fox-orange; the fox itself is thousands
      if (!(bones.fox < 2000 && bones.bone > 300)) fails.push(`blobscape creature: bones view ${JSON.stringify(bones)}`)
      else ok(`blobscape creature: Bones hides the blobs and draws the rig (${bones.bone} bone pixels)`)
      await c.page.screenshot({ path: join(shots, 'blobscape-creature-bones.png') })
      await tabClick(c.page.getByRole('button', { name: 'Both', exact: true }))
      await c.page.waitForTimeout(100)
      const both = { fox: await pixels(0.5, FOX), bone: await pixels(0.5, BONE) }
      if (!(both.fox > 1000 && both.bone > 300)) fails.push(`blobscape creature: both view ${JSON.stringify(both)}`)
      else ok('blobscape creature: Both draws the bones over the blobs')
      await tabClick(c.page.getByRole('button', { name: 'Blobs', exact: true }))
      // every other creature builds, draws, and has its own clips
      for (const [name, bonesWanted, color, clip, t] of [
        // the three taken from the pixel scenes come first on the page
        ['Crocodile', 27, 'colorful', 'Walk', 0.5],
        ['Jellyfish', 26, 'colorful', 'Swim', 0.5],
        ['Owl', 8, 'colorful', 'Walk', 0.4],
        ['Frog', 20, 'frog', 'Tongue', 1.15],
        ['Elf', 29, 'elf', 'Wave', 1],
        ['Dragon', 43, 'fire', 'Breathe fire', 2],
      ]) {
        await tabClick(c.page.getByRole('button', { name, exact: true }))
        await c.page.waitForFunction((n) => window.__creature?.bones() === n && !document.querySelector('[data-testid=creature-loading]'), bonesWanted, { timeout: 60000 }).catch(() => {})
        // the Sprites panel has a chip per move too: pick the one that plays it
        await tabClick(c.page.getByRole('region', { name: 'Options' }).getByRole('button', { name: clip, exact: true }))
        await c.page.waitForTimeout(150)
        const got = { bones: await c.page.evaluate(() => window.__creature?.bones()), n: await pixels(t, color), url: new URL(c.page.url()).searchParams.get('creature') }
        if (!(got.bones === bonesWanted && got.n > 1500 && got.url === name.toLowerCase())) fails.push(`blobscape creature: ${name} ${JSON.stringify(got)}`)
        else ok(`blobscape creature: the ${name.toLowerCase()} draws on ${got.bones} bones, playing ${clip.toLowerCase()} (${got.n} pixels of its color)`)
        await c.page.screenshot({ path: join(shots, `blobscape-creature-${name.toLowerCase()}.png`) })
      }
      // the dragon's flame is bones that grow: it leaves in the file as scale keys, and comes back
      const fire = await c.page.evaluate(() => {
        const bytes = window.__creature.glb()
        const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true)
        const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)))
        const anim = json.animations.find((a) => a.name === 'fire')
        return { scales: anim?.channels.filter((ch) => ch.target.path === 'scale').length, kb: Math.round(bytes.byteLength / 1024) }
      })
      // the dragon's other looks: ember is red, not ice blue
      await tabClick(c.page.getByRole('button', { name: 'Ember', exact: true }))
      await c.page.waitForTimeout(300)
      await c.page.waitForFunction(() => !document.querySelector('[data-testid=creature-loading]'), null, { timeout: 60000 }).catch(() => {})
      const ember = await c.page.evaluate(async () => {
        await window.__creature.stage.frame(0.5)
        const cv = document.querySelector('[data-testid=creature-view]')
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
        let red = 0, ice = 0
        for (let i = 0; i < d.length; i += 4) { if (d[i] > 120 && d[i] > d[i + 2] * 1.8 && d[i] > d[i + 1] * 1.6) red++; if (d[i + 2] > 150 && d[i + 2] > d[i] * 1.4) ice++ }
        return { red, ice }
      })
      if (!(ember.red > 2000 && ember.red > ember.ice)) fails.push(`blobscape creature: ember dragon ${JSON.stringify(ember)}`)
      else ok(`blobscape creature: the ember dragon is red (${ember.red} red, ${ember.ice} ice-blue pixels)`)
      await c.page.screenshot({ path: join(shots, 'blobscape-creature-ember.png') })
      if (fire.scales !== 6) fails.push(`blobscape creature: dragon file ${JSON.stringify(fire)}`)
      else ok(`blobscape creature: the dragon's .glb keys its fire as scale on six bones (${fire.kb} KB)`)
      // the Sprites panel: the frog's tongue flick and its still pose from 8 sides, as 32 px pixel art
      await tabClick(c.page.getByRole('button', { name: 'Frog', exact: true }))
      await c.page.waitForFunction(() => window.__creature?.bones() === 20 && !document.querySelector('[data-testid=creature-loading]'), null, { timeout: 60000 }).catch(() => {})
      const sheet = await c.page.evaluate(() => window.__sprites({ moves: ['tongue', 'still'], directions: 8, size: 32, frames: 6, colors: 16, outline: true }))
      const tongueLeft = Math.max(...sheet.solid.slice(12, 18)), stillLeft = sheet.solid[50]
      if (sheet.cols !== 6 || sheet.rows !== 16 || sheet.solid.length !== 56 || sheet.solid.some((k) => k < 20)) fails.push(`blobscape creature sprites: ${JSON.stringify({ ...sheet, solid: sheet.solid.slice(0, 8) })}`)
      else if (!(tongueLeft > stillLeft * 1.05)) fails.push(`blobscape creature sprites: the tongue doesn't show from the side (${tongueLeft} vs ${stillLeft} solid pixels)`)
      else ok(`blobscape creature sprites: 16 rows of the frog from 8 sides, every frame drawn, tongue out from the side (${tongueLeft} vs ${stillLeft} solid pixels)`)
      await c.page.locator('[data-testid=sprites] img').waitFor({ timeout: 10000 }).catch(() => {})
      if (!(await c.page.locator('[data-testid=sprites] img').count())) fails.push('blobscape creature sprites: no sheet preview')
      // the live view comes back after drawing the sheet
      const after = await pixels(0.4, 'frog')
      if (after < 1500) fails.push(`blobscape creature sprites: the view is empty after drawing a sheet (${after} frog pixels)`)
      else ok('blobscape creature sprites: the live view comes back after the sheet')
      await c.page.locator('[data-testid=sprites]').screenshot({ path: join(shots, 'blobscape-creature-sprites.png') })
      // Make me a monster: a new creature from a seed, in the address so the link makes it again, with its own sprite sheet
      // a monster's colors come from its seed, and a dark one has few bright pixels: one that moves is drawn whatever its colors
      const moved = (t1, t2) => c.page.evaluate(async ([t1, t2]) => {
        const grab = async (t) => { await window.__creature.stage.frame(t); const cv = document.querySelector('[data-testid=creature-view]'); return cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data }
        const a = await grab(t1), b = await grab(t2)
        let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 48) n++
        return n
      }, [t1, t2])
      const monster = async () => {
        await c.page.waitForFunction(() => new URL(location.href).searchParams.get('creature') === 'monster' && !document.querySelector('[data-testid=creature-loading]'), null, { timeout: 30000 }).catch(() => {})
        await c.page.waitForTimeout(200)
        return { seed: new URL(c.page.url()).searchParams.get('seed'), bones: await c.page.evaluate(() => window.__creature?.bones()), n: await pixels(0.3, 'colorful'), moved: await moved(0.3, 0.9), label: await c.page.getByTestId('make-monster').textContent(), note: await c.page.getByTestId('creature-note').textContent() }
      }
      await tabClick(c.page.getByTestId('species').getByRole('button', { name: 'Monster', exact: true }))
      const m1 = await monster()
      await tabClick(c.page.getByTestId('make-monster'))
      await c.page.waitForFunction((s) => new URL(location.href).searchParams.get('seed') !== s, m1.seed, { timeout: 10000 }).catch(() => {})
      // the address changes at once and the new monster is cut a moment later: its note is what says it is on show
      await c.page.waitForFunction((n) => (document.querySelector('[data-testid=creature-note]')?.textContent ?? '') !== n, m1.note, { timeout: 30000 }).catch(() => {})
      const m2 = await monster()
      if (!(m1.seed && m2.seed && m1.seed !== m2.seed && m1.bones >= 14 && (m1.n > 1500 || m1.moved > 400) && (m2.n > 1500 || m2.moved > 400) && m2.label === 'Generate a new monster' && /^Made a .*legged/.test(m2.note))) fails.push(`blobscape creature monster: ${JSON.stringify({ m1, m2 })}`)
      else ok(`blobscape creature monster: seeds ${m1.seed} and ${m2.seed} make two monsters (${m1.bones} and ${m2.bones} bones) that draw`)
      await c.page.screenshot({ path: join(shots, 'blobscape-creature-monster.png') })
      const mSheet = await c.page.evaluate(() => window.__sprites({ moves: ['walk', 'roar'], directions: 4, size: 32, frames: 6, colors: 16, outline: true }))
      if (mSheet.rows !== 8 || mSheet.solid.some((k) => k < 20)) fails.push(`blobscape creature monster sprites: ${JSON.stringify({ ...mSheet, solid: mSheet.solid.slice(0, 8) })}`)
      else ok('blobscape creature monster sprites: the monster walks and roars from 4 sides as a sheet')
      // the address makes the same monster again
      const relink = await open(`/experiments/creature/?offscreen=1&creature=monster&seed=${m2.seed}`, { viewport: { width: 1280, height: 900 } })
      await relink.page.waitForFunction(() => window.__creature?.bones() > 0, null, { timeout: 60000 }) // off-screen, the waiting mark stays until a frame is drawn.catch(() => {})
      const same = { bones: await relink.page.evaluate(() => window.__creature?.bones()), seed: new URL(relink.page.url()).searchParams.get('seed') }
      if (same.bones !== m2.bones || same.seed !== m2.seed) fails.push(`blobscape creature monster link: ${JSON.stringify(same)} vs ${JSON.stringify(m2)}`)
      else ok(`blobscape creature monster: the link with seed ${m2.seed} opens the same monster`)
      await relink.ctx.close()
      // a file with morphs: the sample pufferfish opens, its puff clip swells it, Still hands the morphs to sliders,
      // a sprite sheet draws the swelling, and the file written back keeps its morph targets
      await tabClick(c.page.getByRole('button', { name: 'Fox', exact: true }))
      // until the fox itself is in view: just after the click the last creature still is, with no loading mark yet
      await c.page.waitForFunction(() => window.__creature?.stage.actor?.skeleton.bones.some((b) => b.name === 'tail2') && !document.querySelector('[data-testid=creature-loading]'), null, { timeout: 60000 }).catch(() => {})
      // the fox's tail swings after the trot (on by default), and the switch puts it back on the clip
      const tailAt = () => c.page.evaluate(async () => {
        const st = window.__creature.stage, sk = st.actor.skeleton, b = sk.index('tail2')
        for (let f = 0; f <= 30; f++) await st.frame(f / 30)
        return Array.from(sk.rotation.slice(b * 4, b * 4 + 4))
      })
      const swingSwitch = c.page.getByRole('checkbox', { name: 'Swing the tail as it moves' })
      const swung = await tailAt()
      await tabClick(swingSwitch)
      const clipped = await tailAt()
      await tabClick(swingSwitch)
      const tailOff = Math.max(...swung.map((v, i) => Math.abs(v - clipped[i])))
      if (!(tailOff > 0.01 && swung.every(Number.isFinite))) fails.push(`blobscape creature swing: the fox's tail ${JSON.stringify({ swung, clipped })}`)
      else ok(`blobscape creature swing: the fox's tail swings after the trot (${tailOff.toFixed(3)} off the clip) and the switch turns it off`)
      await c.page.setInputFiles('input[type=file]', join(root, 'public/rigged-splats/puffer.glb'))
      await c.page.waitForFunction(() => window.__creature?.blobs() === 5257, null, { timeout: 30000 }).catch(() => {})
      const fish = (t) => c.page.evaluate(async (t) => {
        await window.__creature.stage.frame(t)
        const cv = document.querySelector('[data-testid=creature-view]')
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128 && d[i] > 150 && d[i + 1] > 100 && d[i + 2] < 150) n++
        return n
      }, t)
      await tabClick(c.page.getByRole('region', { name: 'Options' }).getByRole('button', { name: 'puff', exact: true }))
      const puff = { rest: await fish(0), full: await fish(1.5) }
      await c.page.screenshot({ path: join(shots, 'blobscape-creature-puffer.png') })
      await tabClick(c.page.getByRole('region', { name: 'Options' }).getByRole('button', { name: 'Still', exact: true }))
      const still = await fish(0)
      await c.page.getByRole('slider', { name: 'Puff' }).fill('1')
      await c.page.waitForTimeout(150)
      const slid = await fish(0)
      // the GPU morph pass gives the same centers and shapes as the CPU's applyMorphs
      const morphChk = await c.page.evaluate(async () => { const st = window.__creature.stage; return st.backend === 'webgpu' ? st.world.checkAgainstCPU(st.renderer) : null })
      const fishSheet = await c.page.evaluate(() => window.__sprites({ moves: ['puff'], directions: 4, size: 32, frames: 6, colors: 16, outline: true }))
      const kept = await c.page.evaluate(() => {
        const b = window.__creature.glb(), len = new DataView(b.buffer, b.byteOffset).getUint32(12, true)
        const j = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + len)))
        return j.meshes[0].primitives[0].targets?.length
      })
      const note = await c.page.getByTestId('creature-note').textContent()
      // the puff peaks at the clip's middle frame; the side view's first row holds frames 0..5
      const swells = Math.max(...fishSheet.solid.slice(2, 4)) > fishSheet.solid[0] * 1.3
      if (!(/4 morphs/.test(note) && puff.full > puff.rest * 1.5 && slid > still * 1.5 && kept === 4 && swells && (!morphChk || (morphChk.center < 1e-3 && morphChk.cov < morphChk.covScale * 0.01)))) fails.push(`blobscape creature morphs: ${JSON.stringify({ note, puff, still, slid, kept, morphChk, solid: fishSheet.solid.slice(0, 6) })}`)
      else ok(`blobscape creature morphs: the pufferfish file swells from its clip (${puff.rest} → ${puff.full} pixels) and its slider, draws as a sheet and keeps its 4 morph targets${morphChk ? ', GPU morphs match the CPU' : ''}`)
      await axe(c.page, 'blobscape creature sprites')
      await c.ctx.close()
    },
  },
  {
    name: 'diorama',
    core: true,
    about: 'Pixel Diorama on WebGPU and WebGL: pixel art in palette, the GPU pass matches its CPU twin, motion, steady pixels, layout',
    entries: ['src/blobscape/PixelDiorama.tsx'],
    async run({ shots, join, fails, ok, open, tabClick, axe }) {
      for (const q of ['', '&webgl=1']) {
        const d = await open(`/experiments/pixel-diorama/?offscreen=1${q}`, { viewport: { width: 1280, height: 900 } })
        await d.page.waitForFunction(() => window.__diorama, null, { timeout: 90000 }).catch(() => {})
        const shot = (t) => d.page.evaluate(async (t) => {
          const { stage, look } = window.__diorama
          await stage.frame(t)
          const f = await stage.pixelFrames()
          const pal = new Set([...look().palette, look().outline].map((c) => (c[0] << 16) | (c[1] << 8) | c[2]))
          let solid = 0, off = 0, soft = 0
          for (let i = 0; i < f.art.data.length; i += 4) {
            const a = f.art.data[i + 3]
            if (a !== 0 && a !== 255) soft++
            if (!a) continue
            solid++
            if (!pal.has((f.art.data[i] << 16) | (f.art.data[i + 1] << 8) | f.art.data[i + 2])) off++
          }
          return { backend: stage.backend, w: f.art.width, h: f.art.height, solid, off, soft, small: Array.from(f.small.data), art: Array.from(f.art.data), before: f.before && Array.from(f.before.data), parts: f.parts && Array.from(f.parts.data), fine: f.fine && { small: Array.from(f.fine.small.data), parts: Array.from(f.fine.parts.data) }, look: look() }
        }, t)
        const a = await shot(2), b = await shot(5)
        // the same frame through the CPU twin (the page's own module isn't reachable from a production build, so it runs here)
        const { pixelArt, resolveFine } = await import('../../../src/splat-core/pixel.ts')
        const frame = (data) => data && { width: a.w, height: a.h, data: Uint8ClampedArray.from(data) }
        // four samples a pixel: the pass settled each pixel from its 2×2 samples as the twin does (a near tie between two samples can fall either way after rounding)
        if (!a.look.fine || !a.fine) fails.push(`${`blobscape pixel diorama (${a.backend})`}: four samples a pixel is not on`)
        else {
          const big = (data) => ({ width: a.w * 2, height: a.h * 2, data: Uint8ClampedArray.from(data) })
          const settled = resolveFine(big(a.fine.small), big(a.fine.parts))
          let solid = 0, cover = 0, tone = 0, part = 0
          for (let i = 0; i < settled.small.data.length; i += 4) {
            if (settled.small.data[i + 3] >= 128) solid++
            if ((settled.small.data[i + 3] >= 128) !== (a.small[i + 3] >= 128)) cover++
            else if (Math.abs(settled.small.data[i] - a.small[i]) + Math.abs(settled.small.data[i + 1] - a.small[i + 1]) + Math.abs(settled.small.data[i + 2] - a.small[i + 2]) > 6) tone++
            if (settled.parts.data[i] !== a.parts[i] || settled.parts.data[i + 1] !== a.parts[i + 1] || settled.parts.data[i + 2] !== a.parts[i + 2] || settled.parts.data[i + 3] !== a.parts[i + 3]) part++
          }
          if (!(solid > 3000 && cover === 0 && part === 0 && tone < solid * 0.02)) fails.push(`blobscape pixel diorama (${a.backend}): four samples a pixel differs from its twin: ${JSON.stringify({ solid, cover, part, tone })}`)
          else ok(`blobscape pixel diorama (${a.backend}): four samples a pixel: ${solid} pixels settled as the CPU twin settles them (which thing shows: all; which sample: all but ${tone})`)
        }
        const want = pixelArt(frame(a.small), a.look, frame(a.before), frame(a.parts))
        let alpha = 0, color = 0, moved = 0
        for (let i = 0; i < want.data.length; i += 4) {
          if (want.data[i + 3] !== a.art[i + 3]) alpha++
          else if (Math.abs(want.data[i] - a.art[i]) + Math.abs(want.data[i + 1] - a.art[i + 1]) + Math.abs(want.data[i + 2] - a.art[i + 2]) > 6) color++
          if (a.art[i] !== b.art[i] || a.art[i + 1] !== b.art[i + 1] || a.art[i + 3] !== b.art[i + 3]) moved++
        }
        const label = `blobscape pixel diorama (${a.backend})`
        if ((q ? 'webgl' : 'webgpu') !== a.backend) fails.push(`${label}: wanted the ${q ? 'webgl' : 'webgpu'} backend`)
        if (!(a.solid > 3000 && a.off === 0 && a.soft === 0)) fails.push(`${label}: ${JSON.stringify({ solid: a.solid, offPalette: a.off, soft: a.soft })}`)
        else ok(`${label}: ${a.w}×${a.h} art, ${a.solid} solid pixels, every one a palette color, none half transparent`)
        // dither sits pixels on the line between two colors, where 8-bit rounding can tip them either way
        if (!(alpha === 0 && color < a.solid * 0.05)) fails.push(`${label}: the pixel pass and its CPU twin differ (${alpha} in shape, ${color} of ${a.solid} in color)`)
        else ok(`${label}: the pixel pass matches its CPU twin (same shape, ${color} of ${a.solid} pixels a neighboring color)`)
        // lines between parts: the pass drew a map of the scene's parts beside the picture, and the lines it adds are the ones the twin adds
        {
          const none = pixelArt(frame(a.small), { ...a.look, parts: false }, frame(a.before))
          const ids = new Set()
          let lines = 0
          for (let i = 0; i < want.data.length; i += 4) {
            if (a.parts?.[i + 3]) ids.add(a.parts[i] | (a.parts[i + 1] << 8) | (a.parts[i + 2] << 16))
            if (want.data[i] !== none.data[i] || want.data[i + 1] !== none.data[i + 1] || want.data[i + 2] !== none.data[i + 2]) lines++
          }
          if (!(a.look.parts && ids.size > 20 && lines > 200)) fails.push(`${label}: lines between parts: ${JSON.stringify({ on: a.look.parts, parts: ids.size, lines })}`)
          else ok(`${label}: lines between parts: a map of ${ids.size} parts, ${lines} pixels of line that color alone would not draw`)
        }
        // lone pixels: the pass cleaned some up, and (above) the same ones its twin does
      {
        const untidy = pixelArt(frame(a.small), { ...a.look, tidy: false }, frame(a.before), frame(a.parts))
        let cleaned = 0
        for (let i = 0; i < want.data.length; i += 4) if (want.data[i] !== untidy.data[i] || want.data[i + 1] !== untidy.data[i + 1] || want.data[i + 2] !== untidy.data[i + 2]) cleaned++
        if (!(a.look.tidy && cleaned > 0 && cleaned < a.solid * 0.05)) fails.push(`${label}: lone-pixel cleanup: ${JSON.stringify({ on: a.look.tidy, cleaned })}`)
        else ok(`${label}: lone-pixel cleanup took ${cleaned} stray pixels`)
      }
      if (!(moved > 150)) fails.push(`${label}: only ${moved} pixels change in a few seconds`)
        else ok(`${label}: ${moved} pixels change in a few seconds`)
        // steady pixels: the frame after is drawn against this one, as the CPU twin does given the same two; and fewer pixels flip there and back than with it off
        {
          const c = await shot(5 + 1 / 60)
          const again = pixelArt(frame(c.small), c.look, frame(c.before), frame(c.parts))
          let held = 0, differ = 0
          const plain = pixelArt(frame(c.small), { ...c.look, steady: 0 }, undefined, frame(c.parts))
          for (let i = 0; i < again.data.length; i += 4) {
            if (Math.abs(again.data[i] - c.art[i]) + Math.abs(again.data[i + 1] - c.art[i + 1]) + Math.abs(again.data[i + 2] - c.art[i + 2]) > 6 || again.data[i + 3] !== c.art[i + 3]) differ++
            if (plain.data[i] !== again.data[i] || plain.data[i + 1] !== again.data[i + 1] || plain.data[i + 2] !== again.data[i + 2]) held++
          }
          if (!(c.look.steady > 0 && c.before && differ < a.solid * 0.05 && held > 20)) fails.push(`${label}: steady pixels: ${JSON.stringify({ steady: c.look.steady, before: !!c.before, differ, held })}`)
          else ok(`${label}: steady pixels: drawn against the frame before as the CPU twin is (${differ} pixels a neighboring color), ${held} pixels keep their color that would have flipped`)
        }
        // Exact sort: the stage swaps in the radix sort and the art still draws, every pixel a palette color
        {
          await tabClick(d.page.getByLabel('Exact sort (slower)'))
          await d.page.waitForFunction(() => window.__diorama.stage.world?.sortKind === 'radix', null, { timeout: 30000 }).catch(() => {})
          const ex = await shot(2)
          const sort = await d.page.evaluate(() => window.__diorama.stage.world?.sortKind)
          await tabClick(d.page.getByLabel('Exact sort (slower)'))
          await d.page.waitForFunction(() => window.__diorama.stage.world?.sortKind === 'bins', null, { timeout: 30000 }).catch(() => {})
          if (!(sort === 'radix' && ex.solid > a.solid * 0.9 && ex.off === 0)) fails.push(`${label}: exact sort: ${JSON.stringify({ sort, solid: ex.solid, before: a.solid, off: ex.off })}`)
          else ok(`${label}: Exact sort draws on the radix sort (${ex.solid} solid pixels, ${a.solid} before)`)
        }
        // held frames: with a step, the scene only moves on every step, so two moments inside one step are one picture
        {
          const held = await d.page.evaluate(async () => {
            const { stage } = window.__diorama
            const grab = async (t) => { await stage.frame(t); return (await stage.pixelFrames()).art.data }
            stage.step = 1 / 8
            const x = await grab(3.01), y = await grab(3.1), z = await grab(3.26)
            const at = stage.time
            stage.step = 0
            const differ = (p, q) => { let n = 0; for (let i = 0; i < p.length; i += 4) if (p[i] !== q[i] || p[i + 1] !== q[i + 1] || p[i + 2] !== q[i + 2]) n++; return n }
            return { same: differ(x, y), next: differ(x, z), at }
          })
          if (!(held.same === 0 && held.next > 20 && Math.abs(held.at - 3.25) < 1e-6)) fails.push(`${label}: held frames: ${JSON.stringify(held)}`)
          else ok(`${label}: held frames: two moments inside one eighth of a second are the same picture, the next eighth moves ${held.next} pixels`)
        }
        // the same moment drawn twice is the same picture: blobs at one depth keep one order, so edges (a window in its frame) do not flicker
        const twice = await d.page.evaluate(async () => {
          const { stage } = window.__diorama
          const grab = async () => { await stage.frame(2); return (await stage.pixelFrames()).small.data }
          const x = await grab(), y = await grab()
          let n = 0
          for (let i = 0; i < x.length; i += 4) if (x[i] !== y[i] || x[i + 1] !== y[i + 1] || x[i + 2] !== y[i + 2]) n++
          return n
        })
        if (twice > 40) fails.push(`${label}: one moment drawn twice differs in ${twice} pixels (blobs at one depth are changing order)`)
        else ok(`${label}: one moment drawn twice is the same picture (${twice} pixels differ)`)
        if (!q) {
          // pixels off: the same scene as blobs, in far more colors
          await tabClick(d.page.getByRole('button', { name: 'Blobs', exact: true }))
          await d.page.waitForFunction(() => !window.__diorama.stage.artSize)
          const colors = await d.page.evaluate(async () => {
            await window.__diorama.stage.frame(2)
            const cv = document.querySelector('[data-testid=diorama-view]')
            const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
            const s = new Set()
            for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 200) s.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2])
            return s.size
          })
          if (!(colors > 500)) fails.push(`${label}: as blobs it shows only ${colors} colors`)
          else ok(`${label}: with pixels off it draws the blobs (${colors} colors)`)
          await tabClick(d.page.getByRole('button', { name: 'Pixel art', exact: true }))
          // offscreen draws only when asked: draw until pixel mode is back on
          await d.page.waitForFunction(async () => { await window.__diorama.stage.frame(4.5); return !!window.__diorama.stage.artSize })
          await d.page.screenshot({ path: join(shots, 'blobscape-pixel-diorama.png') })
          await axe(d.page, 'blobscape pixel diorama')
          // the shared layout: options in tabs beside the preview, which stays in sight on scroll and can fill the screen
          const tabNames = await d.page.getByRole('tab').allTextContents()
          await d.page.getByRole('tab', { name: 'Finish' }).click()
          const finishShown = await d.page.getByRole('button', { name: 'Save this frame' }).isVisible()
          await d.page.setViewportSize({ width: 390, height: 700 })
          await d.page.evaluate(() => window.scrollTo(0, 500))
          const stuck = await d.page.getByTestId('diorama-view').evaluate((c) => { const r = c.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.height > 200 })
          await d.page.getByTestId('full-screen').click()
          const filled = await d.page.waitForFunction(() => { const c = document.querySelector('[data-testid=diorama-view]'); return !!document.querySelector('[data-full]') && c.clientWidth >= innerWidth - 2 && c.clientHeight > innerHeight * 0.8 }, null, { timeout: 5000 }).then(() => true, () => false)
          await d.page.getByTestId('full-screen').click()
          const back = await d.page.waitForFunction(() => !document.querySelector('[data-full]'), null, { timeout: 5000 }).then(() => true, () => false)
          if (tabNames.join() !== 'Scene,Pixels,Finish' || !finishShown || !stuck || !filled || !back) fails.push(`${label} layout: ${JSON.stringify({ tabNames, finishShown, stuck, filled, back })}`)
          else ok(`${label} layout: options in ${tabNames.length} tabs, the preview stays in sight on a phone as the page scrolls, and it fills the screen and comes back`)
        }
        await d.ctx.close()
      }
    },
  },
  {
    name: 'diorama-picker',
    about: "Pixel Diorama: details dialog, How it's made, picking a scene swaps the palette on arrival, the gallery of loops, opening a description",
    entries: ['src/blobscape/PixelDiorama.tsx'],
    files: ['public/loops/'],
    async run({ shots, join, fails, ok, open, axe }) {
      const d = await open('/experiments/pixel-diorama/?offscreen=1&scene=campfire', { viewport: { width: 1280, height: 900 } })
      await d.page.waitForFunction(() => window.__diorama, null, { timeout: 90000 }).catch(() => {})
      // the details panel: one short line under the view, and Full details opens a dialog with the scene's numbers that Escape closes
      {
        await d.page.evaluate(async () => { await window.__diorama.stage.frame(0.5) })
        await d.page.waitForSelector('[data-testid=diorama-png-size]', { timeout: 30000 }).catch(() => {})
        const line = await d.page.locator('[data-testid=diorama-blobs]').locator('xpath=ancestor::div[1]').innerText().catch(() => '')
        await d.page.locator('[data-testid=diorama-details-open]').click()
        const dialog = d.page.locator('[data-testid=diorama-details]')
        const shown = await dialog.evaluate((el) => el.open && el.matches(':modal')).catch(() => false)
        const sizes = await Promise.all(['description', 'picture', 'splats'].map((k) => d.page.locator(`[data-testid=details-${k}]`).innerText().catch(() => '')))
        const tiles = await dialog.locator('dt').allInnerTexts()
        if (shown) await axe(d.page, 'blobscape pixel diorama details')
        await d.page.keyboard.press('Escape')
        const closed = await dialog.evaluate((el) => !el.open)
        const back = await d.page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
        const kb = (t) => parseFloat(t.replace(/,/g, ''))
        if (!(/blobs, drawn at \d+ × \d+, [\d.,]+\sKB a frame/.test(line) && shown && sizes.every((t) => /KB$/.test(t)) && kb(sizes[0]) < kb(sizes[2]) && kb(sizes[1]) < kb(sizes[2]) && tiles.length >= 10 && closed && back === 'diorama-details-open')) fails.push(`blobscape pixel diorama details: ${JSON.stringify({ line, shown, sizes, tiles, closed, back })}`)
        else ok(`blobscape pixel diorama: Full details opens a panel of ${tiles.length} readouts (description ${sizes[0]}, picture ${sizes[1]}, splats ${sizes[2]}), and Escape closes it and gives focus back`)
      }
      // How it's made: five steps under the view, each drawing the scene its own way; Done puts the page back as it was
      {
        const draw = () => d.page.evaluate(async () => { const s = window.__diorama.stage; await s.frame(2); await s.frame(2) })
        // how much of the picture is drawn, and how far its colors are from gray
        const seen = () => d.page.evaluate(async () => {
          const s = window.__diorama.stage
          await s.frame(2)
          const c = document.querySelector('[data-testid=diorama-view]')
          const t = document.createElement('canvas'); t.width = 160; t.height = 120
          const g = t.getContext('2d', { willReadFrequently: true }); g.drawImage(c, 0, 0, 160, 120)
          const px = g.getImageData(0, 0, 160, 120).data
          let lit = 0, hue = 0
          for (let i = 0; i < px.length; i += 4) { if (px[i] + px[i + 1] + px[i + 2] > 90) { lit++; hue += Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]) } }
          return { lit, hue: lit ? hue / lit : 0, art: !!s.artSize }
        })
        await d.page.getByTestId('diorama-tour-open').click()
        const tour = d.page.getByTestId('diorama-tour')
        const steps = []
        for (let i = 0; i < 5; i++) {
          await d.page.waitForFunction((n) => document.querySelector('[data-testid=diorama-tour] p')?.textContent.startsWith(`${n} of 5`), i + 1, { timeout: 10000 }).catch(() => {})
          await d.page.waitForTimeout(250)
          await draw()
          const words = await tour.locator('p').innerText().catch(() => '')
          let spot = ''
          if (i === 3) {
            spot = await d.page.waitForFunction(() => document.querySelector('[data-testid=diorama-magnifier]')?.dataset.spot, null, { timeout: 30000 }).then((h) => h.jsonValue(), () => '')
            await d.page.screenshot({ path: join(shots, 'blobscape-pixel-diorama-tour.png') })
            await axe(d.page, 'blobscape pixel diorama how it is made')
          }
          steps.push({ words, spot, focus: await d.page.evaluate(() => document.activeElement?.textContent), ...await seen() })
          if (i < 4) await d.page.getByRole('button', { name: 'Next' }).click()
        }
        await d.page.getByRole('button', { name: 'Done' }).click()
        const back = await d.page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'diorama-tour-open', null, { timeout: 5000 }).then(() => true, () => false)
        const after = await seen()
        const [shapes, blobs, paint, samples, finish] = steps
        const good = steps.every((s, i) => s.words.startsWith(`${i + 1} of 5`)) && !shapes.art && !blobs.art && !paint.art && samples.art && finish.art
          && shapes.hue < 25 && blobs.lit < shapes.lit * 0.95 && blobs.lit > 200 && paint.hue > shapes.hue * 1.5 && /^\d+,\d+$/.test(samples.spot)
          && steps.slice(0, 4).every((s) => s.focus === 'Next') && finish.focus === 'Done' && back && after.art
        if (!good) fails.push(`blobscape pixel diorama how it's made: ${JSON.stringify({ steps, back, after })}`)
        else ok(`blobscape pixel diorama: How it's made walks five steps (clay, one blob in eight at ${Math.round((blobs.lit / shapes.lit) * 100)}% of the clay's cover, paint, four samples with its magnifier, the finish), keeps the keyboard on the way forward, and Done puts the picture and focus back`)
      }
      const strip = () => [...document.querySelectorAll('[data-testid=palette-strip] span')].map((e) => e.style.background).join()
      const before = await d.page.evaluate(strip)
      const justAfter = await d.page.evaluate(() => {
        [...document.querySelectorAll('button')].find((b) => b.textContent === 'Windmill').click()
        return [...document.querySelectorAll('[data-testid=palette-strip] span')].map((e) => e.style.background).join()
      }).catch(() => '')
      const changed = await d.page.waitForFunction((was) => { const now = [...document.querySelectorAll('[data-testid=palette-strip] span')].map((e) => e.style.background).join(); return !!window.__diorama && now !== was }, before, { timeout: 90000 }).then(() => true, () => false)
      if (!before || justAfter !== before || !changed) fails.push(`blobscape pixel diorama: on picking another scene the palette ${justAfter !== before ? 'changed before the scene did' : 'never changed'}`)
      else ok('blobscape pixel diorama: a newly picked scene brings its palette only when it reaches the view')
      // the gallery of recorded loops: every tile's loop loads, and a tile opens its scene in the view
      await d.page.getByTestId('diorama-loops').scrollIntoViewIfNeeded()
      const loops = await d.page.waitForFunction(() => { const im = [...document.querySelectorAll('[data-testid=diorama-loops] img')]; return im.length && im.every((i) => i.complete && i.naturalWidth) ? im.length : 0 }, null, { timeout: 30000 }).then((h) => h.jsonValue(), () => 0)
      await d.page.getByTestId('diorama-loops').getByRole('button', { name: 'Snail house, open in the view above' }).click()
      const picked = await d.page.waitForFunction(() => location.search.includes('scene=snail') && scrollY < 50 && document.activeElement?.dataset.testid === 'diorama-view', null, { timeout: 20000 }).then(() => true, () => false)
      if (loops < 18 || !picked) fails.push(`blobscape pixel diorama gallery: ${loops} loops loaded, picking a tile ${picked ? 'worked' : 'did not open the scene above'}`)
      else ok(`blobscape pixel diorama: the gallery's ${loops} loops load, and a tile opens its scene in the view`)
      // a scene description opened from a file is drawn as one more scene, and a broken one says where it is broken
      {
        const { BEE } = await import('../../../src/blobscape/diorama/scenes/bee.ts')
        const input = d.page.getByTestId('diorama-model'), note = d.page.getByTestId('diorama-model-note')
        const said = (re) => d.page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-testid=diorama-model-note]')?.textContent ?? ''), re.source, { timeout: 30000 }).then(() => note.innerText(), () => note.innerText())
        await d.page.evaluate(() => scrollTo(0, 0))
        await input.setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...BEE, loop: 'long', parts: [{ ...BEE.parts[0], shape: { kind: 'cloud' } }, ...BEE.parts.slice(1)] })) })
        const refused = await said(/^Could not open broken\.json/)
        const still = await d.page.evaluate(() => location.search.includes('scene=snail'))
        await input.setInputFiles({ name: 'bee.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...BEE, name: 'Opened bee' })) })
        const opened = await said(/^Opened bee\.json/)
        const drawn = await d.page.waitForFunction(() => document.querySelector('[data-testid=diorama-view]')?.getAttribute('aria-label')?.startsWith('Opened bee') && window.__diorama?.blobs() > 5000, null, { timeout: 120000 }).then(() => true, () => false)
        const chip = await d.page.getByRole('button', { name: 'Opened bee', exact: true }).count()
        if (!(/loop: /.test(refused) && /parts\[0\]/.test(refused) && still && /224 parts/.test(opened) && drawn && chip === 1)) fails.push(`blobscape pixel diorama open a description: ${JSON.stringify({ refused, still, opened, drawn, chip })}`)
        else ok('blobscape pixel diorama: a broken description is turned away with where it is broken, and a sound one opens as one more scene')
      }
      await d.ctx.close()
    },
  },
  // the scenes in three checks of about six, so they run side by side
  ...[0, 1, 2].map((k) => SCENES.filter((_, i) => i % 3 === k)).map((scenes, k) => ({
      name: `diorama-scenes-${k + 1}`,
      about: `scenes written as descriptions, ${scenes.map(([id]) => id).join(', ')}: each opens by its address, draws in its palette and moves`,
      entries: ['src/blobscape/PixelDiorama.tsx'],
      parts: Object.fromEntries(scenes.map(([id]) => [id, [`src/blobscape/diorama/scenes/${id}.ts`]])),
      async run({ shots, join, fails, ok, open, wants }) {
        for (const [id, name] of scenes) {
          if (!wants(id)) continue
          const d = await open(`/experiments/pixel-diorama/?offscreen=1&scene=${id}`, { viewport: { width: 1280, height: 900 } })
          const label = `blobscape pixel diorama ${id}`
          if (!await d.page.waitForFunction(() => window.__diorama, null, { timeout: 90000 }).then(() => true, () => false)) {
            fails.push(`${label}: the scene never started`)
            await d.ctx.close()
            continue
          }
          const shot = (t) => d.page.evaluate(async (t) => {
            const { stage, look, bones } = window.__diorama
            await stage.frame(t)
            const f = await stage.pixelFrames()
            const pal = new Set([...look().palette, look().outline].filter(Boolean).map((c) => (c[0] << 16) | (c[1] << 8) | c[2]))
            let off = 0
            const used = new Set()
            for (let i = 0; i < f.art.data.length; i += 4) {
              const c = (f.art.data[i] << 16) | (f.art.data[i + 1] << 8) | f.art.data[i + 2]
              // a scene with no sky leaves the background clear
              if (!f.art.data[i + 3]) { if (look().sky) off++; continue }
              if (!pal.has(c)) off++
              used.add(c)
            }
            return { off, used: used.size, bones: bones(), turned: stage.orbit.azimuth, art: Array.from(f.art.data), small: Array.from(f.small.data), before: f.before && Array.from(f.before.data), parts: f.parts && Array.from(f.parts.data), w: f.art.width, h: f.art.height, look: look() }
          }, t)
          // a view that swings stands at the same angle at t and at half a loop less t (half a loop is given here), so what changes between those is the scene itself
          const half = { bee: 6, dragon: 8, hand: 8, reef: 6 }[id]
          const a = await shot(2), b = await shot(half ? half - 2 : 5)
          if (half) {
            const c = await shot(half / 2)
            if (Math.abs(a.turned - b.turned) > 0.01 || Math.abs(c.turned - a.turned) < 0.5) fails.push(`${label}: the view should swing and come back: ${JSON.stringify([a.turned, c.turned, b.turned])}`)
            else ok(`${label}: the view swings (${a.turned.toFixed(1)}° at 2 s, ${c.turned.toFixed(1)}° at ${half / 2} s) and the bones move on their own`)
          }
          if (id === 'dragon') {
            // the one scene whose sky stops short: that path of the pass against its CPU twin
            const { pixelArt } = await import('../../../src/splat-core/pixel.ts')
            const want = pixelArt({ width: a.w, height: a.h, data: Uint8ClampedArray.from(a.small) }, a.look, a.before && { width: a.w, height: a.h, data: Uint8ClampedArray.from(a.before) }, a.parts && { width: a.w, height: a.h, data: Uint8ClampedArray.from(a.parts) })
            let alpha = 0, color = 0
            for (let i = 0; i < want.data.length; i += 4) {
              if (want.data[i + 3] !== a.art[i + 3]) alpha++
              else if (Math.abs(want.data[i] - a.art[i]) + Math.abs(want.data[i + 1] - a.art[i + 1]) + Math.abs(want.data[i + 2] - a.art[i + 2]) > 6) color++
            }
            if (!(a.look.sky?.[2] < 1 && alpha === 0 && color < a.w * a.h * 0.05)) fails.push(`${label}: with a sky that stops short, the pixel pass and its CPU twin differ (${alpha} in shape, ${color} of ${a.w * a.h} in color, reach ${a.look.sky?.[2]})`)
            else ok(`${label}: with a sky that stops short, the pixel pass matches its CPU twin (${color} of ${a.w * a.h} pixels a neighboring color)`)
          }
          let moved = 0
          for (let i = 0; i < a.art.length; i += 4) if (a.art[i] !== b.art[i] || a.art[i + 1] !== b.art[i + 1] || a.art[i + 2] !== b.art[i + 2]) moved++
          const chip = await d.page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed')
          if (!(a.off === 0 && a.used >= 12 && a.bones > 10 && moved > 100 && chip === 'true')) fails.push(`${label}: ${JSON.stringify({ offPalette: a.off, colors: a.used, bones: a.bones, moved, chip })}`)
          else ok(`${label}: built from its description (${a.bones} bones), ${a.used} palette colors in the picture, ${moved} pixels change in a few seconds`)
          await d.page.screenshot({ path: join(shots, `blobscape-pixel-diorama-${id}.png`) })
          await d.ctx.close()
        }
      },
  })),
  {
    name: 'brush-and-ink',
    about: 'Brush and Ink: each look redraws the same blobs as marks on both backends, a frame drawn twice is the same, the scan draws too',
    entries: ['src/blobscape/BrushInk.tsx'],
    async run({ shots, join, fails, ok, open, tabClick, axe }) {
      const read = (page, t = 0.4) => page.evaluate(async (t) => {
        await window.__brush.stage.frame(t)
        const cv = document.querySelector('[data-testid=brush-view]')
        return Array.from(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data)
      }, t)
      const differ = (a, b, by = 40) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) + Math.abs(a[i + 3] - b[i + 3]) > by) n++; return n / (a.length / 4) }
      const solid = (a) => { let n = 0; for (let i = 3; i < a.length; i += 4) if (a[i] > 128) n++; return n / (a.length / 4) }
      const pick = async (page, name, look) => {
        await tabClick(page.getByTestId('brush-looks').getByRole('button', { name, exact: true }))
        await page.waitForFunction((look) => window.__brush?.look === look, look, { timeout: 10000 }).catch(() => {})
      }
      const pictures = {}
      for (const backend of ['webgpu', 'webgl']) {
        const k = await open(`/experiments/brush-and-ink/?offscreen=1&subject=fox&look=gouache${backend === 'webgl' ? '&webgl=1' : ''}`, { viewport: { width: 1280, height: 900 } })
        const up = await k.page.waitForFunction(() => window.__brush?.subject === 'fox', null, { timeout: 120000 }).then(() => true, () => false)
        if (!up) { fails.push(`brush and ink on ${backend}: the fox never came up`); await k.ctx.close(); continue }
        await k.page.evaluate(() => { window.__brush.stage.playing = false })
        const got = await k.page.evaluate(() => window.__brush.stage.backend)
        const gouache = await read(k.page), again = await read(k.page)
        await pick(k.page, 'Oil', 'oil')
        const oil = await read(k.page)
        await pick(k.page, 'Ink and wash', 'ink')
        const ink = await read(k.page)
        // the pen looks come with outlines; switching them off takes lines out of the picture and nothing else moves
        const box = k.page.getByTestId('brush-outline').getByRole('checkbox')
        const lined = await box.isChecked()
        await tabClick(box)
        const bare = await read(k.page)
        await tabClick(box)
        const inkAgain = await read(k.page)
        const lines = differ(ink, bare), back = differ(ink, inkAgain, 0)
        let darker = 0, lighter = 0
        for (let i = 0; i < ink.length; i += 4) { const d = ink[i] + ink[i + 1] + ink[i + 2] - bare[i] - bare[i + 1] - bare[i + 2]; if (bare[i + 3] > 128 && d < -40) darker++; else if (bare[i + 3] > 128 && d > 40) lighter++ }
        if (!lined || !(lines > 0.004 && lines < 0.2) || back !== 0 || !(darker > lighter * 5)) fails.push(`brush and ink on ${backend}: outlines on at first ${lined}, they change ${lines} of the view, ${darker} pixels darker and ${lighter} lighter, on again differs ${back}`)
        else ok(`brush and ink on ${backend}: ink and wash comes with outlines (${(lines * 100).toFixed(1)}% of the view is line, and off then on gives the same picture)`)
        await pick(k.page, 'Hatching', 'hatch')
        const hatch = await read(k.page)
        const paper = await k.page.getByTestId('brush-ground').evaluate((e) => getComputedStyle(e).backgroundColor)
        await pick(k.page, 'Blobs', 'blobs')
        const blobs = await read(k.page)
        pictures[backend] = { gouache, hatch, ink }
        const m = { backend: got, same: differ(gouache, again, 0), cover: solid(gouache), blobs: solid(blobs), paint: differ(gouache, blobs), oil: differ(oil, gouache), ink: differ(ink, gouache), hatch: differ(hatch, ink), paper }
        // marks are opaque where soft dots fade, so the painted fox is at least as solid; each look is a different picture; a frame drawn twice is the same frame
        if (m.backend !== backend || m.same !== 0 || !(m.cover > 0.03 && m.cover >= m.blobs * 0.9) || !(m.paint > 0.01 && m.oil > 0.003 && m.ink > 0.01 && m.hatch > 0.005) || !/rgb\(2[0-9]{2}, 2[0-9]{2}, 2[0-9]{2}\)/.test(m.paper)) fails.push(`brush and ink on ${backend}: ${JSON.stringify(m)}`)
        else ok(`brush and ink on ${backend}: the fox in gouache covers ${(m.cover * 100).toFixed(0)}% of the view (${(m.blobs * 100).toFixed(0)}% as blobs), every look is its own picture, and a frame drawn twice is the same`)
        if (backend === 'webgpu') {
          // the scan and a scene, hatched and painted
          await tabClick(k.page.getByTestId('brush-subjects').getByRole('button', { name: 'Scanned mug', exact: true }))
          const mug = await k.page.waitForFunction(() => window.__brush?.subject === 'mug', null, { timeout: 120000 }).then(() => true, () => false)
          await pick(k.page, 'Hatching', 'hatch')
          const hatched = mug && await read(k.page)
          if (hatched) await k.page.screenshot({ path: join(shots, 'blobscape-brush-mug.png') })
          await pick(k.page, 'Blobs', 'blobs')
          const plain = mug && await read(k.page)
          if (!mug || !(solid(hatched) > 0.03) || !(differ(hatched, plain) > 0.02)) fails.push(`brush and ink: the scanned mug hatched: up ${mug}, ${mug ? `${solid(hatched)} solid, ${differ(hatched, plain)} changed from blobs` : ''}`)
          else ok(`brush and ink: the scanned mug draws hatched (${(solid(hatched) * 100).toFixed(0)}% of the view)`)
          await tabClick(k.page.getByTestId('brush-subjects').getByRole('button', { name: 'Windmill', exact: true }))
          const mill = await k.page.waitForFunction(() => window.__brush?.subject === 'windmill', null, { timeout: 180000 }).then(() => true, () => false)
          await pick(k.page, 'Gouache', 'gouache')
          const painted = mill && await read(k.page, 2)
          if (!mill || !(solid(painted) > 0.2)) fails.push(`brush and ink: the windmill in gouache: up ${mill}, ${mill ? solid(painted) : ''} solid`)
          else ok(`brush and ink: the windmill scene draws in gouache (${(solid(painted) * 100).toFixed(0)}% of the view)`)
          await k.page.screenshot({ path: join(shots, 'blobscape-brush-and-ink.png') })
          await axe(k.page, 'brush and ink')
        }
        await k.ctx.close()
      }
      // the two backends draw the same marks: the same blobs get the same strokes
      if (pictures.webgpu && pictures.webgl) {
        const g = differ(pictures.webgpu.gouache, pictures.webgl.gouache, 90), h = differ(pictures.webgpu.hatch, pictures.webgl.hatch, 90), n = differ(pictures.webgpu.ink, pictures.webgl.ink, 90)
        if (!(g < 0.02 && h < 0.02 && n < 0.02)) fails.push(`brush and ink: WebGPU and WebGL differ at ${(g * 100).toFixed(2)}% of pixels in gouache, ${(h * 100).toFixed(2)}% hatched, ${(n * 100).toFixed(2)}% in ink and wash with its outlines`)
        else ok(`brush and ink: WebGPU and WebGL draw the same marks and outlines (${(g * 100).toFixed(2)}% of pixels differ in gouache, ${(h * 100).toFixed(2)}% hatched, ${(n * 100).toFixed(2)}% in ink and wash)`)
      }
      // Scan Studio offers the looks on its Lighting tab
      const s = await open('/experiments/scan-studio/?offscreen=1', { viewport: { width: 1280, height: 900 } })
      const there = await s.page.waitForFunction(() => window.__scan?.kept() > 0, null, { timeout: 120000 }).then(() => true, () => false)
      const shot = () => s.page.evaluate(async () => {
        await window.__scan.stage.frame(0)
        const cv = document.querySelector('[data-testid=scan-view]') ?? document.querySelector('section[aria-label="The scan"] canvas')
        return Array.from(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data)
      })
      if (!there) fails.push('brush and ink: Scan Studio never came up')
      else {
        const before = await shot()
        await tabClick(s.page.getByTestId('scan-looks').getByRole('button', { name: 'Gouache', exact: true }))
        await s.page.waitForTimeout(200)
        const after = await shot()
        if (!(differ(before, after) > 0.01)) fails.push(`brush and ink: Scan Studio's Gouache changed ${differ(before, after)} of the view`)
        else ok(`brush and ink: Scan Studio draws its scan in gouache from the Lighting tab (${(differ(before, after) * 100).toFixed(0)}% of the view changes)`)
        await s.page.screenshot({ path: join(shots, 'blobscape-scan-gouache.png') })
      }
      await s.ctx.close()
    },
  },
  {
    name: 'day-and-night',
    about: 'Day and Night: the same scene lit by the hour on both backends: shadows that follow the sun, a dark night with lit windows, a sky that matches',
    entries: ['src/blobscape/DayNight.tsx'],
    async run({ shots, join, fails, ok, open, tabClick, axe }) {
      // the scene at an hour: the view's pixels, and the sky's behind it
      const read = (page, hour, t = 1.3) => page.evaluate(async ([hour, t]) => {
        window.__daynight.setHour(hour)
        await window.__daynight.stage.frame(t)
        const cv = document.querySelector('[data-testid=daynight-view]'), sky = document.querySelector('[data-testid=daynight-sky]')
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
        const s = sky.getContext('2d').getImageData(0, 0, sky.width, Math.max(1, Math.floor(sky.height / 4))).data
        const top = [0, 0, 0]
        for (let i = 0; i < s.length; i += 4) { top[0] += s[i]; top[1] += s[i + 1]; top[2] += s[i + 2] }
        return { d: Array.from(d), width: cv.width, sky: top.map((v) => v / (s.length / 4)), lights: window.__daynight.lights() }
      }, [hour, t])
      const stats = (f) => {
        let n = 0, sum = 0, warm = 0
        for (let i = 0; i < f.d.length; i += 4) {
          if (f.d[i + 3] < 128) continue
          n++
          sum += f.d[i] + f.d[i + 1] + f.d[i + 2]
          // a lit window or the lantern: bright and yellow
          if (f.d[i] > 220 && f.d[i + 1] > 160 && f.d[i + 2] < 170 && f.d[i] > f.d[i + 2] * 1.4) warm++
        }
        return { solid: n / (f.d.length / 4), mean: sum / (3 * Math.max(1, n)), warm }
      }
      // where one frame is darker than another: how many pixels, and the middle of them from left (0) to right (1)
      const shade = (lit, shaded) => {
        let n = 0, x = 0
        for (let i = 0; i < lit.d.length; i += 4) {
          if (shaded.d[i + 3] < 128) continue
          if (lit.d[i] + lit.d[i + 1] + lit.d[i + 2] - shaded.d[i] - shaded.d[i + 1] - shaded.d[i + 2] > 60) { n++; x += ((i / 4) % lit.width) / lit.width }
        }
        return { share: n / (lit.d.length / 4), x: n ? x / n : 0.5 }
      }
      const differ = (a, b, by = 0) => { let n = 0; for (let i = 0; i < a.d.length; i += 4) if (Math.abs(a.d[i] - b.d[i]) + Math.abs(a.d[i + 1] - b.d[i + 1]) + Math.abs(a.d[i + 2] - b.d[i + 2]) + Math.abs(a.d[i + 3] - b.d[i + 3]) > by) n++; return n / (a.d.length / 4) }
      const pictures = {}
      for (const backend of ['webgpu', 'webgl']) {
        const k = await open(`/experiments/day-and-night/?offscreen=1&hour=12&shadows=1${backend === 'webgl' ? '&webgl=1' : ''}`, { viewport: { width: 1280, height: 900 } })
        const up = await k.page.waitForFunction(() => window.__daynight?.blobs() > 0, null, { timeout: 120000 }).then(() => true, () => false)
        if (!up) { fails.push(`day and night on ${backend}: the scene never came up`); await k.ctx.close(); continue }
        const got = await k.page.evaluate(() => window.__daynight.stage.backend)
        const noon = await read(k.page, 12), again = await read(k.page, 12)
        const morning = await read(k.page, 8), evening = await read(k.page, 16), night = await read(k.page, 22.5)
        // the same hours with the shadows off: what the shadows took away
        const box = k.page.getByRole('checkbox', { name: /^Shadows/ })
        await tabClick(box)
        await k.page.waitForFunction(() => !document.querySelector('input[type=checkbox]:checked'), null, { timeout: 5000 }).catch(() => {})
        const morningBare = await read(k.page, 8), eveningBare = await read(k.page, 16)
        await tabClick(box)
        const am = shade(morningBare, morning), pm = shade(eveningBare, evening)
        const n = stats(noon), d = stats(night)
        pictures[backend] = { noon, night, morning }
        const m = { backend: got, same: differ(noon, again), solid: n.solid, noonMean: n.mean, nightMean: d.mean, noonWarm: n.warm, nightWarm: d.warm, am, pm, noonLights: noon.lights, nightLights: night.lights, noonSky: noon.sky, nightSky: night.sky }
        const lightsRight = noon.lights.sun && !noon.lights.moon && noon.lights.lamps === 0 && noon.lights.count === 1 && night.lights.moon && !night.lights.sun && night.lights.lamps === 4
        // by day the sky is blue and bright, at night dark; the scene is clearly darker at night (dim, not black, under a full moon and its lamps) and its windows are lit;
        // shadows fall west (left, seen from the south) in the morning and east in the evening
        const skyRight = noon.sky[2] > noon.sky[0] * 1.2 && noon.sky[2] > 150 && night.sky[2] < 60
        if (m.backend !== backend || m.same !== 0 || !(n.solid > 0.15) || !(n.mean > d.mean * 1.4) || !(d.warm > 150 && n.warm < d.warm / 5) || !(am.share > 0.01 && pm.share > 0.01 && am.x < pm.x - 0.04) || !lightsRight || !skyRight) fails.push(`day and night on ${backend}: ${JSON.stringify(m)}`)
        else ok(`day and night on ${backend}: noon is ${(n.mean / d.mean).toFixed(1)} times as bright as night, ${d.warm} pixels of lit window at night, shadows cover ${(am.share * 100).toFixed(1)}% of the view at 8 am and lie ${((pm.x - am.x) * 100).toFixed(0)}% of its width further east by 4 pm, and a frame drawn twice is the same`)
        if (backend === 'webgpu') {
          // the controls: a jump to noon, and the slider by keyboard
          await tabClick(k.page.getByTestId('daynight-jumps').getByRole('button', { name: 'Midnight', exact: true }))
          const midnight = await k.page.getByTestId('daynight-clock').textContent()
          const slider = k.page.getByRole('slider', { name: 'Time of day' })
          await slider.focus()
          for (let i = 0; i < 6; i++) await slider.press('ArrowRight')
          const later = await k.page.getByTestId('daynight-clock').textContent()
          if (midnight !== '12:00 am' || later !== '12:30 am') fails.push(`day and night: the clock read "${midnight}" at midnight and "${later}" six steps on`)
          else ok('day and night: Midnight sets the clock, and the slider moves it five minutes a step')
          // toward the sunset: the sky is warm where the sun goes down
          await tabClick(k.page.getByRole('button', { name: 'Toward the sunset', exact: true }))
          const set = await k.page.evaluate(() => { const b = [...document.querySelectorAll('[data-testid=daynight-jumps] button')].find((e) => e.textContent === 'Sunset'); b.click(); return window.__daynight.hour() })
          await k.page.waitForTimeout(100)
          const dusk = await read(k.page, await k.page.evaluate(() => window.__daynight.hour()))
          if (!(dusk.sky[0] > dusk.sky[2] * 1.15 && dusk.lights.sun)) fails.push(`day and night: at sunset (${set}) the sky toward it is ${dusk.sky.map(Math.round)}`)
          else ok(`day and night: at sunset the sky toward the sun is warm (${dusk.sky.map(Math.round).join(', ')})`)
          await k.page.screenshot({ path: join(shots, 'blobscape-day-and-night-sunset.png') })
          await tabClick(k.page.getByRole('button', { name: 'From the south', exact: true }))
          await read(k.page, 22.5)
          await k.page.screenshot({ path: join(shots, 'blobscape-day-and-night-night.png') })
          await read(k.page, 8)
          await k.page.screenshot({ path: join(shots, 'blobscape-day-and-night.png') })
          await axe(k.page, 'day and night')
        }
        await k.ctx.close()
      }
      // the two backends light the scene alike, shadows and all
      if (pictures.webgpu && pictures.webgl) {
        const a = differ(pictures.webgpu.noon, pictures.webgl.noon, 90), b = differ(pictures.webgpu.night, pictures.webgl.night, 90), c = differ(pictures.webgpu.morning, pictures.webgl.morning, 90)
        if (!(a < 0.02 && b < 0.02 && c < 0.02)) fails.push(`day and night: WebGPU and WebGL differ at ${(a * 100).toFixed(2)}% of pixels at noon, ${(c * 100).toFixed(2)}% at 8 am, ${(b * 100).toFixed(2)}% at night`)
        else ok(`day and night: WebGPU and WebGL light it alike (${(a * 100).toFixed(2)}% of pixels differ at noon, ${(c * 100).toFixed(2)}% at 8 am with its shadows, ${(b * 100).toFixed(2)}% at night)`)
      }
    },
  },
  {
    name: 'clockwork',
    about: 'Clockwork: the watch draws, the train turns by the right amount, the hands read the time',
    entries: ['src/blobscape/Clockwork.tsx'],
    async run({ shots, join, fails, ok, open, tabClick, axe }) {
      const k = await open('/experiments/clockwork/?offscreen=1', { viewport: { width: 1280, height: 900 } })
      await k.page.waitForFunction(() => window.__clock, null, { timeout: 90000 }).catch(() => {})
      const shot = (s) => k.page.evaluate(async (s) => {
        await window.__clock.stage.frame(s)
        const cv = document.querySelector('[data-testid=clock-view]')
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
        let gold = 0, blue = 0
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] > 170 && d[i + 1] > 110 && d[i + 2] < 120 && d[i] > d[i + 2] * 1.8) gold++
          if (d[i + 2] > 110 && d[i + 2] > d[i] * 2 && d[i + 2] > d[i + 1] * 1.6) blue++
        }
        return { gold, blue, d: Array.from(d) }
      }, s)
      await tabClick(k.page.getByRole('button', { name: 'Dial', exact: true }))
      const a = await shot(3 * 3600 + 41 * 60 + 17), b = await shot(3 * 3600 + 41 * 60 + 47)
      let moved = 0
      for (let i = 0; i < a.d.length; i += 4) if (Math.abs(a.d[i] - b.d[i]) + Math.abs(a.d[i + 1] - b.d[i + 1]) > 60) moved++
      const bones = await k.page.evaluate(() => window.__clock.bones())
      if (!(a.gold > 8000 && a.blue > 300 && moved > 500 && bones === 9)) fails.push(`blobscape clockwork: ${JSON.stringify({ gold: a.gold, blue: a.blue, moved, bones })}`)
      else ok(`blobscape clockwork: the movement draws (${a.gold} gold, ${a.blue} blued pixels) on ${bones} bones, and ${moved} pixels change in thirty seconds`)
      await k.page.waitForFunction(() => /\d+:\d\d:\d\d/.test(document.querySelector('[data-testid=clock-reading]')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => {})
      const read = await k.page.getByTestId('clock-reading').textContent()
      if (!/^(1[0-2]|[1-9]):[0-5]\d:[0-5]\d$/.test(read ?? '')) fails.push(`blobscape clockwork: the reading is "${read}"`)
      else ok(`blobscape clockwork: the hands' reading shows (${read})`)
      await tabClick(k.page.getByRole('button', { name: 'Escapement', exact: true }))
      await shot(100.02)
      await k.page.screenshot({ path: join(shots, 'blobscape-clockwork.png') })
      await axe(k.page, 'blobscape clockwork')
      await k.ctx.close()
    },
  },
  {
    name: 'scan-studio',
    about: 'Scan Studio: the sample is leveled and cleaned, cut blobs show red, a lamp relights, .ply round trip, hand-off to the sandbox',
    entries: ['src/blobscape/ScanStudio.tsx'],
    async run({ shots, join, fails, ok, open, tabClick, axe }) {
      const k = await open('/experiments/scan-studio/?offscreen=1', { viewport: { width: 1280, height: 900 } })
      await k.page.waitForFunction(() => window.__scan?.kept() > 0, null, { timeout: 90000 }).catch(() => {})
      const look = () => k.page.evaluate(async () => {
        await new Promise((r) => setTimeout(r, 400))
        await window.__scan.stage.frame(0)
        const cv = document.querySelector('[data-testid=scan-view]')
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
        let teal = 0, red = 0, sum = 0, solid = 0
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] > 128) solid++
          if (d[i + 1] > 80 && d[i + 2] > 80 && d[i + 1] > d[i] * 1.4) teal++
          if (d[i] > 120 && d[i] > d[i + 1] * 2 && d[i] > d[i + 2] * 2) red++
          sum += d[i] + d[i + 1] + d[i + 2]
        }
        return { teal, red, sum, solid }
      })
      const st = await k.page.evaluate(() => ({ kept: window.__scan.kept(), total: window.__scan.total(), level: window.__scan.level() }))
      const a = await look()
      if (!(st.level === true && st.kept > 0.45 * st.total && st.kept < 0.7 * st.total && a.teal > 20000 && a.red < 500)) fails.push(`blobscape scan: sample ${JSON.stringify({ ...st, ...a })}`)
      else ok(`blobscape scan: the sample's table is found and the clean keeps ${st.kept.toLocaleString()} of ${st.total.toLocaleString()} blobs (${a.teal} mug pixels)`)
      // the table cut trims the kept blobs that reach under its line; switched off, they hang over it again
      await tabClick(k.page.getByTestId('scan-trim').getByRole('checkbox'))
      const whole = await look()
      await tabClick(k.page.getByTestId('scan-trim').getByRole('checkbox'))
      const trimmed = await look()
      if (!(whole.solid > a.solid + 200 && trimmed.solid === a.solid)) fails.push(`blobscape scan: trimming at the cut: ${JSON.stringify({ trimmed: a.solid, whole: whole.solid, again: trimmed.solid })}`)
      else ok(`blobscape scan: blobs are trimmed at the table cut (${(whole.solid - a.solid).toLocaleString()} pixels of overhang gone)`)
      await tabClick(k.page.getByRole('button', { name: 'Kept and cut' }))
      const b = await look()
      await tabClick(k.page.getByRole('button', { name: 'Kept', exact: true }))
      await tabClick(k.page.getByRole('button', { name: 'Lamp' }))
      const c = await look()
      if (!(b.red > 50000 && Math.abs(c.sum - a.sum) > a.sum * 0.03)) fails.push(`blobscape scan: cut/lamp ${JSON.stringify({ red: b.red, before: a.sum, lamp: c.sum })}`)
      else ok(`blobscape scan: cut blobs show red (${b.red} pixels) and the lamp relights the mug (brightness ${Math.round((100 * c.sum) / a.sum)}%)`)
      await k.page.screenshot({ path: join(shots, 'blobscape-scan.png') })
      await axe(k.page, 'blobscape scan')
      const [dl] = await Promise.all([k.page.waitForEvent('download'), k.page.getByRole('button', { name: 'Download .ply' }).click()])
      const file = join(shots, 'scan-clean.ply')
      await dl.saveAs(file)
      await tabClick(k.page.getByRole('button', { name: 'As scanned' }))
      await k.page.locator('input[type=file]:not([data-testid=scan-collider-file])').setInputFiles(file)
      await k.page.waitForFunction(() => /Opened scan-clean/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {})
      const back = await k.page.evaluate(() => window.__scan.total())
      if (back !== st.kept) fails.push(`blobscape scan: the saved .ply holds ${back} blobs, not ${st.kept}`)
      else ok(`blobscape scan: the saved .ply opens again with all ${back.toLocaleString()} kept blobs`)
      const kept = await k.page.evaluate(() => window.__scan.kept())
      await tabClick(k.page.getByRole('button', { name: 'Open in the sandbox' }))
      await k.page.waitForURL('**/sandbox/', { timeout: 30000 }).catch(() => {})
      const count = (await k.page.getByTestId('blob-count').textContent({ timeout: 30000 }).catch(() => '')) ?? ''
      if (Number(count.replace(/\D/g, '')) !== kept) fails.push(`blobscape scan: the sandbox shows "${count}" for ${kept} kept blobs`)
      else ok(`blobscape scan: Open in the sandbox hands over the ${kept.toLocaleString()} kept blobs`)
      await k.ctx.close()
    },
  },
  {
    name: 'scan-colliders',
    about: 'Scan Studio colliders: guessed, added, sized and slid by their handles, picked in the view, copied, deleted, saved, reopened in place, handed to the sandbox',
    entries: ['src/blobscape/scan/Colliders.tsx', 'src/splat-engine/colliders.ts'],
    async run({ shots, join, fails, ok, open, tabClick, axe }) {
      const k = await open('/experiments/scan-studio/?offscreen=1', { viewport: { width: 1280, height: 900 } })
      const up = await k.page.waitForFunction(() => window.__scan?.kept() > 0, null, { timeout: 120000 }).then(() => true, () => false)
      if (!up) { fails.push('scan colliders: Scan Studio never came up'); await k.ctx.close(); return }
      const shapes = () => k.page.evaluate(() => window.__scan.colliders())
      const drawnShapes = () => k.page.locator('[data-testid=scan-colliders] g[data-collider]').count()
      await tabClick(k.page.getByTestId('scan-collider-guess'))
      const guessed = await shapes()
      if (!(guessed.length === 2 && guessed[0].name === 'floor' && Math.abs(guessed[0].center[1] + guessed[0].size[1]) < 1e-6 && guessed[1].size[1] > 0.3 && await drawnShapes() === 2)) fails.push(`scan colliders: the guess ${JSON.stringify(guessed)}, ${await drawnShapes()} drawn`)
      else ok(`scan colliders: a guess gives the table (top at 0) and a box ${(guessed[1].size[1] * 2).toFixed(2)} tall round the mug, both drawn over the view`)
      // a new cylinder is picked, with handles: one sizes it, one slides it over the table
      await tabClick(k.page.getByRole('button', { name: 'Add a cylinder' }))
      const pull = async (handle, dx, dy) => {
        const box = await k.page.locator(`[data-testid=scan-colliders] [data-handle="${handle}"]`).boundingBox()
        if (!box) return false
        const x = box.x + box.width / 2, y = box.y + box.height / 2
        await k.page.mouse.move(x, y)
        await k.page.mouse.down()
        await k.page.mouse.move(x + dx / 2, y + dy / 2)
        await k.page.mouse.move(x + dx, y + dy)
        await k.page.mouse.up()
        return true
      }
      const fresh = (await shapes())[2]
      const pulled = await pull(0, 60, 0)
      const wider = (await shapes())[2]
      const slid = await pull('move', -80, 30)
      const moved = (await shapes())[2]
      if (!(fresh && pulled && slid && Math.abs(wider.size[0] - fresh.size[0]) > 0.05 && wider.size[1] === fresh.size[1] && Math.hypot(moved.center[0] - wider.center[0], moved.center[2] - wider.center[2]) > 0.1 && Math.abs(moved.center[1] - wider.center[1]) < 1e-9 && moved.size[0] === wider.size[0])) fails.push(`scan colliders: handles ${JSON.stringify({ fresh, wider, moved, pulled, slid })}`)
      else ok(`scan colliders: a size handle takes the cylinder from ${(fresh.size[0] * 2).toFixed(2)} to ${(wider.size[0] * 2).toFixed(2)} across, and the middle handle slides it ${Math.hypot(moved.center[0] - wider.center[0], moved.center[2] - wider.center[2]).toFixed(2)} over the table at the same height`)
      // the sliders move it too; a click in the view picks the shape under it
      await k.page.getByRole('slider', { name: 'Tall' }).fill('1.2')
      const tall = (await shapes())[2]
      await tabClick(k.page.getByTestId('scan-collider-list').getByRole('button', { name: 'Cylinder 1' }))
      const none = await k.page.locator('[data-testid=scan-colliders] [data-handle]').count()
      const mid = await k.page.evaluate(() => { const s = window.__scan, c = s.colliders()[2], p = s.stage.screenAt(c.center), r = document.querySelector('[data-testid=scan-view]').getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y } })
      await k.page.mouse.click(mid.x, mid.y)
      const again = await k.page.locator('[data-testid=scan-colliders] g[data-picked]').getAttribute('data-collider').catch(() => null)
      if (!(Math.abs(tall.size[1] - 0.6) < 1e-6 && none === 0 && again === '2')) fails.push(`scan colliders: slider and click: tall ${tall.size[1]}, ${none} handles with nothing picked, a click picked ${again}`)
      else ok('scan colliders: the Tall slider sizes it, and a click on it in the view picks it again')
      await tabClick(k.page.getByTestId('scan-collider-copy'))
      const copied = await shapes()
      await tabClick(k.page.getByTestId('scan-collider-delete'))
      const left = await shapes()
      if (!(copied.length === 4 && copied[3].shape === 'cylinder' && copied[3].center[0] !== copied[2].center[0] && left.length === 3)) fails.push(`scan colliders: copy and delete left ${copied.length} then ${left.length}`)
      else ok('scan colliders: Copy adds one beside it and Delete takes it away')
      await k.page.screenshot({ path: join(shots, 'blobscape-scan-colliders.png') })
      await axe(k.page, 'scan colliders')
      // saved, then opened over a fresh guess: every shape is back where it was
      const [dl] = await Promise.all([k.page.waitForEvent('download'), tabClick(k.page.getByTestId('scan-collider-save'))])
      const file = join(shots, 'scan-colliders.glb')
      await dl.saveAs(file)
      await tabClick(k.page.getByTestId('scan-collider-guess'))
      await k.page.getByTestId('scan-collider-file').setInputFiles(file)
      await k.page.waitForFunction(() => window.__scan.colliders().length === 3, null, { timeout: 30000 }).catch(() => {})
      const back = await shapes()
      const off = back.length === left.length ? Math.max(...back.map((c, i) => Math.max(...c.center.map((v, j) => Math.abs(v - left[i].center[j])), ...c.size.map((v, j) => Math.abs(v - left[i].size[j])), c.shape === left[i].shape ? 0 : 1))) : 1
      if (!(off < 1e-4)) fails.push(`scan colliders: saved and reopened, ${back.length} shapes, off by ${off}`)
      else ok(`scan colliders: the saved .glb opens again with all ${back.length} shapes in the same places (within ${off.toExponential(1)})`)
      // the shapes go to the sandbox with the scan
      await tabClick(k.page.getByRole('button', { name: 'Open in the sandbox' }))
      await k.page.waitForURL('**/sandbox/', { timeout: 30000 }).catch(() => {})
      await k.page.getByTestId('blob-count').textContent({ timeout: 30000 }).catch(() => '')
      await tabClick(k.page.getByTestId('add-creature').getByRole('button').first()).catch(() => {})
      const note = (await k.page.getByTestId('scan-shapes').textContent({ timeout: 10000 }).catch(() => '')) ?? ''
      if (!/3 solid shapes/.test(note)) fails.push(`scan colliders: the sandbox says "${note}"`)
      else ok('scan colliders: Open in the sandbox takes the 3 shapes along')
      await k.ctx.close()
    },
  },
  {
    name: 'dungeon',
    about: 'Dungeon Run: the hall draws, swings, bolts, health, Try again, props break, fire and frost, live light',
    entries: ['src/blobscape/DungeonRun.tsx'],
    async run({ shots, join, fails, ok, open, tabClick, axe }) {
      const k = await open('/experiments/dungeon-run/?offscreen=1', { viewport: { width: 1280, height: 900 } })
      await k.page.waitForFunction(() => window.__dungeon?.stage.dungeon, null, { timeout: 90000 }).catch(() => {})
      const look = () => k.page.evaluate(() => {
        const cv = document.querySelector('[data-testid=dungeon-view]')
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
        let warm = 0, green = 0
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] > 90 && d[i] > d[i + 2] * 1.4 && d[i + 1] > d[i + 2]) warm++
          if (d[i + 1] > 120 && d[i + 1] > d[i] * 1.4 && d[i + 1] > d[i + 2] * 1.4) green++
        }
        return { warm, green }
      })
      const run = (s, input) => k.page.evaluate(async ([s, input]) => { await window.__dungeon.stage.frame(s, input) }, [s, input])
      await k.page.evaluate(() => { const g = window.__dungeon.stage.dungeon.game; g.hold(); g.place('green', 0.7, g.hero.z + 1.1) })
      await run(0.2, { forward: 0, turn: 0 })
      // live light with shadows (WebGPU's default) leaves less of the hall torchlit than baked light
      const a = { ...(await look()), light: await k.page.evaluate(() => window.__dungeon.stage.dungeon.opts.light) }
      // a few swings (running after it when knocked back) burst a green slime
      for (let i = 0; i < 5 && !(await k.page.evaluate(() => window.__dungeon.stage.dungeon.game.score)); i++) { await run(0.05, { forward: 0, turn: 0, swing: true }); await run(0.5, { forward: 0.6, turn: 0 }) }
      const fight = await k.page.evaluate(() => { const g = window.__dungeon.stage.dungeon.game; return { score: g.score, phase: g.slimes[0]?.phase } })
      await run(0.15, { forward: 0, turn: 0, cast: true })
      await run(0.5, { forward: 0, turn: 0 })
      const meters = async () => Object.fromEntries(await k.page.getByRole('meter').evaluateAll((els) => els.map((e) => [e.getAttribute('aria-label'), +e.getAttribute('aria-valuenow')])))
      const m = await meters()
      if (!(a.warm > (a.light === 'live' ? 8000 : 20000) && a.green > 150 && fight.score === 1 && fight.phase === 'burst' && m.Magic < 100 && m.Health >= 80)) fails.push(`blobscape dungeon: ${JSON.stringify({ a, fight, m })}`)
      else ok(`blobscape dungeon: the hall draws (${a.warm} torchlit, ${a.green} slime pixels), swings burst the slime, a bolt spends magic (${m.Magic} left)`)
      await k.page.screenshot({ path: join(shots, 'blobscape-dungeon.png') })
      await axe(k.page, 'blobscape dungeon')
      // Space dodges: the hero hops straight back (J swings now)
      const stood = await k.page.evaluate(() => { const h = window.__dungeon.stage.dungeon.game.hero; return { x: h.x, z: h.z, heading: h.heading } })
      await k.page.locator('body').focus().catch(() => {})
      await k.page.keyboard.press('Space')
      await run(0.4, { forward: 0, turn: 0 })
      const hopped = await k.page.evaluate(() => { const h = window.__dungeon.stage.dungeon.game.hero; return { x: h.x, z: h.z } })
      const back = -((hopped.x - stood.x) * Math.sin(stood.heading) + (hopped.z - stood.z) * Math.cos(stood.heading))
      if (!(back > 1)) fails.push(`blobscape dungeon: Space should dodge back, went ${back.toFixed(2)} m`)
      else ok(`blobscape dungeon: Space dodges ${back.toFixed(2)} m straight back`)
      // a red slime at the hero's feet with health nearly gone: down, and Try again starts over
      await k.page.evaluate(() => { const g = window.__dungeon.stage.dungeon.game; g.hero.hp = 4; g.place('red', 0, g.hero.z + 0.5) })
      await run(2, { forward: 0, turn: 0 })
      const over = await k.page.getByRole('button', { name: 'Try again' }).count()
      const hurt = await meters()
      if (over) await tabClick(k.page.getByRole('button', { name: 'Try again' }))
      await run(0.1, { forward: 0, turn: 0 })
      const after = await meters()
      if (!(over === 1 && hurt.Health === 0 && after.Health === 100)) fails.push(`blobscape dungeon down: ${JSON.stringify({ over, hurt, after })}`)
      else ok('blobscape dungeon: a slime takes the last health, the hero goes down, and Try again starts over at full health')
      // light: live where WebGPU runs (each blob lit by the torches and the orb), and the Baked chip rebuilds the hall with it worked in
      const was = await k.page.evaluate(() => ({ light: window.__dungeon.stage.dungeon.opts.light, backend: window.__dungeon.stage.backend }))
      await run(0.1, { forward: 0, turn: 0 })
      const liveLook = await look()
      // shadows (on by default in live light): the GPU's grid of what blocks light matches the CPU's, and turning them off brightens the hall
      if (was.backend === 'webgpu') {
        const sh = await k.page.evaluate(async () => { const st = window.__dungeon.stage; return st.world.checkShadows(st.renderer) })
        await tabClick(k.page.getByLabel('Shadows'))
        await run(0.1, { forward: 0, turn: 0 })
        const unshaded = await look()
        await tabClick(k.page.getByLabel('Shadows'))
        if (!(sh.gpuTotal > 0 && Math.abs(sh.gpuTotal - sh.cpuTotal) < sh.cpuTotal * 0.001 && sh.differ < 50 && unshaded.warm > liveLook.warm)) fails.push(`blobscape dungeon shadows: ${JSON.stringify({ sh, shaded: liveLook, unshaded })}`)
        else ok(`blobscape dungeon: shadows from live lights (GPU grid matches the CPU, ${sh.differ} cells off by more than a unit); turning them off lights ${unshaded.warm - liveLook.warm} more pixels`)
      }
      // Exact sort rebuilds the hall on the radix sort, which draws it much as before
      {
        await tabClick(k.page.getByLabel('Exact sort (slower)'))
        await k.page.waitForFunction(() => window.__dungeon.stage.world?.sortKind === 'radix', null, { timeout: 30000 }).catch(() => {})
        await run(0.1, { forward: 0, turn: 0 })
        const ex = { ...(await look()), sort: await k.page.evaluate(() => window.__dungeon.stage.world.sortKind) }
        await tabClick(k.page.getByLabel('Exact sort (slower)'))
        await k.page.waitForFunction(() => window.__dungeon.stage.world?.sortKind === 'bins', null, { timeout: 30000 }).catch(() => {})
        await run(0.1, { forward: 0, turn: 0 })
        const back = await look()
        // the torches flicker, so the two are a moment apart, not one picture
        if (!(ex.sort === 'radix' && ex.warm > back.warm * 0.7 && ex.warm < back.warm / 0.7)) fails.push(`blobscape dungeon exact sort: ${JSON.stringify({ ex, back, before: liveLook })}`)
        else ok(`blobscape dungeon: Exact sort rebuilds the hall on the radix sort (${ex.warm} torchlit pixels; ${back.warm} back on the bins, ${liveLook.warm} before)`)
      }
      await tabClick(k.page.getByRole('button', { name: 'Baked', exact: true }))
      await k.page.waitForFunction(() => window.__dungeon.stage.dungeon.opts.light === 'baked', null, { timeout: 30000 }).catch(() => {})
      await run(0.1, { forward: 0, turn: 0 })
      const bakedLook = await look()
      const want = was.backend === 'webgpu' ? 'live' : 'baked'
      if (!(was.light === want && bakedLook.warm > 20000 && liveLook.warm > 5000 && liveLook.warm !== bakedLook.warm)) fails.push(`blobscape dungeon light: ${JSON.stringify({ was, live: liveLook, baked: bakedLook })}`)
      else ok(`blobscape dungeon: starts with ${want} light on ${was.backend}; live and baked both draw (${liveLook.warm} and ${bakedLook.warm} torchlit pixels)`)
      // fire and frost: a bolt lights the floor where it lands, the floor's blobs change color, and fire burns out. Once here, once on WebGL.
      const elements = async (page, name) => {
        const run = (s, input = { forward: 0, turn: 0 }) => page.evaluate(async ([s, input]) => { await window.__dungeon.stage.frame(s, input) }, [s, input])
        const see = () => page.evaluate(() => {
          const cv = document.querySelector('[data-testid=dungeon-view]')
          const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
          let ember = 0, ice = 0
          // only the lower half: the floor, not the torches
          for (let i = d.length / 2; i < d.length; i += 4) {
            if (d[i] > 200 && d[i + 1] > 70 && d[i + 1] < 190 && d[i + 2] < 100) ember++
            if (d[i + 2] > 150 && d[i + 2] > d[i] * 1.12 && d[i + 1] > 120) ice++
          }
          const g = window.__dungeon.stage.dungeon.game.ground
          return { ember, ice, fire: g.count('fire'), frost: g.count('frost'), stained: window.__dungeon.stage.dungeon.stainedBlobs }
        })
        await page.evaluate(() => { const g = window.__dungeon.stage.dungeon.game; g.restart(); g.hold(); g.place('purple', 0, g.hero.z + 3) })
        await run(0.2)
        const before = await see()
        await run(0.05, { forward: 0, turn: 0, cast: true })
        await run(1.4)
        const burning = await see()
        await run(6)
        const out = await see()
        // frost on clean stone (on the scorched patch it would be too dark to tell from the picture)
        const scorched = out.stained
        await page.evaluate(() => { const g = window.__dungeon.stage.dungeon.game; g.restart(); g.hold(); g.place('purple', 0, g.hero.z + 3) })
        await run(0.2)
        const clean = await see()
        await run(0.05, { forward: 0, turn: 0, frost: true })
        await run(3)
        const frozen = await see()
        const good = before.fire === 0 && before.stained === 0 && burning.fire > 8 && burning.ember > before.ember + 2000 && out.fire === 0 && out.ember < burning.ember / 4 && scorched > 100 && clean.stained === 0 &&
          frozen.frost > 12 && frozen.ice > clean.ice + 2000
        if (!good) fails.push(`${name}: ${JSON.stringify({ before, burning, out, clean, frozen })}`)
        else ok(`${name}: a fire bolt sets ${burning.fire} cells alight (${burning.ember} glowing pixels), it burns out and leaves the stone scorched, and a frost bolt freezes ${frozen.frost} cells (${frozen.ice} icy pixels)`)
      }
      // props: two swings break a crate, which gives health and leaves its pieces on the floor
      {
        const run = (s, input = { forward: 0, turn: 0 }) => k.page.evaluate(async ([s, input]) => { await window.__dungeon.stage.frame(s, input) }, [s, input])
        await k.page.evaluate(() => { const g = window.__dungeon.stage.dungeon.game; g.restart(); g.hold(); const p = g.props.find((p) => p.kind === 'crate'); g.hero.x = p.x; g.hero.z = p.z - 1; g.hero.heading = 0; g.hero.hp = 50 })
        const crate = () => k.page.evaluate(() => { const d = window.__dungeon.stage.dungeon, p = d.game.props.find((p) => p.kind === 'crate'), sk = d.props[p.slot].skeleton; const at = []; for (let b = 2; b < sk.count; b++) at.push([sk.posedHead[b * 3], sk.posedHead[b * 3 + 1], sk.posedHead[b * 3 + 2]]); return { phase: p.phase, hp: d.game.hero.hp, at } })
        await run(0.1)
        const whole = await crate()
        for (let i = 0; i < 2; i++) { await run(0.05, { forward: 0, turn: 0, swing: true }); await run(0.6) }
        await run(1)
        const broken = await crate()
        // the pieces are the crate's own blobs (no hidden copy): broken, they have flown apart and lie low on the floor
        const moved = whole.at.map((w, i) => Math.hypot(broken.at[i][0] - w[0], broken.at[i][2] - w[2]))
        const spread = moved.reduce((a, m) => a + m, 0) / moved.length
        const lying = broken.at.every(([, y]) => y >= 0 && y < 0.45)
        const stood = Math.max(...whole.at.map(([, y]) => y))
        if (!(whole.phase === 'whole' && whole.at.length >= 4 && stood > 0.3 && broken.phase === 'broken' && spread > 0.2 && lying && broken.hp === 60)) fails.push(`blobscape dungeon props: ${JSON.stringify({ whole, broken, spread, lying, stood })}`)
        else ok(`blobscape dungeon: two swings break a crate into ${whole.at.length} pieces that fly ${spread.toFixed(2)} m apart and lie on the floor, and it gives health back`)
      }
      await elements(k.page, 'blobscape dungeon fire and frost')
      await k.page.screenshot({ path: join(shots, 'blobscape-dungeon-frost.png') })
      const fire = await k.page.getByRole('button', { name: /^Fire/ }).count(), frost = await k.page.getByRole('button', { name: /^Frost/ }).count()
      if (fire !== 1 || frost !== 1) fails.push(`blobscape dungeon: ${fire} Fire and ${frost} Frost buttons`)
      await k.ctx.close()
      const gl = await open('/experiments/dungeon-run/?offscreen=1&webgl=1', { viewport: { width: 1280, height: 900 } })
      await gl.page.waitForFunction(() => window.__dungeon?.stage.dungeon, null, { timeout: 90000 }).catch(() => {})
      await elements(gl.page, 'blobscape dungeon fire and frost on WebGL')
      await gl.ctx.close()
    },
  },
  {
    name: 'forest',
    about: 'Forest Walk: the elf walks, tiles move on ahead, plants grow, the grass burns',
    entries: ['src/blobscape/ForestWalk.tsx'],
    async run({ shots, join, fails, ok, open, tabClick }) {
      const f = await open('/experiments/forest-walk/?offscreen=1', { viewport: { width: 1280, height: 900 } })
      if (!(await f.page.locator('[data-testid=forest-loading]').count())) fails.push('blobscape forest: no loading note while the engine starts')
      await f.page.waitForFunction(() => window.__forest?.stage.forest, null, { timeout: 90000 }).catch(() => {})
      // green of leaves and grass, brown of the path, the elf's tunic (from behind)
      const look = (seconds, forward, turn = 0) => f.page.evaluate(async ([s, fw, t]) => {
        await window.__forest.stage.frame(s, { forward: fw, turn: t })
        const cv = document.querySelector('[data-testid=forest-view]')
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
        let green = 0, path = 0
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 1] > d[i] + 25 && d[i + 1] > d[i + 2] + 25) green++
          if (d[i] > 100 && d[i] > d[i + 1] + 20 && d[i + 1] > d[i + 2] + 15) path++
        }
        const fo = window.__forest.stage.forest
        return { green, path, z: fo.walker.z, growing: fo.growing, tiles: fo.tiles, steps: fo.elfSteps.taken, fox: { steps: fo.foxSteps.taken, apart: Math.hypot(fo.foxWalker.x - fo.walker.x, fo.foxWalker.z - fo.walker.z) } }
      }, [seconds, forward, turn])
      const start = await look(0.1, 0)
      const walked = await look(12, 1)
      if (!(start.green > 20000 && start.path > 5000)) fails.push(`blobscape forest: first frame ${JSON.stringify(start)}`)
      else ok(`blobscape forest: grass, path and plants draw (${start.green} green, ${start.path} path pixels)`)
      if (!(walked.z > 12 && walked.growing > 30 && walked.green > 20000 && Math.min(...walked.tiles) > Math.min(...start.tiles))) fails.push(`blobscape forest: after walking ${JSON.stringify(walked)}`)
      else ok(`blobscape forest: the elf walks ${walked.z.toFixed(1)} m, tiles move on ahead and ${walked.growing} plants grow round it`)
      // the footsteps (issue #160): the elf steps, and the fox trots along and keeps up
      if (!(walked.steps > 20 && walked.fox.steps > 60 && walked.fox.apart < 2.5)) fails.push(`blobscape forest: footsteps ${JSON.stringify({ steps: walked.steps, fox: walked.fox })}`)
      else ok(`blobscape forest: the elf takes ${walked.steps} steps and the fox ${walked.fox.steps}, ${walked.fox.apart.toFixed(1)} m from it`)
      // the cloak and plait are cloth (issue #161): swinging while the elf turns, still once it has stood a while
      const swing = (seconds, forward, turn) => f.page.evaluate(async ([s, fw, t]) => {
        await window.__forest.stage.frame(s, { forward: fw, turn: t })
        return window.__forest.stage.forest.cloth.sim.energy()
      }, [seconds, forward, turn])
      const turning = await swing(0.6, 0, 1), still = await swing(8, 0, 0) // on the spot, so the elf stays where the season check expects it
      if (!(turning > 1e-3 && still < turning / 50)) fails.push(`blobscape forest: cloth ${JSON.stringify({ turning, still })}`)
      else ok(`blobscape forest: the cloak swings as the elf turns and settles when it stops (${turning.toFixed(4)} to ${still.toExponential(1)})`)
      if (await f.page.locator('[data-testid=forest-loading]').count()) fails.push('blobscape forest: the loading note stays after the forest is drawn')
      await f.page.screenshot({ path: join(shots, 'blobscape-forest.png') })
      // the Light the grass button: a fire runs through the grass beside the path, and it goes black
      const before = await look(0.1, 0)
      await f.page.getByRole('button', { name: 'Light the grass' }).click()
      const fire = await f.page.evaluate(async () => { await window.__forest.stage.frame(5, { forward: 0, turn: 0 }); return window.__forest.stage.forest.meadow.char.filter((c) => c === 1).length })
      const burnt = await look(0.1, 0)
      if (!(fire > 20 && burnt.green < before.green)) fails.push(`blobscape forest: grass fire ${JSON.stringify({ fire, green: [before.green, burnt.green] })}`)
      else ok(`blobscape forest: the grass burns (${fire} cells black, green ${before.green} to ${burnt.green})`)
      await f.page.screenshot({ path: join(shots, 'blobscape-forest-fire.png') })
      // a new season rebuilds the forest and keeps the elf where it was
      await tabClick(f.page.getByRole('button', { name: 'Autumn', exact: true }).first())
      await f.page.waitForFunction(() => window.__forest?.stage.forest?.opts.season === 'autumn', null, { timeout: 30000 }).catch(() => {})
      const autumn = await look(1.5, 0)
      if (!(Math.abs(autumn.z - walked.z) < 0.5 && autumn.growing > 20)) fails.push(`blobscape forest: autumn ${JSON.stringify(autumn)}`)
      else ok(`blobscape forest: autumn regrows ${autumn.growing} plants round the elf where it stood`)
      await f.page.screenshot({ path: join(shots, 'blobscape-forest-autumn.png') })
      await f.ctx.close()
    },
  },
  {
    name: 'pond',
    about: 'Wading Pond on both backends: the water fills the ruin, the elf wades and raises rings, the candles light it, the water mirrors the scene, the lens glows and blurs, rain falls',
    entries: ['src/blobscape/WadingPond.tsx'],
    async run({ shots, join, fails, ok, open, tabClick }) {
      for (const gl of ['', '&webgl=1']) {
        const on = gl ? 'WebGL' : 'WebGPU'
        const f = await open(`/experiments/wading-pond/?offscreen=1${gl}`, { viewport: { width: 1280, height: 900 } })
        if (!gl && !(await f.page.locator('[data-testid=pond-loading]').count())) fails.push('blobscape pond: no loading note while the engine starts')
        await f.page.waitForFunction(() => window.__pond?.stage.pond, null, { timeout: 120000 }).catch(() => {})
        // the water's teal, and the warm light of the candles
        const look = (seconds, forward, turn = 0) => f.page.evaluate(async ([s, fw, t]) => {
          const st = window.__pond.stage
          await st.frame(s, { forward: fw, turn: t })
          const cv = document.querySelector('[data-testid=pond-view]')
          const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
          let teal = 0, warm = 0
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 1] > d[i] + 20 && d[i + 2] > d[i] + 12 && d[i + 1] > 45) teal++
            if (d[i] > 170 && d[i] > d[i + 2] + 70 && d[i + 1] > d[i + 2] + 25) warm++
          }
          const p = st.pond, w = p.water
          let high = 0
          for (const h of w.h) high = Math.max(high, Math.abs(h))
          return { backend: st.backend, teal, warm, wet: w.wetCount, still: w.still, energy: w.energy, high, volume: w.volume, waded: p.waded, steps: p.walking.steps.taken, inWater: w.roomAt(p.walker.x, p.walker.z, 0.29), lights: p.lights().length }
        }, [seconds, forward, turn])
        const start = await look(0.1, 0)
        if (start.backend !== (gl ? 'webgl' : 'webgpu')) fails.push(`blobscape pond on ${on}: drawn by ${start.backend}`)
        if (!(start.wet > 3000 && start.teal > 20000 && start.warm > 30 && start.still && start.lights >= 1)) fails.push(`blobscape pond on ${on}: first frame ${JSON.stringify(start)}`)
        else ok(`blobscape pond on ${on}: still water over ${start.wet} cells (${start.teal} teal pixels), candles alight (${start.warm} warm pixels)`)
        const walked = await look(3, 1, 0.2)
        if (!(walked.waded > 2 && walked.steps > 4 && !walked.still && walked.energy > 1e-4 && walked.high > 0.005 && walked.high < 0.4 && Math.abs(walked.volume) < 1e-4 && walked.inWater)) fails.push(`blobscape pond on ${on}: after wading ${JSON.stringify(walked)}`)
        else ok(`blobscape pond on ${on}: the elf wades ${walked.waded.toFixed(1)} m in ${walked.steps} steps and raises rings ${(walked.high * 100).toFixed(1)} cm high, with no water made or lost`)
        await f.page.screenshot({ path: join(shots, `blobscape-pond${gl ? '-webgl' : ''}.png`) })
        // the water mirrors the scene: on from the start with WebGPU, by its switch without. The mirror's picture holds the
        // scene upside down (so mostly in its lower half), and the water's color changes with it
        const mirrored = () => f.page.evaluate(() => {
          const m = window.__pond.stage.pond.mirror
          if (!m) return null
          let high = 0, low = 0
          for (let j = 0; j < m.height; j++) for (let i = 0; i < m.width; i++) if (m.pixels[(j * m.width + i) * 4 + 3] > 0.5) { if (j < m.height / 2) high++; else low++ }
          return { size: m.width * m.height, high, low }
        })
        const water = () => f.page.evaluate(async () => {
          await window.__pond.stage.frame(0, { forward: 0, turn: 0 })
          const b = window.__pond.stage.pond.surface.blobs
          let sum = 0
          for (let k = 0; k < b.count * 3; k++) sum += b.color[k]
          return sum / b.count
        })
        const before = await mirrored()
        if (!!before !== !gl) fails.push(`blobscape pond on ${on}: the mirror starts ${before ? 'on' : 'off'}`)
        if (gl) await tabClick(f.page.getByLabel('The water mirrors the scene'))
        const withMirror = await water(), pic = await mirrored()
        await tabClick(f.page.getByLabel('The water mirrors the scene'))
        const without = await water(), gone = await mirrored()
        if (!(pic && pic.low > pic.size * 0.05 && pic.low > pic.high * 1.5 && gone === null && Math.abs(withMirror - without) > 1e-3)) fails.push(`blobscape pond on ${on}: mirror ${JSON.stringify({ pic, gone, withMirror, without })}`)
        else ok(`blobscape pond on ${on}: the water mirrors the scene (${Math.round((100 * (pic.low + pic.high)) / pic.size)}% of the mirror's picture, hanging downward) and stops when switched off`)
        if (!gl) await tabClick(f.page.getByLabel('The water mirrors the scene'))
        // the lens: on from the start with WebGPU, by its switches without. Glow adds light to the picture; focus blur
        // (at a wide opening, so it shows from this far off) takes fine detail out of it
        const picture = () => f.page.evaluate(async () => {
          const st = window.__pond.stage
          st.fNumber = 1.4
          await st.frame(0, { forward: 0, turn: 0 })
          const cv = document.querySelector('[data-testid=pond-view]')
          const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
          let light = 0, detail = 0
          for (let i = 0; i < d.length - 4; i += 4) { light += d[i]; detail += Math.abs(d[i + 1] - d[i + 5]) }
          return { light: light / (d.length / 4), detail: detail / (d.length / 4), glow: st.glow, blur: st.focusBlur }
        })
        const glowing = f.page.getByLabel('Flames glow'), focusing = f.page.getByLabel('Focus on the elf, blur the rest')
        const first = await picture()
        if ((first.glow > 0) !== !gl || first.blur !== !gl) fails.push(`blobscape pond on ${on}: the lens starts ${JSON.stringify(first)}`)
        if (gl) { await tabClick(glowing); await tabClick(focusing) }
        const both = await picture()
        await tabClick(focusing)
        const glowOnly = await picture()
        await tabClick(glowing)
        const plain = await picture()
        if (!(glowOnly.light > plain.light * 1.005 && both.detail < glowOnly.detail * 0.9 && plain.glow === 0 && !plain.blur)) fails.push(`blobscape pond on ${on}: lens ${JSON.stringify({ both, glowOnly, plain })}`)
        else ok(`blobscape pond on ${on}: the flames glow (${((glowOnly.light / plain.light - 1) * 100).toFixed(1)}% more light) and focus blur softens what is off the elf's distance (${Math.round((1 - both.detail / glowOnly.detail) * 100)}% less fine detail)`)
        if (!gl) { await tabClick(glowing); await tabClick(focusing) }
        await f.page.screenshot({ path: join(shots, `blobscape-pond-lens${gl ? '-webgl' : ''}.png`) })
        if (!gl) {
          // standing, the rings die down; then, on water laid flat, rain sets the whole pond moving
          const rested = await look(4, 0)
          await f.page.evaluate(() => window.__pond.stage.pond.water.rest())
          await tabClick(f.page.getByRole('button', { name: 'A shower' }))
          const rained = await look(2, 0)
          if (!(rested.energy < walked.energy / 4 && !rained.still && rained.energy > 1e-7 && rained.high > 2e-4)) fails.push(`blobscape pond: rest and rain ${JSON.stringify({ walked: walked.energy, rested: rested.energy, rained })}`)
          else ok(`blobscape pond: the rings die down when the elf stands (${walked.energy.toExponential(1)} to ${rested.energy.toExponential(1)}) and a shower stirs still water (${(rained.high * 1000).toFixed(1)} mm)`)
          if (await f.page.locator('[data-testid=pond-loading]').count()) fails.push('blobscape pond: the loading note stays after the pond is drawn')
          await f.page.screenshot({ path: join(shots, 'blobscape-pond-rain.png') })
        }
        await f.ctx.close()
      }
    },
  },
  {
    name: 'shifter',
    about: 'Shape Shifter on both backends: from one creature to the other, the slider, random partners',
    entries: ['src/blobscape/ShapeShifter.tsx'],
    async run({ shots, join, fails, ok, open, tabClick, axe }) {
      for (const gl of ['', '&webgl=1']) {
        const k = await open(`/experiments/shape-shifter/?offscreen=1&from=frog&to=fox${gl}`, { viewport: { width: 1280, height: 900 } })
        await k.page.waitForFunction(() => window.__shift && window.__shift.blobs() > 0, null, { timeout: 120000 }).catch(() => {})
        // green pixels (the frog) and orange ones (the fox: slim and furred, so fewer than the frog, and fewer still halfway, where thin fur strands are part green; the frog's yellow flank counts as a little orange too, so halfway is judged by the green it has lost); the loop holds 0.8 s on each creature and takes 3 s between
        const shot = (t) => k.page.evaluate(async (t) => {
          await window.__shift.stage.frame(t)
          const cv = document.querySelector('[data-testid=shift-view]')
          const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
          let green = 0, orange = 0
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 1] > 90 && d[i + 1] > d[i] * 1.3 && d[i + 1] > d[i + 2] * 1.5) green++
            if (d[i] > 150 && d[i] > d[i + 1] * 1.4 && d[i + 1] > d[i + 2] * 1.3) orange++
          }
          return { green, orange, amount: window.__shift.amount() }
        }, t)
        const a = await shot(0.2), mid = await shot(0.8 + 1.5), b = await shot(0.8 + 3 + 0.3)
        const on = await k.page.evaluate(() => window.__shift.stage.backend)
        const trip = (await k.page.getByTestId('shift-trip').textContent()) ?? ''
        const [near, wild] = [...trip.matchAll(/(\d+\.\d+)/g)].map((m) => Number(m[1]))
        if (!(a.amount === 0 && b.amount === 1 && Math.abs(mid.amount - 0.5) < 1e-6 && a.green > 4000 && a.orange < a.green / 4 && b.orange > 2500 && b.green < b.orange / 4 && mid.green > 300 && mid.orange > 150 && mid.green < a.green * 0.7 && near < wild * 0.8) || (gl && on !== 'webgl')) {
          fails.push(`blobscape shape shifter (${on}): ${JSON.stringify({ a, mid, b, trip })}`)
        } else ok(`blobscape shape shifter (${on}): frog (${a.green} green pixels) to fox (${b.orange} orange), both halfway (${mid.green}, ${mid.orange}); blobs travel ${near} paired by place, ${wild} at random`)
        if (!gl) {
          // the slider stops the loop and shows that amount; random partners make the trips longer
          await tabClick(k.page.getByRole('slider', { name: 'Shift', exact: true }))
          await k.page.getByRole('slider', { name: 'Shift', exact: true }).fill('0.25')
          await k.page.waitForTimeout(300)
          const held = await k.page.evaluate(() => window.__shift.amount())
          await tabClick(k.page.getByRole('button', { name: 'At random', exact: true }))
          // the wording changes at once and the numbers once the new pairs are made: wait for the numbers
          await k.page.waitForFunction((was) => { const t = document.querySelector('[data-testid=shift-trip]')?.textContent ?? ''; return /paired by place it would be/.test(t) && Number(t.match(/\d+\.\d+/)?.[0]) !== was }, near, { timeout: 60000 }).catch(() => {})
          const swapped = [...((await k.page.getByTestId('shift-trip').textContent()) ?? '').matchAll(/(\d+\.\d+)/g)].map((m) => Number(m[1]))
          if (!(held === 0.25 && swapped[0] === wild && swapped[1] === near && await k.page.getByRole('button', { name: 'Play', exact: true }).count() === 1)) fails.push(`blobscape shape shifter: slider holds ${held}, random trips ${swapped} (were ${near}, ${wild})`)
          else ok(`blobscape shape shifter: the slider stops the loop at 25%, and random partners travel ${swapped[0]}`)
          await k.page.screenshot({ path: join(shots, 'blobscape-shape-shifter.png') })
          await axe(k.page, 'blobscape shape shifter')
        }
        await k.ctx.close()
      }
    },
  },
  {
    name: 'flow',
    about: 'Sand, Snow and Goo: three lanes collapse each their own way; pour, drop a rock, poke; both backends',
    entries: ['src/blobscape/SandSnowGoo.tsx'],
    files: ['src/splat-engine/mpm.ts', 'src/splat-engine/solids.ts', 'src/blobscape/flow/flow.worker.ts', 'src/blobscape/flow/box.ts', 'src/blobscape/flow/view.ts'],
    async run({ shots, join, fails, ok, open, tabClick, axe }) {
      const ready = (page) => page.waitForFunction(() => window.__flow && window.__flow.lanes().every((l) => l.count > 0), null, { timeout: 90000 }).catch(() => {})
      // stop the clock, run the same seconds every time, then draw and count each material's pixels
      const look = (page, seconds) => page.evaluate(async (s) => {
        window.__flow.pause()
        if (s) await window.__flow.run(s)
        await window.__flow.stage.frame(0)
        const cv = document.querySelector('[data-testid=flow-view]')
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
        let sand = 0, snow = 0, goo = 0
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] > 150 && d[i] > d[i + 1] * 1.12 && d[i + 1] > d[i + 2] * 1.25) sand++
          if (d[i] > 190 && d[i + 1] > 190 && d[i + 2] > 200) snow++
          if (d[i + 1] > 120 && d[i + 1] > d[i] * 1.4 && d[i + 1] > d[i + 2] * 1.6) goo++
        }
        return { sand, snow, goo, count: window.__flow.count(), lanes: window.__flow.lanes(), thing: window.__flow.thing() }
      }, seconds)
      // all three, a column each: sand heaps, snow slumps part way and stays in a mound, goo runs widest and flattest
      for (const backend of ['', '&webgl=1']) {
        const k = await open(`/experiments/sand-snow-goo/?offscreen=1&material=all&test=collapse&ground=floor&detail=light${backend}`, { viewport: { width: 1280, height: 900 } })
        await ready(k.page)
        const r = await look(k.page, 4)
        const [sand, snow, goo] = r.lanes
        const name = `blobscape sand snow goo${backend ? ' (WebGL)' : ''}`
        if (!(r.lanes.length === 3 && r.sand > 400 && r.snow > 300 && r.goo > 400 && snow.top > sand.top + 0.04 && snow.top < 0.38 && goo.top < sand.top && goo.width > snow.width + 0.1)) fails.push(`${name}: ${JSON.stringify(r)}`)
        else ok(`${name}: after 4 s a column of sand stands ${sand.top.toFixed(2)}, snow ${snow.top.toFixed(2)} of 0.42, goo ${goo.top.toFixed(2)} and ${goo.width.toFixed(2)} wide (${r.sand}, ${r.snow}, ${r.goo} pixels)`)
        if (!backend) await k.page.screenshot({ path: join(shots, 'blobscape-sand-snow-goo-lanes.png') })
        await k.ctx.close()
      }
      // the page as it opens: the Material tab, and sand pouring onto a block
      const k = await open('/experiments/sand-snow-goo/?offscreen=1&detail=light', { viewport: { width: 1280, height: 900 } })
      await ready(k.page)
      const tab = await k.page.locator('section[aria-label=Options] [role=tab][aria-selected=true]').innerText()
      const pour = await look(k.page, 3)
      if (!(tab === 'Material' && pour.lanes.length === 1 && pour.lanes[0].material === 'sand' && pour.count > 200 && pour.sand > 400)) fails.push(`blobscape sand snow goo opens: tab ${tab}, ${JSON.stringify(pour)}`)
      else ok(`blobscape sand snow goo: opens on the Material tab with sand pouring onto a block, ${pour.count} particles after 3 s`)
      await k.page.screenshot({ path: join(shots, 'blobscape-sand-snow-goo.png') })
      // the spout stops after one pour, and Pour more starts it again; a tap pokes
      const done = await look(k.page, 6)
      const poked = await k.page.evaluate(() => { const c = document.querySelector('[data-testid=flow-view]'); return window.__flow.poke(c.clientWidth / 2, c.clientHeight * 0.6) })
      const rested = await look(k.page, 0.5)
      await tabClick(k.page.getByRole('button', { name: 'Pour more', exact: true }))
      const more = await look(k.page, 1)
      if (!(poked && rested.count === done.count && more.count > done.count + 50)) fails.push(`blobscape sand snow goo: poke ${poked}, pour ${done.count}, then ${rested.count}, more ${more.count}`)
      else ok(`blobscape sand snow goo: the spout stops at ${done.count}, a tap pokes, and Pour more brings ${more.count}`)
      // another material by its chip: a fresh box of goo, with goo's own sliders
      await tabClick(k.page.getByTestId('flow-materials').getByRole('button', { name: 'Goo', exact: true }))
      await k.page.waitForFunction(() => window.__flow.lanes()[0]?.material === 'goo' && window.__flow.count() > 0, null, { timeout: 30000 }).catch(() => {})
      const goo = await look(k.page, 2)
      const sliders = (await k.page.getByRole('slider', { name: 'Friction' }).count()) === 0 && (await k.page.getByRole('slider', { name: 'Holds its shape' }).count()) === 1
      const thick = await k.page.getByRole('slider', { name: 'Thickness' }).count()
      if (!(goo.lanes[0].material === 'goo' && goo.goo > 300 && goo.sand < 50 && sliders && thick === 1)) fails.push(`blobscape sand snow goo, goo chip: ${JSON.stringify({ goo, sliders, thick })}`)
      else ok(`blobscape sand snow goo: the Goo chip starts a box of goo with its own two sliders (${goo.goo} pixels)`)
      // drop a rock into a pile of it: it falls, lands in the goo and stays above the floor; Drop it again lifts a new one
      await tabClick(k.page.getByTestId('flow-tests').getByRole('button', { name: 'Drop something in', exact: true }))
      await tabClick(k.page.getByTestId('flow-things').getByRole('button', { name: 'Rock', exact: true }))
      await k.page.waitForFunction(() => window.__flow.count() > 0 && window.__flow.lanes()[0].top < 0.3, null, { timeout: 30000 }).catch(() => {})
      const before = await look(k.page, 0.2)
      const landed = await look(k.page, 2.5)
      await k.page.screenshot({ path: join(shots, 'blobscape-sand-snow-goo-drop.png') })
      await tabClick(k.page.getByRole('button', { name: 'Drop it again', exact: true }))
      await k.page.waitForFunction((y) => (window.__flow.thing()?.y ?? 0) > y + 0.2, landed.thing?.y ?? 0, { timeout: 10000 }).catch(() => {})
      const again = await k.page.evaluate(() => window.__flow.thing())
      if (!(before.thing === null && landed.thing && landed.thing.y < 0.3 && landed.thing.y > landed.thing.r * 0.5 && again && again.y > landed.thing.y + 0.2)) fails.push(`blobscape sand snow goo, drop: ${JSON.stringify({ before: before.thing, landed: landed.thing, again })}`)
      else ok(`blobscape sand snow goo: a rock falls into the goo and comes to rest ${landed.thing.y.toFixed(2)} over the floor; Drop it again lets go a new one`)
      await axe(k.page, 'blobscape sand snow goo')
      await k.ctx.close()
    },
  },
  {
    name: 'layout',
    core: true,
    about: 'every experiment: same two columns, its own tabs, a preview that stays in sight on a phone',
    entries: ['src/shared/Workbench.tsx', 'src/shared/ui.tsx'],
    files: ['src/shared/theme.css', 'src/blobscape/PixelDiorama.tsx', 'src/blobscape/Creature.tsx', 'src/blobscape/ForestWalk.tsx', 'src/blobscape/WadingPond.tsx', 'src/blobscape/DungeonRun.tsx', 'src/blobscape/ScanStudio.tsx', 'src/blobscape/Clockwork.tsx', 'src/blobscape/ShapeShifter.tsx', 'src/blobscape/SandSnowGoo.tsx', 'src/blobscape/BrushInk.tsx', 'src/fit-a-picture/App.tsx', 'src/splat-to-sprite/App.tsx'],
    async run({ join, fails, ok, open }) {
      const PAGES = [
        ['pixel-diorama', 'Scene,Pixels,Finish'], ['creature', 'Creature Type,Movement & Details,Export & Import'], ['forest-walk', 'Forest Type,Character Style,View'], ['wading-pond', 'Water & Light,Character Style,View'],
        ['dungeon-run', 'Game Settings,Character Style,View'], ['scan-studio', 'Import,Level & Crop,Clean,Lighting,Colliders'], ['clockwork', 'Time,View'], ['shape-shifter', 'Shift,Creatures'], ['sand-snow-goo', 'Material,Test,View'], ['brush-and-ink', 'Look,Subject'],
        ['fit-a-picture', 'Picture,Training'], ['splat-to-sprite', 'Prop Type,Pixels,Finish,View'],
      ]
      const sizes = new Set()
      let bad = 0
      for (const [id, want] of PAGES) {
        const w = await open(`/experiments/${id}/`, { viewport: { width: 1280, height: 900 } })
        // only the layout is looked at, and the page is closed while its engine is still starting: each page's own check listens for errors
        w.page.removeAllListeners('console')
        w.page.removeAllListeners('pageerror')
        await w.page.getByRole('tab').first().waitFor({ timeout: 30000 }).catch(() => {})
        const at = await w.page.evaluate(() => {
          const view = document.querySelector('[data-testid=full-screen]')?.parentElement.getBoundingClientRect()
          const panel = document.querySelector('section[aria-label=Options]')?.getBoundingClientRect()
          return {
            tabs: [...document.querySelectorAll('section[aria-label=Options] [role=tab]')].map((t) => t.textContent).join(),
            cut: [...document.querySelectorAll('section[aria-label=Options] [role=tab] span')].filter((e) => e.scrollWidth > e.clientWidth).length,
            view: view ? `${Math.round(view.width)}×${Math.round(view.height)}` : 'none', panel: panel ? Math.round(panel.width) : 0, beside: !!view && !!panel && panel.left > view.right,
          }
        })
        await w.page.setViewportSize({ width: 390, height: 700 })
        // the page lays itself out again for the phone width: give it time to settle before measuring (a page that stays too wide still fails)
        await w.page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 3000 }).catch(() => {})
        await w.page.evaluate(() => window.scrollTo(0, 420))
        await w.page.waitForTimeout(150)
        const phone = await w.page.evaluate(() => {
          const r = document.querySelector('[data-testid=full-screen]')?.parentElement.getBoundingClientRect()
          return { stuck: !!r && r.top >= 0 && r.bottom <= innerHeight && r.height > 200, wide: document.documentElement.scrollWidth - innerWidth }
        })
        sizes.add(`${at.view}+${at.panel}`)
        if (at.tabs !== want || at.cut || !at.beside || !phone.stuck || phone.wide > 0) { bad++; fails.push(`layout ${id}: ${JSON.stringify({ ...at, ...phone })}`) }
        await w.ctx.close()
      }
      if (sizes.size !== 1) fails.push(`layout: the columns differ between experiments (${[...sizes].join(', ')})`)
      else if (!bad) ok(`layout: all ${PAGES.length} experiments have their tabs beside a preview of the same size (${[...sizes][0]}), which stays in sight on a phone`)
    },
  },
]
