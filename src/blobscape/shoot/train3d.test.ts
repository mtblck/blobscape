import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BLOBS, CHECK_VIEWS, Trainer, emptyModel, lossAndGrad, match, orbitCam, randomStart, render, stepsFor, type Model } from './train3d.ts'
import { subject } from './subject.ts'

const KEYS = ['pos', 'logS', 'col', 'op'] as const

function loss(m: Model, cam: ReturnType<typeof orbitCam>, photo: Float64Array) {
  return lossAndGrad(m, cam, photo, emptyModel(m.count))
}

test('the backward pass matches finite differences', () => {
  // A few overlapping blobs, so occlusion and the "behind" term both matter
  const m = randomStart(12, 3, 0.35)
  for (let i = 0; i < m.count; i++) { m.logS[i] = Math.log(0.12); m.op[i] = 0.4 }
  const cam = orbitCam(25, 15, 24)
  const photo = render(subject(), cam)
  const g = emptyModel(m.count)
  lossAndGrad(m, cam, photo, g)
  const h = 1e-5
  let checked = 0
  for (const k of KEYS) {
    for (let j = 0; j < m[k].length; j += 2) {
      const was = m[k][j]
      m[k][j] = was + h
      const up = loss(m, cam, photo)
      m[k][j] = was - h
      const down = loss(m, cam, photo)
      m[k][j] = was
      const fd = (up - down) / (2 * h)
      const tol = 1e-4 * Math.max(1e-3, Math.abs(fd)) + 2e-7
      assert.ok(Math.abs(fd - g[k][j]) < Math.max(tol, 0.03 * Math.abs(fd)), `${k}[${j}]: analytic ${g[k][j]} vs numeric ${fd}`)
      checked++
    }
  }
  assert.ok(checked > 40)
})

test('photos from all round fit the whole bird; one photo fits only its own view', () => {
  const truth = subject()
  const checks = CHECK_VIEWS.map(([a, e]) => orbitCam(a, e, 40))
  const fit = (azimuths: number[]) => {
    const cams = azimuths.map((a) => orbitCam(a, 20, 40))
    const t = new Trainer(cams, cams.map((c) => render(truth, c)), BLOBS, stepsFor(cams.length) / 2)
    for (let s = 0; s < t.total; s++) t.tick()
    return { photos: match(t.m, truth, cams), all: match(t.m, truth, checks) }
  }
  const one = fit([0])
  const round = fit([0, 90, 180, 270])
  assert.ok(one.photos > 0.95, `one photo matches itself: ${one.photos}`)
  assert.ok(one.all < 0.5, `but not the other sides: ${one.all}`)
  assert.ok(round.all > 0.85, `four round it match every side: ${round.all}`)
})

test('a run is repeatable', () => {
  const truth = subject()
  const cams = [orbitCam(0, 20, 24), orbitCam(120, 20, 24)]
  const run = () => {
    const t = new Trainer(cams, cams.map((c) => render(truth, c)), 60, 120, 9)
    for (let s = 0; s < 120; s++) t.tick()
    return t.m
  }
  assert.deepEqual(run().pos, run().pos)
})
