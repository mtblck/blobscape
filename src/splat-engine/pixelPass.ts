import { Matrix4, NearestFilter, NoBlending, NodeMaterial, QuadMesh, RenderTarget, Vector2, Vector3, type Camera, type Object3D, type WebGPURenderer } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import { BLOCK_WIDE, MIX_A, MIX_B, SALT, STRIPS, TURNED, type GlitchState } from '../splat-core/glitch.ts'
import { BAYER4, CALM_MOST, SHINE_FROM, SHINE_SMOOTH, STEP_UP, rimStep, SPECK_KEEP, SPECK_MOST, HALO_GRAY, HALO_HUE, LINE_LIFT, LINE_LUMA, EDGE_DARK, snapShift, EDGE_JUMP, GLOW_FROM, GLOW_SHOWS, GLOW_TAPS, HALO_R, HALO_SHARE, HEAT_R, HEAT_UP, HEAT_WAVE, MAX_PALETTE_SIZE, OWN_C, OWN_L, OWN_UNDER, PIXEL_CUT, SELOUT_FROM, SELOUT_L, SKY_DITHER, cycleTurns, oklab, skyReach, type PixelLook } from '../splat-core/pixel.ts'

// As in engine.ts: the shader builders use TSL untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Fn, If, Loop, abs, dot, float, floor, int, length, max, min, mod, pow, select, smoothstep, sqrt, texture, uint, uniform, uniformArray, uv, vec2, vec3, vec4 } = TSL

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
  /** Each art pixel's step of the dither pattern, from the blob there (red, a byte), for a look with `surface`. */
  readonly ranks = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  private readonly parted = uniform(0)
  /** Color lines only where another part begins (`PixelLook.across`), and only while a map of parts is drawn. */
  private readonly across = uniform(0)
  private readonly solid = uniform(0)
  /** `PixelLook.calm`, and whether the map of parts is drawn for it to go by. */
  private readonly calmed = uniform(0)
  private readonly calmParts = uniform(0)
  private readonly flat = uniform(0)
  private readonly rimOn = uniform(0)
  private readonly rimX = uniform(0)
  private readonly rimY = uniform(0)
  private readonly shine = uniform(0)
  /** The scene and its map of parts at twice the art's size, for a look with `fine`: what `small` and `ids` are settled from. */
  readonly fineSmall = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  /** The map of parts at twice the art's size, which four samples a pixel settles from. */
  readonly fineIds = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  /** With `PixelLook.solid`: the picture at twice the art's size with every blob a hard disc in its own color, as the map of parts cuts it. */
  readonly fineSolid = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
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
  private readonly surface = uniform(0)
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
  /** Tech glitch over the finished art (splat-core/glitch.ts), set each frame by `setGlitch`: all whole numbers. */
  private readonly glitch = { on: uniform(0), key: uniform(0), jitter: uniform(0), band: uniform(1), rows: uniform(0), split: uniform(0), block: uniform(1), blocks: uniform(0) }
  /** Glow in bands (0 for the soft spill), heat haze's most shift (0 for none) and this frame's step of its waves, selout. */
  private readonly bands = uniform(0)
  private readonly heatPx = uniform(0)
  private readonly heatTick = uniform(0)
  private readonly selout = uniform(0)
  /** Color cycling at this frame's time (`cycleTurns`): the palette index each is drawn as, and whether it cycles. */
  private readonly turns = Array.from({ length: MAX_PALETTE }, (_, i) => i)
  private readonly members = Array.from({ length: MAX_PALETTE }, () => 0)
  private readonly turnU = uniformArray(this.turns, 'float')
  private readonly memberU = uniformArray(this.members, 'float')
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
  get art() { return this.look.tidy || this.look.calm ? this.tidied : this.frames[this.now] }
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
    this.surface.value = look.surface ? 1 : 0
    this.glow.value = look.glow
    this.edges.value = look.edges ?? 0
    this.parted.value = look.parts ? 1 : 0
    this.across.value = look.across && (look.parts || look.fine) ? 1 : 0
    this.solid.value = look.solid && look.fine ? 1 : 0
    this.calmed.value = look.calm ? 1 : 0
    this.flat.value = look.flat ? 1 : 0
    const rim = look.rim ? rimStep(look.rim) : undefined
    this.rimOn.value = rim ? 1 : 0
    this.rimX.value = rim?.[0] ?? 0
    this.rimY.value = rim?.[1] ?? 0
    this.shine.value = look.shine ? 1 : 0
    this.calmParts.value = look.parts || look.fine ? 1 : 0
    this.lined.value = look.outline ? 1 : 0
    this.own.value = look.own ? 1 : 0
    this.sizeFine()
    this.skied.value = look.sky ? 1 : 0
    if (look.sky) { this.skyTop.value.set(...look.sky[0]); this.skyLow.value.set(...look.sky[1]); this.skyReach.value = skyReach(look.sky) }
    if (look.outline) this.line.value.set(look.outline[0] / 255, look.outline[1] / 255, look.outline[2] / 255)
    this.bands.value = Math.min(2, Math.max(0, Math.round(look.bands ?? 0)))
    this.heatPx.value = look.heat && look.heat.pixels > 0 ? look.heat.pixels : 0
    this.selout.value = look.selout ? 1 : 0
    this.setTime(this.time)
  }

  private time = 0
  /** The time the last frame was drawn for (`setTime`): what `pixelArt` needs as its `time`. */
  get drawnAt() { return this.time }

  /** The scene's time for this frame: what heat haze's waves and color cycling step by (`pixelArt`'s `time`). */
  setTime(t: number) {
    this.time = t
    const look = this.look
    this.heatTick.value = look.heat ? Math.floor(t * look.heat.pace + 1e-6) : 0
    const { turn, member } = cycleTurns(look, t)
    for (let i = 0; i < MAX_PALETTE; i++) { this.turns[i] = i < turn.length ? turn[i] : i; this.members[i] = i < member.length ? member[i] : 0 }
    this.turnU.array = this.turns
    this.memberU.array = this.members
  }

  /**
   * This frame's glitch, laid on as the art goes to the screen (the art itself, `art`, stays clean: `glitchArt` lays
   * the same on a frame read back). Left out, none.
   */
  setGlitch(g?: GlitchState) {
    const u = this.glitch
    u.on.value = g?.on ? 1 : 0
    if (!g?.on) return
    u.key.value = g.key; u.jitter.value = g.jitter; u.band.value = g.band; u.rows.value = g.rows
    u.split.value = g.split; u.block.value = g.block; u.blocks.value = g.blocks
  }

  /** The art's size in pixels. */
  setSize(width: number, height: number) {
    const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height))
    if (this.small.width === w && this.small.height === h) return
    this.small.setSize(w, h)
    this.ids.setSize(w, h)
    this.ranks.setSize(w, h)
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
    const k2 = this.look?.fine && this.look.solid ? 2 : 0, w2 = Math.max(1, this.small.width * k2), h2 = Math.max(1, this.small.height * k2)
    if (this.fineSolid.width !== w2 || this.fineSolid.height !== h2) this.fineSolid.setSize(w2, h2)
  }

  /** The art's width, in art pixels. */
  get width() { return this.small.width }
  /** The art's height, in art pixels. */
  get height() { return this.small.height }

  /**
   * Draws the scene into the small picture (the renderer's current target) in place of a plain draw: how the stage
   * shades it a pixel at a time (cel shading's light). It must leave the blobs as last placed for the maps that follow.
   * @internal
   */
  drawScene?: (renderer: WebGPURenderer, scene: Object3D, camera: Camera) => void

  /**
   * Draws `scene` as pixel art. With `screen` (the output's size in device
   * pixels and how many of them make one art pixel) it goes to the renderer's
   * current output; without, into `art` at one to one.
   */
  render(renderer: WebGPURenderer, scene: Object3D, camera: Camera, screen?: { width: number; height: number; scale: number }) {
    const undo = this.look.snap ? this.snapCamera(camera) : undefined
    try { this.draw(renderer, scene, camera, screen) } finally { undo?.() }
  }

  private readonly kept4 = [new Matrix4(), new Matrix4()]
  private readonly origin = new Vector3()

  /**
   * `snap`: shifts the camera's picture by under an art pixel so the world's origin lands on the art's grid, and gives
   * back what puts it as it was. A shift of the projection's third column moves every point on the screen alike.
   */
  private snapCamera(camera: Camera) {
    camera.updateMatrixWorld()
    const p = this.origin.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix)
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return undefined
    const dx = snapShift(p.x, this.small.width), dy = snapShift(p.y, this.small.height)
    const [proj, inv] = this.kept4
    proj.copy(camera.projectionMatrix)
    inv.copy(camera.projectionMatrixInverse)
    // ndc = clip / −z, and the third column adds its value times z to clip: so taking dx away moves ndc on by dx
    camera.projectionMatrix.elements[8] -= dx
    camera.projectionMatrix.elements[9] -= dy
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
    return () => { camera.projectionMatrix.copy(proj); camera.projectionMatrixInverse.copy(inv) }
  }

  private draw(renderer: WebGPURenderer, scene: Object3D, camera: Camera, screen?: { width: number; height: number; scale: number }) {
    const to = renderer.getRenderTarget()
    const fine = !!this.look.fine
    renderer.setRenderTarget(fine ? this.fineSmall : this.small)
    renderer.clear()
    if (this.drawScene) this.drawScene(renderer, scene, camera)
    else renderer.render(scene, camera)
    // four samples a pixel go by the parts too: which thing most of a pixel's samples show
    if (fine || this.look.parts) this.drawParts(renderer, scene, camera, fine ? this.fineIds : this.ids)
    // dither that stays on things: each pixel's step from the blob there, at the art's own size
    if (this.look.surface && this.look.dither > 0) this.drawParts(renderer, scene, camera, this.ranks, 'ranks')
    // hard discs in their own colors, for the samples where one thing meets another (`PixelLook.solid`)
    if (fine && this.look.solid) this.drawParts(renderer, scene, camera, this.fineSolid, 'solid')
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
    if (this.look.tidy || this.look.calm) {
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
    const small = this.small.texture, ids = this.ids.texture, ranks = this.ranks.texture
    const { res } = this
    const palLab = uniformArray(this.palLab, 'vec3'), palShown = uniformArray(this.palShown, 'vec3')
    const bayer = uniformArray(BAYER4, 'float')
    const heatWave = uniformArray(HEAT_WAVE, 'float')
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
      const home = floor(vec2(st.x, float(1).sub(st.y)).mul(res)).toVar()
      // the picture's row, from its top: what the dither and the sky go by (the CPU twin's y)
      const row = res.y.sub(1).sub(home.y).toVar()
      /** The small render at art pixel `c`: straight sRGB (0–255) and whether it is solid. */
      const sample = (c: unknown) => {
        const cc = vec2(c)
        const inside = cc.x.greaterThanEqual(0).and(cc.y.greaterThanEqual(0)).and(cc.x.lessThan(res.x)).and(cc.y.lessThan(res.y))
        const s = texture(small, vec2(cc.x.add(0.5).div(res.x), float(1).sub(cc.y.add(0.5).div(res.y))))
        const solid = inside.and(s.a.greaterThanEqual(PIXEL_CUT))
        const rgb = each(s.rgb.div(max(s.a, 1e-5)).clamp(0, 1), toSrgb).mul(255)
        return { rgb, solid }
      }
      /** How bright a sample glows (`brightOf`), 0 where it is empty. */
      const brightOf = (t: { rgb: { x: unknown; y: unknown; z: unknown }; solid: unknown }) => select(t.solid, smoothstep(GLOW_FROM, 1, max(t.rgb.x, max(t.rgb.y, t.rgb.z)).div(255)), 0)
      // heat haze: above something glowing (and not glowing itself), this pixel is drawn from one beside it
      const cell = vec2(home).toVar()
      If(this.heatPx.greaterThan(0), () => {
        If(brightOf(sample(home)).lessThanEqual(0.5), () => {
          const near = float(0).toVar()
          Loop({ start: int(HEAT_UP - HEAT_R), end: int(HEAT_UP + HEAT_R), type: 'int', condition: '<=', name: 'hb' }, { start: int(-HEAT_R), end: int(HEAT_R), type: 'int', condition: '<=', name: 'ha' }, ({ hb, ha }: { hb: unknown; ha: unknown }) => {
            // `hb` rows below in the picture, which is down the cells' y
            near.assign(max(near, select(brightOf(sample(home.add(vec2(float(ha), float(hb).negate())))).greaterThan(0.5), 1, 0)))
          })
          If(near.greaterThan(0.5), () => {
            const k = int(mod(row.mul(2).add(home.x).add(this.heatTick.mul(3)), 16))
            cell.x.assign(home.x.add(heatWave.element(k).mul(this.heatPx)).clamp(0, res.x.sub(1)))
          })
        })
      })
      /** The small render at an art pixel `dx, dy` away: straight sRGB (0–255) and whether it is solid. */
      const at = (dx: number, dy: number) => sample(cell.add(vec2(dx, dy)))

      /** The part at an art pixel `dx, dy` away, as the part map has it (alpha 0 where it has none). */
      const partAt = (dx: number, dy: number) => {
        const c = cell.add(vec2(dx, dy))
        return texture(ids, vec2(c.x.add(0.5).div(res.x), float(1).sub(c.y.add(0.5).div(res.y))))
      }
      const here = at(0, 0)
      const spill = vec3(0).toVar()
      If(this.glow.greaterThan(0).and(this.bands.greaterThan(0)), () => {
        // banded glow: the brightest light near, by its strength over distance, lends a flat share by its ring
        const best = float(0).toVar(), bd = float(0).toVar(), bk = float(0).toVar(), bc = vec3(0).toVar()
        Loop({ start: int(-HALO_R), end: int(HALO_R), type: 'int', condition: '<=', name: 'gy' }, { start: int(-HALO_R), end: int(HALO_R), type: 'int', condition: '<=', name: 'gx' }, ({ gy, gx }: { gy: unknown; gx: unknown }) => {
          const d = float(max(abs(gx), abs(gy))).toVar()
          If(d.greaterThan(0), () => {
            // `gy` counts down the picture, as the CPU twin's rows do
            const t = sample(cell.add(vec2(float(gx), float(gy).negate())))
            const k = float(brightOf(t)).toVar()
            const score = k.div(d.add(1))
            If(score.greaterThan(best), () => { best.assign(score); bd.assign(d); bk.assign(k); bc.assign(t.rgb) })
          })
        })
        If(best.greaterThan(0), () => {
          const band = min(this.bands.sub(1), floor(bd.sub(1).mul(this.bands).div(HALO_R)))
          spill.assign(bc.mul(bk.mul(this.bands.sub(band).sub(0.5).div(this.bands)).mul(this.glow).mul(HALO_SHARE)))
        })
      }).ElseIf(this.glow.greaterThan(0), () => {
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
        // flat surfaces: dither only where a glow spills onto the scene
        If(this.flat.greaterThan(0.5).and(max(spill.x, max(spill.y, spill.z)).lessThanEqual(GLOW_SHOWS)), () => { spread.assign(0) })
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
            // across: a jump in color within one thing is its paint, not an edge, and takes no line
            const beyond = partAt(dx, dy).toVar()
            const apart = this.across.lessThan(0.5).or(part.a.greaterThan(0.5).and(beyond.a.greaterThan(0.5)).and(max(abs(beyond.rgb.sub(part.rgb)).x, max(abs(beyond.rgb.sub(part.rgb)).y, abs(beyond.rgb.sub(part.rgb)).z)).greaterThan(0.5 / 255)))
            jump.assign(max(jump, select(this.edges.greaterThan(0).and(n.solid).and(b.x.greaterThan(a.x)).and(far).and(apart), 1, 0)))
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
          // the scene pixel beside it, the first of right, left, below, above
          const [right, left, above, below] = sides
          const n = vec3(select(right.solid, right.rgb, select(left.solid, left.rgb, select(below.solid, below.rgb, above.rgb)))).toVar()
          const lit = toLab(n).toVar()
          // selout: on a lit side, a shade just under the thing's own color
          If(this.selout.greaterThan(0).and(lit.x.greaterThanEqual(SELOUT_FROM)), () => {
            If(this.count.greaterThan(0), () => {
              const aim = lit.mul(vec3(SELOUT_L, 1, 1)).toVar()
              const best = float(1e9).toVar()
              Loop(MAX_PALETTE, ({ i }: { i: unknown }) => {
                If(float(i).lessThan(this.count), () => {
                  const d = aim.sub(palLab.element(i))
                  const dd = dot(d, d)
                  If(dd.lessThan(best), () => { best.assign(dd); out.assign(vec4(palShown.element(i), 1)) })
                })
              })
            }).Else(() => { out.assign(vec4(n.mul(SELOUT_L / 255), 1)) })
          })
          // in the scene's own colors: a darker tone of the scene pixel beside it
          .ElseIf(this.own.greaterThan(0), () => {
            If(this.count.greaterThan(0), () => {
              const a = lit
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
          // the step of the pattern: the screen's, or (surface dither) the blob's own where the scene is
          const step = float(bayer.element(int(mod(row, 4).mul(4).add(mod(home.x, 4))))).toVar()
          If(this.surface.greaterThan(0).and(here.solid), () => {
            const r = texture(ranks, vec2(cell.x.add(0.5).div(res.x), float(1).sub(cell.y.add(0.5).div(res.y))))
            If(r.a.greaterThanEqual(0.5), () => { step.assign(floor(r.r.mul(255).add(0.5))) })
          })
          const off = step.div(16).sub(0.5).mul(spread.mul(48))
          const lab = toLab(color.add(off)).toVar()
          const best = float(1e9).toVar()
          const pick = float(0).toVar()
          // steady pixels: the palette color this pixel had the frame before, and how far that is from what it wants now
          const was = this.beforeTex.sample(vec2(home.x.add(0.5).div(res.x), float(1).sub(home.y.add(0.5).div(res.y))))
          const wasLab = toLab(was.rgb.mul(255)).toVar()
          const wasOff = float(1e9).toVar()
          const wasFar = float(1e9).toVar()
          const wasPick = float(0).toVar()
          // flat: a pixel a glow lights snaps to a color of its own hue, the light's or a gray (`keptNearest` in pixel.ts, the twin)
          const halo = this.flat.greaterThan(0.5).and(here.solid).and(max(spill.x, max(spill.y, spill.z)).greaterThan(GLOW_SHOWS))
          const ownLab = toLab(here.rgb).toVar(), lightLab = toLab(spill).toVar()
          const keptBest = float(1e9).toVar(), keptPick = float(-1).toVar()
          const nearHue = (p: { y: unknown; z: unknown }, c: { y: unknown; z: unknown }) => {
            const pc = length(vec2(p.y, p.z)), cc = length(vec2(c.y, c.z))
            return cc.greaterThanEqual(HALO_GRAY).and(dot(vec2(p.y, p.z), vec2(c.y, c.z)).greaterThanEqual(pc.mul(cc).mul(HALO_HUE)))
          }
          Loop(MAX_PALETTE, ({ i }: { i: unknown }) => {
            If(float(i).lessThan(this.count), () => {
              const pl = palLab.element(i)
              const d = lab.sub(pl)
              const dd = dot(d, d)
              If(dd.lessThan(best), () => { best.assign(dd); pick.assign(float(i)) })
              const allowed = length(vec2(pl.y, pl.z)).lessThan(HALO_GRAY).or(nearHue(pl, ownLab)).or(nearHue(pl, lightLab))
              If(halo.and(allowed).and(dd.lessThan(keptBest)), () => { keptBest.assign(dd); keptPick.assign(float(i)) })
              const w = wasLab.sub(pl)
              const ww = dot(w, w)
              If(ww.lessThan(wasOff), () => { wasOff.assign(ww); wasFar.assign(dd); wasPick.assign(float(i)) })
            })
          })
          If(keptPick.greaterThanEqual(0), () => { pick.assign(keptPick); best.assign(keptBest) })
          // deliberate light: a rim a step lighter on the side toward the light, a highlight on the peak of a lit form
          // (`rimStep`, `peakAt` and `lighterStep` in pixel.ts are the twins; this pass counts rows up, so the rim's y turns over)
          If(here.solid.and(this.rimOn.greaterThan(0.5).or(this.shine.greaterThan(0.5))).and(max(spill.x, max(spill.y, spill.z)).lessThanEqual(GLOW_SHOWS)), () => {
            const up = float(0).toVar()
            If(this.rimOn.greaterThan(0.5), () => {
              const toward = sample(cell.add(vec2(this.rimX, this.rimY.negate()))), away = sample(cell.sub(vec2(this.rimX, this.rimY.negate())))
              If(toward.solid.not().and(away.solid), () => { up.assign(1) })
            })
            If(up.lessThan(0.5).and(this.shine.greaterThan(0.5)), () => {
              const luma = (c: unknown) => dot(vec3(c), vec3(...LINE_LUMA)).div(255)
              const y0 = luma(here.rgb).toVar()
              const inside = cell.x.greaterThanEqual(2).and(cell.y.greaterThanEqual(2)).and(cell.x.lessThan(res.x.sub(2))).and(cell.y.lessThan(res.y.sub(2)))
              const ok = float(select(inside, 1, 0)).toVar(), sum = float(0).toVar(), lo = float(1e9).toVar(), hi = float(-1e9).toVar()
              const mine = partAt(0, 0)
              for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
                if (!dx && !dy) continue
                const t = at(dx, dy), v = luma(t.rgb)
                const other = partAt(dx, dy)
                const gap = abs(other.rgb.sub(mine.rgb))
                const apart = this.parted.greaterThan(0.5).and(other.a.lessThan(0.5).or(max(gap.x, max(gap.y, gap.z)).greaterThan(0.5 / 255)))
                If(t.solid.not().or(apart).or(v.greaterThanEqual(y0)), () => { ok.assign(0) })
                sum.addAssign(v); lo.assign(min(lo, v)); hi.assign(max(hi, v))
              }
              If(ok.greaterThan(0.5).and(y0.sub(sum.div(24)).greaterThanEqual(SHINE_FROM)).and(hi.sub(lo).lessThanEqual(SHINE_SMOOTH)), () => { up.assign(1) })
            })
            If(up.greaterThan(0.5), () => {
              const me = palLab.element(int(pick)).toVar()
              const cc = length(vec2(me.y, me.z))
              const stepBest = float(1e9).toVar(), stepPick = float(-1).toVar()
              Loop(MAX_PALETTE, ({ i }: { i: unknown }) => {
                If(float(i).lessThan(this.count), () => {
                  const pl = palLab.element(i)
                  const pc = length(vec2(pl.y, pl.z))
                  const hued = select(cc.greaterThanEqual(HALO_GRAY), pc.greaterThanEqual(HALO_GRAY).and(dot(vec2(pl.y, pl.z), vec2(me.y, me.z)).greaterThanEqual(pc.mul(cc).mul(HALO_HUE))), pc.lessThan(HALO_GRAY * 2))
                  const d = vec3(me.x.add(STEP_UP), me.y, me.z).sub(pl)
                  const dd = dot(d, d)
                  If(pl.x.greaterThanEqual(me.x.add(0.02)).and(hued).and(dd.lessThan(stepBest)), () => { stepBest.assign(dd); stepPick.assign(float(i)) })
                })
              })
              If(stepPick.greaterThanEqual(0), () => { pick.assign(stepPick); const d = lab.sub(palLab.element(int(stepPick))); best.assign(dot(d, d)) })
            })
          })
          // colors that cycle are left to move
          const moves = this.memberU.element(int(pick)).add(this.memberU.element(int(wasPick)))
          If(this.sticky.greaterThan(0).and(here.solid).and(was.a.greaterThan(0.5)).and(wasOff.lessThan(SAME * SAME)).and(moves.lessThan(0.5)).and(sqrt(wasFar).lessThanEqual(sqrt(best).add(this.sticky))), () => { pick.assign(wasPick) })
          // color cycling, on the scene's own pixels
          const shownAs = select(here.solid, this.turnU.element(int(pick)), pick)
          out.assign(vec4(palShown.element(int(shownAs)), 1))
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
    const fine = this.fineSmall.texture, ids = this.fineIds.texture, hard = this.fineSolid.texture
    const { res } = this
    const toSrgb = (c: unknown) => select(float(c).lessThanEqual(0.0031308), float(c).mul(12.92), pow(max(c, 0), 1 / 2.4).mul(1.055).sub(0.055))
    return Fn(() => {
      const st = uv()
      const cell = floor(vec2(st.x, float(1).sub(st.y)).mul(res)).toVar()
      const row = res.y.sub(1).sub(cell.y).toVar()
      const byteOf = (v: unknown) => floor(float(v).mul(255).add(0.5))
      const numberAt = (fx: unknown, fy: unknown) => {
        const p = vec4(texture(ids, vec2(float(fx).add(0.5).div(res.x.mul(2)), float(fy).add(0.5).div(res.y.mul(2)))))
        return float(select(p.a.greaterThanEqual(0.5), byteOf(p.x).add(byteOf(p.y).mul(256)).add(byteOf(p.z).mul(65536)), NO_PART))
      }
      // where one thing meets another within a sample of this pixel's (`PixelLook.solid`): its samples come from the
      // hard discs, so none shows a little of what is behind a fading edge. `seamAt` in pixel.ts is the twin
      const edge = float(0).toVar()
      If(this.solid.greaterThan(0.5), () => {
        const first = numberAt(cell.x.mul(2), row.mul(2)).toVar()
        for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
          const fx = cell.x.mul(2).add(dx).clamp(0, res.x.mul(2).sub(1)), fy = row.mul(2).add(dy).clamp(0, res.y.mul(2).sub(1))
          If(abs(numberAt(fx, fy).sub(first)).greaterThan(0.5), () => { edge.assign(1) })
        }
      })
      const s = QUAD.map(([sx, sy]) => {
        const at = vec2(cell.x.mul(2).add(sx + 0.5).div(res.x.mul(2)), row.mul(2).add(sy + 0.5).div(res.y.mul(2)))
        const soft = vec4(texture(fine, at)).toVar(), firm = vec4(texture(hard, at)).toVar()
        const glows = (t: { x: unknown; y: unknown; z: unknown; w: unknown }) => toSrgb(max(float(t.x), max(float(t.y), float(t.z))).div(max(float(t.w), 1e-5)).clamp(0, 1)).greaterThanEqual(GLOW_FROM)
        // only where both cover the sample and neither gives off light: the cover stays the soft picture's, and light stays soft
        const take = edge.greaterThan(0.5).and(soft.a.greaterThanEqual(PIXEL_CUT)).and(firm.a.greaterThanEqual(PIXEL_CUT)).and(glows(soft).not()).and(glows(firm).not())
        const c = vec4(select(take, firm, soft)).toVar()
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
  private drawParts(renderer: WebGPURenderer, scene: Object3D, camera: Camera, into: RenderTarget, map: 'parts' | 'ranks' | 'solid' = 'parts') {
    type World = Object3D & { isSplatWorld?: boolean; parts: boolean; ranks: boolean; solid: boolean; hold: boolean }
    const worlds: { w: World; hold: boolean }[] = []
    const hidden: Object3D[] = []
    scene.traverse((o) => {
      const w = o as World
      if (w.isSplatWorld) { worlds.push({ w, hold: w.hold }); w[map] = true; w.hold = true }
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
      for (const { w, hold } of worlds) { w[map] = false; w.hold = hold }
      for (const o of hidden) o.visible = true
    }
  }

  /**
   * Lone-pixel cleanup over the art just drawn, or with `calm` the calmer pass: `tidyLone`, and `calmArt` with
   * `calmEdge`, in pixel.ts are its CPU twins (change one, change both).
   */
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
      const done = float(0).toVar()
      If(this.calmed.greaterThan(0.5), () => {
        done.assign(1)
        const inside = (dx: number, dy: number) => { const c = cell.add(vec2(dx, dy)); return c.x.greaterThanEqual(0).and(c.y.greaterThanEqual(0)).and(c.x.lessThan(res.x)).and(c.y.lessThan(res.y)) }
        const solidF = new Map<string, unknown>()
        /** 1 where the art pixel at this offset is scene, 0 where it is backdrop or off the picture. */
        const sol = (dx: number, dy: number) => {
          const key = `${dx},${dy}`
          if (!solidF.has(key)) solidF.set(key, float(select(read(dx, dy).solid, 1, 0)).toVar())
          return solidF.get(key) as { equal: (x: unknown) => unknown; notEqual: (x: unknown) => unknown; greaterThan: (x: number) => unknown }
        }
        const rawAt = (dx: number, dy: number) => this.rawTex.sample(where(dx, dy).st)
        /** `calmEdge` at an offset: the side (0 to 3) to take a color from, or −1. */
        const edgeAt = (ox: number, oy: number) => {
          const me = sol(ox, oy)
          const other = float(0).toVar(), odd = float(-1).toVar()
          SIDES.forEach(([dx, dy], q) => {
            const diff = inside(ox + dx, oy + dy).and(sol(ox + dx, oy + dy).notEqual(me))
            If(diff, () => { other.addAssign(1) }).Else(() => { odd.assign(q) })
          })
          const walls = SIDES.map(([dx, dy]) => {
            const ax = ox + dx, ay = oy + dy
            return inside(ax + dy, ay + dx).and(inside(ax - dy, ay - dx)).and(inside(ax, ay)).and(sol(ax + dy, ay + dx).equal(me)).and(sol(ax - dy, ay - dx).equal(me))
          })
          const wall = select(odd.equal(0), walls[0], select(odd.equal(1), walls[1], select(odd.equal(2), walls[2], walls[3])))
          // the side across from the odd one: 0 and 1, 2 and 3 pair up
          const across = select(odd.equal(0), 1, select(odd.equal(1), 0, select(odd.equal(2), 3, 2)))
          return float(select(other.equal(4), select(me.greaterThan(0.5), -1, 0), select(other.equal(3).and(wall), across, -1))).toVar()
        }
        const sideRaw = (step: unknown, ox: number, oy: number) => {
          const s = float(step)
          return select(s.equal(0), rawAt(ox + 1, oy), select(s.equal(1), rawAt(ox - 1, oy), select(s.equal(2), rawAt(ox, oy + 1), rawAt(ox, oy - 1))))
        }
        const step = edgeAt(0, 0)
        const changed = float(0).toVar()
        If(step.greaterThanEqual(0), () => { out.assign(sideRaw(step, 0, 0)); changed.assign(1) }).ElseIf(here.solid.not(), () => {
          const solids = float(0).toVar()
          for (const [dx, dy] of SIDES) solids.addAssign(sol(dx, dy))
          // the outline's own pixels only: the sky's dither is no line
          If(solids.lessThan(0.5), () => { changed.assign(1) })
          const met = float(0).toVar()
          for (const [dx, dy] of SIDES) {
            If(met.lessThan(0.5).and(inside(dx, dy)).and(edgeAt(dx, dy).greaterThanEqual(0)), () => {
              met.assign(1)
              If(sol(dx, dy).greaterThan(0.5), () => {
                If(solids.equal(1).and(inside(-dx, -dy)), () => { out.assign(rawAt(-dx, -dy)); changed.assign(1) })
              }).Else(() => { out.assign(rawAt(dx, dy)); changed.assign(1) })
            })
          }
        }).Else(() => {
          const ns = N8.map(([dx, dy]) => read(dx, dy))
          const partSame = (n: { part: { x: unknown; y: unknown; z: unknown; w: unknown } }) =>
            this.calmParts.lessThan(0.5).or(float(n.part.w).lessThan(0.5).and(float(here.part.w).lessThan(0.5))).or(samePart(n.part, here.part))
          const counts = ns.map((n) => n.solid.and(partSame(n)))
          const own = float(0).toVar()
          ns.forEach((n, k) => If(counts[k].and(same(n.rgb, here.rgb)), () => { own.addAssign(1) }))
          const most = float(0).toVar(), best = vec3(0).toVar()
          ns.forEach((a, k) => {
            const n = float(0).toVar()
            ns.forEach((b, m) => If(counts[k].and(counts[m]).and(same(a.rgb, b.rgb)), () => { n.addAssign(1) }))
            If(n.greaterThan(most), () => { most.assign(n); best.assign(a.rgb) })
          })
          const lum = (c: unknown) => dot(vec3(c), vec3(...LINE_LUMA))
          // a pixel much lighter or darker than the patch round it is a highlight or a detail, not speckle
          If(most.greaterThanEqual(CALM_MOST).and(most.greaterThan(own)).and(abs(lum(best).sub(lum(here.rgb))).lessThan(SPECK_KEEP)), () => { out.assign(vec4(best, 1)); changed.assign(1) })
        })
        // a speck of one or two pixels on a part takes the color three or more of its neighbors there share, unless it is
        // much lighter or darker (a highlight, an eye): the speck step of `calmArt` in pixel.ts (change both)
        If(changed.lessThan(0.5).and(here.solid), () => {
          const partOk = (n: { part: { x: unknown; y: unknown; z: unknown; w: unknown } }) =>
            this.calmParts.lessThan(0.5).or(float(n.part.w).lessThan(0.5).and(float(here.part.w).lessThan(0.5))).or(samePart(n.part, here.part))
          const likeMe = (ox: number, oy: number) => { const n = read(ox, oy); return n.solid.and(partOk(n)).and(same(n.rgb, here.rgb)) }
          const mine = float(0).toVar(), second = float(0).toVar()
          for (const [dx, dy] of N8) {
            If(likeMe(dx, dy), () => {
              mine.addAssign(1)
              const k = float(0).toVar()
              for (const [ex, ey] of N8) If(likeMe(dx + ex, dy + ey), () => { k.addAssign(1) })
              second.assign(k)
            })
          }
          If(mine.equal(0).or(mine.equal(1).and(second.equal(1))), () => {
            const ns = N8.map(([dx, dy]) => read(dx, dy))
            const ok = ns.map((n) => n.solid.and(partOk(n)).and(same(n.rgb, here.rgb).not()))
            const most = float(0).toVar(), best = vec3(0).toVar()
            ns.forEach((a, k) => {
              const n = float(0).toVar()
              ns.forEach((b, m) => If(ok[k].and(ok[m]).and(same(a.rgb, b.rgb)), () => { n.addAssign(1) }))
              If(n.greaterThan(most), () => { most.assign(n); best.assign(a.rgb) })
            })
            const luma = (c: unknown) => dot(vec3(c), vec3(...LINE_LUMA))
            If(most.greaterThanEqual(SPECK_MOST).and(abs(luma(best).sub(luma(here.rgb))).lessThan(SPECK_KEEP)), () => { out.assign(vec4(best, 1)); changed.assign(1) })
          })
        })
        // the line cleaner, on the art as drawn: `lineFix` in pixel.ts is the CPU twin (change both)
        If(changed.lessThan(0.5), () => {
          const like = (a: unknown, b: unknown) => { const d = vec4(a).sub(b); return dot(d, d).lessThan(1e-5) }
          const luma = (a: unknown) => dot(vec4(a).rgb, vec3(...LINE_LUMA))
          const me = rawAt(0, 0).toVar()
          const fixed = float(0).toVar()
          for (let k = 0; k < 4; k++) {
            const [dx, dy] = N8[k], ex = dy, ey = dx
            const ahead = rawAt(dx, dy)
            const kink = like(ahead, me).not().and(like(rawAt(ex, ey), ahead)).and(like(rawAt(-ex, -ey), ahead))
              .and(like(rawAt(-dx, -dy), me)).and(like(rawAt(-dx + ex, -dy + ey), me)).and(like(rawAt(-dx - ex, -dy - ey), me))
            If(fixed.lessThan(0.5).and(kink), () => { out.assign(ahead); fixed.assign(1) })
          }
          for (let k = 4; k < 8; k++) {
            const [gx, gy] = N8[k]
            const a = rawAt(-gx, 0), b = rawAt(0, -gy)
            const corner = like(rawAt(gx, 0), me).and(like(rawAt(0, gy), me)).and(like(rawAt(gx, gy), me).not()).and(like(a, me).not()).and(like(b, me).not())
            const goH = like(rawAt(2 * gx, 0), me).or(like(rawAt(2 * gx, -gy), me)), goV = like(rawAt(0, 2 * gy), me).or(like(rawAt(-gx, 2 * gy), me))
            const l0 = luma(me)
            const lighter = luma(a).greaterThan(l0.add(LINE_LIFT)).and(luma(b).greaterThan(l0.add(LINE_LIFT)))
            If(fixed.lessThan(0.5).and(corner).and(goH).and(goV).and(lighter), () => { out.assign(select(like(a, b), a, rawAt(-gx, -gy))); fixed.assign(1) })
          }
        })
      })
      If(done.lessThan(0.5).and(here.solid), () => {
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

  /**
   * The art onto the output: every screen pixel inside one art pixel takes that pixel's color. With a glitch on, the
   * art pixel is read from where `readFrom` in glitch.ts says, red and blue to either side: `glitchArt` there is the
   * CPU twin (change one, change both). The hash is the same unsigned 32-bit arithmetic as `glitchHash`.
   */
  private toScreen() {
    const toLinear = (c: unknown) => select(float(c).lessThanEqual(0.04045), float(c).div(12.92), pow(float(c).add(0.055).div(1.055), 2.4))
    const g = this.glitch
    /** `glitchHash`: the 24-bit hash of a row band or block for one question, as a float (exact under 2^24). */
    const glitchHash = (a: unknown, b: unknown, salt: number) => {
      const h = uint(a).mul(uint(MIX_A)).bitXor(uint(b).mul(uint(MIX_B))).bitXor(uint(g.key).add(uint(salt))).toVar()
      h.assign(h.bitXor(uint(61)).bitXor(h.shiftRight(uint(16))))
      h.assign(h.mul(uint(9)))
      h.assign(h.bitXor(h.shiftRight(uint(4))))
      h.assign(h.mul(uint(0x27d4eb2d)))
      h.assign(h.bitXor(h.shiftRight(uint(15))))
      return h.shiftRight(uint(8)).toVar()
    }
    /** `pickOf`: a whole number from 0 to m − 1 out of a 24-bit hash. */
    const pickOf = (h: { mul: (x: unknown) => { shiftRight: (x: unknown) => unknown } }, m: unknown) => float(h.mul(uint(m)).shiftRight(uint(24)))
    // whole columns round the picture's width: a division may land a step off either way, which the two corrections undo
    const wrapX = (x: unknown) => {
      const m = float(x).sub(floor(float(x).div(this.res.x)).mul(this.res.x))
      const up = select(m.lessThan(0), m.add(this.res.x), m)
      return select(up.greaterThanEqual(this.res.x), up.sub(this.res.x), up)
    }
    return Fn(() => {
      const st = uv()
      const cell = floor(vec2(st.x, float(1).sub(st.y)).mul(this.cells)).toVar()
      /** The art pixel at column `x` and row `y` from the top. */
      const art = (x: unknown, y: unknown) => this.artTex.sample(vec2(float(x).add(0.5).div(this.res.x), float(y).add(0.5).div(this.res.y)))
      const row = this.res.y.sub(1).sub(cell.y).toVar()
      const c = vec4(art(cell.x, row)).toVar()
      If(g.on.greaterThan(0.5), () => {
        const sx = float(cell.x).toVar(), sy = float(row).toVar(), turned = float(0).toVar()
        If(g.jitter.greaterThan(0), () => {
          const b = floor(row.div(g.band))
          If(float(glitchHash(b, 0, SALT.slides)).lessThan(g.rows), () => {
            sx.addAssign(pickOf(glitchHash(b, 0, SALT.slide), g.jitter.mul(2).add(1)).sub(g.jitter))
          })
        })
        If(g.blocks.greaterThan(0), () => {
          const bx = floor(cell.x.div(g.block.mul(BLOCK_WIDE))).toVar(), by = floor(row.div(g.block)).toVar()
          If(float(glitchHash(by, 0, SALT.strip)).lessThan(STRIPS).and(float(glitchHash(bx, by, SALT.broken)).lessThan(g.blocks)), () => {
            sx.addAssign(pickOf(glitchHash(bx, by, SALT.fromX), 7).sub(3).mul(g.block).mul(BLOCK_WIDE))
            sy.addAssign(pickOf(glitchHash(bx, by, SALT.fromY), 5).sub(2).mul(g.block))
            turned.assign(select(float(glitchHash(bx, by, SALT.turned)).lessThan(TURNED), 1, 0))
          })
        })
        const x = wrapX(sx).toVar(), y = sy.clamp(0, this.res.y.sub(1)).toVar()
        const mid = vec4(art(x, y)).toVar()
        const red = vec4(art(wrapX(x.add(g.split)), y)).toVar()
        const blue = vec4(art(wrapX(x.sub(g.split)), y)).toVar()
        const rgb = vec3(red.x, mid.y, blue.z).toVar()
        c.assign(vec4(select(turned.greaterThan(0.5), vec3(rgb.y, rgb.z, rgb.x), rgb), max(red.w, max(mid.w, blue.w))))
      })
      return vec4(toLinear(c.x), toLinear(c.y), toLinear(c.z), c.w)
    })()
  }

  /** Frees its render targets. */
  dispose() {
    this.small.dispose()
    this.ids.dispose()
    this.ranks.dispose()
    this.fineSmall.dispose()
    this.fineIds.dispose()
    this.fineSolid.dispose()
    this.settleMat.dispose()
    this.settleIdsMat.dispose()
    for (const f of this.frames) f.dispose()
    this.tidied.dispose()
    this.tidyMat.dispose()
    this.material.dispose()
    this.copy.dispose()
  }
}
