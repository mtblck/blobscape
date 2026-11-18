import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BREATH, dragonFire, dragonIdle, makeDragon } from '../../splat-engine/zoo/dragon.ts'
import { BreathShow, FLOOR, PUFFS, SPARKS, TONGUES, makeFloor } from './breath.ts'

const bright = (c: ArrayLike<number>) => c[0] + c[1] + c[2]

/** Plays `seconds` of the breath at 30 frames a second and hands each frame to `each`. */
function play(show: BreathShow, seconds: number, each?: (t: number, f: ReturnType<BreathShow['step']>) => void, from = 0) {
  const sk = makeDragon(3000).skeleton
  for (let t = from; t < from + seconds; t += 1 / 30) {
    dragonFire(sk, t)
    const f = show.step(sk, t, 1 / 30)
    each?.(t, f)
  }
  return sk
}

test('the floor is whole under the dragon and its flame, and thins away at the rim', () => {
  const { actor } = makeFloor(0.11)
  const b = actor.blobs
  let inner = 0, rim = 0
  for (let i = 0; i < b.count; i++) {
    const d = Math.hypot(b.center[i * 3], b.center[i * 3 + 2] - FLOOR.z)
    assert.ok(d <= FLOOR.r + 0.3 && Math.abs(b.center[i * 3 + 1]) < 0.01)
    if (d < FLOOR.r - 2) { inner++; assert.equal(b.opacity[i], 1) } else if (d > FLOOR.r - 0.6) { rim++; assert.ok(b.opacity[i] < 1) }
  }
  // close enough to hide what is under it: about one blob per spacing² of the inner disc
  assert.ok(inner > (Math.PI * (FLOOR.r - 2) ** 2) / (0.11 * 0.11), `${inner} blobs`)
  assert.ok(rim > 0)
})

test('nothing shows or shines until the dragon breathes', () => {
  const show = new BreathShow('fire')
  const sk = makeDragon(3000).skeleton
  for (let t = 0; t < 2; t += 1 / 30) {
    dragonIdle(sk, t)
    const f = show.step(sk, null, 1 / 30)
    assert.equal(f.lights.length, 0)
  }
  assert.equal(show.burning, 0)
  const air = show.air.skeleton
  for (let k = 1; k < air.count; k++) assert.equal(air.size[k], 0)
  assert.equal(air.count, 1 + TONGUES + SPARKS + PUFFS)
})

test('a breath glows in the throat first, then lights the flame and the ground it lands on, and leaves a scorch', () => {
  const show = new BreathShow('fire', { shadows: true })
  let throatFirst = false, cast = false, most = 0, sparks = 0, puffs = 0
  const base = show.floor.blobs.color.slice()
  play(show, BREATH, (t, f) => {
    most = Math.max(most, f.lights.length)
    assert.ok(f.lights.length <= 8)
    const u = t / BREATH
    // before any flame is out the only light is in the throat and chest: small, and inside the dragon
    if (u > 0.2 && u < 0.32) { throatFirst ||= f.lights.length > 0 && f.lights.every((l) => l.range < 1 && l.position[1] > 1); assert.equal(show.burning, 0) }
    if (f.lights.some((l) => l.shadow)) cast = true
    const air = show.air.skeleton
    for (let k = 0; k < SPARKS; k++) if (air.size[1 + TONGUES + k] > 0) sparks++
    for (let k = 0; k < PUFFS; k++) if (air.size[1 + TONGUES + SPARKS + k] > 0) puffs++
  })
  assert.ok(throatFirst, 'the throat glows before the flame')
  assert.ok(cast, 'the flame casts shadows when asked')
  assert.ok(most >= 4, `${most} lights at most`)
  assert.ok(show.burning > 20, `${show.burning} cells burning`)
  assert.ok(sparks > 50 && puffs > 10, `${sparks} spark frames, ${puffs} puff frames`)
  // what burns is in front of the dragon, where the flame came down, and on the floor
  const g = show.ground
  for (let i = 0; i < g.fire.length; i++) if (g.fire[i] > 0) { const [x, z] = g.center(i); assert.ok(z > 2.5 && z < FLOOR.z + FLOOR.r && Math.abs(x) < 3, `fire at ${x}, ${z}`) }
  let changed = 0
  for (let i = 0; i < show.floor.blobs.count * 3; i++) if (show.floor.blobs.color[i] !== base[i]) changed++
  assert.ok(changed > 100, 'the floor is painted')
  // standing afterwards: the fire burns out, its light goes, and the stone stays scorched
  const sk = makeDragon(3000).skeleton
  let last = 99
  for (let t = 0; t < 8; t += 1 / 30) { dragonIdle(sk, t); last = show.step(sk, null, 1 / 30).lights.reduce((s, l) => s + bright(l.color), 0) }
  assert.equal(show.burning, 0)
  assert.ok(last < 0.05, `light left: ${last}`)
  assert.ok(g.char.some((c) => c > 0.3), 'a scorch is left')
})

test('frost lies as rime with blue light, venom burns green, and the same breath gives the same ground', () => {
  const frost = new BreathShow('frost')
  let blue = false
  play(frost, BREATH, (_t, f) => { for (const l of f.lights) if (l.color[2] > l.color[0] * 1.5 && bright(l.color) > 1) blue = true })
  assert.ok(blue)
  assert.ok(frost.ground.frost.some((v) => v > 0.5) && frost.ground.fire.every((v) => v === 0) && frost.ground.char.every((v) => v === 0))
  const venom = new BreathShow('venom')
  let green = false
  play(venom, BREATH, (_t, f) => { for (const l of f.lights) if (l.color[1] > l.color[0] * 1.5 && l.color[1] > l.color[2] * 1.5) green = true })
  assert.ok(green && venom.burning > 20)
  const again = new BreathShow('venom')
  play(again, BREATH)
  assert.deepEqual(again.ground.fire, venom.ground.fire)
})
