import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Dungeon } from './dungeon.ts'
import { BURST, KINDS, MAX_MP, RULES } from './game.ts'
import { MAX_LIGHTS } from '../../splat-engine/engine.ts'
import { torchLight } from './hall.ts'

test('the dungeon builds every actor once, with a pool of slimes per colour hidden until they come out', () => {
  const t0 = performance.now()
  const d = new Dungeon({ detail: 1, look: 'forest', difficulty: 'normal', light: 'baked' })
  const ms = performance.now() - t0
  assert.ok(d.blobCount > 100000 && d.blobCount < 200000, `${d.blobCount} blobs`)
  assert.ok(ms < 4000, `built in ${ms} ms`)
  for (const k of KINDS) assert.equal(d.slimes[k].length, RULES[k].pool)
  // nothing out yet: every slime is hidden
  for (const k of KINDS) for (const s of d.slimes[k]) assert.ok(s.skeleton.scale[0] < 1e-6)
})

test('a slime that comes out shows, and bursting it flings its shards out and down onto the floor', () => {
  const d = new Dungeon({ detail: 0.3, look: 'dusk', difficulty: 'normal', light: 'live' })
  d.game.hold()
  const s = d.game.place('red', 2, 2)
  d.update(1 / 30, { forward: 0, turn: 0 })
  const sk = d.slimes.red[s.slot].skeleton
  assert.ok(sk.scale[0] > 0.5)
  const shard = sk.index('shard0')
  assert.equal(sk.scale[shard], 0)
  s.hp = 0
  s.phase = 'burst'
  s.t = 0
  for (let t = 0; t < 1; t += 1 / 30) d.update(1 / 30, { forward: 0, turn: 0 })
  assert.ok(sk.scale[shard] > 0.5, 'shards show')
  const y = sk.posedHead[shard * 3 + 1]
  assert.ok(y >= 0 && y < 0.1, `landed at ${y}`)
  assert.ok(Math.hypot(sk.posedHead[shard * 3] - 2, sk.posedHead[shard * 3 + 2] - 2) > 0.6, 'flew out')
  for (let t = 0; t < BURST; t += 1 / 30) d.update(1 / 30, { forward: 0, turn: 0 })
  assert.ok(sk.scale[0] < 1e-6, 'gone once faded')
})

test('torchlight is warm by a torch and cold and dim in the middle of the hall', () => {
  const near = torchLight([3.2, 0, 5.8]), mid = torchLight([0, 0, 0])
  assert.ok(near[0] > mid[0] * 1.5 && near[0] > near[2] * 1.3)
  assert.ok(mid[2] >= mid[0] * 0.6)
})

test('live lights: eight torches, the orb dimming with the magic, a light per bolt and a flash per burst, never more than the engine takes', () => {
  const d = new Dungeon({ detail: 0.3, look: 'forest', difficulty: 'normal', light: 'live' })
  d.game.hold()
  const orb = () => d.lights()[8]
  const full = orb().colour[2]
  d.game.hero.mp = 0
  d.update(1 / 30, { forward: 0, turn: 0 })
  assert.ok(orb().colour[2] < full * 0.5)
  d.game.hero.mp = MAX_MP
  for (let k = 0; k < 4; k++) d.game.place(KINDS[k], -3 + 2 * k, 3)
  d.update(1 / 30, { forward: 0, turn: 0, cast: true })
  for (let t = 0; t < 0.3; t += 1 / 30) d.update(1 / 30, { forward: 0, turn: 0 })
  assert.ok(d.lights().length >= 10, 'a bolt lights')
  for (const s of d.game.slimes) { s.phase = 'burst'; s.t = 0 }
  d.update(1 / 30, { forward: 0, turn: 0 })
  const ls = d.lights()
  assert.ok(ls.length > 12 && ls.length <= MAX_LIGHTS, `${ls.length} lights`)
  for (const l of ls) assert.ok(l.range > 0 && l.colour.every((c) => c >= 0 && Number.isFinite(c)))
})
