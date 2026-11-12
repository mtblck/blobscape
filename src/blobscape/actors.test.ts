import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs, covariance } from '../splat-core/blobs.ts'
import { ZOO } from '../splat-engine/zoo/index.ts'
import { STILL, actorAt, actorBones, freezeInto, makeActor, placeInto, placingOf, poseAll, remake, type Actor } from './actors.ts'
import type { Creature } from '../splat-engine/body.ts'

const near = (a: number, b: number, e = 1e-4) => Math.abs(a - b) < e
const fox = ZOO.find((s) => s.id === 'fox')!
const frog = ZOO.find((s) => s.id === 'frog')!

test('a still creature stands on its spot, as tall as asked, feet on the ground', () => {
  const a = makeActor(fox, { at: [2, 0.5, -1], height: 3, move: STILL })
  const out = new Blobs()
  poseAll([a], () => 0, out, new WeakMap())
  let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (let i = 0; i < out.count; i++) {
    y0 = Math.min(y0, out.centre[i * 3 + 1]); y1 = Math.max(y1, out.centre[i * 3 + 1])
    x0 = Math.min(x0, out.centre[i * 3]); x1 = Math.max(x1, out.centre[i * 3])
    z0 = Math.min(z0, out.centre[i * 3 + 2]); z1 = Math.max(z1, out.centre[i * 3 + 2])
  }
  assert.equal(out.count, a.body.blobs.count)
  assert.ok(near(y0, 0.5, 1e-3) && near(y1 - y0, 3, 1e-3), `stands ${y0}..${y1}`)
  assert.ok(near((x0 + x1) / 2, 2, 1e-3) && near((z0 + z1) / 2, -1, 1e-3), 'centred on its spot')
})

test('turning a creature turns each blob with it: covariances rotate, not just centres', () => {
  const rest = makeActor(frog, { at: [0, 0, 0], height: 1, move: STILL })
  const turned = { ...rest, yaw: 90 }
  const P0 = placingOf(rest), P1 = placingOf(turned)
  const posed = rest.body.blobs
  const a = new Blobs(posed.count), b = new Blobs(posed.count)
  a.count = b.count = posed.count
  placeInto(posed, P0, a, 0)
  placeInto(posed, P1, b, 0)
  for (const i of [0, 17, posed.count - 1]) {
    // A quarter turn about +Y takes (x, z) to (z, −x)
    assert.ok(near(b.centre[i * 3], a.centre[i * 3 + 2], 1e-4) && near(b.centre[i * 3 + 2], -a.centre[i * 3], 1e-4))
    const [xx, , , yy, , zz] = covariance(a, i)
    const [bxx, , , byy, , bzz] = covariance(b, i)
    assert.ok(near(bxx, zz, 1e-6) && near(bzz, xx, 1e-6) && near(byy, yy, 1e-6), `blob ${i}`)
  }
})

test('every creature moves when playing, and loops its move', () => {
  for (const sp of ZOO) {
    const a = makeActor(sp, { at: [0, 0, 0], height: 1 })
    const m = sp.moves[0]
    const scratch = new WeakMap<Creature, Blobs>()
    const at = (t: number) => { const out = new Blobs(); poseAll([a], () => t, out, scratch); return out.centre.slice(0, out.count * 3) }
    const t0 = at(m.seconds * 0.1), t1 = at(m.seconds * 0.4), again = at(m.seconds * 1.1)
    let moved = 0, loop = 0
    for (let k = 0; k < t0.length; k++) { moved = Math.max(moved, Math.abs(t1[k] - t0[k])); loop = Math.max(loop, Math.abs(again[k] - t0[k])) }
    assert.ok(moved > 1e-3, `${sp.name} ${m.name} moved ${moved}`)
    assert.ok(loop < 1e-3, `${sp.name} ${m.name} loops (${loop})`)
  }
})

test('several creatures share one list; a ray finds the right one; freezing copies its blobs', () => {
  const list: Actor[] = [
    makeActor(frog, { at: [-2, 0, 0], height: 0.5, move: STILL }),
    makeActor(fox, { at: [2, 0, 0], height: 1, move: STILL }),
  ]
  const out = new Blobs()
  const starts = poseAll(list, () => 0, out, new WeakMap())
  assert.deepEqual(starts, [0, list[0].body.blobs.count])
  assert.equal(out.count, list[0].body.blobs.count + list[1].body.blobs.count)
  // Straight down onto the fox's back
  const hit = actorAt(out, starts, [2, 5, 0], [0, -1, 0])
  assert.equal(hit.index, 1)
  assert.equal(actorAt(out, starts, [0, 5, 0], [0, -1, 0]).index, -1)
  const scene = new Blobs()
  freezeInto(out, starts[1], list[1].body.blobs.count, scene)
  assert.equal(scene.count, list[1].body.blobs.count)
  assert.deepEqual([...scene.centre.subarray(0, 3)], [...out.centre.subarray(starts[1] * 3, starts[1] * 3 + 3)])
  // Bones follow the placement: the fox's root sits over its spot
  const bones = actorBones(list[1])
  assert.ok(Math.abs(bones[0].from[0] - 2) < 0.5)
})

test('remaking keeps where a creature stands and what it does', () => {
  const a = { ...makeActor(fox, { at: [1, 0, 2], height: 2 }), yaw: 33, speed: 1.5 }
  const b = remake(a, 'arctic', fox.detail[0])
  assert.equal(b.key, a.key)
  assert.deepEqual([b.at, b.height, b.yaw, b.move, b.speed, b.look], [a.at, a.height, a.yaw, a.move, a.speed, 'arctic'])
  assert.notEqual(b.body, a.body)
})
