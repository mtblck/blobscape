import * as THREE from 'three'
import { PackedSplats, SparkRenderer, SplatMesh, dyno } from '@sparkjsdev/spark'
import { EFFECT_GLSL_GLOBALS, EFFECT_INDEX, effectStatements, type EffectParams } from './effects.ts'
import { RenderLoop } from './loop.ts'
import type { Blobs, Lens } from './blobs.ts'

/** The ground grid: 6 m across in 12 squares. */
const FLOOR_SIZE = 6, FLOOR_CELLS = 12

type FxUniforms = { kind: dyno.DynoFloat<string>; amount: dyno.DynoFloat<string>; time: dyno.DynoFloat<string>; radius: dyno.DynoFloat<string>; floor: dyno.DynoFloat<string>; count: dyno.DynoFloat<string>; center: dyno.DynoVec3<THREE.Vector3, string> }

export { placeCamera, lensOf, orbitLens, type Orbit } from './orbit.ts'
import { FOV, lensOf, placeCamera, type Orbit } from './orbit.ts'

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
  setFloor(on: boolean, color = '#888888') {
    if (on && !this.floor) {
      this.floor = new THREE.GridHelper(FLOOR_SIZE, FLOOR_CELLS, color, color)
      const m = this.floor.material as THREE.Material
      m.transparent = true
      m.opacity = 0.35
      // Drawn before the splats, which blend over it: they don't write depth, so drawn after it would show through them
      this.floor.renderOrder = -1
      this.scene.add(this.floor)
    } else if (!on && this.floor) {
      this.scene.remove(this.floor)
      this.floor.dispose()
      this.floor = undefined
    }
    this.invalidate()
  }

  /** Slides the floor grid along z (wrapping every square), for a walk on the spot over moving ground. */
  setFloorShift(z: number) {
    if (!this.floor) return
    const cell = FLOOR_SIZE / FLOOR_CELLS
    this.floor.position.z = ((z % cell) + cell) % cell
    this.invalidate(1)
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
   * Sends the blobs to the GPU, rewriting Spark's packed array in place from
   * index `from` on (pass the old count after appending, 0 after anything else).
   * With `order`, GPU slot g holds blob order[g]: effects use it to put the
   * blobs they touch first. Pass 0 for `from` whenever the order changes.
   */
  async sync(blobs: Blobs, from = 0, order: ArrayLike<number> | null = null) {
    // Two syncs in a row must share one mesh, so the first one's setup is awaited by both.
    this.ready ??= (async () => {
      this.packed = new PackedSplats({ maxSplats: Math.max(1024, blobs.count) })
      const mesh = new SplatMesh({ packedSplats: this.packed })
      await mesh.initialized
      // The view may have closed while Spark was starting up
      if (this.disposed) { mesh.dispose(); return }
      this.mesh = mesh
      this.scene.add(mesh)
    })()
    await this.ready
    if (this.disposed || !this.mesh) return
    // Appending (a spray stroke) only needs the new blobs written. With an order, the caller passes 0 whenever the order changed.
    writeSplats(this.packed!, blobs, Math.max(0, Math.min(from, blobs.count)), order)
    // Spark can't draw an empty list, so an empty scene just hides the mesh.
    this.mesh.visible = blobs.count > 0
    this.mesh.updateVersion()
    this.invalidate(30)
  }

  private layerMesh?: SplatMesh
  private layer?: Promise<{ mesh: SplatMesh; packed: PackedSplats } | undefined>

  /**
   * A second list of blobs drawn with the first and sorted with it, but kept
   * apart from it: `sync` never rewrites it, and an effect reaches it only when
   * `setEffect` is given a `layerCount`. The sandbox's creatures live here,
   * rewritten whole every frame they move. Null (or an empty list) hides it.
   */
  async syncLayer(blobs: Blobs | null) {
    if (!blobs?.count && !this.layer) return
    this.layer ??= (async () => {
      const packed = new PackedSplats({ maxSplats: Math.max(1024, blobs?.count ?? 0) })
      const mesh = new SplatMesh({ packedSplats: packed })
      await mesh.initialized
      if (this.disposed) { mesh.dispose(); return undefined }
      this.layerMesh = mesh
      this.scene.add(mesh)
      // An effect already running reaches the layer as soon as there is one
      if (this.lastFx) this.applyFx(mesh, this.lastFx.p, this.lastFx.layerCount)
      return { mesh, packed }
    })()
    const l = await this.layer
    if (!l || this.disposed) return
    this.layerMesh = l.mesh
    const n = blobs?.count ?? 0
    if (n) writeSplats(l.packed, blobs!, 0, null)
    l.mesh.visible = n > 0
    l.mesh.updateVersion()
    this.invalidate(2)
  }

  /** Each mesh's effect uniforms, and whether its modifier is on. */
  private fx = new WeakMap<SplatMesh, { on: boolean; u: FxUniforms }>()
  private lastFx?: { p: EffectParams | null; layerCount: number }

  /**
   * Runs a live effect on the GPU (see effects.ts) for the first `count`
   * blobs in GPU order, and the first `layerCount` of the layer's, or turns it
   * off with null. Cheap to call every frame: it only changes uniforms.
   */
  async setEffect(p: EffectParams | null, count: number, layerCount = 0) {
    this.lastFx = { p, layerCount }
    if (this.layerMesh) this.applyFx(this.layerMesh, p, layerCount)
    await this.ready
    if (!this.mesh || this.disposed) return
    this.applyFx(this.mesh, p, count)
  }

  private applyFx(mesh: SplatMesh, p: EffectParams | null, count: number) {
    let state = this.fx.get(mesh)
    if (!p || !count) {
      if (state?.on) { mesh.objectModifier = undefined; mesh.updateGenerator(); state.on = false; this.invalidate() }
      return
    }
    if (!state) {
      state = {
        on: false,
        u: {
          kind: dyno.dynoFloat(0), amount: dyno.dynoFloat(0), time: dyno.dynoFloat(0), radius: dyno.dynoFloat(1),
          floor: dyno.dynoFloat(0), count: dyno.dynoFloat(0), center: dyno.dynoVec3(new THREE.Vector3()),
        },
      }
      this.fx.set(mesh, state)
    }
    const u = state.u
    if (!state.on) {
      const node = new dyno.Dyno({
        inTypes: { gsplat: dyno.Gsplat, kind: 'float', amount: 'float', time: 'float', radius: 'float', floor: 'float', count: 'float', center: 'vec3' },
        outTypes: { gsplat: dyno.Gsplat },
        globals: () => [EFFECT_GLSL_GLOBALS],
        statements: ({ inputs, outputs }) => {
          const i = inputs as Record<string, string>
          return effectStatements(i.gsplat, String(outputs.gsplat), { kind: i.kind, amount: i.amount, time: i.time, radius: i.radius, floor: i.floor, count: i.count, center: i.center }).split('\n')
        },
      })
      mesh.objectModifier = dyno.dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => ({ gsplat: node.apply({ gsplat, ...u }).gsplat }))
      mesh.updateGenerator()
      state.on = true
    }
    u.kind.value = EFFECT_INDEX[p.kind]
    u.amount.value = p.amount
    u.time.value = p.time
    u.radius.value = p.radius
    u.floor.value = p.floor
    u.count.value = count
    u.center.value.set(p.center[0], p.center[1], p.center[2])
    mesh.updateVersion()
    this.invalidate(2)
  }

  dispose() {
    this.disposed = true
    this.loop.stop()
    this.mesh?.dispose()
    // Freed before the renderer; one still starting up frees itself when it sees `disposed`
    this.layerMesh?.dispose()
    this.spark.dispose()
    this.renderer.dispose()
    // Lessons each open their own view; give the context back straight away.
    this.renderer.forceContextLoss()
  }
}

const c3 = new THREE.Vector3(), s3 = new THREE.Vector3(), q4 = new THREE.Quaternion(), col = new THREE.Color()

/** Writes blobs into Spark's packed array from GPU slot `start` on (slot g holds blob order[g] with an order). */
function writeSplats(p: PackedSplats, blobs: Blobs, start: number, order: ArrayLike<number> | null) {
  for (let g = start; g < blobs.count; g++) {
    const i = order ? order[g] : g
    c3.fromArray(blobs.center, i * 3)
    s3.fromArray(blobs.scale, i * 3)
    q4.fromArray(blobs.quat, i * 4)
    col.setRGB(blobs.color[i * 3], blobs.color[i * 3 + 1], blobs.color[i * 3 + 2])
    p.setSplat(g, c3, s3, q4, blobs.opacity[i], col)
  }
  p.numSplats = blobs.count
  p.needsUpdate = true
}
