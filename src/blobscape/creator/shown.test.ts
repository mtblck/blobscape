import { test } from 'node:test'
import assert from 'node:assert/strict'
import { afloat, cut } from './cut.ts'
import { compileProject } from '../../splat-engine/project.ts'
import { libraryProp } from './library.ts'
import { movable, pack, unpack } from './pack.ts'
import { openingAsked, openingLand, openingScene, queryFor, shownOf } from './shown.ts'
import { LIBRARY } from './library.ts'
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
  // the second haystack is the first set down again
  const ids = o.project.props.map((p) => p.prop)
  assert.ok(ids.some((id, i) => ids.indexOf(id) !== i))
})

test('scenes the library cannot split open whole and say why', () => {
  for (const id of ['meadow', 'fishing', 'whales']) {
    const o = openingScene(id)!
    assert.equal(o.kind, 'whole', id)
    const s = shownOf(o)
    assert.ok(s.note, id)
    assert.equal(s.items.length, 1)
  }
  assert.match(shownOf(openingScene('meadow')!).note!, /code/)
})

test('a scene made from props opens as the very pieces it is made of, every one a library entry', () => {
  const o = openingScene('koi')!
  assert.ok(o.kind === 'project')
  assert.equal(o.project.land, 'koi-pond')
  assert.ok(o.project.props.length > 20)
  for (const p of o.project.props) assert.ok(typeof p.prop === 'string' && LIBRARY.some((e) => e.id === p.prop), String(p.prop))
  const s = shownOf(o)
  assert.equal(s.items[0].name, 'Koi pond')
  assert.ok(s.items.some((i) => i.name === 'Tall stone lantern'))
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

test('a plain cut has no light baked in, for the styles that light the blobs themselves', () => {
  const job = shownOf(openingLand('plain-turf')!).jobs(CHUNKY)[0]
  const lit = cut(job), plain = cut({ ...job, plain: true })
  assert.equal(plain.blobs.count, lit.blobs.count)
  const mean = (b: typeof lit) => { let s = 0; for (let i = 0; i < b.blobs.count * 3; i++) s += b.blobs.color[i]; return s / (b.blobs.count * 3) }
  assert.notEqual(mean(plain), mean(lit))
  // the flag is put back: a lit cut after a plain one is lit
  assert.deepEqual([...cut(job).blobs.color.slice(0, 30)], [...lit.blobs.color.slice(0, 30)])
})

test('the windmill\'s duck floats on the pond, so it gets no stand-in shadow there; the sheep do', () => {
  const o = openingScene('windmill')!
  assert.equal(o.kind, 'project')
  if (o.kind !== 'project') return
  const cp = compileProject(o.project, libraryProp)
  const water = cp.land.prop.doc.water
  assert.ok(water)
  const names = shownOf(o).items.slice(1).map((i) => i.name)
  const at = (name: string) => cp.props[names.indexOf(name)].placed.at
  assert.ok(afloat(water, at('Duck')))
  assert.ok(!afloat(water, at('Sheep')))
})
