import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REACH_POWER, castBy, glowGain } from './glow.ts'
import { lightAt } from '../../splat-engine/light.ts'
import { DIORAMAS } from './scenes.ts'
import type { PointLight } from '../../splat-engine/engine.ts'

const lamp: PointLight[] = [{ position: [0, 1, 0], color: [2, 1.5, 0.5], range: 1 }]
const at = (lights: PointLight[], d: number) => lightAt([d, 1, 0], [-1, 0, 0], lights, 0)[0]

test('at a scene\'s own glow its lights are as its description has them', () => {
  assert.equal(glowGain(1.2, 1.2), 1)
  assert.equal(castBy(lamp, 1), lamp)
  for (const d of DIORAMAS) assert.ok(d.finish.glow > 0, `${d.id} opens with some glow, so the setting has a place that means its own light`)
})

test('more glow puts more light on what stands round a lamp, and none puts it out', () => {
  const twice = castBy(lamp, glowGain(2.4, 1.2))
  for (const d of [0.3, 1, 1.6]) assert.ok(at(twice, d) > at(lamp, d) * 1.9, `at ${d}`)
  assert.equal(at(castBy(lamp, glowGain(0, 1.2)), 0.5), 0)
  // less glow dims it everywhere
  for (const d of [0.3, 1, 1.6]) assert.ok(at(castBy(lamp, 0.5), d) < at(lamp, d))
})

test('a brighter lamp reaches further, but slowly', () => {
  // just past twice the range a lamp at its own strength gives nothing
  assert.equal(at(lamp, 2.05), 0)
  assert.ok(at(castBy(lamp, 2), 2.05) > 0)
  assert.ok(Math.abs(castBy(lamp, 4)[0].range - 4 ** REACH_POWER) < 1e-9)
  assert.ok(castBy(lamp, 4)[0].range < 1.5)
})

test('the lamp itself is left as it was', () => {
  castBy(lamp, 3)
  assert.deepEqual(lamp[0].color, [2, 1.5, 0.5])
  assert.equal(lamp[0].range, 1)
})
