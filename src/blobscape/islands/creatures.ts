import type { Built } from '../../splat-engine/body.ts'
import { Skeleton, axisAngle, mulQ, rotate } from '../../splat-engine/rig.ts'
import type { Species } from '../../splat-engine/zoo/species.ts'
import { monsterSpecies } from '../../splat-engine/zoo/monster.ts'
import { CREATURES } from '../creature/fromScenes.ts'
import { goingMove, loopThrough, paceOf, restMove, wanderAt, type WanderPlan } from '../wander.ts'
import { chance, hashOf } from './materials.ts'
import { SCALE, passes, type IslandGround, type WalkGround } from './walk.ts'
import type { WorldPlan } from './world.ts'

/**
 * Creatures that live on the islands, a few an island, picked by its biome. Each walks a loop of stops round a home of
 * its own (the sandbox's walk about, wander.ts), every stop and every leg checked on the island's ground, so it never
 * walks off an edge or through a tree. Where each is comes from the time alone.
 */

/** Who lives in a biome, and how big each is set down, as a share of the size it is made (each is made to its own scale). */
export interface Kind { id: string; size: number }
export const LIVES: Record<string, Kind[]> = {
  meadow: [{ id: 'fox', size: 0.55 }, { id: 'frog', size: 1.6 }, { id: 'minimalist-fox', size: 0.55 }],
  pinewood: [{ id: 'owl', size: 0.45 }, { id: 'fox', size: 0.55 }, { id: 'monster', size: 1.4 }],
  mesa: [{ id: 'crocodile', size: 0.95 }, { id: 'monster', size: 1.4 }],
}

/** How many live on an island, at least and at most: an island is about a hundred and fifty meters across. */
export const LEAST = 6, MOST = 9
/** How far from its home a creature roams at most, meters. */
export const ROAM = 12
/** How far apart creatures' homes are, at least, meters. */
const APART = 14
/** How far in from the island's edge a home is, at least, meters. */
const HOME_IN = 5
/** Steps along a leg its ground is checked at, meters. */
const CHECK = 0.1
/** How much room a creature takes from the elf, as a share of its height. */
const ROOM = 0.45

export interface Resident {
  /** Its species' id ('monster' for a made-up one, with `seed`). */
  id: string
  seed: number
  size: number
  island: number
  /** Where its loop is round, meters. */
  home: [number, number]
  plan: WanderPlan
  /** Where on its loop it starts, seconds. */
  offset: number
  /** How tall it stands, meters. */
  height: number
}

const species = new Map<string, Species>()
/** A resident's species; a made-up monster from its seed. */
export function speciesOf(id: string, seed: number): Species {
  const key = id === 'monster' ? `monster:${seed}` : id
  let sp = species.get(key)
  if (!sp) {
    sp = id === 'monster' ? monsterSpecies(seed) : CREATURES.find((c) => c.id === id)
    if (!sp) throw new Error(`no creature ${id}`)
    species.set(key, sp)
  }
  return sp
}

/** The lightest of a species' detail chips, at least 4000 blobs: a creature on an island is small on screen. */
export const blobsOf = (sp: Species) => sp.detail.find((n) => n >= 4000) ?? sp.detail[sp.detail.length - 1]

/** Builds a resident: made standing on the floor at the middle, facing +z. */
export function makeResident(r: Resident): Built {
  const sp = speciesOf(r.id, r.seed)
  return sp.make(blobsOf(sp), sp.looks[0].id) as Built
}

/** Another of the same creature: the same blobs and skin on a skeleton of its own, so a body is built once however many share it. */
export const another = (b: Built): Built => ({ ...b, skeleton: new Skeleton(b.skeleton.bones) })

/** How tall a built creature stands, in the units it is made in. */
function tallOf(b: Built) {
  let y0 = Infinity, y1 = -Infinity
  for (let i = 0; i < b.blobs.count; i++) { const y = b.blobs.center[i * 3 + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y }
  return y1 - y0
}

/** Whether a creature may go from a to b in a straight line: the ground passes it every `CHECK` of the way. */
function clear(g: WalkGround, a: readonly [number, number], b: readonly [number, number]) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / CHECK))
  for (let k = 1; k <= n; k++) {
    const x0 = a[0] + ((b[0] - a[0]) * (k - 1)) / n, z0 = a[1] + ((b[1] - a[1]) * (k - 1)) / n
    const x1 = a[0] + ((b[0] - a[0]) * k) / n, z1 = a[1] + ((b[1] - a[1]) * k) / n
    if (!passes(g, x0, z0, x1, z1)) return false
  }
  return true
}

/**
 * Who lives on each island of a world, where, and the loop each walks: homes well in from the edge and apart, stops
 * the island lets it stand on, every leg clear. `built` gives a resident's body (made once, for its pace and height);
 * the same world gives the same residents.
 */
export function settle(world: WorldPlan, islands: readonly IslandGround[], built: (r: Pick<Resident, 'id' | 'seed'>) => Built): Resident[] {
  const out: Resident[] = []
  world.islands.forEach((isl, j) => {
    const kinds = LIVES[isl.biome] ?? LIVES.meadow
    const g = islands[j]
    const h = (salt: number) => chance(isl.seed, 7000 + salt)
    const many = LEAST + Math.floor(h(1) * (MOST - LEAST + 1))
    const half = Math.max(isl.plan.land.half[0], isl.plan.land.half[1]) * SCALE
    const homes: [number, number][] = []
    for (let c = 0; c < many; c++) {
      const kind = kinds[Math.floor(h(10 + c) * kinds.length)]
      // every made-up monster on one island is the same kind, so an island builds each body once
      const seed = 1 + (hashOf(isl.seed, 7100) % 9999)
      const body = built({ id: kind.id, seed })
      const tall = tallOf(body), height = tall * kind.size
      const sp = speciesOf(kind.id, seed)
      const go = goingMove(sp)
      // meters a second: the move's own pace in its units, brought to its size
      const pace = go ? paceOf(body, go, tall) * kind.size : 0
      let home: [number, number] | undefined
      for (let t = 0; t < 120 && !home; t++) {
        const x = isl.at[0] * SCALE + (h(100 + c * 97 + t * 2) * 2 - 1) * half, z = isl.at[2] * SCALE + (h(101 + c * 97 + t * 2) * 2 - 1) * half
        if (g.insideAt(x, z) < HOME_IN || !g.standsAt(x, z)) continue
        if (homes.some((o) => Math.hypot(o[0] - x, o[1] - z) < APART)) continue
        home = [x, z]
      }
      if (!home) continue
      homes.push(home)
      // stops round the home, each one it may stand on and reach from the last; the loop closes back home
      const stops: [number, number][] = [[0, 0]]
      // a slow one keeps closer to home, so a leg takes at most about eight seconds
      const roam = Math.max(1, Math.min(ROAM, pace * 8))
      const at = (s: readonly [number, number]): [number, number] => [home![0] + s[0], home![1] + s[1]]
      for (let s = 1; s < 6 && go; s++) {
        for (let t = 0; t < 30; t++) {
          const r = roam * Math.sqrt(0.2 + 0.8 * h(300 + c * 131 + s * 17 + t)), a = 2 * Math.PI * h(301 + c * 131 + s * 17 + t)
          const p: [number, number] = [Math.sin(a) * r, Math.cos(a) * r]
          const prev = stops[stops.length - 1]
          if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) < roam / 3) continue
          if (!g.standsAt(...at(p)) || !clear(g, at(prev), at(p))) continue
          stops.push(p)
          break
        }
      }
      // the way back home must be clear too: drop stops from the end until it is
      while (stops.length > 1 && !clear(g, at(stops[stops.length - 1]), at(stops[0]))) stops.pop()
      const plan = loopThrough(stops, Math.max(0.05, pace), h(400 + c) * 360)
      out.push({ id: kind.id, seed, size: kind.size, island: j, home, plan, offset: h(500 + c) * plan.period, height })
    }
  })
  return out
}

/** Where a resident is at a time, meters, which way it faces (degrees, 0 is +z) and whether it is on the move. */
export function residentAt(r: Resident, t: number) {
  const w = wanderAt(r.plan, t + r.offset)
  return { x: r.home[0] + w.dx, z: r.home[1] + w.dz, yaw: w.yaw, going: w.going }
}

/** Poses a resident's skeleton at a time: its going move while it walks, its resting one while it stops, stood on the ground. */
export function poseResident(r: Resident, sk: Skeleton, t: number, ground: (x: number, z: number) => number, still = false) {
  const sp = speciesOf(r.id, r.seed)
  const w = still ? { ...residentAt(r, 0), going: false } : residentAt(r, t)
  const m = (w.going ? goingMove(sp) : undefined) ?? restMove(sp) ?? sp.moves[0]
  const tt = still ? 0 : t + r.offset
  m.pose(sk, ((tt % m.seconds) + m.seconds) % m.seconds)
  // turn it to its way about its root, size it, and stand its foot (the origin it was made on) on the ground
  const turn = axisAngle([0, 1, 0], (w.yaw * Math.PI) / 180)
  sk.setRotation(0, mulQ(turn, sk.rotation.subarray(0, 4)))
  sk.offset.set(rotate(turn, sk.offset.subarray(0, 3)), 0)
  sk.rootScale = r.size
  const head = sk.bones[0].head, turned = rotate(turn, head)
  sk.place.set([w.x - head[0] + r.size * turned[0], ground(w.x, w.z) - head[1] + r.size * turned[1], w.z - head[2] + r.size * turned[2]])
  sk.update()
}

/**
 * The ground as the elf meets it with creatures about: it may not stand where one is now (`at` is set each frame
 * before the elf moves).
 */
export class AmongCreatures implements WalkGround {
  /** Where each creature is now, and the room it takes, meters. */
  at: { x: number; z: number; r: number }[] = []
  /** Where the elf stands before it moves: a step that takes it further from a creature it is already too near is allowed, so it can't be pinned. */
  from = { x: 0, z: 0 }
  readonly ground: WalkGround
  constructor(ground: WalkGround) { this.ground = ground }
  groundAt = (x: number, z: number) => this.ground.groundAt(x, z)
  /** Which island is at (x, z), where the ground under it knows. */
  islandAt = (x: number, z: number) => (this.ground as WalkGround & { islandAt?: (x: number, z: number) => number }).islandAt?.(x, z)
  standsAt(x: number, z: number) {
    for (const c of this.at) {
      const d = Math.hypot(x - c.x, z - c.z)
      if (d < c.r && d <= Math.hypot(this.from.x - c.x, this.from.z - c.z)) return false
    }
    return this.ground.standsAt(x, z)
  }
  /** Ground taken by things that stay where they are (the islands' guardians), meters. */
  fixed: { x: number; z: number; r: number }[] = []
  /** Sets where everyone is at a time, and where the elf stands. */
  update(residents: readonly Resident[], t: number, elf: { x: number; z: number }) {
    this.from = { x: elf.x, z: elf.z }
    this.at = [...this.fixed, ...residents.map((r) => { const w = residentAt(r, t); return { x: w.x, z: w.z, r: Math.max(0.3, r.height * ROOM) } })]
  }
}
