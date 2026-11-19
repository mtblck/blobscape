import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WASH_PAPER, density, kept, pigment, washed } from './wash.ts'

test('paint only takes light away from the paper, and more of it takes more', () => {
  const paper = [...WASH_PAPER], blue = [0.2, 0.4, 0.8]
  assert.deepEqual(washed(paper, blue, 0), paper)
  const one = washed(paper, blue, 1), two = washed(paper, blue, 2), thin = washed(paper, blue, 0.3)
  for (let k = 0; k < 3; k++) { assert.ok(one[k] <= paper[k] && two[k] < one[k] && thin[k] > one[k]) }
  assert.ok(Math.abs(one[2] - paper[2] * 0.8) < 1e-9)
  assert.ok(washed(paper, [0, 0, 0], 1)[0] > 0)
})

test('pigment is richer than the picture and gray stays gray', () => {
  const p = pigment([0.6, 0.3, 0.3])
  assert.ok(p[0] > 0.6 && p[1] < 0.3)
  const g = pigment([0.4, 0.4, 0.4])
  assert.ok(Math.abs(g[0] - 0.4) < 1e-9 && g[0] === g[1])
})

test('the lightest places are left as bare paper', () => {
  assert.equal(kept(1), 0)
  assert.equal(kept(0.93), 0)
  assert.equal(kept(0.5), 1)
  assert.ok(kept(0.8) > 0 && kept(0.8) < 1)
})

test('paint pools at a wash\'s edge, gathers in the grain, and there is none off the wash', () => {
  assert.equal(density(0, 0.5, 0.5, 1), 0)
  assert.ok(density(1, 0.5, 0.5, 1) > density(1, 0.5, 0.5, 0))
  assert.ok(density(1, 0.5, 0.9, 0) > density(1, 0.5, 0.1, 0))
  assert.equal(density(1, 0.5, 0.9, 0, { grain: 0 }), density(1, 0.5, 0.1, 0, { grain: 0 }))
  assert.ok(density(1, 0.9, 0.5, 0) > density(1, 0.1, 0.5, 0))
  assert.ok(Math.abs(density(1, 0.5, 0.5, 0) - 0.7) < 1e-9)
})
