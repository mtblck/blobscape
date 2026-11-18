import { HalfFloatType, LinearFilter, NoBlending, NodeMaterial, QuadMesh, RenderTarget, Vector2, type Camera, type Object3D, type Texture, type WebGPURenderer } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import { SplatDepth } from './depth.ts'
import { blurScale, type OpticsLook } from '../splat-core/optics.ts'

// As in engine.ts: the shader builders use TSL untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Fn, abs, clamp, cos, dot, exp, float, fract, max, min, select, sin, smoothstep, texture, uniform, uv, vec2, vec4 } = TSL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any

/** How many points of the lens's opening a pixel is looked at through. */
const TAPS = 40
/** The golden angle: each tap is turned this far from the last, so they cover the opening evenly. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

/** A blur's taps along one way: whole steps out to 2.5 widths, with weights that sum to 1. */
function taps(sigma: number): [number, number][] {
  const reach = Math.max(1, Math.ceil(sigma * 2.5))
  const out: [number, number][] = []
  let sum = 0
  for (let i = -reach; i <= reach; i++) { const w = Math.exp((-i * i) / (2 * sigma * sigma)); out.push([i, w]); sum += w }
  return out.map(([i, w]) => [i, w / sum])
}

/**
 * A lens in front of a stage: light that spills round bright things, and blur for whatever is nearer or farther
 * than the distance in focus. Both come from what the frame holds, nothing is placed by hand: the glow is the
 * picture's own light over a knee, spread out, so a flame glows and a pale wall does not; the blur is the thin
 * lens's circle of confusion for each pixel's depth (`SplatDepth`), so it follows the view and the scene as they
 * move. The numbers are `splat-core/optics.ts` (`blurRadius`, `glowShare`), the CPU twins of the shader here:
 * change both.
 *
 * The frame is drawn twice with one sort (the picture into a half-float target, so light over 1 is kept, then the
 * map of depth), and a few small passes follow: the light over the knee at half size, blurred there (the tight
 * halo) and again at quarter size (the wide one); then one pass over the picture that looks at each pixel through
 * `TAPS` points of the opening, spread as wide as the pixel's own blur or that of something nearer beside it. A point's color counts for a pixel when its own blur reaches it; something sharp
 * in front is not smeared by what is blurred behind it, since a point behind counts no further than the pixel's
 * own blur.
 */
export class SplatLens {
  /** The picture, as the stage draws it without the lens. */
  readonly picture = new RenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter })
  private readonly depth = new SplatDepth()
  private readonly half = [0, 1].map(() => new RenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false }))
  private readonly quarter = [0, 1].map(() => new RenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false }))
  private readonly res = uniform(new Vector2(1, 1))
  private readonly knee = uniform(0.7)
  private readonly glow = uniform(0)
  /** Where light starts to roll off toward white; 1 or more for none. */
  private readonly shoulder = uniform(1)
  /** Pixels of blur radius per |d − s| / d. */
  private readonly scale = uniform(0)
  private readonly focus = uniform(1)
  /** The widest blur, pixels. */
  private readonly most = uniform(1)
  private readonly materials: NodeMaterial[] = []
  private readonly bright: QuadMesh
  private readonly blurs: QuadMesh[]
  private readonly finish: { sharp: QuadMesh; blurred: QuadMesh }
  private look: OpticsLook = { focus: 1, fNumber: 0, glow: 0 }
  private fov = 40

  constructor() {
    const quad = (fragment: N) => {
      const m = new NodeMaterial()
      m.fragmentNode = fragment
      m.blending = NoBlending
      m.depthTest = false
      m.depthWrite = false
      this.materials.push(m)
      return new QuadMesh(m)
    }
    this.bright = quad(this.brightPass())
    // sizes are set before a draw; a blur's step is one pixel of the target it reads
    const [h0, h1] = this.half, [q0] = this.quarter
    // the glow's two widths: a tight halo (about 0.75% of the picture's height) and a wide soft one (about 2%)
    const sigmaHalf = 3, sigmaQuarter = 4
    this.blurs = [
      quad(this.blurPass(h0.texture, [1, 0], 2, sigmaHalf)),
      quad(this.blurPass(h1.texture, [0, 1], 2, sigmaHalf)),
      quad(this.blurPass(h0.texture, [1, 0], 2, sigmaQuarter * 2)),
      quad(this.blurPass(q0.texture, [0, 1], 4, sigmaQuarter)),
    ]
    this.finish = { sharp: quad(this.finishPass(false)), blurred: quad(this.finishPass(true)) }
  }

  /** The lens, for a view `fov` degrees tall. */
  setLook(look: OpticsLook, fov: number) {
    this.look = look
    this.fov = fov
    this.glow.value = Math.max(0, look.glow)
    this.knee.value = look.knee ?? 0.7
    this.shoulder.value = look.shoulder !== undefined && look.shoulder < 1 ? Math.max(0, look.shoulder) : 1
    this.focus.value = Math.max(1e-4, look.focus)
    this.fit()
  }

  /** Sizes the pass's targets, in device pixels. */
  setSize(width: number, height: number) {
    if (this.picture.width === width && this.picture.height === height) return
    this.picture.setSize(width, height)
    this.depth.setSize(width, height)
    for (const t of this.half) t.setSize(Math.max(1, width >> 1), Math.max(1, height >> 1))
    for (const t of this.quarter) t.setSize(Math.max(1, width >> 2), Math.max(1, height >> 2))
    this.res.value.set(width, height)
    this.fit()
  }

  /** The blur's numbers depend on the picture's height. */
  private fit() {
    const h = this.res.value.y
    this.scale.value = blurScale(this.look, this.fov, h)
    this.most.value = Math.max(1, (this.look.most ?? 0.02) * h)
  }

  /** Draws the scene through the lens into the renderer's current target, or onto the screen when it has none. */
  render(renderer: WebGPURenderer, scene: Object3D, camera: Camera) {
    const to = renderer.getRenderTarget()
    const blurred = this.scale.value > 0
    renderer.setRenderTarget(this.picture)
    renderer.clear()
    renderer.render(scene, camera)
    if (blurred) this.depth.render(renderer, scene, camera)
    if (this.glow.value > 0) {
      const [h0, h1] = this.half, [q0, q1] = this.quarter
      const pass = (quad: QuadMesh, into: RenderTarget) => { renderer.setRenderTarget(into); quad.render(renderer) }
      pass(this.bright, h0)
      pass(this.blurs[0], h1)
      // the tight halo ends up in h0; the wide one is made from it, at quarter size
      pass(this.blurs[1], h0)
      pass(this.blurs[2], q0)
      pass(this.blurs[3], q1)
    }
    renderer.setRenderTarget(to)
    ;(blurred ? this.finish.blurred : this.finish.sharp).render(renderer)
  }

  /** The light over the knee, at half size. CPU twin of the share: `glowShare`. */
  private brightPass() {
    return Fn(() => {
      const c = texture(this.picture.texture, uv()).toVar()
      const top = max(c.r, max(c.g, c.b))
      const share = smoothstep(this.knee, this.knee.mul(4 / 3), top)
      // one very bright pixel would otherwise twinkle as it moves across the half-size grid
      return vec4(min(c.rgb, 16).mul(share), 1)
    })()
  }

  /** One way of a blur: `from` read at steps of one of its own pixels (`size` picture pixels), widened with the picture so the glow keeps its share of it. */
  private blurPass(from: Texture, way: [number, number], size: number, sigma: number) {
    return Fn(() => {
      const st = uv().toVar()
      // a width of sigma pixels suits a picture 800 high; a bigger one steps further (the filter still reads between pixels)
      const step = vec2(way[0], way[1]).mul(size).div(this.res).mul(max(this.res.y.div(800), 1)).toVar()
      const sum = vec4(0).toVar()
      for (const [i, w] of taps(sigma)) sum.addAssign(texture(from, st.add(step.mul(i))).mul(w))
      return sum
    })()
  }

  /** The picture through the opening, with the glow laid over it. */
  private finishPass(blurred: boolean) {
    const picture = this.picture.texture, depth = this.depth.target.texture
    return Fn(() => {
      const st = uv().toVar()
      const px = vec2(1).div(this.res).toVar()
      const out = texture(picture, st).toVar()
      if (blurred) {
        // nothing drawn is as far as can be
        const far = (d: N) => select(d.greaterThan(0), d, float(1e6))
        // CPU twin: `blurRadius`
        const radius = (d: N) => min(this.scale.mul(abs(d.sub(this.focus))).div(d), this.most)
        const d0 = far(texture(depth, st).r).toVar()
        const r0 = radius(d0).toVar()
        // how far to look: this pixel's own blur, or that of something nearer close by, which spreads over it (what is
        // behind never counts further than the pixel's own blur). Eight looks on two rings find the nearer things
        const reach = r0.toVar()
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4 + (i & 1 ? 0.4 : 0), rho = i & 1 ? 1 : 0.5
          const d = far(texture(depth, st.add(vec2(Math.cos(a) * rho, Math.sin(a) * rho).mul(this.most).mul(px))).r)
          reach.assign(select(d.lessThan(d0), max(reach, radius(d)), reach))
        }
        // the taps are turned by a different angle at every pixel, so their pattern shows as fine grain and not as copies of an edge
        const cell = st.mul(this.res)
        const turn = fract(fract(dot(cell, vec2(0.06711056, 0.00583715))).mul(52.9829189)).mul(Math.PI * 2).toVar()
        const cs = cos(turn).toVar(), sn = sin(turn).toVar()
        const sum = out.toVar(), weight = float(1).toVar()
        for (let i = 0; i < TAPS; i++) {
          const rho = Math.sqrt((i + 0.5) / TAPS), a = i * GOLDEN
          const x = Math.cos(a) * rho, y = Math.sin(a) * rho
          const off = vec2(cs.mul(x).sub(sn.mul(y)), sn.mul(x).add(cs.mul(y))).mul(reach)
          const at = st.add(off.mul(px)).toVar()
          const d = far(texture(depth, at).r).toVar()
          // a point behind this pixel's own is hidden by it as far as this pixel is sharp
          const r = select(d.greaterThan(d0), min(radius(d), r0), radius(d))
          const w = clamp(r.sub(reach.mul(rho)).add(0.5), 0, 1).toVar()
          sum.addAssign(texture(picture, at).mul(w))
          weight.addAssign(w)
        }
        out.assign(sum.div(weight))
      }
      const [h0] = this.half, [, q1] = this.quarter
      const halo = texture(h0.texture, st).rgb.mul(0.6).add(texture(q1.texture, st).rgb.mul(0.6))
      const rgb = out.rgb.add(halo.mul(this.glow)).toVar()
      // the film's shoulder: strong light closes on white without running into it, the whole color together so its hue holds. CPU twin: `rolledOff`
      const top = max(rgb.r, max(rgb.g, rgb.b)).toVar()
      const room = max(float(1).sub(this.shoulder), 1e-4)
      const rolled = this.shoulder.add(room.mul(float(1).sub(exp(top.sub(this.shoulder).div(room).negate()))))
      rgb.mulAssign(select(this.shoulder.lessThan(1).and(top.greaterThan(this.shoulder)), rolled.div(top), float(1)))
      // linear color out, as the blobs' own draw gives
      return vec4(rgb, out.a)
    })()
  }

  /** Frees its targets. */
  dispose() {
    this.picture.dispose()
    this.depth.dispose()
    for (const t of [...this.half, ...this.quarter]) t.dispose()
    for (const m of this.materials) m.dispose()
  }
}
