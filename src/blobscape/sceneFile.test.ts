import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs } from '../splat-core/blobs.ts'
import { ZOO } from '../splat-engine/zoo/index.ts'
import { poseBlobs } from '../splat-engine/pose.ts'
import { readRiggedGlb, sampleClip, writeRiggedGlb } from '../splat-engine/glb.ts'
import { STILL, detailsOf, makeActor, poseAll, type Actor } from './actors.ts'
import { MAX_FILE_BONES, SCENE_BONE, clipLength, fileSpecies, sceneBones, sceneRig, splitScene } from './sceneFile.ts'

const sp = (id: string) => ZOO.find((s) => s.id === id)!

function sceneBlobs() {
  const b = new Blobs(3)
  for (let i = 0; i < 3; i++) b.push({ center: [i, 0.2, -1], scale: [0.1, 0.1, 0.1], quat: [0, 0, 0, 1], color: [0.5, 0.3, 0.2], opacity: 0.9 })
  return b
}
const actorsFor = (): Actor[] => [
  { ...makeActor(sp('fox'), { at: [1, 0, 2], height: 0.8, yaw: 70, detail: detailsOf(sp('fox'))[0] }) },
  { ...makeActor(sp('elf'), { at: [-1.5, 0.1, 0], height: 1.7, yaw: -120, detail: detailsOf(sp('elf'))[0], move: 'wave' }) },
  { ...makeActor(sp('frog'), { at: [0, 0, -2], height: 0.4, yaw: 10, detail: detailsOf(sp('frog'))[0], move: STILL }) },
]
const maxGap = (a: Blobs, b: Blobs, from: number, n: number) => {
  let worst = 0
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(a.center[(from + i) * 3 + k] - b.center[(from + i) * 3 + k]))
  return worst
}

test('the clip runs as long as the longest move, or a few of it when that lets every move loop', () => {
  assert.equal(clipLength([]), 0)
  assert.equal(clipLength([0, 0]), 0)
  assert.equal(clipLength([1, 0.5]), 1)
  assert.ok(Math.abs(clipLength([1.5, 1]) - 3) < 1e-9)
})

test('the saved scene, posed by its clip, is the sandbox as drawn: scene blobs still, creatures where and how they stand', () => {
  const scene = sceneBlobs(), actors = actorsFor()
  const clock = (a: Actor) => (a.species.id === 'fox' ? 0.3 : 1.1)
  const r = sceneRig(scene, actors, clock)
  assert.equal(r.skeleton.bones[0].name, SCENE_BONE)
  assert.equal(r.skeleton.count, sceneBones(actors))
  assert.equal(r.blobs.count, scene.count + actors.reduce((n, a) => n + a.body.blobs.count, 0))
  assert.equal(r.clips.length, 1)
  for (const t of [0, 0.45, 1.3]) {
    const drawn = new Blobs()
    poseAll(actors, (a) => clock(a) + t, drawn, new WeakMap())
    sampleClip(r.clips[0], r.skeleton, t)
    r.skeleton.update()
    const posed = r.blobs.clone()
    poseBlobs(r.blobs, r.skin, r.skeleton, 'quat', posed)
    assert.ok(maxGap(posed, r.blobs, 0, scene.count) < 1e-6, 'scene blobs stay put')
    // The clip holds keys 1/24 s apart, so between keys it's off by a little
    const gap = (() => { let w = 0; for (let i = 0; i < drawn.count; i++) for (let k = 0; k < 3; k++) w = Math.max(w, Math.abs(posed.center[(scene.count + i) * 3 + k] - drawn.center[i * 3 + k])); return w })()
    assert.ok(gap < 0.03, `creatures at ${t}s are ${gap.toFixed(4)} from where the sandbox draws them`)
  }
})

test('a scene file comes apart again: the scene, and each creature with its own bones and clip', () => {
  const scene = sceneBlobs(), actors = actorsFor()
  const r = readRiggedGlb(writeRiggedGlb(sceneRig(scene, actors, () => 0)))
  const split = splitScene(r)!
  assert.ok(split)
  assert.equal(split.scene.count, scene.count)
  assert.deepEqual(split.parts.map((p) => p.name), ['fox', 'elf', 'frog'])
  split.parts.forEach((p, k) => {
    assert.equal(p.blobs.count, actors[k].body.blobs.count)
    assert.equal(p.skeleton.count, actors[k].body.skeleton.count)
    assert.deepEqual(p.skeleton.bones.map((b) => b.name), actors[k].body.skeleton.bones.map((b) => b.name))
  })
  // A part posed by its share of the clip lands where the whole file puts those blobs
  const t = 0.6
  sampleClip(r.clips[0], r.skeleton, t); r.skeleton.update()
  const whole = r.blobs.clone(); poseBlobs(r.blobs, r.skin, r.skeleton, 'quat', whole)
  let from = scene.count
  for (const p of split.parts) {
    sampleClip(p.clips[0], p.skeleton, t); p.skeleton.update()
    const posed = p.blobs.clone(); poseBlobs(p.blobs, p.skin, p.skeleton, 'quat', posed)
    let worst = 0
    for (let i = 0; i < p.blobs.count; i++) for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(posed.center[i * 3 + k] - whole.center[(from + i) * 3 + k]))
    assert.ok(worst < 1e-4, `${p.name} is ${worst} off`)
    from += p.blobs.count
  }
  // As a creature, it plays the saved clip
  const fileFox = fileSpecies(split.parts[0], 'fox')
  assert.deepEqual(fileFox.moves.map((m) => m.label), ['Play'])
  assert.equal(makeActor(fileFox, { at: [0, 0, 0], height: 1 }).body.blobs.count, actors[0].body.blobs.count)
})

test('any other rigged file is not a scene; too many bones are refused', () => {
  const fox = makeActor(sp('fox'), { at: [0, 0, 0], height: 1 })
  assert.equal(splitScene({ name: 'fox', ...fox.body, clips: [] }), null)
  const many = Array.from({ length: 8 }, () => makeActor(sp('dragon'), { at: [0, 0, 0], height: 1 }))
  assert.ok(sceneBones(many) > MAX_FILE_BONES)
  assert.throws(() => sceneRig(new Blobs(), many, () => 0), /255 bones/)
})
