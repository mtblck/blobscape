import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zoomStep } from './zoom.ts'

test('zooming in on pixel art grows the pixels in whole steps, and never shrinks them', () => {
  assert.equal(zoomStep(10, 10), 1)
  assert.equal(zoomStep(10, 20), 1)
  assert.equal(zoomStep(10, 6), 1)
  assert.equal(zoomStep(10, 5), 2)
  assert.equal(zoomStep(10, 2.5), 4)
  assert.equal(zoomStep(10, 0), 1)
})
