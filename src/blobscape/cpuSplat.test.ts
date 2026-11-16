import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs, type Lens } from '../splat-core/blobs.ts'
import { drawOrder, rasterize } from './cpuSplat.ts'

const lens: Lens = { view: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], width: 64, height: 64, fx: 64, fy: 64, ortho: false }

// Listed near (red) first, then far (blue): list order is the wrong order.
const scene = () => {
  const b = new Blobs()
  b.push({ center: [0, 0, -3], scale: [0.4, 0.4, 0.4], quat: [0, 0, 0, 1], color: [1, 0, 0], opacity: 0.9 })
  b.push({ center: [0, 0, -6], scale: [0.8, 0.8, 0.8], quat: [0, 0, 0, 1], color: [0, 0, 1], opacity: 0.9 })
  return b
}
const center = (px: Float32Array) => { const k = (32 * 64 + 32) * 4; return [px[k], px[k + 1], px[k + 2], px[k + 3]] }

test('sorted order draws far first, so the near red blob shows in front', () => {
  const b = scene()
  assert.deepEqual(drawOrder(b, lens, 'sorted'), [1, 0])
  const [r, , bl] = center(rasterize(b, lens, drawOrder(b, lens, 'sorted'), 64, 64))
  assert.ok(r > 0.8 && bl < 0.15, `r ${r} b ${bl}`)
})

test('list order here draws the near blob first, and the far blue one wrongly covers it', () => {
  const b = scene()
  const [r, , bl] = center(rasterize(b, lens, drawOrder(b, lens, 'list'), 64, 64))
  assert.ok(bl > 0.8 && r < 0.15, `r ${r} b ${bl}`)
})

test('coverage is the same whatever the order; only the color changes', () => {
  const b = scene()
  const a1 = center(rasterize(b, lens, [0, 1], 64, 64))[3]
  const a2 = center(rasterize(b, lens, [1, 0], 64, 64))[3]
  assert.ok(Math.abs(a1 - a2) < 1e-6)
})
