import * as THREE from 'three'
import { PackedSplats, SparkRenderer, SplatMesh } from '@sparkjsdev/spark'
import { RenderLoop } from './loop.ts'
import type { Blobs, Lens } from './blobs.ts'

/** Where the orbit camera is: it circles `target` at `distance`, looking at it. */
export interface Orbit {
  target: [number, number, number]
  distance: number
  /** Degrees around the vertical axis; 0 looks from +Z. */
  azimuth: number
  /** Degrees above the horizon. */
  elevation: number
}

const FOV = 35

/** Places a three.js camera for an orbit and a canvas aspect. */
export function placeCamera(cam: THREE.PerspectiveCamera, o: Orbit, aspect: number) {
  const { target, distance, azimuth, elevation } = o
  const az = THREE.MathUtils.degToRad(azimuth)
  const el = THREE.MathUtils.degToRad(Math.max(-89, Math.min(89, elevation)))
  cam.position.set(
    target[0] + distance * Math.sin(az) * Math.cos(el),
    target[1] + distance * Math.sin(el),
    target[2] + distance * Math.cos(az) * Math.cos(el),
  )
  cam.up.set(0, 1, 0)
  cam.lookAt(target[0], target[1], target[2])
  cam.aspect = aspect
  cam.near = Math.max(0.005, distance / 200)
  cam.far = distance * 50 + 10
  cam.updateProjectionMatrix()
  cam.updateMatrixWorld()
}

/** The projection of a placed camera as a `Lens`, in CSS pixels. */
export function lensOf(cam: THREE.PerspectiveCamera, width: number, height: number): Lens {
  const P = cam.projectionMatrix.elements
  return { view: cam.matrixWorldInverse.elements, width, height, fx: (P[0] * width) / 2, fy: (P[5] * height) / 2, ortho: false }
}

/** A lens for an orbit without any renderer: for the software views and tests. */
export function orbitLens(o: Orbit, width: number, height: number): Lens {
  const cam = new THREE.PerspectiveCamera(FOV, 1, 0.01, 200)
  placeCamera(cam, o, height > 0 ? width / height : 1)
  return lensOf(cam, width, height)
}

/**
 * A live Spark view of a `Blobs` list, with an orbit camera. Edits to the
 * blobs go to the GPU with `sync()`. After every frame it calls `onFrame`,
 * which is where overlays (x-ray outlines, brush rings) draw, so they always
 * match the picture.
 */
export class SplatView {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly spark: SparkRenderer
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 200)
  private mesh?: SplatMesh
  private packed?: PackedSplats
  private ready?: Promise<void>
  private disposed = false
  private loop: RenderLoop
  private _orbit: Orbit = { target: [0, 0, 0], distance: 4, azimuth: 30, elevation: 20 }
  onFrame?: () => void

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.setClearColor(0x000000, 0)
    this.spark = new SparkRenderer({ renderer: this.renderer, onDirty: () => this.invalidate() })
    this.scene.add(this.spark)
    this.loop = new RenderLoop(this.renderer, this.spark, () => {
      this.place()
      this.renderer.render(this.scene, this.camera)
      this.onFrame?.()
    })
  }

  invalidate(frames = 12) {
    this.loop?.invalidate(frames)
  }

  get orbit() { return this._orbit }
  set orbit(o: Orbit) { this._orbit = o; this.invalidate() }

  /** How many standard deviations of each Gaussian get drawn (Spark's default is √8 ≈ 2.83). */
  get reach() { return this.spark.maxStdDev }
  set reach(v: number) { this.spark.maxStdDev = v; this.invalidate() }

  private place() {
    const { clientWidth: w, clientHeight: h } = this.canvas
    placeCamera(this.camera, this._orbit, h > 0 ? w / h : 1)
  }

  /** The current camera as a plain projection description, in CSS pixels. */
  lens(): Lens {
    this.place()
    return lensOf(this.camera, this.canvas.clientWidth, this.canvas.clientHeight)
  }

  private floor?: THREE.GridHelper

  /** A faint grid on the ground (y = 0). Drawn in the scene, so blobs in front of it hide it. */
  setFloor(on: boolean, colour = '#888888') {
    if (on && !this.floor) {
      this.floor = new THREE.GridHelper(6, 12, colour, colour)
      const m = this.floor.material as THREE.Material
      m.transparent = true
      m.opacity = 0.35
      this.scene.add(this.floor)
    } else if (!on && this.floor) {
      this.scene.remove(this.floor)
      this.floor.dispose()
      this.floor = undefined
    }
    this.invalidate()
  }

  /** A world-space ray through a point on the canvas (CSS pixels). */
  ray(x: number, y: number): { origin: THREE.Vector3; dir: THREE.Vector3 } {
    this.place()
    const { clientWidth: w, clientHeight: h } = this.canvas
    const ndc = new THREE.Vector3((x / w) * 2 - 1, -(y / h) * 2 + 1, 0.5)
    const origin = this.camera.position.clone()
    const dir = ndc.unproject(this.camera).sub(origin).normalize()
    return { origin, dir }
  }

  /**
   * Sends the blobs to the GPU. Cheap enough to call after every edit for a
   * few tens of thousands of blobs: it rewrites Spark's packed array in place.
   */
  async sync(blobs: Blobs) {
    // Two syncs in a row must share one mesh, so the first one's setup is awaited by both.
    this.ready ??= (async () => {
      this.packed = new PackedSplats({ maxSplats: Math.max(1024, blobs.count) })
      this.mesh = new SplatMesh({ packedSplats: this.packed })
      await this.mesh.initialized
      this.scene.add(this.mesh)
    })()
    await this.ready
    if (this.disposed || !this.mesh) return
    const p = this.packed!
    const c = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion(), col = new THREE.Color()
    for (let i = 0; i < blobs.count; i++) {
      c.fromArray(blobs.centre, i * 3)
      s.fromArray(blobs.scale, i * 3)
      q.fromArray(blobs.quat, i * 4)
      col.setRGB(blobs.colour[i * 3], blobs.colour[i * 3 + 1], blobs.colour[i * 3 + 2])
      p.setSplat(i, c, s, q, blobs.opacity[i], col)
    }
    p.numSplats = blobs.count
    p.needsUpdate = true
    // Spark can't draw an empty list, so an empty scene just hides the mesh.
    this.mesh.visible = blobs.count > 0
    this.mesh.updateVersion()
    this.invalidate(30)
  }

  dispose() {
    this.disposed = true
    this.loop.stop()
    this.mesh?.dispose()
    this.spark.dispose()
    this.renderer.dispose()
    // Lessons each open their own view; give the context back straight away.
    this.renderer.forceContextLoss()
  }
}
