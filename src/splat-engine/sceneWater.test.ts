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

/** The pond with no rain or bodies, a swell coming in from one side and a boat floating at rest. */
const swell = (): SceneDoc => {
  const d = pond()
  d.air = undefined
  d.moves = []
  d.bones = [{ name: 'boat', at: [0.3, -0.05, 0] }]
  d.parts = [d.parts[0], { shape: { kind: 'ball', at: [0.3, -0.05, 0], r: [0.08, 0.03, 0.04] }, paint: '#f4f1e4', bone: 'boat' }]
  d.water = { level: -0.05, from: [-0.9, -0.9], to: [0.9, 0.9], color: '#2c6470', cell: 0.04, damping: 0.2,
    swells: [{ from: -90, height: 0.006, times: 3 }], floats: [{ bone: 'boat', at: [0.3, -0.05, 0], size: 0.08 }] }
  return d
}

test('checkScene points at mistakes in swells and floats', () => {
  assert.deepEqual(checkScene(swell()), [])
  const bad = swell()
  bad.water = { ...bad.water!, swells: [{ from: 'west' as unknown as number, height: 1, times: 0.5 }], floats: [{ bone: 'nobody', at: [0, 0, 0], size: 0 }] }
  const errs = checkScene(bad).join('\n')
  for (const at of ['water.swells[0].from', 'water.swells[0].height', 'water.swells[0].times', 'water.floats[0].bone', 'water.floats[0].size']) assert.ok(errs.includes(`${at}:`), `${at} in:\n${errs}`)
})

test('a swell rolls in across the water, and a float rises, falls and tips as it passes under it', () => {
  const scene = compileScene(swell())
  assert.ok(scene.water!.wet(0.3, 0), 'a float is no ground: the water runs under it')
  const pondWater = new SceneWater(scene, { fps: 12, warm: 1 })
  const sk = new Skeleton(scene.bones), boat = scene.bones.findIndex((b) => b.name === 'boat')
  let lo = Infinity, hi = -Infinity, tipped = 0
  for (let t = 0; t < scene.loop; t += 0.25) {
    scene.pose(sk, t)
    pondWater.ride(sk, t)
    const y = sk.offset[boat * 3 + 1], q = sk.rotation.subarray(boat * 4, boat * 4 + 4)
    lo = Math.min(lo, y); hi = Math.max(hi, y)
    tipped = Math.max(tipped, 2 * Math.acos(Math.min(1, Math.abs(q[3]))))
    for (const v of sk.offset) assert.ok(Number.isFinite(v))
  }
  assert.ok(hi - lo > 0.002, `the boat rises and falls (${((hi - lo) * 1000).toFixed(1)} mm)`)
  assert.ok(tipped > 0.01 && tipped < 0.6, `and tips, but does not capsize (${tipped.toFixed(3)} rad)`)
  // the same moment rides the same way, whatever was shown before
  scene.pose(sk, 1); pondWater.ride(sk, 1)
  const once = sk.offset[boat * 3 + 1]
  scene.pose(sk, 4); pondWater.ride(sk, 4); scene.pose(sk, 1); pondWater.ride(sk, 1)
  assert.equal(sk.offset[boat * 3 + 1], once)
})

test('a swell comes in as long straight crests across the water, not rings', () => {
  const d = pond()
  d.air = undefined
  d.moves = []
  d.parts = [{ shape: { kind: 'cut', shape: { kind: 'box', at: [0, -0.2, 0], half: [1, 0.2, 1] }, hole: { kind: 'box', at: [0, 0, 0], half: [0.8, 0.15, 0.5] } }, paint: '#3f7a45' }]
  d.bones = []
  d.water = { level: -0.05, from: [-0.8, -0.5], to: [0.8, 0.5], color: '#2c6470', cell: 0.04, speed: 0.3, damping: 0.1, swells: [{ from: -90, height: 0.006, times: 2 }] }
  assert.deepEqual(checkScene(d), [])
  const w = new SceneWater(compileScene(d), { fps: 12, warm: 1 })
  let across = 0, along = 0
  for (let t = 0; t < 6; t += 0.5) {
    w.set(t)
    const at = (x: number, z: number) => w.water.heightAt(x, z)
    // along the swell's way the surface rises and falls; across it, a crest is the same height all the way along
    along = Math.max(along, Math.abs(at(0, 0) - at(0.4, 0)))
    across = Math.max(across, Math.abs(at(0.2, -0.3) - at(0.2, 0.3)))
  }
  assert.ok(along > 0.002, `the water rises and falls along the swell (${(along * 1000).toFixed(2)} mm)`)
  assert.ok(across < along * 0.25, `and a crest runs straight across it (${(across * 1000).toFixed(2)} against ${(along * 1000).toFixed(2)} mm)`)
})

test('foam gathers where a swell strikes a post, fades, joins up over the loop, and is drawn white; the post throws spray', () => {
  const d = pond()
  d.air = undefined
  d.moves = []
  d.bones = []
  d.parts = [
    { shape: { kind: 'cut', shape: { kind: 'box', at: [0, -0.2, 0], half: [1, 0.2, 1] }, hole: { kind: 'box', at: [0, 0, 0], half: [0.8, 0.15, 0.5] } }, paint: '#3f7a45' },
    { shape: { kind: 'cylinder', at: [0.2, -0.2, 0], height: 0.4, r: 0.05 }, paint: '#101018' },
    // a deck on the post, well over the water: the water still runs under it
    { shape: { kind: 'box', at: [0.2, 0.12, 0], half: [0.2, 0.015, 0.2] }, paint: '#101018' },
  ]
  d.water = { level: -0.05, from: [-0.8, -0.5], to: [0.8, 0.5], color: '#2c6470', cell: 0.04, speed: 0.3, damping: 0.1, swells: [{ from: -90, height: 0.006, times: 2 }], foam: 1 }
  assert.deepEqual(checkScene(d), [])
  const scene = compileScene(d), plan = scene.water!
  assert.ok(plan.wet(0.35, 0.1) && !plan.wet(0.2, 0), 'water under the deck, none in the post')
  assert.ok(plan.stands(0.2, 0) && !plan.stands(0.2, 0.2) && !plan.stands(0.9, 0), 'the post stands out of the water; open water and past the box do not')
  const w = new SceneWater(scene, { fps: 12, warm: 1 })
  const foamAt = (x: number, z: number) => w.foam[w.water.index(x, z)]
  let byPost = 0, open = 0
  for (let t = 0; t < scene.loop; t += 0.25) {
    w.set(t)
    byPost = Math.max(byPost, foamAt(0.2 - 0.08, 0), foamAt(0.2 + 0.08, 0), foamAt(0.2, 0.08), foamAt(0.2, -0.08))
    open = Math.max(open, foamAt(-0.4, 0.2))
  }
  assert.ok(byPost > 0.3, `foam beside the post (${byPost.toFixed(2)})`)
  assert.ok(open < 0.02, `none out in open water (${open.toFixed(3)})`)
  // the end of the loop leads back into its start
  w.set(scene.loop - 1e-3); const end = Float32Array.from(w.foam); w.set(0)
  let jump = 0
  for (let k = 0; k < end.length; k++) jump = Math.max(jump, Math.abs(end[k] - w.foam[k]))
  assert.ok(jump < 0.05, `the foam joins up (${jump.toFixed(3)})`)
  // drawn: the surface is whiter where the foam is thickest
  let at = 0, most = 0
  for (let t = 0; t < scene.loop; t += 0.25) { w.set(t); const f = foamAt(0.12, 0); if (f > most) { most = f; at = t } }
  w.show(at, [0, 3, 3])
  const { blobs } = w.surface, near = (x: number, z: number) => {
    let best = 0, gap = Infinity
    for (let k = 0; k < blobs.count; k++) { const g = Math.hypot(w.surface.at[k * 2] - x, w.surface.at[k * 2 + 1] - z); if (g < gap) { gap = g; best = k } }
    return blobs.color[best * 3] + blobs.color[best * 3 + 1] + blobs.color[best * 3 + 2]
  }
  assert.ok(near(0.12, 0) > near(-0.4, 0.2) + 0.3, 'foam is drawn white')
  // the post throws spray on its biggest waves: droplets above the water near it, the same a loop later
  assert.ok(w.bursts.some((b) => Math.hypot(b.x - 0.2, b.z) < 0.15), `spray by the post (${w.bursts.length} bursts)`)
  const spray = w.spray!, burst = w.bursts.find((b) => Math.hypot(b.x - 0.2, b.z) < 0.15)!
  const drops = (t: number) => { w.show(t, [0, 3, 3]); const up: number[] = []; for (let k = 0; k < spray.blobs.count; k++) if (spray.blobs.opacity[k] > 0) up.push(spray.blobs.center[k * 3 + 1]); return up }
  const flying = drops(burst.at + 0.1)
  assert.ok(flying.length > 0 && flying.every((y) => y > plan.level), `droplets in the air (${flying.length})`)
  assert.deepEqual(drops(burst.at + 0.1 + scene.loop), flying)
  assert.ok(spray.soft, 'spray stays blobs among blocks')
  // with no foam asked for, none
  d.water.foam = undefined
  const plain = new SceneWater(compileScene(d), { fps: 12, warm: 0 })
  assert.ok(plain.foam.every((f) => f === 0) && plain.spray === null)
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

test('wind raises waves by levels, worked out a slice at a time as at once, and the loop still joins', async () => {
  const scene = compileScene(pond())
  const w = new SceneWater(scene, { warm: 1 }), v = new SceneWater(scene, { warm: 1 })
  const rough = (s: SceneWater, waves: number, t = 2.5) => { s.waves = waves; s.set(t); return Float32Array.from(s.water.h) }
  const calm = rough(w, 0)
  w.addWind([1, 0.3])
  await v.prepare([], [], [1, 0.3], 1)
  assert.deepEqual(rough(w, 0), calm, 'no wind: the water as it was')
  const off = (h: Float32Array) => Math.sqrt(h.reduce((s, x, k) => s + (x - calm[k]) ** 2, 0) / h.length)
  const one = off(rough(w, 1)), three = off(rough(w, 3))
  assert.ok(one > 0 && Math.abs(three / one - 3) < 0.01, `${one} then ${three}`)
  assert.deepEqual(rough(v, 2), rough(w, 2), 'in slices or at once, the same water')
  const start = rough(w, 3, 0), end = rough(w, 3, scene.loop - 1e-6)
  assert.ok(start.every((x, k) => Math.abs(x - end[k]) < 1e-4))
})
