import { Color, DataUtils, DepthTexture, HalfFloatType, NearestFilter, NodeMaterial, RenderTarget, type Camera, type Material, type Object3D, type WebGPURenderer } from 'three/webgpu'
import { positionView, vec4 } from 'three/tsl'

/**
 * A depth map of a scene drawn by the engine, for post effects (fog, outlines,
 * focus): every pixel's distance in front of the camera, in scene units, in
 * all three channels of a half-float target, and 0 where nothing was drawn.
 * The target also carries a depth texture, for passes that want the usual
 * kind (ordinary meshes write it; blobs, being see-through, do not).
 *
 * Splats have no single depth: a blob fades out from its middle. Here each
 * blob counts as a hard disc out to where it has faded to a sixth (as in the
 * map of parts), and the frame's own sort leaves the nearest disc on top. So
 * draw it right after the frame's own render, with the same camera: it reuses
 * that frame's moved and sorted blobs (`SplatWorld.hold`) and costs one more
 * draw, nothing more.
 *
 * Ordinary meshes draw their own depth with a stand-in material; lines and
 * points (grids, helpers) are left out.
 */
export class SplatDepth {
  readonly target: RenderTarget
  private readonly material = new NodeMaterial()

  constructor(width = 1, height = 1) {
    this.target = new RenderTarget(width, height, { type: HalfFloatType, depthBuffer: true, minFilter: NearestFilter, magFilter: NearestFilter })
    this.target.depthTexture = new DepthTexture(width, height)
    const d = positionView.z.negate()
    this.material.colorNode = vec4(d, d, d, 1) as never
  }

  setSize(width: number, height: number) {
    if (this.target.width !== width || this.target.height !== height) this.target.setSize(width, height)
  }

  /** Draws the depth map of `scene` as just rendered from `camera` into `target` (sized to match the frame first). */
  render(renderer: WebGPURenderer, scene: Object3D, camera: Camera) {
    type World = Object3D & { isSplatWorld?: boolean; depthMap: boolean; hold: boolean }
    type Drawn = Object3D & { isMesh?: boolean; isLine?: boolean; isPoints?: boolean; material: Material }
    const worlds: { w: World; hold: boolean }[] = []
    const swapped: { o: Drawn; m: Material }[] = []
    const hidden: Object3D[] = []
    scene.traverse((o) => {
      const w = o as World, d = o as Drawn
      if (w.isSplatWorld) { worlds.push({ w, hold: w.hold }); w.depthMap = true; w.hold = true }
      else if (d.isMesh && o.visible) { swapped.push({ o: d, m: d.material }); d.material = this.material }
      else if ((d.isLine || d.isPoints) && o.visible) { o.visible = false; hidden.push(o) }
    })
    // a scene's background would fill the empty pixels: they stay 0
    const bg = (scene as { background?: unknown }).background
    if (bg) (scene as { background?: unknown }).background = null
    const was = renderer.getRenderTarget()
    const clear = renderer.getClearAlpha(), color = renderer.getClearColor(new Color())
    try {
      renderer.setRenderTarget(this.target)
      renderer.setClearColor(0x000000, 0)
      renderer.clear()
      renderer.render(scene, camera)
    } finally {
      renderer.setRenderTarget(was)
      if (bg) (scene as { background?: unknown }).background = bg
      renderer.setClearColor(color, clear)
      for (const { w, hold } of worlds) { w.depthMap = false; w.hold = hold }
      for (const { o, m } of swapped) o.material = m
      for (const o of hidden) o.visible = true
    }
  }

  /** For tests and tools: the map read back, one depth a pixel, rows from the top. */
  async read(renderer: WebGPURenderer): Promise<{ width: number; height: number; depth: Float32Array }> {
    const { width, height } = this.target
    const raw = await renderer.readRenderTargetPixelsAsync(this.target, 0, 0, width, height) as unknown as Uint16Array
    const webgl = (renderer.backend as unknown as { isWebGLBackend?: boolean }).isWebGLBackend === true
    const depth = new Float32Array(width * height)
    for (let y = 0; y < height; y++) {
      const row = webgl ? height - 1 - y : y
      for (let x = 0; x < width; x++) depth[y * width + x] = DataUtils.fromHalfFloat(raw[(row * width + x) * 4])
    }
    return { width, height, depth }
  }

  dispose() {
    this.target.dispose()
    this.material.dispose()
  }
}
