import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_PLACE, daylight, moonWay, sunTimes } from '../../splat-engine/daylight.ts'
import { checkScene } from '../../splat-engine/sceneDoc.ts'
import { loopSnaps } from '../../splat-engine/sceneChecks.ts'
import { SCENES, dayStage, lampAt, outByDay, outByNight } from './scene.ts'
import { facing, makeStars, onScreen, rowHeight, skyColor, starWay, upTimes } from './sky.ts'
import { clockLabel, compass, hourFrom } from './words.ts'

const P = DEFAULT_PLACE

test('every scene is a sound description with no light baked in, builds with all its parts, and names real bones and lights', () => {
  for (const s of SCENES) {
    assert.deepEqual(checkScene(s.doc), [], s.id)
    assert.deepEqual(JSON.parse(JSON.stringify(s.doc)), s.doc, `${s.id} is data alone`)
    assert.equal(s.doc.light?.ambient, 1)
    assert.equal(s.doc.light?.shadow, 0)
    const st = dayStage(s), b = st.make(0.036)
    assert.ok(b.blobs.count > 10000 && b.blobs.count < 80000, `${b.blobs.count}`)
    assert.equal(new Set(b.partOf).size, b.partOf.reduce((m, p) => Math.max(m, p), 0) + 1, `${s.id}: a part caught no grid cell`)
    // the glowing parts carry their own light, and only they do
    assert.ok(b.glow && b.glow.some((g) => g === 255) && b.glow.filter((g) => g).length < b.blobs.count / 10)
    for (const l of s.lamps) {
      assert.ok(b.skeleton.index(l.bone) > 0, `${s.id}: no bone ${l.bone}`)
      if (l.light !== undefined) assert.ok(s.doc.lights?.[l.light], `${s.id}: no light ${l.light}`)
    }
    assert.ok(s.byDay.every((p) => s.doc.bones?.some((k) => k.name.startsWith(p))))
    assert.deepEqual(loopSnaps(b.skeleton, (sk, t) => st.pose(sk, t, 12, daylight(12, P)), st.loop), [], `${s.id}: snaps`)
  }
})

test('lamps are out by day, on at night in their own order, blink as they catch, and the windows are put out before morning', () => {
  const s = SCENES[0], set = sunTimes(P).set
  const on = (h: number) => s.lamps.map((l) => lampAt(l, h, daylight(h, P)) > 0)
  assert.deepEqual(on(12), [false, false, false, false])
  assert.deepEqual(on(set - 1), [false, false, false, false])
  assert.deepEqual(on(22.5), [true, true, true, true])
  // they come on one after another: at no minute of dusk is a later lamp lit while an earlier one has yet to catch
  let lit = 0
  const order: number[] = []
  for (let h = set - 0.5; h < set + 1.5; h += 1 / 240) {
    const sky = daylight(h, P)
    s.lamps.forEach((l, k) => { if (!order.includes(k) && lampAt(l, h, sky) > 0) order.push(k) })
    lit = Math.max(lit, on(h).filter(Boolean).length)
  }
  assert.deepEqual(order, [0, 1, 2, 3])
  assert.equal(lit, 4)
  // a lamp blinks on its way up: off, on, off, on
  const l = s.lamps[0], steps: boolean[] = []
  for (let d = l.on; d < l.on + 0.16; d += 0.002) steps.push(lampAt(l, 21, { ...daylight(21, P), dark: d }) > 0)
  assert.ok(steps.filter((v, i) => i > 0 && v !== steps[i - 1]).length >= 5, 'it blinks before it holds')
  // the small hours: the lantern still burns, the windows are dark
  assert.deepEqual(on(2), [true, false, false, false])
  assert.deepEqual(on(0.2), [true, false, false, true])
})

test('birds are out by day and fireflies by night, each going and coming at its own moment', () => {
  const noon = daylight(12, P), night = daylight(0, P), dusk = daylight(sunTimes(P).set + 0.4, P)
  for (const b of ['bird0', 'bird1', 'bird2']) {
    assert.equal(outByDay(b, noon), 1)
    assert.equal(outByDay(b, night), 0)
  }
  const flies = Array.from({ length: 40 }, (_, k) => `~speck${k}`)
  assert.ok(flies.every((f) => outByNight(f, noon) === 0 && outByNight(f, night) === 1))
  const part = flies.map((f) => outByNight(f, { ...dusk, dark: 0.72 }))
  assert.ok(part.some((v) => v === 0) && part.some((v) => v > 0.5), 'some are out before others')
})

test('the stage poses and lights from the hour: the sun by day, the moon and the lamps at night, shadows only if asked', () => {
  const st = dayStage(SCENES[0]), b = st.make(0.05), sk = b.skeleton
  const size = (name: string) => sk.size[sk.index(name)]
  st.pose(sk, 1, 12, daylight(12, P))
  assert.equal(size('win0'), 0)
  assert.equal(size('flame'), 0)
  assert.equal(size('bird0'), 1)
  assert.equal(size('~speck3'), 0)
  st.pose(sk, 1, 22.5, daylight(22.5, P))
  assert.equal(size('win0'), 1)
  assert.equal(size('flame'), 1)
  assert.equal(size('bird0'), 0)
  // fireflies blink, so not every one shows at one moment
  assert.ok(Array.from({ length: 44 }, (_, k) => size(`~speck${k}`)).filter((v) => v > 0).length > 10)
  const day = st.lights(1, 12, daylight(12, P), true), night = st.lights(1, 22.5, daylight(22.5, P), true)
  assert.equal(day.lights.length, 1)
  assert.ok('direction' in day.lights[0] && day.lights[0].shadow)
  assert.equal(night.lights.length, 5)
  assert.ok('direction' in night.lights[0] && night.lights[0].color[2] > night.lights[0].color[0], 'the moon comes first')
  const lamps = night.lights.slice(1)
  assert.ok(lamps.every((l) => 'position' in l && l.color[0] > l.color[2]))
  assert.equal(lamps.filter((l) => l.shadow).length, 1, 'only the lantern casts')
  assert.ok(st.lights(1, 22.5, daylight(22.5, P), false).lights.every((l) => !l.shadow))
  assert.ok(night.ambient[2] < day.ambient[2] / 4)
})

test('the sky on screen: the horizon sits where the camera puts it, the way ahead is the middle, and what is behind is not drawn', () => {
  const orbit = { target: [0, 0, 0] as [number, number, number], distance: 5, azimuth: 0, elevation: 0 }
  // the camera is south of the scene looking north (−z)
  const ahead = onScreen([0, 0, -1], orbit, 800, 600)!
  assert.ok(Math.abs(ahead.x - 400) < 1e-6 && Math.abs(ahead.y - 300) < 1e-6)
  assert.equal(onScreen([0, 0, 1], orbit, 800, 600), undefined)
  assert.ok(onScreen([0.2, 0, -1], orbit, 800, 600)!.x > 400, 'east is to the right when looking north')
  assert.ok(onScreen([0, 0.2, -1], orbit, 800, 600)!.y < 300, 'up is up')
  // looking down from 15 degrees up, the horizon is above the middle, at the row whose height is 0
  const high = { ...orbit, elevation: 15 }
  const y = onScreen([0, 0, -1], high, 800, 600)!.y / 600
  assert.ok(y < 0.5 && Math.abs(rowHeight(y, high)) < 1e-6, `${y}`)
  assert.ok(Math.abs(rowHeight(0.5, high) + 15) < 1e-9)
  // turned to look from the east, west is ahead
  assert.ok(Math.abs(onScreen([-1, 0, 0], { ...orbit, azimuth: 90 }, 800, 600)!.x - 400) < 1e-6)
})

test('the sky goes from the horizon\'s color to the zenith\'s, and stars turn once a day about the pole', () => {
  const sky = daylight(12, P)
  assert.deepEqual(skyColor(0, sky), sky.horizon)
  const top = skyColor(90, sky)
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(top[k] - sky.zenith[k]) < 1e-9)
  assert.ok(skyColor(-20, sky)[2] < sky.horizon[2])
  const stars = makeStars(200)
  assert.deepEqual(makeStars(200), stars)
  assert.ok(stars.every((s) => s.dec >= -90 && s.dec <= 90 && s.bright > 0 && s.bright <= 1))
  const a = starWay(stars[5], 3, P), b = starWay(stars[5], 27, P), c = starWay(stars[5], 9, P)
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(a[k] - b[k]) < 1e-9)
  assert.ok(Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]) > 0.05)
  // the pole star's place doesn't move: declination 90 is due north, as high as the latitude
  const pole = starWay({ ra: 123, dec: 90, bright: 1 }, 5, P), later = starWay({ ra: 123, dec: 90, bright: 1 }, 17, P)
  assert.ok(Math.abs(pole[1] - Math.sin((45 * Math.PI) / 180)) < 1e-9 && pole[2] < 0 && Math.abs(pole[0] - later[0]) < 1e-9)
})

test('words: clock times to five minutes, compass points, and an hour from the address', () => {
  assert.equal(clockLabel(0), '12:00 am')
  assert.equal(clockLabel(12), '12:00 pm')
  assert.equal(clockLabel(19.58), '7:35 pm')
  assert.equal(clockLabel(23.99), '12:00 am')
  assert.equal(clockLabel(4.26), '4:15 am')
  assert.equal(compass([0, 0.5, 1]), 'south')
  assert.equal(compass([1, 0.1, 0]), 'east')
  assert.equal(compass([-1, 0.3, 1]), 'southwest')
  assert.equal(compass([0.02, 0, -1]), 'north')
  assert.equal(hourFrom('19.5'), 19.5)
  assert.equal(hourFrom('24'), 0)
  assert.equal(hourFrom(null), undefined)
  assert.equal(hourFrom('noon'), undefined)
  assert.equal(hourFrom('31'), undefined)
})

test('the city: its windows come on a group at a time through dusk, offices go dark in the evening, some rooms burn all night, and only four lamps throw light', () => {
  const s = SCENES.find((x) => x.id === 'city')!, set = sunTimes(P).set
  const windows = s.lamps.filter((l) => l.bone.startsWith('lit'))
  assert.equal(windows.length, 12)
  assert.ok(windows.every((l) => l.light === undefined))
  const on = (h: number) => windows.filter((l) => lampAt(l, h, daylight(h, P)) > 0).length
  assert.equal(on(12), 0)
  const dusk = [0.1, 0.4, 0.7, 1.0].map((d) => on(set + d))
  assert.ok(dusk.every((n, i) => i === 0 || n >= dusk[i - 1]) && dusk[0] < dusk[3], `${dusk}`)
  assert.equal(on(21), 12)
  assert.ok(on(23.5) < 12 && on(23.5) > on(3), 'offices go out one after another')
  assert.equal(on(3), 3)
  // every group has panes to show, on more than one building
  const st = dayStage(s), b = st.make(0.036), sk = b.skeleton
  st.pose(sk, 1, 21, daylight(21, P))
  for (const l of windows) assert.equal(sk.size[sk.index(l.bone)], 1)
  st.pose(sk, 1, 12, daylight(12, P))
  for (const l of windows) assert.equal(sk.size[sk.index(l.bone)], 0)
  const night = st.lights(1, 21.5, daylight(21.5, P), true)
  assert.equal(night.lights.filter((l) => 'position' in l).length, 4)
  assert.equal(night.lights.filter((l) => 'position' in l && l.shadow).length, 1)
})

test('every phase of the moon has its own hours, and turning to face it puts it in the view', () => {
  // the sun's own times, found the same way, agree with the formula
  const sun = upTimes((h) => daylight(h, P).sunHeight), want = sunTimes(P)
  assert.ok(Math.abs(sun.rise! - want.rise) < 0.02 && Math.abs(sun.set! - want.set) < 0.02)
  // a full moon rises about sunset and sets about sunrise; a half moon rises about midday and sets about midnight
  const full = upTimes((h) => daylight(h, P).moonHeight), half = upTimes((h) => daylight(h, { ...P, moon: 0.25 }).moonHeight)
  assert.ok(full.up && half.up)
  assert.ok(Math.abs(full.rise! - want.set) < 2.5 && Math.abs(full.set! - want.rise) < 2.5, `${full.rise} ${full.set}`)
  assert.ok(Math.abs(half.rise! - 12) < 1 && (half.set! < 1 || half.set! > 23), `${half.rise} ${half.set}`)
  // so at 1 am a half moon is down, which is what "the moon disappears" was; at 9 pm it is up in the southwest
  assert.ok(daylight(1, { ...P, moon: 0.25 }).moonHeight < 0 && daylight(21, { ...P, moon: 0.25 }).moonHeight > 20)
  // never above the horizon: nothing to report
  assert.deepEqual(upTimes(() => -5), { rise: undefined, set: undefined, up: false })
  // facing it: the moon lands inside a 4:3 view, above the middle, from wherever the orbit was
  const orbit = { target: [0, 0.62, 0] as [number, number, number], distance: 5.3, azimuth: 24, elevation: 9 }
  for (const [age, hour] of [[0.5, 0], [0.5, 22], [0.25, 21], [0.12, 20.5], [0.5, 3.5]]) {
    const way = moonWay(hour, { ...P, moon: age })
    assert.ok(way[1] > 0, `${age} at ${hour} is up`)
    assert.equal(onScreen(way, orbit, 800, 600) && way[2] > 0 ? 'seen' : 'unseen', 'unseen', 'a moon in the south is behind the first view')
    const p = onScreen(way, facing(way, orbit), 800, 600)!
    assert.ok(p && Math.abs(p.x - 400) < 1 && p.y > 20 && p.y < 300, `${age} at ${hour}: ${JSON.stringify(p)}`)
  }
})
