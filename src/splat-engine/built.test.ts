import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Vec3 } from '../splat-core/blobs.ts'
import { arcade, bays, fallenBricks, fence, fencePosts, steps, wall, wallPlan, type WallSpec } from './built.ts'
import { box, many, sphere, union } from './voxel.ts'
import { checkScene, compileScene, type SceneDoc } from './sceneDoc.ts'
import { buildVoxels } from './voxel.ts'

const CELL = 0.03

test('many shapes made one match their union near every surface, and never overstate the distance', () => {
  const shapes = Array.from({ length: 40 }, (_, i) => (i % 2 ? sphere([Math.sin(i) * 1.5, (i % 5) * 0.2, Math.cos(i * 1.3) * 1.5], 0.05 + (i % 3) * 0.03) : box([Math.cos(i) * 1.2, 0.1, Math.sin(i * 0.7) * 1.2], [0.08, 0.05, 0.03])))
  const fast = many(shapes), slow = union(...shapes)
  let near = 0
  for (let k = 0; k < 6000; k++) {
    // half the points close round the shapes, half anywhere
    const c = shapes[k % shapes.length], j = (q: number) => Math.sin(k * q) * (k & 1 ? 0.2 : 2.6)
    const p: Vec3 = k & 1 ? [(c.min[0] + c.max[0]) / 2 + j(1.1), (c.min[1] + c.max[1]) / 2 + j(0.37), (c.min[2] + c.max[2]) / 2 + j(0.71)] : [j(1.1), j(0.37) * 0.5, j(0.71)]
    const a = fast.sdf(...p), b = slow.sdf(...p)
    assert.ok(a <= b + 1e-9, `overstates at ${p}: ${a} > ${b}`)
    if (Math.abs(b) < 0.06) { near++; assert.ok(Math.abs(a - b) < 1e-9, `differs near a surface at ${p}`) }
  }
  assert.ok(near > 200, `${near}`)
  // each shape is a piece of its own
  assert.notEqual(fast.pieceAt!([Math.cos(0) * 1.2, 0.1, 0]), fast.pieceAt!([Math.cos(2) * 1.2, 0.1, Math.sin(1.4) * 1.2]))
})

const WALL: WallSpec = { from: [-1, 0, 0], to: [1, 0, 0], height: 0.8, thick: 0.14, brick: [0.16, 0.08], jitter: 0.5, seed: 4 }

test('a wall is whole bricks in courses, every other course shifted half a brick, with mortar sunk between', () => {
  const plan = wallPlan(WALL)
  assert.equal(plan.rows, 10)
  assert.equal(plan.cols, Math.round(2 / 0.16))
  assert.ok(Math.abs(plan.bl * plan.cols - 2) < 1e-9 && Math.abs(plan.bh * plan.rows - 0.8) < 1e-9, 'fitted to the wall')
  assert.deepEqual(plan.span(1, 0), [0, plan.bl / 2], 'a half brick at the end of a shifted course')
  const w = wall(WALL, CELL)
  // in the middle of a brick, inside; on the face where two bricks meet, the mortar is sunk, so outside
  const u = plan.bl * 3.5 - 1, v = plan.bh * 2.5
  assert.ok(w.sdf(u, v, 0.05) < 0)
  assert.ok(w.sdf(plan.bl * 3 - 1 + 0.002, v, 0.055) > 0, 'the joint is sunk')
  assert.ok(w.sdf(plan.bl * 3 - 1 + 0.002, v, 0) < 0, 'with mortar behind it')
  assert.equal(w.pieceAt!([plan.bl * 3 - 1 + 0.001, v, 0.06]), -1, 'a joint is drawn as mortar')
  assert.notEqual(w.pieceAt!([u, v, 0.06]), w.pieceAt!([u + plan.bl, v, 0.06]), 'neighbors are different bricks')
  assert.ok(w.sdf(0, 0.9, 0) > 0 && w.sdf(0, 0.79, 0) < 0, 'as tall as asked')
  // a far point is never nearer than it really is
  assert.ok(w.sdf(0, 3, 0) >= 2.15 && w.sdf(0, 3, 0) <= 2.21)
})

test('a ruined wall loses its top in a ragged line, some bricks are gone from the face, and fallen bricks lie at its foot', () => {
  const spec = { ...WALL, ruin: 0.8, missing: 0.2, fallen: 20 }
  const plan = wallPlan(spec)
  const tops = Array.from({ length: plan.cols }, (_, c) => { let j = 0; while (j < plan.rows && plan.state(j, c) > 0) j++; return j })
  assert.ok(Math.min(...tops) < plan.rows * 0.6 && Math.max(...tops) > Math.min(...tops) + 2, `a ragged top: ${tops}`)
  let holes = 0, all = 0
  for (let j = 1; j < plan.rows; j++) for (let c = 0; c < plan.cols; c++) { const st = plan.state(j, c); if (st > 0) { all++; if (st === 1) holes++ } }
  assert.ok(holes / all > 0.1 && holes / all < 0.3, `${holes} of ${all} gone from the face`)
  const fallen = fallenBricks(spec)
  assert.equal(fallen.length, 20)
  for (const b of fallen) {
    assert.ok(b.min[1] > -0.02 && b.min[1] < 0.02, `lies on the ground: ${b.min[1]}`)
    const mid = (b.min[2] + b.max[2]) / 2
    assert.ok(Math.abs(mid) > 0.07, 'off the wall, beside it')
  }
  // and the same seed gives the same ruin
  assert.deepEqual(wallPlan(spec).span(3, 2), plan.span(3, 2))
  assert.deepEqual(fallenBricks(spec).map((b) => b.min), fallen.map((b) => b.min))
})

test('steps climb a rise a step, each block its own, noses worn round and treads hollowed in the middle', () => {
  const s = steps({ at: [0, 0, 0], dir: [0, -1], count: 4, rise: 0.1, run: 0.2, width: 0.6, wear: 0.8, seed: 1 })
  for (let k = 0; k < 4; k++) {
    const z = -(k + 0.7) * 0.2
    assert.ok(s.sdf(0.25, (k + 1) * 0.1 - 0.02, z) < 0 && s.sdf(0.25, (k + 1) * 0.1 + 0.02, z) > 0, `step ${k} tops out near its rise`)
  }
  // the very corner of a nose is worn away
  assert.ok(s.sdf(0.25, 0.098, -0.002) > 0)
  // the middle of a tread is lower than its edge
  const top = (x: number) => { let y = 0.3; while (s.sdf(x, y, -0.25) > 0) y -= 0.001; return y }
  assert.ok(top(0) < top(0.27) - 0.005, `hollowed: ${top(0)} vs ${top(0.27)}`)
  assert.notEqual(s.pieceAt!([0, 0.05, -0.1]), s.pieceAt!([0, 0.15, -0.3]))
})

test('a fence fits whole bays to every run, so a post stands at every corner, and wears down by its seed', () => {
  const path: Vec3[] = [[0, 0, 0], [1, 0, 0], [1, 0, 0.7]]
  const posts = bays(path, 0.3)
  assert.equal(posts.length, 1 + 3 + 2)
  assert.deepEqual(posts[3], [1, 0, 0])
  assert.deepEqual(posts[posts.length - 1], [1, 0, 0.7])
  const spec = { path, bay: 0.3, height: 0.4, post: 0.03, rails: 2, lean: 1, missing: 0, sag: 0, seed: 2 }
  const leaned = fencePosts(spec).filter((p) => Math.hypot(p.top[0] - p.foot[0], p.top[2] - p.foot[2]) > 0.01)
  assert.ok(leaned.length >= 3, 'posts lean')
  const f = fence(spec, CELL)
  // a whole rail runs between every pair of posts
  const a = posts[1], b = posts[2]
  assert.ok(f.sdf((a[0] + b[0]) / 2, 0.4 * 0.3, (a[2] + b[2]) / 2) < 0.02)
  const gone = fence({ ...spec, missing: 1, lean: 0 }, CELL)
  assert.ok(gone.sdf((a[0] + b[0]) / 2, 0.4 * 0.9, 0) > 0.01, 'with every rail missing, nothing spans the top')
})

test('an arcade cuts a whole number of openings with a pillar between, and wedge stones round each arch', () => {
  const a = arcade({ from: [0, 0, 0], to: [3, 0, 0], height: 1.5, thick: 0.2, bays: 3, pillar: 0.2, spring: 0.8, arch: 'round' }, CELL)
  for (const u of [0.5, 1.5, 2.5]) assert.ok(a.sdf(u, 0.5, 0) > 0 && a.sdf(u, 1.15, 0) > 0, `an opening at ${u}`)
  for (const u of [0.02, 1, 2, 2.98]) assert.ok(a.sdf(u, 0.5, 0) < 0, `a pillar at ${u}`)
  assert.ok(a.sdf(1.5, 1.45, 0) < 0, 'wall over the arch')
  const ring = a.pieceAt!([1.5 + Math.cos(1) * 0.5, 0.8 + Math.sin(1) * 0.55, 0.1]), ring2 = a.pieceAt!([1.5 + Math.cos(2) * 0.5, 0.8 + Math.sin(2) * 0.55, 0.1])
  assert.ok(ring >= 1000 && ring2 >= 1000 && ring !== ring2, 'wedges round the arch')
  const ruined = arcade({ from: [0, 0, 0], to: [3, 0, 0], height: 1.5, thick: 0.2, bays: 3, pillar: 0.2, spring: 0.8, ruin: 1, seed: 1 }, CELL)
  const left = [0.1, 0.6, 1.1, 1.6, 2.1, 2.6].filter((u) => ruined.sdf(u, 1.45, 0) < 0).length
  assert.ok(left < 6, 'a ruined top')
  for (const u of [0.02, 1, 2]) assert.ok(ruined.sdf(u, 0.75, 0) < 0, 'never below the arches')
})

const scene = (shape: unknown, paint: unknown = { kind: 'pieces', colors: ['#aa6655', '#885544'], line: '#333333' }): SceneDoc => ({
  name: 'Ruin', loop: 4, palette: ['#101018', '#333333', '#885544', '#aa6655', '#f4f0e0'],
  camera: { target: [0, 0.4, 0], distance: 3, azimuth: 0, elevation: 10 },
  parts: [{ shape: { kind: 'box', at: [0, -0.05, 0], half: [1.2, 0.05, 1.2] }, paint: '#333333' }, { shape, paint } as SceneDoc['parts'][number]],
})

test('a scene can say walls, steps, fences and arcades, painted brick by brick, and the checker points at mistakes', () => {
  const shapes = [
    { kind: 'wall', from: [-1, 0, 0], to: [1, 0, 0.2], height: 0.6, thick: 0.12, ruin: 0.6, missing: 0.1, fallen: 8, seed: 1 },
    { kind: 'steps', at: [0, 0, 0.5], dir: [0, -1], count: 3, rise: 0.08, run: 0.14, width: 0.5, wear: 0.6, seed: 2 },
    { kind: 'fence', path: [[-1, 0, 0.8], [1, 0, 0.8]], bay: 0.3, height: 0.35, post: 0.025, rails: 2, lean: 0.5, missing: 0.3, sag: 0.5, seed: 3 },
    { kind: 'arcade', from: [-1, 0, -0.5], to: [1, 0, -0.5], height: 1, thick: 0.15, bays: 3, pillar: 0.15, arch: 'pointed', ruin: 0.5, seed: 4 },
  ]
  for (const sh of shapes) {
    const doc = scene(sh)
    assert.deepEqual(checkScene(doc), [], sh.kind)
    const built = buildVoxels(compileScene(doc).spec(0.04))
    const colors = new Set<string>()
    for (let i = 0; i < built.blobs.count; i++) if (built.partOf[i] === 1) colors.add(Array.from(built.blobs.color.subarray(i * 3, i * 3 + 3), (c) => c.toFixed(2)).join())
    assert.ok(colors.size > 8, `${sh.kind} is lit and painted piece by piece: ${colors.size} colors`)
  }
  const errs = (shape: unknown, paint?: unknown) => checkScene(scene(shape, paint)).join('; ')
  assert.match(errs({ kind: 'wall', from: [0, 0, 0], to: [0, 0, 0], height: 1, thick: 0.1, seed: 1 }), /parts\[1\]\.shape\.to: must be apart/)
  assert.match(errs({ kind: 'wall', from: [0, 0, 0], to: [1, 0, 0], height: 1, thick: 0.1, missing: 0.8, seed: 1 }), /missing: must be from 0 to 0.5/)
  assert.match(errs({ kind: 'steps', at: [0, 0, 0], dir: [0, 0], count: 3, rise: 0.1, run: 0.1, width: 0.5, seed: 1 }), /dir: must point/)
  assert.match(errs({ kind: 'fence', path: [[0, 0, 0]], bay: 0.3, height: 0.3, post: 0.02, rails: 2, seed: 1 }), /path: must be a list of 2 to 16/)
  assert.match(errs({ kind: 'arcade', from: [-1, 0, 0], to: [1, 0, 0], height: 1, thick: 0.1, bays: 4, pillar: 0.6 }), /pillar: leaves no room/)
  assert.match(errs({ kind: 'sphere', at: [0, 0, 0], r: 0.3 }), /pieces paints a shape made of pieces only/)
  assert.deepEqual(checkScene(scene({ kind: 'cut', shape: shapes[0], hole: { kind: 'box', at: [0, 0.2, 0], half: [0.2, 0.2, 0.3] } })), [], 'a doorway cut through a wall keeps its bricks')
  // a path whose points repeat would make a rail of no length
  assert.match(checkScene(scene({ kind: 'fence', path: [[0, 0, 0], [0, 0, 0]], bay: 0.3, height: 0.3, post: 0.03, rails: 2, seed: 1 })).join(), /must be apart from the point before it/)
})
