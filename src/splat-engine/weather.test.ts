import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Vec3 } from '../splat-core/blobs.ts'
import { box } from './voxel.ts'
import { buildVoxels } from './voxel.ts'
import { Skeleton } from './rig.ts'
import { driftField, fallAt, frost, frostPlan, groundUnder, type DriftSpec } from './weather.ts'
import { checkScene, compileScene, type SceneDoc } from './sceneDoc.ts'

const floor = box([0, -0.05, 0], [1.5, 0.05, 1.5])
const block = box([0, 0.15, 0], [0.1, 0.15, 0.4])

test('what falls finds the ground actually under it', () => {
  assert.ok(Math.abs(groundUnder([floor, block], 0, 0, 2, -1) - 0.3) < 0.003, 'on the block')
  assert.ok(Math.abs(groundUnder([floor, block], 0.5, 0, 2, -1)) < 0.003, 'on the floor beside it')
  assert.equal(groundUnder([floor], 3, 0, 2, -1), -1, 'nothing under it')
})

test('a fall appears from nothing, lands, lies, and goes, so each life joins the next', () => {
  for (const kind of ['rain', 'snow', 'leaves'] as const) {
    assert.equal(fallAt(kind, 0).size, 0, kind)
    assert.ok(fallAt(kind, 0.9999).size < 0.01, kind)
    let was = -1, landed = false
    for (let l = 0; l < 1; l += 0.01) {
      const f = fallAt(kind, l)
      assert.ok(f.drop >= was, 'only ever goes down')
      if (landed) assert.ok(f.lying && f.drop === 1, 'stays down')
      landed ||= f.lying
      was = f.drop
    }
    assert.ok(landed, kind)
  }
  // leaves lie a while; snow settles into the snow already there, and rain is gone almost at once
  const lying = (kind: 'rain' | 'snow' | 'leaves') => Array.from({ length: 100 }, (_, i) => fallAt(kind, i / 100)).filter((f) => f.lying && f.size > 0.5).length
  assert.ok(lying('leaves') > 25 && lying('snow') >= 4 && lying('snow') < 15 && lying('rain') < 12)
})

const field = (more: Partial<DriftSpec> = {}) => driftField({ at: [0, 0, 0], half: [1.2, 1.2], depth: 0.04, wind: [1, 0], seed: 1, ...more }, (x, z) => groundUnder([floor, block], x, z, 2, -1))
const depthAt = (D: ReturnType<typeof field>, x: number, z: number) => D.depth[Math.round((z - D.z0) / D.cell) * D.nx + Math.round((x - D.x0) / D.cell)]

test('snow drifts deep on the lee side of a wall, thin on its windward side and top, and thin along a path', () => {
  const D = field()
  const lee = depthAt(D, 0.25, 0), windward = depthAt(D, -0.25, 0), open = depthAt(D, 0.9, 0.9), top = depthAt(D, 0, 0)
  assert.ok(lee > open * 2, `lee ${lee.toFixed(3)} against open ${open.toFixed(3)}`)
  assert.ok(lee > windward * 2, `lee ${lee.toFixed(3)} against windward ${windward.toFixed(3)}`)
  assert.ok(top < open, 'scoured on top')
  // the wind turned round piles it on the other side
  const back = field({ wind: [-1, 0] })
  assert.ok(depthAt(back, -0.25, 0) > depthAt(back, 0.25, 0) * 2)
  const trodden = field({ path: [[-1, 0, 0.8], [1, 0, 0.8]], pathWidth: 0.3 })
  assert.ok(depthAt(trodden, 0.9, 0.8) < depthAt(D, 0.9, 0.8) * 0.5)
})

test('a frost fern grows out from its start, branch on branch, and its stages split it', () => {
  const s = { at: [0, 0.5, 0] as Vec3, facing: [0, 0, 1] as Vec3, r: 0.3, seed: 2 }
  const all = frostPlan(s)
  assert.deepEqual(frostPlan(s), all)
  assert.ok(all.length > 60, `${all.length} strokes`)
  assert.ok(new Set(all.map((b) => b.gen)).size >= 3, 'side branches on side branches')
  for (const b of all) {
    assert.ok(Math.abs(b.to[2]) < 1e-9, 'in the surface')
    assert.ok(Math.hypot(b.to[0], b.to[1] - 0.5) <= 0.3 + 1e-9, 'within its reach')
  }
  // it grows outward: the early strokes are near the start, the late ones far
  const far = (b: (typeof all)[number]) => Math.hypot(b.to[0], b.to[1] - 0.5)
  const early = all.filter((b) => b.t < 0.2), late = all.filter((b) => b.t > 0.8)
  assert.ok(Math.max(...early.map(far)) < Math.min(...late.map(far)) + 0.1)
  // two stages hold what the whole holds
  const a = frost({ ...s, stage: [0, 0.5] }), b = frost({ ...s, stage: [0.5, 1] }), w = frost(s)
  for (const k of all) { const m = k.to; const d = Math.min(a.sdf(...m), b.sdf(...m)); assert.ok(Math.abs(d - w.sdf(...m)) < 1e-9) }
  assert.equal(w.pieceAt!(all[0].to), all[0].gen)
})

const winter = (more: Partial<SceneDoc> = {}): SceneDoc => ({
  name: 'Winter', loop: 12, palette: ['#101828', '#3a4a6a', '#8aa0c0', '#dfe8f4', '#ffffff'],
  camera: { target: [0, 0.3, 0], distance: 3, azimuth: 0, elevation: 15 },
  parts: [
    { shape: { kind: 'box', at: [0, -0.05, 0], half: [1, 0.05, 1] }, paint: '#3a4a6a' },
    { shape: { kind: 'box', at: [0, 0.15, 0], half: [0.08, 0.15, 0.4] }, paint: '#8aa0c0' },
    { shape: { kind: 'drift', at: [0, 0, 0], half: [0.95, 0.95], depth: 0.03, wind: [1, 0], seed: 1 }, paint: '#dfe8f4' },
    { shape: { kind: 'frost', at: [0, 0.15, 0.405], facing: [0, 0, 1], r: 0.12, seed: 3 }, paint: { kind: 'pieces', colors: ['#ffffff', '#dfe8f4'], ordered: true } },
  ],
  air: { specks: [{ kind: 'snow', count: 40, from: [-0.8, 0, -0.8], to: [0.8, 1.2, 0.8], colors: ['#ffffff'], land: true, wind: [0.2, 0] }] },
  ...more,
})

test('a scene can say snow lands, drifts and frost, and the checker points at mistakes', () => {
  const doc = winter()
  assert.deepEqual(checkScene(doc), [])
  const c = compileScene(doc)
  const built = buildVoxels(c.spec(0.04))
  for (const part of [2, 3]) assert.ok(Array.from(built.partOf).some((p) => p === part), `part ${part}`)
  // snow comes down on the drift, or the block's top: never through them, never hanging in the air at its lowest
  const sk = new Skeleton(c.bones)
  const flakes = c.bones.map((b, i) => (b.name.startsWith('~speck') ? i : -1)).filter((i) => i >= 0)
  const low = flakes.map(() => Infinity)
  for (let k = 0; k < 240; k++) {
    c.pose(sk, (k / 240) * doc.loop)
    flakes.forEach((b, i) => {
      if (sk.size[b] < 0.5) return
      const m = sk.matrix.subarray(b * 16, b * 16 + 16), h = c.bones[b].head
      low[i] = Math.min(low[i], m[1] * h[0] + m[5] * h[1] + m[9] * h[2] + m[13])
    })
  }
  const landed = low.filter((y) => y > 0.02 && y < 0.45)
  assert.ok(landed.length > flakes.length * 0.8, `${landed.length} of ${flakes.length} lie on something`)
  const errs = (more: Partial<SceneDoc>) => checkScene(winter(more)).join('; ')
  assert.match(errs({ air: { specks: [{ kind: 'dust', count: 4, from: [0, 0, 0], to: [1, 1, 1], colors: ['#ffffff'], land: true }] } }), /only rain, snow and leaves land/)
  assert.match(errs({ parts: [winter().parts[2], winter().parts[0]] }), /cannot come first/)
  assert.match(errs({ parts: [winter().parts[0], { shape: { kind: 'join', shapes: [winter().parts[2].shape] }, paint: '#ffffff' }] }), /must be a part's own shape/)
  assert.match(errs({ parts: [winter().parts[0], { shape: { kind: 'frost', at: [0, 0, 0], facing: [0, 0, 0], r: 0.1, seed: 1 }, paint: '#ffffff' }] }), /facing: must point somewhere/)
})
