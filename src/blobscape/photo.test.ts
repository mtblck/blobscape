import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quatToMat } from '../splat-core/blobs.ts'
import { fitSide, nearnessFor, photoBlobs, PHOTO_FOV } from './photo.ts'

const W = 40, H = 30
/** A picture whose red is its column and green its row, so a blob says which pixel it came from. */
const picture = () => { const p = new Uint8Array(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p.set([x * 6, y * 8, 40, 255], (y * W + x) * 4); return p }
const px = (2 * Math.tan((PHOTO_FOV * Math.PI) / 360)) / W
const facing = (q: ArrayLike<number>) => { const R = quatToMat(q); return [R[2], R[5], R[8]] }

test('from where the photo was taken, the scene is the photo', () => {
  // any depths at all: bumps and a slope
  const nearness = Float32Array.from({ length: W * H }, (_, i) => 0.5 + 0.3 * Math.sin((i % W) / 5) * Math.cos(Math.floor(i / W) / 4))
  const b = photoBlobs(picture(), W, H, nearness)
  assert.equal(b.count, W * H)
  for (let i = 0; i < b.count; i++) {
    const [x, y, z] = b.center.subarray(i * 3, i * 3 + 3)
    assert.ok(z < -1.4 && z > -6.1)
    // looking back along -z from the origin, it lands on its own pixel's middle
    const col = x / (-z * px) + W / 2 - 0.5, row = H / 2 - 0.5 - y / (-z * px)
    assert.ok(Math.abs(col - (i % W)) < 1e-3 && Math.abs(row - Math.floor(i / W)) < 1e-3)
    assert.ok(Math.abs(b.color[i * 3] - ((i % W) * 6) / 255) < 1e-6 && Math.abs(b.color[i * 3 + 1] - (Math.floor(i / W) * 8) / 255) < 1e-6)
    assert.ok(Math.abs(Math.hypot(...b.quat.subarray(i * 4, i * 4 + 4)) - 1) < 1e-5)
  }
})

test('a flat wall is a flat card of blobs that face the camera and just close the gaps', () => {
  const b = photoBlobs(picture(), W, H, new Float32Array(W * H).fill(1), { near: 2, far: 8 })
  for (let i = 0; i < b.count; i++) {
    assert.ok(Math.abs(b.center[i * 3 + 2] + 2) < 1e-5)
    assert.ok(Math.abs(facing(b.quat.subarray(i * 4, i * 4 + 4))[2]) > 0.9999)
    assert.ok(Math.abs(b.scale[i * 3] - px * 2 * 0.6) < 1e-5 && b.scale[i * 3 + 2] < b.scale[i * 3] * 0.2)
  }
  // nearness is one over distance: halfway is nearer than the middle distance
  const half = photoBlobs(picture(), W, H, new Float32Array(W * H).fill(0.5), { near: 2, far: 8 })
  assert.ok(Math.abs(half.center[2] + 3.2) < 1e-4)
})

test('a floor running away tilts its blobs and stretches them; a jump in depth does neither', () => {
  // nearer toward the bottom, like a floor
  const floor = Float32Array.from({ length: W * H }, (_, i) => Math.floor(i / W) / (H - 1))
  const b = photoBlobs(picture(), W, H, floor, { near: 1, far: 3, edge: 0.5 })
  const mid = (H / 2) * W + W / 2
  const n = facing(b.quat.subarray(mid * 4, mid * 4 + 4))
  assert.ok(Math.abs(n[1]) > 0.5, `a floor faces up, not ${n}`)
  const size = px * -b.center[mid * 3 + 2] * 0.6
  assert.ok(b.scale[mid * 3 + 1] > size * 1.3 && b.scale[mid * 3 + 1] <= size * 3 + 1e-6, 'stretched along the slope, within the cap')
  // a near box in front of a far wall
  const step = Float32Array.from({ length: W * H }, (_, i) => (i % W < W / 2 ? 1 : 0))
  const s = photoBlobs(picture(), W, H, step, { near: 1, far: 5 })
  for (const x of [W / 2 - 1, W / 2]) {
    const i = 10 * W + x, z = -s.center[i * 3 + 2]
    assert.ok(Math.abs(facing(s.quat.subarray(i * 4, i * 4 + 4))[2]) > 0.999, 'an edge blob faces the camera')
    assert.ok(Math.abs(s.scale[i * 3] - px * z * 0.6) < 1e-5, 'and keeps its pixel size')
  }
  assert.ok(Math.abs(s.center[(10 * W + 2) * 3 + 2] + 1) < 1e-5 && Math.abs(s.center[(10 * W + W - 2) * 3 + 2] + 5) < 1e-5)
})

test('see-through pixels are left out; a model answer is spread over 0 to 1 at the picture size', () => {
  const p = picture()
  for (let i = 0; i < 100; i++) p[i * 4 + 3] = 0
  assert.equal(photoBlobs(p, W, H, new Float32Array(W * H)).count, W * H - 100)
  // a 4 by 2 answer with one wild pixel
  const n = nearnessFor([10, 20, 30, 40, 10, 20, 30, 4000], 4, 2, 8, 4)
  assert.equal(n.length, 32)
  assert.ok(n.every((v) => v >= 0 && v <= 1))
  assert.ok(n[0] < 0.01 && n[5] > n[2] && n[2] > n[0], 'rises left to right')
  assert.deepEqual(fitSide(4000, 3000, 256), [256, 192])
  assert.deepEqual(fitSide(100, 50, 256), [100, 50])
})
