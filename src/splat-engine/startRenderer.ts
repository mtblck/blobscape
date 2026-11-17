import * as THREE from 'three/webgpu'

/** How long to wait before each try after the first, in ms. */
export const START_WAITS = [250, 1000]

export interface Attempt {
  /** Only WebGL 2: set once a try got as far as WebGL, or when the caller asked for it. */
  webgl: boolean
}

/** What a try reports when it fails: whether the canvas has handed out a WebGL context by now. */
export interface Failed { error: unknown; reachedWebGL: boolean }

/**
 * Tries `make` until one try works, waiting `waits` between them. A browser can fail to start
 * WebGPU or WebGL once and then start it a moment later (a GPU process restarting, an adapter
 * that comes back null once, a context still being freed), which used to show "could not start"
 * until the page was reloaded. Once a try has reached WebGL, the rest ask for WebGL only: a
 * canvas that has handed out a WebGL context can't hand out a WebGPU one. Pure, so it's tested.
 */
export async function withRetries<T>(
  make: (a: Attempt) => Promise<T>,
  opts: { webgl?: boolean; waits?: readonly number[]; wait?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const waits = opts.waits ?? START_WAITS
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let webgl = !!opts.webgl
  let last: unknown
  for (let i = 0; i <= waits.length; i++) {
    if (i > 0) await wait(waits[i - 1])
    try {
      return await make({ webgl })
    } catch (e) {
      const f = e as Partial<Failed>
      last = f && 'error' in f ? f.error : e
      if (f?.reachedWebGL) webgl = true
      if (i < waits.length) console.warn(`The renderer did not start (try ${i + 1}); trying again.`, last)
    }
  }
  throw last
}

/** Waits until the page is shown: a hidden tab may be refused a GPU adapter. */
function whenShown() {
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return Promise.resolve()
  return new Promise<void>((resolve) => {
    const on = () => { if (document.visibilityState !== 'hidden') { document.removeEventListener('visibilitychange', on); resolve() } }
    document.addEventListener('visibilitychange', on)
  })
}

/**
 * Makes and starts three.js's WebGPU renderer (which falls back to WebGL 2 by itself), trying
 * again a couple of times if it doesn't start, so a one-off failure recovers without a reload.
 */
export function startRenderer(params: THREE.WebGPURendererParameters & { canvas: HTMLCanvasElement }, setup?: (r: THREE.WebGPURenderer) => void) {
  return withRetries(async ({ webgl }) => {
    await whenShown()
    const renderer = new THREE.WebGPURenderer({ ...params, forceWebGL: webgl || params.forceWebGL })
    setup?.(renderer)
    try {
      await renderer.init()
      return renderer
    } catch (error) {
      // the canvas has handed out a WebGL context only if the fallback got one; a null one leaves WebGPU open to the next try
      const backend = renderer.backend as unknown as { isWebGPUBackend?: boolean; gl?: unknown }
      const reachedWebGL = !backend.isWebGPUBackend && !!backend.gl
      // not disposed: that would lose a WebGL context the canvas has handed out, and the next try gets the same one back
      throw { error, reachedWebGL } satisfies Failed
    }
  }, { webgl: params.forceWebGL })
}
