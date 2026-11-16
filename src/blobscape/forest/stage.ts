import * as THREE from 'three/webgpu'
import { mix, positionView, smoothstep, uniform } from 'three/tsl'
import { readbackToSrgb, srgbToLinear } from '../../splat-core/color.ts'
import { SplatWorld } from '../../splat-engine/engine.ts'
import { Forest, type ForestOptions } from './forest.ts'
import type { Season } from './plants.ts'
import type { Input } from './world.ts'

/**
 * Forest Walk's view: the elf and the whole forest in one SplatWorld (so the
 * elf sorts against every trunk and flower blob by blob), a plain ground
 * plane under the blobs, mist that the far end of the forest fades into, and
 * a camera that follows the elf from behind.
 *
 * `offscreen` draws into a render target and copies frames to the page on
 * request, for headless test browsers (as the Creature page does).
 */

export type CameraView = 'close' | 'far' | 'high'
const CAMERAS: Record<CameraView, { back: number; up: number; look: number; lookUp: number }> = {
  close: { back: 3.2, up: 1.75, look: 2.2, lookUp: 1.05 },
  far: { back: 6, up: 3, look: 3, lookUp: 0.9 },
  high: { back: 4.2, up: 7, look: 1.5, lookUp: 0.2 },
}

/** Sky and mist, and the ground under the blobs, per season (sRGB). */
const AIR: Record<Season, { mist: number; ground: number }> = {
  summer: { mist: 0xc9dccd, ground: 0x3d6b2b },
  spring: { mist: 0xdde8dc, ground: 0x4f8034 },
  autumn: { mist: 0xe0d2bb, ground: 0x66632c },
}
const MIST_NEAR = 9, MIST_FAR = 30

export interface StageOptions { offscreen?: boolean }

export class ForestStage {
  readonly renderer: THREE.WebGPURenderer
  readonly backend: 'webgpu' | 'webgl'
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.05, 120)
  private readonly floor: THREE.Mesh
  private readonly ground = uniform(new THREE.Color(0x2c4a22))
  private readonly mist = uniform(new THREE.Color(0xc9dccd))
  private world?: SplatWorld
  forest?: Forest
  private target?: THREE.RenderTarget
  private raf = 0
  private stopped = false
  private last = 0
  private lastW = 0
  private lastH = 0
  /** Where the camera's swing has got to (it follows the elf's heading with a lag). */
  private camHeading = 0
  private camPos = new THREE.Vector3()
  private camLook = new THREE.Vector3()
  private placed = false
  view: CameraView = 'close'
  input: Input = { forward: 0, turn: 0 }
  paused = false
  /** Called after each drawn frame, at most ~4 times a second, with the forest as it is. */
  onTick?: (f: Forest, fps: number) => void
  onFirstFrame?: () => void
  private drawn = false
  private frames = 0
  private tickAt = 0

  private constructor(private readonly display: HTMLCanvasElement, private readonly opts: StageOptions, renderer: THREE.WebGPURenderer) {
    this.renderer = renderer
    this.backend = (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl'
    // the ground under the blobs fades into the same mist as they do, by depth in front of the camera as theirs does
    const floor = new THREE.MeshBasicNodeMaterial()
    floor.colorNode = mix(this.ground, this.mist, smoothstep(MIST_NEAR, MIST_FAR, positionView.z.negate()))
    floor.fog = false
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), floor)
    this.floor.rotation.x = -Math.PI / 2
    this.floor.position.y = -0.03
    this.floor.renderOrder = -1
    this.scene.add(this.floor)
    if (!opts.offscreen) {
      const tick = (now: number) => {
        if (this.stopped) return
        const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0
        this.last = now
        if (this.forest && !this.paused) this.step(dt)
        this.draw()
        this.report(now)
        this.raf = requestAnimationFrame(tick)
      }
      this.raf = requestAnimationFrame(tick)
    }
  }

  static async start(display: HTMLCanvasElement, opts: StageOptions = {}) {
    const canvas = opts.offscreen ? document.createElement('canvas') : display
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: false })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    await renderer.init()
    return new ForestStage(display, opts, renderer)
  }

  /** Grows a new forest (new blobs: for a change of detail, season or elf), keeping where the elf is. */
  setForest(opts: ForestOptions) {
    const was = this.forest
    const f = new Forest(opts)
    if (was) {
      f.walker = { ...was.walker, speed: 0 }
      f.sprout = was.sprout
      f.wind = was.wind
      f.walked = was.walked
      f.update(0, { forward: 0, turn: 0 })
    }
    if (this.world) { this.scene.remove(this.world); this.world.dispose() }
    this.forest = f
    this.world = new SplatWorld(f.actors, { bins: 32768 })
    this.scene.add(this.world)
    const air = AIR[opts.season]
    const mist = new THREE.Color(air.mist)
    this.scene.background = mist
    this.mist.value.set(air.mist)
    this.ground.value.set(air.ground)
    const lin = [(air.mist >> 16) & 255, (air.mist >> 8) & 255, air.mist & 255].map((c) => srgbToLinear(c / 255)) as [number, number, number]
    this.world.setFog(lin, MIST_NEAR, MIST_FAR)
    this.world.markPosed()
  }

  get blobCount() { return this.forest?.blobCount ?? 0 }

  /** Moves the forest on by dt seconds with the current input. */
  step(dt: number) {
    if (!this.forest || !this.world) return
    this.forest.update(dt, this.input)
    this.world.markPosed()
    this.follow(dt)
  }

  /** The chase camera: behind the elf, swinging round after it. */
  private follow(dt: number) {
    const f = this.forest!
    const { x, z, heading } = f.walker
    const c = CAMERAS[this.view]
    // the shortest way round to the elf's heading
    let d = heading - this.camHeading
    d = Math.atan2(Math.sin(d), Math.cos(d))
    const k = this.placed ? 1 - Math.exp(-dt * 2.5) : 1
    this.camHeading += d * k
    const s = Math.sin(this.camHeading), co = Math.cos(this.camHeading)
    const pos = new THREE.Vector3(x - s * c.back, c.up, z - co * c.back)
    const look = new THREE.Vector3(x + s * c.look, c.lookUp, z + co * c.look)
    const m = this.placed ? 1 - Math.exp(-dt * 6) : 1
    this.camPos.lerp(pos, m)
    this.camLook.lerp(look, m)
    this.placed = true
    this.floor.position.x = x
    this.floor.position.z = z
  }

  private draw() {
    if (!this.forest) return
    if (!this.placed) this.follow(0)
    this.resize()
    this.camera.position.copy(this.camPos)
    this.camera.lookAt(this.camLook)
    this.camera.updateMatrixWorld()
    this.renderer.render(this.scene, this.camera)
    if (!this.drawn) { this.drawn = true; this.onFirstFrame?.() }
    this.frames++
  }

  private report(now: number) {
    if (!this.tickAt) this.tickAt = now
    if (now - this.tickAt < 250 || !this.forest) return
    const fps = (this.frames * 1000) / (now - this.tickAt)
    this.frames = 0
    this.tickAt = now
    this.onTick?.(this.forest, fps)
  }

  private resize() {
    const w = this.display.clientWidth, h = this.display.clientHeight
    if (w && h && (w !== this.lastW || h !== this.lastH)) { this.renderer.setSize(w, h, false); this.lastW = w; this.lastH = h }
    this.camera.aspect = h > 0 ? w / h : 1
    // a narrow (phone) view sees more by widening the lens a little
    this.camera.fov = this.camera.aspect < 1 ? 68 : 55
    this.camera.updateProjectionMatrix()
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

  /** Offscreen only: runs `seconds` of the walk in steps with `input`, draws, and copies the frame to the page. */
  async frame(seconds = 0, input: Input = { forward: 0, turn: 0 }) {
    const was = this.input
    this.input = input
    const steps = Math.ceil(seconds * 30)
    for (let k = 0; k < steps; k++) this.step(seconds / steps)
    if (!steps) this.step(0)
    this.input = was
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
    this.floor.geometry.dispose()
    ;(this.floor.material as THREE.Material).dispose()
    this.target?.dispose()
    this.renderer.dispose()
  }
}
