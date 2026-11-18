import * as THREE from 'three/webgpu'
import { STAGE_FOV, placeCamera, type Orbit } from '../splat-core/orbit.ts'
import { readbackToSrgb } from '../splat-core/color.ts'
import { SplatWorld, type Light } from './engine.ts'
import { SHADOW_DENSITY } from './shadow.ts'
import type { ShapeEdit } from './edit.ts'
import { sampleClip, sampleWeights, type Clip } from './glb.ts'
import type { Morph } from './morph.ts'
import type { Skeleton, Skin, SkinMode } from './rig.ts'
import type { Blobs } from '../splat-core/blobs.ts'
import { BoneView } from './boneView.ts'
import { startRenderer } from './startRenderer.ts'
import type { BakeOptions, BakedSheet } from './bakeSheet.ts'
import type { SheetMove } from './spriteSheet.ts'
import { PixelPass } from './pixelPass.ts'
import { boneLabel, boneShare, pickActors } from './pick.ts'
import { lookColors, snapColors, type Frame, type PixelLook } from '../splat-core/pixel.ts'
import { INK, type MarkLook, type OutlinePen } from '../splat-core/marks.ts'
import { InkLines } from './inkLines.ts'
import { SplatLens } from './lens.ts'
import { SplatMirror } from './mirror.ts'
import type { MirrorImage, MirrorPlane } from './reflect.ts'
import type { OpticsLook } from '../splat-core/optics.ts'
import { srgbToLinear } from '../splat-core/color.ts'

/** How many times a second a stage draws its mirror's picture again, at most (`Stage.setMirror`). */
export const MIRROR_PACE = 24

/** What a stage shows: blobs, the skin that ties them to bones, and the skeleton. */
export interface Actor {
  /** The blobs in the rest pose. */
  blobs: Blobs
  /** Which bones move each blob, and by how much. */
  skin: Skin
  /** The bones, and their pose. */
  skeleton: Skeleton
  /** Blend shapes (from an opened .glb): a clip's weights, or `setMorphWeights` while none play, reshape the blobs on the CPU. */
  morphs?: Morph[]
}

/** What the view shows: the blobs, the bones that move them, or both (bones on top). */
export type Show = 'blobs' | 'bones' | 'both'

/** A bone found under the pointer (or stepped to): what the page says about it. */
export interface PickedBone {
  /** The bone's index in the skeleton. */
  bone: number
  /** Its name for people: 'left forearm'. */
  label: string
  /** How many blobs it moves at all. */
  blobs: number
}

/** Blobs a bone moves turn toward this coral, as much as they follow it; the rest go dim, so its reach shows at a glance. */
const PICK_TINT = [0.95, 0.33, 0.23]
const PICK_DIM = 0.4

/** How a `Stage` starts. */
export interface StageOptions {
  /**
   * Draws into a render target and copies each frame to a 2D canvas on request: headless test browsers can render
   * WebGPU but not show it.
   */
  offscreen?: boolean
  /** Builds each world with live lights (`setLights`), as Scan Studio does. */
  lights?: boolean
  /** How dark what stands in a casting light's way makes it (the world's `shadowDensity`): left out, soft shadows that thin things let light through. */
  shadowDensity?: number
  /** Uses the WebGL 2 backend even where WebGPU would start: for testing the fallback. */
  webgl?: boolean
  /** Builds each world so cuts (`setEdits`) have a clean edge, tested per pixel (`setCleanCuts` turns it off and on). */
  cleanCuts?: boolean
}

/**
 * The engine's front door: one rigged creature (or a scene) on a canvas, drawn
 * by `SplatWorld` through three.js's WebGPU renderer, which falls back to
 * WebGL 2 where a browser has no WebGPU. Every blob is moved by its bones on
 * the GPU, so a creature can have hundreds of thousands. It plays a clip or a
 * poser, orbits, picks bones, draws pixel art and bakes sprite sheets.
 *
 *   const stage = await Stage.start(canvas)
 *   stage.setActor(makeFox(20000), recordClip('trot', ...))
 *
 * On blobscape.dev it is the Creature page's view (`CreatureStage`) and every
 * engine experiment's.
 *
 * `offscreen` draws into a render target and copies each frame to a 2D canvas
 * on request: headless test browsers can render WebGPU but not show it.
 */
export class Stage {
  /** The three.js renderer the stage made and draws with. */
  readonly renderer: THREE.WebGPURenderer
  /** Which backend the renderer started on: WebGPU, or WebGL 2 where a browser has none. */
  readonly backend: 'webgpu' | 'webgl'
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(STAGE_FOV, 1, 0.05, 100)
  private world?: SplatWorld
  private rig?: BoneView
  private floor?: THREE.GridHelper
  private show: Show = 'blobs'
  private actor?: Actor
  /** Actors drawn with the one shown, in its world: a pond's surface, which `reshape` sends up again. */
  private extras: Actor[] = []
  private clip?: Clip
  /** For an actor with morphs: its blobs as built (the actor shown holds a copy that the weights reshape). */
  private morphRest?: Blobs
  private morphW = new Float32Array(0)
  private morphShown = new Float32Array(0)
  /** The morphs' weights while no clip keys them. */
  private heldW = new Float32Array(0)
  /** Poses the actor straight from the time, for motion that never loops (a watch keeping time): used instead of a clip. */
  private poser?: (sk: Skeleton, t: number) => void
  private after?: (sk: Skeleton, t: number) => void
  /** Loose parts that swing on top of the move while it plays live (`Swing`); never in a sheet. */
  private swing?: { update(sk: Skeleton, dt: number): void; reset(): void }
  private target?: THREE.RenderTarget
  private raf = 0
  private stopped = false
  private lastW = 0
  private lastH = 0
  private t = 0
  private last = 0
  /** Frames left to draw while nothing moves (orbiting, a new creature). */
  private pending = 2
  /** Where the camera looks from. Set it to move the view. */
  orbit: Orbit = { target: [0, 0.72, 0], distance: 4.2, azimuth: 40, elevation: 12 }
  /** Whether time moves on. False holds the pose. */
  playing = true
  /** How fast time runs: 1 is real time, 0.5 half speed. */
  speed = 1
  /**
   * Held frames: above 0, the pose only moves on every `step` seconds and the picture is left alone in between,
   * like animation drawn at a few frames a second. In pixel mode that is what stops edges crawling.
   */
  step = 0
  private posedAt = NaN
  /** Called once, after the first frame with a creature in it has been drawn. */
  onFirstFrame?: () => void
  private drawn = false
  /** While a sprite sheet is being drawn, the live view leaves the renderer alone. */
  private baking = false
  private queued?: { actor: Actor; clip?: Clip; extras: Actor[] }
  /** How a blob on several bones takes its shape: see `SkinMode`. Change it with `setMode`. */
  mode: SkinMode = 'quat'
  private lit: { lights: Light[]; ambient: number | readonly [number, number, number] } = { lights: [], ambient: 1 }
  private lightEase = 0
  /** Pixel mode: the scene drawn small and turned into pixel art (pixelPass.ts). */
  private pixel?: PixelPass
  /** How many CSS pixels across one art pixel is. */
  private pixelSize = 4
  private readonly buffer = new THREE.Vector2()
  private readonly ray = new THREE.Raycaster()
  /** The bone lit up, if any: its blobs tinted on the GPU only (the creature's own colors stay as they were, for files and sheets). */
  private highlighted?: number
  private painter?: (color: readonly [number, number, number], blob: number) => readonly number[]
  private sort: 'bins' | 'radix' = 'bins'
  private mirror?: SplatMirror
  private mirrorFor?: { plane: MirrorPlane; lift?: number; width?: number; seen: (image: MirrorImage) => void }
  /** Whether the pose or the view changed since the mirror's picture was drawn. */
  private mirrorDue = false
  private mirrored = 0

  private constructor(private readonly display: HTMLCanvasElement, private readonly opts: StageOptions, renderer: THREE.WebGPURenderer) {
    this.renderer = renderer
    this.backend = (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl'
    this.setFloor(8)
    if (!opts.offscreen) {
      const tick = (now: number) => {
        if (this.stopped) return
        const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0
        this.last = now
        let moved = false
        if (this.playing && (this.clip || this.poser) && !this.baking) {
          this.t += dt * this.speed
          moved = this.time !== this.posedAt
          if (moved) this.pose()
        }
        // eased light that is still on its way needs drawing though nothing else changed
        if (!this.baking && (this.pending > 0 || moved || this.world?.settling)) {
          this.pending = Math.max(0, this.pending - 1)
          this.resize()
          // a picture that is due but held back by the pace is drawn on a later frame
          if (this.reflect() === null && this.mirrorFor && this.mirrorDue) this.pending = Math.max(this.pending, 1)
          this.draw()
          if (this.actor) this.firstFrame()
        }
        this.raf = requestAnimationFrame(tick)
      }
      this.raf = requestAnimationFrame(tick)
    }
  }

  /** Starts a stage on a canvas: makes the renderer (WebGPU, or WebGL 2 where there is none) and begins drawing. */
  static async start(display: HTMLCanvasElement, opts: StageOptions = {}) {
    const canvas = opts.offscreen ? document.createElement('canvas') : display
    const renderer = await startRenderer({ canvas, antialias: false, alpha: true, forceWebGL: !!opts.webgl }, (r) => {
      r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
      r.setClearColor(0x000000, 0)
    })
    return new Stage(display, opts, renderer)
  }

  private firstFrame() {
    if (this.drawn) return
    this.drawn = true
    this.onFirstFrame?.()
  }

  /** How many blobs the creature shown has. */
  get blobCount() { return this.actor?.blobs.count ?? 0 }

  /**
   * Shows a creature, replacing the last one, and plays `clip` on it. `extras` are more actors drawn in the same
   * world, sorted blob by blob with the first: things that move on their own and not by its bones, such as the
   * surface of a pond (`reshape` sends one up again after its blobs were changed). Clips, posers, picking, tints and
   * sheets are all about the first actor.
   */
  setActor(actor: Actor, clip?: Clip, extras: Actor[] = []) {
    // a sheet being drawn holds on to the current world; swap once it's done
    if (this.baking) { this.queued = { actor, clip, extras }; return }
    this.extras = extras
    this.pixel?.reset()
    if (this.world) { this.scene.remove(this.world); this.world.dispose() }
    if (this.rig) { this.scene.remove(this.rig); this.rig.dispose() }
    // the engine reshapes the blobs for the morphs (on the GPU where it can), so the blobs handed in stay as built
    const m = actor.morphs?.length ?? 0
    this.morphRest = m ? actor.blobs : undefined
    this.morphW = new Float32Array(m)
    this.morphShown = new Float32Array(m)
    this.heldW = new Float32Array(m)
    this.actor = actor
    this.highlighted = undefined
    this.build(actor)
    this.rig = new BoneView(actor.skeleton)
    this.scene.add(this.rig)
    this.setShow(this.show)
    // a new actor plays its clip; a caller that poses from the time sets its poser again after
    this.poser = undefined
    this.after = undefined
    this.swing = undefined
    this.setClip(clip)
  }

  private build(actor: Actor) {
    this.world = new SplatWorld([actor, ...this.extras], { mode: this.mode, lights: this.opts.lights, sort: this.sort, cleanCuts: this.opts.cleanCuts, shadowDensity: this.opts.shadowDensity })
    if (this.opts.lights) this.world.setLights(this.lit.lights, this.lit.ambient)
    this.world.lightEase = this.lightEase
    this.world.setFog(...this.fog)
    this.world.setMarks(this.marks)
    this.world.cleanCuts = this.clean
    if (this.edits.length) this.world.setEdits(this.edits)
    this.scene.add(this.world)
    if (this.painter) this.paintOver()
  }

  /**
   * Shows the actor in other colors without changing it: `paint` gives each blob's color (sRGB, 0–1) from its own and
   * its place in the list, and may give a fourth number, a share of the blob's own opacity (0 hides it). Left out,
   * its own colors come back. It stays through a new actor, until it is taken off; `highlight` and `refresh` send the
   * actor's own colors again, so call it again after them, and take it off before `bake`.
   */
  tint(paint?: (color: readonly [number, number, number], blob: number) => readonly number[]) {
    this.painter = paint
    this.paintOver()
  }

  /** Sends the painted colors to the GPU, then puts the actor's own back on the CPU (as `highlight` does). */
  private paintOver() {
    const { actor, world, painter } = this
    if (!actor || !world) return
    const c = actor.blobs.color, o = actor.blobs.opacity, n = actor.blobs.count
    if (painter) {
      const own = c.slice(0, n * 3), solid = o.slice(0, n)
      for (let i = 0; i < n; i++) {
        const p = painter([own[i * 3], own[i * 3 + 1], own[i * 3 + 2]], i)
        c[i * 3] = p[0]; c[i * 3 + 1] = p[1]; c[i * 3 + 2] = p[2]
        if (p.length > 3) o[i] = solid[i] * p[3]
      }
      world.recolor(actor)
      c.set(own); o.set(solid)
    } else world.recolor(actor)
    this.invalidate()
  }

  /** Which depth sort the world uses: the counting sort, or the exact radix sort (slower; ties always in one order). */
  get sortKind() { return this.sort }
  /**
   * Changes how blobs are sorted by depth: 'bins' is quick, 'radix' settles every tie the same way each frame, which
   * pixel art with hard edges wants.
   */
  setSort(kind: 'bins' | 'radix') {
    if (kind === this.sort) return
    this.sort = kind
    if (!this.actor || !this.world || this.baking) return
    this.pixel?.reset()
    this.scene.remove(this.world)
    this.world.dispose()
    this.highlighted = undefined
    this.morphShown.fill(NaN)
    this.build(this.actor)
    this.setShow(this.show)
    this.posedAt = NaN
    this.pose()
  }

  /** Plays another clip on the creature shown, or none. `from` is the time it starts at, in seconds (left out, time runs on). */
  setClip(clip?: Clip, from = this.t) {
    this.clip = clip
    this.t = from
    this.pose()
  }

  /**
   * Runs `after` each time the creature is posed, once its clip or poser has set the bones and before loose parts
   * swing: for a change laid on top of any move, such as a head turned to look at something. It must leave the
   * skeleton updated. It stays through a new clip and goes with a new actor.
   */
  setAfter(after?: (sk: Skeleton, t: number) => void) {
    this.after = after
    this.pose()
  }

  /** Poses from the time instead of a clip; `t` starts at `from` seconds. */
  setPoser(poser?: (sk: Skeleton, t: number) => void, from = this.t) {
    this.poser = poser
    this.t = from
    this.pose()
  }

  /** Loose parts that swing after the body while a move plays (a `Swing` made for this actor's skeleton), or none. */
  setSwing(swing?: { update(sk: Skeleton, dt: number): void; reset(): void }) {
    this.swing = swing
    swing?.reset()
    this.pose()
  }

  /** The morphs' weights while no clip keys them (the clip's own weights win while it plays). */
  setMorphWeights(w: ArrayLike<number>) {
    for (let k = 0; k < this.heldW.length; k++) this.heldW[k] = w[k] ?? 0
    this.pose()
  }

  /** Sets the actor's morph weights for a time (the clip's, or the held ones while none plays); the engine reshapes the blobs. */
  private morph(clip: Clip | undefined, t: number) {
    if (!this.morphRest || !this.world) return
    if (!sampleWeights(clip, t, this.morphW)) this.morphW.set(this.heldW)
    if (this.morphW.every((v, k) => v === this.morphShown[k])) return
    this.morphShown.set(this.morphW)
    this.world.setMorphWeights(0, this.morphW)
  }

  /** After the actor's blobs were changed in place (a poser may do it each frame): the engine takes them again. */
  refresh() {
    this.world?.refresh()
    this.invalidate()
  }

  /**
   * After one actor's blobs were changed in place (the one shown or one of its `extras`): the engine takes that
   * actor's centers, shapes and colors again and leaves the rest alone, which is what a pond's surface wants each
   * frame. The count must not change, and the blobs must stay about where they were.
   */
  reshape(actor: Actor) {
    this.world?.reshape(actor)
    // not `invalidate`: a mirror's picture is what colored these blobs, and need not be drawn again for them
    this.pending = Math.max(this.pending, 2)
  }

  /**
   * Draws what a flat mirror shows of the scene (`SplatMirror`) and hands each picture to `seen` as it is read back,
   * a frame or two later: for water, or a polished floor, whose blobs color themselves from it (`seenIn`). The
   * picture is drawn again when the pose or the view changes, at most `MIRROR_PACE` times a second. `lift` leaves
   * out blobs lower than that over the plane (the mirror's own). Offscreen, `frame` waits for the picture of its
   * own moment before it draws. Left out, the mirror is taken away.
   */
  setMirror(mirror?: { plane: MirrorPlane; lift?: number; width?: number; seen: (image: MirrorImage) => void }) {
    this.mirrorFor = mirror
    if (!mirror) { this.mirror?.dispose(); this.mirror = undefined }
    this.invalidate()
  }

  /** Draws the mirror's picture for the camera as it stands, if one is due, and asks for it back. */
  private reflect(now = false): Promise<void> | null {
    const m = this.mirrorFor
    if (!m || !this.world || this.baking) return null
    const at = performance.now()
    if (!now && (!this.mirrorDue || at - this.mirrored < 1000 / MIRROR_PACE)) return null
    this.mirrored = at
    this.mirrorDue = false
    const mirror = this.mirror ??= new SplatMirror()
    const width = m.width ?? 320
    mirror.setSize(width, Math.max(1, Math.round(width / Math.max(0.2, this.camera.aspect))))
    this.camera.updateProjectionMatrix()
    mirror.render(this.renderer, this.scene, this.camera, m.plane, m.lift ?? 0)
    return mirror.read(this.renderer).then((image) => { if (image && this.mirrorFor === m) m.seen(image) }, () => {})
  }

  /** Seconds into the clip, or the time a poser is showing. */
  get time() { return this.step > 0 ? Math.floor(this.t / this.step + 1e-6) * this.step : this.t }

  /** Changes how a blob on several bones takes its shape: see `SkinMode`. */
  setMode(m: SkinMode) {
    this.mode = m
    // a sheet being drawn keeps one rule throughout; the new one applies when it's done
    if (this.baking) return
    if (this.world) { this.world.mode = m; this.world.markPosed() }
    this.invalidate()
  }

  private fog: [color: [number, number, number], near: number, far: number] = [[0, 0, 0], 0, 0]
  /**
   * Eases live light over about `frames` frames (the world's `lightEase`; 0 is none; WebGPU only), kept for the next
   * actor too: a shadow's edge crossing a blob fades instead of popping. For lights that move slowly, like a sun.
   */
  setLightEase(frames: number) {
    this.lightEase = Math.max(0, frames)
    if (this.world) this.world.lightEase = this.lightEase
    this.invalidate()
  }

  /**
   * How dark what stands in a casting light's way makes it (the world's `shadowDensity`), kept for the next actor too:
   * lower for fur and grass, which shade themselves dark at the engine's own.
   */
  setShadowDensity(density: number | undefined) {
    this.opts.shadowDensity = density
    if (this.world) this.world.shadowDensity = density ?? SHADOW_DENSITY
    this.invalidate()
  }

  /** Distance fog toward `color` (linear) from `near` to `far` units from the camera (`far` 0 is none); kept for the next actor too. */
  setFog(color: [number, number, number], near: number, far: number) {
    this.fog = [color, near, far]
    this.world?.setFog(color, near, far)
    this.invalidate()
  }

  private edits: ShapeEdit[] = []
  private clean = true
  /**
   * Cuts by shape, live (edit.ts): spheres, boxes or upright cylinders in world space, kept for the next actor too;
   * [] clears them. On a stage made with `cleanCuts` the edge is the shape's own line.
   */
  setEdits(edits: readonly ShapeEdit[]) {
    this.edits = edits.filter((e) => e.op === 'cut' || this.opts.lights).map((e) => ({ ...e }))
    this.world?.setEdits(this.edits)
    this.invalidate()
  }

  /** On a stage made with `cleanCuts`: whether cuts have the clean edge (the default) or drop whole blobs. */
  setCleanCuts(on: boolean) {
    this.clean = on
    if (this.world) this.world.cleanCuts = on
    this.invalidate()
  }

  private lines?: InkLines
  private pen: OutlinePen = {}
  /**
   * Draws outlines over the picture as a pen would (inkLines.ts): round the subject, where one thing stands in front
   * of another, and between its parts. Leave the pen out to stop. With any look, or none; pixel mode has its own lines.
   */
  setOutline(pen?: OutlinePen) {
    if (!pen) { this.lines?.dispose(); this.lines = undefined }
    else { this.pen = pen; this.lines ??= new InkLines() }
    this.invalidate()
  }

  private lens?: SplatLens
  private lensLook?: OpticsLook
  /**
   * Draws the picture through a lens (lens.ts): light spilling round bright things, and blur for whatever is nearer
   * or farther than the distance in focus. Leave the look out to stop. Not in pixel mode, and outlines take its place
   * while they are on.
   */
  setLens(look?: OpticsLook) {
    this.lensLook = look
    if (!look) { this.lens?.dispose(); this.lens = undefined }
    else this.lens ??= new SplatLens()
    this.invalidate()
  }

  private marks?: MarkLook
  /**
   * Draws every blob as a brush mark or an ink stroke, or as soft dots again when left out; kept for the next actor
   * too. The marks belong to the blobs, so they stay put as the view turns.
   */
  setMarks(look?: MarkLook) {
    this.marks = look
    this.world?.setMarks(look)
    this.invalidate()
  }

  /**
   * Live lights on the world (needs the `lights` option); kept for the next actor too. A light is at a place or from a
   * direction (a sun); `ambient` is one brightness or a linear color.
   */
  setLights(lights: Light[], ambient: number | readonly [number, number, number] = 1) {
    this.lit = { lights, ambient }
    this.world?.setLights(lights, ambient)
    this.invalidate()
  }

  /** A floor `size` across in half-unit squares, so the grid shows how big each creature is. */
  setFloor(size: number) {
    if (this.floor?.userData.size === size) return
    if (this.floor) { this.scene.remove(this.floor); this.floor.dispose(); this.floor = undefined }
    // no floor at all: a watch on show has nothing to stand on
    if (size <= 0) { this.invalidate(); return }
    this.floor = new THREE.GridHelper(size, size * 2, 0x8a8a8a, 0x5a5a5a)
    this.floor.userData.size = size
    this.floor.renderOrder = -1
    this.floor.visible = !this.baking
    this.scene.add(this.floor)
    this.invalidate()
  }

  /** Shows the blobs, the bones, or both. */
  setShow(s: Show) {
    this.show = s
    if (this.baking) return
    if (this.world) this.world.visible = s !== 'bones'
    if (this.rig) { this.rig.visible = s !== 'blobs'; this.rig.onTop = s === 'both'; this.rig.update() }
    this.invalidate()
  }

  /**
   * Pixel mode on (with a look) or off. `size` is how many CSS pixels across
   * one art pixel is; the art is that many times smaller than the view.
   */
  setPixels(look?: PixelLook, size = 4) {
    this.pixelSize = size
    if (!look) { this.pixel?.dispose(); this.pixel = undefined }
    else if (this.pixel) this.pixel.setLook(look)
    else this.pixel = new PixelPass(look)
    this.invalidate()
  }

  /** Pixel mode's art size in pixels, once a frame has been drawn. */
  get artSize() { return this.pixel && this.pixel.width > 1 ? { width: this.pixel.width, height: this.pixel.height } : undefined }

  /** Device pixels per art pixel: whole, so every art pixel is the same size on screen. */
  private get pixelScale() { return Math.max(1, Math.round(this.pixelSize * this.renderer.getPixelRatio())) }

  private draw() {
    if (!this.pixel && this.lines) {
      const { x, y } = this.target ? { x: this.target.width, y: this.target.height } : this.renderer.getDrawingBufferSize(this.buffer)
      this.lines.setSize(x, y)
      this.lines.setPen((this.pen.ink ?? INK).map(srgbToLinear), (this.pen.width ?? 1.5) * this.renderer.getPixelRatio())
      this.lines.render(this.renderer, this.scene, this.camera)
      return
    }
    if (!this.pixel && this.lens && this.lensLook) {
      const { x, y } = this.target ? { x: this.target.width, y: this.target.height } : this.renderer.getDrawingBufferSize(this.buffer)
      this.lens.setSize(x, y)
      this.lens.setLook(this.lensLook, this.camera.fov)
      this.lens.render(this.renderer, this.scene, this.camera)
      return
    }
    if (!this.pixel) { this.renderer.render(this.scene, this.camera); return }
    const scale = this.pixelScale
    if (this.target) {
      this.pixel.setSize(Math.ceil(this.target.width / scale), Math.ceil(this.target.height / scale))
      this.pixel.render(this.renderer, this.scene, this.camera)
      return
    }
    const { x, y } = this.renderer.getDrawingBufferSize(this.buffer)
    this.pixel.setSize(Math.ceil(x / scale), Math.ceil(y / scale))
    this.pixel.render(this.renderer, this.scene, this.camera, { width: x, height: y, scale })
  }

  private async read(target: THREE.RenderTarget, encoded = false): Promise<Frame> {
    const { width, height } = target
    const px = await this.renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height) as Uint8Array
    // a target holds linear, premultiplied color (pixel mode's art, `encoded`, already holds sRGB); a frame is sRGB, straight, top row first. WebGPU reads rows top-down, WebGL bottom-up.
    return { width, height, data: readbackToSrgb(px, width, height, { flip: this.backend === 'webgl', premultiplied: false, encoded }) }
  }

  /** Pixel mode's last frame as it was drawn small, and as finished art (exactly in the look's colors): for tests and for saving. */
  async pixelFrames(): Promise<{ small: Frame; art: Frame; before?: Frame; parts?: Frame; fine?: { small: Frame; parts: Frame } } | undefined> {
    // a sheet being drawn has the renderer to itself
    if (!this.pixel || this.baking) return
    // pixel mode can be switched off, or the view resized, while the reads are out: hold the pass and start every read now
    const pass = this.pixel
    if (!this.target) pass.render(this.renderer, this.scene, this.camera)
    const colors = lookColors(pass.look)
    const fine = !!pass.look.fine
    const [small, art, before, parts, fineSmall, fineParts] = await Promise.all([
      this.read(pass.small), this.read(pass.art, true), pass.before ? this.read(pass.before, true) : undefined, pass.look.parts || fine ? this.read(pass.ids, true) : undefined,
      fine ? this.read(pass.fineSmall) : undefined, fine ? this.read(pass.fineIds, true) : undefined,
    ])
    // a look with four samples a pixel also gives what it was settled from: the scene and its map of parts at twice the size
    return { small, art: snapColors(art, colors), before: before && snapColors(before, colors), parts, fine: fineSmall && fineParts && { small: fineSmall, parts: fineParts } }
  }

  /**
   * The bone under a point on the view (CSS pixels from its top left), as the creature stands now:
   * the bone that holds most of the blob the pointer is on. Undefined when the pointer is off the creature.
   */
  pick(x: number, y: number): PickedBone | undefined {
    const hit = this.hitAt(x, y)
    return hit ? this.boneInfo(hit.bone) : undefined
  }

  /** The line from the camera through a point on the view (CSS pixels from its top left), in world space. */
  rayAt(x: number, y: number): { origin: [number, number, number]; direction: [number, number, number] } | undefined {
    const w = this.display.clientWidth, h = this.display.clientHeight
    if (!w || !h) return
    placeCamera(this.camera as never, this.orbit, w / h)
    this.camera.updateMatrixWorld()
    this.ray.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, 1 - (y / h) * 2), this.camera)
    const { origin, direction } = this.ray.ray
    return { origin: origin.toArray(), direction: direction.toArray() }
  }

  /**
   * Where a point in world space falls on the view, in CSS pixels from its top left, for drawing over the picture;
   * undefined behind the camera. `orbit` is the view to use when it is not the stage's own yet.
   */
  screenAt(p: ArrayLike<number>, orbit: Orbit = this.orbit): { x: number; y: number } | undefined {
    const w = this.display.clientWidth, h = this.display.clientHeight
    if (!w || !h) return
    placeCamera(this.camera as never, orbit, w / h)
    this.camera.updateMatrixWorld()
    const v = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(this.camera.matrixWorldInverse)
    if (v.z > -this.camera.near) return
    v.applyMatrix4(this.camera.projectionMatrix)
    return { x: (v.x * 0.5 + 0.5) * w, y: (0.5 - v.y * 0.5) * h }
  }

  /** The bone under a point on the view (CSS pixels from its top left) and where the pointer meets it, in world space. */
  hitAt(x: number, y: number): { bone: number; point: [number, number, number] } | undefined {
    const { actor } = this
    const w = this.display.clientWidth, h = this.display.clientHeight
    if (!actor || !w || !h) return
    placeCamera(this.camera as never, this.orbit, w / h)
    this.camera.updateMatrixWorld()
    this.ray.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, 1 - (y / h) * 2), this.camera)
    const { origin, direction } = this.ray.ray
    const hit = pickActors([actor], origin.toArray(), direction.toArray())
    return hit ? { bone: hit.bone, point: hit.point } : undefined
  }

  /** What the page says about a bone. */
  boneInfo(bone: number): PickedBone | undefined {
    const { actor } = this
    if (!actor || bone < 0 || bone >= actor.skeleton.count) return
    const share = boneShare(actor, bone)
    let blobs = 0
    for (const s of share) if (s > 0.02) blobs++
    return { bone, label: boneLabel(actor.skeleton.bones[bone].name), blobs }
  }

  /** Lights up one bone and the blobs it moves (or none). */
  highlight(bone?: number) {
    this.highlighted = bone
    this.paintHighlight()
  }

  /** Tints the GPU's copy of the colors for the bone lit up, then puts the creature's own colors back on the CPU. */
  private paintHighlight() {
    const { actor, world } = this
    if (!actor || !world) return
    const bone = this.highlighted
    this.rig?.setHighlight(bone)
    const c = actor.blobs.color
    if (bone === undefined) { world.recolor(actor); this.invalidate(); return }
    const own = c.slice(0, actor.blobs.count * 3)
    const share = boneShare(actor, bone)
    for (let i = 0; i < actor.blobs.count; i++) {
      const k = Math.min(1, share[i] * 1.25)
      for (let j = 0; j < 3; j++) {
        const v = own[i * 3 + j]
        c[i * 3 + j] = v * PICK_DIM * (1 - k) + (v * 0.25 + PICK_TINT[j] * 0.75) * k
      }
    }
    world.recolor(actor)
    c.set(own)
    this.invalidate()
  }

  /**
   * Asks for the next `frames` frames to be drawn. Call it after changing something the stage can't see, such as its
   * `orbit`.
   */
  invalidate(frames = 2) { this.pending = Math.max(this.pending, frames); this.mirrorDue = true }

  private pose() {
    if (!this.actor || !this.world) return
    const sk = this.actor.skeleton
    const was = this.posedAt
    const t = this.posedAt = this.time
    if (this.poser) this.poser(sk, t)
    else if (this.clip) sampleClip(this.clip, sk, t)
    else { sk.reset(); sk.update() }
    this.after?.(sk, t)
    if (this.swing && (this.poser || this.clip)) this.swing.update(sk, Number.isFinite(was) ? Math.min(0.1, Math.max(0, t - was)) : 0)
    else this.swing?.reset()
    this.morph(this.poser ? undefined : this.clip, t)
    this.world.markPosed()
    if (this.rig?.visible) this.rig.update()
    this.invalidate()
  }

  private resize() {
    const w = this.display.clientWidth, h = this.display.clientHeight
    // setSize resets the canvas (and on WebGPU its swap chain), so only when the size changed
    if (w && h && (w !== this.lastW || h !== this.lastH)) { this.renderer.setSize(w, h, false); this.lastW = w; this.lastH = h }
    placeCamera(this.camera as never, this.orbit, h > 0 ? w / h : 1)
    if (this.opts.offscreen && w && h) {
      const pw = Math.floor(w * this.renderer.getPixelRatio()), ph = Math.floor(h * this.renderer.getPixelRatio())
      if (!this.target || this.target.width !== pw || this.target.height !== ph) {
        this.target?.dispose()
        this.target = new THREE.RenderTarget(pw, ph)
        this.display.width = pw
        this.display.height = ph
      }
      this.renderer.setRenderTarget(this.target)
    }
  }

  /**
   * @internal Poses and draws the frame as it stands once more and waits until the GPU has finished it: how long that
   * took, in milliseconds. For a page that times this stage beside other renderers (One Scene, Four Ways).
   */
  async timed(): Promise<number> {
    const t0 = performance.now()
    this.pose()
    this.resize()
    this.draw()
    const b = this.renderer.backend as unknown as { device?: { queue: { onSubmittedWorkDone(): Promise<void> } }; gl?: WebGL2RenderingContext }
    if (b.device) await b.device.queue.onSubmittedWorkDone()
    // reading one pixel back can't finish before the frame does
    else b.gl?.readPixels(0, 0, 1, 1, b.gl.RGBA, b.gl.UNSIGNED_BYTE, new Uint8Array(4))
    return performance.now() - t0
  }

  /** Offscreen only: draws the frame `t` seconds into the clip and copies it to the page. */
  async frame(t: number) {
    this.t = t
    this.pose()
    this.resize()
    // the mirror's picture of this very moment, so what a test or a recording sees does not depend on timing
    await this.reflect(true)
    this.draw()
    if (this.actor) this.firstFrame()
    if (!this.target) return
    // read back by checks: a CPU canvas, because a GPU one gives a few faint pixels a different rounding the first time it is read
    const ctx = this.display.getContext('2d', { willReadFrequently: true })!
    if (this.pixel) {
      // the art, scaled up in whole pixels
      const art = await this.read(this.pixel.art, true)
      const c = document.createElement('canvas')
      c.width = art.width
      c.height = art.height
      c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(art.data), art.width, art.height), 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, this.display.width, this.display.height)
      ctx.drawImage(c, 0, 0, art.width * this.pixelScale, art.height * this.pixelScale)
      return
    }
    const f = await this.read(this.target)
    ctx.putImageData(new ImageData(new Uint8ClampedArray(f.data), f.width, f.height), 0, 0)
  }

  /**
   * Draws the creature on show as a pixel-art sprite sheet (bakeSheet.ts), with
   * the floor and bones out of the picture and the live view paused, then puts
   * the view back as it was.
   */
  async bake(moves: SheetMove[], opts: BakeOptions, progress?: (done: number, total: number) => void): Promise<BakedSheet> {
    const { actor, world } = this
    if (!actor || !world) throw new Error('No creature to draw')
    if (this.baking) throw new Error('Already drawing a sheet')
    this.baking = true
    // a sheet shows the creature's own colors, not the bone lit up
    const lit = this.highlighted
    if (lit !== undefined) world.recolor(actor)
    if (this.floor) this.floor.visible = false
    if (this.rig) this.rig.visible = false
    world.visible = true
    try {
      const { bakeSheet } = await import('./bakeSheet.ts')
      // a sheet's frames are reshaped as they're drawn (and framed), each sent up whole, so the GPU never lags the CPU copy
      const morph = this.morphRest ? (c: Clip | undefined, t: number) => this.morph(c, t) : undefined
      return await bakeSheet({ renderer: this.renderer, scene: this.scene, actor, posed: () => world.markPosed(), morph }, moves, opts, progress)
    } finally {
      this.baking = false
      if (this.floor) this.floor.visible = true
      const next = this.queued
      this.queued = undefined
      if (next) this.setActor(next.actor, next.clip, next.extras)
      else {
        this.setMode(this.mode); this.setShow(this.show); this.pose()
        if (lit !== undefined) this.paintHighlight()
      }
    }
  }

  /** Stops drawing and frees what the stage made. */
  dispose() {
    this.stopped = true
    cancelAnimationFrame(this.raf)
    this.world?.dispose()
    this.rig?.dispose()
    this.lines?.dispose()
    this.lens?.dispose()
    this.mirror?.dispose()
    this.target?.dispose()
    this.pixel?.dispose()
    this.renderer.dispose()
  }
}

/** The name the site's pages use. */
export { Stage as CreatureStage }
