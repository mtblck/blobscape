import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quatToMat, type Blob, type Vec3 } from '../splat-core/blobs.ts'
import { BRUSHES, LUMPS, brushDab, type Dab } from './brushes.ts'

const tilt = 0.5
const slope: Vec3 = [Math.sin(tilt), Math.cos(tilt), 0]
const dab = (over: Partial<Dab> = {}): Dab => ({ p: [1, 2, 3], n: [0, 1, 0], radius: 0.4, size: 0.25, density: 6, seed: 5, ...over })
const off = (b: Blob, d: Dab) => [b.center[0] - d.p[0], b.center[1] - d.p[1], b.center[2] - d.p[2]] as Vec3
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
/** The way a blob's longest side points. */
const longAxis = (b: Blob): Vec3 => {
  const k = b.scale[0] > b.scale[1] ? (b.scale[0] > b.scale[2] ? 0 : 2) : b.scale[1] > b.scale[2] ? 1 : 2
  const R = quatToMat(b.quat)
  return [R[k], R[3 + k], R[6 + k]]
}

test('every brush lays sound blobs near the ring, above the surface, the same for the same dab', () => {
  for (const { id } of BRUSHES) for (const n of [[0, 1, 0] as Vec3, slope]) {
    const d = dab({ n })
    const blobs = brushDab(id, d)
    assert.ok(blobs.length > 0, id)
    for (const b of blobs) {
      for (const x of [...b.center, ...b.scale, ...b.quat, ...b.color, b.opacity]) assert.ok(Number.isFinite(x), `${id}: a number is not finite`)
      assert.ok(Math.abs(Math.hypot(...b.quat) - 1) < 1e-6, `${id}: a facing is not a unit turn`)
      assert.ok(b.scale.every((s) => s > 0) && b.opacity > 0 && b.opacity <= 1 && b.color.every((c) => c >= 0 && c <= 1), id)
      const o = off(b, d), h = dot(o, n)
      // nothing far under the surface (a stone is sunk a little), nothing far outside the ring
      assert.ok(h > -d.size * 0.2, `${id}: ${h} under the surface`)
      assert.ok(Math.hypot(o[0] - n[0] * h, o[1] - n[1] * h, o[2] - n[2] * h) < d.radius + d.size * 3, `${id}: far outside the ring`)
    }
    assert.deepEqual(brushDab(id, d), blobs)
    assert.notDeepEqual(brushDab(id, dab({ n, seed: 6 })), blobs)
    // more density, more blobs; a given color is used
    assert.ok(brushDab(id, dab({ n, density: 24 })).length > blobs.length, `${id}: density`)
    const blue = brushDab(id, dab({ n, color: [0.1, 0.2, 0.9] }))
    assert.ok(blue.filter((b) => b.color[2] > b.color[0]).length > blue.length * 0.4, `${id}: color`)
  }
})

test('grass stands up and bends; its blades are thin', () => {
  for (const n of [[0, 1, 0] as Vec3, slope]) {
    const d = dab({ n })
    const blobs = brushDab('grass', d)
    assert.equal(blobs.length, d.density * 2 * 3)
    let rising = 0
    for (const b of blobs) {
      const a = longAxis(b)
      if (Math.abs(a[1]) > 0.5) rising++
      assert.ok(Math.max(...b.scale) > Math.min(...b.scale) * 5, 'a blade is long and thin')
    }
    assert.ok(rising > blobs.length * 0.7, `${rising} of ${blobs.length} rise`)
    // tips reach about a blade's length above the surface, and no further
    const top = Math.max(...blobs.map((b) => dot(off(b, d), n)))
    assert.ok(top > d.size * 0.3 && top < d.size * 1.4, `${top}`)
  }
})

test('fur lies along the stroke, a blob a strand, close to the skin', () => {
  const along: Vec3 = [0, 0, 1]
  const d = dab({ along })
  const blobs = brushDab('fur', d)
  assert.equal(blobs.length, d.density * 5)
  for (const b of blobs) {
    const a = longAxis(b), way = Math.abs(dot(a, along))
    assert.ok(way > 0.7, `a strand ${way} along the stroke`)
    assert.ok(Math.abs(a[1]) < 0.65, 'lies low')
  }
  // strands run forward from their roots: their middles sit ahead of the ring's middle on average
  assert.ok(blobs.reduce((s, b) => s + off(b, d)[2], 0) / blobs.length > 0.02)
  // with no stroke, fur on a slope hangs down it
  const hung = brushDab('fur', dab({ n: slope }))
  const downhill: Vec3 = [Math.cos(tilt), -Math.sin(tilt), 0]
  assert.ok(hung.filter((b) => Math.abs(dot(longAxis(b), downhill)) > 0.7).length > hung.length * 0.9)
})

test('moss stays low, stones are lumps that keep apart, leaves stand on twigs', () => {
  const d = dab()
  const moss = brushDab('moss', d)
  assert.ok(moss.every((b) => off(b, d)[1] < d.size * 0.25 && Math.max(...b.scale) < d.size * 0.4))
  const stones = brushDab('stones', dab({ density: 12 }))
  assert.equal(stones.length, 3 * (1 + LUMPS))
  // each stone's first blob is its body: bodies of different stones don't sit on each other
  const bodies = [0, 1, 2].map((i) => stones[i * (1 + LUMPS)])
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    const gap = Math.hypot(...bodies[i].center.map((c, q) => c - bodies[j].center[q]))
    assert.ok(gap > Math.min(bodies[i].scale[1], bodies[j].scale[1]), `stones ${gap} apart`)
  }
  assert.ok(stones.every((b) => Math.max(...b.scale) < Math.min(...b.scale) * 4), 'a stone is a lump, not a sliver')
  const leaves = brushDab('leaves', d)
  const top = Math.max(...leaves.map((b) => off(b, d)[1]))
  assert.ok(top > d.size * 0.5 && top < d.size * 3.5, `${top}`)
  // twigs are brown and leaves green: both are there
  assert.ok(leaves.some((b) => b.color[0] > b.color[1]) && leaves.some((b) => b.color[1] > b.color[0] * 1.3))
})
