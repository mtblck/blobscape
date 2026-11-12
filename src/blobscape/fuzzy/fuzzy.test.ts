import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blobsToMesh } from '../../splat-engine/mesh.ts'
import { BLADES, SUBJECTS } from './subjects.ts'
import { SPLAT_BYTES, lightThroughMesh, lightThroughSplats, meshBytes, pointsKeptByMesh, pointsKeptBySplats } from './measure.ts'
import { tidyBlock } from './tidy.ts'

test('splats keep every grass blade in under 10 KB; a wrapped mesh keeps none even on a fine grid', () => {
  const small = SUBJECTS.grass(300)
  assert.ok(small.blobs.count * SPLAT_BYTES <= 10 * 1024)
  assert.equal(pointsKeptBySplats(small.blobs, small.tips), BLADES)
  const full = SUBJECTS.grass(6500)
  assert.equal(pointsKeptByMesh(blobsToMesh(full.blobs, null, { cells: 96, level: 1 }), full.tips), 0)
})

test('light gets through the splat fluff but not through a solid', () => {
  const f = SUBJECTS.fluff(4500)
  const t = lightThroughSplats(f.blobs, [-0.6, 0.87, 0.03], [0.6, 0.87, 0.03])
  assert.ok(t > 0.2 && t < 0.8, `fluff passes ${t}`)
  const box = tidyBlock()
  assert.equal(lightThroughMesh(box, [-1, 0.2, 0], [1, 0.2, 0]), 0)
  assert.equal(lightThroughMesh(box, [-1, 0.6, 0], [1, 0.6, 0]), 1)
})

test('the merged block is closed, sharp and tiny', () => {
  const m = tidyBlock()
  assert.ok(m.triangleCount < 80)
  assert.ok(meshBytes(m) * 20 < SUBJECTS.block(6500).blobs.count * SPLAT_BYTES)
  // Every vertex sits on the cube's surface
  for (let i = 0; i < m.vertexCount; i++) {
    const [x, y, z] = [m.positions[i * 3], m.positions[i * 3 + 1] - 0.2, m.positions[i * 3 + 2]]
    assert.ok(Math.abs(Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) - 0.2) < 1e-6)
  }
})
