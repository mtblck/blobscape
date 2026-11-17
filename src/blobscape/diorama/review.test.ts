import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readScene, reviewScene } from './review.ts'
import { CAMPFIRE } from './scenes/campfire.ts'
import { WINDMILL } from './scenes/windmill.ts'
import type { SceneDoc } from '../../splat-engine/sceneDoc.ts'

const copy = (d: SceneDoc): SceneDoc => JSON.parse(JSON.stringify(d))

test('a sound scene is read from its JSON and comes back with its numbers and nothing to fix', () => {
  const read = readScene(JSON.stringify(CAMPFIRE))
  assert.deepEqual(read.problems, [])
  const r = reviewScene(read.doc)
  assert.deepEqual(r.problems, [])
  assert.equal(r.facts?.parts, CAMPFIRE.parts.length)
  assert.ok(r.facts!.blobs > 5000 && r.facts!.light > r.facts!.dark)
})

test('what is not a scene is turned away with where it went wrong', () => {
  assert.match(readScene('{ nope').problems[0], /^file: not JSON/)
  assert.match(readScene('x'.repeat(1_000_001)).problems[0], /^file: over/)
  const broken = copy(CAMPFIRE) as unknown as { parts: { shape: { kind: string } }[] }
  broken.parts[0].shape.kind = 'cloud'
  const { doc, problems } = readScene(JSON.stringify(broken))
  assert.equal(doc, undefined)
  assert.ok(problems.some((p) => p.startsWith('parts[0]')), problems.join('; '))
  // shapes nested too deep to check are a mistake like any other, not a crash
  const n = 20000
  const deep = `${'{"kind":"rough","by":0.01,"scale":0.1,"shape":'.repeat(n)}{"kind":"sphere","at":[0,1,0],"r":0.2}${'}'.repeat(n)}`
  const rest = JSON.stringify({ ...copy(CAMPFIRE), parts: [] })
  let nested
  // a JSON reader that can't take the depth either says so as a problem too
  try { nested = readScene(rest.replace('"parts":[]', `"parts":[{"paint":"${CAMPFIRE.palette[0]}","shape":${deep}}]`)) } catch { assert.fail('reading a deep description threw') }
  assert.equal(nested.doc, undefined)
  assert.ok(nested.problems.length > 0)
  // and a review of it stops at the same list, without cutting anything
  assert.deepEqual(reviewScene(broken).problems, problems)
})

test('sails that turn through the tower are named, unless the part says it touches', () => {
  const mill = copy(WINDMILL)
  const sails = mill.parts.findIndex((p) => p.bone === 'sails')
  assert.ok(sails >= 0)
  // a long bar on the sails' bone, standing clear above the tower at rest and sweeping down through it as it turns
  const hub = mill.bones!.find((b) => b.name === 'sails')!.at
  mill.parts.push({ shape: { kind: 'cone', from: [hub[0], hub[1] + 0.2, hub[2] - 0.1], to: [hub[0], hub[1] + 1.3, hub[2] - 0.1], r: 0.05 }, paint: mill.palette[0], bone: 'sails' })
  const at = mill.parts.length - 1
  const r = reviewScene(mill)
  assert.ok(r.problems.some((p) => p.startsWith(`parts[${at}] (cone on bone 'sails'): passes through parts[`)), r.problems.join('\n'))
  mill.parts[at].touches = true
  assert.deepEqual(reviewScene(mill).problems.filter((p) => p.includes('passes through')), [])
})

test('a part swallowed by a cut is named', () => {
  const d = copy(CAMPFIRE)
  d.parts.push({ shape: { kind: 'cut', shape: { kind: 'sphere', at: [0, 2, 0], r: 0.1 }, hole: { kind: 'sphere', at: [0, 2, 0], r: 0.3 } }, paint: d.palette[0] })
  const r = reviewScene(d)
  assert.ok(r.problems.some((p) => p.startsWith(`parts[${d.parts.length - 1}] (cut): caught no blobs`)), r.problems.join('\n'))
})
