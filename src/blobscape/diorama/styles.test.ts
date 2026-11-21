import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STYLES, styleAsked, styleWords } from './styles.ts'
import { LOOKS } from '../brushLooks.ts'
import { CEL } from '../celLooks.ts'
import { BLOCKS, BLOCK_GROUNDS, BLOCK_SPAN, BLOCK_START, BLOCK_TIMES, blockBack, blockLook, gridOf } from '../blockLooks.ts'
import { WASH, WASH_PAPERS, WASH_START, washLook } from '../washLooks.ts'
import { GLASS, glassLook, GLASS_START } from '../glassLooks.ts'
import { GLITCH, GLITCH_START, glitchLook } from '../glitchLooks.ts'
import { NEON, NEON_PACES, neonLook, NEON_START, periodIn } from '../neonLooks.ts'

test('pixel art comes first, then every look Brush and Ink offers, each once', () => {
  assert.equal(STYLES[0].id, 'pixel')
  const ids = STYLES.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const l of [...LOOKS, GLITCH, CEL, BLOCKS, NEON, GLASS, WASH]) assert.ok(ids.includes(l.id), `${l.id} is offered`)
  assert.equal(ids.length, LOOKS.length + 7)
  assert.equal(STYLES[1].id, 'glitch')
})

test('an address picks a style, and anything else is pixel art', () => {
  assert.equal(styleAsked('oil'), 'oil')
  assert.equal(styleAsked('cel'), 'cel')
  assert.equal(styleAsked('neon'), 'neon')
  assert.equal(styleAsked('ascii'), 'ascii')
  assert.equal(styleAsked(null), 'pixel')
  assert.equal(styleAsked('glass'), 'glass')
  assert.equal(styleAsked('watercolor'), 'watercolor')
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

test('watercolor is laid on a light paper, with a scene\'s own sky behind', () => {
  for (const p of WASH_PAPERS) assert.ok(Math.min(...p.paper) > 0.8, p.id)
  assert.equal(washLook(WASH_START).sky, undefined)
  assert.deepEqual(washLook(WASH_START, [[255, 255, 255], [0, 0, 0]]).sky, [[1, 1, 1], [0, 0, 0]])
  assert.equal(styleWords('watercolor'), 'in watercolor')
})

test('tech glitch is pixel art underneath, and holds still under reduced motion', () => {
  assert.equal(styleAsked('glitch'), 'glitch')
  assert.equal(styleWords('glitch'), 'as glitching pixel art')
  assert.equal(glitchLook(GLITCH_START, 8, true).still, true)
  assert.equal(glitchLook(GLITCH_START, 8).loop, 8)
})

test('blocks are whole cells of the grid a scene was cut on, or a share of a subject cut on none', () => {
  assert.equal(styleAsked('blocks'), 'blocks')
  assert.equal(styleWords('blocks'), 'as blocks')
  assert.equal(gridOf(0.03, [], 0), 0.03)
  assert.ok(Math.abs(gridOf(undefined, [0, 0, 0, 4.8, 1, 0], 2) - 4.8 / BLOCK_SPAN) < 1e-9)
  const look = blockLook({ ...BLOCK_START, size: 3 }, 0.02, 90)
  assert.ok(Math.abs(look.cell - 0.06) < 1e-9)
  // the light is measured from the starting view: a quarter turn of the view turns it with it
  const straight = blockLook({ ...BLOCK_START, turn: 0, height: 0 }, 0.02, 90).from!
  assert.ok(Math.abs(straight[0] - 1) < 1e-9 && Math.abs(straight[2]) < 1e-9)
  assert.equal(blockLook({ ...BLOCK_START, size: 99 }, 1).cell, 8)
})

test('a Blocks backdrop is a time of day with its light, or a plain color in day\'s light', () => {
  const sky = { back: 'linear-gradient(#000, #111)', night: 1 }
  // nothing chosen: the subject's own sky where it has one, else the afternoon
  assert.deepEqual([blockBack('', sky).id, blockBack('').id, blockBack('scene').id], ['scene', 'afternoon', 'afternoon'])
  assert.ok(blockBack('', sky).light![0] < 0.5, 'a dark sky of its own is a night\'s light')
  assert.equal(blockBack('afternoon', sky).light, undefined)
  for (const t of BLOCK_TIMES) { const b = blockBack(t.id, sky); assert.ok(b.time && b.back === t.back) }
  assert.ok(blockBack('night').light![2] > blockBack('night').light![0], 'night is dim and blue')
  assert.ok(blockBack('morning').light![0] > blockBack('morning').light![2], 'morning is warm')
  for (const g of BLOCK_GROUNDS) { const b = blockBack(g.id, sky); assert.ok(!b.time && b.light === undefined && b.back === g.back) }
  const ids = [...BLOCK_TIMES, ...BLOCK_GROUNDS].map((x) => x.id)
  assert.equal(new Set([...ids, 'scene']).size, ids.length + 1)
})
