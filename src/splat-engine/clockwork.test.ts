import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anglesAt, BEATS, layout, makeClock, meshes, poseClock, secondsOf, TEETH } from './clockwork.ts'

const TAU = Math.PI * 2
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e
/** a mod m, into [0, m) */
const wrap = (a: number, m: number) => ((a % m) + m) % m

test('the hands keep time: the minute hand turns once an hour, small seconds once a minute, the hour hand once in twelve', () => {
  const a = anglesAt(0), h = anglesAt(3600), m = anglesAt(60)
  assert.ok(near(h.center - a.center, -TAU, 1e-9))
  assert.ok(near(m.fourth - a.fourth, -TAU, 1e-9))
  assert.ok(near(anglesAt(43200).hour - a.hour, -TAU, 1e-9))
  // half past three reads half past three
  const t = anglesAt(3 * 3600 + 30 * 60)
  assert.ok(near(wrap(-t.center, TAU), Math.PI, 1e-9))
  assert.ok(near(wrap(-t.hour, TAU), (3.5 / 12) * TAU, 1e-9))
  assert.equal(secondsOf(new Date(2026, 0, 1, 15, 30, 0)), 3 * 3600 + 30 * 60)
})

test('the train ticks five times a second: locked between beats, half a tooth of the escape wheel per beat', () => {
  const s = 100
  // locked through most of a beat
  assert.equal(anglesAt(s + 0.15 / BEATS).escape, anglesAt(s + 0.9 / BEATS).escape)
  const step = anglesAt(s + 1 / BEATS).escape - anglesAt(s).escape
  assert.ok(near(step, Math.PI / TEETH.escape, 1e-9))
  // the balance swings through its center on each beat, and the fork has crossed over by the time the wheel locks again
  assert.ok(near(anglesAt(s).balance, 0, 1e-6))
  assert.ok(near(anglesAt(s + 0.5 / BEATS).pallet, -anglesAt(s + 1.5 / BEATS).pallet, 1e-9))
  // and the fork is kicked the opposite way to the balance's swing, as two touching pivots turn
  const swing = anglesAt(s + 0.01 / BEATS).balance - anglesAt(s).balance
  const kick = anglesAt(s + 0.5 / BEATS).pallet - anglesAt(s - 0.5 / BEATS).pallet
  assert.ok(Math.sign(swing) === -Math.sign(kick), `${swing} ${kick}`)
})

test('meshing teeth: wherever a wheel meets a pinion, a tooth of one sits in a gap of the other, at any time', () => {
  const L = layout()
  for (const { driver, driven } of meshes(L)) {
    const da = L[driver.arbor as keyof typeof L], db = L[driven.arbor as keyof typeof L]
    // their pitch circles touch
    const r = (n: number) => (0.0085 * n) / 2
    assert.ok(near(Math.hypot(db[0] - da[0], db[1] - da[1]), r(driver.teeth) + r(driven.teeth), 1e-9), `${driver.arbor}→${driven.arbor}`)
    const toward = Math.atan2(db[1] - da[1], db[0] - da[0])
    for (const s of [0, 7.3, 123.45, 2999.9]) {
      const A = anglesAt(s) as unknown as Record<string, number>
      // how far (in teeth) the nearest tooth of each is from the line between them
      const ta = wrap(((driver.phase + A[driver.arbor] - toward) / TAU) * driver.teeth, 1)
      const tb = wrap(((driven.phase + A[driven.arbor] - toward - Math.PI) / TAU) * driven.teeth, 1)
      // the driver's tooth is as far past the line as the driven one's gap: they roll together
      const off = wrap(ta + tb - 0.5, 1)
      assert.ok(Math.min(off, 1 - off) < 1e-6, `${driver.arbor}→${driven.arbor} at ${s}s: ${ta} ${tb}`)
    }
  }
})

test('the watch is made with about as many blobs as asked, every blob on one bone, and poses without moving the plate', () => {
  const c = makeClock(100000)
  assert.ok(c.blobs.count > 90000 && c.blobs.count < 160000, `${c.blobs.count}`)
  for (let i = 0; i < c.blobs.count; i += 97) assert.ok(c.skin.weights[i * 4] > 0.999)
  poseClock(c.skeleton, 4321)
  const plate = c.skeleton.index('plate')
  assert.ok(near(c.skeleton.matrix[plate * 16], 1) && near(c.skeleton.matrix[plate * 16 + 12], 0))
  // and inside the case
  let far = 0
  for (let i = 0; i < c.blobs.count; i++) far = Math.max(far, Math.hypot(c.blobs.center[i * 3], c.blobs.center[i * 3 + 1]))
  assert.ok(far < 1.3, `${far}`)
})
