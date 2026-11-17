import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs, quatFacing, type Vec3 } from '../splat-core/blobs.ts'
import { fillHole, rimUnder, stampDab } from './patch.ts'

/** A tilted sheet of flat blobs 0.05 apart, red on the left and blue on the right, with a round hole in the middle. */
function sheet(hole = 0.3) {
  const b = new Blobs()
  const tilt = 0.3
  const n: Vec3 = [0, Math.cos(tilt), Math.sin(tilt)]
  for (let x = -1; x <= 1.001; x += 0.05) for (let z = -1; z <= 1.001; z += 0.05) {
    if (Math.hypot(x, z) < hole) continue
    b.push({ center: [x, -z * Math.tan(tilt), z], scale: [0.04, 0.04, 0.006], quat: quatFacing(n), color: x < 0 ? [0.9, 0.1, 0.1] : [0.1, 0.1, 0.9], opacity: 0.9 })
  }
  return { b, n, onPlane: (p: ArrayLike<number>) => Math.abs(p[1] + p[2] * Math.tan(tilt)) * Math.cos(tilt) }
}
// looking straight down at the middle from 4 up; the ring is 0.1 wide per unit of distance: 0.4 across the sheet
const eye: Vec3 = [0, 4, 0], down: Vec3 = [0, -1, 0], K = 0.1

test('the rim is the surface round the ring, not what lies behind it', () => {
  const { b } = sheet()
  const front = b.count
  // a floor far below shows through the hole
  for (let x = -1; x <= 1; x += 0.1) for (let z = -1; z <= 1; z += 0.1) b.push({ center: [x, -3, z], scale: [0.05, 0.05, 0.05], quat: [0, 0, 0, 1], color: [0, 1, 0], opacity: 1 })
  const rim = rimUnder(b, eye, down, K)
  assert.ok(rim.length > 50 && rim.every((i) => i < front), `${rim.length} blobs, some from the floor`)
})

test('a hole fills in from its edge: on the surface, as far apart as its neighbors, in their colors', () => {
  const { b, onPlane } = sheet()
  const before = b.count
  const { added } = fillHole(b, eye, down, K, Infinity, 7)
  // the hole is about pi 0.3^2 / 0.05^2 = 113 blobs
  assert.ok(added > 80 && added < 160, `${added} added`)
  let worstOff = 0, mixed = 0
  for (let i = before; i < b.count; i++) {
    const c = b.center.subarray(i * 3, i * 3 + 3)
    worstOff = Math.max(worstOff, onPlane(c))
    assert.ok(Math.hypot(c[0], c[2]) < 0.34, 'nothing is laid over blobs that were there')
    // well to the left it is red, well to the right blue
    if (c[0] < -0.1 && b.color[i * 3] < 0.6) mixed++
    if (c[0] > 0.1 && b.color[i * 3 + 2] < 0.6) mixed++
    assert.ok(Math.abs(b.scale[i * 3] - 0.04) < 1e-3 && Math.abs(b.scale[i * 3 + 2] - 0.006) < 1e-3, 'sizes come from the neighbors')
    assert.ok(Math.abs(b.opacity[i] - 0.9) < 1e-4)
  }
  assert.ok(worstOff < 1e-3, `off the surface by ${worstOff}`)
  assert.equal(mixed, 0)
  // no gap is left: every point of the hole has a blob within a spacing and a bit
  for (let x = -0.25; x <= 0.25; x += 0.05) for (let z = -0.25; z <= 0.25; z += 0.05) {
    let best = Infinity
    for (let i = 0; i < b.count; i++) best = Math.min(best, Math.hypot(b.center[i * 3] - x, b.center[i * 3 + 2] - z))
    assert.ok(best < 0.07, `a gap of ${best} at ${x}, ${z}`)
  }
  // filling again finds next to nothing left, and a whole sheet has no gap; the same seed gives the same blobs
  const again = sheet().b
  fillHole(again, eye, down, K, Infinity, 7)
  assert.deepEqual(again.center.slice(0, again.count * 3), b.center.slice(0, b.count * 3))
  assert.ok(fillHole(b, eye, down, K).added <= 5)
  assert.deepEqual(fillHole(sheet(0).b, eye, down, K), { added: 0, why: 'no-gap' })
})

test('open space is left empty, and a full set takes no more', () => {
  const empty = new Blobs()
  assert.deepEqual(fillHole(empty, eye, down, K), { added: 0, why: 'nothing-there' })
  const { b } = sheet()
  const cap = b.count + 10
  assert.equal(fillHole(b, eye, down, K, cap).added, 10)
  assert.deepEqual(fillHole(b, eye, down, K, cap), { added: 0, why: 'full' })
})

test('the stamp copies what is round one place to another, each blob once a stroke, never a copy', () => {
  const { b } = sheet(0)
  const count = b.count
  const done = new Set<number>()
  const shift: Vec3 = [0, 1, 0]
  const first = stampDab(b, count, [-0.5, 0.155, -0.5], 0.12, shift, done)
  assert.ok(first > 10 && first < 30, `${first}`)
  for (let i = count; i < b.count; i++) assert.ok(b.color[i * 3] > 0.8, 'copies keep their color')
  assert.ok(Math.abs(b.center[count * 3 + 1] - (b.center[[...done][0] * 3 + 1] + 1)) < 1e-6, 'moved by the shift')
  // the same dab again copies nothing; an overlapping dab only what is new; copies are never sources
  assert.equal(stampDab(b, count, [-0.5, 0.155, -0.5], 0.12, shift, done), 0)
  const second = stampDab(b, count, [-0.45, 0.14, -0.45], 0.12, shift, done)
  assert.ok(second > 0 && second < first)
  assert.equal(stampDab(b, count, [-0.5, 1.155, -0.5], 0.5, shift, new Set()), 0)
  assert.equal(stampDab(b, count, [0.5, -0.155, 0.5], 0.12, shift, new Set(), b.count + 3), 3)
})
