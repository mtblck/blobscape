import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LOOP, PINES, SPECKS, flames, flicker, pineLean, specks } from './layout.ts'
import { DOC, SCENE } from './scene.ts'

test('the hand-written camp gives the same count of specks every frame, and joins up at the end of its loop', () => {
  for (const u of [0, 0.137, 0.5, 0.93]) assert.equal(specks(u).length, SPECKS)
  const a = specks(0), b = specks(1)
  a.forEach((s, i) => { for (let k = 0; k < 3; k++) assert.ok(Math.abs(s.at[k] - b[i].at[k]) < 1e-6); assert.ok(Math.abs(s.r - b[i].r) < 1e-6) })
  assert.ok(Math.abs(flames(0).flame.size - flames(1).flame.size) < 1e-9 && Math.abs(flicker(0) - flicker(1)) < 1e-9)
  PINES.forEach((_, i) => assert.ok(Math.abs(pineLean(i, 0.25) - pineLean(i, 1.25)) < 1e-9))
})

test('the hand-written camp and the description are the same camp: one loop, one fire, the pines in the same places', () => {
  assert.equal(SCENE.loop, LOOP)
  const pines = (DOC.bones ?? []).filter((b) => b.name.startsWith('camp-pine'))
  assert.equal(pines.length, PINES.length)
  pines.forEach((b, i) => assert.deepEqual([b.at[0], b.at[2]], PINES[i].at))
  // the fire flickers the same in both, so the four pictures brighten together
  for (const t of [0, 1.3, 7.7]) {
    const lit = SCENE.lights(t)[0].color[0] / SCENE.lights(0)[0].color[0]
    assert.ok(Math.abs(lit - flicker(t / LOOP) / flicker(0)) < 1e-6)
  }
})
