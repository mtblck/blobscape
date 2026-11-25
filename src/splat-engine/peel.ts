import { Color, DepthTexture, FloatType, HalfFloatType, NearestFilter, NoBlending, NodeMaterial, QuadMesh, RenderTarget, type Camera, type Material, type Object3D, type WebGPURenderer } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'

// As in engine.ts: the shader builders use TSL untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Fn, texture, uv, vec4 } = TSL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any

/** The most layers `SplatPeel` takes from the front of each pixel. */
export const MAX_PEEL = 6

/** What a world hands a peel (a `SplatWorld` made with `peel`): its draw's material, and the switches its fragment reads. */
export interface Peelable {
  /** The material it draws with; the peel swaps in its own for the layers and puts this back. */
  material: Material
  /** While true it draws the last frame's blobs without moving or sorting them again: the layers after the first. */
  hold: boolean
  /** 0 off; 1 a layer (only the nearest blob still in front of `prev` is kept); 2 the rest (only what lies behind `prev`). */
  peelMode: number
  /** Whether this layer is the first, with nothing in front of it to be behind. */
  peelFirst: boolean
  /** The depth of the layer before, read where each pixel is. */
  peelBehind(depth: DepthTexture): void
  /** Builds its draw's shaders for the backend, so the peel can draw with them. */
  buildFor(renderer: WebGPURenderer): void
}

/**
 * See-through blobs in the right order where they cross (after Silicon Jungle's Ink Studio's surface order, by
 * agreement; our own method). The engine sorts blobs by their middles and lays them back to front, which is right
 * until two see-through blobs cross: then one is wholly in front of the other where they overlap, and as the view
 * turns past where their middles change places, that flips all at once. Here each pixel's nearest `layers` blobs are
 * taken off the front one at a time (depth peeling), each at its own depth on its own plane (`placeQuad` slopes a
 * blob's corners), so where two cross each is in front on its own side; whatever lies behind the last layer is laid as
 * before, and the layers go over it front to back. Costs a draw of the blobs per layer and one more.
 *
 * Everything else in the scene (a floor, meshes) is drawn first, under all the blobs: it suits a creature or a
 * jellyfish over a floor or a sky, not blobs among solid things.
 */
export class SplatPeel {
  private readonly layers: RenderTarget[] = []
  private readonly rest: RenderTarget
  private readonly back: RenderTarget
  /** A material a world, for its layers: its own shaders, without blending and writing depth. */
  private readonly peelMaterials = new WeakMap<Object3D, NodeMaterial>()
  private readonly made: NodeMaterial[] = []
  private finish?: { quad: QuadMesh; material: NodeMaterial; count: number }
  private count = 4

  /** Makes a peel taking `layers` blobs (4 unless set) off the front of each pixel; worlds must be made with `peel`. */
  constructor(layers = 4) {
    const target = (depth: boolean) => {
      const t = new RenderTarget(1, 1, { type: HalfFloatType, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: depth })
      // depth as 32-bit floats: two blobs a hair apart must still come off in two layers
      if (depth) { t.depthTexture = new DepthTexture(1, 1); t.depthTexture.type = FloatType }
      return t
    }
    for (let k = 0; k < MAX_PEEL; k++) this.layers.push(target(true))
    this.rest = target(false)
    this.back = target(true)
    this.setLayers(layers)
  }

  /** How many blobs to take off the front of each pixel, 1 to `MAX_PEEL`. */
  setLayers(layers: number) {
    this.count = Math.max(1, Math.min(MAX_PEEL, Math.round(layers)))
  }

  /** Sizes the targets, in pixels. */
  setSize(width: number, height: number) {
    for (const t of [...this.layers, this.rest, this.back]) if (t.width !== width || t.height !== height) t.setSize(width, height)
  }

  /** Draws `scene` from `camera` into the renderer's current target, with every world in it peeled. */
  render(renderer: WebGPURenderer, scene: Object3D, camera: Camera) {
    const worlds: (Object3D & Peelable)[] = []
    scene.traverse((o) => { if ((o as { isSplatWorld?: boolean }).isSplatWorld && o.visible) worlds.push(o as Object3D & Peelable) })
    const to = renderer.getRenderTarget()
    // what is not blobs, under them all
    for (const w of worlds) w.visible = false
    renderer.setRenderTarget(this.back)
    renderer.clear()
    renderer.render(scene, camera)
    for (const w of worlds) w.visible = true
    // only the blobs from here: everything else is hidden for the layers
    const hidden: Object3D[] = []
    scene.traverse((o) => {
      const drawn = o as { isMesh?: boolean; isLine?: boolean; isPoints?: boolean; isSprite?: boolean }
      if (!o.visible || worlds.includes(o as Object3D & Peelable)) return
      if (drawn.isMesh || drawn.isLine || drawn.isPoints || drawn.isSprite) { o.visible = false; hidden.push(o) }
    })
    const bg = (scene as { background?: unknown }).background
    if (bg) (scene as { background?: unknown }).background = null
    for (const w of worlds) w.buildFor(renderer)
    const kept = worlds.map((w) => ({ w, material: w.material, hold: w.hold }))
    const clearColor = renderer.getClearColor(new Color()), clearAlpha = renderer.getClearAlpha()
    renderer.setClearColor(0x000000, 0)
    try {
      for (let k = 0; k < this.count; k++) {
        for (const { w, material } of kept) {
          // the peel draws with the world's own shaders, without blending and writing depth
          w.material = this.peelMaterial(w, material as NodeMaterial)
          w.peelMode = 1
          w.peelFirst = k === 0
          if (k > 0) w.peelBehind(this.layers[k - 1].depthTexture!)
          // the first layer moves and sorts the blobs for the frame; the rest draw them as they are
          w.hold = k > 0 || w.hold
        }
        renderer.setRenderTarget(this.layers[k])
        renderer.clear()
        renderer.render(scene, camera)
      }
      // the rest: laid back to front as ever, but only behind the last layer
      for (const { w, material } of kept) {
        w.material = material
        w.peelMode = 2
        w.peelFirst = false
        w.peelBehind(this.layers[this.count - 1].depthTexture!)
        w.hold = true
      }
      renderer.setRenderTarget(this.rest)
      renderer.clear()
      renderer.render(scene, camera)
    } finally {
      for (const { w, material, hold } of kept) { w.material = material; w.peelMode = 0; w.hold = hold }
      for (const o of hidden) o.visible = true
      if (bg) (scene as { background?: unknown }).background = bg
      renderer.setClearColor(clearColor, clearAlpha)
      renderer.setRenderTarget(to)
    }
    this.finishQuad().render(renderer)
  }

  /** The world's layer material, kept on its own shaders, which it builds again when the backend or the skinning changes. */
  private peelMaterial(w: Object3D, from: NodeMaterial) {
    let m = this.peelMaterials.get(w)
    if (!m) {
      m = new NodeMaterial()
      // a layer keeps the nearest blob at each pixel: no blending, and the depth test leaves the nearest on top
      m.blending = NoBlending
      m.depthWrite = true
      m.depthTest = true
      m.transparent = false
      m.forceSinglePass = true
      this.peelMaterials.set(w, m)
      this.made.push(m)
    }
    if (m.vertexNode !== from.vertexNode || m.colorNode !== from.colorNode) {
      m.vertexNode = from.vertexNode
      m.colorNode = from.colorNode
      m.needsUpdate = true
    }
    return m
  }

  /** The layers front to back over the rest, and all of it over what is not blobs: colors with their cover in (premultiplied). */
  private finishQuad() {
    if (this.finish?.count === this.count) return this.finish.quad
    this.finish?.material.dispose()
    const material = new NodeMaterial()
    material.blending = NoBlending
    material.depthTest = false
    material.depthWrite = false
    const layers = this.layers.slice(0, this.count)
    material.fragmentNode = Fn(() => {
      const st = uv()
      const out = vec4(0).toVar()
      const over = (c: N) => { out.assign(out.add(c.mul(out.a.oneMinus()))) }
      for (const l of layers) over(texture(l.texture, st))
      over(texture(this.rest.texture, st))
      over(texture(this.back.texture, st))
      return out
    })()
    this.finish = { quad: new QuadMesh(material), material, count: this.count }
    return this.finish.quad
  }

  /** Frees its targets and materials. */
  dispose() {
    for (const t of [...this.layers, this.rest, this.back]) t.dispose()
    for (const m of this.made) m.dispose()
    this.finish?.material.dispose()
  }
}
