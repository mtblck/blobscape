import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exactFalloff } from './edit.ts'

/** The falloff the slow way: the largest exp(−½ xᵀΣ⁻¹x) over many points along the ray. */
function brute(from: number[], dir: number[], center: number[], cov: number[]) {
  const [a, b, c, d, e, f] = cov
  const A = [d * f - e * e, c * e - b * f, b * e - c * d, a * f - c * c, b * c - a * e, a * d - b * b]
  const det = a * A[0] + b * A[1] + c * A[2]
  let best = 0
  for (let k = 0; k <= 20000; k++) {
    const t = (k / 20000) * 20
    const x = [from[0] + dir[0] * t - center[0], from[1] + dir[1] * t - center[1], from[2] + dir[2] * t - center[2]]
    const q = (x[0] * (A[0] * x[0] + A[1] * x[1] + A[2] * x[2]) + x[1] * (A[1] * x[0] + A[3] * x[1] + A[4] * x[2]) + x[2] * (A[2] * x[0] + A[4] * x[1] + A[5] * x[2])) / det
    best = Math.max(best, Math.exp(-0.5 * q))
  }
  return best
}

test('exact shapes: the falloff is the densest point along the ray, for a round, a long and a tipped blob', () => {
  const from = [0, 0, 0]
  const blobs: number[][] = [
    [0.04, 0, 0, 0.04, 0, 0.04],
    [0.09, 0, 0, 0.0025, 0, 0.01],
    [0.05, 0.02, 0.01, 0.03, -0.008, 0.02],
  ]
  for (const cov of blobs) for (const dir of [[0.05, 0.02, 1], [0.2, -0.1, 1], [0, 0, 1]]) {
    const center = [0.1, 0.05, 4]
    const got = exactFalloff(from, dir, center, cov), want = brute(from, dir, center, cov)
    if (Math.abs(got - want) > 1e-3) assert.fail(`${cov} ${dir}: ${got} against ${want}`)
  }
})

test('exact shapes: a flat disc widened by a little has a thickness, and is full through its middle and empty well past its edge', () => {
  // a disc 0.1 across lying in the xy plane, seen at a slant
  const disc = [0.01, 0, 0, 0.01, 0, 0]
  const center = [0, 0, 3]
  assert.ok(exactFalloff([0, 0, 0], [0, 0, 1], center, disc, 1e-6) > 0.99)
  assert.ok(exactFalloff([0, 0, 0], [0.5, 0, 3].map((v) => v / 3), center, disc, 1e-6) < 1e-3)
  assert.ok(Number.isFinite(exactFalloff([1, 0, 0], [-1 / 3, 0, 1], center, disc, 1e-6)))
})

test('exact shapes: a small blob far away keeps its falloff (no rounding away)', () => {
  // a centimeter blob 50 m off, with the ray a third of its size aside of the middle
  const cov = [1e-4, 0, 0, 1e-4, 0, 1e-4]
  const center = [0, 0, 50]
  const off = 0.01 / 3
  const got = exactFalloff(new Float32Array([0, 0, 0]), new Float32Array([off / 50, 0, 1]), new Float32Array(center), new Float32Array(cov))
  assert.ok(Math.abs(got - Math.exp(-0.5 / 9)) < 1e-3, String(got))
})
