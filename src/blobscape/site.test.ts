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

test('every experiment has a share picture cut from its cover, and its page points at it', async () => {
  const { existsSync } = await import('node:fs')
  const { pageMeta, shareImage } = await import('./meta.ts')
  for (const e of EXPERIMENTS) {
    assert.ok(existsSync(new URL(`../../public${e.cover}`, import.meta.url)), `${e.id} has no cover`)
    assert.ok(existsSync(new URL(`../../public${shareImage(e)}`, import.meta.url)), `${e.id} has no share picture: run scripts/share-images.mjs`)
  }
  assert.equal(pageMeta({ page: 'diorama' }).image?.src, '/share/pixel-diorama.jpg')
  assert.equal(pageMeta({ page: 'home' }).image, undefined)
})

test('every page has a title and a description a search result shows whole, and no two pages share one', async () => {
  const { pageMeta, SEARCH_MOST } = await import('./meta.ts')
  const { LESSONS } = await import('./routes.ts')
  const { POSTS } = await import('./news.ts')
  const pages = ['home', 'lessons', 'sandbox', 'creator', 'experiments', 'creature', 'forest', 'pond', 'clockwork', 'shift', 'flow', 'brush', 'text', 'fourways', 'daynight', 'bouquet', 'islands', 'sweater', 'jelly', 'morph', 'diorama', 'dungeon', 'scan', 'engine', 'spec', 'api', 'contact', 'news'] as const
  const metas = [...pages.map((page) => pageMeta({ page } as Parameters<typeof pageMeta>[0])), ...LESSONS.map((l) => pageMeta({ page: 'lesson', id: l.id })), ...POSTS.map((p) => pageMeta({ page: 'post', id: p.id }))]
  for (const m of metas) {
    // the checker's own limits: a title over 65 or a description over 160 is cut off in results
    assert.ok(m.title.length >= 15 && m.title.length <= 65, `${m.path}: the title is ${m.title.length} characters`)
    assert.ok(m.search.length >= 50 && m.search.length <= SEARCH_MOST, `${m.path}: the search description is ${m.search.length} characters, at most ${SEARCH_MOST} show`)
    assert.ok(m.description.length >= m.search.length, `${m.path}: the short description is the longer one`)
  }
  assert.equal(new Set(metas.map((m) => m.title)).size, metas.length, 'two pages share a title')
  assert.equal(new Set(metas.map((m) => m.search)).size, metas.length, 'two pages share a search description')
})
