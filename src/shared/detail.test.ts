import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countAsked, countNames, detailNamed, labelNames } from './detail.ts'

test('a detail in the address goes by its label, its id or its count, in any case', () => {
  const levels = [{ id: 0.35, label: 'Light' }, { id: 1, label: 'Full' }, { id: 2, label: 'Lush' }]
  assert.equal(detailNamed(levels, labelNames, 'lush'), levels[2])
  assert.equal(detailNamed(levels, labelNames, ' Full '), levels[1])
  assert.equal(detailNamed(levels, labelNames, '0.35'), levels[0])
  assert.equal(detailNamed(levels, labelNames, 'finest'), undefined)
  assert.equal(detailNamed(levels, labelNames, null), undefined)
  const counts = [100000, 200000, 400000]
  assert.equal(detailNamed(counts, countNames, '200k'), 200000)
  assert.equal(detailNamed(counts, countNames, '400000'), 400000)
  assert.equal(detailNamed(counts, countNames, '300k'), undefined)
})

test('a count asked for reads as a number, and nonsense as nothing', () => {
  assert.equal(countAsked('60k'), 60000)
  assert.equal(countAsked('7.5K'), 7500)
  assert.equal(countAsked('120000'), 120000)
  for (const bad of ['', null, 'fine', '-5k', '0', '1e9', '5kk']) assert.equal(countAsked(bad), undefined, String(bad))
})
