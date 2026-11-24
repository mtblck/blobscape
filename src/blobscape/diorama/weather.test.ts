import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CLEAR, CLOUDS, RAIN_MOST, lightningAt, skyState } from '../../splat-engine/skyRecipes.ts'
import { DIORAMAS } from './scenes.ts'
import { pileStep } from '../../splat-engine/snowCover.ts'
import { SceneWeather, paletteUnder, underSky } from './weather.ts'
import { litFor } from '../../splat-engine/sceneDoc.ts'
import { Skeleton } from '../../splat-engine/rig.ts'

const scene = (id: string) => DIORAMAS.find((d) => d.id === id)!

test('weather is made for any scene, and a sky shows its share of it', () => {
  for (const id of ['campfire', 'meadow']) {
    const d = scene(id), w = new SceneWeather(d)
    assert.ok(w.actors.length >= 3)
    assert.ok(w.actors.slice(0, 3).every((a) => a.weather && a.blobs.count > 0), id)
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
    assert.equal(out(clouds), CLOUDS + 1)
    if (id !== 'campfire') continue
    // the clouds gray with the sky they are in, and come back to their own colors under a clear one
    const color = w.actors[0].blobs.color, own = color.slice(0, 30)
    const spread = (c: Float32Array) => { let m = 0; for (let k = 0; k < 30; k += 3) m += Math.max(c[k], c[k + 1], c[k + 2]) - Math.min(c[k], c[k + 1], c[k + 2]); return m }
    assert.ok(w.shade(skyState(undefined, 'overcast')))
    assert.ok(spread(color) <= spread(own) && color.slice(0, 30).some((v, k) => Math.abs(v - own[k]) > 0.02), 'overcast clouds are grayer')
    assert.equal(w.shade(skyState(undefined, 'overcast')), false)
    w.shade(CLEAR)
    assert.ok(color.slice(0, 30).every((v, k) => Math.abs(v - own[k]) < 0.01))
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

test('snow lies where it lands, builds up while it falls and melts after', () => {
  const d = scene('cabin'), w = new SceneWeather(d), c = w.cover
  assert.equal(w.actors[3], c)
  assert.ok(c.blobs.count > 500, `${c.blobs.count} places for snow`)
  const shown = () => { let n = 0; for (let k = 0; k < c.blobs.count; k++) if (c.blobs.scale[k * 3] > 0) n++; return n }
  w.pile(0)
  assert.equal(shown(), 0)
  let depth = 0
  const counts: number[] = []
  for (let s = 0; s < 6; s++) { for (let k = 0; k < 40; k++) depth = pileStep(depth, 1, 0.25); w.pile(depth); counts.push(shown()) }
  assert.ok(counts.every((n, i) => i === 0 || n >= counts[i - 1]) && counts[0] > 0 && counts[0] < c.blobs.count * 0.6, counts.join(' '))
  assert.equal(pileStep(1, 1, 10), 1)
  assert.ok(pileStep(0.5, 0.4, 10) < pileStep(0.5, 1, 10), 'heavier snow builds faster')
  assert.ok(pileStep(0.5, 0, 10) < 0.5, 'it melts when none falls')
  // light snow lays far slower than heavy, and only dusts
  let light = 0, heavy = 0
  for (let k = 0; k < 600; k++) { light = pileStep(light, 0.4, 0.25); heavy = pileStep(heavy, 1, 0.25) }
  assert.equal(heavy, 1)
  assert.ok(light < 0.6 + 1e-9 && light > 0.5, `light snow lays ${light} in 150 s`)
  assert.ok(pileStep(0, 0.4, 30) < pileStep(0, 1, 30) / 5, 'light snow builds about a sixth as fast')
  assert.ok(pileStep(1, 0.4, 10) < 1, 'a deep cover settles back under light snow')
  w.pile(1)
  assert.equal(shown(), c.blobs.count)
  // flat on the ground it fell to, never under it
  for (let k = 0; k < c.blobs.count; k++) if (c.blobs.center[k * 3 + 1] < c.at[k * 3 + 1] - 1e-6 || c.normal[k * 3 + 1] < 0.55) assert.fail(`blob ${k}`)
})

test('snow lying rides what it lies on: the sky islands drift and carry their snow with them', () => {
  // the islands all drift, so nothing stays put under the snow: it lies on the islands and goes where each goes
  // (it was once left out, and an empty cover sent up froze the page, Matt, 2026-11-22; Matt asked for snow that stays on what moves, 2026-11-24)
  const d = scene('isles'), w = new SceneWeather(d, { overhead: false }), c = w.cover
  assert.ok(c.blobs.count > 100 && w.actors.includes(c as never), `${c.blobs.count} places for snow`)
  const carried = new Set<number>()
  for (let k = 0; k < c.blobs.count; k++) carried.add(c.skin.joints[k * 4])
  assert.ok([...carried].some((b) => b > 0), 'some snow is on a bone that moves')
  const sk = new Skeleton(d.bones!.map((b) => ({ ...b })))
  w.pile(1)
  for (const t of [0, d.loop * 0.37]) {
    d.pose(sk, t); sk.update(); w.follow(sk)
    for (let k = 0; k < c.blobs.count; k += 7) {
      const b = c.skin.joints[k * 4], m = sk.matrix, n = c.skeleton.matrix, p = c.blobs.center
      for (let r = 0; r < 3; r++) {
        const want = m[b * 16 + r] * p[k * 3] + m[b * 16 + 4 + r] * p[k * 3 + 1] + m[b * 16 + 8 + r] * p[k * 3 + 2] + m[b * 16 + 12 + r]
        const got = n[b * 16 + r] * p[k * 3] + n[b * 16 + 4 + r] * p[k * 3 + 1] + n[b * 16 + 8 + r] * p[k * 3 + 2] + n[b * 16 + 12 + r]
        if (Math.abs(want - got) > 1e-4) assert.fail(`blob ${k} on bone ${b} at ${t} s`)
      }
    }
  }
})

test('the koi pond is a day: its moon and stars come out only at night, and its weather starts over the picture', () => {
  const koi = scene('koi')
  const sky = (doc: ReturnType<typeof litFor>) => doc.parts.filter((p) => p.bone === '~moon' || p.bone?.startsWith('~star')).length
  assert.equal(sky(litFor(koi.doc!, false, 'always')), 0)
  assert.ok(sky(litFor(koi.doc!, true)) > 20, 'moon and stars at night')
  assert.equal(koi.overhead, false)
  const w = new SceneWeather(koi, { overhead: false })
  assert.equal(w.overhead, false)
})
