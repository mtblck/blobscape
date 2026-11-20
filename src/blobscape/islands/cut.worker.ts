/// <reference lib="webworker" />
import { described } from '../diorama/scenes.ts'
import { movable, pack } from '../creator/pack.ts'
import { makeIsland } from './island.ts'
import { unlit } from '../../splat-engine/voxel.ts'

/**
 * Cuts an island off the page's thread: an island is about three times the ground of a Pixel Diorama scene and takes
 * seconds to cut, which would hold the page still. The same biome and seed make the same island here as on the page.
 */
export interface IslandJob { id: number; biome: string; seed: number; spacing: number; /** No light baked in, for a look that lights it itself (blocks). */ plain?: boolean }

self.onmessage = (ev: MessageEvent<IslandJob>) => {
  const { id, biome, seed, spacing, plain } = ev.data
  try {
    const island = makeIsland(biome, seed)
    const scene = described('island', island.doc, island.plan.name)
    const cut = pack(plain ? unlit(() => scene.make(spacing)) : scene.make(spacing))
    ;(self as unknown as Worker).postMessage({ id, cut }, movable(cut))
  } catch (e) {
    ;(self as unknown as Worker).postMessage({ id, error: String(e) })
  }
}
