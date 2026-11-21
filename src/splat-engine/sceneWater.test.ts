import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkScene, compileScene, type SceneDoc } from './sceneDoc.ts'
import { SceneWater } from './sceneWater.ts'
import { Skeleton } from './rig.ts'

/** A round pond dug into a slab, with a post standing in it, rain over it and a float going round in it. */
const pond = (): SceneDoc => ({
  name: 'Pond',
  loop: 6,
  palette: ['#101018', '#3f7a45', '#2c6470', '#f4f1e4'],
  camera: { target: [0, 0.2, 0], distance: 4, azimuth: 20, elevation: 25 },
  bones: [{ name: 'float', at: [0, -0.05, 0] }],
  parts: [
    { shape: { kind: 'cut', shape: { kind: 'box', at: [0, -0.2, 0], half: [1, 0.2, 1] }, hole: { kind: 'ball', at: [0, 0, 0], r: [0.7, 0.18, 0.6] } }, paint: '#3f7a45' },
    { shape: { kind: 'cylinder', at: [-0.3, -0.2, 0.1], height: 0.3, r: 0.08 }, paint: '#101018' },
    { shape: { kind: 'sphere', at: [0.35, -0.05, 0], r: 0.04 }, paint: '#f4f1e4', bone: 'float' },
  ],
  moves: [{ kind: 'spin', bone: 'float', axis: 'y', times: 1 }],
  air: { specks: [{ kind: 'rain', count: 12, from: [-0.9, -0.3, -0.9], to: [0.9, 2, 0.9], colors: ['#f4f1e4'], land: true }] },
  water: { level: -0.05, from: [-0.9, -0.9], to: [0.9, 0.9], color: '#2c6470', cell: 0.04, bodies: [{ bone: 'float', at: [0.35, -0.05, 0], r: 0.04 }] },
})

test('checkScene points at each mistake in a scene\'s water', () => {
  assert.deepEqual(checkScene(pond()), [])
  const bad = pond()
  bad.water = { level: 9, from: [0, 0], to: [0.05, 2], color: 'teal', cell: 0.5, ripple: 0, splash: { r: 2, depth: -1 }, bodies: [{ bone: 'nobody', at: [0, 0, 0], r: 0 }] }
  const errs = checkScene(bad).join('\n')
  for (const at of ['water.level', 'water.cell', 'water.to', 'water.color', 'water.ripple', 'water.splash.r', 'water.splash.depth', 'water.bodies[0].bone', 'water.bodies[0].r']) assert.ok(errs.includes(`${at}:`), `${at} in:\n${errs}`)
  const big = pond()
  big.water = { ...big.water!, cell: 0.012, from: [-3, -3], to: [3, 3] }
  assert.match(checkScene(big).join('\n'), /water\.cell: makes a grid of \d+ cells/)
})

test('there is water where the still ground lies under the level, and nowhere else', () => {
  const plan = compileScene(pond()).water!
  assert.ok(plan.wet(0.2, 0.2) && plan.wet(-0.5, 0), 'the hollow holds water')
  assert.ok(!plan.wet(0.95, 0) && !plan.wet(0.85, 0.85), 'the bank does not')
  assert.ok(!plan.wet(-0.3, 0.1), 'nor does the post standing in it')
  // the float moves, so it holds no water back
  assert.ok(plan.wet(0.35, 0))
  assert.equal(compileScene({ ...pond(), water: undefined }).water, undefined)
})

test('rain that lands comes down somewhere new each fall, and each drop on the water is listed where and when it lands', () => {
  const doc = pond(), c = compileScene(doc), plan = c.water!
  assert.ok(plan.drops.length > 30, `${plan.drops.length} drops`)
  for (const d of plan.drops) assert.ok(plan.wet(d.x, d.z) && d.at >= 0 && d.at < doc.loop, JSON.stringify(d))
  assert.ok(new Set(plan.drops.map((d) => `${d.x.toFixed(3)} ${d.z.toFixed(3)}`)).size > plan.drops.length * 0.9, 'drops land apart')
  // the streak is at the water, over the listed place, at the listed moment
  const sk = new Skeleton(c.bones)
  const specks = c.bones.map((b, i) => (b.name.startsWith('~speck') ? i : -1)).filter((i) => i >= 0)
  for (const d of plan.drops.slice(0, 12)) {
    c.pose(sk, d.at)
    const near = specks.some((b) => Math.hypot(sk.posedHead[b * 3] - d.x, sk.posedHead[b * 3 + 2] - d.z) < 1e-3 && Math.abs(sk.posedHead[b * 3 + 1] - plan.level) < 1e-3)
    assert.ok(near, `no streak lands at ${JSON.stringify(d)}`)
  }
  // and it still loops
  c.pose(sk, 1.3)
  const a = Float32Array.from(sk.matrix)
  c.pose(sk, 1.3 + doc.loop)
  for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - sk.matrix[i]) < 1e-4)
})

test('a scene\'s water is one loop of the real pond: rings where drops land, the same every time, joined end to start', () => {
  const doc = pond(), c = compileScene(doc)
  const w = new SceneWater(c)
  assert.ok(w.water.wetCount > 200 && w.surface.blobs.count === w.water.wetCount * 2)
  // it moves, by millimeters, and no water is made or lost
  let most = 0, net = 0
  for (let t = 0; t < doc.loop; t += 0.37) {
    w.set(t)
    let sum = 0
    for (let k = 0; k < w.water.h.length; k++) { most = Math.max(most, Math.abs(w.water.h[k])); sum += w.water.h[k] }
    net = Math.max(net, Math.abs(sum) / w.water.wetCount)
  }
  assert.ok(most > 5e-4 && most < 0.05, `heights reach ${most}`)
  assert.ok(net < most * 0.02, `the level drifts ${net}`)
  // a drop has just landed: the water there stands away from the level
  const d = c.water!.drops[3]
  w.set(d.at + 0.1)
  const near = [0, 1, 2, 3].map((q) => Math.abs(w.water.heightAt(d.x + (q & 1 ? 0.04 : -0.04), d.z + (q & 2 ? 0.04 : -0.04))))
  assert.ok(Math.max(...near) > 2e-4, `flat where a drop landed: ${near}`)
  // the same loop every time it is worked out
  w.set(2.2)
  const a = Float32Array.from(w.water.h)
  const again = new SceneWater(compileScene(pond()))
  again.set(2.2)
  assert.deepEqual(Array.from(again.water.h), Array.from(a))
  // it joins: a loop later is the same water, and just before the end is close to the start
  w.set(2.2 + doc.loop)
  for (let k = 0; k < a.length; k++) assert.ok(Math.abs(w.water.h[k] - a[k]) < 1e-9, 'a loop later is the same water')
  w.set(0)
  const start = Float32Array.from(w.water.h)
  w.set(doc.loop - 1e-3)
  let step = 0
  for (let k = 0; k < start.length; k++) step = Math.max(step, Math.abs(start[k] - w.water.h[k]))
  assert.ok(step < most * 0.05, `the seam steps ${step} of ${most}`)
})

test('what swims through the surface moves the water, and `show` shapes and colors the surface for an eye', () => {
  const dry = { ...pond(), air: undefined }
  const w = new SceneWater(compileScene(dry))
  let most = 0
  for (let t = 0; t < 6; t += 0.5) { w.set(t); for (const h of w.water.h) most = Math.max(most, Math.abs(h)) }
  assert.ok(most > 1e-4, `the float leaves no wake: ${most}`)
  const still = new SceneWater(compileScene({ ...dry, water: { ...dry.water!, bodies: [] } }))
  still.set(3)
  assert.ok(still.water.h.every((h) => h === 0), 'with no rain and nothing in it the water lies flat')
  w.show(1, [0, 2, 4])
  const b = w.surface.blobs
  let tilted = 0, lit = 0
  for (let k = 0; k < b.count; k++) { if (Math.abs(b.quat[k * 4]) < 0.7) tilted++; if (b.color[k * 3 + 2] > 0.05 && b.opacity[k] > 0.2) lit++ }
  assert.equal(lit, b.count, 'every blob of the surface is colored')
  assert.ok(tilted >= 0)
  assert.throws(() => new SceneWater(compileScene({ ...pond(), water: undefined })), /no water/)
})

test('rain from outside a scene rings its water by bands of its swarm, on top of the water as it was', () => {
  const doc = pond(), scene = compileScene(doc)
  const w = new SceneWater(scene, { warm: 1 })
  // rain laid over the scene from outside, landing on its ground and so on its water
  const over: SceneDoc = { ...doc, name: 'Rain', bones: [{ name: 'x', at: [0, 0, 0] }], parts: [{ shape: { kind: 'sphere', at: [0, 3, 0], r: 0.02 }, paint: '#f4f1e4', bone: 'x' }], moves: [], water: undefined, air: { specks: [{ kind: 'rain', count: 40, from: [-0.9, -0.3, -0.9], to: [0.9, 2, 0.9], colors: ['#f4f1e4'], land: true }] } }
  const landed = compileScene(over, { ground: scene.ground, water: scene.water!.level }).landed
  assert.ok(landed.length > 20, `${landed.length} drops land on the water`)
  assert.ok(landed.every((d) => d.share >= 0 && d.share < 1 && scene.water!.wet(d.x, d.z)))
  const heights = (rain: number) => { w.rain = rain; w.set(2.5); return Float32Array.from(w.water.h) }
  const dry = heights(0)
  w.addRain(landed, [0.4, 1])
  assert.deepEqual(heights(0), dry, 'no rain: the water as it was')
  const off = (h: Float32Array) => h.reduce((s, v, k) => s + Math.abs(v - dry[k]), 0)
  const some = off(heights(0.4)), all = off(heights(1))
  assert.ok(some > 0 && all > some, `${some} then ${all}`)
})
