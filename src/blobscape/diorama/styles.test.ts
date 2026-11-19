import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STYLES, styleAsked, styleWords } from './styles.ts'
import { LOOKS } from '../brushLooks.ts'
import { CEL } from '../celLooks.ts'
import { GLASS, glassLook, GLASS_START } from '../glassLooks.ts'
import { NEON, NEON_PACES, neonLook, NEON_START, periodIn } from '../neonLooks.ts'

test('pixel art comes first, then every look Brush and Ink offers, each once', () => {
  assert.equal(STYLES[0].id, 'pixel')
  const ids = STYLES.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const l of [...LOOKS, CEL, NEON, GLASS]) assert.ok(ids.includes(l.id), `${l.id} is offered`)
  assert.equal(ids.length, LOOKS.length + 4)
})

test('an address picks a style, and anything else is pixel art', () => {
  assert.equal(styleAsked('oil'), 'oil')
  assert.equal(styleAsked('cel'), 'cel')
  assert.equal(styleAsked('neon'), 'neon')
  assert.equal(styleAsked('ascii'), 'ascii')
  assert.equal(styleAsked(null), 'pixel')
  assert.equal(styleAsked('glass'), 'glass')
  assert.equal(styleAsked('woodcut'), 'pixel')
})

test('every style has a note and words for the line under the view', () => {
  for (const s of STYLES) {
    assert.ok(s.note.length > 10, s.id)
    assert.match(styleWords(s.id), /^(as|in) \S/, s.id)
  }
  assert.equal(styleWords('ink'), 'in ink and wash')
})

test('neon\'s pulses go a whole number of times into a scene\'s loop', () => {
  for (const loop of [6, 8, 10, 12, 16]) for (const p of NEON_PACES) {
    if (!p.period) { assert.equal(periodIn(p.period, loop), 0); continue }
    const turns = loop / periodIn(p.period, loop)
    assert.ok(turns >= 1 && Math.abs(turns - Math.round(turns)) < 1e-9, `${p.id} in ${loop}`)
  }
  assert.equal(periodIn(3), 3)
  assert.equal(neonLook(NEON_START, 8, true).period, 0)
  assert.equal(neonLook(NEON_START).colors, undefined)
})

test('stained glass takes a scene\'s own sky for the window round it', () => {
  assert.equal(glassLook(GLASS_START).sky, undefined)
  assert.deepEqual(glassLook(GLASS_START, [[255, 0, 51], [0, 102, 255]]).sky, [[1, 0, 0.2], [0, 0.4, 1]])
  assert.equal(styleWords('glass'), 'in stained glass')
})
