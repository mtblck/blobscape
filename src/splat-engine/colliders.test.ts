import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Skeleton } from './rig.ts'
import { ELF_BONES, elfWalk } from './zoo/elf.ts'
import { plantFeet, type Leg } from './ik.ts'
import {
  ColliderFileError, SMALLEST, colliderDistance, groundBelow, groundOf, guessColliders, handlesOf, isColliderGlb, pickCollider, placed, pushOut,
  rayCollider, readColliderGlb, resized, topAt, wireOf, writeColliderGlb, type Collider,
} from './colliders.ts'

const box: Collider = { shape: 'box', center: [1, 0.5, 0], size: [1, 0.5, 0.25], turn: 0 }
const ball: Collider = { shape: 'sphere', center: [0, 1, 3], size: [0.5, 0, 0], turn: 0 }
const can: Collider = { shape: 'cylinder', center: [-2, 0.4, 0], size: [0.3, 0.4, 0], turn: 0, name: 'mug' }
const near = (a: number, b: number, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} is not ${b}`)

test('distance to each shape, and a box turned about the upright', () => {
  near(colliderDistance(box, [1, 0.5, 0]), -0.25)
  near(colliderDistance(box, [3, 0.5, 0]), 1)
  near(colliderDistance(ball, [0, 1, 4]), 0.5)
  near(colliderDistance(can, [-2, 1.3, 0]), 0.5)
  near(colliderDistance(can, [-1.2, 0.4, 0]), 0.5)
  // a quarter turn swaps the long and the short side
  const turned = { ...box, turn: 90 }
  near(colliderDistance(turned, [1, 0.5, 0.9]), -0.1)
  near(colliderDistance(turned, [1.9, 0.5, 0]), 0.65)
  // and 30° puts the +x face's middle where a turn about +y takes +x
  const r = Math.PI / 6
  near(colliderDistance({ ...box, turn: 30 }, [1 + Math.cos(r), 0.5, -Math.sin(r)]), 0, 1e-9)
})

test('the ground the shapes make: the highest top under a point, the base elsewhere, and walls left out by step', () => {
  const g = groundOf([box, ball, can])
  near(g(1, 0), 1)
  near(g(1, 0.3), 0)
  near(g(-2, 0.1), 0.8)
  near(g(0, 3), 1.5)
  near(g(0.3, 3), 1 + 0.4)
  assert.equal(topAt(ball, 0.6, 3), undefined)
  near(groundOf([box], -1)(9, 9), -1)
  // a slab on the box is the ground; from the floor, the box is too tall to step onto
  const slab: Collider = { shape: 'box', center: [1, 1.05, 0], size: [0.5, 0.05, 0.25], turn: 0 }
  near(groundOf([box, slab])(1, 0), 1.1)
  near(groundBelow([box, slab], 0, 0.4)(1, 0), 0)
  near(groundBelow([box, slab], 1, 0.4)(1, 0), 1.1)
})

test('a ball is pushed the short way out of what it is in, and left alone outside', () => {
  const p = pushOut([box], [1.9, 0.5, 0], 0.2)
  near(p[0], 2.2, 1e-6); near(p[1], 0.5, 1e-6)
  assert.deepEqual(pushOut([box, can], [5, 5, 5], 0.2), [5, 5, 5])
  // in a corner between two shapes it ends clear of both
  const wall: Collider = { shape: 'box', center: [2.5, 0.5, 0], size: [0.25, 0.5, 2], turn: 0 }
  const q = pushOut([box, wall], [2.1, 0.5, 0.3], 0.1)
  assert.ok(colliderDistance(box, q) >= 0.1 - 1e-6 && colliderDistance(wall, q) >= 0.1 - 1e-6, `${q}`)
})

test('a ray finds the nearest shape and where it meets it', () => {
  near(rayCollider(ball, [0, 1, 10], [0, 0, -1])!, 6.5, 1e-3)
  assert.equal(rayCollider(ball, [0, 3, 10], [0, 0, -1]), undefined)
  const hit = pickCollider([box, ball, can], [-10, 0.4, 0], [1, 0, 0])!
  assert.equal(hit.index, 2)
  near(hit.t, 7.7, 1e-3)
  assert.equal(pickCollider([box, ball, can], [0, 9, 0], [0, 1, 0]), undefined)
})

test('handles sit on the faces that size a shape, and pulling one changes that size alone', () => {
  assert.equal(handlesOf(box).length, 3)
  assert.equal(handlesOf(can).length, 2)
  assert.equal(handlesOf(ball).length, 1)
  for (const c of [box, { ...box, turn: 40 }, ball, can]) for (const h of handlesOf(c)) near(colliderDistance(c, h.at), 0, 1e-9)
  const top = handlesOf(can)[1]
  assert.deepEqual(top.axis, [0, 1, 0])
  const taller = resized(can, 1, 0.2)
  near(taller.size[1], 0.6); near(taller.size[0], 0.3)
  near(resized(can, 0, -5).size[0], SMALLEST)
  const twice = placed(can, 2, [1, 0, 0])
  assert.deepEqual(twice.center, [-3, 0.8, 0])
  near(twice.size[1], 0.8)
})

test('a first guess: a floor slab with its top at the floor, and a box round what was kept', () => {
  const g = guessColliders([-0.4, 0.02, -0.3], [0.4, 0.9, 0.3], 0.04)
  assert.equal(g.length, 2)
  near(g[0].center[1] + g[0].size[1], 0.04)
  assert.ok(g[0].size[0] > 0.79)
  near(g[1].center[1] - g[1].size[1], 0.04)
  near(g[1].center[1] + g[1].size[1], 0.9)
  near(g[1].size[0], 0.4)
  assert.equal(guessColliders([0, 0, 0], [0, 0, 0], 0).length, 1)
})

test('a .glb of shapes reads back exactly, opens as plain meshes, and another tool\'s physics shapes are read too', () => {
  const all = [box, { ...box, turn: 37.5, name: 'table' }, ball, can]
  const bytes = writeColliderGlb(all)
  assert.equal(bytes.byteLength % 4, 0)
  assert.ok(isColliderGlb(bytes))
  assert.deepEqual(readColliderGlb(bytes), all)
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + new DataView(bytes.buffer).getUint32(12, true))))
  assert.equal(json.meshes.length, 4)
  assert.deepEqual(json.nodes[3].translation, can.center)
  assert.equal(json.extensions.KHR_implicit_shapes.shapes[3].cylinder.height, 0.8)
  // every index points at a vertex of its own mesh
  const dv = new DataView(bytes.buffer, 20 + new DataView(bytes.buffer).getUint32(12, true) + 8)
  json.meshes.forEach((m: { primitives: { attributes: { POSITION: number }; indices: number }[] }) => {
    const pos = json.accessors[m.primitives[0].attributes.POSITION], idx = json.accessors[m.primitives[0].indices]
    const view = json.bufferViews[idx.bufferView]
    for (let i = 0; i < idx.count; i++) assert.ok(dv.getUint16(view.byteOffset + i * 2, true) < pos.count)
  })
  // without our note, the extension's shapes give the same boxes, balls and cylinders
  for (const n of json.nodes) delete n.extras
  let text = new TextEncoder().encode(JSON.stringify(json))
  if (text.byteLength % 4) { const p = new Uint8Array(text.byteLength + 4 - (text.byteLength % 4)).fill(0x20); p.set(text); text = p }
  const other = new Uint8Array(20 + text.byteLength)
  const o = new DataView(other.buffer)
  o.setUint32(0, 0x46546c67, true); o.setUint32(4, 2, true); o.setUint32(8, other.byteLength, true); o.setUint32(12, text.byteLength, true); o.setUint32(16, 0x4e4f534a, true)
  other.set(text, 20)
  const back = readColliderGlb(other)
  assert.equal(back.length, 4)
  back.forEach((c, i) => {
    assert.equal(c.shape, all[i].shape)
    for (let k = 0; k < 3; k++) { near(c.center[k], all[i].center[k]); if (all[i].size[k] > 0) near(c.size[k], all[i].size[k], 1e-9) }
    near(c.turn, all[i].turn, 1e-9)
  })
  assert.throws(() => readColliderGlb(new Uint8Array(40)), ColliderFileError)
  assert.equal(isColliderGlb(new Uint8Array([1, 2, 3])), false)
})

test("a creature's feet stand on the shapes through plantFeet", () => {
  const LEGS: Leg[] = ['l', 'r'].map((s) => ({ upper: `${s}Thigh`, lower: `${s}Shin`, foot: `${s}Foot`, pole: [0, 0, 1] }))
  const sk = new Skeleton(ELF_BONES)
  elfWalk(sk, 0.3)
  sk.update()
  const foot = (n: string) => { const i = sk.index(n); return [sk.posedHead[i * 3], sk.posedHead[i * 3 + 1], sk.posedHead[i * 3 + 2]] }
  const before = { l: foot('lFoot'), r: foot('rFoot') }
  // a low step under the elf's left (+x) foot only
  const step: Collider = { shape: 'box', center: [0.6, 0.05, 0], size: [0.6 - 0.02, 0.05, 2], turn: 0 }
  const p = plantFeet(sk, LEGS, groundOf([step]))
  for (const leg of p.legs) assert.ok(leg.miss < 1e-4, `missed by ${leg.miss}`)
  near(foot('lFoot')[1], before.l[1] + 0.1, 1e-4)
  near(foot('rFoot')[1], before.r[1], 1e-4)
})

test('the lines drawn for a shape lie on its surface', () => {
  const turned: Collider = { ...box, turn: 30 }
  for (const c of [box, turned, ball, can]) {
    const wire = wireOf(c)
    assert.ok(wire.length >= 3)
    for (const run of wire) for (const p of run) near(colliderDistance(c, p), 0, 1e-9)
  }
  assert.equal(wireOf(box).length, 6)
})
