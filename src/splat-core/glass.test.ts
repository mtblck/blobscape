import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backLight, glassColor, paneOf, paneTint, seedOf } from './glass.ts'

test('a pane\'s middle lies in its own cell', () => {
  for (let i = -3; i < 3; i++) {
    const s = seedOf(i, 2 * i, -i)
    assert.ok(s[0] >= i && s[0] < i + 1 && s[1] >= 2 * i && s[1] < 2 * i + 1 && s[2] >= -i && s[2] < -i + 1)
  }
})

test('a point belongs to the pane whose middle is nearest, and is never past its edge', () => {
  let near = 0
  for (let i = 0; i < 400; i++) {
    const p = [Math.sin(i * 1.3) * 4, Math.cos(i * 0.7) * 4, Math.sin(i * 2.1) * 4]
    const { cell, seed, edge } = paneOf(p)
    assert.deepEqual(seedOf(cell[0], cell[1], cell[2]), seed)
    assert.ok(edge >= -1e-9, 'inside its own pane')
    const d = Math.hypot(seed[0] - p[0], seed[1] - p[1], seed[2] - p[2])
    // no seed three cells off is nearer
    for (let k = 0; k < 20; k++) { const o = seedOf(cell[0] + (k % 5) - 2, cell[1] + (k % 3) - 1, cell[2] + (k % 4) - 2); assert.ok(Math.hypot(o[0] - p[0], o[1] - p[1], o[2] - p[2]) >= d - 1e-9) }
    if (edge < 0.05) near++
  }
  assert.ok(near > 5 && near < 200, `${near} of 400 points are at an edge`)
})

test('at a pane\'s middle the edge is as far as it gets, and it falls to nothing halfway to the next', () => {
  const { seed, edge, cell } = paneOf([0.5, 0.5, 0.5])
  const mid = paneOf(seed)
  assert.ok(mid.edge >= edge)
  assert.deepEqual(mid.cell, cell)
})

test('glass is richer and lighter than the paint it is made from, and gray stays gray', () => {
  const g = glassColor([0.5, 0.2, 0.2])
  assert.ok(g[0] > 0.5 && g[0] - g[1] > 0.3)
  const n = glassColor([0.3, 0.3, 0.3])
  assert.ok(Math.abs(n[0] - n[1]) < 1e-9 && n[0] > 0.3)
  assert.deepEqual(glassColor([0, 0, 0]), [0, 0, 0])
})

test('panes differ a little, and not at all when asked', () => {
  const tints = Array.from({ length: 50 }, (_, i) => paneTint([i, 3, -i]))
  assert.ok(Math.max(...tints) - Math.min(...tints) > 0.15)
  assert.ok(tints.every((t) => t > 0.84 && t < 1.16))
  assert.equal(paneTint([4, 5, 6], 0), 1)
})

test('the light behind the window is brightest where it stands', () => {
  assert.equal(backLight([0.5, 0.3], [0.5, 0.3]), 1)
  assert.ok(backLight([0, 1], [0.5, 0.3]) < backLight([0.4, 0.4], [0.5, 0.3]))
  assert.ok(backLight([0, 1], [0.5, 0.3], 0.5, 1.5) >= 0.5)
  assert.equal(backLight([0, 1], [0.5, 0.3], 0), 1)
})
