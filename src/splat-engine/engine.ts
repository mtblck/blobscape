import {
  BufferAttribute, DynamicDrawUsage, InstancedBufferGeometry, Matrix4, Mesh, NodeMaterial, Sphere, StorageBufferAttribute, Vector2, Vector3, Vector4,
  type Camera, type Renderer,
} from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import type { Blobs } from '../splat-core/blobs.ts'

// TSL's typings model each node type closely, and the shader code below mixes
// them freely (as three.js's own JavaScript does), so the node functions are
// used untyped here. Everything outside the shader builders stays typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const {
  Discard, EPSILON, Fn, If, atan, cameraProjectionMatrix, cameraViewport, cameraViewMatrix, cos, dot, exp, float, instanceIndex,
  abs, floor, length, max, min, normalize, positionGeometry, select, sin, sqrt, storage, uint, uniform, uniformArray, unpackUnorm4x8, varyingProperty, vec2, vec3, vec4,
} = TSL
import { packWeights, skinBlob, skinCenters, type Skeleton, type Skin, type SkinMode } from './rig.ts'
import { DepthSort } from './sort.ts'
import { detailFor, lodRank, screenRadius, type DetailRule } from './lod.ts'
import { MAX_EDITS, editAt, type ShapeEdit } from './edit.ts'
import { LIFT, MAX_MARCH, OCC_SCALE, REACH, SHADOW_CELLS, SHADOW_DENSITY, blobSigma, occupancy, shadowBox } from './shadow.ts'
import { srgbToLinear } from '../splat-core/color.ts'

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
  blobs: Blobs
  skin: Skin
  skeleton: Skeleton
  /** Which part of the actor each blob belongs to (as `buildBody` and `voxelBody` give it): what `SplatWorld.parts` draws. Left out, the actor is one part. */
  partOf?: ArrayLike<number>
}

const WORKGROUP = 256
/** In a map of parts, a blob is solid out to where it has faded to this. */
const PART_CUT = 0.15
const KERNEL_2D = 0.3
const MAX_SPLAT_PX = 1024
const CLIP_XY = 1.4

export interface EngineOptions {
  /** Depth buckets for the sort. More buckets, fewer ties between blobs that are close in depth. */
  bins?: number
  mode?: SkinMode
  /** Live lights (`setLights`): each blob is lit every frame from its normal. Off unless asked for, as it costs a pass. */
  lights?: boolean
  /** Paint edits (`setEdits` with op 'paint'): needs the same color pass as lights. Cuts work without it. */
  paint?: boolean
}

/** A point light for `setLights`. */
export interface PointLight {
  position: [number, number, number]
  /** Linear RGB, times its strength: [1, 0.6, 0.3] is a torch at full strength. */
  color: [number, number, number]
  /** Its reach: about a quarter strength at this distance, and gone by twice it. */
  range: number
  /** Whether it casts shadows (`shadow.ts`): blobs between a blob and the light take some of it. Off unless set. */
  shadow?: boolean
}

/** How many lights `setLights` takes; the rest are dropped. */
export const MAX_LIGHTS = 16

export class SplatWorld extends Mesh {
  readonly isSplatWorld = true
  readonly count: number
  readonly actors: Actor[]
  readonly boneCount: number
  mode: SkinMode
  /** Set by the WebGL backend path, read by tests: did the last frame skin on the CPU? */
  cpuPath = false
  /** Milliseconds the CPU spent in the last frame (WebGL path only): moving centers, sorting, both. */
  cpuMs = 0
  cpuSkinMs = 0
  cpuSortMs = 0
  /** While true, rendering draws the last frame's blobs without moving or sorting them (for timing the draw alone, and for a second draw of the same frame such as the map of parts). */
  hold = false
  private readonly flat = uniform(0)
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
  private readonly sort: DepthSort
  private readonly deformNodes: Record<SkinMode, ReturnType<typeof makeDeform>>
  private readonly projectNode: ReturnType<typeof makeProject>
  private readonly cam: CameraUniforms
  private readonly bins: number
  private readonly cpuCenters: Float32Array
  private builtFor = ''
  private posed = false
  private bonesDirty = true
  private lastSortKey = ''
  private readonly size = new Vector2()
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
  private shadowNodes?: { clear: ReturnType<typeof makeShadowClear>; scatter: ReturnType<typeof makeShadowScatter> }
  /** Whether any light in use casts shadows. */
  private casting = false
  /** WebGL only: each blob's reach and opacity at rest, for building the grid of shadows on the CPU. */
  private restSigma?: Float32Array
  private restOpacity?: Float32Array
  private lightsDirty = true

  constructor(actors: Actor[], { bins = 65536, mode = 'quat', lights = false, paint = false }: EngineOptions = {}) {
    const count = actors.reduce((s, a) => s + a.blobs.count, 0)
    const geometry = new InstancedBufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3))
    geometry.setIndex([0, 1, 2, 0, 2, 3])
    geometry.instanceCount = count

    const boneOffset: number[] = []
    let bones = 0
    for (const a of actors) { boneOffset.push(bones); bones += a.skeleton.count }
    const buf = makeBuffers(actors, boneOffset, count, bones)
    const sort = new DepthSort(count, bins, WORKGROUP)
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
    this.cam = { view: uniform(new Matrix4()), proj: uniform(new Matrix4()), viewport: uniform(new Vector2(1, 1)), depthRange: uniform(new Vector2(0, 1)) }
    this.fog = { color: uniform(new Vector3(0, 0, 0)), range: uniform(new Vector2(0, 0)) }
    this.projectNode = makeProject(buf, sort, this.cam, bins)
    if (lights || paint) {
      this.lighting = makeLighting(buf.count)
      buf.attrs.push(this.lighting.attr)
      this.lightNode = makeLight(buf, this.lighting)
      buf.attrs.push(this.lighting.gridAttr)
      this.shadowNodes = { clear: makeShadowClear(this.lighting), scatter: makeShadowScatter(buf, this.lighting) }
    }
    material.colorNode = makeFragment(this.flat) as never

    this.onBeforeRender = (renderer, _scene, camera) => this.prepare(renderer as unknown as Renderer, camera)
  }

  /** Fades blobs to `color` (linear RGB, 0–1) between `near` and `far` units from the camera; `far` 0 turns it off. */
  setFog(color: [number, number, number], near: number, far: number) {
    this.fog.color.value.set(color[0], color[1], color[2])
    this.fog.range.value.set(near, far)
  }

  /**
   * Lights the blobs with up to MAX_LIGHTS point lights, on top of `ambient`
   * times their own (baked) color. Each blob's normal is its flattest axis, so
   * a light reaches the side of a surface that faces it. Needs `lights: true`.
   */
  setLights(lights: PointLight[], ambient = 1) {
    const L = this.lighting
    if (!L) return
    L.ambient.value = ambient
    L.count.value = Math.min(MAX_LIGHTS, lights.length)
    this.lightsDirty = true
    for (let k = 0; k < MAX_LIGHTS; k++) {
      const l = lights[k]
      ;(L.pos.array[k] as Vector4).set(l?.position[0] ?? 0, l?.position[1] ?? 0, l?.position[2] ?? 0, l ? Math.max(1e-3, l.range) : 1)
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
      const kind = e ? (e.shape === 'box' ? 1 : 0) + (e.op === 'paint' ? 2 : 0) + (e.outside ? 4 : 0) : 0
      const c = (e?.color ?? [1, 1, 1]).map(srgbToLinear)
      ;(E.a.array[k] as Vector4).set(e?.center[0] ?? 0, e?.center[1] ?? 0, e?.center[2] ?? 0, kind)
      ;(E.b.array[k] as Vector4).set(e?.size[0] ?? 0, e?.size[1] ?? 0, e?.size[2] ?? 0, Math.max(0, e?.soft ?? 0))
      ;(E.c.array[k] as Vector4).set(c[0], c[1], c[2], Math.max(0, Math.min(1, e?.amount ?? 1)))
    }
    this.bonesDirty = true
    this.lightsDirty = true
  }
  private edits: ShapeEdit[] = []

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
      material.vertexNode = makeVertexWebGL(this.buf, this.sort, this.mode, this.fog, this.flat, this.lighting) as never
    } else {
      material.vertexNode = makeVertexWebGPU(this.buf, this.sort, this.fog, this.flat, this.lighting) as never
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
    return `${e.join(',')}|${camera.projectionMatrix.elements.join(',')}|${this.size.x}x${this.size.y}`
  }

  private prepare(renderer: Renderer, camera: Camera) {
    if (this.hold) return
    const webgl = this.isWebGL(renderer)
    this.cpuPath = webgl
    this.build(webgl)
    let deformed = this.bonesDirty || !this.posed
    if (deformed) {
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
      if (deformed) skinCenters(this.buf.srcCenterData, this.buf.skinWords, this.buf.boneData, this.count, this.cpuCenters)
      if (deformed && this.casting) this.shadowGridCPU()
      const t1 = performance.now()
      if (needsSort) this.sortCPU()
      const t2 = performance.now()
      this.cpuSkinMs = t1 - t0
      this.cpuSortMs = t2 - t1
      this.cpuMs = t2 - t0
    } else {
      if (deformed) this.deform(renderer)
      if (deformed && this.casting && this.shadowNodes) {
        this.placeShadowBox()
        renderer.compute(this.shadowNodes.clear as never)
        renderer.compute(this.shadowNodes.scatter as never)
      }
      // lights move on their own: the lit colors are redone whenever they or the blobs moved
      if (this.lightNode && (deformed || this.lightsDirty)) { renderer.compute(this.lightNode as never); this.lightsDirty = false }
      if (needsSort) this.project(renderer)
    }
    this.posed = true
    this.bonesDirty = false
    this.lastSortKey = key
  }

  /** Lays the grid of shadows over the world's bounds as they are this frame. */
  private placeShadowBox() {
    // each bone's box at rest, carried by its matrix: the middle moves, the half sizes go through |M|
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
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
    const b = shadowBox(lo, hi)
    const L = this.lighting!
    L.box.value.set(b.origin[0], b.origin[1], b.origin[2], b.cell)
    L.dims.value.set(b.dims[0], b.dims[1], b.dims[2])
    return b
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
          this.restOpacity[i] = b.opacity[k]
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
      opacity[i] = Math.round(a.blobs.opacity[k] * 255) / 255
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
      deform: () => { this.uploadBones(); this.updateBounds(); this.deform(renderer); if (this.lightNode) renderer.compute(this.lightNode as never) },
      project: () => { this.setView(renderer, camera); renderer.compute(this.projectNode as never) },
      order: () => this.sort.order(renderer as never),
    }
  }

  private deform(renderer: Renderer) { renderer.compute(this.deformNodes[this.mode] as never) }
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
      const { blobs, skin, skeleton } = this.actors[a]
      const drop = this.drop[a]
      for (let k = 0; k < blobs.count; k++, i++) {
        const word = this.buf.skinWords[i * 2 + 1]
        for (let j = 0; j < 4; j++) w[j] = ((word >>> (j * 8)) & 255) / 255
        skinBlob(
          blobs.center.subarray(k * 3, k * 3 + 3), blobs.scale.subarray(k * 3, k * 3 + 3), blobs.quat.subarray(k * 4, k * 4 + 4),
          skin.joints.subarray(k * 4, k * 4 + 4), w, skeleton, this.mode, center, i * 4, cov, i * 6,
        )
        center[i * 4 + 3] = 1
        // level of detail, as the GPU does it: left out (no size), or grown to cover for those that are
        let f = lodRank(i) < drop ? 0 : 1 / Math.max(1 - drop, 1e-4)
        // shape edits, as the GPU does them: a cut blob has no size
        if (this.edits.length && !editAt(this.edits, center.subarray(i * 4, i * 4 + 3)).keep) f = 0
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

  /** Reads back the GPU sort and checks it: every blob drawn once, farthest first. */
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
  view: any; proj: any; viewport: any; depthRange: any
}

function bump(a: StorageBufferAttribute) {
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
  packBlobs(actors, boneOffset, center, scale, quat, color)
  let i = 0
  actors.forEach((a, ai) => {
    const { blobs, skin } = a
    for (let k = 0; k < blobs.count; k++, i++) {
      const p = Math.min(65535, (a.partOf?.[k] ?? 0) + 1), who = Math.min(255, ai + 1)
      part[i] = ((p & 255) | ((p >> 8) << 8) | (who << 16)) >>> 0
      skinWords[i * 2] = (skin.joints[k * 4] | (skin.joints[k * 4 + 1] << 8) | (skin.joints[k * 4 + 2] << 16) | (skin.joints[k * 4 + 3] << 24)) >>> 0
      skinWords[i * 2 + 1] = packWeights(skin.weights, k * 4)
    }
  })
  const attr = (a: Float32Array | Uint32Array, size: number) => new StorageBufferAttribute(a, size)
  const centerAttr = attr(center, 4), scaleAttr = attr(scale, 4), quatAttr = attr(quat, 4)
  const colorAttr = attr(color, 1), skinAttr = attr(skinWords, 1), partAttr = attr(part, 1)
  const boneData = new Float32Array(Math.max(1, bones) * 20)
  const boneAttr = new StorageBufferAttribute(boneData, 4)
  boneAttr.setUsage(DynamicDrawUsage)
  const worldCenterAttr = new StorageBufferAttribute(new Float32Array(n * 4), 4)
  const covAAttr = new StorageBufferAttribute(new Float32Array(n * 4), 4)
  const covBAttr = new StorageBufferAttribute(new Float32Array(n * 4), 4)
  // what the project pass writes: screen center, depth and opacity factor; the two screen axes
  const splatAAttr = new StorageBufferAttribute(new Float32Array(n * 4), 4)
  const splatBAttr = new StorageBufferAttribute(new Float32Array(n * 4), 4)
  return {
    count: n,
    /** Every GPU buffer, so dispose can free them. */
    attrs: [centerAttr, scaleAttr, quatAttr, colorAttr, partAttr, skinAttr, boneAttr, worldCenterAttr, covAAttr, covBAttr, splatAAttr, splatBAttr],
    skinWords, srcCenterData: center,
    boneData, boneAttr, worldCenterAttr, covAAttr, covBAttr, colorAttr, centerAttr, scaleAttr, quatAttr,
    srcCenter: storage(centerAttr, 'vec4', n).toReadOnly(),
    srcScale: storage(scaleAttr, 'vec4', n).toReadOnly(),
    srcQuat: storage(quatAttr, 'vec4', n).toReadOnly(),
    skin: storage(skinAttr, 'uint', n * 2).toReadOnly(),
    bones: storage(boneAttr, 'vec4', Math.max(1, bones) * 5).toReadOnly(),
    color: storage(colorAttr, 'uint', n).toReadOnly(),
    edits: makeEdits(),
    part: storage(partAttr, 'uint', n).toReadOnly(),
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
    webgl: false,
  }
}

/** On WebGL, storage is read through textures that the CPU fills; the draw reads the blobs' rest data and the bones. */
function enableWebGL(buf: ReturnType<typeof makeBuffers>, sort: DepthSort) {
  if (buf.webgl) return
  for (const r of [buf.srcCenter, buf.srcScale, buf.srcQuat, buf.skin, buf.bones, buf.color, buf.part]) (r as unknown as { setPBO: (b: boolean) => void }).setPBO(true)
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

interface Edits { a: N; b: N; c: N; count: N }

function makeEdits(): Edits {
  const v = () => uniformArray(Array.from({ length: MAX_EDITS }, () => new Vector4()), 'vec4')
  // a: middle and kind (1 box, +2 paint, +4 outside); b: size and soft edge; c: paint (linear) and amount
  return { a: v(), b: v(), c: v(), count: uniform(0, 'int') }
}

/** What the shape edits do at p: `keep` 0 or 1, and the paint (premultiplied by `amount`). CPU twin: `editAt` in edit.ts. */
function editsAt(E: Edits, p: N) {
  const keep = float(1).toVar(), paint = vec3(0).toVar(), amount = float(0).toVar()
  TSL.Loop({ start: TSL.int(0), end: E.count, type: 'int', condition: '<', name: 'e' }, ({ e }: { e: N }) => {
    const A = E.a.element(e), B = E.b.element(e), C = E.c.element(e)
    const kind = A.w.toVar()
    const q = p.sub(A.xyz).toVar()
    const d = abs(q).sub(B.xyz).toVar()
    const boxD = length(max(d, vec3(0))).add(min(max(d.x, max(d.y, d.z)), 0))
    const isBox = TSL.mod(kind, 2).greaterThan(0.5)
    const isPaint = TSL.mod(floor(kind.div(2)), 2).greaterThan(0.5)
    const sd = select(isBox, boxD, length(q).sub(B.x)).mul(select(kind.greaterThanEqual(4), float(-1), float(1))).toVar()
    If(isPaint.not(), () => {
      If(sd.lessThan(0), () => { keep.assign(0) })
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

/** One blob through its bones: world center and the six covariance terms, as `skinBlob` does on the CPU. */
function deformBlob(buf: ReturnType<typeof makeBuffers>, i: N, mode: SkinMode) {
  const src = buf.srcCenter.element(i).toVar()
  const base = uint(src.w).toVar()
  const jw = buf.skin.element(i.mul(2)).toVar()
  const w = unpackUnorm4x8(buf.skin.element(i.mul(2).add(1))).toVar()
  const js = [0, 8, 16, 24].map((s) => base.add(jw.shiftRight(s).bitAnd(255)).mul(5).toVar())
  const ws = [w.x, w.y, w.z, w.w]
  const col = (k: number, c: number) => buf.bones.element(js[k].add(c))
  const c0 = vec3(0).toVar(), c1 = vec3(0).toVar(), c2 = vec3(0).toVar(), c3 = vec3(0).toVar()
  const Q = vec4(0).toVar()
  const S = float(0).toVar()
  const drop = float(0).toVar()
  const q0 = col(0, 4).toVar()
  for (let k = 0; k < 4; k++) {
    const wk = ws[k]
    const a0 = col(k, 0).xyz
    // every bone of an actor carries the same share dropped in its matrix's spare slot, so the blend is that share
    drop.addAssign(col(k, 0).w.mul(wk))
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

  const s = buf.srcScale.element(i).xyz.toVar()
  const lq = normalize(buf.srcQuat.element(i)).toVar()
  let A: N[]
  if (mode === 'quat') {
    const q = quatMul(normalize(Q), lq).toVar()
    const R = quatColumns(q as never)
    A = [R[0].mul(s.x.mul(S)), R[1].mul(s.y.mul(S)), R[2].mul(s.z.mul(S))]
  } else {
    const R = quatColumns(lq as never)
    const blend = (v: N) => c0.mul(v.x).add(c1.mul(v.y)).add(c2.mul(v.z))
    A = [blend(R[0]).mul(s.x), blend(R[1]).mul(s.y), blend(R[2]).mul(s.z)]
  }
  const a0 = A[0].toVar(), a1 = A[1].toVar(), a2 = A[2].toVar()
  const e = (r: 'x' | 'y' | 'z', c: 'x' | 'y' | 'z') => a0[r].mul(a0[c]).add(a1[r].mul(a1[c])).add(a2[r].mul(a2[c]))
  // level of detail (lod.ts): a blob ranked under the share dropped has no size, and is culled where it is projected;
  // the rest grow to cover for it
  const f = select(lodRankNode(i).lessThan(drop), float(0), float(1).div(max(float(1).sub(drop), 0.0001))).toVar()
  // shape edits: a cut blob has no size either
  f.mulAssign(editsAt(buf.edits, world).keep)
  return { world, covA: vec4(e('x', 'x'), e('x', 'y'), e('x', 'z'), e('y', 'y')).mul(f).toVar(), covB: vec4(e('y', 'z'), e('z', 'z'), 0, 0).mul(f).toVar() }
}

function makeDeform(buf: ReturnType<typeof makeBuffers>, mode: SkinMode) {
  return Fn(() => {
    const i = instanceIndex
    const d = deformBlob(buf, i, mode)
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
 * blob's distance in front of the camera.
 */
function projectSplat(center: N, covA: N, covB: N, view: N, proj: N, viewport: N) {
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
    .or(centerClip.y.abs().greaterThan(lim)), () => {
    alphaScale.assign(0)
  })
  const ndc = centerClip.xyz.div(max(w, 0.0001)).toVar()
  return { ndc, axes: vec4(ax1, ax2), alphaScale, depth: viewCenter.z.negate() }
}

/** WebGPU: project every blob once (not once per corner), and write its sort key. */
function makeProject(buf: ReturnType<typeof makeBuffers>, sort: DepthSort, cam: CameraUniforms, bins: number) {
  const bins1 = bins - 1
  return Fn(() => {
    const i = instanceIndex
    const p = projectSplat(buf.worldCenter.element(i).xyz, buf.covA.element(i), buf.covB.element(i), cam.view, cam.proj, cam.viewport)
    buf.splatAW.element(i).assign(vec4(p.ndc, p.alphaScale))
    buf.splatBW.element(i).assign(p.axes)
    const span = max(cam.depthRange.y.sub(cam.depthRange.x), 0.0001)
    const t = p.depth.sub(cam.depthRange.x).div(span).clamp(0, 1)
    const key = uint(bins1).sub(uint(t.mul(bins1))).toVar()
    sort.keysW.element(i).assign(key)
    TSL.atomicAdd(sort.histogram.element(key), uint(1))
  })().compute(buf.count, [WORKGROUP]).setName('SplatWorldProject')
}

interface Fog { color: N; range: N }

interface Lighting { pos: N; col: N; ambient: N; count: N; attr: StorageBufferAttribute; litW: N; lit: N; gridAttr: StorageBufferAttribute; gridW: N; grid: N; box: N; dims: N }

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
    ambient: uniform(1),
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

/** The blob's color under the lights: ambient times its own, plus each light by distance and by how its face turns to it. CPU twin: `light.ts` (change both). */
function lit(rgb: N, world: N, covA: N, covB: N, L: Lighting) {
  const n = blobNormal(covA, covB).toVar()
  const sum = vec3(L.ambient).toVar()
  // only the lights in use: the loop stops at the count
  TSL.Loop(L.count, ({ i }: { i: N }) => {
    const P = L.pos.element(i), C = L.col.element(i)
    const to = P.xyz.sub(world).toVar()
    const d2 = dot(to, to).toVar()
    const r2 = P.w.mul(P.w)
    // a quarter strength at `range`, gone by twice it
    const fade = max(float(1).sub(d2.div(r2.mul(4))), 0)
    const fall = fade.mul(fade).div(float(1).add(d2.div(r2)))
    const facing = abs(dot(n, to.mul(TSL.inverseSqrt(max(d2, 1e-6))))).mul(0.65).add(0.35)
    const reach = fall.mul(facing).toVar()
    const through = float(1).toVar()
    If(C.w.greaterThan(0.5).and(reach.greaterThan(0.001)), () => { through.assign(shadowMarch(world, n, to, d2, L)) })
    sum.addAssign(C.xyz.mul(reach.mul(through)))
  })
  return rgb.mul(sum)
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

/** The share of a light that gets from a blob to it through the grid of shadows. CPU twin: `transmittance` in shadow.ts (change both). */
function shadowMarch(world: N, n: N, to: N, d2: N, L: Lighting) {
  const cell = L.box.w
  const dist = sqrt(max(d2, 1e-12)).toVar()
  const dir = to.div(dist).toVar()
  const side = select(dot(n, dir).lessThan(0), float(-1), float(1))
  const start = world.add(n.mul(side).add(dir).mul(cell.mul(LIFT))).toVar()
  const steps = TSL.int(floor(min(max(dist.sub(cell.mul(2.5)).div(cell), 0), MAX_MARCH))).toVar()
  const acc = float(0).toVar()
  TSL.Loop({ start: TSL.int(0), end: steps, type: 'int', condition: '<', name: 'm' }, ({ m }: { m: N }) => {
    const q = TSL.ivec3(floor(start.add(dir.mul(float(m).add(0.5).mul(cell))).sub(L.box.xyz).div(cell))).toVar()
    If(inGrid(q, L), () => {
      acc.addAssign(float(L.grid.element(cellIndex(q, L))).div(OCC_SCALE))
    })
    If(acc.greaterThan(6), () => { TSL.Break() })
  })
  return exp(acc.mul(-SHADOW_DENSITY))
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
    const add = uint(floor(a.mul(min(reach.div(cell).pow2(), 1)).mul(OCC_SCALE).add(0.5))).toVar()
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
function makeLight(buf: ReturnType<typeof makeBuffers>, L: Lighting) {
  return Fn(() => {
    const i = instanceIndex
    const color = unpackUnorm4x8(buf.color.element(i)).toVar()
    const world = buf.worldCenter.element(i).xyz.toVar()
    L.litW.element(i).assign(vec4(lit(painted(color.rgb, world, buf.edits), world, buf.covA.element(i), buf.covB.element(i), L), color.a))
  })().compute(buf.count, [WORKGROUP]).setName('SplatWorldLight')
}

/** The blob's color after distance fog: none while the fog's far distance is 0. */
function fogged(rgb: N, depth: N, fog: Fog) {
  const span = max(fog.range.y.sub(fog.range.x), 0.0001)
  const f = select(fog.range.y.greaterThan(0), depth.sub(fog.range.x).div(span).clamp(0, 1), float(0)).toVar()
  return rgb.add(fog.color.sub(rgb).mul(f))
}

const splatUv = () => varyingProperty('vec2', 'vSplatUv')
const splatColor = () => varyingProperty('vec4', 'vSplatColor')

/**
 * A quad around the blob, only as big as it is visible: a faint blob fades
 * below 1/255 sooner than two standard deviations out, so its quad shrinks and
 * covers fewer pixels.
 */
function placeQuad(ndc: N, axes: N, rgba: N) {
  const alpha = rgba.a
  const reach = sqrt(max(TSL.log(alpha.mul(255)).mul(2), 0)).min(2).toVar()
  const uv = positionGeometry.xy.mul(reach).toVar()
  splatUv().assign(uv)
  splatColor().assign(rgba)
  return vec4(ndc.xy.add(axes.xy.mul(uv.x)).add(axes.zw.mul(uv.y)), ndc.z, 1)
}

/** What a blob draws as: its picture color, its part's flat color (map of parts), or its depth (depth map). */
function flatColor(flat: N, part: N, depth: N, picture: N) {
  return select(flat.greaterThan(1.5), vec3(depth), select(flat.greaterThan(0.5), part, picture))
}

function makeVertexWebGPU(buf: ReturnType<typeof makeBuffers>, sort: DepthSort, fog: Fog, flat: N, L?: Lighting) {
  return Fn(() => {
    const idx = sort.orderRead.element(instanceIndex).toVar()
    const A = buf.splatA.element(idx).toVar()
    // lit: the light pass's color, in place of the packed one (so the draw binds no more buffers than before)
    const color = (L ? L.lit.element(idx) : unpackUnorm4x8(buf.color.element(idx))).toVar()
    // depth in front of the camera from the screen depth the project pass wrote, so the draw binds no extra buffer:
    // ndc z = −(P22·z + P32) / z for a perspective camera, so −z = P32 / (ndc z + P22)
    const depth = cameraProjectionMatrix[3].z.div(A.z.add(cameraProjectionMatrix[2].z))
    const part = unpackUnorm4x8(buf.part.element(idx))
    return placeQuad(A.xyz, buf.splatB.element(idx), vec4(flatColor(flat, part.rgb, depth, fogged(color.rgb, depth, fog)), color.a.mul(A.w)))
  })()
}

/** WebGL has no compute: each corner moves its blob through the bones and projects it, like a skinned mesh. */
function makeVertexWebGL(buf: ReturnType<typeof makeBuffers>, sort: DepthSort, mode: SkinMode, fog: Fog, flat: N, L?: Lighting) {
  return Fn(() => {
    const idx = sort.orderRead.element(instanceIndex).toVar()
    const d = deformBlob(buf, idx, mode)
    const p = projectSplat(d.world, d.covA, d.covB, cameraViewMatrix, cameraProjectionMatrix, cameraViewport.zw)
    const color = unpackUnorm4x8(buf.color.element(idx)).toVar()
    const rgb = L ? lit(painted(color.rgb, d.world, buf.edits), d.world, d.covA, d.covB, L) : color.rgb
    const part = unpackUnorm4x8(buf.part.element(idx))
    return placeQuad(p.ndc, p.axes, vec4(flatColor(flat, part.rgb, p.depth, fogged(rgb, p.depth, fog)), color.a.mul(p.alphaScale)))
  })()
}

function makeFragment(flat: N) {
  return Fn(() => {
    const uv = splatUv()
    const r2 = dot(uv, uv).toVar()
    If(r2.greaterThan(4), () => { Discard() })
    const alpha = exp(r2.mul(-0.5)).mul(splatColor().a).toVar()
    // a map of parts: all of the blob or none of it, so the nearest part's color is left whole
    If(flat.greaterThan(0), () => {
      // well out from the middle, so the discs of one surface close up and nothing behind shows between them
      If(alpha.lessThan(PART_CUT), () => { Discard() })
      alpha.assign(1)
    })
    return vec4(splatColor().rgb, alpha)
  })()
}
