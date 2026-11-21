import test from 'node:test'
import assert from 'node:assert/strict'
import { unlit } from '../../splat-engine/voxel.ts'
import { described } from '../diorama/scenes.ts'
import { makeIsland } from './island.ts'
import { material } from './materials.ts'
import { PER_BLADE, PER_FLOWER, growGrass } from './grass.ts'

const unit = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255)

// one island, cut once for both tests (the cut is most of their time)
const cell = 0.12
const made = makeIsland('meadow', 7)
let kept: ReturnType<ReturnType<typeof described>['make']> | undefined
const cutOnce = () => (kept ??= unlit(() => described('island', made.doc, 'test').make(cell)))

test('grass grows on the turf tops of an island cut for blocks, each blade standing on a cube', () => {
  const cut = cutOnce()
  const ramp = material(made.biome.ground.top).ramp.map(unit)
  const grass = growGrass({ blobs: cut.blobs, joints: cut.skin.joints }, { cell, ramp, blades: 3000, seed: 7 })
  const blades = grass.count / PER_BLADE
  assert.ok(blades > 1000 && blades <= 3000, `${blades} blades`)
  // every blade's foot blob sits just over a cube's top: a whole number of cells plus a half, and a little more
  for (let b = 0; b < blades; b++) {
    const y = grass.center[b * PER_BLADE * 3 + 1], over = y / cell - 0.5 - Math.round(y / cell - 0.5)
    assert.ok(over > -0.01 && over < 0.5, `blade ${b} at ${y}`)
  }
  // colors stay in the turf's family: green over red and blue
  for (let i = 0; i < grass.count; i++) assert.ok(grass.color[i * 3 + 1] > grass.color[i * 3] && grass.color[i * 3 + 1] > grass.color[i * 3 + 2])
})

test('wildflowers grow in bunches of their own colors on the turf', () => {
  const cut = cutOnce()
  const ramp = material(made.biome.ground.top).ramp.map(unit)
  const kinds = made.biome.wildflowers.map((id) => material(id).ramp.map(unit))
  const plain = growGrass({ blobs: cut.blobs, joints: cut.skin.joints }, { cell, ramp, blades: 2000, seed: 7 })
  const both = growGrass({ blobs: cut.blobs, joints: cut.skin.joints }, { cell, ramp, blades: 2000, seed: 7, flowers: { kinds, bunches: 40 } })
  const flowers = (both.count - plain.count) / PER_FLOWER
  assert.ok(flowers > 40 * 3 && flowers < 40 * 1.5 * 11, `${flowers} flowers`)
  // each flower's head is one of the kinds' colors, mixed only between its own steps
  for (let f = 0; f < flowers; f++) {
    const i = plain.count + f * PER_FLOWER + 1, col = [both.color[i * 3], both.color[i * 3 + 1], both.color[i * 3 + 2]]
    assert.ok(kinds.some((k) => Math.hypot(col[0] - k[1][0], col[1] - k[1][1], col[2] - k[1][2]) < 0.4), `flower ${f} ${col}`)
  }
  // bunched: most flowers have another within a couple of cells
  let near = 0
  for (let f = 0; f < flowers; f++) {
    const i = plain.count + f * PER_FLOWER + 1
    for (let g = 0; g < flowers; g++) {
      const j = plain.count + g * PER_FLOWER + 1
      if (g !== f && Math.hypot(both.center[i * 3] - both.center[j * 3], both.center[i * 3 + 2] - both.center[j * 3 + 2]) < cell * 2.5) { near++; break }
    }
  }
  assert.ok(near > flowers * 0.8, `${near} of ${flowers} in bunches`)
})
