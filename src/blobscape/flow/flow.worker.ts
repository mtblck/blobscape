/// <reference lib="webworker" />
/**
 * Runs Sand, Snow and Goo's simulation (splat-engine/mpm.ts) off the main
 * thread, as close to real time as the device allows (never faster, and at
 * most a tenth of a second at a time), and posts where every particle is
 * about thirty times a second.
 */
import { Mpm, type Material } from '../../splat-engine/mpm.ts'
import { CAPACITY, pour, type Pour } from './scenes.ts'

declare const self: DedicatedWorkerGlobalScope

export type ToFlow =
  | { type: 'start'; scene: Pour[]; gravity: number; friction: number }
  | { type: 'pour'; pour: Pour }
  | { type: 'poke'; at: [number, number, number]; push: [number, number, number] }
  | { type: 'settings'; gravity: number; friction: number }
  | { type: 'play'; playing: boolean }
  /** For tests and verify: run exactly this many seconds now, then post. */
  | { type: 'run'; seconds: number }
export type FromFlow = { type: 'frame'; count: number; x: Float32Array; mat: Uint8Array; time: number; full: boolean }

let sim = new Mpm({ capacity: CAPACITY })
let playing = true
let last = 0
let seed = 1
let full = false

function post() {
  const x = new Float32Array(sim.count * 3)
  for (let i = 0; i < x.length; i++) x[i] = sim.x[i]
  const mat = sim.mat.slice(0, sim.count)
  self.postMessage({ type: 'frame', count: sim.count, x, mat, time: sim.time, full } satisfies FromFlow, [x.buffer, mat.buffer])
}

function add(p: Pour) { full = pour(sim, p, seed++) || full }

function tick() {
  const now = performance.now()
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (playing && sim.count) {
    // as much of the time gone by as fits in about 25 ms, so a slow device runs slower instead of falling behind
    const until = now + 25
    let ran = 0
    while (ran < dt && performance.now() < until) { sim.step(); ran += sim.dt }
  }
  post()
  setTimeout(tick, 1000 / 30)
}

self.onmessage = (e: MessageEvent<ToFlow>) => {
  const m = e.data
  if (m.type === 'start') {
    sim = new Mpm({ capacity: CAPACITY, gravity: m.gravity, friction: m.friction })
    full = false
    for (const p of m.scene) add(p)
    if (!last) { last = performance.now(); tick() }
  } else if (m.type === 'pour') add(m.pour)
  else if (m.type === 'poke') sim.poke(m.at, 0.12, m.push)
  else if (m.type === 'settings') { sim.gravity = m.gravity; sim.setFriction(m.friction) }
  else if (m.type === 'play') playing = m.playing
  else if (m.type === 'run') { sim.advance(m.seconds); post() }
}

export type { Material }
