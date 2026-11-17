import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Vec3 } from '../splat-core/blobs.ts'
import { cluster, clusterCrystals, columns, crystal, dripPlan, drips, flowstone, geode, icicles } from './forms.ts'
import { box } from './voxel.ts'
import { buildVoxels } from './voxel.ts'
import { checkScene, compileScene, sprouted, type SceneDoc } from './sceneDoc.ts'

test('a crystal is sided, comes to a point, and its chips cut into its faces', () => {
  const c = crystal({ at: [0, 0, 0], dir: [0, 1, 0], length: 1, r: 0.1, sides: 6, seed: 1 })
  assert.ok(c.sdf(0, 0.3, 0) < 0 && c.sdf(0, 0.99, 0) < 0.01 && c.sdf(0, 1.02, 0) > 0, 'up to its point')
  // six sides: a corner sticks out further than the middle of a face, all round
  const reach = Array.from({ length: 72 }, (_, k) => { let r = 0; while (c.sdf(Math.cos((k * Math.PI) / 36) * r, 0.3, Math.sin((k * Math.PI) / 36) * r) < 0) r += 0.0005; return r })
  assert.ok(Math.max(...reach) > Math.min(...reach) * 1.1, 'not round')
  assert.ok(Math.max(...reach) <= 0.1001 && Math.min(...reach) >= 0.1 * Math.cos(Math.PI / 6) - 0.001)
  // the point narrows: at 90% of its length it is thinner than at 50%
  const width = (h: number) => { let r = 0; while (c.sdf(r, h, 0) < 0) r += 0.0005; return r }
  assert.ok(width(0.9) < width(0.5) * 0.5)
  const chipped = crystal({ at: [0, 0, 0], dir: [0, 1, 0], length: 1, r: 0.1, sides: 6, chips: 6, seed: 1 })
  let lost = 0
  for (let k = 0; k < 400; k++) { const p: Vec3 = [Math.sin(k) * 0.09, (k % 97) / 100, Math.cos(k * 1.7) * 0.09]; if (c.sdf(...p) < 0 && chipped.sdf(...p) > 0) lost++ }
  assert.ok(lost > 0, 'chips take some away')
})

test('a cluster grows from one root: the middle one longest and upright, the rest leaning out and shorter', () => {
  const xs = clusterCrystals({ at: [0, 0, 0], count: 9, size: 0.6, r: 0.05, spread: 50, seed: 3 })
  assert.equal(xs.length, 9)
  assert.ok(xs[0].dir[1] > 0.99, 'the first stands up')
  const lean = (d: Vec3) => Math.acos(d[1] / Math.hypot(...d))
  const outer = xs.slice(5), inner = xs.slice(0, 3)
  assert.ok(Math.min(...outer.map((x) => lean(x.dir))) > Math.max(...inner.map((x) => lean(x.dir))) * 0.8)
  assert.ok(Math.max(...outer.map((x) => x.length)) < Math.max(...inner.map((x) => x.length)))
  for (const x of xs) assert.ok(Math.hypot(...x.at) < 0.06, 'from one root')
  const c = cluster({ at: [0, 0, 0], count: 9, size: 0.6, r: 0.05, spread: 50, seed: 3 })
  assert.ok(c.sdf(0, 0.4, 0) < 0)
})

test('a geode is broken open: rind, bands and a hollow lined with crystals pointing in', () => {
  const g = geode({ at: [0, 0, 0], r: 0.5, open: [0, 0, 1], seed: 2 })
  assert.ok(g.sdf(0, 0, -0.45) < 0, 'shell at the back')
  assert.ok(g.sdf(0, 0, 0.45) > 0, 'open at the front')
  assert.ok(g.sdf(0, 0, -0.05) > 0, 'hollow in the middle')
  // across the broken face from the outside in: the rind, then bands by turns
  const face = [0.47, 0.4, 0.36, 0.33].map((x) => g.pieceAt!([x, 0, 0.059]))
  assert.equal(face[0], 0)
  assert.ok(face.slice(1).every((id) => id === 1 || id === 2) && new Set(face.slice(1)).size === 2, `${face}`)
  // lining crystals reach in from the hollow's wall
  let lining = 0
  for (let k = 0; k < 200; k++) { const p: Vec3 = [Math.sin(k) * 0.22, Math.cos(k * 1.3) * 0.22, -0.1 - (k % 10) * 0.012]; if (g.sdf(...p) < 0 && g.pieceAt!(p) === -1) lining++ }
  assert.ok(lining > 3, `${lining}`)
})

test('basalt columns stand on a hex grid, one height a column, stepping down to the field edge', () => {
  const c = columns({ at: [0, 0, 0], r: 0.8, cell: 0.1, height: 0.6, rise: 'steps', seed: 1 })
  const topAt = (x: number, z: number) => { let y = 1; while (y > -0.1 && c.sdf(x, y, z) > 0) y -= 0.002; return y }
  assert.ok(topAt(0, 0) > topAt(0.62, 0), 'taller in the middle')
  // two points inside one column share a top and a piece; across a joint they don't
  assert.equal(c.pieceAt!([0.005, topAt(0.005, 0) - 0.01, 0]), c.pieceAt!([-0.005, topAt(-0.005, 0) - 0.01, 0.01]))
  assert.notEqual(c.pieceAt!([0, 0.1, 0]), c.pieceAt!([0.1, 0.1, 0]))
  // a joint between columns is a sliver of air
  let joints = 0
  for (let x = -0.3; x < 0.3; x += 0.001) if (c.sdf(x, 0.05, 0.013) > 0) joints++
  assert.ok(joints > 2)
  const dome = columns({ at: [0, 0, 0], r: 0.8, cell: 0.1, height: 0.6, rise: 'dome', seed: 1 })
  assert.ok(dome.sdf(0, 0.5, 0) < 0 && dome.sdf(0.65, 0.5, 0) > 0)
  // far off it never claims to be nearer than it is
  assert.ok(c.sdf(3, 0.3, 0) > 1.9)
})

test('drips hang from the roof with stalagmites under them, joined into columns where they would meet', () => {
  const s = { at: [0, 0, 0] as Vec3, r: 0.8, roof: 1, count: 30, length: 0.9, seed: 4 }
  const plan = dripPlan(s)
  assert.ok(plan.some((d) => d.joined) && plan.some((d) => !d.joined))
  const d = drips(s)
  for (const p of plan) {
    assert.ok(d.sdf(p.x, 1 - 0.02, p.z) < 0, 'hangs from the roof')
    assert.ok(d.sdf(p.x, 0.02, p.z) < 0, 'stands on the floor')
    const alone = plan.every((q) => q === p || Math.hypot(q.x - p.x, q.z - p.z) > 0.3)
    if (p.joined || alone) assert.equal(d.sdf(p.x, 0.5, p.z) < 0, p.joined, 'joined ones fill the gap, the rest leave it')
  }
})

test('flowstone hangs from its top in folds, deeper at the foot of each fold', () => {
  const f = flowstone({ at: [0, 1, 0], along: [1, 0], width: 1, drop: 0.8, folds: 4, seed: 1 })
  const foot = (u: number) => { let v = 0.01; while (v < 1 && [0, 0.05, 0.1, 0.15, 0.2, 0.25].some((w) => f.sdf(u, 1 - v, w) < 0)) v += 0.005; return v }
  const feet = Array.from({ length: 20 }, (_, i) => foot(-0.45 + i * 0.045))
  assert.ok(Math.max(...feet) > Math.min(...feet) * 1.15, `scalloped: ${feet.map((x) => x.toFixed(2))}`)
  assert.ok(Math.max(...feet) <= 0.81)
})

test('icicles hang under every downward edge of another shape, and nowhere else', () => {
  // a slab in the air: icicles round its rim, none from the middle of its underside
  const slab = box([0, 1, 0], [0.5, 0.05, 0.5])
  const ice = icicles(slab, { every: 0.05, length: 0.3, seed: 1 })
  let rim = 0, middle = 0
  for (let x = -0.55; x <= 0.55; x += 0.01) for (let z = -0.55; z <= 0.55; z += 0.01) {
    if (ice.sdf(x, 0.9, z) >= 0) continue
    if (Math.max(Math.abs(x), Math.abs(z)) > 0.4) rim++
    else middle++
  }
  assert.ok(rim > 20 && middle === 0, `${rim} at the rim, ${middle} in the middle`)
  assert.ok(ice.max[1] < 1.05 && ice.min[1] < 0.9, 'hanging down from its underside')
})

test('a sprout grows from nothing, stands and shrinks away within its time, and loops', () => {
  assert.equal(sprouted(0), 0)
  assert.equal(sprouted(0.5), 1)
  assert.ok(sprouted(0.2) > 0.2 && sprouted(0.2) < 0.8)
  assert.ok(sprouted(0.999) < 0.01)
})

const scene = (shape: unknown, paint: unknown = { kind: 'pieces', colors: ['#aaccee', '#7799bb'], line: '#334455' }): SceneDoc => ({
  name: 'Cave', loop: 4, palette: ['#101018', '#334455', '#7799bb', '#aaccee', '#f4f0e0'],
  camera: { target: [0, 0.4, 0], distance: 3, azimuth: 0, elevation: 10 },
  bones: [{ name: 'grow', at: [0, 0, 0] }],
  moves: [{ kind: 'sprout', bone: 'grow', times: 1 }],
  parts: [{ shape: { kind: 'box', at: [0, -0.05, 0], half: [1.2, 0.05, 1.2] }, paint: '#334455' }, { shape, paint, bone: 'grow' } as SceneDoc['parts'][number]],
})

test('a scene can say every formation, and the checker points at mistakes', () => {
  const shapes = [
    { kind: 'crystal', at: [0, 0, 0], dir: [0.2, 1, 0], length: 0.6, r: 0.08, chips: 2, seed: 1 },
    { kind: 'crystals', at: [0, 0, 0], count: 7, size: 0.5, r: 0.05, seed: 2 },
    { kind: 'geode', at: [0, 0.3, 0], r: 0.3, open: [0, 0, 1], seed: 3 },
    { kind: 'columns', at: [0, 0, 0], r: 0.7, cell: 0.12, height: 0.5, rise: 'dome', seed: 4 },
    { kind: 'drips', at: [0, 0, 0], r: 0.6, roof: 1, count: 12, length: 0.5, seed: 5 },
    { kind: 'flowstone', at: [0, 1, -0.5], along: [1, 0], width: 0.6, drop: 0.6, seed: 6 },
    { kind: 'icicles', on: { kind: 'box', at: [0, 1, 0], half: [0.4, 0.05, 0.4] }, every: 0.06, length: 0.25, seed: 7 },
  ]
  for (const sh of shapes) {
    const doc = scene(sh, sh.kind === 'crystal' || sh.kind === 'flowstone' ? '#aaccee' : undefined)
    assert.deepEqual(checkScene(doc), [], sh.kind)
    const built = buildVoxels(compileScene(doc).spec(0.04))
    assert.ok(Array.from(built.partOf).filter((p) => p === 1).length > 50, sh.kind)
  }
  const errs = (shape: unknown) => checkScene(scene(shape, '#aaccee')).join('; ')
  assert.match(errs({ kind: 'crystal', at: [0, 0, 0], dir: [0, 0, 0], length: 1, r: 0.1, seed: 1 }), /dir: must point somewhere/)
  assert.match(errs({ kind: 'crystals', at: [0, 0, 0], count: 90, size: 1, r: 0.1, seed: 1 }), /count: must be a whole number from 1 to 40/)
  assert.match(errs({ kind: 'columns', at: [0, 0, 0], r: 3, cell: 0.05, height: 1, seed: 1 }), /cell: is too small/)
  assert.match(errs({ kind: 'drips', at: [0, 1, 0], r: 1, roof: 0.5, count: 3, length: 1, seed: 1 }), /roof: must be above the floor/)
  assert.match(errs({ kind: 'columns', at: [0, 0, 0], r: 1, cell: 0.1, height: 1, rise: 'up', seed: 1 }), /rise: must be one of/)
  assert.match(checkScene({ ...scene(shapes[0], '#aaccee'), moves: [{ kind: 'sprout', bone: 'grow', times: -1 }] }).join(), /must be over 0 for a sprout/)
})
