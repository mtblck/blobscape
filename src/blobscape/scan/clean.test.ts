import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Blobs } from '../../splat-core/blobs.ts'
import { both, boxMask, faintMask, findFloor, floaterMask, floorMask, fromTo, hugeMask, kept, keepOnly, levelling, rotate, turned } from './clean.ts'
import { SAMPLE_TILT, sampleScan } from './sample.ts'

const share = (m: Uint8Array, part: Uint8Array, p: number) => {
  let all = 0, on = 0
  for (let i = 0; i < m.length; i++) if (part[i] === p) { all++; on += m[i] }
  return on / all
}

test('fromTo turns one direction onto another, even straight back', () => {
  for (const a of [[0, 0, 1], [0.6, 0.8, 0], [0, -1, 0]] as [number, number, number][]) {
    const v = rotate(fromTo(a, [0, 1, 0]), a)
    assert.ok(Math.abs(v[0]) < 1e-6 && Math.abs(v[1] - 1) < 1e-6 && Math.abs(v[2]) < 1e-6, `${a} → ${v}`)
  }
})

test('findFloor finds the tipped table, facing the mug', () => {
  const { blobs } = sampleScan()
  const p = findFloor(blobs)
  assert.ok(p, 'a floor')
  const up = rotate(SAMPLE_TILT, [0, 1, 0])
  const along = p.n[0] * up[0] + p.n[1] * up[1] + p.n[2] * up[2]
  assert.ok(along > 0.999, `normal ${p.n} vs tipped up ${up}`)
  assert.ok(p.share > 0.25, `share ${p.share}`)
})

test('levelling puts the table at y = 0 and the mug above it', () => {
  const { blobs, part } = sampleScan()
  const { q, lift } = levelling(findFloor(blobs)!)
  const level = turned(blobs, q, lift)
  let table = 0, tn = 0, mugMin = Infinity
  for (let i = 0; i < level.count; i++) {
    const y = level.centre[i * 3 + 1]
    if (part[i] === 1) { table += Math.abs(y); tn++ }
    if (part[i] === 0) mugMin = Math.min(mugMin, y)
  }
  assert.ok(table / tn < 0.01, `table off by ${table / tn}`)
  assert.ok(mugMin > 0, `mug dips to ${mugMin}`)
  // cutting just above the table takes the table and keeps the mug
  const m = floorMask(level, 0.015)
  assert.ok(share(m, part, 1) < 0.02, `table left ${share(m, part, 1)}`)
  assert.ok(share(m, part, 0) > 0.95, `mug kept ${share(m, part, 0)}`)
})

test('the clean-up masks drop floaters, haze and faint blobs and keep the mug', () => {
  const { blobs, part } = sampleScan()
  const { q, lift } = levelling(findFloor(blobs)!)
  const level = turned(blobs, q, lift)
  const floor = floorMask(level, 0.015)
  const huge = hugeMask(level, 0.1)
  assert.ok(share(huge, part, 3) < 0.05, `haze kept ${share(huge, part, 3)}`)
  assert.equal(share(huge, part, 0), 1)
  const floaters = floaterMask(level, 0.5, both(floor, huge))
  assert.ok(share(floaters, part, 2) < 0.1, `floaters kept ${share(floaters, part, 2)}`)
  assert.ok(share(floaters, part, 0) > 0.97, `mug kept ${share(floaters, part, 0)}`)
  const faint = faintMask(level, 0.25)
  assert.equal(share(faint, part, 0), 1)
  const m = both(floor, huge, floaters, faint)!
  const out = keepOnly(level, m)
  assert.equal(out.count, kept(m, level.count))
  assert.ok(out.count > 0.95 * part.filter((p) => p === 0).length)
})

test('boxMask, both and keepOnly agree', () => {
  const b = new Blobs()
  for (let i = 0; i < 10; i++) b.push({ centre: [i, 0, 0], scale: [0.1, 0.1, 0.1], quat: [0, 0, 0, 1], colour: [1, 1, 1], opacity: i / 10 })
  const box = boxMask(b, [2, -1, -1], [6.5, 1, 1])
  assert.equal(kept(box, b.count), 5)
  const m = both(box, faintMask(b, 0.4))!
  assert.deepEqual([...keepOnly(b, m).centre].filter((_, i) => i % 3 === 0), [4, 5, 6])
  assert.equal(both(), undefined)
  assert.equal(kept(undefined, 7), 7)
})

test('floaterMask copes with an empty list and a single clump', () => {
  assert.equal(floaterMask(new Blobs(), 0.5).length, 0)
  const b = new Blobs()
  for (let i = 0; i < 400; i++) b.push({ centre: [(i % 20) * 0.01, Math.floor(i / 20) * 0.01, 0], scale: [0.01, 0.01, 0.01], quat: [0, 0, 0, 1], colour: [1, 1, 1], opacity: 1 })
  assert.equal(kept(floaterMask(b, 1), b.count), 400)
})

test('a scan already cleaned of its table has no floor to find (not the coffee in the mug)', () => {
  const { blobs, part } = sampleScan()
  const mug = keepOnly(blobs, part.map((p) => (p === 0 ? 1 : 0)))
  assert.equal(findFloor(mug), null)
})
