import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { checkScene, compileScene } from '../../splat-engine/sceneDoc.ts'
import { buildVoxels } from '../../splat-engine/voxel.ts'
import { loopSnaps } from '../../splat-engine/sceneChecks.ts'
import { LIBRARY, libraryCreature, libraryProp } from './library.ts'

const CHUNKY = 0.042

test('no two library entries share an id or a name, and every one has a sentence and a card picture', () => {
  assert.equal(new Set(LIBRARY.map((e) => e.id)).size, LIBRARY.length)
  assert.equal(new Set(LIBRARY.map((e) => e.name.toLowerCase())).size, LIBRARY.length)
  for (const e of LIBRARY) {
    assert.ok(e.about.length > 5, e.id)
    assert.ok(existsSync(new URL(`../../../public${e.picture}`, import.meta.url)), `${e.id}: no ${e.picture} (npm run props)`)
  }
})

test("every prop and land is a sound description that cuts to blobs and loops, and every prop's foot is where it stood", () => {
  for (const e of LIBRARY) {
    if (e.kind === 'creature') { assert.ok(libraryCreature(e.id), e.id); continue }
    const p = libraryProp(e.id)
    assert.ok(p, e.id)
    assert.deepEqual(checkScene(p.doc), [], e.id)
    const c = compileScene(p.doc, { puffs: false })
    const built = buildVoxels(c.spec(CHUNKY))
    assert.ok(built.blobs.count > 10, `${e.id}: ${built.blobs.count} blobs`)
    assert.deepEqual(loopSnaps(built.skeleton, c.pose, c.loop), [], `${e.id}: snaps`)
    if (e.kind === 'prop') {
      // its foot is where it met its scene's ground (placing puts that on the new land): its lowest blobs are at the
      // foot, or sunk a little below it, never floating over it
      let low = Infinity
      for (let i = 0; i < built.blobs.count; i++) low = Math.min(low, built.blobs.center[i * 3 + 1])
      assert.ok(low < p.foot[1] + 0.12 && low > p.foot[1] - 0.7, `${e.id}: lowest blob at ${low.toFixed(2)}, foot at ${p.foot[1].toFixed(2)}`)
    }
  }
})
