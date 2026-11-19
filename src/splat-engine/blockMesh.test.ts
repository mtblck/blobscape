import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs } from '../splat-core/blobs.ts'
import { blocksToMesh } from './blockMesh.ts'
import { emptySkin } from './rig.ts'

const blob = (x: number, y: number, z: number, color: [number, number, number] = [0.5, 0.5, 0.5], opacity = 1) => ({ center: [x, y, z] as [number, number, number], scale: [0.05, 0.05, 0.01] as [number, number, number], quat: [0, 0, 0, 1] as [number, number, number, number], color, opacity })

test('one blob is one cube; two side by side share no face', () => {
  const b = new Blobs()
  b.push(blob(0, 0, 0))
  const one = blocksToMesh(b, null, { cell: 0.1 })
  assert.equal(one.triangleCount, 12)
  assert.equal(one.vertexCount, 24)
  b.push(blob(0.1, 0, 0))
  const two = blocksToMesh(b, null, { cell: 0.1 })
  assert.equal(two.triangleCount, 20)
  // a block reaches half a cell each way from its place on the grid
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < two.vertexCount; i++) { lo = Math.min(lo, two.positions[i * 3]); hi = Math.max(hi, two.positions[i * 3]) }
  assert.ok(Math.abs(lo + 0.05) < 1e-6 && Math.abs(hi - 0.15) < 1e-6)
})

test('blobs in one cell make one block in their mean color, and faint ones are left out', () => {
  const b = new Blobs()
  b.push(blob(0.01, 0, 0, [1, 0, 0]))
  b.push(blob(-0.01, 0.02, 0, [0, 0, 1]))
  b.push(blob(1, 1, 1, [0, 1, 0], 0.1))
  const m = blocksToMesh(b, null, { cell: 0.1 })
  assert.equal(m.triangleCount, 12)
  assert.deepEqual([...m.colors.slice(0, 3)], [0.5, 0, 0.5])
})

test('every face points out of its block and winds counterclockwise seen from outside', () => {
  const b = new Blobs()
  b.push(blob(0, 0, 0))
  const m = blocksToMesh(b, null, { cell: 1 })
  for (let t = 0; t < m.triangleCount; t++) {
    const [a, c, d] = [0, 1, 2].map((k) => m.indices[t * 3 + k])
    const p = (i: number) => [0, 1, 2].map((k) => m.positions[i * 3 + k])
    const [pa, pc, pd] = [p(a), p(c), p(d)]
    const u = pc.map((v, k) => v - pa[k]), w = pd.map((v, k) => v - pa[k])
    const cross = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
    const n = [0, 1, 2].map((k) => m.normals[a * 3 + k])
    // the face's own normal is its winding's, and points away from the cube's middle
    assert.ok(cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] > 0, `triangle ${t}`)
    assert.ok(pa[0] * n[0] + pa[1] * n[1] + pa[2] * n[2] > 0)
  }
})

test('each block rides the bones of the blob that made it', () => {
  const b = new Blobs()
  b.push(blob(0, 0, 0))
  b.push(blob(1, 0, 0))
  const skin = emptySkin(2)
  skin.joints.set([3, 0, 0, 0, 5, 2, 0, 0])
  skin.weights.set([1, 0, 0, 0, 0.75, 0.25, 0, 0])
  const m = blocksToMesh(b, skin, { cell: 0.5 })
  const second = m.vertexCount / 2
  assert.equal(m.joints[0], 3)
  assert.deepEqual([...m.joints.slice(second * 4, second * 4 + 2)], [5, 2])
  assert.deepEqual([...m.weights.slice(second * 4, second * 4 + 2)], [0.75, 0.25])
})
