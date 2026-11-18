import { NearestFilter, NoBlending, NodeMaterial, QuadMesh, RenderTarget, Vector2, Vector3, type Camera, type Object3D, type WebGPURenderer } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import { SplatDepth } from './depth.ts'
import { LINE_BREAK, LINE_DEPTH, LINE_PART, LINE_WOBBLE } from '../splat-core/marks.ts'

// As in engine.ts: the shader builders use TSL untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Fn, abs, dot, float, floor, fract, max, min, mix, select, sin, sqrt, texture, uniform, uv, vec2, vec3, vec4 } = TSL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any

/** The eight ways a line is looked for round a pixel. */
const ROUND: [number, number][] = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)])

/**
 * Drawn outlines, as a pen would put them down: round the subject, where one thing passes in front of another, and
 * between its parts. Marks (`setMarks`) lay each blob down as a stroke, which shades a picture but never draws its
 * edges; a pen and wash drawing is the other way round, contours first.
 *
 * The frame is drawn three times with the same moved and sorted blobs: the picture, a map of depth (`SplatDepth`) and
 * a map of parts (`SplatWorld.parts`). One pass then inks a pixel when, a line's width away, the picture ends, or
 * something is clearly nearer, or another part begins. The line is not even: its weight swells and thins along its
 * length and is heavier against dark things than light ones, where it may break off (`lineWeight` in marks.ts, the
 * CPU twin of the weight); and it wobbles a little, as a hand does.
 */
export class InkLines {
  /** The picture, as the stage draws it without lines. */
  readonly picture = new RenderTarget(1, 1)
  /** The map of parts the lines between parts come from. */
  readonly ids = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter })
  private readonly depth = new SplatDepth()
  private readonly material = new NodeMaterial()
  private readonly quad: QuadMesh
  private readonly res = uniform(new Vector2(1, 1))
  private readonly ink = uniform(new Vector3())
  /** The pen's width, in device pixels. */
  private readonly width = uniform(2)

  constructor() {
    this.material.fragmentNode = this.fragment()
    this.material.blending = NoBlending
    this.material.depthTest = false
    this.material.depthWrite = false
    this.quad = new QuadMesh(this.material)
  }

  /** The pen: its color (linear RGB) and how wide its line is, in device pixels. */
  setPen(ink: readonly number[], width: number) {
    this.ink.value.set(ink[0], ink[1], ink[2])
    this.width.value = Math.max(0.5, width)
  }

  /** Sizes the pass's targets, in device pixels. */
  setSize(width: number, height: number) {
    if (this.picture.width === width && this.picture.height === height) return
    this.picture.setSize(width, height)
    this.ids.setSize(width, height)
    this.depth.setSize(width, height)
    this.res.value.set(width, height)
  }

  /** Draws the scene with its lines into the renderer's current target, or onto the screen when it has none. */
  render(renderer: WebGPURenderer, scene: Object3D, camera: Camera) {
    const to = renderer.getRenderTarget()
    renderer.setRenderTarget(this.picture)
    renderer.clear()
    renderer.render(scene, camera)
    this.depth.render(renderer, scene, camera)
    this.drawParts(renderer, scene, camera)
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
      const cell = st.mul(this.res).toVar()
      // smooth noise over the picture, for the hand's wobble and the pen's swelling
      const hash = (p: N) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453))
      const noise = (p: N) => {
        const i = floor(p).toVar(), f = p.sub(i).toVar()
        const u = f.mul(f).mul(vec2(3).sub(f.mul(2))).toVar()
        return mix(mix(hash(i), hash(i.add(vec2(1, 0))), u.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), u.x), u.y)
      }
      const wob = vec2(noise(cell.div(46)), noise(cell.div(46).add(31.7))).sub(0.5).mul(2 * LINE_WOBBLE).mul(this.width)
      const at = st.add(wob.mul(px)).toVar()
      const swell = noise(cell.div(120).add(7.3)).toVar()

      const c = texture(picture, st).toVar()
      const id0 = texture(ids, at).toVar()
      const d0 = texture(depth, at).r.toVar()
      // the picture's own cover says where the subject ends (marks stop short of a blob's disc); the maps say what is there
      const solid0 = id0.a.greaterThan(0.5)
      const shown0 = texture(picture, at).a.greaterThan(0.5)
      // how dark the thing the line belongs to is: the nearer side's own color
      const lum = (rgba: N) => sqrt(max(dot(rgba.rgb.div(max(rgba.a, 0.001)), vec3(0.2126, 0.7152, 0.0722)), 0)).min(1)

      const hits = float(0).toVar(), partHits = float(0).toVar(), tone = float(0).toVar(), toned = float(0).toVar()
      for (const [x, y] of ROUND) {
        const off = vec2(x, y).mul(px)
        const s = at.add(off.mul(this.width)).toVar()
        const idn = texture(ids, s).toVar()
        const dn = texture(depth, s).r.toVar()
        const solidn = idn.a.greaterThan(0.5)
        // the picture's own edge, from either side; and something clearly nearer, from behind it
        const from = texture(picture, s).toVar()
        const edge = shown0.notEqual(from.a.greaterThan(0.5))
        const nearer = solid0.and(solidn).and(d0.sub(dn).greaterThan(d0.mul(LINE_DEPTH)))
        const hit = select(edge.or(nearer), float(1), float(0)).toVar()
        hits.addAssign(hit)
        // the line takes its weight from the thing it goes round: the nearer one, or the solid one
        tone.addAssign(hit.mul(select(from.a.greaterThan(0.5), lum(from), lum(c))))
        toned.addAssign(hit)
        // another part beside this one, at much the same depth: a thinner line, on the lower-numbered part's side
        const sp = at.add(off.mul(this.width.mul(LINE_PART))).toVar()
        const idp = texture(ids, sp).toVar()
        const dp = texture(depth, sp).r
        const other = solid0.and(idp.a.greaterThan(0.5)).and(abs(idp.r.sub(id0.r)).add(abs(idp.g.sub(id0.g))).add(abs(idp.b.sub(id0.b))).greaterThan(0.002))
        const level = abs(d0.sub(dp)).lessThanEqual(d0.mul(LINE_DEPTH))
        const lower = id0.r.mul(65536).add(id0.g.mul(256)).add(id0.b).lessThan(idp.r.mul(65536).add(idp.g.mul(256)).add(idp.b))
        partHits.addAssign(select(other.and(level).and(lower), float(1), float(0)))
      }
      const dark = float(1).sub(tone.div(max(toned, 1))).toVar()
      // three of the eight looks make a full line; fewer, its soft edge
      const outline = min(hits.div(3), 1).mul(lineWeightNode(dark, swell))
      const inner = min(partHits.div(3), 1).mul(lineWeightNode(float(1).sub(lum(c)), swell)).mul(0.8)
      const a = max(outline, inner).toVar()
      const rgb = c.rgb.mul(float(1).sub(a)).add(this.ink.mul(a)).toVar()
      const alpha = c.a.add(a.mul(float(1).sub(c.a))).toVar()
      // linear color out, as the blobs' own draw gives: the renderer turns it to the screen's sRGB, and doing it here too washed the picture out
      return vec4(rgb, alpha)
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

/** A line's strength for how dark the thing it goes round is and where the pen's swell stands. CPU twin: `lineWeight` in marks.ts; change both. */
function lineWeightNode(dark: N, swell: N) {
  const w = dark.mul(0.55).add(0.45).mul(swell.mul(0.5).add(0.75)).min(1)
  // against something light, the pen lifts off here and there
  return select(dark.lessThan(LINE_BREAK.dark).and(swell.lessThan(LINE_BREAK.swell)), float(0), w)
}
