import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Skeleton } from '../../splat-engine/rig.ts'
import { ELF_BONES, elfIdle, elfWalk } from '../../splat-engine/zoo/elf.ts'
import { groundBlobs, groundOf, stand, type FeetOptions, type GroundSpec } from './stand.ts'

const elf = () => new Skeleton(ELF_BONES.map((b) => ({ ...b })))
const ALL: FeetOptions = { ik: true, hips: true, tilt: true }
const OFF: FeetOptions = { ik: false, hips: false, tilt: false }

/** The walk at time t over the ground, as the lesson poses it. */
function walkOn(spec: GroundSpec, t: number, opts: FeetOptions) {
  const sk = elf()
  elfWalk(sk, t)
  return stand(sk, spec, opts)
}

/** A place on the steps where the walk's feet stand on different treads. */
function straddle(height: number) {
  for (let at = 0; at < 0.32; at += 0.01) {
    const spec: GroundSpec = { kind: 'steps', height, at }
    if (walkOn(spec, 0, OFF).spread > height * 0.9) return spec
  }
  throw new Error('no place where the feet straddle a step')
}

test('the ground is 0 under the elf, whatever it is', () => {
  for (const kind of ['flat', 'steps', 'slope', 'rocks'] as const) assert.equal(groundOf({ kind, height: 0.2, at: 0.13 })(0, 0), 0)
})

test('the walk alone, on steps, sinks one foot into a step or leaves it floating by the step’s height', () => {
  const spec = straddle(0.15)
  const s = walkOn(spec, 0, OFF)
  assert.ok(Math.abs(s.worst) > 0.14, `${s.worst}`)
})

test('planted, every foot sits at its walk height over its own tread', () => {
  const spec = straddle(0.15)
  for (const t of [0, 0.2, 0.4, 0.6, 0.8]) {
    const s = walkOn(spec, t, ALL)
    assert.ok(Math.abs(s.worst) < 0.005 && s.short < 0.005, `t ${t}: ${JSON.stringify(s)}`)
  }
})

test('a deep step down leaves a leg short with the hips held, and the hips fix it', () => {
  const spec = straddle(0.25)
  // find a moment where held hips leave the lower leg hanging
  let t = 0
  for (; t < 1.1; t += 0.05) if (walkOn(spec, t, { ...ALL, hips: false }).short > 0.03) break
  assert.ok(t < 1.1, 'no moment where a leg came up short')
  const fixed = walkOn(spec, t, ALL)
  assert.ok(fixed.short < 0.005 && fixed.hipShift < -0.03, JSON.stringify(fixed))
})

test('on a slope, tilted feet lie flat on it and untilted ones are off by the slope', () => {
  const spec: GroundSpec = { kind: 'slope', height: 20, at: 0 }
  const sk = elf()
  elfIdle(sk, 0)
  const tilted = stand(sk, spec, ALL)
  assert.ok(tilted.tilt < 1, `${tilted.tilt}`)
  const sk2 = elf()
  elfIdle(sk2, 0)
  const flat = stand(sk2, spec, { ...ALL, tilt: false })
  assert.ok(Math.abs(flat.tilt - 20) < 1, `${flat.tilt}`)
})

test('the ground has blobs, and steps have risers', () => {
  const flat = groundBlobs({ kind: 'flat', height: 0, at: 0 })
  const steps = groundBlobs({ kind: 'steps', height: 0.2, at: 0 })
  assert.ok(flat.count > 1000)
  assert.ok(steps.count > flat.count + 100)
})
