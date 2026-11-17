import { NearestFilter, NoBlending, NodeMaterial, QuadMesh, RenderTarget, Vector2, Vector3, type Camera, type Object3D, type WebGPURenderer } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import { BAYER4, EDGE_DARK, EDGE_JUMP, GLOW_FROM, GLOW_SHOWS, GLOW_TAPS, MAX_PALETTE_SIZE, OWN_C, OWN_L, OWN_UNDER, PIXEL_CUT, SKY_DITHER, oklab, skyReach, type PixelLook } from '../splat-core/pixel.ts'

// As in engine.ts: the shader builders use TSL untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Fn, If, Loop, abs, dot, float, floor, int, max, min, mod, pow, select, smoothstep, sqrt, texture, uniform, uniformArray, uv, vec2, vec3, vec4 } = TSL

const SIDES: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
/** The four samples of an art pixel, across the top then the bottom: `QUAD` in pixel.ts. */
const QUAD: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]]
/** A sample the map of parts has nothing for: above every part's number. */
const NO_PART = 16777216

/** A stored pixel is taken for a palette color when it is this close to it in OKLab: the art keeps palette colors exactly, so this only allows for rounding. */
const SAME = 0.004

const MAX_PALETTE = MAX_PALETTE_SIZE

/**
 * Pixel mode: the scene is drawn small into a target, and one full-screen pass
 * turns it into pixel art and scales it up in whole pixels, with no smoothing.
 *
 * The pass is the GPU twin of `pixelArt` in splat-core/pixel.ts (change one,
 * change both): alpha cut, glow from bright pixels, nearest palette color in
 * OKLab with a Bayer dither, edge lines inside the scene, an outline on the
 * empty pixels that touch it, and a sky behind. It runs once per art pixel,
 * into `art`, which keeps display (sRGB) color so a palette color is stored
 * exactly; the screen then gets a plain copy, scaled up. The art of the frame
 * before is kept too: a look with `steady` reads it so a pixel between two
 * palette colors does not flip from frame to frame.
 *
 * A look with `fine` draws the scene and its map of parts at twice the art's
 * size first, and a step before the pass settles each art pixel from its four
 * samples into `small` and `ids` (`resolveFine` in pixel.ts is its twin), so
 * everything after it is the same either way.
 */
export class PixelPass {
  /** The scene, drawn small. Linear and premultiplied, as any render target. */
  readonly small = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  /** The scene's parts, drawn small (`SplatWorld.parts`): where the color changes, one part ends and another begins. Only drawn for a look with `parts`. */
  readonly ids = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  private readonly parted = uniform(0)
  /** The scene and its map of parts at twice the art's size, for a look with `fine`: what `small` and `ids` are settled from. */
  readonly fineSmall = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  /** The map of parts at twice the art's size, which four samples a pixel settles from. */
  readonly fineIds = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  private readonly settleMat = new NodeMaterial()
  private readonly settleIdsMat = new NodeMaterial()
  private readonly settleQuad: QuadMesh
  private readonly settleIdsQuad: QuadMesh
  private readonly own = uniform(0)
  /** The art of this frame and of the one before: each frame is drawn into the older of the two. */
  private readonly frames = [0, 1].map(() => new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false }))
  /** The art with its lone pixels cleaned up, for a look with `tidy`: a second pass over the art. */
  private readonly tidied = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false })
  private readonly tidyMat = new NodeMaterial()
  private readonly tidyQuad: QuadMesh
  private readonly rawTex = texture(this.frames[0].texture)
  private now = 0
  /** Whether the other target holds the frame before (not after a new size or look). */
  private kept = false
  /** Whether the last frame was drawn against the one before. */
  private used = false
  private readonly quad: QuadMesh
  private readonly material = new NodeMaterial()
  private readonly copy = new NodeMaterial()
  private readonly copyQuad: QuadMesh
  private readonly beforeTex = texture(this.frames[1].texture)
  private readonly artTex = texture(this.frames[0].texture)
  private readonly sticky = uniform(0)
  private readonly res = uniform(new Vector2(1, 1))
  /** How many art pixels fit across and down the screen: the art's size or a fraction under it, as the last one may be cut off. */
  private readonly cells = uniform(new Vector2(1, 1))
  private readonly count = uniform(0)
  private readonly dither = uniform(0)
  private readonly glow = uniform(0)
  private readonly edges = uniform(0)
  private readonly lined = uniform(0)
  private readonly line = uniform(new Vector3())
  private readonly skied = uniform(0)
  /** The sky at the top and bottom of the picture, sRGB 0–255. */
  private readonly skyTop = uniform(new Vector3())
  private readonly skyLow = uniform(new Vector3())
  /** How far down the picture the sky's blend runs (above 0, up to 1). */
  private readonly skyReach = uniform(1)
  private readonly palLab = Array.from({ length: MAX_PALETTE }, () => new Vector3())
  /** The palette as it is stored in the art: sRGB, 0–1. */
  private readonly palShown = Array.from({ length: MAX_PALETTE }, () => new Vector3())

  constructor(look: PixelLook) {
    this.material.fragmentNode = this.fragment()
    this.material.blending = NoBlending
    this.material.depthTest = false
    this.material.depthWrite = false
    this.quad = new QuadMesh(this.material)
    this.copy.fragmentNode = this.toScreen()
    this.copy.blending = NoBlending
    this.copy.depthTest = false
    this.copy.depthWrite = false
    this.copyQuad = new QuadMesh(this.copy)
    this.tidyMat.fragmentNode = this.tidy()
    this.tidyMat.blending = NoBlending
    this.tidyMat.depthTest = false
    this.tidyMat.depthWrite = false
    this.tidyQuad = new QuadMesh(this.tidyMat)
    for (const [m, parts] of [[this.settleMat, false], [this.settleIdsMat, true]] as const) {
      m.fragmentNode = this.settle(parts)
      m.blending = NoBlending
      m.depthTest = false
      m.depthWrite = false
    }
    this.settleQuad = new QuadMesh(this.settleMat)
    this.settleIdsQuad = new QuadMesh(this.settleIdsMat)
    this.setLook(look)
  }

  /** The finished art at its own size, in display color, for reading back (tests, saving) and for the screen. */
  get art() { return this.look.tidy ? this.tidied : this.frames[this.now] }
  /** The art of the frame before, when this frame was drawn against it (a look with `steady`): what `pixelArt` needs to give the same answer. */
  get before() { return this.used ? this.frames[1 - this.now] : undefined }

  /** Forgets the frame before: for when what is being drawn is swapped for something else. */
  reset() { this.kept = false }

  /** The look in use. */
  look!: PixelLook

  /** Changes the look: palette, dither, glow, lines. */
  setLook(look: PixelLook) {
    this.look = look
    this.kept = false
    const n = Math.min(MAX_PALETTE, look.palette.length)
    for (let i = 0; i < n; i++) {
      const c = look.palette[i]
      this.palLab[i].set(...oklab(c[0], c[1], c[2]))
      this.palShown[i].set(c[0] / 255, c[1] / 255, c[2] / 255)
    }
    this.count.value = n
    this.dither.value = look.dither
    this.glow.value = look.glow
    this.edges.value = look.edges ?? 0
    this.parted.value = look.parts ? 1 : 0
    this.lined.value = look.outline ? 1 : 0
    this.own.value = look.own ? 1 : 0
    this.sizeFine()
    this.skied.value = look.sky ? 1 : 0
    if (look.sky) { this.skyTop.value.set(...look.sky[0]); this.skyLow.value.set(...look.sky[1]); this.skyReach.value = skyReach(look.sky) }
    if (look.outline) this.line.value.set(look.outline[0] / 255, look.outline[1] / 255, look.outline[2] / 255)
  }

  /** The art's size in pixels. */
  setSize(width: number, height: number) {
    const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height))
    if (this.small.width === w && this.small.height === h) return
    this.small.setSize(w, h)
    this.ids.setSize(w, h)
    for (const f of this.frames) f.setSize(w, h)
    this.tidied.setSize(w, h)
    this.kept = false
    this.res.value.set(w, h)
    this.sizeFine()
  }

  /** The twice-size targets only take their room while a look uses them. */
  private sizeFine() {
    const k = this.look?.fine ? 2 : 0
    const w = Math.max(1, this.small.width * k), h = Math.max(1, this.small.height * k)
    if (this.fineSmall.width !== w || this.fineSmall.height !== h) { this.fineSmall.setSize(w, h); this.fineIds.setSize(w, h) }
  }

  /** The art's width, in art pixels. */
  get width() { return this.small.width }
  /** The art's height, in art pixels. */
  get height() { return this.small.height }

  /**
   * Draws `scene` as pixel art. With `screen` (the output's size in device
   * pixels and how many of them make one art pixel) it goes to the renderer's
   * current output; without, into `art` at one to one.
   */
  render(renderer: WebGPURenderer, scene: Object3D, camera: Camera, screen?: { width: number; height: number; scale: number }) {
    const to = renderer.getRenderTarget()
    const fine = !!this.look.fine
    renderer.setRenderTarget(fine ? this.fineSmall : this.small)
    renderer.clear()
    renderer.render(scene, camera)
    // four samples a pixel go by the parts too: which thing most of a pixel's samples show
    if (fine || this.look.parts) this.drawParts(renderer, scene, camera, fine ? this.fineIds : this.ids)
    if (fine) {
      renderer.setRenderTarget(this.small)
      this.settleQuad.render(renderer)
      renderer.setRenderTarget(this.ids)
      this.settleIdsQuad.render(renderer)
    }
    // the art, into the older target, against the newer one
    this.used = this.kept && (this.look.steady ?? 0) > 0
    this.sticky.value = this.used ? this.look.steady! : 0
    this.beforeTex.value = this.frames[this.now].texture
    this.now = 1 - this.now
    renderer.setRenderTarget(this.frames[this.now])
    this.quad.render(renderer)
    this.kept = true
    if (this.look.tidy) {
      this.rawTex.value = this.frames[this.now].texture
      renderer.setRenderTarget(this.tidied)
      this.tidyQuad.render(renderer)
    }
    renderer.setRenderTarget(to)
    if (!screen) return
    this.cells.value.set(screen.width / screen.scale, screen.height / screen.scale)
    this.artTex.value = this.art.texture
    this.copyQuad.render(renderer)
  }

  private fragment() {
    const small = this.small.texture, ids = this.ids.texture
    const { res } = this
    const palLab = uniformArray(this.palLab, 'vec3'), palShown = uniformArray(this.palShown, 'vec3')
    const bayer = uniformArray(BAYER4, 'float')
    const toSrgb = (c: unknown) => select(float(c).lessThanEqual(0.0031308), float(c).mul(12.92), pow(max(c, 0), 1 / 2.4).mul(1.055).sub(0.055))
    const toLinear = (c: unknown) => select(float(c).lessThanEqual(0.04045), float(c).div(12.92), pow(float(c).add(0.055).div(1.055), 2.4))
    const each = (v: { x: unknown; y: unknown; z: unknown }, f: (c: unknown) => unknown) => vec3(f(v.x), f(v.y), f(v.z))
    const cbrt = (x: unknown) => pow(max(x, 0), 1 / 3)
    /** OKLab of an sRGB color, 0–255 per channel: `oklab` in pixel.ts. */
    const toLab = (c: unknown) => {
      const lin = each(max(c, 0).div(255), toLinear)
      const l = cbrt(dot(lin, vec3(0.4122214708, 0.5363325363, 0.0514459929)))
      const m = cbrt(dot(lin, vec3(0.2119034982, 0.6806995451, 0.1073969566)))
      const s = cbrt(dot(lin, vec3(0.0883024619, 0.2817188376, 0.6299787005)))
      return vec3(
        l.mul(0.2104542553).add(m.mul(0.793617785)).sub(s.mul(0.0040720468)),
        l.mul(1.9779984951).sub(m.mul(2.428592205)).add(s.mul(0.4505937099)),
        l.mul(0.0259040371).add(m.mul(0.7827717662)).sub(s.mul(0.808675766)),
      )
    }

    return Fn(() => {
      // which art pixel this is, counted from the left and from the bottom of the picture
      const st = uv()
      const cell = floor(vec2(st.x, float(1).sub(st.y)).mul(res)).toVar()
      // the picture's row, from its top: what the dither and the sky go by (the CPU twin's y)
      const row = res.y.sub(1).sub(cell.y).toVar()
      /** The small render at an art pixel `dx, dy` away: straight sRGB (0–255) and whether it is solid. */
      const at = (dx: number, dy: number) => {
        const c = cell.add(vec2(dx, dy))
        const inside = c.x.greaterThanEqual(0).and(c.y.greaterThanEqual(0)).and(c.x.lessThan(res.x)).and(c.y.lessThan(res.y))
        const s = texture(small, vec2(c.x.add(0.5).div(res.x), float(1).sub(c.y.add(0.5).div(res.y))))
        const solid = inside.and(s.a.greaterThanEqual(PIXEL_CUT))
        const rgb = each(s.rgb.div(max(s.a, 1e-5)).clamp(0, 1), toSrgb).mul(255)
        return { rgb, solid }
      }

      /** The part at an art pixel `dx, dy` away, as the part map has it (alpha 0 where it has none). */
      const partAt = (dx: number, dy: number) => {
        const c = cell.add(vec2(dx, dy))
        return texture(ids, vec2(c.x.add(0.5).div(res.x), float(1).sub(c.y.add(0.5).div(res.y))))
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
      const sides = SIDES.map(([dx, dy]) => at(dx, dy))
      const beside = sides[0].solid.or(sides[1].solid).or(sides[2].solid).or(sides[3].solid)

      const out = vec4(0).toVar()
      const color = vec3(0).toVar()
      const shown = float(0).toVar()
      const spread = float(this.dither).toVar()
      If(here.solid, () => {
        color.assign(here.rgb.add(spill))
        shown.assign(1)
        // a line on the darker side of a jump in color
        If(this.edges.greaterThan(0).or(this.parted.greaterThan(0)), () => {
          const a = toLab(here.rgb).toVar()
          const jump = float(0).toVar()
          const part = partAt(0, 0).toVar()
          SIDES.forEach(([dx, dy], k) => {
            const n = sides[k]
            const b = toLab(n.rgb).toVar()
            const d = b.sub(a)
            const far = dot(d, d).greaterThan(EDGE_JUMP * EDGE_JUMP)
            jump.assign(max(jump, select(this.edges.greaterThan(0).and(n.solid).and(b.x.greaterThan(a.x)).and(far), 1, 0)))
            // and where another part begins in a color too close for that: on the lower-numbered part, so the line keeps its side as lights flicker
            If(this.parted.greaterThan(0), () => {
              const other = partAt(dx, dy).toVar()
              const gap = abs(other.rgb.sub(part.rgb))
              const differ = part.a.greaterThan(0.5).and(other.a.greaterThan(0.5)).and(max(gap.x, max(gap.y, gap.z)).greaterThan(0.5 / 255))
              const number = (p: { x: unknown; y: unknown; z: unknown }) => float(p.x).add(float(p.y).mul(256)).add(float(p.z).mul(65536))
              jump.assign(max(jump, select(n.solid.and(differ).and(far.not()).and(number(part).lessThan(number(other))), 1, 0)))
            })
          })
          color.mulAssign(float(1).sub(jump.mul(select(this.edges.greaterThan(0), this.edges, 1)).mul(EDGE_DARK)))
        })
      })
        .ElseIf(this.lined.greaterThan(0).and(beside), () => {
          out.assign(vec4(this.line, 1))
          // in the scene's own colors: a darker tone of the scene pixel beside it, the first of right, left, below, above
          If(this.own.greaterThan(0), () => {
            const [right, left, above, below] = sides
            const n = vec3(select(right.solid, right.rgb, select(left.solid, left.rgb, select(below.solid, below.rgb, above.rgb)))).toVar()
            If(this.count.greaterThan(0), () => {
              const a = toLab(n).toVar()
              const aim = a.mul(vec3(OWN_L, OWN_C, OWN_C)).toVar()
              const best = float(1e9).toVar()
              Loop(MAX_PALETTE, ({ i }: { i: unknown }) => {
                If(float(i).lessThan(this.count), () => {
                  const p = palLab.element(i)
                  const d = aim.sub(p)
                  const dd = dot(d, d)
                  If(p.x.lessThan(a.x.mul(OWN_UNDER)).and(dd.lessThan(best)), () => { best.assign(dd); out.assign(vec4(palShown.element(i), 1)) })
                })
              })
            }).Else(() => { out.assign(vec4(n.mul((1 - EDGE_DARK) / 255), 1)) })
          })
        })
        .ElseIf(this.skied.greaterThan(0), () => {
          const t = min(row.add(0.5).div(res.y).div(this.skyReach), 1).toVar()
          color.assign(this.skyTop.add(this.skyLow.sub(this.skyTop).mul(t)).add(spill))
          // a sky that stops short eases its dither away over the last quarter of the blend, so it ends flat with no seam
          spread.assign(max(this.dither, select(this.skyReach.lessThan(1), min(float(1).sub(t).mul(4), 1), 1).mul(SKY_DITHER)))
          shown.assign(1)
        })
        .ElseIf(max(spill.x, max(spill.y, spill.z)).greaterThan(GLOW_SHOWS), () => { color.assign(spill); shown.assign(1) })

      If(shown.greaterThan(0), () => {
        color.assign(min(color, 255))
        If(this.count.greaterThan(0), () => {
          const off = bayer.element(int(mod(row, 4).mul(4).add(mod(cell.x, 4)))).div(16).sub(0.5).mul(spread.mul(48))
          const lab = toLab(color.add(off)).toVar()
          const best = float(1e9).toVar()
          const pick = vec3(0).toVar()
          // steady pixels: the palette color this pixel had the frame before, and how far that is from what it wants now
          const was = this.beforeTex.sample(vec2(cell.x.add(0.5).div(res.x), float(1).sub(cell.y.add(0.5).div(res.y))))
          const wasLab = toLab(was.rgb.mul(255)).toVar()
          const wasOff = float(1e9).toVar()
          const wasFar = float(1e9).toVar()
          const wasPick = vec3(0).toVar()
          Loop(MAX_PALETTE, ({ i }: { i: unknown }) => {
            If(float(i).lessThan(this.count), () => {
              const d = lab.sub(palLab.element(i))
              const dd = dot(d, d)
              If(dd.lessThan(best), () => { best.assign(dd); pick.assign(palShown.element(i)) })
              const w = wasLab.sub(palLab.element(i))
              const ww = dot(w, w)
              If(ww.lessThan(wasOff), () => { wasOff.assign(ww); wasFar.assign(dd); wasPick.assign(palShown.element(i)) })
            })
          })
          If(this.sticky.greaterThan(0).and(here.solid).and(was.a.greaterThan(0.5)).and(wasOff.lessThan(SAME * SAME)).and(sqrt(wasFar).lessThanEqual(sqrt(best).add(this.sticky))), () => { pick.assign(wasPick) })
          out.assign(vec4(pick, 1))
        }).Else(() => {
          out.assign(vec4(color.div(255), 1))
        })
      })
      return out
    })()
  }

  /**
   * Four samples a pixel: settles each art pixel from its 2×2 samples of the twice-size scene and map of parts, writing
   * the scene (`parts` false) or the map (true) at the art's size. `resolveFine` in pixel.ts is its CPU twin (change one,
   * change both): scene when two or more samples are solid, the part most of them show (the lower number on a tie), and
   * of that part's samples the one nearest their average, copied whole.
   */
  private settle(parts: boolean) {
    const fine = this.fineSmall.texture, ids = this.fineIds.texture
    const { res } = this
    const toSrgb = (c: unknown) => select(float(c).lessThanEqual(0.0031308), float(c).mul(12.92), pow(max(c, 0), 1 / 2.4).mul(1.055).sub(0.055))
    return Fn(() => {
      const st = uv()
      const cell = floor(vec2(st.x, float(1).sub(st.y)).mul(res)).toVar()
      const row = res.y.sub(1).sub(cell.y).toVar()
      const s = QUAD.map(([sx, sy]) => {
        const at = vec2(cell.x.mul(2).add(sx + 0.5).div(res.x.mul(2)), row.mul(2).add(sy + 0.5).div(res.y.mul(2)))
        const c = vec4(texture(fine, at)).toVar()
        const p = vec4(texture(ids, at)).toVar()
        const solid = float(select(c.a.greaterThanEqual(PIXEL_CUT), 1, 0)).toVar()
        const byte = (v: unknown) => floor(float(v).mul(255).add(0.5))
        const number = float(select(p.a.greaterThanEqual(0.5), byte(p.x).add(byte(p.y).mul(256)).add(byte(p.z).mul(65536)), NO_PART)).toVar()
        const straight = c.rgb.div(max(c.a, 1e-5)).clamp(0, 1)
        // whole levels, as a frame read back holds them, so the twin breaks ties the same way
        const rgb = floor(vec3(toSrgb(straight.x), toSrgb(straight.y), toSrgb(straight.z)).mul(255).add(0.5)).toVar()
        return { c, p, solid, number, rgb }
      })
      const same = (a: unknown, b: unknown) => abs(float(a).sub(b)).lessThan(0.5)
      const count = s[0].solid.add(s[1].solid).add(s[2].solid).add(s[3].solid)
      const most = float(0).toVar(), win = float(NO_PART).toVar()
      for (const k of s) {
        const n = float(0).toVar()
        for (const m of s) n.addAssign(select(same(m.number, k.number), m.solid, 0))
        If(k.solid.greaterThan(0.5).and(n.greaterThan(most).or(n.equal(most).and(k.number.lessThan(win)))), () => { most.assign(n); win.assign(k.number) })
      }
      const mean = vec3(0).toVar()
      const mine = s.map((k) => float(select(k.solid.greaterThan(0.5).and(same(k.number, win)), 1, 0)).toVar())
      s.forEach((k, i) => { mean.addAssign(k.rgb.mul(mine[i])) })
      mean.divAssign(max(most, 1))
      const best = float(1e12).toVar()
      const out = vec4(0).toVar()
      s.forEach((k, i) => {
        const d = k.rgb.sub(mean)
        const dd = dot(d, d)
        If(mine[i].greaterThan(0.5).and(dd.lessThan(best)), () => { best.assign(dd); out.assign(parts ? k.p : k.c) })
      })
      const shown = parts ? count.greaterThanEqual(2).and(win.lessThan(NO_PART)) : count.greaterThanEqual(2)
      return select(shown, out, vec4(0))
    })()
  }

  /** The same view as a map of parts: only the blobs, as they were just drawn (nothing is moved or sorted again). */
  private drawParts(renderer: WebGPURenderer, scene: Object3D, camera: Camera, into: RenderTarget) {
    type World = Object3D & { isSplatWorld?: boolean; parts: boolean; hold: boolean }
    const worlds: { w: World; hold: boolean }[] = []
    const hidden: Object3D[] = []
    scene.traverse((o) => {
      const w = o as World
      if (w.isSplatWorld) { worlds.push({ w, hold: w.hold }); w.parts = true; w.hold = true }
      else {
        const d = o as { isMesh?: boolean; isLine?: boolean; isPoints?: boolean }
        if ((d.isMesh || d.isLine || d.isPoints) && o.visible) { o.visible = false; hidden.push(o) }
      }
    })
    try {
      renderer.setRenderTarget(into)
      renderer.clear()
      renderer.render(scene, camera)
    } finally {
      for (const { w, hold } of worlds) { w.parts = false; w.hold = hold }
      for (const o of hidden) o.visible = true
    }
  }

  /** Lone-pixel cleanup over the art just drawn: `tidyLone` in pixel.ts is its CPU twin (change one, change both). */
  private tidy() {
    const small = this.small.texture, ids = this.ids.texture
    const { res } = this
    const N8: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
    return Fn(() => {
      const st = uv()
      const cell = floor(vec2(st.x, float(1).sub(st.y)).mul(res)).toVar()
      const where = (dx: number, dy: number) => { const c = cell.add(vec2(dx, dy)); return { c, st: vec2(c.x.add(0.5).div(res.x), float(1).sub(c.y.add(0.5).div(res.y))) } }
      const read = (dx: number, dy: number) => {
        const { c, st: at } = where(dx, dy)
        const inside = c.x.greaterThanEqual(0).and(c.y.greaterThanEqual(0)).and(c.x.lessThan(res.x)).and(c.y.lessThan(res.y))
        return { rgb: this.rawTex.sample(at).rgb, solid: inside.and(texture(small, at).a.greaterThanEqual(PIXEL_CUT)), part: texture(ids, at) }
      }
      const same = (a: unknown, b: unknown) => { const d = vec3(a).sub(b); return dot(d, d).lessThan(1e-5) }
      const samePart = (a: { x: unknown; y: unknown; z: unknown; w: unknown }, b: { x: unknown; y: unknown; z: unknown; w: unknown }) => {
        const d = vec3(a.x, a.y, a.z).sub(vec3(b.x, b.y, b.z))
        return float(a.w).greaterThanEqual(0.5).and(float(b.w).greaterThanEqual(0.5)).and(dot(d, d).lessThan(1e-6))
      }
      const here = read(0, 0)
      const out = vec4(here.rgb, this.rawTex.sample(where(0, 0).st).a).toVar()
      If(here.solid, () => {
        const ns = N8.map(([dx, dy]) => read(dx, dy))
        const mine = float(0).toVar(), count = float(0).toVar(), ofPart = float(0).toVar()
        for (const n of ns) {
          If(n.solid, () => {
            count.addAssign(1)
            If(same(n.rgb, here.rgb), () => { mine.assign(1) })
            If(samePart(n.part, here.part), () => { ofPart.addAssign(1) })
          })
        }
        const most = float(0).toVar(), best = vec3(0).toVar()
        for (const a of ns) {
          const n = float(0).toVar()
          for (const b of ns) If(a.solid.and(b.solid).and(same(a.rgb, b.rgb)), () => { n.addAssign(1) })
          If(n.greaterThan(most), () => { most.assign(n); best.assign(a.rgb) })
        }
        If(mine.lessThan(0.5).and(count.greaterThanEqual(6)).and(most.greaterThanEqual(6)).and(this.parted.lessThan(0.5).or(ofPart.greaterThanEqual(4))), () => { out.assign(vec4(best, 1)) })
      })
      return out
    })()
  }

  /** The art onto the output: every screen pixel inside one art pixel takes that pixel's color. */
  private toScreen() {
    const toLinear = (c: unknown) => select(float(c).lessThanEqual(0.04045), float(c).div(12.92), pow(float(c).add(0.055).div(1.055), 2.4))
    return Fn(() => {
      const st = uv()
      const cell = floor(vec2(st.x, float(1).sub(st.y)).mul(this.cells))
      const c = this.artTex.sample(vec2(cell.x.add(0.5).div(this.res.x), float(1).sub(cell.y.add(0.5).div(this.res.y))))
      return vec4(toLinear(c.x), toLinear(c.y), toLinear(c.z), c.a)
    })()
  }

  /** Frees its render targets. */
  dispose() {
    this.small.dispose()
    this.ids.dispose()
    this.fineSmall.dispose()
    this.fineIds.dispose()
    this.settleMat.dispose()
    this.settleIdsMat.dispose()
    for (const f of this.frames) f.dispose()
    this.tidied.dispose()
    this.tidyMat.dispose()
    this.material.dispose()
    this.copy.dispose()
  }
}
