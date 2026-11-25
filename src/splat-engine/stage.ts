import { drawsTo, markDrawn } from '../splat-core/drawn.ts'
import * as THREE from 'three/webgpu'
import { STAGE_FOV, placeCamera, snapAnchor, type Orbit, type SnapAnchor } from '../splat-core/orbit.ts'
import { readbackToSrgb } from '../splat-core/color.ts'
import { MAX_LIGHTS, SplatWorld, type Light } from './engine.ts'
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
import { glitchArt, glitchAt, type GlitchLook, type GlitchState } from '../splat-core/glitch.ts'
import { INK, type MarkLook, type OutlinePen } from '../splat-core/marks.ts'
import { InkLines } from './inkLines.ts'
import { CelPass } from './celPass.ts'
import { CEL_FROM, lampTint, type CelLook } from '../splat-core/cel.ts'
import { NeonPass } from './neonPass.ts'
import { NEON_EMIT, type NeonLook } from '../splat-core/neon.ts'
import { GlassPass } from './glassPass.ts'
import type { GlassLook } from '../splat-core/glass.ts'
import { WashPass } from './washPass.ts'
import { HalftonePass } from './halftonePass.ts'
import { FilterPass } from './filterPass.ts'
import { THERMAL_EMIT, type FilterLook } from '../splat-core/filters.ts'
import type { HalftoneLook } from '../splat-core/halftone.ts'
import { KnitPass } from './knitPass.ts'
import { AnaglyphPass } from './anaglyphPass.ts'
import type { AnaglyphLook } from '../splat-core/anaglyph.ts'
import { stitchSize, type KnitLook } from '../splat-core/knit.ts'
import type { WashLook } from '../splat-core/wash.ts'
import { GlyphPass } from './glyphPass.ts'
import { glyphScale, glyphText, type GlyphLook } from '../splat-core/glyphs.ts'
import { SplatLens } from './lens.ts'
import { SplatPeel } from './peel.ts'
import { SplatMirror } from './mirror.ts'
import type { MirrorImage, MirrorPlane } from './reflect.ts'
import type { OpticsLook } from '../splat-core/optics.ts'
import { BlockView } from './blockView.ts'
import type { BlockLook } from './blocks.ts'
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
  /** How much of its own light each blob gives, a byte a blob (255 all of it): a flame, a lit window. It only matters under live lights. */
  glow?: Uint8Array
  /** Blobs of a face laid over another part (voxel.ts `laid`: a pane on its frame), a byte a blob: drawn as blocks, a cell takes their color before the color of what they lie on. */
  laid?: Uint8Array
  /** Stays blobs while the stage draws blocks (`setBlocks`): grass and the like, drawn among the cubes. It makes no cubes. */
  soft?: boolean
  /** A surface that moves by itself and is sent up again with `reshape` (a pond's): while the stage draws blocks it is columns that follow it, or stays blobs, as the look's `flow` says. */
  flows?: boolean
  /** Weather laid over a scene (its clouds, rain, snow): while the stage draws blocks it is cubes too, or stays blobs among them, as the look's `weather` says. */
  weather?: boolean
  /** Lies on the scene's surfaces (snow lying): while the stage draws blocks it is raised half a cube, onto the cubes' tops, which stand up to a cube over the surface the blobs lie on. */
  lies?: boolean
  /** The side of its cubes while the stage draws blocks (`setBlocks`), where it was cut on a grid of its own; left out, the look's `cell`. */
  blockCell?: number
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
  /** Builds each world to draw blobs in their true shape on screen (`EngineOptions.exactShapes`; `setExactShapes` turns it off and on). */
  exactShapes?: boolean
  /** Builds each world so see-through blobs can be put in order where they cross (`setPeel`; `EngineOptions.peel`). */
  peel?: boolean
  /**
   * Asks the GPU to time its own work, so `gpuTimes` can say how long a frame takes on the GPU alone. Where the
   * browser offers no timer (WebGL without `EXT_disjoint_timer_query_webgl2`, WebGPU without `timestamp-query`) it
   * does nothing. Off by default: each pass then writes two timestamps.
   */
  timer?: boolean
}

/** How long the GPU spent on one frame, in milliseconds (`Stage.gpuTimes`). */
export interface GpuTimes {
  /** Compute passes: posing, projecting, sorting, lighting. WebGL has none, so 0 there. */
  compute: number
  /** Render passes: drawing the blobs and every pass after them (pixel art, outlines, the lens). */
  render: number
  /** The CPU's share: posing and handing the frame to the GPU (on WebGL, sorting too). The two overlap, so a frame takes about the larger of this and the GPU's. */
  cpu: number
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
      drawsTo(display, () => this.invalidate())
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
          markDrawn(this.display)
          if (this.actor) this.firstFrame()
          if (this.waiting.length) this.tellShown()
        }
        this.raf = requestAnimationFrame(tick)
      }
      this.raf = requestAnimationFrame(tick)
    }
  }

  /**
   * How many device pixels to a CSS pixel the stage draws at, at most (2 where never set; the screen's own where that
   * is less). Under 2 on a sharp screen every pass has fewer pixels to fill, for a softer picture: a page may ask for
   * it on a phone while it draws a costly look.
   */
  setSharpness(most: number) {
    const ratio = Math.min(Math.max(0.5, most), window.devicePixelRatio || 1)
    if (ratio === this.renderer.getPixelRatio()) return
    this.renderer.setPixelRatio(ratio)
    // sized again at the next frame
    this.lastW = 0
    this.invalidate()
  }

  /** Starts a stage on a canvas: makes the renderer (WebGPU, or WebGL 2 where there is none) and begins drawing. */
  static async start(display: HTMLCanvasElement, opts: StageOptions = {}) {
    const canvas = opts.offscreen ? document.createElement('canvas') : display
    const renderer = await startRenderer({ canvas, antialias: false, alpha: true, forceWebGL: !!opts.webgl, trackTimestamp: !!opts.timer }, (r) => {
      r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
      r.setClearColor(0x000000, 0)
    })
    return new Stage(display, opts, renderer)
  }

  private waiting: (() => void)[] = []

  /**
   * Resolves once a frame drawn from now on is through the GPU: called after `setActor`, that is when the new
   * creature is really on screen, which on a phone can be seconds after the call returns (buffers to fill, shaders
   * to build). A page keeps its waiting mark up until then. At once on an `offscreen` stage, which draws only when asked.
   */
  shown(): Promise<void> {
    if (this.opts.offscreen || this.stopped) return Promise.resolve()
    this.pending = Math.max(this.pending, 1)
    return new Promise((done) => this.waiting.push(done))
  }

  private tellShown() {
    const all = this.waiting
    this.waiting = []
    const tell = () => { for (const done of all) done() }
    const b = this.renderer.backend as unknown as { device?: { queue: { onSubmittedWorkDone(): Promise<void> } } }
    if (b.device) b.device.queue.onSubmittedWorkDone().then(tell, tell)
    else tell()
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
    this.glyphs?.forget()
    this.knit?.forget()
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
    this.world = new SplatWorld([actor, ...this.extras], { mode: this.mode, lights: this.opts.lights, sort: this.sort, cleanCuts: this.opts.cleanCuts, exactShapes: this.opts.exactShapes, peel: this.opts.peel, shadowDensity: this.opts.shadowDensity })
    this.world.glowGain = this.emits
    this.world.lightEase = this.lightEase
    this.world.setFog(...this.fog)
    this.dress()
    this.world.cleanCuts = this.clean
    this.world.exactShapes = this.exact
    if (this.edits.length) this.world.setEdits(this.edits)
    this.scene.add(this.world)
    if (this.painter) this.paintOver()
    this.block()
  }

  private blocks?: BlockView
  private blockLook?: BlockLook
  /**
   * Draws the scene as blocks (blocks.ts): its blobs snapped onto a grid of `look.cell`, each filled cell a cube in
   * one flat color, lit face by face, with the shadows blocks cast on each other. Cubes ride the bones their blobs
   * did, so the scene still moves. The stage's lights (`setLights`) shine on the faces as lamps and its ambient light
   * dims the look's own. It suits blobs with no light baked into them, and scenes more than small creatures. Leave
   * the look out to stop. Kept for the next actor too; the cubes are made again for each. Not in pixel mode, and it
   * comes before every other look.
   */
  setBlocks(look?: BlockLook) {
    const was = this.blockLook
    this.blockLook = look
    // a look that differs only in its ambient tint (a night's light following the sky as weather comes and lightning
    // flashes) keeps the cubes: making them again took a second each time, so a thunderstorm hitched at every flash
    if (look && was && this.blocks && !this.blockDue && sameBut(look, was, 'ambient')) this.blocks.setLights(this.lit.lights, this.lit.ambient, look.ambient)
    else this.block()
    this.invalidate()
  }

  /** The soft actors (`Actor.soft`), a world of their own while the scene is drawn as blocks. */
  private soft?: SplatWorld

  /** How many cubes and faces are on show while the scene is drawn as blocks. */
  get blockCount() { return this.blocks ? { blocks: this.blocks.blocks, faces: this.blocks.faces } : undefined }

  /** Whether the cubes have to be made again before the next frame is drawn. */
  private blockDue = false

  /**
   * The cubes are due: they are made at the next draw (`makeBlocks`), not here. A new actor and the look that goes
   * with it reach the stage in the same task (a page sets the actor, then its look with the new scene's cell), and
   * making them twice cost a scene switch a whole build of every cube.
   */
  private block() {
    this.blockDue = true
    // snow lying is raised onto the cubes' tops, and the pose comes before the draw, so this part is not put off
    for (const a of this.actor ? [this.actor, ...this.extras] : []) if (a.lies) {
      a.skeleton.place[1] = this.blockLook ? this.blockLook.cell * 0.5 : 0
      a.skeleton.update()
    }
  }

  /** Makes the cubes for the actors on show (again), or puts them away. */
  private makeBlocks() {
    this.blockDue = false
    if (this.blocks) { this.scene.remove(this.blocks); this.blocks.dispose(); this.blocks = undefined }
    if (this.soft) { this.scene.remove(this.soft); this.soft.dispose(); this.soft = undefined }
    const all = this.actor ? [this.actor, ...this.extras] : []
    for (const a of all) if (a.lies) {
      a.skeleton.place[1] = this.blockLook ? this.blockLook.cell * 0.5 : 0
      a.skeleton.update()
    }
    if (this.blockLook && this.actor) {
      // soft actors are a small world of their own, drawn among the cubes, so the scene's own world is not drawn at all
      const soft = all.filter((a) => a.soft || (a.flows && this.blockLook!.flow !== 'blocks') || (a.weather && this.blockLook!.weather !== 'blocks'))
      if (soft.length) {
        this.soft = new SplatWorld(soft, { mode: this.mode, lights: this.opts.lights, sort: this.sort, peel: this.opts.peel })
        this.soft.setFog(...this.fog)
        this.soft.setMarks(this.marks)
        if (this.opts.lights) this.soft.setLights(this.lit.lights, this.lit.ambient)
        this.scene.add(this.soft)
      }
      this.blocks = new BlockView(all.filter((a) => !soft.includes(a)), this.blockLook)
      this.blocks.setLights(this.lit.lights, this.lit.ambient, this.blockLook.ambient)
      this.blocks.setFog(...this.fog)
      this.scene.add(this.blocks)
    }
    this.setShow(this.show)
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
    this.rebuild()
  }

  /**
   * Whether worlds are built with live lights (the `lights` option, changed after the start), from the next
   * `setActor` on: a page turns them on for the one creature that wants them and leaves the rest as light to draw as
   * they were.
   */
  useLights(on: boolean) { this.opts.lights = on }

  /** Builds the world on show again (for a choice a world is made with), keeping the moment. */
  private rebuild() {
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

  /**
   * Takes one actor's colors and opacities again after they were changed in place (the one shown or one of its
   * `extras`), when nothing moved: a floor that scorches.
   */
  recolor(actor: Actor) {
    this.world?.recolor(actor)
    this.pending = Math.max(this.pending, 2)
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
    // drawn as blocks it is columns that follow it, or blobs of the soft world
    if (this.soft?.actors.includes(actor)) this.soft.reshape(actor)
    this.blocks?.reshape(actor)
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
  get time() { const step = this.heldStep; return step > 0 ? Math.floor(this.t / step + 1e-6) * step : this.t }
  /** The held frames in force: the stage's own `step`, or claymation's stop motion. */
  private get heldStep() { const fps = this.filterLook?.kind === 'clay' ? this.filterLook.fps ?? 12 : 0; return this.step > 0 ? this.step : fps > 0 ? 1 / fps : 0 }

  /** Moves the clock to `seconds` and draws that moment: for a page that kept its own time while this stage was paused. */
  seek(seconds: number) {
    this.t = seconds
    this.pose()
    this.invalidate()
  }

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
    this.soft?.setFog(color, near, far)
    this.blocks?.setFog(color, near, far)
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

  private exact = true
  /** On a stage made with `exactShapes`: whether blobs are drawn in their true shape (the default) or flattened from their middles. */
  setExactShapes(on: boolean) {
    this.exact = on
    if (this.world) this.world.exactShapes = on
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

  private cel?: CelPass
  private celLook?: CelLook
  /** Cel shading drawn into the pixel pass's small picture, at that picture's size, with no line of its own. */
  private readonly celInPixels = (renderer: THREE.WebGPURenderer, scene: THREE.Object3D, camera: THREE.Camera) => {
    const into = renderer.getRenderTarget()
    if (!this.cel || !this.celLook || !into) { renderer.render(scene, camera); return }
    this.cel.setSize(into.width, into.height)
    const amb = this.lit.ambient
    this.cel.setLook({ ...this.celLook, line: 0, lamps: this.celLook.lamps ?? lampTint(this.lit.lights), ambient: [0, 1, 2].map((k) => (this.celLook!.ambient?.[k] ?? 1) * (typeof amb === 'number' ? amb : amb[k])) as [number, number, number] }, 1)
    this.cel.render(renderer, scene, camera)
  }
  /**
   * Cel shading (splat-core/cel.ts), on a stage made with `lights`: every blob flat in its own color, the light cut
   * into two or three tones with clean edges, shadows cast by what stands in the light's way, and an even outline.
   * The tones are cut from the look's own light, and the stage's lights (`setLights`) stay as the scene's lamps: where
   * they reach is one more tone in their color, and the ambient light dims both tones. Its fill takes the place of the
   * stage's marks while it is on; leave the look out to have them back. Kept for the next actor too. It shades the blobs' own colors, so it suits blobs
   * that have no light baked into them. In pixel mode it shades the small picture the pixel art is made from, so the
   * light falls in bands that follow each form a pixel at a time; the outline is the pixel art's own then.
   */
  setCel(look?: CelLook) {
    this.celLook = look
    if (!look) { this.cel?.dispose(); this.cel = undefined }
    else this.cel ??= new CelPass()
    this.dress()
    this.invalidate()
  }

  private neon?: NeonPass
  private neonLook?: NeonLook
  /**
   * Neon (splat-core/neon.ts): tubes of glowing light along the outlines, in each thing's own color at full strength
   * or the look's colors, with pulses of light running along them by the stage's clock; the bodies are kept dark and
   * catch the light as it passes. On a stage made with `lights`, whatever gives its own light (`Actor.glow`: a lamp, a
   * lit window, a flame) is filled with it and lights the bodies round it too. Every blob is drawn flat in its own color while it is on, with the stage's lights
   * put by, so it suits blobs that have no light baked into them. Leave the look out to stop. Kept for the next
   * actor too. Not in pixel mode; ASCII and cel shading come first if set, and outlines and the lens wait.
   */
  setNeon(look?: NeonLook) {
    this.neonLook = look
    if (!look) { this.neon?.dispose(); this.neon = undefined }
    else this.neon ??= new NeonPass()
    this.dress()
    this.invalidate()
  }

  private wash?: WashPass
  private washLook?: WashLook
  /**
   * Watercolor (splat-core/wash.ts): the picture laid on paper as thin see-through washes whose edges run and dry
   * darker, with the paper's grain showing through, the lightest places left bare, a wash of the look's sky behind
   * and a faint pencil line underneath. The paper covers the canvas. Every blob is drawn flat in its own color while
   * it is on, under the stage's own lights. Leave the look out to stop. Kept for the next actor too. Not in pixel
   * mode; ASCII, cel shading, neon and stained glass come first if set, and outlines and the lens wait.
   */
  setWash(look?: WashLook) {
    this.washLook = look
    if (!look) { this.wash?.dispose(); this.wash = undefined }
    else this.wash ??= new WashPass()
    this.dress()
    this.invalidate()
  }

  private halftone?: HalftonePass
  private halftoneLook?: HalftoneLook
  /**
   * Halftone screen print (splat-core/halftone.ts): the picture printed in the look's few see-through inks, each as
   * dots on its own turned screen fixed on the paper, the dots growing and running together where the picture is
   * dark in that ink, the plates a little off true and the ink taking unevenly; the subject's sky is printed behind
   * it, or the paper left bare. The paper covers the canvas. Every blob is drawn flat in its own color while it is
   * on, under the stage's own lights. Leave the look out to stop. Kept for the next actor too. Not in pixel mode;
   * ASCII, cel shading, neon, stained glass and watercolor come first if set, and outlines and the lens wait.
   */
  setHalftone(look?: HalftoneLook) {
    this.halftoneLook = look
    if (!look) { this.halftone?.dispose(); this.halftone = undefined }
    else this.halftone ??= new HalftonePass()
    this.dress()
    this.invalidate()
  }

  private filter?: FilterPass
  private filterLook?: FilterLook
  /**
   * One of the looks laid over the whole picture (splat-core/filters.ts): a thermal camera, an old CRT or tape, a
   * blueprint, a mosaic, paper cutouts or claymation. The look covers the canvas. The blueprint and paper cutouts draw
   * every blob flat in its own color with no lights; the thermal camera draws what gives its own light over white so
   * it runs hot; claymation moves in held frames (`ClayLook.fps`) unless the stage holds its own. Leave the look out to
   * stop. Kept for the next actor too. Not in pixel mode; the other looks come first if set, and outlines and the
   * lens wait.
   */
  setFilter(look?: FilterLook) {
    this.filterLook = look
    if (!look) { this.filter?.dispose(); this.filter = undefined }
    else this.filter ??= new FilterPass()
    this.dress()
    this.invalidate()
  }

  /** Whether the filter on draws every blob flat with no lights (the blueprint and paper cutouts). */
  private get filterFlat() { return this.filterLook?.kind === 'blueprint' || this.filterLook?.kind === 'cutout' }

  private knit?: KnitPass
  private knitLook?: KnitLook
  /**
   * Knitting (splat-core/knit.ts): the picture as a sweater, a grid of stitches fixed on the screen, each a V of
   * yarn in the look's yarn nearest what it shows, with the sweater's own pattern of bands and snow dots knitted
   * round the subject. The knitting covers the canvas. Every blob is drawn flat in its own color while it is on, with
   * the stage's lights put by, so it suits blobs in flat colors with no light baked into them. Leave the look out to
   * stop. Kept for the next actor too. Not in pixel mode; ASCII, cel shading, neon, stained glass and watercolor
   * come first if set, and outlines and the lens wait.
   */
  setKnit(look?: KnitLook) {
    this.knitLook = look
    if (!look) { this.knit?.dispose(); this.knit = undefined }
    else this.knit ??= new KnitPass()
    this.dress()
    this.invalidate()
  }

  private anaglyph?: AnaglyphPass
  private anaglyphLook?: AnaglyphLook
  /**
   * 3D glasses (splat-core/anaglyph.ts): the frame drawn from a left and a right eye either side of the camera and
   * laid over each other in red and cyan, so that through red and cyan glasses the scene stands in depth. What the
   * view looks at sits at the screen (unless the look's `pop` pushes the screen back), the backdrop behind it. The
   * blobs are drawn as they are (marks, lights), sorted once for each eye. Leave the look out to stop. Kept for the
   * next actor too. Not in pixel mode; the other looks come first if set, and outlines and the lens wait.
   */
  setAnaglyph(look?: AnaglyphLook) {
    this.anaglyphLook = look
    if (!look) { this.anaglyph?.dispose(); this.anaglyph = undefined }
    else this.anaglyph ??= new AnaglyphPass()
    this.invalidate()
  }

  private glass?: GlassPass
  private glassLook?: GlassLook
  /**
   * Stained glass (splat-core/glass.ts): every surface cut into panes of flat colored glass that stay on it as the
   * view turns, lead between the panes and round every part, the light behind, and the empty picture round the
   * subject glazed too, so the canvas is covered. Every blob is drawn flat in its own color while it is on, with
   * the stage's lights put by, and lead runs wherever that color changes, so it suits blobs in flat colors with no
   * light baked into them. Leave the look out to stop. Kept for the next actor too. Not in pixel mode; ASCII, cel
   * shading and neon come first if set, and outlines and the lens wait.
   */
  setGlass(look?: GlassLook) {
    this.glassLook = look
    if (!look) { this.glass?.dispose(); this.glass = undefined }
    else this.glass ??= new GlassPass()
    this.dress()
    this.invalidate()
  }

  /** Hands the world what it is drawn with: cel shading's flat fill and one light, neon's flat fill and none, stained glass's flat fill, or the stage's own marks and lights. */
  private dress() {
    const world = this.world
    if (!world) return
    const cel = this.opts.lights ? this.celLook : undefined
    world.cel = !!cel
    world.setMarks(cel || this.neonLook || this.glassLook || this.washLook || this.halftoneLook || this.knitLook || this.filterFlat ? { kind: 'flat' } : this.marks)
    this.soft?.setMarks(this.marks)
    if (!this.opts.lights) return
    this.light()
  }

  /**
   * Hands the world its lights: the stage's own, or for cel shading the one the tones are cut from and then the
   * stage's own, which the pass adds as one more tone where they reach (their shadows are the baked ones: the grid
   * of shadows is not asked).
   */
  private light() {
    const world = this.world
    if (!world || !this.opts.lights) return
    const cel = this.celLook
    world.glowGain = this.emits
    if (!cel && (this.neonLook || this.glassLook || (this.knitLook && !this.washLook && !this.halftoneLook) || this.filterFlat)) world.setLights([], 1)
    else if (cel) world.setLights([{ direction: [...(cel.from ?? CEL_FROM)] as [number, number, number], color: [1, 1, 1] }, ...this.lit.lights.slice(0, MAX_LIGHTS - 1).map((l) => ({ ...l, shadow: false }))], 1)
    else world.setLights(this.lit.lights, this.lit.ambient)
  }

  private glyphs?: GlyphPass
  private glyphLook?: GlyphLook
  /**
   * Draws the picture as characters (glyphPass.ts): a grid of cells fixed on the screen, each with the character whose
   * ink matches how much of the cell there is to show, or a stroke along an edge that runs through it. Leave the look
   * out to stop. Not in pixel mode; outlines and the lens wait while it is on.
   */
  setGlyphs(look?: GlyphLook) {
    this.glyphLook = look
    if (!look) { this.glyphs?.dispose(); this.glyphs = undefined }
    else this.glyphs ??= new GlyphPass()
    this.invalidate()
  }

  /** The picture as text, a line a row of cells, while it is drawn as characters (`setGlyphs`) and once a frame has been. */
  async glyphText(): Promise<string | undefined> {
    const pass = this.glyphs
    if (!pass || this.baking || pass.grid.width < 2) return
    const { width, height } = pass.grid
    const px = await this.renderer.readRenderTargetPixelsAsync(pass.grid, 0, 0, width, height) as Uint8Array
    // WebGPU reads rows top-down, WebGL bottom-up
    const glyphs = new Uint8Array(width * height)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) glyphs[y * width + x] = px[((this.backend === 'webgl' ? height - 1 - y : y) * width + x) * 4 + 3]
    return glyphText(glyphs, width, this.glyphLook?.set)
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

  private peel?: SplatPeel
  /**
   * On a stage made with `peel`: takes the nearest `layers` blobs (1 to `MAX_PEEL`) off the front of each pixel one at
   * a time (peel.ts), so see-through blobs that cross are each in front on their own side; 0 stops. Everything that is
   * not blobs is drawn under them all. Costs a draw of the blobs a layer and one more. Not in pixel mode, and any
   * other look comes first.
   */
  setPeel(layers: number) {
    if (!layers || !this.opts.peel) { this.peel?.dispose(); this.peel = undefined }
    else (this.peel ??= new SplatPeel(layers)).setLayers(layers)
    this.invalidate()
  }

  private marks?: MarkLook
  /**
   * Draws every blob as a brush mark or an ink stroke, or as soft dots again when left out; kept for the next actor
   * too. The marks belong to the blobs, so they stay put as the view turns.
   */
  setMarks(look?: MarkLook) {
    this.marks = look
    this.dress()
    this.invalidate()
  }

  /**
   * Live lights on the world (needs the `lights` option); kept for the next actor too. A light is at a place or from a
   * direction (a sun); `ambient` is one brightness or a linear color.
   */
  setLights(lights: Light[], ambient: number | readonly [number, number, number] = 1) {
    this.lit = { lights, ambient }
    this.blocks?.setLights(lights, ambient, this.blockLook?.ambient)
    if (this.soft && this.opts.lights) this.soft.setLights(lights, ambient)
    this.light()
    this.invalidate()
  }

  private glowGain = 1
  /** What the world's `glowGain` is: the stage's own, or neon's, which tells lamps from pale things by it. */
  private get emits() { return this.neonLook && !(this.opts.lights && this.celLook) ? NEON_EMIT : this.filterLook?.kind === 'thermal' && !(this.opts.lights && this.celLook) ? THERMAL_EMIT : this.glowGain }
  /**
   * How many times its own color a blob that gives its own light (`Actor.glow`) is drawn under live lights (the
   * world's `glowGain`), kept for the next actor too. Over 1 only with a lens (`setLens`), which lets what is brighter
   * than white glow; drawn straight to the screen it clips.
   */
  setGlowGain(gain: number) {
    this.glowGain = Math.max(0, gain)
    if (this.world) this.world.glowGain = this.emits
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
    if (this.world) this.world.visible = s !== 'bones' && !(this.blocks && !this.pixel)
    if (this.soft) this.soft.visible = s !== 'bones' && !this.pixel
    if (this.blocks) this.blocks.visible = s !== 'bones' && !this.pixel
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
    if (this.blocks) this.setShow(this.show)
    this.invalidate()
  }

  private glitchLook?: GlitchLook
  /** The glitch laid on the last frame drawn (none while no burst is on). */
  glitchNow?: GlitchState

  /**
   * Tech glitch over pixel mode's art (splat-core/glitch.ts): now and then a burst of slid rows, split color and
   * corrupted blocks, in steps of the stage's own clock, so a loop drawn frame by frame joins up. The art read back
   * (`pixelFrames`) stays clean: `glitchArt(art, stage.glitchNow)` lays the same glitch on it. Leave the look out to
   * stop. Only in pixel mode.
   */
  setGlitch(look?: GlitchLook) {
    this.glitchLook = look
    this.invalidate()
  }

  /** Pixel mode's art size in pixels, once a frame has been drawn. */
  get artSize() { return this.pixel && this.pixel.width > 1 ? { width: this.pixel.width, height: this.pixel.height } : undefined }

  /** Device pixels per art pixel: whole, so every art pixel is the same size on screen. */
  /** Where pixel art is held on the art's grid, and the view it was set for (`snapAnchor`). */
  private snapAt?: SnapAnchor

  /** Where pixel art is held on the art's grid (`PixelPass.anchor`): `snapAnchor` in orbit.ts says where and why. */
  private anchorSnap(pass: PixelPass) {
    this.snapAt = snapAnchor(this.snapAt, this.orbit)
    pass.anchor.fromArray(this.snapAt.at)
  }

  private get pixelScale() { return Math.max(1, Math.round(this.pixelSize * this.renderer.getPixelRatio())) }

  private draw() {
    // the cubes for the actors and look as they now stand, where either changed since the last frame
    if (this.blockDue) this.makeBlocks()
    if (!this.pixel && this.blocks) {
      const { x, y } = this.target ? { x: this.target.width, y: this.target.height } : this.renderer.getDrawingBufferSize(this.buffer)
      this.blocks.render(this.renderer, this.scene, this.camera, x, y)
      return
    }
    if (!this.pixel && this.glyphs && this.glyphLook) {
      const { x, y } = this.target ? { x: this.target.width, y: this.target.height } : this.renderer.getDrawingBufferSize(this.buffer)
      this.glyphs.setSize(x, y, glyphScale(this.glyphLook.size ?? 12, this.renderer.getPixelRatio()))
      this.glyphs.setLook(this.glyphLook, this.glyphLook.ink?.map(srgbToLinear))
      this.glyphs.render(this.renderer, this.scene, this.camera)
      return
    }
    if (!this.pixel && this.cel && this.celLook && this.opts.lights) {
      const { x, y } = this.target ? { x: this.target.width, y: this.target.height } : this.renderer.getDrawingBufferSize(this.buffer)
      this.cel.setSize(x, y)
      const amb = this.lit.ambient
      this.cel.setLook({ ...this.celLook, lamps: this.celLook.lamps ?? lampTint(this.lit.lights), ambient: [0, 1, 2].map((k) => (this.celLook!.ambient?.[k] ?? 1) * (typeof amb === 'number' ? amb : amb[k])) as [number, number, number] }, this.renderer.getPixelRatio())
      this.cel.render(this.renderer, this.scene, this.camera)
      return
    }
    if (!this.pixel && this.neon && this.neonLook && this.world) {
      const { x, y } = this.target ? { x: this.target.width, y: this.target.height } : this.renderer.getDrawingBufferSize(this.buffer)
      this.neon.setSize(x, y)
      const { lo, hi } = this.world.posedBox()
      this.neon.setLook(this.neonLook, this.renderer.getPixelRatio(), Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]), this.time)
      this.neon.render(this.renderer, this.scene, this.camera)
      return
    }
    if (!this.pixel && this.glass && this.glassLook && this.world) {
      const { x, y } = this.target ? { x: this.target.width, y: this.target.height } : this.renderer.getDrawingBufferSize(this.buffer)
      this.glass.setSize(x, y)
      const { lo, hi } = this.world.posedBox()
      this.glass.setLook(this.glassLook, this.renderer.getPixelRatio(), Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]))
      this.glass.render(this.renderer, this.scene, this.camera)
      return
    }
    if (!this.pixel && this.wash && this.washLook) {
      const { x, y } = this.target ? { x: this.target.width, y: this.target.height } : this.renderer.getDrawingBufferSize(this.buffer)
      this.wash.setSize(x, y)
      this.wash.setLook(this.washLook, this.renderer.getPixelRatio())
      this.wash.render(this.renderer, this.scene, this.camera)
      return
    }
    if (!this.pixel && this.halftone && this.halftoneLook) {
      const { x, y } = this.target ? { x: this.target.width, y: this.target.height } : this.renderer.getDrawingBufferSize(this.buffer)
      this.halftone.setLook(this.halftoneLook, this.renderer.getPixelRatio())
      this.halftone.setSize(x, y)
      this.halftone.render(this.renderer, this.scene, this.camera)
      return
    }
    if (!this.pixel && this.knit && this.knitLook) {
      const { x, y } = this.target ? { x: this.target.width, y: this.target.height } : this.renderer.getDrawingBufferSize(this.buffer)
      this.knit.setLook(this.knitLook)
      this.knit.setSize(x, y, stitchSize(this.knitLook.size ?? 9, this.renderer.getPixelRatio()))
      this.knit.render(this.renderer, this.scene, this.camera)
      return
    }
    if (!this.pixel && this.anaglyph && this.anaglyphLook) {
      const { x, y } = this.target ? { x: this.target.width, y: this.target.height } : this.renderer.getDrawingBufferSize(this.buffer)
      this.anaglyph.setSize(x, y)
      this.anaglyph.setLook(this.anaglyphLook)
      this.anaglyph.render(this.renderer, this.scene, this.camera, this.orbit.distance)
      return
    }
    if (!this.pixel && this.filter && this.filterLook && this.world) {
      const { x, y } = this.target ? { x: this.target.width, y: this.target.height } : this.renderer.getDrawingBufferSize(this.buffer)
      // the subject alone (not the sky's sun, moon and stars): what thumbprints are sized by and dimension lines go round
      const box = this.world.posedBox(true)
      this.filter.setSize(x, y)
      const size = Math.hypot(box.hi[0] - box.lo[0], box.hi[1] - box.lo[1], box.hi[2] - box.lo[2])
      this.filter.setLook(this.filterLook, this.renderer.getPixelRatio(), Number.isFinite(size) && size > 0 ? size : 1, this.time)
      this.filter.render(this.renderer, this.scene, this.camera, box)
      return
    }
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
    if (!this.pixel && this.peel) {
      const { x, y } = this.target ? { x: this.target.width, y: this.target.height } : this.renderer.getDrawingBufferSize(this.buffer)
      this.peel.setSize(x, y)
      this.peel.render(this.renderer, this.scene, this.camera)
      return
    }
    if (!this.pixel) { this.renderer.render(this.scene, this.camera); return }
    const scale = this.pixelScale
    this.glitchNow = this.glitchLook ? glitchAt(this.time, this.glitchLook) : undefined
    this.pixel.setGlitch(this.glitchNow)
    this.pixel.setTime(this.time)
    this.pixel.drawScene = this.cel && this.celLook && this.opts.lights ? this.celInPixels : undefined
    this.anchorSnap(this.pixel)
    if (this.target) {
      this.pixel.setSize(Math.ceil(this.target.width / scale), Math.ceil(this.target.height / scale))
      this.pixel.render(this.renderer, this.scene, this.camera)
      return
    }
    const { x, y } = this.renderer.getDrawingBufferSize(this.buffer)
    this.pixel.setSize(Math.ceil(x / scale), Math.ceil(y / scale))
    this.pixel.render(this.renderer, this.scene, this.camera, { width: x, height: y, scale })
  }

  private async read(target: THREE.RenderTarget, encoded = false, index = 0): Promise<Frame> {
    const { width, height } = target
    const px = await this.renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height, index) as Uint8Array
    // a target holds linear, premultiplied color (pixel mode's art, `encoded`, already holds sRGB); a frame is sRGB, straight, top row first. WebGPU reads rows top-down, WebGL bottom-up.
    return { width, height, data: readbackToSrgb(px, width, height, { flip: this.backend === 'webgl', premultiplied: false, encoded }) }
  }

  /** Pixel mode's last frame as it was drawn small, and as finished art (exactly in the look's colors): for tests and for saving. */
  async pixelFrames(): Promise<{ small: Frame; art: Frame; before?: Frame; parts?: Frame; ranks?: Frame; time: number; fine?: { small: Frame; parts: Frame; solid?: Frame } } | undefined> {
    // a sheet being drawn has the renderer to itself
    if (!this.pixel || this.baking) return
    // pixel mode can be switched off, or the view resized, while the reads are out: hold the pass and start every read now
    const pass = this.pixel
    if (!this.target) pass.render(this.renderer, this.scene, this.camera)
    const colors = lookColors(pass.look)
    const fine = !!pass.look.fine
    const surface = !!pass.look.surface && pass.look.dither > 0
    const hard = fine && !!pass.look.solid
    const [small, art, before, parts, fineSmall, fineParts, ranks, fineSolid] = await Promise.all([
      this.read(pass.small), this.read(pass.art, true), pass.before ? this.read(pass.before, true) : undefined, pass.look.parts || fine ? this.read(pass.ids, true) : undefined,
      fine ? this.read(pass.fineSmall) : undefined, fine ? this.read(pass.fineIds, true) : undefined, surface ? this.read(pass.ranks, true) : undefined,
      hard ? this.read(pass.fineIds, false, 1) : undefined,
    ])
    // a look with four samples a pixel also gives what it was settled from: the scene and its map of parts at twice the size, and with `solid` the hard discs
    return { small, art: snapColors(art, colors), before: before && snapColors(before, colors), parts, ranks, time: pass.drawnAt, fine: fineSmall && fineParts && { small: fineSmall, parts: fineParts, solid: fineSolid } }
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
    // soft actors drawn among the cubes are posed by the page too (rain and snow, drifting clouds)
    this.soft?.markPosed()
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
   * @internal Poses and draws the frame as it stands `frames` times over and waits until the GPU has finished them all:
   * how long one took, in milliseconds. For a page that times this stage beside other renderers (One Scene, Four
   * Ways). Several frames to one wait, because the browser tells a page that WebGPU work is done some milliseconds
   * late, and by an amount that wanders: timed one frame at a time, that wait was most of the number.
   */
  async timed(frames = 8): Promise<number> {
    const t0 = performance.now()
    for (let k = 0; k < frames; k++) {
      this.pose()
      this.resize()
      this.draw()
    }
    const b = this.renderer.backend as unknown as { device?: { queue: { onSubmittedWorkDone(): Promise<void> } }; gl?: WebGL2RenderingContext }
    if (b.device) await b.device.queue.onSubmittedWorkDone()
    // reading one pixel back can't finish before the frames do
    else b.gl?.readPixels(0, 0, 1, 1, b.gl.RGBA, b.gl.UNSIGNED_BYTE, new Uint8Array(4))
    return (performance.now() - t0) / frames
  }

  /** Whether `gpuTimes` can answer: the stage was started with `timer` and the browser lets the GPU time its work. */
  get timesGpu(): boolean {
    const b = this.renderer.backend as unknown as { trackTimestamp?: boolean; disjoint?: unknown; isWebGPUBackend?: boolean }
    return !!b.trackTimestamp && (!!b.isWebGPUBackend || !!b.disjoint)
  }

  /**
   * Poses and draws the frame as it stands `frames` times over and asks the GPU how long it spent: per frame, in
   * milliseconds. Unlike `timed`, the GPU's own clock, so the browser's late and wandering report of work done does
   * not come into it, and the time is split between compute and drawing. Null where the stage can't time the GPU
   * (`timesGpu`): start it with `timer` and use `timed` as the fallback.
   */
  async gpuTimes(frames = 8): Promise<GpuTimes | null> {
    if (!this.timesGpu) return null
    // what the live loop drew before now is not this measure
    await Promise.all([this.renderer.resolveTimestampsAsync('compute'), this.renderer.resolveTimestampsAsync('render')])
    const t0 = performance.now()
    for (let k = 0; k < frames; k++) {
      this.pose()
      this.resize()
      this.draw()
    }
    const cpu = (performance.now() - t0) / frames
    const [compute, render] = await Promise.all([this.renderer.resolveTimestampsAsync('compute'), this.renderer.resolveTimestampsAsync('render')])
    return { compute: (compute ?? 0) / frames, render: (render ?? 0) / frames, cpu }
  }

  /** Offscreen only: draws the frame `t` seconds into the clip and copies it to the page. */
  async frame(t: number) {
    this.t = t
    this.pose()
    this.resize()
    // the mirror's picture of this very moment, so what a test or a recording sees does not depend on timing
    await this.reflect(true)
    this.draw()
    // on the page itself, a loop being exported copies the picture now, while it can still be read
    if (!this.target) markDrawn(this.display)
    if (this.actor) this.firstFrame()
    if (!this.target) return
    // read back by checks: a CPU canvas, because a GPU one gives a few faint pixels a different rounding the first time it is read
    const ctx = this.display.getContext('2d', { willReadFrequently: true })!
    if (this.pixel) {
      // the art, scaled up in whole pixels
      const clean = await this.read(this.pixel.art, true)
      const art = this.glitchNow ? glitchArt(clean, this.glitchNow) : clean
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
    if (this.blocks) this.blocks.visible = false
    // a sheet is the creature alone in its own colors: what stands with it is hidden, and live lights are put out
    const solid = this.extras.map((e) => e.blobs.opacity.slice(0, e.blobs.count))
    for (const e of this.extras) { e.blobs.opacity.fill(0, 0, e.blobs.count); world.recolor(e) }
    if (this.opts.lights) { world.cel = false; world.setMarks(this.marks); world.setLights([], 1); world.glowGain = 1 }
    try {
      const { bakeSheet } = await import('./bakeSheet.ts')
      // a sheet's frames are reshaped as they're drawn (and framed), each sent up whole, so the GPU never lags the CPU copy
      const morph = this.morphRest ? (c: Clip | undefined, t: number) => this.morph(c, t) : undefined
      return await bakeSheet({ renderer: this.renderer, scene: this.scene, actor, posed: () => world.markPosed(), morph }, moves, opts, progress)
    } finally {
      this.baking = false
      if (this.floor) this.floor.visible = true
      this.extras.forEach((e, k) => { e.blobs.opacity.set(solid[k]); world.recolor(e) })
      if (this.opts.lights) { this.dress(); world.glowGain = this.emits }
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
    this.blocks?.dispose()
    this.soft?.dispose()
    this.rig?.dispose()
    this.lines?.dispose()
    this.neon?.dispose()
    this.glass?.dispose()
    this.wash?.dispose()
    this.knit?.dispose()
    this.anaglyph?.dispose()
    this.halftone?.dispose()
    this.filter?.dispose()
    this.glyphs?.dispose()
    this.lens?.dispose()
    this.peel?.dispose()
    this.cel?.dispose()
    this.mirror?.dispose()
    this.target?.dispose()
    this.pixel?.dispose()
    this.renderer.dispose()
  }
}

/** The name the site's pages use. */
export { Stage as CreatureStage }

/** Whether two plain objects hold the same values but for `key` (arrays compared by their items). */
function sameBut<T extends object>(a: T, b: T, key: keyof T): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof T)[])
  for (const k of keys) {
    if (k === key) continue
    const x = a[k] as unknown, y = b[k] as unknown
    if (Array.isArray(x) && Array.isArray(y)) { if (x.length !== y.length || x.some((v, i) => v !== y[i])) return false }
    else if (x !== y) return false
  }
  return true
}
