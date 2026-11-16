import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUDGET, DEFAULTS, growCoat, lightThrough, strandsFor, type CoatOptions } from './coat.ts'

const critter = (o: Partial<CoatOptions> = {}) => growCoat('critter', { ...DEFAULTS.critter, ...o })
const lawn = (o: Partial<CoatOptions> = {}) => growCoat('lawn', { ...DEFAULTS.lawn, ...o })

test('a coat spends exactly its budget, skin and strands together', () => {
  for (const undercoat of [true, false]) {
    for (const segments of [1, 2, 3, 5]) {
      const c = critter({ undercoat, segments })
      const extra = (BUDGET.critter - (c.blobs.count - c.strands * segments)) % segments
      assert.equal(c.blobs.count + extra, BUDGET.critter, `critter, skin ${undercoat}, ${segments} a strand`)
      assert.equal(c.strands, strandsFor('critter', segments, undercoat))
    }
  }
  // without the skin, its blobs become strands
  assert.ok(critter({ undercoat: false }).strands > critter().strands * 1.5)
})

test('the same options grow the same coat', () => {
  const a = lawn({ segments: 3, breeze: 0.6 }).blobs, b = lawn({ segments: 3, breeze: 0.6 }).blobs
  assert.deepEqual(a.center.subarray(0, a.count * 3), b.center.subarray(0, b.count * 3))
})

test('one blob a strand never curves; two or more bend in a breeze', () => {
  assert.equal(lawn({ breeze: 1 }).curl, 0)
  assert.ok(lawn({ segments: 3 }).curl < 0.01)
  const two = lawn({ segments: 2, breeze: 1 }), four = lawn({ segments: 4, breeze: 1 })
  assert.ok(two.curl >= 30, `two blobs curl ${two.curl}`)
  assert.ok(four.curl > two.curl)
})

test('the lawn goal: only two blobs a blade bend in a full breeze and keep 2,000 blades', () => {
  assert.ok(strandsFor('lawn', 2, true) >= 2000)
  assert.ok(strandsFor('lawn', 3, true) < 2000)
})

test('the critter is solid with its skin; without it, only a flat, long coat closes it up', () => {
  assert.ok(lightThrough(critter().blobs) < 0.005)
  assert.ok(lightThrough(critter({ undercoat: false }).blobs) >= 0.03)
  assert.ok(lightThrough(critter({ undercoat: false, length: 0.13 }).blobs) >= 0.015)
  assert.ok(lightThrough(critter({ undercoat: false, lift: 0, length: 0.2 }).blobs) < 0.015)
})
