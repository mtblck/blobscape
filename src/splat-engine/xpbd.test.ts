import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STEP, Xpbd, closestOnSegment } from './xpbd.ts'

/** A chain of `n` points a tenth apart, the first pinned, laid out level along x. */
function chain(n: number, compliance = 0): Xpbd {
  const s = new Xpbd(n)
  for (let i = 0; i < n; i++) s.place(i, [i * 0.1, 1, 0])
  s.fix(0)
  for (let i = 0; i + 1 < n; i++) s.link(i, i + 1, compliance)
  return s
}

test('a chain let go level swings down, keeps its length and comes to rest hanging straight', () => {
  const s = chain(6)
  let most = 0
  for (let f = 0; f < 60 * 12; f++) {
    s.advance(1 / 60)
    for (let i = 0; i < 5; i++) most = Math.max(most, Math.abs(s.distance(i, i + 1) - 0.1))
  }
  assert.ok(most < 2e-3, `a link stretched by ${most}`)
  assert.ok(s.energy() < 1e-6, `still moving: ${s.energy()}`)
  // hanging straight down from the pin
  for (let i = 1; i < 6; i++) {
    assert.ok(Math.abs(s.pos[i * 3]) < 1e-3 && Math.abs(s.pos[i * 3 + 2]) < 1e-3, `point ${i} is off to the side`)
    assert.ok(Math.abs(s.pos[i * 3 + 1] - (1 - i * 0.1)) < 5e-3, `point ${i} at ${s.pos[i * 3 + 1]}`)
  }
})

test('swinging loses energy and never gains it', () => {
  const s = chain(4)
  const total = () => {
    let e = s.energy()
    for (let i = 1; i < 4; i++) e += 9.8 * s.pos[i * 3 + 1]
    return e
  }
  let last = total()
  for (let f = 0; f < 600; f++) {
    s.advance(1 / 60)
    const now = total()
    assert.ok(now <= last + 1e-3, `energy rose from ${last} to ${now} at frame ${f}`)
    last = now
  }
})

test('a point never ends a step inside a capsule', () => {
  const s = chain(8)
  s.capsules = [{ a: [0.15, 0.7, -0.5], b: [0.15, 0.7, 0.5], r: 0.12 }]
  for (let f = 0; f < 300; f++) {
    s.advance(1 / 60)
    for (let i = 0; i < 8; i++) {
      const p: [number, number, number] = [s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]]
      const q = closestOnSegment(s.capsules[0].a, s.capsules[0].b, ...p)
      assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) >= 0.12 - 1e-9, `point ${i} inside at frame ${f}`)
    }
  }
  // it drapes over the bar instead of falling through
  assert.ok(s.pos[7 * 3 + 1] < 0.7 && s.pos[7 * 3] > 0.15, 'the end hangs on the far side')
})

test('a goal pulls a free point toward where the animation wants it', () => {
  const s = new Xpbd(1)
  s.place(0, [0, 0, 0])
  s.gravity = [0, 0, 0]
  for (let f = 0; f < 600; f++) { s.follow(0, [1, 0, 0], 0.003); s.advance(1 / 60) }
  assert.ok(Math.abs(s.pos[0] - 1) < 1e-3, `ended at ${s.pos[0]}`)
})

test('it runs whole fixed steps, so how the time is cut into frames does not change the motion', () => {
  const a = chain(5), b = chain(5)
  let ran = 0
  for (let f = 0; f < 120; f++) ran += a.advance(1 / 60)
  assert.equal(ran, Math.round(2 / STEP))
  // the same two seconds in uneven frames
  const cuts = [0.013, 0.021, 0.0071, 0.03, 0.017]
  let t = 0, k = 0
  while (t < 2 - 1e-9) { const dt = Math.min(cuts[k++ % cuts.length], 2 - t); b.advance(dt); t += dt }
  for (let i = 0; i < a.pos.length; i++) assert.ok(Math.abs(a.pos[i] - b.pos[i]) < 1e-9, `differs at ${i}: ${a.pos[i]} and ${b.pos[i]}`)
})

test('a pinned point moved by the caller drags the rest along', () => {
  const s = chain(3)
  for (let f = 0; f < 600; f++) s.advance(1 / 60)
  for (let f = 0; f < 120; f++) { s.pin(0, [f / 60, 1, 0]); s.advance(1 / 60) }
  assert.ok(Math.abs(s.pos[0] - 119 / 60) < 1e-9)
  // the rest trails behind it, still a tenth apart
  assert.ok(s.pos[2 * 3] < s.pos[0], 'the end trails')
  assert.ok(Math.abs(s.distance(0, 1) - 0.1) < 2e-3 && Math.abs(s.distance(1, 2) - 0.1) < 2e-3)
})
