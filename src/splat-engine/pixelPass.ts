import { NearestFilter, NoBlending, NodeMaterial, QuadMesh, RenderTarget, Vector2, Vector3, type Camera, type Object3D, type WebGPURenderer } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import { BAYER4, GLOW_FROM, GLOW_SHOWS, GLOW_TAPS, MAX_PALETTE_SIZE, PIXEL_CUT, oklab, type PixelLook } from '../splat-core/pixel.ts'
import { srgbToLinear } from '../splat-core/colour.ts'

// As in engine.ts: the shader builders use TSL untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Fn, If, Loop, dot, float, floor, int, max, min, mod, pow, select, smoothstep, texture, uniform, uniformArray, uv, vec2, vec3, vec4 } = TSL

const MAX_PALETTE = MAX_PALETTE_SIZE

/**
 * Pixel mode: the scene is drawn small into a target, and one full-screen pass
 * turns it into pixel art and scales it up in whole pixels, with no smoothing.
 *
 * The pass is the GPU twin of `pixelArt` in splat-core/pixel.ts (change one,
 * change both): alpha cut, glow from bright pixels, nearest palette colour in
 * OKLab with a Bayer dither, and an outline on the empty pixels that touch the
 * scene. It runs per art pixel: every screen pixel inside one art pixel asks
 * the same question and gets the same answer.
 */
export class PixelPass {
  /** The scene, drawn small. Linear and premultiplied, as any render target. */
  readonly small = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  /** The finished art at its own size, for reading back (tests, sprite sheets). */
  readonly art = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  private readonly quad: QuadMesh
  private readonly material = new NodeMaterial()
  private readonly res = uniform(new Vector2(1, 1))
  /** How many art pixels fit across and down the output: `res` when drawing the art itself, a fraction more on a screen. */
  private readonly cells = uniform(new Vector2(1, 1))
  private readonly count = uniform(0)
  private readonly dither = uniform(0)
  private readonly glow = uniform(0)
  private readonly lined = uniform(0)
  private readonly line = uniform(new Vector3())
  private readonly palLab = Array.from({ length: MAX_PALETTE }, () => new Vector3())
  private readonly palLinear = Array.from({ length: MAX_PALETTE }, () => new Vector3())

  constructor(look: PixelLook) {
    this.material.fragmentNode = this.fragment()
    this.material.blending = NoBlending
    this.material.depthTest = false
    this.material.depthWrite = false
    this.quad = new QuadMesh(this.material)
    this.setLook(look)
  }

  setLook(look: PixelLook) {
    const n = Math.min(MAX_PALETTE, look.palette.length)
    for (let i = 0; i < n; i++) {
      const c = look.palette[i]
      this.palLab[i].set(...oklab(c[0], c[1], c[2]))
      this.palLinear[i].set(srgbToLinear(c[0] / 255), srgbToLinear(c[1] / 255), srgbToLinear(c[2] / 255))
    }
    this.count.value = n
    this.dither.value = look.dither
    this.glow.value = look.glow
    this.lined.value = look.outline ? 1 : 0
    if (look.outline) this.line.value.set(srgbToLinear(look.outline[0] / 255), srgbToLinear(look.outline[1] / 255), srgbToLinear(look.outline[2] / 255))
  }

  /** The art's size in pixels. */
  setSize(width: number, height: number) {
    const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height))
    if (this.small.width === w && this.small.height === h) return
    this.small.setSize(w, h)
    this.art.setSize(w, h)
    this.res.value.set(w, h)
  }

  get width() { return this.small.width }
  get height() { return this.small.height }

  /**
   * Draws `scene` as pixel art. With `screen` (the output's size in device
   * pixels and how many of them make one art pixel) it goes to the renderer's
   * current output; without, into `art` at one to one.
   */
  render(renderer: WebGPURenderer, scene: Object3D, camera: Camera, screen?: { width: number; height: number; scale: number }) {
    const to = renderer.getRenderTarget()
    renderer.setRenderTarget(this.small)
    renderer.clear()
    renderer.render(scene, camera)
    if (screen) {
      this.cells.value.set(screen.width / screen.scale, screen.height / screen.scale)
      renderer.setRenderTarget(to)
    } else {
      this.cells.value.copy(this.res.value)
      renderer.setRenderTarget(this.art)
    }
    this.quad.render(renderer)
    renderer.setRenderTarget(to)
  }

  private fragment() {
    const small = this.small.texture
    const { res, cells } = this
    const palLab = uniformArray(this.palLab, 'vec3'), palLinear = uniformArray(this.palLinear, 'vec3')
    const bayer = uniformArray(BAYER4, 'float')
    const toSrgb = (c: unknown) => select(float(c).lessThanEqual(0.0031308), float(c).mul(12.92), pow(max(c, 0), 1 / 2.4).mul(1.055).sub(0.055))
    const toLinear = (c: unknown) => select(float(c).lessThanEqual(0.04045), float(c).div(12.92), pow(float(c).add(0.055).div(1.055), 2.4))
    const each = (v: { x: unknown; y: unknown; z: unknown }, f: (c: unknown) => unknown) => vec3(f(v.x), f(v.y), f(v.z))
    const cbrt = (x: unknown) => pow(max(x, 0), 1 / 3)

    return Fn(() => {
      // which art pixel this is, counted from the top left
      const st = uv()
      const cell = floor(vec2(st.x, float(1).sub(st.y)).mul(cells)).toVar()
      /** The small render at an art pixel `dx, dy` away: straight sRGB (0–255) and whether it is solid. */
      const at = (dx: number, dy: number) => {
        const c = cell.add(vec2(dx, dy))
        const inside = c.x.greaterThanEqual(0).and(c.y.greaterThanEqual(0)).and(c.x.lessThan(res.x)).and(c.y.lessThan(res.y))
        const s = texture(small, vec2(c.x.add(0.5).div(res.x), float(1).sub(c.y.add(0.5).div(res.y))))
        const solid = inside.and(s.a.greaterThanEqual(PIXEL_CUT))
        const rgb = each(s.rgb.div(max(s.a, 1e-5)).clamp(0, 1), toSrgb).mul(255)
        return { rgb, solid }
      }

      const here = at(0, 0)
      const spill = vec3(0).toVar()
      If(this.glow.greaterThan(0), () => {
        for (const [dx, dy] of GLOW_TAPS) {
          const t = at(dx, dy)
          const bright = smoothstep(GLOW_FROM, 1, max(t.rgb.x, max(t.rgb.y, t.rgb.z)).div(255))
          spill.addAssign(t.rgb.mul(select(t.solid, bright, 0)).mul(this.glow.div(GLOW_TAPS.length)))
        }
      })
      const beside = at(1, 0).solid.or(at(-1, 0).solid).or(at(0, 1).solid).or(at(0, -1).solid)

      const out = vec4(0).toVar()
      const colour = vec3(0).toVar()
      const shown = float(0).toVar()
      If(here.solid, () => { colour.assign(here.rgb.add(spill)); shown.assign(1) })
        .ElseIf(this.lined.greaterThan(0).and(beside), () => { out.assign(vec4(this.line, 1)) })
        .ElseIf(max(spill.x, max(spill.y, spill.z)).greaterThan(GLOW_SHOWS), () => { colour.assign(spill); shown.assign(1) })

      If(shown.greaterThan(0), () => {
        colour.assign(min(colour, 255))
        If(this.count.greaterThan(0), () => {
          const off = bayer.element(int(mod(cell.y, 4).mul(4).add(mod(cell.x, 4)))).div(16).sub(0.5).mul(this.dither.mul(48))
          const lin = each(max(colour.add(off), 0).div(255), toLinear)
          const l = cbrt(dot(lin, vec3(0.4122214708, 0.5363325363, 0.0514459929)))
          const m = cbrt(dot(lin, vec3(0.2119034982, 0.6806995451, 0.1073969566)))
          const s = cbrt(dot(lin, vec3(0.0883024619, 0.2817188376, 0.6299787005)))
          const lab = vec3(
            l.mul(0.2104542553).add(m.mul(0.793617785)).sub(s.mul(0.0040720468)),
            l.mul(1.9779984951).sub(m.mul(2.428592205)).add(s.mul(0.4505937099)),
            l.mul(0.0259040371).add(m.mul(0.7827717662)).sub(s.mul(0.808675766)),
          ).toVar()
          const best = float(1e9).toVar()
          const pick = vec3(0).toVar()
          Loop(MAX_PALETTE, ({ i }: { i: unknown }) => {
            If(float(i).lessThan(this.count), () => {
              const d = lab.sub(palLab.element(i))
              const dd = dot(d, d)
              If(dd.lessThan(best), () => { best.assign(dd); pick.assign(palLinear.element(i)) })
            })
          })
          out.assign(vec4(pick, 1))
        }).Else(() => {
          out.assign(vec4(each(colour.div(255), toLinear), 1))
        })
      })
      return out
    })()
  }

  dispose() {
    this.small.dispose()
    this.art.dispose()
    this.material.dispose()
  }
}
