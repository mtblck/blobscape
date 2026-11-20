import type { Vec3 } from '../../splat-core/blobs.ts'
import { wornLand } from '../../splat-engine/erode.ts'
import type { PartDoc, SceneDoc } from '../../splat-engine/sceneDoc.ts'
import { axisAngle } from '../../splat-engine/rig.ts'
import type { Skeleton } from '../../splat-engine/rig.ts'
import { BIOMES, biomeOf } from './biomes.ts'
import { MAX_SEED, inside, makeIsland, reach, type IslandPlan } from './island.ts'
import { SOLID, chance, hashOf, material, paintOf } from './materials.ts'
import { BODY, SCALE, startOf, type WalkGround, IslandGround } from './walk.ts'
import type { Walker } from '../walkingElf.ts'

/**
 * A world of floating islands in a chain, each from its own biome and seed, joined by rope bridges where one's path
 * goes out and the next one's comes in. The first island is the one the page names (its biome and number); the rest
 * follow from it, each the next biome round. Pure: the same first island gives the same world.
 */

/** How many islands a world has. */
export const WORLD_ISLANDS = 3
/** The open sky between two islands' edges, in the islands' units (eight meters as they stand). */
export const GAP = 1.6
/** How far into each island a bridge's deck runs past its edge, in the islands' units, so the two grounds meet. */
const INTO = 0.25
/** Half a bridge's width, in the islands' units: room for the elf between the rails. */
export const BRIDGE_HALF = 0.12
/** How far a bridge's middle sags, as a share of its length. */
const SAG = 0.035
/** How far a plank is from the next, its half length along the bridge and its thickness, in the islands' units. */
const PLANK = 0.07, PLANK_HALF = 0.028, PLANK_THICK = 0.008
/** How far to each side of a bridge's end the land beside it may be walked on, meters, out to the edge. */
const LANDING = 1
/** The rails' height over the deck, in the islands' units: about a meter. */
const RAIL = 0.2
/** How far in from a bridge's rails the elf keeps, meters: its shoulders brush the rope. */
const ROOM = BODY * 0.6

/** One island of a world: which, its plan and description, and where it stands, in the islands' units. */
export interface WorldIsland { biome: string; seed: number; plan: IslandPlan; doc: SceneDoc; solid: number[]; at: Vec3 }

/** A bridge's two ends on the decks' top (in the islands' units, in the world) and its description. */
export interface Bridge { from: Vec3; to: Vec3; doc: SceneDoc }

export interface WorldPlan { islands: WorldIsland[]; bridges: Bridge[] }

/** The seed of island `j` of the world island `seed` starts. */
const seedOf = (seed: number, j: number) => (j === 0 ? seed : 1 + (hashOf(seed, 900 + j) % MAX_SEED))

/** The point of an island's path `d` in from its edge at `angle`, on its ground, in its own units. */
function inFrom(plan: IslandPlan, angle: number, d: number): Vec3 {
  const r = reach(plan.lobes, angle) - d, x = Math.cos(angle) * r, z = Math.sin(angle) * r
  return [x, wornLand(plan.land).at(x, z), z]
}

/** Whether every point of island a's outline is at least half a GAP outside island b's. */
function clearOf(a: WorldIsland, b: WorldIsland): boolean {
  for (let n = 0; n < 64; n++) {
    const t = (n / 64) * Math.PI * 2, far = reach(a.plan.lobes, t)
    for (let r = 0; r <= far; r += 0.1) {
      const x = Math.cos(t) * r, z = Math.sin(t) * r
      if (inside(b.plan.lobes, x + a.at[0] - b.at[0], z + a.at[2] - b.at[2]) > -GAP * 0.5) return false
    }
  }
  return true
}

/** Plans the world whose first island is `seed` of `biome`, of `count` islands. */
export function planWorld(biomeId: string, seed: number, count = WORLD_ISLANDS): WorldPlan {
  const first = BIOMES.indexOf(biomeOf(biomeId))
  // the way from each island to the next: a gentle bend each time
  const ways: number[] = []
  let way = chance(seed, 700) * Math.PI * 2
  for (let j = 0; j + 1 < count; j++) { ways.push(way); way += (chance(seed, 710 + j) - 0.5) * 1.4 }
  const islands: WorldIsland[] = []
  for (let j = 0; j < count; j++) {
    const biome = BIOMES[(first + j) % BIOMES.length].id, s = seedOf(seed, j)
    // in from the last, out toward the next; the ends of the chain keep a free edge, opposite their bridge
    const inAt = j > 0 ? ways[j - 1] + Math.PI : ways[0] + Math.PI + (chance(s, 720) - 0.5) * 0.8
    const outAt = j + 1 < count ? ways[j] : ways[j - 1] + (chance(s, 721) - 0.5) * 0.8
    const made = count === 1 ? makeIsland(biome, s) : makeIsland(biome, s, [inAt, outAt])
    islands.push({ biome, seed: s, plan: made.plan, doc: made.doc, solid: made.solid, at: [0, 0, 0] })
  }
  // set each island past the last, its edge GAP beyond the last one's, a little higher or lower
  for (let j = 1; j < count; j++) {
    const w = ways[j - 1], u: Vec3 = [Math.cos(w), 0, Math.sin(w)]
    const was = islands[j - 1], from = reach(was.plan.lobes, w), to = reach(islands[j].plan.lobes, w + Math.PI)
    const rise = (chance(seed, 730 + j) - 0.5) * 0.5
    // along the way the edges are GAP apart; a lobe out to one side may still reach an island set before, so it goes
    // further until every point of its outline is well clear of them all
    for (let d = from + GAP + to; ; d += 0.2) {
      islands[j].at = [r3(was.at[0] + u[0] * d), r3(was.at[1] + rise), r3(was.at[2] + u[2] * d)]
      if (islands.slice(0, j).every((o) => clearOf(islands[j], o))) break
    }
  }
  const bridges: Bridge[] = []
  for (let j = 0; j + 1 < count; j++) {
    const a = islands[j], b = islands[j + 1], w = ways[j]
    const pa = inFrom(a.plan, w, INTO), pb = inFrom(b.plan, w + Math.PI, INTO)
    const from: Vec3 = [pa[0] + a.at[0], pa[1] + a.at[1], pa[2] + a.at[2]], to: Vec3 = [pb[0] + b.at[0], pb[1] + b.at[1], pb[2] + b.at[2]]
    bridges.push({ from, to, doc: bridgeDoc(from, to, a.doc, seedOf(seed, j) + 1) })
  }
  return { islands, bridges }
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000 || 0

/** A bridge's deck height a share `t` of the way across, from `y0` to `y1`, sagging in the middle. */
export function deckAt(y0: number, y1: number, length: number, t: number): number {
  return y0 + (y1 - y0) * t - SAG * length * 4 * t * (1 - t)
}

/**
 * A rope bridge from one point to another (in the world), written along +x about its own middle, so it is posed into
 * place by turning and moving its root (`poseBridge`): planks on two ropes that sag, rails a meter over them, a post
 * at each corner. Lit and painted as the island it leaves from.
 */
export function bridgeDoc(from: Vec3, to: Vec3, like: SceneDoc, seed: number): SceneDoc {
  const length = Math.hypot(to[0] - from[0], to[2] - from[2]), half = length / 2, mid = (from[1] + to[1]) / 2
  const y = (x: number) => deckAt(from[1], to[1], length, (x + half) / length) - mid
  const wood = material('oak'), rope = material('driftwood')
  const parts: PartDoc[] = []
  const planks = Math.max(2, Math.round(length / PLANK))
  for (let k = 0; k <= planks; k++) {
    const x = -half + (k / planks) * length
    // each plank a little off true, as a rope bridge's are
    const lean = (chance(seed, k) - 0.5) * 0.012
    parts.push({ shape: { kind: 'box', at: [r3(x), r3(y(x) - PLANK_THICK), r3(lean)], half: [PLANK_HALF, PLANK_THICK, BRIDGE_HALF] }, paint: paintOf(wood, seed + k) })
  }
  const line = (z: number, up: number): Vec3[] => Array.from({ length: 13 }, (_, k) => { const x = -half + (k / 12) * length; return [r3(x), r3(y(x) + up), z] })
  for (const side of [-1, 1]) {
    const z = r3(side * (BRIDGE_HALF + 0.008))
    // the rope under the planks, the rail, and hangers between them
    parts.push({ shape: { kind: 'sweep', path: line(z, -PLANK_THICK * 2), r: 0.008 }, paint: paintOf(rope, seed) })
    parts.push({ shape: { kind: 'sweep', path: line(z, RAIL), r: 0.009 }, paint: paintOf(rope, seed) })
    for (let k = 1; k < 8; k++) {
      const x = -half + (k / 8) * length
      parts.push({ shape: { kind: 'sweep', path: [[r3(x), r3(y(x)), z], [r3(x), r3(y(x) + RAIL), z]], r: 0.005 }, paint: paintOf(rope, seed) })
    }
    for (const end of [-1, 1]) {
      const x = end * half
      parts.push({ shape: { kind: 'cylinder', at: [r3(x), r3(y(x) - 0.08), z], height: r3(RAIL + 0.12), r: 0.018, rTop: 0.015 }, paint: paintOf(wood, seed + 50) })
    }
  }
  return {
    name: 'Rope bridge', ...SOLID, loop: like.loop, light: like.light, palette: like.palette,
    camera: { target: [0, 0, 0], distance: 4, azimuth: 0, elevation: 20 },
    parts,
  }
}

/** Poses a bridge's skeleton where it stands in the world (meters): turned from +x onto its way, its middle in place. */
export function poseBridge(b: Bridge, sk: Skeleton) {
  const dx = b.to[0] - b.from[0], dz = b.to[2] - b.from[2]
  sk.rootScale = SCALE
  sk.setRotation(0, axisAngle([0, 1, 0], Math.atan2(-dz, dx)))
  sk.place.set([((b.from[0] + b.to[0]) / 2) * SCALE, ((b.from[1] + b.to[1]) / 2) * SCALE, ((b.from[2] + b.to[2]) / 2) * SCALE])
  sk.update()
}

/** Poses an island's skeleton where it stands in the world. */
export function placeIsland(i: WorldIsland, sk: Skeleton) {
  sk.rootScale = SCALE
  sk.place.set([i.at[0] * SCALE, i.at[1] * SCALE, i.at[2] * SCALE])
  sk.update()
}

/** The ground of a whole world, in meters: every island's and every bridge's deck. */
export class WorldGround implements WalkGround {
  readonly islands: IslandGround[]
  private readonly decks: { a: Vec3; b: Vec3; length: number; ux: number; uz: number }[]

  constructor(world: WorldPlan, spacing: number) {
    this.islands = world.islands.map((i) => new IslandGround(i.doc, i.plan, spacing, i.at))
    this.decks = world.bridges.map((b) => {
      const a: Vec3 = [b.from[0] * SCALE, b.from[1] * SCALE, b.from[2] * SCALE], e: Vec3 = [b.to[0] * SCALE, b.to[1] * SCALE, b.to[2] * SCALE]
      const length = Math.hypot(e[0] - a[0], e[2] - a[2])
      return { a, b: e, length, ux: (e[0] - a[0]) / length, uz: (e[2] - a[2]) / length }
    })
  }

  /** The deck under (x, z), how far across it is (0 to 1), or null where there is none. `room` is how far in from its rails the point must be. */
  private deck(x: number, z: number, room: number) {
    for (const d of this.decks) {
      const px = x - d.a[0], pz = z - d.a[2], along = px * d.ux + pz * d.uz, across = Math.abs(px * d.uz - pz * d.ux)
      if (along >= 0 && along <= d.length && across <= BRIDGE_HALF * SCALE - room) return { d, t: along / d.length }
    }
    return null
  }

  /**
   * The deck's height for (x, z) on the land at either end of a bridge, where the deck runs over the island, or null
   * away from them. There the elf may come at the bridge from a slant, as far out as the edge, so walking up to it off
   * its line doesn't leave it stuck at the edge beside the deck; and the ground is at least the deck's height, so the
   * island's rim falling away beside the deck is no step.
   */
  private landing(x: number, z: number): number | null {
    for (const d of this.decks) {
      const px = x - d.a[0], pz = z - d.a[2], along = px * d.ux + pz * d.uz, across = Math.abs(px * d.uz - pz * d.ux)
      // a funnel: wide where the deck starts over the land, narrowing to the deck at the edge
      const over = INTO * SCALE, near = Math.min(Math.abs(along), Math.abs(d.length - along))
      const out = along < 0 || along > d.length ? 1 : Math.max(0, 1 - near / over)
      if (near <= over && across <= BRIDGE_HALF * SCALE - ROOM + (LANDING + ROOM) * out) {
        return deckAt(d.a[1], d.b[1], d.length, Math.max(0, Math.min(1, along / d.length)))
      }
    }
    return null
  }

  groundAt = (x: number, z: number): number => {
    const on = this.deck(x, z, 0)
    if (on) return deckAt(on.d.a[1], on.d.b[1], on.d.length, on.t)
    // the island it is over; off them all, far down
    let best = -1e9, deepest = -Infinity
    for (const g of this.islands) {
      const inside = g.insideAt(x, z)
      if (inside > deepest) { deepest = inside; best = g.groundAt(x, z) }
    }
    const apron = this.landing(x, z)
    if (apron !== null && deepest > 0) return Math.max(best, apron)
    return deepest > -1 ? best : -1e9
  }

  standsAt(x: number, z: number): boolean {
    if (this.deck(x, z, ROOM)) return true
    if (this.islands.some((g) => g.standsAt(x, z))) return true
    // by a bridge's end the edge gives way to the landing, wherever there is ground under it
    return this.landing(x, z) !== null && (this.deck(x, z, 0) !== null || this.islands.some((g) => g.insideAt(x, z) > 0))
  }
}

/** Where the elf starts in a world: on the first island's path, in from its free edge. */
export function worldStart(world: WorldPlan, ground: WalkGround): Walker {
  const first = world.islands[0]
  return startOf(first.plan, ground, first.at)
}
