import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STYLES, styleAsked, styleWords } from './styles.ts'
import { LOOKS } from '../brushLooks.ts'
import { CEL } from '../celLooks.ts'

test('pixel art comes first, then every look Brush and Ink offers, each once', () => {
  assert.equal(STYLES[0].id, 'pixel')
  const ids = STYLES.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const l of [...LOOKS, CEL]) assert.ok(ids.includes(l.id), `${l.id} is offered`)
  assert.equal(ids.length, LOOKS.length + 2)
})

test('an address picks a style, and anything else is pixel art', () => {
  assert.equal(styleAsked('oil'), 'oil')
  assert.equal(styleAsked('cel'), 'cel')
  assert.equal(styleAsked('ascii'), 'ascii')
  assert.equal(styleAsked(null), 'pixel')
  assert.equal(styleAsked('watercolor'), 'pixel')
})

test('every style has a note and words for the line under the view', () => {
  for (const s of STYLES) {
    assert.ok(s.note.length > 10, s.id)
    assert.match(styleWords(s.id), /^(as|in) \S/, s.id)
  }
  assert.equal(styleWords('ink'), 'in ink and wash')
})
