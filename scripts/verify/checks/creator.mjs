// Scene Creator (epic #329): the workspace that opens a scene split into a land and props.
import { root } from '../lib.mjs'

/** A .glb of a whole scene (#380): a slab of ground, a box of a house on it and an open sheet of a sign, under one root. */
function farmGlb() {
  const views = [], accessors = [], meshes = [], chunks = []
  let at = 0
  const add = (arr) => { const b = new Uint8Array(arr.buffer); views.push({ buffer: 0, byteOffset: at, byteLength: b.byteLength }); chunks.push(b); at += b.byteLength; return views.length - 1 }
  const mesh = (pos, idx, color) => {
    const pv = add(new Float32Array(pos)), iv = add(new Uint32Array(idx))
    const lo = [0, 1, 2].map((k) => Math.min(...pos.filter((_, i) => i % 3 === k))), hi = [0, 1, 2].map((k) => Math.max(...pos.filter((_, i) => i % 3 === k)))
    accessors.push({ bufferView: pv, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: lo, max: hi }, { bufferView: iv, componentType: 5125, count: idx.length, type: 'SCALAR' })
    meshes.push({ primitives: [{ attributes: { POSITION: accessors.length - 2 }, indices: accessors.length - 1, material: meshes.length }] })
    return { color }
  }
  const box = (x0, y0, z0, x1, y1, z1) => {
    const p = [], idx = []
    for (let i = 0; i < 8; i++) p.push(i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0)
    for (const [a, b, c, d] of [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]) idx.push(a, b, c, a, c, d)
    return [p, idx]
  }
  const mats = [mesh(...box(-4, -0.5, -4, 4, 0, 4), [0.2, 0.5, 0.15]), mesh(...box(-1, 0, -1, 1, 2, 1), [0.8, 0.3, 0.2]), mesh([2, 0, 0, 3, 0, 0, 3, 1, 0, 2, 1, 0], [0, 1, 2, 0, 2, 3], [0.9, 0.9, 0.3])]
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Farm', children: [1, 2, 3] }, { name: 'Field', mesh: 0 }, { name: 'Barn', mesh: 1, translation: [1, 0, 0] }, { name: 'Sign', mesh: 2 }],
    meshes, materials: mats.map((m) => ({ pbrMetallicRoughness: { baseColorFactor: [...m.color, 1] } })),
    accessors, bufferViews: views, buffers: [{ byteLength: at }],
  }
  let text = new TextEncoder().encode(JSON.stringify(json))
  const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20); padded.set(text); text = padded
  const out = new Uint8Array(20 + text.length + 8 + at)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true)
  dv.setUint32(12, text.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(text, 20)
  dv.setUint32(20 + text.length, at, true); dv.setUint32(24 + text.length, 0x004e4942, true)
  let o = 28 + text.length
  for (const c of chunks) { out.set(c, o); o += c.byteLength }
  return Buffer.from(out)
}

/** A small splat scan in the .splat layout (#381): a level tabletop of flat blobs with a block standing on it, a little tipped, and a floater. */
function deskSplat() {
  const rows = []
  const tip = 0.12 // radians about x, so leveling has something to undo
  const put = (x, y, z, s, rgb) => {
    const c = Math.cos(tip), sn = Math.sin(tip)
    rows.push([x, y * c - z * sn, y * sn + z * c, s, rgb])
  }
  for (let i = 0; i < 70; i++) for (let j = 0; j < 70; j++) put(-1 + i / 35, 0, -1 + j / 35, 0.02, [150, 110, 70])
  for (let i = 0; i < 14; i++) for (let j = 0; j < 14; j++) for (let k = 0; k < 14; k++) if ([i, j, k].some((v) => v === 0 || v === 13)) put(-0.2 + i / 35, 0.02 + j / 35, -0.2 + k / 35, 0.02, [60, 90, 170])
  put(0.6, 1.5, 0.6, 0.05, [255, 255, 255])
  const out = Buffer.alloc(rows.length * 32)
  rows.forEach(([x, y, z, s, rgb], n) => {
    const o = n * 32
    out.writeFloatLE(x, o); out.writeFloatLE(y, o + 4); out.writeFloatLE(z, o + 8)
    out.writeFloatLE(s, o + 12); out.writeFloatLE(s, o + 16); out.writeFloatLE(s * 0.3, o + 20)
    out[o + 24] = rgb[0]; out[o + 25] = rgb[1]; out[o + 26] = rgb[2]; out[o + 27] = 255
    out[o + 28] = 255; out[o + 29] = 128; out[o + 30] = 128; out[o + 31] = 128
  })
  return out
}

/** A small scene description with two things marked as props. */
const TWO_POSTS = '{"name":"Two posts","loop":4,"palette":["#1f2d55","#4a6fae","#1b3a2a","#c79a63","#f4f1e4","#0a0f1e"],"camera":{"target":[0,0.3,0],"distance":3,"azimuth":18,"elevation":13},"bones":[{"name":"post","at":[-0.4,0,0],"prop":"Post"},{"name":"lamp","at":[0.4,0,0],"prop":"Lamp"}],"parts":[{"paint":"#1f2d55","shape":{"kind":"box","at":[0,-0.05,0],"half":[1,0.05,1]}},{"bone":"post","paint":"#4a6fae","shape":{"kind":"box","at":[-0.4,0.3,0],"half":[0.06,0.3,0.06]}},{"bone":"lamp","paint":"#1b3a2a","shape":{"kind":"sphere","at":[0.4,0.2,0],"r":0.2}}]}'

// a hut as an .obj: a box of walls and a roof, each closed, in two colors from its .mtl
const HUT_OBJ = `mtllib hut.mtl
v -1 0 -1
v 1 0 -1
v 1 0 1
v -1 0 1
v -1 1.2 -1
v 1 1.2 -1
v 1 1.2 1
v -1 1.2 1
v 0 2 -1.1
v 0 2 1.1
v -1.2 1.2 -1.1
v 1.2 1.2 -1.1
v 1.2 1.2 1.1
v -1.2 1.2 1.1
usemtl walls
f 1 2 3 4
f 5 8 7 6
f 1 5 6 2
f 2 6 7 3
f 3 7 8 4
f 4 8 5 1
usemtl roof
f 11 12 9
f 13 14 10
f 11 9 10 14
f 12 13 10 9
f 11 14 13 12
`
// a tent with no floor: open, so it is covered in blobs rather than cut
const TENT_OBJ = `v -0.8 0 -1
v 0.8 0 -1
v 0.8 0 1
v -0.8 0 1
v 0 1.1 -1
v 0 1.1 1
f 1 5 6 4
f 2 3 6 5
f 1 2 5
f 4 6 3
`
const HUT_MTL = `newmtl walls
Kd 0.85 0.75 0.55
newmtl roof
Kd 0.6 0.15 0.1
`

export default [
  {
    name: 'scene-creator',
    core: true,
    about: 'Scene Creator: the windmill opens split into its hill and ten props, cut in a worker and drawn; a scene that cannot be split opens whole and says why; a bare land opens alone; listed for search',
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
        const robots = await c.page.locator('meta[name=robots]').count()
        await c.page.screenshot({ path: join(shots, 'blobscape-scene-creator.png') })
        if (!(up && items[0]?.kind === 'land' && props === 10 && counted === '10' && listed === 11 && green > 800 && robots === 0)) fails.push(`blobscape scene creator: windmill ${JSON.stringify({ up, land: items[0], props, counted, listed, green, robots })}`)
        else ok(`blobscape scene creator: the windmill opens as its hill and ${props} props, listed beside the picture and drawn (${green} green pixels in 160 × 120); the page is listed`)
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
    about: 'Scene Creator, Props: the giant turkey found by search and added to the windmill hill, another prop dragged onto the view, the land swapped under them, a pack of kit pieces set down; the counts and the picture follow, and undo takes each back',
    entries: ['src/blobscape/SceneCreator.tsx', 'src/blobscape/creator/adding.ts', 'src/blobscape/creator/library.ts', 'src/blobscape/creator/packs.ts', 'src/blobscape/creator/kit.ts'],
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
      // a pack of kit pieces narrows the cards to it and sets the whole of it down in one step
      await p.getByRole('group', { name: 'Packs' }).getByRole('button', { name: 'Old ruins' }).click()
      const packCards = await p.locator('[data-testid^=creator-card-]').count()
      await p.getByTestId('creator-pack-add').click()
      await ready()
      const packed = await state(), withPack = await picture()
      const kit = packed.props.slice(swapped.props.length).map((x) => x.prop)
      steps.push(['pack narrows the cards', packCards === 6],
        ['pack set down', kit.length === 6 && kit.every((id) => id.startsWith('kit-'))],
        ['picture follows the pack', differ(onTurf, withPack) > 40])
      await p.screenshot({ path: join(shots, 'blobscape-scene-creator-pack.png') })
      // a creature from Splat Creatures (#366): built, sized for the scene and playing its own move
      await p.getByRole('group', { name: 'Packs' }).getByRole('button', { name: 'Everything' }).click()
      await p.getByRole('searchbox', { name: 'Find a prop or land' }).fill('fox')
      await p.getByTestId('creator-card-creature-fox').click()
      await ready()
      const foxed = await state(), withFox = await picture()
      const fox = foxed.props[foxed.props.length - 1]
      const later = await p.evaluate(async () => { const s = window.__creator.stage; await s.frame(2.7); await s.frame(2.7); return null }).then(() => picture())
      steps.push(['fox set down', fox?.prop === 'creature-fox' && fox.size < 1 && foxed.blobs > packed.blobs],
        ['picture follows the fox', differ(withPack, withFox) > 20],
        ['the fox moves', differ(withFox, later) > 5])
      await p.screenshot({ path: join(shots, 'blobscape-scene-creator-creature.png') })
      await p.getByRole('searchbox', { name: 'Find a prop or land' }).fill('')
      // a model of your own (#367): the puffer's rigged splat .glb, playing its clip and its blend shapes
      await p.getByTestId('creator-model-file').setInputFiles(join(root, 'public/rigged-splats/puffer.glb'))
      const opened = await p.waitForFunction(() => /^Opened /.test(document.querySelector('[data-testid=creator-model-note]')?.textContent ?? ''), null, { timeout: 30000 }).then(() => true, () => false)
      await ready()
      const modeled = await state(), withModel = await picture()
      const model = modeled.props[modeled.props.length - 1]
      const puffed = await p.evaluate(async () => { const s = window.__creator.stage; await s.frame(4.1); await s.frame(4.1); return null }).then(() => picture())
      steps.push(['model opened', opened && /^model-/.test(String(model?.prop)) && modeled.blobs > foxed.blobs],
        ['picture follows the model', differ(withFox, withModel) > 20],
        ['the model moves', differ(withModel, puffed) > 5])
      await p.screenshot({ path: join(shots, 'blobscape-scene-creator-model.png') })
      // a still mesh (#368): a little house as an .obj with its .mtl, cut on the scene's grid in its own colors
      await p.getByTestId('creator-model-file').setInputFiles([
        { name: 'hut.obj', mimeType: 'text/plain', buffer: Buffer.from(HUT_OBJ) },
        { name: 'hut.mtl', mimeType: 'text/plain', buffer: Buffer.from(HUT_MTL) },
      ])
      const hutOpened = await p.waitForFunction(() => /^Opened Hut/.test(document.querySelector('[data-testid=creator-model-note]')?.textContent ?? ''), null, { timeout: 30000 }).then(() => true, () => false)
      await ready()
      const hutted = await state(), withHut = await picture()
      steps.push(['mesh opened', hutOpened && hutted.props.length === modeled.props.length + 1 && hutted.blobs > modeled.blobs],
        ['picture follows the mesh', differ(withModel, withHut) > 20])
      await p.screenshot({ path: join(shots, 'blobscape-scene-creator-mesh.png') })
      // an open mesh (#369): a tent with no floor can't be cut as a solid, so it is covered in blobs
      await p.getByTestId('creator-model-file').setInputFiles({ name: 'tent.obj', mimeType: 'text/plain', buffer: Buffer.from(TENT_OBJ) })
      const tentOpened = await p.waitForFunction(() => /^Opened Tent: [\d,]+ blobs over its surface/.test(document.querySelector('[data-testid=creator-model-note]')?.textContent ?? ''), null, { timeout: 30000 }).then(() => true, () => false)
      await ready()
      const tented = await state(), withTent = await picture()
      steps.push(['open mesh covered', tentOpened && tented.props.length === hutted.props.length + 1 && tented.blobs > hutted.blobs + 10000],
        ['picture follows the tent', differ(withHut, withTent) > 20])
      // undo takes the tent, the mesh, the model, the fox, the pack, the land, the drop and the turkey back
      for (let i = 0; i < 8; i++) await p.getByTestId('creator-undo').click()
      await ready()
      const back = await state()
      steps.push(['undone', back.land === start.land && JSON.stringify(back.props) === JSON.stringify(start.props)])
      const room = await p.getByTestId('creator-room').innerText().catch(() => '')
      const bad = steps.filter(([, good]) => !good).map(([name]) => name)
      if (bad.length) fails.push(`blobscape scene creator props: ${bad.join(', ')} failed ${JSON.stringify({ start: start.props.length, turkey: turkey.props.length, dropped: dropped.props.length, land: swapped.land, room })}`)
      else ok(`blobscape scene creator props: the turkey found and added to the windmill hill, a haystack dropped on the view, the land swapped to turf, the old ruins pack set down, the fox from Splat Creatures added and moving, the puffer's .glb opened as a model and moving, an .obj hut cut on the grid, an open tent covered in blobs, counts and picture following, and all undone ("${room}")`)
    },
  },
  {
    name: 'scene-creator-light',
    about: 'Scene Creator, Light: turning the baked sun changes the lit side, a live sun at night darkens the scene and a lamp brightens what is round it, on both backends, each step undone',
    entries: ['src/blobscape/SceneCreator.tsx', 'src/blobscape/creator/lighting.ts', 'src/splat-engine/project.ts'],
    async run({ shots, join, fails, ok, open, axe }) {
      for (const webgl of [false, true]) {
        const tag = webgl ? 'WebGL' : 'WebGPU'
        const c = await open(`/scene-creator/?offscreen=1&detail=chunky&mode=light${webgl ? '&webgl=1' : ''}`, { viewport: { width: 1280, height: 900 } })
        const p = c.page
        const ready = () => p.waitForFunction(() => window.__creator?.ready(), null, { timeout: 180000 }).then(() => true, () => false)
        if (!(await ready())) { fails.push(`blobscape scene creator light (${tag}): the windmill never opened`); continue }
        // the picture, small; and how bright it is round a point of the view (CSS pixels)
        const picture = () => p.evaluate(async () => {
          const s = window.__creator.stage
          await s.frame(1); await s.frame(1)
          const cv = document.querySelector('[data-testid=creator-view]')
          const t = document.createElement('canvas'); t.width = cv.clientWidth; t.height = cv.clientHeight
          const g = t.getContext('2d', { willReadFrequently: true }); g.drawImage(cv, 0, 0, t.width, t.height)
          return { w: t.width, h: t.height, px: Array.from(g.getImageData(0, 0, t.width, t.height).data) }
        })
        const differ = (a, b) => { let n = 0; for (let i = 0; i < a.px.length; i += 16) if (Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2]) > 30) n++; return n }
        const around = (f, x, y, r = 60) => { let sum = 0, n = 0; for (let j = Math.max(0, y - r); j < Math.min(f.h, y + r); j += 2) for (let i = Math.max(0, x - r); i < Math.min(f.w, x + r); i += 2) { const k = (j * f.w + i) * 4; sum += f.px[k] + f.px[k + 1] + f.px[k + 2]; n++ } return sum / n / 3 }
        const light = () => p.evaluate(() => window.__creator.light())
        const steps = []
        const first = await picture()
        // the baked sun turned round: cut again, and the lit side changes
        const sunFrom = p.getByRole('slider', { name: 'Sun from' })
        await sunFrom.focus(); await sunFrom.press('Home')
        await p.waitForTimeout(400); await ready()
        const turned = await picture()
        steps.push(['sun turns', (await light())?.sun?.turn === -180 && differ(first, turned) > 400])
        // a live sun at night: the picture goes dark
        await p.getByRole('button', { name: 'Live, by the hour' }).click()
        const hour = p.getByRole('slider', { name: 'Time of day' })
        await hour.focus(); await hour.press('Home')
        await p.waitForTimeout(400); await ready()
        const night = await picture()
        const mid = (f) => around(f, Math.round(f.w / 2), Math.round(f.h * 0.55), 200)
        steps.push(['night falls', (await light())?.live?.hour === 0 && mid(night) < mid(turned) - 8])
        // a lamp, set down in the middle of the view, lights what is round it
        await p.getByTestId('creator-add-lamp').click()
        const strength = p.getByRole('slider', { name: 'Strength' })
        await strength.focus(); await strength.press('End')
        const reach = p.getByRole('slider', { name: 'Reach' })
        await reach.focus(); await reach.press('End')
        await p.waitForTimeout(200)
        const lamp = await p.evaluate(() => window.__creator.lampAt(0))
        const lampLit = await picture()
        const lx = Math.round(lamp?.x ?? 0), ly = Math.round(lamp?.y ?? 0)
        steps.push(['lamp lights round it', !!lamp && around(lampLit, lx, ly) > around(night, lx, ly) + 6])
        await p.screenshot({ path: join(shots, `blobscape-scene-creator-light${webgl ? '-webgl' : ''}.png`) })
        if (!webgl) await axe(p, 'blobscape scene creator light')
        // undo takes it all back
        for (let k = 0; k < 6; k++) await p.getByTestId('creator-undo').click().catch(() => {})
        steps.push(['undone', (await light()) === undefined])
        const bad = steps.filter(([, good]) => !good).map(([name]) => name)
        if (bad.length) fails.push(`blobscape scene creator light (${tag}): ${bad.join(', ')} failed ${JSON.stringify({ diff: differ(first, turned), mid: [mid(turned), mid(night)], lamp: lamp && [around(night, lx, ly), around(lampLit, lx, ly)] })}`)
        else ok(`blobscape scene creator light (${tag}): the turned sun changes the lit side, a live night darkens it, a lamp lights what is round it, all undone`)
      }
    },
  },
  {
    name: 'scene-creator-style',
    about: 'Scene Creator, Style and Export: oil, then cel shading (cut again with no light baked in), then pixel art in another palette each change the picture; a frame saves as a PNG, the scene as a rigged .glb the engine reads, and a two-stop camera path as an animated PNG of every frame',
    entries: ['src/blobscape/SceneCreator.tsx', 'src/blobscape/creator/styling.ts', 'src/blobscape/styleSettings.ts', 'src/blobscape/StyleControls.tsx', 'src/blobscape/diorama/useExport.tsx', 'src/blobscape/creator/cut.ts', 'src/blobscape/creator/engineFile.ts'],
    async run({ shots, join, fails, ok, open, axe }) {
      const c = await open('/scene-creator/?offscreen=1&detail=chunky&mode=style', { viewport: { width: 1280, height: 900 } })
      const p = c.page
      const ready = () => p.waitForFunction(() => window.__creator?.ready(), null, { timeout: 180000 }).then(() => true, () => false)
      if (!(await ready())) { fails.push('blobscape scene creator style: the windmill never opened'); return }
      const picture = () => p.evaluate(async () => {
        const s = window.__creator.stage
        await s.frame(1); await s.frame(1)
        const t = document.createElement('canvas'); t.width = 96; t.height = 72
        const g = t.getContext('2d', { willReadFrequently: true }); g.drawImage(document.querySelector('[data-testid=creator-view]'), 0, 0, 96, 72)
        return Array.from(g.getImageData(0, 0, 96, 72).data)
      })
      const differ = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++; return n }
      const chip = (name) => p.getByTestId('creator-styles').getByRole('button', { name, exact: true }).click()
      const steps = [], diffs = {}
      const first = await picture()
      await chip('Oil')
      await p.waitForTimeout(300)
      const oil = await picture()
      diffs.oil = differ(first, oil)
      steps.push(['oil', (await p.evaluate(() => window.__creator.style)) === 'oil' && diffs.oil > 200])
      await chip('Cel shading')
      const plain = await p.waitForFunction(() => window.__creator.ready() && window.__creator.plain(), null, { timeout: 180000 }).then(() => true, () => false)
      const cel = await picture()
      diffs.cel = differ(oil, cel)
      steps.push(['cel shading cut plain', plain && diffs.cel > 200])
      await chip('Pixel art')
      await p.waitForFunction(() => window.__creator.ready() && !window.__creator.plain(), null, { timeout: 180000 }).catch(() => {})
      const art = await picture()
      await p.getByTestId('creator-palettes').getByRole('button', { name: '1-bit' }).click()
      await p.waitForTimeout(300)
      const onebit = await picture()
      diffs.palette = differ(art, onebit)
      steps.push(['palette', diffs.palette > 200])
      await p.screenshot({ path: join(shots, 'blobscape-scene-creator-style.png') })
      await axe(p, 'blobscape scene creator style')
      // Export: a frame, then a path of two stops a second apart, as an animated PNG at the art's own size
      await p.getByRole('tab', { name: 'Export' }).click()
      const [frame] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.getByTestId('creator-save-frame').click()])
      const frameName = frame.suggestedFilename()
      const frameBytes = (await import('node:fs')).readFileSync(await frame.path())
      steps.push(['frame saved', frameName === 'scene-creator-windmill.png' && frameBytes.length > 1000])
      // for the engine (#387): one rigged .glb with the loop, read back by the engine's own reader
      const [eng] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.getByTestId('creator-save-engine').click()])
      const { readRiggedGlb } = await import(join(root, 'src/splat-engine/glb.ts'))
      let engine = {}
      try {
        const r = readRiggedGlb(new Uint8Array((await import('node:fs')).readFileSync(await eng.path())))
        engine = { name: eng.suggestedFilename(), blobs: r.blobs.count, shown: await p.evaluate(() => window.__creator.blobs()), bones: r.skeleton.count, clips: r.clips.map((c) => c.name) }
      } catch (e) { engine = { error: String(e) } }
      steps.push(['saved for the engine', /\.glb$/.test(engine.name ?? '') && engine.blobs === engine.shown && engine.bones > 11 && engine.clips?.join() === 'loop'])
      await p.getByTestId('creator-add-stop').click()
      const view = p.getByTestId('creator-view')
      await view.focus()
      for (let k = 0; k < 3; k++) await view.press('ArrowLeft')
      await p.getByTestId('creator-add-stop').click()
      const between = p.getByRole('slider', { name: 'Between stops' })
      await between.focus(); await between.press('Home')
      await p.getByRole('button', { name: 'Animated PNG' }).click()
      await p.getByRole('button', { name: '1×' }).click()
      const [path] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), p.getByTestId('creator-record-path').click()])
      const png = (await import('node:fs')).readFileSync(await path.path())
      const at = png.indexOf('acTL'), frames = at > 0 ? png.readUInt32BE(at + 4) : 0
      steps.push(['path saved', path.suggestedFilename() === 'scene-creator-windmill-path.png' && frames === 13])
      const bad = steps.filter(([, good]) => !good).map(([name]) => name)
      if (bad.length) fails.push(`blobscape scene creator style: ${bad.join(', ')} failed ${JSON.stringify({ diffs, frameName, frames, engine, note: await p.evaluate(() => window.__creator.exportNote()) })}`)
      else ok(`blobscape scene creator style: oil, cel shading (cut plain) and a 1-bit palette each change the picture; a frame, the scene for the engine (${engine.blobs} blobs, ${engine.bones} bones) and a ${frames}-frame camera path save`)
    },
  },
  {
    name: 'scene-creator-storage',
    core: true,
    about: 'Scene Creator, kept in the browser: an edit is kept a moment later and is there after a reload; copied, renamed and deleted in Your scenes; a model of your own kept and carried by the file; saved as a file and opened in a fresh browser; a broken file says where; nothing asked of another site',
    entries: ['src/blobscape/SceneCreator.tsx', 'src/blobscape/creator/store.ts', 'src/blobscape/creator/models.ts', 'src/blobscape/creator/described.ts', 'src/blobscape/creator/sceneModel.ts', 'src/blobscape/creator/scanLand.ts', 'src/blobscape/creator/link.ts', 'src/splat-engine/meshFile.ts'],
    async run({ shots, join, fails, ok, open, axe, tabClick }) {
      const fs = await import('node:fs')
      const outside = []
      const watch = (page) => page.on('request', (r) => { if (!/^(http:\/\/(localhost|127\.0\.0\.1)|data:|blob:)/.test(r.url())) outside.push(r.url()) })
      const at = '/scene-creator/?offscreen=1&detail=chunky'
      const c = await open(at, { viewport: { width: 1280, height: 900 } })
      const p = c.page
      watch(p)
      const props = (page) => page.evaluate(() => window.__creator?.props().length ?? -1)
      const opened = (page, n) => page.waitForFunction((n) => window.__creator?.ready() && window.__creator.props().length === n, n, { timeout: 180000 }).then(() => true, () => false)
      const kept = (page, n) => page.waitForFunction((n) => document.querySelectorAll('[data-testid=creator-saved-item]').length === n, n, { timeout: 15000 }).then(() => true, () => false)
      const steps = []
      if (!(await opened(p, 10))) { fails.push('blobscape scene creator storage: the windmill never opened'); return }
      // opening a scene keeps nothing; the first edit keeps it
      await p.waitForTimeout(1500)
      steps.push(['nothing kept before an edit', (await p.getByTestId('creator-saved-item').count()) === 0])
      await p.getByTestId('creator-items').getByRole('button').first().click()
      const view = p.getByTestId('creator-view')
      await view.focus()
      await view.press('Delete')
      steps.push(['kept after an edit', await kept(p, 1)])
      steps.push(['address names it', /project=/.test(await p.evaluate(() => location.search))])
      // a reload with a bare address reopens it
      await p.goto(new URL(at, p.url()).href)
      steps.push(['back after a reload', await opened(p, 9)])
      await p.getByRole('tab', { name: 'Scene' }).click()
      // copy, rename the copy, delete it
      await p.getByRole('button', { name: /^Copy / }).first().click()
      steps.push(['copied', await kept(p, 2)])
      await p.getByRole('button', { name: /^Rename .* copy$/ }).click()
      await p.getByTestId('creator-rename-box').fill('Hill without a fence')
      await p.getByTestId('creator-rename-box').press('Enter')
      steps.push(['renamed', await p.getByTestId('creator-saved-list').getByText('Hill without a fence').waitFor({ timeout: 5000 }).then(() => true, () => false)])
      await p.getByRole('button', { name: 'Delete Hill without a fence' }).click()
      await p.getByTestId('creator-delete-yes').click()
      steps.push(['deleted', await kept(p, 1)])
      // a link holds the whole scene after its # (#386): it opens in a fresh browser, kept nowhere until changed
      await tabClick(p.getByTestId('creator-copy-link'))
      const link = await p.getByTestId('creator-link').inputValue({ timeout: 10000 }).catch(() => '')
      steps.push(['a link is given', /#shared=[\w-]+$/.test(link)])
      if (link) {
        const u = new URL(link)
        const l = await open(`${u.pathname}?offscreen=1&detail=chunky${u.hash}`, { viewport: { width: 1280, height: 900 } })
        watch(l.page)
        steps.push(['the link opens in a fresh browser', await opened(l.page, 9)])
        await l.page.waitForTimeout(1500)
        steps.push(['a link keeps nothing before an edit', (await l.page.getByTestId('creator-saved-item').count()) === 0 && /#shared=/.test(await l.page.evaluate(() => location.hash))])
        await l.ctx.close()
      }
      await p.screenshot({ path: join(shots, 'blobscape-scene-creator-storage.png') })
      await axe(p, 'blobscape scene creator storage')
      // a model of your own (#370): kept in the browser with the scene, and carried by its file
      await p.getByRole('tab', { name: 'Props' }).click()
      await p.getByTestId('creator-model-file').setInputFiles(join(root, 'public/rigged-splats/puffer.glb'))
      steps.push(['model added', await opened(p, 10)])
      const withModel = await p.evaluate(() => window.__creator.blobs())
      // kept once it has settled (its colors join the palette as it arrives, which changes what is kept)
      await p.waitForFunction(() => window.__creator.kept(), null, { timeout: 15000 }).catch(() => {})
      await p.waitForTimeout(500)
      await p.goto(new URL(at, p.url()).href)
      steps.push(['model back after a reload', await opened(p, 10)])
      // the model opens again from the shelf and its prop is cut again with it, not left a speck
      steps.push(['model cut again', await p.waitForFunction((n) => window.__creator.ready() && window.__creator.blobs() >= n - 50, withModel, { timeout: 60000 }).then(() => true, () => false)])
      await p.getByRole('tab', { name: 'Props' }).click()
      steps.push(['model listed after a reload', await p.getByRole('button', { name: /^Add Blob pufferfish/ }).waitFor({ timeout: 15000 }).then(() => true, () => false)])
      await p.getByRole('tab', { name: 'Scene' }).click()
      // a file, opened in a fresh browser
      const [down] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.getByTestId('creator-save-file').click()])
      const file = await down.path()
      const text = fs.readFileSync(file, 'utf8')
      let parsed
      try { parsed = JSON.parse(text) } catch { parsed = undefined }
      steps.push(['file saved', down.suggestedFilename().endsWith('.blobscape.json') && parsed?.kind === 'blobscape-project' && parsed.props.length === 10 && parsed.models?.length === 1])
      const f = await open(`${at}&scene=windmill`, { viewport: { width: 1280, height: 900 } })
      watch(f.page)
      await opened(f.page, 10)
      await f.page.getByTestId('creator-file').setInputFiles({ name: down.suggestedFilename(), mimeType: 'application/json', buffer: Buffer.from(text) })
      steps.push(['file opened elsewhere', await opened(f.page, 10)])
      steps.push(['opened file kept', await kept(f.page, 1)])
      await f.page.getByRole('tab', { name: 'Props' }).click()
      steps.push(['file brought its model', await f.page.getByRole('button', { name: /^Add Blob pufferfish/ }).waitFor({ timeout: 15000 }).then(() => true, () => false)])
      await f.page.getByRole('tab', { name: 'Scene' }).click()
      await f.page.getByTestId('creator-file').setInputFiles({ name: 'broken.blobscape.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...parsed, loop: 1 })) })
      const said = await f.page.getByTestId('creator-file-problems').innerText().catch(() => '')
      steps.push(['broken file says where', /loop: must be/.test(said) && (await props(f.page)) === 10])
      // a scene description, as Diorama opens, comes in as a project of its two marked props (#379)
      await f.page.getByTestId('creator-file').setInputFiles({ name: 'two-posts.json', mimeType: 'application/json', buffer: Buffer.from(TWO_POSTS) })
      steps.push(['a description opens as a project', await opened(f.page, 2) && await f.page.evaluate(() => window.__creator.props().map((p) => typeof p.prop === 'string' ? p.prop : p.prop.name).join()) === 'Post,Lamp'])
      // a model of a whole scene: each thing at the top of its tree a prop, the open sheet covered in blobs (#380)
      await f.page.getByTestId('creator-file').setInputFiles({ name: 'farm.glb', mimeType: 'model/gltf-binary', buffer: farmGlb() })
      steps.push(['a whole-scene model opens as its things', await opened(f.page, 3) && await f.page.evaluate(() => window.__creator.props().every((p) => typeof p.prop === 'string' && /^model-.*-\d+$/.test(p.prop)))])
      await f.page.waitForFunction(() => window.__creator.blobs() > 5000, undefined, { timeout: 60000 }).catch(() => {})
      await f.page.evaluate(async () => { const s = window.__creator.stage; await s.frame(1); await s.frame(1) })
      await f.page.screenshot({ path: join(shots, 'blobscape-scene-creator-scene-model.png') })
      // a splat scan as the land: leveled, a prop set on it stands on its tabletop (#381)
      await f.page.getByTestId('creator-file').setInputFiles({ name: 'desk.splat', mimeType: 'application/octet-stream', buffer: deskSplat() })
      const scanned = await f.page.waitForFunction(() => window.__creator?.ready() && /^model-/.test(String(window.__creator.land())) && window.__creator.props().length === 0, undefined, { timeout: 60000 }).then(() => true, () => false)
      await f.page.evaluate(async () => { const s = window.__creator.stage; await s.frame(1); await s.frame(1) })
      await f.page.screenshot({ path: join(shots, 'blobscape-scene-creator-scan-land.png') })
      steps.push(['a splat scan opens as the land', scanned && (await f.page.evaluate(() => window.__creator.blobs())) > 4000])
      steps.push(['nothing asked of another site', outside.length === 0])
      const bad = steps.filter(([, good]) => !good).map(([name]) => name)
      if (bad.length) fails.push(`blobscape scene creator storage: ${bad.join(', ')} failed ${JSON.stringify({ outside: outside.slice(0, 3), said })}`)
      else ok('blobscape scene creator storage: an edit is kept and back after a reload; copy, rename and delete work; a file reopens in a fresh browser, a broken one says where, a link opens the scene in a fresh browser, a scene description and a whole-scene model open as their props, and a splat scan as the land; no other site asked')
    },
  },
  {
    name: 'scene-creator-agent',
    about: 'WebMCP on Scene Creator: its tools are registered, an assistant can describe the scene, add a prop, move it, set the light and the style and undo, and a bad ask is refused in words',
    entries: ['src/blobscape/SceneCreator.tsx', 'src/blobscape/creator/agentTools.ts'],
    async run({ fails, ok, open }) {
      const c = await open('/', { viewport: { width: 1280, height: 900 } })
      const p = c.page
      await p.evaluate(() => {
        const tools = (window.__tools = new Map())
        Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool(t, o) { tools.set(t.name, t); o?.signal?.addEventListener('abort', () => tools.delete(t.name)); return Promise.resolve() } } })
      })
      // in-app, so the stand-in stays (as the header's link goes, with the stage drawing off screen as verify needs)
      await p.evaluate(() => { history.pushState(null, '', '/scene-creator/?offscreen=1'); window.dispatchEvent(new Event('blobscape:navigate')) })
      const up = await p.waitForFunction(() => window.__tools?.has('describe_scene'), null, { timeout: 60000 }).then(() => true, () => false)
      const call = (name, input = {}) => p.evaluate(([n, i]) => window.__tools.get(n).execute(i), [name, input])
      const steps = []
      if (!up) { fails.push('blobscape scene creator agent: no tools were registered'); return }
      await p.waitForFunction(() => document.querySelector('[data-testid=creator-prop-count]'), null, { timeout: 180000 }).catch(() => {})
      const count = () => p.getByTestId('creator-prop-count').innerText().catch(() => '')
      const described = await call('describe_scene')
      steps.push(['describe', /Props \(10 of 40\)/.test(described) && /\b0\. /.test(described)])
      const added = await call('add_prop', { prop: 'giant-turkey', at: [0.3, 0.2] })
      steps.push(['add', /^Added/.test(added) && (await count()) === '11'])
      steps.push(['move', /turned 90°/.test(await call('move_prop', { index: 10, turn: 90 }))])
      steps.push(['light', /^Light changed/.test(await call('set_light', { weather: 'snow' }))])
      steps.push(['style', /oil/.test(await call('set_style', { style: 'oil' })) && /style=oil/.test(await p.evaluate(() => location.search))])
      steps.push(['refuse', /^Not done: /.test(await call('move_prop', { index: 99, turn: 10 })) && /^Not done: /.test(await call('add_prop', { prop: 'nothing' }))])
      await call('undo'); await call('undo'); await call('undo')
      steps.push(['undo', (await count()) === '10'])
      const bad = steps.filter(([, good]) => !good).map(([name]) => name)
      if (bad.length) fails.push(`blobscape scene creator agent: ${bad.join(', ')} failed ${JSON.stringify({ described: described.slice(0, 300), added })}`)
      else ok('blobscape scene creator agent: an assistant describes the windmill, adds the turkey, turns it, brings snow, draws it in oil, is refused a bad ask and undoes')
    },
  },
]
