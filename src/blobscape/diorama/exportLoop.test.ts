import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EXPORT_RATES, exportName, exportSize, leadIn, loopTimes, sideFor, sidesFor } from './exportLoop.ts'
import { DIORAMAS } from './scenes.ts'

test('a loop is a whole number of even steps that ends one step short of its end', () => {
  for (const loop of [8, 12, 14, 16]) for (const fps of EXPORT_RATES) {
    const t = loopTimes(loop, fps)
    assert.equal(t.length, loop * fps)
    assert.equal(t[0], 0)
    const step = t[1] - t[0]
    for (let i = 1; i < t.length; i++) assert.ok(Math.abs(t[i] - t[i - 1] - step) < 1e-9)
    // the step from the last frame back to the first is the same as every other, so the loop joins
    assert.ok(Math.abs(loop - t[t.length - 1] - step) < 1e-9)
  }
})

test('a loop that is not a whole number of frames long still joins', () => {
  const t = loopTimes(2.03, 12)
  assert.equal(t.length, 24)
  assert.ok(Math.abs(2.03 - t[23] - t[1]) < 1e-9)
})

test('every scene exports as whole frames at every rate', () => {
  for (const s of DIORAMAS) for (const fps of EXPORT_RATES) assert.ok(Math.abs(s.loop * fps - Math.round(s.loop * fps)) < 1e-9, `${s.id} at ${fps}`)
})

test('the lead-in is the end of the loop, in order, on the same steps', () => {
  const lead = leadIn(12, 12), t = loopTimes(12, 12)
  assert.equal(lead.length, 6)
  assert.deepEqual(lead.map((x) => Math.round(x * 1e6)), t.slice(-6).map((x) => Math.round(x * 1e6)))
  assert.equal(leadIn(0.25, 12).length, 3)
})

test('an export is never bigger than the picture, and its sides are even', () => {
  assert.deepEqual(exportSize(1600, 1200, 1080), [1080, 810])
  assert.deepEqual(exportSize(800, 600, 1920), [800, 600])
  assert.deepEqual(exportSize(601, 451, 1920), [602, 452])
  assert.deepEqual(exportSize(900, 1200, 480), [360, 480])
})

test('an animated PNG is offered only the smaller sizes', () => {
  assert.deepEqual(sidesFor('png'), [480, 720])
  assert.equal(sidesFor('mp4').length, 4)
  assert.equal(sideFor('png', 1080), 720)
  assert.equal(sideFor('png', 480), 480)
  assert.equal(sideFor('mp4', 1080), 1080)
})

test('file names say the scene, the style and what it is', () => {
  assert.equal(exportName('koi', 'pixel', 'loop', 'png'), 'pixel-diorama-koi-loop.png')
  assert.equal(exportName('koi', 'oil', 'loop', 'mp4'), 'pixel-diorama-koi-oil-loop.mp4')
  assert.equal(exportName('koi', 'cel', 'frame', 'png'), 'pixel-diorama-koi-cel.png')
})
