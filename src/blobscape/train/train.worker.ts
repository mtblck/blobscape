/// <reference lib="webworker" />
import init, { BrushApp, BrushMessageKind, type Training } from '../../../vendor/brush/brush_js.js'
import wasmUrl from '../../../vendor/brush/brush_js_bg.wasm?url'
import { cannotTrain, trainConfig } from '../trainCapture.ts'

/**
 * Trains splats from a capture folder with Brush, off the main thread (issue #215). Brush reads the folder itself,
 * trains on this worker's own WebGPU device, and every few seconds the splats so far are read back as the bytes of a
 * .ply for the page to show. Nothing is sent anywhere and nothing is written into the folder.
 */

export type TrainAsk =
  | { kind: 'start'; folder: FileSystemDirectoryHandle; steps: number; maxSplats: number }
  | { kind: 'stop' }
export type TrainSay =
  | { kind: 'status'; text: string }
  | { kind: 'step'; iter: number; splats: number }
  /** The scene so far, as a .ply file. `last` is the one to keep. */
  | { kind: 'scene'; ply: Uint8Array; iter: number; last: boolean }
  | { kind: 'done'; iter: number; stopped: boolean }
  | { kind: 'error'; why: string }

/** Steps between looks at the stop flag and the clock. */
const BATCH = 10
/** Milliseconds between scenes sent to the page: reading one back holds the trainer up. */
const SHOW_EVERY = 4000

const say = (m: TrainSay, move: Transferable[] = []) => (self as unknown as Worker).postMessage(m, move)
let stopped = false
let running = false
let ready: Promise<unknown> | undefined

// Brush says why it stopped on the console, then the WebAssembly traps with a bare "unreachable": keep its words
let lastWords = ''
const consoleError = console.error.bind(console)
console.error = (...args: unknown[]) => { lastWords = String(args[0] ?? '').split('\n')[0].slice(0, 300); consoleError(...args) }

async function train(folder: FileSystemDirectoryHandle, steps: number, maxSplats: number) {
  type Adapter = { limits: { maxStorageBuffersPerShaderStage: number }; features: { has(name: string): boolean }; isFallbackAdapter?: boolean; info?: { isFallbackAdapter?: boolean } }
  const adapter = await (navigator as Navigator & { gpu?: { requestAdapter(): Promise<Adapter | null> } }).gpu?.requestAdapter()
  const no = cannotTrain({
    picker: true,
    gpu: !!adapter,
    buffers: adapter?.limits.maxStorageBuffersPerShaderStage,
    subgroups: adapter?.features.has('subgroups'),
    software: !!(adapter?.info?.isFallbackAdapter ?? adapter?.isFallbackAdapter),
  })
  if (no) { say({ kind: 'error', why: no }); return }
  say({ kind: 'status', text: 'Fetching the trainer…' })
  await (ready ??= init({ module_or_path: wasmUrl }))
  const app = new BrushApp()
  await app.init()
  say({ kind: 'status', text: 'Reading the capture…' })
  let training: Training | undefined
  let iter = 0, splats = 0
  try {
    training = app.startTrainingFromDirectory(folder, async (first: Record<string, unknown>) => trainConfig(first, steps, maxSplats))
    let shown = performance.now(), over = false
    const show = async (last: boolean) => {
      const ply = await training!.exportPly()
      if (ply) say({ kind: 'scene', ply, iter, last }, [ply.buffer])
      shown = performance.now()
    }
    while (!stopped && !over) {
      const msgs = await training.trainSteps(BATCH)
      if (!msgs.length) break
      for (const m of msgs) {
        if (m.kind === BrushMessageKind.TrainStep) iter = m.iter ?? iter
        else if (m.kind === BrushMessageKind.DatasetLoaded) say({ kind: 'status', text: `Training from ${(m.trainViews ?? 0).toLocaleString('en-US')} photos…` })
        else if (m.kind === BrushMessageKind.Warning && m.text) say({ kind: 'status', text: m.text.slice(0, 200) })
        else if (m.kind === BrushMessageKind.DoneTraining) over = true
        m.free()
      }
      const now = training.currentSplats()
      if (now) { splats = now.numSplats; now.free() }
      say({ kind: 'step', iter, splats })
      if (iter >= steps) over = true
      if (!over && !stopped && performance.now() - shown > SHOW_EVERY) await show(false)
    }
    if (iter > 0) await show(true)
    say({ kind: 'done', iter, stopped })
  } finally {
    training?.free()
    app.free()
  }
}

self.onmessage = (ev: MessageEvent<TrainAsk>) => {
  const ask = ev.data
  if (ask.kind === 'stop') { stopped = true; return }
  if (running) return
  running = true
  stopped = false
  lastWords = ''
  train(ask.folder, ask.steps, ask.maxSplats)
    .catch((err) => {
      const why = typeof err === 'string' ? err : err instanceof Error ? err.message : String(err)
      // a trap's own message says nothing: Brush's last words do
      say({ kind: 'error', why: /unreachable/i.test(why) && lastWords ? lastWords : why })
    })
    .finally(() => { running = false })
}
