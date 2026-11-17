import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Skeleton } from '../../splat-engine/rig.ts'
import { ELF_BONES, elfIdle, elfWalk } from '../../splat-engine/zoo/elf.ts'
import { STRIDE, footings, groundBlobs, groundOf, slidAt, stand, walk, type FeetOptions, type GroundSpec } from './stand.ts'

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

test('the ground stays near the elf’s feet however far it has slid: steps and slopes sink as they come', () => {
  for (const at of [0, 0.13, 5, 41.7]) {
    assert.ok(Math.abs(groundOf({ kind: 'steps', height: 0.2, at })(0, 0)) <= 0.1 + 1e-9)
    assert.ok(Math.abs(groundOf({ kind: 'slope', height: 20, at })(0, 0)) < 1e-9)
  }
})

/** Every frame of two strides of walking, measured. */
const strides = (spec: GroundSpec, opts: FeetOptions) => {
  const sk = elf()
  return Array.from({ length: 220 }, (_, k) => walk(sk, spec, (k / 110) * STRIDE, opts))
}

test('walking, no sole ever goes into the ground, and every planted foot sits on its own ground', () => {
  for (const spec of [{ kind: 'steps', height: 0.12 }, { kind: 'steps', height: 0.3 }, { kind: 'slope', height: 25 }, { kind: 'rocks', height: 0.25 }, { kind: 'flat', height: 0 }] as const) {
    for (const s of strides({ ...spec, at: 0 }, ALL)) {
      assert.ok(s.sunk < 0.01, `${spec.kind} ${spec.height}: a sole ${s.sunk} into it`)
      assert.ok(Math.abs(s.worst) < 0.002 && s.short < 0.002, `${spec.kind} ${spec.height}: ${JSON.stringify(s)}`)
    }
  }
})

test('walking up steps, each foot lands a tread above the other; the walk alone sinks into them', () => {
  const up = strides({ kind: 'steps', height: 0.15, at: 0 }, ALL)
  assert.ok(Math.max(...up.map((s) => s.spread)) > 0.14)
  assert.ok(Math.min(...up.map((s) => s.hipShift)) < -0.04, 'the hips come down for the foot behind')
  const alone = strides({ kind: 'steps', height: 0.15, at: 0 }, { ...ALL, ik: false })
  assert.ok(Math.max(...alone.map((s) => s.sunk)) > 0.1)
  // held hips leave the foot behind hanging on deep steps
  assert.ok(Math.max(...strides({ kind: 'steps', height: 0.3, at: 0 }, { ...ALL, hips: false }).map((s) => s.short)) > 0.05)
})

test('the ground slides as fast as a planted foot: a foot down keeps its place on the ground', () => {
  const sk = elf()
  const spec: GroundSpec = { kind: 'flat', height: 0, at: 0 }
  let downs = 0
  let was: number | undefined
  for (let k = 0; k < 220; k++) {
    const t = (k / 110) * STRIDE
    walk(sk, spec, t, ALL)
    const down = footings({ ...spec, at: slidAt(t) }, t)[0].down
    const onGround = sk.posedHead[sk.index('lFoot') * 3 + 2] + slidAt(t)
    if (down && was !== undefined) { assert.ok(Math.abs(onGround - was) < 1e-4, `slid ${onGround - was} at ${t}`); downs++ }
    was = down ? onGround : undefined
  }
  assert.ok(downs > 100)
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

test('the ground has blobs, steps have risers, and sliding keeps the count', () => {
  const flat = groundBlobs({ kind: 'flat', height: 0, at: 0 })
  const steps = groundBlobs({ kind: 'steps', height: 0.2, at: 0 })
  assert.ok(flat.count > 1000)
  assert.ok(steps.count > flat.count + 100)
  // as the ground slides the count stays the same, so one buffer serves every frame
  for (const at of [0.07, 0.31, 3.3]) assert.equal(groundBlobs({ kind: 'steps', height: 0.2, at }, undefined, steps).count, steps.count)
})
