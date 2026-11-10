import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Fitter, P, psnr, rng } from './fit.ts'
import { SAMPLES, drawSample, fitSize } from './samples.ts'

test('gradients match finite differences', () => {
  const W = 14, H = 11
  const target = new Float32Array(W * H * 3).map((_, i) => ((i * 37) % 11) / 11)
  const f = new Fitter(target, W, H, 8)
  f.seed(4, rng(1))
  const g = f.computeGradient().slice()
  for (let k = 0; k < f.count * P; k++) {
    const e = 1e-3
    const o = f.params[k]
    f.params[k] = o + e
    const up = f.loss()
    f.params[k] = o - e
    const down = f.loss()
    f.params[k] = o
    const numeric = (up - down) / (2 * e)
    const rel = Math.abs(numeric - g[k]) / (Math.abs(numeric) + Math.abs(g[k]) + 1e-3)
    assert.ok(rel < 0.01, `param ${k}: analytic ${g[k]}, numeric ${numeric}`)
  }
})

test('training on a sample improves the fit a lot', () => {
  const s = SAMPLES.find((x) => x.id === 'marbles')!
  const { width, height } = fitSize(s.aspect, 64)
  const f = new Fitter(drawSample(s, width, height), width, height)
  f.seed(150, rng(7))
  const first = f.step()
  let last = first
  for (let i = 0; i < 300; i++) last = f.step()
  assert.ok(psnr(last) > psnr(first) + 10, `PSNR ${psnr(first).toFixed(1)} → ${psnr(last).toFixed(1)} dB`)
  assert.ok(psnr(last) > 25)
})

test('prune removes only faded blobs, densify adds where the error is', () => {
  const W = 32, H = 32
  // Left half white, right half black
  const target = new Float32Array(W * H * 3).map((_, i) => ((i / 3) % W < W / 2 ? 1 : 0))
  const f = new Fitter(target, W, H, 64)
  f.add(8, 16, 4, 4, 0, [1, 1, 1], 0.9)
  f.add(24, 16, 4, 4, 0, [1, 1, 1], 0.005)
  const gone = f.prune(0.02)
  assert.equal(gone.length, 1)
  assert.equal(f.count, 1)
  assert.equal(Math.round(f.blob(0).x), 8)
  f.loss()
  const added = f.densify(20, rng(2))
  assert.equal(added, 20)
  // Every new blob lands on the white half that isn't covered yet
  for (let i = 1; i < f.count; i++) assert.ok(f.blob(i).x < W / 2 + 1, `blob at x ${f.blob(i).x}`)
})

test('capacity is respected', () => {
  const f = new Fitter(new Float32Array(8 * 8 * 3), 8, 8, 10)
  f.seed(50, rng(3))
  assert.equal(f.count, 10)
  assert.equal(f.add(1, 1, 1, 1, 0, [0, 0, 0], 0.5), false)
})

test('fitSize keeps the long side and the aspect', () => {
  assert.deepEqual(fitSize(4 / 3, 192), { width: 192, height: 144 })
  assert.deepEqual(fitSize(0.5, 128), { width: 64, height: 128 })
})
