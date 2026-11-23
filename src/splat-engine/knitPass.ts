import { DataTexture, NearestFilter, NoBlending, NodeMaterial, QuadMesh, RedFormat, RenderTarget, UnsignedByteType, Vector2, Vector3, type Camera, type Object3D, type WebGPURenderer } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import { srgbToLinear } from '../splat-core/color.ts'
import { oklab } from '../splat-core/pixel.ts'
import { GAP_SHADE, KNIT_COVER, KNIT_LIGHT, KNIT_STEADY, KNIT_YARNS, LEG_TIP, LEG_TOP, PICTURE_MARK, STITCH_TALL, YARN_HALF, YARN_ROUND, YARN_VARY, knitChart, type KnitLook } from '../splat-core/knit.ts'

// As in engine.ts: the shader builders use TSL untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Fn, abs, clamp, dot, float, floor, fract, int, length, max, min, pow, select, sin, texture, uniform, uniformArray, uv, vec2, vec3, vec4 } = TSL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any

/** Where a stitch's mean is taken: three across and three down. */
const TAPS: [number, number][] = Array.from({ length: 9 }, (_, i) => [((i % 3) + 0.5) / 3 - 0.5, (Math.floor(i / 3) + 0.5) / 3 - 0.5])
/** The stitches beside one: left, right, above, below. */
const BESIDE: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

/**
 * The picture as knitting (splat-core/knit.ts is the CPU twin: change one, change both). The frame is drawn once,
 * every blob flat in its own color. One small pass decides every stitch of the grid (the yarn nearest what the
 * picture shows there, or the sweater's own pattern where it shows nothing; kept in a target a stitch a pixel,
 * beside the one from the frame before so a stitch can keep its yarn), and a second draws each stitch as a V of
 * yarn. The knitting covers the canvas.
 *
 * The world should be drawing flat marks with no light of its own (`Stage.setKnit` sets both).
 */
export class KnitPass {
  /** The picture: every blob flat in its own color. */
  readonly picture = new RenderTarget(1, 1)
  /** The grid of this frame and of the one before: the yarn's number over 255 in red (`PICTURE_MARK` more for a stitch of the picture). */
  private readonly grids = [0, 1].map(() => new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false }))
  private now = 0
  private kept = false
  private readonly beforeTex = texture(this.grids[1].texture)
  private readonly gridTex = texture(this.grids[0].texture)
  /** The sweater's own pattern, a stitch a pixel (`knitChart`). */
  private chart = new DataTexture(new Uint8Array(1), 1, 1, RedFormat, UnsignedByteType)
  private readonly chartTex = texture(this.chart)
  private charted = ''
  private readonly decide = new NodeMaterial()
  private readonly show = new NodeMaterial()
  private readonly decideQuad: QuadMesh
  private readonly showQuad: QuadMesh
  /** The picture's size in device pixels. */
  private readonly res = uniform(new Vector2(1, 1))
  /** The grid's size in stitches. */
  private readonly cells = uniform(new Vector2(1, 1))
  /** A stitch's size in device pixels. */
  private readonly box = uniform(new Vector2(8, 6))
  private readonly yarnLab = uniformArray(Array.from({ length: KNIT_YARNS }, () => new Vector3()), 'vec3')
  private readonly yarnColor = uniformArray(Array.from({ length: KNIT_YARNS }, () => new Vector3()), 'vec3')
  private readonly count = uniform(2)
  private readonly sticky = uniform(0)
  private steady = KNIT_STEADY
  private look?: KnitLook

  constructor() {
    for (const [m, f] of [[this.decide, this.decideCells()], [this.show, this.draw()]] as const) {
      m.fragmentNode = f
      m.blending = NoBlending
      m.depthTest = false
      m.depthWrite = false
    }
    this.decideQuad = new QuadMesh(this.decide)
    this.showQuad = new QuadMesh(this.show)
  }

  /** The look. */
  setLook(look: KnitLook) {
    this.look = look
    const n = Math.max(2, Math.min(KNIT_YARNS, look.yarns.length))
    this.count.value = n
    for (let i = 0; i < KNIT_YARNS; i++) {
      const y = look.yarns[Math.min(i, look.yarns.length - 1)] ?? [0, 0, 0]
      const lab = oklab(y[0] * 255, y[1] * 255, y[2] * 255)
      ;(this.yarnLab.array[i] as Vector3).set(lab[0], lab[1], lab[2])
      ;(this.yarnColor.array[i] as Vector3).set(srgbToLinear(y[0]), srgbToLinear(y[1]), srgbToLinear(y[2]))
    }
    this.steady = look.steady ?? KNIT_STEADY
    this.lay()
  }

  /** Sizes the pass for a picture in device pixels, with stitches `width` by `height` of them. */
  setSize(width: number, height: number, stitch: { width: number; height: number }) {
    const cols = Math.ceil(width / stitch.width), rows = Math.ceil(height / stitch.height)
    this.box.value.set(stitch.width, stitch.height)
    if (this.picture.width !== width || this.picture.height !== height) {
      this.picture.setSize(width, height)
      this.res.value.set(width, height)
    }
    if (this.grids[0].width !== cols || this.grids[0].height !== rows) {
      for (const g of this.grids) g.setSize(cols, rows)
      this.cells.value.set(cols, rows)
      this.kept = false
    }
    this.lay()
  }

  /** Knits the sweater's own pattern for the grid as it is, when the grid or the pattern has changed. */
  private lay() {
    const look = this.look
    if (!look) return
    const cols = this.grids[0].width, rows = this.grids[0].height
    const key = `${cols}x${rows}:${(look.bands ?? []).join()}:${look.snow ? 1 : 0}`
    if (key === this.charted) return
    this.charted = key
    this.chart.dispose()
    this.chart = new DataTexture(knitChart(cols, rows, look), cols, rows, RedFormat, UnsignedByteType)
    this.chart.minFilter = this.chart.magFilter = NearestFilter
    this.chart.needsUpdate = true
    this.chartTex.value = this.chart
  }

  /** The grid of the frame just drawn: a pixel a stitch, the yarn's number in red. */
  get grid() { return this.grids[this.now] }

  /** Forgets the frame before: for when what is being drawn is swapped for something else. */
  forget() { this.kept = false }

  /** Draws the scene as knitting into the renderer's current target, or onto the screen when it has none. */
  render(renderer: WebGPURenderer, scene: Object3D, camera: Camera) {
    const to = renderer.getRenderTarget()
    renderer.setRenderTarget(this.picture)
    renderer.clear()
    renderer.render(scene, camera)
    // the grid, into the older target, against the newer one
    this.sticky.value = this.kept ? this.steady : 0
    this.beforeTex.value = this.grids[this.now].texture
    this.now = 1 - this.now
    renderer.setRenderTarget(this.grids[this.now])
    this.decideQuad.render(renderer)
    this.kept = true
    this.gridTex.value = this.grids[this.now].texture
    renderer.setRenderTarget(to)
    this.showQuad.render(renderer)
  }

  /** Every stitch's yarn: `knitCell`. */
  private decideCells() {
    const picture = this.picture.texture
    return Fn(() => {
      const st = uv()
      // which stitch, counted from the left and from the top, and its middle on the picture
      const cell = floor(st.mul(this.cells)).toVar()
      const size = this.box.div(this.res).toVar()
      const mid = cell.add(0.5).mul(size).toVar()
      const sum = vec4(0).toVar()
      for (const [x, y] of TAPS) sum.addAssign(texture(picture, mid.add(vec2(x, y).mul(size))))
      const mean = sum.div(TAPS.length).toVar()
      const cover = mean.a.clamp(0, 1).toVar()
      // OKLab of what it shows (the picture is linear and premultiplied)
      const lin = mean.rgb.div(max(cover, 1e-4)).clamp(0, 1).toVar()
      const cbrt = (v: N) => pow(max(v, 0), float(1 / 3))
      const l = cbrt(dot(lin, vec3(0.4122214708, 0.5363325363, 0.0514459929))).toVar()
      const m = cbrt(dot(lin, vec3(0.2119034982, 0.6806995451, 0.1073969566))).toVar()
      const s = cbrt(dot(lin, vec3(0.0883024619, 0.2817188376, 0.6299787005))).toVar()
      const lab = vec3(
        l.mul(0.2104542553).add(m.mul(0.793617785)).sub(s.mul(0.0040720468)),
        l.mul(1.9779984951).sub(m.mul(2.428592205)).add(s.mul(0.4505937099)),
        l.mul(0.0259040371).add(m.mul(0.7827717662)).sub(s.mul(0.808675766)),
      ).toVar()
      // `yarnFor`: the nearest yarn but the body's, or the one the stitch had when that is no more than `sticky` further off
      const was = floor(this.beforeTex.sample(cell.add(0.5).div(this.cells)).r.mul(255).add(0.5)).sub(PICTURE_MARK).toVar()
      const best = float(1).toVar(), off = float(1e9).toVar(), wasOff = float(1e9).toVar()
      for (let i = 1; i < KNIT_YARNS; i++) {
        const d = length(lab.sub(this.yarnLab.element(i)).mul(vec3(KNIT_LIGHT, 1, 1)))
        const nearer = d.lessThan(off).and(this.count.greaterThan(i - 0.5))
        best.assign(select(nearer, float(i), best))
        off.assign(select(nearer, d, off))
        wasOff.assign(select(abs(was.sub(i)).lessThan(0.5), d, wasOff))
      }
      const keep = this.sticky.greaterThan(0).and(wasOff.lessThanEqual(off.add(this.sticky)))
      const yarn = select(keep, was, best)
      // a stitch right beside the picture is plain body
      const beside = float(0).toVar()
      for (const [x, y] of BESIDE) beside.assign(max(beside, texture(picture, mid.add(vec2(x, y).mul(size))).a))
      const own = floor(this.chartTex.sample(cell.add(0.5).div(this.cells)).r.mul(255).add(0.5))
      const n = select(cover.greaterThanEqual(KNIT_COVER), yarn.add(PICTURE_MARK), select(beside.greaterThanEqual(KNIT_COVER), float(0), own))
      return vec4(n.div(255), 0, 0, 1)
    })()
  }

  /** The stitches, from the grid: `stitchAt`. */
  private draw() {
    const leg = (x: N, y: N) => {
      const p = vec2(abs(x.sub(0.5)), y.mul(STITCH_TALL))
      const a = vec2(LEG_TOP[0], LEG_TOP[1] * STITCH_TALL), b = vec2(LEG_TIP[0], LEG_TIP[1] * STITCH_TALL)
      const ab = b.sub(a)
      const t = clamp(dot(p.sub(a), ab).div(dot(ab, ab)), 0, 1)
      return length(p.sub(a.add(ab.mul(t))))
    }
    return Fn(() => {
      const st = uv()
      const px = floor(st.mul(this.res)).toVar()
      const cell = floor(px.div(this.box)).toVar()
      const at = px.sub(cell.mul(this.box)).add(0.5).div(this.box).toVar()
      const over = leg(at.x, at.y.add(1)).toVar(), own = leg(at.x, at.y).toVar()
      const above = over.lessThan(YARN_HALF)
      const d = select(above, over, own)
      const t = d.div(YARN_HALF).toVar()
      const edge = min(float(1).sub(t).div(0.18), 1)
      const body = float(1).sub(t.mul(t).mul(YARN_ROUND))
      const shade = select(d.greaterThanEqual(YARN_HALF), float(GAP_SHADE), float(GAP_SHADE).add(body.sub(GAP_SHADE).mul(edge)))
      // the stitch whose yarn this is: this one, or the one above where its tip lies over
      const whose = vec2(cell.x, max(cell.y.sub(select(above, float(1), float(0))), 0)).toVar()
      const g = this.gridTex.sample(whose.add(0.5).div(this.cells)).r.mul(255).add(0.5).floor().toVar()
      const yarn = g.sub(select(g.greaterThanEqual(PICTURE_MARK), float(PICTURE_MARK), float(0)))
      const color = this.yarnColor.element(int(clamp(yarn, 0, KNIT_YARNS - 1)))
      // one stitch's yarn a little lighter or darker than the next's (`stitchHash`)
      const vary = fract(sin(whose.x.mul(127.1).add(whose.y.mul(311.7))).mul(43758.5453)).sub(0.5).mul(2 * YARN_VARY).add(1)
      return vec4(color.mul(shade).mul(vary), 1)
    })()
  }

  /** Frees its targets. */
  dispose() {
    this.picture.dispose()
    for (const g of this.grids) g.dispose()
    this.chart.dispose()
    this.decide.dispose()
    this.show.dispose()
  }
}
