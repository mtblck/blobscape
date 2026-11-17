import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BLOWS, Impact, MAX_HOLD, MAX_SHAKE, blowOf } from './impact.ts'

test('a sword hit holds the fight for its hold, then gives the game all its time', () => {
  const im = new Impact()
  im.add([{ type: 'hit', kind: 'green', by: 'sword' }])
  let game = 0, real = 0
  while (real < 0.2) { game += im.pass(1 / 60); real += 1 / 60 }
  assert.ok(Math.abs(real - game - BLOWS.sword.hold) < 1e-9, `${real - game}`)
})

test('holds take the longest and never pass MAX_HOLD; shakes add up to MAX_SHAKE and settle', () => {
  const im = new Impact()
  im.add([{ type: 'burst', kind: 'green' }, { type: 'break', kind: 'barrel' }, { type: 'hurt', kind: 'red', damage: 1 }])
  assert.equal(im.hold, BLOWS.barrel.hold)
  for (let k = 0; k < 5; k++) im.add([{ type: 'break', kind: 'barrel' }])
  assert.ok(im.hold <= MAX_HOLD && im.shake === MAX_SHAKE)
  for (let k = 0; k < 60; k++) im.pass(1 / 60)
  assert.equal(im.shake, 0, 'still in a second')
  assert.deepEqual(im.offset(), [0, 0, 0])
})

test('reduced motion keeps the hold but never shakes', () => {
  const im = new Impact(true)
  im.add([{ type: 'break', kind: 'barrel' }])
  assert.ok(im.hold > 0)
  im.pass(0.01)
  assert.deepEqual(im.offset(), [0, 0, 0])
})

test('only blows count: swings, waves and fizzles do nothing', () => {
  for (const e of [{ type: 'swing' }, { type: 'wave', wave: 1 }, { type: 'fizzle' }, { type: 'hit', kind: 'green', by: 'fire' }] as const) assert.equal(blowOf(e), undefined)
  const im = new Impact()
  im.add([{ type: 'swing' }, { type: 'cast' }])
  assert.equal(im.pass(0.1), 0.1)
})
