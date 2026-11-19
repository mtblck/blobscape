import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_PROJECT_LAMPS, checkProject, compileProject, cutLight, litLand, sunFrom, sunOf } from '../../splat-engine/project.ts'
import { compileScene } from '../../splat-engine/sceneDoc.ts'
import { budget, clock, hexOf, lampAdded, lampChanged, lampLights, lampRemoved, liveSky, liveSkyColors, lit, sunNow } from './lighting.ts'
import { LIBRARY, libraryProp, openScene } from './library.ts'

const windmill = () => openScene('windmill')!
const known = (id: string) => LIBRARY.some((e) => e.id === id)

test('the sun as a turn and a height, both ways', () => {
  for (const [turn, height] of [[0, 45], [90, 30], [-120, 60], [170, 10]]) {
    const back = sunOf(sunFrom(turn, height))
    assert.deepEqual(back, { turn, height })
  }
  const up = sunFrom(0, 90)
  assert.ok(Math.abs(up[1] - 1) < 1e-9)
})

test('light edits: a change is a new project, the same change is none, and lamps come and go', () => {
  const p = windmill()
  const a = lit(p, { sun: { turn: 40, height: 30 } })
  assert.notEqual(a, p)
  assert.equal(p.light, undefined)
  assert.equal(lit(a, { sun: { turn: 40, height: 30 } }), a)
  assert.equal(lit(a, { sun: undefined }).light, undefined)
  let b = lampAdded(p, [0.1, 0.2, 0.3])
  assert.equal(b.light!.lamps!.length, 1)
  b = lampChanged(b, 0, { strength: 3, at: [1.23456, 0, 0] })
  assert.equal(b.light!.lamps![0].strength, 3)
  assert.deepEqual(b.light!.lamps![0].at, [1.2346, 0, 0])
  assert.equal(lampRemoved(b, 0).light, undefined)
  let full = p
  for (let i = 0; i < MAX_PROJECT_LAMPS + 2; i++) full = lampAdded(full, [0, 0, 0])
  assert.equal(full.light!.lamps!.length, MAX_PROJECT_LAMPS)
  assert.deepEqual(checkProject(full, known), [])
  assert.ok(checkProject({ ...p, light: { shade: 3, weather: 'hail' } }, known).length === 2)
})

test('the land is cut under the light: the sun, unlit for a live sun, and weather in its air', () => {
  const doc = libraryProp('windmill-hill')!.doc
  const baked = litLand(doc, { sun: { turn: 90, height: 20 }, shade: 0.2, sky: ['#000011', '#223344'] })
  assert.ok(Math.abs(baked.light!.from![0] - Math.cos(20 * Math.PI / 180)) < 1e-9)
  assert.equal(baked.light!.ambient, 0.2)
  assert.deepEqual(baked.sky, ['#000011', '#223344'])
  const live = litLand(doc, { live: { hour: 9 } })
  assert.equal(live.light!.ambient, 1)
  assert.equal(live.light!.shadow, 0)
  for (const weather of ['rain', 'snow', 'leaves'] as const) {
    const w = litLand(doc, { weather, haze: 6 })
    assert.ok(w.air!.specks!.some((s) => s.kind === weather && s.land))
    assert.equal(w.air!.haze!.to, 6)
    compileScene(w)
  }
  // what the cut depends on leaves out what shines live
  assert.deepEqual(cutLight({ live: { hour: 3 }, lamps: [], glow: 2 }), cutLight({ live: { hour: 20 } }))
  assert.notDeepEqual(cutLight({ sun: { turn: 1, height: 20 } }), cutLight(undefined))
})

test('lamps shine live, the live sun follows the hour, and the budget counts both', () => {
  const p = lampAdded(windmill(), [0, 0.3, 0])
  const [l] = lampLights(p.light, 1, 12)
  assert.deepEqual(l.position, [0, 0.3, 0])
  assert.ok(l.color[0] > l.color[2])
  const noon = liveSky(12.5, true), night = liveSky(1, true)
  assert.ok(noon.lights.some((x) => 'direction' in x && x.direction[1] > 0.5 && x.shadow))
  assert.ok(noon.ambient[2] > night.ambient[2])
  const [top, low] = liveSkyColors(noon.sky)
  assert.match(top, /^#[0-9a-f]{6}$/)
  assert.notEqual(top, low)
  assert.equal(hexOf([1, 0, 0.5]), '#ff00bc')
  assert.equal(clock(14.5), '2:30 PM')
  assert.equal(clock(0), '12:00 AM')
  const q = lit(p, { live: { hour: 12 } })
  const b = budget(compileProject(q, libraryProp), q.light)
  assert.ok(b.live[0] >= 2 && b.live[1] === 16)
  assert.equal(b.baked[1], 4)
  assert.deepEqual(sunNow(compileProject(p, libraryProp), undefined), sunOf(libraryProp('windmill-hill')!.doc.light?.from))
})
