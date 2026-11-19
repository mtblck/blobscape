import { Color, HalfFloatType, Matrix4, NearestFilter, NoBlending, NodeMaterial, PerspectiveCamera, QuadMesh, RenderTarget, Vector2, Vector3, type Camera, type Object3D, type WebGPURenderer } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import { SplatDepth } from './depth.ts'
import { CEL_BRIGHT, CEL_CAST, CEL_EDGE, CEL_FROM, CEL_GLOWS, CEL_INK, CEL_LAMP, CEL_SHADE, CEL_TURN, CEL_UNSURE, shadowView, type CelLook } from '../splat-core/cel.ts'
import { srgbToLinear } from '../splat-core/color.ts'
import { LINE_DEPTH, LINE_PART } from '../splat-core/marks.ts'

// As in engine.ts: the shader builders use TSL untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Fn, abs, dot, float, max, min, mix, select, smoothstep, texture, uniform, uv, vec2, vec3, vec4 } = TSL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
/** The eight ways a line is looked for round a pixel. */
const ROUND: [number, number][] = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)])
/** Where the light is read round a pixel to smooth it, as shares of the smoothing's reach: two rings, the outer turned so no two points line up. */
const SMOOTH: [number, number][] = [
  ...Array.from({ length: 6 }, (_, i) => [0.45 * Math.cos((i * Math.PI) / 3 + 0.3), 0.45 * Math.sin((i * Math.PI) / 3 + 0.3)] as [number, number]),
  ...Array.from({ length: 10 }, (_, i) => [Math.cos((i * Math.PI) / 5), Math.sin((i * Math.PI) / 5)] as [number, number]),
]
/** The light is smoothed only over what lies at much the same depth as the pixel (this share of it), so one thing's shade never runs onto another in front of it. */
const SAME_DEPTH = 0.05

/** Where the light's view is read round a point, as shares of `SHADOW_SPREAD`: the point and eight round it. */
const SHADOW_TAPS: [number, number][] = [[0, 0], ...Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4 + 0.2), Math.sin((i * Math.PI) / 4 + 0.2)] as [number, number])]
/** How far round a point the light's view is read, in its pixels. */
const SHADOW_SPREAD = 2.5
/** How many times the roughness of what the light sees round a point something must be nearer the light than the point to shade it. */
const SHADOW_ROUGH = 2
/** How far to each side the form's slope is measured, as a share of the smoothing's reach. */
const SLOPE_REACH = 0.8
/** How many pixels a side the light's view of the scene is. */
export const SHADOW_SIZE = 2048
/** A point is in shadow when something is nearer the light than it by more than this share of the scene's size (over how squarely it faces the light, at most four times). */
export const SHADOW_BIAS = 0.003

/**
 * Cel shading (splat-core/cel.ts). The frame is drawn four times with the same moved and sorted blobs: the picture in
 * the blobs' own flat colors, a map of depth, a map of parts and a map of tones (how each blob faces the light). The
 * scene is also drawn once as the light sees it, as a map of depth (a shadow map), whenever the blobs or the light
 * have moved. One pass then finds, for each pixel, whether the light sees it; a second smooths that and the facing
 * over each surface, cuts them into light and shade, paints the picture with them and draws an even line round the
 * subject, where one thing passes in front of another, and between its parts.
 *
 * The world must be drawing for it: flat marks, `cel` on, and its first light the one to shade by (`Stage.setCel` sets
 * all three). The frame's camera must be a perspective camera.
 */
export class CelPass {
  /** The picture: every blob flat in its own color. */
  readonly picture = new RenderTarget(1, 1)
  /** The map of parts the lines between parts come from. */
  readonly ids = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  /** The map of tones (`SplatWorld.tones`). */
  readonly tones = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  /** The scene's depth as the light sees it, counted from the near side of the scene. */
  readonly shadow = new RenderTarget(SHADOW_SIZE, SHADOW_SIZE, { type: HalfFloatType, depthBuffer: true, minFilter: NearestFilter, magFilter: NearestFilter })
  /** The light at each pixel before it is smoothed: facing, the share of the light that reaches it, how sure the facing is. */
  private readonly light = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  private readonly depth = new SplatDepth()
  private readonly material = new NodeMaterial()
  private readonly lightMaterial = new NodeMaterial()
  private readonly quad: QuadMesh
  private readonly lightQuad: QuadMesh
  private readonly sun = new PerspectiveCamera()
  private from: readonly number[] = CEL_FROM
  private shadowKey = ''
  // the frame's camera: its place in the world and how its lens scales x and y
  private readonly camWorld = uniform(new Matrix4())
  private readonly camLens = uniform(new Vector2(1, 1))
  // the light's view: the world into it, its lens, where its depths are counted from, and the bias
  private readonly sunView = uniform(new Matrix4())
  private readonly sunLens = uniform(1)
  private readonly sunFrom = uniform(0)
  private readonly sunWay = uniform(new Vector3(0, 1, 0))
  private readonly bias = uniform(0.01)
  private readonly res = uniform(new Vector2(1, 1))
  private readonly ink = uniform(new Vector3())
  private readonly shade = uniform(new Vector3())
  /** The line's width and the smoothing's reach, in device pixels. */
  private readonly width = uniform(2)
  private readonly reach = uniform(6)
  private readonly bright = uniform(0)
  private readonly cast = uniform(1)
  private readonly edge = uniform(CEL_EDGE)
  /** The scene's own light: what its lamps add where they reach, and what its ambient light multiplies both tones by. */
  private readonly lamps = uniform(new Vector3())
  private readonly ambient = uniform(new Vector3(1, 1, 1))

  constructor() {
    this.material.fragmentNode = this.fragment()
    this.material.blending = NoBlending
    this.material.depthTest = false
    this.material.depthWrite = false
    this.quad = new QuadMesh(this.material)
    this.lightMaterial.fragmentNode = this.lightFragment()
    this.lightMaterial.blending = NoBlending
    this.lightMaterial.depthTest = false
    this.lightMaterial.depthWrite = false
    this.lightQuad = new QuadMesh(this.lightMaterial)
  }

  /** The look, and how many device pixels a CSS pixel is. */
  setLook(look: CelLook, ratio: number) {
    const lin = (c: readonly number[]) => [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])] as const
    this.ink.value.set(...lin(look.ink ?? CEL_INK))
    this.shade.value.set(...lin(look.shade ?? CEL_SHADE))
    this.width.value = Math.max(0, look.line ?? 1.5) * ratio
    this.reach.value = Math.max(0.5, (look.smooth ?? 8) * ratio)
    this.bright.value = (look.tones ?? 2) > 2 ? look.bright ?? 0.2 : 0
    this.cast.value = look.shadows === false ? 0 : 1
    this.edge.value = CEL_EDGE + 0.2 * Math.max(0, Math.min(1, look.soft ?? 0))
    this.lamps.value.set(...((look.lamps ?? [0, 0, 0]) as [number, number, number]))
    this.ambient.value.set(...((look.ambient ?? [1, 1, 1]) as [number, number, number]))
    this.from = look.from ?? CEL_FROM
    this.sunWay.value.set(this.from[0], this.from[1], this.from[2]).normalize()
  }

  /** Sizes the pass's targets, in device pixels. */
  setSize(width: number, height: number) {
    if (this.picture.width === width && this.picture.height === height) return
    this.picture.setSize(width, height)
    this.ids.setSize(width, height)
    this.tones.setSize(width, height)
    this.light.setSize(width, height)
    this.depth.setSize(width, height)
    this.res.value.set(width, height)
  }

  /** Draws the scene cel shaded into the renderer's current target, or onto the screen when it has none. */
  render(renderer: WebGPURenderer, scene: Object3D, camera: Camera) {
    const to = renderer.getRenderTarget()
    const webgl = (renderer.backend as unknown as { isWebGLBackend?: boolean }).isWebGLBackend === true
    // WebGPU places the blobs on screen in a pass of its own for one camera at a time, so the light's view is drawn
    // first and the frame's after it; WebGL places them as it draws, so the light's view can reuse the frame's blobs
    if (!webgl && this.cast.value) this.drawShadow(renderer, scene, false)
    renderer.setRenderTarget(this.picture)
    renderer.clear()
    renderer.render(scene, camera)
    if (webgl && this.cast.value) this.drawShadow(renderer, scene, true)
    // each pixel's own depth, not its blob's middle: the pass works out where the pixel is in the world
    const worlds: { depthSloped: boolean }[] = []
    scene.traverse((o) => { if ((o as { isSplatWorld?: boolean }).isSplatWorld) worlds.push(o as unknown as { depthSloped: boolean }) })
    for (const w of worlds) w.depthSloped = true
    try { this.depth.render(renderer, scene, camera) } finally { for (const w of worlds) w.depthSloped = false }
    this.drawMap(renderer, scene, camera, 'parts', this.ids)
    this.drawMap(renderer, scene, camera, 'tones', this.tones)
    camera.updateMatrixWorld()
    this.camWorld.value.copy(camera.matrixWorld)
    this.camLens.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5])
    renderer.setRenderTarget(this.light)
    this.lightQuad.render(renderer)
    renderer.setRenderTarget(to)
    this.quad.render(renderer)
  }

  /**
   * The scene's depth as the light sees it, drawn again only when the blobs or the light have moved. `held` draws the
   * blobs as the frame just placed them (WebGL, where the order they are drawn in does not matter to a depth map).
   */
  private drawShadow(renderer: WebGPURenderer, scene: Object3D, held: boolean) {
    type World = Object3D & { isSplatWorld?: boolean; depthMap: boolean; depthSloped: boolean; depthFrom: number; hold: boolean; stale: boolean; poses: number; posedBox(): { lo: number[]; hi: number[] }; uuid: string }
    const worlds: World[] = []
    const hidden: Object3D[] = []
    scene.traverse((o) => {
      const w = o as World
      if (w.isSplatWorld) { if (o.visible) worlds.push(w) }
      else {
        const d = o as { isMesh?: boolean; isLine?: boolean; isPoints?: boolean }
        if ((d.isMesh || d.isLine || d.isPoints) && o.visible) hidden.push(o)
      }
    })
    const stale = worlds.some((w) => w.stale)
    const key = () => `${worlds.map((w) => `${w.uuid}:${w.poses}`).join(',')}|${this.from.join(',')}`
    if (!stale && key() === this.shadowKey) return
    // one view for every world: round them all
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
    for (const w of worlds) { const b = w.posedBox(); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b.lo[k]); hi[k] = Math.max(hi[k], b.hi[k]) } }
    if (!(lo[0] <= hi[0])) { this.shadowKey = ''; return }
    const v = shadowView([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2, this.from)
    const sun = this.sun
    sun.position.set(v.eye[0], v.eye[1], v.eye[2])
    sun.up.set(v.up[0], v.up[1], v.up[2])
    sun.lookAt(v.target[0], v.target[1], v.target[2])
    sun.fov = v.fov
    sun.aspect = 1
    sun.near = v.near
    sun.far = v.far
    sun.updateProjectionMatrix()
    sun.updateMatrixWorld(true)
    this.sunView.value.copy(sun.matrixWorldInverse)
    this.sunLens.value = sun.projectionMatrix.elements[0]
    this.sunFrom.value = v.near
    this.bias.value = v.radius * SHADOW_BIAS
    const bg = (scene as { background?: unknown }).background
    if (bg) (scene as { background?: unknown }).background = null
    const was = renderer.getRenderTarget()
    const clear = renderer.getClearAlpha(), color = renderer.getClearColor(new Color())
    const holds = worlds.map((w) => w.hold)
    try {
      for (const w of worlds) { w.depthMap = true; w.depthSloped = true; w.depthFrom = v.near; w.hold = held }
      for (const o of hidden) o.visible = false
      renderer.setRenderTarget(this.shadow)
      renderer.setClearColor(0x000000, 0)
      renderer.clear()
      renderer.render(scene, sun)
    } finally {
      renderer.setRenderTarget(was)
      if (bg) (scene as { background?: unknown }).background = bg
      renderer.setClearColor(color, clear)
      worlds.forEach((w, i) => { w.depthMap = false; w.depthSloped = false; w.depthFrom = 0; w.hold = holds[i] })
      for (const o of hidden) o.visible = true
    }
    this.shadowKey = key()
  }

  /** The light at each pixel: its blob's facing and how sure that is, and whether the light sees the point (the shadow map). */
  private lightFragment() {
    const tones = this.tones.texture, depth = this.depth.target.texture, shadow = this.shadow.texture
    return Fn(() => {
      const st = uv().toVar()
      const px = vec2(1).div(this.res).toVar()
      const t = texture(tones, st).toVar()
      const d = texture(depth, st).r.toVar()
      // a point in the camera's frame: back out along a pixel's line of sight by its depth
      // (a pass's rows run down from the top on both backends: up on screen is less of `uv().y`)
      const seenAt = (at: N, far: N) => vec3(at.mul(2).sub(1).mul(vec2(1, -1)).div(this.camLens).mul(far), far.negate())
      const here = seenAt(st, d).toVar()
      const world = this.camWorld.mul(vec4(here, 1)).toVar()
      // the form's own slope where the blob has no flat side to go by (a strand of fur, a scan's thick blobs): from
      // the depth a little way off to each side, taking on each axis the side that is nearer in depth, so the slope
      // is not measured across an edge
      const step = px.mul(this.reach.mul(SLOPE_REACH)).toVar()
      const side = (off: N) => {
        const a = texture(depth, st.add(off)).r.toVar(), b = texture(depth, st.sub(off)).r.toVar()
        const useA = a.greaterThan(0).and(abs(a.sub(d)).lessThan(abs(b.sub(d))).or(b.lessThanEqual(0)))
        const ok = select(useA, a, b).greaterThan(0)
        // from here to the neighbor, always pointing the way of `off`
        const to = select(useA, seenAt(st.add(off), a).sub(here), here.sub(seenAt(st.sub(off), b)))
        return { to, ok }
      }
      const sx = side(vec2(step.x, 0)), sy = side(vec2(0, step.y))
      const slope = TSL.cross(sx.to, sy.to).toVar()
      // toward the camera (which is at the frame's own middle), then into the world
      const out = TSL.normalize(slope.mul(select(dot(slope, here).greaterThan(0), float(-1), float(1))).add(vec3(0, 0, 1e-12)))
      const formed = this.camWorld.mul(vec4(out, 0)).xyz.toVar()
      const formFacing = dot(formed, this.sunWay).mul(0.5).add(0.5)
      const formSure = select(sx.ok.and(sy.ok), float(1), float(0))
      const inSun = this.sunView.mul(world).toVar()
      const far = inSun.z.negate().toVar()
      const at = inSun.xy.mul(this.sunLens).div(max(far, 0.0001)).toVar()
      // a surface the light grazes is deeper from one blob to the next: it is given more room
      const room = this.bias.div(max(t.r.mul(2).sub(1), 0.25)).toVar()
      // what the light sees round the point: how deep it is there on the whole, and how much that varies. Rough
      // things (fur, grass, a scan's loose blobs) shade themselves strand by strand, which is true and reads as dirt:
      // a point is in shadow only when what hides it is nearer the light by more than the roughness there
      const count = float(0).toVar(), sum = float(0).toVar(), squares = float(0).toVar()
      for (const [x, y] of SHADOW_TAPS) {
        const s = at.add(vec2(x, y).mul((2 * SHADOW_SPREAD) / SHADOW_SIZE)).mul(vec2(0.5, -0.5)).add(0.5).toVar() as N
        const m = texture(shadow, s).toVar()
        const drawn = select(m.a.greaterThan(0.5), float(1), float(0))
        count.addAssign(drawn)
        sum.addAssign(m.r.mul(drawn))
        squares.addAssign(m.r.mul(m.r).mul(drawn))
      }
      const mean = sum.div(max(count, 1)).toVar()
      const rough = TSL.sqrt(max(squares.div(max(count, 1)).sub(mean.mul(mean)), 0))
      const behind = far.sub(this.sunFrom).sub(mean).sub(rough.mul(SHADOW_ROUGH))
      // nothing drawn there: the light reaches it
      const seen = select(count.lessThan(0.5), float(1), float(1).sub(TSL.smoothstep(room, room.mul(2), behind)))
      const through = mix(float(1), seen, this.cast)
      // the blob's own facing as far as it is sure of it, the form's for the rest
      const facing = mix(formFacing, t.r, t.b)
      const sure = max(t.b, formSure)
      return vec4(facing, select(d.greaterThan(0), through, float(1)), sure, t.a)
    })()
  }

  /** The same view as a map of parts or of tones: only the blobs, as they were just drawn (nothing is moved or sorted again). */
  private drawMap(renderer: WebGPURenderer, scene: Object3D, camera: Camera, map: 'parts' | 'tones', target: RenderTarget) {
    type World = Object3D & { isSplatWorld?: boolean; parts: boolean; tones: boolean; hold: boolean }
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
      renderer.setRenderTarget(target)
      renderer.clear()
      renderer.render(scene, camera)
    } finally {
      for (const { w, hold } of worlds) { w[map] = false; w.hold = hold }
      for (const o of hidden) o.visible = true
    }
  }

  private fragment() {
    const picture = this.picture.texture, ids = this.ids.texture, tones = this.light.texture, depth = this.depth.target.texture
    // the blobs' own map of tones: its green is how much the scene's lamps reach each (`toned` in engine.ts)
    const reached = this.tones.texture
    return Fn(() => {
      const st = uv().toVar()
      const px = vec2(1).div(this.res).toVar()
      const c = texture(picture, st).toVar()
      const id0 = texture(ids, st).toVar()
      const d0 = texture(depth, st).r.toVar()
      const solid0 = id0.a.greaterThan(0.5)
      const shown0 = c.a.greaterThan(0.5)

      // the light, smoothed over the surface the pixel is on: its own tone, and those round it at much the same depth
      const t0 = texture(tones, st).toVar()
      const here = select(texture(tones, st).a.greaterThan(0.5), float(1), float(0)).toVar()
      const facing = t0.r.mul(t0.b).mul(here).toVar(), sure = t0.b.mul(here).toVar()
      const through = t0.g.mul(here).toVar(), n = float(here).toVar()
      const lamp = texture(reached, st).g.mul(here).toVar()
      for (const [x, y] of SMOOTH) {
        const s = st.add(vec2(x, y).mul(px).mul(this.reach)).toVar()
        const t = texture(tones, s).toVar()
        const ds = texture(depth, s).r
        const w = select(t.a.greaterThan(0.5).and(abs(ds.sub(d0)).lessThanEqual(d0.mul(SAME_DEPTH))), float(1), float(0)).toVar()
        facing.addAssign(t.r.mul(t.b).mul(w))
        sure.addAssign(t.b.mul(w))
        through.addAssign(t.g.mul(w))
        lamp.addAssign(texture(reached, s).g.mul(w))
        n.addAssign(w)
      }
      // a pixel with nothing flat round it has no facing: it is taken as turned a little to the light
      const f = select(sure.greaterThan(0.05), facing.div(max(sure, 0.0001)), float(CEL_UNSURE)).toVar()
      const th = select(n.greaterThan(0.5), through.div(max(n, 1)), float(1)).toVar()
      // cut into tones. CPU twin: `celTones` and `celColor` in splat-core/cel.ts (change both)
      const e = this.edge
      const cast = mix(float(1), smoothstep(float(CEL_CAST).sub(e), float(CEL_CAST).add(e), th), this.cast)
      const lit = smoothstep(float(CEL_TURN).sub(e), float(CEL_TURN).add(e), f).mul(cast).toVar()
      const brightest = lit.mul(smoothstep(float(CEL_BRIGHT).sub(e), float(CEL_BRIGHT).add(e), f)).mul(this.bright)
      const own = c.rgb.div(max(c.a, 0.001)).toVar()
      // the scene's own light: its ambient over both tones, one more tone where its lamps reach, and what gives its own
      // light never darker than its own color
      const lamped = select(n.greaterThan(0.5), lamp.div(max(n, 1)), float(0)).toVar()
      const by = this.ambient.mul(mix(this.shade, vec3(1), lit)).add(this.lamps.mul(smoothstep(float(CEL_LAMP - CEL_EDGE), float(CEL_LAMP + CEL_EDGE), lamped))).toVar()
      by.assign(mix(by, max(by, vec3(1)), smoothstep(float(CEL_GLOWS - CEL_EDGE), float(CEL_GLOWS + CEL_EDGE), lamped)))
      const toned = own.mul(by).toVar()
      const painted = toned.add(max(vec3(1).sub(toned), vec3(0)).mul(brightest)).mul(c.a).toVar()

      // the line: where the picture ends, where something is clearly nearer, and between parts at one depth
      const hits = float(0).toVar(), partHits = float(0).toVar()
      for (const [x, y] of ROUND) {
        const off = vec2(x, y).mul(px)
        const s = st.add(off.mul(this.width)).toVar()
        const idn = texture(ids, s).toVar()
        const dn = texture(depth, s).r.toVar()
        const edge = shown0.notEqual(texture(picture, s).a.greaterThan(0.5))
        const nearer = solid0.and(idn.a.greaterThan(0.5)).and(d0.sub(dn).greaterThan(d0.mul(LINE_DEPTH)))
        hits.addAssign(select(edge.or(nearer), float(1), float(0)))
        const sp = st.add(off.mul(this.width.mul(LINE_PART))).toVar()
        const idp = texture(ids, sp).toVar()
        const dp = texture(depth, sp).r
        const other = solid0.and(idp.a.greaterThan(0.5)).and(abs(idp.r.sub(id0.r)).add(abs(idp.g.sub(id0.g))).add(abs(idp.b.sub(id0.b))).greaterThan(0.002))
        const level = abs(d0.sub(dp)).lessThanEqual(d0.mul(LINE_DEPTH))
        const lower = id0.r.mul(65536).add(id0.g.mul(256)).add(id0.b).lessThan(idp.r.mul(65536).add(idp.g.mul(256)).add(idp.b))
        partHits.addAssign(select(other.and(level).and(lower), float(1), float(0)))
      }
      // an even line: two of the eight looks make it whole, and it has no swell, wobble or breaks
      const a = select(this.width.greaterThan(0.01), max(min(hits.div(2), 1), min(partHits.div(2), 1)), float(0)).toVar()
      const rgb = painted.mul(float(1).sub(a)).add(this.ink.mul(a))
      const alpha = c.a.add(a.mul(float(1).sub(c.a)))
      return vec4(rgb, alpha)
    })()
  }

  /** Frees its targets. */
  dispose() {
    this.picture.dispose()
    this.ids.dispose()
    this.tones.dispose()
    this.light.dispose()
    this.shadow.dispose()
    this.lightMaterial.dispose()
    this.depth.dispose()
    this.material.dispose()
  }
}
