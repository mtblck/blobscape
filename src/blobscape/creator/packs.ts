import type { Vec3 } from '../../splat-core/blobs.ts'
import { MAX_PROPS, type SceneProject } from '../../splat-engine/project.ts'

/**
 * Asset packs for Scene Creator's Props mode: themed sets of library entries (kit pieces and props lifted from
 * scenes) to browse together and set down at once, in rows round a spot. Pure, so it is tested. An idea from Silicon
 * Jungle's Ink Studio, whose kit comes in packs.
 */
export interface Pack {
  id: string
  name: string
  /** A sentence for its chip's title and the page's status line. */
  about: string
  /** Library ids, in the order they are set down: front row first, left to right. */
  items: string[]
}

export const PACKS: Pack[] = [
  { id: 'ruins', name: 'Old ruins', about: 'Fallen walls, an arch, columns and steps', items: ['kit-ruined-wall', 'kit-arch', 'kit-steps', 'kit-columns', 'kit-boulder', 'kit-bush'] },
  { id: 'farm', name: 'Farmyard', about: 'A fence, a haystack, sheep, a duck and an apple tree', items: ['kit-fence', 'haystack', 'sheep', 'duck', 'apple-tree', 'mailbox'] },
  { id: 'woods', name: 'Woodland', about: 'Oaks, pines, a stump, a bush and a boulder', items: ['kit-oak', 'pine', 'kit-stump', 'small-pine', 'kit-bush', 'kit-boulder'] },
  { id: 'desert', name: 'Desert', about: 'Cactus, boulders, columns and glowing crystals', items: ['kit-cactus', 'kit-boulder', 'kit-columns', 'kit-crystals'] },
  { id: 'coast', name: 'Coast', about: 'A lighthouse, a cottage, a jetty, a boat and a buoy', items: ['lighthouse', 'keepers-cottage', 'jetty', 'sailing-boat', 'buoy'] },
  { id: 'garden', name: 'Garden', about: 'A brick wall, steps, a bush, an apple tree and a stump', items: ['kit-brick-wall', 'kit-steps', 'kit-bush', 'small-apple-tree', 'kit-stump'] },
]

/** How far apart a pack's things are set down, in the scene's units: kit pieces are about a meter across. */
export const PACK_GAP = 1.2
/** Things in a row. */
export const PACK_ROW = 3

/** Where each of `count` things goes round `middle`: rows of `PACK_ROW` across x, going back along -z, centered. */
export function packSpots(count: number, middle: Vec3): [number, number][] {
  const rows = Math.ceil(count / PACK_ROW)
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / PACK_ROW), inRow = Math.min(PACK_ROW, count - row * PACK_ROW)
    const col = i % PACK_ROW
    return [middle[0] + (col - (inRow - 1) / 2) * PACK_GAP, middle[2] - (row - (rows - 1) / 2) * PACK_GAP]
  })
}

/**
 * The project with the whole pack set down round `middle`, each on the ground under its spot (`heightAt`), in one
 * step; the project as it was when the pack won't all fit in the props a scene may hold.
 */
export function packAdded(p: SceneProject, pack: Pack, middle: Vec3, heightAt: (x: number, z: number) => number): SceneProject {
  if (p.props.length + pack.items.length > MAX_PROPS) return p
  const r = (v: number) => Math.round(v * 1e4) / 1e4
  const spots = packSpots(pack.items.length, middle)
  return {
    ...p,
    props: [...p.props, ...pack.items.map((prop, i) => {
      const [x, z] = spots[i]
      return { prop, at: [r(x), r(heightAt(x, z)), r(z)] as Vec3, turn: 0, size: 1 }
    })],
  }
}
