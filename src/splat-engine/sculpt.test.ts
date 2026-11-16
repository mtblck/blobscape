import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSculpt, joinBuilt, membrane, scales, sculptToCount, smooth, type SculptSpec } from './sculpt.ts'
import { buildVoxels, cone, sphere } from './voxel.ts'

const spec = (): SculptSpec => ({
  bones: [{ name: 'root', parent: -1, head: [0, 0, 0] }, { name: 'tip', parent: 0, head: [0, 1, 0], tail: [0, 2, 0] }, { name: 'fin', parent: 0, head: [0.3, 0.5, 0], tail: [1, 0.5, 0] }],
  parts: [
    { shape: smooth(0.1, cone([0, 0, 0], [0, 2, 0], 0.3, 0.2), sphere([0, 2, 0], 0.35)), color: [0.5, 0.6, 0.7], bones: ['root', 'tip'] },
    { shape: membrane([[[0.2, 0.2, 0], [1, 0.5, 0], [0.2, 0.9, 0]]], 0.04), color: [0.9, 0.3, 0.2], bones: ['fin'], group: 'fin' },
  ],
  blend: 0.3,
})

test('a sculpted creature bends: cells between two bones share them, and every weight adds to one', () => {
  const b = buildSculpt(spec(), 0.05)
  assert.ok(b.blobs.count > 1000)
  let shared = 0
  for (let i = 0; i < b.blobs.count; i++) {
    const w = b.skin.weights.subarray(i * 4, i * 4 + 4)
    assert.ok(Math.abs(w[0] + w[1] + w[2] + w[3] - 1) < 1e-5)
    if (b.partOf[i] === 0 && w[0] < 0.9) shared++
    if (b.partOf[i] === 1) assert.equal(b.skin.joints[i * 4], 2)
  }
  assert.ok(shared > 100, `${shared} cells shared between the two bones`)
})

test('skipping blocks far from the surface loses no cell', () => {
  const s = spec()
  const parts = s.parts.map((p, i) => ({ shape: p.shape, color: p.color, bone: s.bones[i].name }))
  const slow = buildVoxels({ bones: s.bones, parts, spacing: 0.03 })
  const fast = buildVoxels({ bones: s.bones, parts, spacing: 0.03, blocks: true })
  assert.equal(fast.blobs.count, slow.blobs.count)
})

test('a creature is cut to about the count asked for, and two builds join end to end', () => {
  const b = sculptToCount(spec, 8000)
  assert.ok(Math.abs(b.blobs.count - 8000) < 1600, `${b.blobs.count} blobs`)
  const j = joinBuilt(b, buildSculpt(spec(), 0.1))
  assert.equal(j.from, b.blobs.count)
  assert.deepEqual([...j.blobs.center.subarray(0, 3)], [...b.blobs.center.subarray(0, 3)])
  assert.equal(j.skin.weights.length, j.blobs.count * 4)
})

test('scales: the same number all over one scale, and a seam between two', () => {
  const a = scales([0.01, 0.01, 0.01], 0.1), b = scales([0.02, -0.01, 0.015], 0.1), far = scales([0.049, 0, 0], 0.1)
  assert.equal(a.id, b.id)
  assert.ok(a.out < 0.5 && far.out > 0.9)
})
