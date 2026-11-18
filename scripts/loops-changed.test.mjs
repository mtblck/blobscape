import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { LOOPS } from '../src/blobscape/diorama/loops.ts'
import { sceneFor, scenesFor } from './loops-changed.mjs'

test('a changed file names the scene it is the own file of, and shared files name none', () => {
  assert.equal(sceneFor('src/blobscape/diorama/scenes/koi.ts'), 'koi')
  assert.equal(sceneFor('src/blobscape/diorama/scene.ts'), 'lighthouse')
  assert.equal(sceneFor('src/blobscape/fourways/meadow/build.ts'), 'meadow')
  assert.equal(sceneFor('src/blobscape/diorama/scenes/koi.test.ts'), undefined)
  assert.equal(sceneFor('src/splat-engine/voxel.ts'), undefined)
  assert.equal(sceneFor('public/loops/koi.webp'), undefined)
  assert.deepEqual(scenesFor(['src/blobscape/diorama/scenes/koi.ts', 'README.md', 'src/blobscape/diorama/scenes/bee.ts']), ['bee', 'koi'])
})

test('every scene in the gallery has a file that names it', () => {
  const own = (id) => id === 'lighthouse' ? 'src/blobscape/diorama/scene.ts' : id === 'meadow' ? 'src/blobscape/fourways/meadow/build.ts' : `src/blobscape/diorama/scenes/${id}.ts`
  for (const { id } of LOOPS) {
    assert.ok(existsSync(new URL(`../${own(id)}`, import.meta.url)), `${id}: no ${own(id)}`)
    assert.equal(sceneFor(own(id)), id)
  }
})
