import { DataTexture, NearestFilter, NoBlending, NodeMaterial, QuadMesh, RedFormat, RenderTarget, UnsignedByteType, Vector2, Vector3, type Camera, type Object3D, type WebGPURenderer } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import { SplatDepth } from './depth.ts'
import { CELL_H, CELL_W, EDGE_COVER, EDGE_DEPTH, EDGE_TONE, GLYPHS, LIFT_MOST, PROBE, RAMP_INK, STICK, STROKE_FROM, glyphAtlas, type GlyphLook } from '../splat-core/glyphs.ts'

// As in engine.ts: the shader builders use TSL untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Fn, abs, dot, float, floor, max, min, select, sqrt, texture, uniform, uv, vec2, vec3, vec4 } = TSL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any

/** Where a cell's eight probes stand, in cells from its middle: left, right, above, below, then the four corners (above left, above right, below left, below right). */
const RING: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
/** Where a cell's mean is taken: three across and four down. */
const TAPS: [number, number][] = Array.from({ length: 12 }, (_, i) => [((i % 3) + 0.5) / 3 - 0.5, (Math.floor(i / 3) + 0.5) / 4 - 0.5])

/**
 * The picture as characters (splat-core/glyphs.ts is the CPU twin: change one, change both). The frame is drawn three
 * times with the same moved and sorted blobs, as for drawn outlines: the picture, a map of depth and a map of parts.
 * One small pass then decides every cell of the grid (its character and that character's color, kept in a target a
 * cell a pixel, beside the one from the frame before so a cell can keep its character), and a second draws the
 * characters from the font, each of the font's pixels a whole number of device pixels.
 */
export class GlyphPass {
  /** The picture, as the stage draws it without characters. */
  readonly picture = new RenderTarget(1, 1)
  private readonly ids = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  private readonly depth = new SplatDepth()
  /** The grid of this frame and of the one before: color in the root of linear, and the character's number over 255 in alpha. */
  private readonly grids = [0, 1].map(() => new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false }))
  private now = 0
  private kept = false
  private readonly beforeTex = texture(this.grids[1].texture)
  private readonly gridTex = texture(this.grids[0].texture)
  private readonly font: DataTexture
  private readonly decide = new NodeMaterial()
  private readonly show = new NodeMaterial()
  private readonly decideQuad: QuadMesh
  private readonly showQuad: QuadMesh
  /** The picture's size in device pixels. */
  private readonly res = uniform(new Vector2(1, 1))
  /** The grid's size in cells. */
  private readonly cells = uniform(new Vector2(1, 1))
  /** Device pixels to one pixel of the font. */
  private readonly scale = uniform(1)
  private readonly ink = uniform(new Vector3())
  private readonly inked = uniform(0)
  private readonly light = uniform(0)
  private readonly edges = uniform(1)
  private readonly sticky = uniform(0)
  private readonly gain = uniform(1)
  private steady = STICK

  constructor() {
    const { width, height, data } = glyphAtlas()
    this.font = new DataTexture(data, width, height, RedFormat, UnsignedByteType)
    this.font.minFilter = this.font.magFilter = NearestFilter
    this.font.needsUpdate = true
    for (const [m, f] of [[this.decide, this.decideCells()], [this.show, this.draw()]] as const) {
      m.fragmentNode = f
      m.blending = NoBlending
      m.depthTest = false
      m.depthWrite = false
    }
    this.decideQuad = new QuadMesh(this.decide)
    this.showQuad = new QuadMesh(this.show)
  }

  /** The look; `ink` is linear RGB here, or left out for each character to take its own color. */
  setLook(look: GlyphLook, ink?: readonly number[]) {
    this.inked.value = ink ? 1 : 0
    if (ink) this.ink.value.set(ink[0], ink[1], ink[2])
    this.light.value = look.light ? 1 : 0
    this.edges.value = look.edges === false ? 0 : 1
    this.gain.value = look.gain ?? 1
    this.steady = look.steady ?? STICK
  }

  /** Sizes the pass for a picture in device pixels, with `scale` of them to one pixel of the font. */
  setSize(width: number, height: number, scale: number) {
    const cols = Math.ceil(width / (CELL_W * scale)), rows = Math.ceil(height / (CELL_H * scale))
    this.scale.value = scale
    if (this.picture.width !== width || this.picture.height !== height) {
      this.picture.setSize(width, height)
      this.ids.setSize(width, height)
      this.depth.setSize(width, height)
      this.res.value.set(width, height)
    }
    if (this.grids[0].width !== cols || this.grids[0].height !== rows) {
      for (const g of this.grids) g.setSize(cols, rows)
      this.cells.value.set(cols, rows)
      this.kept = false
    }
  }

  /** The grid of the frame just drawn: a pixel a cell, the character's number in alpha. */
  get grid() { return this.grids[this.now] }

  /** Forgets the frame before: for when what is being drawn is swapped for something else. */
  forget() { this.kept = false }

  /** Draws the scene as characters into the renderer's current target, or onto the screen when it has none. */
  render(renderer: WebGPURenderer, scene: Object3D, camera: Camera) {
    const to = renderer.getRenderTarget()
    renderer.setRenderTarget(this.picture)
    renderer.clear()
    renderer.render(scene, camera)
    this.depth.render(renderer, scene, camera)
    this.drawParts(renderer, scene, camera)
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

  /** The same view as a map of parts: only the blobs, as they were just drawn (nothing is moved or sorted again). */
  private drawParts(renderer: WebGPURenderer, scene: Object3D, camera: Camera) {
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
      renderer.setRenderTarget(this.ids)
      renderer.clear()
      renderer.render(scene, camera)
    } finally {
      for (const { w, hold } of worlds) { w.parts = false; w.hold = hold }
      for (const o of hidden) o.visible = true
    }
  }

  /** `toneOf`: how heavy a character a premultiplied linear color with this cover wants. */
  private tone(rgb: N, cover: N) {
    const bright = sqrt(dot(rgb, vec3(0.2126, 0.7152, 0.0722)).div(max(cover, 1e-5)).clamp(0, 1))
    const t = cover.mul(select(this.light.greaterThan(0.5), float(1).sub(bright), bright)).mul(this.gain).min(1)
    return select(cover.greaterThan(0), t, float(0))
  }

  /** Every cell's character and color: `glyphCell`. */
  private decideCells() {
    const picture = this.picture.texture, ids = this.ids.texture, depth = this.depth.target.texture
    return Fn(() => {
      const st = uv()
      // which cell, counted from the left and from the top, and its middle on the picture
      const cell = floor(st.mul(this.cells)).toVar()
      const size = vec2(CELL_W, CELL_H).mul(this.scale).div(this.res).toVar()
      const mid = cell.add(0.5).mul(size).toVar()
      const sum = vec4(0).toVar()
      for (const [x, y] of TAPS) sum.addAssign(texture(picture, mid.add(vec2(x, y).mul(size))))
      const mean = sum.div(TAPS.length).toVar()
      const cover = mean.a.clamp(0, 1).toVar()
      const tone = this.tone(mean.rgb, cover).toVar()

      // the ramp character whose ink is nearest, or the one the cell had when that is no more than `sticky` further off
      const best = float(0).toVar(), off = abs(tone.sub(RAMP_INK[0])).toVar()
      for (let i = 1; i < RAMP_INK.length; i++) {
        const d = abs(tone.sub(RAMP_INK[i]))
        const nearer = d.lessThan(off)
        best.assign(select(nearer, float(i), best))
        off.assign(select(nearer, d, off))
      }
      const was = floor(this.beforeTex.sample(cell.add(0.5).div(this.cells)).a.mul(255).add(0.5)).toVar()
      const wasInk = float(0).toVar()
      for (let i = 0; i < RAMP_INK.length; i++) wasInk.assign(select(abs(was.sub(i)).lessThan(0.5), float(RAMP_INK[i]), wasInk))
      const keep = this.sticky.greaterThan(0).and(was.lessThan(STROKE_FROM - 0.5)).and(abs(wasInk.sub(tone)).lessThanEqual(off.add(this.sticky)))
      const glyph = select(keep, was, best).toVar()

      // edges: eight probes round the middle, and the way along which both ends are on one side
      const probe = ([x, y]: [number, number]) => {
        const at = mid.add(vec2(x, y).mul(size)).toVar()
        const c = texture(picture, at).toVar()
        const id = texture(ids, at).toVar()
        return { shown: c.a.greaterThan(0.5), tone: this.tone(c.rgb, c.a.clamp(0, 1)), depth: texture(depth, at).r, part: id.r.mul(65536).add(id.g.mul(256)).add(id.b) }
      }
      const across = (a: ReturnType<typeof probe>, b: ReturnType<typeof probe>) => {
        const differ = abs(a.part.sub(b.part)).greaterThan(0.001)
          .or(abs(a.depth.sub(b.depth)).greaterThan(min(a.depth, b.depth).mul(EDGE_DEPTH)))
          .or(abs(a.tone.sub(b.tone)).greaterThan(EDGE_TONE))
        return a.shown.notEqual(b.shown).or(a.shown.and(differ))
      }
      // `strokeFor` of one ring
      const ring = (reach: number) => {
        const [l, r, t, b, tl, tr, bl, br] = RING.map(([x, y]) => probe([x * reach, y * reach]))
        const h = across(l, r), v = across(t, b), overRise = across(tl, br), overFall = across(tr, bl)
        return select(h.and(v.not()), float(STROKE_FROM),
          select(v.and(h.not()), float(STROKE_FROM + 1),
            select(overRise.and(overFall.not()), float(STROKE_FROM + 2),
              select(overFall.and(overRise.not()), float(STROKE_FROM + 3), float(-1))))).toVar()
      }
      // `strokeHeld`: both rings to start one, either to keep the one the cell had
      const inner = ring(PROBE[0]), outer = ring(PROBE[1])
      const same = (a: N, b: N) => abs(a.sub(b)).lessThan(0.5)
      const held = this.sticky.greaterThan(0).and(was.greaterThan(STROKE_FROM - 0.5)).and(same(inner, was).or(same(outer, was)))
      const stroke = select(held, was, select(same(inner, outer), inner, float(-1))).toVar()
      const stroked = this.edges.greaterThan(0.5).and(cover.greaterThanEqual(EDGE_COVER)).and(stroke.greaterThanEqual(0))
      glyph.assign(select(stroked, stroke, glyph))

      // its own color, brought up to full strength but no more than `LIFT_MOST` times
      const top = max(max(mean.r, mean.g), max(mean.b, max(cover.div(LIFT_MOST), 1e-4)))
      const lightOn = this.light.greaterThan(0.5)
      const level = select(stroked, select(lightOn, float(0.2), float(1)), select(lightOn, float(0.6).sub(tone.mul(0.45)), tone.mul(0.45).add(0.55)))
      const own = mean.rgb.div(top).mul(level)
      const color = select(this.inked.greaterThan(0.5), this.ink, own)
      // kept as the root of linear, which a byte holds evenly from dark to light
      return vec4(sqrt(color.clamp(0, 1)), glyph.div(255))
    })()
  }

  /** The characters, from the grid and the font. */
  private draw() {
    const font = this.font
    return Fn(() => {
      const st = uv()
      const px = floor(st.mul(this.res)).toVar()
      const box = vec2(CELL_W, CELL_H).mul(this.scale).toVar()
      const cell = floor(px.div(box)).toVar()
      const g = this.gridTex.sample(cell.add(0.5).div(this.cells)).toVar()
      const glyph = floor(g.a.mul(255).add(0.5))
      const inCell = floor(px.sub(cell.mul(box)).div(this.scale)).toVar()
      const bit = texture(font, vec2(glyph.mul(CELL_W).add(inCell.x).add(0.5).div(GLYPHS.length * CELL_W), inCell.y.add(0.5).div(CELL_H))).r
      const on = select(bit.greaterThan(0.5), float(1), float(0)).toVar()
      // linear and premultiplied, as the blobs' own draw gives
      return vec4(g.rgb.mul(g.rgb).mul(on), on)
    })()
  }

  /** Frees its targets. */
  dispose() {
    this.picture.dispose()
    this.ids.dispose()
    this.depth.dispose()
    for (const g of this.grids) g.dispose()
    this.font.dispose()
    this.decide.dispose()
    this.show.dispose()
  }
}
