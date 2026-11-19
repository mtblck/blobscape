import { HalfFloatType, LinearFilter, Matrix4, NearestFilter, NoBlending, NodeMaterial, QuadMesh, RenderTarget, Vector2, Vector3, type Camera, type Object3D, type Texture, type WebGPURenderer } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import { SplatDepth } from './depth.ts'
import { srgbToLinear } from '../splat-core/color.ts'
import { LINE_DEPTH, LINE_PART } from '../splat-core/marks.ts'
import { NEON_BLACK, NEON_BODY, NEON_COLORS, NEON_FLOOR, NEON_REST, NEON_SECOND, NEON_SHIFT, NEON_TAIL, NEON_VIVID, NEON_WAYS, type NeonLook } from '../splat-core/neon.ts'

// As in engine.ts: the shader builders use TSL untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Fn, abs, clamp, dot, float, floor, fract, max, min, pow, select, sin, texture, uniform, uv, vec2, vec3, vec4 } = TSL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any

/** The eight ways a tube is looked for round a pixel. */
const ROUND: [number, number][] = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)])
/** The tubes' light is spread three times, each wider: at a half, a quarter and an eighth of the picture's size. These are each one's width in its own pixels. */
const SPREAD = [3, 4, 5]
/** How much of each spread is the glow seen round a tube, and how much lights the bodies (the widest counts most there: it is the light that travels). */
const HALO = [0.8, 0.8, 0.7]
const CATCH = [0.9, 1.3, 1.2]
/** How much white is laid down the middle of a tube at full light, as a hot core. */
const CORE = 0.45

/** A blur's taps along one way: whole steps out to 2.5 widths, with weights that sum to 1. */
function taps(sigma: number): [number, number][] {
  const reach = Math.max(1, Math.ceil(sigma * 2.5))
  const out: [number, number][] = []
  let sum = 0
  for (let i = -reach; i <= reach; i++) { const w = Math.exp((-i * i) / (2 * sigma * sigma)); out.push([i, w]); sum += w }
  return out.map(([i, w]) => [i, w / sum])
}

/**
 * Neon (splat-core/neon.ts): tubes of light along the picture's outlines, over bodies kept dark that catch the
 * tubes' light. The frame is drawn three times with the same moved and sorted blobs (the picture in the blobs' own
 * flat colors, a map of depth and a map of parts), as outlines are (inkLines.ts), and the tubes run where those
 * lines would: round the subject, where one thing passes in front of another, and between its parts. A tube takes
 * the color of the thing it goes round at full strength (`neonColor`), or one of the look's colors by its part, and
 * shines by where it is in the world: pulses of light run through the scene two ways (`shineAt`), so the light
 * travels along the tubes. The tubes' light is then spread at three sizes, and the last pass paints each body in its
 * own color times the light that reaches it, with the glow and the tubes over it.
 *
 * The world should be drawing flat marks with no light of its own (`Stage.setNeon` sets both). The frame's camera
 * must be a perspective camera.
 */
export class NeonPass {
  /** The picture: every blob flat in its own color. */
  readonly picture = new RenderTarget(1, 1)
  /** The map of parts the tubes between parts come from. */
  readonly ids = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  /** The tubes alone: their light, and how much of the pixel they cover. */
  private readonly tubes = new RenderTarget(1, 1, { minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false })
  private readonly spreads = [0, 1, 2].map(() => [0, 1].map(() => new RenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false })))
  private readonly depth = new SplatDepth()
  private readonly materials: NodeMaterial[] = []
  private readonly tubeQuad: QuadMesh
  private readonly blurs: QuadMesh[]
  private readonly finish: QuadMesh
  private readonly res = uniform(new Vector2(1, 1))
  private readonly camWorld = uniform(new Matrix4())
  private readonly camLens = uniform(new Vector2(1, 1))
  /** A tube's half width, in device pixels. */
  private readonly width = uniform(2)
  private readonly glow = uniform(1)
  private readonly body = uniform(NEON_BODY)
  /** How many pulses have gone by, and the two ways they run, in pulses a unit of the world. */
  private readonly turn = uniform(0)
  private readonly ways = [uniform(new Vector3()), uniform(new Vector3())]
  private readonly count = uniform(0)
  private readonly colors = Array.from({ length: NEON_COLORS }, () => uniform(new Vector3(1, 1, 1)))

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
    this.tubeQuad = quad(this.tubeFragment())
    const [[h0, h1], [q0, q1], [e0]] = this.spreads
    this.blurs = [
      quad(this.blurPass(this.tubes.texture, [1, 0], 2, SPREAD[0])),
      quad(this.blurPass(h0.texture, [0, 1], 2, SPREAD[0])),
      quad(this.blurPass(h1.texture, [1, 0], 4, SPREAD[1])),
      quad(this.blurPass(q0.texture, [0, 1], 4, SPREAD[1])),
      quad(this.blurPass(q1.texture, [1, 0], 8, SPREAD[2])),
      quad(this.blurPass(e0.texture, [0, 1], 8, SPREAD[2])),
    ]
    this.finish = quad(this.fragment())
  }

  /**
   * The look, how many device pixels a CSS pixel is, the scene's size in the world (which the pulses are spaced by)
   * and the stage's time in seconds.
   */
  setLook(look: NeonLook, ratio: number, size: number, time: number) {
    this.width.value = Math.max(0.5, ((look.line ?? 2) / 2) * ratio)
    this.glow.value = Math.max(0, Math.min(2, look.glow ?? 1))
    this.body.value = Math.max(0, look.body ?? NEON_BODY)
    const period = look.period ?? 4
    this.turn.value = period > 0 ? time / period : 0
    const apart = Math.max(1e-4, (look.apart ?? 0.45) * Math.max(size, 1e-4))
    NEON_WAYS.forEach((w, k) => this.ways[k].value.set(w[0] / apart, w[1] / apart, w[2] / apart))
    const colors = look.colors?.slice(0, NEON_COLORS) ?? []
    this.count.value = colors.length
    colors.forEach((c, k) => this.colors[k].value.set(srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])))
  }

  /** Sizes the pass's targets, in device pixels. */
  setSize(width: number, height: number) {
    if (this.picture.width === width && this.picture.height === height) return
    this.picture.setSize(width, height)
    this.ids.setSize(width, height)
    this.tubes.setSize(width, height)
    this.depth.setSize(width, height)
    this.spreads.forEach((pair, k) => { for (const t of pair) t.setSize(Math.max(1, width >> (k + 1)), Math.max(1, height >> (k + 1))) })
    this.res.value.set(width, height)
  }

  /** Draws the scene in neon into the renderer's current target, or onto the screen when it has none. */
  render(renderer: WebGPURenderer, scene: Object3D, camera: Camera) {
    const to = renderer.getRenderTarget()
    renderer.setRenderTarget(this.picture)
    renderer.clear()
    renderer.render(scene, camera)
    this.depth.render(renderer, scene, camera)
    this.drawParts(renderer, scene, camera)
    camera.updateMatrixWorld()
    this.camWorld.value.copy(camera.matrixWorld)
    this.camLens.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5])
    const pass = (quad: QuadMesh, into: RenderTarget) => { renderer.setRenderTarget(into); quad.render(renderer) }
    pass(this.tubeQuad, this.tubes)
    const [[h0, h1], [q0, q1], [e0, e1]] = this.spreads
    ;[h0, h1, q0, q1, e0, e1].forEach((t, k) => pass(this.blurs[k], t))
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

  /** The tubes: where they run, each one's color and how brightly it shines there. CPU twins: `neonColor`, `shineAt`, `colorOf`. */
  private tubeFragment() {
    const picture = this.picture.texture, ids = this.ids.texture, depth = this.depth.target.texture
    return Fn(() => {
      const st = uv().toVar()
      const px = vec2(1).div(this.res).toVar()
      const c = texture(picture, st).toVar()
      const id0 = texture(ids, st).toVar()
      const d0 = texture(depth, st).r.toVar()
      const solid0 = id0.a.greaterThan(0.5)
      const shown0 = c.a.greaterThan(0.5)
      // the thing a tube here would go round: this pixel's own, unless the tube is found from outside it or behind it
      const owner = c.toVar(), ownerId = id0.rgb.toVar(), ownerD = d0.toVar()
      const hits = float(0).toVar(), partHits = float(0).toVar()
      for (const [x, y] of ROUND) {
        const off = vec2(x, y).mul(px)
        const s = st.add(off.mul(this.width)).toVar()
        const idn = texture(ids, s).toVar()
        const dn = texture(depth, s).r.toVar()
        const from = texture(picture, s).toVar()
        const solidn = idn.a.greaterThan(0.5)
        const shownN = from.a.greaterThan(0.5)
        // the picture's own edge, from either side; and something clearly nearer, from behind it
        const edge = shown0.notEqual(shownN)
        const nearer = solid0.and(solidn).and(d0.sub(dn).greaterThan(d0.mul(LINE_DEPTH)))
        hits.addAssign(select(edge.or(nearer), float(1), float(0)))
        const theirs = nearer.or(edge.and(shownN)).and(dn.greaterThan(0))
        owner.assign(select(theirs, from, owner))
        ownerId.assign(select(theirs, idn.rgb, ownerId))
        ownerD.assign(select(theirs, dn, ownerD))
        // another part beside this one, at much the same depth: a thinner tube, on the lower-numbered part's side
        const sp = st.add(off.mul(this.width.mul(LINE_PART))).toVar()
        const idp = texture(ids, sp).toVar()
        const dp = texture(depth, sp).r
        const other = solid0.and(idp.a.greaterThan(0.5)).and(abs(idp.r.sub(id0.r)).add(abs(idp.g.sub(id0.g))).add(abs(idp.b.sub(id0.b))).greaterThan(0.002))
        const level = abs(d0.sub(dp)).lessThanEqual(d0.mul(LINE_DEPTH))
        const lower = id0.r.mul(65536).add(id0.g.mul(256)).add(id0.b).lessThan(idp.r.mul(65536).add(idp.g.mul(256)).add(idp.b))
        partHits.addAssign(select(other.and(level).and(lower), float(1), float(0)))
      }
      // three of the eight looks make a full tube; fewer, its soft edge
      const a = max(min(hits.div(3), 1), min(partHits.div(3), 1).mul(0.8)).toVar()
      // each part's own number, 0 to 1: it shifts the part's pulses and deals it a color
      const shift = fract(sin(dot(ownerId, vec3(12.9898, 78.233, 37.719))).mul(43758.5453)).toVar()
      const own = owner.rgb.div(max(owner.a, 0.001)).toVar()
      const tube = neonColorNode(own).toVar()
      const which = min(floor(shift.mul(this.count)), this.count.sub(1))
      const dealt = vec3(this.colors[0]).toVar()
      for (let k = 1; k < NEON_COLORS; k++) dealt.assign(select(which.greaterThan(k - 0.5), this.colors[k], dealt))
      tube.assign(select(this.count.greaterThan(0.5), dealt, tube))
      // where the tube is in the world: back out along the pixel's line of sight by its thing's depth
      // (a pass's rows run down from the top on both backends: up on screen is less of `uv().y`)
      const here = vec3(st.mul(2).sub(1).mul(vec2(1, -1)).div(this.camLens).mul(ownerD), ownerD.negate())
      const world = this.camWorld.mul(vec4(here, 1)).xyz.toVar()
      const beat = (phase: N) => pow(float(1).sub(fract(phase)), NEON_TAIL)
      const lit = max(beat(dot(world, this.ways[0]).add(shift.mul(NEON_SHIFT)).sub(this.turn)), beat(dot(world, this.ways[1]).add(shift.mul(NEON_SHIFT)).sub(this.turn)).mul(NEON_SECOND))
      const shine = lit.mul(1 - NEON_REST).add(NEON_REST)
      return vec4(tube.mul(shine).mul(a), a)
    })()
  }

  /** One way of a blur: `from` read at steps of one of its own pixels (`size` picture pixels), widened with the picture so the glow keeps its share of it. */
  private blurPass(from: Texture, way: [number, number], size: number, sigma: number) {
    return Fn(() => {
      const st = uv().toVar()
      const step = vec2(way[0], way[1]).mul(size).div(this.res).mul(max(this.res.y.div(800), 1)).toVar()
      const sum = vec4(0).toVar()
      for (const [i, w] of taps(sigma)) sum.addAssign(texture(from, st.add(step.mul(i))).mul(w))
      return sum
    })()
  }

  /** The picture: each body in its own color times the light that reaches it (`bodyColor`), the glow round the tubes, and the tubes. */
  private fragment() {
    const [[, h], [, q], [, e]] = this.spreads
    return Fn(() => {
      const st = uv().toVar()
      const c = texture(this.picture.texture, st).toVar()
      const tube = texture(this.tubes.texture, st).toVar()
      const near = texture(h.texture, st).rgb.toVar(), mid = texture(q.texture, st).rgb.toVar(), far = texture(e.texture, st).rgb.toVar()
      const own = c.rgb.div(max(c.a, 0.001))
      const light = near.mul(CATCH[0]).add(mid.mul(CATCH[1])).add(far.mul(CATCH[2])).mul(this.glow)
      const body = own.mul(light.add(this.body)).mul(c.a)
      const halo = near.mul(HALO[0]).add(mid.mul(HALO[1])).add(far.mul(HALO[2])).mul(this.glow).toVar()
      // a hot core: white down the middle of a tube, by how brightly it shines there
      const top = max(tube.r, max(tube.g, tube.b))
      const core = tube.rgb.add(vec3(top.mul(top).mul(tube.a).mul(CORE)))
      const rgb = min(body.mul(float(1).sub(tube.a)).add(core).add(halo), 1).toVar()
      // over empty ground only the glow shows, as light added to whatever is behind the canvas
      const alpha = clamp(max(max(c.a, tube.a), max(rgb.r, max(rgb.g, rgb.b))), 0, 1)
      // linear color out, as the blobs' own draw gives
      return vec4(rgb, alpha)
    })()
  }

  /** Frees its targets. */
  dispose() {
    this.picture.dispose()
    this.ids.dispose()
    this.tubes.dispose()
    this.depth.dispose()
    for (const pair of this.spreads) for (const t of pair) t.dispose()
    for (const m of this.materials) m.dispose()
  }
}

/** A tube's color for the color of the thing it goes round. CPU twin: `neonColor` in neon.ts; change both. */
function neonColorNode(rgb: N) {
  const top = max(rgb.r, max(rgb.g, rgb.b)).toVar()
  const c = rgb.div(max(top, 1e-5)).toVar()
  const gray = dot(c, vec3(0.2126, 0.7152, 0.0722))
  const v = clamp(c.sub(gray).mul(NEON_VIVID).add(gray), 0, 1).toVar()
  const most = max(max(v.r, max(v.g, v.b)), 1e-4)
  return select(top.greaterThan(NEON_BLACK), max(v.div(most), NEON_FLOOR), vec3(1))
}
