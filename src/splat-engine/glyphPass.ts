import { DataTexture, LinearFilter, NearestFilter, NoBlending, NodeMaterial, QuadMesh, RedFormat, RenderTarget, UnsignedByteType, Vector2, Vector3, type Camera, type Object3D, type WebGPURenderer } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import { SplatDepth } from './depth.ts'
import { BLOCK_SPLIT, BOX_DOT, BOX_DOT_BIG, BOX_MID, CELL_H, CELL_W, CORNERS, DOT_STEP, DOT_X, DOT_Y, EDGE_COVER, EDGE_DEPTH, EDGE_TONE, GLYPHS, GLYPH_SETS, LIFT_MOST, PROBE, RAMP_INK, STICK, STRAND, STRAND_HOLD, STRAND_KEEP, STROKE_FROM, TYPED, TYPED_INK, TYPE_FAINT, TYPE_SLIP, WORD_FROM, WORD_LEVELS, WORD_STEP, dotBit, glyphAtlas, wordGlyphs, type GlyphLook } from '../splat-core/glyphs.ts'

// As in engine.ts: the shader builders use TSL untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Fn, abs, dot, float, floor, max, min, mod, select, sqrt, texture, uniform, uv, vec2, vec3, vec4 } = TSL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any

/** Where a cell's eight probes stand, in cells from its middle: left, right, above, below, then the four corners (above left, above right, below left, below right). */
const RING: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
/** Where a cell's mean is taken: three across and four down. */
const TAPS: [number, number][] = Array.from({ length: 12 }, (_, i) => [((i % 3) + 0.5) / 3 - 0.5, (Math.floor(i / 3) + 0.5) / 4 - 0.5])

/** Where a cell's mean lie is taken: once for each pixel of the font. */
const LIE_TAPS: [number, number][] = Array.from({ length: CELL_W * CELL_H }, (_, i) => [((i % CELL_W) + 0.5) / CELL_W - 0.5, (Math.floor(i / CELL_W) + 0.5) / CELL_H - 0.5])
/** The four strokes as ways to run (`WAYS` in glyphs.ts). */
const WAYS: [number, number][] = [[-1, 0], [1, 0], [0, 1], [0, -1]]

/** Where a braille cell's eight parts are read, in font pixels from the cell's top left: two taps in the middle row of each part (three across, two down). */
const DOT_TAPS: [number, number][][] = Array.from({ length: 8 }, (_, d) => {
  const c = d % 2, r = Math.floor(d / 2)
  return [[3 * c + 0.75, 2 * r + 1], [3 * c + 2.25, 2 * r + 1]]
})
/** Where a blocks cell's four quarters are read: four taps in each (three across, four down). */
const QUAD_TAPS: [number, number][][] = Array.from({ length: 4 }, (_, i) => {
  const x = 3 * (i % 2), y = 4 * Math.floor(i / 2)
  return [[x + 0.75, y + 1], [x + 2.25, y + 1], [x + 0.75, y + 3], [x + 2.25, y + 3]]
})
/** The even blocks (`EVEN` in glyphs.ts): their numbers and tones. */
const EVEN: [number, number][] = [[0, 0], [16, 0.25], [17, 0.5], [18, 0.75], [15, 1]]
/** The most characters of words the pass holds. */
const WORDS_MOST = 256

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
  /** How the blobs lie on the screen (`SplatWorld.lieMap`), for strokes along strands. */
  private readonly lie = new RenderTarget(1, 1, { minFilter: LinearFilter, magFilter: LinearFilter })
  private readonly strands = uniform(1)
  private wantStrands = true
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
  /** Which characters, by their place in `GLYPH_SETS`: 0 ASCII, 1 braille, 2 blocks, 3 lines, 4 words, 5 typed. */
  private readonly set = uniform(0)
  /** The words, a character a byte (`wordGlyphs`), and how many. */
  private readonly words = new DataTexture(new Uint8Array(WORDS_MOST), WORDS_MOST, 1, RedFormat, UnsignedByteType)
  private readonly wordCount = uniform(1)
  private steady = STICK

  constructor() {
    const { width, height, data } = glyphAtlas()
    this.font = new DataTexture(data, width, height, RedFormat, UnsignedByteType)
    this.font.minFilter = this.font.magFilter = NearestFilter
    this.font.needsUpdate = true
    this.words.minFilter = this.words.magFilter = NearestFilter
    this.words.needsUpdate = true
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
    const set = Math.max(0, GLYPH_SETS.indexOf(look.set ?? 'ascii'))
    if (set === 4) {
      const text = wordGlyphs(look.words ?? '').slice(0, WORDS_MOST)
      const bytes = this.words.image.data as Uint8Array
      bytes.fill(0).set(text)
      this.words.needsUpdate = true
      this.wordCount.value = text.length
    }
    // a cell's number means something else in another set
    if (set !== this.set.value) this.kept = false
    this.set.value = set
    this.wantStrands = look.strands !== false && set === 0
    this.strands.value = this.wantStrands ? 1 : 0
  }

  /** Sizes the pass for a picture in device pixels, with `scale` of them to one pixel of the font. */
  setSize(width: number, height: number, scale: number) {
    const cols = Math.ceil(width / (CELL_W * scale)), rows = Math.ceil(height / (CELL_H * scale))
    this.scale.value = scale
    if (this.picture.width !== width || this.picture.height !== height) {
      this.picture.setSize(width, height)
      this.ids.setSize(width, height)
      this.lie.setSize(width, height)
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
    this.drawFlat(renderer, scene, camera, 'parts', this.ids)
    if (this.wantStrands) this.drawFlat(renderer, scene, camera, 'lieMap', this.lie)
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

  /** The same view as a map of parts or of how the blobs lie: only the blobs, as they were just drawn (nothing is moved or sorted again). */
  private drawFlat(renderer: WebGPURenderer, scene: Object3D, camera: Camera, map: 'parts' | 'lieMap', into: RenderTarget) {
    type World = Object3D & { isSplatWorld?: boolean; parts: boolean; lieMap: boolean; hold: boolean }
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

  /** `toneOf`: how heavy a character a premultiplied linear color with this cover wants. */
  private tone(rgb: N, cover: N) {
    const bright = sqrt(dot(rgb, vec3(0.2126, 0.7152, 0.0722)).div(max(cover, 1e-5)).clamp(0, 1))
    const t = cover.mul(select(this.light.greaterThan(0.5), float(1).sub(bright), bright)).mul(this.gain).min(1)
    return select(cover.greaterThan(0), t, float(0))
  }

  /** Every cell's character and color: `glyphCell`. */
  private decideCells() {
    const picture = this.picture.texture, ids = this.ids.texture, depth = this.depth.target.texture, lie = this.lie.texture
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

      // strands: the cell's mean lie, and `strandFor`
      const lay = vec2(0).toVar(), drawn = float(0).toVar()
      for (const [x, y] of LIE_TAPS) {
        const s = texture(lie, mid.add(vec2(x, y).mul(size)))
        // only where a blob was drawn: empty pixels hold no direction
        lay.addAssign(s.rg.sub(0.5).mul(2).mul(s.a))
        drawn.addAssign(1)
      }
      lay.divAssign(drawn)
      const strength = lay.length().toVar()
      const wayOf = (i: number) => lay.x.mul(WAYS[i][0]).add(lay.y.mul(WAYS[i][1]))
      const bestWay = float(0).toVar(), bestDot = wayOf(0).toVar()
      for (let i = 1; i < WAYS.length; i++) {
        const d = wayOf(i)
        const more = d.greaterThan(bestDot)
        bestWay.assign(select(more, float(i), bestWay))
        bestDot.assign(select(more, d, bestDot))
      }
      const wasDot = float(-1).toVar()
      for (let i = 0; i < WAYS.length; i++) wasDot.assign(select(abs(was.sub(STROKE_FROM + i)).lessThan(0.5), wayOf(i), wasDot))
      const wasStroke = was.greaterThan(STROKE_FROM - 0.5)
      const keepStrand = this.sticky.greaterThan(0).and(wasStroke).and(strength.greaterThanEqual(STRAND_HOLD)).and(wasDot.greaterThanEqual(strength.mul(STRAND_KEEP)))
      const strand = select(keepStrand, was, select(strength.greaterThanEqual(STRAND), bestWay.add(STROKE_FROM), float(-1)))
      const stranded = this.strands.greaterThan(0.5).and(cover.greaterThanEqual(EDGE_COVER)).and(strand.greaterThanEqual(0)).toVar()
      glyph.assign(select(stranded, strand, glyph))

      // braille and blocks (`shapeCell`): the tones of the cell's eighths or quarters
      const font = (x: number, y: number) => cell.add(vec2(x / CELL_W, y / CELL_H)).mul(size)
      const partTone = (taps: [number, number][]) => {
        const s = vec4(0).toVar()
        for (const [x, y] of taps) s.addAssign(texture(picture, font(x, y)))
        const m = s.div(taps.length)
        return this.tone(m.rgb, m.a.clamp(0, 1)).toVar()
      }
      const bitOf = (n: N, bit: number) => mod(floor(n.div(2 ** bit).add(0.001)), 2)
      const kept = this.sticky.greaterThan(0)
      // `brailleFor`
      const dots = DOT_TAPS.map(partTone)
      const braille = float(0).toVar(), dotTop = float(0).toVar()
      dots.forEach((t, d) => {
        const bit = dotBit(d % 2, Math.floor(d / 2))
        const wasOn = select(kept, bitOf(was, bit), float(0))
        braille.addAssign(select(t.greaterThanEqual(float(DOT_STEP[d]).sub(wasOn.mul(this.sticky))), float(2 ** bit), float(0)))
        dotTop.assign(max(dotTop, t))
      })
      // `blockFor`
      const q = QUAD_TAPS.map(partTone)
      const hi = max(max(q[0], q[1]), max(q[2], q[3])).toVar(), lo = min(min(q[0], q[1]), min(q[2], q[3])).toVar()
      const qMean = q[0].add(q[1]).add(q[2]).add(q[3]).div(4).toVar()
      const evenBest = float(EVEN[0][0]).toVar(), evenOff = abs(qMean.sub(EVEN[0][1])).toVar(), wasOff = float(-1).toVar()
      for (let i = 1; i < EVEN.length; i++) {
        const d = abs(qMean.sub(EVEN[i][1]))
        const nearer = d.lessThan(evenOff)
        evenBest.assign(select(nearer, float(EVEN[i][0]), evenBest))
        evenOff.assign(select(nearer, d, evenOff))
      }
      for (const [g, v] of EVEN) wasOff.assign(select(abs(was.sub(g)).lessThan(0.5), abs(qMean.sub(v)), wasOff))
      const evenGlyph = select(kept.and(wasOff.greaterThanEqual(0)).and(wasOff.lessThanEqual(evenOff.add(this.sticky))), was, evenBest)
      const middle = hi.add(lo).div(2).toVar()
      const split = float(0).toVar(), holds = kept.and(was.greaterThan(0.5)).and(was.lessThan(14.5)).toVar()
      q.forEach((t, i) => {
        split.addAssign(select(t.greaterThan(middle), float(2 ** i), float(0)))
        const wasOn = bitOf(was, i).greaterThan(0.5)
        holds.assign(holds.and(select(wasOn, t.greaterThanEqual(middle.sub(this.sticky)), t.lessThanEqual(middle.add(this.sticky)))))
      })
      const blocks = select(hi.sub(lo).lessThan(BLOCK_SPLIT), evenGlyph, select(holds, was, split))
      const shaped = this.set.greaterThan(0.5).and(this.set.lessThan(2.5)).toVar()
      glyph.assign(select(shaped, select(this.set.lessThan(1.5), braille, blocks), glyph))

      // lines (`boxFor`): an arm between each two neighboring corners on two sides of a line, else a dot by tone
      const corner = CORNERS.map(([x, y]) => probe([x, y]))
      const apart = (a: ReturnType<typeof probe>, b: ReturnType<typeof probe>) => a.shown.notEqual(b.shown)
        .or(a.shown.and(abs(a.part.sub(b.part)).greaterThan(0.001).or(abs(a.depth.sub(b.depth)).greaterThan(min(a.depth, b.depth).mul(EDGE_DEPTH)))))
      const arms = select(apart(corner[0], corner[1]), float(1), float(0)).add(select(apart(corner[1], corner[3]), float(2), float(0)))
        .add(select(apart(corner[2], corner[3]), float(4), float(0))).add(select(apart(corner[0], corner[2]), float(8), float(0))).toVar()
      const dotHeld = select(kept.and(was.lessThan(0.5).or(was.greaterThan(15.5))), this.sticky, float(0))
      const dotLo = select(was.greaterThan(15.5), float(BOX_DOT).sub(dotHeld), float(BOX_DOT).add(dotHeld))
      const dotHi = select(abs(was.sub(17)).lessThan(0.5), float(BOX_DOT_BIG).sub(dotHeld), float(BOX_DOT_BIG).add(dotHeld))
      const box = select(arms.greaterThan(0.5), arms, select(tone.lessThan(dotLo), float(0), select(tone.lessThan(dotHi), float(16), float(17)))).toVar()
      const isLines = abs(this.set.sub(3)).lessThan(0.5).toVar()
      glyph.assign(select(isLines, box, glyph))

      // words (`wordFor`): the letter that falls on the cell, written along every row without a break, and how bright
      const at = mod(cell.y.mul(this.cells.x).add(cell.x), this.wordCount)
      const letter = floor(texture(this.words, vec2(at.add(0.5).div(WORDS_MOST), 0.5)).r.mul(255).add(0.5))
      const step = min(floor(tone.mul(WORD_LEVELS.length)), float(WORD_LEVELS.length - 1)).toVar()
      const word = select(tone.lessThan(WORD_FROM).or(letter.lessThan(0.5)), float(0), letter.add(step.mul(WORD_STEP))).toVar()
      const isWords = abs(this.set.sub(4)).lessThan(0.5).toVar()
      glyph.assign(select(isWords, word, glyph))
      const wordLevel = float(WORD_LEVELS[0]).toVar()
      for (let i = 1; i < WORD_LEVELS.length; i++) wordLevel.assign(select(step.greaterThan(i - 0.5), float(WORD_LEVELS[i]), wordLevel))

      // the typewriter (`typedFor`): the strikes whose ink is nearest, or the cell's own when no more than `sticky` further off
      const typedBest = float(0).toVar(), typedOff = abs(tone.sub(TYPED_INK[0])).toVar()
      for (let i = 1; i < TYPED_INK.length; i++) {
        const d = abs(tone.sub(TYPED_INK[i]))
        const nearer = d.lessThan(typedOff)
        typedBest.assign(select(nearer, float(i), typedBest))
        typedOff.assign(select(nearer, d, typedOff))
      }
      const wasTyped = float(-1).toVar()
      for (let i = 0; i < TYPED_INK.length; i++) wasTyped.assign(select(abs(was.sub(i)).lessThan(0.5), float(TYPED_INK[i]), wasTyped))
      const keepTyped = kept.and(wasTyped.greaterThanEqual(0)).and(abs(wasTyped.sub(tone)).lessThanEqual(typedOff.add(this.sticky)))
      const isTyped = abs(this.set.sub(5)).lessThan(0.5).toVar()
      glyph.assign(select(isTyped, select(keepTyped, was, typedBest), glyph))

      // its own color, brought up to full strength but no more than `LIFT_MOST` times
      const top = max(max(mean.r, mean.g), max(mean.b, max(cover.div(LIFT_MOST), 1e-4)))
      const lightOn = this.light.greaterThan(0.5)
      const partTop = select(this.set.lessThan(1.5), dotTop, hi)
      const boxLine = isLines.and(glyph.greaterThan(0.5)).and(glyph.lessThan(15.5))
      const level = select(isWords, select(lightOn, float(0.6).sub(wordLevel.mul(0.45)), wordLevel),
        select(boxLine, select(lightOn, float(0.2), float(1)),
        select(isLines.or(isTyped), select(lightOn, float(0.6).sub(tone.mul(0.45)), tone.mul(0.45).add(0.55)),
        select(shaped, select(lightOn, float(0.6).sub(partTop.mul(0.45)), partTop.mul(0.45).add(0.55)),
        select(stranded, select(lightOn, float(0.6).sub(tone.mul(0.45)), tone.mul(0.55).add(0.45)),
          select(stroked, select(lightOn, float(0.2), float(1)), select(lightOn, float(0.6).sub(tone.mul(0.45)), tone.mul(0.45).add(0.55))))))))
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
      const ascii = bit.greaterThan(0.5)
      // braille (`setBit`): a dot where a column and a row of dots cross, on when its bit is
      const ix = inCell.x, iy = inCell.y
      const col = select(abs(ix.sub(DOT_X[1])).lessThan(0.5), float(1), float(0))
      const row = iy.div(2).floor()
      const atDot = abs(ix.sub(DOT_X[0])).lessThan(0.5).or(abs(ix.sub(DOT_X[1])).lessThan(0.5))
        .and(mod(iy, 2).lessThan(0.5)).and(iy.lessThanEqual(DOT_Y[3] + 0.5))
      const dotBitN = select(row.lessThan(2.5), row.add(col.mul(3)), col.add(6))
      const braille = atDot.and(mod(floor(glyph.div(dotBitN.exp2()).add(0.001)), 2).greaterThan(0.5))
      // blocks: the shades as dither patterns, else the quarters
      const quarter = select(ix.greaterThanEqual(CELL_W / 2), float(1), float(0)).add(select(iy.greaterThanEqual(CELL_H / 2), float(2), float(0)))
      const ex = mod(ix, 2), ey = mod(iy, 2)
      const f = (b: N) => select(b, float(1), float(0))
      const blocks = select(abs(glyph.sub(16)).lessThan(0.5), f(ex.add(ey).lessThan(0.5)),
        select(abs(glyph.sub(17)).lessThan(0.5), f(mod(ix.add(iy), 2).lessThan(0.5)),
          select(abs(glyph.sub(18)).lessThan(0.5), f(ex.add(ey).lessThan(1.5)),
            mod(floor(glyph.div(quarter.exp2()).add(0.001)), 2))))
      // lines (`setBit`): arms from the middle to the sides, or a dot
      const [mx, my] = BOX_MID
      const atMx = abs(ix.sub(mx)).lessThan(0.5), atMy = abs(iy.sub(my)).lessThan(0.5)
      const armOn = (bit: number) => mod(floor(glyph.div(2 ** bit).add(0.001)), 2).greaterThan(0.5)
      const lineArms = atMx.and(armOn(0).and(iy.lessThanEqual(my)).or(armOn(2).and(iy.greaterThanEqual(my))))
        .or(atMy.and(armOn(3).and(ix.lessThanEqual(mx)).or(armOn(1).and(ix.greaterThanEqual(mx)))))
      const bigDot = ix.greaterThanEqual(mx - 0.5).and(ix.lessThanEqual(mx + 1.5)).and(iy.greaterThanEqual(my - 0.5)).and(iy.lessThanEqual(my + 1.5))
      const lines = select(abs(glyph.sub(16)).lessThan(0.5), f(atMx.and(atMy)), select(abs(glyph.sub(17)).lessThan(0.5), f(bigDot), f(lineArms.and(glyph.lessThan(15.5)))))
      // words: the letter, under how bright it is
      const letterOf = mod(glyph, WORD_STEP)
      const fontAt = (g: N, x: N, y: N) => texture(font, vec2(g.mul(CELL_W).add(x).add(0.5).div(GLYPHS.length * CELL_W), y.add(0.5).div(CELL_H))).r
      const words = f(fontAt(letterOf, ix, iy).greaterThan(0.5))
      // the typewriter (`typedBit`): either strike off line by its slip, less the pixels the ribbon missed
      const hash = (x: N, y: N, k: number) => {
        const a = mod(x.mul(73).add(y.mul(151)).add(k * 29), 1021)
        return mod(a.mul(397).add(k * 7), 1021).div(1021)
      }
      const keyOf = (k: 0 | 1) => {
        const n = float(TYPED[0][k]).toVar()
        for (let i = 1; i < TYPED.length; i++) n.assign(select(abs(glyph.sub(i)).lessThan(0.5), float(TYPED[i][k]), n))
        return n
      }
      const strike = (k: 0 | 1) => {
        const key = keyOf(k)
        const dx = select(hash(cell.x, cell.y, 1 + 2 * k).lessThan(k ? 0.5 : TYPE_SLIP[0]), float(1), float(0))
        const dy = select(hash(cell.x, cell.y, 2 + 2 * k).lessThan(TYPE_SLIP[1]), float(1), float(0))
        const x = ix.sub(dx), y = iy.sub(dy)
        return key.greaterThanEqual(0).and(x.greaterThanEqual(0)).and(y.greaterThanEqual(0)).and(fontAt(max(key, 0), max(x, 0), max(y, 0)).greaterThan(0.5))
      }
      const missed = hash(cell.x.mul(CELL_W).add(ix), cell.y.mul(CELL_H).add(iy), 5).lessThan(TYPE_SLIP[2])
      const typed = f(strike(0).or(strike(1)).and(missed.not()))
      const ribbon = float(TYPE_FAINT).add(hash(cell.x, cell.y, 9).mul(1 - TYPE_FAINT))
      const drawn = select(this.set.lessThan(0.5), f(ascii), select(this.set.lessThan(1.5), f(braille), select(this.set.lessThan(2.5), blocks,
        select(this.set.lessThan(3.5), lines, select(this.set.lessThan(4.5), words, typed)))))
      // on paper a word's brightness is how much ink it lays down, and a typed cell's how worn the ribbon was there
      const levelOf = (s: N) => {
        const v = float(WORD_LEVELS[0]).toVar()
        for (let i = 1; i < WORD_LEVELS.length; i++) v.assign(select(s.greaterThan(i - 0.5), float(WORD_LEVELS[i]), v))
        return v
      }
      const strength = select(abs(this.set.sub(5)).lessThan(0.5), ribbon,
        select(abs(this.set.sub(4)).lessThan(0.5).and(this.inked.greaterThan(0.5)), levelOf(floor(glyph.div(WORD_STEP))), float(1)))
      const on = f(drawn.greaterThan(0.5)).mul(strength).toVar()
      // linear and premultiplied, as the blobs' own draw gives
      return vec4(g.rgb.mul(g.rgb).mul(on), on)
    })()
  }

  /** Frees its targets. */
  dispose() {
    this.picture.dispose()
    this.ids.dispose()
    this.lie.dispose()
    this.depth.dispose()
    for (const g of this.grids) g.dispose()
    this.font.dispose()
    this.words.dispose()
    this.decide.dispose()
    this.show.dispose()
  }
}
