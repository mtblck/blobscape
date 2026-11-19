import { cut, type CutJob } from './cut.ts'
import { movable, pack } from './pack.ts'

// Scene Creator's cutting: one job at a time, answered with its number so the page drops answers it no longer wants
self.onmessage = (ev: MessageEvent<{ id: number; job: CutJob }>) => {
  const { id, job } = ev.data
  try {
    const p = pack(cut(job))
    ;(self as unknown as Worker).postMessage({ id, cut: p }, movable(p))
  } catch (e) {
    ;(self as unknown as Worker).postMessage({ id, error: e instanceof Error ? e.message : String(e) })
  }
}
