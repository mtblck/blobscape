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
