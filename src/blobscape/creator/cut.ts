import { buildVoxels } from '../../splat-engine/voxel.ts'
import { compileProject, landSpec, propSpec, settingOf, type CompiledProject, type SceneProject } from '../../splat-engine/project.ts'
import type { Built } from '../../splat-engine/body.ts'
import { DIORAMAS } from '../diorama/scenes.ts'
import { libraryProp } from './library.ts'

/**
 * What Scene Creator asks to have cut, in a worker so the page keeps drawing: a scene that opens whole, or a
 * project's land or one of its props, on a grid of `spacing`.
 */
export type CutJob =
  | { kind: 'whole'; scene: string; spacing: number }
  | { kind: 'land'; project: SceneProject; spacing: number }
  | { kind: 'prop'; project: SceneProject; i: number; spacing: number }

// one project is compiled once and kept while the jobs that follow ask for its pieces
let kept: { key: string; cp: CompiledProject } | undefined
const compiled = (project: SceneProject): CompiledProject => {
  const key = JSON.stringify(project)
  if (kept?.key !== key) kept = { key, cp: compileProject(project, libraryProp) }
  return kept.cp
}

/** Cuts what a job asks for. */
export function cut(job: CutJob): Built {
  if (job.kind === 'whole') {
    const d = DIORAMAS.find((x) => x.id === job.scene)
    if (!d) throw new Error(`no scene called "${job.scene}"`)
    return d.make(job.spacing)
  }
  const cp = compiled(job.project)
  const land = landSpec(cp, job.spacing)
  if (job.kind === 'land') return buildVoxels(land)
  return buildVoxels(propSpec(cp, job.i, job.spacing, settingOf(land)))
}
