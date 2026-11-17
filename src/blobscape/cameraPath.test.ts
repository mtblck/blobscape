import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Orbit } from '../splat-core/orbit.ts'
import { eased, pathAt, pathSeconds, stopAt } from './cameraPath.ts'

const stops: Orbit[] = [
  { target: [0, 0.5, 0], distance: 4, azimuth: 350, elevation: 20 },
  { target: [1, 0.5, 0], distance: 2, azimuth: 10, elevation: 35 },
  { target: [1, 1, 2], distance: 8, azimuth: 120, elevation: 5 },
  { target: [0, 0, 0], distance: 3, azimuth: -170, elevation: 60 },
]
const turn = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180)
const near = (a: Orbit, b: Orbit) => {
  for (let q = 0; q < 3; q++) assert.ok(Math.abs(a.target[q] - b.target[q]) < 1e-6)
  assert.ok(Math.abs(a.distance - b.distance) < 1e-6 && Math.abs(a.elevation - b.elevation) < 1e-6 && turn(a.azimuth, b.azimuth) < 1e-6)
}

test('the path passes through every stop, in order, at its time', () => {
  for (let k = 0; k < stops.length; k++) near(pathAt(stops, stopAt(k, stops.length)), stops[k])
  assert.ok(Math.abs(eased(stopAt(2, 4)) - 2 / 3) < 1e-9)
  near(pathAt(stops, -1), stops[0])
  near(pathAt(stops, 2), stops[3])
  near(pathAt([stops[1]], 0.4), stops[1])
  assert.throws(() => pathAt([], 0))
  assert.equal(pathSeconds(4, 2), 6)
  assert.equal(pathSeconds(1, 2), 0)
})

test('turns go the short way round, and nothing jumps', () => {
  // 350 to 10 passes 0, not 180
  const mid = pathAt(stops, (stopAt(0, 4) + stopAt(1, 4)) / 2)
  assert.ok(turn(mid.azimuth, 0) < 12, `${mid.azimuth}`)
  // 120 to -170 is 70 further round, through 180
  const late = pathAt(stops, (stopAt(2, 4) + stopAt(3, 4)) / 2)
  assert.ok(turn(late.azimuth, 155) < 25, `${late.azimuth}`)
  let was = pathAt(stops, 0)
  for (let f = 1; f <= 600; f++) {
    const now = pathAt(stops, f / 600)
    assert.ok(turn(now.azimuth, was.azimuth) < 2 && Math.abs(now.elevation - was.elevation) < 1 && Math.abs(Math.log(now.distance / was.distance)) < 0.02)
    assert.ok(Math.hypot(now.target[0] - was.target[0], now.target[1] - was.target[1], now.target[2] - was.target[2]) < 0.05)
    assert.ok(now.distance > 1.5 && now.distance < 9.5 && Math.abs(now.elevation) <= 89)
    was = now
  }
})

test('it leaves the first stop and reaches the last gently', () => {
  const step = (u: number) => { const a = pathAt(stops, u), b = pathAt(stops, u + 0.001); return turn(a.azimuth, b.azimuth) + Math.abs(Math.log(a.distance / b.distance)) * 50 }
  assert.ok(step(0) < step(0.2) / 10)
  assert.ok(step(0.999) < step(0.8) / 10)
})
