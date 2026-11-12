/// <reference lib="webworker" />
/**
 * Trains the Photo shoot lesson's blobs off the main thread, so the views
 * stay smooth to drag. Takes the photos, trains, and posts the blobs about
 * eight times a second so you can watch them gather; scores come at the end.
 */
import { BLOBS, CHECK_VIEWS, PHOTO, Trainer, match, orbitCam, render, stepsFor, type Model } from './train3d.ts'
import { subject } from './subject.ts'

declare const self: DedicatedWorkerGlobalScope

export type ToShoot = { type: 'train'; run: number; azimuths: number[]; elevation: number }
export type FromShoot =
  | { type: 'photos'; run: number; photos: Float64Array[] }
  | { type: 'progress'; run: number; step: number; total: number; model: Model }
  | { type: 'done'; run: number; model: Model; photos: number; all: number }

const truth = subject()
const checks = CHECK_VIEWS.map(([a, e]) => orbitCam(a, e, PHOTO))
let current = 0

function copy(m: Model): Model {
  return { count: m.count, pos: m.pos.slice(), logS: m.logS.slice(), col: m.col.slice(), op: m.op.slice() }
}

self.onmessage = (e: MessageEvent<ToShoot>) => {
  const { run, azimuths, elevation } = e.data
  current = run
  const cams = azimuths.map((a) => orbitCam(a, elevation, PHOTO))
  const photos = cams.map((c) => render(truth, c))
  self.postMessage({ type: 'photos', run, photos } satisfies FromShoot)
  const t = new Trainer(cams, photos, BLOBS, stepsFor(cams.length))
  let last = 0
  const chunk = () => {
    // A newer run started: drop this one
    if (run !== current) return
    const until = performance.now() + 25
    while (t.step < t.total && performance.now() < until) t.tick()
    if (t.step >= t.total) {
      self.postMessage({ type: 'done', run, model: copy(t.m), photos: cams.length ? match(t.m, truth, cams) : 0, all: cams.length ? match(t.m, truth, checks) : 0 } satisfies FromShoot)
      return
    }
    const now = performance.now()
    if (now - last > 120) {
      last = now
      self.postMessage({ type: 'progress', run, step: t.step, total: t.total, model: copy(t.m) } satisfies FromShoot)
    }
    // Yield so a newer run's message can arrive
    setTimeout(chunk, 0)
  }
  if (cams.length === 0) {
    self.postMessage({ type: 'done', run, model: t.m, photos: 0, all: 0 } satisfies FromShoot)
    return
  }
  chunk()
}
