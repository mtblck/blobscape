import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Skeleton, axisAngle, rotate } from './rig.ts'
import { ELF_BONES, elfWalk } from './zoo/elf.ts'
import { lookAt, plantFeet, twoBoneIK, type Leg } from './ik.ts'
import { worldQuat } from './posing.ts'

const at = (sk: Skeleton, name: string) => { const b = sk.index(name); return [...sk.posedHead.subarray(b * 3, b * 3 + 3)] }
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const elf = () => new Skeleton(ELF_BONES.map((b) => ({ ...b })))
const LEGS: Leg[] = ['l', 'r'].map((s) => ({ upper: `${s}Thigh`, lower: `${s}Shin`, foot: `${s}Foot`, pole: [0, 0, 1] }))

test('a leg bends so its ankle lands on a point it can reach, keeping its lengths and its knee in front', () => {
  const sk = elf()
  sk.update()
  const hip = at(sk, 'lThigh'), knee0 = at(sk, 'lShin'), ankle0 = at(sk, 'lFoot')
  const thigh = dist(hip, knee0), shin = dist(knee0, ankle0)
  const target = [ankle0[0], ankle0[1] + 0.3, ankle0[2] + 0.1]
  const miss = twoBoneIK(sk, sk.index('lThigh'), sk.index('lShin'), sk.bones[sk.index('lFoot')].head, target)
  assert.ok(miss < 1e-4, `missed by ${miss}`)
  assert.ok(dist(at(sk, 'lFoot'), target) < 1e-4)
  assert.ok(Math.abs(dist(at(sk, 'lThigh'), at(sk, 'lShin')) - thigh) < 1e-5)
  assert.ok(Math.abs(dist(at(sk, 'lShin'), at(sk, 'lFoot')) - shin) < 1e-5)
  assert.ok(at(sk, 'lShin')[2] > hip[2] + 0.05, 'the knee comes forward, the way it bent at rest')
})

test('out of reach, the leg points straight at the target and says by how much it missed', () => {
  const sk = elf()
  sk.update()
  const hip = at(sk, 'lThigh')
  const reach = dist(hip, at(sk, 'lShin')) + dist(at(sk, 'lShin'), at(sk, 'lFoot'))
  const target = [hip[0], hip[1] - reach - 0.2, hip[2]]
  const miss = twoBoneIK(sk, sk.index('lThigh'), sk.index('lShin'), sk.bones[sk.index('lFoot')].head, target)
  assert.ok(Math.abs(miss - 0.2) < 1e-3, `${miss}`)
})

test('lookAt turns a bone toward a point, no further than its limit', () => {
  const sk = elf()
  lookAt(sk, 'head', [3, 1.6, 0.5])
  const f = rotate(worldQuat(sk, sk.index('head')), [0, 0, 1])
  const h = at(sk, 'head')
  const want = [3 - h[0], 1.6 - h[1], 0.5 - h[2]]
  const l = Math.hypot(...want)
  assert.ok(f[0] * want[0] / l + f[1] * want[1] / l + f[2] * want[2] / l > 0.9999)

  const sk2 = elf()
  lookAt(sk2, 'head', [3, 1.6, 0], { limit: 0.5 })
  const f2 = rotate(worldQuat(sk2, sk2.index('head')), [0, 0, 1])
  assert.ok(Math.abs(Math.acos(f2[2]) - 0.5) < 1e-4, 'turned by the limit')
})

test('on a step, the hips drop to the lower foot and each ankle sits on its own ground', () => {
  const sk = elf()
  elfWalk(sk, 0.3)
  sk.update()
  const before = { l: at(sk, 'lFoot'), r: at(sk, 'rFoot') }
  // the elf's left (+x) stands on a step 0.12 up, its right 0.1 down
  const ground = (x: number) => (x > 0 ? 0.12 : -0.1)
  const p = plantFeet(sk, LEGS, ground)
  assert.ok(Math.abs(p.hipShift + 0.1) < 1e-6, `${p.hipShift}`)
  for (const leg of p.legs) assert.ok(leg.miss < 1e-4, `missed by ${leg.miss}`)
  assert.ok(Math.abs(at(sk, 'lFoot')[1] - (before.l[1] + 0.12)) < 1e-4)
  assert.ok(Math.abs(at(sk, 'rFoot')[1] - (before.r[1] - 0.1)) < 1e-4)
})

test('flat ground changes nothing, and a slope tilts the feet with it', () => {
  const sk = elf()
  elfWalk(sk, 0.3)
  sk.update()
  const before = [...sk.posedHead]
  plantFeet(sk, LEGS, () => 0)
  sk.posedHead.forEach((v, i) => assert.ok(Math.abs(v - before[i]) < 1e-5))

  const slope = elf()
  plantFeet(slope, LEGS, (_x, z) => 0.3 * z, { hips: false })
  const up = rotate(worldQuat(slope, slope.index('lFoot')), [0, 1, 0])
  const n = [0, 1, -0.3].map((v) => v / Math.hypot(1, 0.3))
  assert.ok(up[0] * n[0] + up[1] * n[1] + up[2] * n[2] > 0.9999, `${up}`)
  // and amount 0 leaves the pose alone
  const still = elf()
  still.setRotation(still.index('lShin'), axisAngle([1, 0, 0], 0.3))
  still.update()
  const kept = [...still.posedHead]
  plantFeet(still, LEGS, () => 0.4, { amount: 0 })
  still.posedHead.forEach((v, i) => assert.ok(Math.abs(v - kept[i]) < 1e-5))
})
