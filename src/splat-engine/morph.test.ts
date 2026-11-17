import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs, covariance, quatFromEuler, type Vec3 } from '../splat-core/blobs.ts'
import { applyMorphs, shares, targetFrom, type Morph } from './morph.ts'
import { quatMat3 } from './rig.ts'
import { TAIL_TURN, flankSpread, makePuffer, spikeLength, tailLength, tailWeights } from './puffer.ts'

const close = (a: ArrayLike<number>, b: ArrayLike<number>, eps: number, what: string) => { for (let i = 0; i < b.length; i++) assert.ok(Math.abs(a[i] - b[i]) <= eps, `${what}[${i}]: ${a[i]} vs ${b[i]}`) }

function some(): Blobs {
  const b = new Blobs()
  b.push({ center: [0.2, 0.5, -0.3], scale: [0.1, 0.05, 0.02], quat: quatFromEuler(20, 40, 70), color: [1, 0, 0], opacity: 1 })
  b.push({ center: [-0.4, 0.1, 0.6], scale: [0.03, 0.03, 0.08], quat: quatFromEuler(-50, 10, 5), color: [0, 1, 0], opacity: 1 })
  return b
}

test('a morph that is a linear map moves a blob exactly as that map would', () => {
  const rest = some()
  // a stretch, a shear and a turn at once
  const A = [1.4, 0.3, 0, -0.2, 0.8, 0.1, 0, 0.25, 1.1]
  const map = (p: Vec3): Vec3 => [A[0] * p[0] + A[1] * p[1] + A[2] * p[2] + 0.1, A[3] * p[0] + A[4] * p[1] + A[5] * p[2], A[6] * p[0] + A[7] * p[1] + A[8] * p[2] - 0.2]
  const m: Morph = { name: 'm', targets: [targetFrom(rest, map)] }
  const out = rest.clone()
  applyMorphs(rest, [m], [1], out)
  for (let i = 0; i < rest.count; i++) {
    close(out.center.subarray(i * 3, i * 3 + 3), map([rest.center[i * 3], rest.center[i * 3 + 1], rest.center[i * 3 + 2]]), 1e-5, 'center')
    const S = covariance(rest, i)
    const full = [S[0], S[1], S[2], S[1], S[3], S[4], S[2], S[4], S[5]]
    const want: number[] = []
    for (let r = 0; r < 3; r++) for (let c = r; c < 3; c++) {
      let v = 0
      for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) v += A[r * 3 + k] * full[k * 3 + l] * A[c * 3 + l]
      want.push(v)
    }
    close(covariance(out, i), want, 1e-6, 'covariance')
  }
})

test('weights scale a morph, run it backward and add morphs up', () => {
  const rest = some()
  const a: Morph = { name: 'a', targets: [targetFrom(rest, (p) => [p[0] + 0.3, p[1] * 1.5, p[2]])] }
  const b: Morph = { name: 'b', targets: [targetFrom(rest, (p) => [p[0], p[1], p[2] * 2 - 0.1])] }
  const out = rest.clone()
  applyMorphs(rest, [a, b], [0, 0], out)
  close(out.center, rest.center.subarray(0, 6), 0, 'rest center'); close(out.scale, rest.scale.subarray(0, 6), 0, 'rest scale')
  applyMorphs(rest, [a, b], [-1, 0.5], out)
  close(out.center.subarray(0, 3), [0.2 - 0.3, 0.5 - 0.25, -0.3 + 0.5 * (-0.3 - 0.1)], 1e-6, 'mixed')
  // centers only leaves every shape alone
  applyMorphs(rest, [a, b], [1, 1], out, 'centers')
  close(out.scale, rest.scale.subarray(0, 6), 0, 'scale'); close(out.quat, rest.quat.subarray(0, 8), 0, 'quat')
  // a blob the morph leaves alone is untouched
  const part: Morph = { name: 'p', targets: [targetFrom(rest, (p, i) => (i === 0 ? [p[0], p[1] + 1, p[2]] : null))] }
  applyMorphs(rest, [part], [1], out)
  close(out.center.subarray(3, 6), rest.center.subarray(3, 6), 0, 'left alone')
})

test('in-between targets are reached in turn', () => {
  assert.deepEqual(shares(1, 0.5), [-1, 0, 0.5])
  assert.deepEqual(shares(2, 0.5), [0, 1, 0])
  assert.deepEqual(shares(4, 0.875), [2, 3, 0.5])
  assert.deepEqual(shares(2, 1.25), [0, 1, 1.5])
  assert.deepEqual(shares(2, -0.25), [-1, 0, -0.5])
  const rest = some()
  const m: Morph = { name: 'm', targets: [targetFrom(rest, (p) => [p[0], p[1] + 1, p[2]]), targetFrom(rest, (p) => [p[0] + 1, p[1] + 1, p[2]])] }
  const out = rest.clone()
  applyMorphs(rest, [m], [0.5], out)
  close(out.center.subarray(0, 3), [0.2, 1.5, -0.3], 1e-6, 'at the first target')
  applyMorphs(rest, [m], [0.75], out)
  close(out.center.subarray(0, 3), [0.7, 1.5, -0.3], 1e-6, 'halfway to the second')
})

test('the pufferfish: a puff pulls the flank apart, and reshaped blobs grow to cover it', () => {
  const fish = makePuffer()
  const rest = fish.body.blobs
  assert.ok(rest.count > 5000 && rest.count < 16000, `${rest.count} blobs`)
  assert.ok(fish.flankPairs.length > 100)
  const moved = rest.clone(), shaped = rest.clone()
  const morphs = [fish.puff, fish.spikes]
  applyMorphs(rest, morphs, [1, 0], moved, 'centers')
  applyMorphs(rest, morphs, [1, 0], shaped)
  assert.equal(flankSpread(fish, rest), 1)
  const spread = flankSpread(fish, moved)
  assert.ok(spread > 1.4, `spread ${spread}`)
  let grown = 0, n = 0
  for (let k = 0; k < fish.flankPairs.length; k += 2) {
    const i = fish.flankPairs[k]
    const wide = (b: typeof rest) => [...b.scale.subarray(i * 3, i * 3 + 3)].sort((x, y) => y - x)
    grown += Math.sqrt((wide(shaped)[0] * wide(shaped)[1]) / (wide(rest)[0] * wide(rest)[1])); n++
  }
  assert.ok(grown / n > 1.3, `grown ${grown / n}`)
  // run backward, the fish is thinner than it was built
  applyMorphs(rest, morphs, [-0.5, 0], shaped)
  const widest = (b: typeof rest) => { let m = 0; for (let i = 0; i < b.count; i++) if (fish.body.partOf[i] === 0) m = Math.max(m, Math.abs(b.center[i * 3 + 2])); return m }
  assert.ok(widest(shaped) < widest(rest) * 0.8)
})

test('the pufferfish: spikes rest as nubs and grow out, their blobs stretching with them', () => {
  const fish = makePuffer()
  const rest = fish.body.blobs
  const reach = (b: typeof rest) => { let m = 0; for (let i = 0; i < b.count; i++) m = Math.max(m, Math.abs(b.center[i * 3 + 1] - 1)); return m }
  const out = rest.clone()
  applyMorphs(rest, [fish.spikes], [1], out)
  assert.ok(reach(out) > reach(rest) + 0.1, `rest ${reach(rest)}, grown ${reach(out)}`)
  assert.ok(Math.abs(spikeLength(1) - 1 / 0.14) < 1e-9 && spikeLength(0) === 1)
  // a spike blob is squashed along the spike at rest and whole when grown, and stays squashed when only centers move
  let i = 0
  for (let k = 0; k < rest.count; k++) if (fish.spikes.targets[0].delta[k * 3 + 1] > 0.15) i = k
  const longest = (b: typeof rest) => b.scale[i * 3] * b.scale[i * 3 + 1] * b.scale[i * 3 + 2]
  assert.ok(longest(out) > longest(rest) * 5)
  applyMorphs(rest, [fish.spikes], [1], out, 'centers')
  assert.equal(longest(out), longest(rest))
})

test('the pufferfish: the tail bends from a base that stays put, to either side, and grows when pushed past its shape', () => {
  const fish = makePuffer()
  const rest = fish.body.blobs, out = rest.clone()
  const tail = (i: number) => fish.tails[0].targets[0].delta[i * 3 + 2] !== 0 || fish.tails[0].targets[0].delta[i * 3] !== 0
  // the blob furthest back, and the tail blobs inside the body
  let tip = 0
  for (let i = 0; i < rest.count; i++) if (rest.center[i * 3] < rest.center[tip * 3]) tip = i
  assert.ok(tail(tip))
  for (const [swing, side] of [[1, 1], [-1, -1]]) {
    applyMorphs(rest, fish.tails, tailWeights(swing), out)
    // the tip goes to the side and a little forward, never across the back of the body
    const x = out.center[tip * 3], z = out.center[tip * 3 + 2] - rest.center[tip * 3 + 2]
    assert.ok(z * side > 0.25 && z * side < 0.45 && x < -1 && x > rest.center[tip * 3], `swing ${swing}: tip at x ${x}, z ${z}`)
    for (let i = 0; i < rest.count; i++) {
      if (rest.center[i * 3] > -0.6) for (let k = 0; k < 3; k++) assert.ok(Math.abs(out.center[i * 3 + k] - rest.center[i * 3 + k]) < 0.012, `blob ${i} in the body moved`)
    }
    // a blob on the fin's flat side has turned with the bend: it faced z, and now leans as far as the tail has turned there
    let flat = -1
    for (let i = 0; i < rest.count && flat < 0; i++) if (tail(i) && Math.abs(rest.center[i * 3] + 1) < 0.03 && Math.abs(rest.center[i * 3 + 1] - 1) < 0.05) flat = i
    const R = quatMat3(out.quat.subarray(flat * 4, flat * 4 + 4)), s = [...out.scale.subarray(flat * 3, flat * 3 + 3)], thin = s.indexOf(Math.min(...s))
    const lean = Math.atan2(Math.abs(R[thin]), Math.abs(R[6 + thin])), turned = (TAIL_TURN * (-0.55 - rest.center[flat * 3])) / 0.65
    assert.ok(Math.abs(lean - turned) < 0.1, `lean ${lean}, turned ${turned}`)
  }
  assert.deepEqual(tailWeights(-0.5), [0, 0.5])
  assert.ok(Math.abs(tailLength(0) - 1) < 1e-9 && Math.abs(tailLength(1) - 1) < 1e-3 && Math.abs(tailLength(-1) - 1) < 1e-3)
  assert.ok(tailLength(0.5) > 0.9 && tailLength(0.5) < 1, `half ${tailLength(0.5)}`)
  assert.ok(tailLength(1.5) > 1.1 && tailLength(-1.5) === tailLength(1.5), `past ${tailLength(1.5)}`)
})

test('a morph weight spread over its targets reads back as the same weight', async () => {
  const { targetWeights, morphWeight } = await import('./morph.ts')
  const dummy = (k: number): Morph => ({ name: 'm', targets: Array.from({ length: k }, () => ({ delta: new Float32Array(0), grad: new Float32Array(0) })) })
  for (const k of [1, 2, 3]) for (const w of [-0.5, -0.1, 0, 0.2, 1 / 3, 0.5, 0.75, 1, 1.4]) {
    const tw = targetWeights([dummy(2), dummy(k)], [0.3, w])
    assert.equal(tw.length, 2 + k)
    assert.ok(Math.abs(morphWeight(tw, 0, 2) - 0.3) < 1e-6)
    assert.ok(Math.abs(morphWeight(tw, 2, k) - w) < 1e-6, `k ${k}, w ${w}: ${morphWeight(tw, 2, k)}`)
  }
})

test('the morphs give the same centers as each target times its weight, which is what glTF adds up', async () => {
  const { targetWeights } = await import('./morph.ts')
  const rest = some()
  const a = targetFrom(rest, (p) => [p[0] * 1.3, p[1], p[2] + 0.1]), b = targetFrom(rest, (p) => [p[0], p[1] * 0.6, p[2]])
  const c = targetFrom(rest, (p) => [p[0] - 0.2, p[1] + p[0] * 0.4, p[2]])
  const morphs: Morph[] = [{ name: 'one', targets: [a] }, { name: 'two', targets: [b, c] }]
  for (const w of [[0.4, 0.3], [1, 0.75], [-0.3, 1.2]]) {
    const out = rest.clone()
    applyMorphs(rest, morphs, w, out)
    const tw = targetWeights(morphs, w), all = [a, b, c]
    for (let i = 0; i < rest.count * 3; i++) {
      const want = rest.center[i] + all.reduce((s, t, k) => s + tw[k] * t.delta[i], 0)
      assert.ok(Math.abs(out.center[i] - want) < 1e-5, `${w}: ${out.center[i]} vs ${want}`)
    }
  }
})
