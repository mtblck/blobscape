import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cut } from './cut.ts'
import { movable, pack, unpack } from './pack.ts'
import { openingAsked, openingLand, openingScene, queryFor, shownOf } from './shown.ts'
import { DETAIL } from '../diorama/scene.ts'
import { Skeleton } from '../../splat-engine/rig.ts'

const CHUNKY = DETAIL[0].spacing

test('the windmill opens split: its hill, then the mill and its farm, each cut apart', () => {
  const o = openingScene('windmill')!
  assert.equal(o.kind, 'project')
  const s = shownOf(o)
  assert.deepEqual(s.items[0], { name: 'Windmill hill', kind: 'land' })
  assert.equal(s.items.length, 11)
  assert.ok(s.items.slice(1).every((i) => i.kind === 'prop'))
  assert.equal(s.items[1].name, 'Windmill')
  const jobs = s.jobs(CHUNKY)
  assert.equal(jobs.length, s.items.length)
  for (const j of jobs.slice(0, 3)) {
    const b = cut(j)
    assert.ok(b.blobs.count > 10, `${j.kind} has blobs`)
    const sk = new Skeleton(b.skeleton.bones)
    if (j.kind === 'land') s.poseLand(sk, 1.3)
    else if (j.kind === 'prop') s.poseProp(j.i, sk, 1.3)
    assert.ok([...sk.matrix].every(Number.isFinite))
  }
})

test('library props in an opened scene are named by their id, others written out', () => {
  const o = openingScene('windmill')!
  assert.ok(o.kind === 'project')
  assert.equal(o.project.land, 'windmill-hill')
  assert.equal(o.project.props[0].prop, 'windmill')
  // the second haystack is not a library entry of its own
  assert.ok(o.project.props.some((p) => typeof p.prop !== 'string'))
})

test('scenes the library cannot split open whole and say why', () => {
  for (const id of ['meadow', 'fishing', 'koi']) {
    const o = openingScene(id)!
    assert.equal(o.kind, 'whole', id)
    const s = shownOf(o)
    assert.ok(s.note, id)
    assert.equal(s.items.length, 1)
  }
  assert.match(shownOf(openingScene('meadow')!).note!, /code/)
})

test('a bare land opens with nothing on it', () => {
  const s = shownOf(openingLand('plain-turf')!)
  assert.deepEqual(s.items, [{ name: 'Round of turf', kind: 'land' }])
  assert.ok(cut(s.jobs(CHUNKY)[0]).blobs.count > 100)
})

test('the address picks what opens, and is written back the same way', () => {
  assert.deepEqual(queryFor(openingAsked('?land=plain-rock')), ['land', 'plain-rock'])
  assert.deepEqual(queryFor(openingAsked('?scene=lighthouse')), ['scene', 'lighthouse'])
  assert.deepEqual(queryFor(openingAsked('?scene=nowhere')), ['scene', 'windmill'])
  assert.deepEqual(queryFor(openingAsked('')), ['scene', 'windmill'])
})

test('a cut packs and unpacks to the same blobs', () => {
  const b = cut(shownOf(openingScene('windmill')!).jobs(CHUNKY)[1])
  const p = pack(b)
  assert.equal(movable(p).length >= 8, true)
  const u = unpack(structuredClone(p))
  assert.equal(u.blobs.count, b.blobs.count)
  assert.deepEqual([...u.blobs.center.slice(0, 30)], [...b.blobs.center.slice(0, 30)])
  assert.deepEqual([...u.skin.joints.slice(0, 40)], [...b.skin.joints.slice(0, 40)])
  assert.equal(u.skeleton.count, b.skeleton.count)
})
