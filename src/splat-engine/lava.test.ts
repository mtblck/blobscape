import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkScene, compileScene, type SceneDoc } from './sceneDoc.ts'
import { SceneWater } from './sceneWater.ts'
import { LavaHeat, crackAt, glowOf, lavaColor, type LavaPlan } from './lava.ts'

/** A round pool of lava dug into a slab, with one vent off its middle. Coarse, so it works out in a moment. */
const pool = (): SceneDoc => ({
  name: 'Lava pool',
  loop: 4,
  palette: ['#100808', '#5a3438', '#ff8a1e', '#fff3a8'],
  camera: { target: [0, 0.2, 0], distance: 4, azimuth: 20, elevation: 25 },
  parts: [{ shape: { kind: 'cut', shape: { kind: 'box', at: [0, -0.2, 0], half: [1, 0.2, 1] }, hole: { kind: 'ball', at: [0, 0, 0], r: [0.7, 0.18, 0.7] } }, paint: '#5a3438' }],
  lava: { level: -0.05, from: [-0.8, -0.8], to: [0.8, 0.8], cell: 0.05, cool: 1.5, flow: 0.12, vents: [{ at: [-0.2, 0], r: 0.15, wander: 0.05 }], bubbles: 4 },
})

// worked out once for the file: the heights and the heat through a loop
const scene = compileScene(pool())
const lava = new SceneWater(scene, { warm: 1 })

test('checkScene points at each mistake in a scene\'s lava, and refuses water beside it', () => {
  assert.deepEqual(checkScene(pool()), [])
  const bad = pool()
  bad.lava = { level: 9, from: [0, 0], to: [0.05, 2], colors: ['#000', 'red'] as unknown as [string, string, string, string], cool: 0, vents: [] }
  const errs = checkScene(bad).join('\n')
  for (const at of ['lava.level', 'lava.to', 'lava.colors', 'lava.cool', 'lava.vents']) assert.ok(errs.includes(`${at}:`), `${at} in:\n${errs}`)
  const both = pool()
  both.water = { level: -0.05, from: [-0.8, -0.8], to: [0.8, 0.8], color: '#2c6470' }
  assert.match(checkScene(both).join('\n'), /lava: a scene has water or lava, not both/)
})

test('lava lies in its pool as water does, and is planned with its heat', () => {
  const plan = scene.water!
  assert.ok(plan.wet(0, 0) && !plan.wet(0.9, 0.9))
  assert.ok(plan.lava && plan.lava.vents.length === 1 && plan.lava.bubbles === 4)
  assert.equal(lava.surface.glow?.length, lava.surface.blobs.count, 'every blob of it glows by itself')
})

test('rock is hot at its vent and crusts over as it spreads out', () => {
  lava.set(1.3)
  const g = lava.glowNow!, { x0, z0, cell, nx } = scene.water!
  const at = (x: number, z: number) => g[Math.floor((z - z0) / cell) * nx + Math.floor((x - x0) / cell)]
  assert.ok(at(-0.2, 0) > 0.85, `the vent glows white-hot: ${at(-0.2, 0)}`)
  assert.ok(at(0.5, 0.1) < 0.5, `far from it is crust: ${at(0.5, 0.1)}`)
})

test('the loop joins: the last kept moment runs on into the first', () => {
  const n = lava.glowNow!.length
  const first = new Float32Array(n), last = new Float32Array(n), before = new Float32Array(n)
  lava.set(0); first.set(lava.glowNow!)
  lava.set(scene.loop * (1 - 1 / lava.count)); last.set(lava.glowNow!)
  lava.set(scene.loop * (1 - 2 / lava.count)); before.set(lava.glowNow!)
  let seam = 0, step = 0
  for (let k = 0; k < n; k++) { seam = Math.max(seam, Math.abs(first[k] - last[k])); step = Math.max(step, Math.abs(last[k] - before[k])) }
  assert.ok(seam <= step * 2 + 0.05, `the step over the seam (${seam.toFixed(3)}) is no bigger than one inside the loop (${step.toFixed(3)})`)
})

test('the same plan gives the same lava, and nothing flows into the bank', () => {
  const grid = { nx: 12, nz: 12, x0: 0, z0: 0, cell: 0.1, wet: new Uint8Array(144).map((_, k) => (k % 12 > 0 && k % 12 < 11 && k > 12 && k < 132 ? 1 : 0)) }
  const plan: LavaPlan = { cool: 2, flow: 0.1, plate: 0.2, vents: [{ x: 0.6, z: 0.6, r: 0.2, wander: 0.1, times: 1, phase: 0 }], bubbles: 3, pop: 0.1, ramp: [[0, 0, 0], [0.5, 0, 0], [1, 0.5, 0], [1, 1, 0.7]] }
  const run = () => { const h = new LavaHeat(grid, plan, 4); for (let t = 0; t < 4; t += 0.1) h.step(0.1, t); return h }
  const a = run(), b = run()
  assert.deepEqual([...a.heat], [...b.heat])
  a.flowAt(1)
  for (let k = 0; k < 144; k++) {
    if (!grid.wet[k]) continue
    if (!grid.wet[k + 1]) assert.ok(a.u[k] <= 0)
    if (!grid.wet[k - 1]) assert.ok(a.u[k] >= 0)
    if (!grid.wet[k + 12]) assert.ok(a.w[k] <= 0)
    if (!grid.wet[k - 12]) assert.ok(a.w[k] >= 0)
  }
})

test('the crust breaks into plates with cracks between, which glow dull red', () => {
  let on = 0, off = 0
  for (let i = 0; i < 400; i++) { const c = crackAt(i * 0.0137, i * 0.0291, 0.1); if (c > 0.9) on++; if (c < 0.1) off++ }
  assert.ok(on > 10 && off > 200, `some points on cracks (${on}), most in plates (${off})`)
  assert.equal(glowOf(1, 0), 1)
  assert.ok(glowOf(0, 1) > 0.3 && glowOf(0, 1) < 0.45, 'a crack in cold crust glows dull red')
  const ramp: LavaPlan['ramp'] = [[0, 0, 0], [0.5, 0, 0], [1, 0.5, 0], [1, 1, 0.7]]
  assert.deepEqual(lavaColor(0, ramp), [0, 0, 0])
  assert.deepEqual(lavaColor(1, ramp), [1, 1, 0.7])
})
