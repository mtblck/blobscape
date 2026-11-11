import {
  BufferAttribute, DynamicDrawUsage, InstancedBufferGeometry, Matrix4, Mesh, NodeMaterial, Sphere, StorageBufferAttribute, Vector2, Vector3,
  type Camera, type Renderer,
} from 'three/webgpu'
import * as TSLTyped from 'three/tsl'
import { CountingSort } from 'three/addons/gpgpu/CountingSort.js'
import type { Blobs } from '../splat-core/blobs.ts'

// TSL's typings model each node type closely, and the shader code below mixes
// them freely (as three.js's own JavaScript does), so the node functions are
// used untyped here. Everything outside the shader builders stays typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>
const {
  Discard, EPSILON, Fn, If, atan, cameraProjectionMatrix, cameraViewport, cameraViewMatrix, cos, dot, exp, float, instanceIndex,
  length, max, min, normalize, positionGeometry, select, sin, sqrt, storage, uint, uniform, unpackUnorm4x8, varyingProperty, vec2, vec3, vec4,
} = TSL
import { packWeights, skinBlob, type Skeleton, type Skin, type SkinMode } from './rig.ts'
import { srgbToLinear } from '../splat-core/colour.ts'

/**
 * Blobscape's splat engine: one mesh that draws every blob of every object in a
 * scene, so objects that overlap (stems in a vase, a fox in long grass) sort
 * against each other blob by blob, instead of object by object.
 *
 * Every blob hangs on bones. A still object is one bone; a creature is a
 * skeleton. Each frame:
 *
 * 1. deform (compute): each blob's centre and shape go from its rest pose to the
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
}

const WORKGROUP = 256
const KERNEL_2D = 0.3
const MAX_SPLAT_PX = 1024
const CLIP_XY = 1.4

export interface EngineOptions {
  /** Depth buckets for the sort. More buckets, fewer ties between blobs that are close in depth. */
  bins?: number
  mode?: SkinMode
}

export class SplatWorld extends Mesh {
  readonly isSplatWorld = true
  readonly count: number
  readonly actors: Actor[]
  readonly boneCount: number
  mode: SkinMode
  /** Set by the WebGL backend path, read by tests: did the last frame skin on the CPU? */
  cpuPath = false
  /** Milliseconds the CPU spent in the last frame's deform + sort (WebGL path only). */
  cpuMs = 0

  private readonly boneOffset: number[]
  private readonly boneRadius: Float32Array
  private readonly buf: ReturnType<typeof makeBuffers>
  private readonly sort: CountingSort
  private readonly deformNodes: Record<SkinMode, ReturnType<typeof makeDeform>>
  private readonly view = uniform(new Matrix4())
  private readonly depthRange = uniform(new Vector2(0, 1))
  private readonly bins: number
  private posed = false
  private bonesDirty = true
  private lastSortKey = ''
  readonly bounds = new Sphere()

  constructor(actors: Actor[], { bins = 16384, mode = 'quat' }: EngineOptions = {}) {
    const count = actors.reduce((s, a) => s + a.blobs.count, 0)
    const geometry = new InstancedBufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([-2, -2, 0, 2, -2, 0, 2, 2, 0, -2, 2, 0]), 3))
    geometry.setIndex([0, 1, 2, 0, 2, 3])
    geometry.instanceCount = count

    const boneOffset: number[] = []
    let bones = 0
    for (const a of actors) { boneOffset.push(bones); bones += a.skeleton.count }
    const buf = makeBuffers(actors, boneOffset, count, bones)
    const sort = new CountingSort(Math.max(1, count), { binCount: bins, workgroupSize: WORKGROUP })
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

    this.boneRadius = boneRadii(actors, boneOffset, bones)
    this.deformNodes = { quat: makeDeform(buf, 'quat'), linear: makeDeform(buf, 'linear') }

    const viewU = this.view
    const rangeU = this.depthRange
    const bins1 = bins - 1
    sort.setBinNode(() => {
      const c = buf.worldCentre.element(instanceIndex).xyz
      const depth = viewU.mul(vec4(c, 1)).z.negate()
      const span = max(rangeU.y.sub(rangeU.x), 0.0001)
      const t = depth.sub(rangeU.x).div(span).clamp(0, 1)
      return uint(bins1).sub(uint(t.mul(bins1)))
    })

    const { vertexNode, fragmentNode } = makeMaterialNodes(buf, sort)
    material.vertexNode = vertexNode as never
    material.colorNode = fragmentNode as never

    this.onBeforeRender = (renderer, _scene, camera) => this.prepare(renderer as unknown as Renderer, camera)
  }

  /** Call after posing any skeleton. */
  markPosed() { this.bonesDirty = true }

  private isWebGL(renderer: Renderer) {
    return (renderer as unknown as { backend?: { isWebGLBackend?: boolean } }).backend?.isWebGLBackend === true
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
    this.buf.boneAttr.needsUpdate = true
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

  private prepare(renderer: Renderer, camera: Camera) {
    const webgl = this.isWebGL(renderer)
    this.cpuPath = webgl
    const deformed = this.bonesDirty || !this.posed
    if (deformed) {
      this.uploadBones()
      this.updateBounds()
    }
    // depth range from the bounds, in the camera's view
    camera.updateMatrixWorld()
    const e = camera.matrixWorldInverse.elements
    const c = this.bounds.center
    const d = -(e[2] * c.x + e[6] * c.y + e[10] * c.z + e[14])
    const near = Math.max((camera as unknown as { near?: number }).near ?? 0.01, d - this.bounds.radius)
    const far = Math.max(near + 0.0001, d + this.bounds.radius)
    this.view.value.copy(camera.matrixWorldInverse)
    this.depthRange.value.set(near, far)
    const key = e.join(',')
    const needsSort = deformed || key !== this.lastSortKey

    if (webgl) {
      enableWebGL(this.buf, this.sort)
      const t0 = performance.now()
      if (deformed) this.deformCPU()
      if (needsSort) this.sortCPU(e, near, far)
      this.cpuMs = performance.now() - t0
    } else {
      if (deformed) renderer.compute(this.deformNodes[this.mode] as never)
      if (needsSort) this.sort.compute(renderer as never)
    }
    this.posed = true
    this.bonesDirty = false
    this.lastSortKey = key
  }

  /**
   * The CPU twin of the deform pass, for the WebGL backend and for checking the
   * GPU. It reads the same byte weights the GPU does, so the two agree.
   */
  deformCPU(out = this.buf) {
    let i = 0
    const w = new Float32Array(4)
    for (let a = 0; a < this.actors.length; a++) {
      const { blobs, skin, skeleton } = this.actors[a]
      for (let k = 0; k < blobs.count; k++, i++) {
        const word = this.buf.skinWords[i * 2 + 1]
        for (let j = 0; j < 4; j++) w[j] = ((word >>> (j * 8)) & 255) / 255
        skinBlob(
          blobs.centre.subarray(k * 3, k * 3 + 3), blobs.scale.subarray(k * 3, k * 3 + 3), blobs.quat.subarray(k * 4, k * 4 + 4),
          skin.joints.subarray(k * 4, k * 4 + 4), w, skeleton, this.mode,
          out.cpuCentre, i * 4, out.cpuCov, i * 6,
        )
        out.cpuCentre[i * 4 + 3] = 1
      }
    }
    const wc = out.worldCentreAttr.array as Float32Array, ca = out.covAAttr.array as Float32Array, cb = out.covBAttr.array as Float32Array
    wc.set(out.cpuCentre)
    for (let j = 0; j < this.count; j++) {
      const v = out.cpuCov.subarray(j * 6, j * 6 + 6)
      ca[j * 4] = v[0]; ca[j * 4 + 1] = v[1]; ca[j * 4 + 2] = v[2]; ca[j * 4 + 3] = v[3]
      cb[j * 4] = v[4]; cb[j * 4 + 1] = v[5]
    }
    for (const a of [out.worldCentreAttr, out.covAAttr, out.covBAttr]) bump(a)
  }

  private sortCPU(view: ArrayLike<number>, near: number, far: number) {
    const c = this.buf.worldCentreAttr.array as Float32Array
    const scale = (this.bins - 1) / Math.max(far - near, 0.0001)
    const top = this.bins - 1
    this.sort.computeCPU((i: number) => {
      const d = -(view[2] * c[i * 4] + view[6] * c[i * 4 + 1] + view[10] * c[i * 4 + 2] + view[14])
      return top - Math.min(top, Math.max(0, Math.floor((d - near) * scale)))
    })
  }

  /**
   * Reads back what the GPU deform wrote and compares it with the CPU twin.
   * Returns the largest differences in centre (world units) and covariance.
   */
  async checkAgainstCPU(renderer: Renderer) {
    const r = renderer as unknown as { getArrayBufferAsync: (a: StorageBufferAttribute) => Promise<ArrayBuffer> }
    const gpuCentre = new Float32Array(await r.getArrayBufferAsync(this.buf.worldCentreAttr))
    const gpuA = new Float32Array(await r.getArrayBufferAsync(this.buf.covAAttr))
    const gpuB = new Float32Array(await r.getArrayBufferAsync(this.buf.covBAttr))
    const cpu = { ...this.buf, worldCentreAttr: new StorageBufferAttribute(new Float32Array(this.count * 4), 4), covAAttr: new StorageBufferAttribute(new Float32Array(this.count * 4), 4), covBAttr: new StorageBufferAttribute(new Float32Array(this.count * 4), 4), cpuCentre: new Float32Array(this.count * 4), cpuCov: new Float32Array(this.count * 6) }
    this.deformCPU(cpu)
    let centre = 0, cov = 0, scale = 0
    for (let i = 0; i < this.count; i++) {
      for (let k = 0; k < 3; k++) centre = Math.max(centre, Math.abs(gpuCentre[i * 4 + k] - cpu.cpuCentre[i * 4 + k]))
      const g = [gpuA[i * 4], gpuA[i * 4 + 1], gpuA[i * 4 + 2], gpuA[i * 4 + 3], gpuB[i * 4], gpuB[i * 4 + 1]]
      for (let k = 0; k < 6; k++) {
        cov = Math.max(cov, Math.abs(g[k] - cpu.cpuCov[i * 6 + k]))
        scale = Math.max(scale, Math.abs(cpu.cpuCov[i * 6 + k]))
      }
    }
    return { centre, cov, covScale: scale }
  }

  /** The order the last sort produced, front-to-back reversed (drawn first is farthest). Only up to date on the CPU path. */
  get order() { return this.sort.orderAttribute.array as Uint32Array }

  dispose() {
    this.geometry.dispose()
    ;(this.material as NodeMaterial).dispose()
  }
}

function bump(a: StorageBufferAttribute) {
  a.needsUpdate = true
  const pbo = (a as unknown as { pbo?: { needsUpdate: boolean } }).pbo
  if (pbo) pbo.needsUpdate = true
}


function makeBuffers(actors: Actor[], boneOffset: number[], count: number, bones: number) {
  const n = Math.max(1, count)
  const centre = new Float32Array(n * 4)
  const scale = new Float32Array(n * 4)
  const quat = new Float32Array(n * 4)
  const colour = new Uint32Array(n)
  // joints and weights interleaved, two words per blob: a compute stage may only bind 8 storage buffers on many phones
  const skinWords = new Uint32Array(n * 2)
  let i = 0
  actors.forEach((a, ai) => {
    const { blobs, skin } = a
    for (let k = 0; k < blobs.count; k++, i++) {
      centre.set(blobs.centre.subarray(k * 3, k * 3 + 3), i * 4)
      centre[i * 4 + 3] = boneOffset[ai]
      scale.set(blobs.scale.subarray(k * 3, k * 3 + 3), i * 4)
      quat.set(blobs.quat.subarray(k * 4, k * 4 + 4), i * 4)
      const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
      colour[i] = (byte(srgbToLinear(blobs.colour[k * 3])) | (byte(srgbToLinear(blobs.colour[k * 3 + 1])) << 8) |
        (byte(srgbToLinear(blobs.colour[k * 3 + 2])) << 16) | (byte(blobs.opacity[k]) << 24)) >>> 0
      skinWords[i * 2] = (skin.joints[k * 4] | (skin.joints[k * 4 + 1] << 8) | (skin.joints[k * 4 + 2] << 16) | (skin.joints[k * 4 + 3] << 24)) >>> 0
      skinWords[i * 2 + 1] = packWeights(skin.weights, k * 4)
    }
  })
  const attr = (a: Float32Array | Uint32Array, size: number) => new StorageBufferAttribute(a, size)
  const centreAttr = attr(centre, 4), scaleAttr = attr(scale, 4), quatAttr = attr(quat, 4)
  const colourAttr = attr(colour, 1), skinAttr = attr(skinWords, 1)
  const boneData = new Float32Array(Math.max(1, bones) * 20)
  const boneAttr = new StorageBufferAttribute(boneData, 4)
  boneAttr.setUsage(DynamicDrawUsage)
  const worldCentreAttr = new StorageBufferAttribute(new Float32Array(n * 4), 4)
  const covAAttr = new StorageBufferAttribute(new Float32Array(n * 4), 4)
  const covBAttr = new StorageBufferAttribute(new Float32Array(n * 4), 4)
  return {
    count: n,
    skinWords,
    boneData, boneAttr, worldCentreAttr, covAAttr, covBAttr, colourAttr,
    cpuCentre: new Float32Array(n * 4), cpuCov: new Float32Array(n * 6),
    srcCentre: storage(centreAttr, 'vec4', n).toReadOnly(),
    srcScale: storage(scaleAttr, 'vec4', n).toReadOnly(),
    srcQuat: storage(quatAttr, 'vec4', n).toReadOnly(),
    skin: storage(skinAttr, 'uint', n * 2).toReadOnly(),
    bones: storage(boneAttr, 'vec4', Math.max(1, bones) * 5).toReadOnly(),
    colour: storage(colourAttr, 'uint', n).toReadOnly(),
    worldCentreW: storage(worldCentreAttr, 'vec4', n),
    covAW: storage(covAAttr, 'vec4', n),
    covBW: storage(covBAttr, 'vec4', n),
    worldCentre: storage(worldCentreAttr, 'vec4', n).toReadOnly(),
    covA: storage(covAAttr, 'vec4', n).toReadOnly(),
    covB: storage(covBAttr, 'vec4', n).toReadOnly(),
    webgl: false,
  }
}

function enableWebGL(buf: ReturnType<typeof makeBuffers>, sort: CountingSort) {
  if (buf.webgl) return
  for (const a of [buf.worldCentreAttr, buf.covAAttr, buf.covBAttr]) a.setUsage(DynamicDrawUsage)
  for (const r of [buf.worldCentre, buf.covA, buf.covB, buf.colour]) (r as unknown as { setPBO: (b: boolean) => void }).setPBO(true)
  sort.enableWebGLBuffers()
  buf.webgl = true
}

function boneRadii(actors: Actor[], boneOffset: number[], bones: number) {
  const r = new Float32Array(Math.max(1, bones))
  actors.forEach((a, ai) => {
    const { blobs, skin, skeleton } = a
    for (let k = 0; k < blobs.count; k++) {
      const b = skin.joints[k * 4]
      const h = skeleton.bones[b].head
      const s = Math.max(blobs.scale[k * 3], blobs.scale[k * 3 + 1], blobs.scale[k * 3 + 2]) * 2
      const d = Math.hypot(blobs.centre[k * 3] - h[0], blobs.centre[k * 3 + 1] - h[1], blobs.centre[k * 3 + 2] - h[2]) + s
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

function makeDeform(buf: ReturnType<typeof makeBuffers>, mode: SkinMode) {
  return Fn(() => {
    const i = instanceIndex
    const src = buf.srcCentre.element(i).toVar()
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
    const world = c0.mul(p.x).add(c1.mul(p.y)).add(c2.mul(p.z)).add(c3)
    buf.worldCentreW.element(i).assign(vec4(world, 1))

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
    buf.covAW.element(i).assign(vec4(e('x', 'x'), e('x', 'y'), e('x', 'z'), e('y', 'y')))
    buf.covBW.element(i).assign(vec4(e('y', 'z'), e('z', 'z'), 0, 0))
  })().compute(buf.count, [WORKGROUP]).setName(`SplatWorldDeform_${mode}`)
}

function makeMaterialNodes(buf: ReturnType<typeof makeBuffers>, sort: CountingSort) {
  const splatUv = varyingProperty('vec2', 'vSplatUv')
  const splatColour = varyingProperty('vec4', 'vSplatColour')

  const vertexNode = Fn(() => {
    const idx = sort.orderRead.element(instanceIndex).toVar()
    const centre = buf.worldCentre.element(idx).xyz.toVar()
    const covA = buf.covA.element(idx).toVar()
    const covB = buf.covB.element(idx).toVar()
    const colour = unpackUnorm4x8(buf.colour.element(idx)).toVar()
    splatUv.assign(positionGeometry.xy)

    const viewCentre4 = cameraViewMatrix.mul(vec4(centre, 1)).toVar()
    const viewCentre = viewCentre4.xyz.toVar()
    const centreClip = cameraProjectionMatrix.mul(viewCentre4).toVar()

    const m = cameraViewMatrix
    const r0 = vec3(m[0].x, m[1].x, m[2].x).toVar()
    const r1 = vec3(m[0].y, m[1].y, m[2].y).toVar()
    const r2 = vec3(m[0].z, m[1].z, m[2].z).toVar()
    const cov0 = vec3(covA.x, covA.y, covA.z).toVar()
    const cov1 = vec3(covA.y, covA.w, covB.x).toVar()
    const cov2 = vec3(covA.z, covB.x, covB.y).toVar()
    const vc0 = vec3(dot(r0, cov0), dot(r0, cov1), dot(r0, cov2)).toVar()
    const vc1 = vec3(dot(r1, cov0), dot(r1, cov1), dot(r1, cov2)).toVar()
    const vc2 = vec3(dot(r2, cov0), dot(r2, cov1), dot(r2, cov2)).toVar()
    const c00 = dot(vc0, r0).toVar(), c01 = dot(vc0, r1).toVar(), c02 = dot(vc0, r2).toVar()
    const c11 = dot(vc1, r1).toVar(), c12 = dot(vc1, r2).toVar(), c22 = dot(vc2, r2).toVar()

    const z = min(viewCentre.z, -0.01).toVar()
    const invZ = float(1).div(z).toVar()
    const invZ2 = invZ.mul(invZ).toVar()
    const focal = cameraViewport.zw.mul(0.5).mul(vec2(cameraProjectionMatrix[0].x, cameraProjectionMatrix[1].y)).toVar()
    const j00 = focal.x.negate().mul(invZ).toVar()
    const j11 = focal.y.negate().mul(invZ).toVar()
    const j02 = focal.x.mul(viewCentre.x).mul(invZ2).toVar()
    const j12 = focal.y.mul(viewCentre.y).mul(invZ2).toVar()

    const aBase = j00.mul(j00).mul(c00).add(j00.mul(j02).mul(c02).mul(2)).add(j02.mul(j02).mul(c22)).toVar()
    const b = j00.mul(j11).mul(c01).add(j00.mul(j12).mul(c02)).add(j02.mul(j11).mul(c12)).add(j02.mul(j12).mul(c22)).toVar()
    const cBase = j11.mul(j11).mul(c11).add(j11.mul(j12).mul(c12).mul(2)).add(j12.mul(j12).mul(c22)).toVar()
    const a = aBase.add(KERNEL_2D).toVar()
    const c = cBase.add(KERNEL_2D).toVar()
    const detBase = aBase.mul(cBase).sub(b.mul(b)).toVar()
    const det = a.mul(c).sub(b.mul(b)).toVar()
    const alphaScale = sqrt(max(detBase.div(max(det, EPSILON)), 0)).toVar()
    splatColour.assign(vec4(colour.rgb, colour.a.mul(alphaScale)))

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
    const scale1 = min(sqrt(lambda1), MAX_SPLAT_PX).toVar()
    const scale2 = min(sqrt(lambda2), MAX_SPLAT_PX).toVar()
    const offsetPx = axis1.mul(positionGeometry.x).mul(scale1).add(axis2.mul(positionGeometry.y).mul(scale2)).toVar()
    const offsetNdc = offsetPx.mul(2).div(cameraViewport.zw).toVar()
    const clip = centreClip.add(vec4(offsetNdc.mul(centreClip.w), 0, 0)).toVar()
    const lim = centreClip.w.mul(CLIP_XY).toVar()
    If(viewCentre.z.greaterThanEqual(-0.01)
      .or(centreClip.z.lessThan(centreClip.w.negate()))
      .or(centreClip.z.greaterThan(centreClip.w))
      .or(centreClip.x.lessThan(lim.negate())).or(centreClip.x.greaterThan(lim))
      .or(centreClip.y.lessThan(lim.negate())).or(centreClip.y.greaterThan(lim)), () => {
      clip.assign(vec4(2, 2, 2, 1))
    })
    return clip
  })()

  const fragmentNode = Fn(() => {
    const r2 = dot(splatUv, splatUv).toVar()
    If(r2.greaterThan(4), () => { Discard() })
    return vec4(splatColour.rgb, exp(r2.mul(-0.5)).mul(splatColour.a))
  })()

  return { vertexNode, fragmentNode }
}
