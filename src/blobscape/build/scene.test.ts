import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SceneDoc } from '../../splat-engine/sceneDoc.ts'
import { buildVoxels } from '../../splat-engine/voxel.ts'
import { SCENE_SOLVED, SCENE_SPACING, SCENE_START, brokeTheLoop, docText, lanternFlickers, readDoc, sceneCode, shapeKey, swaying } from './scene.ts'

test('the description reads back as written, and the start is sound and still', () => {
  for (const doc of [SCENE_START, SCENE_SOLVED]) assert.deepEqual(JSON.parse(docText(doc)), JSON.parse(JSON.stringify(doc)))
  const r = readDoc(docText(SCENE_START))
  assert.deepEqual(r.errors, [])
  assert.ok(r.scene)
  assert.ok(!swaying(SCENE_START) && !lanternFlickers(SCENE_START))
  const built = buildVoxels(r.scene.spec(SCENE_SPACING))
  assert.deepEqual(r.scene.empty(built), [])
})

test('the solved description meets every goal', () => {
  assert.deepEqual(readDoc(docText(SCENE_SOLVED)).errors, [])
  assert.ok(swaying(SCENE_SOLVED) && lanternFlickers(SCENE_SOLVED))
})

test('a move that would not come round whole is turned down for the loop', () => {
  const half: SceneDoc = { ...SCENE_START, moves: [{ kind: 'sway', bone: 'tree', axis: 'z', degrees: 4, times: 1.5 }] }
  const r = readDoc(docText(half))
  assert.ok(!r.scene && brokeTheLoop(r.errors), r.errors.join('; '))
  assert.ok(!brokeTheLoop(readDoc('{ "name": ').errors))
  assert.match(readDoc('{ "name": ').errors[0], /^JSON: /)
})

test('a light far from the lantern, or one that holds steady, does not light it', () => {
  const far: SceneDoc = { ...SCENE_START, lights: [{ at: [-1, 0.5, 0], color: '#ffd166', strength: 1, range: 1, flicker: { by: 0.3, times: 12 } }] }
  assert.ok(!lanternFlickers(far))
  const steady: SceneDoc = { ...SCENE_START, lights: [{ ...SCENE_SOLVED.lights![0], flicker: undefined }] }
  assert.ok(!lanternFlickers(steady))
})

test('moves and lights change no blobs, so they need no new cut', () => {
  assert.equal(shapeKey(SCENE_START), shapeKey(SCENE_SOLVED))
  assert.notEqual(shapeKey(SCENE_START), shapeKey({ ...SCENE_START, parts: SCENE_START.parts.slice(1) }))
  assert.match(sceneCode(SCENE_SOLVED), /"kind": "sway"/)
})
