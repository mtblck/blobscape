import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_STYLE, PICKED_STYLES, STYLES, offered, styleAsked, styleWords } from './styles.ts'
import { LOOKS } from '../brushLooks.ts'
import { CEL } from '../celLooks.ts'
import { BLOCKS, BLOCK_GROUNDS, BLOCK_SPAN, BLOCK_START, blockBack, blockLook, gridOf } from '../blockLooks.ts'
import { TIMES, paletteAt, timeAsked, timeOf, under } from '../timeOfDay.ts'
import { WASH, WASH_PAPERS, WASH_SKY_COLORS as WASH_SKY, WASH_START, washLook } from '../washLooks.ts'
import { GLASS, glassLook, GLASS_START } from '../glassLooks.ts'
import { GLITCH, GLITCH_START, glitchLook } from '../glitchLooks.ts'
import { HALFTONE } from '../halftoneLooks.ts'
import { FILTERS } from '../../splat-engine/styles/filterLooks.ts'
import { NEON, NEON_PACES, neonLook, NEON_START, periodIn } from '../neonLooks.ts'
import { ANAGLYPH, ANAGLYPH_START, anaglyphLook } from '../anaglyphLooks.ts'
import { ANAGLYPH_BACK } from '../../splat-core/anaglyph.ts'

test('blocks come first and are the default, then pixel art and every look Brush and Ink offers, each once', () => {
  assert.equal(STYLES[0].id, 'blocks')
  assert.equal(STYLES[0].id, DEFAULT_STYLE)
  assert.equal(STYLES[1].id, 'pixel')
  const ids = STYLES.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const l of [...LOOKS, GLITCH, CEL, BLOCKS, NEON, GLASS, WASH, ANAGLYPH, HALFTONE, ...FILTERS]) assert.ok(ids.includes(l.id), `${l.id} is offered`)
  assert.equal(ids.length, LOOKS.length + 10 + FILTERS.length)
  assert.equal(STYLES[2].id, 'glitch')
})

test('an address picks a style, and anything else is the default, blocks', () => {
  assert.equal(styleAsked('oil'), 'oil')
  assert.equal(styleAsked('cel'), 'cel')
  assert.equal(styleAsked('neon'), 'neon')
  assert.equal(styleAsked('ascii'), 'ascii')
  assert.equal(styleAsked(null), 'blocks')
  assert.equal(styleAsked('pixel'), 'pixel')
  assert.equal(styleAsked('glass'), 'glass')
  assert.equal(styleAsked('watercolor'), 'watercolor')
  assert.equal(styleAsked('anaglyph'), 'anaglyph')
  assert.equal(styleAsked('woodcut'), 'blocks')
  // Text is still `ascii` (and `text`); its old box sets are Box Art's now
  assert.equal(styleAsked('text'), 'ascii')
  assert.equal(styleAsked('boxart'), 'boxart')
  assert.equal(styleAsked('ascii', 'lines'), 'boxart')
  assert.equal(styleAsked('ascii', 'blocks'), 'boxart')
  assert.equal(styleAsked('ascii', 'braille'), 'ascii')
  assert.equal(styleAsked('oil', 'lines'), 'oil')
})

test('every style has a note and words for the line under the view', () => {
  for (const s of STYLES) {
    assert.ok(s.note.length > 10, s.id)
    assert.match(styleWords(s.id), /^(as|in|through|on) \S/, s.id)
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

test('watercolor is laid on a light paper, with a scene\'s own sky behind or a pale one', () => {
  for (const p of WASH_PAPERS) assert.ok(Math.min(...p.paper) > 0.8, p.id)
  assert.deepEqual(washLook(WASH_START).sky, WASH_SKY)
  assert.equal(washLook(WASH_START).border, true, 'the paper border is there unless turned off')
  assert.equal(washLook({ ...WASH_START, border: false }).border, false)
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
  // a cut that says its grid is snapped to that grid, not to a guess that falls between its rows of blobs
  assert.equal(gridOf(undefined, [0, 0, 0, 4.8, 1, 0], 2, 0.03), 0.03)
  assert.equal(gridOf(0.05, [], 0, 0.03), 0.05)
  const look = blockLook({ ...BLOCK_START, size: 3 }, 0.02, 90)
  assert.ok(Math.abs(look.cell - 0.06) < 1e-9)
  // the light is measured from the starting view: a quarter turn of the view turns it with it
  const straight = blockLook({ ...BLOCK_START, turn: 0, height: 0 }, 0.02, 90).from!
  assert.ok(Math.abs(straight[0] - 1) < 1e-9 && Math.abs(straight[2]) < 1e-9)
  assert.equal(blockLook({ ...BLOCK_START, size: 99 }, 1).cell, 8)
})

test('a Blocks backdrop is the subject\'s own sky or a plain color, and the time of day is the page\'s', () => {
  const sky = { back: 'linear-gradient(#000, #111)', night: 1 }
  // nothing chosen: the subject's own sky where it has one, else daylight
  assert.deepEqual([blockBack('', sky).id, blockBack('').id, blockBack('scene').id], ['scene', 'day', 'day'])
  assert.ok(blockBack('', sky).light![0] < 0.5, 'a dark sky of its own is a night\'s light')
  assert.equal(blockBack('', sky, true).light, undefined, 'a time of day the page set already dims the stage')
  for (const g of BLOCK_GROUNDS) { const b = blockBack(g.id, sky); assert.ok(b.light === undefined && b.back === g.back) }
  const ids = BLOCK_GROUNDS.map((x) => x.id)
  assert.equal(new Set([...ids, 'scene']).size, ids.length + 1)
})

test('a time of day brings a sky, a light and a palette that holds the scene\'s colors under it', () => {
  assert.deepEqual(TIMES.map((t) => t.id), ['morning', 'afternoon', 'night'])
  assert.deepEqual(TIMES.map((t) => t.dark), [false, false, true])
  assert.equal(timeAsked('night'), 'night')
  assert.equal(timeAsked('noon'), undefined)
  const night = timeOf('night'), morning = timeOf('morning')
  assert.ok(night.light[2] > night.light[0] && night.light[0] < 0.5, 'night is dim and blue')
  assert.ok(morning.light[0] > morning.light[2], 'morning is warm')
  assert.deepEqual(under([200, 200, 200], [1, 1, 1]), [200, 200, 200])
  const dim = under([200, 200, 200], night.light)
  assert.ok(dim[0] < dim[2] && dim[2] < 200)
  // the night's palette holds the dimmed color, the sky's, and still the bright one a lamp lights
  const own: [number, number, number][] = [[200, 200, 200], [40, 120, 40], [255, 220, 90]]
  const at = paletteAt(own, night)
  const has = (c: readonly number[]) => at.some((p) => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) < 12)
  assert.ok(has(dim) && has([255, 220, 90]) && has([13, 18, 40]) && at.length <= 32)
  assert.ok(paletteAt(own, timeOf('afternoon')).length >= own.length)
})

test('3D glasses stand the subject’s own sky behind it, or the dark backdrop', () => {
  assert.deepEqual(anaglyphLook(ANAGLYPH_START).back, ANAGLYPH_BACK)
  assert.deepEqual(anaglyphLook(ANAGLYPH_START, [[255, 255, 255], [0, 0, 0]]).back, [[1, 1, 1], [0, 0, 0]])
  assert.equal(anaglyphLook({ ...ANAGLYPH_START, mix: 'gray' }).mix, 'gray')
})

test('claymation is hidden from the pickers but still opens by address', () => {
  assert.ok(STYLES.some((s) => s.id === 'clay'))
  assert.ok(!PICKED_STYLES.some((s) => s.id === 'clay'))
  assert.equal(PICKED_STYLES.length, STYLES.length - 1)
  assert.equal(offered('clay'), false)
  assert.equal(offered('blocks'), true)
  assert.equal(styleAsked('clay'), 'clay')
})
