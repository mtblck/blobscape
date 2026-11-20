/// <reference lib="webworker" />
import { described } from '../diorama/scenes.ts'
import { movable, pack } from '../creator/pack.ts'
import { planWorld } from './world.ts'
import { unlit } from '../../splat-engine/voxel.ts'

/**
 * Cuts a world of islands off the page's thread: an island is about three times the ground of a Pixel Diorama scene
 * and takes seconds to cut, which would hold the page still. The same biome, seed and count plan the same world here
 * as on the page. Each piece is sent as it is cut (the islands in order, then the bridges), then `done`.
 */
export interface IslandJob { id: number; biome: string; seed: number; count: number; spacing: number; /** No light baked in, for a look that lights it itself (blocks). */ plain?: boolean }

/** One piece of a world as it comes back: `index` counts the islands first, then the bridges. */
export interface IslandCut { id: number; index?: number; cut?: import('../creator/pack.ts').PackedCut; done?: true; error?: string }

self.onmessage = (ev: MessageEvent<IslandJob>) => {
  const { id, biome, seed, count, spacing, plain } = ev.data
  const post = (m: IslandCut, moved: Transferable[] = []) => (self as unknown as Worker).postMessage(m, moved)
  try {
    const world = planWorld(biome, seed, count)
    const docs = [...world.islands.map((i) => i.doc), ...world.bridges.map((b) => b.doc)]
    docs.forEach((doc, index) => {
      const scene = described('island', doc, doc.name)
      const cut = pack(plain ? unlit(() => scene.make(spacing)) : scene.make(spacing))
      post({ id, index, cut }, movable(cut))
    })
    post({ id, done: true })
  } catch (e) {
    post({ id, error: String(e) })
  }
}
