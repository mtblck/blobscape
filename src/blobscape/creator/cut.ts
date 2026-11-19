import { buildVoxels, unlit } from '../../splat-engine/voxel.ts'
import { compileProject, landSpec, propSpec, settingOf, type CompiledProject, type SceneProject } from '../../splat-engine/project.ts'
import type { Built } from '../../splat-engine/body.ts'
import { DIORAMAS } from '../diorama/scenes.ts'
import { libraryProp } from './library.ts'

/**
 * What Scene Creator asks to have cut, in a worker so the page keeps drawing: a scene that opens whole, or a
 * project's land or one of its props, on a grid of `spacing`. `plain` cuts it with no light baked in, for the styles that
 * light the blobs themselves (cel shading, neon, stained glass).
 */
export type CutJob =
  | { kind: 'whole'; scene: string; spacing: number; plain?: boolean }
  | { kind: 'land'; project: SceneProject; spacing: number; plain?: boolean }
  | { kind: 'prop'; project: SceneProject; i: number; spacing: number; plain?: boolean }

// one project is compiled once and kept while the jobs that follow ask for its pieces
let kept: { key: string; cp: CompiledProject } | undefined
const compiled = (project: SceneProject): CompiledProject => {
  const key = JSON.stringify(project)
  if (kept?.key !== key) kept = { key, cp: compileProject(project, libraryProp) }
  return kept.cp
}

/** Cuts what a job asks for. */
export function cut(job: CutJob): Built {
  if (job.plain) return unlit(() => cut({ ...job, plain: false }))
  if (job.kind === 'whole') {
    const d = DIORAMAS.find((x) => x.id === job.scene)
    if (!d) throw new Error(`no scene called "${job.scene}"`)
    return d.make(job.spacing)
  }
  const cp = compiled(job.project)
  const land = landSpec(cp, job.spacing)
  if (job.kind === 'land') return buildVoxels(land)
  return withShadow(buildVoxels(propSpec(cp, job.i, job.spacing, settingOf(land))), cp.props[job.i].placed.at)
}

/** How dark the stand-in shadow is, and how wide, as a share of the prop's own width. */
const SHADOW = { color: [0.03, 0.03, 0.05] as [number, number, number], opacity: 0.78, wide: 0.42 }

/**
 * A prop cut on its own casts no baked shadow on the land under it, so while it is being arranged a dark flat blob
 * at its foot stands in for one (a merged cut at Finish gives it the real one). It rides on the prop's root bone.
 */
export function withShadow(b: Built, foot: ArrayLike<number>): Built {
  const n = b.blobs.count
  if (!n) return b
  let reach = 0
  for (let i = 0; i < n; i++) reach = Math.max(reach, Math.abs(b.blobs.center[i * 3] - foot[0]), Math.abs(b.blobs.center[i * 3 + 2] - foot[2]))
  const r = Math.max(0.02, reach * SHADOW.wide)
  b.blobs.push({ center: [foot[0], foot[1] + Math.max(0.02, r * 0.05), foot[2]], scale: [r, r * 0.01, r], quat: [0, 0, 0, 1], color: SHADOW.color, opacity: SHADOW.opacity })
  const grow = <T extends Uint8Array | Uint16Array | Float32Array>(a: T, per: number, fill: number[]): T => {
    const out = new (a.constructor as new (n: number) => T)((n + 1) * per)
    out.set(a.subarray(0, n * per))
    out.set(fill, n * per)
    return out
  }
  let part = 0
  for (let i = 0; i < n; i++) part = Math.max(part, b.partOf[i])
  return {
    ...b,
    skin: { joints: grow(b.skin.joints, 4, [0, 0, 0, 0]), weights: grow(b.skin.weights, 4, [1, 0, 0, 0]) },
    partOf: grow(b.partOf, 1, [part + 1]),
    seen: b.seen && grow(b.seen, 4, [255, 255, 255, 255]),
    glow: b.glow && grow(b.glow, 1, [0]),
  }
}
