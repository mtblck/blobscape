import {
  BufferAttribute, DataUtils, DynamicDrawUsage, InstancedBufferGeometry, Matrix4, Mesh, NodeMaterial, Sphere, StorageBufferAttribute, Vector2, Vector3, Vector4,
  type Camera, type Renderer,
} from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import { Blobs } from '../splat-core/blobs.ts'

// TSL's typings model each node type closely, and the shader code below mixes
// them freely (as three.js's own JavaScript does), so the node functions are
// used untyped here. Everything outside the shader builders stays typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const {
  Discard, EPSILON, Fn, If, atan, cameraProjectionMatrix, cameraViewport, cameraViewMatrix, cos, dot, exp, float, instanceIndex,
  abs, cameraPosition, cameraProjectionMatrixInverse, cameraWorldMatrix, floor, fract, length, max, min, mix, normalize, positionGeometry, pow, select, sin, smoothstep, sqrt, storage, uint, uniform, uniformArray, uintBitsToFloat, unpackUnorm4x8, varyingProperty, vec2, vec3, vec4,
} = TSL
import { MAX_STRETCH, packWeights, skinBlob, skinCenters, type Skeleton, type Skin, type SkinMode } from './rig.ts'
import { GRAD_STRIDE, weightGradients } from './stretch.ts'
import { LIE_FROM, LIE_FULL } from '../splat-core/glyphs.ts'
import { DepthSort } from './sort.ts'
import { RadixSort } from './radix.ts'

/** Either depth sort: the counting sort over bins, or the full radix sort. */
type Sorter = DepthSort | RadixSort
import { DISSOLVE_ASIDE, DISSOLVE_SOFT, DISSOLVE_TURN, DISSOLVE_WAY, dissolved } from './dissolve.ts'
import { detailFor, lodRank, screenRadius, type DetailRule } from './lod.ts'
import { CLEAN_MARGIN, MAX_EDITS, blobReach, editAt, type ShapeEdit } from './edit.ts'
import { applyMorphs, shares, type Morph } from './morph.ts'
import { FLAT_FULL, FLAT_NONE, LAMP_MOST } from './light.ts'
import { LIFT, MAX_MARCH, OCC_SCALE, REACH, SHADOW_CELLS, SHADOW_DENSITY, SPREAD, SUN_MARCH, blobSigma, occupancy, steadyBox, type ShadowBox } from './shadow.ts'
import { linearToSrgb, srgbToLinear } from '../splat-core/color.ts'
import { surfaceRanks } from '../splat-core/pixel.ts'
import { viewColor } from '../splat-core/sh.ts'
import { DOT_R, DOT_STEP, FLAT_CUT, INK, MARK_CUT, MARK_KINDS, MARK_LIFT, MARK_LONG, MARK_MOST, MARK_SOLID, MARK_WIDE, PAPER, SHADE_FROM, SHADE_FULL, WASH_LEAST, WASH_MOST, type MarkLook } from '../splat-core/marks.ts'

/**
 * Blobscape's splat engine: one mesh that draws every blob of every object in a
 * scene, so objects that overlap (stems in a vase, a fox in long grass) sort
 * against each other blob by blob, instead of object by object.
 *
 * Every blob hangs on bones. A still object is one bone; a creature is a
 * skeleton. Each frame:
 *
 * 1. deform (compute): each blob's center and shape go from its rest pose to the
 *    world through its bones, as `skinBlob` in rig.ts does on the CPU;
 * 2. sort (compute): every blob in the scene by depth, one counting sort;
 * 3. draw: one instanced quad per blob, projected and shaded as in 3DGS.
 *
 * It draws through three.js's WebGPURenderer, so it shares a depth buffer and a
 * camera with ordinary three.js meshes. On the WebGL backend the deform and sort
 * run on the CPU and the result is uploaded; the drawing is the same.
 *
 * The projection and shading follow three.js's `GaussianSplat` (MIT), which in
 * turn follows the 3DGS paper; what's new here is the shared sort and skinning.
 */

export interface Actor {
  /** The blobs in the rest pose. */
  blobs: Blobs
  /** Which bones move each blob, and by how much. */
  skin: Skin
  /** The bones, and their pose. */
  skeleton: Skeleton
  /** Which part of the actor each blob belongs to (as `buildBody` and `voxelBody` give it): what `SplatWorld.parts` draws. Left out, the actor is one part. */
  partOf?: ArrayLike<number>
  /**
   * How much of each of the first four live lights a blob can see, four bytes a blob (255 sees it all): baked lamp
   * shadows (voxel.ts `lamps`). The light pass scales light k by byte k, so a flickering lamp's shadows flicker with it.
   * Left out, every light reaches every blob.
   */
  seen?: Uint8Array
  /**
   * How much of its own light each blob gives, a byte a blob (255 all of it): a lit window, a firefly, the moon. Under
   * live lights such a blob is never drawn darker than this share of its own color, so it stays bright when the scene
   * goes dark. Left out, nothing glows.
   */
  glow?: Uint8Array
  /** Blend shapes (morph.ts), set with `SplatWorld.setMorphWeights`: on WebGPU a pass before the deform reshapes the blobs; on WebGL the CPU does and uploads them. */
  morphs?: Morph[]
  /**
   * Stays blobs while the stage draws blocks (`Stage.setBlocks`): grass, flowers and the like, too fine to be cubes,
   * drawn among them and hidden by them where they stand in front. It makes no cubes.
   */
  soft?: boolean
  /** A surface that moves by itself and is sent up again with `reshape` (a pond's): while the stage draws blocks it is columns that follow it, or stays blobs, as the look's `flow` says. */
  flows?: boolean
  /** The side of its cubes while the stage draws blocks, where it was cut on a grid of its own; left out, the look's `cell`. */
  blockCell?: number
}

/** How many morph targets a world takes, over all its actors. */
export const MAX_MORPH_TARGETS = 32

const WORKGROUP = 256
/** In a map of parts, a blob is solid out to where it has faded to this. */
const PART_CUT = 0.15
/** How far off a light from a direction is taken to be, in world units: far enough that its way is the same everywhere. */
const SUN_FAR = 1e4
const KERNEL_2D = 0.3
const MAX_SPLAT_PX = 1024
const CLIP_XY = 1.4

/**
 * How a `SplatWorld` is built: its sort, how a blob on several bones turns, and whether it lights or paints its
 * blobs.
 */
export interface EngineOptions {
  /** Depth buckets for the counting sort. More buckets, fewer ties between blobs that are close in depth. */
  bins?: number
  /**
   * 'bins' (the default): a counting sort over `bins` depth buckets, small buckets settled into index order.
   * 'radix': a stable radix sort over 2²⁴ depth steps (radix.ts), every tie in index order however many share it.
   */
  sort?: 'bins' | 'radix'
  /** How a blob on several bones takes its shape ('quat' unless set): see `SkinMode`. */
  mode?: SkinMode
  /** Live lights (`setLights`): each blob is lit every frame from its normal. Off unless asked for, as it costs a pass. */
  lights?: boolean
  /**
   * How dark what stands in a casting light's way makes it (`SHADOW_DENSITY`, 1.5, where left out): low, a shadow is
   * soft and thin things let light through; about 5, a wall one blob thick blocks nearly all of it, which suits solid
   * scenes under a sun.
   */
  shadowDensity?: number
  /** Paint edits (`setEdits` with op 'paint'): needs the same color pass as lights. Cuts work without it. */
  paint?: boolean
  /**
   * Cuts with a clean edge: a blob a cut passes through is kept and each of its pixels is tested against the cut,
   * so the edge is the shape's own line and not a row of whole blobs. Costs the draw a test per pixel while there are
   * edits; `cleanCuts` on the world turns it off and on again.
   */
  cleanCuts?: boolean
}

/** A point light for `setLights`. */
export interface PointLight {
  /** Where it is, in world space. */
  position: [number, number, number]
  /** Linear RGB, times its strength: [1, 0.6, 0.3] is a torch at full strength. */
  color: [number, number, number]
  /** Its reach: about a quarter strength at this distance, and gone by twice it. */
  range: number
  /** Whether it casts shadows (`shadow.ts`): blobs between a blob and the light take some of it. Off unless set. */
  shadow?: boolean
}

/**
 * A light from one direction that reaches everything, for `setLights`: the sun, or the moon. It doesn't fade with
 * distance, and its shadows (with `shadow`) fall the same way everywhere.
 */
export interface SunLight {
  /** The way toward the light from anywhere in the scene (any length but zero): [0, 1, 0] is straight overhead. */
  direction: [number, number, number]
  /** Linear RGB, times its strength: [1.1, 1, 0.9] is a midday sun. */
  color: [number, number, number]
  /** Whether it casts shadows (`shadow.ts`). Off unless set. */
  shadow?: boolean
}

/** A light `setLights` takes: one at a place, or one from a direction. */
export type Light = PointLight | SunLight

/** How many lights `setLights` takes; the rest are dropped. */
export const MAX_LIGHTS = 16

/**
 * Every blob of every actor as one three.js mesh, so things that overlap are sorted against each other in one pass.
 * On WebGPU the bones move the blobs, and the blobs are projected and sorted, in compute passes each frame; on WebGL
 * 2 the vertex shader moves them and the CPU sorts. Add it to a scene drawn by three.js's `WebGPURenderer`, or let
 * `Stage` do that for you.
 */
export class SplatWorld extends Mesh {
  /** Marks the object as a `SplatWorld`, the way three.js marks its own kinds. */
  readonly isSplatWorld = true
  /** How many blobs it holds, over every actor. */
  readonly count: number
  /** The actors it was built from. */
  readonly actors: Actor[]
  /** How many bones it holds, over every actor. */
  readonly boneCount: number
  /** How a blob on several bones takes its shape: see `SkinMode`. */
  mode: SkinMode
  /** Set by the WebGL backend path, read by tests: did the last frame skin on the CPU? */
  cpuPath = false
  /** Milliseconds the CPU spent in the last frame (WebGL path only): moving centers, sorting, both. */
  cpuMs = 0
  /** Milliseconds of that spent moving centers. */
  cpuSkinMs = 0
  /** Milliseconds of that spent sorting. */
  cpuSortMs = 0
  /** While true, rendering draws the last frame's blobs without moving or sorting them (for timing the draw alone, and for a second draw of the same frame such as the map of parts). */
  hold = false
  private readonly flat = uniform(0)
  private readonly mark: Marks = { kind: uniform(0), size: uniform(1), soft: uniform(0), ink: uniform(new Vector3()), paper: uniform(new Vector3()) }
  /**
   * While true, the draw is a map of parts, not a picture: every blob is a hard disc in its part's own flat color
   * (red and green hold the part's number plus one, blue the actor's), with no light, fog or soft edge, so where two
   * parts meet the color changes exactly. Pixel mode draws it for the lines between parts.
   */
  get parts() { return this.flat.value === 1 }
  set parts(on: boolean) { this.flat.value = on ? 1 : 0 }
  /**
   * While true, the draw is a depth map: every blob a hard disc (as in the map of parts) whose color is its distance in
   * front of the camera, in units, in all three channels. Drawn after the frame's own render with `hold`, the frame's
   * sort puts the nearest disc last, so each pixel keeps the nearest depth. `SplatDepth` (depth.ts) draws it.
   */
  get depthMap() { return this.flat.value === 2 }
  set depthMap(on: boolean) { this.flat.value = on ? 2 : 0 }
  private readonly depthBase = uniform(0)
  /**
   * A depth map's depths are counted from this far in front of the camera (0 unless set): a map drawn from far off,
   * as a light's view of the scene is, keeps its half floats for the scene's own depth, not the way to it.
   */
  get depthFrom() { return this.depthBase.value as number }
  set depthFrom(d: number) { this.depthBase.value = d }
  private readonly depthSlope = uniform(0)
  /**
   * While true, a depth map gives each pixel of a blob its own depth, along the blob's slope to the line of sight (a
   * flat blob's own plane), where it otherwise gives the whole disc the depth of its middle. For a pass that works out
   * where each pixel is in the world, as cel shading's shadows do.
   */
  get depthSloped() { return this.depthSlope.value === 1 }
  set depthSloped(on: boolean) { this.depthSlope.value = on ? 1 : 0 }
  /** Whether the blobs must be moved before they are next drawn: bones posed, or blobs changed, since the last draw. */
  get stale() { return this.bonesDirty || !this.posed }
  /** How many times the blobs have been moved: it goes up with each draw that found the world `stale`. */
  poses = 0
  /**
   * While true, the draw is a map of tones, for cel shading (`cel`): every blob a hard disc whose red is how it faces
   * the first light (0 away, 0.5 edge on, 1 toward), green 1 (cast shadows are `CelPass`'s own), and blue how flat it
   * is (how far its facing can be trusted). `CelPass` (celPass.ts) draws it.
   */
  get tones() { return this.flat.value === 3 }
  set tones(on: boolean) { this.flat.value = on ? 3 : 0 }
  /**
   * Cel shading, in a world with `lights`: while true the lights no longer change the blobs' colors (each is drawn in
   * its own), and each blob's tone under the first light is worked out in their place, for the map of tones
   * (`tones`). The tone takes the side of a blob the camera sees for its outside, so it is redone as the view moves.
   */
  get cel() { return this.lighting?.cel.value === 1 }
  set cel(on: boolean) {
    if (!this.lighting || this.cel === on) return
    this.lighting.cel.value = on ? 1 : 0
    this.lightsDirty = true
  }
  /**
   * While true, the draw is a map of how the blobs lie on the screen: every blob a hard disc whose color says which
   * way its long axis runs and how much longer than wide it is there (`lieColor` in splat-core/glyphs.ts is the CPU
   * twin of the color). A strand of fur or a blade of grass is long and thin from any side; a disc on a surface is
   * only so where the surface is seen nearly edge on. Drawing as characters reads it for strokes along strands.
   */
  get lieMap() { return this.flat.value === 4 }
  set lieMap(on: boolean) { this.flat.value = on ? 4 : 0 }
  /**
   * While true, the draw is a map of dither steps: every blob a hard disc (as in the map of parts) whose red is its
   * step of the Bayer pattern (0 to 15, as a byte), from where it sits at rest (`surfaceRanks` in splat-core/pixel.ts).
   * Pixel mode draws it for dither that stays on things (`PixelLook.surface`).
   */
  get ranks() { return this.flat.value === 5 }
  set ranks(on: boolean) { this.flat.value = on ? 5 : 0 }
  /**
   * While true, the draw is the picture with every blob a hard disc (as in the map of parts: solid out to where it has
   * faded to the same share, in the same order), each in its own lit color. Pixel mode draws its picture so
   * (`PixelLook.solid`), so a pixel's color always comes from the thing the map of parts says is there, never partly
   * from what is behind a fading edge.
   */
  get solid() { return this.flat.value === 6 }
  set solid(on: boolean) { this.flat.value = on ? 6 : 0 }

  private readonly boneOffset: number[]
  /** Per actor, the share of its blobs left out (0: all drawn). Sent to the GPU in each of its bones' spare matrix slot. */
  private readonly drop: Float32Array
  /**
   * Level of detail: while set, each actor draws a share of its blobs by how big it is on screen (`detailFor`),
   * the rest grown to cover for them. Off (every blob drawn) unless asked for; turning it off draws every blob again.
   */
  get autoDetail(): DetailRule | false { return this.auto }
  set autoDetail(rule: DetailRule | false) {
    this.auto = rule
    if (!rule && this.drop.some((d) => d > 0)) { this.drop.fill(0); this.bonesDirty = true }
  }
  private auto: DetailRule | false = false
  private readonly boneRadius: Float32Array
  /** Per bone, a sphere round its own blobs at rest (x, y, z, radius), carried by the bone's matrix: for level of detail. */
  private readonly boneSphere: Float32Array
  /** Per bone, the box round its own blobs at rest (middle x, y, z, then half sizes): for the grid of shadows. */
  private readonly boneBox: Float32Array
  private readonly buf: ReturnType<typeof makeBuffers>
  private readonly sort: Sorter
  private readonly deformNodes: Record<SkinMode, ReturnType<typeof makeDeform>>
  /** Morphs, when any actor has them: the GPU data, the pass, the deform that reads its output, and each actor's weights. */
  private readonly morph?: MorphGPU & { node: ReturnType<typeof makeMorph>; deform: Record<SkinMode, ReturnType<typeof makeDeform>>; weights: Float32Array[]; firstTarget: number[] }
  private morphDirty = true
  /** Per actor, its blobs reshaped on the CPU for its weights (WebGL and the CPU twin), or undefined at rest. */
  private morphed: (Blobs | undefined)[] = []
  private readonly projectNode: ReturnType<typeof makeProject>
  private readonly cam: CameraUniforms
  private readonly bins: number
  private readonly cpuCenters: Float32Array
  private builtFor = ''
  private posed = false
  private bonesDirty = true
  private lastSortKey = ''
  private readonly size = new Vector2()
  /** A sphere round every actor's posed bones, for placing a camera or a shadow grid. */
  readonly bounds = new Sphere()
  /**
   * Distance fog: blobs fade toward `color` (linear RGB) from `near` to `far`
   * in front of the camera, so a scene can end in mist instead of an edge.
   * Off while `far` is 0.
   */
  readonly fog: Fog
  /** Live lighting, when the world was made with `lights: true`. */
  readonly lighting?: Lighting
  private lightNode?: ReturnType<typeof makeLight>
  /** Color by angle, when any actor's blobs have it: the terms on the GPU and the pass that adds them. */
  private readonly sh?: ViewSH
  private shNode?: ReturnType<typeof makeViewColor>
  private shadowNodes?: { clear: ReturnType<typeof makeShadowClear>; scatter: ReturnType<typeof makeShadowScatter> }
  /** Whether any light in use casts shadows. */
  private casting = false
  /** WebGL only: each blob's reach and opacity at rest, for building the grid of shadows on the CPU. */
  private restSigma?: Float32Array
  private restOpacity?: Float32Array
  /** Where the grid of shadows lay last frame, so this frame's can keep its lattice. */
  private shadowAt?: ShadowBox
  private lightsDirty = true
  /**
   * How many times its own color a blob that gives all its own light (`Actor.glow`) is drawn, in a world with lights: 1
   * to start with, so a lamp is as bright as white paper. A flame is far brighter than anything it lights; with a gain
   * of several its color goes over white, which a picture that holds such light (a half-float target, as `SplatLens`
   * draws into) can tell from a pale thing in strong light, and let only the flame glow. Drawn straight to the screen
   * it only clips to white, so leave it at 1 there.
   */
  get glowGain() { return this.lighting ? this.lighting.emit.value as number : 1 }
  set glowGain(v: number) {
    if (!this.lighting || this.lighting.emit.value === v) return
    this.lighting.emit.value = Math.max(0, v)
    this.lightsDirty = true
  }

  /**
   * Eases the light on every blob over about this many frames (WebGPU; 0, the default, is none): a blob's lit color
   * goes a share of the way to its new one each frame, so a shadow's edge passing over it, or a lamp catching, fades
   * and does not pop. For lights that move slowly, like a sun. A frame is then no longer a function of its moment alone.
   */
  lightEase = 0
  private easeLeft = 0
  private eased = false
  /** Whether eased light is still on its way: the scene needs drawing again though nothing else has changed. */
  get settling() { return this.easeLeft > 0 }

  constructor(actors: Actor[], { bins: wantBins = 65536, sort: sortKind = 'bins', mode = 'quat', lights = false, paint = false, cleanCuts = false, shadowDensity = SHADOW_DENSITY }: EngineOptions = {}) {
    const count = actors.reduce((s, a) => s + a.blobs.count, 0)
    const geometry = new InstancedBufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3))
    geometry.setIndex([0, 1, 2, 0, 2, 3])
    geometry.instanceCount = count

    const boneOffset: number[] = []
    let bones = 0
    for (const a of actors) { boneOffset.push(bones); bones += a.skeleton.count }
    const buf = makeBuffers(actors, boneOffset, count, bones)
    const sort: Sorter = sortKind === 'radix' ? new RadixSort(count) : new DepthSort(count, wantBins, WORKGROUP)
    const bins = sort.bins
    const material = new NodeMaterial()
    material.transparent = true
    material.depthWrite = false
    material.depthTest = true
    material.forceSinglePass = true
    material.fog = false

    super(geometry, material)
    this.count = count
    this.actors = actors
    this.boneCount = bones
    this.boneOffset = boneOffset
    this.buf = buf
    this.sort = sort
    this.bins = bins
    this.mode = mode
    this.frustumCulled = false
    this.cpuCenters = new Float32Array(Math.max(1, count) * 3)
    this.drop = new Float32Array(actors.length)

    this.boneRadius = boneRadii(actors, boneOffset, bones)
    ;({ sphere: this.boneSphere, box: this.boneBox } = boneSpheres(actors, boneOffset, bones))
    this.deformNodes = { quat: makeDeform(buf, 'quat'), linear: makeDeform(buf, 'linear') }
    if (actors.some((a) => a.morphs?.length)) {
      const m = makeMorphGPU(actors, count)
      this.morph = { ...m, node: makeMorph(buf, m), deform: { quat: makeDeform(buf, 'quat', m), linear: makeDeform(buf, 'linear', m) }, weights: actors.map((a) => new Float32Array(a.morphs?.length ?? 0)), firstTarget: m.firstTarget }
      buf.attrs.push(m.dataAttr, m.centerAttr, m.cholAAttr, m.cholBAttr)
    }
    this.cam = { view: uniform(new Matrix4()), proj: uniform(new Matrix4()), viewport: uniform(new Vector2(1, 1)), depthRange: uniform(new Vector2(0, 1)), clip: uniform(new Vector4(0, 0, 0, 1)) }
    this.fog = { color: uniform(new Vector3(0, 0, 0)), range: uniform(new Vector2(0, 0)) }
    this.projectNode = makeProject(buf, sort, this.cam, bins)
    const sh = actors.some((a) => a.blobs.shDegree > 0)
    if (sh) {
      this.sh = makeSH(actors, buf.count)
      buf.attrs.push(this.sh.attr)
    }
    // color by angle is worked out in the same color pass as lights and paint, which the draw reads in place of the packed color
    if (lights || paint || sh) {
      this.lighting = makeLighting(buf.count)
      this.lighting.density.value = Math.max(0, shadowDensity)
      buf.attrs.push(this.lighting.attr)
      this.lightNode = makeLight(buf, this.lighting, sh)
      if (this.sh) this.shNode = makeViewColor(buf, this.lighting, this.sh)
      buf.attrs.push(this.lighting.gridAttr)
      this.shadowNodes = { clear: makeShadowClear(this.lighting), scatter: makeShadowScatter(buf, this.lighting) }
    }
    this.clean = cleanCuts
    buf.edits.clean.value = cleanCuts ? 1 : 0
    material.colorNode = makeFragment(this.flat, this.mark, cleanCuts ? buf.edits : undefined) as never

    this.onBeforeRender = (renderer, _scene, camera) => this.prepare(renderer as unknown as Renderer, camera)
  }

  /**
   * Draws every blob as a brush mark or an ink stroke (marks.ts) in place of a soft dot, or as dots again when left
   * out. A mark is turned and stretched by its blob's own shape on screen and seeded by the blob, so it stays on its
   * blob as the view moves. Maps of parts and depth are drawn as before.
   */
  setMarks(look?: MarkLook) {
    const M = this.mark
    M.kind.value = look ? MARK_KINDS.indexOf(look.kind) + 1 : 0
    // Marks are paint, and paint has no order of its own: drawn back to front by their centers, the blobs of one flat
    // thing change places all at once as it turns in the view, and every mark on it jumps. So marks write depth, and
    // each pixel keeps the mark nearest to it there (`placeQuad`), whatever order they were drawn in. A `soft` look
    // is laid in paint order as before, for a scan's blobs, which build a surface between them
    const byDepth = !!look && !look.soft
    M.soft.value = byDepth ? 0 : 1
    const material = this.material as NodeMaterial
    if (material.depthWrite !== byDepth) { material.depthWrite = byDepth; material.needsUpdate = true }
    M.size.value = look?.size ?? 1
    const lin = (c: readonly number[]) => [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])] as const
    M.ink.value.set(...lin(look?.ink ?? INK))
    M.paper.value.set(...lin(look?.paper ?? PAPER))
  }

  /** How dark what stands in a casting light's way makes it (`EngineOptions.shadowDensity`): a world made without lights has none. */
  set shadowDensity(density: number) { if (this.lighting) this.lighting.density.value = Math.max(0, density) }
  get shadowDensity() { return this.lighting ? (this.lighting.density.value as number) : 0 }

  /** Fades blobs to `color` (linear RGB, 0–1) between `near` and `far` units from the camera; `far` 0 turns it off. */
  setFog(color: [number, number, number], near: number, far: number) {
    this.fog.color.value.set(color[0], color[1], color[2])
    this.fog.range.value.set(near, far)
  }

  /**
   * Lights the blobs with up to MAX_LIGHTS lights, on top of `ambient` times their own (baked) color: point lights
   * that fade with distance, and lights from a direction (a sun, a moon) that don't. `ambient` is one brightness or a
   * linear color, for light from the whole sky. Each blob's normal is its flattest axis, so a light reaches the side
   * of a surface that faces it. Needs `lights: true`.
   */
  setLights(lights: Light[], ambient: number | readonly [number, number, number] = 1) {
    const L = this.lighting
    if (!L) return
    if (typeof ambient === 'number') L.ambient.value.set(ambient, ambient, ambient)
    else L.ambient.value.set(ambient[0], ambient[1], ambient[2])
    L.count.value = Math.min(MAX_LIGHTS, lights.length)
    this.lightsDirty = true
    for (let k = 0; k < MAX_LIGHTS; k++) {
      const l = lights[k]
      if (l && 'direction' in l) {
        // a light from a direction: the way to it, and no reach (w under 0 is how the shader knows)
        const d = l.direction, len = Math.hypot(d[0], d[1], d[2]) || 1
        ;(L.pos.array[k] as Vector4).set(d[0] / len, d[1] / len, d[2] / len, -1)
      } else (L.pos.array[k] as Vector4).set(l?.position[0] ?? 0, l?.position[1] ?? 0, l?.position[2] ?? 0, l ? Math.max(1e-3, l.range) : 1)
      ;(L.col.array[k] as Vector4).set(l?.color[0] ?? 0, l?.color[1] ?? 0, l?.color[2] ?? 0, l?.shadow ? 1 : 0)
    }
    const casting = lights.slice(0, MAX_LIGHTS).some((l) => l.shadow)
    // a light that starts casting needs a grid of this frame's blobs, even if nothing moved
    if (casting && !this.casting) this.bonesDirty = true
    this.casting = casting
  }

  /**
   * Cuts and paints by shape, live (edit.ts): up to MAX_EDITS spheres or boxes in world space, tested against where each
   * blob is now. A cut blob gets no size; a painted one is mixed toward the paint before any light (needs `paint: true`
   * or `lights: true`). Replaces the edits before; [] clears them.
   */
  setEdits(edits: readonly ShapeEdit[]) {
    const E = this.buf.edits
    const list = edits.slice(0, MAX_EDITS)
    if (list.some((e) => e.op === 'paint') && !this.lighting) throw new Error('setEdits: paint needs a world made with paint: true')
    this.edits = list.map((e) => ({ ...e }))
    E.count.value = list.length
    for (let k = 0; k < MAX_EDITS; k++) {
      const e = list[k]
      const kind = e ? (e.shape === 'box' ? 1 : 0) + (e.op === 'paint' ? 2 : 0) + (e.outside ? 4 : 0) + (e.shape === 'cylinder' ? 8 : 0) : 0
      const c = (e?.color ?? [1, 1, 1]).map(srgbToLinear)
      ;(E.a.array[k] as Vector4).set(e?.center[0] ?? 0, e?.center[1] ?? 0, e?.center[2] ?? 0, kind)
      ;(E.b.array[k] as Vector4).set(e?.size[0] ?? 0, e?.size[1] ?? 0, e?.size[2] ?? 0, Math.max(0, e?.soft ?? 0))
      ;(E.c.array[k] as Vector4).set(c[0], c[1], c[2], Math.max(0, Math.min(1, e?.amount ?? 1)))
    }
    this.bonesDirty = true
    this.lightsDirty = true
  }
  private edits: ShapeEdit[] = []
  private readonly clean: boolean
  /** Whether cuts have a clean edge now. Only a world made with `cleanCuts` can; setting it there switches between the clean edge and whole blobs. */
  get cleanCuts() { return this.buf.edits.clean.value > 0 }
  set cleanCuts(on: boolean) {
    const v = on && this.clean ? 1 : 0
    if (v === this.buf.edits.clean.value) return
    this.buf.edits.clean.value = v
    this.bonesDirty = true
    this.lightsDirty = true
  }

  /** Sets an actor's morph weights (one per morph, 0–1); the blobs are reshaped next frame. */
  setMorphWeights(actor: Actor | number, weights: ArrayLike<number>) {
    const a = typeof actor === 'number' ? actor : this.actors.indexOf(actor)
    const M = this.morph
    if (!M || !this.actors[a]?.morphs?.length) throw new Error('setMorphWeights: that actor has no morphs')
    const w = M.weights[a]
    let changed = false
    for (let k = 0; k < w.length; k++) { const v = weights[k] ?? 0; if (v !== w[k]) { w[k] = v; changed = true } }
    if (!changed) return
    // each morph's weight as factors on its targets (a morph with in-betweens reaches them in turn)
    const morphs = this.actors[a].morphs!
    let t = M.firstTarget[a]
    morphs.forEach((m, k) => {
      const f = new Float32Array(m.targets.length)
      if (w[k] && m.targets.length) {
        const [lo, hi, u] = shares(m.targets.length, w[k])
        if (lo >= 0 && u !== 1) f[lo] += 1 - u
        if (u !== 0) f[hi] += u
      }
      for (const v of f) M.factors.array[t++] = v
    })
    this.morphed[a] = undefined
    this.morphDirty = true
    this.bonesDirty = true
  }

  /** An actor's blobs as its morphs shape them now (the rest blobs when it has none or they are all 0). */
  private shapedBlobs(a: number): Blobs {
    const actor = this.actors[a], w = this.morph?.weights[a]
    if (!actor.morphs?.length || !w || w.every((v) => v === 0)) return actor.blobs
    let b = this.morphed[a]
    if (!b) {
      b = actor.blobs.clone()
      applyMorphs(actor.blobs, actor.morphs, w, b)
      this.morphed[a] = b
    }
    return b
  }

  /** WebGL: the morphed actors' centers and shapes, worked out on the CPU and sent up in place of the rest ones. */
  private morphCPU() {
    const b = this.buf
    const center = b.centerAttr.array as Float32Array, scale = b.scaleAttr.array as Float32Array, quat = b.quatAttr.array as Float32Array
    let i0 = 0
    this.actors.forEach((actor, a) => {
      if (actor.morphs?.length) packShape(this.shapedBlobs(a), this.boneOffset[a], i0, center, scale, quat)
      i0 += actor.blobs.count
    })
    if (center !== b.srcCenterData) b.srcCenterData.set(center.subarray(0, b.srcCenterData.length))
    for (const x of [b.centerAttr, b.scaleAttr, b.quatAttr]) bump(x)
  }

  /** Call after posing any skeleton. */
  markPosed() { this.bonesDirty = true }

  /** Draws `keep` (0–1) of an actor's blobs, each grown to cover for the rest. 1 draws them all. `autoDetail` overrides it each frame. */
  setDetail(actor: Actor | number, keep: number) {
    const a = typeof actor === 'number' ? actor : this.actors.indexOf(actor)
    if (a < 0 || a >= this.actors.length) throw new Error('setDetail: not an actor of this world')
    const d = 1 - Math.min(1, Math.max(0.01, keep))
    if (d === this.drop[a]) return
    this.drop[a] = d
    this.bonesDirty = true
  }

  /** The share of each actor's blobs being drawn. */
  get detail(): number[] { return [...this.drop].map((d) => 1 - d) }


  /**
   * Takes the actors' blobs again after they were changed in place: centers, shapes, colors and opacities, for blobs
   * that something other than a bone moves (a shape shift). The counts, the bones and the weights must be as they were.
   */
  refresh() {
    const b = this.buf
    if (this.actors.reduce((s, a) => s + a.blobs.count, 0) !== this.count) throw new Error('refresh: the number of blobs changed')
    // on WebGL three.js swaps in a padded copy as each attribute's array (see uploadBones): write into whatever it holds now
    const center = b.centerAttr.array as Float32Array
    packBlobs(this.actors, this.boneOffset, center, b.scaleAttr.array as Float32Array, b.quatAttr.array as Float32Array, b.colorAttr.array as Uint32Array)
    // the WebGL path moves centers on the CPU from its own copy
    if (center !== b.srcCenterData) b.srcCenterData.set(center.subarray(0, b.srcCenterData.length))
    for (const a of [b.centerAttr, b.scaleAttr, b.quatAttr, b.colorAttr]) bump(a)
    if (this.sh) { packSH(this.actors, this.sh, this.sh.attr.array as Uint32Array); bump(this.sh.attr); this.lightsDirty = true }
    this.boneRadius.set(boneRadii(this.actors, this.boneOffset, this.boneCount))
    const fresh = boneSpheres(this.actors, this.boneOffset, this.boneCount)
    this.boneSphere.set(fresh.sphere)
    this.boneBox.set(fresh.box)
    this.restSigma = this.restOpacity = undefined
    this.bonesDirty = true
  }

  /**
   * Takes one actor's colors and opacities again after they were changed in place, when nothing moved
   * (a floor that scorches): only the color buffer goes up again.
   */
  recolor(actor: Actor) {
    const ai = this.actors.indexOf(actor)
    if (ai < 0) throw new Error('recolor: not an actor of this world')
    let at = 0
    for (let j = 0; j < ai; j++) at += this.actors[j].blobs.count
    packColors(actor.blobs, this.buf.colorAttr.array as Uint32Array, at)
    bump(this.buf.colorAttr)
    this.lightsDirty = true
  }

  /**
   * Takes one actor's blobs again after they were changed in place: centers, shapes, colors and opacities, as
   * `refresh` does for every actor, for a surface that moves on its own (water). Its blobs must stay about where its
   * bones' bounds were when the world was made, since those are not measured again.
   */
  reshape(actor: Actor) {
    const ai = this.actors.indexOf(actor)
    if (ai < 0) throw new Error('reshape: not an actor of this world')
    let at = 0
    for (let j = 0; j < ai; j++) at += this.actors[j].blobs.count
    const b = this.buf
    const center = b.centerAttr.array as Float32Array
    packShape(actor.blobs, this.boneOffset[ai], at, center, b.scaleAttr.array as Float32Array, b.quatAttr.array as Float32Array)
    packColors(actor.blobs, b.colorAttr.array as Uint32Array, at)
    if (center !== b.srcCenterData) b.srcCenterData.set(center.subarray(at * 4, (at + actor.blobs.count) * 4), at * 4)
    this.part(b.centerAttr, at * 4, actor.blobs.count * 4)
    this.part(b.scaleAttr, at * 4, actor.blobs.count * 4)
    this.part(b.quatAttr, at * 4, actor.blobs.count * 4)
    this.part(b.colorAttr, at, actor.blobs.count)
    this.restSigma = this.restOpacity = undefined
    this.bonesDirty = true
    this.lightsDirty = true
  }

  /**
   * Marks a stretch of a buffer to go up, not all of it (WebGPU; the WebGL path's textures go up whole). If the whole
   * buffer is already waiting to go up this frame, it still goes whole.
   */
  private part(a: StorageBufferAttribute, start: number, count: number) {
    if (this.builtFor !== 'webgpu' || whole.has(a)) { bump(a); return }
    ;(a as unknown as { addUpdateRange(start: number, count: number): void }).addUpdateRange(start, count)
    a.needsUpdate = true
  }

  /**
   * A plane that hides every blob whose center is behind it, as [nx, ny, nz, d]: a blob at p is drawn while
   * n·p + d is 0 or more. null (the start) draws them all. It acts where blobs are projected, so it can change from
   * one draw to the next in a frame: `SplatMirror` sets it for its mirrored draw and puts it back.
   */
  get clip(): [number, number, number, number] | null {
    const k = this.cam.clip.value
    return k.x === 0 && k.y === 0 && k.z === 0 ? null : [k.x, k.y, k.z, k.w]
  }
  set clip(plane: readonly [number, number, number, number] | null) {
    if (plane) this.cam.clip.value.set(plane[0], plane[1], plane[2], plane[3])
    else this.cam.clip.value.set(0, 0, 0, 1)
  }

  private isWebGL(renderer: Renderer) {
    return (renderer as unknown as { backend?: { isWebGLBackend?: boolean } }).backend?.isWebGLBackend === true
  }

  /** Picks the draw for the backend: WebGPU reads projected blobs, WebGL moves and projects each blob as it draws it. */
  private build(webgl: boolean) {
    const key = webgl ? `webgl-${this.mode}` : 'webgpu'
    if (key === this.builtFor) return
    const material = this.material as NodeMaterial
    if (webgl) {
      enableWebGL(this.buf, this.sort)
      // the WebGL vertex shader reads the grid of shadows as a texture, like the other buffers
      if (this.lighting) (this.lighting.grid as { setPBO: (b: boolean) => void }).setPBO(true)
      if (this.sh) (this.sh.data as { setPBO: (b: boolean) => void }).setPBO(true)
      material.vertexNode = makeVertexWebGL(this.buf, this.sort, this.mode, this.fog, { mode: this.flat, base: this.depthBase, slope: this.depthSlope }, this.cam.clip, this.lighting, this.sh, this.clean) as never
    } else {
      material.vertexNode = makeVertexWebGPU(this.buf, this.sort, this.fog, { mode: this.flat, base: this.depthBase, slope: this.depthSlope }, this.lighting, this.clean) as never
    }
    material.needsUpdate = true
    this.builtFor = key
  }

  private uploadBones() {
    const data = this.buf.boneData
    for (let a = 0; a < this.actors.length; a++) {
      const sk = this.actors[a].skeleton
      for (let b = 0; b < sk.count; b++) {
        const g = this.boneOffset[a] + b
        data.set(sk.matrix.subarray(b * 16, b * 16 + 16), g * 20)
        // the matrix's bottom row is never read: its first slot carries the actor's share dropped (lod.ts)
        data[g * 20 + 3] = this.drop[a]
        // and its next two, how far the bone's blobs have dissolved and how far they drift (dissolve.ts)
        data[g * 20 + 7] = sk.gone[b]
        data[g * 20 + 11] = sk.lift[b]
        data.set(sk.quat.subarray(b * 4, b * 4 + 4), g * 20 + 16)
      }
    }
    // On WebGL, three.js pads a storage buffer to fill a texture and swaps in
    // the padded copy as the attribute's array, so copy into whatever it holds now.
    const live = this.buf.boneAttr.array as Float32Array
    if (live !== data) live.set(data)
    bump(this.buf.boneAttr)
  }

  /** A sphere around every posed blob, from the bones and how far their blobs reach. */
  private updateBounds() {
    const min = [Infinity, Infinity, Infinity], maxv = [-Infinity, -Infinity, -Infinity]
    for (let a = 0; a < this.actors.length; a++) {
      const sk = this.actors[a].skeleton
      for (let b = 0; b < sk.count; b++) {
        const r = this.boneRadius[this.boneOffset[a] + b] * sk.scale[b]
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], sk.posedHead[b * 3 + k] - r)
          maxv[k] = Math.max(maxv[k], sk.posedHead[b * 3 + k] + r)
        }
      }
    }
    const c = new Vector3((min[0] + maxv[0]) / 2, (min[1] + maxv[1]) / 2, (min[2] + maxv[2]) / 2)
    this.bounds.set(c, Math.hypot(maxv[0] - min[0], maxv[1] - min[1], maxv[2] - min[2]) / 2)
  }

  /** Sets the camera uniforms for the frame; returns a key that changes whenever the sort must rerun. */
  private setView(renderer: Renderer, camera: Camera) {
    camera.updateMatrixWorld()
    const e = camera.matrixWorldInverse.elements
    const c = this.bounds.center
    const d = -(e[2] * c.x + e[6] * c.y + e[10] * c.z + e[14])
    const lo = Math.max((camera as unknown as { near?: number }).near ?? 0.01, d - this.bounds.radius)
    // Depth bins of a fixed width, starting on a multiple of it. The bounds breathe as bones move, and if the bins
    // moved with them, two blobs at nearly one depth would share a bin on one frame (drawn in index order) and not
    // on the next (drawn in depth order): under a still camera, their overlap would flicker.
    const span = 2 ** Math.ceil(Math.log2(Math.max(d + this.bounds.radius - lo, 0.0001)))
    const width = span / this.bins
    const near = Math.floor(lo / width) * width
    const far = near + span
    const r = renderer as unknown as { getRenderTarget(): { width: number; height: number } | null; getDrawingBufferSize(v: Vector2): Vector2 }
    const target = r.getRenderTarget()
    if (target) this.size.set(target.width, target.height)
    else r.getDrawingBufferSize(this.size)
    this.cam.view.value.copy(camera.matrixWorldInverse)
    this.cam.proj.value.copy(camera.projectionMatrix)
    this.cam.viewport.value.copy(this.size)
    this.cam.depthRange.value.set(near, far)
    if (this.sh) this.sh.eye.value.setFromMatrixPosition(camera.matrixWorld)
    if (this.lighting) this.lighting.eye.value.setFromMatrixPosition(camera.matrixWorld)
    const k = this.cam.clip.value
    return `${e.join(',')}|${camera.projectionMatrix.elements.join(',')}|${this.size.x}x${this.size.y}|${k.x},${k.y},${k.z},${k.w}`
  }

  private prepare(renderer: Renderer, camera: Camera) {
    if (this.hold) return
    const webgl = this.isWebGL(renderer)
    this.cpuPath = webgl
    this.build(webgl)
    let deformed = this.bonesDirty || !this.posed
    if (deformed) {
      this.poses++
      this.uploadBones()
      this.updateBounds()
    }
    let key = this.setView(renderer, camera)
    if (this.auto && this.pickDetail(camera, this.auto)) {
      // the shares changed: send them up with the bones and move the blobs again
      this.uploadBones()
      deformed = true
      key += '|detail'
    }
    const needsSort = deformed || key !== this.lastSortKey
    if (webgl) {
      const t0 = performance.now()
      if (this.morph && this.morphDirty) { this.morphCPU(); this.morphDirty = false }
      if (deformed) skinCenters(this.buf.srcCenterData, this.buf.skinWords, this.buf.boneData, this.count, this.cpuCenters)
      if (deformed && this.casting) this.shadowGridCPU()
      const t1 = performance.now()
      if (needsSort) this.sortCPU()
      const t2 = performance.now()
      this.cpuSkinMs = t1 - t0
      this.cpuSortMs = t2 - t1
      this.cpuMs = t2 - t0
    } else {
      if (this.morph && this.morphDirty) { renderer.compute(this.morph.node as never); this.morphDirty = false }
      if (deformed) this.deform(renderer)
      if (deformed && this.casting && this.shadowNodes) {
        this.placeShadowBox()
        renderer.compute(this.shadowNodes.clear as never)
        renderer.compute(this.shadowNodes.scatter as never)
      }
      // lights move on their own: the lit colors are redone whenever they or the blobs moved
      // and with color by angle, whenever the view moved
      const changed = deformed || this.lightsDirty || ((this.sh || this.cel) && key !== this.lastSortKey)
      if (this.lightNode && (changed || this.easeLeft > 0)) {
        // eased light: each pass goes a share of the way from the colors the last pass left, for a few passes after the
        // last change; the first pass after the blobs were packed has nothing to ease from
        const frames = this.sh || this.cel ? 0 : this.lightEase
        this.easeLeft = changed && frames > 1 ? Math.ceil(frames * 5) : Math.max(0, this.easeLeft - 1)
        this.lighting!.ease.value = frames > 1 && this.eased ? 1 / frames : 1
        this.eased = true
        if (this.shNode) renderer.compute(this.shNode as never)
        renderer.compute(this.lightNode as never)
        this.lightsDirty = false
      }
      if (needsSort) this.project(renderer)
    }
    this.posed = true
    this.bonesDirty = false
    // this frame's draw sends the buffers up: from here a changed stretch can go alone again
    for (const a of [this.buf.centerAttr, this.buf.scaleAttr, this.buf.quatAttr, this.buf.colorAttr]) whole.delete(a)
    this.lastSortKey = key
  }

  /** Lays the grid of shadows over the world's bounds as they are this frame, on the lattice the last frame's lay on (`steadyBox`). */
  private placeShadowBox() {
    const { lo, hi } = this.posedBox()
    const b = this.shadowAt = steadyBox(lo, hi, this.shadowAt)
    const L = this.lighting!
    L.box.value.set(b.origin[0], b.origin[1], b.origin[2], b.cell)
    L.dims.value.set(b.dims[0], b.dims[1], b.dims[2])
    return b
  }

  /**
   * The box that holds every blob as the bones stand now, in the world: closer than `bounds`, which is a ball round
   * the bones' reaches. What a light's view of the scene is fitted to.
   */
  posedBox(): { lo: [number, number, number]; hi: [number, number, number] } {
    // each bone's box at rest, carried by its matrix: the middle moves, the half sizes go through |M|
    const lo: [number, number, number] = [Infinity, Infinity, Infinity], hi: [number, number, number] = [-Infinity, -Infinity, -Infinity]
    for (let a = 0; a < this.actors.length; a++) {
      const sk = this.actors[a].skeleton, m = sk.matrix
      for (let b = 0; b < sk.count; b++) {
        const g = (this.boneOffset[a] + b) * 6
        if (!(sk.scale[b] > 0) || !(this.boneBox[g + 3] + this.boneBox[g + 4] + this.boneBox[g + 5] > 0)) continue
        const o = b * 16, x = this.boneBox[g], y = this.boneBox[g + 1], z = this.boneBox[g + 2]
        const hx = this.boneBox[g + 3], hy = this.boneBox[g + 4], hz = this.boneBox[g + 5]
        for (let k = 0; k < 3; k++) {
          const c = m[o + k] * x + m[o + 4 + k] * y + m[o + 8 + k] * z + m[o + 12 + k]
          const h = Math.abs(m[o + k]) * hx + Math.abs(m[o + 4 + k]) * hy + Math.abs(m[o + 8 + k]) * hz
          lo[k] = Math.min(lo[k], c - h)
          hi[k] = Math.max(hi[k], c + h)
        }
      }
    }
    if (!(lo[0] <= hi[0])) { lo.fill(-1); hi.fill(1) }
    return { lo, hi }
  }

  /** WebGL: the grid of shadows built on the CPU from the moved centers and each blob's reach at rest (`shadow.ts`). */
  private shadowGridCPU() {
    const L = this.lighting!
    if (!this.restSigma || !this.restOpacity) {
      this.restSigma = new Float32Array(this.count)
      this.restOpacity = new Float32Array(this.count)
      let i = 0
      for (const a of this.actors) {
        const b = a.blobs
        for (let k = 0; k < b.count; k++, i++) {
          this.restSigma[i] = Math.max(b.scale[k * 3], b.scale[k * 3 + 1], b.scale[k * 3 + 2])
          // a blob that gives its own light casts no shadow
          this.restOpacity[i] = a.glow && a.glow[k] > 127 ? 0 : b.opacity[k]
        }
      }
    }
    const box = this.placeShadowBox()
    // three.js may have swapped in a padded copy of the array for WebGL: fill whatever it holds now
    occupancy(this.cpuCenters, 3, this.restSigma, this.restOpacity, this.count, box, (L.gridAttr.array as Uint32Array).subarray(0, box.dims[0] * box.dims[1] * box.dims[2]))
    bump(L.gridAttr)
  }

  /**
   * For tests: the GPU's grid of shadows against the CPU twin's, built from the CPU's deform of the same frame
   * (WebGPU, with a light casting). Returns the cells that differ by more than one unit and the total in each.
   */
  async checkShadows(renderer: Renderer) {
    const L = this.lighting
    if (!L) throw new Error('checkShadows: the world has no lights')
    const r = renderer as unknown as { getArrayBufferAsync: (a: StorageBufferAttribute) => Promise<ArrayBuffer> }
    const gpu = new Uint32Array(await r.getArrayBufferAsync(L.gridAttr))
    const cpu = this.deformCPU()
    const sigma = new Float32Array(this.count), opacity = new Float32Array(this.count), center = new Float32Array(this.count * 3)
    let i = 0
    for (const a of this.actors) for (let k = 0; k < a.blobs.count; k++, i++) {
      sigma[i] = blobSigma(cpu.cov, i * 6)
      opacity[i] = a.glow && a.glow[k] > 127 ? 0 : Math.round(a.blobs.opacity[k] * 255) / 255
      center.set(cpu.center.subarray(i * 4, i * 4 + 3), i * 3)
    }
    const v = L.box.value, d = L.dims.value
    const want = occupancy(center, 3, sigma, opacity, this.count, { origin: [v.x, v.y, v.z], cell: v.w, dims: [d.x, d.y, d.z] })
    let differ = 0, gpuTotal = 0, cpuTotal = 0
    for (let c = 0; c < want.length; c++) {
      gpuTotal += gpu[c]; cpuTotal += want[c]
      if (Math.abs(gpu[c] - want[c]) > Math.max(2, want[c] * 0.02)) differ++
    }
    return { differ, gpuTotal, cpuTotal }
  }

  /**
   * Sets each actor's share of blobs from how big it is on screen now. Returns true when a share moved enough to
   * redo (2% of the blobs), so a creature walking toward the camera fills in in steps, not every frame.
   */
  private pickDetail(camera: Camera, rule: DetailRule): boolean {
    const v = this.cam.view.value.elements
    const p11 = camera.projectionMatrix.elements[5]
    let changed = false
    const c = new Float32Array(3)
    const at = new Float32Array(Math.max(...this.actors.map((x) => x.skeleton.count), 1) * 4)
    for (let a = 0; a < this.actors.length; a++) {
      const sk = this.actors[a].skeleton
      // the actor's own sphere: each bone's sphere carried to where the bone is now, then one round them all
      const n = sk.count
      at.fill(0, 0, n * 4)
      const min = [Infinity, Infinity, Infinity], max_ = [-Infinity, -Infinity, -Infinity]
      for (let b = 0; b < n; b++) {
        const g = (this.boneOffset[a] + b) * 4, r = this.boneSphere[g + 3] * sk.scale[b]
        if (!(r > 0)) continue
        const m = sk.matrix, o = b * 16, x = this.boneSphere[g], y = this.boneSphere[g + 1], z = this.boneSphere[g + 2]
        c[0] = m[o] * x + m[o + 4] * y + m[o + 8] * z + m[o + 12]
        c[1] = m[o + 1] * x + m[o + 5] * y + m[o + 9] * z + m[o + 13]
        c[2] = m[o + 2] * x + m[o + 6] * y + m[o + 10] * z + m[o + 14]
        at.set(c, b * 4)
        at[b * 4 + 3] = r
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], c[k] - r); max_[k] = Math.max(max_[k], c[k] + r) }
      }
      let keep = rule.min
      if (min[0] <= max_[0]) {
        const mid = [(min[0] + max_[0]) / 2, (min[1] + max_[1]) / 2, (min[2] + max_[2]) / 2]
        let radius = 0
        for (let b = 0; b < n; b++) {
          if (!(at[b * 4 + 3] > 0)) continue
          radius = Math.max(radius, Math.hypot(at[b * 4] - mid[0], at[b * 4 + 1] - mid[1], at[b * 4 + 2] - mid[2]) + at[b * 4 + 3])
        }
        const depth = -(v[2] * mid[0] + v[6] * mid[1] + v[10] * mid[2] + v[14])
        keep = detailFor(this.actors[a].blobs.count, screenRadius(radius, depth, p11, this.size.y), rule)
      }
      const d = 1 - keep
      if (Math.abs(d - this.drop[a]) > 0.02 || (d === 0 && this.drop[a] !== 0)) { this.drop[a] = d; changed = true }
    }
    return changed
  }

  /**
   * The frame's GPU work in stages, so a timer can wait between them. Each
   * assumes the ones before it ran: deform (bones → world), then project
   * (world → screen, plus sort keys), then order (the sort itself).
   */
  stages(renderer: Renderer, camera: Camera) {
    this.build(this.isWebGL(renderer))
    return {
      deform: () => { this.uploadBones(); this.updateBounds(); this.deform(renderer); if (this.shNode) renderer.compute(this.shNode as never); if (this.lightNode) renderer.compute(this.lightNode as never) },
      project: () => { this.setView(renderer, camera); renderer.compute(this.projectNode as never) },
      order: () => this.sort.order(renderer as never),
    }
  }

  private deform(renderer: Renderer) { renderer.compute((this.morph ? this.morph.deform : this.deformNodes)[this.mode] as never) }
  private project(renderer: Renderer) {
    renderer.compute(this.projectNode as never)
    this.sort.order(renderer as never)
  }

  private sortCPU() {
    const c = this.cpuCenters
    const v = this.cam.view.value.elements
    const [near, far] = [this.cam.depthRange.value.x, this.cam.depthRange.value.y]
    const scale = (this.bins - 1) / Math.max(far - near, 0.0001)
    const top = this.bins - 1
    const keys = this.sort.keysAttr.array as Uint32Array
    for (let i = 0; i < this.count; i++) {
      const d = -(v[2] * c[i * 3] + v[6] * c[i * 3 + 1] + v[10] * c[i * 3 + 2] + v[14])
      keys[i] = top - Math.min(top, Math.max(0, Math.floor((d - near) * scale)))
    }
    this.sort.sortCPU(keys)
  }

  /**
   * The CPU twin of the deform pass: every blob's world center (4 floats) and
   * covariance (6). It reads the same byte weights the GPU does, so the two agree.
   */
  deformCPU() {
    const center = new Float32Array(this.count * 4), cov = new Float32Array(this.count * 6)
    let i = 0
    const w = new Float32Array(4)
    for (let a = 0; a < this.actors.length; a++) {
      const { skin, skeleton } = this.actors[a]
      const blobs = this.shapedBlobs(a)
      const drop = this.drop[a]
      for (let k = 0; k < blobs.count; k++, i++) {
        const word = this.buf.skinWords[i * 2 + 1]
        for (let j = 0; j < 4; j++) w[j] = ((word >>> (j * 8)) & 255) / 255
        skinBlob(
          blobs.center.subarray(k * 3, k * 3 + 3), blobs.scale.subarray(k * 3, k * 3 + 3), blobs.quat.subarray(k * 4, k * 4 + 4),
          skin.joints.subarray(k * 4, k * 4 + 4), w, skeleton, this.mode, center, i * 4, cov, i * 6,
          this.buf.grads[a] ?? undefined, k * GRAD_STRIDE,
        )
        center[i * 4 + 3] = 1
        // dissolving, as the GPU does it: smaller, and drifted
        let gone = 0, lift = 0
        for (let j = 0; j < 4; j++) { const bn = skin.joints[k * 4 + j]; gone += w[j] * skeleton.gone[bn]; lift += w[j] * skeleton.lift[bn] }
        const [left, dx, dy, dz] = dissolved(i, gone, lift)
        center[i * 4] += dx; center[i * 4 + 1] += dy; center[i * 4 + 2] += dz
        // level of detail, as the GPU does it: left out (no size), or grown to cover for those that are
        let f = (lodRank(i) < drop ? 0 : 1 / Math.max(1 - drop, 1e-4)) * left * left
        // shape edits, as the GPU does them: a cut blob has no size
        if (this.edits.length && !editAt(this.edits, center.subarray(i * 4, i * 4 + 3), this.cleanCuts ? CLEAN_MARGIN * blobReach(cov, i * 6) : 0).keep) f = 0
        if (f !== 1) for (let j = 0; j < 6; j++) cov[i * 6 + j] *= f
      }
    }
    return { center, cov }
  }

  /**
   * Reads back what the GPU deform wrote and compares it with the CPU twin.
   * Returns the largest differences in center (world units) and covariance.
   */
  async checkAgainstCPU(renderer: Renderer) {
    const r = renderer as unknown as { getArrayBufferAsync: (a: StorageBufferAttribute) => Promise<ArrayBuffer> }
    const gpuCenter = new Float32Array(await r.getArrayBufferAsync(this.buf.worldCenterAttr))
    const gpuA = new Float32Array(await r.getArrayBufferAsync(this.buf.covAAttr))
    const gpuB = new Float32Array(await r.getArrayBufferAsync(this.buf.covBAttr))
    const cpu = this.deformCPU()
    let center = 0, cov = 0, scale = 0
    for (let i = 0; i < this.count; i++) {
      for (let k = 0; k < 3; k++) center = Math.max(center, Math.abs(gpuCenter[i * 4 + k] - cpu.center[i * 4 + k]))
      const g = [gpuA[i * 4], gpuA[i * 4 + 1], gpuA[i * 4 + 2], gpuA[i * 4 + 3], gpuB[i * 4], gpuB[i * 4 + 1]]
      for (let k = 0; k < 6; k++) {
        cov = Math.max(cov, Math.abs(g[k] - cpu.cov[i * 6 + k]))
        scale = Math.max(scale, Math.abs(cpu.cov[i * 6 + k]))
      }
    }
    return { center, cov, covScale: scale }
  }

  /**
   * Reads back the colors the GPU gave each blob by angle and checks them against `viewColor` (sh.ts) for the view
   * last drawn: the largest gap per channel, 0–1. Only meaningful with no lights and no paint (the pass's output is
   * the lit color). WebGPU only.
   */
  async checkViewColors(renderer: Renderer) {
    if (!this.sh || !this.lighting) return null
    const r = renderer as unknown as { getArrayBufferAsync: (a: StorageBufferAttribute) => Promise<ArrayBuffer> }
    const gpu = new Float32Array(await r.getArrayBufferAsync(this.lighting.attr))
    const cpu = this.deformCPU()
    const eye = this.sh.eye.value, bones = this.buf.boneData, color = this.buf.colorAttr.array as Uint32Array
    let worst = 0, i = 0
    const d = [0, 0, 0], base = [0, 0, 0], Y = new Float64Array(16)
    for (let a = 0; a < this.actors.length; a++) {
      const b = this.actors[a].blobs, t = b.shTerms
      for (let k = 0; k < b.count; k++, i++) {
        const j = (this.boneOffset[a] + (this.buf.skinWords[i * 2] & 255)) * 20
        blobDirection(cpu.center, i, eye, bones, j, d)
        for (let c = 0; c < 3; c++) base[c] = linearToSrgb(((color[i] >>> (c * 8)) & 255) / 255)
        const want = t ? viewColor(base, halves(b.sh!, k * t * 3, t * 3), 0, t, d, Y) : base
        for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(gpu[i * 4 + c] - srgbToLinear(want[c])))
      }
    }
    return worst
  }

  /** Reads back the GPU sort and checks it: every blob drawn once, farthest first. */
  /** Which depth sort this world was built with. */
  get sortKind(): 'bins' | 'radix' { return this.sort instanceof RadixSort ? 'radix' : 'bins' }

  /**
   * Reads the sorted order back from the GPU and counts what is wrong with it: blobs missing, out of order, or in
   * bins left unsettled. For tests.
   */
  async checkSort(renderer: Renderer) {
    const r = renderer as unknown as { getArrayBufferAsync: (a: StorageBufferAttribute) => Promise<ArrayBuffer> }
    const order = new Uint32Array(await r.getArrayBufferAsync(this.sort.orderAttr))
    const keys = new Uint32Array(await r.getArrayBufferAsync(this.sort.keysAttr))
    const seen = new Uint8Array(this.count)
    // `unsettled`: neighbors in one depth bin that are not in index order (only bins too big to settle may have any);
    // `biggest`: the most blobs in one bin
    let missing = this.count, outOfOrder = 0, unsettled = 0, biggest = 0, run = 0
    for (let i = 0; i < this.count; i++) {
      const j = order[i]
      if (j < this.count && !seen[j]) { seen[j] = 1; missing-- }
      if (i && keys[order[i - 1]] > keys[j]) outOfOrder++
      if (i && keys[order[i - 1]] === keys[j]) { run++; if (order[i - 1] > j) unsettled++ } else run = 1
      biggest = Math.max(biggest, run)
    }
    return { missing, outOfOrder, unsettled, biggest }
  }

  /** The order the last sort produced (drawn first is farthest). Only up to date on the CPU path. */
  get order() { return this.sort.orderAttr.array as Uint32Array }

  dispose() {
    this.geometry.dispose()
    ;(this.material as NodeMaterial).dispose()
    // storage buffers belong to no geometry: their dispose event frees them on the GPU
    for (const a of this.buf.attrs) a.dispose()
    this.sort.dispose()
  }
}

interface CameraUniforms {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  view: any; proj: any; viewport: any; depthRange: any; clip: any
}

/** Buffers waiting to go up whole this frame: a stretch marked after that (`SplatWorld.reshape`) must not narrow what is sent. */
const whole = new WeakSet<StorageBufferAttribute>()

function bump(a: StorageBufferAttribute) {
  ;(a as unknown as { updateRanges: unknown[] }).updateRanges.length = 0
  whole.add(a)
  a.needsUpdate = true
  const pbo = (a as unknown as { pbo?: { needsUpdate: boolean } }).pbo
  if (pbo) pbo.needsUpdate = true
}


/** The blobs' own numbers as the GPU holds them: center (with the actor's first bone), scale, facing, and color with opacity in one word. */
function packBlobs(actors: Actor[], boneOffset: number[], center: Float32Array, scale: Float32Array, quat: Float32Array, color: Uint32Array) {
  let i = 0
  actors.forEach((a, ai) => {
    const { blobs } = a
    for (let k = 0; k < blobs.count; k++, i++) {
      center[i * 4] = blobs.center[k * 3]; center[i * 4 + 1] = blobs.center[k * 3 + 1]; center[i * 4 + 2] = blobs.center[k * 3 + 2]
      center[i * 4 + 3] = boneOffset[ai]
      scale[i * 4] = blobs.scale[k * 3]; scale[i * 4 + 1] = blobs.scale[k * 3 + 1]; scale[i * 4 + 2] = blobs.scale[k * 3 + 2]
      quat[i * 4] = blobs.quat[k * 4]; quat[i * 4 + 1] = blobs.quat[k * 4 + 1]; quat[i * 4 + 2] = blobs.quat[k * 4 + 2]; quat[i * 4 + 3] = blobs.quat[k * 4 + 3]
    }
    packColors(blobs, color, i - blobs.count)
  })
}

/** One actor's centers, scales and turns, written from blob `at` on (its colors stay). */
function packShape(blobs: Blobs, bone0: number, at: number, center: Float32Array, scale: Float32Array, quat: Float32Array) {
  for (let k = 0; k < blobs.count; k++) {
    const i = at + k
    center[i * 4] = blobs.center[k * 3]; center[i * 4 + 1] = blobs.center[k * 3 + 1]; center[i * 4 + 2] = blobs.center[k * 3 + 2]
    center[i * 4 + 3] = bone0
    scale[i * 4] = blobs.scale[k * 3]; scale[i * 4 + 1] = blobs.scale[k * 3 + 1]; scale[i * 4 + 2] = blobs.scale[k * 3 + 2]
    quat.set(blobs.quat.subarray(k * 4, k * 4 + 4), i * 4)
  }
}

/** A set of blobs' colors (linear) and opacities as one word each, written from blob `at` on. */
function packColors(blobs: Blobs, color: Uint32Array, at: number) {
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
  for (let k = 0; k < blobs.count; k++) {
    color[at + k] = (byte(srgbToLinear(blobs.color[k * 3])) | (byte(srgbToLinear(blobs.color[k * 3 + 1])) << 8) |
      (byte(srgbToLinear(blobs.color[k * 3 + 2])) << 16) | (byte(blobs.opacity[k]) << 24)) >>> 0
  }
}

function makeBuffers(actors: Actor[], boneOffset: number[], count: number, bones: number) {
  const n = Math.max(1, count)
  const center = new Float32Array(n * 4)
  const scale = new Float32Array(n * 4)
  const quat = new Float32Array(n * 4)
  const color = new Uint32Array(n)
  // each blob's part as a color: see `SplatWorld.parts`
  const part = new Uint32Array(n)
  // joints and weights interleaved, two words per blob: a compute stage may only bind 8 storage buffers on many phones
  const skinWords = new Uint32Array(n * 2)
  // how each blob's weights change across the skin (stretch.ts), for actors with skin between bones; none, and the
  // GPU's copy of the skin is those two words alone
  const grads = actors.map((a) => weightGradients(a.blobs, a.skin, a.partOf))
  // each blob's step of the dither pattern, from where it sits at rest: it rides in the part word's top byte
  const steps = actors.map((a) => surfaceRanks(a.blobs))
  const stretch = grads.some((g) => g)
  // with them, the gradients ride behind the two words as the bits of nine floats, in the same buffer for the same reason
  const skinStride = stretch ? 2 + GRAD_STRIDE : 2
  const skinGpu = stretch ? new Uint32Array(n * skinStride) : skinWords
  const skinFloats = new Float32Array(skinGpu.buffer)
  // how much of each of the first four lights a blob sees, a byte each: all of it unless the actor baked lamp shadows
  const seen = new Uint32Array(n).fill(0xffffffff)
  packBlobs(actors, boneOffset, center, scale, quat, color)
  let i = 0
  actors.forEach((a, ai) => {
    const { blobs, skin } = a
    for (let k = 0; k < blobs.count; k++, i++) {
      const p = Math.min(65535, (a.partOf?.[k] ?? 0) + 1), who = Math.min(255, ai + 1)
      part[i] = ((p & 255) | ((p >> 8) << 8) | (who << 16) | (steps[ai][k] << 24)) >>> 0
      skinWords[i * 2] = (skin.joints[k * 4] | (skin.joints[k * 4 + 1] << 8) | (skin.joints[k * 4 + 2] << 16) | (skin.joints[k * 4 + 3] << 24)) >>> 0
      skinWords[i * 2 + 1] = packWeights(skin.weights, k * 4)
      if (stretch) {
        skinGpu[i * skinStride] = skinWords[i * 2]
        skinGpu[i * skinStride + 1] = skinWords[i * 2 + 1]
        const g = grads[ai]
        if (g) for (let j = 0; j < GRAD_STRIDE; j++) skinFloats[i * skinStride + 2 + j] = g[k * GRAD_STRIDE + j]
      }
      if (a.seen) seen[i] = (a.seen[k * 4] | (a.seen[k * 4 + 1] << 8) | (a.seen[k * 4 + 2] << 16) | (a.seen[k * 4 + 3] << 24)) >>> 0
      // a blob's own light rides in the spare float beside its scale (`packShape` leaves it be)
      if (a.glow) scale[i * 4 + 3] = a.glow[k] / 255
    }
  })
  const attr = (a: Float32Array | Uint32Array, size: number) => new StorageBufferAttribute(a, size)
  const centerAttr = attr(center, 4), scaleAttr = attr(scale, 4), quatAttr = attr(quat, 4)
  const colorAttr = attr(color, 1), skinAttr = attr(skinGpu, 1), partAttr = attr(part, 1), seenAttr = attr(seen, 1)
  const boneData = new Float32Array(Math.max(1, bones) * 20)
  const boneAttr = new StorageBufferAttribute(boneData, 4)
  boneAttr.setUsage(DynamicDrawUsage)
  const worldCenterAttr = new StorageBufferAttribute(new Float32Array(n * 4), 4)
  const covAAttr = new StorageBufferAttribute(new Float32Array(n * 4), 4)
  const covBAttr = new StorageBufferAttribute(new Float32Array(n * 4), 4)
  // what the project pass writes: screen center, depth and opacity factor; the two screen axes
  const splatAAttr = new StorageBufferAttribute(new Float32Array(n * 4), 4)
  const splatBAttr = new StorageBufferAttribute(new Float32Array(n * 4), 4)
  const splatCAttr = new StorageBufferAttribute(new Float32Array(n * 4), 4)
  return {
    count: n,
    /** Every GPU buffer, so dispose can free them. */
    attrs: [centerAttr, scaleAttr, quatAttr, colorAttr, partAttr, seenAttr, skinAttr, boneAttr, worldCenterAttr, covAAttr, covBAttr, splatAAttr, splatBAttr, splatCAttr],
    skinWords, srcCenterData: center,
    /** Each actor's weight gradients (stretch.ts), or null; how many words a blob has in `skin`; whether any actor stretches. */
    grads, skinStride, stretch,
    boneData, boneAttr, worldCenterAttr, covAAttr, covBAttr, colorAttr, centerAttr, scaleAttr, quatAttr,
    srcCenter: storage(centerAttr, 'vec4', n).toReadOnly(),
    srcScale: storage(scaleAttr, 'vec4', n).toReadOnly(),
    srcQuat: storage(quatAttr, 'vec4', n).toReadOnly(),
    skin: storage(skinAttr, 'uint', n * skinStride).toReadOnly(),
    bones: storage(boneAttr, 'vec4', Math.max(1, bones) * 5).toReadOnly(),
    color: storage(colorAttr, 'uint', n).toReadOnly(),
    edits: makeEdits(),
    part: storage(partAttr, 'uint', n).toReadOnly(),
    seen: storage(seenAttr, 'uint', n).toReadOnly(),
    worldCenterW: storage(worldCenterAttr, 'vec4', n),
    covAW: storage(covAAttr, 'vec4', n),
    covBW: storage(covBAttr, 'vec4', n),
    worldCenter: storage(worldCenterAttr, 'vec4', n).toReadOnly(),
    covA: storage(covAAttr, 'vec4', n).toReadOnly(),
    covB: storage(covBAttr, 'vec4', n).toReadOnly(),
    splatAW: storage(splatAAttr, 'vec4', n),
    splatBW: storage(splatBAttr, 'vec4', n),
    splatA: storage(splatAAttr, 'vec4', n).toReadOnly(),
    splatB: storage(splatBAttr, 'vec4', n).toReadOnly(),
    splatCW: storage(splatCAttr, 'vec4', n),
    splatC: storage(splatCAttr, 'vec4', n).toReadOnly(),
    webgl: false,
  }
}

/** On WebGL, storage is read through textures that the CPU fills; the draw reads the blobs' rest data and the bones. */
function enableWebGL(buf: ReturnType<typeof makeBuffers>, sort: Sorter) {
  if (buf.webgl) return
  for (const r of [buf.srcCenter, buf.srcScale, buf.srcQuat, buf.skin, buf.bones, buf.color, buf.part, buf.seen]) (r as unknown as { setPBO: (b: boolean) => void }).setPBO(true)
  sort.enableWebGL()
  buf.webgl = true
}

function boneRadii(actors: Actor[], boneOffset: number[], bones: number) {
  const r = new Float32Array(Math.max(1, bones))
  actors.forEach((a, ai) => {
    const { blobs, skin, skeleton } = a
    for (let k = 0; k < blobs.count; k++) {
      // the blob's main bone: its heaviest weight (a file need not list it first)
      let m = 0
      for (let j = 1; j < 4; j++) if (skin.weights[k * 4 + j] > skin.weights[k * 4 + m]) m = j
      const b = skin.joints[k * 4 + m]
      if (b >= skeleton.count) throw new Error(`blob ${k} names bone ${b}, but the skeleton has ${skeleton.count}`)
      const h = skeleton.bones[b].head
      const s = Math.max(blobs.scale[k * 3], blobs.scale[k * 3 + 1], blobs.scale[k * 3 + 2]) * 2
      const d = Math.hypot(blobs.center[k * 3] - h[0], blobs.center[k * 3 + 1] - h[1], blobs.center[k * 3 + 2] - h[2]) + s
      const g = boneOffset[ai] + b
      if (d > r[g]) r[g] = d
    }
  })
  return r
}

/** Per bone, the smallest box round the blobs it carries most, at rest, and a sphere round that box (x, y, z, radius); blobs count by 2σ. */
function boneSpheres(actors: Actor[], boneOffset: number[], bones: number) {
  const lo = new Float32Array(Math.max(1, bones) * 3).fill(Infinity), hi = new Float32Array(Math.max(1, bones) * 3).fill(-Infinity)
  actors.forEach((a, ai) => {
    const { blobs, skin } = a
    for (let k = 0; k < blobs.count; k++) {
      let m = 0
      for (let j = 1; j < 4; j++) if (skin.weights[k * 4 + j] > skin.weights[k * 4 + m]) m = j
      const g = boneOffset[ai] + skin.joints[k * 4 + m]
      const s = Math.max(blobs.scale[k * 3], blobs.scale[k * 3 + 1], blobs.scale[k * 3 + 2]) * 2
      for (let i = 0; i < 3; i++) {
        lo[g * 3 + i] = Math.min(lo[g * 3 + i], blobs.center[k * 3 + i] - s)
        hi[g * 3 + i] = Math.max(hi[g * 3 + i], blobs.center[k * 3 + i] + s)
      }
    }
  })
  const sphere = new Float32Array(Math.max(1, bones) * 4), box = new Float32Array(Math.max(1, bones) * 6)
  for (let g = 0; g < bones; g++) {
    if (!(lo[g * 3] <= hi[g * 3])) continue
    for (let i = 0; i < 3; i++) {
      sphere[g * 4 + i] = box[g * 6 + i] = (lo[g * 3 + i] + hi[g * 3 + i]) / 2
      box[g * 6 + 3 + i] = (hi[g * 3 + i] - lo[g * 3 + i]) / 2
    }
    sphere[g * 4 + 3] = Math.hypot(hi[g * 3] - lo[g * 3], hi[g * 3 + 1] - lo[g * 3 + 1], hi[g * 3 + 2] - lo[g * 3 + 2]) / 2
  }
  return { sphere, box }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any

/** Columns of the rotation matrix of a unit quaternion (x, y, z, w). */
function quatColumns(q: N) {
  const x = q.x, y = q.y, z = q.z, w = q.w
  return [
    vec3(float(1).sub(y.mul(y).add(z.mul(z)).mul(2)), x.mul(y).add(z.mul(w)).mul(2), x.mul(z).sub(y.mul(w)).mul(2)),
    vec3(x.mul(y).sub(z.mul(w)).mul(2), float(1).sub(x.mul(x).add(z.mul(z)).mul(2)), y.mul(z).add(x.mul(w)).mul(2)),
    vec3(x.mul(z).add(y.mul(w)).mul(2), y.mul(z).sub(x.mul(w)).mul(2), float(1).sub(x.mul(x).add(y.mul(y)).mul(2))),
  ]
}

function quatMul(a: N, b: N) {
  return vec4(
    a.w.mul(b.x).add(a.x.mul(b.w)).add(a.y.mul(b.z)).sub(a.z.mul(b.y)),
    a.w.mul(b.y).sub(a.x.mul(b.z)).add(a.y.mul(b.w)).add(a.z.mul(b.x)),
    a.w.mul(b.z).add(a.x.mul(b.y)).sub(a.y.mul(b.x)).add(a.z.mul(b.w)),
    a.w.mul(b.w).sub(a.x.mul(b.x)).sub(a.y.mul(b.y)).sub(a.z.mul(b.z)),
  )
}

/** `lodRank` on the GPU: Wang's integer hash of the blob's index, to 0–1. */
function lodRankNode(i: N) {
  const h = uint(i).toVar()
  h.assign(h.bitXor(uint(61)).bitXor(h.shiftRight(uint(16))))
  h.assign(h.mul(uint(9)))
  h.assign(h.bitXor(h.shiftRight(uint(4))))
  h.assign(h.mul(uint(0x27d4eb2d)))
  h.assign(h.bitXor(h.shiftRight(uint(15))))
  return float(h.shiftRight(uint(8))).div(16777216)
}

interface Edits { a: N; b: N; c: N; count: N; clean: N }

function makeEdits(): Edits {
  const v = () => uniformArray(Array.from({ length: MAX_EDITS }, () => new Vector4()), 'vec4')
  // a: middle and kind (1 box, +2 paint, +4 outside, +8 cylinder); b: size and soft edge; c: paint (linear) and amount
  return { a: v(), b: v(), c: v(), count: uniform(0, 'int'), clean: uniform(0) }
}

/**
 * What the shape edits do at p: `keep` 0 or 1, and the paint (premultiplied by `amount`). A cut takes only what is
 * `margin` inside it. CPU twin: `editAt` in edit.ts.
 */
function editsAt(E: Edits, p: N, margin: N = float(0)) {
  const keep = float(1).toVar(), paint = vec3(0).toVar(), amount = float(0).toVar()
  TSL.Loop({ start: TSL.int(0), end: E.count, type: 'int', condition: '<', name: 'e' }, ({ e }: { e: N }) => {
    const A = E.a.element(e), B = E.b.element(e), C = E.c.element(e)
    const kind = A.w.toVar()
    const q = p.sub(A.xyz).toVar()
    const d = abs(q).sub(B.xyz).toVar()
    const boxD = length(max(d, vec3(0))).add(min(max(d.x, max(d.y, d.z)), 0))
    const isBox = TSL.mod(kind, 2).greaterThan(0.5)
    const isPaint = TSL.mod(floor(kind.div(2)), 2).greaterThan(0.5)
    const isOutside = TSL.mod(floor(kind.div(4)), 2).greaterThan(0.5)
    const cyl = vec2(length(q.xz).sub(B.x), abs(q.y).sub(B.y)).toVar()
    const cylD = length(max(cyl, vec2(0))).add(min(max(cyl.x, cyl.y), 0))
    const sd = select(kind.greaterThanEqual(8), cylD, select(isBox, boxD, length(q).sub(B.x))).mul(select(isOutside, float(-1), float(1))).toVar()
    If(isPaint.not(), () => {
      If(sd.lessThan(margin.negate()), () => { keep.assign(0) })
    }).Else(() => {
      const w = C.w.mul(select(B.w.greaterThan(0), sd.negate().div(max(B.w, 1e-6)).clamp(0, 1), select(sd.lessThan(0), float(1), float(0)))).toVar()
      paint.assign(paint.mul(float(1).sub(w)).add(C.xyz.mul(w)))
      amount.assign(amount.mul(float(1).sub(w)).add(w))
    })
  })
  return { keep, paint, amount }
}

/** A blob's own (linear) color with the paint edits mixed in. */
function painted(rgb: N, world: N, E: Edits) {
  const e = editsAt(E, world)
  // paint is premultiplied: mix(rgb, paint / amount, amount) = rgb·(1 − amount) + paint
  return rgb.mul(float(1).sub(e.amount)).add(e.paint)
}

interface MorphGPU {
  dataAttr: StorageBufferAttribute; centerAttr: StorageBufferAttribute; cholAAttr: StorageBufferAttribute; cholBAttr: StorageBufferAttribute
  data: N; centerW: N; cholAW: N; cholBW: N; center: N; cholA: N; cholB: N
  /** Per actor: first blob, blob count, where its targets start in `data` (in vec4s), target count; and its first target. */
  info: N; first: N
  /** Every target's factor this frame (uniform). */
  factors: N
  firstTarget: number[]
}

/**
 * The morph targets of every actor in one buffer, three vec4s per blob per target: the center's move and the nine
 * terms of its local stretch (morph.ts `grad`, row by row), target after target, each target all of its actor's blobs.
 */
function makeMorphGPU(actors: Actor[], count: number): MorphGPU {
  const n = Math.max(1, count)
  let targets = 0, cells = 0
  for (const a of actors) for (const m of a.morphs ?? []) { targets += m.targets.length; cells += m.targets.length * a.blobs.count }
  if (targets > MAX_MORPH_TARGETS) throw new Error(`a world takes ${MAX_MORPH_TARGETS} morph targets, not ${targets}`)
  const data = new Float32Array(Math.max(1, cells) * 12)
  const info = actors.map(() => new Vector4()), first = actors.map(() => new Vector4())
  const firstTarget: number[] = []
  let blob0 = 0, t = 0, at = 0
  actors.forEach((a, ai) => {
    const ts = (a.morphs ?? []).flatMap((m) => m.targets)
    info[ai].set(blob0, a.blobs.count, at / 4, ts.length)
    first[ai].set(t, 0, 0, 0)
    firstTarget.push(t)
    for (const tg of ts) {
      for (let k = 0; k < a.blobs.count; k++, at += 12) {
        data[at] = tg.delta[k * 3]; data[at + 1] = tg.delta[k * 3 + 1]; data[at + 2] = tg.delta[k * 3 + 2]
        for (let g = 0; g < 9; g++) data[at + 3 + g] = tg.grad[k * 9 + g]
      }
      t++
    }
    blob0 += a.blobs.count
  })
  const dataAttr = new StorageBufferAttribute(data, 4)
  const centerAttr = new StorageBufferAttribute(new Float32Array(n * 4), 4)
  const cholAAttr = new StorageBufferAttribute(new Float32Array(n * 4), 4)
  const cholBAttr = new StorageBufferAttribute(new Float32Array(n * 4), 4)
  return {
    dataAttr, centerAttr, cholAAttr, cholBAttr, firstTarget,
    data: storage(dataAttr, 'vec4', data.length / 4).toReadOnly(),
    centerW: storage(centerAttr, 'vec4', n), cholAW: storage(cholAAttr, 'vec4', n), cholBW: storage(cholBAttr, 'vec4', n),
    center: storage(centerAttr, 'vec4', n).toReadOnly(), cholA: storage(cholAAttr, 'vec4', n).toReadOnly(), cholB: storage(cholBAttr, 'vec4', n).toReadOnly(),
    info: uniformArray(info, 'vec4'), first: uniformArray(first, 'vec4'),
    factors: uniformArray(new Array(MAX_MORPH_TARGETS).fill(0), 'float'),
  }
}

/**
 * WebGPU: every blob's rest shape with its actor's morphs applied, before the deform (CPU twin: `applyMorphs`):
 * center + Σ factor·delta, and J = I + Σ factor·grad taken through the blob's own axes, M = J·R·S, kept as the
 * Cholesky factor of M Mᵀ (six numbers, so it fits where scale and turn were).
 */
function makeMorph(buf: ReturnType<typeof makeBuffers>, M: MorphGPU) {
  return Fn(() => {
    const i = instanceIndex
    const who = TSL.int(buf.part.element(i).shiftRight(uint(16)).bitAnd(uint(255))).sub(1).toVar()
    const info = M.info.element(who).toVar()
    const t0 = TSL.int(M.first.element(who).x).toVar()
    const local = TSL.int(i).sub(TSL.int(info.x)).toVar()
    const src = buf.srcCenter.element(i).toVar()
    const d = vec3(0).toVar()
    const J0 = vec3(1, 0, 0).toVar(), J1 = vec3(0, 1, 0).toVar(), J2 = vec3(0, 0, 1).toVar()
    TSL.Loop({ start: TSL.int(0), end: TSL.int(info.w), type: 'int', condition: '<', name: 'k' }, ({ k }: { k: N }) => {
      const f = M.factors.element(t0.add(k)).toVar()
      If(f.notEqual(0), () => {
        const at = TSL.int(info.z).add(k.mul(TSL.int(info.y)).add(local).mul(3)).toVar()
        const v0 = M.data.element(at), v1 = M.data.element(at.add(1)), v2 = M.data.element(at.add(2))
        d.addAssign(v0.xyz.mul(f))
        // rows of J: (g0 g1 g2), (g3 g4 g5), (g6 g7 g8) = (v0.w v1.x v1.y), (v1.z v1.w v2.x), (v2.y v2.z v2.w)
        J0.addAssign(vec3(v0.w, v1.x, v1.y).mul(f))
        J1.addAssign(vec3(v1.z, v1.w, v2.x).mul(f))
        J2.addAssign(vec3(v2.y, v2.z, v2.w).mul(f))
      })
    })
    M.centerW.element(i).assign(vec4(src.xyz.add(d), src.w))
    const s = buf.srcScale.element(i).xyz.toVar()
    const R = quatColumns(normalize(buf.srcQuat.element(i)) as never)
    // M = J·R·S by columns, then Σ = M Mᵀ
    const m = [R[0].mul(s.x), R[1].mul(s.y), R[2].mul(s.z)].map((c) => vec3(dot(J0, c), dot(J1, c), dot(J2, c)).toVar())
    const e = (r: 'x' | 'y' | 'z', c: 'x' | 'y' | 'z') => m[0][r].mul(m[0][c]).add(m[1][r].mul(m[1][c])).add(m[2][r].mul(m[2][c]))
    const l00 = sqrt(max(e('x', 'x'), 1e-20)).toVar()
    const l10 = e('x', 'y').div(l00).toVar(), l20 = e('x', 'z').div(l00).toVar()
    const l11 = sqrt(max(e('y', 'y').sub(l10.mul(l10)), 1e-20)).toVar()
    const l21 = e('y', 'z').sub(l20.mul(l10)).div(l11).toVar()
    const l22 = sqrt(max(e('z', 'z').sub(l20.mul(l20)).sub(l21.mul(l21)), 1e-20))
    M.cholAW.element(i).assign(vec4(l00, l10, l20, l11))
    // the blob's own light (`Actor.glow`) goes along in the spare slot, since the deform no longer reads the scale
    M.cholBW.element(i).assign(vec4(l21, l22, buf.srcScale.element(i).w, 0))
  })().compute(buf.count, [WORKGROUP]).setName('SplatWorldMorph')
}

/** One blob through its bones: world center and the six covariance terms, as `skinBlob` does on the CPU. */
function deformBlob(buf: ReturnType<typeof makeBuffers>, i: N, mode: SkinMode, M?: MorphGPU) {
  // with morphs, the morph pass's output: the reshaped center, and the rest shape as a Cholesky factor
  const src = (M ? M.center : buf.srcCenter).element(i).toVar()
  const base = uint(src.w).toVar()
  const at = i.mul(buf.skinStride).toVar()
  const jw = buf.skin.element(at).toVar()
  const w = unpackUnorm4x8(buf.skin.element(at.add(1))).toVar()
  const js = [0, 8, 16, 24].map((s) => base.add(jw.shiftRight(s).bitAnd(255)).mul(5).toVar())
  const ws = [w.x, w.y, w.z, w.w]
  const col = (k: number, c: number) => buf.bones.element(js[k].add(c))
  const c0 = vec3(0).toVar(), c1 = vec3(0).toVar(), c2 = vec3(0).toVar(), c3 = vec3(0).toVar()
  const Q = vec4(0).toVar()
  const S = float(0).toVar()
  const drop = float(0).toVar(), gone = float(0).toVar(), lift = float(0).toVar()
  const q0 = col(0, 4).toVar()
  for (let k = 0; k < 4; k++) {
    const wk = ws[k]
    const a0 = col(k, 0).xyz
    // every bone of an actor carries the same share dropped in its matrix's spare slot, so the blend is that share
    drop.addAssign(col(k, 0).w.mul(wk))
    // and how far it has dissolved, and its drift, in the next two (dissolve.ts)
    gone.addAssign(col(k, 1).w.mul(wk))
    lift.addAssign(col(k, 2).w.mul(wk))
    c0.addAssign(a0.mul(wk))
    c1.addAssign(col(k, 1).xyz.mul(wk))
    c2.addAssign(col(k, 2).xyz.mul(wk))
    c3.addAssign(col(k, 3).xyz.mul(wk))
    const qk = col(k, 4)
    const sign = select(dot(qk, q0).lessThan(0), float(-1), float(1))
    Q.addAssign(qk.mul(sign.mul(wk)))
    S.addAssign(length(a0).mul(wk))
  }
  const p = src.xyz
  const world = c0.mul(p.x).add(c1.mul(p.y)).add(c2.mul(p.z)).add(c3).toVar()

  // skin that stretches (stretch.ts; `skinBlob` is the twin): E = Σ (bone k's place for the center − the blend's) ⊗ ∇wₖ
  // is what the blended matrices leave out, and each of the blob's rest axes takes its share of it
  let stretched = (_rest: N, posed: N) => posed
  if (buf.stretch) {
    const gf = (o: number) => uintBitsToFloat(buf.skin.element(at.add(o)))
    const g = [0, 1, 2].map((k) => vec3(gf(2 + k * 3), gf(3 + k * 3), gf(4 + k * 3)).toVar())
    const gs = [g[0].add(g[1]).add(g[2]).negate().toVar(), ...g]
    const ds = [0, 1, 2, 3].map((k) => col(k, 0).xyz.mul(p.x).add(col(k, 1).xyz.mul(p.y)).add(col(k, 2).xyz.mul(p.z)).add(col(k, 3).xyz).sub(world).toVar())
    stretched = (rest, posed) => {
      const add = ds[0].mul(dot(gs[0], rest)).add(ds[1].mul(dot(gs[1], rest))).add(ds[2].mul(dot(gs[2], rest))).add(ds[3].mul(dot(gs[3], rest))).toVar()
      return posed.add(add.mul(min(float(1), length(posed).mul(MAX_STRETCH).div(max(length(add), 1e-20)))))
    }
  }

  let A: N[]
  // the blob's own light (`Actor.glow`), handed on to the color pass in a spare slot of the covariance
  let glow: N
  if (M) {
    glow = M.cholB.element(i).z
    // the rest shape is L Lᵀ, L lower triangular: its columns stand in for the blob's scaled axes
    const la = M.cholA.element(i).toVar(), lb = M.cholB.element(i).toVar()
    const L = [vec3(la.x, la.y, la.z), vec3(0, la.w, lb.x), vec3(0, 0, lb.y)]
    if (mode === 'quat') {
      const R = quatColumns(normalize(Q) as never)
      A = L.map((l) => stretched(l, R[0].mul(l.x).add(R[1].mul(l.y)).add(R[2].mul(l.z)).mul(S)))
    } else {
      A = L.map((l) => stretched(l, c0.mul(l.x).add(c1.mul(l.y)).add(c2.mul(l.z))))
    }
  } else if (mode === 'quat') {
    glow = buf.srcScale.element(i).w
    const s = buf.srcScale.element(i).xyz.toVar()
    const lq = normalize(buf.srcQuat.element(i)).toVar()
    const q = quatMul(normalize(Q), lq).toVar()
    const R = quatColumns(q as never)
    A = [R[0].mul(s.x.mul(S)), R[1].mul(s.y.mul(S)), R[2].mul(s.z.mul(S))]
    if (buf.stretch) {
      const own = quatColumns(lq as never)
      A = [stretched(own[0].mul(s.x), A[0]), stretched(own[1].mul(s.y), A[1]), stretched(own[2].mul(s.z), A[2])]
    }
  } else {
    glow = buf.srcScale.element(i).w
    const s = buf.srcScale.element(i).xyz.toVar()
    const lq = normalize(buf.srcQuat.element(i)).toVar()
    const R = quatColumns(lq as never)
    const blend = (v: N) => c0.mul(v.x).add(c1.mul(v.y)).add(c2.mul(v.z))
    A = [stretched(R[0].mul(s.x), blend(R[0]).mul(s.x)), stretched(R[1].mul(s.y), blend(R[1]).mul(s.y)), stretched(R[2].mul(s.z), blend(R[2]).mul(s.z))]
  }
  const a0 = A[0].toVar(), a1 = A[1].toVar(), a2 = A[2].toVar()
  const e = (r: 'x' | 'y' | 'z', c: 'x' | 'y' | 'z') => a0[r].mul(a0[c]).add(a1[r].mul(a1[c])).add(a2[r].mul(a2[c]))
  // level of detail (lod.ts): a blob ranked under the share dropped has no size, and is culled where it is projected;
  // the rest grow to cover for it
  const f = select(lodRankNode(i).lessThan(drop), float(0), float(1).div(max(float(1).sub(drop), 0.0001))).toVar()
  // dissolving (dissolve.ts `dissolved` is the twin): each blob shrinks to nothing in its own turn, drifting up and a little aside
  const turnOf = lodRankNode(uint(i).bitXor(uint(DISSOLVE_TURN))).toVar()
  const waits = turnOf.mul(1 - DISSOLVE_SOFT)
  const going = select(gone.greaterThan(0), smoothstep(waits, waits.add(DISSOLVE_SOFT), gone), float(0)).toVar()
  const way = lodRankNode(uint(i).bitXor(uint(DISSOLVE_WAY))).mul(Math.PI * 2).toVar()
  const drift = going.mul(lift).toVar()
  world.addAssign(vec3(cos(way).mul(DISSOLVE_ASIDE), turnOf.add(0.5), sin(way).mul(DISSOLVE_ASIDE)).mul(drift))
  f.mulAssign(float(1).sub(going).mul(float(1).sub(going)))
  // shape edits: a cut blob has no size either (with clean cuts, only one well inside the cut: the draw trims the rest)
  f.mulAssign(editsAt(buf.edits, world, buf.edits.clean.mul(CLEAN_MARGIN).mul(sqrt(max(e('x', 'x').add(e('y', 'y')).add(e('z', 'z')), 0)))).keep)
  return { world, covA: vec4(e('x', 'x'), e('x', 'y'), e('x', 'z'), e('y', 'y')).mul(f).toVar(), covB: vec4(vec2(e('y', 'z'), e('z', 'z')).mul(f), glow, 0).toVar() }
}

function makeDeform(buf: ReturnType<typeof makeBuffers>, mode: SkinMode, M?: MorphGPU) {
  return Fn(() => {
    const i = instanceIndex
    const d = deformBlob(buf, i, mode, M)
    buf.worldCenterW.element(i).assign(vec4(d.world, 1))
    buf.covAW.element(i).assign(d.covA)
    buf.covBW.element(i).assign(d.covB)
  })().compute(buf.count, [WORKGROUP]).setName(`SplatWorldDeform_${mode}`)
}

/**
 * EWA splatting: a blob's 3D covariance seen through the camera becomes a 2D
 * ellipse on screen. Returns the screen center (NDC) and depth, the ellipse's
 * two axes in NDC (already scaled by their standard deviations), a factor for
 * the opacity (0 when the blob is off screen or behind the camera) and the
 * blob's distance in front of the camera. `clip` is a plane (normal, then
 * offset): a blob whose center is behind it gets opacity 0.
 */
function projectSplat(center: N, covA: N, covB: N, view: N, proj: N, viewport: N, clip: N) {
  const viewCenter4 = view.mul(vec4(center, 1)).toVar()
  const viewCenter = viewCenter4.xyz.toVar()
  const centerClip = proj.mul(viewCenter4).toVar()

  const r0 = vec3(view[0].x, view[1].x, view[2].x).toVar()
  const r1 = vec3(view[0].y, view[1].y, view[2].y).toVar()
  const r2 = vec3(view[0].z, view[1].z, view[2].z).toVar()
  const cov0 = vec3(covA.x, covA.y, covA.z).toVar()
  const cov1 = vec3(covA.y, covA.w, covB.x).toVar()
  const cov2 = vec3(covA.z, covB.x, covB.y).toVar()
  const vc0 = vec3(dot(r0, cov0), dot(r0, cov1), dot(r0, cov2)).toVar()
  const vc1 = vec3(dot(r1, cov0), dot(r1, cov1), dot(r1, cov2)).toVar()
  const vc2 = vec3(dot(r2, cov0), dot(r2, cov1), dot(r2, cov2)).toVar()
  const c00 = dot(vc0, r0).toVar(), c01 = dot(vc0, r1).toVar(), c02 = dot(vc0, r2).toVar()
  const c11 = dot(vc1, r1).toVar(), c12 = dot(vc1, r2).toVar(), c22 = dot(vc2, r2).toVar()

  const z = min(viewCenter.z, -0.01).toVar()
  const invZ = float(1).div(z).toVar()
  const invZ2 = invZ.mul(invZ).toVar()
  const focal = viewport.mul(0.5).mul(vec2(proj[0].x, proj[1].y)).toVar()
  const j00 = focal.x.negate().mul(invZ).toVar()
  const j11 = focal.y.negate().mul(invZ).toVar()
  const j02 = focal.x.mul(viewCenter.x).mul(invZ2).toVar()
  const j12 = focal.y.mul(viewCenter.y).mul(invZ2).toVar()

  const aBase = j00.mul(j00).mul(c00).add(j00.mul(j02).mul(c02).mul(2)).add(j02.mul(j02).mul(c22)).toVar()
  const b = j00.mul(j11).mul(c01).add(j00.mul(j12).mul(c02)).add(j02.mul(j11).mul(c12)).add(j02.mul(j12).mul(c22)).toVar()
  const cBase = j11.mul(j11).mul(c11).add(j11.mul(j12).mul(c12).mul(2)).add(j12.mul(j12).mul(c22)).toVar()
  const a = aBase.add(KERNEL_2D).toVar()
  const c = cBase.add(KERNEL_2D).toVar()
  const detBase = aBase.mul(cBase).sub(b.mul(b)).toVar()
  const det = a.mul(c).sub(b.mul(b)).toVar()
  const alphaScale = sqrt(max(detBase.div(max(det, EPSILON)), 0)).toVar()

  const halfTrace = a.add(c).mul(0.5).toVar()
  const radius = sqrt(max(a.sub(c).mul(0.5).pow2().add(b.mul(b)), EPSILON)).toVar()
  const lambda1 = max(halfTrace.add(radius), EPSILON).toVar()
  const lambda2 = max(halfTrace.sub(radius), EPSILON).toVar()
  const axis1 = vec2(1, 0).toVar()
  If(radius.greaterThan(0.00001), () => {
    const angle = atan(b.mul(2), a.sub(c)).mul(0.5).toVar()
    axis1.assign(vec2(cos(angle), sin(angle)))
  })
  const axis2 = vec2(axis1.y.negate(), axis1.x).toVar()
  const toNdc = vec2(2).div(viewport).toVar()
  const ax1 = axis1.mul(min(sqrt(lambda1), MAX_SPLAT_PX)).mul(toNdc).toVar()
  const ax2 = axis2.mul(min(sqrt(lambda2), MAX_SPLAT_PX)).mul(toNdc).toVar()
  const w = centerClip.w.toVar()
  const lim = w.mul(CLIP_XY).toVar()
  If(viewCenter.z.greaterThanEqual(-0.01)
    .or(centerClip.z.greaterThan(w))
    .or(centerClip.x.abs().greaterThan(lim))
    .or(centerClip.y.abs().greaterThan(lim))
    // the world's clip plane: a blob whose center is behind it is not drawn (a mirrored draw leaves out what is under the mirror)
    .or(dot(center, clip.xyz).add(clip.w).lessThan(0)), () => {
    alphaScale.assign(0)
  })
  const ndc = centerClip.xyz.div(max(w, 0.0001)).toVar()
  // How the blob lies in depth: where it is densest along the line of sight through a point of its ellipse is nearer
  // or further than its center by the depth that goes with that point (the mean of depth given the place on screen:
  // for a flat blob its own plane, for a round one no slope at all). Per unit along each axis, then how far a whole
  // seed lifts it, all as screen depth. CPU twin of the slope: `depthSlope` in splat-core/marks.ts; change both
  const h = vec2(c02.mul(j00).add(c22.mul(j02)), c12.mul(j11).add(c22.mul(j12))).toVar()
  const toDepth = proj[3].z.mul(invZ2).toVar()
  const tilt = vec3(dot(h, axis1).div(sqrt(lambda1)), dot(h, axis2).div(sqrt(lambda2)), sqrt(max(c00.add(c11).add(c22), 0)).mul(MARK_LIFT)).mul(toDepth)
  return { ndc, axes: vec4(ax1, ax2), tilt, alphaScale, depth: viewCenter.z.negate() }
}

/** WebGPU: project every blob once (not once per corner), and write its sort key. */
function makeProject(buf: ReturnType<typeof makeBuffers>, sort: Sorter, cam: CameraUniforms, bins: number) {
  const bins1 = bins - 1
  return Fn(() => {
    const i = instanceIndex
    const p = projectSplat(buf.worldCenter.element(i).xyz, buf.covA.element(i), buf.covB.element(i), cam.view, cam.proj, cam.viewport, cam.clip)
    buf.splatAW.element(i).assign(vec4(p.ndc, p.alphaScale))
    buf.splatBW.element(i).assign(p.axes)
    buf.splatCW.element(i).assign(vec4(p.tilt, 0))
    const span = max(cam.depthRange.y.sub(cam.depthRange.x), 0.0001)
    const t = p.depth.sub(cam.depthRange.x).div(span).clamp(0, 1)
    const key = uint(bins1).sub(uint(t.mul(bins1))).toVar()
    sort.keysW.element(i).assign(key)
    // the counting sort counts its bins here; the radix sort counts its own
    if (sort.histogram) TSL.atomicAdd(sort.histogram.element(key), uint(1))
  })().compute(buf.count, [WORKGROUP]).setName('SplatWorldProject')
}

interface Fog { color: N; range: N }

interface Lighting { cel: N; eye: N; pos: N; col: N; ambient: N; count: N; density: N; ease: N; emit: N; attr: StorageBufferAttribute; litW: N; lit: N; gridAttr: StorageBufferAttribute; gridW: N; grid: N; box: N; dims: N }

function makeLighting(n: number): Lighting {
  // written only by the GPU, so no copy of it on the CPU
  const attr = new StorageBufferAttribute(n, 4)
  const cells = SHADOW_CELLS
  const gridAttr = new StorageBufferAttribute(new Uint32Array(cells), 1)
  return {
    gridAttr,
    gridW: storage(gridAttr, 'uint', cells).toAtomic(),
    grid: storage(gridAttr, 'uint', cells).toReadOnly(),
    // the grid's lowest corner and the side of a cell
    box: uniform(new Vector4(0, 0, 0, 1)),
    // cells each way (whole numbers, as floats)
    dims: uniform(new Vector3(1, 1, 1)),
    pos: uniformArray(Array.from({ length: MAX_LIGHTS }, () => new Vector4(0, 0, 0, 1)), 'vec4'),
    col: uniformArray(Array.from({ length: MAX_LIGHTS }, () => new Vector4()), 'vec4'),
    ambient: uniform(new Vector3(1, 1, 1)),
    // cel shading (`SplatWorld.cel`): the blobs keep their own colors and carry their tone beside them; and where the camera is
    cel: uniform(0),
    eye: uniform(new Vector3()),
    // how dark a cell's occupancy makes a casting light (`EngineOptions.shadowDensity`)
    density: uniform(SHADOW_DENSITY),
    // the share of the way each light pass takes from the last pass's colors to this one's (`SplatWorld.lightEase`)
    ease: uniform(1),
    // how many times its own color a blob that gives all its own light shows (`SplatWorld.glowGain`)
    emit: uniform(1),
    count: uniform(0, 'int'),
    attr,
    litW: storage(attr, 'vec4', n),
    lit: storage(attr, 'vec4', n).toReadOnly(),
  }
}

/**
 * A blob's normal from its covariance: for a flat blob (two long axes, one
 * short) the adjugate is dominated by n·nᵀ, so its longest column points
 * along the normal. Round blobs get some direction, which the soft wrap in
 * `lit` makes harmless. Either sign: a surface blob doesn't know its outside,
 * so a light reaches both faces (right for floors and walls, softer than real
 * on round things lit from behind).
 */
function blobNormal(covA: N, covB: N) {
  const a = covA.x, b = covA.y, c = covA.z, d = covA.w, e = covB.x, f = covB.y
  const c0 = vec3(d.mul(f).sub(e.mul(e)), c.mul(e).sub(b.mul(f)), b.mul(e).sub(c.mul(d))).toVar()
  const c1 = vec3(c.mul(e).sub(b.mul(f)), a.mul(f).sub(c.mul(c)), b.mul(c).sub(a.mul(e))).toVar()
  const c2 = vec3(b.mul(e).sub(c.mul(d)), b.mul(c).sub(a.mul(e)), a.mul(d).sub(b.mul(b))).toVar()
  const l0 = dot(c0, c0), l1 = dot(c1, c1), l2 = dot(c2, c2)
  const best = select(l0.greaterThan(l1), select(l0.greaterThan(l2), c0, c2), select(l1.greaterThan(l2), c1, c2))
  return normalize(best.add(vec3(0, 1e-12, 0)))
}

/**
 * The blob's color under the lights: ambient times its own, plus each light by distance and by how its face turns
 * to it, and each of the first four by how much of it the blob can see (`seen`, a byte a light). A light from a
 * direction (its reach under 0) doesn't fade with distance. A blob that gives its own light (`Actor.glow`, in the
 * covariance's spare slot) is never darker than that share of its own color, times the world's `glowGain`. CPU twin:
 * `light.ts` (change both).
 */
function lit(rgb: N, world: N, covA: N, covB: N, seen: N, L: Lighting) {
  const n = blobNormal(covA, covB).toVar()
  const sum = vec3(L.ambient).toVar()
  // only the lights in use: the loop stops at the count
  TSL.Loop(L.count, ({ i }: { i: N }) => {
    const P = L.pos.element(i), C = L.col.element(i)
    const sun = P.w.lessThan(0).toVar()
    const to = select(sun, P.xyz.mul(SUN_FAR), P.xyz.sub(world)).toVar()
    const d2 = dot(to, to).toVar()
    const r2 = P.w.mul(P.w)
    // a quarter strength at `range`, gone by twice it
    const fade = max(float(1).sub(d2.div(r2.mul(4))), 0)
    const fall = select(sun, float(1), fade.mul(fade).div(float(1).add(d2.div(r2))))
    const facing = abs(dot(n, to.mul(TSL.inverseSqrt(max(d2, 1e-6))))).mul(0.65).add(0.35)
    const sees = select(i.lessThan(4), float(seen.shiftRight(uint(i).mul(8)).bitAnd(255)).div(255), float(1))
    const reach = fall.mul(facing).mul(sees).toVar()
    const through = float(1).toVar()
    If(C.w.greaterThan(0.5).and(reach.greaterThan(0.001)), () => { through.assign(shadowMarch(world, n, to, d2, select(sun, TSL.int(SUN_MARCH), TSL.int(MAX_MARCH)), L)) })
    sum.addAssign(C.xyz.mul(reach.mul(through)))
  })
  return rgb.mul(max(sum, vec3(covB.z.mul(L.emit))))
}

/** How flat a blob is, 1 for a disc and 0 for a needle or a ball. CPU twin: `flatness` in light.ts (change both). */
function flatness(covA: N, covB: N) {
  const a = covA.x, b = covA.y, c = covA.z, d = covA.w, e = covB.x, f = covB.y
  const q = a.add(d).add(f).div(3).toVar()
  const p = sqrt(max(a.sub(q).pow2().add(d.sub(q).pow2()).add(f.sub(q).pow2()).add(b.mul(b).add(c.mul(c)).add(e.mul(e)).mul(2)).div(6), 1e-30)).toVar()
  const A = a.sub(q).div(p).toVar(), B = b.div(p).toVar(), C = c.div(p).toVar(), D = d.sub(q).div(p).toVar(), E = e.div(p).toVar(), F = f.sub(q).div(p).toVar()
  const half = A.mul(D.mul(F).sub(E.mul(E))).sub(B.mul(B.mul(F).sub(C.mul(E)))).add(C.mul(B.mul(E).sub(C.mul(D)))).div(2)
  const phi = TSL.acos(half.clamp(-1, 1)).div(3).toVar()
  const most = q.add(p.mul(2).mul(cos(phi))), least = q.add(p.mul(2).mul(cos(phi.add((2 * Math.PI) / 3)))).toVar()
  const mid = q.mul(3).sub(most).sub(least)
  return float(1).sub(smoothstep(FLAT_FULL, FLAT_NONE, sqrt(max(least, 0).div(max(mid, 1e-30)))))
}

/**
 * What cel shading cuts into tones, for one blob: how it faces the first light (0 away, 0.5 edge on, 1 toward; the
 * side the camera sees is its outside), how much the lights after the first reach it (`lampReach`: the scene's own
 * lamps, each by its brightness, distance, facing and baked lamp shadow, as in `lit`, at most `LAMP_MOST`; 1 for a blob
 * that gives its own light), and how flat it is (how far its facing can be trusted). Cast shadows of the first light
 * are `CelPass`'s own, from the light's view of the scene, never the grid of shadows. CPU twin: `toneAt` in light.ts
 * (change both).
 */
function toned(world: N, covA: N, covB: N, seen: N, L: Lighting) {
  const glows = covB.z.greaterThanEqual(0.5)
  const out = vec3(1, select(glows, float(1), float(0)), flatness(covA, covB)).toVar()
  If(L.count.greaterThan(0).and(glows.not()), () => {
    const n = blobNormal(covA, covB).toVar()
    const P = L.pos.element(0)
    const to = select(P.w.lessThan(0), P.xyz.mul(SUN_FAR), P.xyz.sub(world)).toVar()
    const out0 = select(dot(n, L.eye.sub(world)).lessThan(0), n.negate(), n)
    out.x.assign(dot(out0, to.mul(TSL.inverseSqrt(max(dot(to, to), 1e-6)))).mul(0.5).add(0.5))
    const lamps = float(0).toVar()
    TSL.Loop(L.count, ({ i }: { i: N }) => {
      const Q = L.pos.element(i), C = L.col.element(i)
      const at = Q.xyz.sub(world).toVar()
      const d2 = dot(at, at).toVar()
      const r2 = Q.w.mul(Q.w)
      const fade = max(float(1).sub(d2.div(r2.mul(4))), 0)
      const fall = fade.mul(fade).div(float(1).add(d2.div(r2)))
      const facing = abs(dot(n, at.mul(TSL.inverseSqrt(max(d2, 1e-6))))).mul(0.65).add(0.35)
      // the scene's lights come after cel shading's own, so its first four baked lamp shadows are lights 1 to 4 here
      const sees = select(i.lessThan(5), float(seen.shiftRight(uint(select(i.greaterThan(0), i.sub(1), i)).mul(8)).bitAnd(255)).div(255), float(1))
      // not the first light, which the tones are cut from, nor a light from a direction, which reaches everything
      const counts = select(i.greaterThan(0).and(Q.w.greaterThan(0)), float(1), float(0))
      lamps.addAssign(dot(C.xyz, vec3(0.2126, 0.7152, 0.0722)).mul(fall).mul(facing).mul(sees).mul(counts))
    })
    out.y.assign(min(lamps, LAMP_MOST))
  })
  return out
}

/** Whether a cell (ivec3) is inside the grid of shadows. */
function inGrid(q: N, L: Lighting) {
  const d = TSL.ivec3(L.dims)
  return q.x.greaterThanEqual(0).and(q.y.greaterThanEqual(0)).and(q.z.greaterThanEqual(0))
    .and(q.x.lessThan(d.x)).and(q.y.lessThan(d.y)).and(q.z.lessThan(d.z))
}

/** A cell's place in the grid's buffer: x fastest, then y, then z, as in shadow.ts. */
function cellIndex(q: N, L: Lighting) {
  const d = TSL.ivec3(L.dims)
  return uint(q.z.mul(d.y).add(q.y).mul(d.x).add(q.x))
}

/**
 * The share of a light that gets from a blob to it through the grid of shadows, in at most `most` steps. A march that
 * has left the grid going away from it has nothing more to meet and stops. CPU twin: `transmittance` in shadow.ts
 * (change both; the twin takes the blob's sideways `spread` as an argument, where this makes it from the blob's place).
 */
function shadowMarch(world: N, n: N, to: N, d2: N, most: N, L: Lighting) {
  const cell = L.box.w
  const dist = sqrt(max(d2, 1e-12)).toVar()
  const dir = to.div(dist).toVar()
  const side = select(dot(n, dir).lessThan(0), float(-1), float(1))
  // each blob looks from its own spot within a cell, sideways along its surface (a steady number from where it is):
  // neighbors disagree about a shadow's edge, so the edge is a soft band that slides as the light moves, not a row of
  // cells that flips at once
  const h = TSL.fract(TSL.sin(vec3(dot(world, vec3(12.9898, 78.233, 37.719)), dot(world, vec3(39.346, 11.135, 83.155)), dot(world, vec3(73.156, 52.235, 9.151)))).mul(43758.5453)).sub(0.5).toVar()
  const aside = h.sub(n.mul(dot(h, n))).mul(cell.mul(SPREAD))
  const start = world.add(n.mul(side).add(dir).mul(cell.mul(LIFT))).add(aside).toVar()
  const steps = TSL.int(floor(min(max(dist.sub(cell.mul(2.5)).div(cell), 0), float(most)))).toVar()
  const dims = TSL.ivec3(L.dims)
  const acc = float(0).toVar()
  TSL.Loop({ start: TSL.int(0), end: steps, type: 'int', condition: '<', name: 'm' }, ({ m }: { m: N }) => {
    const s = start.add(dir.mul(float(m).add(0.5).mul(cell))).sub(L.box.xyz).div(cell).toVar()
    const q = TSL.ivec3(floor(s)).toVar()
    If(inGrid(q, L), () => { acc.addAssign(float(L.grid.element(cellIndex(q, L))).div(OCC_SCALE)) })
    If(inGrid(q, L).not(), () => {
      // out of the grid and heading further out on some axis: it can't come back in
      const gone = q.x.lessThan(0).and(dir.x.lessThanEqual(0)).or(q.x.greaterThanEqual(dims.x).and(dir.x.greaterThanEqual(0)))
        .or(q.y.lessThan(0).and(dir.y.lessThanEqual(0))).or(q.y.greaterThanEqual(dims.y).and(dir.y.greaterThanEqual(0)))
        .or(q.z.lessThan(0).and(dir.z.lessThanEqual(0))).or(q.z.greaterThanEqual(dims.z).and(dir.z.greaterThanEqual(0)))
      If(gone, () => { TSL.Break() })
    })
    If(acc.greaterThan(6), () => { TSL.Break() })
  })
  return exp(acc.mul(L.density).negate())
}

/** WebGPU: empties the grid of shadows before the blobs are dropped in. */
function makeShadowClear(L: Lighting) {
  return Fn(() => {
    TSL.atomicStore(L.gridW.element(instanceIndex), uint(0))
  })().compute(SHADOW_CELLS, [WORKGROUP]).setName('SplatWorldShadowClear')
}

/** WebGPU: each blob adds how much it blocks to the cells its core touches. CPU twin: `occupancy` in shadow.ts. */
function makeShadowScatter(buf: ReturnType<typeof makeBuffers>, L: Lighting) {
  return Fn(() => {
    const i = instanceIndex
    const A = buf.covA.element(i), B = buf.covB.element(i)
    const reach = sqrt(max(max(A.x, A.w), max(B.y, 0))).mul(REACH).toVar()
    const cell = L.box.w
    const a = unpackUnorm4x8(buf.color.element(i)).a
    // a blob that gives its own light (`Actor.glow`, in the covariance's spare slot) casts no shadow
    const add = uint(floor(a.mul(min(reach.div(cell).pow2(), 1)).mul(OCC_SCALE).add(0.5)).mul(select(B.z.greaterThan(0.5), float(0), float(1)))).toVar()
    If(add.greaterThan(uint(0)), () => {
      const p = buf.worldCenter.element(i).xyz.toVar()
      const c = TSL.ivec3(floor(p.sub(L.box.xyz).div(cell))).toVar()
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const q = c.add(TSL.ivec3(dx, dy, dz)).toVar()
        const lo = L.box.xyz.add(vec3(q).mul(cell))
        const e = max(max(lo.sub(p), p.sub(lo.add(cell))), vec3(0)).toVar()
        If(inGrid(q, L).and(dot(e, e).lessThanEqual(reach.mul(reach))), () => {
          TSL.atomicAdd(L.gridW.element(cellIndex(q, L)), add)
        })
      }
    })
  })().compute(buf.count, [WORKGROUP]).setName('SplatWorldShadowScatter')
}

/** WebGPU: every blob's lit color, once a frame (after the deform, before the draw). */
function makeLight(buf: ReturnType<typeof makeBuffers>, L: Lighting, viewed: boolean) {
  return Fn(() => {
    const i = instanceIndex
    // with color by angle, `makeViewColor` has just written the blob's color for this view into the same buffer
    const color = (viewed ? L.litW.element(i) : unpackUnorm4x8(buf.color.element(i))).toVar()
    const world = buf.worldCenter.element(i).xyz.toVar()
    const own = painted(color.rgb, world, buf.edits).toVar()
    If(L.cel.greaterThan(0.5), () => {
      // cel shading: the blob's own color, a whole byte a channel, with its tone as the fraction beside each (the draw
      // may bind no more buffers than it does, so the tone rides in the same one)
      const tone = toned(world, buf.covA.element(i), buf.covB.element(i), buf.seen.element(i), L)
      L.litW.element(i).assign(vec4(floor(own.clamp(0, 1).mul(255).add(0.5)).add(tone.clamp(0, 1).mul(TONE_SHARE)), color.a))
    }).Else(() => {
      const now = vec4(lit(own, world, buf.covA.element(i), buf.covB.element(i), buf.seen.element(i), L), color.a)
      // with color by angle the buffer holds this view's color, not the last pass's light, so there is nothing to ease from
      L.litW.element(i).assign(viewed ? now : mix(L.litW.element(i), now, L.ease))
    })
  })().compute(buf.count, [WORKGROUP]).setName('SplatWorldLight')
}

/** Color by angle on the GPU: each blob's rest terms as half floats, two to a word, and where the camera is. */
interface ViewSH { terms: number; words: number; attr: StorageBufferAttribute; data: N; eye: N }

function makeSH(actors: Actor[], n: number): ViewSH {
  const terms = Math.max(...actors.map((a) => a.blobs.shTerms))
  const words = Math.ceil((terms * 3) / 2)
  const attr = new StorageBufferAttribute(new Uint32Array(n * words), 1)
  const S = { terms, words, attr, data: storage(attr, 'uint', n * words).toReadOnly(), eye: uniform(new Vector3()) }
  packSH(actors, S, attr.array as Uint32Array)
  return S
}

/** Every actor's rest terms, to the world's count of terms (an actor with fewer, or none, gets zeros for the rest). */
function packSH(actors: Actor[], S: ViewSH, out: Uint32Array) {
  out.fill(0)
  const half = DataUtils.toHalfFloat
  let i = 0
  for (const a of actors) {
    const b = a.blobs, t = b.shTerms
    for (let k = 0; k < b.count; k++, i++) {
      for (let h = 0; h < t * 3; h++) out[i * S.words + (h >> 1)] |= half(b.sh![k * t * 3 + h]) << ((h & 1) * 16)
    }
  }
}

/** The terms as the GPU holds them: rounded to half floats. */
function halves(sh: Float32Array, at: number, n: number) {
  const out = new Float32Array(n)
  for (let h = 0; h < n; h++) out[h] = DataUtils.fromHalfFloat(DataUtils.toHalfFloat(sh[at + h]))
  return out
}

/** The way from the eye to a blob, turned back into its first bone's frame. CPU twin of the first half of `viewed`. */
function blobDirection(center: Float32Array, i: number, eye: Vector3, bones: Float32Array, j: number, out: number[]) {
  let vx = center[i * 4] - eye.x, vy = center[i * 4 + 1] - eye.y, vz = center[i * 4 + 2] - eye.z
  const l = Math.hypot(vx, vy, vz) || 1
  vx /= l; vy /= l; vz /= l
  const ql = Math.hypot(bones[j + 16], bones[j + 17], bones[j + 18], bones[j + 19]) || 1
  const ux = -bones[j + 16] / ql, uy = -bones[j + 17] / ql, uz = -bones[j + 18] / ql, w = bones[j + 19] / ql
  // v + w·t + u × t, with t = 2 u × v: v turned by the bone's inverse turn
  const tx = 2 * (uy * vz - uz * vy), ty = 2 * (uz * vx - ux * vz), tz = 2 * (ux * vy - uy * vx)
  out[0] = vx + w * tx + (uy * tz - uz * ty)
  out[1] = vy + w * ty + (uz * tx - ux * tz)
  out[2] = vz + w * tz + (ux * ty - uy * tx)
}

/** The spherical harmonic basis after the first term, in the files' signs (`fileBasis` in sh.ts), as TSL. */
function fileBasisTSL(d: N, terms: number): N[] {
  const x = d.x, y = d.y, z = d.z
  const xx = x.mul(x), yy = y.mul(y), zz = z.mul(z)
  const Y = [
    y.mul(-0.4886025119029199), z.mul(0.4886025119029199), x.mul(-0.4886025119029199),
    x.mul(y).mul(1.0925484305920792), y.mul(z).mul(-1.0925484305920792), zz.mul(3).sub(1).mul(0.31539156525252005), x.mul(z).mul(-1.0925484305920792), xx.sub(yy).mul(0.5462742152960396),
    y.mul(xx.mul(3).sub(yy)).mul(-0.5900435899266435), x.mul(y).mul(z).mul(2.890611442640554), y.mul(zz.mul(5).sub(1)).mul(-0.4570457994644658),
    z.mul(zz.mul(5).sub(3)).mul(0.3731763325901154), x.mul(zz.mul(5).sub(1)).mul(-0.4570457994644658), z.mul(xx.sub(yy)).mul(1.445305721320277),
    x.mul(xx.sub(yy.mul(3))).mul(-0.5900435899266435),
  ]
  return Y.slice(0, terms)
}

/** Linear to sRGB and back, a channel at a time without branches (so GLSL and WGSL agree). */
function toSrgb(c: N) {
  return TSL.mix(TSL.pow(max(c, 0.0031308), float(1 / 2.4)).mul(1.055).sub(0.055), c.mul(12.92), TSL.step(c, float(0.0031308)))
}
function toLinear(c: N) {
  return TSL.mix(TSL.pow(c.add(0.055).div(1.055), float(2.4)), c.div(12.92), TSL.step(c, float(0.04045)))
}

/**
 * A blob's color seen from the eye (color by angle): its own color, in sRGB as files keep it, plus its terms toward
 * the blob in its first bone's frame, clamped and back to linear. CPU twin: `viewColor` in sh.ts with `blobDirection`.
 */
function viewed(rgb: N, i: N, world: N, buf: ReturnType<typeof makeBuffers>, S: ViewSH) {
  const base = uint(buf.srcCenter.element(i).w)
  const q = normalize(buf.bones.element(base.add(buf.skin.element(i.mul(buf.skinStride)).bitAnd(255)).mul(5).add(4))).toVar()
  const v = normalize(world.sub(S.eye)).toVar()
  const u = q.xyz.negate().toVar()
  const t = TSL.cross(u, v).mul(2).toVar()
  const d = v.add(t.mul(q.w)).add(TSL.cross(u, t)).toVar()
  const Y = fileBasisTSL(d, S.terms)
  const at = i.mul(S.words)
  const w = Array.from({ length: S.words }, (_, k) => TSL.unpackHalf2x16(S.data.element(at.add(k))).toVar())
  const coef = (h: number) => (h & 1 ? w[h >> 1].y : w[h >> 1].x)
  const sum = vec3(0).toVar()
  Y.forEach((y, k) => { sum.addAssign(vec3(coef(k * 3), coef(k * 3 + 1), coef(k * 3 + 2)).mul(y)) })
  return toLinear(toSrgb(rgb).add(sum).clamp(0, 1))
}

/** WebGPU: every blob's color for this view, into the color pass's buffer, which `makeLight` then lights in place. */
function makeViewColor(buf: ReturnType<typeof makeBuffers>, L: Lighting, S: ViewSH) {
  return Fn(() => {
    const i = instanceIndex
    const color = unpackUnorm4x8(buf.color.element(i)).toVar()
    L.litW.element(i).assign(vec4(viewed(color.rgb, i, buf.worldCenter.element(i).xyz, buf, S), color.a))
  })().compute(buf.count, [WORKGROUP]).setName('SplatWorldViewColor')
}

/** The blob's color after distance fog: none while the fog's far distance is 0. */
function fogged(rgb: N, depth: N, fog: Fog) {
  const span = max(fog.range.y.sub(fog.range.x), 0.0001)
  const f = select(fog.range.y.greaterThan(0), depth.sub(fog.range.x).div(span).clamp(0, 1), float(0)).toVar()
  return rgb.add(fog.color.sub(rgb).mul(f))
}

/** Cel shading packs a blob's tone beside its color as this share of the fraction, so a full tone never carries into the color. */
const TONE_SHARE = 0.98

const splatUv = () => varyingProperty('vec2', 'vSplatUv')
const splatColor = () => varyingProperty('vec4', 'vSplatColor')
/** The blob's picture color, whatever map the draw is: what `solidOutput` writes beside a map of parts. */
const splatPicture = () => varyingProperty('vec3', 'vSplatPicture')

/**
 * @internal A second output for a draw of the map of parts (`SplatWorld.parts`): the picture as hard discs in their own
 * colors, cut as the map is (what `solid` draws on its own), so one draw of every blob gives both. For a pass that
 * renders the map into a target with two textures through `renderer.setMRT`.
 */
export function solidOutput() {
  return vec4(splatPicture(), splatColor().a.mul(2).min(1))
}
/** The blob's own number, 0–1 (the same hash as `lodRank`): what makes its mark its own. */
const splatSeed = () => varyingProperty('float', 'vSplatSeed')
/** Clean cuts: this pixel's world point on the camera-facing plane through its blob's center; the center; the covariance's adjugate (xx, xy, xz and yy, yz, zz). */
const splatAt = () => varyingProperty('vec3', 'vSplatAt')
const splatMid = () => varyingProperty('vec3', 'vSplatMid')
const splatAdjA = () => varyingProperty('vec3', 'vSplatAdjA')
const splatAdjB = () => varyingProperty('vec3', 'vSplatAdjB')

/** The world point of its blob a pixel shows most of. CPU twin: `densestAlong` in edit.ts; change both. */
function densestPoint() {
  const A = splatAdjA(), B = splatAdjB()
  const dir = splatAt().sub(cameraPosition).toVar(), to = splatMid().sub(cameraPosition).toVar()
  const Ad = vec3(dot(A, dir), dot(vec3(A.y, B.x, B.y), dir), dot(vec3(A.z, B.y, B.z), dir)).toVar()
  const den = dot(dir, Ad).toVar(), dd = dot(dir, dir).toVar()
  // the covariance's trace from its adjugate is not to be had, so the test is against the adjugate's own size
  const big = abs(A.x).add(abs(B.x)).add(abs(B.z)).toVar()
  const t = select(den.greaterThan(big.mul(dd).mul(1e-6)), dot(to, Ad).div(max(den, 1e-30)), dot(dir, to).div(max(dd, 1e-30)))
  return cameraPosition.add(dir.mul(t))
}

/** How blobs are drawn as marks (`setMarks`): kind 0 is none, then `MARK_KINDS` from 1; ink and paper are linear. */
interface Marks { kind: N; size: N; soft: N; ink: N; paper: N }

/** A mark at a pixel of its blob: color (linear) and cover. CPU twin: `markAt` in splat-core/marks.ts; change both. */
function markOf(M: Marks, uv: N, seed: N, rgb: N) {
  const hash = (i: N, s: N) => fract(sin(i.mul(127.1).add(s.mul(311.7))).mul(43758.5453))
  const noise1 = (x: N, s: N) => {
    const i = floor(x).toVar(), f = x.sub(i).toVar()
    const a = hash(i, s).toVar()
    return a.add(hash(i.add(1), s).sub(a).mul(f.mul(f).mul(float(3).sub(f.mul(2)))))
  }
  const streak = (v: N, s: N, rate: number) => noise1(v.mul(rate).add(40), s).add(noise1(v.mul(-rate).add(40), s)).mul(0.5)
  const k = M.size.clamp(0.2, MARK_MOST).toVar()
  const u = uv.x, v = uv.y
  const s = streak(v.div(k), seed, 5).toVar()
  const long = k.mul(MARK_LONG).mul(s.mul(0.3).add(0.78)), wide = k.mul(MARK_WIDE)
  const d = pow(abs(u).div(long), 4).add(pow(abs(v).div(wide), 4))
  const cover = float(1).sub(smoothstep(0.8, 1, d)).toVar()
  const own = seed.sub(0.5).mul(0.12).add(1).toVar()
  const color = vec3(0).toVar()
  const dark = float(1).sub(sqrt(max(dot(rgb, vec3(0.2126, 0.7152, 0.0722)), 0)).min(1)).toVar()
  If(M.kind.lessThan(1.5), () => {
    color.assign(rgb.mul(own.mul(s.mul(0.12).add(0.94))))
  }).ElseIf(M.kind.lessThan(2.5), () => {
    const ridge = streak(v.div(k), seed.add(0.37), 9).toVar()
    color.assign(rgb.mul(own.mul(ridge.mul(0.4).add(0.8))).add(smoothstep(0.62, 0.9, ridge).mul(0.1)))
  }).ElseIf(M.kind.lessThan(3.5), () => {
    const wash = mix(M.paper, rgb, dark.mul(WASH_MOST - WASH_LEAST).add(WASH_LEAST))
    const reach = max(float(1).sub(pow(abs(u).div(k.mul(MARK_LONG * 0.95)), 2)), 0).toVar()
    const half = dark.mul(0.16).add(0.04).mul(k).mul(sqrt(reach)).mul(s.mul(0.6).add(0.7)).toVar()
    const pen = select(reach.greaterThan(0), float(1).sub(smoothstep(half.mul(0.6), half.add(0.02), abs(v))).mul(smoothstep(SHADE_FROM, SHADE_FULL, dark)), float(0))
    color.assign(mix(wash, M.ink, pen))
  }).ElseIf(M.kind.lessThan(4.5), () => {
    const line = abs(fract(abs(v).div(k.mul(0.42)).add(seed)).sub(0.5)).mul(2)
    const pen = float(1).sub(smoothstep(dark.mul(0.7), dark.mul(0.7).add(0.25), line)).mul(smoothstep(0.06, 0.2, dark))
    color.assign(mix(M.paper, M.ink, pen))
  }).ElseIf(M.kind.lessThan(5.5), () => {
    // flat: all of the blob's disc in its own color
    color.assign(rgb)
    cover.assign(select(exp(dot(uv, uv).mul(-0.5)).lessThan(FLAT_CUT), float(0), float(1)))
  }).Else(() => {
    // stipple (`stippleAt`): pen dots on a grid on the blob, nudged, kept by a hash of where they are, more the darker
    const step = k.mul(DOT_STEP).toVar()
    const i = TSL.round(u.div(step)).toVar(), j = TSL.round(v.div(step)).toVar()
    const du = u.div(step).sub(i).sub(sin(i.mul(1.7).add(j.mul(2.3))).mul(0.15))
    const dv = v.div(step).sub(j).sub(sin(i.mul(2.9).sub(j.mul(1.3))).mul(0.15))
    const keep = hash(i.mul(i).add(j.mul(j).mul(7)).add(i.mul(j).mul(3)), seed).lessThan(smoothstep(0.04, 0.9, dark))
    const r = dark.mul(DOT_R[1]).add(DOT_R[0]).toVar()
    const pen = select(keep, float(1).sub(smoothstep(r.mul(0.7), r, vec2(du, dv).length())), float(0))
    color.assign(mix(M.paper, M.ink, pen))
  })
  return vec4(color, cover)
}

/**
 * A quad around the blob, only as big as it is visible: a faint blob fades
 * below 1/255 sooner than two standard deviations out, so its quad shrinks and
 * covers fewer pixels.
 */
function placeQuad(ndc: N, axes: N, tilt: N, rgba: N, idx: N, flat: Flat, picture: N, cut?: { covA: N; covB: N }) {
  const seed = lodRankNode(idx).toVar()
  splatPicture().assign(picture)
  splatSeed().assign(seed)
  const alpha = rgba.a
  const reach = sqrt(max(TSL.log(alpha.mul(255)).mul(2), 0)).min(2).toVar()
  const uv = positionGeometry.xy.mul(reach).toVar()
  splatUv().assign(uv)
  // how much nearer or further this corner is than the blob's middle, along the blob's own slope, and no further than the blob reaches
  const most = tilt.z.mul(2 / MARK_LIFT)
  const slope = tilt.x.mul(uv.x).add(tilt.y.mul(uv.y)).toVar()
  // a sloped depth map (`depthSloped`): this corner's own depth in front of the camera, from its screen depth as in `makeVertexWebGPU`
  const own = cameraProjectionMatrix[3].z.div(ndc.z.add(slope.clamp(most.negate(), most)).add(cameraProjectionMatrix[2].z)).sub(flat.base)
  splatColor().assign(vec4(select(flat.mode.greaterThan(1.5).and(flat.mode.lessThan(2.5)).and(flat.slope.greaterThan(0.5)), vec3(own), rgba.rgb), rgba.a))
  const at = ndc.xy.add(axes.xy.mul(uv.x)).add(axes.zw.mul(uv.y)).toVar()
  if (cut) {
    // clean cuts: the fragment finds where on the blob its line of sight is densest (edit.ts `densestAlong`). It gets
    // this corner's point on the plane through the blob's center that faces the camera (which is exact between
    // corners, where the densest point itself is not), the center, and the covariance's adjugate
    const unproject = (p: N) => { const v = cameraProjectionMatrixInverse.mul(vec4(p, 1)).toVar(); return cameraWorldMatrix.mul(vec4(v.xyz.div(v.w), 1)).xyz }
    const a = cut.covA.x, b = cut.covA.y, c = cut.covA.z, d = cut.covA.w, e = cut.covB.x, f = cut.covB.y
    splatAt().assign(unproject(vec3(at, ndc.z)))
    splatMid().assign(unproject(ndc.xyz))
    splatAdjA().assign(vec3(d.mul(f).sub(e.mul(e)), c.mul(e).sub(b.mul(f)), b.mul(e).sub(c.mul(d))))
    splatAdjB().assign(vec3(a.mul(f).sub(c.mul(c)), b.mul(c).sub(a.mul(e)), a.mul(d).sub(b.mul(b))))
  }
  // each corner at its own depth on the blob, so blobs that lie in one plane are at one depth wherever they overlap,
  // and a small lift by the blob's seed settles which of them is on top there: the same one from every side. It
  // matters only to marks, which write depth (`setMarks`)
  return vec4(at, ndc.z.add(slope).add(tilt.z.mul(seed.sub(0.5))), 1)
}

/** Which map the draw is (0 the picture, 1 parts, 2 depth, 3 tones, 4 how the blobs lie, 5 dither steps), where a depth map's depths are counted from, and whether each blob's depth follows its own slope. */
interface Flat { mode: N; base: N; slope: N }

/**
 * A blob's part word as four bytes, 0–1: part number (red, green), actor (blue) and dither step (alpha). Taken apart
 * by shifts, not `unpackUnorm4x8`, which on the WebGL backend gave the wrong low byte once the top byte was set.
 */
function unpackPart(word: N) {
  const w = uint(word).toVar()
  return vec4(float(w.bitAnd(uint(255))), float(w.shiftRight(uint(8)).bitAnd(uint(255))), float(w.shiftRight(uint(16)).bitAnd(uint(255))), float(w.shiftRight(uint(24)).bitAnd(uint(255)))).div(255)
}

/** What a blob draws as: its picture color, its part's flat color (map of parts), its depth (depth map) its tone (map of tones), how it lies (`lieMap`), its dither step (`ranks`) or its picture color as a hard disc (`solid`). */
function flatColor(flat: Flat, part: N, depth: N, picture: N, tone: N, axes: N) {
  return select(flat.mode.greaterThan(5.5), picture, select(flat.mode.greaterThan(4.5), vec3(part.a, 0, 0), flatOf(flat, part.rgb, depth, picture, tone, axes)))
}
function flatOf(flat: Flat, part: N, depth: N, picture: N, tone: N, axes: N) {
  return select(flat.mode.greaterThan(3.5), lieOf(axes), select(flat.mode.greaterThan(2.5), tone, select(flat.mode.greaterThan(1.5), vec3(depth.sub(flat.base)), select(flat.mode.greaterThan(0.5), part, picture))))
}

/** How a blob lies on the screen, as a color, from its two screen axes (NDC): `lieColor` in splat-core/glyphs.ts is the CPU twin (change both). */
function lieOf(axes: N) {
  const a = axes.xy.mul(cameraViewport.zw).toVar(), b = axes.zw.mul(cameraViewport.zw).toVar()
  const la = dot(a, a), lb = dot(b, b)
  const long = select(la.greaterThanEqual(lb), a, b).toVar()
  const l2 = max(la, lb).max(1e-12), s2 = min(la, lb)
  // how much longer than wide: nothing under `LIE_FROM`, all of it from `LIE_FULL`
  const t = float(1).sub(sqrt(s2.div(l2))).sub(LIE_FROM).div(LIE_FULL - LIE_FROM).clamp(0, 1).toVar()
  const e = t.mul(t).mul(float(3).sub(t.mul(2)))
  // twice the angle, so a line and the same line turned end for end are one color
  const c = long.x.mul(long.x).sub(long.y.mul(long.y)).div(l2), sn = long.x.mul(long.y).mul(2).div(l2)
  return vec3(c.mul(e).mul(0.5).add(0.5), sn.mul(e).mul(0.5).add(0.5), e)
}

function makeVertexWebGPU(buf: ReturnType<typeof makeBuffers>, sort: Sorter, fog: Fog, flat: Flat, L?: Lighting, clean = false) {
  return Fn(() => {
    const idx = sort.orderRead.element(instanceIndex).toVar()
    const A = buf.splatA.element(idx).toVar()
    // lit: the light pass's color, in place of the packed one (so the draw binds no more buffers than before)
    const color = (L ? L.lit.element(idx) : unpackUnorm4x8(buf.color.element(idx))).toVar()
    // cel shading: the light pass left the blob's own color in whole bytes and its tone in the fractions
    const tone = vec3(1).toVar()
    if (L) If(L.cel.greaterThan(0.5), () => {
      tone.assign(fract(color.rgb).div(TONE_SHARE).min(1))
      color.rgb.assign(floor(color.rgb).div(255))
    })
    // depth in front of the camera from the screen depth the project pass wrote, so the draw binds no extra buffer:
    // ndc z = −(P22·z + P32) / z for a perspective camera, so −z = P32 / (ndc z + P22)
    const depth = cameraProjectionMatrix[3].z.div(A.z.add(cameraProjectionMatrix[2].z))
    const part = unpackPart(buf.part.element(idx))
    const picture = fogged(color.rgb, depth, fog).toVar()
    return placeQuad(A.xyz, buf.splatB.element(idx), buf.splatC.element(idx).xyz, vec4(flatColor(flat, part, depth, picture, tone, buf.splatB.element(idx)), color.a.mul(A.w)), idx, flat, picture, clean ? { covA: buf.covA.element(idx), covB: buf.covB.element(idx) } : undefined)
  })()
}

/** WebGL has no compute: each corner moves its blob through the bones and projects it, like a skinned mesh. */
function makeVertexWebGL(buf: ReturnType<typeof makeBuffers>, sort: Sorter, mode: SkinMode, fog: Fog, flat: Flat, clip: N, L?: Lighting, S?: ViewSH, clean = false) {
  return Fn(() => {
    const idx = sort.orderRead.element(instanceIndex).toVar()
    const d = deformBlob(buf, idx, mode)
    const p = projectSplat(d.world, d.covA, d.covB, cameraViewMatrix, cameraProjectionMatrix, cameraViewport.zw, clip)
    const color = unpackUnorm4x8(buf.color.element(idx)).toVar()
    const own = S ? viewed(color.rgb, idx, d.world, buf, S) : color.rgb
    let rgb = own
    const tone = vec3(1).toVar()
    if (L) {
      // the light is worked out outside any branch and picked with a select: with `lit` in the Else of an If on `cel`
      // (and a second march through the grid of shadows in `toned`), Day and Night lost its shadows on WebGL
      const mine = painted(own, d.world, buf.edits)
      // cel shading: the blob keeps its own color, and its tone goes to the map of tones
      rgb = select(L.cel.greaterThan(0.5), mine, lit(mine, d.world, d.covA, d.covB, buf.seen.element(idx), L))
      If(L.cel.greaterThan(0.5), () => { tone.assign(toned(d.world, d.covA, d.covB, buf.seen.element(idx), L)) })
    }
    const part = unpackPart(buf.part.element(idx))
    const picture = fogged(rgb, p.depth, fog).toVar()
    return placeQuad(p.ndc, p.axes, p.tilt, vec4(flatColor(flat, part, p.depth, picture, tone, p.axes), color.a.mul(p.alphaScale)), idx, flat, picture, clean ? d : undefined)
  })()
}

function makeFragment(flat: N, M: Marks, E?: Edits) {
  return Fn(() => {
    const uv = splatUv()
    const r2 = dot(uv, uv).toVar()
    If(r2.greaterThan(4), () => { Discard() })
    // clean cuts: this pixel of the blob is in or out on its own
    if (E) If(E.clean.greaterThan(0.5).and(E.count.greaterThan(0)), () => {
      If(editsAt(E, densestPoint()).keep.lessThan(0.5), () => { Discard() })
    })
    const out = vec4(0).toVar()
    // marks: paint in the mark's shape, not a soft dot (the picture only: maps of parts and depth stay discs)
    If(M.kind.greaterThan(0.5).and(flat.lessThan(0.5)), () => {
      const m = markOf(M, uv, splatSeed(), splatColor().rgb).toVar()
      // all of a mark or none of it: a soft edge would write its depth too, and hide what should show under it
      const cover = select(M.soft.greaterThan(0.5), m.a, select(m.a.lessThan(MARK_CUT), float(0), float(1)))
      const a = cover.mul(splatColor().a.mul(MARK_SOLID).min(1)).toVar()
      If(a.lessThan(1 / 255), () => { Discard() })
      out.assign(vec4(m.rgb, a))
    }).Else(() => {
      const alpha = exp(r2.mul(-0.5)).mul(splatColor().a).toVar()
      // a map of parts: all of the blob or none of it, so the nearest part's color is left whole
      If(flat.greaterThan(0), () => {
        // well out from the middle, so the discs of one surface close up and nothing behind shows between them
        If(alpha.lessThan(PART_CUT), () => { Discard() })
        // a hard disc of the picture (`solid`) keeps a faint blob faint, so a fading spark is not drawn whole
        alpha.assign(select(flat.greaterThan(5.5), splatColor().a.mul(2).min(1), float(1)))
      })
      out.assign(vec4(splatColor().rgb, alpha))
    })
    return out
  })()
}
