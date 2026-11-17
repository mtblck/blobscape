import * as THREE from 'three/webgpu'
import { placeCamera, type Orbit } from '../splat-core/orbit.ts'
import { readbackToSrgb } from '../splat-core/color.ts'
import { SplatWorld, type PointLight } from './engine.ts'
import { sampleClip, sampleWeights, type Clip } from './glb.ts'
import type { Morph } from './morph.ts'
import type { Skeleton, Skin, SkinMode } from './rig.ts'
import type { Blobs } from '../splat-core/blobs.ts'
import { BoneView } from './boneView.ts'
import type { BakeOptions, BakedSheet } from './bakeSheet.ts'
import type { SheetMove } from './spriteSheet.ts'
import { PixelPass } from './pixelPass.ts'
import { boneLabel, boneShare, pickActors } from './pick.ts'
import { lookColors, snapColors, type Frame, type PixelLook } from '../splat-core/pixel.ts'

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
export interface Actor {
  blobs: Blobs; skin: Skin; skeleton: Skeleton
  /** Blend shapes (from an opened .glb): a clip's weights, or `setMorphWeights` while none play, reshape the blobs on the CPU. */
  morphs?: Morph[]
}

/** What the view shows: the blobs, the bones that move them, or both (bones on top). */
export type Show = 'blobs' | 'bones' | 'both'

/** A bone found under the pointer (or stepped to): what the page says about it. */
export interface PickedBone {
  bone: number
  /** Its name for people: 'left forearm'. */
  label: string
  /** How many blobs it moves at all. */
  blobs: number
}

/** Blobs a bone moves turn toward this coral, as much as they follow it; the rest go dim, so its reach shows at a glance. */
const PICK_TINT = [0.95, 0.33, 0.23]
const PICK_DIM = 0.4

export interface StageOptions {
  offscreen?: boolean
  /** Builds each world with live lights (`setLights`), as Scan Studio does. */
  lights?: boolean
  /** Uses the WebGL 2 backend even where WebGPU would start: for testing the fallback. */
  webgl?: boolean
}

export class Stage {
  readonly renderer: THREE.WebGPURenderer
  readonly backend: 'webgpu' | 'webgl'
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100)
  private world?: SplatWorld
  private rig?: BoneView
  private floor?: THREE.GridHelper
  private show: Show = 'blobs'
  private actor?: Actor
  private clip?: Clip
  /** For an actor with morphs: its blobs as built (the actor shown holds a copy that the weights reshape). */
  private morphRest?: Blobs
  private morphW = new Float32Array(0)
  private morphShown = new Float32Array(0)
  /** The morphs' weights while no clip keys them. */
  private heldW = new Float32Array(0)
  /** Poses the actor straight from the time, for motion that never loops (a watch keeping time): used instead of a clip. */
  private poser?: (sk: Skeleton, t: number) => void
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
  orbit: Orbit = { target: [0, 0.72, 0], distance: 4.2, azimuth: 40, elevation: 12 }
  playing = true
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
  private queued?: { actor: Actor; clip?: Clip }
  mode: SkinMode = 'quat'
  private lit: { lights: PointLight[]; ambient: number } = { lights: [], ambient: 1 }
  /** Pixel mode: the scene drawn small and turned into pixel art (pixelPass.ts). */
  private pixel?: PixelPass
  /** How many CSS pixels across one art pixel is. */
  private pixelSize = 4
  private readonly buffer = new THREE.Vector2()
  private readonly ray = new THREE.Raycaster()
  /** The bone lit up, if any: its blobs tinted on the GPU only (the creature's own colors stay as they were, for files and sheets). */
  private highlighted?: number
  private sort: 'bins' | 'radix' = 'bins'

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
        if (!this.baking && (this.pending > 0 || moved)) {
          this.pending = Math.max(0, this.pending - 1)
          this.resize()
          this.draw()
          if (this.actor) this.firstFrame()
        }
        this.raf = requestAnimationFrame(tick)
      }
      this.raf = requestAnimationFrame(tick)
    }
  }

  static async start(display: HTMLCanvasElement, opts: StageOptions = {}) {
    const canvas = opts.offscreen ? document.createElement('canvas') : display
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: true, forceWebGL: !!opts.webgl })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.setClearColor(0x000000, 0)
    await renderer.init()
    return new Stage(display, opts, renderer)
  }

  private firstFrame() {
    if (this.drawn) return
    this.drawn = true
    this.onFirstFrame?.()
  }

  get blobCount() { return this.actor?.blobs.count ?? 0 }

  /** Shows a creature, replacing the last one, and plays `clip` on it. */
  setActor(actor: Actor, clip?: Clip) {
    // a sheet being drawn holds on to the current world; swap once it's done
    if (this.baking) { this.queued = { actor, clip }; return }
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
    this.swing = undefined
    this.setClip(clip)
  }

  private build(actor: Actor) {
    this.world = new SplatWorld([actor], { mode: this.mode, lights: this.opts.lights, sort: this.sort })
    if (this.opts.lights) this.world.setLights(this.lit.lights, this.lit.ambient)
    this.world.setFog(...this.fog)
    this.scene.add(this.world)
  }

  /** Which depth sort the world uses: the counting sort, or the exact radix sort (slower; ties always in one order). */
  get sortKind() { return this.sort }
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

  setClip(clip?: Clip) {
    this.clip = clip
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
  private reshape(clip: Clip | undefined, t: number) {
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

  /** Seconds into the clip, or the time a poser is showing. */
  get time() { return this.step > 0 ? Math.floor(this.t / this.step + 1e-6) * this.step : this.t }

  setMode(m: SkinMode) {
    this.mode = m
    // a sheet being drawn keeps one rule throughout; the new one applies when it's done
    if (this.baking) return
    if (this.world) { this.world.mode = m; this.world.markPosed() }
    this.invalidate()
  }

  private fog: [color: [number, number, number], near: number, far: number] = [[0, 0, 0], 0, 0]
  /** Distance fog toward `color` (linear) from `near` to `far` units from the camera (`far` 0 is none); kept for the next actor too. */
  setFog(color: [number, number, number], near: number, far: number) {
    this.fog = [color, near, far]
    this.world?.setFog(color, near, far)
    this.invalidate()
  }

  /** Live lights on the world (needs the `lights` option); kept for the next actor too. */
  setLights(lights: PointLight[], ambient = 1) {
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
  async pixelFrames(): Promise<{ small: Frame; art: Frame; before?: Frame; parts?: Frame } | undefined> {
    // a sheet being drawn has the renderer to itself
    if (!this.pixel || this.baking) return
    // pixel mode can be switched off, or the view resized, while the reads are out: hold the pass and start every read now
    const pass = this.pixel
    if (!this.target) pass.render(this.renderer, this.scene, this.camera)
    const colors = lookColors(pass.look)
    const [small, art, before, parts] = await Promise.all([this.read(pass.small), this.read(pass.art, true), pass.before ? this.read(pass.before, true) : undefined, pass.look.parts ? this.read(pass.ids, true) : undefined])
    return { small, art: snapColors(art, colors), before: before && snapColors(before, colors), parts }
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

  invalidate(frames = 2) { this.pending = Math.max(this.pending, frames) }

  private pose() {
    if (!this.actor || !this.world) return
    const sk = this.actor.skeleton
    const was = this.posedAt
    const t = this.posedAt = this.time
    if (this.poser) this.poser(sk, t)
    else if (this.clip) sampleClip(this.clip, sk, t)
    else { sk.reset(); sk.update() }
    if (this.swing && (this.poser || this.clip)) this.swing.update(sk, Number.isFinite(was) ? Math.min(0.1, Math.max(0, t - was)) : 0)
    else this.swing?.reset()
    this.reshape(this.poser ? undefined : this.clip, t)
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

  /** Offscreen only: draws the frame `t` seconds into the clip and copies it to the page. */
  async frame(t: number) {
    this.t = t
    this.pose()
    this.resize()
    this.draw()
    if (this.actor) this.firstFrame()
    if (!this.target) return
    const ctx = this.display.getContext('2d')!
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
      const morph = this.morphRest ? (c: Clip | undefined, t: number) => this.reshape(c, t) : undefined
      return await bakeSheet({ renderer: this.renderer, scene: this.scene, actor, posed: () => world.markPosed(), morph }, moves, opts, progress)
    } finally {
      this.baking = false
      if (this.floor) this.floor.visible = true
      const next = this.queued
      this.queued = undefined
      if (next) this.setActor(next.actor, next.clip)
      else {
        this.setMode(this.mode); this.setShow(this.show); this.pose()
        if (lit !== undefined) this.paintHighlight()
      }
    }
  }

  dispose() {
    this.stopped = true
    cancelAnimationFrame(this.raf)
    this.world?.dispose()
    this.rig?.dispose()
    this.target?.dispose()
    this.pixel?.dispose()
    this.renderer.dispose()
  }
}

/** The name the site's pages use. */
export { Stage as CreatureStage }
