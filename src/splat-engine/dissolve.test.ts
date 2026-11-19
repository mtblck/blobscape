import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dissolved } from './dissolve.ts'
import { skinCenters } from './rig.ts'

test('dissolving takes blobs one by one, each drifting up, and all are gone at the end', () => {
  const n = 2000
  const left = (gone: number) => { let s = 0; for (let i = 0; i < n; i++) s += dissolved(i, gone, 1)[0]; return s / n }
  assert.equal(left(0), 1)
  assert.equal(left(1), 0)
  // about as many are left as the way still to go, and never more as it goes on
  let last = 1
  for (let g = 0.1; g < 1; g += 0.1) { const now = left(g); assert.ok(now <= last + 1e-9 && Math.abs(now - (1 - g)) < 0.12, `${g}: ${now}`); last = now }
  // half way, some are whole, some gone, a few on their way
  const half = Array.from({ length: n }, (_, i) => dissolved(i, 0.5, 1)[0])
  assert.ok(half.filter((k) => k === 1).length > n * 0.3 && half.filter((k) => k === 0).length > n * 0.3)
  assert.ok(half.some((k) => k > 0 && k < 1))
  for (let i = 0; i < n; i++) {
    const [k, x, y, z] = dissolved(i, 1, 2)
    assert.equal(k, 0)
    assert.ok(y >= 1 && y <= 3 && Math.hypot(x, z) <= 0.7 + 1e-6, 'up by half to one and a half lifts, a little aside')
    assert.deepEqual(Array.from(dissolved(i, 0, 2)), [1, 0, 0, 0], 'a blob that has not begun stays put')
  }
})

test('the centers the sort uses drift with a dissolving bone', () => {
  const n = 50, src = new Float32Array(n * 4), skin = new Uint32Array(n * 2), bones = new Float32Array(20), out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { src[i * 4] = i; skin[i * 2 + 1] = 255 }
  bones[0] = bones[5] = bones[10] = bones[15] = 1
  skinCenters(src, skin, bones, n, out)
  for (let i = 0; i < n; i++) assert.deepEqual([out[i * 3], out[i * 3 + 1], out[i * 3 + 2]], [i, 0, 0])
  bones[7] = 0.6; bones[11] = 2
  skinCenters(src, skin, bones, n, out)
  for (let i = 0; i < n; i++) {
    const [, x, y, z] = dissolved(i, Math.fround(0.6), 2)
    assert.ok(Math.abs(out[i * 3] - i - x) < 1e-5 && Math.abs(out[i * 3 + 1] - y) < 1e-5 && Math.abs(out[i * 3 + 2] - z) < 1e-5)
  }
})
