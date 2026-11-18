import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs } from '../splat-core/blobs.ts'
import { MAX_STRETCH, Skeleton, emptySkin, setWeights, skinBlob } from './rig.ts'
import { GRAD_STRIDE, weightGradients } from './stretch.ts'
import { buildSculpt, membrane } from './sculpt.ts'

/** A flat strip of skin from x = 0 to 1 between two bones, its weights running evenly from one to the other. */
function strip(step = 0.05) {
  const blobs = new Blobs()
  for (let x = 0; x <= 1.0001; x += step) for (let z = -0.2; z <= 0.2001; z += step) {
    blobs.push({ center: [x, 0, z], scale: [step * 0.75, step * 0.75, step * 0.3], quat: [0, 0, 0, 1], color: [1, 1, 1], opacity: 1 })
  }
  const skin = emptySkin(blobs.count)
  for (let i = 0; i < blobs.count; i++) { const x = blobs.center[i * 3]; setWeights(skin, i, [[0, 1 - x], [1, x]]) }
  const skeleton = new Skeleton([{ name: 'a', parent: -1, head: [0, 0, 0], tail: [0, 0, 1] }, { name: 'b', parent: -1, head: [1, 0, 0], tail: [1, 0, 1] }])
  return { blobs, skin, skeleton, step }
}

/** The blob nearest a place. */
function nearest(blobs: Blobs, p: number[]) {
  let best = 0, d = Infinity
  for (let i = 0; i < blobs.count; i++) {
    const e = Math.hypot(blobs.center[i * 3] - p[0], blobs.center[i * 3 + 1] - p[1], blobs.center[i * 3 + 2] - p[2])
    if (e < d) { d = e; best = i }
  }
  return best
}

test('skin on one bone has nothing to stretch', () => {
  const { blobs } = strip()
  const skin = emptySkin(blobs.count)
  for (let i = 0; i < blobs.count; i++) setWeights(skin, i, [[0, 1]])
  assert.equal(weightGradients(blobs, skin), null)
})

test('the gradient found from neighbors is how the weights were laid', () => {
  const { blobs, skin } = strip()
  const g = weightGradients(blobs, skin)!
  const i = nearest(blobs, [0.5, 0, 0])
  // setWeights puts the heavier bone first, so the second slot's weight changes by one per unit along x, either way
  assert.ok(Math.abs(Math.abs(g[i * GRAD_STRIDE]) - 1) < 0.05, `${g[i * GRAD_STRIDE]}`)
  assert.ok(Math.abs(g[i * GRAD_STRIDE + 1]) < 1e-6 && Math.abs(g[i * GRAD_STRIDE + 2]) < 0.02)
  // the empty slots have none
  for (let k = 3; k < GRAD_STRIDE; k++) assert.equal(g[i * GRAD_STRIDE + k], 0)
})

test('skin pulled out between two bones is pulled out blob by blob, and only along the pull', () => {
  const { blobs, skin, skeleton, step } = strip()
  const g = weightGradients(blobs, skin)!
  // the far bone slides off by the strip's own length: the strip is now twice as long
  skeleton.offset.set([1, 0, 0], 3)
  skeleton.update()
  const i = nearest(blobs, [0.5, 0, 0])
  const c = new Float32Array(3), plain = new Float32Array(6), pulled = new Float32Array(6)
  const args = [blobs.center.subarray(i * 3, i * 3 + 3), blobs.scale.subarray(i * 3, i * 3 + 3), blobs.quat.subarray(i * 4, i * 4 + 4), skin.joints.subarray(i * 4, i * 4 + 4), skin.weights.subarray(i * 4, i * 4 + 4), skeleton] as const
  for (const mode of ['quat', 'linear'] as const) {
    skinBlob(...args, mode, c, 0, plain, 0)
    skinBlob(...args, mode, c, 0, pulled, 0, g, i * GRAD_STRIDE)
    const s = step * 0.75
    assert.ok(Math.abs(Math.sqrt(plain[0]) - s) < 1e-6, 'without the gradients a blob keeps its size and gaps open')
    assert.ok(Math.abs(Math.sqrt(pulled[0]) / s - 2) < 0.1, `${mode}: twice as long along the pull, got ${Math.sqrt(pulled[0]) / s}`)
    assert.ok(Math.abs(Math.sqrt(pulled[5]) - step * 0.3) < 1e-4 && Math.abs(Math.sqrt(pulled[3]) - s) < 1e-4, 'and no wider or thicker')
  }
  // centers end up two steps apart, and the blobs still cover the gap as they did at rest
  const j = nearest(blobs, [0.5 + step, 0, 0])
  const d = new Float32Array(3)
  skinBlob(blobs.center.subarray(j * 3, j * 3 + 3), blobs.scale.subarray(j * 3, j * 3 + 3), blobs.quat.subarray(j * 4, j * 4 + 4), skin.joints.subarray(j * 4, j * 4 + 4), skin.weights.subarray(j * 4, j * 4 + 4), skeleton, 'quat', d, 0, plain, 0)
  assert.ok(Math.abs((d[0] - c[0]) / Math.sqrt(pulled[0]) - step / (step * 0.75)) < 0.1)
})

test('a blob never grows past the limit, however far its bones part', () => {
  const { blobs, skin, skeleton, step } = strip()
  const g = weightGradients(blobs, skin)!
  skeleton.offset.set([50, 0, 0], 3)
  skeleton.update()
  const i = nearest(blobs, [0.5, 0, 0])
  const c = new Float32Array(3), v = new Float32Array(6)
  skinBlob(blobs.center.subarray(i * 3, i * 3 + 3), blobs.scale.subarray(i * 3, i * 3 + 3), blobs.quat.subarray(i * 4, i * 4 + 4), skin.joints.subarray(i * 4, i * 4 + 4), skin.weights.subarray(i * 4, i * 4 + 4), skeleton, 'quat', c, 0, v, 0, g, i * GRAD_STRIDE)
  assert.ok(Math.sqrt(v[0]) <= step * 0.75 * (1 + MAX_STRETCH) + 1e-6)
})

test('blobs of another part, or of quite other weights, are not taken for the same skin', () => {
  const { blobs, skin } = strip()
  const partOf = new Uint16Array(blobs.count)
  // one side of the strip is another part, hung wholly on the first bone
  const other = emptySkin(blobs.count)
  for (let i = 0; i < blobs.count; i++) {
    partOf[i] = blobs.center[i * 3 + 2] < -0.01 ? 1 : 0
    const x = blobs.center[i * 3]
    setWeights(other, i, partOf[i] ? [[0, 1]] : [[0, 1 - x], [1, x]])
  }
  const plain = weightGradients(blobs, skin)!, parted = weightGradients(blobs, other, partOf)!
  // a blob on the seam
  const i = nearest(blobs, [0.5, 0, 0])
  assert.ok(Math.abs(Math.abs(parted[i * GRAD_STRIDE]) - Math.abs(plain[i * GRAD_STRIDE])) < 0.05)
  assert.ok(Math.abs(parted[i * GRAD_STRIDE + 2]) < 0.05, 'the other part beside it gives no slope across')
})

test('a fifth bone has run down to nothing by the time it is dropped', () => {
  const skin = emptySkin(2)
  // the fourth and fifth change places between these two blobs
  setWeights(skin, 0, [[0, 0.3], [1, 0.25], [2, 0.2], [3, 0.126], [4, 0.124]])
  setWeights(skin, 1, [[0, 0.3], [1, 0.25], [2, 0.2], [3, 0.124], [4, 0.126]])
  const of = (i: number, bone: number) => { let w = 0; for (let k = 0; k < 4; k++) if (skin.joints[i * 4 + k] === bone) w += skin.weights[i * 4 + k]; return w }
  for (let b = 0; b < 5; b++) assert.ok(Math.abs(of(0, b) - of(1, b)) < 0.02, `bone ${b}: ${of(0, b)} and ${of(1, b)}`)
  for (const i of [0, 1]) assert.ok(Math.abs(skin.weights[i * 4] + skin.weights[i * 4 + 1] + skin.weights[i * 4 + 2] + skin.weights[i * 4 + 3] - 1) < 1e-6)
  // with four or fewer nothing changes
  setWeights(skin, 0, [[0, 0.5], [1, 0.25], [2, 0.25]])
  assert.ok(Math.abs(skin.weights[0] - 0.5) < 1e-6 && Math.abs(skin.weights[1] - 0.25) < 1e-6)
})

test('a thin sheet lying a little off the grid is cut without rows of holes', () => {
  // a sheet as thin as the grid allows, tipped so it steps from one layer of cells to the next every few cells
  const s = 0.05, tip = 0.21
  const a: [number, number, number] = [0, 0, 0], b: [number, number, number] = [2, 0, 2 * tip], c: [number, number, number] = [2, 2, 2 * tip], d: [number, number, number] = [0, 2, 0]
  const built = buildSculpt({ bones: [{ name: 'root', parent: -1, head: [0, 0, 0], tail: [0, 1, 0] }], blend: 1, parts: [{ shape: membrane([[a, b, c], [a, c, d]], s * 0.6), color: [1, 1, 1], bones: ['root'] }] }, s)
  // every column of cells through the sheet's middle holds a blob
  const filled = new Set<string>()
  for (let i = 0; i < built.blobs.count; i++) filled.add(`${Math.round(built.blobs.center[i * 3] / s)},${Math.round(built.blobs.center[i * 3 + 1] / s)}`)
  let holes = 0, all = 0
  for (let x = 4; x <= 36; x++) for (let y = 4; y <= 36; y++) { all++; if (!filled.has(`${x},${y}`)) holes++ }
  assert.equal(holes, 0, `${holes} of ${all} columns through the sheet are empty`)
})
