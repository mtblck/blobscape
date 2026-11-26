import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VESSEL } from './lamp.ts'
import { discsFor, WaxRun } from './run.ts'
import { Wax, radiiOf } from './wax.ts'

// one lamp run two minutes, shared by the tests that only look at it
const wax = new Wax(VESSEL, 0.12, 7)
const seen = { inside: true, most: 0, top: 0, passed: 0 }
for (let s = 0; s < 120; s += 0.5) {
  wax.run(0.5)
  seen.most = Math.max(seen.most, wax.blobs.length)
  seen.top = Math.max(seen.top, wax.highest())
  // two blobs that are only touching never sink far into each other
  for (const a of wax.blobs) for (const c of wax.blobs) {
    if (a.id >= c.id || a.into !== undefined || c.into !== undefined) continue
    const d = Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z), ra = radiiOf(a)[1], rc = radiiOf(c)[1]
    if (d < (ra + rc) - Math.min(ra, rc) * 0.6) seen.passed++
  }
  for (const b of wax.blobs) {
    const [, across] = radiiOf(b)
    const y = b.y
    if (y < 0 || y > VESSEL.height || Math.hypot(b.x, b.z) + across * 0.5 > VESSEL.radius(Math.min(VESSEL.height, Math.max(0, y))) + 1e-6) seen.inside = false
  }
}

test('wax buds off the pool, rises to the top, runs together and lands again', () => {
  const e = wax.events
  assert.ok(e.buds > 10, `buds ${e.buds}`)
  assert.ok(e.merges > 5, `merges ${e.merges}`)
  assert.ok(e.landed > 3, `landed ${e.landed}`)
  assert.ok(seen.most >= 2, `at most ${seen.most} blobs up at once`)
  assert.ok(seen.top > 0.85, `the wax reached only ${seen.top} of the glass`)
})

test('blobs press together and never pass through each other', () => assert.equal(seen.passed, 0))

test('the wax keeps its volume', () => {
  assert.ok(Math.abs(wax.volume() - wax.total) < wax.total * 1e-9, `${wax.volume()} of ${wax.total}`)
})

test('every blob stays in the glass', () => assert.ok(seen.inside))

test('the same seed gives the same lamp', () => {
  const a = new Wax(VESSEL, 0.12, 3), b = new Wax(VESSEL, 0.12, 3)
  a.run(20); b.run(20)
  assert.deepEqual(a.events, b.events)
  assert.deepEqual(a.blobs.map((x) => [x.x, x.y, x.z]), b.blobs.map((x) => [x.x, x.y, x.z]))
})

test('the surface is cut inside the glass, within the discs kept for it', () => {
  const cell = 0.016
  const run = new WaxRun(cell, 7, { heat: 1, pace: 1 }, 30)
  const f = run.frame(30)
  assert.ok(f.count > 100 && f.count <= discsFor(cell), `${f.count} discs`)
  for (let i = 0; i < f.count; i++) {
    const x = f.center[i * 3], y = f.center[i * 3 + 1], z = f.center[i * 3 + 2]
    const ok = y >= -cell && y <= VESSEL.height && Math.hypot(x, z) <= VESSEL.radius(Math.max(0, Math.min(VESSEL.height, y))) + cell
    if (!ok) assert.fail(`disc ${i} at ${x}, ${y}, ${z} is outside the glass`)
  }
})
