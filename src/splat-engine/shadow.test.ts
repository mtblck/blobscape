import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OCC_SCALE, REACH, blobSigma, occupancy, shadowBox, transmittance } from './shadow.ts'

// a floor of flat discs on y = 0, 4 m square, 5 cm apart, and a wall standing on it at x = 0.5
function scene(wall = true) {
  const pts: number[] = [], sig: number[] = [], op: number[] = []
  for (let x = -2; x <= 2; x += 0.05) for (let z = -2; z <= 2; z += 0.05) { pts.push(x, 0, z); sig.push(0.03); op.push(1) }
  if (wall) for (let y = 0.05; y <= 1.2; y += 0.05) for (let z = -1; z <= 1; z += 0.05) { pts.push(0.5, y, z); sig.push(0.03); op.push(1) }
  return { pts: new Float32Array(pts), sig: new Float32Array(sig), op: new Float32Array(op), count: sig.length }
}
const box = shadowBox([-2.1, -0.1, -2.1], [2.1, 1.3, 2.1])

test('a wall between a point on the floor and a light blocks it; with no wall the light gets through', () => {
  const s = scene(), g = occupancy(s.pts, 3, s.sig, s.op, s.count, box)
  const behind = transmittance(g, box, [1.2, 0, 0], [0, 1, 0], [-0.4, 0.8, 0])
  assert.ok(behind < 0.05, `${behind}`)
  const open = scene(false), g2 = occupancy(open.pts, 3, open.sig, open.op, open.count, box)
  assert.ok(transmittance(g2, box, [1.2, 0, 0], [0, 1, 0], [-0.4, 0.8, 0]) > 0.97)
  // and the same spot lit from its own side of the wall is lit
  assert.ok(transmittance(g, box, [1.2, 0, 0], [0, 1, 0], [1.8, 0.8, 0]) > 0.97)
})

test('a floor does not shadow itself, from overhead or from a low light', () => {
  const s = scene(false), g = occupancy(s.pts, 3, s.sig, s.op, s.count, box)
  assert.ok(transmittance(g, box, [0.3, 0, 0.2], [0, 1, 0], [0.3, 1.5, 0.2]) > 0.99)
  // 20 degrees up, two meters away
  const low = transmittance(g, box, [-1, 0, 0], [0, -1, 0], [1, Math.tan(20 * Math.PI / 180) * 2, 0])
  assert.ok(low > 0.9, `${low}`)
})

test('the grid fits the world: a flat hall gets small cells, never more than the budget', () => {
  const b = shadowBox([-7, 0, -7], [7, 4, 7])
  assert.ok(b.dims[0] * b.dims[1] * b.dims[2] <= 64 ** 3)
  assert.ok(b.cell < 0.16, `${b.cell}`)
  for (let k = 0; k < 3; k++) assert.ok(b.origin[k] <= [-7, 0, -7][k] && b.origin[k] + b.dims[k] * b.cell >= [7, 4, 7][k])
})

test('blobs smaller than a cell add up by the share of the cell they cover; nothing outside the grid counts', () => {
  const b = shadowBox([-1, -1, -1], [1, 1, 1], 64) // four cells a side, about half a meter each
  assert.deepEqual(b.dims, [4, 4, 4])
  const tiny = occupancy([0.25, 0.25, 0.25], 3, [0.05], [1], 1, b)
  const want = Math.round(((REACH * 0.05) / b.cell) ** 2 * OCC_SCALE)
  assert.equal(tiny.reduce((s, v) => s + v, 0), want)
  assert.equal(occupancy([9, 9, 9], 3, [0.05], [1], 1, b).reduce((s, v) => s + v, 0), 0)
  assert.equal(blobSigma([0.04, 0, 0, 0.01, 0, 0.09]), 0.3)
})

test('a sun casts the wall\'s shadow away from itself, longer as it sinks, and a march that leaves the grid stops', () => {
  const s = scene(), g = occupancy(s.pts, 3, s.sig, s.op, s.count, box)
  const sun = (deg: number): [number, number, number] => [-Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180), 0]
  // the wall is 1.2 high at x = 0.5 and the sun is in the west (−x): its shadow falls east of the wall
  const at = (x: number, deg: number) => transmittance(g, box, [x, 0, 0], [0, 1, 0], sun(deg), true)
  assert.ok(at(1.0, 60) < 0.1, `near the wall under a high sun: ${at(1.0, 60)}`)
  assert.ok(at(1.9, 60) > 0.95, `past the shadow's end under a high sun: ${at(1.9, 60)}`)
  assert.ok(at(1.9, 30) < 0.1, `the same spot under a low sun: ${at(1.9, 30)}`)
  // the sunny side is lit at any height of sun, and the length of the direction doesn't matter
  assert.ok(at(-0.5, 30) > 0.95 && at(-0.5, 60) > 0.95)
  const d = sun(30)
  assert.equal(transmittance(g, box, [1.9, 0, 0], [0, 1, 0], [d[0] * 7, d[1] * 7, 0], true), at(1.9, 30))
})

test('a denser shadow lets less through the same wall, and nothing changes where nothing is in the way', () => {
  const s = scene(), g = occupancy(s.pts, 3, s.sig, s.op, s.count, box)
  const west: [number, number, number] = [-Math.cos(Math.PI / 4), Math.sin(Math.PI / 4), 0]
  // a spot whose line to the sun just clips the wall's top, so some light gets by
  const soft = transmittance(g, box, [1.55, 0, 0], [0, 1, 0], west, true), hard = transmittance(g, box, [1.55, 0, 0], [0, 1, 0], west, true, 5)
  assert.ok(hard <= soft && soft < 1, `${soft} ${hard}`)
  assert.ok(hard < soft ** 3 + 1e-9)
  assert.equal(transmittance(g, box, [-0.5, 0, 0], [0, 1, 0], west, true, 5), 1)
})
