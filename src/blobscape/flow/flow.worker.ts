/// <reference lib="webworker" />
/**
 * Runs one box of Sand, Snow and Goo (flow/box.ts) off the main thread, as
 * close to the speed asked for as the device allows (never faster, and at
 * most a tenth of a second at a time), and posts what the view draws about
 * thirty times a second. All three lanes is three of these workers.
 */
import type { PartialKnobs } from '../../splat-engine/mpm.ts'
import { FlowBox, type FlowFrame, type Setup, type Thing } from './box.ts'

declare const self: DedicatedWorkerGlobalScope

export type ToFlow =
  | { type: 'start'; id: number; setup: Setup; knobs: PartialKnobs; gravity: number }
  | { type: 'set'; knobs?: PartialKnobs; gravity?: number; speed?: number }
  | { type: 'more' }
  | { type: 'drop'; thing: Thing; size: number; weight: number }
  | { type: 'poke'; at: [number, number, number]; push: [number, number, number] }
  | { type: 'play'; playing: boolean }
  /** For tests and verify: run exactly this many seconds now, then post. */
  | { type: 'run'; seconds: number }
/** A frame, with the `id` of the `start` its box came from, so the page can tell a new box's frames from the last one's. */
export type FromFlow = FlowFrame & { type: 'frame'; id: number }

let box: FlowBox | undefined
let playing = true
let speed = 1
let last = 0
let started = false
let id = 0
/** Whether anything has changed since the last frame was posted: a paused box posts nothing. */
let dirty = false

function post() {
  if (!box || !dirty) return
  dirty = false
  const f = box.frame()
  self.postMessage({ type: 'frame', id, ...f } satisfies FromFlow, [f.x.buffer, f.shade.buffer, f.tone.buffer, f.body.buffer])
}

function tick() {
  const now = performance.now()
  const dt = Math.min(0.1, (now - last) / 1000) * speed
  last = now
  if (playing && box) {
    // as much of the time gone by as fits in about 25 ms, so a slow device runs slower instead of falling behind
    const until = now + 25
    let ran = 0
    while (ran < dt && performance.now() < until) ran += box.advance(box.sim.dt)
    if (ran) dirty = true
  }
  post()
  setTimeout(tick, 1000 / 30)
}

self.onmessage = (e: MessageEvent<ToFlow>) => {
  const m = e.data
  if (m.type === 'start') {
    box = new FlowBox(m.setup, m.knobs, m.gravity)
    id = m.id
    dirty = true
    if (!started) { started = true; last = performance.now(); tick() }
  } else if (m.type === 'play') playing = m.playing
  else if (!box) return
  else if (m.type === 'set') {
    if (m.knobs) box.sim.set(m.knobs)
    if (m.gravity !== undefined) box.sim.gravity = m.gravity
    if (m.speed !== undefined) speed = m.speed
  } else if (m.type === 'more') box.pourMore()
  else if (m.type === 'drop') box.drop(m.thing, m.size, m.weight)
  else if (m.type === 'poke') box.sim.poke(m.at, 0.12, m.push)
  else if (m.type === 'run') { box.advance(m.seconds); dirty = true; post() }
}
