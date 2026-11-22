import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkProject, compileProject } from '../../splat-engine/project.ts'
import { CAMPFIRE } from '../diorama/scenes/campfire.ts'
import { describedProject, isDescription, named, picksFor, readDescribed } from './described.ts'

test('a description that marks its props is split by its marks', () => {
  // the campfire with its flame marked: only that becomes a prop, sparks and all left to the land
  const doc = { ...CAMPFIRE, bones: CAMPFIRE.bones!.map((b) => b.name === 'campfire0/flame' ? { ...b, prop: 'Fire' } : b) }
  const p = describedProject(doc)
  assert.deepEqual(p.props.map((x) => typeof x.prop === 'string' ? x.prop : x.prop.name), ['Fire'])
  assert.deepEqual(checkProject(p, () => false), [])
})

test('an unmarked description offers its top-level bones, those on one spot as one prop', () => {
  assert.ok(!(CAMPFIRE.bones ?? []).some((b) => b.prop))
  const picks = picksFor(CAMPFIRE)
  assert.ok(picks.length > 0)
  // the fire's flame, core and sparks stand on one spot: one prop
  const fire = picks.find((p) => p.bones!.includes('campfire0/flame'))!
  assert.ok(fire.bones!.includes('campfire0/core') && fire.bones!.includes('campfire0/spark0'))
  const p = describedProject(CAMPFIRE)
  assert.equal(p.props.length, picks.length)
  assert.deepEqual(checkProject(p, () => false), [])
  // it compiles: the land keeps what no prop took
  const c = compileProject(p, () => undefined)
  assert.ok(c.land.prop.doc.parts.length > 0)
})

test('a file is told apart from a project and read with its faults as where: what', () => {
  const text = JSON.stringify(CAMPFIRE)
  assert.equal(isDescription(text), true)
  assert.equal(isDescription(JSON.stringify({ kind: 'blobscape-project', parts: [] })), false)
  assert.equal(isDescription('not json'), false)
  assert.ok(readDescribed(text).project)
  const bad = readDescribed(JSON.stringify({ ...CAMPFIRE, parts: [{ ...CAMPFIRE.parts[0], bone: 'nowhere' }] }))
  assert.equal(bad.project, undefined)
  assert.ok(bad.problems.length > 0 && bad.problems.every((m) => m.includes(': ')))
})

test('bone names read as prop names', () => {
  assert.equal(named('leftTree'), 'Left tree')
  assert.equal(named('old_cart'), 'Old cart')
  assert.equal(named('pine0'), 'Pine 1')
})
