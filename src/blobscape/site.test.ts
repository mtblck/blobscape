import test from 'node:test'
import assert from 'node:assert/strict'
import { EXPERIMENTS, NEWEST_EXPERIMENTS, TAGS, byPublished, longDate, tagged } from './site.ts'

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

test('every experiment has a kind the filter offers, and every kind has an experiment', () => {
  const ids = TAGS.map((t) => t.id as string)
  for (const e of EXPERIMENTS) {
    assert.ok(e.tags.length > 0, `${e.id} has no tags`)
    for (const t of e.tags) assert.ok(ids.includes(t), `${e.id}: ${t} isn't in TAGS`)
  }
  for (const t of TAGS) assert.ok(tagged(EXPERIMENTS, t.id).length > 0, `no experiment is ${t.id}`)
  assert.equal(tagged(EXPERIMENTS, null).length, EXPERIMENTS.length)
  // filtering keeps the order it is given
  const oldest = byPublished('oldest')
  assert.deepEqual(tagged(oldest, 'game').map((e) => e.id), oldest.filter((e) => (e.tags as readonly string[]).includes('game')).map((e) => e.id))
})
