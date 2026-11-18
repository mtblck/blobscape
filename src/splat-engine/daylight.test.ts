import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_PLACE, airMass, daylight, moonLit, moonWay, skyLights, skyWay, sunDeclination, sunTimes, sunWay, type SkyPlace } from './daylight.ts'

const deg = (y: number) => (Math.asin(y) * 180) / Math.PI
const at = (latitude: number, day: number, moon = 0.5): SkyPlace => ({ latitude, day, moon })

test('at noon the sun is due south (north of the tropics) at 90 − latitude + declination; it rises in the east and sets in the west', () => {
  for (const [lat, day] of [[45, 172], [45, 355], [60, 80], [30, 266]]) {
    const noon = sunWay(12, at(lat, day))
    assert.ok(Math.abs(noon[0]) < 1e-9 && noon[2] > 0, `${noon}`)
    assert.ok(Math.abs(deg(noon[1]) - (90 - lat + sunDeclination(day))) < 1e-6)
    assert.ok(Math.abs(Math.hypot(...noon) - 1) < 1e-9)
    assert.ok(sunWay(7, at(lat, day))[0] > 0.3, 'morning sun in the east')
    assert.ok(sunWay(17, at(lat, day))[0] < -0.3, 'afternoon sun in the west')
  }
  // south of the equator the noon sun is in the north
  assert.ok(sunWay(12, at(-35, 172))[2] < 0)
})

test('the sun crosses the horizon at sunTimes; days are 12 hours at an equinox, long in summer, and endless past the polar circle', () => {
  for (const p of [at(45, 172), at(45, 355), at(20, 30), at(60, 200)]) {
    const { rise, set } = sunTimes(p)
    assert.ok(Math.abs(sunWay(rise, p)[1]) < 1e-9 && Math.abs(sunWay(set, p)[1]) < 1e-9)
    assert.ok(sunWay(rise + 0.2, p)[1] > 0 && sunWay(rise - 0.2, p)[1] < 0)
  }
  const eq = sunTimes(at(45, 80.75))
  assert.ok(Math.abs(eq.set - eq.rise - 12) < 0.05, `${eq.set - eq.rise}`)
  const summer = sunTimes(at(45, 172)), winter = sunTimes(at(45, 355))
  assert.ok(summer.set - summer.rise > 15 && winter.set - winter.rise < 9)
  assert.deepEqual(sunTimes(at(75, 172)), { rise: 0, set: 24 })
  assert.deepEqual(sunTimes(at(75, 355)), { rise: 12, set: 12 })
  assert.ok(sunWay(0, at(75, 172))[1] > 0, 'the midnight sun')
})

test('a full moon stands opposite the sun and is high in winter; a new moon is with the sun and gives no light', () => {
  const p = at(45, 172, 0.5)
  const sun = sunWay(22, p), moon = moonWay(22, p)
  assert.ok(sun[0] * moon[0] + sun[1] * moon[1] + sun[2] * moon[2] < -0.99)
  assert.ok(moonWay(0, at(45, 355, 0.5))[1] > moonWay(0, p)[1] + 0.5, 'a winter full moon rides higher than a summer one')
  const fresh = at(45, 172, 0)
  assert.deepEqual(moonWay(9, fresh), sunWay(9, fresh))
  assert.equal(moonLit(0), 0)
  assert.equal(moonLit(0.5), 1)
  assert.ok(Math.abs(moonLit(0.25) - 0.5) < 1e-9)
  assert.deepEqual(daylight(0, fresh).moonColor, [0, 0, 0])
  // a first quarter moon is highest at sunset, a full one at midnight
  assert.ok(Math.abs(moonWay(18, at(45, 80, 0.25))[0]) < 1e-9)
  assert.ok(Math.abs(moonWay(0, p)[0]) < 1e-9)
})

test('there is one air overhead and about 38 at the horizon', () => {
  assert.ok(Math.abs(airMass(90) - 1) < 0.001)
  assert.ok(Math.abs(airMass(30) - 2) < 0.01)
  assert.ok(airMass(0) > 36 && airMass(0) < 40)
  assert.equal(airMass(-5), airMass(0))
})

test('sunlight is white and strong overhead, red and weak at the horizon, and gone at night', () => {
  const noon = daylight(12, at(20, 172)), low = daylight(sunTimes().set - 0.3), night = daylight(0)
  assert.ok(noon.sunColor[0] > 1.3 && noon.sunColor[2] / noon.sunColor[0] > 0.85)
  assert.ok(low.sunHeight > 0 && low.sunHeight < 5, `${low.sunHeight}`)
  assert.ok(low.sunColor[0] < noon.sunColor[0] * 0.75 && low.sunColor[0] > 0.2, `${low.sunColor}`)
  assert.ok(low.sunColor[2] / low.sunColor[0] < 0.25, 'blue goes first')
  assert.deepEqual(night.sunColor, [0, 0, 0])
  assert.ok(night.moonColor[2] > night.moonColor[0] && night.moonColor[2] < 0.5, 'moonlight is dim and blue')
  assert.deepEqual(noon.moonColor, [0, 0, 0])
})

test('the sky\'s own light never goes out, is blue at night, and stars and lamps belong to the dark', () => {
  const noon = daylight(12), night = daylight(0), moonless = daylight(0, at(45, 172, 0))
  assert.ok(night.ambient[0] > 0.02 && night.ambient[2] > night.ambient[0] * 1.5)
  assert.ok(noon.ambient[1] > night.ambient[1] * 5)
  assert.ok(moonless.ambient[2] < night.ambient[2], 'a moon brightens the night')
  assert.equal(noon.stars, 0)
  assert.equal(noon.dark, 0)
  assert.equal(night.dark, 1)
  assert.ok(moonless.stars === 1 && night.stars < 1 && night.stars > 0.4)
  assert.ok(noon.zenith[2] > noon.zenith[0] * 5 && night.zenith[2] < 0.03)
  // at sunset the sky round the sun glows warm and the zenith is still blue; by day and at night there is no glow
  const dusk = daylight(sunTimes().set)
  assert.ok(dusk.sunGlow[0] > dusk.sunGlow[2] * 3 && dusk.sunGlow[0] > 0.5 && dusk.zenith[2] > dusk.zenith[0] * 2)
  assert.deepEqual(noon.sunGlow, [0, 0, 0])
  assert.deepEqual(night.sunGlow, [0, 0, 0])
})

test('nothing jumps as the hour moves: a minute changes every value only a little, round the whole day and across midnight', () => {
  // near the equator the sun comes straight up, so dawn is quicker there
  for (const [p, most] of [[DEFAULT_PLACE, 0.05], [at(60, 355, 0.2), 0.05], [at(10, 100, 0.8), 0.1]] as [SkyPlace, number][]) {
    let before = daylight(0, p)
    for (let m = 1; m <= 24 * 60; m++) {
      const now = daylight(m / 60, p)
      for (const k of ['sunColor', 'moonColor', 'ambient', 'zenith', 'horizon', 'sunGlow', 'sun', 'moon'] as const) {
        for (let c = 0; c < 3; c++) assert.ok(Math.abs(now[k][c] - before[k][c]) < most, `${k}[${c}] at ${m} min: ${before[k][c]} → ${now[k][c]}`)
      }
      assert.ok(Math.abs(now.stars - before.stars) < most && Math.abs(now.dark - before.dark) < most)
      before = now
    }
    // any hour wraps
    assert.deepEqual(daylight(24, p).sunColor, daylight(0, p).sunColor)
    assert.ok(Math.abs(daylight(-3, p).sun[0] - daylight(21, p).sun[0]) < 1e-9)
  }
})

test('skyLights gives only the lights that are up: the sun by day, the moon at night, both casting if asked', () => {
  const day = skyLights(daylight(12)), night = skyLights(daylight(0), false)
  assert.equal(day.lights.length, 1)
  assert.ok(day.lights[0].shadow && day.lights[0].direction[1] > 0.8)
  assert.equal(night.lights.length, 1)
  assert.ok(!night.lights[0].shadow && night.lights[0].color[2] > night.lights[0].color[0])
  assert.equal(skyLights(daylight(0, at(45, 172, 0))).lights.length, 0)
  assert.deepEqual(day.ambient, daylight(12).ambient)
  assert.ok(Math.abs(Math.hypot(...skyWay(33, -12, 50)) - 1) < 1e-9)
})
