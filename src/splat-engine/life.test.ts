import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Vec3 } from '../splat-core/blobs.ts'
import { antler, brackets, brain, cactus, cactusArms, colonize, horn, hornPath, ribs, rosette, shell, shellCoil, tree } from './life.ts'
import type { Shape } from './voxel.ts'
import { checkScene, compileScene, type SceneDoc } from './sceneDoc.ts'
import { buildVoxels } from './voxel.ts'

/** A shape's distance never claims more room than there is: nothing within it is on the other side of the surface. */
function honest(s: Shape, label: string) {
  let seed = 7
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const at = (k: number) => s.min[k] + (s.max[k] - s.min[k]) * (r() * 1.2 - 0.1)
  for (let i = 0; i < 300; i++) {
    const p: Vec3 = [at(0), at(1), at(2)], d = s.sdf(...p)
    for (let k = 0; k < 16; k++) {
      const u: Vec3 = [r() - 0.5, r() - 0.5, r() - 0.5], l = Math.hypot(...u) || 1, m = Math.abs(d) * 0.97 * r()
      const q: Vec3 = [p[0] + (u[0] / l) * m, p[1] + (u[1] / l) * m, p[2] + (u[2] / l) * m]
      assert.ok(Math.sign(s.sdf(...q)) === Math.sign(d) || Math.abs(d) < 1e-9, `${label}: the distance at ${p.map((v) => v.toFixed(3))} is overstated`)
    }
  }
}

test('a tree grown by space colonization keeps the pipe rule and fills its crown', () => {
  const spec = { at: [0, 0, 0] as Vec3, height: 0.3, crown: [0.4, 0.25, 0.4] as Vec3, r: 0.05, points: 120, seed: 4 }
  const { nodes, ends } = colonize(spec)
  assert.deepEqual(colonize(spec), { nodes, ends }, 'the same seed grows the same tree')
  assert.ok(Math.abs(nodes[0].r - 0.05) < 1e-9, 'the foot is r')
  assert.ok(ends.length > 15, `a crown of many limbs (${ends.length})`)
  // as thick as what it carries: a limb's radius to the 2.5 is the sum of its children's
  const kids = nodes.map((): number[] => [])
  nodes.forEach((m, i) => { if (m.parent >= 0) kids[m.parent].push(i) })
  for (let i = 0; i < nodes.length; i++) if (kids[i].length) {
    const sum = kids[i].reduce((a, k) => a + nodes[k].r ** 2.5, 0)
    assert.ok(Math.abs(nodes[i].r ** 2.5 - sum) < 1e-9 * Math.max(1, sum))
  }
  // the ends reach out into the crown, not just up the middle
  const out = ends.map((i) => Math.hypot(nodes[i].p[0], nodes[i].p[2]))
  assert.ok(Math.max(...out) > 0.25)
  for (const i of ends) assert.ok(nodes[i].p[1] > spec.height * 0.8, 'ends are up in the crown')
  const t = tree({ ...spec, leaves: 0.04 })
  assert.ok(t.sdf(0, 0.05, 0) < 0, 'the trunk')
  assert.ok(tree({ ...spec, leaves: 0.04, only: 'leaves' }).sdf(0, 0.05, 0) > 0, 'leaves alone have no trunk')
  honest(t, 'tree')
})

test('a cactus is ribbed and its arms bend up', () => {
  const s = { at: [0, 0, 0] as Vec3, height: 1, r: 0.1, ribs: 8, arms: 2, seed: 1 }
  const c = cactus(s)
  assert.ok(c.sdf(0, 0.5, 0) < 0 && c.sdf(0, 1.05, 0) > 0)
  const reach = Array.from({ length: 64 }, (_, k) => { let r = 0; const a = (k / 64) * Math.PI * 2; while (c.sdf(Math.cos(a) * r, 0.15, Math.sin(a) * r) < 0) r += 0.0005; return r })
  assert.ok(Math.max(...reach) > Math.min(...reach) * 1.08, 'ribs and grooves')
  const arms = cactusArms(s)
  assert.equal(arms.length, 2)
  for (const a of arms) { assert.ok(a[3][1] > a[1][1], 'arms rise'); assert.ok(c.sdf(...a[2]) < 0) }
  honest(c, 'cactus')
})

test('a shell grows by the same share each turn', () => {
  const { radii, points } = shellCoil({ at: [0, 0, 0], size: 0.4, turns: 3 })
  for (let i = 0; i + 24 < radii.length; i += 7) assert.ok(Math.abs(radii[i + 24] / radii[i] - 2.4) < 0.01)
  // the outer whorl wraps the inner ones: the last point is furthest out
  const far = points.map((p) => Math.hypot(...p))
  assert.equal(far.indexOf(Math.max(...far)), far.length - 1)
  const sh = shell({ at: [0, 0, 0], size: 0.4, turns: 3 })
  const ids = new Set<number>()
  for (const p of points) if (sh.sdf(...p) < 0) ids.add(sh.pieceAt!(p))
  assert.ok(ids.size > 4, 'bands along the coil')
  honest(sh, 'shell')
  honest(shell({ at: [0, 0, 0], size: 0.4, turns: 3, spire: 0.8 }), 'whelk')
})

test('a horn runs its length, curls round and tapers', () => {
  const straight = hornPath({ at: [0, 0, 0], dir: [1, 0, 0], length: 1, r: 0.1, curl: 0, twist: 0 })
  const end = straight.points.at(-1)!
  assert.ok(Math.abs(end[0] - 1) < 1e-6 && Math.abs(end[1]) < 1e-6)
  const ram = hornPath({ at: [0, 0, 0], dir: [1, 0, 0], length: 1, r: 0.1, curl: 1, twist: 0 })
  assert.ok(Math.hypot(...ram.points.at(-1)!) < 0.05, 'a full curl comes back round')
  assert.ok(Math.min(...ram.points.map((p) => p[1])) < -0.2, 'it curls down')
  assert.ok(ram.radii.at(-1)! < ram.radii[0] * 0.2, 'tapers')
  const twisted = hornPath({ at: [0, 0, 0], dir: [1, 0, 0], length: 1, r: 0.1, curl: 1, twist: 0.4 })
  assert.ok(Math.abs(twisted.points.at(-1)![2]) > 0.1, 'twist winds it sideways')
  honest(horn({ at: [0, 0, 0], dir: [1, 0.5, 0], length: 0.5, r: 0.05, curl: 0.9, twist: 0.3, ridges: 12 }), 'horn')
})

test('antlers, ribs, rosettes, brackets and brain coral hold together', () => {
  const a = antler({ at: [0, 0, 0], dir: [0.3, 1, -0.3], length: 0.6, r: 0.03, tines: 4, seed: 2 })
  assert.ok(a.sdf(0, 0.01, 0) < 0)
  honest(a, 'antler')
  const rb = ribs({ from: [0, 0.2, 0], to: [1, 0.2, 0], count: 5, span: 0.3, drop: 0.2, r: 0.02 })
  assert.ok(rb.sdf(0.5, 0.2, 0) < 0, 'the spine')
  // ribs reach out both sides alike, and down
  let l = 0, r = 0
  for (let z = 0; z < 0.4; z += 0.002) for (let y = -0.1; y < 0.3; y += 0.004) { if (rb.sdf(0.5, y, z) < 0) r = Math.max(r, z); if (rb.sdf(0.5, y, -z) < 0) l = Math.max(l, z) }
  assert.ok(Math.abs(l - r) < 0.005 && r > 0.2)
  honest(rb, 'ribs')
  const ro = rosette({ at: [0, 0, 0], r: 0.2, leaves: 21, seed: 1 })
  assert.ok(ro.sdf(0, 0.03, 0) < 0)
  honest(ro, 'rosette')
  const br = brackets({ at: [0, 0, 0], facing: [1, 0], count: 4, r: 0.1, seed: 1 })
  assert.ok(br.sdf(0.05, 0.005, 0) < 0 && br.sdf(-0.05, 0.005, 0) > 0, 'shelves stand out one side')
  honest(br, 'brackets')
  const b = brain({ at: [0, 0, 0], r: 0.3, seed: 1 })
  assert.ok(b.sdf(0, 0, 0) < 0 && b.sdf(0, 0.4, 0) > 0)
})

const scene = (shape: unknown, paint: unknown = '#88aa55'): SceneDoc => ({
  name: 'Desert', loop: 4, palette: ['#101018', '#3e5a30', '#88aa55', '#e8d8c8', '#f4f0e0'],
  camera: { target: [0, 0.3, 0], distance: 3, azimuth: 0, elevation: 10 },
  parts: [{ shape: { kind: 'box', at: [0, -0.05, 0], half: [1.2, 0.05, 1.2] }, paint: '#3e5a30' }, { shape, paint } as SceneDoc['parts'][number]],
})

test('a scene can say every living form, and the checker points at mistakes', () => {
  const shapes = [
    { kind: 'tree', at: [0, 0, 0], height: 0.25, crown: [0.3, 0.2, 0.3], r: 0.04, points: 80, leaves: 0.04, seed: 1 },
    { kind: 'cactus', at: [0, 0, 0], height: 0.6, r: 0.06, arms: 2, seed: 2 },
    { kind: 'rosette', at: [0, 0, 0], r: 0.2, leaves: 18, seed: 3 },
    { kind: 'brackets', at: [0, 0.2, 0], facing: [0, 1], r: 0.15, count: 3, seed: 4 },
    { kind: 'brain', at: [0, 0, 0], r: 0.3, seed: 5 },
    { kind: 'shell', at: [0, 0.15, 0], size: 0.4, turns: 3, spire: 0.3 },
    { kind: 'horn', at: [0, 0.1, 0], dir: [1, 0.5, 0], length: 0.5, r: 0.05, curl: 0.9, twist: 0.3 },
    { kind: 'antler', at: [0, 0, 0], dir: [0.3, 1, 0], length: 0.6, r: 0.03, tines: 4, seed: 6 },
    { kind: 'ribs', from: [-0.4, 0.2, 0], to: [0.4, 0.2, 0], count: 6, span: 0.2, drop: 0.15, r: 0.015 },
  ]
  for (const sh of shapes) {
    const doc = scene(sh)
    assert.deepEqual(checkScene(doc), [], sh.kind)
    const built = buildVoxels(compileScene(doc).spec(0.04))
    assert.ok(Array.from(built.partOf).filter((p) => p === 1).length > 30, sh.kind)
  }
  const errs = (shape: unknown) => checkScene(scene(shape)).join('; ')
  assert.match(errs({ ...shapes[0], only: 'roots' }), /only: must be 'limbs' or 'leaves'/)
  assert.match(errs({ ...shapes[1], arms: 9 }), /arms/)
  assert.match(errs({ ...shapes[6], dir: [0, 0, 0] }), /dir: must point somewhere/)
  assert.match(errs({ ...shapes[7], tines: 0 }), /tines/)
})
