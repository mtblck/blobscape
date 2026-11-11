import * as THREE from 'three/webgpu'
import { GaussianSplat } from 'three/addons/objects/GaussianSplat.js'
import { createGaussianSplatGeometry } from 'three/addons/utils/GaussianSplatUtils.js'
import { covariance } from '../splat-core/blobs.ts'
import { placeCamera, type Orbit } from '../splat-core/view.ts'
import { SplatWorld } from '../splat-engine/engine.ts'
import { makeCreature, poseWalk, type Creature } from '../splat-engine/creature.ts'
import type { SkinMode } from '../splat-engine/rig.ts'
import { readbackToSrgb, srgbToLinear } from '../splat-core/colour.ts'

/**
 * The engine test bench. One canvas, one creature, two ways to draw it:
 *
 * - 'engine': Blobscape's engine (WebGPU, or WebGL with `forceWebGL`), which can walk;
 * - 'three': three.js's built-in GaussianSplat, standing still (it has no bones).
 *
 * Spark isn't here yet: it draws through the older WebGLRenderer, so timing it
 * fairly needs its own page.
 *
 * `bench()` measures two things. First, how often the live view actually
 * draws: the gap between animation frames, which is what you see as
 * smoothness and is capped by the screen's refresh rate. Then, the cost of
 * one frame on its own: draw, then wait until the GPU has finished, which
 * stops the CPU and GPU from overlapping and so overstates the cost of a
 * frame in normal use. Headless verify has no live view and gets only the
 * second.
 */
export type Which = 'engine' | 'three'
export const WHICH: Which[] = ['engine', 'three']

export interface LabOptions {
  which: Which
  count: number
  walk: boolean
  mode: SkinMode
  webgl: boolean
  /** Extra copies of the fox, side by side, to test one shared sort over many objects. */
  herd: number
  /**
   * Draw into an off-screen target and copy each frame to the page with the
   * CPU. Only for headless test browsers, whose software WebGPU can render but
   * can't present to a canvas.
   */
  offscreen?: boolean
}

export interface Lab {
  readonly info: string
  readonly world?: SplatWorld
  readonly renderer: THREE.WebGPURenderer
  bench(frames: number): Promise<BenchResult>
  orbit: Orbit
  setWalk(on: boolean): void
  setMode(m: SkinMode): void
  dispose(): void
  /** Times each step of a walking frame on its own, waiting for the GPU after each. */
  profile(frames: number): Promise<StepTimes>
  /** Renders one frame at time t (seconds) and waits for the GPU. */
  frame(t: number): Promise<void>
  /** Runs `job` with the live view paused, so it can use the renderer on its own. */
  exclusive<T>(job: () => Promise<T>): Promise<T>
}

export interface BenchResult {
  which: string
  /** Whether the blobs were moving: three.js has no bones, so it always stands still. */
  moving: boolean
  backend: string
  blobs: number
  frames: number
  /** Milliseconds between live frames, median and 90th percentile (0 when there is no live view). */
  median: number
  p90: number
  /** Frames per second over the live run. */
  fps: number
  /** Share of live frames that took longer than 1.5 screen refreshes, i.e. visibly dropped. */
  dropped: number
  /** Milliseconds for one frame drawn and waited for on its own, median. */
  alone: number
  /** Milliseconds per frame the CPU spent skinning and sorting (WebGL path), median. */
  cpu: number
  width: number
  height: number
}

/** Milliseconds per step, median. GPU steps are 0 on WebGL (no compute there) and CPU steps 0 on WebGPU. */
export interface StepTimes {
  which: string
  backend: string
  blobs: number
  /** GPU: blobs through their bones. */
  deform: number
  /** GPU: blobs onto the screen, plus their sort keys. */
  project: number
  /** GPU: the sort itself. */
  order: number
  /** Drawing (on WebGL this includes moving each blob, which happens as it's drawn). */
  draw: number
  /** CPU (WebGL): moving centres for the sort, and sorting. */
  cpuSkin: number
  cpuSort: number
}

export async function startLab(display: HTMLCanvasElement, o: LabOptions): Promise<Lab> {
  const canvas = o.offscreen ? document.createElement('canvas') : display
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: true, forceWebGL: o.webgl })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.setClearColor(0x000000, 0)
  await renderer.init()
  const backend = (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl'

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100)
  const floor = new THREE.GridHelper(8, 16, 0x777777, 0x444444)
  floor.renderOrder = -1
  scene.add(floor)

  let orbit: Orbit = { target: [0, 0.75, 0], distance: o.herd > 1 ? 7 : 4, azimuth: 35, elevation: 14 }
  const foxes: Creature[] = []
  for (let k = 0; k < Math.max(1, o.herd); k++) {
    const c = makeCreature(Math.round(o.count / Math.max(1, o.herd)), 7 + k)
    // place the herd in a loose row
    const x = (k - (o.herd - 1) / 2) * 0.8, z = (k % 2) * 0.6 - 0.3
    c.skeleton.place.set([x, 0, z])
    c.skeleton.update()
    foxes.push(c)
  }

  let world: SplatWorld | undefined
  let walk = o.walk
  let mode = o.mode
  if (o.which === 'engine') {
    world = new SplatWorld(foxes, { mode })
    scene.add(world)
  } else {
    // three.js draws each object on its own; give it the foxes as separate meshes
    for (const f of foxes) {
      const b = f.blobs
      const centres = new Float32Array(b.count * 3), covs = new Float32Array(b.count * 6), cols = new Uint8ClampedArray(b.count * 4)
      const root = f.skeleton.matrix
      for (let i = 0; i < b.count; i++) {
        centres[i * 3] = b.centre[i * 3] + root[12]
        centres[i * 3 + 1] = b.centre[i * 3 + 1] + root[13]
        centres[i * 3 + 2] = b.centre[i * 3 + 2] + root[14]
        covs.set(covariance(b, i), i * 6)
        for (let k = 0; k < 3; k++) cols[i * 4 + k] = Math.round(srgbToLinear(b.colour[i * 3 + k]) * 255)
        cols[i * 4 + 3] = Math.round(b.opacity[i] * 255)
      }
      scene.add(new GaussianSplat(createGaussianSplatGeometry(centres, covs, cols)))
    }
  }
  const blobs = foxes.reduce((s, f) => s + f.blobs.count, 0)

  let target: THREE.RenderTarget | undefined
  let lastW = 0, lastH = 0
  const resize = () => {
    const w = display.clientWidth, h = display.clientHeight
    // setSize resets the canvas (and on WebGPU its swap chain), so only when the size changed
    if (w && h && (w !== lastW || h !== lastH)) { renderer.setSize(w, h, false); lastW = w; lastH = h }
    placeCamera(camera as never, orbit, h > 0 ? w / h : 1)
    if (o.offscreen && w && h) {
      const pw = Math.floor(w * renderer.getPixelRatio()), ph = Math.floor(h * renderer.getPixelRatio())
      if (!target || target.width !== pw || target.height !== ph) {
        target?.dispose()
        target = new THREE.RenderTarget(pw, ph)
        display.width = pw
        display.height = ph
      }
      renderer.setRenderTarget(target)
    }
  }

  const present = async () => {
    if (!target) return
    const px = await renderer.readRenderTargetPixelsAsync(target, 0, 0, target.width, target.height) as Uint8Array
    const { width: w, height: h } = target
    const img = new ImageData(w, h)
    // the target holds linear, premultiplied colour; ImageData wants sRGB, straight. WebGPU reads rows top-down, WebGL bottom-up.
    readbackToSrgb(px, w, h, { flip: backend === 'webgl', premultiplied: false }, img.data)
    display.getContext('2d')!.putImageData(img, 0, 0)
  }

  const pose = (t: number) => {
    if (!world) return
    for (const f of foxes) {
      // each fox a little out of step with its neighbours
      if (walk) poseWalk(f.skeleton, t + f.skeleton.place[0])
      else { f.skeleton.reset(); f.skeleton.update() }
    }
    world.markPosed()
  }

  const frame = async (t: number) => {
    resize()
    pose(t)
    renderer.render(scene, camera)
    await settle(renderer)
  }
  const show = async (t: number) => { await frame(t); await present() }

  let raf = 0, stopped = false, busy = 0 // jobs using the renderer; the live view pauses while any run
  const t0 = performance.now()
  let onTick: ((now: number) => void) | undefined
  let cancelRun: (() => void) | undefined
  const tick = (now: number) => {
    if (stopped) return
    onTick?.(now)
    if (o.offscreen) {
      // headless: draw only on request (frame/show), never on a timer
    } else if (!busy) {
      resize()
      if (walk) pose((performance.now() - t0) / 1000)
      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return {
    info: `${o.which === 'three' ? 'three.js (standing still: it has no bones)' : 'ours'} · ${backend} · ${blobs.toLocaleString()} blobs`,
    world,
    renderer,
    get orbit() { return orbit },
    set orbit(v: Orbit) { orbit = v },
    setWalk(on) { walk = on; pose(0) },
    setMode(m) { mode = m; if (world) { world.mode = m; world.markPosed() } },
    frame: show,
    async exclusive(job) {
      busy++
      try { return await job() } finally { busy-- }
    },
    async bench(frames) {
      const q = (a: number[], p: number) => a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0
      const gaps: number[] = [], cpu: number[] = [], alone: number[] = []
      // 1. The live view as it runs: gaps between animation frames.
      if (!o.offscreen) {
        await new Promise<void>((done, fail) => {
          cancelRun = () => fail(new Error('the lab was closed'))
          let last = 0, skip = 10 // let shaders compile and the sort settle
          onTick = (now) => {
            if (skip-- > 0) { last = now; return }
            gaps.push(now - last)
            cpu.push(world?.cpuMs ?? 0)
            last = now
            if (gaps.length >= frames) { onTick = cancelRun = undefined; done() }
          }
        })
      }
      // 2. One frame at a time, each waited for.
      busy++
      try {
        for (let i = 0; i < 3; i++) await frame(i / 30)
        for (let i = 0; i < Math.min(frames, 30); i++) {
          const s = performance.now()
          await frame((i + 3) / 30)
          alone.push(performance.now() - s)
          if (o.offscreen) cpu.push(world?.cpuMs ?? 0)
        }
      } finally {
        busy--
      }
      // The screen's refresh interval: the shortest gap we saw (120 Hz ≈ 8.3 ms),
      // but never longer than 60 Hz's, in case no frame kept up at all.
      const refresh = gaps.length ? Math.max(4, Math.min(1000 / 60, ...gaps)) : 0
      const span = gaps.reduce((a, b) => a + b, 0)
      const size = target ?? canvas
      return {
        which: o.which, moving: !!world && walk, backend, blobs, frames: gaps.length || alone.length,
        median: q(gaps, 0.5), p90: q(gaps, 0.9),
        fps: span ? (gaps.length * 1000) / span : 0,
        dropped: gaps.length ? gaps.filter((g) => g > refresh * 1.5).length / gaps.length : 0,
        alone: q(alone, 0.5), cpu: q(cpu, 0.5), width: size.width, height: size.height,
      }
    },
    async profile(frames) {
      const rows: number[][] = []
      busy++
      try {
        for (let i = 0; i < frames + 2; i++) {
          resize()
          pose(i / 30)
          const t: number[] = [performance.now()]
          const mark = async () => { await settle(renderer); t.push(performance.now()) }
          if (world && backend === 'webgpu') {
            const st = world.stages(renderer as never, camera)
            st.deform(); await mark()
            st.project(); await mark()
            st.order(); await mark()
            world.hold = true
            try { renderer.render(scene, camera); await mark() } finally { world.hold = false }
            world.markPosed() // the held frame skipped the bookkeeping; redo it next frame
            if (i >= 2) rows.push([t[1] - t[0], t[2] - t[1], t[3] - t[2], t[4] - t[3], 0, 0])
          } else {
            renderer.render(scene, camera); await mark()
            const cs = world?.cpuSkinMs ?? 0, co = world?.cpuSortMs ?? 0
            if (i >= 2) rows.push([0, 0, 0, Math.max(0, t[1] - t[0] - cs - co), cs, co])
          }
        }
      } finally {
        busy--
      }
      const med = (k: number) => [...rows.map((r) => r[k])].sort((a, b) => a - b)[Math.floor(rows.length / 2)] ?? 0
      return { which: o.which, backend, blobs, deform: med(0), project: med(1), order: med(2), draw: med(3), cpuSkin: med(4), cpuSort: med(5) }
    },
    dispose() {
      stopped = true
      onTick = undefined
      cancelRun?.()
      cancelAnimationFrame(raf)
      world?.dispose()
      target?.dispose()
      renderer.dispose()
    },
  }
}

/** Waits until the GPU has finished the frame, so wall-clock time includes it. */
async function settle(renderer: THREE.WebGPURenderer) {
  const backend = renderer.backend as unknown as { device?: GPUDevice; gl?: WebGL2RenderingContext }
  if (backend.device) await backend.device.queue.onSubmittedWorkDone()
  else if (backend.gl) { const px = new Uint8Array(4); backend.gl.readPixels(0, 0, 1, 1, backend.gl.RGBA, backend.gl.UNSIGNED_BYTE, px) }
}

