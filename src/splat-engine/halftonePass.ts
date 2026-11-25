import { LinearFilter, NearestFilter, NoBlending, NodeMaterial, QuadMesh, RenderTarget, Vector2, Vector3, type Camera, type Object3D, type WebGPURenderer } from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import { srgbToLinear } from '../splat-core/color.ts'
import { CELL_TAPS, HALFTONE_INKS, HALFTONE_PAPER, INK_GRAIN, INK_UNEVEN, KEY_FROM, KEY_TAKES, SEPARATE_PASSES, SPOT_FIT, plateOff, type HalftoneLook } from '../splat-core/halftone.ts'

// As in engine.ts: the shader builders use TSL untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const { Fn, clamp, cos, dot, float, floor, fract, int, log, max, min, mix, pow, select, sin, sqrt, texture, uniform, uniformArray, uv, vec2, vec3, vec4 } = TSL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any

const lin = (c: readonly number[]) => [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])] as const

/**
 * Halftone screen print (splat-core/halftone.ts is the CPU twin: change one, change both). The frame is drawn once,
 * every blob flat in its own color under the stage's lights. A small pass then works out every cell of every ink's
 * screen (a texel a cell, one block of rows an ink): the picture read round the cell's middle, over the sky or the
 * paper, separated into the inks (`separate`), keeping that ink's share. A second pass prints: each pixel finds its
 * cell on each ink's turned screen, cuts that cell's dot to its share (`dotCover`) and lays the inks over the paper
 * (`printed`). The print covers the canvas.
 *
 * The world should be drawing flat marks (`Stage.setHalftone` sets them).
 */
export class HalftonePass {
  /** The picture: every blob flat in its own color. */
  readonly picture = new RenderTarget(1, 1, { minFilter: LinearFilter, magFilter: LinearFilter })
  /** Every screen's cells: ink i's share in red, a texel a cell, ink i in rows i·side to (i + 1)·side. */
  private readonly cells = new RenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false })
  private readonly decide = new NodeMaterial()
  private readonly show = new NodeMaterial()
  private readonly decideQuad: QuadMesh
  private readonly showQuad: QuadMesh
  /** The picture's size in device pixels. */
  private readonly res = uniform(new Vector2(1, 1))
  /** How many device pixels a CSS pixel is: the ink's unevenness is sized in CSS pixels. */
  private readonly ratio = uniform(1)
  /** A cell, in device pixels. */
  private readonly cell = uniform(7)
  /** How many cells a screen is across and down, about its turning point in the picture's middle. */
  private readonly side = uniform(64)
  private readonly count = uniform(1)
  /** The key ink's place, or -1 (and -1 with one ink, which has nothing to take over). */
  private readonly key = uniform(-1)
  private readonly texture = uniform(0.4)
  private readonly paper = uniform(new Vector3(1, 1, 1))
  private readonly skyTop = uniform(new Vector3(1, 1, 1))
  private readonly skyBottom = uniform(new Vector3(1, 1, 1))
  private readonly skied = uniform(0)
  /** Each ink's color (linear) and how much of each channel it soaks up (1 − its color, at least 0.02 through). */
  private readonly inkColor = uniformArray(Array.from({ length: HALFTONE_INKS }, () => new Vector3(1, 1, 1)), 'vec3')
  private readonly inkSoak = uniformArray(Array.from({ length: HALFTONE_INKS }, () => new Vector3()), 'vec3')
  /** Each screen's turn (cos, sin) and where its plate sits off true, in device pixels. */
  private readonly turn = uniformArray(Array.from({ length: HALFTONE_INKS }, () => new Vector2(1, 0)), 'vec2')
  private readonly off = uniformArray(Array.from({ length: HALFTONE_INKS }, () => new Vector2()), 'vec2')
  private look?: HalftoneLook
  private shift = 1

  constructor() {
    for (const [m, f] of [[this.decide, this.decideCells()], [this.show, this.print()]] as const) {
      m.fragmentNode = f
      m.blending = NoBlending
      m.depthTest = false
      m.depthWrite = false
    }
    this.decideQuad = new QuadMesh(this.decide)
    this.showQuad = new QuadMesh(this.show)
  }

  /** The look, and how many device pixels a CSS pixel is. */
  setLook(look: HalftoneLook, ratio: number) {
    this.look = look
    const inks = look.inks.slice(0, HALFTONE_INKS)
    this.count.value = inks.length
    const key = inks.findIndex((k) => k.key)
    this.key.value = inks.length > 1 ? key : -1
    this.ratio.value = Math.max(0.5, ratio)
    this.cell.value = Math.max(2, (look.cell ?? 7) * ratio)
    this.shift = (look.shift ?? 1) * ratio
    this.texture.value = Math.max(0, Math.min(1, look.texture ?? 0.4))
    this.paper.value.set(...lin(look.paper ?? HALFTONE_PAPER))
    this.skied.value = look.sky ? 1 : 0
    if (look.sky) { this.skyTop.value.set(...lin(look.sky[0])); this.skyBottom.value.set(...lin(look.sky[1])) }
    for (let i = 0; i < HALFTONE_INKS; i++) {
      const ink = inks[i]
      const c = ink ? lin(ink.color) : ([1, 1, 1] as const)
      ;(this.inkColor.array[i] as Vector3).set(c[0], c[1], c[2])
      ;(this.inkSoak.array[i] as Vector3).set(ink ? 1 - Math.max(0.02, c[0]) : 0, ink ? 1 - Math.max(0.02, c[1]) : 0, ink ? 1 - Math.max(0.02, c[2]) : 0)
      const t = ((ink?.angle ?? 0) * Math.PI) / 180
      ;(this.turn.array[i] as Vector2).set(Math.cos(t), Math.sin(t))
      const o = plateOff(i, this.shift)
      ;(this.off.array[i] as Vector2).set(o[0], o[1])
    }
    this.fit()
  }

  /** Sizes the pass's targets, in device pixels. */
  setSize(width: number, height: number) {
    if (this.picture.width !== width || this.picture.height !== height) {
      this.picture.setSize(width, height)
      this.res.value.set(width, height)
    }
    this.fit()
  }

  /** The cells' target, big enough for a screen at any turn to cover the picture. */
  private fit() {
    const w = this.picture.width, h = this.picture.height
    const side = 2 * Math.ceil((Math.hypot(w, h) / 2 + this.shift) / this.cell.value + 2)
    this.side.value = side
    if (this.cells.width !== side || this.cells.height !== side * HALFTONE_INKS) this.cells.setSize(side, side * HALFTONE_INKS)
  }

  /** Prints the scene in halftone into the renderer's current target, or onto the screen when it has none. */
  render(renderer: WebGPURenderer, scene: Object3D, camera: Camera) {
    if (!this.look) return
    const to = renderer.getRenderTarget()
    renderer.setRenderTarget(this.picture)
    renderer.clear()
    renderer.render(scene, camera)
    renderer.setRenderTarget(this.cells)
    this.decideQuad.render(renderer)
    renderer.setRenderTarget(to)
    this.showQuad.render(renderer)
  }

  /** One of four values by an ink's place, a whole number. */
  private pick(i: N, v: N[]) {
    return select(i.lessThan(0.5), v[0], select(i.lessThan(1.5), v[1], select(i.lessThan(2.5), v[2], v[3])))
  }

  /** Every screen's cells: the share of its ink each holds (`cellShare`, `separate`). */
  private decideCells() {
    const picture = this.picture.texture
    return Fn(() => {
      const st = uv()
      const ix = floor(st.x.mul(this.side)).toVar()
      const row = floor(st.y.mul(this.side.mul(HALFTONE_INKS))).toVar()
      const ink = floor(row.div(this.side)).toVar()
      const iy = row.sub(ink.mul(this.side)).toVar()
      const n = int(clamp(ink, 0, HALFTONE_INKS - 1))
      const turn = this.turn.element(n).toVar(), off = this.off.element(n).toVar()
      // the cell's middle on the picture, in device pixels: turned about the picture's middle and moved by the plate
      const q = vec2(ix, iy).sub(this.side.mul(0.5)).add(0.5).mul(this.cell).toVar()
      const mid = vec2(turn.x.mul(q.x).sub(turn.y.mul(q.y)), turn.y.mul(q.x).add(turn.x.mul(q.y))).add(off).add(this.res.mul(0.5)).toVar()
      const sum = vec4(0).toVar()
      for (const [a, b] of CELL_TAPS) {
        const p = mid.add(vec2(turn.x.mul(a).sub(turn.y.mul(b)), turn.y.mul(a).add(turn.x.mul(b))).mul(this.cell))
        sum.addAssign(texture(picture, p.div(this.res)).div(CELL_TAPS.length))
      }
      const down = clamp(mid.y.div(this.res.y), 0, 1)
      const back = mix(this.paper, mix(this.skyTop, this.skyBottom, down), this.skied)
      const color = sum.rgb.add(back.mul(float(1).sub(min(sum.a, 1)))).toVar()
      // what the inks are to make, in log light; one ink matches the luminance
      const lum = dot(color, vec3(0.2126, 0.7152, 0.0722)), plum = dot(this.paper, vec3(0.2126, 0.7152, 0.0722))
      const ratio = select(this.count.lessThan(1.5), vec3(lum.div(max(plum, 0.001))), color.div(max(this.paper, vec3(0.001))))
      const want = log(clamp(ratio, 0.01, 1)).toVar()
      const k = [0, 1, 2, 3].map((i) => this.inkSoak.element(i))
      const a = [0, 1, 2, 3].map(() => float(0).toVar())
      const solve = (held: N) => {
        for (let pass = 0; pass < SEPARATE_PASSES; pass++) {
          for (let i = 0; i < HALFTONE_INKS; i++) {
            let got: N = vec3(0)
            for (let j = 0; j < HALFTONE_INKS; j++) got = got.add(log(vec3(1).sub(k[j].mul(a[j]))))
            const d = k[i].negate().div(vec3(1).sub(k[i].mul(a[i]))).toVar()
            const g = dot(got.sub(want), d), h = dot(d, d).add(1e-4)
            a[i].assign(select(held.equal(i), a[i], clamp(a[i].sub(g.div(h)), 0, 1)))
          }
        }
      }
      solve(this.key)
      // the key ink takes over the gray the others share, and they are found again round it
      const gray = float(1).toVar()
      for (let i = 0; i < HALFTONE_INKS; i++) gray.assign(select(this.key.equal(i).or(this.count.lessThanEqual(i)), gray, min(gray, a[i])))
      for (let i = 0; i < HALFTONE_INKS; i++) a[i].assign(select(this.key.equal(i), max(gray.sub(KEY_FROM), 0).div(1 - KEY_FROM).mul(KEY_TAKES), a[i]))
      solve(this.key)
      return vec4(this.pick(ink, a), 0, 0, 1)
    })()
  }

  /** The print: every ink's dot over the paper (`dotCover`, `printed`). */
  private print() {
    const cells = this.cells.texture
    return Fn(() => {
      const st = uv()
      const p = st.mul(this.res).toVar()
      const hash = (v: N) => fract(sin(dot(v, vec2(127.1, 311.7))).mul(43758.5453))
      const noise = (v: N) => {
        const i = floor(v).toVar(), f = v.sub(i).toVar()
        const u = f.mul(f).mul(vec2(3).sub(f.mul(2))).toVar()
        return mix(mix(hash(i), hash(i.add(vec2(1, 0))), u.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), u.x), u.y)
      }
      const rgb = this.paper.toVar()
      for (let i = 0; i < HALFTONE_INKS; i++) {
        const turn = this.turn.element(i), off = this.off.element(i)
        const d = p.sub(this.res.mul(0.5)).sub(off).toVar()
        const q = vec2(turn.x.mul(d.x).add(turn.y.mul(d.y)), turn.x.mul(d.y).sub(turn.y.mul(d.x))).div(this.cell).toVar()
        const at = floor(q).toVar()
        const f = q.sub(at).sub(0.5).toVar()
        const read = vec2(at.x.add(this.side.mul(0.5)).add(0.5).div(this.side), at.y.add(this.side.mul(i + 0.5)).add(0.5).div(this.side.mul(HALFTONE_INKS)))
        const share = texture(cells, read).r.toVar()
        // the spot function cut at the share's level, softened over one device pixel
        const b = float(1).sub(share.mul(2)).toVar()
        const b2 = b.mul(b).toVar()
        const level = b.mul(float(SPOT_FIT[0]).add(b2.mul(float(SPOT_FIT[1]).add(b2.mul(float(SPOT_FIT[2]).add(b2.mul(SPOT_FIT[3])))))))
        const tau = Math.PI * 2
        const spot = cos(f.x.mul(tau)).add(cos(f.y.mul(tau))).mul(0.5)
        const grad = sqrt(sin(f.x.mul(tau)).mul(sin(f.x.mul(tau))).add(sin(f.y.mul(tau)).mul(sin(f.y.mul(tau))))).mul(Math.PI).div(this.cell)
        const soft = clamp(spot.sub(level).div(max(grad, 1e-4)).add(0.5), 0, 1)
        const cover = select(share.lessThanEqual(0.004), float(0), select(share.greaterThanEqual(0.996), float(1), soft)).mul(select(this.count.greaterThan(i), float(1), float(0)))
        const thick = noise(p.div(this.ratio).div(INK_GRAIN).add(vec2(i * 17.3, 0))).sub(0.5).mul(2 * INK_UNEVEN).mul(this.texture).add(1)
        rgb.mulAssign(vec3(1).sub(vec3(1).sub(pow(max(this.inkColor.element(i), vec3(0.02)), vec3(thick))).mul(cover)))
      }
      return vec4(rgb, 1)
    })()
  }

  /** Frees its targets. */
  dispose() {
    this.picture.dispose()
    this.cells.dispose()
    this.decide.dispose()
    this.show.dispose()
  }
}
