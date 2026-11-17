import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs, covariance, quatFromEuler } from './blobs.ts'
import { readSplatFile } from './importer.ts'
import { writePly } from './ply.ts'

function sample(n: number, degree: number) {
  const b = new Blobs()
  if (degree) b.setSHDegree(degree)
  for (let i = 0; i < n; i++) {
    b.push({ center: [i * 0.1, Math.sin(i), -i * 0.05], scale: [0.02 + i * 0.001, 0.05, 0.01 + (i % 3) * 0.01], quat: quatFromEuler(i * 7, i * 13, i * 3), color: [0.2 + (i % 5) * 0.1, 0.5, 0.9 - (i % 4) * 0.1], opacity: 0.3 + (i % 7) * 0.1 })
    for (let k = 0; k < b.shTerms * 3; k++) b.sh![i * b.shTerms * 3 + k] = Math.sin(i * 3 + k) * 0.6
  }
  return b
}

test('a .ply read through three.js keeps places, shapes, colors and color by angle', async () => {
  for (const degree of [0, 1, 3]) {
    const b = sample(40, degree)
    const bytes = writePly(b)
    const { blobs: r, step, dropped } = await readSplatFile(bytes.slice().buffer, 'test.ply')
    assert.equal(step, 1); assert.equal(dropped, 0)
    assert.equal(r.count, b.count); assert.equal(r.shDegree, degree)
    for (let i = 0; i < b.count; i++) {
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(r.center[i * 3 + k] - b.center[i * 3 + k]) < 1e-6)
      // colors and opacity come through as bytes
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(r.color[i * 3 + k] - b.color[i * 3 + k]) <= 0.5 / 255 + 1e-6, `color ${r.color[i * 3 + k]} vs ${b.color[i * 3 + k]}`)
      assert.ok(Math.abs(r.opacity[i] - b.opacity[i]) <= 0.5 / 255 + 1e-6)
      const want = covariance(b, i), got = covariance(r, i)
      for (let k = 0; k < 6; k++) assert.ok(Math.abs(got[k] - want[k]) < 1e-6, `cov ${got} vs ${want}`)
      // terms come through to 1/128 (three.js keeps them a byte each)
      for (let k = 0; k < b.shTerms * 3; k++) assert.ok(Math.abs(r.sh![i * r.shTerms * 3 + k] - b.sh![i * b.shTerms * 3 + k]) <= 1 / 128, `term ${k}`)
    }
  }
})

test('a file with more blobs than the cap keeps every nth, widened', async () => {
  const b = sample(100, 1)
  const { blobs: r, step } = await readSplatFile(writePly(b).slice().buffer, 'big.ply', 30)
  assert.equal(step, 4)
  assert.equal(r.count, 25)
  const want = covariance(b, 4), got = covariance(r, 1)
  for (let k = 0; k < 6; k++) assert.ok(Math.abs(got[k] - want[k] * 4) < 1e-6)
  assert.ok(Math.abs(r.sh![9] - b.sh![4 * 9]) <= 1 / 128)
})
