import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Skeleton } from './rig.ts'
import { POKE_LIFE, PUFFS, Pokes, wobble } from './poke.ts'

const rig = () => new Skeleton([
  { name: 'land', parent: -1, head: [0, 0, 0] },
  { name: 'tree', parent: 0, head: [1, 0, 0] },
  ...Array.from({ length: PUFFS }, (_, k) => ({ name: `~puff${k}`, parent: 0, head: [0, 1, 0] as [number, number, number] })),
])
test('the wobble leans out, swings back past rest and settles within its life', () => {
  assert.equal(wobble(0), 0)
  assert.ok(wobble(0.1) > 0.1)
  assert.ok(Math.min(...Array.from({ length: 40 }, (_, k) => wobble(k * 0.02))) < 0, 'swings back past rest')
  assert.equal(wobble(POKE_LIFE), 0)
})

test('a poked bone leans away from the tap, then the pose is the scene\'s own again', () => {
  const sk = rig(), pokes = new Pokes(sk)
  sk.reset(); sk.update()
  pokes.add(sk, 1, [0.5, 0.5, 0], 10)
  sk.reset(); pokes.apply(sk, 10.1)
  // the tap came from -x, so the tree's top goes +x
  const m = sk.matrix.subarray(16, 32)
  const topX = m[4] * 1 + m[0] * 1 + m[12] // the rest point (1, 1, 0) after the skin
  assert.ok(topX > 1.05, `${topX}`)
  sk.reset(); pokes.apply(sk, 10 + POKE_LIFE + 0.01)
  assert.equal(pokes.list.length, 0)
  assert.ok(Math.abs(sk.matrix[16] - 1) < 1e-6 && Math.abs(sk.matrix[16 + 4]) < 1e-6)
})

test('a tap on the land throws the puff bones out from the tap and hides them after; no puff bones, no puff', () => {
  const sk = rig(), pokes = new Pokes(sk)
  assert.equal(pokes.puffs.length, PUFFS)
  sk.reset(); pokes.apply(sk, 0)
  assert.ok(pokes.puffs.every((b) => sk.size[b] === 0), 'hidden at rest')
  pokes.add(sk, 0, [2, 0, 3], 5)
  sk.reset(); pokes.apply(sk, 5.3)
  for (const b of pokes.puffs) {
    assert.ok(sk.size[b] > 0.3)
    const h = sk.posedHead.subarray(b * 3, b * 3 + 3)
    const d = Math.hypot(h[0] - 2, h[1], h[2] - 3)
    assert.ok(d > 0.05 && d < 0.4 && h[1] > 0, `${[...h]}`)
  }
  sk.reset(); pokes.apply(sk, 5 + POKE_LIFE)
  assert.ok(pokes.puffs.every((b) => sk.size[b] === 0))
  const bare = new Skeleton([{ name: 'land', parent: -1, head: [0, 0, 0] }])
  const none = new Pokes(bare)
  none.add(bare, 0, [0, 0, 0], 0)
  assert.equal(none.list.length, 0)
})
