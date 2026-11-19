/**
 * Who draws to which canvas, for recording a view (the Record button on every experiment's preview). A canvas a GPU
 * draws to can only be copied in the moment after a draw: once the browser has shown the frame its picture is gone
 * (WebGL without a kept drawing buffer, and WebGPU always). So a renderer that draws to the page says so here
 * (`drawsTo`, once) and tells of each draw (`markDrawn`, straight after it), and a recorder copies the picture then.
 * Costs nothing while nobody watches.
 */

type Watcher = (canvas: HTMLCanvasElement) => void

const redraws = new WeakMap<HTMLCanvasElement, () => void>()
const watchers = new Set<Watcher>()

/** Says that a renderer draws to this canvas only now and then; `redraw` asks it for one more frame of what it shows. */
export function drawsTo(canvas: HTMLCanvasElement, redraw: () => void = () => {}) {
  redraws.set(canvas, redraw)
}

/** Call straight after drawing to a canvas named with `drawsTo`, while its picture can still be copied. */
export function markDrawn(canvas: HTMLCanvasElement) {
  if (watchers.size) for (const w of watchers) w(canvas)
}

/** Whether a renderer has named this canvas with `drawsTo`: its picture can only be copied from a watcher. */
export function isDrawnTo(canvas: HTMLCanvasElement): boolean {
  return redraws.has(canvas)
}

/** Asks the canvas's renderer to draw what it shows once more (so a watcher that has just begun gets a picture of a still view). */
export function askRedraw(canvas: HTMLCanvasElement) {
  redraws.get(canvas)?.()
}

/** Calls `watcher` after every draw to a named canvas, until the function it returns is called. */
export function watchDraws(watcher: Watcher): () => void {
  watchers.add(watcher)
  return () => { watchers.delete(watcher) }
}
