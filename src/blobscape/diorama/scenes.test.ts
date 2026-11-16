import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DIORAMAS } from './scenes.ts'
import { DETAIL } from './scene.ts'
import { CAMPFIRE } from './scenes/campfire.ts'
import { BEE } from './scenes/bee.ts'
import { DRAGON } from './scenes/dragon.ts'
import { HAND } from './scenes/hand.ts'
import { REEF } from './scenes/reef.ts'
import { WINDMILL } from './scenes/windmill.ts'
import { checkScene } from '../../splat-engine/sceneDoc.ts'
import { MAX_PALETTE_SIZE } from '../../splat-core/pixel.ts'

test('the described scenes are sound, and are data alone', () => {
  for (const doc of [BEE, CAMPFIRE, DRAGON, HAND, REEF, WINDMILL]) {
    assert.deepEqual(checkScene(doc), [], doc.name)
    // nothing but what a .json file could hold
    assert.deepEqual(JSON.parse(JSON.stringify(doc)), doc, doc.name)
  }
})

test('every scene builds at every detail with all of its parts, and loops', () => {
  for (const d of DIORAMAS) {
    let last = 0
    for (const level of DETAIL) {
      const b = d.make(level.spacing)
      assert.ok(b.blobs.count > last && b.blobs.count < 240000, `${d.id} ${level.id}: ${b.blobs.count}`)
      assert.equal(new Set(b.partOf).size, b.partOf.reduce((m, p) => Math.max(m, p), 0) + 1, `${d.id} ${level.id}: a part caught no grid cell`)
      last = b.blobs.count
    }
    const { skeleton: sk } = d.make(DETAIL[0].spacing)
    d.pose(sk, 0.9)
    const a = Float32Array.from(sk.matrix)
    d.pose(sk, 0.9 + d.loop)
    for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - sk.matrix[i]) < 1e-4, `${d.id}: matrix ${i}`)
    assert.ok(d.palette.colors.length <= MAX_PALETTE_SIZE && d.views.length > 0, d.id)
    assert.equal(d.lights(0).length, d.lights(3).length)
  }
})
