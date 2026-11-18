import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WATER_TICK, Water, crossing, makeSurface, shadeSurface, shapeSurface, surfaceColor, gathered, GATHER_LEAST, GATHER_MOST, type WaterLook } from './water.ts'

const pond = (more: Partial<ConstructorParameters<typeof Water>[0]> = {}) =>
  new Water({ x0: -2, z0: -2, nx: 80, nz: 80, cell: 0.05, level: 0.15, ...more })

/** How far from (x, z) the highest water stands. */
function crest(w: Water, x: number, z: number) {
  const { nx, x0, z0, cell } = w.spec
  let best = -Infinity, at = 0
  for (let k = 0; k < w.h.length; k++) {
    if (w.h[k] <= best) continue
    best = w.h[k]
    at = Math.hypot(x0 + ((k % nx) + 0.5) * cell - x, z0 + (Math.floor(k / nx) + 0.5) * cell - z)
  }
  return at
}

test('a drop spreads as a ring at the water\'s speed', () => {
  const w = pond({ damping: 0 })
  w.drop(0, 0, 0.3, 0.002)
  assert.ok(!w.still)
  w.step(1)
  const one = crest(w, 0, 0)
  w.step(1)
  const two = crest(w, 0, 0)
  // the crest moved outward by about a second's travel
  assert.ok(Math.abs(two - one - w.spec.speed) < 0.15, `crest went from ${one.toFixed(2)} to ${two.toFixed(2)} m`)
  // and the middle, where it fell, has gone down again
  assert.ok(Math.abs(w.heightAt(0, 0)) < 0.004)
})

test('no water is made or lost, by waves, banks or bodies', () => {
  const w = pond({ wet: (x, z) => Math.hypot(x, z) < 1.6 && !(Math.abs(x - 0.6) < 0.2 && Math.abs(z) < 0.2) })
  assert.equal(w.volume, 0)
  w.body('leg', { x: 0, z: 0, r: 0.07 })
  assert.ok(Math.abs(w.volume) < 1e-7, 'stepping in pushes water aside, not away')
  assert.ok(w.heightAt(0, 0) < -0.01, 'pressed down under the leg')
  assert.ok(w.heightAt(0.1, 0) > 0, 'raised round it')
  for (let k = 0; k < 120; k++) {
    w.body('leg', { x: k * 0.004, z: 0, r: 0.07 })
    w.step(1 / 60)
  }
  w.body('leg', null)
  w.step(2)
  assert.ok(Math.abs(w.volume) < 1e-6, `volume ${w.volume}`)
  // dry cells never hold water
  for (let k = 0; k < w.h.length; k++) if (!w.wet[k]) assert.equal(w.h[k], 0)
})

test('a ring bounces off a bank', () => {
  // a wall along x = 0.5: the water beyond it is cut off
  const w = pond({ damping: 0, wet: (x) => x < 0.5 })
  w.drop(0, 0, 0.1, 0.0004)
  w.step(1.1)
  // by now the ring has reached the wall and come back: the water between is higher than open water the same way off on the other side would be
  let near = 0, open = 0
  for (let z = -0.3; z <= 0.3; z += 0.05) { near += Math.abs(w.heightAt(0.42, z)); open += Math.abs(w.heightAt(-0.42, z)) }
  assert.ok(near > open * 1.5, `by the wall ${near.toFixed(5)}, in the open ${open.toFixed(5)}`)
})

test('waves keep the water\'s energy (the step trades a little back and forth), and damping brings it to rest', () => {
  const w = pond({ damping: 0 })
  w.drop(0.3, -0.2, 0.12, 0.0005)
  w.step(WATER_TICK)
  const start = w.energy
  for (let k = 0; k < 20; k++) { w.step(0.5); assert.ok(w.energy < start * 1.2 && w.energy > start * 0.8, `energy ${w.energy} after ${k} of ${start}`) }
  const calm = pond()
  calm.drop(0.3, -0.2, 0.12, 0.0005)
  calm.step(1)
  assert.ok(!calm.still)
  for (let k = 0; k < 80 && !calm.still; k++) calm.step(1)
  assert.ok(calm.still, 'it settles')
  assert.equal(calm.energy, 0)
  const v = calm.version
  calm.step(1)
  assert.equal(calm.version, v, 'still water is not stepped')
})

test('the same frames give the same water, however they are cut', () => {
  const run = (cuts: number[]) => {
    const w = pond()
    w.drop(0.2, 0.1, 0.1, 0.0003)
    for (const dt of cuts) w.step(dt)
    return w
  }
  const a = run(Array.from({ length: 60 }, () => 1 / 60)), b = run(Array.from({ length: 20 }, () => 3 / 60))
  assert.equal(a.time.toFixed(6), b.time.toFixed(6))
  for (let k = 0; k < a.h.length; k += 37) assert.ok(Math.abs(a.h[k] - b.h[k]) < 1e-7)
})

test('fast water on small cells stays stable', () => {
  const w = new Water({ x0: 0, z0: 0, nx: 60, nz: 60, cell: 0.01, level: 0, speed: 3, damping: 0 })
  w.drop(0.3, 0.3, 0.03, 1e-5)
  w.step(WATER_TICK)
  const start = w.energy
  w.step(1.5)
  assert.ok(Number.isFinite(w.energy) && w.energy < start * 1.05)
})

test('a leg crosses the surface where it stands in it', () => {
  // knee above, ankle below: the capsule's own width where it crosses
  const c = crossing([0.1, 0.5, 0.2], [0.2, 0.1, 0.2], 0.05, 0.3)!
  assert.ok(Math.abs(c.x - 0.15) < 1e-9 && Math.abs(c.r - 0.05) < 1e-9)
  // wholly above, and wholly under
  assert.equal(crossing([0, 0.9, 0], [0, 0.5, 0], 0.05, 0.3), null)
  assert.equal(crossing([0, 0.2, 0], [0, 0.05, 0], 0.05, 0.3), null)
  // just touching with its rounded end: a small disc
  const tip = crossing([0, 0.9, 0], [0, 0.33, 0], 0.05, 0.3)!
  assert.ok(tip.r > 0 && tip.r < 0.05)
  // it does not matter which end is given first
  assert.deepEqual(crossing([0.2, 0.1, 0.2], [0.1, 0.5, 0.2], 0.05, 0.3), c)
})

test('room to stand is water all round', () => {
  const w = pond({ wet: (x) => x < 0.5 })
  assert.ok(w.roomAt(0, 0, 0.25))
  assert.ok(!w.roomAt(0.4, 0, 0.25), 'too near the bank')
  assert.ok(!w.roomAt(0.8, 0, 0.1), 'on dry ground')
  assert.ok(!w.wetAt(9, 9), 'off the grid')
})

const LOOK: WaterLook = { body: [0.02, 0.2, 0.18], sky: [0.3, 0.4, 0.6], clear: 0.4, sun: { toward: [0, 1, 1], color: [1, 0.9, 0.7] } }

test('the surface is clear from above and a mirror from low down', () => {
  const up: [number, number, number] = [0, 1, 0]
  const above = surfaceColor([0, 0, 0], up, [0, 5, 0.01], { ...LOOK, sun: undefined })
  const low = surfaceColor([0, 0, 0], up, [0, 0.2, 5], { ...LOOK, sun: undefined })
  assert.ok(Math.abs(above.opacity - 0.4) < 0.02 && Math.abs(above.color[1] - 0.2) < 0.01, 'its own color, see-through')
  assert.ok(low.opacity > 0.8 && low.color[2] > 0.45, 'the sky, solid')
  // the sun glints where the mirrored line of sight meets it: sun up and toward +z, eye up and toward −z
  const glint = surfaceColor([0, 0, 0], up, [0, 1, -1], LOOK), none = surfaceColor([0, 0, 0], up, [1, 1, 0], LOOK)
  assert.ok(glint.color[0] > none.color[0] + 0.8)
  // and a lamp does the same, less the farther it is
  const lamp = (d: number) => surfaceColor([0, 0, 0], up, [0, 1, -1], { ...LOOK, sun: undefined }, [{ position: [0, d, d], color: [2, 1, 0.3], range: 2 }]).color[0]
  assert.ok(lamp(0.5) > lamp(1.5) && lamp(1.5) > lamp(5))
})

test('the surface\'s blobs follow the water', () => {
  const w = pond({ wet: (x, z) => Math.hypot(x, z) < 1 })
  const s = makeSurface(w, { per: 2 })
  assert.equal(s.blobs.count, w.wetCount * 2)
  for (let k = 0; k < s.blobs.count; k++) assert.ok(w.wetAt(s.at[k * 2], s.at[k * 2 + 1]), 'every blob lies on water')
  w.drop(0, 0, 0.15, 0.0005)
  w.step(0.4)
  shapeSurface(s, w, 4)
  shadeSurface(s, { ...LOOK, steep: 4 }, [0, 3, 4])
  let lifted = 0, tilted = 0
  for (let k = 0; k < s.blobs.count; k++) {
    const y = s.blobs.center[k * 3 + 1]
    assert.ok(Math.abs(y - 0.15 - w.heightAt(s.at[k * 2], s.at[k * 2 + 1])) < 1e-6)
    if (Math.abs(y - 0.15) > 1e-4) lifted++
    // a flat blob's quat is the one that faces straight up
    if (Math.abs(s.blobs.quat[k * 4] - s.blobs.quat[0]) > 1e-3 || Math.abs(s.blobs.quat[k * 4 + 2] - s.blobs.quat[2]) > 1e-3) tilted++
    for (let c = 0; c < 3; c++) assert.ok(s.blobs.color[k * 3 + c] >= 0 && s.blobs.color[k * 3 + c] <= 1)
  }
  assert.ok(lifted > 50 && tilted > 50, `${lifted} lifted, ${tilted} tilted`)
})

test('a body moves its own volume of water, whatever the grid', () => {
  // a leg 5 cm thick standing in 16 cm of water takes the place of a column of π r² × 0.16
  const want = Math.PI * 0.05 * 0.05 * 0.16
  for (const cell of [0.025, 0.05, 0.075]) {
    const w = new Water({ x0: -1, z0: -1, nx: Math.round(2 / cell), nz: Math.round(2 / cell), cell, level: 0.16 })
    w.body('leg', { x: 0.013, z: -0.02, r: 0.05 }, 0.16)
    // what was pressed out of the cells under the leg
    let pressed = 0
    for (const h of w.h) if (h < 0) pressed -= h * cell * cell
    assert.ok(pressed > want * 0.7 && pressed < want * 1.15, `${pressed} on ${cell} cells, for ${want}`)
    assert.ok(Math.abs(w.volume) < 1e-9)
  }
})

test('a pond laid to rest is flat and still, and still knows who stands in it', () => {
  const w = pond()
  w.body('leg', { x: 0, z: 0, r: 0.05 }, 0.1)
  w.step(0.2)
  assert.ok(!w.still)
  w.rest()
  assert.ok(w.still && w.h.every((h) => h === 0))
  // the leg has not moved, so telling the water again changes nothing
  const v = w.version
  w.body('leg', { x: 0, z: 0, r: 0.05 }, 0.1)
  assert.equal(w.version, v)
})

test('a ripple tips the mirror toward a lighter or darker sky', () => {
  const look: WaterLook = { body: [0, 0.1, 0.1], sky: [0.01, 0.02, 0.03], horizon: [0.1, 0.15, 0.2], clear: 0.3 }
  const eye = [0, 1, 3]
  const tip = (t: number) => surfaceColor([0, 0, 0], [0, Math.cos(t), Math.sin(t)], eye, look).color[0]
  // tipped away from the eye it mirrors the sky lower down, tipped toward it the sky higher up
  assert.ok(tip(-0.15) > tip(0) * 1.1 && tip(0) > tip(0.15) * 1.05, `${tip(-0.15)}, ${tip(0)}, ${tip(0.15)}`)
  // and the lit sky round the moon comes with the angle too
  const moon = surfaceColor([0, 0, 0], [0, 1, 0], eye, { ...look, sun: { toward: [0, 1, -2], color: [1, 1, 1], glow: 0.2 }, gloss: 400 })
  assert.ok(moon.color[0] > surfaceColor([0, 0, 0], [0, 1, 0], eye, look).color[0])
})

test('the surface reads the water as the water itself answers', () => {
  // the cells each blob reads are worked out once: they must give what heightAt and slopeAt give, beside a bank too
  const w = pond({ wet: (x, z) => Math.hypot(x - 0.3, z) > 0.4 && x < 1.5 })
  w.drop(0.9, 0.2, 0.1, 2e-4)
  w.drop(-0.6, -0.9, 0.08, 1e-4)
  w.step(0.6)
  const s = makeSurface(w)
  shapeSurface(s, w)
  for (let k = 0; k < s.at.length / 2; k += 7) {
    const x = s.at[k * 2], z = s.at[k * 2 + 1], [sx, sz] = w.slopeAt(x, z)
    assert.ok(Math.abs(s.blobs.center[k * 3 + 1] - (w.spec.level + w.heightAt(x, z))) < 1e-6, `height of blob ${k}`)
    assert.ok(Math.abs(s.slope[k * 2] - sx) < 1e-6 && Math.abs(s.slope[k * 2 + 1] - sz) < 1e-6, `slope of blob ${k}`)
  }
})

test('with a mirror picture the surface shows the scene, and the sky where the picture is empty', () => {
  // a camera low over a pond at level 0; the picture's left half holds a red wall, its right half nothing
  const eye = [0, 1, 4], width = 32, height = 24, pixels = new Float32Array(width * height * 4)
  for (let j = 0; j < height; j++) for (let i = 0; i < width / 2; i++) pixels.set([0.8, 0.1, 0.1, 1], (j * width + i) * 4)
  // projection times view for that eye looking at the origin, by columns
  const f = 1 / Math.tan((50 * Math.PI) / 360), l = Math.hypot(1, 4), cy = 4 / l, sy = 1 / l
  // view: camera axes x = (1,0,0), y = (0,cy,-sy), z = (0,sy,cy); eye at (0,1,4)
  const view = [1, 0, 0, 0, 0, cy, sy, 0, 0, -sy, cy, 0, 0, -(cy * 1 - sy * 4), -(sy * 1 + cy * 4), 1]
  const proj = [f / (4 / 3), 0, 0, 0, 0, f, 0, 0, 0, 0, -1.002, -1, 0, 0, -0.2002, 0]
  const viewProj = Array.from({ length: 16 }, (_, k) => { const c = k >> 2, r = k & 3; let s = 0; for (let q = 0; q < 4; q++) s += proj[q * 4 + r] * view[c * 4 + q]; return s })
  const look: WaterLook = { body: [0, 0.1, 0.1], sky: [0, 0, 0.3], clear: 0.3, mirror: { width, height, pixels, viewProj, plane: { normal: [0, 1, 0], offset: 0 } } }
  const up: [number, number, number] = [0, 1, 0]
  const left = surfaceColor([-1, 0, 0], up, eye, look), right = surfaceColor([1, 0, 0], up, eye, look), bare = surfaceColor([1, 0, 0], up, eye, { ...look, mirror: null })
  assert.ok(left.color[0] > right.color[0] + 0.02, `the wall's red on the left: ${left.color[0]} and ${right.color[0]}`)
  right.color.forEach((c, i) => assert.ok(Math.abs(c - bare.color[i]) < 1e-9, 'only sky on the right'))
  // a ripple near the wall's edge tips the line of sight across it
  const tip = (t: number) => surfaceColor([-0.05, 0, 0], [Math.sin(t), Math.cos(t), 0], eye, look).color[0]
  assert.ok(Math.abs(tip(0.2) - tip(-0.2)) > 0.01, `${tip(0.2)} and ${tip(-0.2)}`)
})

test('a splash is a crater with a rim, holds no water of its own, and spreads as a ring', () => {
  const w = pond({ damping: 0 })
  w.splash(0.02, 0.01, 0.11, 0.012)
  assert.ok(Math.abs(w.volume) < 1e-9, `made ${w.volume} of water`)
  const k = w.index(0.02, 0.01)
  assert.ok(w.h[k] < -0.005, 'no crater')
  let rim = 0
  for (const v of w.h) rim = Math.max(rim, v)
  assert.ok(rim > 0.0005, 'no rim')
  for (let i = 0; i < 40; i++) w.step(WATER_TICK)
  assert.ok(crest(w, 0.02, 0.01) > 0.2, 'the ring did not spread')
  // on dry ground, nothing
  const dry = pond()
  dry.wet.fill(0)
  dry.splash(0, 0, 0.11, 0.012)
  assert.ok(dry.h.every((v) => v === 0))
})

test('a crest gathers light on the bed and a trough spreads it, so a ripple shows from straight above', () => {
  assert.equal(gathered(-2, {}), 1)
  assert.equal(gathered(0, { deep: 0.3 }), 1)
  // a quarter of the tilt, over the depth: 1 / (1 − 0.3 · 2 / 4)
  assert.ok(Math.abs(gathered(-2, { deep: 0.3 }) - 1 / 0.85) < 1e-9)
  assert.ok(gathered(2, { deep: 0.3 }) < 1 && gathered(-2, { deep: 0.3, steep: 2 }) > gathered(-2, { deep: 0.3 }))
  assert.equal(gathered(-1e3, { deep: 0.3 }), GATHER_MOST)
  assert.equal(gathered(1e3, { deep: 0.3 }), GATHER_LEAST)

  const w = pond()
  w.drop(0, 0, 0.1, 2e-4)
  w.step(0.5)
  const s = makeSurface(w)
  shapeSurface(s, w)
  let crest = 0, trough = 0
  for (let k = 0; k < s.curve.length; k++) { if (s.curve[k] < s.curve[crest]) crest = k; if (s.curve[k] > s.curve[trough]) trough = k }
  assert.ok(s.curve[crest] < 0 && s.curve[trough] > 0)
  const look: WaterLook = { body: [0.01, 0.08, 0.07], sky: [0.01, 0.02, 0.03], clear: 0.3, deep: 0.35 }
  const green = (k: number) => s.blobs.color[k * 3 + 1]
  // seen from straight overhead, where the surface mirrors next to nothing
  const over = (k: number): [number, number, number] => [s.at[k * 2], 30, s.at[k * 2 + 1]]
  shadeSurface(s, look, over(crest))
  const bright = green(crest)
  shadeSurface(s, look, over(trough))
  assert.ok(bright > green(trough) * 1.1, `${bright} over ${green(trough)}`)
  shadeSurface(s, { ...look, deep: undefined }, over(crest))
  assert.ok(bright > green(crest))
})
