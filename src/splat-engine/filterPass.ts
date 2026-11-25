import { HalfFloatType, LinearFilter, Matrix4, NearestFilter, NoBlending, NodeMaterial, QuadMesh, RenderTarget, Vector2, Vector3, Vector4, type Camera, type Object3D, type WebGPURenderer } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import { SplatDepth } from './depth.ts'
import { LINE_DEPTH, LINE_PART } from '../splat-core/marks.ts'
import {
  BLUEPRINT_INK, BLUEPRINT_PAPER, CLAY_BACK, CLAY_KEY, CLAY_SMOOTH_PX, CLAY_TAPS, CRT_BACK, CRT_BAND, CRT_BAND_PX, CRT_BLEED_PX, CRT_BLEED_TAPS, CRT_FPS, CRT_ROLLS, CRT_WANDERS,
  CUTOUT_CARD, CUTOUT_LAYER, CUTOUT_SHADE, CUTOUT_TAPS, DIM_ARROW, DIM_TICKS, GRID_MAJOR, GRID_MINOR, MOSAIC_GROUND, MOSAIC_GROUT, MOSAIC_TAPS, PRINT_DENT, PRINT_RIDGE, PRINT_RINGS,
  PRINT_SHARE, CLAY_DEEP, CLAY_HOLLOW, CLAY_SHADE_PX, RAGGED_GRAIN, RAGGED_PX, THERMAL_EMIT, THERMAL_SKY, THERMAL_SPREAD_GAIN, THERMAL_STOPS, THERMAL_TAPS, THERMAL_WHITE, clayFrame, dimPlaces, grainFrame, lightWay, toLinear,
  type FilterKind, type FilterLook, type ScreenBox,
} from '../splat-core/filters.ts'

// As in engine.ts: the shader builders use TSL untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Fn, abs, clamp, cross, dot, float, floor, fract, int, length, max, min, mix, normalize, pow, select, sin, smoothstep, texture, uniform, uniformArray, uv, vec2, vec3, vec4 } = TSL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any

/** The eight ways an outline is looked for round a pixel. */
const ROUND: [number, number][] = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)])
/** A number from 0 to 1 for a place. CPU twin: `hash2` in filters.ts. */
const hash = (v: N) => fract(sin(dot(v, vec2(127.1, 311.7))).mul(43758.5453))
/** Smooth value noise. CPU twin: `noise2`. */
const noise = (v: N) => {
  const i = floor(v).toVar(), f = v.sub(i).toVar()
  const u = f.mul(f).mul(vec2(3).sub(f.mul(2))).toVar()
  return mix(mix(hash(i), hash(i.add(vec2(1, 0))), u.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), u.x), u.y)
}
/** A number from 0 to 1 for a cell of the world. CPU twin: `printHash`. */
const cellHash = (c: N, salt: N) => fract(sin(dot(c, vec3(127.1, 311.7, 74.7)).add(float(salt).mul(19.19))).mul(43758.5453))
const lumaOf = (c: N) => dot(c, vec3(0.2126, 0.7152, 0.0722))
/** Whether two places of the map of parts are different parts. */
const differs = (a: N, b: N) => abs(a.r.sub(b.r)).add(abs(a.g.sub(b.g))).add(abs(a.b.sub(b.b))).greaterThan(0.002)
/** How much of a segment `half` pixels wide covers a point (all in device pixels). CPU twin: `segment`. */
const segment = (p: N, a: N, b: N, half: N) => {
  const d = b.sub(a), len2 = dot(d, d)
  const t = clamp(dot(p.sub(a), d).div(max(len2, 1e-6)), 0, 1)
  return clamp(float(half).add(0.5).sub(length(p.sub(a).sub(d.mul(t)))), 0, 1)
}

/** What each look draws besides the picture, and how the world draws for it. */
const NEEDS: Record<FilterKind, { depth: boolean; parts: boolean }> = {
  thermal: { depth: false, parts: false },
  crt: { depth: false, parts: false },
  blueprint: { depth: true, parts: true },
  mosaic: { depth: false, parts: true },
  cutout: { depth: true, parts: true },
  clay: { depth: true, parts: true },
}

/**
 * The six looks laid over the whole picture (splat-core/filters.ts is the CPU twin: change one, change both): a
 * thermal camera, an old CRT or tape, a blueprint, a mosaic, paper cutouts and claymation. The frame is drawn once
 * as the world is set to draw it, and, where the look asks, a map of depth and one of parts with the same moved and
 * sorted blobs (as outlines are, inkLines.ts); then one full-screen pass draws the look over the whole canvas.
 *
 * `Stage.setFilter` sets the world for each: the blueprint and paper cutouts draw flat marks with no lights; the
 * thermal camera draws what gives its own light over white (`THERMAL_EMIT`), so it can tell a lamp from a pale thing;
 * claymation moves in held frames. The frame's camera must be a perspective camera.
 */
export class FilterPass {
  /** The picture, as the world draws it (half floats, so what glows can go over white). */
  readonly picture = new RenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter })
  /** The map of parts, for the looks that want one. */
  readonly ids = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  private readonly depth = new SplatDepth()
  private readonly quads = new Map<FilterKind, QuadMesh>()
  private readonly materials: NodeMaterial[] = []
  private look?: FilterLook
  private readonly res = uniform(new Vector2(1, 1))
  private readonly ratio = uniform(1)
  private readonly camWorld = uniform(new Matrix4())
  private readonly camLens = uniform(new Vector2(1, 1))
  /** The look's sky, top and bottom (linear). */
  private readonly skyTop = uniform(new Vector3())
  private readonly skyBottom = uniform(new Vector3())
  /** Each look's numbers, by name (`a` to `h`), set in `setLook`; colors in `c0` to `c2`. */
  private readonly k = Object.fromEntries('abcdefgh'.split('').map((n) => [n, uniform(0)])) as Record<string, N>
  private readonly c = [0, 1, 2].map(() => uniform(new Vector3()))
  /** The thermal camera's ramp (linear) and how many colors it has. */
  private readonly ramp = uniformArray(Array.from({ length: THERMAL_STOPS }, () => new Vector3()), 'vec3')
  /** The blueprint's subject on the screen (left, top, right, bottom, device pixels), and where its dimension lines go. */
  private readonly box = uniform(new Vector4())
  private readonly dimLines = uniform(new Vector4())
  private readonly dimEnds = uniform(new Vector4())
  /** The old television's frame of noise. */
  private readonly frameNo = uniform(0)

  /** The look, and how many device pixels a CSS pixel is; `size` is the scene's size in the world, `time` the stage's clock. */
  setLook(look: FilterLook, ratio: number, size: number, time: number) {
    this.look = look
    this.ratio.value = Math.max(0.5, ratio)
    const set = (vals: Record<string, number>) => { for (const [n, v] of Object.entries(vals)) this.k[n].value = v }
    const color = (i: number, c: readonly [number, number, number]) => this.c[i].value.set(...toLinear(c))
    const sky = (s: readonly [readonly [number, number, number], readonly [number, number, number]]) => { this.skyTop.value.set(...toLinear(s[0])); this.skyBottom.value.set(...toLinear(s[1])) }
    if (look.kind === 'thermal') {
      const stops = look.ramp.slice(0, THERMAL_STOPS)
      stops.forEach((s, i) => (this.ramp.array[i] as Vector3).set(...toLinear(s)))
      set({ a: Math.max(1, stops.length), b: look.stepped ? 1 : 0, c: look.hot ?? 1, d: (look.spread ?? 20) * ratio, e: look.warm ?? 0.8, f: look.noise ?? 0.3, g: grainFrame(time, look.still) })
    } else if (look.kind === 'crt') {
      const period = look.period || 12, t = look.still ? 0 : time
      sky(look.sky ?? CRT_BACK)
      set({
        a: look.scan ?? 0.5, b: Math.max(1, (look.every ?? 3) * ratio), c: (look.bleed ?? 0.5) * CRT_BLEED_PX * ratio, d: look.wobble ?? 0.4, e: look.noise ?? 0.3, f: look.curve ?? 0.4,
        g: (2 * Math.PI * CRT_WANDERS * t) / period, h: 1 - (((CRT_ROLLS * t) / period) % 1),
      })
      this.frameNo.value = Math.floor(t * CRT_FPS + 1e-6)
    } else if (look.kind === 'blueprint') {
      color(0, look.paper ?? BLUEPRINT_PAPER)
      color(1, look.ink ?? BLUEPRINT_INK)
      set({ a: Math.max(0.5, ((look.line ?? 1.5) / 2) * ratio), b: look.inner ?? 0.6, c: (look.grid ?? 16) * ratio, d: look.dims === false ? 0 : 1, e: look.fill ?? 0.25 })
    } else if (look.kind === 'mosaic') {
      color(0, look.groutColor ?? MOSAIC_GROUT)
      color(1, MOSAIC_GROUND)
      if (look.sky) sky(look.sky)
      set({ a: Math.max(3, (look.tile ?? 10) * ratio), b: Math.max(0, (look.grout ?? 1.5) * ratio), c: look.vary ?? 0.5, d: look.bevel ?? 0.5, e: look.brick ? 1 : 0, f: look.sky ? 1 : 0 })
    } else if (look.kind === 'cutout') {
      const [lx, ly] = lightWay(look.light ?? 120)
      sky(look.sky ?? CUTOUT_CARD)
      set({ a: (look.shadow ?? 6) * ratio, b: look.soft ?? 0.5, c: lx, d: ly, e: look.grain ?? 0.5, f: (look.edge ?? 1) * ratio, g: look.ragged ?? 0.4 })
    } else {
      sky(look.sky ?? CLAY_BACK)
      set({ a: look.prints ?? 0.6, b: Math.max(1e-4, (look.size ?? 0.05) * Math.max(size, 1e-4)), c: (look.smooth ?? 0.5) * CLAY_SMOOTH_PX * ratio, d: look.sheen ?? 0.3, e: look.boil ?? 0.4, f: clayFrame(time, look.fps ?? 12) })
    }
  }

  /** Sizes the pass's targets, in device pixels. */
  setSize(width: number, height: number) {
    if (this.picture.width === width && this.picture.height === height) return
    this.picture.setSize(width, height)
    this.ids.setSize(width, height)
    this.depth.setSize(width, height)
    this.res.value.set(width, height)
  }

  /**
   * Draws the scene in the look into the renderer's current target, or onto the screen when it has none. `box` is the
   * subject's box in the world (the blueprint's dimension lines are drawn round it).
   */
  render(renderer: WebGPURenderer, scene: Object3D, camera: Camera, box?: { lo: readonly number[]; hi: readonly number[] }) {
    const look = this.look
    if (!look) return
    const needs = NEEDS[look.kind]
    const to = renderer.getRenderTarget()
    renderer.setRenderTarget(this.picture)
    renderer.clear()
    renderer.render(scene, camera)
    if (needs.depth) this.depth.render(renderer, scene, camera)
    if (needs.parts) this.drawParts(renderer, scene, camera)
    camera.updateMatrixWorld()
    this.camWorld.value.copy(camera.matrixWorld)
    this.camLens.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5])
    if (look.kind === 'blueprint') this.placeDims(camera, box)
    let quad = this.quads.get(look.kind)
    if (!quad) {
      const m = new NodeMaterial()
      m.fragmentNode = this.fragment(look.kind)
      m.blending = NoBlending
      m.depthTest = false
      m.depthWrite = false
      this.materials.push(m)
      this.quads.set(look.kind, quad = new QuadMesh(m))
    }
    renderer.setRenderTarget(to)
    quad.render(renderer)
  }

  /** The subject's box on the screen and where the dimension lines go round it (`dimPlaces`). */
  private placeDims(camera: Camera, box?: { lo: readonly number[]; hi: readonly number[] }) {
    const w = this.res.value.x, h = this.res.value.y
    let on: ScreenBox | undefined
    if (box && Number.isFinite(box.lo[0])) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      const v = new Vector3()
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? box.hi[0] : box.lo[0], i & 2 ? box.hi[1] : box.lo[1], i & 4 ? box.hi[2] : box.lo[2]).applyMatrix4(camera.matrixWorldInverse)
        if (v.z > -1e-3) continue
        v.applyMatrix4(camera.projectionMatrix)
        const x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
      }
      if (x1 > x0) on = [Math.max(x0, -w), Math.max(y0, -h), Math.min(x1, 2 * w), Math.min(y1, 2 * h)]
    }
    const place = on ? dimPlaces(on, w, h, this.ratio.value) : undefined
    if (!on || !place) { this.box.value.set(0, 0, 0, 0); this.dimLines.value.set(-1, -1, 0, 0); return }
    this.box.value.set(...on)
    this.dimLines.value.set(place.yd, place.xd, 1, 0)
    this.dimEnds.value.set(place.fromY, place.toY, place.fromX, place.toX)
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

  private fragment(kind: FilterKind) {
    if (kind === 'thermal') return this.thermal()
    if (kind === 'crt') return this.crt()
    if (kind === 'blueprint') return this.blueprint()
    if (kind === 'mosaic') return this.mosaic()
    if (kind === 'cutout') return this.cutout()
    return this.clay()
  }

  /** The thermal camera. CPU twin: `thermalAt`. */
  private thermal() {
    const pic = this.picture.texture, { a: count, b: stepped, c: hot, d: reach, e: warm, f: grain, g: frame } = this.k
    const emit = (col: N) => clamp(max(max(col.r, col.g), col.b).sub(1).div(THERMAL_EMIT - 1), 0, 1)
    // CPU twin: `hotShare`
    const hotShare = (col: N) => { const hi = max(max(col.r, col.g), col.b), lo = min(min(col.r, col.g), col.b); return smoothstep(0.08, 0.35, hi.sub(lo).div(max(hi, 1e-4))) }
    return Fn(() => {
      const st = uv().toVar(), p = st.mul(this.res).toVar()
      const c = texture(pic, st).toVar(), a = min(c.a, 1).toVar()
      const own = c.rgb.div(max(a, 1e-4)).toVar()
      const e = emit(own).toVar(), q = hotShare(own).toVar()
      const body = warm.mul(pow(clamp(lumaOf(own), 0, 1), 0.6)).mul(float(1).sub(e.mul(float(1).sub(q)).mul(0.85))).mul(float(1).sub(clamp(min(min(own.r, own.g), own.b), 0, 1).mul(THERMAL_WHITE)))
      const sky = mix(float(THERMAL_SKY[0]), float(THERMAL_SKY[1]), st.y)
      const h = a.mul(body.add(hot.mul(e).mul(q))).add(float(1).sub(a).mul(sky)).toVar()
      const near = float(0).toVar()
      for (const [dx, dy] of THERMAL_TAPS) {
        const t = texture(pic, p.add(vec2(dx, dy).mul(reach)).div(this.res)).toVar(), ta = min(t.a, 1)
        const o = t.rgb.div(max(ta, 1e-4)).toVar()
        near.addAssign(ta.mul(emit(o)).mul(hotShare(o)))
      }
      h.addAssign(hot.mul(THERMAL_SPREAD_GAIN).mul(near.div(THERMAL_TAPS.length)))
      const g = this.ratio.mul(1.5)
      h.addAssign(hash(floor(p.div(g)).add(vec2(frame.mul(13.1), frame.mul(7.7)))).sub(0.5).mul(grain).mul(0.1))
      const x = clamp(h, 0, 1).mul(count.sub(1)).toVar()
      const k = clamp(floor(x), 0, max(count.sub(2), 0)).toVar()
      const lerp = mix(this.ramp.element(int(k)), this.ramp.element(int(min(k.add(1), count.sub(1)))), x.sub(k))
      const near1 = this.ramp.element(int(floor(x.add(0.5))))
      return vec4(select(stepped.greaterThan(0.5), near1, lerp), 1)
    })()
  }

  /** The old television. CPU twin: `crtAt`. */
  private crt() {
    const pic = this.picture.texture, { a: scan, b: line, c: reach, d: wobble, e: grain, f: curve, g: wander, h: band } = this.k
    const tFrame = this.frameNo
    return Fn(() => {
      const st = uv().toVar(), p = st.mul(this.res).toVar()
      const q = st.mul(2).sub(1).toVar()
      const bulge = float(1).add(curve.mul(0.1).mul(dot(q, q)))
      const at = q.mul(bulge).add(1).mul(0.5).toVar()
      const outside = abs(at.x.sub(0.5)).greaterThan(0.5).or(abs(at.y.sub(0.5)).greaterThan(0.5))
      const yCss = at.y.mul(this.res.y).div(this.ratio).toVar()
      const off = wobble.mul(0.8).mul(sin(yCss.mul(0.045).add(wander))).toVar()
      const near = float(1).sub(smoothstep(0, CRT_BAND, abs(at.y.sub(band))))
      off.addAssign(wobble.mul(CRT_BAND_PX).mul(near).mul(hash(vec2(floor(yCss), tFrame)).sub(0.5)).mul(2))
      const sx = at.x.mul(this.res.x).add(off.mul(this.ratio)).toVar(), sy = at.y.mul(this.res.y).toVar()
      const back = mix(this.skyTop, this.skyBottom, clamp(at.y, 0, 1)).toVar()
      const read = (px: N) => { const c = texture(pic, vec2(px, sy).div(this.res)); return c.rgb.add(back.mul(float(1).sub(min(c.a, 1)))) }
      const toYiq = (c: N) => vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312)))
      const sharp = toYiq(read(sx)).toVar()
      const iq = vec2(0).toVar()
      for (let k = 0; k < CRT_BLEED_TAPS; k++) iq.addAssign(toYiq(read(sx.sub(reach.mul(k / (CRT_BLEED_TAPS - 1))))).yz)
      const y = sharp.x, i = iq.x.div(CRT_BLEED_TAPS), qq = iq.y.div(CRT_BLEED_TAPS)
      const rgb = vec3(y.add(i.mul(0.956)).add(qq.mul(0.621)), y.sub(i.mul(0.272)).sub(qq.mul(0.647)), y.sub(i.mul(1.106)).add(qq.mul(1.703)))
      const f = fract(sy.div(line))
      const shade = float(1).add(float(0.35).add(sin(f.mul(Math.PI)).mul(0.9)).sub(1).mul(scan))
      const n = hash(floor(p.div(this.ratio)).add(vec2(tFrame.mul(3.7), tFrame.mul(9.1)))).sub(0.5).mul(grain).mul(0.16)
      const u = at.mul(2).sub(1), vignette = float(1).sub(curve.mul(0.35).mul(dot(u, u)))
      const out = max(rgb.mul(shade).add(n).mul(vignette), vec3(0))
      return vec4(select(outside, vec3(0), out), 1)
    })()
  }

  /** The blueprint. CPU twins: `gridAt`, `dimsAt`. */
  private blueprint() {
    const pic = this.picture.texture, ids = this.ids.texture, depth = this.depth.target.texture
    const { a: width, b: inner, c: every, d: dimsOn, e: fill } = this.k
    const [paper, ink] = this.c
    return Fn(() => {
      const st = uv().toVar(), p = st.mul(this.res).toVar(), px = vec2(1).div(this.res)
      const c = texture(pic, st).toVar(), id0 = texture(ids, st).toVar(), d0 = texture(depth, st).r.toVar()
      const solid0 = id0.a.greaterThan(0.5)
      // outlines, as a pen's (inkLines.ts) but even: round the subject, where something is clearly nearer, and fainter between parts
      const hits = float(0).toVar(), partHits = float(0).toVar()
      for (const [x, y] of ROUND) {
        const off = vec2(x, y).mul(px)
        const s = st.add(off.mul(width)).toVar()
        const idn = texture(ids, s).toVar(), dn = texture(depth, s).r, from = texture(pic, s)
        const edge = c.a.greaterThan(0.5).notEqual(from.a.greaterThan(0.5))
        const nearer = solid0.and(idn.a.greaterThan(0.5)).and(d0.sub(dn).greaterThan(d0.mul(LINE_DEPTH)))
        hits.addAssign(select(edge.or(nearer), float(1), float(0)))
        const sp = st.add(off.mul(width.mul(LINE_PART))).toVar()
        const idp = texture(ids, sp).toVar(), dp = texture(depth, sp).r
        const other = solid0.and(idp.a.greaterThan(0.5)).and(differs(idp, id0)).and(abs(d0.sub(dp)).lessThanEqual(d0.mul(LINE_DEPTH)))
        const lower = id0.r.mul(65536).add(id0.g.mul(256)).add(id0.b).lessThan(idp.r.mul(65536).add(idp.g.mul(256)).add(idp.b))
        partHits.addAssign(select(other.and(lower), float(1), float(0)))
      }
      const lines = max(min(hits.div(3), 1), min(partHits.div(3), 1).mul(inner)).toVar()
      // the grid, every fifth line stronger
      const lineOf = (v: N) => {
        const k = floor(v.div(max(every, 1)).add(0.5)), d = abs(v.sub(k.mul(every)))
        const cover = clamp(this.ratio.mul(0.6).add(0.5).sub(d), 0, 1)
        return cover.mul(select(k.sub(floor(k.div(5)).mul(5)).lessThan(0.5), float(GRID_MAJOR), float(GRID_MINOR)))
      }
      const grid = select(every.greaterThan(0.5), max(lineOf(p.x), lineOf(p.y)), float(0)).toVar()
      // the dimension lines round the subject
      const [x0, y0, x1, y1] = [this.box.x, this.box.y, this.box.z, this.box.w]
      const yd = this.dimLines.x, xd = this.dimLines.y, [fromY, toY, fromX, toX] = [this.dimEnds.x, this.dimEnds.y, this.dimEnds.z, this.dimEnds.w]
      const half = this.ratio.mul(0.5), arrow = this.ratio.mul(DIM_ARROW)
      const dims = float(0).toVar()
      for (const [a, b] of [[vec2(x0, yd), vec2(x1, yd)], [vec2(x0, fromY), vec2(x0, toY)], [vec2(x1, fromY), vec2(x1, toY)], [vec2(xd, y0), vec2(xd, y1)], [vec2(fromX, y0), vec2(toX, y0)], [vec2(fromX, y1), vec2(toX, y1)]]) dims.assign(max(dims, segment(p, a, b, half)))
      const head = (along: N, across: N) => select(along.greaterThanEqual(0).and(along.lessThanEqual(arrow)), clamp(along.div(arrow).mul(this.ratio.mul(3)).add(0.5).sub(abs(across)), 0, 1), float(0))
      dims.assign(max(dims, max(max(head(p.x.sub(x0), p.y.sub(yd)), head(x1.sub(p.x), p.y.sub(yd))), max(head(p.y.sub(y0), p.x.sub(xd)), head(y1.sub(p.y), p.x.sub(xd))))))
      for (let k = 1; k < DIM_TICKS; k++) {
        const tx = x0.add(x1.sub(x0).mul(k / DIM_TICKS)), ty = y0.add(y1.sub(y0).mul(k / DIM_TICKS)), tall = this.ratio.mul(k === DIM_TICKS / 2 ? 4 : 2.5)
        dims.assign(max(dims, max(segment(p, vec2(tx, yd.sub(tall)), vec2(tx, yd.add(tall)), half), segment(p, vec2(xd.sub(tall), ty), vec2(xd.add(tall), ty), half))))
      }
      const drawn = select(dimsOn.greaterThan(0.5).and(this.dimLines.z.greaterThan(0.5)), dims, float(0))
      // a faint wash where the subject is, and the paper's own mottle
      const mottle = float(1).add(noise(p.div(this.ratio.mul(40))).sub(0.5).mul(0.08))
      const ground = mix(paper, ink, min(c.a, 1).mul(fill).mul(0.2)).mul(mottle)
      return vec4(mix(ground, ink, clamp(max(max(lines, grid), drawn), 0, 1)), 1)
    })()
  }

  /** The mosaic. CPU twins: `tileAt`, `tileCover`, `tileTint`, `bevelAt`. */
  private mosaic() {
    const pic = this.picture.texture, ids = this.ids.texture
    const { a: side, b: grout, c: vary, d: bevel, e: brick, f: skied } = this.k
    const [groutColor, ground] = this.c
    return Fn(() => {
      const st = uv().toVar(), p = st.mul(this.res).toVar()
      const row = floor(p.y.div(side)).toVar()
      const shift = select(brick.greaterThan(0.5).and(row.sub(floor(row.div(2)).mul(2)).greaterThan(0.5)), side.mul(0.5), float(0))
      const col = floor(p.x.sub(shift).div(side)).toVar()
      const cell = vec2(col, row).toVar()
      const mid = vec2(col.mul(side).add(shift).add(side.mul(0.5)), row.mul(side).add(side.mul(0.5))).toVar()
      const u = p.x.sub(mid.x).div(side), v = p.y.sub(mid.y).div(side)
      // the tile's color: the picture round its middle over the backdrop, only where it is the same part as the middle
      const back = select(skied.greaterThan(0.5), mix(this.skyTop, this.skyBottom, clamp(mid.y.div(this.res.y), 0, 1)), ground).toVar()
      const id0 = texture(ids, mid.div(this.res)).toVar()
      const sum = vec3(0).toVar(), n = float(0).toVar()
      for (const [a, b] of MOSAIC_TAPS) {
        const s = mid.add(vec2(a, b).mul(side)).div(this.res).toVar()
        const t = texture(pic, s).toVar(), idt = texture(ids, s)
        const same = idt.a.greaterThan(0.5).equal(id0.a.greaterThan(0.5)).and(id0.a.lessThan(0.5).or(differs(idt, id0).not()))
        const w = select(same, float(1), float(0))
        sum.addAssign(t.rgb.add(back.mul(float(1).sub(min(t.a, 1)))).mul(w))
        n.addAssign(w)
      }
      const base = sum.div(max(n, 1)).toVar()
      const k = float(1).add(hash(cell.mul(vec2(1.7, 2.3))).sub(0.5).mul(0.3).mul(vary))
      const tint = vec3(
        k.add(hash(cell.add(vec2(0, 0))).sub(0.5).mul(0.1).mul(vary)),
        k.add(hash(cell.add(vec2(11.3, -5.1))).sub(0.5).mul(0.1).mul(vary)),
        k.add(hash(cell.add(vec2(22.6, -10.2))).sub(0.5).mul(0.1).mul(vary)),
      )
      const edge = smoothstep(0.25, 0.5, max(abs(u), abs(v)))
      const lit = float(1).add(bevel.mul(edge).mul(u.add(v).negate()).mul(0.45))
      const face = base.mul(tint).mul(lit)
      // the tile's rounded square, a little smaller or larger by its own hash so the grout wanders
      const inset = grout.mul(0.5).add(hash(cell.add(0.5)).sub(0.5).mul(grout).mul(0.6))
      const halfSide = max(side.mul(0.5).sub(inset), 0.5), round = min(halfSide, grout.mul(0.6).add(side.mul(0.08)))
      const qx = abs(u.mul(side)).sub(halfSide.sub(round)), qy = abs(v.mul(side)).sub(halfSide.sub(round))
      const d = length(vec2(max(qx, 0), max(qy, 0))).add(min(max(qx, qy), 0)).sub(round)
      const cover = clamp(float(0.5).sub(d), 0, 1)
      const mortar = groutColor.mul(float(1).add(noise(p.div(this.ratio.mul(2))).sub(0.5).mul(0.12)))
      return vec4(mix(mortar, face, cover), 1)
    })()
  }

  /** Paper cutouts. CPU twins: `raggedAt`, `shadowAt`, `grainAt`. */
  private cutout() {
    const pic = this.picture.texture, ids = this.ids.texture, depth = this.depth.target.texture
    const { a: len, b: soft, c: lx, d: ly, e: grain, f: edge, g: ragged } = this.k
    return Fn(() => {
      const st = uv().toVar(), p = st.mul(this.res).toVar()
      // cut edges wander a little
      const s = this.ratio.mul(RAGGED_GRAIN), r = ragged.mul(RAGGED_PX).mul(this.ratio)
      const q = p.add(vec2(noise(p.div(s)).sub(0.5), noise(p.div(s).add(vec2(31.7, -17.3))).sub(0.5)).mul(r.mul(2))).toVar()
      const at = (v: N) => v.div(this.res)
      const c = texture(pic, at(q)).toVar(), id0 = texture(ids, at(q)).toVar(), d0 = texture(depth, at(q)).r.toVar()
      const a = min(c.a, 1).toVar()
      const back = mix(this.skyTop, this.skyBottom, clamp(st.y, 0, 1))
      const color = c.rgb.add(back.mul(float(1).sub(a))).toVar()
      // a shadow: a layer nearer than this one (or anything at all over the card) a shadow's length toward the light
      const way = vec2(lx, ly), across = vec2(ly.negate(), lx)
      const spread = soft.mul(len).mul(0.6)
      const shade = float(0).toVar()
      for (const k of CUTOUT_TAPS) {
        const t = q.add(way.mul(len)).add(across.mul(spread.mul(k))).toVar()
        const dt = texture(depth, at(t)).r, idt = texture(ids, at(t))
        const covers = dt.greaterThan(0).and(d0.lessThanEqual(0).or(differs(idt, id0).and(dt.lessThan(d0.mul(1 - CUTOUT_LAYER)))))
        shade.addAssign(select(covers, float(1), float(0)))
      }
      const shadowed = color.mul(float(1).sub(shade.div(CUTOUT_TAPS.length).mul(CUTOUT_SHADE)))
      // the pale cut edge on this layer's side toward the light, where what is there lies behind it
      const e = q.add(way.mul(edge)).toVar()
      const de = texture(depth, at(e)).r, ide = texture(ids, at(e))
      const rim = d0.greaterThan(0).and(de.lessThanEqual(0).or(differs(ide, id0).and(de.greaterThan(d0.mul(1 + CUTOUT_LAYER)))))
      const lit = select(rim.and(edge.greaterThan(0.25)), mix(shadowed, vec3(1), 0.32), shadowed)
      const fine = noise(p.div(this.ratio.mul(1.5))), long = noise(p.div(vec2(this.ratio.mul(14), this.ratio.mul(3))))
      const fiber = float(1).add(fine.sub(0.5).mul(0.08).add(long.sub(0.5).mul(0.06)).mul(grain))
      return vec4(lit.mul(fiber), 1)
    })()
  }

  /** Claymation. CPU twins: `printAt`, `clayShade`. */
  private clay() {
    const pic = this.picture.texture, ids = this.ids.texture, depth = this.depth.target.texture
    const { a: prints, b: size, c: reach, d: sheen, e: boil, f: frame } = this.k
    return Fn(() => {
      const st = uv().toVar(), px = vec2(1).div(this.res).toVar()
      const c = texture(pic, st).toVar(), id0 = texture(ids, st).toVar(), d0 = texture(depth, st).r.toVar()
      const a = min(c.a, 1).toVar()
      // smooth clay: the picture softened with its neighbors of the same part
      const sum = c.rgb.div(max(a, 1e-4)).mul(2).toVar(), n = float(2).toVar()
      for (const [x, y] of CLAY_TAPS) {
        const s = st.add(vec2(x, y).mul(px).mul(reach)).toVar()
        const t = texture(pic, s).toVar(), idt = texture(ids, s)
        const w = select(idt.a.greaterThan(0.5).and(differs(idt, id0).not()).and(t.a.greaterThan(0.5)), float(1), float(0))
        sum.addAssign(t.rgb.div(max(t.a, 1e-4)).mul(w))
        n.addAssign(w)
      }
      const base = sum.div(n).toVar()
      // the surface's facing, from the depths beside it (each way, the side whose depth is nearer this one's)
      const viewAt = (s: N, d: N) => vec3(s.mul(2).sub(1).mul(vec2(1, -1)).div(this.camLens).mul(d), d.negate())
      const here = viewAt(st, d0).toVar()
      const side = (dx: N) => {
        const sa = st.add(dx), sb = st.sub(dx)
        const da = texture(depth, sa).r, db = texture(depth, sb).r
        const useA = abs(da.sub(d0)).lessThan(abs(db.sub(d0))).and(da.greaterThan(0)).or(db.lessThanEqual(0))
        return select(useA, viewAt(sa, select(da.greaterThan(0), da, d0)).sub(here), here.sub(viewAt(sb, select(db.greaterThan(0), db, d0))))
      }
      const nrm = normalize(cross(side(vec2(px.x.mul(1.5), 0)), side(vec2(0, px.y.mul(1.5).negate())))).toVar()
      const facing = select(nrm.z.lessThan(0), nrm.negate(), nrm).toVar()
      const key = normalize(vec3(...CLAY_KEY))
      const shade = float(0.6).add(float(0.52).mul(dot(facing, key).mul(0.5).add(0.5)))
      // soft shade in the creases, where nearer clay shuts a pixel in (CPU twin: `hollowOf`)
      const hollow = float(0).toVar()
      for (const [x, y] of CLAY_TAPS.slice(0, 8)) {
        const dn = texture(depth, st.add(vec2(x, y).mul(px).mul(this.ratio.mul(CLAY_SHADE_PX)))).r
        hollow.addAssign(select(dn.greaterThan(0), clamp(d0.sub(dn).div(d0.mul(CLAY_DEEP)), 0, 1), float(0)))
      }
      const crease = float(1).sub(hollow.div(8).mul(CLAY_HOLLOW))
      const h = normalize(key.add(vec3(0, 0, 1)))
      const shine = sheen.mul(0.22).mul(pow(max(dot(facing, h), 0), 14))
      // thumbprints, fixed on the clay in the world
      const world = this.camWorld.mul(vec4(here, 1)).xyz.div(size).toVar()
      const bp = floor(world).toVar()
      const best = float(1e9).toVar(), has = float(0).toVar()
      for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
        const cc = bp.add(vec3(x, y, z)).toVar()
        const j = (salt: number) => cellHash(cc, salt).add(cellHash(cc, frame.mul(3.1).add(salt)).sub(0.5).mul(boil).mul(0.3))
        const d = length(cc.add(vec3(j(1), j(2), j(3))).sub(world))
        const nearer = d.lessThan(best)
        has.assign(select(nearer, select(cellHash(cc, 4).lessThan(PRINT_SHARE), float(1), float(0)), has))
        best.assign(select(nearer, d, best))
      }
      const dent = float(1).sub(smoothstep(0, 0.45, best)).mul(has)
      const ridge = sin(best.div(0.45).mul(PRINT_RINGS * Math.PI * 2)).mul(dent)
      const print = float(1).sub(prints.mul(dent.mul(PRINT_DENT).sub(ridge.mul(PRINT_RIDGE))))
      const gray = lumaOf(base)
      const rich = max(mix(vec3(gray), base, 1.12), vec3(0))
      const lit = rich.mul(shade).mul(crease).mul(print).add(shine)
      const back = mix(this.skyTop, this.skyBottom, clamp(st.y, 0, 1))
      const shown = a.greaterThan(0.02).and(d0.greaterThan(0))
      return vec4(select(shown, lit.mul(a).add(back.mul(float(1).sub(a))), back), 1)
    })()
  }

  /** Frees its targets. */
  dispose() {
    this.picture.dispose()
    this.ids.dispose()
    this.depth.dispose()
    for (const m of this.materials) m.dispose()
  }
}

