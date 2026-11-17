import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeFrame } from '../../splat-core/pixel.ts'
import { TOUR, busiestSpot, clay, kept, type TourFacts } from './tour.ts'

test('the tour goes from clay shapes to finished pixels, and its words are filled in from the scene', () => {
  assert.deepEqual(TOUR.map((s) => s.id), ['shapes', 'blobs', 'paint', 'samples', 'finish'])
  assert.deepEqual(TOUR.map((s) => s.pixels), [false, false, false, true, true])
  assert.ok(TOUR[1].keep < 0.5 && TOUR.every((s, i) => i === 1 || s.keep === 1), 'only the blobs step thins them out')
  const f: TourFacts = { parts: 84, descriptionBytes: 20480, blobs: 104080, colors: 16, steps: false, lines: 'own' }
  assert.match(TOUR[0].text(f), /84 shapes.*20 KB of text/)
  assert.doesNotMatch(TOUR[0].text({ ...f, descriptionBytes: undefined }), /KB/)
  assert.match(TOUR[1].text(f), /104,080/)
  assert.notEqual(TOUR[2].text(f), TOUR[2].text({ ...f, steps: true }))
  assert.match(TOUR[4].text(f), /nearest of 16 colors/)
  assert.match(TOUR[4].text({ ...f, colors: 0 }), /keeps its own color/)
  // the last step says what the Finish tab's outline really is
  assert.match(TOUR[4].text(f), /darker tone of their own color/)
  assert.match(TOUR[4].text({ ...f, lines: 'one' }), /a dark line round its edge/)
  assert.doesNotMatch(TOUR[4].text({ ...f, lines: 'none' }), /line/)
  for (const s of TOUR) assert.ok(s.text(f).length < 260, `${s.id} fits under the view`)
})

test('clay keeps light and dark and drops the color', () => {
  const dark = clay([0.1, 0.0, 0.2]), light = clay([0.9, 0.9, 0.2]), red = clay([1, 0, 0]), green = clay([0, 0.3, 0])
  assert.ok(light[0] > dark[0] + 0.4)
  for (const c of [dark, light, red, green]) assert.ok(c[0] >= c[1] && c[1] >= c[2] && c[0] - c[2] < 0.08 && c[0] <= 1, 'a warm gray')
  assert.ok(Math.abs(red[0] - green[0]) < 0.02, 'red and green as light as each other come out alike')
})

test('busiestSpot finds the box where samples show more than one thing', () => {
  // art 40 × 30; a thin diagonal line of another part crosses the lower right
  const map = makeFrame(80, 60)
  for (let i = 0; i < 80 * 60; i++) map.data.set([1, 0, 0, 255], i * 4)
  for (let k = 0; k < 20; k++) map.data.set([2, 0, 0, 255], ((30 + k) * 80 + 50 + k) * 4)
  const at = busiestSpot(map, 12)
  // the line runs from art (25, 15) to (35, 25): the box sits over it
  assert.ok(at.x >= 19 && at.x <= 28 && at.y >= 9 && at.y <= 18, JSON.stringify(at))
  // nothing mixed anywhere: the middle
  const flat = makeFrame(80, 60)
  assert.deepEqual(busiestSpot(flat, 12), { x: 14, y: 9 })
  // a picture smaller than the box
  assert.deepEqual(busiestSpot(makeFrame(8, 8), 12), { x: 0, y: 0 })
})

test('kept draws about the share asked for, the same blobs each time', () => {
  let n = 0
  for (let i = 0; i < 40000; i++) if (kept(i, 1 / 8)) n++
  assert.ok(Math.abs(n / 40000 - 1 / 8) < 0.01, String(n))
  assert.equal(kept(123, 1 / 8), kept(123, 1 / 8))
  assert.ok(kept(5, 1))
})
