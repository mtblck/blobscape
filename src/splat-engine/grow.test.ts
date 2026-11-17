import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GROW_STYLES, MAX_TWIGS, grow, growBounds } from './grow.ts'
import { buildVoxels } from './voxel.ts'
import { checkScene, compileScene, type SceneDoc } from './sceneDoc.ts'

test('the same seed grows the same plant, another seed another', () => {
  for (const style of GROW_STYLES) {
    const g = { style, at: [0, 0, 0] as [number, number, number], seed: 7, size: 0.6, r: 0.05 }
    assert.deepEqual(grow(g), grow({ ...g }))
    assert.notDeepEqual(grow(g).twigs.map((t) => t.to), grow({ ...g, seed: 8 }).twigs.map((t) => t.to), style)
  }
})

test('a tree is one connected thing that grows up and splits, thinner out to its tips, and never past MAX_TWIGS', () => {
  const { twigs, tips } = grow({ style: 'tree', at: [1, 0, 2], seed: 3, size: 0.8, r: 0.06 })
  assert.equal(twigs.length, 1 + 3 + 9 + 27 + 81)
  assert.equal(tips.length, 81)
  const ends = new Set(twigs.map((t) => t.to.join()))
  for (const t of twigs.slice(1)) assert.ok(ends.has(t.from.join()), 'every branch starts where another ends')
  assert.deepEqual(twigs[0].from, [1, 0, 2])
  assert.ok(Math.min(...tips.map((p) => p[1])) > 0.6, 'tips are up in the air')
  assert.ok(Math.max(...twigs.map((t) => t.rTo)) < 0.06 && Math.min(...twigs.map((t) => t.rTo)) < 0.01)
  const { half } = growBounds({ style: 'tree', at: [0, 0, 0], seed: 3, size: 0.8, r: 0.06 })
  assert.ok(half[1] > 0.6 && half[0] > 0.3, `${half}`)
  assert.ok(grow({ style: 'tree', at: [0, 0, 0], seed: 1, size: 1, r: 0.05, depth: 6, branches: 4 }).twigs.length <= MAX_TWIGS)
})

test('crystals are spikes from one foot that come to points', () => {
  const { twigs, tips } = grow({ style: 'crystal', at: [0, 0, 0], seed: 2, size: 0.5, r: 0.06 })
  assert.equal(twigs.length, 7)
  assert.equal(tips.length, 7)
  assert.ok(twigs.every((t) => t.from.join() === twigs[0].from.join() && t.rTo < t.r * 0.2))
  assert.ok(Math.abs(twigs[0].to[1] - (0.5 - 0.03)) < 1e-9, 'the first spike stands straight up')
})

const doc = (shape: unknown): SceneDoc => ({
  name: 'Grove', loop: 4, palette: ['#101018', '#3a6c3a', '#8a6242', '#f4f0e0'],
  camera: { target: [0, 0.5, 0], distance: 3, azimuth: 0, elevation: 10 },
  parts: [{ shape: { kind: 'box', at: [0, -0.05, 0], half: [1, 0.05, 1] }, paint: '#3a6c3a' }, { shape, paint: '#8a6242' } as SceneDoc['parts'][number]],
} as SceneDoc)

test('a grow shape is checked, and compiles to a part that catches cells', () => {
  assert.deepEqual(checkScene(doc({ kind: 'grow', style: 'coral', at: [0, 0, 0], seed: 4, size: 0.4, r: 0.04, tips: 0.03 })), [])
  assert.deepEqual(checkScene(doc({ kind: 'grow', style: 'fern', at: [0, 0, 0], seed: 4, size: 0.4, r: 0.04 })), ["parts[1].shape.style: 'fern' is not a style (tree, coral, crystal)"])
  assert.equal(checkScene(doc({ kind: 'grow', style: 'tree', at: [0, 0, 0], seed: 1.5, size: 0.4, r: 0.04, depth: 9, only: 'tips' })).length, 3)
  const c = compileScene(doc({ kind: 'grow', style: 'tree', at: [0, 0, 0], seed: 4, size: 0.5, r: 0.04, tips: 0.06, only: 'twigs' }))
  const b = buildVoxels(c.spec(0.03))
  assert.ok(b.partOf.includes(1))
  const lo = c.spec(0.03).parts[1].shape.min[1], hi = c.spec(0.03).parts[1].shape.max[1]
  assert.ok(lo < 0.05 && hi > 0.5, `${lo} ${hi}`)
})
