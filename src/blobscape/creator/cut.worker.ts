import { colorsOf, cut, type CutJob } from './cut.ts'
import { isCreature } from './library.ts'
import { isModel } from './models.ts'
import { movable, pack } from './pack.ts'

// Scene Creator's cutting: one job at a time, answered with its number so the page drops answers it no longer wants
self.onmessage = (ev: MessageEvent<{ id: number; job: CutJob }>) => {
  const { id, job } = ev.data
  try {
    const b = cut(job)
    const p = pack(b)
    if (job.kind === 'prop' && (isCreature(job.project.props[job.i].prop) || isModel(job.project.props[job.i].prop))) p.colors = colorsOf(b)
    if (job.kind === 'land' && typeof job.project.land === 'string' && isModel(job.project.land)) p.colors = colorsOf(b, 16)
    ;(self as unknown as Worker).postMessage({ id, cut: p }, movable(p))
  } catch (e) {
    ;(self as unknown as Worker).postMessage({ id, error: e instanceof Error ? e.message : String(e) })
  }
}
