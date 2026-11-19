import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitInto, readGradient, recordName, recordSize } from './record.ts'

test('a view is fitted whole into the video and centered', () => {
  const view = { x: 100, y: 50, w: 800, h: 600 }
  assert.deepEqual(fitInto(view, view, 1600, 1200), { x: 0, y: 0, w: 1600, h: 1200 })
  // a canvas in the right half
  assert.deepEqual(fitInto(view, { x: 500, y: 50, w: 400, h: 600 }, 1600, 1200), { x: 800, y: 0, w: 800, h: 1200 })
  // the view went wide (full screen): bars above and below, nothing stretched
  const wide = fitInto({ x: 0, y: 0, w: 1600, h: 600 }, { x: 0, y: 0, w: 1600, h: 600 }, 1600, 1200)
  assert.deepEqual(wide, { x: 0, y: 300, w: 1600, h: 600 })
})

test('the video has even sides, the screen\'s own pixels, and a long side of at most 1920', () => {
  assert.deepEqual(recordSize(800, 600, 2), [1600, 1200])
  assert.deepEqual(recordSize(801, 601, 1), [802, 602])
  assert.deepEqual(recordSize(1400, 1050, 2), [1920, 1440])
  assert.deepEqual(recordSize(390, 380, 3), [1170, 1140])
})

test('a gradient is read as the browser reports it', () => {
  assert.deepEqual(readGradient('linear-gradient(rgb(10, 15, 30), rgb(31, 45, 85))'), { angle: 180, stops: [{ color: 'rgb(10, 15, 30)', at: 0 }, { color: 'rgb(31, 45, 85)', at: 1 }] })
  const g = readGradient('linear-gradient(to top, rgb(1, 2, 3) 10%, rgba(4, 5, 6, 0.5), rgb(7, 8, 9), rgb(0, 0, 0) 70%)')!
  assert.equal(g.angle, 0)
  assert.deepEqual(g.stops.map((s) => Math.round(s.at * 100)), [10, 30, 50, 70])
  assert.equal(g.stops[1].color, 'rgba(4, 5, 6, 0.5)')
  assert.equal(readGradient('linear-gradient(45deg, red, blue)')!.angle, 45)
  assert.equal(readGradient('url("a.png")'), undefined)
  assert.equal(readGradient('radial-gradient(red, blue)'), undefined)
  assert.equal(readGradient('linear-gradient(to top left, red, blue)'), undefined)
})

test('a recording is named for its page and the moment', () => {
  assert.equal(recordName('/experiments/seasonal-bouquets/', new Date(2026, 10, 19, 9, 5, 7), 'mp4'), 'blobscape-seasonal-bouquets-20261119-090507.mp4')
  assert.equal(recordName('/', new Date(2026, 0, 2, 3, 4, 5), 'webm'), 'blobscape-blobscape-20260102-030405.webm')
})

test('a view a fraction of a pixel off the video\'s shape still fills it', () => {
  const view = { x: 0, y: 0, w: 818.4, h: 613.8 }
  assert.deepEqual(fitInto(view, view, 818, 614), { x: 0, y: 0, w: 818, h: 614 })
})
