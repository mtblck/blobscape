import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs, covariance } from '../splat-core/blobs.ts'
import { ZOO } from '../splat-engine/zoo/index.ts'
import { CREATURES } from './creature/fromScenes.ts'
import { STILL, actorAt, actorBones, freezeInto, makeActor, placeInto, placingOf, poseAll, remake, type Actor } from './actors.ts'
import type { Creature } from '../splat-engine/body.ts'
import { posedPoint } from '../splat-engine/rig.ts'

const near = (a: number, b: number, e = 1e-4) => Math.abs(a - b) < e
const fox = ZOO.find((s) => s.id === 'fox')!
const frog = ZOO.find((s) => s.id === 'frog')!

test('a still creature stands on its spot, as tall as asked, feet on the ground', () => {
  const a = makeActor(fox, { at: [2, 0.5, -1], height: 3, move: STILL })
  const out = new Blobs()
  poseAll([a], () => 0, out, new WeakMap())
  let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (let i = 0; i < out.count; i++) {
    y0 = Math.min(y0, out.center[i * 3 + 1]); y1 = Math.max(y1, out.center[i * 3 + 1])
    x0 = Math.min(x0, out.center[i * 3]); x1 = Math.max(x1, out.center[i * 3])
    z0 = Math.min(z0, out.center[i * 3 + 2]); z1 = Math.max(z1, out.center[i * 3 + 2])
  }
  assert.equal(out.count, a.body.blobs.count)
  assert.ok(near(y0, 0.5, 1e-3) && near(y1 - y0, 3, 1e-3), `stands ${y0}..${y1}`)
  assert.ok(near((x0 + x1) / 2, 2, 1e-3) && near((z0 + z1) / 2, -1, 1e-3), 'centerd on its spot')
})

test('turning a creature turns each blob with it: covariances rotate, not just centers', () => {
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
    assert.ok(near(b.center[i * 3], a.center[i * 3 + 2], 1e-4) && near(b.center[i * 3 + 2], -a.center[i * 3], 1e-4))
    const [xx, , , yy, , zz] = covariance(a, i)
    const [bxx, , , byy, , bzz] = covariance(b, i)
    assert.ok(near(bxx, zz, 1e-6) && near(bzz, xx, 1e-6) && near(byy, yy, 1e-6), `blob ${i}`)
  }
})

test('every creature moves when playing, and loops its move', () => {
  for (const sp of CREATURES) {
    const a = makeActor(sp, { at: [0, 0, 0], height: 1 })
    const m = sp.moves[0]
    const scratch = new WeakMap<Creature, Blobs>()
    const at = (t: number) => { const out = new Blobs(); poseAll([a], () => t, out, scratch); return out.center.slice(0, out.count * 3) }
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
  assert.deepEqual([...scene.center.subarray(0, 3)], [...out.center.subarray(starts[1] * 3, starts[1] * 3 + 3)])
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

test('looking: the head turns toward a point in the scene, the neck helps, and it never twists round', async () => {
  const { canLook, lookBones, placePoint, turnToLook, unplace } = await import('./actors.ts')
  const elf = ZOO.find((s) => s.id === 'elf')!
  const a = makeActor(elf, { at: [3, 0, -2], height: 1.8, yaw: 60, move: STILL })
  const P = placingOf(a)
  const back = unplace(placePoint([0.3, 1.2, -0.7], P), P)
  assert.ok(near(back[0], 0.3) && near(back[1], 1.2) && near(back[2], -0.7), 'unplace undoes placePoint')
  assert.deepEqual(lookBones(a.body.skeleton), ['neck', 'head'])
  const sk = a.body.skeleton, h = sk.index('head')
  // Where the head's forward (+z at rest) points, in the scene
  const facing = () => {
    const o = placePoint(sk.posedHead.subarray(h * 3, h * 3 + 3), P)
    const ahead = placePoint(posedPoint(sk, h, [sk.bones[h].head[0], sk.bones[h].head[1], sk.bones[h].head[2] + 1]), P)
    return [ahead[0] - o[0], ahead[2] - o[2]]
  }
  const angleTo = (f: number[], p: number[]) => {
    const o = placePoint(sk.posedHead.subarray(h * 3, h * 3 + 3), P)
    const d = [p[0] - o[0], p[2] - o[2]]
    return Math.acos(Math.min(1, (f[0] * d[0] + f[1] * d[1]) / Math.hypot(...f) / Math.hypot(...d)))
  }
  sk.reset(); sk.update()
  // A point off to its left, a quarter turn round
  const r = (60 * Math.PI) / 180, left = [3 + 4 * Math.cos(r), 1.6, -2 - 4 * Math.sin(r)]
  const before = angleTo(facing(), left)
  turnToLook(a, left, P)
  const after = angleTo(facing(), left)
  assert.ok(before > 1.3 && after < 0.15, `head ${before.toFixed(2)} -> ${after.toFixed(2)} rad from the point`)
  const neck = sk.index('neck')
  assert.ok(Math.abs(sk.rotation[neck * 4 + 3]) < 0.9999, 'the neck takes some of the turn')
  // Right behind it: the head turns as far as it may (about 95 degrees with the neck) and no further
  sk.reset(); sk.update()
  const behind = [3 - 4 * Math.sin(r), 1.6, -2 - 4 * Math.cos(r)]
  turnToLook(a, behind, P)
  assert.ok(angleTo(facing(), behind) > Math.PI / 4, `never spins round to face backward (${angleTo(facing(), behind).toFixed(2)})`)
  const slime = (await import('./props.ts')).PROPS.find((s) => s.id === 'slime')!
  const jelly = CREATURES.find((s) => s.id === 'jellyfish')!
  assert.ok(canLook(makeActor(slime, { at: [0, 0, 0], height: 1 })) && !canLook(makeActor(jelly, { at: [0, 0, 0], height: 1 })))
})

test('a creature set to look at something is posed looking at it', () => {
  const elf = ZOO.find((s) => s.id === 'elf')!
  const a = { ...makeActor(elf, { at: [0, 0, 0], height: 1.8, move: STILL }), gaze: 'you' as const }
  const plain = new Blobs(), looking = new Blobs()
  poseAll([{ ...a, gaze: 'ahead' }], () => 0, plain, new WeakMap(), () => [5, 1.6, 0])
  poseAll([a], () => 0, looking, new WeakMap(), () => [5, 1.6, 0])
  let moved = 0
  for (let i = 0; i < plain.count; i++) if (Math.hypot(plain.center[i * 3] - looking.center[i * 3], plain.center[i * 3 + 2] - looking.center[i * 3 + 2]) > 0.02) moved++
  assert.ok(moved > 50 && moved < plain.count / 2, `${moved} of ${plain.count} blobs turned: the head, not the body`)
})
