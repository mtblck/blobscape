import test from 'node:test'
import assert from 'node:assert/strict'
import { checkScene, compileScene, type SceneDoc } from '../../splat-engine/sceneDoc.ts'
import { buildVoxels } from '../../splat-engine/voxel.ts'
import { seeThrough } from '../../splat-engine/solidity.ts'
import { DETAIL } from '../diorama/scene.ts'
import { MAX_PROPS, markedPicks } from '../../splat-engine/project.ts'
import { wornLand } from '../../splat-engine/erode.ts'
import { reviewScene } from '../diorama/review.ts'
import { describedProject } from '../creator/described.ts'
import { BIOMES, MEADOW } from './biomes.ts'
import { MAX_SEED, census, fromPath, inside, islandDoc, makeIsland, planIsland } from './island.ts'
import { MATERIALS, SOLID, colorsOf, dressed, family, leaning, letsThrough, material, opaque, paintOf } from './materials.ts'
import { ROOM } from './things.ts'

const SEEDS = [1, 2, 3, 7, 42, 77, 500, 4242, 31337, 90210, 123456, MAX_SEED]

test('every material has a ramp of three or four colors, and its paint uses only those', () => {
  const ids = new Set<string>()
  for (const m of MATERIALS) {
    assert.ok(!ids.has(m.id), `${m.id} is listed twice`)
    ids.add(m.id)
    assert.ok(m.ramp.length >= 3 && m.ramp.length <= 4, `${m.id}: a ramp of ${m.ramp.length}`)
    for (const c of m.ramp) assert.match(c, /^#[0-9a-f]{6}$/, `${m.id}: ${c}`)
    if (m.grime) material(m.grime)
    for (const seed of SEEDS) {
      const text = JSON.stringify(paintOf(m, seed))
      for (const c of text.match(/#[0-9a-f]{6}/g) ?? []) assert.ok(m.ramp.includes(c), `${m.id}: paints ${c}, which is not in its ramp`)
    }
  }
  assert.throws(() => material('unobtainium'))
  assert.ok(family('wood').length >= 3 && family('rock').length >= 3)
})

test('a seed leans a material lighter or darker without changing its main color', () => {
  const oak = material('oak')
  const firsts = new Set(SEEDS.map((s) => leaning(oak, s)[0])), seconds = new Set(SEEDS.map((s) => leaning(oak, s)[1]))
  assert.deepEqual([...firsts], [oak.ramp[1]])
  assert.equal(seconds.size, 2, 'both neighbors of the main step lead for some seeds')
  assert.deepEqual(paintOf(oak, 5), paintOf(oak, 5))
  // glass and glow come through to the part
  assert.equal(dressed(material('poppy')).glow, true)
  assert.ok(dressed(material('ice')).glass && dressed(material('ice')).bare)
  assert.ok(colorsOf(['granite']).includes(material('moss').ramp[1]), 'the moss that gathers on granite is one of its colors')
})

test('every recipe names materials the library has', () => {
  for (const b of BIOMES) {
    for (const id of [b.ground.top, b.ground.soil, b.ground.path, ...b.ground.rock]) material(id)
    for (const p of [...b.lives, ...b.landmarks]) for (const ids of Object.values(p.made)) for (const id of ids) material(id)
    assert.ok(b.landmarks.length > 0 && b.lives.length > 0)
  }
})

test('the same biome and seed give the same island, and another seed another', () => {
  const a = makeIsland('meadow', 42), b = makeIsland('meadow', 42), c = makeIsland('meadow', 43)
  assert.deepEqual(a.doc, b.doc)
  assert.notDeepEqual(a.doc, c.doc)
  assert.equal(makeIsland('nowhere', 42).biome.id, 'meadow')
})

test('every island is a sound scene description that reads the same as JSON', () => {
  for (const b of BIOMES) for (const seed of SEEDS) {
    const { doc } = makeIsland(b.id, seed)
    assert.deepEqual(checkScene(doc), [], `${b.id} ${seed}`)
    assert.deepEqual(JSON.parse(JSON.stringify(doc)), doc, `${b.id} ${seed}: holds something JSON does not keep`)
    assert.ok(doc.palette.length <= 32)
  }
  // a wide spread of seeds, for the limits a description has (surface, bones, parts)
  for (const b of BIOMES) for (let seed = 1; seed <= 25; seed++) assert.deepEqual(checkScene(makeIsland(b.id, seed * 37).doc), [], `${b.id} ${seed * 37}`)
})

test('things stand on the island, on its ground, off the path and clear of each other', () => {
  for (const b of BIOMES) for (const seed of SEEDS.slice(0, 6)) {
    const plan = planIsland(b, seed), ground = wornLand(plan.land)
    assert.ok(plan.things.length >= 30, `${b.id} ${seed}: only ${plan.things.length} things`)
    assert.equal(plan.landmarks, 2, `${b.id} ${seed}: two landmarks`)
    assert.notEqual(plan.things[0].name, plan.things[1].name, `${b.id} ${seed}: two different landmarks`)
    for (const t of plan.things.slice(0, 2)) assert.ok(b.landmarks.some((l) => l.name === t.name), `${b.id} ${seed}: the landmarks come first`)
    assert.ok(plan.patches.length >= 3, `${b.id} ${seed}: kinds of place inside it`)
    plan.things.forEach((t, i) => {
      const room = ROOM[t.kind] * t.size
      assert.ok(inside(plan.lobes, t.at[0], t.at[2]) > 0.04, `${b.id} ${seed}: ${t.name} is over the edge`)
      assert.ok(Math.abs(t.at[1] - ground.at(t.at[0], t.at[2])) < 0.002, `${b.id} ${seed}: ${t.name} is not on the ground`)
      assert.ok(fromPath(plan.path, t.at[0], t.at[2]) > room * 0.5, `${b.id} ${seed}: ${t.name} stands on the path`)
      plan.things.slice(0, i).forEach((o) => assert.ok(Math.hypot(t.at[0] - o.at[0], t.at[2] - o.at[2]) > (room + ROOM[o.kind] * o.size) * 0.8, `${b.id} ${seed}: ${t.name} crowds ${o.name}`))
    })
    // the path comes in at one edge and leaves at another
    for (const end of [plan.path[0], plan.path[plan.path.length - 1]]) assert.ok(Math.abs(inside(plan.lobes, end[0], end[2])) < 0.05, `${seed}: the path does not reach the edge`)
    assert.equal(census(plan).reduce((n, l) => n + l.count, 0), plan.things.length)
  }
})

test('every landmark turns up, and every rock', () => {
  for (const b of BIOMES) {
    const plans = Array.from({ length: 30 }, (_, i) => planIsland(b, i + 1))
    assert.equal(new Set(plans.flatMap((p) => p.things.slice(0, 2).map((t) => t.name))).size, b.landmarks.length, b.id)
    assert.equal(new Set(plans.map((p) => p.rock)).size, b.ground.rock.length, b.id)
  }
})

test('things crowd into the kinds of place that like them', () => {
  // a grove holds more oaks than the same ground elsewhere: counted over many islands, oaks within a grove's reach
  // against the share of the island the groves cover
  let near = 0, all = 0, cover = 0, tries = 0
  for (let seed = 1; seed <= 12; seed++) {
    const plan = planIsland(MEADOW, seed), grove = plan.patches.find((p) => p.name === 'oak grove')!
    for (const t of plan.things) if (t.name === 'oak') { all++; if (Math.hypot(t.at[0] - grove.at[0], t.at[2] - grove.at[1]) < grove.r) near++ }
    for (let k = 0; k < 400; k++) {
      const x = (k % 20) / 20 * 6.6 - 3.3, z = Math.floor(k / 20) / 20 * 6.6 - 3.3
      if (inside(plan.lobes, x, z) > 0) { tries++; if (Math.hypot(x - grove.at[0], z - grove.at[1]) < grove.r) cover++ }
    }
  }
  assert.ok(near / all > 2 * (cover / tries), `${near} of ${all} oaks in groves that cover ${(cover / tries).toFixed(2)} of the ground`)
})

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
  const spacing = DETAIL[0].spacing
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

test('every thing on an island is marked as a prop, so Scene Creator takes it apart', () => {
  const { plan, doc } = makeIsland('meadow', 7)
  const picks = markedPicks(doc)
  assert.equal(doc.bones!.length, picks.length + plan.clouds.length + plan.things.filter((t) => t.kind === 'tree' || t.kind === 'pine').length)
  assert.equal(picks.length, plan.things.length + plan.drifters.length)
  const project = describedProject(doc)
  // Scene Creator takes at most MAX_PROPS of them as props
  assert.equal(project.props.length, Math.min(picks.length, MAX_PROPS))
  // the land keeps the ground, the rock under it and the clouds
  assert.equal(islandDoc(plan).parts.filter((p) => !p.bone).length, 2)
})

test('an island passes the checks a scene written by hand passes', () => {
  for (const b of BIOMES) {
    const review = reviewScene(makeIsland(b.id, 7).doc)
    assert.deepEqual(review.problems, [], b.id)
    assert.ok(review.facts && review.facts.blobs > 3000)
  }
})

