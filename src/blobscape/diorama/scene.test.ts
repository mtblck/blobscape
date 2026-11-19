import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PALETTES } from './scene.ts'
import { LIGHTHOUSE } from './scenes/lighthouse.ts'
import { MAX_PALETTE_SIZE } from '../../splat-core/pixel.ts'
import { compileScene } from '../../splat-engine/sceneDoc.ts'
import { Skeleton } from '../../splat-engine/rig.ts'

test('the lighthouse moves as it did when it was code: lamp, boat, gulls, clouds, foam, pines, buoy and smoke, never the land', () => {
  const c = compileScene(LIGHTHOUSE)
  const sk = new Skeleton(c.bones)
  c.pose(sk, 1.3)
  const a = Float32Array.from(sk.matrix)
  c.pose(sk, 2.1)
  for (const name of ['lamp', 'boat', 'gull0', 'gull0L', 'cloud0', 'foam0', 'tree0', 'buoy', 'smoke0']) {
    const b = sk.index(name)
    let moved = 0
    for (let k = 0; k < 16; k++) moved += Math.abs(a[b * 16 + k] - sk.matrix[b * 16 + k])
    assert.ok(moved > 1e-3, `${name} did not move`)
  }
  for (let k = 0; k < 16; k++) assert.equal(a[k], sk.matrix[k])
  // the two beams stand on opposite sides of the tower
  const [l0, l1] = c.lights(3)
  assert.ok(Math.abs(l0.position[0] + l1.position[0] - 0.1) < 1e-9 && Math.abs(l0.position[2] + l1.position[2] + 0.1) < 1e-9)
})

test('every palette fits the pixel pass', () => {
  for (const p of PALETTES) assert.ok(p.colors.length <= MAX_PALETTE_SIZE, p.id)
})
