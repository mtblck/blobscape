import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CLEAR, RAIN_MOST, lightningAt, skyState } from '../../splat-engine/skyRecipes.ts'
import { DIORAMAS } from './scenes.ts'
import { SceneWeather, paletteUnder, underSky } from './weather.ts'

const scene = (id: string) => DIORAMAS.find((d) => d.id === id)!

test('weather is made for any scene, and a sky shows its share of it', () => {
  for (const id of ['campfire', 'meadow']) {
    const d = scene(id), w = new SceneWeather(d)
    assert.equal(w.actors.length, 3)
    assert.ok(w.actors.every((a) => a.weather && a.blobs.count > 0), id)
    const [clouds, rain, snow] = w.actors.map((a) => a.skeleton)
    const out = (sk: typeof rain) => sk.size.reduce((n, v) => n + (v > 0 ? 1 : 0), 0)
    // clear: nothing shows but each layer's land bone
    w.pose(1, CLEAR)
    assert.deepEqual([out(clouds), out(rain), out(snow)], [1, 1, 1], id)
    w.pose(1, skyState('rain'))
    const some = out(rain)
    w.pose(1, skyState('heavy-rain'))
    assert.ok(some > 20 && out(rain) > some * 1.8 && out(rain) <= RAIN_MOST + 1, `${id}: ${some} then ${out(rain)} drops`)
    assert.equal(out(snow), 1)
    assert.equal(out(clouds), 9)
  }
})

test('a scene under a clear sky is the scene; under a storm its light, sky and air change', () => {
  const d = scene('windmill')
  const clear = underSky(d, () => CLEAR), storm = underSky(d, () => skyState('thunderstorm')), calm = underSky(d, () => skyState('thunderstorm'), true)
  assert.deepEqual(clear.ambientAt!(0), [1, 1, 1])
  assert.deepEqual(clear.skyAt!(0), [[...d.sky[0]], [...d.sky[1]]])
  assert.deepEqual(clear.hazeAt!(3), d.haze)
  let bolt = 0
  while (lightningAt(bolt, d.loop) < 1) bolt += 0.01
  const dark = storm.ambientAt!(bolt + 2) as number[], lit = storm.ambientAt!(bolt) as number[]
  assert.ok(dark[0] < 0.7 && lit[2] > dark[2] + 0.5)
  assert.deepEqual(calm.ambientAt!(bolt), calm.ambientAt!(bolt + 2), 'no flashes where less motion is asked for')
  assert.ok(storm.skyAt!(bolt + 2)[0][2] < d.sky[0][2])
  assert.ok(storm.hazeAt!(3)!.to < 100)
  assert.equal(storm.make, d.make, 'the scene itself is the same cut')
})

test('a palette under a sky holds the sky, the weather and the scene, in at most 32 colors', () => {
  const d = scene('lighthouse')
  assert.deepEqual(paletteUnder(d.palette.colors, d.sky, CLEAR), d.palette.colors)
  const p = paletteUnder(d.palette.colors, d.sky, skyState('heavy-snow'))
  assert.ok(p.length <= 32 && p.length >= d.palette.colors.length)
  assert.ok(p.some((c) => c[0] > 215 && c[1] > 215 && c[2] > 215), 'snow has a white to snap to')
})
