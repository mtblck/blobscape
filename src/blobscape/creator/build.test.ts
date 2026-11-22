import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SceneBuilder } from './build.ts'
import { readProject } from '../../splat-engine/project.ts'
import { checkScene } from '../../splat-engine/sceneDoc.ts'
import { LIBRARY } from './library.ts'

test('a scene built in code is what Scene Creator saves: props stood on the land, a file it opens, a sound description', () => {
  const s = new SceneBuilder('Lantern garden', 'plain-turf')
  const lantern = s.put('tall-stone-lantern', -0.4, 0.2)
  s.put('bamboo', 0.5, -0.3, { turn: 40, size: 1.1, phase: 0.3 })
  s.put('mossy-stone', 0.2, 0.4, { turn: 15 })
  s.light({ live: { hour: 21 } })
  const p = s.project()
  // stood on the turf's top, as a drop in Props mode would stand it
  assert.ok(Math.abs(p.props[lantern].at[1] - s.groundAt(-0.4, 0.2)) < 1e-9)
  assert.ok(p.props[lantern].at[1] > -0.2 && p.props[lantern].at[1] < 0.3)
  const back = readProject(JSON.stringify(p), (id) => LIBRARY.some((e) => e.id === id))
  assert.deepEqual(back.problems, [])
  assert.deepEqual(checkScene(s.doc()), [])
})

test('a builder names what it does not know, and lists what it does', () => {
  assert.throws(() => new SceneBuilder('x', 'nowhere'), /No land/)
  assert.throws(() => new SceneBuilder('x', 'plain-turf').put('gazebo', 0, 0), /No prop/)
  const all = SceneBuilder.library()
  assert.ok(all.some((e) => e.id === 'koi-pond' && e.kind === 'land'))
  assert.ok(all.some((e) => e.id === 'snow-lantern' && e.kind === 'prop'))
})
