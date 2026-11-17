import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SLUG_SWING, makeSlug, posedCenters, poseSlug, slugCode, tear, tipOff, turning } from './slug.ts'
import { Swing } from '../../splat-engine/swing.ts'

test('the tail bends only when the skin listens to its bone', () => {
  for (const listens of ['body', 'both'] as const) {
    const c = makeSlug({ blend: 0.12, listens, count: 2000 })
    const rest = c.blobs.center
    let tip = 0
    for (let i = 1; i < c.blobs.count; i++) if (rest[i * 3 + 2] < rest[tip * 3 + 2]) tip = i
    poseSlug(c.skeleton, 0.9)
    const at = posedCenters(c)
    const moved = Math.hypot(at[tip * 3] - rest[tip * 3], at[tip * 3 + 2] - rest[tip * 3 + 2])
    if (listens === 'body') assert.ok(moved < 1e-4, `the tail moved ${moved} on the body bone alone`)
    else assert.ok(moved > 0.4, `the tail only moved ${moved}`)
  }
})

test('a weight held to one bone tears the join, and one spread a little closes it', () => {
  const hard = makeSlug({ blend: 0.02, listens: 'both', count: 6000 })
  poseSlug(hard.skeleton, 0.9)
  assert.ok(tear(hard) > 2, `a hard join only tore ${tear(hard)}`)
  const soft = makeSlug({ blend: 0.12, listens: 'both', count: 6000 })
  poseSlug(soft.skeleton, 0.9)
  assert.ok(tear(soft) < 0.5, `a spread join still tore ${tear(soft)}`)
  poseSlug(soft.skeleton, 0)
  assert.ok(tear(soft) < 1e-6)
})

test('turning, the tail stays on the body line until it swings', () => {
  const c = makeSlug({ blend: 0.12, listens: 'both', count: 2000 })
  let most = 0
  for (let f = 0; f < 120; f++) { turning(c.skeleton, f / 60); most = Math.max(most, tipOff(c.skeleton)) }
  assert.ok(most < 1e-6)
  const s = new Swing(c.skeleton, SLUG_SWING)
  for (let f = 0; f < 120; f++) { turning(c.skeleton, f / 60); s.update(c.skeleton, 1 / 60); most = Math.max(most, tipOff(c.skeleton)) }
  assert.ok(most > 0.12, `the tail only trailed ${most}`)
})

test('the code names what the controls chose', () => {
  const a = slugCode({ blend: 0.12, listens: 'both', count: 6000 }, true)
  assert.match(a, /blend: 0\.12,/)
  assert.match(a, /bones: \['body', 'tail'\] \}/)
  assert.match(a, /\}\), 6000\)/)
  assert.match(a, /new Swing\(/)
  const b = slugCode({ blend: 0.02, listens: 'body', count: 2000 }, false)
  assert.match(b, /bones: \['body'\] \}/)
  assert.doesNotMatch(b, /Swing/)
})
