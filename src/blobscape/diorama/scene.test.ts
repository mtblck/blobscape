import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DETAIL, LOOP, PALETTES, dioramaBones, makeDiorama, poseDiorama } from './scene.ts'
import { MAX_PALETTE_SIZE } from '../../splat-core/pixel.ts'

test('the scene builds at every detail, finer cells giving more blobs, each part with blobs of its own', () => {
  let last = 0
  for (const d of DETAIL) {
    const t0 = performance.now()
    const b = makeDiorama(d.spacing)
    assert.ok(b.blobs.count > last, `${d.id}: ${b.blobs.count}`)
    assert.ok(b.blobs.count < 150000, `${d.id}: ${b.blobs.count}`)
    assert.ok(performance.now() - t0 < 8000, `${d.id} took ${performance.now() - t0} ms`)
    const seen = new Set(b.partOf)
    assert.equal(seen.size, Math.max(...b.partOf) + 1, `${d.id}: a part caught no grid cell`)
    last = b.blobs.count
  }
})

test('the scene loops: the pose after one loop is the pose at the start, and it moves in between', () => {
  const { skeleton: sk } = makeDiorama(DETAIL[0].spacing)
  assert.equal(sk.count, dioramaBones().length)
  poseDiorama(sk, 1.3)
  const a = Float32Array.from(sk.matrix)
  poseDiorama(sk, 1.3 + LOOP)
  for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - sk.matrix[i]) < 1e-4, `matrix ${i}`)
  poseDiorama(sk, 2.1)
  for (const name of ['lamp', 'boat', 'gull0', 'gull0L', 'cloud0', 'foam0', 'tree0', 'buoy', 'smoke0']) {
    const b = sk.index(name)
    let moved = 0
    for (let k = 0; k < 16; k++) moved += Math.abs(a[b * 16 + k] - sk.matrix[b * 16 + k])
    assert.ok(moved > 1e-3, `${name} did not move`)
  }
  // the land never does
  for (let k = 0; k < 16; k++) assert.equal(a[k], sk.matrix[k])
})

test('every palette fits the pixel pass', () => {
  for (const p of PALETTES) assert.ok(p.colours.length <= MAX_PALETTE_SIZE, p.id)
})
