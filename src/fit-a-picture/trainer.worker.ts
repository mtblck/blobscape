/// <reference lib="webworker" />
/**
 * Runs the fit off the main thread, so the page stays responsive while it
 * trains as fast as the CPU allows. Posts a frame (display image, blobs, new
 * losses and events) about 30 times a second.
 */
import { Fitter, rng, type Rng } from './fit.ts'
import type { FromWorker, Settings, ToWorker, TrainEvent } from './protocol.ts'

declare const self: DedicatedWorkerGlobalScope

/** Warm-up before the first prune or grow, and the gap between them (3DGS uses 500 and 100 at its scale). */
const WARMUP = 100
const EVERY = 100
/** The display image's long side, in pixels. The fit is redrawn at this size for every frame. */
const DISPLAY_LONG = 480

let fitter: Fitter | null = null
let random: Rng = rng(1)
let settings: Settings | null = null
let running = false
let timer: ReturnType<typeof setTimeout> | null = null
let losses: number[] = []
let events: TrainEvent[] = []
let pruned: number[] = []
let display = new Float32Array(0)
let carry = 0
let last = 0

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data
  switch (m.type) {
    case 'load':
      fitter = new Fitter(m.target, m.width, m.height)
      settings = m.settings
      restart(m.seed)
      break
    case 'restart':
      if (!fitter) return
      settings = m.settings
      restart(m.seed)
      break
    case 'settings':
      settings = m.settings
      if (fitter) fitter.rate = settings.rate
      if (!running) post()
      break
    case 'play':
      running = true
      last = performance.now()
      schedule()
      break
    case 'pause':
      running = false
      post()
      break
    case 'step':
      if (fitter) {
        for (let i = 0; i < m.n; i++) train()
        post()
      }
      break
    case 'add': {
      if (!fitter || !settings) return
      const f = fitter
      f.loss() // colour the new blobs from the picture as it is now
      const s = Math.max(1.5, Math.sqrt((f.width * f.height) / Math.max(50, f.count)) * 0.5)
      // A cluster, so one click visibly lands
      let n = 0
      for (let i = 0; i < m.n; i++) {
        const spread = i === 0 ? 0 : s * 1.2
        if (f.addPatch(m.x * f.width + (random() - 0.5) * spread, m.y * f.height + (random() - 0.5) * spread, s)) n++
      }
      if (n) events.push({ kind: 'add', n, at: f.iteration })
      if (!running) post()
      break
    }
    case 'grow': {
      if (!fitter) return
      fitter.loss() // densify reads the error of the picture as it is now
      const n = fitter.densify(m.n, random)
      if (n) events.push({ kind: 'grow', n, at: fitter.iteration })
      if (!running) post()
      break
    }
    case 'prune': {
      if (!fitter || !settings) return
      prune(true)
      if (!running) post()
      break
    }
  }
}

function restart(seed: number) {
  const f = fitter!
  random = rng(seed)
  f.seed(settings!.start, random)
  f.rate = settings!.rate
  f.loss() // so the first frame's error view and the first grow have something to read
  losses = []
  events = [{ kind: 'start', n: f.count, at: 0 }]
  pruned = []
  carry = 0
  post(true)
  if (running) schedule()
}

function train() {
  const f = fitter!, s = settings!
  losses.push(f.step())
  const it = f.iteration
  if (it >= WARMUP && it % EVERY === 0) {
    if (s.prune) prune(false)
    if (s.grow && f.count < s.budget) {
      // Grow by a tenth at a time, like 3DGS's densify steps, until the budget is spent
      const n = f.densify(Math.min(s.budget - f.count, Math.max(10, Math.round(f.count * 0.1))), random)
      if (n) events.push({ kind: 'grow', n, at: it })
    }
  }
}

function prune(manual: boolean) {
  const f = fitter!
  // New blobs get one round to settle before training judges them weak; "Prune now" judges everyone
  const gone = f.prune(settings!.pruneBelow, manual ? 0 : EVERY)
  if (gone.length || manual) events.push({ kind: 'prune', n: gone.length, at: f.iteration })
  for (const b of gone) pruned.push(b.x / f.width, b.y / f.height, b.sx / f.width, b.sy / f.height, b.angle)
}

function schedule() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(tick, 0)
}

/** One frame: train for this frame's share of steps (or ~25 ms flat out), then post. */
function tick() {
  timer = null
  if (!running || !fitter || !settings) return
  const now = performance.now()
  const start = now
  if (settings.speed === 0) {
    while (performance.now() - start < 25) train()
  } else {
    carry += ((now - last) / 1000) * settings.speed
    const n = Math.min(10, Math.floor(carry))
    carry -= n
    for (let i = 0; i < n; i++) train()
  }
  last = now
  post()
  if (running) timer = setTimeout(tick, Math.max(0, 33 - (performance.now() - start)))
}

function post(reset = false) {
  const f = fitter
  if (!f || !settings) return
  const scale = Math.max(1, DISPLAY_LONG / Math.max(f.width, f.height))
  // While paused, add/grow/prune changed the blobs since the last step: redraw so the error view is current
  if (!running && settings.view === 'error') f.loss()
  let image: Uint8ClampedArray
  let w: number, h: number
  if (settings.view === 'error') {
    // How wrong each pixel is, at training size: brighter = further off
    w = f.width
    h = f.height
    image = new Uint8ClampedArray(w * h * 4)
    const out = f.out, t = f.target
    for (let i = 0; i < w * h; i++) {
      const k = i * 3
      const e = Math.min(1, (Math.abs(out[k] - t[k]) + Math.abs(out[k + 1] - t[k + 1]) + Math.abs(out[k + 2] - t[k + 2])) * 1.5)
      image[i * 4] = image[i * 4 + 1] = image[i * 4 + 2] = Math.round(Math.sqrt(e) * 255)
      image[i * 4 + 3] = 255
    }
  } else {
    const need = Math.round(f.width * scale) * Math.round(f.height * scale) * 3
    if (display.length < need) display = new Float32Array(need)
    ;({ width: w, height: h } = f.render(display, scale))
    image = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      image[i * 4] = display[i * 3] * 255
      image[i * 4 + 1] = display[i * 3 + 1] * 255
      image[i * 4 + 2] = display[i * 3 + 2] * 255
      image[i * 4 + 3] = 255
    }
  }
  // Blobs in picture units (0–1 across), for the outline view: x, y, sx, sy, angle, r, g, b, opacity
  let blobs = new Float32Array(0)
  if (settings.view === 'blobs') {
    blobs = new Float32Array(f.count * 9)
    for (let i = 0; i < f.count; i++) {
      const b = f.blob(i)
      blobs.set([b.x / f.width, b.y / f.height, b.sx / f.width, b.sy / f.height, b.angle, b.r, b.g, b.b, b.opacity], i * 9)
    }
  }
  const msg: FromWorker = {
    type: 'frame',
    reset,
    image, width: w, height: h,
    blobs,
    pruned: new Float32Array(pruned),
    count: f.count,
    iteration: f.iteration,
    losses: new Float32Array(losses),
    events,
    running,
  }
  losses = []
  events = []
  pruned = []
  self.postMessage(msg, [image.buffer, blobs.buffer, msg.pruned.buffer, msg.losses.buffer])
}
