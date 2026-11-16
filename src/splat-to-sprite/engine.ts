import * as THREE from 'three'
import {
  PackedSplats,
  SparkRenderer,
  SplatEdit,
  SplatEditRgbaBlendMode,
  SplatEditSdf,
  SplatEditSdfType,
  SplatMesh,
} from '@sparkjsdev/spark'
import { RenderLoop } from '../splat-core/loop.ts'
import { measure, type Framing } from '../splat-core/framing.ts'

/**
 * The 3D half: a three.js scene with one SplatMesh, drawn live in the viewport
 * by Spark, plus a second, offline SparkRenderer that renders the sprite
 * camera's view into a small render target we can read back.
 *
 * Why a second renderer: Spark sorts splats back-to-front for one camera at a
 * time (in a worker). The viewport camera and the sprite camera look from
 * different places, so each needs its own sort.
 */

export interface View {
  /** Degrees around the vertical axis. 0 faces the object's front (+Z). */
  azimuth: number
  /** Degrees above the horizon. 90 is straight down. */
  elevation: number
  /** 1 = the object's radius fills the frame. */
  zoom: number
  /** Orthographic is how pixel-art games draw; perspective makes near parts bigger. */
  ortho: boolean
  /** Shift the frame up/down, in fractions of the frame. */
  offsetY: number
}

const FOV = 30
/** The sprite frame takes this share of the viewport's short side. */
export const FRAME_SHARE = 0.78

export class Engine {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly spark: SparkRenderer
  private capture?: SparkRenderer
  private captureSize = 0
  private mesh?: SplatMesh
  private crop?: { edit: SplatEdit; sdf: SplatEditSdf }
  private viewCam = new THREE.OrthographicCamera()
  private viewPersp = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100)
  private shotOrtho = new THREE.OrthographicCamera()
  private shotPersp = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100)
  framing: Framing = { center: new THREE.Vector3(), radius: 1, count: 0 }
  private _view: View = { azimuth: 30, elevation: 30, zoom: 1, ortho: true, offsetY: 0 }
  get view() { return this._view }
  set view(v: View) { this._view = v; this.invalidate() }
  private loop!: RenderLoop
  private disposed = false

  /** Asks for a few more viewport frames, enough for Spark's background sort to land. */
  invalidate(frames = 12) {
    this.loop?.invalidate(frames)
  }

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.setClearColor(0x000000, 0)
    // Draw only when something changed (or Spark finished a re-sort and says the
    // picture is dirty), not 60 times a second: kinder to laptops, and it leaves
    // the GPU free while a sheet is being baked.
    this.spark = new SparkRenderer({ renderer: this.renderer, onDirty: () => this.invalidate() })
    this.scene.add(this.spark)
    this.loop = new RenderLoop(this.renderer, this.spark, () => this.renderer.render(this.scene, this.cameraFor(false, this.aspect())))
  }

  dispose() {
    this.disposed = true
    this.loop.stop()
    this.mesh?.dispose()
    this.capture?.dispose()
    this.spark.dispose()
    this.renderer.dispose()
  }

  private aspect() {
    const { clientWidth: w, clientHeight: h } = this.canvas
    return h > 0 ? w / h : 1
  }

  /** Splat sharpness: how many standard deviations of each Gaussian get drawn. Lower = harder, smaller blobs. */
  setStdDev(v: number) {
    this.spark.maxStdDev = v
    if (this.capture) this.capture.maxStdDev = v
    this.invalidate()
  }

  private loadSeq = 0

  /** Resolves false when a newer load started meanwhile, so a slow file can't replace a later pick. */
  async setSplats(make: () => SplatMesh, upright: boolean): Promise<boolean> {
    const seq = ++this.loadSeq
    const mesh = make()
    try {
      await mesh.initialized
    } catch (err) {
      mesh.dispose()
      throw err
    }
    if (this.disposed || seq !== this.loadSeq) { mesh.dispose(); return false }
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.mesh.dispose()
    }
    this.mesh = mesh
    if (this.crop) this.scene.remove(this.crop.edit)
    this.crop = undefined
    this.setUpright(upright)
    this.scene.add(mesh)
    this.framing = measure(mesh)
    this.addCrop()
    this.invalidate(30)
    return true
  }

  /** Most trained captures come out upside down (the COLMAP convention is y-down). */
  setUpright(flip: boolean) {
    if (!this.mesh) return
    this.mesh.quaternion.set(flip ? 1 : 0, 0, 0, flip ? 0 : 1)
    this.mesh.updateMatrixWorld(true)
    this.framing = measure(this.mesh)
    this.placeCrop()
    this.invalidate()
  }

  /** Hides every splat outside a sphere: how you cut a captured object off the table it sat on. */
  private addCrop() {
    if (!this.mesh) return
    const edit = new SplatEdit({ rgbaBlendMode: SplatEditRgbaBlendMode.MULTIPLY, softEdge: 0.02, invert: true })
    const sdf = new SplatEditSdf({ type: SplatEditSdfType.SPHERE, radius: 1e6, opacity: 0 })
    edit.addSdf(sdf)
    this.scene.add(edit)
    this.crop = { edit, sdf }
    this.placeCrop()
  }

  private cropScale = 10
  setCrop(scale: number) {
    this.cropScale = scale
    this.placeCrop()
  }

  private placeCrop() {
    if (!this.crop) return
    const { sdf } = this.crop
    sdf.position.copy(this.framing.center)
    sdf.radius = this.cropScale >= 3 ? 1e6 : this.framing.radius * this.cropScale
    sdf.updateMatrixWorld(true)
    this.invalidate()
  }

  /** Size of the sprite frame in world units: the object's radius, padded, divided by zoom. */
  private frameWorld(view: View) {
    return (this.framing.radius * 2.5) / view.zoom
  }

  private cameraFor(shot: boolean, aspect: number, view: View = this.view): THREE.Camera {
    const { azimuth, elevation, ortho, offsetY } = view
    const frame = this.frameWorld(view)
    const span = shot ? frame : frame / FRAME_SHARE
    const az = THREE.MathUtils.degToRad(azimuth)
    const el = THREE.MathUtils.degToRad(Math.min(89.9, elevation))
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
    const dist = (span / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2))) * 1.0
    const target = this.framing.center.clone()
    const cam = ortho ? (shot ? this.shotOrtho : this.viewCam) : shot ? this.shotPersp : this.viewPersp
    // Frame offset moves along the camera's own up vector, so "up" means up in the picture.
    cam.position.copy(target).addScaledVector(dir, ortho ? this.framing.radius * 6 + dist : dist)
    cam.up.set(0, 1, 0)
    cam.lookAt(target)
    cam.updateMatrixWorld()
    const camUp = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1)
    cam.position.addScaledVector(camUp, -offsetY * frame)
    if (cam instanceof THREE.OrthographicCamera) {
      const h = aspect >= 1 ? span : span / aspect
      const w = h * aspect
      cam.left = -w / 2; cam.right = w / 2; cam.top = h / 2; cam.bottom = -h / 2
      cam.near = 0.001
      cam.far = this.framing.radius * 20 + dist * 2
    } else {
      cam.aspect = aspect
      cam.fov = aspect >= 1 ? FOV : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) / aspect))
      cam.near = Math.max(0.001, dist - this.framing.radius * 4)
      cam.far = dist + this.framing.radius * 8
    }
    cam.updateMatrixWorld()
    cam.updateProjectionMatrix()
    return cam
  }

  private captureBusy: Promise<unknown> = Promise.resolve()

  /**
   * Renders the sprite camera's view at `size` pixels square and returns the
   * raw RGBA (bottom row first, as GL reads it). Calls are queued so two
   * captures never fight over the one render target.
   */
  shoot(size: number, view?: Partial<View>): Promise<Uint8Array> {
    const run = async () => {
      this.loop.hold++
      if (!this.capture || this.captureSize !== size) {
        this.capture?.dispose()
        this.capture = new SparkRenderer({
          renderer: this.renderer,
          autoUpdate: false,
          target: { width: size, height: size },
          maxStdDev: this.spark.maxStdDev,
        })
        this.captureSize = size
      }
      try {
        // The sprite camera has its own camera objects, so a shot never moves the viewport's.
        const cam = this.cameraFor(true, 1, { ...this.view, ...view })
        // Sort for this camera (in Spark's worker), then render.
        await this.capture.update({ scene: this.scene, camera: cam })
        const target = this.capture.renderTarget({ scene: this.scene, camera: cam })
        // A plain synchronous readPixels. Spark's readTarget() uses three's async
        // fence polling, which hung now and then (seen in headless Chromium after a
        // few back-to-back shots); for a 512px target the sync read costs ~1 ms.
        const px = new Uint8Array(size * size * 4)
        this.renderer.readRenderTargetPixels(target, 0, 0, size, size, px)
        return px
      } finally {
        this.loop.hold--
        this.invalidate()
      }
    }
    const p = this.captureBusy.then(run, run)
    this.captureBusy = p.catch(() => {})
    return p
  }

  get splatCount() {
    return this.framing.count
  }
}

export function meshFromBytes(bytes: ArrayBuffer, fileName: string) {
  return () => new SplatMesh({ fileBytes: bytes, fileName })
}

export function meshFromBuilder(build: (s: PackedSplats) => void) {
  return () => new SplatMesh({ constructSplats: build })
}
