import type { Blobs } from '../splat-core/blobs.ts'
import { toOklab } from '../splat-core/color.ts'
import type { Skeleton } from './rig.ts'

/**
 * Checks a scene can fail without anyone looking at it: its values (does it still read in grayscale) and its loop
 * (does anything visible snap from one place to another). Pure, for scene tests; issue #165.
 */

export interface Values {
  /** OKLab lightness of the 5th, 50th and 95th percentile blob. */
  dark: number
  mid: number
  light: number
  /** Share of blobs that are mid-gray mud: lightness 0.35 to 0.65 with hardly any color. */
  mud: number
}

/** The least spread from the 5th to the 95th percentile lightness a scene may have: below it, it reads as one tone. */
export const MIN_VALUE_RANGE = 0.24
/** The most mid-gray mud a scene may have. */
export const MAX_MUD = 0.25

/** A scene's spread of values, from its blobs' baked colors (sRGB). */
export function valuesOf(blobs: Blobs): Values {
  const n = blobs.count, L = new Float32Array(n)
  let mud = 0
  for (let i = 0; i < n; i++) {
    const [l, a, b] = toOklab([blobs.color[i * 3], blobs.color[i * 3 + 1], blobs.color[i * 3 + 2]])
    L[i] = l
    if (l >= 0.35 && l <= 0.65 && Math.hypot(a, b) < 0.025) mud++
  }
  L.sort()
  const q = (f: number) => (n ? L[Math.floor(f * (n - 1))] : 0)
  return { dark: q(0.05), mid: q(0.5), light: q(0.95), mud: n ? mud / n : 0 }
}

export interface Snap {
  bone: string
  /** The time the snap ends at, in seconds. */
  at: number
  /** How far the bone's origin went in that one frame. */
  by: number
}

/** A bone's size in a frame: shrinking to nothing is how scenes hide recycled sparks, bubbles and leaves. */
function sizeOf(m: ArrayLike<number>, o: number) {
  return Math.min(Math.hypot(m[o], m[o + 1], m[o + 2]), Math.hypot(m[o + 4], m[o + 5], m[o + 6]), Math.hypot(m[o + 8], m[o + 9], m[o + 10]))
}

/**
 * Bones that snap while seen: in one frame a bone's origin moves far more than in the frames either side (four times,
 * plus `slack`), and it is at least a quarter of its biggest size before and after. A fast flap is steady, so it
 * passes; a spark sent back to its start shrinks away first, so it passes; a move that doesn't join up, at the loop's
 * seam or anywhere, fails.
 * Bones named with `~` (specks) are skipped. Sampled `perSecond` times a second over one loop, wrapping round.
 */
export function loopSnaps(sk: Skeleton, pose: (sk: Skeleton, t: number) => void, loop: number, perSecond = 24, slack = 0.05): Snap[] {
  const n = Math.max(3, Math.round(loop * perSecond))
  const frames: Float32Array[] = []
  for (let k = 0; k < n; k++) {
    pose(sk, (k * loop) / n)
    frames.push(Float32Array.from(sk.matrix))
  }
  const snaps: Snap[] = []
  const step = (k: number, o: number) => {
    const a = frames[(k + n - 1) % n], b = frames[k % n]
    return Math.hypot(b[o + 12] - a[o + 12], b[o + 13] - a[o + 13], b[o + 14] - a[o + 14])
  }
  sk.bones.forEach((bone, bi) => {
    if (bone.name.startsWith('~')) return
    const o = bi * 16
    const big = Math.max(...frames.map((f) => sizeOf(f, o)))
    const shown = (m: Float32Array) => sizeOf(m, o) > big * 0.25
    for (let k = 0; k < n; k++) {
      const d = step(k, o)
      if (d <= slack) continue
      if (!shown(frames[(k + n - 1) % n]) || !shown(frames[k])) continue
      if (d > 4 * Math.max(step(k - 1 + n, o), step(k + 1, o)) + slack) snaps.push({ bone: bone.name, at: (k * loop) / n, by: d })
    }
  })
  return snaps
}
