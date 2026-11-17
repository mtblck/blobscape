import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Mpm, svd3, slopeOf, type Material } from './mpm.ts'

/** A column of one material in the middle of the box, run for `seconds`. */
function column(m: Material, seconds: number, size = 0.2, height = 0.5): Mpm {
  const s = new Mpm()
  s.fillBox([0.5 - size / 2, 0.05, 0.5 - size / 2], [0.5 + size / 2, 0.05 + height, 0.5 + size / 2], m)
  s.advance(seconds)
  return s
}
const top = (s: Mpm) => { let t = 0; for (let p = 0; p < s.count; p++) t = Math.max(t, s.x[p * 3 + 1]); return t }
const speed = (s: Mpm) => { let e = 0; for (let p = 0; p < s.count; p++) e += s.v[p * 3] ** 2 + s.v[p * 3 + 1] ** 2 + s.v[p * 3 + 2] ** 2; return Math.sqrt(e / s.count) }

test('svd3 gives back the matrix from two rotations and the singular values', () => {
  let r = 7
  const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647 * 2 - 1 }
  const u = new Float64Array(9), s = new Float64Array(3), v = new Float64Array(9)
  const det = (m: Float64Array) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])
  for (let t = 0; t < 500; t++) {
    const f = Array.from({ length: 9 }, rand)
    if (t % 2) for (let i = 0; i < 9; i++) f[i] = (i % 4 === 0 ? 1 : 0) + f[i] * 0.05
    svd3(f, u, s, v)
    assert.ok(Math.abs(det(u) - 1) < 1e-9 && Math.abs(det(v) - 1) < 1e-9, 'U and V are rotations')
    assert.ok(s[0] >= s[1] - 1e-12 && s[1] >= Math.abs(s[2]) - 1e-12, `sorted: ${[...s]}`)
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      const g = u[a * 3] * s[0] * v[b * 3] + u[a * 3 + 1] * s[1] * v[b * 3 + 1] + u[a * 3 + 2] * s[2] * v[b * 3 + 2]
      assert.ok(Math.abs(g - f[a * 3 + b]) < 1e-9)
    }
  }
})

test('every step hands the grid exactly the mass of the particles, and nothing leaves the box or goes wrong', () => {
  const s = new Mpm()
  s.fillBox([0.3, 0.3, 0.3], [0.5, 0.6, 0.5], 'sand')
  s.fillBox([0.55, 0.1, 0.5], [0.7, 0.4, 0.7], 'goo', 2, [-1, 0, 0])
  s.fillBox([0.2, 0.05, 0.6], [0.4, 0.3, 0.8], 'snow', 3)
  for (let k = 0; k < 300; k++) {
    s.step()
    assert.ok(Math.abs(s.gridMass() - s.count * s.mass) < 1e-9 * s.count, `step ${k}: ${s.gridMass()} on the grid for ${s.count * s.mass}`)
  }
  for (let i = 0; i < s.count * 3; i++) assert.ok(Number.isFinite(s.x[i]) && s.x[i] > 0 && s.x[i] < 1)
})

test('in free fall with nothing to touch, a blob of goo keeps its momentum', () => {
  const s = new Mpm()
  s.gravity = 0
  s.fillBox([0.35, 0.4, 0.4], [0.5, 0.55, 0.55], 'goo', 1, [0.3, 0.1, -0.2])
  const total = () => { const m = [0, 0, 0]; for (let p = 0; p < s.count; p++) for (let k = 0; k < 3; k++) m[k] += s.v[p * 3 + k]; return m }
  const before = total()
  for (let k = 0; k < 100; k++) s.step()
  const after = total()
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(after[k] - before[k]) < 1e-6 * s.count, `momentum ${k}: ${before[k]} to ${after[k]}`)
})

test('a column of sand slumps into a heap at about its friction angle, and comes to rest', () => {
  const s = column('sand', 2.5)
  const angle = slopeOf(s, 0)
  assert.ok(angle > 20 && angle < 40, `the heap stands at ${angle.toFixed(1)}°`)
  assert.ok(top(s) < 0.25, `the heap is ${top(s)} tall`)
  assert.ok(speed(s) < 0.01, `still moving at ${speed(s)}`)
})

test('lower friction makes a flatter heap', () => {
  const steep = slopeOf(column('sand', 2.5), 0)
  const s = new Mpm({ friction: 20 })
  s.fillBox([0.4, 0.05, 0.4], [0.6, 0.55, 0.6], 'sand')
  s.advance(2.5)
  const flat = slopeOf(s, 0)
  assert.ok(flat < steep - 4, `${flat.toFixed(1)}° at 20 friction, ${steep.toFixed(1)}° at 32`)
})

test('snow holds a column where sand slumps into a heap, and goo runs flatter than either', () => {
  const sand = top(column('sand', 2)), snow = top(column('snow', 2)), goo = top(column('goo', 2))
  assert.ok(snow > sand + 0.2, `tops: sand ${sand}, snow ${snow}`)
  assert.ok(goo < sand - 0.03, `tops: sand ${sand}, goo ${goo}`)
})

test('goo pulled apart draws out slowly; snow hit hard gives for good', () => {
  // a slab pulled apart from the middle: sand flies apart at once, goo draws out slowly and keeps going
  const pulled = (m: Material) => {
    const g = new Mpm()
    g.gravity = 0
    g.fillBox([0.4, 0.4, 0.45], [0.6, 0.5, 0.55], m)
    for (let p = 0; p < g.count; p++) { g.v[p * 3] = 10 * (g.x[p * 3] - 0.5); g.C[p * 9] = 10 }
    const length = () => { let lo = 1, hi = 0; for (let p = 0; p < g.count; p++) { lo = Math.min(lo, g.x[p * 3]); hi = Math.max(hi, g.x[p * 3]) } return hi - lo }
    g.advance(0.3)
    const soon = length()
    g.advance(0.9)
    return [soon, length()]
  }
  const goo = pulled('goo'), sand = pulled('sand')
  assert.ok(goo[0] < sand[0] - 0.1, `goo ${goo[0]} long after 0.3 s, sand ${sand[0]}`)
  assert.ok(goo[1] > goo[0] + 0.15 && goo[1] > 0.45, `goo drew out from ${goo[0]} to ${goo[1]}`)
  // snow thrown at the floor gives for good: most of it packs or cracks, and stays that way
  const s = new Mpm()
  s.fillBox([0.4, 0.3, 0.4], [0.6, 0.5, 0.6], 'snow', 1, [0, -4, 0])
  s.advance(1)
  let gave = 0
  for (let p = 0; p < s.count; p++) if (Math.abs(s.Jp[p] - 1) > 0.01) gave++
  assert.ok(gave > s.count * 0.3, `${gave} of ${s.count} gave`)
})

test('a poke pushes what is near it and leaves the rest', () => {
  const s = new Mpm()
  s.gravity = 0
  s.fillBox([0.2, 0.4, 0.4], [0.3, 0.5, 0.5], 'sand', 1)
  const near = s.count
  s.fillBox([0.7, 0.4, 0.4], [0.8, 0.5, 0.5], 'sand', 2)
  s.poke([0.25, 0.45, 0.45], 0.12, [0, 2, 0])
  s.step()
  let up = 0, far = 0
  for (let p = 0; p < s.count; p++) if (p < near) up += s.v[p * 3 + 1]; else far += Math.abs(s.v[p * 3 + 1])
  assert.ok(up / near > 0.5 && far === 0, `near moves up ${up / near}, far ${far}`)
})
