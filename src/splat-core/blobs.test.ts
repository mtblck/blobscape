import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Blobs, covariance, pick, project, quatFacing, quatFromEuler, quatToMat, rayHit, type Lens } from './blobs.ts'

// A camera at the origin looking down −Z (the identity view matrix), 800×600, focal 500 px.
const lens: Lens = { view: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], width: 800, height: 600, fx: 500, fy: 500, ortho: false }

const one = (center: [number, number, number], scale: [number, number, number], quat: [number, number, number, number] = [0, 0, 0, 1]) => {
  const b = new Blobs()
  b.push({ center, scale, quat, color: [1, 0, 0], opacity: 1 })
  return b
}

test('a round blob straight ahead projects to a circle of scale·focal/depth pixels', () => {
  const f = project(one([0, 0, -5], [0.5, 0.5, 0.5]), 0, lens)!
  assert.equal(f.x, 400)
  assert.equal(f.y, 300)
  assert.ok(Math.abs(f.a - 50) < 1e-4 && Math.abs(f.b - 50) < 1e-4, `${f.a} ${f.b}`)
})

test('a blob behind the camera has no footprint', () => {
  assert.equal(project(one([0, 0, 5], [1, 1, 1]), 0, lens), null)
})

test('the projected covariance matches sampling the 3D Gaussian and projecting each point', () => {
  // Stretched, tilted, off to one side: everything the Jacobian has to get right
  const b = one([0.8, -0.4, -6], [0.3, 0.08, 0.15], quatFromEuler(20, 30, 40))
  const f = project(b, 0, lens)!
  const R = quatToMat(b.quat)
  let seed = 9
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand())
  const us: number[] = [], vs: number[] = []
  for (let k = 0; k < 40000; k++) {
    const l = [gauss() * 0.3, gauss() * 0.08, gauss() * 0.15]
    const p = [0, 1, 2].map((r) => b.center[r] + R[r * 3] * l[0] + R[r * 3 + 1] * l[1] + R[r * 3 + 2] * l[2])
    us.push(400 + (500 * p[0]) / -p[2])
    vs.push(300 - (500 * p[1]) / -p[2])
  }
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
  const mu = mean(us), mv = mean(vs)
  const cuu = mean(us.map((u) => (u - mu) ** 2)), cvv = mean(vs.map((v) => (v - mv) ** 2))
  const cuv = mean(us.map((u, i) => (u - mu) * (vs[i] - mv)))
  // Errors measured against the ellipse's overall size, so a near-zero xy term isn't judged on its own
  const unit = Math.sqrt(cuu * cvv)
  const close = (a: number, e: number) => Math.abs(a - e) / unit < 0.04
  assert.ok(close(f.cov[0], cuu), `xx ${f.cov[0]} vs ${cuu}`)
  assert.ok(close(f.cov[2], cvv), `yy ${f.cov[2]} vs ${cvv}`)
  assert.ok(close(f.cov[1], cuv), `xy ${f.cov[1]} vs ${cuv}`)
  assert.ok(Math.abs(cuv) / unit > 0.2, 'the test blob should be tilted on screen')
})

test('covariance of an unrotated blob is the squared scales on the diagonal', () => {
  const c = covariance(one([0, 0, 0], [1, 2, 3]), 0)
  assert.deepEqual(c.map((v) => Math.round(v * 1e6) / 1e6), [1, 0, 0, 4, 0, 9])
})

test('a ray hits a blob where it enters its 2σ ellipsoid', () => {
  const b = one([0, 0, -5], [1, 1, 1])
  const t = rayHit(b, 0, [0, 0, 0], [0, 0, -1], 2)
  assert.ok(Math.abs(t - 3) < 1e-9, `${t}`)
  assert.equal(rayHit(b, 0, [0, 3, 0], [0, 0, -1], 2), -1)
})

test('pick returns the nearest blob and skips invisible ones', () => {
  const b = new Blobs()
  b.push({ center: [0, 0, -8], scale: [1, 1, 1], quat: [0, 0, 0, 1], color: [0, 0, 1], opacity: 1 })
  b.push({ center: [0, 0, -4], scale: [0.5, 0.5, 0.5], quat: [0, 0, 0, 1], color: [1, 0, 0], opacity: 1 })
  b.push({ center: [0, 0, -2], scale: [0.5, 0.5, 0.5], quat: [0, 0, 0, 1], color: [0, 1, 0], opacity: 0.01 })
  assert.equal(pick(b, [0, 0, 0], [0, 0, -1]).index, 1)
})

test('quatFacing turns +Z onto the given normal', () => {
  for (const n of [[0, 1, 0], [1, 0, 0], [0, 0, -1], [0.6, 0.8, 0]]) {
    const R = quatToMat(quatFacing(n))
    const z = [R[2], R[5], R[8]]
    z.forEach((v, i) => assert.ok(Math.abs(v - n[i]) < 1e-9, `${n} → ${z}`))
  }
})

test('filter keeps order and clone is independent', () => {
  const b = new Blobs(2)
  for (let i = 0; i < 5; i++) b.push({ center: [i, 0, 0], scale: [1, 1, 1], quat: [0, 0, 0, 1], color: [0, 0, 0], opacity: 1 })
  const c = b.clone()
  assert.equal(b.filter((i) => i % 2 === 0), 2)
  assert.deepEqual([...b.center.subarray(0, b.count * 3)].filter((_, k) => k % 3 === 0), [0, 2, 4])
  assert.equal(c.count, 5)
})
