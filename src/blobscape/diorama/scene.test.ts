import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PALETTES } from './scene.ts'
import { LIGHTHOUSE } from './scenes/lighthouse.ts'
import { MAX_PALETTE_SIZE } from '../../splat-core/pixel.ts'
import { compileScene } from '../../splat-engine/sceneDoc.ts'
import { Skeleton } from '../../splat-engine/rig.ts'
import { SceneWater } from '../../splat-engine/sceneWater.ts'

test('the lighthouse moves as it did when it was code: lamp, gulls, clouds, foam, pines and smoke, never the land, and the boat and buoy ride the sea', () => {
  const c = compileScene(LIGHTHOUSE)
  const sk = new Skeleton(c.bones)
  c.pose(sk, 1.3)
  const a = Float32Array.from(sk.matrix)
  c.pose(sk, 2.1)
  const movedSince = (name: string) => {
    const b = sk.index(name)
    let moved = 0
    for (let k = 0; k < 16; k++) moved += Math.abs(a[b * 16 + k] - sk.matrix[b * 16 + k])
    return moved
  }
  for (const name of ['lighthouse0/lamp', 'gull0', 'gull0L', 'foam0', 'tall-pine2/tree0', 'keeper-s-cottage1/smoke0']) assert.ok(movedSince(name) > 1e-3, `${name} did not move`)
  for (let k = 0; k < 16; k++) assert.equal(a[k], sk.matrix[k])
  // the boat and the buoy ride the sea's swells
  const sea = new SceneWater(c, { fps: 6, warm: 1 })
  c.pose(sk, 1.3); sea.ride(sk, 1.3); a.set(sk.matrix)
  c.pose(sk, 4.1); sea.ride(sk, 4.1)
  for (const name of ['sailing-boat6/boat', 'buoy7/buoy']) assert.ok(movedSince(name) > 1e-3, `${name} did not ride the water`)
  // the two beams stand on opposite sides of the tower
  const [l0, l1] = c.lights(3)
  assert.ok(Math.abs(l0.position[0] + l1.position[0] - 0.1) < 1e-9 && Math.abs(l0.position[2] + l1.position[2] + 0.1) < 1e-9)
})

test('every palette fits the pixel pass', () => {
  for (const p of PALETTES) assert.ok(p.colors.length <= MAX_PALETTE_SIZE, p.id)
})
