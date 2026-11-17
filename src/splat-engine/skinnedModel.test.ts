import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readSkinnedGlb, splatModel } from './skinnedModel.ts'
import { sampleClip, writeRiggedMeshGlb, type Clip } from './glb.ts'
import { Skeleton, axisAngle } from './rig.ts'
import { MeshFileError } from './meshFile.ts'

// --- a small skinned .glb, written by hand the way Blender and Mixamo write them ---

type Num = number[]
function glb(json: Record<string, unknown>, arrays: { data: Num; type: string; component?: number }[]): Uint8Array {
  const parts: Uint8Array[] = []
  const views: unknown[] = [], accessors: unknown[] = []
  let offset = 0
  const SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
  for (const a of arrays) {
    const comp = a.component ?? 5126
    const bytes = comp === 5126 ? new Uint8Array(Float32Array.from(a.data).buffer) : comp === 5121 ? Uint8Array.from(a.data) : new Uint8Array(Uint16Array.from(a.data).buffer)
    const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4)
    padded.set(bytes)
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength })
    accessors.push({ bufferView: views.length - 1, componentType: comp, count: a.data.length / SIZE[a.type], type: a.type })
    parts.push(padded)
    offset += padded.byteLength
  }
  const bin = new Uint8Array(offset)
  let o = 0
  for (const p of parts) { bin.set(p, o); o += p.byteLength }
  let text = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, ...json, buffers: [{ byteLength: offset }], bufferViews: views, accessors }))
  if (text.byteLength % 4) { const t = new Uint8Array(Math.ceil(text.byteLength / 4) * 4).fill(0x20); t.set(text); text = t }
  const out = new Uint8Array(12 + 8 + text.byteLength + 8 + bin.byteLength)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.byteLength, true)
  dv.setUint32(12, text.byteLength, true); dv.setUint32(16, 0x4e4f534a, true); out.set(text, 20)
  dv.setUint32(20 + text.byteLength, bin.byteLength, true); dv.setUint32(24 + text.byteLength, 0x004e4942, true); out.set(bin, 28 + text.byteLength)
  return out
}

type M = number[]
const mul = (a: M, b: M): M => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o }
const trs = (t: Num = [0, 0, 0], q: Num = [0, 0, 0, 1], s: Num = [1, 1, 1]): M => {
  const [x, y, z, w] = q
  return [
    (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
    2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
    2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ]
}
const apply = (m: M, p: Num) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r])
// inverse of a rigid-plus-uniform-scale matrix
const invSim = (m: M): M => {
  const s2 = m[0] ** 2 + m[1] ** 2 + m[2] ** 2
  const r = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1].map((v) => v / s2)
  r[15] = 1
  const t = apply(r, [m[12], m[13], m[14]])
  r[12] = -t[0]; r[13] = -t[1]; r[14] = -t[2]
  return r
}

/**
 * A strip standing up in the file's space, on three joints under an armature that turns the whole thing a quarter
 * turn about x and shrinks it (as Mixamo files are), the joints with rest turns of their own, and a clip that bends
 * the middle joint and swings the root about.
 */
function stripFile() {
  const armature = { t: [0.5, 0, 0], q: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2], s: [0.01, 0.01, 0.01] }
  // joint rest TRS: hips at z-up 100, a spine 60 up turned 30° about the bone, a head 50 further
  const rest = [
    { t: [0, 0, 100], q: [0, 0, Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)] },
    { t: [0, 0, 60], q: [Math.sin(Math.PI / 8), 0, 0, Math.cos(Math.PI / 8)] },
    { t: [0, 0, 50], q: [0, 0, 0, 1] },
  ]
  // nodes: 0 armature, 1..3 joints, 4 the mesh
  const A = trs(armature.t, armature.q, armature.s)
  const local = rest.map((r) => trs(r.t, r.q))
  const G0 = [mul(A, local[0])]
  G0.push(mul(G0[0], local[1]))
  G0.push(mul(G0[1], local[2]))
  const ibm = G0.map(invSim)
  // vertices: two columns from z = 80 to 230 (in the bind world, after the armature: y from 0.8 up)
  const pos: number[] = [], jt: number[] = [], wt: number[] = [], idx: number[] = []
  const rows = 16
  for (let r = 0; r < rows; r++) {
    const h = 80 + (150 * r) / (rows - 1)
    for (const x of [-10, 10]) {
      // positions are in the bind world (glTF ignores a skinned mesh's own node)
      pos.push(...apply(A, [x, 0, h]))
      const u = Math.min(1, Math.max(0, (h - 130) / 60))
      const v = Math.min(1, Math.max(0, (h - 190) / 30))
      jt.push(0, 1, 2, 0)
      wt.push(1 - u, u - v, v, 0)
    }
    if (r) { const a = (r - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
  }
  const color: number[] = []
  for (let i = 0; i < pos.length / 3; i++) color.push(0.2, 0.5, 0.8, 1)
  const times = [0, 0.5, 1]
  const bend = times.flatMap((t) => { const a = Math.sin(t * Math.PI) * 0.6; const q = rest[1].q; const b = [Math.sin(a / 2), 0, 0, Math.cos(a / 2)]; return [q[3] * b[0] + q[0] * b[3] + q[1] * b[2] - q[2] * b[1], q[3] * b[1] - q[0] * b[2] + q[1] * b[3] + q[2] * b[0], q[3] * b[2] + q[0] * b[1] - q[1] * b[0] + q[2] * b[3], q[3] * b[3] - q[0] * b[0] - q[1] * b[1] - q[2] * b[2]] })
  const slide = times.flatMap((t) => [Math.sin(t * Math.PI) * 30, 0, 100])
  const file = glb({
    scene: 0,
    scenes: [{ nodes: [0, 4] }],
    nodes: [
      { name: 'Armature', translation: armature.t, rotation: armature.q, scale: armature.s, children: [1] },
      { name: 'Hips', translation: rest[0].t, rotation: rest[0].q, children: [2] },
      { name: 'Spine', translation: rest[1].t, rotation: rest[1].q, children: [3] },
      { name: 'Head', translation: rest[2].t },
      { name: 'Body', mesh: 0, skin: 0 },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2, COLOR_0: 7 }, indices: 3 }] }],
    // the skin lists its joints out of tree order, as some exporters do
    skins: [{ joints: [2, 1, 3], inverseBindMatrices: 4 }],
    animations: [{ name: 'Bend', samplers: [{ input: 5, output: 6, interpolation: 'LINEAR' }, { input: 5, output: 8, interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: 2, path: 'rotation' } }, { sampler: 1, target: { node: 1, path: 'translation' } }] }],
  }, [
    { data: pos, type: 'VEC3' },
    // the skin's joint 0 is Spine, 1 Hips, 2 Head
    { data: jt.map((j) => [1, 0, 2, 1][j]), type: 'VEC4', component: 5121 },
    { data: wt, type: 'VEC4' },
    { data: idx, type: 'SCALAR', component: 5123 },
    { data: [ibm[1], ibm[0], ibm[2]].flat(), type: 'MAT4' },
    { data: times, type: 'SCALAR' },
    { data: bend, type: 'VEC4' },
    { data: color, type: 'VEC4' },
    { data: slide, type: 'VEC3' },
  ])
  /** Where glTF's own skinning puts vertex i at time t. */
  const truth = (i: number, t: number) => {
    const a = Math.sin(t * Math.PI) * 0.6
    const q = rest[1].q, b = [Math.sin(a / 2), 0, 0, Math.cos(a / 2)]
    const spin = [q[3] * b[0] + q[0] * b[3] + q[1] * b[2] - q[2] * b[1], q[3] * b[1] - q[0] * b[2] + q[1] * b[3] + q[2] * b[0], q[3] * b[2] + q[0] * b[1] - q[1] * b[0] + q[2] * b[3], q[3] * b[3] - q[0] * b[0] - q[1] * b[1] - q[2] * b[2]]
    const L = [trs([Math.sin(t * Math.PI) * 30, 0, 100], rest[0].q), trs(rest[1].t, spin), local[2]]
    const G = [mul(A, L[0])]
    G.push(mul(G[0], L[1]))
    G.push(mul(G[1], L[2]))
    const p = pos.slice(i * 3, i * 3 + 3)
    const out = [0, 0, 0]
    for (let k = 0; k < 4; k++) { const w = wt[i * 4 + k]; if (!w) continue; const q2 = apply(mul(G[jt[i * 4 + k]], ibm[jt[i * 4 + k]]), p); for (let c = 0; c < 3; c++) out[c] += w * q2[c] }
    return out
  }
  return { file, pos, truth, count: pos.length / 3 }
}

/** Where our skeleton, posed by the clip, puts a point hung on these bones with these weights. */
function ours(sk: Skeleton, joints: ArrayLike<number>, weights: ArrayLike<number>, o: number, p: ArrayLike<number>) {
  const out = [0, 0, 0]
  for (let k = 0; k < 4; k++) {
    const w = weights[o + k]
    if (!w) continue
    const m = sk.matrix.subarray(joints[o + k] * 16, joints[o + k] * 16 + 16)
    for (let c = 0; c < 3; c++) out[c] += w * (m[c] * p[0] + m[4 + c] * p[1] + m[8 + c] * p[2] + m[12 + c])
  }
  return out
}

test('a skinned .glb reads as our bones, parents first, with heads where the bind pose puts its joints', () => {
  const { file } = stripFile()
  const m = readSkinnedGlb(file)
  assert.deepEqual(m.bones.map((b) => b.name), ['Hips', 'Spine', 'Head'])
  assert.deepEqual(m.bones.map((b) => b.parent), [-1, 0, 1])
  // the armature turns z-up into y-up and shrinks by 100: the hips stand 1 up, the spine 0.6 above them
  assert.ok(Math.abs(m.bones[0].head[1] - 1) < 1e-5 && Math.abs(m.bones[1].head[1] - 1.6) < 1e-5 && Math.abs(m.bones[0].head[0] - 0.5) < 1e-5, JSON.stringify(m.bones.map((b) => b.head)))
  assert.equal(m.clips.length, 1)
  assert.equal(m.clips[0].name, 'Bend')
  assert.ok(m.mesh.colors && Math.abs(m.mesh.colors[2] - 0.906) < 0.01, 'colors come in sRGB')
})

test('posed by its clip, our skeleton moves every vertex where glTF skinning does', () => {
  const { file, pos, truth, count } = stripFile()
  const m = readSkinnedGlb(file)
  const sk = new Skeleton(m.bones)
  const clip = m.clips[0]
  let worst = 0
  // at the file's own keys, where its straight-line curve and the sine it was keyed from agree
  for (const t of [0, 0.5, 1]) {
    sk.reset()
    sampleClip(clip, sk, t)
    sk.update()
    for (let i = 0; i < count; i++) {
      const a = ours(sk, m.joints, m.weights, i * 4, pos.slice(i * 3, i * 3 + 3)), b = truth(i, t)
      worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))
    }
  }
  assert.ok(worst < 1e-4, `worst ${worst}`)
  // the root slides, so it carries an offset; the head only turns with the spine, so it doesn't
  assert.ok(clip.offsets?.[0] && !clip.offsets[2], 'only the sliding bone keeps offsets')
})

test('splats cover the surface on the same bones, fitted to a height, and follow the clip as the mesh would', () => {
  const { file } = stripFile()
  const m = readSkinnedGlb(file)
  const r = splatModel(m, { count: 3000, height: 1 })
  assert.equal(r.blobs.count, 3000)
  let minY = Infinity, maxY = -Infinity
  for (let i = 0; i < r.blobs.count; i++) { minY = Math.min(minY, r.blobs.center[i * 3 + 1]); maxY = Math.max(maxY, r.blobs.center[i * 3 + 1]) }
  assert.ok(minY > -1e-6 && maxY < 1 + 1e-6 && maxY > 0.95, `${minY}..${maxY}`)
  // each blob's weights are the corners' mixed: low blobs on the hips alone, high ones on the head
  const low = [...Array(r.blobs.count).keys()].find((i) => r.blobs.center[i * 3 + 1] < 0.1)!
  assert.equal(r.skin.joints[low * 4], 0)
  assert.ok(r.skin.weights[low * 4] > 0.999)
  for (let i = 0; i < r.blobs.count; i++) assert.ok(Math.abs(r.skin.weights[i * 4] + r.skin.weights[i * 4 + 1] + r.skin.weights[i * 4 + 2] + r.skin.weights[i * 4 + 3] - 1) < 1e-5)
  assert.ok(Math.abs(r.blobs.color[0] - 0.484) < 0.01, 'vertex colors paint the blobs')
  // same seed, same blobs
  assert.deepEqual(splatModel(m, { count: 50, height: 1 }).blobs.center, splatModel(m, { count: 50, height: 1 }).blobs.center)

  // fitted and posed, a blob lands where the fitted mesh point under it would
  const k = 1 / 1.5
  const sk = r.skeleton, raw = new Skeleton(m.bones)
  for (const t of [0.3, 0.8]) {
    sampleClip(r.clips[0], sk, t); sk.update()
    sampleClip(m.clips[0], raw, t); raw.update()
    for (const i of [low, 1000, 2999]) {
      const c = Array.from(r.blobs.center.subarray(i * 3, i * 3 + 3))
      const a = ours(sk, r.skin.joints, r.skin.weights, i * 4, c)
      // the same point in the file's units, posed by the unfitted rig, then fitted
      const minYFile = 0.8
      const p = [(c[0] - 0) / k + 0.5, c[1] / k + minYFile, c[2] / k]
      const b = ours(raw, r.skin.joints, r.skin.weights, i * 4, p)
      const fitted = [(b[0] - 0.5) * k, (b[1] - minYFile) * k, b[2] * k]
      assert.ok(Math.hypot(a[0] - fitted[0], a[1] - fitted[1], a[2] - fitted[2]) < 1e-4, `${a} vs ${fitted}`)
    }
  }
})

test("our own skinned mesh .glb (Splat Creatures' download) comes back with its bones and clip", () => {
  const sk = new Skeleton([{ name: 'root', parent: -1, head: [0, 0, 0] }, { name: 'tip', parent: 0, head: [0, 1, 0] }])
  const positions = new Float32Array([-0.1, 0, 0, 0.1, 0, 0, -0.1, 2, 0, 0.1, 2, 0])
  const mesh = {
    vertexCount: 4, triangleCount: 2, positions, normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    colors: new Float32Array(12).fill(0.5), indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
    joints: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
  }
  const turn = axisAngle([0, 0, 1], 0.5)
  const clip: Clip = { name: 'nod', times: new Float32Array([0, 1]), rotations: [new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]), new Float32Array([0, 0, 0, 1, ...turn])] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = readSkinnedGlb(writeRiggedMeshGlb({ name: 'stick', mesh: mesh as any, skeleton: sk, clips: [clip] }))
  assert.deepEqual(m.bones.map((b) => [b.name, b.parent, ...b.head]), [['root', -1, 0, 0, 0], ['tip', 0, 0, 1, 0]])
  const back = new Skeleton(m.bones)
  // halfway (a clip's end wraps round to its start), the tip has turned half as far
  sampleClip(m.clips[0], back, 0.5)
  const q = back.rotation.subarray(4, 8), half = axisAngle([0, 0, 1], 0.25)
  assert.ok(Math.abs(Math.abs(q[0] * half[0] + q[1] * half[1] + q[2] * half[2] + q[3] * half[3]) - 1) < 1e-5, `${Array.from(q)}`)
})

test('a model with no skin says so', () => {
  const file = glb({ scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }] }, [{ data: [0, 0, 0, 1, 0, 0, 0, 1, 0], type: 'VEC3' }])
  assert.throws(() => readSkinnedGlb(file), (e) => e instanceof MeshFileError && /no skin/.test(e.message))
})
