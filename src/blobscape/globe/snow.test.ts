import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Snow, facing, fitGlobe, flakeBlobs, glassBlobs, placeFlakes, type Globe } from './snow.ts'

// a little scene: a mound on a disc of ground, and a post standing on it
const points: number[] = []
for (let i = 0; i < 400; i++) {
  const a = i * 2.39996, r = Math.sqrt(i / 400) * 1.2
  points.push(Math.cos(a) * r, 0.05 * Math.cos(r * 2), Math.sin(a) * r)
}
for (let y = 0; y < 1; y += 0.05) points.push(0.1, y, 0.1)
const ground = (x: number, z: number) => (Math.hypot(x, z) < 1.2 ? 0.05 * Math.cos(Math.hypot(x, z) * 2) : -Infinity)

const globe = fitGlobe(points)
const inside = (g: Globe, x: number, y: number, z: number, slack = 1e-6) => Math.hypot(x - g.center[0], y - g.center[1], z - g.center[2]) <= g.radius + slack

test('the dome holds every point of the scene and sits at its lowest point', () => {
  for (let i = 0; i < points.length; i += 3) assert.ok(inside(globe, points[i], points[i + 1], points[i + 2]))
  assert.equal(globe.floor, Math.min(...points.filter((_, i) => i % 3 === 1)))
  // the cut is a circle wide enough for the scene's ground
  assert.ok(globe.rim >= 1.15, `rim ${globe.rim}`)
  // and the dome is no bigger than it needs be: a sphere round the box's corners would be bigger
  assert.ok(globe.radius < Math.hypot(1.2, 1.2, 1) * 1.05)
})

test('snow stays inside the glass and above the ground, and settles once the water is still', () => {
  const snow = new Snow(globe, 400, ground, 0.01, 7)
  assert.equal(snow.settled, 400)
  snow.shake(1, [1, 0.3])
  assert.ok(snow.settled < 40, `${snow.settled} still lying after a hard shake`)
  let up = 0
  for (let s = 0; s < 6; s++) {
    snow.step(0.5)
    for (let i = 0; i < snow.count; i++) {
      const x = snow.pos[i * 3], y = snow.pos[i * 3 + 1], z = snow.pos[i * 3 + 2]
      if (!inside(globe, x, y, z, 1e-4)) assert.fail(`flake ${i} left the glass`)
      if (y < snow.groundAt(x, z) + snow.size - 1e-5) assert.fail(`flake ${i} went into the ground`)
      if (s === 0 && y > globe.floor + globe.radius * 0.5) up++
    }
  }
  assert.ok(up > 40, `a shake throws snow up the dome (${up} flakes high)`)
  // a minute on, the water is still and nearly all of it lies
  snow.step(60)
  assert.equal(snow.moving, 0)
  assert.ok(snow.settled > 380, `${snow.settled} lying after a minute`)
})

test('the same shakes give the same snow', () => {
  const run = () => { const s = new Snow(globe, 200, ground, 0.01, 4); s.shake(0.8, [-1, 0]); s.step(1.5); s.shake(0.4); s.step(0.7); return [...s.pos] }
  assert.deepEqual(run(), run())
})

test('a shake turns the water the way it was shaken', () => {
  const snow = new Snow(globe, 10, ground, 0.01)
  snow.shake(1, [1, 0])
  assert.ok(snow.swirl > 0)
  snow.shake(1, [-1, 0]); snow.shake(1, [-1, 0])
  assert.ok(snow.swirl < 0)
  // light flakes come down slower than heavy ones, but every one comes down
  assert.ok(Math.min(...snow.fall) > 0)
})

test('the flakes, the glass and the quaternions that lay them flat', () => {
  for (const n of [[0, 0, 1], [1, 0, 0], [0, 1, 0], [0, 0, -1], [0.6, 0, 0.8]] as [number, number, number][]) {
    const [x, y, z, w] = facing(n)
    // +z turned by the quaternion: (0,0,1) → n
    const tz: [number, number, number] = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(tz[k] - n[k]) < 1e-6, `${n} → ${tz}`)
  }
  const snow = new Snow(globe, 50, ground, 0.01)
  const flakes = flakeBlobs(snow)
  assert.equal(flakes.count, 50)
  snow.shake(1); snow.step(0.3); placeFlakes(snow, flakes)
  assert.equal(flakes.center[30], snow.pos[30])
  const glass = glassBlobs(globe, 800)
  assert.ok(glass.count > 700)
  for (let i = 0; i < glass.count; i++) if (glass.center[i * 3 + 1] < globe.floor) assert.fail('glass under the cut')
})
