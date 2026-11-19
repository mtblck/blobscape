import { HalfFloatType, LinearFilter, NearestFilter, NoBlending, NodeMaterial, QuadMesh, RenderTarget, Vector2, Vector3, type Camera, type Object3D, type Texture, type WebGPURenderer } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import { SplatDepth } from './depth.ts'
import { srgbToLinear } from '../splat-core/color.ts'
import { LINE_DEPTH, LINE_PART } from '../splat-core/marks.ts'
import { WASH_MARGIN, WASH_PAPER, WASH_PENCIL, WASH_RICH, WASH_SKY, WASH_UNEVEN, WASH_WHITE, type WashLook } from '../splat-core/wash.ts'

// As in engine.ts: the shader builders use TSL untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Fn, abs, clamp, dot, float, floor, fract, length, max, min, mix, pow, select, sin, smoothstep, texture, uniform, uv, vec2, vec3, vec4 } = TSL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any

/** The eight ways the pencil's line is looked for round a pixel. */
const ROUND: [number, number][] = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)])
/** The picture is softened twice: a little at half its size (the wash itself) and widely at a quarter (what the wash is compared with to find where it ends or changes). Each one's width in its own pixels. */
const SOFT = [1.1, 3]
/** How strongly a change of color and the end of a wash count as an edge where paint pools. */
const POOL_COLOR = 2.2
const POOL_COVER = 2.4

/** A blur's taps along one way: whole steps out to 2.5 widths, with weights that sum to 1. */
function taps(sigma: number): [number, number][] {
  const reach = Math.max(1, Math.ceil(sigma * 2.5))
  const out: [number, number][] = []
  let sum = 0
  for (let i = -reach; i <= reach; i++) { const w = Math.exp((-i * i) / (2 * sigma * sigma)); out.push([i, w]); sum += w }
  return out.map(([i, w]) => [i, w / sum])
}

/**
 * Watercolor (splat-core/wash.ts). The frame is drawn three times with the same moved and sorted blobs (the picture
 * in the blobs' own flat colors, and for the pencil a map of depth and a map of parts). The picture is softened at
 * half and at a quarter of its size, and one pass paints the paper: each pixel reads the softened picture a little
 * to one side (the paper's own wander, fixed on the screen, so a wash's edge runs unevenly), takes its color as
 * pigment, and lays it on the paper as see-through paint (`washed`): thinner and thicker from place to place,
 * gathered into the paper's grain, darker where the wash ends or its color changes (the softened picture against
 * the more softened one), and not at all where the picture is lightest. A look's sky is a wash behind the subject
 * that stops short of the paper's edge; a faint pencil line runs where outlines would.
 *
 * The world should be drawing flat marks (`Stage.setWash` sets them).
 */
export class WashPass {
  /** The picture: every blob flat in its own color. */
  readonly picture = new RenderTarget(1, 1, { minFilter: LinearFilter, magFilter: LinearFilter })
  /** The map of parts the pencil's lines between parts come from. */
  readonly ids = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  private readonly softs = [0, 1].map(() => [0, 1].map(() => new RenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false })))
  private readonly depth = new SplatDepth()
  private readonly materials: NodeMaterial[] = []
  private readonly blurs: QuadMesh[]
  private readonly finish: QuadMesh
  private readonly res = uniform(new Vector2(1, 1))
  /** How many device pixels a CSS pixel is: the paper's grain and wander are sized in CSS pixels. */
  private readonly ratio = uniform(1)
  private readonly bleed = uniform(4)
  private readonly pool = uniform(0.6)
  private readonly grain = uniform(0.5)
  private readonly strength = uniform(0.85)
  private readonly pencil = uniform(0.35)
  private readonly paper = uniform(new Vector3(1, 1, 1))
  private readonly lead = uniform(new Vector3())
  private readonly skyTop = uniform(new Vector3(1, 1, 1))
  private readonly skyBottom = uniform(new Vector3(1, 1, 1))
  private readonly skied = uniform(0)

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
    const [[h0, h1], [q0]] = this.softs
    this.blurs = [
      quad(this.blurPass(this.picture.texture, [1, 0], 2, SOFT[0])),
      quad(this.blurPass(h0.texture, [0, 1], 2, SOFT[0])),
      quad(this.blurPass(h1.texture, [1, 0], 4, SOFT[1])),
      quad(this.blurPass(q0.texture, [0, 1], 4, SOFT[1])),
    ]
    this.finish = quad(this.fragment())
  }

  /** The look, and how many device pixels a CSS pixel is. */
  setLook(look: WashLook, ratio: number) {
    const lin = (c: readonly number[]) => [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])] as const
    const unit = (v: number | undefined, d: number) => Math.max(0, Math.min(1, v ?? d))
    this.ratio.value = Math.max(0.5, ratio)
    this.bleed.value = Math.max(0, look.bleed ?? 4) * ratio
    this.pool.value = unit(look.pool, 0.6)
    this.grain.value = unit(look.grain, 0.35)
    this.strength.value = unit(look.strength, 0.7)
    this.pencil.value = unit(look.pencil, 0.55)
    this.paper.value.set(...lin(look.paper ?? WASH_PAPER))
    this.lead.value.set(...lin(WASH_PENCIL))
    this.skied.value = look.sky ? 1 : 0
    if (look.sky) { this.skyTop.value.set(...lin(look.sky[0])); this.skyBottom.value.set(...lin(look.sky[1])) }
  }

  /** Sizes the pass's targets, in device pixels. */
  setSize(width: number, height: number) {
    if (this.picture.width === width && this.picture.height === height) return
    this.picture.setSize(width, height)
    this.ids.setSize(width, height)
    this.depth.setSize(width, height)
    this.softs.forEach((pair, k) => { for (const t of pair) t.setSize(Math.max(1, width >> (k + 1)), Math.max(1, height >> (k + 1))) })
    this.res.value.set(width, height)
  }

  /** Draws the scene in watercolor into the renderer's current target, or onto the screen when it has none. */
  render(renderer: WebGPURenderer, scene: Object3D, camera: Camera) {
    const to = renderer.getRenderTarget()
    renderer.setRenderTarget(this.picture)
    renderer.clear()
    renderer.render(scene, camera)
    if (this.pencil.value > 0) {
      this.depth.render(renderer, scene, camera)
      this.drawParts(renderer, scene, camera)
    }
    const [[h0, h1], [q0, q1]] = this.softs
    ;[h0, h1, q0, q1].forEach((t, k) => { renderer.setRenderTarget(t); this.blurs[k].render(renderer) })
    renderer.setRenderTarget(to)
    this.finish.render(renderer)
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

  /** One way of a blur: `from` read at steps of one of its own pixels (`size` picture pixels), widened with the picture so a wash keeps its share of it. */
  private blurPass(from: Texture, way: [number, number], size: number, sigma: number) {
    return Fn(() => {
      const st = uv().toVar()
      const step = vec2(way[0], way[1]).mul(size).div(this.res).mul(max(this.res.y.div(800), 1)).toVar()
      const sum = vec4(0).toVar()
      for (const [i, w] of taps(sigma)) sum.addAssign(texture(from, st.add(step.mul(i))).mul(w))
      return sum
    })()
  }

  /** The paper with its washes and pencil. CPU twins: `pigment`, `kept`, `density`, `washed` in wash.ts; change both. */
  private fragment() {
    const picture = this.picture.texture, ids = this.ids.texture, depth = this.depth.target.texture
    const [[, soft], [, wide]] = this.softs
    return Fn(() => {
      const st = uv().toVar()
      const px = vec2(1).div(this.res).toVar()
      // the paper, in CSS pixels, fixed on the screen: smooth noise for where water wanders, fine noise for the tooth
      const cell = st.mul(this.res).div(this.ratio).toVar()
      const hash = (p: N) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453))
      const noise = (p: N) => {
        const i = floor(p).toVar(), f = p.sub(i).toVar()
        const u = f.mul(f).mul(vec2(3).sub(f.mul(2))).toVar()
        return mix(mix(hash(i), hash(i.add(vec2(1, 0))), u.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), u.x), u.y)
      }
      const wander = vec2(noise(cell.div(34)), noise(cell.div(34).add(31.7))).sub(0.5).add(vec2(noise(cell.div(9).add(5.1)), noise(cell.div(9).add(77.3))).sub(0.5).mul(0.4)).mul(2).mul(this.bleed)
      const at = st.add(wander.mul(px)).toVar()
      const water = noise(cell.div(70).add(11.3)).mul(0.65).add(noise(cell.div(23).add(3.9)).mul(0.35)).toVar()
      const tooth = noise(cell.div(1.7)).mul(0.6).add(noise(cell.div(4.3).add(19.1)).mul(0.4)).toVar()

      const s = texture(soft.texture, at).toVar(), w = texture(wide.texture, at).toVar()
      const color = s.rgb.div(max(s.a, 0.001)).toVar(), around = w.rgb.div(max(w.a, 0.001))
      // the wash's cover, with a soft uneven edge; and how near its edge or a change of color this is
      const cover = smoothstep(0.3, 0.62, s.a).toVar()
      const edge = clamp(length(color.sub(around)).mul(POOL_COLOR).mul(w.a).add(abs(s.a.sub(w.a)).mul(POOL_COVER)), 0, 1).mul(cover)
      const gray = dot(color, vec3(0.2126, 0.7152, 0.0722))
      const paint = clamp(color.sub(gray).mul(WASH_RICH).add(gray), 0.02, 1)
      const top = max(color.r, max(color.g, color.b))
      const keep = smoothstep(0, 1, clamp(float(WASH_WHITE[0]).sub(top).div(WASH_WHITE[0] - WASH_WHITE[1]), 0, 1))
      const lay = (cov: N, edged: N) => cov.mul(this.strength).mul(water.sub(0.5).mul(2 * WASH_UNEVEN).add(1)).mul(tooth.sub(0.5).mul(this.grain).add(1)).mul(edged.mul(this.pool).add(1))
      const amount = lay(cover.mul(keep), edge).toVar()

      // the wash behind: the sky's colors, stopping short of the paper's edge along an uneven line
      const inFrom = min(min(st.x, float(1).sub(st.x)).mul(this.res.x.div(this.res.y)), min(st.y, float(1).sub(st.y)))
      const margin = float(WASH_MARGIN).mul(noise(cell.div(48).add(41.7)).add(noise(cell.div(13).add(8.8)).mul(0.35)).add(0.4))
      const behind = smoothstep(margin, margin.add(0.012), inFrom).mul(this.skied).toVar()
      const rim = smoothstep(margin.add(0.03), margin, inFrom).mul(behind)
      const skyPaint = clamp(mix(this.skyTop, this.skyBottom, st.y), 0.02, 1)
      const skyAmount = lay(behind.mul(float(1).sub(cover)).mul(WASH_SKY), rim)

      const sheet = this.paper.mul(float(1).sub(tooth.sub(0.5).mul(0.05)))
      const rgb = sheet.mul(pow(skyPaint, vec3(skyAmount))).mul(pow(paint, vec3(amount))).toVar()

      // the pencil under the paint: round the subject, where something is clearly nearer, and between parts
      const c = texture(picture, st).toVar()
      const id0 = texture(ids, st).toVar()
      const d0 = texture(depth, st).r.toVar()
      const solid0 = id0.a.greaterThan(0.5)
      const hits = float(0).toVar(), partHits = float(0).toVar()
      const reach = this.ratio.mul(0.9)
      for (const [x, y] of ROUND) {
        const off = vec2(x, y).mul(px)
        const p = st.add(off.mul(reach)).toVar()
        const idn = texture(ids, p).toVar()
        const dn = texture(depth, p).r.toVar()
        const edgeN = c.a.greaterThan(0.5).notEqual(texture(picture, p).a.greaterThan(0.5))
        const nearer = solid0.and(idn.a.greaterThan(0.5)).and(d0.sub(dn).greaterThan(d0.mul(LINE_DEPTH)))
        hits.addAssign(select(edgeN.or(nearer), float(1), float(0)))
        const sp = st.add(off.mul(reach.mul(LINE_PART))).toVar()
        const idp = texture(ids, sp).toVar()
        const dp = texture(depth, sp).r
        const other = solid0.and(idp.a.greaterThan(0.5)).and(abs(idp.r.sub(id0.r)).add(abs(idp.g.sub(id0.g))).add(abs(idp.b.sub(id0.b))).greaterThan(0.002))
        const level = abs(d0.sub(dp)).lessThanEqual(d0.mul(LINE_DEPTH))
        const lower = id0.r.mul(65536).add(id0.g.mul(256)).add(id0.b).lessThan(idp.r.mul(65536).add(idp.g.mul(256)).add(idp.b))
        partHits.addAssign(select(other.and(level).and(lower), float(1), float(0)))
      }
      // graphite catches on the paper's tooth, and the hand presses unevenly
      const drawn = max(min(hits.div(3), 1), min(partHits.div(3), 1).mul(0.7)).mul(this.pencil).mul(tooth.mul(0.7).add(0.5)).mul(water.mul(0.5).add(0.6))
      return vec4(mix(rgb, this.lead, clamp(drawn, 0, 1)), 1)
    })()
  }

  /** Frees its targets. */
  dispose() {
    this.picture.dispose()
    this.ids.dispose()
    this.depth.dispose()
    for (const pair of this.softs) for (const t of pair) t.dispose()
    for (const m of this.materials) m.dispose()
  }
}
