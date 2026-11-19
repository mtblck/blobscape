import { test } from 'node:test'
import assert from 'node:assert/strict'
import { KIND_NUMBER, TRANSITIONS, TRANSITION_GLSL, overlayAt, rankAt, transitionHash } from './transition.ts'

const W = 96, H = 64, CELL = 2

/** Every pixel's overlay at a moment. */
const picture = (id: string, p: number) => {
  const t = TRANSITIONS.find((x) => x.id === id)!
  const out: { old: number; cover: number }[] = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out.push(overlayAt(t, p, x, y, W, H, CELL, 7))
  return out
}

test('every transition starts on the old picture whole and ends with nothing over the new one', () => {
  for (const t of TRANSITIONS) {
    for (const o of picture(t.id, 0)) assert.deepEqual(o, { old: 1, cover: 0 }, t.id)
    for (const o of picture(t.id, 1)) assert.deepEqual(o, { old: 0, cover: 0 }, t.id)
  }
})

test('no pixel is ever more than covered, and ranks lie between 0 and 1', () => {
  for (const t of TRANSITIONS) {
    for (let k = 0; k <= 20; k++) for (const o of picture(t.id, k / 20)) {
      assert.ok(o.old >= 0 && o.cover >= 0 && o.old + o.cover <= 1 + 1e-9, t.id)
    }
    for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
      const r = rankAt(t.id, x, y, W, H, CELL, 7)
      assert.ok(r >= 0 && r <= 1, `${t.id}: ${r}`)
    }
  }
})

test('the new picture only ever gains: a pixel that shows it keeps showing it', () => {
  for (const t of TRANSITIONS) {
    let before = picture(t.id, 0).map((o) => 1 - o.old - o.cover)
    for (let k = 1; k <= 40; k++) {
      const p = k / 40
      // through a cover, the new picture starts to show only once the cover is whole
      const now = picture(t.id, p).map((o) => 1 - o.old - o.cover)
      for (let i = 0; i < now.length; i++) assert.ok(now[i] >= before[i] - 1e-9, `${t.id} at ${p}`)
      before = now
    }
  }
})

test('one that goes through the cover is all cover halfway, and shows nothing of the old picture after', () => {
  for (const t of TRANSITIONS.filter((x) => x.through)) {
    for (const o of picture(t.id, 0.5 - 1e-9)) assert.ok(o.cover > 0.999, t.id)
    for (const o of picture(t.id, 0.6)) assert.equal(o.old, 0, t.id)
  }
})

test('a wipe runs left to right, an iris closes onto the middle and opens from it', () => {
  const wipe = picture('wipe', 0.5)
  assert.equal(wipe[H / 2 * W + 2].old, 0)
  assert.equal(wipe[H / 2 * W + W - 3].old, 1)
  const closing = picture('iris', 0.2), opening = picture('iris', 0.75)
  const mid = (H / 2) * W + W / 2, corner = 0
  assert.equal(closing[corner].cover, 1)
  assert.equal(closing[mid].old, 1)
  assert.equal(opening[mid].cover, 0)
  assert.equal(opening[corner].cover, 1)
})

test('the dither turns the cells of one art pixel together, and a quarter of them by a quarter of the way', () => {
  const shown = picture('dither', 0.5).map((o) => 1 - o.old)
  for (let y = 0; y < H; y += CELL) for (let x = 0; x < W; x += CELL) {
    assert.equal(shown[y * W + x], shown[y * W + x + 1])
    assert.equal(shown[y * W + x], shown[(y + 1) * W + x])
  }
  const share = shown.reduce((a, b) => a + b, 0) / shown.length
  assert.ok(Math.abs(share - 0.5) < 0.02, `${share}`)
})

test('the hash is a whole-number hash, the same each time and spread over 0 to 1', () => {
  assert.equal(transitionHash(3, 9, 7), transitionHash(3, 9, 7))
  let sum = 0
  for (let i = 0; i < 1000; i++) { const h = transitionHash(i % 37, Math.floor(i / 37), 5); assert.ok(h >= 0 && h < 1); sum += h }
  assert.ok(Math.abs(sum / 1000 - 0.5) < 0.05)
})

test('the shader twin numbers every kind and uses the same constants', () => {
  assert.equal(new Set(Object.values(KIND_NUMBER)).size, TRANSITIONS.length)
  for (const t of TRANSITIONS) assert.ok(KIND_NUMBER[t.id] !== undefined, t.id)
  assert.match(TRANSITION_GLSL, /1664525u/)
  assert.match(TRANSITION_GLSL, /374761393u/)
  // fade and black are 0 and 1, iris 9, so the shader's comparisons hold
  assert.equal(KIND_NUMBER.fade, 0); assert.equal(KIND_NUMBER.black, 1); assert.equal(KIND_NUMBER.iris, 9); assert.equal(KIND_NUMBER.diamond, 10)
})
