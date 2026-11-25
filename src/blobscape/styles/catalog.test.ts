import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { STYLES } from '../diorama/styles.ts'
import { ASCII, BLOCKS_DEF, CATALOG, CEL_DEF, MARKS, PIXEL, SCENE, drawnFrom, drawnStart, fromAddress, keysOf, sceneStart, settingsFrom, shownSettings, valueWords, type RangeSetting, type StyleSetting, type StyleDef } from './catalog.ts'

const defs = [...Object.values(CATALOG), SCENE] as unknown as StyleDef<Record<string, unknown>>[]

test('every style has its settings in the catalog, and the catalog names no style that does not exist', () => {
  for (const s of STYLES) assert.ok(keysOf(s.id).length, `${s.id} has no settings in the catalog`)
  assert.deepEqual(keysOf('glitch'), ['pixel', 'glitch'])
  for (const d of defs) for (const id of d.styles) assert.ok(STYLES.some((s) => s.id === id), `${d.id} names ${id}`)
})

test('every setting is one of its style\'s values, starts sound, and no value is left without a setting', () => {
  for (const d of defs) {
    const keys = d.settings.map((s) => s.key)
    assert.deepEqual([...keys].sort(), Object.keys(d.start).sort(), `${d.id}: settings and start differ`)
    assert.equal(new Set(keys).size, keys.length, `${d.id}: a setting twice`)
    for (const s of d.settings as StyleSetting<Record<string, unknown>>[]) {
      const v = d.start[s.key]
      if (s.kind === 'range') assert.ok(typeof v === 'number' && v >= s.min && v <= s.max && s.step > 0, `${d.id}.${s.key} starts outside its range`)
      else if (s.kind === 'choice') assert.ok(s.open || v === '' || s.options.some((o) => o.id === v), `${d.id}.${s.key} starts on no choice`)
      else if (s.kind === 'toggle') assert.ok(typeof v === 'boolean' || (v === null && !!s.auto), `${d.id}.${s.key} is no switch`)
      else if (s.kind === 'text') assert.ok(typeof v === 'string' && v.length <= s.most, `${d.id}.${s.key} is no text`)
      else assert.ok(Number.isInteger(v))
      assert.ok(s.label.length > 0)
    }
  }
})

test('no two settings a style reads share a name in the address', () => {
  for (const s of STYLES) {
    const names = keysOf(s.id).flatMap((k) => (CATALOG[k].settings as readonly StyleSetting<never>[]).map((x) => x.address).filter(Boolean))
    assert.equal(new Set(names).size, names.length, `${s.id}: ${names.join()}`)
  }
})

test('the address sets what it names and nothing unsound', () => {
  const q = (text: string) => new URLSearchParams(text)
  // text: kept as typed, cut to its length, and a blank one ignored
  assert.equal(fromAddress(ASCII, ASCII.start, q('chars=words&words=Hello there')).words, 'Hello there')
  assert.equal(fromAddress(ASCII, ASCII.start, q(`words=${'x'.repeat(500)}`)).words.length, 120)
  assert.equal(fromAddress(ASCII, ASCII.start, q('words=%20%20')).words, ASCII.start.words)
  assert.equal(fromAddress(ASCII, ASCII.start, q('chars=typed')).chars, 'typed')
  const b = fromAddress(BLOCKS_DEF, BLOCKS_DEF.start, q('block=5&water=blocks&falls=blocks&swell=99&backdrop=slate'))
  assert.deepEqual([b.size, b.water, b.weather, b.swell, b.backdrop], [5, 'blocks', 'blocks', 16, 'slate'])
  assert.deepEqual(fromAddress(BLOCKS_DEF, BLOCKS_DEF.start, q('block=many&water=soup&backdrop=mars')), BLOCKS_DEF.start)
  const c = fromAddress(CEL_DEF, CEL_DEF.start, q('tones=3&shadows=0&fills=2.6&turn=37&outline=0'))
  assert.deepEqual([c.tones, c.shadows, c.fills, c.turn, c.outline], [3, false, 3, 37, false])
  assert.equal(fromAddress(MARKS, MARKS.start, q('outline=1')).outline, true)
  assert.equal(fromAddress(MARKS, MARKS.start, q('')).outline, null)
  assert.equal(fromAddress(ASCII, ASCII.start, q('chars=braille')).chars, 'braille')
  assert.equal(fromAddress(PIXEL, PIXEL.start, q('sort=radix')).exact, true)
  assert.equal(fromAddress(PIXEL, { ...PIXEL.start, exact: true }, q('sort=count')).exact, false)
  assert.equal(fromAddress(PIXEL, PIXEL.start, q('px=4')).size, 4)
  assert.equal(fromAddress(PIXEL, PIXEL.start, q('px=5')).size, 2)
})

test('blocks start at 1× on every device, unless the address says', () => {
  assert.equal(drawnStart().blocks.size, 1, 'blocks start at the grid the scene was cut on')
  assert.equal(drawnStart(undefined, { coarse: true }).blocks.size, 1, 'a phone starts at 1× too')
  assert.equal(drawnStart(new URLSearchParams('block=3'), { coarse: true }).blocks.size, 3)
})

test('kept settings come back whole, and anything unsound in them is left as it starts', () => {
  const start = drawnStart()
  const mine = { ...start, cel: { ...start.cel, tones: 3 as const, turn: 90, outline: false }, blocks: { ...start.blocks, size: 4, backdrop: 'cream' }, marks: { ...start.marks, outline: true, paper: 'blue' }, neon: { ...start.neon, set: 'ice' } }
  assert.deepEqual(drawnFrom(start, JSON.parse(JSON.stringify(mine))), mine)
  const bad = drawnFrom(start, { cel: { tones: 7, turn: 'left', height: 400, shadows: 'yes' }, blocks: { size: 300, water: 'soup' }, marks: 4, glass: { pane: null } })
  assert.equal(bad.cel.tones, start.cel.tones)
  assert.equal(bad.cel.turn, start.cel.turn)
  assert.equal(bad.cel.height, 85)
  assert.equal(bad.cel.shadows, start.cel.shadows)
  assert.equal(bad.blocks.size, 8)
  assert.equal(bad.blocks.water, start.blocks.water)
  assert.deepEqual(bad.marks, start.marks)
  assert.deepEqual(bad.glass, start.glass)
  assert.deepEqual(drawnFrom(start, undefined), start)
  assert.equal(settingsFrom(PIXEL, PIXEL.start, { palette: 'ember' }).palette, 'ember')
})

test('a setting shows only when its style and subject call for it, and a trial only on its own page', () => {
  const keys = <V>(d: StyleDef<V>, v: V, on: Parameters<typeof shownSettings>[2], page?: string) => shownSettings(d, v, on, page).map((s) => s.key)
  assert.ok(!keys(BLOCKS_DEF, BLOCKS_DEF.start, { style: 'blocks' }).includes('water'))
  assert.ok(keys(BLOCKS_DEF, BLOCKS_DEF.start, { style: 'blocks', water: true }).includes('water'))
  assert.ok(!keys(BLOCKS_DEF, BLOCKS_DEF.start, { style: 'blocks', water: true }).includes('swell'))
  assert.ok(keys(BLOCKS_DEF, { ...BLOCKS_DEF.start, water: 'blocks' as const }, { style: 'blocks', water: true }).includes('swell'))
  assert.deepEqual(keys(MARKS, MARKS.start, { style: 'oil' }), ['palette', 'size', 'outline'])
  assert.deepEqual(keys(MARKS, MARKS.start, { style: 'ink' }), ['palette', 'size', 'outline', 'pen', 'paper'])
  assert.deepEqual(keys(MARKS, MARKS.start, { style: 'blobs' }), ['palette', 'outline'])
  // hatching and stipple draw ink on paper, so they have no palette
  assert.ok(!keys(MARKS, MARKS.start, { style: 'hatch' }).includes('palette'))
  assert.ok(!keys(ASCII, { ...ASCII.start, own: false }, { style: 'ascii' }).includes('palette'))
  assert.ok(!keys(ASCII, { ...ASCII.start, chars: 'braille' as const }, { style: 'ascii' }).includes('strokes'))
  const tried: StyleDef<{ a: number }> = { id: 't', styles: ['oil'], start: { a: 1 }, settings: [{ key: 'a', kind: 'range', label: 'A', min: 0, max: 2, step: 1, unit: 'count', trial: 'Biome Islands' }] }
  assert.deepEqual(keys(tried, tried.start, { style: 'oil' }), [])
  assert.deepEqual(keys(tried, tried.start, { style: 'oil' }, 'Biome Islands'), ['a'])
})

test('values read as their sliders show them', () => {
  const r = (unit: RangeSetting<{ a: number }>['unit'], zero?: string): RangeSetting<{ a: number }> => ({ key: 'a', kind: 'range', label: 'A', min: 0, max: 9, step: 1, unit, zero })
  assert.equal(valueWords(r('percent'), 0.35), '35%')
  assert.equal(valueWords(r('px'), 1.5), '1.5 px')
  assert.equal(valueWords(r('deg'), -50), '-50°')
  assert.equal(valueWords(r('times'), 2), '2×')
  assert.equal(valueWords(r('percent', 'None'), 0), 'None')
})

test('the looks keep no settings of their own: useDrawnLook takes them from the catalog', () => {
  const src = readFileSync(new URL('../drawnLook.tsx', import.meta.url), 'utf8')
  assert.ok(src.includes('drawnStart('))
  for (const own of ['useState<CelChoice>', 'useState<NeonChoice>', 'useState<GlassChoice>', 'useState<WashChoice>', 'useState<BlockChoice>', '<Slider ']) assert.ok(!src.includes(own), `drawnLook.tsx has ${own}`)
  for (const page of ['../PixelDiorama.tsx', '../SceneCreator.tsx']) assert.ok(readFileSync(new URL(page, import.meta.url), 'utf8').includes('drawnKept)'), `${page} does not hold the drawn settings`)
})

test('the scene\'s settings start as the scene is written, and the address sets them', () => {
  assert.deepEqual(sceneStart(), SCENE.start)
  const s = sceneStart(new URLSearchParams('time=night&weather=thunderstorm&wind=gale&overhead=0&transition=cut&detail=fine'))
  assert.deepEqual(s, { time: 'night', weather: 'thunderstorm', clouds: '', wind: 'gale', overhead: false, transition: 'cut', detail: 'fine' })
  assert.equal(sceneStart(new URLSearchParams('weather=none')).weather, 'none')
  assert.equal(sceneStart(new URLSearchParams('clouds=cloudy')).clouds, 'cloudy')
  assert.deepEqual(sceneStart(new URLSearchParams('time=teatime&weather=frogs&detail=huge')), SCENE.start)
  assert.deepEqual(settingsFrom(SCENE, SCENE.start, JSON.parse(JSON.stringify(s))), s)
})

test('pixel art\'s controls are laid out by the catalog: every setting a visitor sets has a tab, and what is drawn as another kind reads and writes soundly', () => {
  const on = { style: 'pixel' as const, colors: 16, cycle: true, heat: 2 }
  const shownIn = (tab: 'style' | 'finish' | 'switches') => shownSettings(PIXEL, PIXEL.start, on, undefined, tab).map((s) => s.key)
  assert.deepEqual(shownIn('style'), ['palette', 'size', 'rate'])
  assert.deepEqual(shownIn('finish'), ['dither', 'glow'])
  assert.deepEqual(shownIn('switches'), ['steps', 'texel', 'shade', 'outline', 'lines', 'sky', 'heat', 'cycle', 'rock'])
  // another style keeps only what is not pixel art's own, and neon has a glow of its own
  assert.deepEqual(shownSettings(PIXEL, PIXEL.start, { style: 'oil' }, undefined, 'finish').map((s) => s.key), ['glow'])
  assert.deepEqual(shownSettings(PIXEL, PIXEL.start, { style: 'neon' }, undefined, 'finish').map((s) => s.key), [])
  assert.deepEqual(shownSettings(PIXEL, PIXEL.start, { style: 'oil' }, undefined, 'switches').map((s) => s.key), ['rock'])
  const by = (key: string) => PIXEL.settings.find((s) => s.key === key)!
  const outline = by('outline').draw!, bands = by('texel').draw!, heat = by('heat').draw!
  assert.ok(outline.kind === 'choice' && bands.kind === 'toggle' && heat.kind === 'toggle')
  for (const o of outline.options) assert.equal(outline.at({ ...PIXEL.start, ...outline.set(o.id) }), o.id)
  assert.equal(bands.at({ ...PIXEL.start, ...bands.set(true, on) }), true)
  assert.equal(bands.at({ ...PIXEL.start, ...bands.set(false, on) }), false)
  assert.deepEqual(heat.set(true, on), { heat: 2 })
  assert.deepEqual(heat.set(true, { style: 'pixel' }), { heat: 1 })
  // full color has no palette to step through
  assert.ok(by('steps').held!({ style: 'pixel', colors: 0 }))
  assert.equal(by('steps').held!(on), undefined)
  const page = readFileSync(new URL('../StyleControls.tsx', import.meta.url), 'utf8')
  for (const own of ['<Slider ', '<Toggle ']) assert.ok(!page.includes(own), `StyleControls.tsx lays out ${own} by hand`)
})

test('every page with brush looks, a time of day or weather draws them through the shared pieces', () => {
  const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')
  for (const page of ['../ScanStudio.tsx', '../Bouquets.tsx', '../BrushInk.tsx']) {
    const text = read(page)
    assert.ok(text.includes('useDrawnLook('), `${page} does not use the shared looks`)
    for (const own of ['.setMarks(', '.setOutline(', '.setCel(', '.setGlyphs(']) assert.ok(!text.includes(own), `${page} calls ${own} itself`)
  }
  for (const page of ['../PixelDiorama.tsx', '../SceneCreator.tsx']) assert.ok(read(page).includes('<WeatherControls '), `${page} lays out its own weather`)
  for (const page of ['../PixelDiorama.tsx', '../BrushInk.tsx']) assert.ok(read(page).includes('<TimeControls '), `${page} lays out its own time of day`)
})

test('every drawn style but knitting paints from a palette named in the address, and starts in full color', async () => {
  const { ASCII, BOX_ART, BLOCKS_DEF, CEL_DEF, GLASS_DEF, MARKS, NEON_DEF, WASH_DEF, HALFTONE_DEF, KNIT_DEF, CLAY_DEF, BLUEPRINT_DEF, THERMAL_DEF, CUTOUT_DEF, MOSAIC_DEF, CRT_DEF, fromAddress } = await import('./catalog.ts')
  const q = new URLSearchParams('palette=pico8')
  for (const def of [MARKS, ASCII, BOX_ART, CEL_DEF, BLOCKS_DEF, NEON_DEF, GLASS_DEF, WASH_DEF, HALFTONE_DEF, CLAY_DEF, BLUEPRINT_DEF, THERMAL_DEF, CUTOUT_DEF, MOSAIC_DEF, CRT_DEF] as StyleDef<{ palette: string }>[]) {
    assert.equal(def.start.palette, 'none', def.id)
    assert.equal(fromAddress(def, def.start, q).palette, 'pico8', def.id)
    assert.equal(fromAddress(def, def.start, new URLSearchParams('palette=<b>')).palette, 'none', `${def.id} keeps only an id`)
  }
  assert.ok(!KNIT_DEF.settings.some((s) => (s.key as string) === 'palette'), 'knitting picks from its own yarns')
})

test('Text and Box Art split the characters between them, and a scene kept in Text\'s old box sets opens in Box Art', async () => {
  const { ASCII, BOX_ART } = await import('./catalog.ts')
  const sets = (def: StyleDef<{ chars: string }>) => (def.settings.find((s) => s.key === 'chars') as unknown as { options: { id: string }[] }).options.map((o) => o.id)
  assert.deepEqual(sets(ASCII as StyleDef<{ chars: string }>), ['ascii', 'braille', 'words', 'typed'])
  assert.deepEqual(sets(BOX_ART as StyleDef<{ chars: string }>), ['lines', 'blocks'])
  // an old address (`?style=ascii&chars=lines`) gives Box Art its set and leaves Text on its own
  const old = drawnStart(new URLSearchParams('chars=blocks'))
  assert.equal(old.boxart.chars, 'blocks')
  assert.equal(old.ascii.chars, 'ascii')
  // kept before the split: Text's settings in a box set become Box Art's
  const kept = drawnFrom(drawnStart(), { ascii: { chars: 'lines', letter: 16, own: false } })
  assert.equal(kept.boxart.chars, 'lines')
  assert.equal(kept.boxart.letter, 16)
  assert.equal(kept.boxart.own, false)
  assert.equal(kept.ascii.chars, 'ascii', 'Text falls back to ASCII')
  assert.equal(drawnFrom(drawnStart(), { ascii: { chars: 'braille' } }).boxart.chars, 'lines', 'a Text set leaves Box Art as it starts')
})
