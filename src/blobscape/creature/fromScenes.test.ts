import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readRiggedGlb, recordClip, sampleClip, writeRiggedGlb } from '../../splat-engine/glb.ts'
import { CREATURES, SCENE_CREATURES } from './fromScenes.ts'

test('the scenes\' creatures come first, and every creature has its own id', () => {
  assert.deepEqual(CREATURES.slice(0, 3).map((s) => s.id), ['crocodile', 'jellyfish', 'owl'])
  assert.equal(new Set(CREATURES.map((s) => s.id)).size, CREATURES.length)
})

for (const sp of SCENE_CREATURES) {
  test(`the ${sp.name} leaves its scene with about as many blobs as asked, each on one bone, standing on the floor`, () => {
    const c = sp.make(sp.detail[0], sp.looks[0].id)
    const n = c.blobs.count
    assert.ok(Math.abs(n - sp.detail[0]) < sp.detail[0] * 0.08, `${n} blobs for ${sp.detail[0]}`)
    let low = Infinity
    for (let i = 0; i < n; i++) {
      assert.ok(c.skin.joints[i * 4] > 0 && c.skin.joints[i * 4] < c.skeleton.count, 'on a bone of its own, not the land')
      assert.ok(Math.abs(c.skin.weights[i * 4] - 1) < 1e-6)
      low = Math.min(low, c.blobs.center[i * 3 + 1])
    }
    assert.ok(low > -0.08 && low < 0.1, `lowest blob at y = ${low}`)
    // it faces +z and stands over the origin: as much of it to the left as to the right
    let x = 0
    for (let i = 0; i < n; i++) x += c.blobs.center[i * 3]
    assert.ok(Math.abs(x / n) < 0.08, `leans ${x / n} off the middle`)
  })

  test(`the ${sp.name} has two moves that loop and survive a .glb`, () => {
    const c = sp.make(sp.detail[0], sp.looks[0].id)
    assert.equal(sp.moves.length, 2)
    const clips = sp.moves.map((m) => recordClip(m.name, c.skeleton, m.pose, m.seconds, m.fps ?? 24))
    const back = readRiggedGlb(writeRiggedGlb({ name: sp.name, ...c, clips }))
    assert.deepEqual(back.clips.map((k) => k.name), sp.moves.map((m) => m.name))
    for (const clip of clips) {
      const end = clip.times[clip.times.length - 1]
      sampleClip(clip, c.skeleton, 0)
      const start = c.skeleton.posedHead.slice()
      sampleClip(clip, c.skeleton, end * 0.37)
      const mid = c.skeleton.posedHead.slice()
      sampleClip(clip, c.skeleton, end * 0.9999)
      let moved = 0
      for (let i = 0; i < start.length; i++) {
        assert.ok(Math.abs(c.skeleton.posedHead[i] - start[i]) < 0.03, `${clip.name} bone coord ${i}`)
        moved = Math.max(moved, Math.abs(mid[i] - start[i]))
      }
      assert.ok(moved > 0.005, `${clip.name} moves (${moved})`)
    }
  })
}
