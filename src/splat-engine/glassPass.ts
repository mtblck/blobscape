import { Matrix4, NearestFilter, NoBlending, NodeMaterial, QuadMesh, RenderTarget, Vector2, Vector3, type Camera, type Object3D, type WebGPURenderer } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import { SplatDepth } from './depth.ts'
import { srgbToLinear } from '../splat-core/color.ts'
import { LINE_DEPTH, LINE_PART } from '../splat-core/marks.ts'
import { GLASS_JUMP, GLASS_LEAD, GLASS_LIFT, GLASS_RICH, GLASS_SKY, GLASS_SKY_PANE, GLASS_VARY, type GlassLook } from '../splat-core/glass.ts'

// As in engine.ts: the shader builders use TSL untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Fn, abs, clamp, dot, exp, float, floor, fract, length, max, min, mix, pow, select, sin, texture, uniform, uv, vec2, vec3, vec4 } = TSL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any

/** The eight ways lead is looked for round a pixel. */
const ROUND: [number, number][] = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)])
/** The grid cells round a point whose panes may reach it. */
const NEAR: [number, number, number][] = []
for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) NEAR.push([x, y, z])
const FLAT = NEAR.filter((c) => c[2] === 0)

/** A number from 0 to 1 for a grid cell. CPU twin: `cellHash` in glass.ts; change both. */
const cellHash = (cell: N, salt: number) => fract(sin(dot(cell, vec3(127.1, 311.7, 74.7)).add(salt * 19.19)).mul(43758.5453))
/** Where a grid cell's pane has its middle. CPU twin: `seedOf`. */
const seedOf = (cell: N) => cell.add(vec3(cellHash(cell, 1), cellHash(cell, 2), cellHash(cell, 3)))

/**
 * The pane a point is in among the cells `round` it: its cell and seed, and how far the point is from the nearest
 * other pane. CPU twin: `paneOf` in glass.ts; change both.
 */
function paneOf(p: N, round: [number, number, number][]) {
  const base = floor(p).toVar()
  const best = float(1e9).toVar(), cell = vec3(0).toVar(), seed = vec3(0).toVar()
  for (const [x, y, z] of round) {
    const c = base.add(vec3(x, y, z)).toVar(), s = seedOf(c).toVar()
    const w = s.sub(p), d = dot(w, w).toVar()
    const nearer = d.lessThan(best)
    best.assign(select(nearer, d, best))
    cell.assign(select(nearer, c, cell))
    seed.assign(select(nearer, s, seed))
  }
  const edge = float(1e9).toVar()
  for (const [x, y, z] of round) {
    const s = seedOf(base.add(vec3(x, y, z))).toVar()
    const w = s.sub(seed).toVar(), len = length(w).toVar()
    const far = dot(s.add(seed).mul(0.5).sub(p), w).div(max(len, 1e-6))
    edge.assign(select(len.greaterThan(1e-4), min(edge, far), edge))
  }
  return { cell, seed, edge }
}

/**
 * Stained glass (splat-core/glass.ts). The frame is drawn three times with the same moved and sorted blobs (the
 * picture in the blobs' own flat colors, a map of depth and a map of parts), as outlines are (inkLines.ts). One pass
 * then puts each pixel back in the world from its depth and asks which pane it is in: panes are the cells nearest a
 * scatter of points fixed in the world, so they stay on their surfaces as the view turns. A pane's glass is the
 * picture's own color there, made richer and lighter and a little different from the next pane's, with the light
 * behind it. Lead runs between panes, round every part, where one thing passes in front of another, round the
 * subject, and wherever the picture's color changes, so each piece between leads is one color: it wants blobs in
 * flat colors with no light baked in. Pixels the subject leaves empty are panes too, fixed on the screen and colored as the look's sky, so the
 * whole picture is a window.
 *
 * The world should be drawing flat marks with no light of its own (`Stage.setGlass` sets both). The frame's camera must be a perspective camera.
 */
export class GlassPass {
  /** The picture: every blob flat in its own color. */
  readonly picture = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  /** The map of parts the lead between parts comes from. */
  readonly ids = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  private readonly depth = new SplatDepth()
  private readonly material = new NodeMaterial()
  private readonly quad: QuadMesh
  private readonly res = uniform(new Vector2(1, 1))
  private readonly camWorld = uniform(new Matrix4())
  private readonly camLens = uniform(new Vector2(1, 1))
  /** Half the lead's width, in device pixels. */
  private readonly width = uniform(2)
  /** A pane's size in the world. */
  private readonly pane = uniform(1)
  private readonly ink = uniform(new Vector3())
  private readonly skyTop = uniform(new Vector3())
  private readonly skyBottom = uniform(new Vector3())
  private readonly light = uniform(new Vector2(0.5, 0.3))
  private readonly shine = uniform(0.5)
  private readonly vary = uniform(0.5)

  constructor() {
    this.material.fragmentNode = this.fragment()
    this.material.blending = NoBlending
    this.material.depthTest = false
    this.material.depthWrite = false
    this.quad = new QuadMesh(this.material)
  }

  /** The look, how many device pixels a CSS pixel is, and the scene's size in the world (which panes are sized by). */
  setLook(look: GlassLook, ratio: number, size: number) {
    const lin = (c: readonly number[]) => [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])] as const
    this.width.value = Math.max(0.5, ((look.lead ?? 3) / 2) * ratio)
    this.pane.value = Math.max(1e-4, (look.pane ?? 0.06) * Math.max(size, 1e-4))
    this.ink.value.set(...lin(look.ink ?? GLASS_LEAD))
    const sky = look.sky ?? GLASS_SKY
    this.skyTop.value.set(...lin(sky[0]))
    this.skyBottom.value.set(...lin(sky[1]))
    this.light.value.set(look.light?.[0] ?? 0.5, look.light?.[1] ?? 0.3)
    this.shine.value = Math.max(0, Math.min(1, look.shine ?? 0.5))
    this.vary.value = Math.max(0, Math.min(1, look.vary ?? 0.5))
  }

  /** Sizes the pass's targets, in device pixels. */
  setSize(width: number, height: number) {
    if (this.picture.width === width && this.picture.height === height) return
    this.picture.setSize(width, height)
    this.ids.setSize(width, height)
    this.depth.setSize(width, height)
    this.res.value.set(width, height)
  }

  /** Draws the scene as stained glass into the renderer's current target, or onto the screen when it has none. */
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
    renderer.setRenderTarget(to)
    this.quad.render(renderer)
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

  private fragment() {
    const picture = this.picture.texture, ids = this.ids.texture, depth = this.depth.target.texture
    return Fn(() => {
      const st = uv().toVar()
      const px = vec2(1).div(this.res).toVar()
      const c = texture(picture, st).toVar()
      const id0 = texture(ids, st).toVar()
      const d0 = texture(depth, st).r.toVar()
      const solid0 = id0.a.greaterThan(0.5)
      const shown0 = c.a.greaterThan(0.5).and(d0.greaterThan(0))
      const differs = (a: N, b: N) => abs(a.r.sub(b.r)).add(abs(a.g.sub(b.g))).add(abs(a.b.sub(b.b))).greaterThan(0.002)

      // lead round the subject, where something is clearly nearer, and between parts: as a pen's outlines, but even
      const own = c.rgb.div(max(c.a, 0.001)).toVar()
      const hits = float(0).toVar(), partHits = float(0).toVar()
      for (const [x, y] of ROUND) {
        const off = vec2(x, y).mul(px)
        const s = st.add(off.mul(this.width)).toVar()
        const idn = texture(ids, s).toVar()
        const dn = texture(depth, s).r.toVar()
        const from = texture(picture, s).toVar()
        const edge = c.a.greaterThan(0.5).notEqual(from.a.greaterThan(0.5))
        const nearer = solid0.and(idn.a.greaterThan(0.5)).and(d0.sub(dn).greaterThan(d0.mul(LINE_DEPTH)))
        // and where the color itself changes: a stripe or a patch is its own piece of glass
        const turned = c.a.greaterThan(0.5).and(from.a.greaterThan(0.5)).and(length(from.rgb.div(max(from.a, 0.001)).sub(own)).greaterThan(GLASS_JUMP))
        hits.addAssign(select(edge.or(nearer).or(turned), float(1), float(0)))
        const sp = st.add(off.mul(this.width.mul(LINE_PART))).toVar()
        const idp = texture(ids, sp).toVar()
        const dp = texture(depth, sp).r
        const other = solid0.and(idp.a.greaterThan(0.5)).and(differs(idp, id0))
        const level = abs(d0.sub(dp)).lessThanEqual(d0.mul(LINE_DEPTH))
        const lower = id0.r.mul(65536).add(id0.g.mul(256)).add(id0.b).lessThan(idp.r.mul(65536).add(idp.g.mul(256)).add(idp.b))
        partHits.addAssign(select(other.and(level).and(lower), float(1), float(0)))
      }
      const drawn = max(min(hits.div(3), 1), min(partHits.div(3), 1)).toVar()

      // the subject's panes: where the pixel is in the world, in panes
      // (a pass's rows run down from the top on both backends: up on screen is less of `uv().y`)
      const here = vec3(st.mul(2).sub(1).mul(vec2(1, -1)).div(this.camLens).mul(d0), d0.negate())
      const world = this.camWorld.mul(vec4(here, 1)).xyz.toVar()
      const inWorld = paneOf(world.div(this.pane), NEAR)
      // a pixel's size in the world at its depth, so the lead between panes is as wide as the lead round them
      const pixel = d0.mul(2).div(this.camLens.y.mul(this.res.y))
      const between = clamp(this.width.sub(inWorld.edge.mul(this.pane).div(max(pixel, 1e-9))).add(0.5), 0, 1)
      // the glass is the picture's own color there: lead runs wherever that changes, so every pane is one color
      const pane = glassColorNode(own).mul(cellHash(inWorld.cell, 4).sub(0.5).mul(2 * GLASS_VARY).mul(this.vary).add(1))

      // the window round it: panes fixed on the screen, colored as the sky at each one's middle
      const aspect = this.res.x.div(this.res.y)
      const onScreen = paneOf(vec3(st.x.mul(aspect), st.y, 0).div(GLASS_SKY_PANE).add(vec3(0, 0, 0.5)), FLAT)
      const around = clamp(this.width.sub(onScreen.edge.mul(GLASS_SKY_PANE).mul(this.res.y)).add(0.5), 0, 1)
      const down = clamp(onScreen.seed.y.mul(GLASS_SKY_PANE), 0, 1)
      const sky = mix(this.skyTop, this.skyBottom, down).mul(cellHash(onScreen.cell, 4).sub(0.5).mul(2 * GLASS_VARY).mul(this.vary).mul(0.6).add(1))

      // the light behind the window: brightest where it stands (CPU twin: `backLight`)
      const away = st.sub(this.light).mul(vec2(aspect, 1))
      const lit = float(1).sub(this.shine.mul(float(1).sub(exp(dot(away, away).mul(-2.2)))))
      const glass = select(shown0, pane, sky).mul(lit)
      const lead = max(drawn, select(shown0, between, around))
      return vec4(mix(min(glass, 1), this.ink, lead), 1)
    })()
  }

  /** Frees its targets. */
  dispose() {
    this.picture.dispose()
    this.ids.dispose()
    this.depth.dispose()
    this.material.dispose()
  }
}

/** A color as glass with the light behind it. CPU twin: `glassColor` in glass.ts; change both. */
function glassColorNode(rgb: N) {
  const gray = dot(rgb, vec3(0.2126, 0.7152, 0.0722))
  return pow(clamp(rgb.sub(gray).mul(GLASS_RICH).add(gray), 0, 1), vec3(GLASS_LIFT))
}
