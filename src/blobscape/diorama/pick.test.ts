import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matching, stepped } from './pick.ts'
import { DIORAMAS } from './scenes.ts'

const ids = (q: string) => matching(DIORAMAS, q).map((d) => d.id)

test('nothing typed finds every scene in the list\'s order', () => {
  assert.deepEqual(ids(''), DIORAMAS.map((d) => d.id))
  assert.deepEqual(ids('   '), DIORAMAS.map((d) => d.id))
})

test('a search finds scenes by name first, then by what is in them', () => {
  assert.deepEqual(ids('snail'), ['snail'])
  assert.deepEqual(ids('WINDM'), ['windmill'])
  const fox = ids('fox')
  assert.equal(fox[0], 'meadow')
  // a lantern is in two names, and in other scenes' pictures after them
  const lantern = ids('lantern')
  assert.deepEqual(lantern.slice(0, 2), ['grove', 'spider'])
  assert.deepEqual(ids('lantern spider'), ['spider'])
  assert.deepEqual(ids('zzzz'), [])
})

test('every word typed must be found, at the start of a word', () => {
  assert.ok(!ids('ail').includes('snail'))
  for (const d of DIORAMAS) assert.ok(ids(d.label).includes(d.id), d.label)
})

test('previous and next go round the list', () => {
  const last = DIORAMAS[DIORAMAS.length - 1]
  assert.equal(stepped(DIORAMAS, DIORAMAS[0].id, 1), DIORAMAS[1])
  assert.equal(stepped(DIORAMAS, DIORAMAS[0].id, -1), last)
  assert.equal(stepped(DIORAMAS, last.id, 1), DIORAMAS[0])
  assert.equal(stepped(DIORAMAS, 'nowhere', 1), DIORAMAS[0])
})
