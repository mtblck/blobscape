import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blobsFromSamples, sampleShape } from '../splat-core/shapes.ts'
import { makeCreature, poseWalk } from './creature.ts'
import { blobsToMesh, countPieces, meshError, skinMesh } from './mesh.ts'
import { recordClip, writeRiggedMeshGlb } from './glb.ts'

test('a ball of surface blobs becomes one closed ball of triangles, facing out', () => {
  const ball = blobsFromSamples(sampleShape('sphere', 3000), 0.03, true)
  const m = blobsToMesh(ball, null, { cells: 40, level: 1 })
  assert.equal(m.pieces, 1)
  // closed: every edge is shared by exactly two triangles
  const edges = new Map<string, number>()
  for (let t = 0; t < m.indices.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = m.indices[t + k], b = m.indices[t + ((k + 1) % 3)]
    const key = a < b ? `${a},${b}` : `${b},${a}`
    edges.set(key, (edges.get(key) ?? 0) + 1)
  }
  assert.ok([...edges.values()].every((n) => n === 2), 'every edge has two triangles')
  let out = 0
  for (let i = 0; i < m.vertexCount; i++) {
    const x = m.positions[i * 3], y = m.positions[i * 3 + 1] - 0.8, z = m.positions[i * 3 + 2]
    const r = Math.hypot(x, y, z)
    assert.ok(Math.abs(r - 0.8) < 0.06, `vertex at radius ${r}`)
    if (x * m.normals[i * 3] + y * m.normals[i * 3 + 1] + z * m.normals[i * 3 + 2] > 0) out++
  }
  assert.equal(out, m.vertexCount)
  assert.ok(meshError(m, ball) < 0.03)
})

test('the fox meshes in one piece, follows its blobs, and breaks up when the level is too high', () => {
  const fox = makeCreature(6000)
  const fine = blobsToMesh(fox.blobs, fox.skin, { cells: 64, level: 1 })
  assert.equal(fine.pieces, 1)
  assert.ok(meshError(fine, fox.blobs) < 0.06)
  const coarse = blobsToMesh(fox.blobs, fox.skin, { cells: 24, level: 1 })
  assert.ok(meshError(coarse, fox.blobs) > 0.07)
  assert.ok(coarse.triangleCount < fine.triangleCount / 4)
  const high = blobsToMesh(fox.blobs, fox.skin, { cells: 64, level: 8 })
  assert.ok(high.pieces >= 3, `${high.pieces} pieces`)
  // every vertex's weights sum to one, on bones the fox has
  for (let i = 0; i < fine.vertexCount; i++) {
    const s = fine.weights[i * 4] + fine.weights[i * 4 + 1] + fine.weights[i * 4 + 2] + fine.weights[i * 4 + 3]
    assert.ok(Math.abs(s - 1) < 1e-5)
    for (let k = 0; k < 4; k++) assert.ok(fine.joints[i * 4 + k] < fox.skeleton.count)
  }
})

test('the mesh walks with the blobs: a foot vertex follows its leg', () => {
  const fox = makeCreature(4000)
  const m = blobsToMesh(fox.blobs, fox.skin, { cells: 48, level: 1 })
  const pos = new Float32Array(m.positions.length), nrm = new Float32Array(m.normals.length)
  skinMesh(m, fox.skeleton, pos, nrm)
  for (let i = 0; i < pos.length; i++) assert.ok(Math.abs(pos[i] - m.positions[i]) < 1e-5, 'the rest pose leaves the mesh alone')
  poseWalk(fox.skeleton, 0.2)
  skinMesh(m, fox.skeleton, pos, nrm)
  // the lowest vertex near the front-left foot moved
  let foot = -1
  for (let i = 0; i < m.vertexCount; i++) if (m.positions[i * 3] > 0.1 && m.positions[i * 3 + 2] > 0.2 && m.positions[i * 3 + 1] < 0.1 && (foot < 0 || m.positions[i * 3 + 1] < m.positions[foot * 3 + 1])) foot = i
  assert.ok(foot >= 0)
  const moved = Math.hypot(pos[foot * 3] - m.positions[foot * 3], pos[foot * 3 + 1] - m.positions[foot * 3 + 1], pos[foot * 3 + 2] - m.positions[foot * 3 + 2])
  assert.ok(moved > 0.05, `foot moved ${moved}`)
})

test('pieces are counted by shared vertices', () => {
  assert.equal(countPieces(6, Uint32Array.from([0, 1, 2, 3, 4, 5])), 0) // specks don't count
  const two = [] as number[]
  for (let k = 0; k < 9; k++) two.push(0, 1, 2, 3, 4, 5)
  assert.equal(countPieces(6, Uint32Array.from(two)), 2)
})

test('the mesh .glb is valid glTF with a skin, a walk and an unlit material', () => {
  const fox = makeCreature(3000)
  const mesh = blobsToMesh(fox.blobs, fox.skin, { cells: 40, level: 1 })
  const clip = recordClip('trot', fox.skeleton, poseWalk, 1 / 1.4, 12)
  const bytes = writeRiggedMeshGlb({ name: 'fox', mesh, skeleton: fox.skeleton, clips: [clip] })
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  assert.equal(dv.getUint32(0, true), 0x46546c67)
  assert.equal(dv.getUint32(8, true), bytes.byteLength)
  const len = dv.getUint32(12, true)
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)))
  const prim = json.meshes[0].primitives[0]
  assert.equal(prim.mode, 4)
  assert.equal(json.accessors[prim.indices].count, mesh.indices.length)
  assert.equal(json.accessors[prim.attributes.POSITION].count, mesh.vertexCount)
  assert.equal(json.accessors[prim.attributes.WEIGHTS_0].normalized, true)
  assert.equal(json.skins[0].joints.length, fox.skeleton.count)
  assert.equal(json.animations[0].channels.length, fox.skeleton.count + 1)
  assert.ok(json.materials[0].extensions.KHR_materials_unlit)
  // every buffer view fits in the binary chunk, 4-byte aligned
  const binLen = dv.getUint32(20 + len, true)
  for (const v of json.bufferViews) { assert.ok(v.byteOffset + v.byteLength <= binLen); assert.equal(v.byteOffset % 4, 0) }
  // byte weights sum to exactly 255
  const wv = json.bufferViews[json.accessors[prim.attributes.WEIGHTS_0].bufferView]
  const w = bytes.subarray(20 + len + 8 + wv.byteOffset, 20 + len + 8 + wv.byteOffset + wv.byteLength)
  for (let i = 0; i < mesh.vertexCount; i++) assert.equal(w[i * 4] + w[i * 4 + 1] + w[i * 4 + 2] + w[i * 4 + 3], 255)
})

test('one huge stray blob does not blow up the grid', () => {
  const fox = makeCreature(3000)
  const b = fox.blobs.clone()
  b.scale.set([6, 6, 6], 0) // a 6 m floater, as captures have
  const t = performance.now()
  const m = blobsToMesh(b, fox.skin, { cells: 64, level: 1 })
  assert.ok(performance.now() - t < 5000, 'meshing took too long')
  assert.ok(m.triangleCount > 1000)
})

test('an empty mesh is refused, not written as broken glTF', () => {
  const fox = makeCreature(500)
  const m = blobsToMesh(fox.blobs, fox.skin, { cells: 24, level: 1000 })
  assert.equal(m.triangleCount, 0)
  assert.throws(() => writeRiggedMeshGlb({ name: 'x', mesh: m, skeleton: fox.skeleton, clips: [] }), /empty/)
})
