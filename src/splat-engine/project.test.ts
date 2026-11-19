import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkProject, joinPalettes, placer, readProject, refit, MAX_PROPS } from './project.ts'
import { WINDMILL } from '../blobscape/diorama/scenes/windmill.ts'

const near = (a: ArrayLike<number>, b: ArrayLike<number>, e = 1e-9) => [0, 1, 2].every((i) => Math.abs(a[i] - b[i]) < e)

test('a placement maps points there and back, and turns about the foot', () => {
  const t = placer([1, 0, 2], { at: [5, 0, -3], turn: 90, size: 2 })
  const p = [1.5, 1, 2]
  assert.ok(near(t.back(t.point(p)), p))
  assert.ok(near(t.point([1, 0, 2]), [5, 0, -3]), 'the foot lands on the spot')
  // half a meter along +x, turned a quarter about up, is along -z, twice as far
  assert.ok(near(t.point([1.5, 0, 2]), [5, 0, -4]))
  assert.ok(near(t.dir([1, 0, 0]), [0, 0, -1]))
  assert.equal(placer([0, 0, 0], { at: [0, 0, 0], turn: 360, size: 1 }).same, true)
})

test('refitting to another loop keeps every move a whole number of times', () => {
  const fitted = refit(WINDMILL, WINDMILL.loop * 1.5)
  for (const m of fitted.moves ?? []) assert.ok(Number.isInteger(m.times) && m.times !== 0, `${m.bone}: ${m.times}`)
  assert.equal(refit(WINDMILL, WINDMILL.loop), WINDMILL)
})

test('a project file says what is wrong where', () => {
  const good = { kind: 'blobscape-project', version: 1, name: 'Mine', loop: 12, land: 'meadow', props: [{ prop: 'windmill', at: [0, 0, 0], turn: 45, size: 1 }] }
  assert.deepEqual(checkProject(good, () => true), [])
  const errs = checkProject({ ...good, loop: 2, props: [{ prop: 'nothing', at: [0, 0], turn: 'x', size: 50 }] }, (id) => id !== 'nothing')
  for (const want of ['loop:', 'props[0].prop:', 'props[0].at:', 'props[0].turn:', 'props[0].size:']) assert.ok(errs.some((e) => e.startsWith(want)), `${want} in ${errs.join('; ')}`)
  assert.ok(checkProject({ ...good, props: Array(MAX_PROPS + 1).fill(good.props[0]) }, () => true).some((e) => e.startsWith('props:')))
  assert.ok(readProject('{', () => true).problems[0].startsWith('file: not JSON'))
  assert.ok(readProject(JSON.stringify(good), () => true).project)
})

test('joined palettes hold at most 32 colors and keep the first list whole', () => {
  const hex = (i: number, k: number) => '#' + [i * 7 + k * 3, (i * 53 + k * 31) % 256, (i * 97 + k * 11) % 256].map((v) => (v % 256).toString(16).padStart(2, '0')).join('')
  const land = Array.from({ length: 20 }, (_, i) => hex(i, 0))
  const joined = joinPalettes([land, Array.from({ length: 20 }, (_, i) => hex(i, 5)), land])
  assert.ok(joined.length <= 32)
  const has = (h: string) => joined.some((c) => c.every((v, j) => v === parseInt(h.slice(1 + 2 * j, 3 + 2 * j), 16)))
  // the land's own colors stay unless two of them were already the same to the eye
  assert.ok(land.filter(has).length >= 18)
})
