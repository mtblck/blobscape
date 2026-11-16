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
  abs, length, max, min, normalize, positionGeometry, select, sin, sqrt, storage, uint, uniform, uniformArray, unpackUnorm4x8, varyingProperty, vec2, vec3, vec4,
} = TSL
import { packWeights, skinBlob, skinCenters, type Skeleton, type Skin, type SkinMode } from './rig.ts'
import { DepthSort } from './sort.ts'
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
}

/** A point light for `setLights`. */
export interface PointLight {
  position: [number, number, number]
  /** Linear RGB, times its strength: [1, 0.6, 0.3] is a torch at full strength. */
  color: [number, number, number]
  /** Its reach: about a quarter strength at this distance, and gone by twice it. */
  range: number
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
  get parts() { return this.flat.value > 0 }
  set parts(on: boolean) { this.flat.value = on ? 1 : 0 }

  private readonly boneOffset: number[]
  private readonly boneRadius: Float32Array
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
  private lightsDirty = true

  constructor(actors: Actor[], { bins = 65536, mode = 'quat', lights = false }: EngineOptions = {}) {
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

    this.boneRadius = boneRadii(actors, boneOffset, bones)
    this.deformNodes = { quat: makeDeform(buf, 'quat'), linear: makeDeform(buf, 'linear') }
    this.cam = { view: uniform(new Matrix4()), proj: uniform(new Matrix4()), viewport: uniform(new Vector2(1, 1)), depthRange: uniform(new Vector2(0, 1)) }
    this.fog = { color: uniform(new Vector3(0, 0, 0)), range: uniform(new Vector2(0, 0)) }
    this.projectNode = makeProject(buf, sort, this.cam, bins)
    if (lights) {
      this.lighting = makeLighting(buf.count)
      buf.attrs.push(this.lighting.attr)
      this.lightNode = makeLight(buf, this.lighting)
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
      ;(L.col.array[k] as Vector4).set(l?.color[0] ?? 0, l?.color[1] ?? 0, l?.color[2] ?? 0, 0)
    }
  }

  /** Call after posing any skeleton. */
  markPosed() { this.bonesDirty = true }

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
    const deformed = this.bonesDirty || !this.posed
    if (deformed) {
      this.uploadBones()
      this.updateBounds()
    }
    const key = this.setView(renderer, camera)
    const needsSort = deformed || key !== this.lastSortKey
    if (webgl) {
      const t0 = performance.now()
      if (deformed) skinCenters(this.buf.srcCenterData, this.buf.skinWords, this.buf.boneData, this.count, this.cpuCenters)
      const t1 = performance.now()
      if (needsSort) this.sortCPU()
      const t2 = performance.now()
      this.cpuSkinMs = t1 - t0
      this.cpuSortMs = t2 - t1
      this.cpuMs = t2 - t0
    } else {
      if (deformed) this.deform(renderer)
      // lights move on their own: the lit colors are redone whenever they or the blobs moved
      if (this.lightNode && (deformed || this.lightsDirty)) { renderer.compute(this.lightNode as never); this.lightsDirty = false }
      if (needsSort) this.project(renderer)
    }
    this.posed = true
    this.bonesDirty = false
    this.lastSortKey = key
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
      for (let k = 0; k < blobs.count; k++, i++) {
        const word = this.buf.skinWords[i * 2 + 1]
        for (let j = 0; j < 4; j++) w[j] = ((word >>> (j * 8)) & 255) / 255
        skinBlob(
          blobs.center.subarray(k * 3, k * 3 + 3), blobs.scale.subarray(k * 3, k * 3 + 3), blobs.quat.subarray(k * 4, k * 4 + 4),
          skin.joints.subarray(k * 4, k * 4 + 4), w, skeleton, this.mode, center, i * 4, cov, i * 6,
        )
        center[i * 4 + 3] = 1
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
  let i = 0
  actors.forEach((a, ai) => {
    const { blobs, skin } = a
    for (let k = 0; k < blobs.count; k++, i++) {
      center.set(blobs.center.subarray(k * 3, k * 3 + 3), i * 4)
      center[i * 4 + 3] = boneOffset[ai]
      scale.set(blobs.scale.subarray(k * 3, k * 3 + 3), i * 4)
      quat.set(blobs.quat.subarray(k * 4, k * 4 + 4), i * 4)
      const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
      color[i] = (byte(srgbToLinear(blobs.color[k * 3])) | (byte(srgbToLinear(blobs.color[k * 3 + 1])) << 8) |
        (byte(srgbToLinear(blobs.color[k * 3 + 2])) << 16) | (byte(blobs.opacity[k]) << 24)) >>> 0
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
    boneData, boneAttr, worldCenterAttr, covAAttr, covBAttr, colorAttr,
    srcCenter: storage(centerAttr, 'vec4', n).toReadOnly(),
    srcScale: storage(scaleAttr, 'vec4', n).toReadOnly(),
    srcQuat: storage(quatAttr, 'vec4', n).toReadOnly(),
    skin: storage(skinAttr, 'uint', n * 2).toReadOnly(),
    bones: storage(boneAttr, 'vec4', Math.max(1, bones) * 5).toReadOnly(),
    color: storage(colorAttr, 'uint', n).toReadOnly(),
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
  const q0 = col(0, 4).toVar()
  for (let k = 0; k < 4; k++) {
    const wk = ws[k]
    const a0 = col(k, 0).xyz
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
  return { world, covA: vec4(e('x', 'x'), e('x', 'y'), e('x', 'z'), e('y', 'y')).toVar(), covB: vec4(e('y', 'z'), e('z', 'z'), 0, 0).toVar() }
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

interface Lighting { pos: N; col: N; ambient: N; count: N; attr: StorageBufferAttribute; litW: N; lit: N }

function makeLighting(n: number): Lighting {
  // written only by the GPU, so no copy of it on the CPU
  const attr = new StorageBufferAttribute(n, 4)
  return {
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
    sum.addAssign(C.xyz.mul(fall.mul(facing)))
  })
  return rgb.mul(sum)
}

/** WebGPU: every blob's lit color, once a frame (after the deform, before the draw). */
function makeLight(buf: ReturnType<typeof makeBuffers>, L: Lighting) {
  return Fn(() => {
    const i = instanceIndex
    const color = unpackUnorm4x8(buf.color.element(i)).toVar()
    L.litW.element(i).assign(vec4(lit(color.rgb, buf.worldCenter.element(i).xyz, buf.covA.element(i), buf.covB.element(i), L), color.a))
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
    return placeQuad(A.xyz, buf.splatB.element(idx), vec4(select(flat.greaterThan(0), part.rgb, fogged(color.rgb, depth, fog)), color.a.mul(A.w)))
  })()
}

/** WebGL has no compute: each corner moves its blob through the bones and projects it, like a skinned mesh. */
function makeVertexWebGL(buf: ReturnType<typeof makeBuffers>, sort: DepthSort, mode: SkinMode, fog: Fog, flat: N, L?: Lighting) {
  return Fn(() => {
    const idx = sort.orderRead.element(instanceIndex).toVar()
    const d = deformBlob(buf, idx, mode)
    const p = projectSplat(d.world, d.covA, d.covB, cameraViewMatrix, cameraProjectionMatrix, cameraViewport.zw)
    const color = unpackUnorm4x8(buf.color.element(idx)).toVar()
    const rgb = L ? lit(color.rgb, d.world, d.covA, d.covB, L) : color.rgb
    const part = unpackUnorm4x8(buf.part.element(idx))
    return placeQuad(p.ndc, p.axes, vec4(select(flat.greaterThan(0), part.rgb, fogged(rgb, p.depth, fog)), color.a.mul(p.alphaScale)))
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
