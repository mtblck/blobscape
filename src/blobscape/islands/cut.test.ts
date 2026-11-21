import test from 'node:test'
import assert from 'node:assert/strict'
import { compileScene, type SceneDoc } from '../../splat-engine/sceneDoc.ts'
import { buildVoxels } from '../../splat-engine/voxel.ts'
import { seeThrough } from '../../splat-engine/solidity.ts'
import { DETAIL } from '../diorama/scene.ts'
import { reviewScene } from '../diorama/review.ts'
import { BIOMES } from './biomes.ts'
import { makeIsland } from './island.ts'
import { SOLID, letsThrough, material, opaque } from './materials.ts'

// The tests that cut an island into blobs. At the page's coarsest detail an island is about 950,000 blobs and takes
// minutes to cut and look through, so here it is cut on a grid three times as coarse: a ninth of the blobs. What is
// measured does not depend on the grid: the discs are sized by it (SOLID), and a default cut fails as clearly at this
// size as at the page's (10% to 42% seen through, against under 1.5% for a SOLID one).
const COARSE = DETAIL[0].spacing * 3

test('what the library says lets no light through is cut so none gets through', () => {
  // glass, water and cloud let light through; ground, rock, wood and leaves do not
  for (const id of ['granite', 'loam', 'oak', 'meadow-turf', 'sandstone', 'oak-leaf']) assert.ok(opaque(material(id)), id)
  for (const id of ['ice', 'pond-water', 'cloud']) assert.ok(letsThrough(material(id)) > 0, id)
  // a rough boulder and a worn slope, cut as a scene cuts them by default and as SOLID: from above, beside and below
  const doc = (more: Partial<SceneDoc>): SceneDoc => ({
    name: 'solid', loop: 12, palette: ['#000000', '#ffffff'], camera: { target: [0, 0, 0], distance: 4, azimuth: 0, elevation: 20 }, ...more,
    parts: [
      { shape: { kind: 'rough', shape: { kind: 'ball', at: [-0.6, 0.3, 0], r: [0.45, 0.35, 0.4] }, by: 0.05, scale: 0.35 }, paint: '#ffffff' },
      { shape: { kind: 'land', at: [0.7, 0, 0], half: [0.6, 0.6], base: 0.3, peaks: [{ at: [0, 0], h: 0.5, r: 0.5 }], drops: 3000, seed: 3 }, paint: '#ffffff' },
    ],
  })
  const ways: [number, number, number][] = [[0.5, -0.6, 0.62], [1, -0.15, 0.3], [-0.4, 0.8, 0.3]]
  const worst = (d: SceneDoc) => {
    const spec = compileScene(d).spec(DETAIL[0].spacing), built = buildVoxels(spec)
    return Math.max(...ways.map((w) => seeThrough(built.blobs, built.partOf, spec.parts.map((p) => p.shape), [0, 1], w, DETAIL[0].spacing).seen))
  }
  assert.ok(worst(doc({})) > 0.05, 'the check finds the light a default cut lets through')
  assert.ok(worst(doc(SOLID)) < 0.02, 'a SOLID cut lets none through')
})

test('an island lets no light through its ground, rock or stones, seen from above, beside or below', () => {
  // Matt saw through the first island's paths from above, beside and below (2026-11-20)
  const spacing = COARSE
  for (const b of BIOMES) {
    const { doc, solid } = makeIsland(b.id, 37)
    const spec = compileScene(doc).spec(spacing), built = buildVoxels(spec), shapes = spec.parts.map((p) => p.shape)
    for (const way of [[0.5, -0.6, 0.62], [1, -0.15, 0.3], [-0.4, 0.8, 0.3]] as [number, number, number][]) {
      const r = seeThrough(built.blobs, built.partOf, shapes, solid, way, spacing, { pixel: spacing })
      assert.ok(r.solid > 1000, `${b.id}: looked at too little`)
      assert.ok(r.seen < 0.02 && r.holes < 0.002, `${b.id} along ${way}: ${(r.seen * 100).toFixed(1)}% shows what is behind, at ${JSON.stringify(r.worst)}`)
    }
  }
})

test('an island passes the checks a scene written by hand passes', () => {
  for (const b of BIOMES) {
    const review = reviewScene(makeIsland(b.id, 7).doc, COARSE * 1.5)
    assert.deepEqual(review.problems, [], b.id)
    assert.ok(review.facts && review.facts.blobs > 3000)
  }
})
