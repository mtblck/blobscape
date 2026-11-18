import { Color, DataUtils, HalfFloatType, LinearFilter, Matrix4, Object3D, PerspectiveCamera, RenderTarget, type Camera, type WebGPURenderer } from 'three/webgpu'
import { mirrorMatrix, type MirrorImage, type MirrorPlane } from './reflect.ts'

/** Half floats to floats, by table: a picture is read back as half floats, four a pixel. */
let HALF: Float32Array | undefined
const halves = () => (HALF ??= Float32Array.from({ length: 65536 }, (_, i) => DataUtils.fromHalfFloat(i)))

/**
 * A camera standing in the mirrored world. three.js leaves a camera's scale out of its view matrix (and a mirror
 * image is a scale of −1 to it), which would turn the picture left to right: this one keeps the true inverse.
 */
class MirrorCamera extends PerspectiveCamera {
  updateMatrixWorld(force?: boolean) {
    Object3D.prototype.updateMatrixWorld.call(this, force)
    this.matrixWorldInverse.copy(this.matrixWorld).invert()
  }

  updateWorldMatrix(updateParents: boolean, updateChildren: boolean) {
    Object3D.prototype.updateWorldMatrix.call(this, updateParents, updateChildren)
    this.matrixWorldInverse.copy(this.matrixWorld).invert()
  }
}

/**
 * What a flat mirror shows of a scene drawn by the engine: the scene drawn once more as its mirror image, from the
 * same eye, into a target of its own. Water, a polished floor or a looking glass then reads it (`read`, then
 * `seenIn` in reflect.ts) to color itself, so whatever stands, moves or burns in the scene is in the reflection,
 * with nothing set up per scene.
 *
 * Draw it before the frame's own render, with the frame's camera. The mirrored view puts the blobs in another
 * order than the frame's, so it costs a sort and a draw of its own (at the target's size, which can be small: a
 * rippled surface blurs what it mirrors anyway). Blobs whose centers are under the mirror, or within `lift` over
 * it, are left out through `SplatWorld.clip`: the bed of a pond is not in its reflection, and neither are the
 * blobs of the water's own surface. Lines and points are left out; ordinary meshes are drawn, but show their back
 * faces (a mirror image turns triangles round).
 */
export class SplatMirror {
  /** The mirrored picture: linear color times cover, and cover. */
  readonly target: RenderTarget
  private readonly camera = new MirrorCamera()
  private readonly flip = new Matrix4()
  private drawn: { viewProj: number[]; plane: MirrorPlane } | null = null
  private reading = false

  constructor(width = 256, height = 192) {
    this.target = new RenderTarget(width, height, { type: HalfFloatType, depthBuffer: true, minFilter: LinearFilter, magFilter: LinearFilter })
    this.camera.matrixAutoUpdate = false
  }

  /** Sizes the picture, in pixels. */
  setSize(width: number, height: number) {
    if (this.target.width !== width || this.target.height !== height) this.target.setSize(width, height)
  }

  /** Draws `scene` as the mirror `plane` shows it to `camera`, leaving out blobs less than `lift` in front of the plane. */
  render(renderer: WebGPURenderer, scene: Object3D, camera: Camera, plane: MirrorPlane, lift = 0) {
    type World = Object3D & { isSplatWorld?: boolean; clip: readonly [number, number, number, number] | null }
    type Thin = Object3D & { isLine?: boolean; isPoints?: boolean }
    camera.updateMatrixWorld()
    // the eye's camera, standing in the mirrored world: its world matrix flipped through the plane
    this.flip.fromArray(mirrorMatrix(plane))
    this.camera.matrix.multiplyMatrices(this.flip, camera.matrixWorld)
    this.camera.matrixWorldNeedsUpdate = true
    this.camera.projectionMatrix.copy(camera.projectionMatrix)
    this.camera.projectionMatrixInverse.copy(camera.projectionMatrixInverse)
    const worlds: { w: World; clip: World['clip'] }[] = []
    const hidden: Object3D[] = []
    scene.traverse((o) => {
      const w = o as World, t = o as Thin
      if (w.isSplatWorld) { worlds.push({ w, clip: w.clip }); w.clip = [plane.normal[0], plane.normal[1], plane.normal[2], plane.offset - lift] }
      else if ((t.isLine || t.isPoints) && o.visible) { o.visible = false; hidden.push(o) }
    })
    const bg = (scene as { background?: unknown }).background
    if (bg) (scene as { background?: unknown }).background = null
    const was = renderer.getRenderTarget()
    const clear = renderer.getClearAlpha(), color = renderer.getClearColor(new Color())
    try {
      renderer.setRenderTarget(this.target)
      renderer.setClearColor(0x000000, 0)
      renderer.clear()
      renderer.render(scene, this.camera)
    } finally {
      renderer.setRenderTarget(was)
      if (bg) (scene as { background?: unknown }).background = bg
      renderer.setClearColor(color, clear)
      for (const { w, clip } of worlds) w.clip = clip
      for (const o of hidden) o.visible = true
    }
    this.drawn = { viewProj: new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).toArray(), plane: { normal: [...plane.normal], offset: plane.offset } }
  }

  /**
   * The picture last drawn, read back for `seenIn`, with the camera it was drawn for. Reading takes a frame or
   * two; while one read is under way another returns null, so call it every frame and keep the last picture.
   */
  async read(renderer: WebGPURenderer): Promise<MirrorImage | null> {
    const drawn = this.drawn
    if (!drawn || this.reading) return null
    this.reading = true
    try {
      const { width, height } = this.target
      const raw = await renderer.readRenderTargetPixelsAsync(this.target, 0, 0, width, height) as unknown as Uint16Array
      const webgl = (renderer.backend as unknown as { isWebGLBackend?: boolean }).isWebGLBackend === true
      const half = halves(), pixels = new Float32Array(width * height * 4)
      for (let y = 0; y < height; y++) {
        const src = (webgl ? height - 1 - y : y) * width * 4, dst = y * width * 4
        for (let k = 0; k < width * 4; k++) pixels[dst + k] = half[raw[src + k]]
      }
      return { width, height, pixels, viewProj: drawn.viewProj, plane: drawn.plane }
    } finally { this.reading = false }
  }

  /** Frees its render target. */
  dispose() { this.target.dispose() }
}
