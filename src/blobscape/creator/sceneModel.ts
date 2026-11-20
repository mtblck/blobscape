/**
 * A model of a whole scene (#380): a .glb whose top-level nodes are its things (a house, a tree, the ground). Each
 * thing becomes a model prop of its own, set down where it stood in the file, the whole scene sized to the land it
 * opens on. Pure, tested.
 */
import { SIZE_RANGE, type SceneProject } from '../../splat-engine/project.ts'
import type { Vec3 } from '../../splat-core/blobs.ts'

/** How much of the land's width a whole scene is set across. */
export const SCENE_SHARE = 0.8

/** The id of one thing in a scene file: the file's model id and its place in the file. */
export const partId = (fileId: string, i: number): string => `${fileId}-${i}`

/** The file a model's id comes from: a scene's thing names its file; any other model is its file. */
export const fileIdOf = (id: string): string => id.replace(/-\d+$/, '')

/** Whether a model id names one thing in a scene file. */
export const isPart = (id: string): boolean => /-\d+$/.test(id)

/**
 * Where each thing stands and how big it is set down, from its box in the file: the whole scene centered on the land
 * and scaled so its wider way is `SCENE_SHARE` of `span`, its lowest point on `floor`. A thing's size is its longest
 * side there, as a still model is fitted to a longest side of 1 standing on the middle of its bottom, or its height
 * for one covered in blobs (`byHeight`), which is made a unit tall.
 */
export function sceneLayout(boxes: readonly { min: Vec3; max: Vec3; byHeight?: boolean }[], span: number, floor = 0): { at: Vec3; size: number }[] {
  if (!boxes.length) return []
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const b of boxes) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b.min[k]); hi[k] = Math.max(hi[k], b.max[k]) }
  const wide = Math.max(hi[0] - lo[0], hi[2] - lo[2], 1e-6)
  // the scene's own scale, unless a thing would come out past the sizes a prop may take
  const longest = Math.max(...boxes.map((b) => Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2], 1e-6)))
  const shortest = Math.min(...boxes.map((b) => Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2], 1e-6)))
  let s = (span * SCENE_SHARE) / wide
  s = Math.min(s, SIZE_RANGE[1] / longest)
  s = Math.max(s, Math.min(SIZE_RANGE[0] / shortest, SIZE_RANGE[1] / longest))
  const mid = [(lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2]
  const r = (v: number) => Math.round(v * 1e4) / 1e4
  return boxes.map((b) => {
    const side = b.byHeight ? Math.max(b.max[1] - b.min[1], 1e-6) : Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2], 1e-6)
    return {
      at: [r(((b.min[0] + b.max[0]) / 2 - mid[0]) * s), r(floor + (b.min[1] - lo[1]) * s), r(((b.min[2] + b.max[2]) / 2 - mid[1]) * s)] as Vec3,
      size: r(Math.min(SIZE_RANGE[1], Math.max(SIZE_RANGE[0], side * s))),
    }
  })
}

/** A new project of a whole scene on `base`'s land: one prop for each thing, standing as `sceneLayout` says. */
export function sceneProject(base: SceneProject, name: string, things: readonly { id: string; at: Vec3; size: number }[]): SceneProject {
  return { ...base, name, props: things.map((t) => ({ prop: t.id, at: [...t.at] as Vec3, turn: 0, size: t.size })) }
}
