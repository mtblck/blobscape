import test from 'node:test'
import assert from 'node:assert/strict'
import { checkScene, compileScene, type SceneDoc } from '../../splat-engine/sceneDoc.ts'
import { Skeleton } from '../../splat-engine/rig.ts'
import { buildVoxels } from '../../splat-engine/voxel.ts'
import { seeThrough } from '../../splat-engine/solidity.ts'
import { DETAIL } from '../diorama/scene.ts'
import { MAX_PROPS, markedPicks } from '../../splat-engine/project.ts'
import { wornLand } from '../../splat-engine/erode.ts'
import { reviewScene } from '../diorama/review.ts'
import { describedProject } from '../creator/described.ts'
import { BIOMES, MEADOW } from './biomes.ts'
import { MAX_SEED, census, fromPath, inside, makeIsland, planIsland } from './island.ts'
import { MATERIALS, SOLID, colorsOf, dressed, family, leaning, letsThrough, material, opaque, paintOf } from './materials.ts'
import { ROOM } from './things.ts'
import { IslandWalk, SCALE as WALK_SCALE, passes } from './walk.ts'
import { GAP, WORLD_ISLANDS, WorldGround, deckAt, planWorld, worldStart } from './world.ts'

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
      const x = (k % 20) / 20 * 29.6 - 14.8, z = Math.floor(k / 20) / 20 * 29.6 - 14.8
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

test('every thing on an island that has a bone is marked as a prop, so Scene Creator takes it apart', () => {
  const { plan, doc } = makeIsland('meadow', 7)
  const picks = markedPicks(doc)
  // things past the bone budget stand on the island's own bone; the first ones placed (the landmarks first) keep theirs
  const marked = doc.bones!.filter((b) => b.prop)
  assert.equal(picks.length, marked.length)
  assert.ok(picks.length >= MAX_PROPS && picks.length < plan.things.length + plan.drifters.length, `${picks.length} props of ${plan.things.length} things`)
  for (const name of ['Ring of standing stones 1', 'Great oak 1', 'Granite tor 1']) if (plan.things.slice(0, 2).some((t) => name.startsWith(t.name[0].toUpperCase() + t.name.slice(1)))) assert.ok(marked.some((b) => b.prop === name), name)
  assert.ok(doc.bones!.length + doc.air!.specks!.reduce((a, s) => a + s.count, 0) < 255)
  const project = describedProject(doc)
  // Scene Creator takes at most MAX_PROPS of them as props
  assert.equal(project.props.length, Math.min(picks.length, MAX_PROPS))
})

test('an island passes the checks a scene written by hand passes', () => {
  for (const b of BIOMES) {
    const review = reviewScene(makeIsland(b.id, 7).doc)
    assert.deepEqual(review.problems, [], b.id)
    assert.ok(review.facts && review.facts.blobs > 3000)
  }
})


test('the path is clear to walk, from where the elf starts to its far end', () => {
  // nothing stands in the way of someone on the path, and the ground along it is no steeper than the elf climbs
  for (const b of BIOMES) for (const seed of [7, 37, 500]) {
    const { doc, plan } = makeIsland(b.id, seed)
    const walk = new IslandWalk(doc, plan, DETAIL[1].spacing, { blobs: 2000 })
    const goals = plan.path.slice(1).map((p) => [p[0] * WALK_SCALE, p[2] * WALK_SCALE])
    let k = 0
    for (let f = 0; f < 30 * 90 && k < goals.length; f++) {
      const dx = goals[k][0] - walk.walker.x, dz = goals[k][1] - walk.walker.z
      if (Math.hypot(dx, dz) < 1.5) { k++; continue }
      walk.update(1 / 30, { forward: 0, turn: 0, aim: Math.atan2(dx, dz), go: 1 })
    }
    assert.equal(k, goals.length, `${b.id} ${seed}: stuck at ${walk.walker.x.toFixed(1)}, ${walk.walker.z.toFixed(1)} on the way to the path's point ${k + 1}`)
    assert.ok(walk.walked > 10, `${b.id} ${seed}: walked only ${walk.walked.toFixed(1)} m`)
  }
})

test('the elf stays on the island, out of things, and its feet on the ground', () => {
  const { doc, plan } = makeIsland('meadow', 42)
  const walk = new IslandWalk(doc, plan, DETAIL[1].spacing, { blobs: 2000 })
  const sk = walk.elf.skeleton, feet = ['lFoot', 'rFoot'].map((n) => sk.index(n))
  // walk straight on, turning now and then, for a minute: it meets the edge and things and must stop or slide at each
  for (let f = 0; f < 30 * 60; f++) {
    walk.update(1 / 30, { forward: 1, turn: Math.sin(f / 70) * 0.6 })
    const { x, z } = walk.walker
    assert.ok(inside(plan.lobes, x / WALK_SCALE, z / WALK_SCALE) > 0, `off the island at ${x}, ${z}`)
    assert.ok(walk.ground.standsAt(x, z), `in a thing at ${x}, ${z}`)
    // a planted foot's ankle is over the ground, not under it or far above it
    for (const i of feet) {
      const ankle = sk.posedHead.subarray(i * 3, i * 3 + 3), g = walk.ground.groundAt(ankle[0], ankle[2])
      assert.ok(ankle[1] > g - 0.02, `a foot in the ground by ${(g - ankle[1]).toFixed(3)} m`)
    }
  }
  assert.ok(walk.walked > 20, `walked ${walk.walked.toFixed(1)} m`)
  // walking into a thing stops at it: no thing on the island lets the elf through its middle
  const t = plan.things.find((th) => th.kind === 'boulder' || th.kind === 'stump' || th.kind === 'bush')!
  assert.equal(walk.ground.standsAt(t.at[0] * WALK_SCALE, t.at[2] * WALK_SCALE), false, `the elf may stand in a ${t.name}`)
})

test('a world is a chain of islands apart in the sky, each a sound description, joined by bridges that sound too', () => {
  for (const [biome, seed] of [['meadow', 37], ['pinewood', 7], ['mesa', 500]] as const) {
    const w = planWorld(biome, seed)
    assert.deepEqual(planWorld(biome, seed), w, 'the same first island plans the same world')
    assert.equal(w.islands.length, WORLD_ISLANDS)
    assert.equal(w.bridges.length, WORLD_ISLANDS - 1)
    assert.equal(new Set(w.islands.map((i) => i.biome)).size, WORLD_ISLANDS, 'each island is another biome')
    for (const doc of [...w.islands.map((i) => i.doc), ...w.bridges.map((b) => b.doc)]) assert.deepEqual(checkScene(doc), [], doc.name)
    // no island reaches into another: every point of one's outline is well outside the others
    w.islands.forEach((a, j) => w.islands.forEach((b, k) => {
      if (j === k) return
      for (let n = 0; n < 64; n++) {
        const t = (n / 64) * Math.PI * 2
        for (let r = 0; r < 32; r += 0.05) {
          const x = Math.cos(t) * r, z = Math.sin(t) * r
          if (inside(a.plan.lobes, x, z) < 0) break
          assert.ok(inside(b.plan.lobes, x + a.at[0] - b.at[0], z + a.at[2] - b.at[2]) < -GAP * 0.4, `${biome} ${seed}: island ${j} reaches island ${k}`)
        }
      }
    }))
    // a bridge's ends are on its two islands' ground, and its deck runs over open sky between
    w.bridges.forEach((br, j) => {
      for (const [end, isl] of [[br.from, w.islands[j]], [br.to, w.islands[j + 1]]] as const) {
        const x = end[0] - isl.at[0], z = end[2] - isl.at[2]
        assert.ok(inside(isl.plan.lobes, x, z) > 0.1, `${biome} ${seed}: bridge ${j} ends off its island`)
        assert.ok(Math.abs(end[1] - isl.at[1] - wornLand(isl.plan.land).at(x, z)) < 0.01, `${biome} ${seed}: bridge ${j} ends off the ground`)
      }
      const mx = (br.from[0] + br.to[0]) / 2, mz = (br.from[2] + br.to[2]) / 2
      for (const isl of w.islands) assert.ok(inside(isl.plan.lobes, mx - isl.at[0], mz - isl.at[2]) < 0, `${biome} ${seed}: bridge ${j}'s middle is over an island`)
      const len = Math.hypot(br.to[0] - br.from[0], br.to[2] - br.from[2])
      assert.ok(deckAt(br.from[1], br.to[1], len, 0.5) < Math.max(br.from[1], br.to[1]), 'the deck sags')
    })
  }
})

test('the elf can walk from where it starts to the far end of the last island, over every bridge', () => {
  // every place the elf may reach, by steps it may take, from where it starts: both ends of every bridge must be among them
  for (const [biome, seed] of [['meadow', 37], ['mesa', 500], ['pinewood', 99]] as const) {
    const w = planWorld(biome, seed), g = new WorldGround(w, DETAIL[1].spacing), start = worldStart(w, g), STEP = 0.2
    const key = (i: number, j: number) => i * 100000 + j
    const at = (x: number, z: number) => [Math.round(x / STEP), Math.round(z / STEP)] as const
    const seen = new Set<number>(), todo: (readonly [number, number])[] = [at(start.x, start.z)]
    seen.add(key(...todo[0]))
    while (todo.length) {
      const [i, j] = todo.pop()!
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = i + di, nj = j + dj, k = key(ni, nj)
        if (!seen.has(k) && passes(g, i * STEP, j * STEP, ni * STEP, nj * STEP)) { seen.add(k); todo.push([ni, nj]) }
      }
    }
    const reached = (x: number, z: number) => {
      const [i, j] = at(x * WALK_SCALE, z * WALK_SCALE)
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (seen.has(key(i + a, j + b))) return true
      return false
    }
    w.bridges.forEach((br, j) => {
      assert.ok(reached(br.from[0], br.from[2]), `${biome} ${seed}: can't reach bridge ${j}`)
      assert.ok(reached((br.from[0] + br.to[0]) / 2, (br.from[2] + br.to[2]) / 2), `${biome} ${seed}: can't cross bridge ${j}`)
      assert.ok(reached(br.to[0], br.to[2]), `${biome} ${seed}: can't step off bridge ${j}`)
    })
    const last = w.islands[w.islands.length - 1], end = last.plan.path[last.plan.path.length - 2]
    assert.ok(reached(end[0] + last.at[0], end[2] + last.at[2]), `${biome} ${seed}: can't reach the last island's far side`)
    // and off a bridge's side there is nothing to stand on
    const br = w.bridges[0], dx = br.to[0] - br.from[0], dz = br.to[2] - br.from[2], len = Math.hypot(dx, dz)
    const mx = ((br.from[0] + br.to[0]) / 2 - (dz / len) * 0.3) * WALK_SCALE, mz = ((br.from[2] + br.to[2]) / 2 + (dx / len) * 0.3) * WALK_SCALE
    assert.equal(g.standsAt(mx, mz), false, 'the elf may stand in the air beside a bridge')
  }
})

test('walking onto a bridge at a slant, the elf slides along the rail onto the deck and crosses', () => {
  const w = planWorld('meadow', 37), g = new WorldGround(w, DETAIL[1].spacing), br = w.bridges[0]
  const dx = br.to[0] - br.from[0], dz = br.to[2] - br.from[2], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len
  // a meter and a half back from the deck's start and a meter to one side, heading for the far end
  const x0 = (br.from[0] - ux * 0.3 + uz * 0.2) * WALK_SCALE, z0 = (br.from[2] - uz * 0.3 - ux * 0.2) * WALK_SCALE
  assert.ok(g.standsAt(x0, z0), 'the start is on the island')
  const walk = new IslandWalk(g, { x: x0, z: z0, heading: Math.atan2(dx, dz), speed: 0 }, { blobs: 2000 })
  const tx = br.to[0] * WALK_SCALE, tz = br.to[2] * WALK_SCALE
  for (let f = 0; f < 30 * 30 && Math.hypot(tx - walk.walker.x, tz - walk.walker.z) > 0.5; f++) {
    walk.update(1 / 30, { forward: 0, turn: 0, aim: Math.atan2(tx - walk.walker.x, tz - walk.walker.z), go: 1 })
  }
  assert.ok(Math.hypot(tx - walk.walker.x, tz - walk.walker.z) <= 0.5, `stuck at ${walk.walker.x.toFixed(1)}, ${walk.walker.z.toFixed(1)}`)
})

test('falling leaves come down on the island, never at rest in the open air past its edge', () => {
  // Matt saw leaves settle in the sky beside an island and shrink away there (2026-11-21)
  const made = makeIsland('meadow', 3), c = compileScene(made.doc), sk = new Skeleton(c.bones)
  const swarms = made.doc.air?.specks ?? [], first = c.bones.findIndex((b) => b.name.startsWith('~speck'))
  const before = swarms.slice(0, swarms.findIndex((s) => s.land)).reduce((n, s) => n + s.count, 0)
  const leaves = swarms.find((s) => s.land)!
  const low = new Array(leaves.count).fill(Infinity)
  for (let t = 0; t < c.loop; t += 0.25) {
    sk.reset(); c.pose(sk, t)
    for (let k = 0; k < leaves.count; k++) {
      const i = first + before + k
      if (sk.size[i] > 0.5) low[k] = Math.min(low[k], c.bones[i].head[1] + sk.offset[i * 3 + 1])
    }
  }
  assert.equal(low.filter((y) => y < 0.02).length, 0)
})
