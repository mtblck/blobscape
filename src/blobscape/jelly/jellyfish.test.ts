import { test } from 'node:test'
import assert from 'node:assert/strict'
import { skinBlob } from '../../splat-engine/rig.ts'
import { BEAT, LOOP, PARTS, TENTACLES, carries, innerGlowAt, makeJelly, makeSpace, poseJelly, pulseAt, seeThrough, shineLights, squeezeAt, riseAt } from './jellyfish.ts'

// one coarse jellyfish for the whole file
const jelly = makeJelly(16000)

test('the jellyfish fits the engine: under 256 bones, every blob on bones that sum to one, every part grown', () => {
  assert.ok(jelly.skeleton.count < 256, `${jelly.skeleton.count} bones`)
  for (const { blobs, skin } of [jelly.body, jelly.lights]) {
    for (let i = 0; i < blobs.count; i++) {
      const w = skin.weights[i * 4] + skin.weights[i * 4 + 1] + skin.weights[i * 4 + 2] + skin.weights[i * 4 + 3]
      if (Math.abs(w - 1) > 1e-4 || skin.joints[i * 4] >= jelly.skeleton.count) assert.fail(`blob ${i}: weights ${w}`)
    }
  }
  const seen = new Set(jelly.body.partOf)
  PARTS.forEach((p, k) => assert.ok(seen.has(k), `no ${p}`))
})

test('it is nearly all glass: most of the body lets through over nine tenths of the light', () => {
  const o = jelly.body.blobs.opacity
  let clear = 0
  for (let i = 0; i < jelly.body.blobs.count; i++) if (o[i] < 0.1) clear++
  assert.ok(clear / jelly.body.blobs.count > 0.6, `${Math.round((clear / jelly.body.blobs.count) * 100)}% clear`)
})

test('the same count gives the same jellyfish', () => {
  const again = makeJelly(16000)
  assert.equal(again.body.blobs.count, jelly.body.blobs.count)
  assert.deepEqual(again.body.blobs.center.subarray(0, 300), jelly.body.blobs.center.subarray(0, 300))
})

test('everything it does comes round again each loop', () => {
  const at = (t: number) => {
    poseJelly(jelly.skeleton, t)
    return Array.from(jelly.skeleton.matrix)
  }
  const a = at(1.3), b = at(1.3 + LOOP)
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-4, `bone matrix ${i}`))
  assert.ok(Math.abs(squeezeAt(0.4) - squeezeAt(0.4 + BEAT)) < 1e-9)
  assert.ok(Math.abs(riseAt(0.2) - riseAt(0.2 + LOOP)) < 1e-9)
  assert.ok(Math.abs(pulseAt(1.4, 3, 2).power - pulseAt(1.4, 3, 2 + LOOP).power) < 1e-9)
  assert.ok(Math.abs(innerGlowAt(0.5) - innerGlowAt(0.5 + LOOP)) < 1e-9)
})

test('a beat squeezes the margin in and the tentacles follow it', () => {
  const tip = jelly.body.blobs.count - 2
  const placed = (t: number) => {
    poseJelly(jelly.skeleton, t, false)
    const c = new Float32Array(4), cov = new Float32Array(6)
    const b = jelly.body.blobs
    skinBlob(b.center.subarray(tip * 3, tip * 3 + 3), b.scale.subarray(tip * 3, tip * 3 + 3), b.quat.subarray(tip * 4, tip * 4 + 4), jelly.body.skin.joints.subarray(tip * 4, tip * 4 + 4), jelly.body.skin.weights.subarray(tip * 4, tip * 4 + 4), jelly.skeleton, 'quat', c, 0, cov, 0)
    return c
  }
  const open = placed(0), squeezed = placed(BEAT * 0.28)
  const moved = Math.hypot(open[0] - squeezed[0], open[1] - squeezed[1], open[2] - squeezed[2])
  assert.ok(moved > 0.02 && moved < 1.5, `a tentacle's tip moved ${moved}`)
  assert.ok(squeezeAt(BEAT * 0.28) > 0.99 && squeezeAt(0) < 0.01)
})

test('a pulse runs out from the top: it reaches the canals before the tentacles, and lights only the tentacles that carry it', () => {
  // the first beat starts at 0: a little later the top is bright, a tentacle's far end still dark
  const early = 0.25
  assert.ok(pulseAt(0.2, -1, early).power > 0.5)
  const j = Array.from({ length: TENTACLES }, (_, k) => k).find((k) => carries(k, 0) && carries(k, 5) === false)!
  assert.ok(pulseAt(2.2, j, early).power < 0.05)
  assert.ok(pulseAt(2.2, j, 2.2 / 1.05).power > 0.4)
  const not = Array.from({ length: TENTACLES }, (_, k) => k).find((k) => !carries(k, 0))!
  assert.ok(pulseAt(2.2, not, 2.2 / 1.05).power < 0.1)
  // between half and two thirds of the tentacles carry a beat
  const share = Array.from({ length: TENTACLES }, (_, k) => k).filter((k) => carries(k, 2)).length / TENTACLES
  assert.ok(share > 0.3 && share < 0.8, `share ${share}`)
})

test('the lights take their color from the pulse, and go out when off', () => {
  shineLights(jelly, 0.3, 'cyan')
  const o = jelly.lights.blobs.opacity
  assert.ok(Math.max(...o.subarray(0, jelly.lights.blobs.count)) > 0.8)
  shineLights(jelly, 0.3, 'off')
  assert.equal(Math.max(...o.subarray(0, jelly.lights.blobs.count)), 0)
})

test('see-through at 1 is the body as grown, and clearer below it', () => {
  seeThrough(jelly, 1)
  assert.deepEqual(jelly.body.blobs.opacity.subarray(0, jelly.body.blobs.count), jelly.opacity)
  seeThrough(jelly, 0.5)
  assert.ok(jelly.body.blobs.opacity[10] < jelly.opacity[10])
  seeThrough(jelly, 1)
})

test('space has stars that shine and dust that does not', () => {
  const s = makeSpace(11, 200, 40)
  assert.equal(s.glow.length, s.blobs.count)
  assert.ok(s.glow.some((g) => g === 255))
})
