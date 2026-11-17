import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitMesh, meshColor, meshShape, type Mesh } from './meshShape.ts'
import { buildVoxels } from './voxel.ts'

/** A cube from -h to h, its corners colored by where they are. */
function cube(h: number): Mesh {
  const positions = new Float32Array([-h, -h, -h, h, -h, -h, h, h, -h, -h, h, -h, -h, -h, h, h, -h, h, h, h, h, -h, h, h])
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5])
  const colors = new Float32Array(24)
  for (let i = 0; i < 8; i++) colors.set([positions[i * 3] > 0 ? 1 : 0, positions[i * 3 + 1] > 0 ? 1 : 0, 0], i * 3)
  return { positions, indices, colors }
}

/** A round ball of `seg` bands. */
function ball(r: number, seg: number): Mesh {
  const pos: number[] = [], idx: number[] = []
  for (let i = 0; i <= seg; i++) for (let j = 0; j < seg * 2; j++) {
    const th = (i / seg) * Math.PI, ph = (j / (seg * 2)) * Math.PI * 2
    pos.push(r * Math.sin(th) * Math.cos(ph), r * Math.cos(th), r * Math.sin(th) * Math.sin(ph))
  }
  const at = (i: number, j: number) => i * seg * 2 + (j % (seg * 2))
  for (let i = 0; i < seg; i++) for (let j = 0; j < seg * 2; j++) idx.push(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i, j + 1))
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) }
}

test('a cube mesh measures like a cube: negative inside, zero on its faces, positive out', () => {
  const s = meshShape(cube(0.5), 0.05)
  assert.ok(Math.abs(s.sdf(0, 0, 0) + 0.15) < 0.01, `deep inside reads the band's edge: ${s.sdf(0, 0, 0)}`)
  assert.ok(Math.abs(s.sdf(0.45, 0.1, 0.05) + 0.05) < 0.01)
  assert.ok(Math.abs(s.sdf(0.5, 0.2, -0.1)) < 0.01)
  assert.ok(Math.abs(s.sdf(0.6, 0.0, 0.0) - 0.1) < 0.01)
  assert.ok(s.sdf(3, 0, 0) > 2)
})

test('a round mesh measures within a cell of a true ball, and a voxel cut catches its surface', () => {
  const s = meshShape(ball(0.6, 24), 0.04)
  for (const [x, y, z] of [[0.55, 0, 0], [0, 0.65, 0], [0.3, -0.3, 0.3], [0, 0, -0.62]]) {
    const truth = Math.hypot(x, y, z) - 0.6
    assert.ok(Math.abs(s.sdf(x, y, z) - truth) < 0.02, `${[x, y, z]}: ${s.sdf(x, y, z)} vs ${truth}`)
  }
  const b = buildVoxels({ bones: [{ name: 'root', parent: -1, head: [0, 0, 0] }], spacing: 0.05, parts: [{ shape: s, color: [0.5, 0.5, 0.5], bone: 'root' }] })
  // about the ball's area over a cell's
  const want = (4 * Math.PI * 0.36) / 0.0025
  assert.ok(b.blobs.count > want * 0.7 && b.blobs.count < want * 1.6, `${b.blobs.count} vs ${want}`)
})

test('colors come from the nearest triangle, blended from its corners', () => {
  const m = cube(0.5), s = meshShape(m, 0.05), color = meshColor(m, s)
  const c = color([0.5, 0.45, 0.4])
  assert.ok(c[0] > 0.6 && c[1] > 0.6 && c[2] < 0.01, `${c}`)
  const d = color([-0.5, -0.45, -0.4])
  assert.ok(d[0] < 0.2 && d[1] < 0.2, `${d}`)
  assert.deepEqual(meshColor({ ...m, colors: undefined }, s, [0.2, 0.4, 0.6])([0.5, 0, 0]), [0.2, 0.4, 0.6])
})

test('fitMesh stands a mesh on the floor at the size asked', () => {
  const f = fitMesh(cube(3), 1.2)
  const ys = [...f.positions].filter((_, i) => i % 3 === 1), xs = [...f.positions].filter((_, i) => i % 3 === 0)
  assert.ok(Math.abs(Math.min(...ys)) < 1e-6 && Math.abs(Math.max(...ys) - 1.2) < 1e-6 && Math.abs(Math.min(...xs) + 0.6) < 1e-6)
})
