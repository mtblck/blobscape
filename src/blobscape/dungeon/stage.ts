import * as THREE from 'three/webgpu'
import { mix, positionView, smoothstep, uniform } from 'three/tsl'
import { readbackToSrgb, srgbToLinear } from '../../splat-core/color.ts'
import { SplatWorld } from '../../splat-engine/engine.ts'
import { Dungeon, LIVE_AMBIENT, type DungeonOptions } from './dungeon.ts'
import { HALF, type GameEvent, type Input } from './game.ts'

/**
 * Dungeon Run's view: the hall, the hero, the slimes and the bolts in one
 * SplatWorld, a dark floor plane under the blobs, gloom the far side of the
 * hall fades into, and a camera that follows the hero from behind (kept
 * inside the walls, so a wall never comes between it and the hero).
 *
 * `offscreen` draws into a render target and copies frames to the page on
 * request, for headless test browsers (as Forest Walk does).
 */

export type CameraView = 'close' | 'far' | 'high'
const CAMERAS: Record<CameraView, { back: number; up: number; look: number; lookUp: number }> = {
  close: { back: 3.4, up: 2.3, look: 2.2, lookUp: 0.75 },
  far: { back: 5.6, up: 3.8, look: 2.5, lookUp: 0.4 },
  high: { back: 2.2, up: 8.5, look: 1.2, lookUp: 0 },
}
const GLOOM = 0x0d0b12, FLOOR = 0x1b1916
const GLOOM_NEAR = 7, GLOOM_FAR = 19

export interface StageOptions {
  offscreen?: boolean
  /** Draw with the WebGL backend even where WebGPU runs (for testing that path). */
  webgl?: boolean
}

export class DungeonStage {
  readonly renderer: THREE.WebGPURenderer
  readonly backend: 'webgpu' | 'webgl'
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.05, 80)
  private readonly floor: THREE.Mesh
  private world?: SplatWorld
  dungeon?: Dungeon
  private target?: THREE.RenderTarget
  private raf = 0
  private stopped = false
  private last = 0
  private lastW = 0
  private lastH = 0
  private camHeading = 0
  private camPos = new THREE.Vector3()
  private camLook = new THREE.Vector3()
  private placed = false
  view: CameraView = 'close'
  /** What's held now (keys, the stick, held buttons). */
  input: Input = { forward: 0, turn: 0 }
  /** Taps since the last step, so a press shorter than a frame still counts. */
  private taps = { swing: false, cast: false }
  paused = false
  /** Called after drawn frames, about ten times a second, for the bars. */
  onTick?: (d: Dungeon, fps: number) => void
  /** Called with whatever happened in a step: hits, bursts, hurts, waves. */
  onEvents?: (e: GameEvent[]) => void
  onFirstFrame?: () => void
  private drawn = false
  private frames = 0
  private tickAt = 0
  private fps = 0

  private constructor(private readonly display: HTMLCanvasElement, private readonly opts: StageOptions, renderer: THREE.WebGPURenderer) {
    this.renderer = renderer
    this.backend = (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl'
    const floor = new THREE.MeshBasicNodeMaterial()
    floor.colorNode = mix(uniform(new THREE.Color(FLOOR)), uniform(new THREE.Color(GLOOM)), smoothstep(GLOOM_NEAR, GLOOM_FAR, positionView.z.negate()))
    floor.fog = false
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 1, HALF * 2 + 1), floor)
    this.floor.rotation.x = -Math.PI / 2
    this.floor.position.y = -0.02
    this.floor.renderOrder = -1
    this.scene.add(this.floor)
    this.scene.background = new THREE.Color(GLOOM)
    if (!opts.offscreen) {
      const tick = (now: number) => {
        if (this.stopped) return
        const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0
        this.last = now
        if (this.dungeon && !this.paused) this.step(dt)
        this.draw()
        this.report(now)
        this.raf = requestAnimationFrame(tick)
      }
      this.raf = requestAnimationFrame(tick)
    }
  }

  static async start(display: HTMLCanvasElement, opts: StageOptions = {}) {
    const canvas = opts.offscreen ? document.createElement('canvas') : display
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: false, forceWebGL: !!opts.webgl })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    await renderer.init()
    return new DungeonStage(display, opts, renderer)
  }

  /** Builds the dungeon's blobs (for a change of detail or look), keeping the game as it stands. */
  setDungeon(opts: DungeonOptions) {
    const d = new Dungeon(opts, this.dungeon?.game)
    if (this.world) { this.scene.remove(this.world); this.world.dispose() }
    this.dungeon = d
    this.world = new SplatWorld(d.actors, { bins: 32768, lights: opts.light === 'live' })
    this.light()
    this.scene.add(this.world)
    const lin = [(GLOOM >> 16) & 255, (GLOOM >> 8) & 255, GLOOM & 255].map((c) => srgbToLinear(c / 255)) as [number, number, number]
    this.world.setFog(lin, GLOOM_NEAR, GLOOM_FAR)
    this.world.markPosed()
  }

  get blobCount() { return this.dungeon?.blobCount ?? 0 }

  /** A tap of the sword or magic button: counts in the next step even if let go before it. */
  tap(what: 'swing' | 'cast') { this.taps[what] = true }

  /** Moves the game on by dt seconds with the current input. */
  step(dt: number) {
    if (!this.dungeon || !this.world) return
    const input = { ...this.input, swing: this.input.swing || this.taps.swing, cast: this.input.cast || this.taps.cast }
    this.taps = { swing: false, cast: false }
    this.dungeon.update(dt, input)
    this.world.markPosed()
    this.light()
    if (this.dungeon.game.events.length) this.onEvents?.(this.dungeon.game.events)
    this.follow(dt)
  }

  private light() {
    if (this.dungeon?.opts.light === 'live') this.world?.setLights(this.dungeon.lights(), LIVE_AMBIENT)
  }

  /** The chase camera: behind the hero, swinging round after it, never outside the walls. */
  private follow(dt: number) {
    const { x, z, heading } = this.dungeon!.game.hero
    const c = CAMERAS[this.view]
    const d = Math.atan2(Math.sin(heading - this.camHeading), Math.cos(heading - this.camHeading))
    const k = this.placed ? 1 - Math.exp(-dt * 3) : 1
    this.camHeading += d * k
    const s = Math.sin(this.camHeading), co = Math.cos(this.camHeading)
    const lim = HALF - 0.3
    const pos = new THREE.Vector3(clamp(x - s * c.back, lim), c.up, clamp(z - co * c.back, lim))
    const look = new THREE.Vector3(x + s * c.look, c.lookUp, z + co * c.look)
    const m = this.placed ? 1 - Math.exp(-dt * 7) : 1
    this.camPos.lerp(pos, m)
    this.camLook.lerp(look, m)
    this.placed = true
  }

  private draw() {
    if (!this.dungeon) return
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
    if (now - this.tickAt < 100 || !this.dungeon) return
    // fps over about a second, so the number holds still enough to read
    const fps = (this.frames * 1000) / (now - this.tickAt)
    this.fps = this.fps ? this.fps * 0.8 + fps * 0.2 : fps
    this.frames = 0
    this.tickAt = now
    this.onTick?.(this.dungeon, this.fps)
  }

  private resize() {
    const w = this.display.clientWidth, h = this.display.clientHeight
    if (w && h && (w !== this.lastW || h !== this.lastH)) { this.renderer.setSize(w, h, false); this.lastW = w; this.lastH = h }
    this.camera.aspect = h > 0 ? w / h : 1
    this.camera.fov = this.camera.aspect < 1 ? 70 : 55
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

  /** Offscreen only: runs `seconds` of the game in steps with `input`, draws, and copies the frame to the page. */
  async frame(seconds = 0, input: Input = { forward: 0, turn: 0 }) {
    const was = this.input
    this.input = input
    const steps = Math.ceil(seconds * 30)
    for (let k = 0; k < steps; k++) this.step(seconds / steps)
    if (!steps) this.step(0)
    this.input = was
    this.draw()
    if (this.dungeon) this.onTick?.(this.dungeon, 0)
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

const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v))
