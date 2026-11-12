import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CAPTURED_AT, buildScene, capture, closeness, relight, tableError, truth } from './relight.ts'

const s = buildScene(0.4)
const cap = capture(s)
const real = truth(s, 125)
const score = (o: Parameters<typeof relight>[2]) => { const r = relight(s, cap, o); return { all: closeness(r, real, cap), table: tableError(s, r, real) } }

test('the capture is the real thing under the capture lamp', () => {
  assert.deepEqual(cap, truth(s, CAPTURED_AT))
})

test('only taking the old light out catches up, and only the shape moves the shadows', () => {
  const stuck = score({ lamp: 125, mode: 'captured', guess: 0, shape: false })
  const added = score({ lamp: 125, mode: 'add', guess: 0, shape: false })
  const wrongGuess = score({ lamp: 125, mode: 'remove', guess: CAPTURED_AT + 60, shape: false })
  const goodGuess = score({ lamp: 125, mode: 'remove', guess: CAPTURED_AT, shape: false })
  const withShape = score({ lamp: 125, mode: 'remove', guess: CAPTURED_AT, shape: true })
  assert.ok(Math.abs(stuck.all) < 1e-9)
  assert.ok(added.all < 0.2, `adding light ${added.all}`)
  assert.ok(goodGuess.all > wrongGuess.all && goodGuess.all >= 0.55, `guess ${wrongGuess.all} → ${goodGuess.all}`)
  assert.ok(goodGuess.table > 0.05, 'the old shadow stays on the table')
  assert.ok(withShape.all > 0.99 && withShape.table < 0.01)
})
