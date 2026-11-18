import * as THREE from 'three/webgpu'
import { readbackToSrgb } from '../../splat-core/color.ts'
import { placeCamera, STAGE_FOV, type Orbit } from '../../splat-core/orbit.ts'
import { SplatWorld } from '../../splat-engine/engine.ts'
import { SplatMirror } from '../../splat-engine/mirror.ts'
import { levelPlane } from '../../splat-engine/reflect.ts'
import { startRenderer } from '../../splat-engine/startRenderer.ts'
import { Pond, WATER_LEVEL, type PondOptions } from './pond.ts'
import { SCALE, POND_SCENE } from './scene.ts'
import type { Input } from './wade.ts'

/**
 * The wading pond's view: the ruin, the elf, the flames and the water's surface in one SplatWorld (so the elf's legs
 * sort against the water blob by blob, and show through it), lit by the candles' live lights, seen by a camera the
 * visitor turns round the scene.
 *
 * `offscreen` draws into a render target and copies frames to the page on request, for headless test browsers.
 */

/** Where the view starts: the scene's own camera, at the world's size. */
export const START_ORBIT: Orbit = {
  target: POND_SCENE.camera.target.map((v) => v * SCALE) as [number, number, number],
  distance: POND_SCENE.camera.distance * SCALE,
  azimuth: POND_SCENE.camera.azimuth,
  elevation: POND_SCENE.camera.elevation,
}

/** The mirror picture's width, pixels: a water blob is about a pixel of it across, so more would not show. */
const MIRROR_WIDTH = 320
/** The water's own blobs, and whatever is under them, stay out of the mirror: everything lower than this over the level, meters. */
const MIRROR_LIFT = 0.06
/** The mirror is drawn again every this many frames: the water's blobs are colored from it, and at half the frame rate a reflection still follows what it mirrors. */
const MIRROR_EVERY = 2
/** The water as a mirror. */
const MIRROR_PLANE = levelPlane(WATER_LEVEL)

/** The night behind the scene (sRGB). */
const NIGHT = 0x080b10

/** How much of the baked moonlight shows: under 1, so it is night and the candles count. */
const AMBIENT = 0.85

export interface StageOptions {
  /** Draw to a target and copy frames to the page (headless WebGPU can't present to a canvas). */
  offscreen?: boolean
  /** Use the WebGL backend even where WebGPU is there, for testing. */
  webgl?: boolean
}

export class PondStage {
  readonly renderer: THREE.WebGPURenderer
  readonly backend: 'webgpu' | 'webgl'
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(STAGE_FOV, 1, 0.05, 200)
  private world?: SplatWorld
  pond?: Pond
  private target?: THREE.RenderTarget
  private raf = 0
  private stopped = false
  private last = 0
  private lastW = 0
  private lastH = 0
  orbit: Orbit = START_ORBIT
  input: Input = { forward: 0, turn: 0 }
  paused = false
  /** Whether the candles cast shadows. */
  shadows = true
  /**
   * Whether the water mirrors the scene: each frame the scene is drawn once more as its mirror image (a second sort
   * and a small draw) and the water's blobs are colored from that picture. On to start with on WebGPU; without it
   * (where the CPU sorts every draw) it starts off.
   */
  reflections: boolean
  private readonly mirror = new SplatMirror()
  /** Called after each drawn frame, at most ~4 times a second, with the pond as it is. */
  onTick?: (p: Pond, fps: number) => void
  onFirstFrame?: () => void
  private drawn = false
  private frames = 0
  private tickAt = 0

  private constructor(private readonly display: HTMLCanvasElement, private readonly opts: StageOptions, renderer: THREE.WebGPURenderer) {
    this.renderer = renderer
    this.backend = (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl'
    this.scene.background = new THREE.Color(NIGHT)
    this.reflections = this.backend === 'webgpu'
    if (!opts.offscreen) {
      const tick = (now: number) => {
        if (this.stopped) return
        const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0
        this.last = now
        if (this.pond && !this.paused) this.step(dt)
        this.draw()
        this.report(now)
        this.raf = requestAnimationFrame(tick)
      }
      this.raf = requestAnimationFrame(tick)
    }
  }

  static async start(display: HTMLCanvasElement, opts: StageOptions = {}) {
    const canvas = opts.offscreen ? document.createElement('canvas') : display
    const renderer = await startRenderer({ canvas, antialias: false, alpha: false, forceWebGL: !!opts.webgl }, (r) => r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)))
    return new PondStage(display, opts, renderer)
  }

  /** Builds the pond (new blobs: for a change of detail or of the elf's look), keeping where the elf stands. */
  setPond(opts: PondOptions) {
    const was = this.pond
    const p = new Pond(opts)
    if (was) {
      p.standAt(was.walker)
      p.calm = was.calm
      p.rain = was.rain
      p.waded = was.waded
      p.update(0, { forward: 0, turn: 0 })
    }
    if (this.world) { this.scene.remove(this.world); this.world.dispose() }
    this.pond = p
    this.world = new SplatWorld(p.actors, { bins: 32768, lights: true })
    this.scene.add(this.world)
    this.world.markPosed()
  }

  get blobCount() { return this.pond?.blobCount ?? 0 }

  /** Moves the pond on by dt seconds with the current input. */
  step(dt: number) {
    if (!this.pond || !this.world) return
    this.pond.update(dt, this.input)
    this.world.markPosed()
  }

  private draw() {
    const p = this.pond, world = this.world
    if (!p || !world) return
    this.resize()
    placeCamera(this.camera as never, this.orbit, this.camera.aspect)
    world.setLights(p.lights().map((l) => ({ ...l, shadow: this.shadows })), AMBIENT)
    this.reflect(p)
    this.shade(p, world)
    this.renderer.render(this.scene, this.camera)
    if (!this.drawn) { this.drawn = true; this.onFirstFrame?.() }
    this.frames++
  }

  /** The water, shaped and colored for the camera as it stands; only its own blobs go up again. */
  private shade(p: Pond, world: SplatWorld) {
    const eye = this.camera.position
    p.draw([eye.x, eye.y, eye.z])
    if (p.surfaceMoved) world.reshape(p.surface)
    else if (p.surfaceChanged) world.recolor(p.surface)
  }

  /**
   * Draws the scene's mirror image for the camera as it stands and asks for it back. The picture comes a frame or
   * two later and carries the camera it was drawn for, so the water looks itself up in it rightly even if the view
   * has moved on. Returns the read under way, for `frame` to wait on.
   */
  private reflect(p: Pond, now = false): Promise<void> | null {
    if (!this.reflections) { p.setMirror(null); return null }
    if (!now && this.frames % MIRROR_EVERY) return null
    const h = Math.max(1, Math.round(MIRROR_WIDTH / Math.max(0.2, this.camera.aspect)))
    this.mirror.setSize(MIRROR_WIDTH, h)
    this.camera.updateProjectionMatrix()
    this.mirror.render(this.renderer, this.scene, this.camera, MIRROR_PLANE, MIRROR_LIFT)
    return this.mirror.read(this.renderer).then((image) => { if (image && this.pond === p && this.reflections) p.setMirror(image) }, () => {})
  }

  /** Where a point of the view (CSS pixels from the canvas's corner) meets the water's surface, or null if it looks at the sky. */
  waterAt(x: number, y: number): [number, number] | null {
    const w = this.display.clientWidth, h = this.display.clientHeight
    if (!w || !h) return null
    const from = this.camera.position.clone()
    const dir = new THREE.Vector3((x / w) * 2 - 1, 1 - (y / h) * 2, 0.5).unproject(this.camera).sub(from).normalize()
    if (dir.y > -1e-4) return null
    const t = (WATER_LEVEL - from.y) / dir.y
    return [from.x + dir.x * t, from.z + dir.z * t]
  }

  /** Lets a drop fall where a tap on the view meets the water. True if it landed on water. */
  dripAt(x: number, y: number) {
    const at = this.waterAt(x, y)
    if (!at || !this.pond?.water.wetAt(at[0], at[1])) return false
    this.pond.drip(at[0], at[1])
    return true
  }

  private report(now: number) {
    if (!this.tickAt) this.tickAt = now
    if (now - this.tickAt < 250 || !this.pond) return
    const fps = (this.frames * 1000) / (now - this.tickAt)
    this.frames = 0
    this.tickAt = now
    this.onTick?.(this.pond, fps)
  }

  private resize() {
    const w = this.display.clientWidth, h = this.display.clientHeight
    if (w && h && (w !== this.lastW || h !== this.lastH)) { this.renderer.setSize(w, h, false); this.lastW = w; this.lastH = h }
    this.camera.aspect = h > 0 ? w / h : 1
    if (this.opts.offscreen && w && h) {
      const pw = Math.floor(w * this.renderer.getPixelRatio()), ph = Math.floor(h * this.renderer.getPixelRatio())
      if (!this.target || this.target.width !== pw || this.target.height !== ph) {
        this.target?.dispose()
        this.target = new THREE.RenderTarget(pw, ph)
        this.display.width = pw
        this.display.height = ph
      }
      this.renderer.setRenderTarget(this.target)
    }
  }

  /** Offscreen only: runs `seconds` of the pond in steps with `input`, draws, and copies the frame to the page. */
  async frame(seconds = 0, input: Input = { forward: 0, turn: 0 }) {
    const was = this.input
    this.input = input
    const steps = Math.ceil(seconds * 30)
    for (let k = 0; k < steps; k++) this.step(seconds / steps)
    if (!steps) this.step(0)
    this.input = was
    // a test waits for the mirror's picture of this very moment before the frame is drawn, so what it sees does not depend on timing
    if (this.pond && this.world && this.reflections) {
      this.resize()
      placeCamera(this.camera as never, this.orbit, this.camera.aspect)
      this.world.setLights(this.pond.lights().map((l) => ({ ...l, shadow: this.shadows })), AMBIENT)
      await this.reflect(this.pond, true)
    }
    this.draw()
    if (!this.target) return
    const px = await this.renderer.readRenderTargetPixelsAsync(this.target, 0, 0, this.target.width, this.target.height) as Uint8Array
    const { width: w, height: h } = this.target
    const img = new ImageData(w, h)
    readbackToSrgb(px, w, h, { flip: this.backend === 'webgl', premultiplied: false }, img.data)
    this.display.getContext('2d')!.putImageData(img, 0, 0)
  }

  dispose() {
    this.stopped = true
    cancelAnimationFrame(this.raf)
    this.world?.dispose()
    this.target?.dispose()
    this.mirror.dispose()
    this.renderer.dispose()
  }
}
