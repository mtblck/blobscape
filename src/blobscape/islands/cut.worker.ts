/// <reference lib="webworker" />
import { described } from '../diorama/scenes.ts'
import { movable, pack } from '../creator/pack.ts'
import { planWorld } from './world.ts'
import { withoutClouds } from './island.ts'
import { hugged, unlit, within } from '../../splat-engine/voxel.ts'

/**
 * Cuts a world of islands off the page's thread: an island is about three times the ground of a Diorama scene
 * and takes seconds to cut, which would hold the page still. The same biome, seed and count plan the same world here
 * as on the page. Each piece is sent as it is cut (the islands in order, then the bridges), then `done`.
 */
export interface IslandJob {
  id: number; biome: string; seed: number; count: number; spacing: number
  /** No light baked in and no clouds, for a look that lights it itself and draws its clouds as soft blobs (blocks). */
  plain?: boolean
  /** Which pieces this worker cuts (islands first, then bridges); left out, all of them. Big islands are cut a worker each. */
  only?: number[]
  /** Cut only the grid points inside this box, in the island's own units: a finer patch round one place. */
  region?: { min: [number, number, number]; max: [number, number, number] }
}

/** One piece of a world as it comes back: `index` counts the islands first, then the bridges. */
export interface IslandCut { id: number; index?: number; cut?: import('../creator/pack.ts').PackedCut; done?: true; error?: string }

self.onmessage = (ev: MessageEvent<IslandJob>) => {
  const { id, biome, seed, count, spacing, plain, only, region } = ev.data
  const post = (m: IslandCut, moved: Transferable[] = []) => (self as unknown as Worker).postMessage(m, moved)
  try {
    const world = planWorld(biome, seed, count)
    const docs = [...world.islands.map((i) => i.doc), ...world.bridges.map((b) => b.doc)]
    docs.forEach((doc, index) => {
      if (only && !only.includes(index)) return
      const scene = described('island', plain && index < world.islands.length ? withoutClouds(doc) : doc, doc.name)
      // baked light: discs fitted to the shapes' outer edges, as Diorama cuts, so edges are straight and lines sit on them
      const make = () => (plain ? unlit(() => scene.make(spacing)) : hugged(() => scene.make(spacing)))
      const cut = pack(region ? within(region, make) : make())
      post({ id, index, cut }, movable(cut))
    })
    post({ id, done: true })
  } catch (e) {
    post({ id, error: String(e) })
  }
}
