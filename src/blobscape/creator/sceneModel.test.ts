import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkProject } from '../../splat-engine/project.ts'
import { openLand } from './library.ts'
import { modelId } from './models.ts'
import { SCENE_SHARE, fileIdOf, isPart, partId, sceneLayout, sceneProject } from './sceneModel.ts'
import { fileText, known, readFile, type ModelFile } from './store.ts'

test('a scene file is laid out where it stood: centered, its wider way a share of the land, on the floor', () => {
  // a ground 10 wide from y = -1, a house 2 wide standing on it to one side
  const boxes = [
    { min: [-5, -1, -5], max: [5, 0, 5] },
    { min: [2, 0, -1], max: [4, 3, 1] },
  ] as { min: [number, number, number]; max: [number, number, number] }[]
  const [ground, house] = sceneLayout(boxes, 3, 0.2)
  const s = (3 * SCENE_SHARE) / 10
  assert.deepEqual(ground.at, [0, 0.2, 0])
  assert.ok(Math.abs(ground.size - 10 * s) < 1e-3)
  assert.ok(Math.abs(house.at[0] - 3 * s) < 1e-3 && Math.abs(house.at[1] - (0.2 + 1 * s)) < 1e-3 && Math.abs(house.at[2]) < 1e-9)
  assert.ok(Math.abs(house.size - 3 * s) < 1e-3)
  // one covered in blobs is sized by its height
  assert.ok(Math.abs(sceneLayout([boxes[0], { ...boxes[1], byHeight: true }], 3)[1].size - 3 * s) < 1e-3)
  assert.ok(Math.abs(sceneLayout([boxes[0], { min: [2, 0, -2], max: [4, 1, 2], byHeight: true }], 3)[1].size - 1 * s) < 1e-3)
  assert.deepEqual(sceneLayout([], 3), [])
})

test('things of a scene are named by their file and place, and open as a project the checker takes', () => {
  const f = modelId(new Uint8Array([1, 2, 3]))
  assert.equal(fileIdOf(partId(f, 3)), f)
  assert.equal(fileIdOf(f), f)
  assert.ok(isPart(partId(f, 0)) && !isPart(f))
  const base = openLand('plain-turf')!
  const p = sceneProject(base, 'Farm', [{ id: partId(f, 0), at: [0, 0, 0], size: 2.4 }, { id: partId(f, 1), at: [0.5, 0.1, 0], size: 0.6 }])
  assert.equal(p.name, 'Farm')
  assert.equal(p.land, 'plain-turf')
  assert.deepEqual(checkProject(p, known), [])
})

test('a scene file is carried once in a project file for all its things, and comes back marked as a scene', () => {
  const bytes = new Uint8Array([9, 8, 7, 6])
  const mf: ModelFile = { id: modelId(bytes), file: 'farm.glb', bytes, scene: true, added: 1 }
  const p = sceneProject(openLand('plain-turf')!, 'Farm', [0, 1].map((i) => ({ id: partId(mf.id, i), at: [i, 0, 0] as [number, number, number], size: 1 })))
  const back = readFile(fileText(p, [mf]))
  assert.deepEqual(back.problems, [])
  assert.equal(back.models.length, 1)
  assert.equal(back.models[0].scene, true)
  assert.deepEqual(back.project!.props.map((x) => x.prop), [partId(mf.id, 0), partId(mf.id, 1)])
})
