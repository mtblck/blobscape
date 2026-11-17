import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs, projectPoint, type Vec3 } from '../splat-core/blobs.ts'
import { orbitLens } from '../splat-core/orbit.ts'
import { bestMask, blobsInMasks, fitTo, inMask, maskBox, promptAt, type MaskView } from './tapSelect.ts'

const W = 400, H = 300, M = 200, MH = 150
/** A ball of blobs on its surface, `n` of them. */
function ball(b: Blobs, c: Vec3, r: number, n: number) {
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, s = Math.sqrt(1 - y * y), a = i * 2.399963
    b.push({ center: [c[0] + r * s * Math.cos(a), c[1] + r * y, c[2] + r * s * Math.sin(a)], scale: [0.02, 0.02, 0.02], quat: [0, 0, 0, 1], color: [1, 1, 1], opacity: 1 })
  }
}
/** A table of blobs at height y. */
function table(b: Blobs, y: number, half: number, step: number) {
  for (let x = -half; x <= half; x += step) for (let z = -half; z <= half; z += step) b.push({ center: [x, y, z], scale: [0.02, 0.02, 0.02], quat: [0, 0, 0, 1], color: [0.5, 0.4, 0.3], opacity: 1 })
}
/** What a perfect model would say for a ball seen through a lens: the disc it covers. */
function maskOf(az: number, c: Vec3, r: number): MaskView {
  const lens = orbitLens({ target: [0, 0.5, 0], distance: 6, azimuth: az, elevation: 15 }, W, H)
  const s = projectPoint(c, lens)!, pr = (r * lens.fx) / s.depth
  const mask = new Uint8Array(M * MH)
  for (let y = 0; y < MH; y++) for (let x = 0; x < M; x++) if (((x + 0.5) * (W / M) - s.x) ** 2 + ((y + 0.5) * (H / MH) - s.y) ** 2 <= pr * pr) mask[y * M + x] = 1
  return { lens, mask, width: M, height: MH }
}

test('a mask picks the whole ball, its far side too, and leaves the ball behind it and the table alone', () => {
  const b = new Blobs()
  ball(b, [0, 0.5, 0], 0.5, 800) // the tapped one: 0..799
  ball(b, [0, 0.5, -2.2], 0.5, 800) // straight behind it from the front: 800..1599
  table(b, -0.15, 3, 0.15)
  const v = maskOf(0, [0, 0.5, 0], 0.5)
  const got = blobsInMasks(b, [v], [0, 0.5, 0.5])
  let mine = 0, behind = 0, rest = 0
  for (let i = 0; i < b.count; i++) if (got[i]) { if (i < 800) mine++; else if (i < 1600) behind++; else rest++ }
  assert.ok(mine > 700, `most of the ball's 800 blobs, not ${mine}`)
  assert.equal(behind, 0, 'the ball behind is inside the cone and not joined to what is seen')
  assert.ok(rest <= 3, `at most a blob or two of the table right under it, not ${rest}`)
})

test('a second view cuts away what the first one alone would take', () => {
  const b = new Blobs()
  ball(b, [0, 0.5, 0], 0.5, 800)
  // a clump half sunk in the back of the ball, hidden from the front: the side view keeps only what is inside the ball's outline
  ball(b, [0, 0.5, -0.6], 0.3, 400)
  const front = maskOf(0, [0, 0.5, 0], 0.5), at: Vec3 = [0, 0.5, 0.5]
  const one = blobsInMasks(b, [front], at)
  const two = blobsInMasks(b, [front, maskOf(80, [0, 0.5, 0], 0.5)], at)
  const clump = (m: Uint8Array) => { let n = 0; for (let i = 800; i < 1200; i++) n += m[i]; return n }
  assert.ok(clump(one) > 100, 'from the front alone the clump joins on')
  assert.ok(clump(two) < clump(one) * 0.6, `the side view sees it is not the ball: ${clump(two)} of ${clump(one)}`)
  let mine = 0
  for (let i = 0; i < 800; i++) mine += two[i]
  assert.ok(mine > 640, 'and the ball stays, less the rims of both outlines')
})

test('no mask, a mask of the whole picture or a tap behind the camera picks nothing', () => {
  const b = new Blobs()
  ball(b, [0, 0.5, 0], 0.5, 300)
  const v = maskOf(0, [0, 0.5, 0], 0.5)
  const sum = (m: Uint8Array) => m.reduce((a, x) => a + x, 0)
  assert.equal(sum(blobsInMasks(b, [], [0, 0.5, 0.5])), 0)
  assert.equal(sum(blobsInMasks(b, [{ ...v, mask: new Uint8Array(M * MH) }], [0, 0.5, 0.5])), 0)
  assert.equal(sum(blobsInMasks(b, [{ ...v, mask: new Uint8Array(M * MH).fill(1) }], [0, 0.5, 0.5])), 0)
  assert.equal(sum(blobsInMasks(b, [v], [0, 0.5, 60])), 0)
  assert.equal(sum(blobsInMasks(new Blobs(), [v], [0, 0.5, 0.5])), 0)
})

test('the small helpers: a mask is read at the view size, a point lands where the lens puts it, the best answer is taken', () => {
  const v = maskOf(0, [0, 0.5, 0], 0.5)
  const box = maskBox(v)!
  assert.ok(box.share > 0.02 && box.share < 0.2)
  const mid = promptAt(v.lens, [0, 0.5, 0])!
  assert.ok(Math.abs(mid[0] - W / 2) < 1 && inMask(v, mid[0], mid[1]))
  assert.ok(Math.abs((box.lo[0] + box.hi[0]) / 2 - mid[0]) < 6 && Math.abs((box.lo[1] + box.hi[1]) / 2 - mid[1]) < 6)
  assert.equal(inMask(v, -1, 10), false)
  assert.equal(inMask(v, 5, 5), false)
  assert.equal(promptAt(v.lens, [40, 0, 0]), null)
  assert.equal(maskBox({ ...v, mask: new Uint8Array(M * MH) }), null)
  // a part, the thing, and everything (best-scored but most of the picture)
  assert.equal(bestMask([0.8, 0.9, 0.99], [0.05, 0.2, 0.9]), 1)
  assert.equal(bestMask([0.8, 0.9], [0, 0.95]), -1)
  // a bigger mask the model is much less sure of is not taken
  assert.equal(bestMask([0.95, 0.7], [0.05, 0.3]), 0)
  assert.deepEqual(fitTo(800, 600, 1024), { width: 1024, height: 768, scale: 1.28 })
})
