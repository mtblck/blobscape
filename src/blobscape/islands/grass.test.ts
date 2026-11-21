import test from 'node:test'
import assert from 'node:assert/strict'
import { unlit } from '../../splat-engine/voxel.ts'
import { described } from '../diorama/scenes.ts'
import { makeIsland } from './island.ts'
import { material } from './materials.ts'
import { PER_BLADE, growGrass } from './grass.ts'

const unit = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255)

test('grass grows on the turf tops of an island cut for blocks, each blade standing on a cube', () => {
  const made = makeIsland('meadow', 7)
  const cell = 0.12
  const cut = unlit(() => described('island', made.doc, 'test').make(cell))
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
