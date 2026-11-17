import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeCreature, poseWalk } from './creature.ts'
import { GlbError, MORPH_EXTENSION, SHAPE_ATTRIBUTE, SKIN_EXTENSION, SKIN_RULE, readRiggedGlb, recordClip, sampleClip, sampleWeights, writeRiggedGlb } from './glb.ts'
import { skinBlob } from './rig.ts'
import { applyMorphs, targetFrom } from './morph.ts'
import { PUFFER_MOVES, makePuffer, pufferMorphs } from './puffer.ts'
import { covariance } from '../splat-core/blobs.ts'

const fox = () => {
  const c = makeCreature(3000)
  const clip = recordClip('trot', c.skeleton, poseWalk, 1 / 1.4, 24)
  return { name: 'fox', ...c, clips: [clip] }
}

test('a rigged fox survives a round trip through .glb', () => {
  const a = fox()
  const bytes = writeRiggedGlb(a)
  const b = readRiggedGlb(bytes)
  assert.equal(b.blobs.count, a.blobs.count)
  assert.equal(b.skeleton.count, a.skeleton.count)
  assert.deepEqual(b.skeleton.bones.map((x) => x.name), a.skeleton.bones.map((x) => x.name))
  for (let i = 0; i < a.skeleton.count; i++) for (let k = 0; k < 3; k++) assert.ok(Math.abs(b.skeleton.bones[i].head[k] - a.skeleton.bones[i].head[k]) < 1e-5)
  for (let i = 0; i < a.blobs.count * 3; i++) {
    assert.ok(Math.abs(b.blobs.center[i] - a.blobs.center[i]) < 1e-6)
    assert.ok(Math.abs(b.blobs.color[i] - a.blobs.color[i]) < 1e-5)
  }
  assert.deepEqual([...b.skin.joints], [...a.skin.joints])
  assert.equal(b.clips.length, 1)
  assert.equal(b.clips[0].times.length, a.clips[0].times.length)
})

test('the walk read back from the file poses the fox as the original did', () => {
  const a = fox()
  const b = readRiggedGlb(writeRiggedGlb(a))
  const t = 0.3
  sampleClip(a.clips[0], a.skeleton, t)
  sampleClip(b.clips[0], b.skeleton, t)
  const ca = new Float32Array(3), cb = new Float32Array(3), v = new Float32Array(6)
  let worst = 0
  for (let i = 0; i < a.blobs.count; i += 7) {
    const args = (x: typeof a) => [x.blobs.center.subarray(i * 3, i * 3 + 3), x.blobs.scale.subarray(i * 3, i * 3 + 3), x.blobs.quat.subarray(i * 4, i * 4 + 4), x.skin.joints.subarray(i * 4, i * 4 + 4), x.skin.weights.subarray(i * 4, i * 4 + 4), x.skeleton] as const
    skinBlob(...args(a), 'quat', ca, 0, v, 0)
    skinBlob(...args(b), 'quat', cb, 0, v, 0)
    worst = Math.max(worst, Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]))
  }
  assert.ok(worst < 1e-4, `worst ${worst}`)
})

test('the file declares splats and our skinning rule, without requiring either', () => {
  const bytes = writeRiggedGlb(fox())
  const len = new DataView(bytes.buffer).getUint32(12, true)
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)))
  assert.deepEqual(json.extensionsUsed, ['KHR_gaussian_splatting', SKIN_EXTENSION])
  assert.equal(json.extensionsRequired, undefined)
  assert.equal(json.meshes[0].primitives[0].mode, 0)
  assert.ok(json.meshes[0].primitives[0].attributes.JOINTS_0 !== undefined)
  // inside the splat extension's own object, where KHR_gaussian_splatting says extensions of it go
  assert.deepEqual(json.meshes[0].primitives[0].extensions.KHR_gaussian_splatting.extensions[SKIN_EXTENSION], SKIN_RULE)
  assert.equal(json.extensions, undefined)
  assert.equal(json.skins[0].joints.length, 14)
  assert.equal(bytes.byteLength % 4, 0)
})

test('a clip loops back to where it started', () => {
  const a = fox()
  const clip = a.clips[0]
  const end = clip.times[clip.times.length - 1]
  sampleClip(clip, a.skeleton, 0)
  const start = a.skeleton.posedHead.slice()
  sampleClip(clip, a.skeleton, end * 0.9999)
  for (let i = 0; i < start.length; i++) assert.ok(Math.abs(a.skeleton.posedHead[i] - start[i]) < 0.02, `bone coord ${i}`)
})

// --- morphs ---

const json = (bytes: Uint8Array) => {
  const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true)
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)))
}
/** The same file with its JSON changed: what another tool might have written. */
const rewrite = (bytes: Uint8Array, change: (j: any) => void) => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const dv = new DataView(bytes.buffer, bytes.byteOffset)
  const len = dv.getUint32(12, true), j = json(bytes)
  change(j)
  let text = new TextEncoder().encode(JSON.stringify(j))
  const pad = (4 - (text.byteLength % 4)) % 4
  if (pad) { const t = new Uint8Array(text.byteLength + pad).fill(0x20); t.set(text); text = t }
  const bin = bytes.subarray(20 + len)
  const out = new Uint8Array(20 + text.byteLength + bin.byteLength)
  out.set(bytes.subarray(0, 20)); out.set(text, 20); out.set(bin, 20 + text.byteLength)
  const o = new DataView(out.buffer)
  o.setUint32(8, out.byteLength, true); o.setUint32(12, text.byteLength, true)
  return out
}

const puffer = () => {
  const fish = makePuffer(0.05)
  const morphs = pufferMorphs(fish)
  const m = PUFFER_MOVES[1]
  const clip = recordClip(m.name, fish.body.skeleton, (sk) => { sk.reset(); sk.update() }, m.seconds, 12, m.weights)
  return { name: 'puffer', ...fish.body, clips: [clip], morphs }
}

test('a pufferfish keeps its morphs through a .glb, and they reshape it as they did', () => {
  const a = puffer()
  const b = readRiggedGlb(writeRiggedGlb(a))
  assert.deepEqual(b.morphs?.map((m) => m.name), ['puff', 'spikes', 'tail left', 'tail right'])
  for (const w of [[1, 0, 0, 0], [0.4, 1, 0.7, 0], [-0.5, 0.3, 0, 1.4]]) {
    const ma = a.blobs.clone(), mb = b.blobs.clone()
    applyMorphs(a.blobs, a.morphs, w, ma)
    applyMorphs(b.blobs, b.morphs!, w, mb)
    for (let i = 0; i < ma.count; i++) {
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(ma.center[i * 3 + k] - mb.center[i * 3 + k]) < 1e-5, `center ${i}`)
      const ca = covariance(ma, i), cb = covariance(mb, i)
      for (let k = 0; k < 6; k++) assert.ok(Math.abs(ca[k] - cb[k]) < 1e-6, `covariance ${i}: ${ca[k]} vs ${cb[k]}`)
    }
  }
})

test("a clip's morph weights come back from the file", () => {
  const a = puffer()
  const b = readRiggedGlb(writeRiggedGlb(a))
  const wa = new Float32Array(4), wb = new Float32Array(4)
  for (const t of [0, 0.4, 1.5, 2.2, 2.999]) {
    assert.ok(sampleWeights(a.clips[0], t, wa))
    assert.ok(sampleWeights(b.clips[0], t, wb))
    for (let k = 0; k < 4; k++) assert.ok(Math.abs(wa[k] - wb[k]) < 1e-6, `t ${t}, morph ${k}: ${wa[k]} vs ${wb[k]}`)
  }
  sampleWeights(a.clips[0], 1.5, wa)
  assert.ok(wa[0] > 0.99 && wa[1] > 0.99, 'full puff at the middle of the clip')
  // a clip without weights leaves them at 0
  assert.equal(sampleWeights(fox().clips[0], 0.3, wa), false)
  assert.deepEqual([...wa], [0, 0, 0, 0])
})

test('morphs are standard glTF targets, sparse where few blobs move, with our shape change beside them', () => {
  const a = puffer()
  const j = json(writeRiggedGlb(a))
  assert.deepEqual(j.extensionsUsed, ['KHR_gaussian_splatting', SKIN_EXTENSION, MORPH_EXTENSION])
  assert.equal(j.extensionsRequired, undefined)
  const mesh = j.meshes[0], prim = mesh.primitives[0]
  assert.equal(prim.targets.length, 4)
  assert.deepEqual(mesh.weights, [0, 0, 0, 0])
  assert.deepEqual(mesh.extras.targetNames, ['puff', 'spikes', 'tail left', 'tail right'])
  assert.deepEqual(prim.extensions.KHR_gaussian_splatting.extensions[MORPH_EXTENSION].morphs.map((m: { targets: number[] }) => m.targets), [[0], [1], [2], [3]])
  const acc = (i: number) => j.accessors[i]
  // the puff moves every blob; a tail morph moves only the tail
  assert.ok(acc(prim.targets[0].POSITION).bufferView !== undefined)
  const tail = acc(prim.targets[2].POSITION)
  assert.equal(tail.bufferView, undefined)
  assert.ok(tail.sparse.count > 0 && tail.sparse.count < a.blobs.count / 4)
  assert.equal(acc(prim.targets[2][SHAPE_ATTRIBUTE]).type, 'MAT3')
  assert.equal(acc(prim.targets[2][SHAPE_ATTRIBUTE]).sparse.indices.bufferView, tail.sparse.indices.bufferView)
  for (const t of prim.targets) { const p = acc(t.POSITION); assert.equal(p.min.length, 3); assert.equal(p.max.length, 3) }
  // the clip keys every target's weight on the mesh node
  const ch = j.animations[0].channels.find((c: { target: { path: string } }) => c.target.path === 'weights')
  assert.equal(ch.target.node, 0)
  assert.equal(acc(j.animations[0].samplers[ch.sampler].output).count, a.clips[0].times.length * 4)
})

test('in-between targets are one morph in the file and out of it', () => {
  const a = puffer()
  const half = targetFrom(a.blobs, (p) => [p[0], p[1] + 0.2, p[2]]), full = targetFrom(a.blobs, (p) => [p[0] + 0.3, p[1] + 0.2, p[2]])
  a.morphs = [{ name: 'hop', targets: [half, full] }, ...a.morphs]
  a.clips[0].weights = Float32Array.from(Array.from({ length: a.clips[0].times.length * 5 }, (_, i) => (i % 5 === 0 ? (i / 5) / a.clips[0].times.length * 1.2 : 0.2)))
  const bytes = writeRiggedGlb(a)
  const b = readRiggedGlb(bytes)
  assert.equal(b.morphs?.length, 5)
  assert.equal(b.morphs![0].targets.length, 2)
  assert.deepEqual(json(bytes).meshes[0].extras.targetNames.slice(0, 2), ['hop 1/2', 'hop 2/2'])
  const wa = new Float32Array(5), wb = new Float32Array(5)
  for (const t of [0.1, 1.3, 2.9]) {
    sampleWeights(a.clips[0], t, wa); sampleWeights(b.clips[0], t, wb)
    for (let k = 0; k < 5; k++) assert.ok(Math.abs(wa[k] - wb[k]) < 1e-5, `t ${t}, morph ${k}: ${wa[k]} vs ${wb[k]}`)
  }
  // a tool that drops our extension still has every target, each as a morph of its own named from targetNames
  const plain = readRiggedGlb(rewrite(bytes, (j) => { delete j.meshes[0].primitives[0].extensions.KHR_gaussian_splatting.extensions[MORPH_EXTENSION] }))
  assert.deepEqual(plain.morphs?.map((m) => m.name), ['hop 1/2', 'hop 2/2', 'puff', 'spikes', 'tail left', 'tail right'])
})

test('a plain glTF morph (POSITION only) moves centers and leaves shapes alone', () => {
  const a = puffer()
  const bytes = rewrite(writeRiggedGlb(a), (j) => { for (const t of j.meshes[0].primitives[0].targets) delete t[SHAPE_ATTRIBUTE] })
  const b = readRiggedGlb(bytes)
  const out = b.blobs.clone()
  applyMorphs(b.blobs, b.morphs!, [1, 0, 0, 0], out)
  const want = a.blobs.clone()
  applyMorphs(a.blobs, a.morphs, [1, 0, 0, 0], want, 'centers')
  for (let i = 0; i < out.count * 3; i++) assert.ok(Math.abs(out.center[i] - want.center[i]) < 1e-5)
  for (let i = 0; i < out.count * 3; i++) assert.ok(Math.abs(out.scale[i] - b.blobs.scale[i]) < 1e-6)
})

test('a morph target that does not match the splats is refused', () => {
  const bytes = rewrite(writeRiggedGlb(puffer()), (j) => { j.accessors[j.meshes[0].primitives[0].targets[0].POSITION].count = 3 })
  assert.throws(() => readRiggedGlb(bytes), GlbError)
})
