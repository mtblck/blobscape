/** Messages between the page and the training worker. */

export type View = 'fit' | 'blobs' | 'error'

export type Settings = {
  /** Blobs scattered at the start (used on restart). */
  start: number
  /** Most blobs growth may add up to. */
  budget: number
  grow: boolean
  prune: boolean
  /** Opacity below which a blob counts as weak. */
  pruneBelow: number
  /** Learning-rate multiplier. */
  rate: number
  /** Steps per second; 0 = as fast as the CPU goes. */
  speed: number
  view: View
}

export type TrainEvent = { kind: 'start' | 'grow' | 'prune' | 'add'; n: number; at: number }

export type ToWorker =
  | { type: 'load'; target: Float32Array; width: number; height: number; settings: Settings; seed: number }
  | { type: 'restart'; settings: Settings; seed: number }
  | { type: 'settings'; settings: Settings }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'step'; n: number }
  /** Add `n` blobs around (x, y), given as a share of the picture's width and height. */
  | { type: 'add'; x: number; y: number; n: number }
  | { type: 'grow'; n: number }
  | { type: 'prune' }

export type FromWorker = {
  type: 'frame'
  /** True on the first frame after a load or restart: the page clears its loss history. */
  reset: boolean
  image: Uint8ClampedArray
  width: number
  height: number
  /** 9 floats per blob in picture units (0–1): x, y, sx, sy, angle, r, g, b, opacity. Empty unless the view is 'blobs'. */
  blobs: Float32Array
  /** 5 floats per blob pruned since the last frame: x, y, sx, sy, angle. */
  pruned: Float32Array
  count: number
  iteration: number
  /** Mean squared error of each step since the last frame. */
  losses: Float32Array
  events: TrainEvent[]
  running: boolean
}
