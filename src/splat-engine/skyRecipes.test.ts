import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Skeleton } from './rig.ts'
import { checkScene, compileScene } from './sceneDoc.ts'
import { BOLT_SECONDS, CLEAR, CLOUDS, CLOUD_COVERS, RAIN_MOST, SNOW_MOST, SkyEase, WEATHERS, aboveView, cloudBase, falling, gloomy, hazeUnder, isClear, lightUnder, lightningAt, mixSky, windAt, shareOut, showWeather, skyState, skyUnder, weatherBones, weatherDocs } from './skyRecipes.ts'

const VIEW = { target: [0, 0.5, 0] as [number, number, number], distance: 3.4, azimuth: 30, elevation: 14 }

test('no weather and no clouds leaves the sky the scene\'s own', () => {
  assert.equal(skyState(), CLEAR)
  assert.ok(isClear(skyState()))
  for (const w of WEATHERS) assert.ok(!isClear(skyState(w.id)), w.id)
  for (const c of CLOUD_COVERS) assert.ok(!isClear(skyState(undefined, c.id)), c.id)
})

test('weather brings at least its own clouds, and more may be asked for', () => {
  const cover = (id: string) => CLOUD_COVERS.find((c) => c.id === id)!.clouds
  for (const w of WEATHERS) {
    assert.equal(skyState(w.id).clouds, cover(w.clouds), w.id)
    assert.equal(skyState(w.id, 'partly').clouds, cover(w.clouds), `${w.id} keeps its clouds when fewer are asked for`)
    assert.equal(skyState(w.id, 'overcast').clouds, 1)
  }
  assert.equal(skyState(undefined, 'partly').rain, 0)
})

test('heavier weather is more of the same thing', () => {
  assert.ok(skyState('heavy-rain').rain > skyState('rain').rain)
  assert.ok(skyState('heavy-snow').snow > skyState('snow').snow)
  assert.ok(skyState('fog').haze > skyState('heavy-rain').haze)
  assert.ok(skyState('thunderstorm').lightning > 0 && WEATHERS.every((w) => w.id === 'thunderstorm' || !w.lightning))
  assert.ok(gloomy('thunderstorm') && !gloomy('snow') && !gloomy())
})

test('a sky eases from one to the next and starts from wherever it had got to', () => {
  const e = new SkyEase(2)
  e.set(skyState('heavy-rain'), Infinity)
  assert.equal(e.at(0).rain, 1, 'there at once')
  e.set(skyState(), 10)
  assert.equal(e.at(10).rain, 1)
  assert.ok(Math.abs(e.at(11).rain - 0.5) < 1e-9)
  assert.ok(e.moving(11) && !e.moving(12.5))
  // changed half way: it carries on from half the rain, with no jump
  e.set(skyState('snow'), 11)
  assert.ok(Math.abs(e.at(11).rain - 0.5) < 1e-9)
  assert.equal(e.at(13).rain, 0)
  assert.equal(e.at(13).snow, skyState('snow').snow)
  assert.deepEqual(mixSky(CLEAR, skyState('fog'), 1), skyState('fog'))
})

test('lightning loops, lasts a moment, and never flashes more than three times a second', () => {
  for (const loop of [8, 12, 16, 24]) {
    let lit = 0, rises = 0, was = 0, most = 0
    const n = Math.round(loop * 200), window: number[] = []
    for (let i = 0; i < n; i++) {
      const t = (i / n) * loop, f = lightningAt(t, loop)
      assert.ok(f >= 0 && f <= 1)
      assert.equal(f, lightningAt(t + loop, loop))
      if (f > 0) lit++
      if (f > 0.5 && was <= 0.5) { rises++; window.push(t) }
      was = f
      most = Math.max(most, window.filter((r) => t - r < 1).length)
    }
    assert.equal(lightningAt(0, loop) > 0.5 ? 1 : 0, lightningAt(loop - 1e-6, loop) > 0.5 ? 1 : 0, 'no flash cut by the seam')
    assert.ok(rises >= 2, `${loop}: bolts ${rises}`)
    assert.ok(most <= 3, `${loop}: ${most} flashes in a second`)
    assert.ok(lit / 200 <= Math.round(loop / 6 + 1) * BOLT_SECONDS + 0.05)
  }
})

test('light and sky under a sky', () => {
  const storm = skyState('thunderstorm')
  assert.deepEqual(lightUnder(CLEAR, 1), [1, 1, 1], 'no lightning without a storm')
  assert.ok(lightUnder(storm, 1)[2] > lightUnder(storm)[2] + 0.5)
  const blue = [110, 177, 230]
  assert.deepEqual(skyUnder(blue, CLEAR), blue)
  const gray = skyUnder(blue, skyState(undefined, 'overcast'))
  assert.ok(Math.max(...gray) - Math.min(...gray) < 30, 'an overcast sky is nearly gray')
  assert.ok(gray[1] < blue[1], 'and darker')
  assert.ok(skyUnder(blue, storm, 1)[0] > skyUnder(blue, storm)[0] + 60, 'a flash lights the sky')
  assert.equal(hazeUnder(CLEAR, 3), undefined)
  const fog = hazeUnder(skyState('fog'), 3)!, rain = hazeUnder(skyState('rain'), 3)!
  assert.ok(fog.to < rain.to && fog.from < rain.from, 'fog is nearer and thicker than rain\'s haze')
})

test('the weather descriptions are sound, for any view, and hold what a sky can ask for', () => {
  for (const view of [VIEW, { target: [0.3, 1, -0.2] as [number, number, number], distance: 6, azimuth: 200, elevation: 30 }]) {
    const docs = weatherDocs(view, 12)
    for (const doc of Object.values(docs)) assert.deepEqual(checkScene(doc), [], doc.name)
    assert.equal(docs.clouds.parts.length, CLOUDS)
    assert.equal(docs.rain.air!.specks![0].count, RAIN_MOST)
    assert.equal(docs.snow.air!.specks![0].count, SNOW_MOST)
    // each of a description's blobs names its bones in a byte
    for (const doc of Object.values(docs)) assert.ok(compileScene(doc, { puffs: false, ground: () => 0 }).bones.length < 256, doc.name)
  }
  assert.deepEqual(falling('rain', VIEW, 140).colors, falling('rain', VIEW).colors, 'one rain, however much of it')
})

test('what falls lands on the ground it is given', () => {
  const docs = weatherDocs(VIEW, 12)
  for (const floor of [0, 0.4]) {
    const c = compileScene(docs.snow, { puffs: false, ground: () => floor })
    const sk = new Skeleton(c.bones)
    let low = Infinity
    for (let i = 0; i < 240; i++) {
      c.pose(sk, (i / 240) * 12)
      for (const b of weatherBones(c.bones.map((k) => k.name)).specks) if (sk.size[b] > 0.5) low = Math.min(low, sk.posedHead[b * 3 + 1])
    }
    assert.ok(low > floor - 0.01 && low < floor + 0.06, `floor ${floor}: lowest flake at ${low}`)
  }
})

test('a sky shows its share of the drops and clouds, the rest hidden', () => {
  assert.deepEqual([0, 1, 2, 3].map((i) => shareOut(i, 4, 0.625)), [1, 1, 0.5, 0])
  const names = ['land', 'cloud0', 'cloud1', 'hidden', '~speck0', '~speck1', '~speck2', '~speck3']
  const size = new Float32Array(8).fill(1)
  showWeather(size, weatherBones(names), 0.5, 1)
  assert.deepEqual([...size], [1, 1, 1, 0, 1, 1, 0, 0])
})

test('wind comes with weather a level at a time, may be asked for harder, and blows in gusts that loop', () => {
  assert.deepEqual(['rain', 'heavy-rain', 'thunderstorm'].map((w) => skyState(w as 'rain').wind), [1, 2, 3])
  assert.equal(skyState('rain', undefined, 'gale').wind, 3, 'harder wind can be asked for')
  assert.equal(skyState('thunderstorm', undefined, 'breeze').wind, 1, 'or softer')
  assert.equal(skyState('thunderstorm', undefined, 'calm').wind, 0, 'or none')
  assert.ok(!isClear(skyState(undefined, undefined, 'windy')))
  assert.equal(mixSky(skyState('rain'), skyState('thunderstorm'), 0.5).wind, 2)
  assert.deepEqual(windAt(CLEAR, 1, 12), [0, 0])
  const gale = skyState(undefined, undefined, 'gale'), breeze = skyState(undefined, undefined, 'breeze')
  const len = (w: number[]) => Math.hypot(w[0], w[1])
  assert.ok(len(windAt(gale, 1, 12)) > len(windAt(breeze, 1, 12)) * 3)
  const a = windAt(gale, 0, 12), b = windAt(gale, 12, 12)
  assert.ok(Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9, 'its gusts join up at the loop')
})

test('with the clouds left out, what falls starts above the top of the picture', () => {
  for (const camera of [
    { target: [0, 0.3, 0] as [number, number, number], distance: 2.6, azimuth: 0, elevation: 18 },
    { target: [0, 0.5, 0] as [number, number, number], distance: 4, azimuth: 30, elevation: 35 },
    { target: [0, 0.2, 0] as [number, number, number], distance: 1.8, azimuth: -20, elevation: 5 },
  ]) {
    const top = aboveView(camera), base = cloudBase(camera)
    assert.ok(top >= base, `${top} under the clouds' base ${base}`)
    // the picture's top edge, straight ahead over the target, is under where it starts
    const e = (camera.elevation * Math.PI) / 180, half = (20 * Math.PI) / 180
    const eye = camera.target[1] + camera.distance * Math.sin(e)
    const edge = eye + camera.distance * Math.cos(e) * Math.tan(half - e)
    assert.ok(top > edge, `${top} in the picture (top edge ${edge})`)
    const { rain } = weatherDocs(camera, 6, {}, top)
    assert.deepEqual(checkScene(rain), [])
  }
})
