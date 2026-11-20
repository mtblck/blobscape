import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MeshFileError, readMeshFile, readMeshGlb, readMeshGlbParts, readObj } from './meshFile.ts'
import { meshColor, meshShape } from './meshShape.ts'

test('an .obj: polygons fan into triangles, negative indices count back, .mtl colors land on their faces', () => {
  const obj = ['v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'v 0 0 1', 'usemtl red', 'f 1/1/1 2/2/2 3/3/3 4/4/4', 'usemtl blue', 'f -1 1 2'].join('\n')
  const { mesh } = readObj(obj, 'newmtl red\nKd 1 0 0\nnewmtl blue\nKd 0 0 1\n')
  assert.deepEqual([...mesh.indices], [0, 1, 2, 0, 2, 3, 4, 5, 6])
  // vertex 1 and 2 are used by both colors, so each color gets its own copy
  assert.equal(mesh.positions.length / 3, 7)
  assert.deepEqual([...mesh.colors!.subarray(0, 3)], [1, 0, 0])
  assert.deepEqual([...mesh.colors!.subarray(12, 15)], [0, 0, 1])
  assert.equal(readObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3').mesh.colors, undefined)
  assert.throws(() => readObj('v 0 0 0\nf 1 2 3'), MeshFileError)
  assert.throws(() => readObj('v 0 0 0'), /no faces/)
  assert.throws(() => readMeshFile('a.fbx', new Uint8Array(4)), /\.obj or a \.glb/)
})

/** A .glb with one textured triangle under a moved, scaled node, colors as normalized bytes, indices as u16. */
function tinyGlb(nodes: object[] = [{ translation: [0, 2, 0], children: [1] }, { mesh: 0, scale: [2, 2, 2] }]): Uint8Array {
  const parts: Uint8Array[] = []
  let at = 0
  const views: object[] = []
  const add = (b: Uint8Array) => { views.push({ buffer: 0, byteOffset: at, byteLength: b.byteLength }); parts.push(b); at += b.byteLength; while (at % 4) { parts.push(new Uint8Array(1)); at++ } return views.length - 1 }
  const pos = add(new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer))
  const col = add(new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255, 0]))
  const uv = add(new Uint8Array(new Float32Array([0, 0, 1, 0, 0, 1]).buffer))
  const ind = add(new Uint8Array(new Uint16Array([0, 1, 2]).buffer))
  const png = add(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes,
    meshes: [{ primitives: [{ attributes: { POSITION: 0, COLOR_0: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }], images: [{ bufferView: png, mimeType: 'image/png' }],
    accessors: [
      { bufferView: pos, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: col, componentType: 5121, normalized: true, count: 3, type: 'VEC3' },
      { bufferView: uv, componentType: 5126, count: 3, type: 'VEC2' },
      { bufferView: ind, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    bufferViews: views, buffers: [{ byteLength: at }],
  }
  let text = new TextEncoder().encode(JSON.stringify(json))
  const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20); padded.set(text); text = padded
  const out = new Uint8Array(12 + 8 + text.length + 8 + at)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true)
  dv.setUint32(12, text.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(text, 20)
  const b = 20 + text.length
  dv.setUint32(b, at, true); dv.setUint32(b + 4, 0x004e4942, true)
  let o = b + 8
  for (const p of parts) { out.set(p, o); o += p.byteLength }
  return out
}

test('a .glb: triangles placed by the node tree, colors from bytes, the texture kept for the page with its uvs', () => {
  const { mesh, images } = readMeshGlb(tinyGlb())
  assert.deepEqual([...mesh.positions], [0, 2, 0, 2, 2, 0, 0, 4, 0])
  assert.deepEqual([...mesh.indices], [0, 1, 2])
  assert.deepEqual([...mesh.colors!.subarray(3, 6)], [1, 0, 0])
  assert.deepEqual([...mesh.tex!], [0])
  assert.equal(images.length, 1)
  assert.equal(images[0].mime, 'image/png')
  // the texture paints the triangle, times the corner colors: red corner × a white texture is red
  const s = meshShape(mesh, 0.1)
  const c = meshColor(mesh, s, undefined, [() => [1, 1, 1]])([1.9, 2.05, 0])
  assert.ok(c[0] > 0.8 && c[1] < 0.2, `${c}`)
  assert.throws(() => readMeshGlb(new Uint8Array(30)), /Not a \.glb/)
})

test('a .glb of a whole scene: each node at the top its own part, placed as in the file, inside a lone wrapper', () => {
  const { parts, images } = readMeshGlbParts(tinyGlb([
    { name: 'Scene', translation: [0, 1, 0], children: [1, 2, 3] },
    { name: 'House', mesh: 0, translation: [1, 0, 0] },
    { translation: [-1, 0, 0], children: [4] },
    { name: 'Empty' },
    { mesh: 0 },
  ]))
  assert.deepEqual(parts.map((p) => p.name), ['House', 'Part 2'])
  assert.deepEqual([...parts[0].mesh.positions], [1, 1, 0, 2, 1, 0, 1, 2, 0])
  assert.deepEqual([...parts[1].mesh.positions], [-1, 1, 0, 0, 1, 0, -1, 2, 0])
  assert.equal(images.length, 1)
  assert.deepEqual([...parts[1].mesh.tex!], [0])
  // a single mesh at the top is one part, as a still model is
  assert.equal(readMeshGlbParts(tinyGlb()).parts.length, 1)
})
