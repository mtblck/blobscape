import * as THREE from 'three/webgpu'
import { placeCamera, type Orbit } from '../../splat-core/view.ts'
import { readbackToSrgb } from '../../splat-core/colour.ts'
import { SplatWorld, type PointLight } from '../../splat-engine/engine.ts'
import { sampleClip, type Clip } from '../../splat-engine/glb.ts'
import type { Skeleton, Skin, SkinMode } from '../../splat-engine/rig.ts'
import type { Blobs } from '../../splat-core/blobs.ts'
import { BoneView } from './bones.ts'
import type { BakeOptions, BakedSheet } from '../../splat-engine/bakeSheet.ts'
import type { SheetMove } from '../../splat-engine/spriteSheet.ts'

/**
 * The Creature page's view: Blobscape's own splat engine (src/splat-engine)
 * drawing one rigged creature through three.js's WebGPU renderer, which falls
 * back to WebGL 2 where a browser has no WebGPU. Unlike the lessons, which
 * pose a few thousand blobs on the CPU and hand them to Spark, every blob here
 * is moved by its bones on the GPU, so the creature can have hundreds of
 * thousands.
 *
 * `offscreen` draws into a render target and copies each frame to a 2D canvas
 * on request: headless test browsers can render WebGPU but not show it.
 */
export interface Actor { blobs: Blobs; skin: Skin; skeleton: Skeleton }

/** What the view shows: the blobs, the bones that move them, or both (bones on top). */
export type Show = 'blobs' | 'bones' | 'both'

export interface StageOptions {
  offscreen?: boolean
  /** Builds each world with live lights (`setLights`), as Scan Studio does. */
  lights?: boolean
}

export class CreatureStage {
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
  /** Poses the actor straight from the time, for motion that never loops (a watch keeping time): used instead of a clip. */
  private poser?: (sk: Skeleton, t: number) => void
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
  /** Called once, after the first frame with a creature in it has been drawn. */
  onFirstFrame?: () => void
  private drawn = false
  /** While a sprite sheet is being drawn, the live view leaves the renderer alone. */
  private baking = false
  private queued?: { actor: Actor; clip?: Clip }
  mode: SkinMode = 'quat'
  private lit: { lights: PointLight[]; ambient: number } = { lights: [], ambient: 1 }

  private constructor(private readonly display: HTMLCanvasElement, private readonly opts: StageOptions, renderer: THREE.WebGPURenderer) {
    this.renderer = renderer
    this.backend = (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl'
    this.setFloor(8)
    if (!opts.offscreen) {
      const tick = (now: number) => {
        if (this.stopped) return
        const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0
        this.last = now
        if (this.playing && (this.clip || this.poser) && !this.baking) { this.t += dt * this.speed; this.pose() }
        if (!this.baking && (this.pending > 0 || (this.playing && (this.clip || this.poser)))) {
          this.pending = Math.max(0, this.pending - 1)
          this.resize()
          this.renderer.render(this.scene, this.camera)
          if (this.actor) this.firstFrame()
        }
        this.raf = requestAnimationFrame(tick)
      }
      this.raf = requestAnimationFrame(tick)
    }
  }

  static async start(display: HTMLCanvasElement, opts: StageOptions = {}) {
    const canvas = opts.offscreen ? document.createElement('canvas') : display
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.setClearColor(0x000000, 0)
    await renderer.init()
    return new CreatureStage(display, opts, renderer)
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
    if (this.world) { this.scene.remove(this.world); this.world.dispose() }
    if (this.rig) { this.scene.remove(this.rig); this.rig.dispose() }
    this.actor = actor
    this.world = new SplatWorld([actor], { mode: this.mode, lights: this.opts.lights })
    if (this.opts.lights) this.world.setLights(this.lit.lights, this.lit.ambient)
    this.scene.add(this.world)
    this.rig = new BoneView(actor.skeleton)
    this.scene.add(this.rig)
    this.setShow(this.show)
    // a new actor plays its clip; a caller that poses from the time sets its poser again after
    this.poser = undefined
    this.setClip(clip)
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

  /** Seconds into the clip, or the time a poser is showing. */
  get time() { return this.t }

  setMode(m: SkinMode) {
    this.mode = m
    // a sheet being drawn keeps one rule throughout; the new one applies when it's done
    if (this.baking) return
    if (this.world) { this.world.mode = m; this.world.markPosed() }
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

  invalidate(frames = 2) { this.pending = Math.max(this.pending, frames) }

  private pose() {
    if (!this.actor || !this.world) return
    const sk = this.actor.skeleton
    if (this.poser) this.poser(sk, this.t)
    else if (this.clip) sampleClip(this.clip, sk, this.t)
    else { sk.reset(); sk.update() }
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
    this.renderer.render(this.scene, this.camera)
    if (this.actor) this.firstFrame()
    if (!this.target) return
    const px = await this.renderer.readRenderTargetPixelsAsync(this.target, 0, 0, this.target.width, this.target.height) as Uint8Array
    const { width: w, height: h } = this.target
    const img = new ImageData(w, h)
    // the target holds linear, premultiplied colour; ImageData wants sRGB, straight. WebGPU reads rows top-down, WebGL bottom-up.
    readbackToSrgb(px, w, h, { flip: this.backend === 'webgl', premultiplied: false }, img.data)
    this.display.getContext('2d')!.putImageData(img, 0, 0)
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
    if (this.floor) this.floor.visible = false
    if (this.rig) this.rig.visible = false
    world.visible = true
    try {
      const { bakeSheet } = await import('../../splat-engine/bakeSheet.ts')
      return await bakeSheet({ renderer: this.renderer, scene: this.scene, actor, posed: () => world.markPosed() }, moves, opts, progress)
    } finally {
      this.baking = false
      if (this.floor) this.floor.visible = true
      const next = this.queued
      this.queued = undefined
      if (next) this.setActor(next.actor, next.clip)
      else { this.setMode(this.mode); this.setShow(this.show); this.pose() }
    }
  }

  dispose() {
    this.stopped = true
    cancelAnimationFrame(this.raf)
    this.world?.dispose()
    this.rig?.dispose()
    this.target?.dispose()
    this.renderer.dispose()
  }
}
