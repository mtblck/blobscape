import type { Blobs, Vec3 } from '../splat-core/blobs.ts'
import { quatMat3 } from './rig.ts'
import { mat3ToQuat, symEigen } from './pose.ts'

/**
 * Morphs (blend shapes) for blobs: a second way to move them, beside bones.
 * A bone carries its blobs rigidly. A morph gives every blob its own small
 * change, and a slider says how much of it to take, so a cheek can puff or a
 * mouth can curl with no bone at all.
 *
 * A mesh morph only moves points. A blob has a shape too, so each target holds
 * two things per blob:
 *
 * - `delta`: how far the center moves (3 numbers), as a mesh morph does;
 * - `grad`: how the surface round the blob stretches and turns (9 numbers),
 *   the change in the morph's local 3×3 map, J − I.
 *
 * With weights w the center is p + Σ w·delta and the blob's covariance goes
 * through J = I + Σ w·grad, as Σ′ = J Σ Jᵀ. Both add up, so morphs mix, run
 * backward and overshoot the way mesh morphs do, and Σ′ is always a real
 * covariance whatever the weights.
 *
 * A morph is a straight line. A part that must travel round something (an
 * eyelid over an eye) gets in-between `targets`, reached in turn as the weight
 * goes from 0 to 1.
 */
export interface MorphTarget {
  delta: Float32Array
  grad: Float32Array
}

/** A blend shape for blobs: a named change of shape, reached as its weight goes from 0 to 1. */
export interface Morph {
  /** The morph's name, as files and clips know it. */
  name: string
  /** Reached in turn, evenly spaced, as the weight goes 0 → 1; the last is the full shape. */
  targets: MorphTarget[]
}

/**
 * A target from a map of the rest shape: where each blob's center goes, with
 * the map's local stretch found by nudging the center `h` each way. `to`
 * returns null for a blob the morph leaves alone.
 */
export function targetFrom(rest: Blobs, to: (p: Vec3, i: number) => Vec3 | null, h = 1e-3): MorphTarget {
  const n = rest.count
  const delta = new Float32Array(n * 3), grad = new Float32Array(n * 9)
  for (let i = 0; i < n; i++) {
    const p: Vec3 = [rest.center[i * 3], rest.center[i * 3 + 1], rest.center[i * 3 + 2]]
    const q = to(p, i)
    if (!q) continue
    delta[i * 3] = q[0] - p[0]; delta[i * 3 + 1] = q[1] - p[1]; delta[i * 3 + 2] = q[2] - p[2]
    for (let a = 0; a < 3; a++) {
      const hi: Vec3 = [p[0], p[1], p[2]], lo: Vec3 = [p[0], p[1], p[2]]
      hi[a] += h; lo[a] -= h
      const u = to(hi, i) ?? hi, v = to(lo, i) ?? lo
      // column a of J; grad keeps J − I, row-major
      for (let r = 0; r < 3; r++) grad[i * 9 + r * 3 + a] = (u[r] - v[r]) / (2 * h) - (r === a ? 1 : 0)
    }
  }
  return { delta, grad }
}

/**
 * Where a weight sits among a morph's targets: between `from` and `to`
 * (−1 is the rest shape, before the first target), a share `u` of the way,
 * carried on in a straight line past either end (u below 0 or over 1).
 */
export function shares(targets: number, w: number): [from: number, to: number, u: number] {
  const x = w * targets
  const seg = Math.min(targets - 1, Math.max(0, Math.floor(x)))
  return [seg - 1, seg, x - seg]
}

/**
 * The rest blobs with the morphs applied, into `out` (as many blobs as `rest`;
 * colors and opacities are left alone). 'centers' moves the centers only, as a
 * mesh morph would; 'shape' also pushes each blob's shape through J.
 */
export function applyMorphs(rest: Blobs, morphs: Morph[], weights: ArrayLike<number>, out: Blobs, mode: 'centers' | 'shape' = 'shape') {
  const n = rest.count
  out.count = n
  // each morph as (target, factor) terms: between neighbors a and b it is a + u·(b − a)
  const terms: [MorphTarget, number][] = []
  morphs.forEach((m, k) => {
    const w = weights[k] ?? 0
    if (!w || !m.targets.length) return
    const [a, b, u] = shares(m.targets.length, w)
    if (a >= 0 && u !== 1) terms.push([m.targets[a], 1 - u])
    if (u !== 0) terms.push([m.targets[b], u])
  })
  const J = new Float64Array(9), M = new Float64Array(9), eig = new Float64Array(12)
  for (let i = 0; i < n; i++) {
    let dx = 0, dy = 0, dz = 0, moved = false
    J.fill(0)
    for (const [t, f] of terms) {
      const d = t.delta, g = t.grad, o = i * 9
      dx += f * d[i * 3]; dy += f * d[i * 3 + 1]; dz += f * d[i * 3 + 2]
      for (let k = 0; k < 9; k++) { const v = g[o + k]; if (v !== 0) { J[k] += f * v; moved = true } }
    }
    out.center[i * 3] = rest.center[i * 3] + dx
    out.center[i * 3 + 1] = rest.center[i * 3 + 1] + dy
    out.center[i * 3 + 2] = rest.center[i * 3 + 2] + dz
    if (mode === 'centers' || !moved) {
      out.scale.set(rest.scale.subarray(i * 3, i * 3 + 3), i * 3)
      out.quat.set(rest.quat.subarray(i * 4, i * 4 + 4), i * 4)
      continue
    }
    J[0] += 1; J[4] += 1; J[8] += 1
    // M = J · R · S, so the covariance is M Mᵀ
    const R = quatMat3(rest.quat.subarray(i * 4, i * 4 + 4))
    const sx = rest.scale[i * 3], sy = rest.scale[i * 3 + 1], sz = rest.scale[i * 3 + 2]
    for (let r = 0; r < 3; r++) {
      const a = J[r * 3], b = J[r * 3 + 1], c = J[r * 3 + 2]
      M[r * 3] = (a * R[0] + b * R[3] + c * R[6]) * sx
      M[r * 3 + 1] = (a * R[1] + b * R[4] + c * R[7]) * sy
      M[r * 3 + 2] = (a * R[2] + b * R[5] + c * R[8]) * sz
    }
    const cov = [
      M[0] * M[0] + M[1] * M[1] + M[2] * M[2], M[0] * M[3] + M[1] * M[4] + M[2] * M[5], M[0] * M[6] + M[1] * M[7] + M[2] * M[8],
      M[3] * M[3] + M[4] * M[4] + M[5] * M[5], M[3] * M[6] + M[4] * M[7] + M[5] * M[8],
      M[6] * M[6] + M[7] * M[7] + M[8] * M[8],
    ]
    symEigen(cov, eig)
    out.scale[i * 3] = Math.sqrt(Math.max(0, eig[0]))
    out.scale[i * 3 + 1] = Math.sqrt(Math.max(0, eig[1]))
    out.scale[i * 3 + 2] = Math.sqrt(Math.max(0, eig[2]))
    out.quat.set(mat3ToQuat(eig.subarray(3)), i * 4)
  }
}

/** How many targets the morphs have in all: what a glTF primitive lists, in-betweens included. */
export function targetCount(morphs: Morph[]) {
  return morphs.reduce((s, m) => s + m.targets.length, 0)
}

/**
 * Each target's weight for the morphs' weights, in the order the morphs list
 * them: what a glTF file animates. A single-target morph's weight is its
 * target's; a morph with in-betweens spreads its weight over the two targets
 * either side of it (`shares`). `applyMorphs` gives the same blobs as adding up
 * every target times its weight here.
 */
export function targetWeights(morphs: Morph[], weights: ArrayLike<number>, out = new Float32Array(targetCount(morphs))) {
  out.fill(0)
  let at = 0
  morphs.forEach((m, k) => {
    const w = weights[k] ?? 0, n = m.targets.length
    if (w && n) {
      const [a, b, u] = shares(n, w)
      if (a >= 0) out[at + a] = 1 - u
      out[at + b] = u
    }
    at += n
  })
  return out
}

/**
 * A morph's weight back from its `k` targets' weights, starting at `from`: the
 * inverse of `targetWeights`. The last target with any weight says which stretch
 * the morph is on, and that weight says how far along it.
 */
export function morphWeight(tw: ArrayLike<number>, from: number, k: number) {
  for (let b = k - 1; b >= 0; b--) {
    const u = tw[from + b]
    if (u) return (b + u) / k
  }
  return 0
}
