import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MATERIALS } from '../../splat-engine/mpm.ts'
import { DETAILS, DROP, FlowBox, SETUP, SPOUT, TESTS, groundFor, thingRadius, thingShape, type Setup } from './box.ts'

const light = (o: Partial<Setup>): Setup => ({ ...SETUP, detail: 'light', ...o })

test('every test has its grounds, and a ground a test lacks falls back to its first', () => {
  assert.equal(groundFor('pour', 'bowl'), 'bowl')
  assert.equal(groundFor('drop', 'steps'), 'floor')
  assert.equal(groundFor('collapse', 'bowl'), 'floor')
  for (const t of TESTS) assert.ok(t.grounds.length > 0)
})

test('every material runs every test on every ground: nothing goes wrong, leaves the box or ends inside a solid', () => {
  for (const material of MATERIALS) for (const t of TESTS) for (const ground of t.grounds) {
    const b = new FlowBox(light({ material, test: t.id, ground, thing: 'rock' }))
    b.advance(1.2)
    const { sim } = b, name = `${material} ${t.id} ${ground}`
    assert.ok(sim.count > 100, `${name}: ${sim.count} particles`)
    let inside = 0
    for (let p = 0; p < sim.count; p++) {
      const x = sim.x[p * 3], y = sim.x[p * 3 + 1], z = sim.x[p * 3 + 2]
      assert.ok(Number.isFinite(x + y + z) && x > 0 && x < 1 && y > 0 && y < 1 && z > 0 && z < 1, `${name}: particle ${p} at ${x}, ${y}, ${z}`)
      for (const s of sim.solids) if (s.distance(x, y, z) < -sim.dx * 0.25) inside++
    }
    assert.equal(inside, 0, `${name}: ${inside} particles inside a solid`)
    if (t.id === 'drop') {
      assert.ok(b.body, `${name}: the thing was let go`)
      for (let i = 0; i < 3; i++) assert.ok(Number.isFinite(b.body.pos[i]) && b.body.pos[i] > 0 && b.body.pos[i] < 1, `${name}: the thing is at ${[...b.body.pos]}`)
    }
  }
})

test('the spout pours one amount and stops; pouring more starts it again', () => {
  const b = new FlowBox(light({ test: 'pour', ground: 'floor' }))
  const amount = Math.round(SPOUT.amount * (DETAILS.light.cells * 2) ** 3)
  assert.ok(b.pouring)
  b.advance(0.5)
  const some = b.sim.count
  assert.ok(some > 50 && some < amount, `${some} of ${amount} after half a second`)
  b.advance(6)
  assert.ok(!b.pouring, 'it stops')
  assert.ok(Math.abs(b.sim.count / amount - 1) < 0.1, `${b.sim.count} poured for ${amount}`)
  const before = b.sim.count
  b.pourMore()
  b.advance(1)
  assert.ok(b.sim.count > before + 50)
})

test('the thing is let go after a moment, and dropping again puts a new one at the top', () => {
  const b = new FlowBox(light({ test: 'drop', ground: 'floor', thing: 'cube', size: 1, weight: 4 }))
  const body = () => b.body
  b.advance(DROP.after * 0.5)
  assert.equal(body(), undefined)
  b.advance(DROP.after + 1.5)
  assert.ok(body() && body()!.pos[1] < 0.4, `it fell to ${body()?.pos[1]}`)
  const f = b.frame()
  assert.equal(f.body.length, 8)
  assert.ok(Math.abs(f.body[7] - thingRadius(1)) < 1e-6)
  b.drop('ball', 0, 1)
  assert.ok(Math.abs(body()!.pos[1] - DROP.y) < 1e-9)
  assert.equal(b.sim.solids.filter((s) => !s.fixed).length, 1)
})

test('a frame holds every particle, lit and in range, and the same setup gives the same frames', () => {
  const run = () => { const b = new FlowBox(light({ material: 'snow', test: 'collapse', ground: 'steps' })); b.advance(0.8); return b.frame() }
  const a = run(), b = run()
  assert.equal(a.x.length, a.count * 3)
  assert.equal(a.shade.length, a.count)
  assert.deepEqual(a.x, b.x)
  let lit = 0
  for (let i = 0; i < a.count; i++) if (a.shade[i] > 150) lit++
  assert.ok(lit > a.count * 0.1 && lit < a.count, `${lit} of ${a.count} face the sun`)
})

test('a rock has faces: it is smaller than the ball round it, and no point of its surface is outside that ball', () => {
  const r = 0.08, rock = thingShape('rock', r), ball = thingShape('ball', r)
  let inRock = 0, inBall = 0
  for (let x = -r; x <= r; x += r / 8) for (let y = -r; y <= r; y += r / 8) for (let z = -r; z <= r; z += r / 8) {
    if (ball.sdf(x, y, z) < 0) inBall++
    if (rock.sdf(x, y, z) < 0) { inRock++; assert.ok(ball.sdf(x, y, z) < 1e-9) }
  }
  assert.ok(inRock > inBall * 0.4 && inRock < inBall * 0.9, `${inRock} of the ball's ${inBall}`)
})
