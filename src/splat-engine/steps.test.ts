import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Steps, type StepBody } from './steps.ts'

const TWO = [{ home: [0.1, 0] as [number, number] }, { home: [-0.1, 0] as [number, number] }]
const FOUR = [{ home: [0.12, 0.3] }, { home: [-0.12, 0.3] }, { home: [0.12, -0.3] }, { home: [-0.12, -0.3] }] as { home: [number, number] }[]
const opts = { reach: 0.25, duration: 0.3, lift: 0.1 }

/** Runs a body along `move` (velocity and turn at time t) for `seconds`, checking that no planted foot ever slides. */
function walk(steps: Steps, body: StepBody, move: (t: number) => { vx: number; vz: number; turn: number }, seconds: number, dt = 1 / 60) {
  let most = 0
  for (let t = 0; t < seconds; t += dt) {
    const m = move(t)
    Object.assign(body, m)
    body.x += m.vx * dt; body.z += m.vz * dt; body.heading += m.turn * dt
    const before = steps.feet.map((f) => ({ at: [...f.at], planted: f.t < 0 }))
    const placed = steps.update(body, dt)
    steps.feet.forEach((f, i) => {
      // a foot planted before and after this frame has not moved at all
      if (before[i].planted && f.t < 0) assert.deepEqual(f.at, before[i].at, `foot ${i} slid at ${t.toFixed(2)} s`)
      if (f.t < 0) assert.equal(placed[i][1], 0)
      const h = steps.home(i, body)
      most = Math.max(most, Math.hypot(placed[i][0] - h[0], placed[i][2] - h[1]))
    })
    // only one group is ever off the ground
    assert.ok(steps.feet.filter((f) => f.t >= 0).length <= 2)
  }
  return most
}

test('walking straight on: feet take turns, planted feet never slide, and none falls far behind', () => {
  const body: StepBody = { x: 0, z: 0, heading: 0, vx: 0, vz: 0, turn: 0 }
  const s = new Steps(TWO, body, opts)
  const most = walk(s, body, () => ({ vx: 0, vz: 1.2, turn: 0 }), 4)
  assert.ok(s.taken > 10 && s.taken < 30, `${s.taken} steps`)
  assert.ok(most < opts.reach + 1.2 * opts.duration + 0.15, `a foot fell ${most} m from under the body`)
  assert.ok(body.z > 4.7)
})

test('turning on the spot, sidestepping and backing up all step, and stopping settles the feet square under the body', () => {
  const body: StepBody = { x: 0, z: 0, heading: 0, vx: 0, vz: 0, turn: 0 }
  const s = new Steps(TWO, body, opts)
  walk(s, body, () => ({ vx: 0, vz: 0, turn: 2.5 }), 2)
  const turned = s.taken
  assert.ok(turned >= 4, `${turned} steps turning on the spot`)
  walk(s, body, () => ({ vx: 0.8, vz: 0, turn: 0 }), 1.5)
  walk(s, body, () => ({ vx: 0, vz: -0.7, turn: 0 }), 1.5)
  assert.ok(s.taken > turned + 4)
  walk(s, body, () => ({ vx: 0, vz: 0, turn: 0 }), 2)
  s.feet.forEach((f, i) => {
    assert.ok(f.t < 0 && s.off(i, body) <= opts.reach * 0.3 + 1e-9, `foot ${i} left off square`)
  })
  // and still, nothing more happens
  const n = s.taken
  walk(s, body, () => ({ vx: 0, vz: 0, turn: 0 }), 1)
  assert.equal(s.taken, n)
})

test('four legs trot in diagonal pairs, and the same motion gives the same steps', () => {
  const run = () => {
    const body: StepBody = { x: 0, z: 0, heading: 0, vx: 0, vz: 0, turn: 0 }
    const s = new Steps(FOUR, body, { ...opts, reach: 0.3, groups: [[0, 3], [1, 2]] })
    const pairs: string[] = []
    let last = ''
    for (let t = 0; t < 3; t += 1 / 60) {
      const turn = t > 1.5 ? 1.2 : 0
      body.vx = Math.sin(body.heading) * 1.5; body.vz = Math.cos(body.heading) * 1.5; body.turn = turn
      body.x += body.vx / 60; body.z += body.vz / 60; body.heading += turn / 60
      s.update(body, 1 / 60)
      const up = s.feet.map((f, i) => (f.t >= 0 ? i : -1)).filter((i) => i >= 0).join(',')
      if (up && up !== last) pairs.push(up)
      last = up
    }
    return { pairs, feet: s.feet.map((f) => f.at) }
  }
  const a = run()
  assert.ok(a.pairs.length > 6)
  assert.ok(a.pairs.every((p) => p === '0,3' || p === '1,2'), a.pairs.join(' '))
  // they take turns
  for (let k = 1; k < a.pairs.length; k++) assert.notEqual(a.pairs[k], a.pairs[k - 1])
  assert.deepEqual(run(), a)
})
