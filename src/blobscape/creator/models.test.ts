import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readRiggedGlb } from '../../splat-engine/glb.ts'
import { compileProject, type SceneProject } from '../../splat-engine/project.ts'
import { Skeleton } from '../../splat-engine/rig.ts'
import { added } from './adding.ts'
import { cut } from './cut.ts'
import { libraryProp, nameOf, openLand } from './library.ts'
import { OPEN_MOST, meshModelFrom, modelJob, openShare, rawTexture, MODEL_HEIGHT, PlacedMorphs, clipTime, isModel, keepModel, modelClip, modelFrom, modelId, modelOf, modelSize, poseModel } from './models.ts'

const file = (name: string) => new Uint8Array(readFileSync(new URL(`../../../public/rigged-splats/${name}`, import.meta.url)))
const project = (): SceneProject => openLand('plain-turf')!

test('a rigged file is a model standing on its foot, named by its bytes', () => {
  const bytes = file('fox.glb')
  const m = modelFrom(readRiggedGlb(bytes), 'fox.glb', bytes)
  assert.ok(isModel(m.id) && m.id === modelId(bytes) && m.id !== modelId(file('frog.glb')))
  assert.ok(!isModel('creature-fox') && !isModel({ name: 'x', foot: [0, 0, 0], doc: libraryProp('plain-turf')!.doc }))
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < m.rest.count; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.rest.center[i * 3 + k]); hi[k] = Math.max(hi[k], m.rest.center[i * 3 + k]) }
  assert.ok(Math.abs(lo[1]) < 1e-5 && Math.abs(lo[0] + hi[0]) < 1e-4 && Math.abs(lo[2] + hi[2]) < 1e-4)
  assert.ok(m.clips.length && modelClip(m))
  // set down to the height models start at
  assert.ok(Math.abs(hi[1] * modelSize(m) - MODEL_HEIGHT) < 0.01)
})

test('a clip plays a whole number of times a loop, so the scene still joins', () => {
  const bytes = file('fox.glb')
  const m = modelFrom(readRiggedGlb(bytes), 'fox.glb', bytes)
  const clip = modelClip(m)!
  const end = clip.times[clip.times.length - 1]
  const loop = 12, times = Math.max(1, Math.round(loop / end))
  assert.equal(clipTime(clip, loop, 0), 0)
  assert.ok(Math.abs(clipTime(clip, loop, loop - 1e-6) - times * end) < 1e-3)
  const a = new Skeleton(m.rest.bones), b = new Skeleton(m.rest.bones)
  poseModel(m, a, loop, 0.1)
  poseModel(m, b, loop, 0.1 + loop)
  assert.deepEqual([...a.rotation], [...b.rotation])
})

test('a model in a project compiles under its own name and is cut where it is placed', () => {
  const bytes = file('frog.glb')
  const m = modelFrom(readRiggedGlb(bytes), 'frog.glb', bytes)
  keepModel(m)
  assert.equal(modelOf(m.id), m)
  const at: [number, number, number] = [0.5, 0.2, -0.3]
  const p = added(project(), m.id, at, 0.5)
  assert.equal(compileProject(p, libraryProp).props.length, 1)
  assert.equal(nameOf(m.id), m.name)
  const b = cut({ kind: 'prop', project: p, i: 0, spacing: 0.042, model: modelJob(m) })
  assert.equal(b.blobs.count, m.rest.count + 1) // and the stand-in shadow
  let low = Infinity
  for (let i = 0; i < m.rest.count; i++) low = Math.min(low, b.blobs.center[i * 3 + 1])
  assert.ok(Math.abs(low - at[1]) < 1e-4)
  // the job's model is left as it was handed in
  assert.equal(modelFrom(readRiggedGlb(bytes), 'frog.glb', bytes).rest.center[0], m.rest.center[0])
  // a model the page no longer has is a speck, so the project still opens
  const gone = cut({ kind: 'prop', project: added(project(), 'model-00000000', at), i: 0, spacing: 0.042 })
  assert.ok(gone.blobs.count >= 1 && gone.blobs.opacity[0] === 0)
})

test('a placed model reshapes by its blend shapes as its clip weighs them, and only when they change', () => {
  const bytes = file('puffer.glb')
  const m = modelFrom(readRiggedGlb(bytes), 'puffer.glb', bytes)
  assert.ok(m.morphs?.length && modelClip(m)?.weights)
  const at = { at: [1, 0, 2] as [number, number, number], turn: 0, size: 0.5 }
  const b = cut({ kind: 'prop', project: added(project(), m.id, at.at, at.size), i: 0, spacing: 0.042, model: modelJob(m) })
  const base = b.blobs.center.slice()
  const mo = new PlacedMorphs({ ...m, morphs: m.morphs! }, at)
  let moved = 0, changes = 0
  for (let t = 0; t < 12; t += 0.25) {
    if (!mo.update(b.blobs, 12, t)) continue
    changes++
    assert.equal(mo.update(b.blobs, 12, t), false)
    for (let i = 0; i < m.rest.count * 3; i++) moved = Math.max(moved, Math.abs(b.blobs.center[i] - base[i]))
  }
  assert.ok(changes > 1 && moved > 1e-3, `${changes} changes, moved ${moved}`)
  // the stand-in shadow, last, is left alone
  assert.deepEqual([...b.blobs.center.subarray(m.rest.count * 3, m.rest.count * 3 + 3)], [...base.subarray(m.rest.count * 3, m.rest.count * 3 + 3)])
})

/** A box from `lo` to `hi` as twelve triangles facing out, painted one color; `drop` leaves triangles out. */
function box(lo: number[], hi: number[], color = [0.9, 0.2, 0.1], drop = 0) {
  const P: number[] = []
  for (let k = 0; k < 8; k++) P.push(k & 1 ? hi[0] : lo[0], k & 2 ? hi[1] : lo[1], k & 4 ? hi[2] : lo[2])
  const faces = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]
  const I: number[] = []
  for (const [a, b, c, d] of faces) I.push(a, b, c, a, c, d)
  return { positions: new Float32Array(P), indices: new Uint32Array(I.slice(0, I.length - drop * 3)), colors: new Float32Array(Array.from({ length: 8 }, () => color).flat()) }
}

test('a closed mesh is told from an open one', () => {
  assert.equal(openShare(box([0, 0, 0], [1, 2, 1])), 0)
  assert.ok(openShare(box([0, 0, 0], [1, 2, 1], undefined, 1)) > OPEN_MOST)
})

test('a still mesh stands on its foot and is cut on the grid where it is placed, in its own colors', () => {
  const bytes = new TextEncoder().encode('a box')
  const m = meshModelFrom(box([3, 5, 3], [4, 7, 4]), [], 'crate.obj', bytes)
  assert.equal(m.name, 'Crate')
  let lo = Infinity, top = 0
  for (let i = 1; i < m.mesh.positions.length; i += 3) { lo = Math.min(lo, m.mesh.positions[i]); top = Math.max(top, m.mesh.positions[i]) }
  assert.ok(Math.abs(lo) < 1e-6 && Math.abs(top - 1) < 1e-6)
  assert.ok(Math.abs(modelSize(m) - MODEL_HEIGHT) < 1e-3)
  keepModel(m)
  const at: [number, number, number] = [0.4, 0.1, -0.2]
  const p = added(project(), m.id, at, modelSize(m))
  const b = cut({ kind: 'prop', project: p, i: 0, spacing: 0.042, model: modelJob(m) })
  const n = b.blobs.count - 1
  assert.ok(n > 100, `${n} blobs`)
  let low = Infinity, high = -Infinity, red = 0
  for (let i = 0; i < n; i++) {
    low = Math.min(low, b.blobs.center[i * 3 + 1]); high = Math.max(high, b.blobs.center[i * 3 + 1])
    if (b.blobs.color[i * 3] > b.blobs.color[i * 3 + 1] * 1.5) red++
  }
  assert.ok(Math.abs(low - at[1]) < 0.05 && Math.abs(high - at[1] - MODEL_HEIGHT) < 0.05, `${low} to ${high}`)
  assert.ok(red > n * 0.9)
  // cut with no light for the styles that light it themselves, too
  assert.ok(cut({ kind: 'prop', project: p, i: 0, spacing: 0.042, model: modelJob(m), plain: true }).blobs.count > 100)
})

test('a texture is read nearest pixel and repeats', () => {
  const tx = rawTexture({ width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]) })
  assert.deepEqual(tx(0.25, 0), [1, 0, 0])
  assert.deepEqual(tx(0.75, 0), [0, 0, 1])
  assert.deepEqual(tx(1.25, 0), [1, 0, 0])
})
