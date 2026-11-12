import assert from 'node:assert/strict'
import { test } from 'node:test'
import { about, extent } from './clean.ts'
import { sampleScan } from './sample.ts'
import { DEFAULT_CLEAN, FINISHED, LIGHTS, UNTURNED, WORK, autoOrient, cleanMasks, finish, lightsFor, preview, tip, working } from './studio.ts'

const sample = sampleScan(3, 0.5)
const mugShare = (m: Uint8Array | undefined) => {
  let all = 0, on = 0
  for (let i = 0; i < sample.part.length; i++) if (sample.part[i] === 0) { all++; on += m ? m[i] : 1 }
  return on / all
}

test('working: level, the floor at 0, the object over the origin and about WORK across', () => {
  const o = autoOrient(sample.blobs)
  assert.ok(o)
  const { blobs } = working(sample.blobs, o)
  const mug = extent(blobs, sample.part.map((p) => (p === 0 ? 1 : 0)))
  const across = Math.max(mug.hi[0] - mug.lo[0], mug.hi[1] - mug.lo[1], mug.hi[2] - mug.lo[2])
  // sized and centred by what stands on the table (the mug and the odd floater), not by the table
  assert.ok(across > 0.7 * WORK && across < 1.3 * WORK, `across ${across}`)
  assert.ok(Math.hypot(mug.lo[0] + mug.hi[0], mug.lo[2] + mug.hi[2]) / 2 < 0.25 * WORK, `centre ${mug.lo} ${mug.hi}`)
  let table = 0, n = 0
  for (let i = 0; i < blobs.count; i++) if (sample.part[i] === 1) { table += blobs.centre[i * 3 + 1]; n++ }
  assert.ok(Math.abs(table / n) < 0.02, `table at ${table / n}`)
})

test('tip turns a quarter at a time and four come back round', () => {
  let o = UNTURNED
  for (let k = 0; k < 4; k++) o = tip(o, about([1, 0, 0], 90))
  assert.ok(Math.abs(Math.abs(o.q[3]) - 1) < 1e-6, `${o.q}`)
  assert.equal(o.floorY, null)
})

test('the default clean keeps the mug and little else', () => {
  const { blobs } = working(sample.blobs, autoOrient(sample.blobs)!)
  const m = cleanMasks(blobs, DEFAULT_CLEAN)
  assert.ok(mugShare(m.all) > 0.93, `mug ${mugShare(m.all)}`)
  const mug = sample.part.filter((p) => p === 0).length
  assert.ok(m.kept < mug * 1.05, `kept ${m.kept} for a mug of ${mug}`)
  // a crop narrower than the mug cuts into it; switching steps off keeps everything
  const narrow = cleanMasks(blobs, { ...DEFAULT_CLEAN, radius: 0.1 })
  assert.ok(mugShare(narrow.all) < 0.5)
  const none = cleanMasks(blobs, { floor: 0, radius: null, top: null, floaters: 0, faint: 0, huge: null })
  assert.equal(none.all, undefined)
  assert.equal(none.kept, blobs.count)
})

test('preview shows cut blobs in red only when asked, and finish stands the object up', () => {
  const { blobs } = working(sample.blobs, autoOrient(sample.blobs)!)
  const m = cleanMasks(blobs, DEFAULT_CLEAN)
  assert.equal(preview(blobs, m.all, false).count, m.kept)
  assert.equal(preview(blobs, m.all, true).count, blobs.count)
  const done = finish(blobs, m.all)
  assert.equal(done.count, m.kept)
  const { lo, hi } = extent(done)
  assert.ok(Math.abs(lo[1]) < 1e-5)
  assert.ok(Math.abs(Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) - FINISHED) < 1e-4)
})

test('every light preset gives lights in range near the object', () => {
  for (const l of LIGHTS) {
    const ls = lightsFor(l.id, 30, [-1, 0, -1], [1, 2, 1])
    if (l.id === 'scanned') { assert.equal(ls.length, 0); continue }
    assert.ok(ls.length > 0)
    for (const p of ls) {
      const d = Math.hypot(p.position[0], p.position[1] - 1, p.position[2])
      assert.ok(d < 2 * p.range, `${l.id}: ${d} vs range ${p.range}`)
      assert.ok(p.colour.every((c) => c >= 0 && Number.isFinite(c)))
    }
  }
})
