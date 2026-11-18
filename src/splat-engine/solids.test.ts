import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Mpm } from './mpm.ts'
import { Solid, solve6, type Room } from './solids.ts'
import { box, sphere } from './voxel.ts'

const room = (fixed: Solid[] = []): Room => ({ floor: 0.1, lo: 0.1, hi: 0.9, gravity: 4, fixed })
const cubeCorners = (h: number) => [-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [-1, 1].map((c): [number, number, number] => [a * h, b * h, c * h])))
/** Lets a body go in an empty room for `seconds`. */
function fall(b: Solid, r: Room, seconds: number) {
  const dt = 0.003
  for (let t = 0; t < seconds; t += dt) { b.fall(r, dt); b.move(r, dt) }
}
/** The lowest point of a body's surface points. */
function lowest(b: Solid) {
  let y = Infinity
  for (let i = 0; i < b.points.length; i += 3) y = Math.min(y, b.pos[1] + b.rot[3] * b.points[i] + b.rot[4] * b.points[i + 1] + b.rot[5] * b.points[i + 2])
  return y
}

test('solve6 solves six equations', () => {
  let r = 3
  const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647 * 2 - 1 }
  for (let t = 0; t < 50; t++) {
    const a = Float64Array.from({ length: 36 }, rand), x = Float64Array.from({ length: 6 }, rand)
    for (let i = 0; i < 6; i++) a[i * 7] += 4
    const b = new Float64Array(6)
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) b[i] += a[i * 6 + j] * x[j]
    assert.ok(solve6(a.slice(), b))
    for (let i = 0; i < 6; i++) assert.ok(Math.abs(b[i] - x[i]) < 1e-9)
  }
  assert.equal(solve6(new Float64Array(36), new Float64Array(6)), false)
})

test('a body is weighed from its shape', () => {
  const ball = new Solid(sphere([0, 0, 0], 0.1), { density: 2 })
  const real = (4 / 3) * Math.PI * 0.1 ** 3
  assert.ok(Math.abs(ball.volume / real - 1) < 0.05, `a ball's volume ${ball.volume} for ${real}`)
  assert.ok(Math.abs(ball.mass / (2 * real) - 1) < 0.05)
  assert.ok(Math.abs(ball.inertia[0] / (0.4 * ball.mass * 0.01) - 1) < 0.08, `inertia ${ball.inertia[0]}`)
  const fixed = new Solid(box([0.5, 0.2, 0.5], [0.1, 0.1, 0.1]))
  assert.ok(fixed.fixed && fixed.mass === Infinity)
  assert.ok(fixed.distance(0.5, 0.2, 0.5) < 0 && fixed.distance(0.5, 0.5, 0.5) > 0)
  const n = [0, 0, 0]
  fixed.normal(0.5, 0.31, 0.5, n)
  assert.ok(n[1] > 0.99, `the way out of the top is up: ${n}`)
})

test('a ball falls, lands on the floor and lies still', () => {
  const b = new Solid(sphere([0, 0, 0], 0.08), { at: [0.5, 0.6, 0.5], density: 2, round: 0.08 })
  fall(b, room(), 3)
  assert.ok(Math.abs(b.pos[1] - 0.18) < 0.01, `its middle rests at ${b.pos[1]}`)
  assert.ok(Math.hypot(b.pos[0] - 0.5, b.pos[2] - 0.5) < 0.2, `it stayed near where it fell: ${[...b.pos]}`)
  assert.ok(Math.hypot(...b.vel) < 0.01, `it comes to rest: ${[...b.vel]}`)
})

test('a cube let go on a corner ends flat on a face, inside the room', () => {
  const h = 0.06
  const b = new Solid(box([0, 0, 0], [h, h, h]), { at: [0.5, 0.6, 0.5], density: 2, corners: cubeCorners(h) })
  b.quat.set([0.3, 0.1, 0.4, 0.86]); const l = Math.hypot(...b.quat); for (let i = 0; i < 4; i++) b.quat[i] /= l
  b.turned()
  fall(b, room(), 4)
  assert.ok(Math.abs(b.pos[1] - (0.1 + h)) < 0.01, `its middle is ${b.pos[1] - 0.1} over the floor for half a side of ${h}`)
  assert.ok(lowest(b) > 0.1 - 0.01, `nothing under the floor: ${lowest(b)}`)
  for (const k of [0, 2]) assert.ok(b.pos[k] > 0.1 && b.pos[k] < 0.9)
  assert.ok(Math.hypot(...b.vel) < 0.02 && Math.hypot(...b.spin) < 0.3, `it comes to rest: ${[...b.vel]}, turning ${[...b.spin]}`)
})

test('a body lands on a fixed block and stays on top of it', () => {
  const block = new Solid(box([0.5, 0.2, 0.5], [0.2, 0.1, 0.2]))
  const b = new Solid(sphere([0, 0, 0], 0.06), { at: [0.5, 0.6, 0.5], density: 2, round: 0.06 })
  fall(b, room([block]), 2)
  assert.ok(Math.abs(b.pos[1] - 0.36) < 0.012, `it rests at ${b.pos[1]} on a top at 0.3`)
})

test('a ball thrown through still goo slows, and what it loses the goo gains', () => {
  const s = new Mpm()
  s.gravity = 0
  s.fillBox([0.35, 0.35, 0.35], [0.65, 0.65, 0.65], 'goo')
  const b = s.addSolid(new Solid(sphere([0, 0, 0], 0.07), { at: [0.2, 0.5, 0.5], density: 3, velocity: [1.5, 0, 0], round: 0.07 }))
  const total = () => { let m = b.mass * b.vel[0]; for (let p = 0; p < s.count; p++) m += s.mass * s.v[p * 3]; return m }
  const before = total()
  s.advance(0.25)
  assert.ok(b.vel[0] < 1.3 && b.vel[0] > 0, `the ball slowed to ${b.vel[0]}`)
  assert.ok(Math.abs(total() / before - 1) < 0.05, `momentum ${before} before, ${total()} after`)
})

test('a heavy ball sinks into sand and a light one rides higher; nothing is left inside either', () => {
  const sunk = (density: number) => {
    const s = new Mpm({ cells: 18 })
    s.fillBox([0.28, s.floor, 0.28], [0.72, s.floor + 0.2, 0.72], 'sand')
    s.advance(0.3)
    const b = s.addSolid(new Solid(sphere([0, 0, 0], 0.08), { at: [0.5, 0.6, 0.5], density, round: 0.08 }))
    s.advance(2)
    let inside = 0
    for (let p = 0; p < s.count; p++) if (b.distance(s.x[p * 3], s.x[p * 3 + 1], s.x[p * 3 + 2]) < -0.004) inside++
    assert.equal(inside, 0, `${inside} particles inside the ball`)
    for (let i = 0; i < 3; i++) assert.ok(Number.isFinite(b.pos[i]))
    return b.pos[1] - s.floor
  }
  const heavy = sunk(6), light = sunk(0.5)
  assert.ok(light > heavy + 0.03, `the heavy ball's middle is ${heavy} over the floor, the light one's ${light}`)
  assert.ok(heavy > 0.07, `it does not go through the floor: ${heavy}`)
})

test('material poured on a fixed block piles on it and never gets in', () => {
  const s = new Mpm()
  const block = s.addSolid(new Solid(box([0.5, s.floor + 0.08, 0.5], [0.15, 0.08, 0.15])))
  s.fillBox([0.42, 0.4, 0.42], [0.58, 0.6, 0.58], 'sand')
  s.advance(2)
  let inside = 0, onTop = 0
  for (let p = 0; p < s.count; p++) {
    if (block.distance(s.x[p * 3], s.x[p * 3 + 1], s.x[p * 3 + 2]) < -0.004) inside++
    if (s.x[p * 3 + 1] > s.floor + 0.16 && Math.abs(s.x[p * 3] - 0.5) < 0.15 && Math.abs(s.x[p * 3 + 2] - 0.5) < 0.15) onTop++
  }
  assert.equal(inside, 0)
  assert.ok(onTop > 20, `${onTop} of ${s.count} lie on the block`)
})
