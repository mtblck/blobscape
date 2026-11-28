import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DAY_FROM, SEASONS, lightAt, momentAt, nameOf, snowAt, srgb, weatherAt } from './year.ts'

test('the year runs through the four seasons in order, each a day from just before dawn, and wraps', () => {
  assert.deepEqual(SEASONS.map((s) => s.id), ['spring', 'summer', 'fall', 'winter'])
  for (let k = 0; k < 4; k++) {
    const m = momentAt(k / 4 + 1e-6)
    assert.equal(m.season, k)
    assert.ok(Math.abs(m.hour - DAY_FROM) < 0.01)
  }
  const a = momentAt(0.3), b = momentAt(1.3), c = momentAt(-0.7)
  assert.equal(a.season, b.season); assert.ok(Math.abs(a.hour - b.hour) < 1e-6); assert.ok(Math.abs(a.hour - c.hour) < 1e-6)
  assert.equal(momentAt(0.9999).season, 3)
})

test('the weather changes smoothly, across spells and from one season to the next', () => {
  const steps = 4000
  let before = weatherAt(3, 1 - 1e-9)
  for (let i = 0; i <= steps; i++) {
    const m = momentAt(i / steps)
    for (const key of ['rain', 'snow', 'clouds', 'dark'] as const) {
      const jump = Math.abs(m.sky[key] - before[key])
      if (jump > 0.05) assert.fail(`${key} jumps by ${jump.toFixed(3)} at ${nameOf(m)}`)
    }
    before = m.sky
  }
  // winter brings snow and fall brings rain, summer is clear at noon
  assert.ok(weatherAt(3, 0.45).snow > 0.5)
  assert.ok(weatherAt(2, 0.55).rain > 0.3)
  assert.equal(weatherAt(1, 0.3).rain + weatherAt(1, 0.3).snow, 0)
})

test('snow builds through winter, lies at its end, and is gone a few hours into spring', () => {
  assert.equal(snowAt(1, 0.5), 0)
  assert.equal(snowAt(2, 0.9), 0)
  assert.ok(snowAt(3, 0.1) < 0.01)
  assert.ok(snowAt(3, 0.99) > 0.99)
  assert.ok(Math.abs(snowAt(0, 0) - snowAt(3, 1)) < 1e-6)
  assert.equal(snowAt(0, 0.5), 0)
  for (let i = 1; i < 100; i++) assert.ok(snowAt(3, i / 100) >= snowAt(3, (i - 1) / 100))
})

test('the light follows the sun: bright at a summer noon, dim at night, the summer sun higher than the winter one, dimmer under cloud', () => {
  const at = (season: number, hour: number) => momentAt((season + (((hour - DAY_FROM + 24) % 24) / 24)) / 4)
  const sum = (c: readonly number[]) => c[0] + c[1] + c[2]
  const strength = (m: ReturnType<typeof momentAt>) => {
    const l = lightAt(m, false)
    return l.lights.reduce((s, x) => s + sum(x.color), 0) + sum(l.ambient)
  }
  const noon = at(1, 12.5), night = at(1, 1)
  assert.ok(strength(noon) > strength(night) * 4)
  assert.ok(lightAt(night, false).dark > 0.5 && lightAt(noon, false).dark < 0.2)
  const sunHigh = (m: ReturnType<typeof momentAt>) => (lightAt(m, false).lights[0] as { direction: number[] }).direction[1]
  assert.ok(sunHigh(at(1, 12.5)) > sunHigh(at(3, 12.5)))
  // the overcast fall afternoon is dimmer than the clear summer one
  assert.ok(strength(at(2, 13)) < strength(at(1, 13)))
  for (const c of lightAt(noon, true).sky) for (const v of c) assert.ok(v >= 0 && v <= 255)
})

test('a moment says its season and time', () => {
  assert.equal(nameOf(momentAt(0)), 'Spring, 4:30 AM')
  assert.equal(nameOf({ ...momentAt(0.25), hour: 12 }), 'Summer, 12:00 PM')
  assert.deepEqual(srgb([0, 1, 2]), [0, 255, 255])
})
