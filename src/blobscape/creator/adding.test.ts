import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_PROPS, compileProject, type SceneProject } from '../../splat-engine/project.ts'
import type { Shape } from '../../splat-engine/voxel.ts'
import { CARDS, added, bonesIn, cardsFound, heightAt, landSwapped, liftOn, roomOf, whyNot } from './adding.ts'
import { GROUPS, libraryProp } from './library.ts'
import { openScene } from './library.ts'

const flat = (y: number): Shape => ({ sdf: (_x, py) => py - y, min: [-2, y - 1, -2], max: [2, y, 2] })

test('cards: props and lands, every one in a group, found by name or what is in it', () => {
  assert.ok(CARDS.length > 20)
  assert.ok(CARDS.every((c) => c.kind !== 'creature' && GROUPS.some((g) => g.id === c.group)))
  const all = cardsFound('')
  assert.deepEqual(all.map((g) => g.name), ['Buildings', 'Creatures', 'Plants and small things', 'Lands'])
  assert.equal(all.reduce((n, g) => n + g.cards.length, 0), CARDS.length)
  assert.ok(all.find((g) => g.id === 'living')!.cards.some((c) => c.id === 'giant-turkey'))
  const turkey = cardsFound('turkey')
  assert.equal(turkey.length, 1)
  assert.equal(turkey[0].cards[0].id, 'giant-turkey')
  assert.ok(cardsFound('pine').flatMap((g) => g.cards).every((c) => c.group === 'small'))
  assert.deepEqual(cardsFound('zzzz'), [])
})

test('adding sets a library prop down, and a full scene takes no more', () => {
  const p = openScene('windmill')!
  const a = added(p, 'giant-turkey', [0.31234567, 0.1, -0.2])
  assert.equal(a.props.length, p.props.length + 1)
  assert.deepEqual(a.props.at(-1), { prop: 'giant-turkey', at: [0.3123, 0.1, -0.2], turn: 0, size: 1 })
  const full: SceneProject = { ...p, props: Array.from({ length: MAX_PROPS }, () => p.props[0]) }
  assert.equal(added(full, 'duck', [0, 0, 0]), full)
})

test('the ground under a point, and a prop keeps its lift when the land is swapped', () => {
  const low = [flat(0)], high = [flat(0.5)]
  assert.ok(Math.abs(heightAt(low, 0, 0, 0.2)) < 0.01)
  assert.equal(heightAt(low, 5, 0, 0.3), 0.3)
  const p: SceneProject = { ...openScene('windmill')!, props: [{ prop: 'duck', at: [0, 0, 0], turn: 0, size: 1 }, { prop: 'duck', at: [1, 0.2, 0], turn: 0, size: 1 }] }
  assert.equal(liftOn(low, p.props[0]), 0)
  const q = landSwapped(p, 'plain-turf', low, high)
  assert.equal(q.land, 'plain-turf')
  assert.ok(Math.abs(q.props[0].at[1] - 0.5) < 0.01)
  assert.ok(Math.abs(q.props[1].at[1] - 0.7) < 0.01)
  assert.equal(q.props[1].at[0], 1)
  assert.equal(landSwapped(q, 'plain-turf', high, low), q)
})

test('room: props, blobs and bones counted, and a plain line when a prop will not fit', () => {
  const p = openScene('windmill')!
  const cp = compileProject(p, libraryProp)
  const bones = bonesIn(cp)
  assert.ok(bones > p.props.length)
  const now = roomOf(cp, 1000, 5000)
  assert.deepEqual(now.props, [p.props.length, MAX_PROPS])
  const after = roomOf(compileProject(added(p, 'giant-turkey', [0, 0, 0]), libraryProp), 1000, 5000)
  assert.ok(after.bones[0] > now.bones[0])
  assert.equal(whyNot('Giant turkey', now, after), undefined)
  assert.match(whyNot('Duck', { ...now, props: [MAX_PROPS, MAX_PROPS] }, after)!, /40 props/)
  assert.match(whyNot('Duck', { ...now, blobs: [5000, 5000] }, after)!, /blobs/)
  assert.match(whyNot('Duck', now, { ...after, bones: [300, 255] })!, /bones/)
})
