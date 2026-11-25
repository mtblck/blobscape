import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkScene, compileScene, type SceneDoc } from './sceneDoc.ts'
import { SceneWater } from './sceneWater.ts'
import { composeScene } from './compose.ts'
import type { PropDoc, SceneProject } from './project.ts'
import { domeShape, potionColor, stirSpeed, type PotionPlan } from './potion.ts'

/** A bowl dug into a slab with a potion in it, its pool narrower than the square of ground round it. Coarse, so it works out in a moment. */
const bowl = (): SceneDoc => ({
  name: 'Potion bowl',
  loop: 4,
  palette: ['#100808', '#5a3438', '#c0208a', '#ffb0e0'],
  camera: { target: [0, 0.2, 0], distance: 4, azimuth: 20, elevation: 25 },
  parts: [{ shape: { kind: 'cut', shape: { kind: 'box', at: [0, -0.2, 0], half: [1, 0.2, 1] }, hole: { kind: 'ball', at: [0, 0, 0], r: [0.7, 0.18, 0.7] } }, paint: '#5a3438' }],
  potion: { at: [0, 0], r: 0.6, level: -0.05, cell: 0.05, bubbles: 6, pop: 0.12, rise: 0.5 },
})

// worked out once for the file: the heights, the dye and the froth through a loop
const scene = compileScene(bowl())
const brew = new SceneWater(scene, { warm: 1 })
const plan = scene.water!.potion!

test('checkScene points at each mistake in a scene\'s potion, and refuses a second pool', () => {
  assert.deepEqual(checkScene(bowl()), [])
  const bad = bowl()
  bad.potion = { at: [0, 0], r: 0.01, level: 9, colors: ['#000', 'red'] as unknown as [string, string, string, string], stir: 1.5, glow: 2 }
  const errs = checkScene(bad).join('\n')
  for (const at of ['potion.level', 'potion.r', 'potion.colors', 'potion.stir', 'potion.glow']) assert.ok(errs.includes(`${at}:`), `${at} in:\n${errs}`)
  const both = bowl()
  both.water = { level: -0.05, from: [-0.8, -0.8], to: [0.8, 0.8], color: '#2c6470' }
  assert.match(checkScene(both).join('\n'), /potion: a scene has one pool/)
})

test('a potion lies only within its round pool, and every blob of it glows', () => {
  const w = scene.water!
  assert.ok(w.wet(0, 0) && w.wet(0.4, 0))
  // the bowl's ground is under the level here, but it is past the pool's rim
  assert.ok(!w.wet(0.45, 0.45))
  assert.equal(brew.surface.glow?.length, brew.surface.blobs.count)
  assert.ok(brew.surface.glow!.every((g) => g === Math.round(plan.glow * 255)))
})

test('the stir goes round fastest partway out, still at the middle and the wall, and the other way when told', () => {
  assert.equal(stirSpeed(0, 1, 1, 4), 0)
  assert.equal(stirSpeed(1, 1, 1, 4), 0)
  assert.ok(stirSpeed(0.55, 1, 1, 4) > stirSpeed(0.2, 1, 1, 4) && stirSpeed(0.55, 1, 1, 4) > stirSpeed(0.9, 1, 1, 4))
  assert.ok(stirSpeed(0.5, 1, -1, 4) < 0)
})

test('a bubble swells into a dome that is tallest in its middle just before it pops', () => {
  assert.equal(domeShape(0, 1, 0), 0)
  assert.ok(domeShape(0, 1, 1) > domeShape(0, 1, 0.5) && domeShape(0, 1, 0.5) > 0)
  assert.ok(domeShape(0, 1, 1) > domeShape(0.5, 1, 1) && domeShape(1, 1, 1) === 0)
  // shown a moment before a bubble pops, the surface stands up over it
  const b = brew.potion!.bubbles[0]
  brew.set(b.at - plan.rise * 0.05)
  const { x0, z0, cell, nx } = scene.water!
  const k = Math.floor((b.z - z0) / cell) * nx + Math.floor((b.x - x0) / cell)
  assert.ok(brew.swell![k] > 0.5, `swell ${brew.swell![k]}`)
  brew.set(b.at + plan.rise * 0.5)
  assert.equal(brew.swell![k], 0)
})

test('the brew stays marbled, froths where bubbles pop, and its loop joins', () => {
  const n = brew.water.wet.length, wet = brew.water.wet
  let lo = 1, hi = 0, froth = 0
  for (const t of [0.3, 1.7, 3.1]) {
    brew.set(t)
    const g = brew.glowNow!
    for (let k = 0; k < n; k++) if (wet[k]) { lo = Math.min(lo, g[k]); hi = Math.max(hi, g[k]); froth = Math.max(froth, g[n + k]) }
  }
  assert.ok(hi - lo > 0.5, `dye from ${lo} to ${hi}`)
  assert.ok(froth > 0.3, `froth ${froth}`)
  brew.set(0)
  const start = brew.glowNow!.slice()
  brew.set(scene.loop - 1e-6)
  let most = 0
  for (let k = 0; k < start.length; k++) most = Math.max(most, Math.abs(brew.glowNow![k] - start[k]))
  assert.ok(most < 0.02, `the end differs from the start by ${most}`)
})

test('potionColor runs from its own color to its second, darkens in hollows and whitens with froth', () => {
  const ramp: PotionPlan['ramp'] = [[0.1, 0, 0.1], [0.5, 0.1, 0.3], [1, 0.4, 0.8], [1, 0.9, 1]]
  const near = (a: number[], b: number[]) => assert.ok(a.every((v, i) => Math.abs(v - b[i]) < 1e-9), `${a} against ${b}`)
  near(potionColor(0, 0, 0, ramp), ramp[1])
  near(potionColor(1, 0, 0, ramp), ramp[2])
  near(potionColor(0, -1, 0, ramp), ramp[0])
  assert.ok(potionColor(0, 0, 1, ramp)[1] > 0.7)
})

test('a prop\'s potion comes with it into a scene, where it was set down', () => {
  const pot: PropDoc = { name: 'Pot', foot: [0, -0.4, 0], doc: { ...bowl(), name: 'Pot' } }
  const land: PropDoc = { name: 'Floor', foot: [0, 0, 0], doc: { ...bowl(), name: 'Floor', parts: [{ shape: { kind: 'box', at: [0, -0.5, 0], half: [3, 0.1, 3] }, paint: '#5a3438' }], potion: undefined } }
  const project: SceneProject = { kind: 'blobscape-project', version: 1, name: 'Brewing', loop: 4, land: 'floor', props: [{ prop: 'pot', at: [1, -0.4, 0.5], turn: 90, size: 0.5 }] }
  const doc = composeScene(project, (id) => (id === 'pot' ? pot : id === 'floor' ? land : undefined))
  assert.ok(doc.potion)
  assert.deepEqual(doc.potion!.at.map((v) => +v.toFixed(6)), [1, 0.5])
  assert.equal(+doc.potion!.r.toFixed(6), 0.3)
  assert.equal(+doc.potion!.level.toFixed(6), -0.225)
  assert.deepEqual(checkScene(doc), [])
})
