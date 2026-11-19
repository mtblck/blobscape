import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openLand } from './library.ts'
import { START_LANDS, nameFor, queryFor, slug } from './shown.ts'
import { cleanName, copyName, fileName, fileText, memoryShelf, mergedLike, openShelf, readFile, renamed } from './store.ts'

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
