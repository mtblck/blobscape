/// <reference lib="webworker" />
import { described } from '../diorama/scenes.ts'
import { movable, pack } from '../creator/pack.ts'
import { makeIsland } from './island.ts'

/**
 * Cuts an island off the page's thread: an island is about three times the ground of a Pixel Diorama scene and takes
 * seconds to cut, which would hold the page still. The same biome and seed make the same island here as on the page.
 */
export interface IslandJob { id: number; biome: string; seed: number; spacing: number }

self.onmessage = (ev: MessageEvent<IslandJob>) => {
  const { id, biome, seed, spacing } = ev.data
  try {
    const island = makeIsland(biome, seed)
    const cut = pack(described('island', island.doc, island.plan.name).make(spacing))
    ;(self as unknown as Worker).postMessage({ id, cut }, movable(cut))
  } catch (e) {
    ;(self as unknown as Worker).postMessage({ id, error: String(e) })
  }
}
