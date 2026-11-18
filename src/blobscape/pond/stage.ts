import * as THREE from 'three/webgpu'
import { readbackToSrgb } from '../../splat-core/color.ts'
import { placeCamera, STAGE_FOV, type Orbit } from '../../splat-core/orbit.ts'
import { SplatWorld } from '../../splat-engine/engine.ts'
import { SplatMirror } from '../../splat-engine/mirror.ts'
import { SplatLens } from '../../splat-engine/lens.ts'
import type { OpticsLook } from '../../splat-core/optics.ts'
import { levelPlane } from '../../splat-engine/reflect.ts'
import { startRenderer } from '../../splat-engine/startRenderer.ts'
import { Pond, WATER_LEVEL, type PondOptions } from './pond.ts'
import { SCALE, POND_SCENE } from './scene.ts'
import { steer, type Input } from './wade.ts'

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
/**
 * The mirror is drawn again about this many times a second, however fast frames come: the water's blobs are colored
 * from it on the CPU, and a reflection still follows what it mirrors at this pace. A slow device then spends no more
 * of each second on it than a fast one.
 */
const MIRROR_PACE = 24
/** The water as a mirror. */
const MIRROR_PLANE = levelPlane(WATER_LEVEL)

/**
 * The camera's film, meters high. A small camera's 24 mm keeps a place this size sharp from front to back at any
 * opening, as it would the real thing. The pond is photographed as a model of itself on a table, a twentieth of its
 * size, would be: the same picture as a film twenty times as high in front of the full-size place.
 */
export const FILM = 0.024 * 20
/** The opening the view starts at. */
export const START_F = 5.6
/** How strongly light over the knee glows to start with. */
export const START_GLOW = 0.5
/**
 * How many times white a flame is while the lens glows (`SplatWorld.glowGain`), and how bright a pixel must be to
 * glow. With flames no brighter than white the glow could not tell them from the elf's fair hair by candlelight,
 * and her whole head glowed (Matt saw it). The candles' light can bring a pale thing beside them to two or three
 * times white; the flames are well over that and the knee lies between, so only flames and fireflies glow.
 */
export const FLAME_GAIN = 8
const KNEE = 4
/** Where strong light starts to roll off toward white, so a fair head by the candles keeps its color and shape. */
const SHOULDER = 0.65
/** How fast the focus follows the elf, a second: a lens pulled by hand, not snapped. */
const FOCUS_PULL = 4

/** The night behind the scene (sRGB). */
const NIGHT = 0x080b10

/** How much of the baked moonlight shows: under 1, so it is night and the candles count. */
const AMBIENT = 0.85

export interface StageOptions {
  /** Draw to a target and copy frames to the page (headless WebGPU can't present to a canvas). */
  offscreen?: boolean
  /** Use the WebGL backend even where WebGPU is there, for testing. */
  webgl?: boolean
  /** A phone or tablet: fewer device pixels a CSS pixel, and focus blur starts off. */
  small?: boolean
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
  /** How much of the light of bright things spills round them: 0 for none. */
  glow: number
  /** Whether things nearer and farther than the elf are out of focus. */
  focusBlur: boolean
  /** The lens's opening as an f-number: smaller is wider, with a thinner slice in focus. */
  fNumber = START_F
  /** The distance in focus, meters in front of the camera: it follows the elf. */
  focus = 0
  private readonly optics = new SplatLens()
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
    this.glow = this.backend === 'webgpu' ? START_GLOW : 0
    // the blur looks at each pixel through forty points: too much for a phone to start with
    this.focusBlur = this.backend === 'webgpu' && !opts.small
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
    const renderer = await startRenderer({ canvas, antialias: false, alpha: false, forceWebGL: !!opts.webgl }, (r) => r.setPixelRatio(Math.min(opts.small ? 1.5 : 2, window.devicePixelRatio || 1)))
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
      p.ripple = was.ripple
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
    this.pond.update(dt, this.steered(this.input))
    this.world.markPosed()
  }

  /** An input with a stick is steered by the picture: up on the stick is away from the camera as it stands now. */
  private steered(input: Input): Input {
    if (!input.stick) return input
    const to = this.camera.getWorldDirection(this.looking)
    return { forward: 0, turn: 0, ...steer(input.stick, Math.atan2(to.x, to.z)) }
  }

  private draw() {
    const p = this.pond, world = this.world
    if (!p || !world) return
    this.resize()
    placeCamera(this.camera as never, this.orbit, this.camera.aspect)
    world.setLights(p.lights().map((l) => ({ ...l, shadow: this.shadows })), AMBIENT)
    this.reflect(p)
    this.shade(p, world)
    const lens = this.lens(p)
    // flames are brighter than white only while a lens is there to spread that light; straight to the screen it would just clip
    world.glowGain = lens && lens.glow > 0 ? FLAME_GAIN : 1
    if (lens) {
      const size = this.target ? this.buffer.set(this.target.width, this.target.height) : this.renderer.getDrawingBufferSize(this.buffer)
      this.optics.setSize(size.x, size.y)
      this.optics.setLook(lens, STAGE_FOV)
      this.optics.render(this.renderer, this.scene, this.camera)
    } else this.renderer.render(this.scene, this.camera)
    if (!this.drawn) { this.drawn = true; this.onFirstFrame?.() }
    this.frames++
  }

  /** The lens as it stands, focused on the elf; null when it would change nothing. */
  lens(p: Pond): OpticsLook | null {
    if (!this.focusBlur && !(this.glow > 0)) return null
    const eye = this.camera.position, to = this.camera.getWorldDirection(this.looking)
    // the elf's middle, about a meter over where it stands
    const far = Math.max(0.5, (p.walker.x - eye.x) * to.x + (p.groundAt(p.walker.x, p.walker.z) + 1 - eye.y) * to.y + (p.walker.z - eye.z) * to.z)
    const now = performance.now(), dt = this.focused ? Math.min(0.1, (now - this.focused) / 1000) : 1
    this.focused = now
    this.focus = this.focus > 0 && !this.opts.offscreen ? this.focus + (far - this.focus) * Math.min(1, dt * FOCUS_PULL) : far
    return { focus: this.focus, fNumber: this.focusBlur ? this.fNumber : 0, film: FILM, glow: Math.max(0, this.glow), knee: KNEE, shoulder: SHOULDER }
  }
  private readonly looking = new THREE.Vector3()
  private readonly buffer = new THREE.Vector2()
  private focused = 0
  private mirrored = 0

  /** The water, shaped and colored for the camera as it stands; only its own blobs go up again. */
  private shade(p: Pond, world: SplatWorld) {
    const eye = this.camera.position
    p.draw([eye.x, eye.y, eye.z])
    if (p.surfaceMoved) world.reshape(p.surface)
    else if (p.surfaceChanged) world.recolor(p.surface)
    if (p.falling.changed) world.reshape(p.falling.actor)
  }

  /**
   * Draws the scene's mirror image for the camera as it stands and asks for it back. The picture comes a frame or
   * two later and carries the camera it was drawn for, so the water looks itself up in it rightly even if the view
   * has moved on. Returns the read under way, for `frame` to wait on.
   */
  private reflect(p: Pond, now = false): Promise<void> | null {
    if (!this.reflections) { p.setMirror(null); return null }
    const t = performance.now()
    if (!now && t - this.mirrored < 1000 / MIRROR_PACE) return null
    this.mirrored = t
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
    this.optics.dispose()
    this.renderer.dispose()
  }
}
