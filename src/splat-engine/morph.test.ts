import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs, covariance, quatFromEuler, type Vec3 } from '../splat-core/blobs.ts'
import { applyMorphs, shares, targetFrom, type Morph } from './morph.ts'
import { BLINK_STEPS, cheekSpread, lidDip, makeFace, worstLidDip } from './face.ts'

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

test('the face: a puff pulls the cheek apart and reshaped blobs grow to cover it', () => {
  const face = makeFace()
  const rest = face.body.blobs
  assert.ok(rest.count > 4000 && rest.count < 12000, `${rest.count} blobs`)
  assert.ok(face.lidBlobs.length > 100 && face.cheekPairs.length > 100)
  const moved = rest.clone(), shaped = rest.clone()
  const morphs = [face.smile, face.puff, face.blinks[0]]
  applyMorphs(rest, morphs, [0, 1, 0], moved, 'centers')
  applyMorphs(rest, morphs, [0, 1, 0], shaped)
  const spread = cheekSpread(face, moved)
  assert.ok(spread > 1.6, `spread ${spread}`)
  assert.equal(cheekSpread(face, rest), 1)
  // on the cheek the reshaped blobs are wider by about as much as they moved apart
  let grown = 0, n = 0
  for (let k = 0; k < face.cheekPairs.length; k += 2) {
    const i = face.cheekPairs[k]
    const wide = (b: typeof rest) => [...b.scale.subarray(i * 3, i * 3 + 3)].sort((x, y) => y - x)
    grown += Math.sqrt((wide(shaped)[0] * wide(shaped)[1]) / (wide(rest)[0] * wide(rest)[1])); n++
  }
  assert.ok(grown / n > 1.35, `grown ${grown / n}`)
  // a smile lifts the corners of the mouth and a frown drops them
  applyMorphs(rest, morphs, [1, 0, 0], shaped)
  applyMorphs(rest, morphs, [-1, 0, 0], moved)
  let corner = 0
  for (let i = 0; i < rest.count; i++) if (rest.center[i * 3 + 2] > 0.5 && Math.abs(rest.center[i * 3] - 0.26) < 0.03 && Math.abs(rest.center[i * 3 + 1] - 0.7) < 0.03) corner = i
  assert.ok(shaped.center[corner * 3 + 1] > rest.center[corner * 3 + 1] + 0.05 && moved.center[corner * 3 + 1] < rest.center[corner * 3 + 1] - 0.05)
})

test('the face: a lid with one target cuts through the eye, and in-betweens keep it on', () => {
  const face = makeFace()
  const dips = face.blinks.map((b) => worstLidDip(face, b))
  assert.deepEqual(BLINK_STEPS, [1, 2, 4])
  assert.ok(dips[0] > 0.15 && dips[1] > 0.04 && dips[1] < 0.08 && dips[2] < 0.03, `dips ${dips}`)
  for (const b of face.blinks) { assert.ok(lidDip(face, b, 0) < 1e-6); assert.ok(lidDip(face, b, 1) < 1e-4) }
  // shut, the lids cover the pupils: some lid blob sits straight in front of each eye
  const out = face.body.blobs.clone()
  applyMorphs(face.body.blobs, [face.blinks[2]], [1], out)
  for (const side of [-1, 1]) assert.ok(face.lidBlobs.some(({ i, eye }) => Math.sign(eye[0]) === side && Math.abs(out.center[i * 3 + 1] - eye[1]) < 0.03 && out.center[i * 3 + 2] > eye[2] + 0.17), `side ${side}`)
})
