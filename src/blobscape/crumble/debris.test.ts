import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs } from '../../splat-core/blobs.ts'
import { Crumble, CRUMBLE, HeightMap, breakables, copyPieces, emptyPieces, partOwners, posedCenter, propLabel, thinned, type Cut } from './debris.ts'
import type { SceneDoc } from '../../splat-engine/sceneDoc.ts'
import type { PropDoc, SceneProject } from '../../splat-engine/project.ts'

/** A small cut: a column of blobs on bone 0 standing over a slope, parts 0 and 1 the land's and 2 a prop's. */
function column(n = 40): Cut {
  const b = new Blobs(n)
  for (let i = 0; i < n; i++) b.push({ center: [0.1 * (i % 4), 0.2 + i * 0.02, 0.05 * (i % 3)], scale: [0.01, 0.01, 0.004], quat: [0, 0, 0, 1], color: [0.8, 0.3, 0.2], opacity: 0.9 })
  const joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) weights[i * 4] = 1
  const partOf = new Uint16Array(n)
  for (let i = 0; i < n; i++) partOf[i] = i < 10 ? 0 : 2
  return { blobs: b, skin: { joints, weights }, partOf }
}
const still = { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], quat: [0, 0, 0, 1], scale: [1] }
const slope = (x: number) => 0.05 * x

test('a scene of props says which prop each part came from, the land and sky belonging to none', () => {
  const part = { shape: { kind: 'ball', at: [0, 0, 0], r: 1 } } as never
  const land = { name: 'land', foot: [0, 0, 0], doc: { parts: [part, part] } } as unknown as PropDoc
  const tree = { name: 'tree', foot: [0, 0, 0], doc: { parts: [part] } } as unknown as PropDoc
  const rock = { name: 'rock', foot: [0, 0, 0], doc: { parts: [part, part, part] } } as unknown as PropDoc
  const project = { name: 'p', loop: 12, land: 'land', props: [{ prop: 'tree' }, { prop: 'rock' }] } as unknown as SceneProject
  const doc = { parts: new Array(8).fill(part) } as SceneDoc
  const own = partOwners(doc, project, (id) => ({ land, tree, rock })[id])
  assert.deepEqual([...own], [-1, -1, 0, 1, 1, 1, -1, -1])
  assert.equal(propLabel('red-nosed-reindeer'), 'red nosed reindeer')
})

test('only props with enough blobs can be broken, each with its own blobs', () => {
  const cut = column()
  const found = breakables(cut, [-1, -1, 0], ['tree'])
  assert.equal(found.length, 1)
  assert.equal(found[0].label, 'tree')
  assert.equal(found[0].blobs.length, 30)
  assert.equal(found[0].blobs[0], 10)
  assert.equal(breakables(cut, [-1, -1, 0], ['tree'], 31).length, 0)
})

test('the ground is read between the points it was asked at', () => {
  const g = new HeightMap((x) => slope(x), [-2, -2], [2, 2], -1, 33)
  assert.ok(Math.abs(g.at(0.37, 0.1) - slope(0.37)) < 1e-4)
  // off the map it keeps the edge's height
  assert.ok(Math.abs(g.at(9, 0) - slope(2)) < 1e-4)
  const holes = new HeightMap(() => NaN, [0, 0], [1, 1], -0.3, 4)
  assert.ok(Math.abs(holes.at(0.5, 0.5) + 0.3) < 1e-6)
})

test('pieces fly out, come down on the ground and lie there, then go home and the thing is whole again', () => {
  const cut = column()
  const own = breakables(cut, [-1, -1, 0], ['tree'])[0]
  const n = own.blobs.length
  const start = new Float32Array(n * 3)
  own.blobs.forEach((i, k) => posedCenter(cut, still, i, start, k * 3))
  const ground = new HeightMap((x) => slope(x), [-3, -3], [3, 3], -1)
  const span = 2, stay = 2
  const c = new Crumble(start, [0, 0.4, 0.2], 10, span, stay, ground, 4)
  const out = new Float32Array(n * 3)
  // the moment it breaks every piece is where its blob stood
  c.place(10, start, out)
  for (let k = 0; k < out.length; k++) assert.ok(Math.abs(out[k] - start[k]) < 1e-6)
  // pieces spread out from where they were
  c.place(10.3, start, out)
  let moved = 0
  for (let k = 0; k < n; k++) moved += Math.hypot(out[k * 3] - start[k * 3], out[k * 3 + 2] - start[k * 3 + 2])
  assert.ok(moved / n > 0.03, `spread ${moved / n}`)
  // just before they start home, all lie on the ground, and none ever went through it
  for (let t = 10; t < 10 + stay; t += 0.05) {
    c.place(t, start, out)
    for (let k = 0; k < n; k++) if (out[k * 3 + 1] < ground.at(out[k * 3], out[k * 3 + 2]) - 1e-3) assert.fail(`piece ${k} under the ground at ${t.toFixed(2)}`)
  }
  c.place(10 + stay - 0.01, start, out)
  for (let k = 0; k < n; k++) {
    const [x, y, z] = c.lying(k)
    if (Math.abs(out[k * 3 + 1] - y) > 1e-5 || Math.abs(y - ground.at(x, z)) > 1e-5) assert.fail(`piece ${k} is not lying on the ground`)
  }
  // home, wherever home has moved to, once the last has had its flight
  const homes = start.map((v, k) => (k % 3 === 0 ? v + 0.1 : v))
  c.place(c.done + 0.01, homes, out)
  for (let k = 0; k < out.length; k++) assert.ok(Math.abs(out[k] - homes[k]) < 1e-6)
  assert.ok(Math.abs(c.done - (10 + stay + CRUMBLE.spread + CRUMBLE.fly)) < 1e-9)
  // the lowest pieces set off first, so it builds up from its foot
  const lowFirst = c.place.bind(c)
  lowFirst(10 + stay + 0.35, homes, out)
  const nearHome = (k: number) => Math.hypot(out[k * 3] - homes[k * 3], out[k * 3 + 1] - homes[k * 3 + 1], out[k * 3 + 2] - homes[k * 3 + 2])
  assert.ok(nearHome(0) < nearHome(n - 1))
})

test('the same break gives the same pieces', () => {
  const start = new Float32Array([0, 1, 0, 0.2, 1.2, 0, -0.1, 1.1, 0.2])
  const g = new HeightMap(() => 0, [-3, -3], [3, 3], 0)
  const a = new Crumble(start, [0, 1, 0], 0, 2, 1, g, 9), b = new Crumble(start, [0, 1, 0], 0, 2, 1, g, 9)
  const oa = new Float32Array(9), ob = new Float32Array(9)
  for (const t of [0.1, 0.5, 1.4, 2.9]) { a.place(t, start, oa); b.place(t, start, ob); assert.deepEqual(oa, ob) }
})

test('pieces take their blob\'s look as posed, and a thing too big for the room left is thinned evenly', () => {
  const cut = column()
  const turned = { matrix: still.matrix, quat: [0, Math.SQRT1_2, 0, Math.SQRT1_2], scale: [2] }
  const pool = emptyPieces(50)
  assert.equal(pool.opacity[3], 0)
  copyPieces(cut, turned, [12, 13], pool, 3)
  assert.ok(Math.abs(pool.scale[3 * 3] - 0.02) < 1e-6)
  assert.ok(Math.abs(pool.opacity[4] - 0.9) < 1e-6)
  assert.ok(Math.abs(pool.quat[3 * 4 + 1] - Math.SQRT1_2) < 1e-6)
  const all = Uint32Array.from({ length: 100 }, (_, i) => i)
  const t = thinned(all, 25)
  assert.equal(t.blobs.length, 25)
  assert.equal(t.blobs[1], 4)
  assert.equal(t.grow, 1.8)
  assert.equal(thinned(all, 200).grow, 1)
})

test('the ground is the land\'s own top, holes filled from round them', () => {
  const pts: number[] = []
  for (let x = -1; x <= 1; x += 0.1) for (let z = -1; z <= 1; z += 0.1) if (Math.hypot(x, z) > 0.4) pts.push(x, slope(x), z)
  const g = HeightMap.fromPoints(new Float32Array(pts), [-1, -1], [1, 1], -2, 21)
  assert.ok(Math.abs(g.at(0.8, 0.8) - slope(0.8)) < 1e-3)
  // where a thing stood there were no land blobs: the hole takes the land round it, not the floor of the map
  assert.ok(Math.abs(g.at(0, 0)) < 0.03, `hole ${g.at(0, 0)}`)
})

test('pieces thrown toward the edge of an island land on it, not on the air past it', () => {
  const pts: number[] = []
  for (let x = -1; x <= 1; x += 0.05) for (let z = -1; z <= 1; z += 0.05) if (Math.hypot(x, z) < 1) pts.push(x, 0, z)
  const g = HeightMap.fromPoints(new Float32Array(pts), [-1, -1], [1, 1], -1, 41)
  assert.ok(g.onLand(0.5, 0.5) && !g.onLand(0.95, 0.95))
  const n = 60, start = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) start.set([0.8 + 0.001 * i, 0.3 + 0.01 * i, 0], i * 3)
  const c = new Crumble(start, [0.6, 0.4, 0], 0, 2, 3, g, 5)
  const out = new Float32Array(n * 3)
  c.place(2.9, start, out)
  let off = 0
  for (let i = 0; i < n; i++) if (!g.onLand(out[i * 3], out[i * 3 + 2])) off++
  assert.ok(off <= 3, `${off} of ${n} off the land`)
})
