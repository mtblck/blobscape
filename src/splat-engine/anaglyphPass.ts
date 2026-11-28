import { Color, HalfFloatType, LinearFilter, Matrix4, NoBlending, NodeMaterial, PerspectiveCamera, QuadMesh, RenderTarget, Vector3, type Object3D, type WebGPURenderer } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import { srgbToLinear } from '../splat-core/color.ts'
import { ANAGLYPH_BACK, EYE_MIX, eyeProjection, eyesFor, type AnaglyphLook } from '../splat-core/anaglyph.ts'

// As in engine.ts: the shader builders use TSL untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Fn, clamp, dot, float, mix, texture, uniform, uv, vec3, vec4 } = TSL

/** An eye: a camera placed by hand (its matrix and projection are set for each frame, never from its own fields). */
class EyeCamera extends PerspectiveCamera {
  constructor() {
    super()
    this.matrixAutoUpdate = false
  }
}

/**
 * 3D glasses (splat-core/anaglyph.ts): the frame drawn twice, from a left and a right eye a little either side of the
 * camera, each looking the same way with its picture slid so that the screen (`eyesFor`) lands in the same place for
 * both, then one pass lays them over each other in red and cyan (`mixEyes`, the CPU twin: change both). Each eye's
 * picture sits over the look's backdrop, which is the same for both, so it stands at the screen.
 *
 * Each eye is its own view, so the blobs are sorted for each: two sorts and two draws a frame. Lines and points are
 * drawn in both pictures, as anything else is.
 */
export class AnaglyphPass {
  /** The left eye's picture and the right's: linear color times cover, and cover. */
  readonly eyes = [0, 1].map(() => new RenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter }))
  private readonly cameras = [new EyeCamera(), new EyeCamera()]
  private readonly material = new NodeMaterial()
  private readonly finish: QuadMesh
  private readonly rows = Array.from({ length: 6 }, () => uniform(new Vector3()))
  private readonly top = uniform(new Vector3())
  private readonly bottom = uniform(new Vector3())
  private readonly shift = new Matrix4()
  private look: AnaglyphLook = {}

  constructor() {
    this.material.fragmentNode = this.fragment()
    this.material.blending = NoBlending
    this.material.depthTest = false
    this.material.depthWrite = false
    this.finish = new QuadMesh(this.material)
    this.setLook({})
  }

  /** The look: how deep, where the screen stands, how the pictures are mixed and what is behind. */
  setLook(look: AnaglyphLook) {
    this.look = look
    const m = EYE_MIX[look.mix ?? 'optimized'] ?? EYE_MIX.optimized
    for (let k = 0; k < 3; k++) { this.rows[k].value.set(...m.left[k]); this.rows[k + 3].value.set(...m.right[k]) }
    const [t, b] = look.back ?? ANAGLYPH_BACK
    this.top.value.set(srgbToLinear(t[0]), srgbToLinear(t[1]), srgbToLinear(t[2]))
    this.bottom.value.set(srgbToLinear(b[0]), srgbToLinear(b[1]), srgbToLinear(b[2]))
  }

  /** Sizes the eyes' pictures, in device pixels. */
  setSize(width: number, height: number) {
    for (const t of this.eyes) if (t.width !== width || t.height !== height) t.setSize(width, height)
  }

  /** Draws the scene for both eyes and lays them over each other into the renderer's current target, or onto the screen when it has none. `distance` is how far the camera is from what it looks at. */
  render(renderer: WebGPURenderer, scene: Object3D, camera: PerspectiveCamera, distance: number) {
    camera.updateMatrixWorld()
    const { half, screen } = eyesFor(distance, this.look)
    const to = renderer.getRenderTarget()
    const clear = renderer.getClearAlpha(), color = renderer.getClearColor(new Color())
    try {
      renderer.setClearColor(0x000000, 0)
      this.cameras.forEach((eye, k) => {
        const side = k === 0 ? -half : half
        this.place(eye, camera, side, screen)
        renderer.setRenderTarget(this.eyes[k])
        renderer.clear()
        renderer.render(scene, eye)
      })
    } finally {
      renderer.setClearColor(color, clear)
      renderer.setRenderTarget(to)
    }
    this.finish.render(renderer)
  }

  /** Stands `eye` `side` along the camera's right, looking the same way, with its picture slid for the screen. */
  private place(eye: EyeCamera, camera: PerspectiveCamera, side: number, screen: number) {
    eye.fov = camera.fov
    eye.aspect = camera.aspect
    eye.near = camera.near
    eye.far = camera.far
    eye.matrix.multiplyMatrices(camera.matrixWorld, this.shift.makeTranslation(side, 0, 0))
    eye.matrixWorldNeedsUpdate = true
    eye.updateMatrixWorld(true)
    eye.projectionMatrix.fromArray(eyeProjection(camera.projectionMatrix.elements, side, screen))
    eye.projectionMatrixInverse.copy(eye.projectionMatrix).invert()
  }

  /** The two pictures over the backdrop, mixed. CPU twin: `mixEyes` in anaglyph.ts; change both. */
  private fragment() {
    const [left, right] = this.eyes.map((t) => t.texture)
    return Fn(() => {
      const st = uv().toVar()
      const back = mix(this.top, this.bottom, st.y).toVar()
      const l = texture(left, st).toVar(), r = texture(right, st).toVar()
      const lc = l.rgb.add(back.mul(float(1).sub(l.a))).toVar()
      const rc = r.rgb.add(back.mul(float(1).sub(r.a))).toVar()
      const row = (k: number) => dot(this.rows[k], lc).add(dot(this.rows[k + 3], rc))
      return vec4(clamp(vec3(row(0), row(1), row(2)), 0, 1), 1)
    })()
  }

  /** Frees its pictures. */
  dispose() {
    for (const t of this.eyes) t.dispose()
    this.material.dispose()
  }
}
