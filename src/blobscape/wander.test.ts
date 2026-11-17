import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ZOO } from '../splat-engine/zoo/index.ts'
import { CREATURES } from './creature/fromScenes.ts'
import { PROPS } from './props.ts'
import { ROAM, canRoam, detailsOf, makeActor, moveNow, placePoint, placingOf, poseActor, roamingAt } from './actors.ts'
import { REST, STOPS, footDown, goingMove, paceOf, wanderAt, wanderPlan } from './wander.ts'

const elf = ZOO.find((s) => s.id === 'elf')!

test('the loop starts where it was put, facing as it was, and comes back there', () => {
  const plan = wanderPlan(7, 3, 1, 40)
  assert.equal(plan.legs.length, STOPS)
  const start = wanderAt(plan, 0)
  assert.deepEqual([start.dx, start.dz, start.yaw], [0, 0, 40])
  const end = wanderAt(plan, plan.period - 1e-6)
  assert.ok(Math.hypot(end.dx, end.dz) < 1e-6 && !end.going, 'rests back at the start')
  const again = wanderAt(plan, plan.period + 0.3), first = wanderAt(plan, 0.3)
  assert.ok(Math.abs(again.dx - first.dx) < 1e-9 && Math.abs(again.dz - first.dz) < 1e-9, 'loops')
  for (let t = 0; t < plan.period; t += 0.05) assert.ok(Math.hypot(wanderAt(plan, t).dx, wanderAt(plan, t).dz) <= 3 + 1e-9, 'stays in its disc')
})

test('it goes at its pace, faces where it goes, turns on the spot and rests at each stop', () => {
  const pace = 0.8, plan = wanderPlan(3, 4, pace, 0)
  for (const leg of plan.legs) {
    const mid = leg.start + leg.turn + leg.go / 2, d = 0.01
    const a = wanderAt(plan, mid), b = wanderAt(plan, mid + d)
    assert.ok(a.going && Math.abs(Math.hypot(b.dx - a.dx, b.dz - a.dz) / d - pace) < 1e-6, 'pace')
    const heading = (Math.atan2(b.dx - a.dx, b.dz - a.dz) * 180) / Math.PI
    assert.ok(Math.abs((((a.yaw - heading) % 360) + 540) % 360 - 180) < 1e-6, 'faces the way it goes')
    if (leg.turn > 0.05) {
      const t0 = wanderAt(plan, leg.start + 0.01), t1 = wanderAt(plan, leg.start + leg.turn - 0.01)
      assert.ok(t0.dx === t1.dx && t0.dz === t1.dz && t0.yaw !== t1.yaw, 'turns on the spot')
    }
    const rest = wanderAt(plan, leg.start + leg.turn + leg.go + REST / 2)
    assert.ok(!rest.going && Math.abs(rest.dx - leg.to[0]) < 1e-9, 'rests at the stop')
  }
})

test('everything that can walk about has a going move; the watch stays put', () => {
  for (const sp of [...CREATURES, ...PROPS]) {
    const a = makeActor(sp, { at: [0, 0, 0], height: 1, detail: detailsOf(sp)[0] })
    assert.equal(canRoam(a), sp.id !== 'watch', sp.id)
    if (canRoam(a)) assert.ok(paceOf(a.body, goingMove(sp)!, a.rest.height) > 0, sp.id)
  }
})

test('walking about, the elf plays its walk on the way and its own move at a stop, and its planted feet hardly slide', () => {
  const a0 = makeActor(elf, { at: [1, 0, 2], height: 1.8, detail: detailsOf(elf)[0], move: 'wave' })
  const a = { ...a0, roam: ROAM }
  assert.equal(roamingAt(a0, 3), null, 'off by default')
  const sk = a.body.skeleton, walk = goingMove(elf)!
  const toes = ['lToe', 'rToe'].map((name) => sk.bones.findIndex((b) => b.name === name))
  // Each toe's lowest and highest in the walk, to tell when it's down
  const span = toes.map((i) => {
    let lo = Infinity, hi = -Infinity
    for (let f = 0; f <= 60; f++) { walk.pose(sk, (f * walk.seconds) / 60); sk.update(); lo = Math.min(lo, sk.posedHead[i * 3 + 1]); hi = Math.max(hi, sk.posedHead[i * 3 + 1]) }
    return [lo, hi]
  })
  const dt = 1 / 60
  let slid = 0, pushed = 0
  for (let t = dt; t < 40; t += dt) {
    const w = roamingAt(a, t)!, next = roamingAt(a, t + dt)!
    assert.equal(moveNow(a, t)!.name, w.going ? 'walk' : 'wave', `move at ${t}`)
    // Only on a straight leg: turning on the spot swings the feet round
    if (!w.going || !next.going || Math.abs(w.yaw - next.yaw) > 1e-9) continue
    const at = (u: number) => {
      poseActor(a, u)
      const P = placingOf(a, u)
      return toes.map((i) => ({ y: sk.posedHead[i * 3 + 1], z: sk.posedHead[i * 3 + 2], p: placePoint(sk.posedHead.subarray(i * 3, i * 3 + 3), P) }))
    }
    const now = at(t), then = at(t + dt)
    toes.forEach((_, k) => {
      if (!footDown(now[k].y, span[k][0], span[k][1], then[k].z - now[k].z)) return
      slid += Math.hypot(then[k].p[0] - now[k].p[0], then[k].p[2] - now[k].p[2])
      pushed += Math.hypot(next.dx - w.dx, next.dz - w.dz)
    })
  }
  assert.ok(pushed > 3, `walked ${pushed}`)
  // Standing still they'd slip as far as it walks. The clip's feet speed up and slow down through a
  // step, so some slip is the clip's own; going at their middle speed keeps it to under half
  assert.ok(slid < pushed * 0.5, `planted feet slid ${slid.toFixed(2)} over ${pushed.toFixed(2)} walked`)
})
