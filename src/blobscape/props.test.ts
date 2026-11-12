import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs } from '../splat-core/blobs.ts'
import { makeActor, poseAll, detailsOf } from './actors.ts'
import { PROPS, SLIME, WATCH } from './props.ts'

test('the slime and the watch go into a sandbox scene like any creature', () => {
  for (const sp of PROPS) {
    const a = makeActor(sp, { at: [0, 0, 0], height: 1 })
    assert.ok(a.body.blobs.count >= detailsOf(sp)[0] * 0.8 && a.body.blobs.count < detailsOf(sp)[0] * 1.3, `${sp.id}: ${a.body.blobs.count}`)
    const out = new Blobs(1)
    for (const m of sp.moves) {
      poseAll([{ ...a, move: m.name }], () => 0.37, out, new WeakMap())
      assert.equal(out.count, a.body.blobs.count)
      for (let i = 0; i < out.count * 3; i++) assert.ok(Number.isFinite(out.centre[i]), `${sp.id} ${m.name}`)
    }
  }
})

test("each of the slime's moves loops: its last moment looks like its first", () => {
  const sk = SLIME.make(3000, 'blue').skeleton
  for (const m of SLIME.moves) {
    m.pose(sk, 0); const a = Array.from(sk.posedHead).concat(Array.from(sk.scale))
    m.pose(sk, m.seconds - 1e-4); const b = Array.from(sk.posedHead).concat(Array.from(sk.scale))
    const worst = Math.max(...a.map((v, i) => Math.abs(v - b[i])))
    assert.ok(worst < 0.03, `${m.name}: ${worst}`)
  }
  assert.equal(SLIME.looks.length, 5)
  assert.equal(WATCH.moves.length, 1)
})
