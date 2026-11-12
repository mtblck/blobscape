import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BLOBS, CHECK_VIEWS, PHOTO, Trainer, match, orbitCam, render, stepsFor } from './train3d.ts'
import { subject } from './subject.ts'
import { CAPTURES, cutMask, keepOnly, markCut } from './cleanup.ts'

const truth = subject()
const checks = CHECK_VIEWS.map(([a, e]) => orbitCam(a, e, PHOTO))
function train(azimuths: readonly number[]) {
  const cams = azimuths.map((a) => orbitCam(a, 20, PHOTO))
  const t = new Trainer(cams, cams.map((c) => render(truth, c)), BLOBS, stepsFor(cams.length))
  for (let s = 0; s < t.total; s++) t.tick()
  return { m: t.m, cams }
}

test('cuts help a rushed capture a little; photos all round help a lot', () => {
  const quick = train(CAPTURES[0].azimuths)
  const raw = match(quick.m, truth, checks)
  const cleaned = match(keepOnly(quick.m, cutMask(quick.m, { faint: 0, huge: 0, floaters: 0.8 })), truth, checks)
  const round = train(CAPTURES[1].azimuths)
  assert.ok(cleaned > raw + 0.03, `floater cut: ${raw} → ${cleaned}`)
  assert.ok(match(round.m, truth, checks) > cleaned + 0.15, 'eight photos beat any cleanup')
  // Faint blobs are free to cut: a third of them go and nothing visible changes
  const faint = cutMask(quick.m, { faint: 0.3, huge: 0, floaters: 0 })!
  const kept = keepOnly(quick.m, faint)
  assert.ok(kept.count <= quick.m.count * (2 / 3))
  assert.ok(Math.abs(match(kept, truth, checks) - raw) < 0.01)
})

test('no cuts keep everything; marking leaves positions alone', () => {
  const { m } = train([0])
  assert.equal(cutMask(m, { faint: 0, huge: 0, floaters: 0 }), undefined)
  const mask = cutMask(m, { faint: 0.5, huge: 0, floaters: 0 })!
  const marked = markCut(m, mask)
  assert.equal(marked.pos, m.pos)
  assert.equal(keepOnly(m, mask).count, mask.reduce((s, v) => s + v, 0))
})
