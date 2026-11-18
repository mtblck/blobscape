import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blurRadius, blurScale, focalLength, glowShare, sharpRange, type OpticsLook } from './optics.ts'

const look: OpticsLook = { focus: 6, fNumber: 2, glow: 0.5 }

test('a 35 mm frame seen 40 degrees tall is a 33 mm lens', () => {
  assert.ok(Math.abs(focalLength(40) - 0.03297) < 1e-4)
  assert.ok(focalLength(20) > focalLength(40), 'a narrower view is a longer lens')
})

test('the blur is the thin lens\'s circle of confusion', () => {
  // by hand: f = 0.03297, A = f / 2, c = A·f·|d − s| / (d·(s − f)) on 24 mm of film, 1000 pixels tall
  const f = focalLength(40), d = 3
  const c = ((f / 2) * f * Math.abs(d - 6)) / (d * (6 - f))
  assert.ok(Math.abs(blurRadius(d, look, 40, 1000) - (c / 2 / 0.024) * 1000) < 1e-9)
  assert.equal(blurRadius(6, look, 40, 1000), 0, 'sharp at the focus')
})

test('blur grows with the opening, faster in front of the focus than behind, and stops at the most allowed', () => {
  const at = (d: number, n = 2) => blurRadius(d, { ...look, fNumber: n }, 40, 1000)
  assert.ok(at(3) > at(3, 8) * 3.9 && at(3) < at(3, 8) * 4.1, 'four times the opening, four times the blur')
  assert.ok(at(3) > at(9), 'three in front blurs more than three behind')
  assert.ok(at(1000) < at(1e6) + 1e-6 && at(1e6) <= blurScale(look, 40, 1000), 'behind, it levels off')
  assert.equal(blurRadius(0.05, { ...look, most: 0.01 }, 40, 1000), 10)
  assert.equal(blurRadius(3, { ...look, fNumber: 0 }, 40, 1000), 0, 'off')
  assert.equal(blurRadius(0, look, 40, 1000), 0, 'nothing there')
})

test('the slice in focus is where the blur is under a pixel', () => {
  const r = sharpRange(look, 40, 1000)
  assert.ok(r.near < 6 && r.far > 6)
  assert.ok(Math.abs(blurRadius(r.near, look, 40, 1000) - 1) < 1e-9 && Math.abs(blurRadius(r.far, look, 40, 1000) - 1) < 1e-9)
  assert.equal(sharpRange({ ...look, fNumber: 64, focus: 30 }, 40, 300).far, Infinity)
})

test('only bright things glow', () => {
  assert.equal(glowShare(0.5), 0)
  assert.equal(glowShare(1.2), 1)
  assert.ok(glowShare(0.8) > 0 && glowShare(0.8) < 1)
})
