import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_LIGHTS } from '../../splat-engine/engine.ts'
import { CANDLE_LIGHTS, candleLights, flameAt } from './candles.ts'
import { Pond, WATER_LEVEL } from './pond.ts'
import { SCALE } from './scene.ts'
import { FALL, FALL_FROM, Rain } from './rain.ts'
import { BODY, stepWader, steer } from './wade.ts'

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

test('a stick steers by the picture: up is away from the camera, and the wader turns to go that way', () => {
  // a camera looking down −z (from the front of the scene): up on the stick is −z, right is +x
  const view = Math.PI
  const up = steer({ x: 0, y: 1 }, view), right = steer({ x: 1, y: 0 }, view)
  assert.ok(Math.abs(Math.sin(up.aim)) < 1e-9 && Math.cos(up.aim) < -0.99)
  assert.ok(Math.sin(right.aim) > 0.99 && Math.abs(Math.cos(right.aim)) < 1e-9)
  assert.ok(Math.abs(steer({ x: 0.3, y: 0.4 }, 1).go - 0.5) < 1e-9)
  // held one way, it ends up walking straight that way, not in a circle; sent the other way, it turns round first
  const room = () => true
  let w = { x: 0, z: 0, heading: 0, speed: 0 }
  for (let k = 0; k < 180; k++) w = stepWader(w, { forward: 0, turn: 0, ...right }, 1 / 60, room)
  assert.ok(Math.abs(w.heading - Math.PI / 2) < 1e-6 && w.x > 2 && Math.abs(w.z) < 0.25, `went to ${w.x}, ${w.z}`)
  let far = 0
  for (let k = 0; k < 40; k++) { w = stepWader(w, { forward: 0, turn: 0, aim: -Math.PI / 2, go: 1 }, 1 / 60, room); far = Math.max(far, Math.abs(w.z)) }
  assert.ok(far < 0.3, `swung ${far} wide turning round`)
})

test('rain is seen falling before the water hears of it, and stops when told', () => {
  for (let k = 0; k < 60 * 40 && !pond.water.still; k++) pond.update(1 / 60, still)
  pond.rain = 60
  // drops are in the air for FALL_FROM / FALL seconds: until then the water is untouched
  const air = FALL_FROM / FALL
  for (let k = 0; k < Math.floor(air * 60) - 2; k++) pond.update(1 / 60, still)
  assert.ok(pond.falling.drops.length > 10 && pond.water.still, 'drops in the air, still water')
  assert.ok(pond.falling.changed && pond.falling.actor.blobs.opacity[0] > 0)
  const before = pond.water.volume
  for (let k = 0; k < 60; k++) pond.update(1 / 60, still)
  assert.ok(!pond.water.still, 'the drops landed')
  assert.ok(Math.abs(pond.water.volume - before) < 1e-6, 'rain filled the pond')
  pond.rain = 0
  for (let k = 0; k < 60; k++) pond.update(1 / 60, still)
  assert.equal(pond.falling.drops.length, 0)
  assert.ok(pond.falling.actor.blobs.opacity.every((o) => o === 0))
})

test('a drop falls at its speed and lands once', () => {
  const rain = new Rain({ x0: 0, x1: 1, z0: 0, z1: 1, level: 0 })
  rain.add(0.5, 0.5, 0)
  let landed = 0, t = 0
  while (!landed && t < 2) { rain.step(1 / 60, () => landed++); t += 1 / 60 }
  assert.ok(Math.abs(t - FALL_FROM / FALL) < 0.03)
  rain.step(1, () => landed++)
  assert.equal(landed, 1)
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

test('standing still, the elf stands straight: neither knee is far out in front of its leg', () => {
  // a pond of its own, so the walking above doesn't decide where it stands
  const p = new Pond({ spacing: 0.05, look: 'forest', elfBlobs: 3000 })
  const sk = p.elf.skeleton
  const at = (n: string) => { const i = sk.index(n) * 3; return [sk.posedHead[i], sk.posedHead[i + 1], sk.posedHead[i + 2]] }
  // how far the knee stands off the line from hip to ankle
  const bend = (s: string) => {
    const a = at(`${s}Thigh`), b = at(`${s}Shin`), c = at(`${s}Foot`)
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const t = (ab[0] * ac[0] + ab[1] * ac[1] + ab[2] * ac[2]) / (ac[0] ** 2 + ac[1] ** 2 + ac[2] ** 2)
    return Math.hypot(ab[0] - ac[0] * t, ab[1] - ac[1] * t, ab[2] - ac[2] * t)
  }
  const stands = () => { sk.update(); return Math.max(bend('l'), bend('r')) }
  for (let i = 0; i < 90; i++) p.update(1 / 60, still)
  // 11 cm before the hips rode on the legs: a visible squat. At rest the legs are within a few centimeters of straight
  assert.ok(stands() < 0.05, `at the start ${stands()}`)
  // and after wading somewhere else and stopping, on whatever the bed is there
  for (let i = 0; i < 120; i++) p.update(1 / 60, { forward: 1, turn: 0 })
  for (let i = 0; i < 240; i++) p.update(1 / 60, still)
  assert.ok(stands() < 0.05, `after a walk ${stands()}`)
  // the feet are on the bed, not hanging over it
  for (const s of ['l', 'r']) { const f = at(`${s}Foot`); assert.ok(Math.abs(f[1] - 0.09 - p.groundAt(f[0], f[2])) < 0.02, `${s} foot`) }
})
