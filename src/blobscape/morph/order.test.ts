import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STYLES, isPixelStyle } from '../../splat-engine/styles/styles.ts'
import { MORPH_START, morphOrder, nextLook } from './order.ts'

test('the styles it starts with are all shared looks, once each', () => {
  const known = new Set<string>(STYLES.filter((s) => !isPixelStyle(s.id)).map((s) => s.id))
  for (const id of MORPH_START) assert.ok(known.has(id), id)
  assert.equal(new Set(MORPH_START).size, MORPH_START.length)
})

test('the address picks the order, keeping known looks once, and needs two', () => {
  assert.deepEqual(morphOrder('cel,neon,cel,nonsense'), ['cel', 'neon'])
  assert.deepEqual(morphOrder('cel'), [...MORPH_START])
  assert.deepEqual(morphOrder(null), [...MORPH_START])
})

test('the next style goes round either way', () => {
  const order = morphOrder('blobs,cel,neon')
  assert.equal(nextLook(order, 'blobs'), 'cel')
  assert.equal(nextLook(order, 'neon'), 'blobs')
  assert.equal(nextLook(order, 'blobs', -1), 'neon')
  assert.equal(nextLook(order, 'glass'), 'blobs')
})
