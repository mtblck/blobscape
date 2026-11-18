import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_LIGHTS } from '../../splat-engine/engine.ts'
import { CANDLE_LIGHTS, candleLights, flameAt } from './candles.ts'
import { Pond, WATER_LEVEL } from './pond.ts'
import { SCALE } from './scene.ts'
import { BODY, stepWader } from './wade.ts'

// one pond for the whole file: cutting the ruin takes a moment
const pond = new Pond({ spacing: 0.05, look: 'forest', elfBlobs: 3000 })
const still = { forward: 0, turn: 0 }

test('the water fills the pond and nothing else', () => {
  const w = pond.water
  assert.ok(w.wetCount > 3000, `${w.wetCount} wet cells`)
  assert.ok(w.wetAt(pond.walker.x, pond.walker.z), 'the elf starts in it')
  // the terrace, the banks and the column are dry; so is everything off the slab
  for (const [x, z] of [[0, -6], [-7, 1], [7, 1], [0.95 * SCALE, 0.55 * SCALE], [20, 0], [0, 7.4]]) assert.ok(!w.wetAt(x, z), `(${x}, ${z}) should be dry`)
  // every wet cell has ground under the surface
  for (let k = 0; k < w.wet.length; k++) if (w.wet[k]) assert.ok(pond.bed[k] < WATER_LEVEL, `cell ${k} is ${pond.bed[k]} high`)
  assert.equal(pond.surface.blobs.count, w.wetCount * 2)
})

test('standing still, the water comes to rest; wading sets it moving', () => {
  for (let k = 0; k < 60 * 30 && !pond.water.still; k++) pond.update(1 / 60, still)
  assert.ok(pond.water.still, 'at rest with the elf standing in it')
  const v = pond.water.version
  pond.update(1 / 60, still)
  pond.draw([3, 4, 9])
  assert.equal(pond.water.version, v)
  for (let k = 0; k < 90; k++) pond.update(1 / 60, { forward: 1, turn: 0 })
  assert.ok(!pond.water.still && pond.water.energy > 1e-7, `energy ${pond.water.energy}`)
  assert.ok(pond.waded > 0.5)
  // the rings are round the elf, not across the pond
  const { x, z } = pond.walker
  let near = 0
  for (let a = 0; a < 16; a++) near = Math.max(near, Math.abs(pond.water.heightAt(x + Math.cos(a) * 0.4, z + Math.sin(a) * 0.4)))
  assert.ok(near > 2e-4, `the water ${near} high beside the elf`)
  assert.ok(Math.abs(pond.water.volume) < 1e-5, 'wading makes no water')
})

test('each footfall is a foot through the surface', () => {
  // over a walk, each foot is sometimes clear of the water and sometimes in it
  const sk = pond.elf.skeleton, toe = ['lToe', 'rToe'].map((n) => sk.index(n))
  const seen = [{ out: false, in: false }, { out: false, in: false }]
  for (let k = 0; k < 240; k++) {
    pond.update(1 / 60, { forward: 1, turn: 0.25 })
    toe.forEach((b, i) => { const y = sk.posedHead[b * 3 + 1]; if (y > WATER_LEVEL + 0.02) seen[i].out = true; if (y < WATER_LEVEL - 0.02) seen[i].in = true })
  }
  for (const s of seen) assert.ok(s.out && s.in, 'a foot lifts clear and comes back down')
})

test('the elf never leaves the water, and planted feet stay put', () => {
  const planted = () => pond.walking.steps.feet.map((f) => (f.t < 0 ? [...f.at] : null))
  let was = planted()
  for (let k = 0; k < 60 * 25; k++) {
    // wander: mostly ahead, turning this way and that, sometimes into a bank
    pond.update(1 / 60, { forward: k % 400 < 330 ? 1 : -1, turn: Math.sin(k / 70) })
    assert.ok(pond.water.roomAt(pond.walker.x, pond.walker.z, BODY - 1e-6), `left the water at ${pond.walker.x}, ${pond.walker.z}`)
    const now = planted()
    now.forEach((p, i) => { if (p && was[i]) assert.ok(Math.hypot(p[0] - was[i]![0], p[1] - was[i]![1]) < 1e-9, 'a planted foot slid') })
    was = now
  }
  assert.ok(pond.walking.steps.taken > 20)
})

test('a wader slides along a bank and stops head on', () => {
  const room = (x: number) => x < 1
  let w = { x: 0.9, z: 0, heading: Math.PI / 4, speed: 1 }
  for (let k = 0; k < 60; k++) w = stepWader(w, { forward: 1, turn: 0 }, 1 / 60, room)
  assert.ok(w.x < 1 && w.z > 0.2, `slid to ${w.x}, ${w.z}`)
  let h = { x: 0.9, z: 0, heading: Math.PI / 2, speed: 1 }
  for (let k = 0; k < 60; k++) h = stepWader(h, { forward: 1, turn: 0 }, 1 / 60, room)
  assert.ok(h.x < 1 && Math.abs(h.z) < 1e-6 && h.speed < 0.2)
})

test('rain falls on the water and stops when told', () => {
  for (let k = 0; k < 60 * 40 && !pond.water.still; k++) pond.update(1 / 60, still)
  pond.rain = 30
  for (let k = 0; k < 60; k++) pond.update(1 / 60, still)
  assert.ok(!pond.water.still)
  pond.rain = 0
})

test('flames flutter within bounds, each on its own, and burn steady when calm', () => {
  let lo = Infinity, hi = -Infinity
  for (let t = 0; t < 30; t += 0.013) for (let i = 0; i < 9; i++) {
    const f = flameAt(t, i)
    lo = Math.min(lo, f.height, f.bright); hi = Math.max(hi, f.height, f.bright)
    assert.ok(Math.abs(f.lean[0]) < 0.5 && Math.abs(f.lean[1]) < 0.2)
  }
  assert.ok(lo > 0.6 && hi < 1.25, `between ${lo} and ${hi}`)
  assert.notEqual(flameAt(3, 0).height, flameAt(3, 1).height)
  // no jump from one frame to the next
  for (let t = 0; t < 10; t += 1 / 60) assert.ok(Math.abs(flameAt(t + 1 / 60, 2).height - flameAt(t, 2).height) < 0.06)
  assert.deepEqual(flameAt(3, 0, true), flameAt(9, 4, true))
})

test('the candles become a few lights that cast shadows, by the niche', () => {
  const lights = candleLights(pond.wicks, 2.2)
  assert.ok(lights.length === CANDLE_LIGHTS && lights.length <= MAX_LIGHTS)
  for (const l of lights) {
    assert.ok(l.shadow)
    assert.ok(pond.wicks.some((w) => Math.hypot(w[0] - l.position[0], w[2] - l.position[2]) < 0.6), 'among the candles')
  }
  // they brighten and dim with the flames
  const sum = (t: number) => candleLights(pond.wicks, t).reduce((s, l) => s + l.color[0], 0)
  const samples = Array.from({ length: 40 }, (_, k) => sum(k * 0.11))
  assert.ok(Math.max(...samples) - Math.min(...samples) > 0.05)
})
