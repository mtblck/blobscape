import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openLand } from './library.ts'
import { START_LANDS, nameFor, queryFor, slug } from './shown.ts'
import { cleanName, copyName, fileName, fileText, memoryShelf, mergedLike, openShelf, readFile, renamed, type ModelFile } from './store.ts'
import { modelId } from './models.ts'
import { added } from './adding.ts'

const project = () => openLand(START_LANDS[0].id)!

test('a shelf keeps scenes newest first, forgets a deleted one and which was open last', async () => {
  const shelf = memoryShelf()
  const p = project()
  await shelf.put({ id: 'a', updated: 1, project: p })
  await shelf.put({ id: 'b', updated: 2, project: renamed(p, 'Second') })
  assert.deepEqual((await shelf.list()).map((s) => s.id), ['b', 'a'])
  // what comes out is a copy: changing it changes nothing kept
  const got = (await shelf.get('a'))!
  got.project.name = 'changed'
  assert.equal((await shelf.get('a'))!.project.name, p.name)
  await shelf.setLast('a')
  assert.equal(await shelf.last(), 'a')
  await shelf.remove('a')
  assert.equal(await shelf.last(), undefined)
  assert.equal(await shelf.get('a'), undefined)
})

test('no IndexedDB, no shelf', async () => {
  assert.equal(await openShelf(undefined), undefined)
})

test('names: tidied, copies numbered, files named plainly', () => {
  assert.equal(cleanName('  My   windmill  '), 'My windmill')
  assert.equal(cleanName('   '), undefined)
  assert.equal(cleanName('x'.repeat(200))!.length, 80)
  assert.equal(copyName('Mill', []), 'Mill copy')
  assert.equal(copyName('Mill', ['Mill copy']), 'Mill copy 2')
  assert.equal(copyName('Mill copy', ['Mill copy', 'Mill copy 2']), 'Mill copy 3')
  assert.ok(copyName('y'.repeat(80), []).length <= 80)
  const p = project()
  assert.equal(renamed(p, '  '), p)
  assert.equal(renamed(p, 'Hill').name, 'Hill')
  assert.equal(slug('Ünder the  Hill!'), 'under-the-hill')
  assert.equal(slug('***'), 'scene')
  assert.equal(fileName(renamed(p, 'Hill fort')), 'hill-fort.blobscape.json')
})

test('a project file reads back as the same project; a broken one says where', () => {
  const p = { ...project(), style: { id: 'oil', settings: { pixel: { size: 3 } } } }
  assert.deepEqual(readFile(fileText(p)).project, p)
  const bad = readFile(JSON.stringify({ ...p, loop: 1, land: 'no-such-land' }))
  assert.equal(bad.project, undefined)
  assert.ok(bad.problems.some((e) => e.startsWith('loop:')))
  assert.ok(bad.problems.some((e) => e.startsWith('land')))
  assert.ok(readFile('nope').problems[0].startsWith('file:'))
})

test('a saved project opens at ?project=', () => {
  const p = project()
  const o = { kind: 'project' as const, from: { saved: 'abc' }, project: renamed(p, 'My hill') }
  assert.deepEqual(queryFor(o), ['project', 'abc'])
  assert.equal(nameFor(o), 'my-hill')
})

test('settings read back keep only what matches the start', () => {
  const start = { size: 2, outline: true, palette: 'own' }
  assert.deepEqual(mergedLike(start, { size: 4, outline: 'yes', palette: 'pico', extra: 1 }), { size: 4, outline: true, palette: 'pico' })
  assert.deepEqual(mergedLike(start, { size: Infinity }), start)
  assert.equal(mergedLike(start, null), start)
})

test('a project file carries the models of your own it uses, and takes back only the bytes their ids name', () => {
  const bytes = new TextEncoder().encode('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')
  const used: ModelFile = { id: modelId(bytes), file: 'tri.obj', bytes, mtl: 'newmtl a\nKd 1 0 0\n', added: 1 }
  const unused: ModelFile = { id: modelId(new Uint8Array([1, 2, 3])), file: 'x.glb', bytes: new Uint8Array([1, 2, 3]), added: 2 }
  const p = added(openLand('plain-turf')!, used.id, [0, 0, 0])
  const text = fileText(p, [used, unused])
  const back = readFile(text)
  assert.deepEqual(back.problems, [])
  assert.deepEqual(back.project, p)
  assert.equal(back.models.length, 1)
  assert.deepEqual([...back.models[0].bytes], [...bytes])
  assert.equal(back.models[0].mtl, used.mtl)
  // a file without models reads as before, and a model whose bytes were changed is turned away
  assert.equal(fileText(openLand('plain-turf')!, [used]).includes('"models"'), false)
  const tampered = JSON.parse(text)
  tampered.models[0].data = btoa('something else')
  assert.match(readFile(JSON.stringify(tampered)).problems[0], /^models\[0\]\.data/)
})

test('the shelf keeps your models, oldest first', async () => {
  const sh = memoryShelf()
  const a: ModelFile = { id: 'model-a', file: 'a.glb', bytes: new Uint8Array([1]), added: 2 }
  const b: ModelFile = { id: 'model-b', file: 'b.glb', bytes: new Uint8Array([2]), added: 1 }
  await sh.putModel(a); await sh.putModel(b)
  assert.deepEqual((await sh.models()).map((m) => m.id), ['model-b', 'model-a'])
  await sh.removeModel('model-b')
  assert.deepEqual((await sh.models()).map((m) => m.id), ['model-a'])
})
