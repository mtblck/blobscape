import test from 'node:test'
import assert from 'node:assert/strict'
import { EXPERIMENTS, NEWEST_EXPERIMENTS, byPublished, longDate } from './site.ts'

test('the experiments list is written newest first, as the menu and front page read it', () => {
  assert.deepEqual(byPublished('newest').map((e) => e.id), EXPERIMENTS.map((e) => e.id))
  assert.deepEqual(byPublished('oldest').map((e) => e.id), EXPERIMENTS.map((e) => e.id).reverse())
  assert.deepEqual(NEWEST_EXPERIMENTS.map((e) => e.id), EXPERIMENTS.slice(0, 3).map((e) => e.id))
})

test('every experiment has real dates, updated no earlier than published', () => {
  for (const e of EXPERIMENTS) {
    for (const d of [e.published, e.updated]) assert.equal(new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10), d, `${e.id}: ${d}`)
    assert.ok(e.updated >= e.published, e.id)
  }
  assert.equal(longDate('2026-11-05'), 'Nov 5, 2026')
})
