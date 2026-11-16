import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs, quatFromEuler, quatToMat } from './blobs.ts'
import { Selection, flipUpright, inPolygon, selectByColor, sitOnFloor, thin, turnY } from './ops.ts'
import { readOwnPly, writePly } from './ply.ts'
import { applyEffectOne, bakeEffect, hash01, type EffectParams } from './effects.ts'

const scene = (n: number) => {
  const b = new Blobs()
  for (let i = 0; i < n; i++) b.push({ center: [i * 0.1, 1 + (i % 5) * 0.2, -i * 0.05], scale: [0.05, 0.03, 0.01], quat: quatFromEuler(i * 7, i * 13, i * 3), color: [i / n, 0.5, 1 - i / n], opacity: 0.2 + 0.7 * (i / n) })
  return b
}
const near = (a: number, b: number, eps = 1e-5) => Math.abs(a - b) < eps

test('a .ply written and read back gives the same blobs', () => {
  const b = scene(50)
  const r = readOwnPly(writePly(b))
  assert.equal(r.count, 50)
  for (let i = 0; i < 50 * 3; i++) {
    assert.ok(near(r.center[i], b.center[i]), `center ${i}`)
    assert.ok(near(r.scale[i], b.scale[i]), `scale ${i}`)
    assert.ok(near(r.color[i], b.color[i], 1e-4), `color ${i}`)
  }
  for (let i = 0; i < 50; i++) assert.ok(near(r.opacity[i], b.opacity[i], 1e-4))
  // A quaternion and its negative are the same turn: compare the rotation matrices
  for (let i = 0; i < 50; i++) {
    const m1 = quatToMat(b.quat.subarray(i * 4, i * 4 + 4)), m2 = quatToMat(r.quat.subarray(i * 4, i * 4 + 4))
    m1.forEach((v, k) => assert.ok(near(v, m2[k], 1e-4)))
  }
})

test('the .ply header is the standard 3DGS layout', () => {
  const head = new TextDecoder().decode(writePly(scene(3)).subarray(0, 400))
  assert.match(head, /element vertex 3/)
  for (const p of ['f_dc_0', 'opacity', 'scale_2', 'rot_3']) assert.match(head, new RegExp(`property float ${p}\\n`))
})

test('flipping upright twice is a no-op, and once turns y and z over', () => {
  const b = scene(10), c = b.clone()
  flipUpright(c)
  assert.ok(near(c.center[1], -b.center[1]) && near(c.center[2], -b.center[2]) && near(c.center[0], b.center[0]))
  // The blob's axes turn with it: rotation = Rx(180°) · R
  const R = quatToMat(b.quat.subarray(0, 4)), F = quatToMat(c.quat.subarray(0, 4))
  for (let col = 0; col < 3; col++) {
    assert.ok(near(F[col], R[col]) && near(F[3 + col], -R[3 + col]) && near(F[6 + col], -R[6 + col]))
  }
  flipUpright(c)
  for (let i = 0; i < 30; i++) assert.ok(near(c.center[i], b.center[i]))
})

test('sitOnFloor puts the bottom at y = 0', () => {
  const b = scene(200)
  sitOnFloor(b)
  let min = Infinity
  for (let i = 0; i < b.count; i++) min = Math.min(min, b.center[i * 3 + 1])
  assert.ok(near(min, 0, 1e-6), `${min}`)
})

test('turning by 360° in steps comes back to the start', () => {
  const b = scene(8), c = b.clone()
  for (let k = 0; k < 24; k++) turnY(c, null, [0.3, 0, 0.1], 15)
  for (let i = 0; i < 24; i++) assert.ok(near(c.center[i], b.center[i], 1e-4))
  for (let i = 0; i < 8; i++) {
    const m1 = quatToMat(b.quat.subarray(i * 4, i * 4 + 4)), m2 = quatToMat(c.quat.subarray(i * 4, i * 4 + 4))
    m1.forEach((v, k) => assert.ok(near(v, m2[k], 1e-4)))
  }
})

test('selection keeps its count and puts selected blobs first', () => {
  const s = new Selection()
  s.set(3, true); s.set(7, true); s.set(3, true)
  assert.equal(s.count, 2)
  assert.deepEqual([...s.selectedFirst(9)], [3, 7, 0, 1, 2, 4, 5, 6, 8])
  s.invert(9)
  assert.equal(s.count, 7)
  assert.ok(!s.has(3) && s.has(0))
})

test('lasso polygon test and color select', () => {
  const square = [0, 0, 10, 0, 10, 10, 0, 10]
  assert.ok(inPolygon(5, 5, square) && !inPolygon(15, 5, square))
  const b = scene(10), s = new Selection()
  selectByColor(b, s, [0, 0.5, 1], 0.1)
  assert.ok(s.has(0) && !s.has(9))
})

test('thinning keeps every nth blob and widens them', () => {
  const b = scene(100)
  assert.equal(thin(b, 25), 4)
  assert.equal(b.count, 25)
  assert.ok(near(b.scale[0], 0.05 * 2))
})

const frame = { center: [0, 1, 0] as [number, number, number], radius: 1, floor: 0 }
test('every effect leaves blobs untouched at amount 0, except the looping ones', () => {
  for (const kind of ['explode', 'melt', 'twist', 'dissolve'] as const) {
    const b = scene(20), c = b.clone()
    bakeEffect(c, { ...frame, kind, amount: 0, time: 0 }, null, c.count)
    for (let i = 0; i < 60; i++) assert.equal(c.center[i], b.center[i], kind)
  }
})

test('explode pushes blobs outward, melt brings them down, dissolve fades them', () => {
  const p = (kind: EffectParams['kind']): EffectParams => ({ ...frame, kind, amount: 1, time: 0 })
  const b = scene(30)
  const dist = (x: Blobs, i: number) => Math.hypot(x.center[i * 3], x.center[i * 3 + 1] - 1, x.center[i * 3 + 2])
  const e = b.clone(); bakeEffect(e, p('explode'), null, e.count)
  let out = 0
  for (let i = 0; i < 30; i++) if (dist(e, i) > dist(b, i)) out++
  assert.ok(out >= 28, `${out} of 30 moved out`)
  const m = b.clone(); bakeEffect(m, p('melt'), null, m.count)
  for (let i = 0; i < 30; i++) assert.ok(m.center[i * 3 + 1] < 0.1, `blob ${i} at ${m.center[i * 3 + 1]}`)
  const d = b.clone(); bakeEffect(d, p('dissolve'), null, d.count)
  for (let i = 0; i < 30; i++) assert.ok(d.opacity[i] < 0.01)
})

test('a baked effect only touches the first `count` blobs in GPU order', () => {
  const b = scene(10), c = b.clone()
  const order = [4, 5, 0, 1, 2, 3, 6, 7, 8, 9]
  bakeEffect(c, { ...frame, kind: 'explode', amount: 1, time: 0 }, order, 2)
  for (let i = 0; i < 10; i++) {
    const moved = c.center[i * 3] !== b.center[i * 3]
    assert.equal(moved, i === 4 || i === 5, `blob ${i}`)
  }
  // The hash seed is the GPU slot, not the blob index
  const one = b.clone(); applyEffectOne(one, 4, 0, { ...frame, kind: 'explode', amount: 1, time: 0 })
  assert.equal(one.center[12], c.center[12])
})

test('the hash spreads evenly over 0..1', () => {
  const buckets = new Array(10).fill(0)
  for (let i = 0; i < 10000; i++) buckets[Math.floor(hash01(i, 1) * 10)]++
  for (const n of buckets) assert.ok(n > 850 && n < 1150, `${buckets}`)
})

test('a .ply header that promises more than the file holds is caught before decoding', async () => {
  const { checkPlyHeader } = await import('./plyCheck.ts')
  const good = writePly(scene(10))
  assert.equal(checkPlyHeader(good, good.length), null)
  assert.equal(checkPlyHeader(good, good.length - 4), 'damaged')
  const lying = new TextEncoder().encode(new TextDecoder().decode(good.subarray(0, 400)).replace('element vertex 10', 'element vertex 2000000000'))
  assert.equal(checkPlyHeader(lying, good.length), 'damaged')
  const mesh = new TextEncoder().encode('ply\nformat binary_little_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nend_header\n')
  assert.equal(checkPlyHeader(mesh, mesh.length + 36), 'mesh')
  assert.equal(checkPlyHeader(new TextEncoder().encode('not a splat at all'), 18), 'damaged')
})
