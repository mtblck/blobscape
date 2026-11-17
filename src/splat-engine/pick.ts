import { rayHit } from '../splat-core/blobs.ts'
import type { Actor } from './engine.ts'

/**
 * Picking: which blob of which actor is under a pointer, as the actor stands
 * posed right now, and which bone and part it belongs to.
 *
 * Each blob's bones move it by a blend of their skin matrices. That blend, M,
 * carries the blob's rest ellipsoid to where it is drawn (exactly, in the
 * 'linear' rule; to within the rounding of a joint in 'quat'), and a straight
 * line through M is still a straight line with the same distances along it.
 * So the ray is taken back into the blob's rest frame through M⁻¹ and tested
 * against the rest blob there, with `rayHit`, as a still scene is.
 */
export interface PickHit {
  /** Index into the actors given. */
  actor: number
  blob: number
  /** Distance along the ray (in units of the direction's length). */
  t: number
  /** Where the ray meets the blob, in world space. */
  point: [number, number, number]
  /** The bone that holds most of the blob. */
  bone: number
  /** Its part (`Actor.partOf`), or 0 when the actor has none. */
  part: number
}

/** Options for `pickActors`. */
export interface PickOptions {
  /** How far out a blob counts, in standard deviations (2 is about where it fades to nothing). */
  k?: number
  /** Blobs fainter than this are looked through. */
  minOpacity?: number
}

/** The nearest blob a ray hits among posed actors, or null. Call each skeleton's `update()` first. */
export function pickActors(actors: readonly Actor[], origin: ArrayLike<number>, dir: ArrayLike<number>, { k = 1.6, minOpacity = 0.15 }: PickOptions = {}): PickHit | null {
  let best: PickHit | null = null
  const o = [0, 0, 0], d = [0, 0, 0]
  for (let a = 0; a < actors.length; a++) {
    const { blobs, skin, skeleton, partOf } = actors[a]
    const mat = skeleton.matrix
    for (let i = 0; i < blobs.count; i++) {
      if (blobs.opacity[i] < minOpacity) continue
      // the blended skin matrix, column-major 3×4
      let m0 = 0, m1 = 0, m2 = 0, m3 = 0, m4 = 0, m5 = 0, m6 = 0, m7 = 0, m8 = 0, m9 = 0, m10 = 0, m11 = 0
      let top = 0, topW = -1
      for (let j = 0; j < 4; j++) {
        const w = skin.weights[i * 4 + j]
        if (!w) continue
        const b = skin.joints[i * 4 + j], s = b * 16
        if (w > topW) { topW = w; top = b }
        m0 += w * mat[s]; m1 += w * mat[s + 1]; m2 += w * mat[s + 2]
        m3 += w * mat[s + 4]; m4 += w * mat[s + 5]; m5 += w * mat[s + 6]
        m6 += w * mat[s + 8]; m7 += w * mat[s + 9]; m8 += w * mat[s + 10]
        m9 += w * mat[s + 12]; m10 += w * mat[s + 13]; m11 += w * mat[s + 14]
      }
      // inverse of the 3×3 part (rows of the adjugate over the determinant)
      const c0 = m4 * m8 - m7 * m5, c1 = m7 * m2 - m1 * m8, c2 = m1 * m5 - m4 * m2
      const det = m0 * c0 + m3 * c1 + m6 * c2
      if (Math.abs(det) < 1e-18) continue // a bone grown to nothing: nothing to hit
      const r = 1 / det
      const i0 = c0 * r, i1 = c1 * r, i2 = c2 * r
      const i3 = (m6 * m5 - m3 * m8) * r, i4 = (m0 * m8 - m6 * m2) * r, i5 = (m3 * m2 - m0 * m5) * r
      const i6 = (m3 * m7 - m6 * m4) * r, i7 = (m6 * m1 - m0 * m7) * r, i8 = (m0 * m4 - m3 * m1) * r
      // inverse as column-major: column 0 = (i0, i1, i2), column 1 = (i3, i4, i5), column 2 = (i6, i7, i8)
      const px = origin[0] - m9, py = origin[1] - m10, pz = origin[2] - m11
      o[0] = i0 * px + i3 * py + i6 * pz; o[1] = i1 * px + i4 * py + i7 * pz; o[2] = i2 * px + i5 * py + i8 * pz
      d[0] = i0 * dir[0] + i3 * dir[1] + i6 * dir[2]; d[1] = i1 * dir[0] + i4 * dir[1] + i7 * dir[2]; d[2] = i2 * dir[0] + i5 * dir[1] + i8 * dir[2]
      const t = rayHit(blobs, i, o, d, k)
      if (t < 0 || (best && t >= best.t)) continue
      best = {
        actor: a, blob: i, t, bone: top, part: partOf ? partOf[i] : 0,
        point: [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t],
      }
    }
  }
  return best
}

/** How much of each blob of an actor moves with `bone`: its weight on that bone, 0–1. */
export function boneShare(actor: Pick<Actor, 'blobs' | 'skin'>, bone: number): Float32Array {
  const { blobs, skin } = actor
  const out = new Float32Array(blobs.count)
  for (let i = 0; i < blobs.count; i++) {
    for (let j = 0; j < 4; j++) if (skin.joints[i * 4 + j] === bone) out[i] += skin.weights[i * 4 + j]
  }
  return out
}

/** A bone's name for people: 'lForearm' → 'left forearm', 'flUpper' → 'front left upper', 'tail3' → 'tail 3'. */
export function boneLabel(name: string): string {
  const legs = /^([fb])([lr])(?=[A-Z])/.exec(name)
  const side = legs ? null : /^([lr])(?=[A-Z])/.exec(name)
  const lead = legs ? `${legs[1] === 'f' ? 'front' : 'back'} ${legs[2] === 'l' ? 'left' : 'right'} ` : side ? `${side[1] === 'l' ? 'left' : 'right'} ` : ''
  const rest = name.slice(legs ? 2 : side ? 1 : 0)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .trim()
  return lead + rest
}
