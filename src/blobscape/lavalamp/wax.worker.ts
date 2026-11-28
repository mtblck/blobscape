/// <reference lib="webworker" />
/**
 * Runs the lamp's wax (wax.ts) off the main thread and cuts its surface (surface.ts) about thirty times a second,
 * posting the discs. The page steps nothing itself unless it draws off screen, where it runs the same `WaxRun`
 * by the stage's clock so a moment drawn twice is the same.
 */
import { WaxRun, type WaxFrame } from './run.ts'
import type { WaxKnobs } from './wax.ts'

declare const self: DedicatedWorkerGlobalScope

export type ToWax =
  | { type: 'start'; id: number; cell: number; seed: number; knobs: WaxKnobs; warm: number }
  | { type: 'set'; knobs: WaxKnobs }
  | { type: 'play'; playing: boolean }
export type FromWax = WaxFrame & { type: 'frame'; id: number }

let run: WaxRun | undefined
let id = 0
let playing = true
let last = 0
const POST_EVERY = 1000 / 30

function tick() {
  const now = performance.now()
  if (run && playing) {
    run.advance(Math.min(0.1, (now - last) / 1000), now / 1000)
    const f = run.frame(now / 1000)
    self.postMessage({ type: 'frame', id, ...f } satisfies FromWax, [f.center.buffer, f.normal.buffer, f.temp.buffer])
  }
  last = now
  setTimeout(tick, Math.max(4, POST_EVERY - (performance.now() - now)))
}

self.onmessage = (e: MessageEvent<ToWax>) => {
  const m = e.data
  if (m.type === 'start') {
    id = m.id
    run = new WaxRun(m.cell, m.seed, m.knobs, m.warm)
    last = performance.now()
    const f = run.frame(last / 1000)
    self.postMessage({ type: 'frame', id, ...f } satisfies FromWax, [f.center.buffer, f.normal.buffer, f.temp.buffer])
  } else if (m.type === 'set') { if (run) run.wax.knobs = { ...m.knobs } } else if (m.type === 'play') playing = m.playing
}
setTimeout(tick, POST_EVERY)
