import type { Quat, Vec3 } from '../splat-core/blobs.ts'

/**
 * A skeleton: bones in a tree, each placed by its head in the rest pose (world
 * space, no rest rotation) and posed by a local rotation about its head plus an
 * optional offset. Bone 0 is usually the root; a still object in a scene is just
 * a skeleton of one bone.
 *
 * `update()` turns the pose into what the skinning pass needs per bone: the skin
 * matrix (posed world × inverse rest, column-major 4×4), its rotation as a
 * quaternion, and its uniform scale. A bone's scale carries down to its
 * children, as in glTF.
 */
export interface Bone {
  name: string
  parent: number
  head: Vec3
  /** Where the bone ends in the rest pose, for drawing it. A bone with children points at its first child when this is missing. */
  tail?: Vec3
}

/**
 * Bones in a tree, and their pose. Set `rotation`, `offset` and `size` (or use the posing helpers), then call
 * `update()` to work out what the skinning pass needs; `reset()` goes back to the rest pose.
 */
export class Skeleton {
  /** The bones, parents before their children. */
  readonly bones: Bone[]
  /** Pose: local rotation per bone (x, y, z, w). */
  readonly rotation: Float32Array
  /** Pose: local offset per bone, added to its rest offset from the parent. */
  readonly offset: Float32Array
  /** Pose: local uniform scale per bone, about its head; children inherit it. */
  readonly size: Float32Array
  /** Pose: uniform scale of the root (bone 0), on top of its `size`. */
  rootScale = 1
  /** Where the actor stands: added to every root bone, and kept by `reset()` (a pose isn't a placement). */
  readonly place = new Float32Array(3)

  /** Output, per bone: skin matrix (16), skin rotation quaternion (4), skin uniform scale (1). */
  readonly matrix: Float32Array
  readonly quat: Float32Array
  readonly scale: Float32Array
  /** Posed world position of each bone's head, for drawing the rig. */
  readonly posedHead: Float32Array

  constructor(bones: Bone[]) {
    bones.forEach((b, i) => { if (b.parent >= i) throw new Error(`bone ${b.name} must come after its parent`) })
    this.bones = bones
    const n = bones.length
    this.rotation = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) this.rotation[i * 4 + 3] = 1
    this.offset = new Float32Array(n * 3)
    this.size = new Float32Array(n).fill(1)
    this.matrix = new Float32Array(n * 16)
    this.quat = new Float32Array(n * 4)
    this.scale = new Float32Array(n)
    this.posedHead = new Float32Array(n * 3)
    this.update()
  }

  /** How many bones. */
  get count() { return this.bones.length }

  /** A bone's index by its name. Throws when there is no such bone. */
  index(name: string) {
    const i = this.bones.findIndex((b) => b.name === name)
    if (i < 0) throw new Error(`no bone ${name}`)
    return i
  }

  /** Sets one bone's local rotation (x, y, z, w). */
  setRotation(bone: number, q: ArrayLike<number>) { this.rotation.set([q[0], q[1], q[2], q[3]], bone * 4) }

  /** Back to the rest pose. */
  reset() {
    this.rotation.fill(0)
    for (let i = 0; i < this.count; i++) this.rotation[i * 4 + 3] = 1
    this.offset.fill(0)
    this.size.fill(1)
    this.rootScale = 1
  }

  /**
   * Works the pose out: every bone's skin matrix, rotation and scale, parents first. Call it after posing and before
   * drawing.
   */
  update() {
    const n = this.count
    // world rotation (quat), world position of head, world scale, per bone
    const wq = new Float64Array(n * 4)
    const wp = new Float64Array(n * 3)
    const ws = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const b = this.bones[i]
      const lq = this.rotation.subarray(i * 4, i * 4 + 4)
      const off = this.offset.subarray(i * 3, i * 3 + 3)
      if (b.parent < 0) {
        const s = (i === 0 ? this.rootScale : 1) * this.size[i]
        ws[i] = s
        wq.set(norm4(lq), i * 4)
        wp.set([b.head[0] + off[0] + this.place[0], b.head[1] + off[1] + this.place[1], b.head[2] + off[2] + this.place[2]], i * 3)
      } else {
        const p = b.parent
        const ph = this.bones[p].head
        const pq = wq.subarray(p * 4, p * 4 + 4)
        const rel: Vec3 = [b.head[0] - ph[0] + off[0], b.head[1] - ph[1] + off[1], b.head[2] - ph[2] + off[2]]
        const r = rotate(pq, rel)
        ws[i] = ws[p] * this.size[i]
        wp.set([wp[p * 3] + r[0] * ws[p], wp[p * 3 + 1] + r[1] * ws[p], wp[p * 3 + 2] + r[2] * ws[p]], i * 3)
        wq.set(mulQ(pq, norm4(lq)), i * 4)
      }
    }
    // skin = T(posed head) · R(world rot) · S(scale) · T(−rest head)
    for (let i = 0; i < n; i++) {
      const q = wq.subarray(i * 4, i * 4 + 4)
      const s = ws[i]
      const R = quatMat3(q)
      const h = this.bones[i].head
      const m = this.matrix.subarray(i * 16, i * 16 + 16)
      // columns
      for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 4 + r] = R[r * 3 + c] * s
      m[3] = m[7] = m[11] = 0
      const rh = [R[0] * h[0] + R[1] * h[1] + R[2] * h[2], R[3] * h[0] + R[4] * h[1] + R[5] * h[2], R[6] * h[0] + R[7] * h[1] + R[8] * h[2]]
      m[12] = wp[i * 3] - s * rh[0]
      m[13] = wp[i * 3 + 1] - s * rh[1]
      m[14] = wp[i * 3 + 2] - s * rh[2]
      m[15] = 1
      this.quat.set(q, i * 4)
      this.scale[i] = s
      this.posedHead.set(wp.subarray(i * 3, i * 3 + 3), i * 3)
    }
  }
}

/** How each blob hangs on the skeleton: up to four bones and weights summing to 1. */
export interface Skin {
  joints: Uint8Array
  weights: Float32Array
}

/**
 * A skin for `count` blobs with nothing in it yet: four bone indices and four weights per blob. Fill it with
 * `setWeights`.
 */
export function emptySkin(count: number): Skin {
  return { joints: new Uint8Array(count * 4), weights: new Float32Array(count * 4) }
}

/** Keeps the four largest weights and makes them sum to 1. */
export function setWeights(skin: Skin, i: number, pairs: [bone: number, weight: number][]) {
  const top = pairs.filter((p) => p[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const sum = top.reduce((s, p) => s + p[1], 0) || 1
  for (let k = 0; k < 4; k++) {
    skin.joints[i * 4 + k] = top[k]?.[0] ?? 0
    skin.weights[i * 4 + k] = top[k] ? top[k][1] / sum : 0
  }
  if (!top.length) skin.weights[i * 4] = 1
}

/**
 * Four weights to four bytes summing to exactly 255, so a blob never shrinks
 * or grows from rounding: normalized first (files may not be), and whatever
 * rounding leaves over goes to the largest weight. All zero means the first bone.
 */
export function packWeights(w: ArrayLike<number>, o: number): number {
  const v = [0, 1, 2, 3].map((j) => Math.max(0, Number.isFinite(w[o + j]) ? w[o + j] : 0))
  const sum = v[0] + v[1] + v[2] + v[3]
  if (!(sum > 0)) return 255
  const b = v.map((x) => Math.round((x / sum) * 255))
  const big = b.indexOf(Math.max(...b))
  b[big] += 255 - (b[0] + b[1] + b[2] + b[3])
  return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0
}

/**
 * How a blob on several bones takes its shape: 'linear' pushes it through the blended matrices, which squashes it on
 * a twisting joint; 'quat' averages the bones' rotations and scales, so it only ever turns. See `skinBlob`.
 */
export type SkinMode = 'linear' | 'quat'

/**
 * Moves one blob by its bones. Positions blend the skin matrices linearly (as
 * every engine does). The blob's shape then follows one of two rules:
 *
 * - 'linear': its covariance is pushed through the blended 3×3 matrix. A blend of
 *   two rotations is not a rotation, so a blob on a twisting joint gets squashed.
 * - 'quat': its rotation is the weighted average of the bone rotations
 *   (quaternions sign-aligned, summed, renormalized) and its scale the weighted
 *   average scale, so the blob only ever turns, never flattens.
 *
 * Writes the world center (3) and covariance [xx, xy, xz, yy, yz, zz] (6).
 */
export function skinBlob(
  center: ArrayLike<number>, scale: ArrayLike<number>, quat: ArrayLike<number>,
  joints: ArrayLike<number>, weights: ArrayLike<number>,
  rig: { matrix: ArrayLike<number>; quat: ArrayLike<number>; scale: ArrayLike<number> },
  mode: SkinMode, outCenter: Float32Array, oc: number, outCov: Float32Array, ov: number,
) {
  const M = new Float64Array(12) // blended 3×4, column-major without the last row
  const Q = [0, 0, 0, 0]
  let S = 0
  const j0 = joints[0]
  const q0 = [rig.quat[j0 * 4], rig.quat[j0 * 4 + 1], rig.quat[j0 * 4 + 2], rig.quat[j0 * 4 + 3]]
  for (let k = 0; k < 4; k++) {
    const w = weights[k]
    if (!w) continue
    const j = joints[k]
    for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++) M[c * 3 + r] += w * rig.matrix[j * 16 + c * 4 + r]
    const qj = [rig.quat[j * 4], rig.quat[j * 4 + 1], rig.quat[j * 4 + 2], rig.quat[j * 4 + 3]]
    const sign = qj[0] * q0[0] + qj[1] * q0[1] + qj[2] * q0[2] + qj[3] * q0[3] < 0 ? -1 : 1
    for (let c = 0; c < 4; c++) Q[c] += w * sign * qj[c]
    S += w * rig.scale[j]
  }
  const x = center[0], y = center[1], z = center[2]
  outCenter[oc] = M[0] * x + M[3] * y + M[6] * z + M[9]
  outCenter[oc + 1] = M[1] * x + M[4] * y + M[7] * z + M[10]
  outCenter[oc + 2] = M[2] * x + M[5] * y + M[8] * z + M[11]

  if (mode === 'quat') {
    const q = mulQ(norm4(Q), norm4(quat))
    writeCov(quatMat3(q), [scale[0] * S, scale[1] * S, scale[2] * S], outCov, ov)
  } else {
    // A = Mblend(3×3) · R_local · S_local; Σ = A Aᵀ
    const R = quatMat3(norm4(quat))
    const A = new Float64Array(9)
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      let v = 0
      for (let k = 0; k < 3; k++) v += M[k * 3 + r] * R[k * 3 + c]
      A[r * 3 + c] = v * scale[c]
    }
    writeCovA(A, outCov, ov)
  }
}

function writeCov(R: ArrayLike<number>, s: ArrayLike<number>, out: Float32Array, o: number) {
  const A = new Float64Array(9)
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) A[r * 3 + c] = R[r * 3 + c] * s[c]
  writeCovA(A, out, o)
}

function writeCovA(A: ArrayLike<number>, out: Float32Array, o: number) {
  const d = (a: number, b: number) => A[a * 3] * A[b * 3] + A[a * 3 + 1] * A[b * 3 + 1] + A[a * 3 + 2] * A[b * 3 + 2]
  out[o] = d(0, 0); out[o + 1] = d(0, 1); out[o + 2] = d(0, 2)
  out[o + 3] = d(1, 1); out[o + 4] = d(1, 2); out[o + 5] = d(2, 2)
}

// --- small quaternion helpers (x, y, z, w) ---

/** A quaternion scaled to unit length. */
export function norm4(q: ArrayLike<number>): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]
}

/** The product of two quaternions: the turn `b`, then the turn `a`. */
export function mulQ(a: ArrayLike<number>, b: ArrayLike<number>): Quat {
  const [ax, ay, az, aw] = [a[0], a[1], a[2], a[3]]
  const [bx, by, bz, bw] = [b[0], b[1], b[2], b[3]]
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

/** The quaternion for a turn of `rad` radians about `axis`. */
export function axisAngle(axis: Vec3, rad: number): Quat {
  const n = Math.hypot(...axis) || 1
  const s = Math.sin(rad / 2)
  return [(axis[0] / n) * s, (axis[1] / n) * s, (axis[2] / n) * s, Math.cos(rad / 2)]
}

/** A vector turned by a quaternion. */
export function rotate(q: ArrayLike<number>, v: ArrayLike<number>): Vec3 {
  const R = quatMat3(q)
  return [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]]
}

/** Row-major 3×3 rotation of a unit quaternion. */
export function quatMat3(q: ArrayLike<number>): number[] {
  const [x, y, z, w] = [q[0], q[1], q[2], q[3]]
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ]
}

/**
 * Moves only the centers of many blobs, fast: what the sort needs on the CPU
 * when the GPU does the rest of the skinning. No allocation per blob.
 *
 * - `src`: rest centers as vec4s, with each blob's first bone (its actor's
 *   offset into `bones`) in w;
 * - `skin`: two words per blob, four joint bytes then four weight bytes summing to 255;
 * - `bones`: 20 floats per bone, the first 16 its column-major skin matrix.
 *
 * Writes xyz into `out` (3 floats per blob). Matches `skinBlob`'s center.
 */
export function skinCenters(src: Float32Array, skin: Uint32Array, bones: Float32Array, count: number, out: Float32Array) {
  for (let i = 0; i < count; i++) {
    const x = src[i * 4], y = src[i * 4 + 1], z = src[i * 4 + 2], base = src[i * 4 + 3]
    const jw = skin[i * 2], ww = skin[i * 2 + 1]
    let ox = 0, oy = 0, oz = 0
    for (let k = 0; k < 4; k++) {
      const w = ((ww >>> (k * 8)) & 255) / 255
      if (!w) continue
      const m = (base + ((jw >>> (k * 8)) & 255)) * 20
      ox += w * (bones[m] * x + bones[m + 4] * y + bones[m + 8] * z + bones[m + 12])
      oy += w * (bones[m + 1] * x + bones[m + 5] * y + bones[m + 9] * z + bones[m + 13])
      oz += w * (bones[m + 2] * x + bones[m + 6] * y + bones[m + 10] * z + bones[m + 14])
    }
    out[i * 3] = ox; out[i * 3 + 1] = oy; out[i * 3 + 2] = oz
  }
}

/** A point carried by bone `bone`'s current pose: where its rest position `p` has moved to. */
export function posedPoint(sk: { matrix: ArrayLike<number> }, bone: number, p: ArrayLike<number>): [number, number, number] {
  const m = sk.matrix, o = bone * 16
  return [
    m[o] * p[0] + m[o + 4] * p[1] + m[o + 8] * p[2] + m[o + 12],
    m[o + 1] * p[0] + m[o + 5] * p[1] + m[o + 9] * p[2] + m[o + 13],
    m[o + 2] * p[0] + m[o + 6] * p[1] + m[o + 10] * p[2] + m[o + 14],
  ]
}
