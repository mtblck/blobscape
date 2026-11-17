import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arch, bedAt, BEDS, butte, hoodoo, land, mud, pebbleList, terrace, wornLand, type Bed, type LandSpec } from './erode.ts'
import { buildVoxels } from './voxel.ts'
import { checkScene, compileScene, type SceneDoc } from './sceneDoc.ts'

const BEDS2: Bed[] = [{ thick: 0.1, hard: 0.9 }, { thick: 0.15, hard: 0.2 }]

test('beds repeat upward', () => {
  assert.equal(bedAt(BEDS2, 0.05), 0)
  assert.equal(bedAt(BEDS2, 0.2), 1)
  assert.equal(bedAt(BEDS2, 0.3) % 2, 0)
  assert.equal(bedAt(BEDS2, 0.3), 2)
})

test('terraced rock rises in cliffs and benches: hard beds steep, soft ones a slope', () => {
  let was = 0
  const slope = (h: number) => (terrace(BEDS2, h + 0.001) - terrace(BEDS2, h)) / 0.001
  for (let h = 0; h < 1; h += 0.003) { const t = terrace(BEDS2, h); assert.ok(t >= was - 1e-12, 'never goes down'); assert.ok(t - was < 0.02, 'never jumps'); was = t }
  // within the first (hard) bed it climbs faster than within the second (soft); after the hard one it holds level
  const hardClimb = 0.1 * (1.25 - 0.9), bench = 0.1 * 0.9 * 1.4
  assert.ok(slope(hardClimb * 0.5) > slope(hardClimb + bench + 0.02) * 2)
  assert.equal(slope(hardClimb + bench * 0.5), 0)
})

const hills = (more: Partial<LandSpec> = {}): LandSpec => ({ at: [0, 0, 0], half: [1, 1], peaks: [{ at: [0, 0], h: 0.8, r: 1.1 }], noise: 0.1, seed: 3, ...more })

test('water wears gullies into the land and lays fans where it slows; the same spec wears the same', () => {
  const dry = wornLand(hills())
  const wet = wornLand(hills({ drops: 6000 }))
  assert.equal(wornLand(hills({ drops: 6000 })), wet, 'built once per spec')
  let lower = 0, higher = 0
  for (let k = 0; k < wet.height.length; k++) { if (wet.height[k] < dry.height[k] - 0.005) lower++; if (wet.height[k] > dry.height[k] + 0.005) higher++ }
  assert.ok(lower > 50 && higher > 20, `carved ${lower}, laid ${higher}`)
  // gullies: up on the hill, where the most water ran it wore the ground down
  const onHill = Array.from(wet.flow.keys()).filter((k) => dry.height[k] > 0.3).sort((p, q) => wet.flow[q] - wet.flow[p])
  const worn = onHill.slice(0, Math.ceil(onHill.length / 10)).reduce((a, k) => a + wet.height[k] - dry.height[k], 0)
  assert.ok(worn < 0, 'the wettest tenth of the hill is lower')
  assert.ok(Array.from(wet.laid).some((v) => v >= wet.thick) && Number.isFinite(wet.thick))
  for (const h of wet.height) assert.ok(h >= 0 && Number.isFinite(h))
})

test('slopes slump until they can stand, and hard beds stand steeper', () => {
  const steep = (L: ReturnType<typeof wornLand>) => {
    let m = 0
    for (let j = 0; j < L.nz; j++) for (let i = 0; i + 1 < L.nx; i++) m = Math.max(m, Math.abs(L.height[j * L.nx + i + 1] - L.height[j * L.nx + i]))
    return m / L.cell
  }
  const cliff: LandSpec = { at: [0, 0, 0], half: [1, 1], peaks: [{ at: [0, 0], h: 0.6, r: 0.4 }], seed: 1 }
  const held = wornLand({ ...cliff, slump: 1 })
  assert.ok(steep(held) < steep(wornLand(cliff)) * 0.75, 'slumped')
  assert.ok(Array.from(held.laid).some((v) => v > 0), 'scree at the foot')
  const hard = wornLand({ ...cliff, slump: 1, beds: [{ thick: 1, hard: 1 }] }), soft = wornLand({ ...cliff, slump: 1, beds: [{ thick: 1, hard: 0 }] })
  assert.ok(steep(hard) > steep(soft) * 1.5, 'hard rock stands steeper')
})

test('worn land is a shape: beds for pieces, -1 for scree', () => {
  const s = { ...hills({ drops: 4000, slump: 0.5, beds: BEDS2 }), base: 0.2 }
  const L = wornLand(s), sh = land(s)
  assert.ok(sh.sdf(0, -0.1, 0) < 0 && sh.sdf(0, L.at(0, 0) + 0.05, 0) > 0)
  assert.ok(sh.sdf(1.1, 0, 0) > 0, 'cut at its sides')
  const ids = new Set<number>()
  for (let x = -0.95; x < 0.95; x += 0.02) for (let z = -0.95; z < 0.95; z += 0.02) ids.add(sh.pieceAt!([x, L.at(x, z) - 0.005, z]))
  assert.ok(ids.has(-1) && ids.has(0) && ids.has(1))
})

test('buttes stand in ledges under a wide cap; hoodoos are waisted; an arch has a hole through it', () => {
  const b = butte({ at: [0, 0, 0], r: 0.4, height: 1, beds: BEDS2, wear: 0.4, cap: 0.2, seed: 1 })
  const reach = (y: number) => { let r = 0; while (b.sdf(r, y, 0.0001) < 0 && r < 2) r += 0.002; return r }
  assert.ok(reach(0.05) > reach(0.17), 'the hard bed stands out over the soft one above it')
  assert.ok(reach(0.97) > reach(0.8), 'the cap overhangs')
  assert.equal(b.pieceAt!([0, 0.97, 0]), BEDS2.length, 'the cap is its own piece')
  const h = hoodoo({ at: [0, 0, 0], height: 0.6, r: 0.08, seed: 2 })
  assert.ok(h.sdf(0, 0.3, 0) < 0 && h.sdf(0, 0.7, 0) > 0)
  const a = arch({ from: [-0.5, 0, 0], to: [0.5, 0, 0], height: 0.8, thick: 0.15, beds: BEDS2, seed: 3 })
  assert.ok(a.sdf(0, 0.32, 0) > 0, 'a hole in the middle')
  assert.ok(a.sdf(0, 0.72, 0) < 0, 'spanned above')
  assert.ok(a.sdf(-0.45, 0.3, 0) < 0, 'a leg each side')
})

test('mud cracks into curled plates; pebbles are biggest mid-stream', () => {
  const m = mud({ at: [0, 0, 0], r: 0.5, plate: 0.12, curl: 0.8, seed: 1 }, 0.01)
  const ids = new Set<number>()
  let cracks = 0, curled = 0
  for (let x = -0.4; x < 0.4; x += 0.005) {
    const id = m.pieceAt!([x, 0, 0.01])
    if (id < 0) cracks++; else ids.add(id)
    if (m.sdf(x, 0.012, 0.01) < 0) curled++
  }
  assert.ok(ids.size > 4 && cracks > 3, `${ids.size} plates, ${cracks} cracks`)
  assert.ok(curled > 0, 'edges curl up')
  const ps = pebbleList({ path: [[-1, 0, 0], [1, 0, 0]], width: 0.4, count: 200, size: 0.05, seed: 2 })
  const mid = ps.filter((p) => Math.abs(p.at[2]) < 0.07), side = ps.filter((p) => Math.abs(p.at[2]) > 0.14)
  const avg = (xs: typeof ps) => xs.reduce((a, p) => a + p.r[0], 0) / xs.length
  assert.ok(avg(mid) > avg(side) * 1.4)
  for (const p of ps) assert.ok(Math.abs(p.at[2]) <= 0.2 + 1e-9)
})

const scene = (shape: unknown, paint: unknown = { kind: 'pieces', colors: ['#b8542e', '#e09a5c'], line: '#7a5a3a', ordered: true }): SceneDoc => ({
  name: 'Canyon', loop: 4, palette: ['#1a0e1e', '#7a5a3a', '#b8542e', '#e09a5c', '#fbe4b8'],
  camera: { target: [0, 0.3, 0], distance: 3, azimuth: 0, elevation: 10 },
  parts: [{ shape: { kind: 'box', at: [0, -0.05, 0], half: [1.2, 0.05, 1.2] }, paint: '#7a5a3a' }, { shape, paint } as SceneDoc['parts'][number]],
})

test('a scene can say every worn-land shape, and the checker points at mistakes', () => {
  const shapes = [
    { kind: 'land', at: [0, 0, 0], half: [0.8, 0.8], peaks: [{ at: [0, 0], h: 0.5, r: 0.7 }], drops: 2000, slump: 0.4, beds: BEDS, seed: 1 },
    { kind: 'butte', at: [0, 0, 0], r: 0.3, height: 0.7, cap: 0.15, seed: 2 },
    { kind: 'hoodoo', at: [0, 0, 0], height: 0.5, r: 0.07, seed: 3 },
    { kind: 'arch', from: [-0.4, 0, 0], to: [0.4, 0, 0], height: 0.6, thick: 0.15, seed: 4 },
    { kind: 'mud', at: [0, 0.01, 0], r: 0.5, plate: 0.12, seed: 5 },
    { kind: 'pebbles', path: [[-0.6, 0.02, 0], [0.6, 0.02, 0.2]], width: 0.3, count: 40, size: 0.05, seed: 6 },
  ]
  for (const sh of shapes) {
    const doc = scene(sh)
    assert.deepEqual(checkScene(doc), [], sh.kind)
    const built = buildVoxels(compileScene(doc).spec(0.04))
    assert.ok(Array.from(built.partOf).filter((p) => p === 1).length > 30, sh.kind)
  }
  const errs = (shape: unknown) => checkScene(scene(shape)).join('; ')
  assert.match(errs({ ...shapes[0], drops: 1e6 }), /drops/)
  assert.match(errs({ ...shapes[0], beds: [{ thick: 0, hard: 2 }] }), /beds/)
  assert.match(errs({ ...shapes[3], to: [-0.4, 0, 0] }), /to/)
})

