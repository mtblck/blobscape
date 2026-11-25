import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DIORAMAS } from './scenes.ts'
import { LIGHTHOUSE } from './scenes/lighthouse.ts'
import { CAMPFIRE } from './scenes/campfire.ts'
import { BEE } from './scenes/bee.ts'
import { HAND } from './scenes/hand.ts'
import { REEF } from './scenes/reef.ts'
import { WINDMILL } from './scenes/windmill.ts'
import { checkScene, compileScene, isLit, litFor } from '../../splat-engine/sceneDoc.ts'
import { cloudBase, weatherDocs } from '../../splat-engine/skyRecipes.ts'

test('the described scenes are sound, and are data alone', () => {
  for (const doc of [BEE, CAMPFIRE, HAND, REEF, WINDMILL, LIGHTHOUSE]) {
    assert.deepEqual(checkScene(doc), [], doc.name)
    // nothing but what a .json file could hold
    assert.deepEqual(JSON.parse(JSON.stringify(doc)), doc, doc.name)
  }
})

// That every scene builds at every detail, reads in grayscale and loops is most of the scenes' test time, so it is
// split over the files scenes.build<n>.test.ts, which run side by side (scenesBuild.ts).

test('every light in every scene says when it shines, and a scene is sound by day and in the dark', () => {
  for (const d of DIORAMAS) {
    if (!d.doc) continue
    const doc = d.doc
    ;(doc.lights ?? []).forEach((l, i) => assert.ok(l.lit, `${d.id}: lights[${i}] must say when it shines: lit 'dark' (a lamp, a candle, a window, a fire), 'day' or 'always' (docs/scene-descriptions.md, rule 14)`))
    // a lamp that goes out by day has something that stops glowing with it: its glass, its flame, its pane
    if ((doc.lights ?? []).some((l) => l.lit === 'dark')) assert.ok(doc.parts.some((p) => p.lit === 'dark'), `${d.id}: a light waits for the dark but no glowing part does: give the lamp's glowing parts lit 'dark' too`)
    for (const dark of [false, true]) {
      const at = litFor(doc, dark)
      assert.deepEqual(checkScene(at), [], `${d.id} ${dark ? 'in the dark' : 'by day'}`)
      // nothing that should be out still glows or shines
      for (const p of at.parts) assert.ok(!p.lit || isLit(p.lit, dark, doc.lamps), `${d.id}: a part is lit out of its time`)
      at.lights?.forEach((l) => assert.ok(isLit(l.lit, dark, doc.lamps) || l.strength === 0))
      assert.equal(at.lights?.length, doc.lights?.length, `${d.id}: lights keep their places`)
    }
    const timed = d.timed?.('night')
    if (timed) {
      assert.equal(timed.id, d.id); assert.equal(timed.timed?.('night'), timed, `${d.id}: a time of day is made once`)
      assert.equal(timed.at, 'night'); assert.equal(timed.of?.id, d.id)
      assert.ok(timed.finish.sky && timed.palette.colors.length <= 32 && Array.isArray(timed.ambient), `${d.id}: a time brings its sky, palette and light`)
    }
  }
})

test('the koi pond is made from props: the library pieces, its own rain gone, and the shared light rain to start under', () => {
  const koi = DIORAMAS.find((d) => d.id === 'koi')!
  assert.ok(koi.project, 'it keeps the land and props it is made of')
  assert.equal(koi.weather, 'light-rain')
  assert.ok(!(koi.doc!.air?.specks ?? []).some((s) => s.kind === 'rain'), 'no rain of its own')
  // the project, written as data, makes the very description Diorama draws
  assert.deepEqual(JSON.parse(JSON.stringify(koi.project)), koi.project)
  assert.ok(koi.project.props.filter((p) => p.prop === 'bamboo').length > 1, 'one prop set down more than once')
  // both lanterns still wait for the dark, and light the pond once it comes
  assert.equal(koi.doc!.lights!.length, 2)
  for (const l of koi.doc!.lights!) assert.equal(l.lit, 'dark')
})

test('a scene out in space or inside a room (its land tagged space or indoor) keeps its own sky: no time of day to set it in, and no weather', () => {
  const space = DIORAMAS.filter((d) => d.space)
  assert.deepEqual(space.map((d) => d.id), ['whales', 'fireplace'])
  assert.deepEqual(space.filter((d) => d.indoor).map((d) => d.id), ['fireplace'])
  for (const d of space) { assert.equal(d.timed, undefined); assert.equal(d.weather, undefined) }
  assert.ok(DIORAMAS.find((d) => d.id === 'windmill')!.timed)
})

test('the storm octopus, the garden crocodile and the heron hut stand in real water: no painted waves or rings, and what floats or swims is the water\'s', () => {
  for (const id of ['octopus', 'croc', 'hut']) {
    const d = DIORAMAS.find((s) => s.id === id)!
    const c = compileScene(d.doc!)
    assert.ok(c.water, `${id} has no water`)
    // every float and body found its bone, and the water stands round them
    for (const f of [...c.water.floats, ...c.water.bodies]) assert.ok(f.bone >= 0, `${id}: a float or body lost its bone`)
    for (const f of c.water.floats) assert.ok(c.water.wet(f.at[0], f.at[2]), `${id}: a float at ${f.at} is on dry ground`)
    // the painted stand-ins are gone
    assert.ok(!c.bones.some((b) => /(^|\/)(ring|wave)\d+$|(^|\/)foam$/.test(b.name)), `${id} still has painted rings or waves`)
    // the weather's rain comes down on it, so a storm rings it (the octopus's view is aimed 1.3 over its sea, and the
    // rain's box once ended above the water: Matt saw the thunderstorm's rain leave the sea alone, 2026-11-25)
    const v = d.views[0].orbit, rain = compileScene(weatherDocs(v, d.loop, {}, cloudBase(v)).rain, { puffs: false, ground: d.ground, water: c.water.level })
    assert.ok(rain.landed.length > 200, `${id}: only ${rain.landed.length} drops of the weather's rain land on its water`)
  }
})
