import * as THREE from 'three/webgpu'
import { GaussianSplat } from 'three/addons/objects/GaussianSplat.js'
import { createGaussianSplatGeometry } from 'three/addons/utils/GaussianSplatUtils.js'
import { covariance } from '../splat-core/blobs.ts'
import { placeCamera, type Orbit } from '../splat-core/view.ts'
import { SplatWorld } from '../splat-engine/engine.ts'
import { makeCreature, poseWalk, type Creature } from '../splat-engine/creature.ts'
import type { SkinMode } from '../splat-engine/rig.ts'
import { LINEAR_TO_SRGB_4K, srgbToLinear } from '../splat-core/colour.ts'

/**
 * The engine test bench. One canvas, one creature, two ways to draw it:
 *
 * - 'engine': Blobscape's engine (WebGPU, or WebGL with `forceWebGL`), which can walk;
 * - 'three': three.js's built-in GaussianSplat, standing still (it has no bones).
 *
 * Spark isn't here yet: it draws through the older WebGLRenderer, so timing it
 * fairly needs its own page.
 *
 * `bench()` draws a fixed number of frames and reports the time per frame,
 * so the same numbers come out of a phone and of verify.
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
  /** Renders one frame at time t (seconds) and waits for the GPU. */
  frame(t: number): Promise<void>
  /** Runs `job` with the live view paused, so it can use the renderer on its own. */
  exclusive<T>(job: () => Promise<T>): Promise<T>
}

export interface BenchResult {
  which: string
  backend: string
  blobs: number
  frames: number
  /** Wall-clock milliseconds per frame, median and 90th percentile, including waiting for the GPU. */
  median: number
  p90: number
  /** Milliseconds per frame the CPU spent skinning and sorting (WebGL path), median. */
  cpu: number
  width: number
  height: number
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
    // place the herd in a loose row, each fox as the root bone's offset
    const x = (k - (o.herd - 1) / 2) * 0.8, z = (k % 2) * 0.6 - 0.3
    c.skeleton.offset.set([x, 0, z], 0)
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
  const resize = () => {
    const w = display.clientWidth, h = display.clientHeight
    if (w && h) renderer.setSize(w, h, false)
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
    // The target holds linear, premultiplied colour; ImageData wants sRGB, straight.
    // WebGPU reads rows top-down, WebGL bottom-up.
    const flip = backend === 'webgl'
    for (let y = 0; y < h; y++) {
      const src = (flip ? h - 1 - y : y) * w * 4, dst = y * w * 4
      for (let x = 0; x < w * 4; x += 4) {
        const a = px[src + x + 3]
        img.data[dst + x + 3] = a
        if (!a) continue
        for (let c = 0; c < 3; c++) img.data[dst + x + c] = Math.round(255 * LINEAR_TO_SRGB_4K[Math.round(Math.min(1, px[src + x + c] / a) * 4095)])
      }
    }
    display.getContext('2d')!.putImageData(img, 0, 0)
  }

  const pose = (t: number) => {
    if (!world) return
    for (const f of foxes) {
      const off = [...f.skeleton.offset.subarray(0, 3)]
      if (walk) poseWalk(f.skeleton, t + off[0])
      else { f.skeleton.reset(); }
      f.skeleton.offset[0] = off[0]; f.skeleton.offset[2] = off[2]
      f.skeleton.update()
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

  let raf = 0, stopped = false, busy = false
  const t0 = performance.now()
  const tick = () => {
    if (stopped) return
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
    info: `${o.which} · ${backend} · ${blobs.toLocaleString()} blobs`,
    world,
    renderer,
    get orbit() { return orbit },
    set orbit(v: Orbit) { orbit = v },
    setWalk(on) { walk = on; pose(0) },
    setMode(m) { mode = m; if (world) { world.mode = m; world.markPosed() } },
    frame: show,
    async exclusive(job) {
      busy = true
      try { return await job() } finally { busy = false }
    },
    async bench(frames) {
      const times: number[] = [], cpu: number[] = []
      busy = true
      try {
        // warm up: first frames compile shaders
        for (let i = 0; i < 3; i++) await frame(i / 30)
        for (let i = 0; i < frames; i++) {
          const s = performance.now()
          await frame((i + 3) / 30)
          times.push(performance.now() - s)
          cpu.push(world?.cpuMs ?? 0)
        }
      } finally {
        busy = false
      }
      const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]
      const size = target ?? canvas
      return { which: o.which, backend, blobs, frames, median: q(times, 0.5), p90: q(times, 0.9), cpu: q(cpu, 0.5), width: size.width, height: size.height }
    },
    dispose() {
      stopped = true
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

