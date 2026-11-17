import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evalSH, numbersPerBlob, projectSH, shBasis, sphereDirections } from './sh.ts'

test('the basis is orthonormal over the sphere', () => {
  const dirs = sphereDirections(4000)
  const n = dirs.length / 3
  const Y = new Float64Array(16)
  const gram = new Float64Array(256)
  for (let i = 0; i < n; i++) {
    shBasis(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2], Y)
    for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) gram[a * 16 + b] += (Y[a] * Y[b] * 4 * Math.PI) / n
  }
  for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) assert.ok(Math.abs(gram[a * 16 + b] - (a === b ? 1 : 0)) < 0.01, `<Y${a},Y${b}> = ${gram[a * 16 + b]}`)
})

test('projection gives back a smooth function, and degree 0 is its average', () => {
  const dirs = sphereDirections(2000)
  const f = (x: number, y: number, z: number): [number, number, number] => [0.5 + 0.3 * x, 0.2 + 0.1 * y * z, 0.4]
  const c = projectSH(f, dirs)
  for (const [x, y, z] of [[1, 0, 0], [0, 0.6, 0.8], [-0.48, 0.6, -0.64]]) {
    const got = evalSH(c, 3, x, y, z)
    const want = f(x, y, z)
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(got[k] - want[k]) < 0.01, `${got} vs ${want}`)
  }
  const flat = evalSH(c, 0, 1, 0, 0)
  assert.ok(Math.abs(flat[0] - 0.5) < 0.01 && Math.abs(flat[2] - 0.4) < 0.01)
})

test('numbers per blob', () => {
  assert.deepEqual([0, 1, 2, 3].map(numbersPerBlob), [14, 23, 38, 59])
})

test('file order: viewColor with toFileOrder terms matches evalSH', async () => {
  const { toFileOrder, viewColor } = await import('./sh.ts')
  const dirs = sphereDirections(2000)
  const c = projectSH((x, y, z) => [0.5 + 0.3 * x - 0.1 * y, 0.4 + 0.2 * x * z, 0.3 + 0.2 * z * z * y], dirs)
  for (const deg of [1, 2, 3]) {
    const rest = toFileOrder(c, deg)
    for (const [x, y, z] of [[1, 0, 0], [0, 0.6, 0.8], [-0.48, 0.6, -0.64]]) {
      const want = evalSH(c, deg, x, y, z)
      const base = evalSH(c, 0, x, y, z)
      const got = viewColor(base, rest, 0, [0, 3, 8, 15][deg], [x, y, z])
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(got[k] - Math.max(0, Math.min(1, want[k]))) < 1e-6, `deg ${deg}: ${got} vs ${want}`)
    }
  }
})

test('blobs keep their terms through filter, clone and growth', async () => {
  const { Blobs } = await import('./blobs.ts')
  const b = new Blobs(2)
  b.setSHDegree(1)
  for (let i = 0; i < 5; i++) {
    b.push({ center: [i, 0, 0], scale: [1, 1, 1], quat: [0, 0, 0, 1], color: [0.5, 0.5, 0.5], opacity: 1 })
    b.sh!.fill(i, i * 9, i * 9 + 9)
  }
  b.filter((i) => i % 2 === 0)
  assert.deepEqual([...b.sh!.subarray(0, 27)].filter((_, k) => k % 9 === 0), [0, 2, 4])
  const c = b.clone()
  assert.equal(c.shDegree, 1)
  assert.deepEqual([...c.sh!.subarray(0, 27)], [...b.sh!.subarray(0, 27)])
  b.push({ center: [9, 0, 0], scale: [1, 1, 1], quat: [0, 0, 0, 1], color: [0.5, 0.5, 0.5], opacity: 1 })
  assert.deepEqual([...b.sh!.subarray(27, 36)], new Array(9).fill(0))
  b.setSHDegree(2)
  assert.equal(b.sh!.length, b.capacity * 24)
  assert.equal(b.sh![2 * 24], 4)
})

test('turned terms show the old colors from the turned way', async () => {
  const { fileBasis, turnSH } = await import('./sh.ts')
  const { quatFromEuler, quatToMat } = await import('../splat-core/blobs.ts')
  for (const degree of [1, 2, 3]) {
    const terms = [0, 3, 8, 15][degree]
    const sh = Float32Array.from({ length: 2 * terms * 3 }, (_, k) => Math.sin(k * 1.7) * 0.5)
    const old = sh.slice()
    const q = quatFromEuler(30, -50, 110)
    turnSH(sh, degree, 2, q, (i) => i === 1)
    assert.deepEqual([...sh.subarray(0, terms * 3)], [...old.subarray(0, terms * 3)])
    const R = quatToMat(q), Y = new Float64Array(16), Y2 = new Float64Array(16)
    const sum = (c: Float32Array, at: number, ch: number, Yv: Float64Array) => { let s = 0; for (let k = 0; k < terms; k++) s += c[at + k * 3 + ch] * Yv[k + 1]; return s }
    for (const [x, y, z] of [[1, 0, 0], [0, 0.6, 0.8], [-0.48, 0.6, -0.64]]) {
      fileBasis(x, y, z, Y)
      // Rᵀd: where this way came from before the turn
      fileBasis(R[0] * x + R[3] * y + R[6] * z, R[1] * x + R[4] * y + R[7] * z, R[2] * x + R[5] * y + R[8] * z, Y2)
      for (let ch = 0; ch < 3; ch++) assert.ok(Math.abs(sum(sh, terms * 3, ch, Y) - sum(old, terms * 3, ch, Y2)) < 1e-5, `degree ${degree}`)
    }
  }
})
