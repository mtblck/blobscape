import type { Vec3 } from '../../splat-core/blobs.ts'
import { wornLand, type LandSpec } from '../../splat-engine/erode.ts'
import type { BoneDoc, MoveDoc, PartDoc, SceneDoc, ShapeDoc } from '../../splat-engine/sceneDoc.ts'
import { joinPalettes } from '../../splat-engine/project.ts'
import { biomeOf, type Biome, type Population } from './biomes.ts'
import { SOLID, chance, colorsOf, dressed, hashOf, material, paintOf, pickOf } from './materials.ts'
import { ROOM, makeThing, r3, type Thing } from './things.ts'

/**
 * A floating island from a biome recipe and a seed. `planIsland` decides everything (the island's outline, its
 * hills, the path across it, what stands where and what it is made of) and `islandDoc` writes the plan out as an
 * ordinary scene description with every thing marked as a prop, so the island plays in Pixel Diorama, opens in Scene
 * Creator as a land and props, and is checked by the same checks as a scene written by hand. Pure: the same biome and
 * seed give the same island.
 */

/** The most a seed may be. */
export const MAX_SEED = 999999
/** Seconds before an island's moves repeat. */
export const LOOP = 12
/** Half the block of land an island's outline is cut from: about seven units across, room to walk about. */
const HALF = 3.35
/** How deep the turf and earth are before the rock under them. */
const SLAB = 0.34
/** How wide the trodden path is, to each side of its middle. */
const PATH = 0.08
/** The bones an island's things may take: a description's 128 less the clouds and the most drifting rocks. */
const BONE_BUDGET = 116

/** A round piece of the island's outline, seen from above. */
export interface Lobe { at: [number, number]; r: number }

/** One of the kinds of place inside an island, where it lies. */
export interface PlacedPatch { name: string; at: [number, number]; r: number }

/** Everything decided about one island. */
export interface IslandPlan {
  biome: string
  seed: number
  name: string
  /** The outline: the island is wherever any lobe is. */
  lobes: Lobe[]
  /** The worn land its top is cut from. */
  land: LandSpec & { base: number }
  /** The material of the rock hanging under it. */
  rock: string
  /** The kinds of place inside it: a grove here, a glade there. */
  patches: PlacedPatch[]
  /** The trodden path across it, edge to edge, past the landmarks: where bridges will land. */
  path: Vec3[]
  /** What stands on it, the landmarks first. */
  things: Thing[]
  /** How many of `things` are landmarks. */
  landmarks: number
  /** Small rocks that float beside it. */
  drifters: { at: Vec3; r: number }[]
  /** Clouds below and behind it. */
  clouds: { at: Vec3; r: number }[]
}

/** How far inside the outline a point is (negative outside): never more than the true distance to the edge. */
export function inside(lobes: Lobe[], x: number, z: number): number {
  let best = -Infinity
  for (const l of lobes) best = Math.max(best, l.r - Math.hypot(x - l.at[0], z - l.at[1]))
  return best
}

/** How far the island reaches from its middle along an angle. */
export function reach(lobes: Lobe[], angle: number): number {
  const c = Math.cos(angle), s = Math.sin(angle)
  let d = 0
  while (d < HALF * 1.5 && inside(lobes, c * (d + 0.03), s * (d + 0.03)) >= 0) d += 0.03
  return d
}

/** How far a point is from a path of straight runs, seen from above. */
export function fromPath(path: Vec3[], x: number, z: number): number {
  let best = Infinity
  for (let i = 0; i + 1 < path.length; i++) {
    const ax = path[i][0], az = path[i][2], bx = path[i + 1][0] - ax, bz = path[i + 1][2] - az
    const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz || 1)))
    best = Math.min(best, Math.hypot(x - ax - bx * t, z - az - bz * t))
  }
  return best
}

const between = (range: [number, number], u: number) => range[0] + (range[1] - range[0]) * u
const whole = (range: [number, number], u: number) => range[0] + Math.floor(u * (range[1] - range[0] + 1))
/** Bones a thing takes: a tree's crown sways on a second. */
const bonesOf = (kind: Thing['kind']) => (kind === 'tree' || kind === 'pine' ? 2 : 1)

/** Plans island `seed` of a biome. */
export function planIsland(biome: Biome, seed: number): IslandPlan {
  let salt = 0
  // every call takes the next number of this island's own run, so adding a decision later leaves earlier ones alone
  const rnd = () => chance(seed, 1000 + salt++)

  // the outline: a broad middle and four to six lobes round it
  const lobes: Lobe[] = [{ at: [0, 0], r: r3(1.85 + 0.25 * rnd()) }]
  const count = 4 + Math.floor(rnd() * 3), turn = rnd() * Math.PI * 2
  for (let i = 0; i < count; i++) {
    const a = turn + ((i + 0.6 * (rnd() - 0.5)) / count) * Math.PI * 2, d = 1.15 + 0.45 * rnd()
    lobes.push({ at: [r3(Math.cos(a) * d), r3(Math.sin(a) * d)], r: r3(0.95 + 0.4 * rnd()) })
  }

  // hills, each inside the outline
  const peaks: LandSpec['peaks'] = []
  const hills = whole(biome.land.hills, rnd())
  for (let i = 0; i < hills; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 0.75 * reach(lobes, a)
    peaks.push({ at: [r3(Math.cos(a) * d), r3(Math.sin(a) * d)], h: r3(between(biome.land.height, rnd())), r: r3(0.8 + 0.8 * rnd()) })
  }
  const land: IslandPlan['land'] = { at: [0, 0, 0], half: [HALF, HALF], base: SLAB, peaks, noise: biome.land.noise, drops: biome.land.drops, slump: biome.land.slump, seed: 1 + (hashOf(seed, 1) % 9999) }
  if (biome.land.beds) land.beds = biome.land.beds
  const ground = wornLand(land)
  const high = Math.max(0.001, ...peaks.map((p) => ground.at(p.at[0], p.at[1])))

  // the kinds of place inside it, spread round the island
  const patches: PlacedPatch[] = []
  const kinds = [...biome.patches].sort((x, y) => hashOf(seed, 60 + biome.patches.indexOf(x)) - hashOf(seed, 60 + biome.patches.indexOf(y)))
  const pturn = rnd() * Math.PI * 2
  kinds.forEach((k, i) => {
    const a = pturn + ((i + 0.4 * (rnd() - 0.5)) / kinds.length) * Math.PI * 2, d = (0.35 + 0.3 * rnd()) * reach(lobes, a)
    patches.push({ name: k.name, at: [r3(Math.cos(a) * d), r3(Math.sin(a) * d)], r: r3(between(k.r, rnd())) })
  })
  const liking = (name: string, x: number, z: number) => {
    let got = 0
    patches.forEach((pa, i) => {
      const w = kinds[i].likes[name]
      if (w) got += w * Math.max(0, 1 - Math.hypot(x - pa.at[0], z - pa.at[1]) / pa.r)
    })
    return got
  }

  // what stands on it: each thing the best of some tries, by room from the others, the height and place it likes, and luck
  const things: Thing[] = []
  let path: Vec3[] = []
  let bones = 0
  const place = (p: Population, apart = 0) => {
    const n = whole(p.count, rnd())
    for (let k = 0; k < n; k++) {
      const size = r3(between(p.size, rnd())), room = ROOM[p.kind] * size, own = hashOf(seed, 5000 + salt++)
      if (bones + bonesOf(p.kind) > BONE_BUDGET) return
      let best: { x: number; z: number; score: number } | undefined
      for (let tries = 0; tries < 50; tries++) {
        const a = rnd() * Math.PI * 2, d = between(p.zone, Math.sqrt(rnd())) * reach(lobes, a), x = Math.cos(a) * d, z = Math.sin(a) * d
        const luck = rnd()
        if (inside(lobes, x, z) < room * 0.6 + 0.08 || (path.length && fromPath(path, x, z) < room * 0.5 + PATH + 0.04)) continue
        let clear = Infinity
        for (const t of things) clear = Math.min(clear, Math.hypot(x - t.at[0], z - t.at[2]) - (room + ROOM[t.kind] * t.size) * 0.8)
        if (clear < 0.02) continue
        // a second landmark keeps as far from the first as it can
        const away = apart && things[0] ? Math.hypot(x - things[0].at[0], z - things[0].at[2]) * apart : 0
        const score = (p.high ?? 0) * (ground.at(x, z) / high) * 2 + Math.min(clear, 0.4) + liking(p.name, x, z) + away + luck * 0.5
        if (!best || score > best.score) best = { x, z, score }
      }
      if (!best) continue
      const made: Record<string, string> = {}
      Object.keys(p.made).forEach((use, j) => { made[use] = pickOf(p.made[use], own, j) })
      things.push({ kind: p.kind, name: p.name, plural: p.plural, at: [r3(best.x), r3(ground.at(best.x, best.z)), r3(best.z)], size, seed: own, made })
      bones += bonesOf(p.kind)
    }
  }
  // two landmarks, different ones, far apart
  const first = hashOf(seed, 2) % biome.landmarks.length, second = (first + 1 + (hashOf(seed, 4) % (biome.landmarks.length - 1))) % biome.landmarks.length
  place(biome.landmarks[first])
  place(biome.landmarks[second], 1)
  const landmarks = things.length

  // the path: in at one edge, past each landmark, out at about the far edge
  const a0 = rnd() * Math.PI * 2, a1 = a0 + Math.PI + (rnd() - 0.5) * 1.2
  const gate = (a: number): Vec3 => { const d = reach(lobes, a); return [r3(Math.cos(a) * d), 0, r3(Math.sin(a) * d)] }
  const g0 = gate(a0), g1 = gate(a1)
  const dx = g1[0] - g0[0], dz = g1[2] - g0[2], len = Math.hypot(dx, dz) || 1
  const via: Vec3[] = things.slice(0, landmarks).map((mark) => {
    // beside the landmark, on whichever side keeps the path furthest from it while staying on the island
    const room = ROOM[mark.kind] * mark.size
    let far = -Infinity, mid: Vec3 = [mark.at[0], 0, mark.at[2]]
    for (const side of [1, -1]) for (const out of [0.14, 0.26, 0.4]) {
      const m: Vec3 = [r3(mark.at[0] + (-dz / len) * side * (room + PATH + out)), 0, r3(mark.at[2] + (dx / len) * side * (room + PATH + out))]
      const clear = Math.min(fromPath([g0, m, g1], mark.at[0], mark.at[2]) - room - PATH, inside(lobes, m[0], m[2]) - 0.2)
      if (clear > far) { far = clear; mid = m }
    }
    return mid
  })
  via.sort((p, q) => ((p[0] - g0[0]) * dx + (p[2] - g0[2]) * dz) - ((q[0] - g0[0]) * dx + (q[2] - g0[2]) * dz))
  if (!via.length) via.push([r3((rnd() - 0.5) * 0.6), 0, r3((rnd() - 0.5) * 0.6)])
  path = [g0, ...via, g1]
  biome.lives.forEach((p) => place(p))

  // small rocks adrift beside it, and clouds below and behind
  const drifters: IslandPlan['drifters'] = []
  for (let i = 0, n = whole(biome.drifters, rnd()); i < n; i++) {
    const a = rnd() * Math.PI * 2, d = reach(lobes, a) + 0.45 + 0.5 * rnd()
    drifters.push({ at: [r3(Math.cos(a) * d), r3(-0.8 + 1.3 * rnd()), r3(Math.sin(a) * d)], r: r3(0.16 + 0.16 * rnd()) })
  }
  const clouds: IslandPlan['clouds'] = []
  for (let i = 0; i < 4; i++) {
    const a = turn + (i / 4 + 0.15 * rnd()) * Math.PI * 2, d = 3.7 + 0.8 * rnd()
    clouds.push({ at: [r3(Math.cos(a) * d), r3(-2.4 + 1.4 * rnd()), r3(Math.sin(a) * d * 0.8 - 0.6)], r: r3(0.5 + 0.3 * rnd()) })
  }

  return { biome: biome.id, seed, name: `${biome.name} island ${seed}`, lobes, land, rock: pickOf(biome.ground.rock, seed, 3), patches, path, things, landmarks, drifters, clouds }
}

/** The colors an island's palette is made from, the most important first: the sky, a dark for outlines, then every material. */
function paletteOf(biome: Biome, plan: IslandPlan): string[] {
  const used = [biome.ground.top, biome.ground.soil, biome.ground.path, plan.rock, ...plan.things.flatMap((t) => Object.values(t.made)), 'cloud']
  const colors = ['#14101e', ...biome.sky, ...biome.skyBetween, ...colorsOf([...new Set(used)]), ...biome.air.flatMap((a) => a.colors)]
  // more than a palette holds: the closest pairs are joined until it fits
  return joinPalettes([[...new Set(colors)]]).map((c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`)
}

/** A plan written out as a scene description. */
export function islandDoc(plan: IslandPlan): SceneDoc {
  return islandScene(plan).doc
}

/**
 * A plan written out as a scene description, with which of its parts are opaque bodies (by index in `parts`): the
 * ground, the rock under it, every stone and stump. Those must let no light through from any side.
 */
export function islandScene(plan: IslandPlan): { doc: SceneDoc; solid: number[] } {
  const biome = biomeOf(plan.biome), seed = plan.seed
  const bones: BoneDoc[] = [], parts: PartDoc[] = [], moves: MoveDoc[] = [], solid: number[] = [0, 1]
  const rock = material(plan.rock)

  // the top: worn land, cut to the outline (everything of the block outside the lobes is taken away)
  const outline: ShapeDoc = { kind: 'join', blend: 'smooth', by: 0.12, shapes: plan.lobes.map((l): ShapeDoc => ({ kind: 'cylinder', at: [l.at[0], -1, l.at[1]], height: 3, r: l.r })) }
  const turf = material(biome.ground.top), soil = material(biome.ground.soil)
  parts.push({
    shape: { kind: 'cut', shape: { kind: 'land', ...plan.land }, hole: { kind: 'cut', shape: { kind: 'box', at: [0, 0.6, 0], half: [HALF + 0.2, 2, HALF + 0.2] }, hole: outline } },
    paint: {
      kind: 'faces', up: 0.55,
      // the path is trodden earth, found at the ground's own height wherever the hills take it
      top: { kind: 'near', shape: { kind: 'sweep', path: plan.path, r: 0.02 }, within: PATH, at: 0, near: paintOf(material(biome.ground.path), seed, 0.6), far: paintOf(turf, seed) },
      side: paintOf(soil, seed),
    },
    ink: turf.ink,
  })

  // the underside: rock hanging under each lobe, widest just under the turf and coming to a point, joined and roughened
  const hanging: ShapeDoc[] = plan.lobes.map((l, i): ShapeDoc => {
    const deep = l.r * (1.0 + 0.45 * chance(seed, 200 + i))
    return { kind: 'cylinder', at: [l.at[0], r3(-0.12 - deep), l.at[1]], height: r3(deep), r: 0.04, rTop: r3(l.r * 0.96) }
  })
  parts.push({ shape: { kind: 'rough', shape: { kind: 'join', blend: 'smooth', by: 0.1, shapes: hanging }, by: 0.06, scale: 0.4 }, ...dressed(rock, seed), ink: { kind: 'cracks', amount: 0.25 } })

  // what stands on it
  const counts = new Map<string, number>()
  plan.things.forEach((t, i) => {
    const n = (counts.get(t.name) ?? 0) + 1
    counts.set(t.name, n)
    const piece = makeThing(t, i, n)
    solid.push(...piece.solid.map((k) => parts.length + k))
    bones.push(...piece.bones); parts.push(...piece.parts); moves.push(...piece.moves)
  })

  // rocks adrift: a point of rock with a cap of turf, bobbing
  plan.drifters.forEach((d, i) => {
    const bone = `adrift${i}`, deep = d.r * 2.2
    bones.push({ name: bone, at: d.at, prop: `Floating rock ${i + 1}` })
    solid.push(parts.length)
    parts.push({ shape: { kind: 'rough', shape: { kind: 'cylinder', at: [d.at[0], r3(d.at[1] - deep), d.at[2]], height: r3(deep), r: 0.02, rTop: d.r }, by: r3(d.r * 0.25), scale: 0.3 }, ...dressed(rock, seed + i), bone })
    parts.push({ shape: { kind: 'ball', at: d.at, r: [r3(d.r * 1.02), r3(d.r * 0.22), r3(d.r * 1.02)] }, paint: paintOf(turf, seed + i, 0.5), bone, noShadow: true })
    moves.push({ kind: 'bob', bone, by: [0, r3(0.03 + 0.04 * chance(seed, 300 + i)), 0], times: 1 + (hashOf(seed, 310 + i) % 2), phase: r3(chance(seed, 320 + i)) })
  })

  // clouds: a few soft lumps each, sliding a little to and fro
  const mist = material('cloud')
  plan.clouds.forEach((c, i) => {
    const bone = `cloud${i}`
    bones.push({ name: bone, at: c.at })
    const lumps: ShapeDoc[] = [-1, 0, 1].map((k): ShapeDoc => ({ kind: 'ball', at: [r3(c.at[0] + k * c.r * 0.8), r3(c.at[1] + (k === 0 ? c.r * 0.12 : 0)), c.at[2]], r: [r3(c.r * (k === 0 ? 1 : 0.7)), r3(c.r * (k === 0 ? 0.42 : 0.3)), r3(c.r * 0.6)] }))
    parts.push({ shape: { kind: 'join', blend: 'smooth', by: r3(c.r * 0.3), shapes: lumps }, paint: { kind: 'faces', up: 0.3, top: mist.ramp[2], side: mist.ramp[1], under: mist.ramp[0] }, bone, noShadow: true, bare: true })
    moves.push({ kind: 'bob', bone, by: [r3(0.1 + 0.1 * chance(seed, 400 + i)), 0, 0], times: 1, phase: r3(chance(seed, 410 + i)) })
  })

  const top = Math.max(0.8, ...plan.things.map((t) => t.at[1] + (t.kind === 'tree' || t.kind === 'pine' ? 0.75 * t.size : 0.2)))
  const doc: SceneDoc = {
    name: plan.name,
    // a place to walk about, and solid ground: nothing opaque may show what is behind it
    big: true,
    ...SOLID,
    loop: LOOP,
    light: biome.light,
    palette: paletteOf(biome, plan),
    sky: biome.sky,
    skyReach: 1,
    look: { dither: 0.5, glow: 1, outline: true, edges: true },
    camera: { target: [0, r3(top * 0.3 - 0.6), 0], distance: 12.5, azimuth: 24, elevation: 20, swing: 8 },
    air: { specks: biome.air.map((a) => ({ ...a, from: [-HALF, 0, -HALF] as Vec3, to: [HALF, r3(top + 0.5), HALF] as Vec3 })) },
    bones,
    parts,
    moves,
  }
  return { doc, solid }
}

/** Island `seed` of a biome: its plan and its description. */
export function makeIsland(biomeId: string | null | undefined, seed: number): { biome: Biome; plan: IslandPlan; doc: SceneDoc; solid: number[] } {
  const biome = biomeOf(biomeId), plan = planIsland(biome, seed)
  return { biome, plan, ...islandScene(plan) }
}

/** What stands on an island, counted by name, most first: "3 oaks", "1 ring of standing stones". */
export function census(plan: IslandPlan): { count: number; words: string }[] {
  const by = new Map<string, { count: number; plural: string }>()
  for (const t of plan.things) by.set(t.name, { count: (by.get(t.name)?.count ?? 0) + 1, plural: t.plural })
  return [...by].map(([name, v]) => ({ count: v.count, words: `${v.count} ${v.count === 1 ? name : v.plural}` })).sort((a, b) => b.count - a.count)
}
