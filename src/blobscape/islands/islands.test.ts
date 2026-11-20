import test from 'node:test'
import assert from 'node:assert/strict'
import { checkScene } from '../../splat-engine/sceneDoc.ts'
import { markedPicks } from '../../splat-engine/project.ts'
import { wornLand } from '../../splat-engine/erode.ts'
import { reviewScene } from '../diorama/review.ts'
import { describedProject } from '../creator/described.ts'
import { BIOMES, MEADOW } from './biomes.ts'
import { MAX_SEED, census, fromPath, inside, islandDoc, makeIsland, planIsland } from './island.ts'
import { MATERIALS, colorsOf, dressed, family, leaning, material, paintOf } from './materials.ts'
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
  for (let seed = 1; seed <= 300; seed++) assert.deepEqual(checkScene(makeIsland('meadow', seed * 37).doc), [], `meadow ${seed * 37}`)
})

test('things stand on the island, on its ground, off the path and clear of each other', () => {
  for (const seed of SEEDS) {
    const plan = planIsland(MEADOW, seed), ground = wornLand(plan.land)
    assert.ok(plan.things.length >= 10, `${seed}: only ${plan.things.length} things`)
    assert.ok(MEADOW.landmarks.some((l) => l.name === plan.things[0].name), `${seed}: the landmark comes first`)
    plan.things.forEach((t, i) => {
      const room = ROOM[t.kind] * t.size
      assert.ok(inside(plan.lobes, t.at[0], t.at[2]) > 0.04, `${seed}: ${t.name} is over the edge`)
      assert.ok(Math.abs(t.at[1] - ground.at(t.at[0], t.at[2])) < 0.002, `${seed}: ${t.name} is not on the ground`)
      assert.ok(fromPath(plan.path, t.at[0], t.at[2]) > room * 0.5, `${seed}: ${t.name} stands on the path`)
      plan.things.slice(0, i).forEach((o) => assert.ok(Math.hypot(t.at[0] - o.at[0], t.at[2] - o.at[2]) > (room + ROOM[o.kind] * o.size) * 0.8, `${seed}: ${t.name} crowds ${o.name}`))
    })
    // the path comes in at one edge and leaves at another
    for (const end of [plan.path[0], plan.path[plan.path.length - 1]]) assert.ok(Math.abs(inside(plan.lobes, end[0], end[2])) < 0.05, `${seed}: the path does not reach the edge`)
    assert.equal(census(plan).reduce((n, l) => n + l.count, 0), plan.things.length)
  }
})

test('both landmarks turn up, and both rocks', () => {
  const plans = Array.from({ length: 40 }, (_, i) => planIsland(MEADOW, i + 1))
  assert.equal(new Set(plans.map((p) => p.things[0].name)).size, MEADOW.landmarks.length)
  assert.equal(new Set(plans.map((p) => p.rock)).size, MEADOW.ground.rock.length)
})

test('every thing on an island is marked as a prop, so Scene Creator takes it apart', () => {
  const { plan, doc } = makeIsland('meadow', 7)
  const picks = markedPicks(doc)
  assert.equal(picks.length, plan.things.length + plan.drifters.length)
  const project = describedProject(doc)
  assert.equal(project.props.length, picks.length)
  // the land keeps the ground, the rock under it and the clouds
  assert.equal(islandDoc(plan).parts.filter((p) => !p.bone).length, 2)
})

test('an island passes the checks a scene written by hand passes', () => {
  for (const seed of [7, 4242]) {
    const review = reviewScene(makeIsland('meadow', seed).doc)
    assert.deepEqual(review.problems, [], `${seed}`)
    assert.ok(review.facts && review.facts.blobs > 3000)
  }
})

