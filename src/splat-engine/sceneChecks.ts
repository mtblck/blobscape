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

/** A part that passes through another while the scene plays. */
export interface Clash {
  /** The part that moves into the other, by its place in the scene's list. */
  part: number
  /** The part it passes through. */
  into: number
  /** The time it is deepest in, in seconds. */
  at: number
  /** How many of the moving part's blobs are in the other's surface then. */
  blobs: number
  /** The bone that carries the moving part. */
  bone: string
}

/** A part clashes when this share of its blobs (and at least `CLASH_LEAST`) sit in another part's surface at once. */
export const CLASH_SHARE = 0.05
export const CLASH_LEAST = 12

/**
 * Parts that pass through each other as the scene plays: sails through a tower, a tail through a wall. It works from
 * the blobs alone, so it suits anything built, scene or creature. A blob is in another part's surface when, posed, it
 * lies within about half a grid cell of one of that part's blobs, the two ride different bones, and at rest it stood
 * clear of that part (over two cells from all of it), so a joint, a wheel on its axle and anything that touches by
 * design never count. A part clashes with another when `CLASH_SHARE` of its blobs (at least `CLASH_LEAST`) are in
 * the other's surface in one frame; each pair is reported once, at its worst frame.
 *
 * `spacing` is the grid the scene was cut on. Bones named with `~` (specks, which land on things) and bones shrunk
 * to under a quarter of their size are skipped, as in `loopSnaps`. Sampled `perSecond` times a second over one loop.
 */
export function partClashes(
  built: { blobs: Blobs; skin: { joints: ArrayLike<number>; weights: ArrayLike<number> }; skeleton: Skeleton; partOf: ArrayLike<number> },
  pose: (sk: Skeleton, t: number) => void, loop: number, spacing: number, perSecond = 6,
): Clash[] {
  const { blobs, skin, skeleton: sk, partOf } = built
  const n = blobs.count
  // each blob's heaviest bone carries it
  const bone = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    let best = 0
    for (let k = 1; k < 4; k++) if (skin.weights[i * 4 + k] > skin.weights[i * 4 + best]) best = k
    bone[i] = skin.joints[i * 4 + best]
  }
  const frames = Math.max(3, Math.round(loop * perSecond))
  const mats: Float32Array[] = []
  for (let k = 0; k < frames; k++) { pose(sk, (k * loop) / frames); mats.push(Float32Array.from(sk.matrix)) }
  sk.reset()
  // a bone moves when its matrix changes over the loop
  const moves = sk.bones.map((b, bi) => {
    if (b.name.startsWith('~')) return false
    const o = bi * 16
    return mats.some((m) => { for (let q = 0; q < 16; q++) if (Math.abs(m[o + q] - mats[0][o + q]) > 1e-5) return true; return false })
  })
  const skipped = sk.bones.map((b) => b.name.startsWith('~'))
  const big = sk.bones.map((_, bi) => Math.max(...mats.map((m) => sizeOf(m, bi * 16))))

  const cellKey = (x: number, y: number, z: number) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512)
  const grid = (h: number, at: (i: number) => readonly [number, number, number], take: (i: number) => boolean) => {
    const cells = new Map<number, number[]>()
    for (let i = 0; i < n; i++) {
      if (!take(i)) continue
      const p = at(i), key = cellKey(Math.floor(p[0] / h), Math.floor(p[1] / h), Math.floor(p[2] / h))
      const list = cells.get(key)
      if (list) list.push(i); else cells.set(key, [i])
    }
    return cells
  }
  const rest = (i: number) => [blobs.center[i * 3], blobs.center[i * 3 + 1], blobs.center[i * 3 + 2]] as const
  const posed = (m: Float32Array) => (i: number) => {
    const o = bone[i] * 16, x = blobs.center[i * 3], y = blobs.center[i * 3 + 1], z = blobs.center[i * 3 + 2]
    return [m[o] * x + m[o + 4] * y + m[o + 8] * z + m[o + 12], m[o + 1] * x + m[o + 5] * y + m[o + 9] * z + m[o + 13], m[o + 2] * x + m[o + 6] * y + m[o + 10] * z + m[o + 14]] as const
  }

  // which parts each moving blob stands beside at rest: those it may touch
  const clear = spacing * 2, hRest = clear
  const restCells = grid(hRest, rest, (i) => !skipped[bone[i]])
  const beside: Set<number>[] = []
  const moving: number[] = []
  for (let i = 0; i < n; i++) {
    if (!moves[bone[i]]) continue
    moving.push(i)
    const p = rest(i), set = new Set<number>()
    const cx = Math.floor(p[0] / hRest), cy = Math.floor(p[1] / hRest), cz = Math.floor(p[2] / hRest)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const j of restCells.get(cellKey(cx + dx, cy + dy, cz + dz)) ?? []) {
        if (partOf[j] === partOf[i] || set.has(partOf[j])) continue
        const q = rest(j)
        if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) <= clear) set.add(partOf[j])
      }
    }
    beside[i] = set
  }
  if (!moving.length) return []
  const size = new Map<number, number>()
  for (const i of moving) size.set(partOf[i], (size.get(partOf[i]) ?? 0) + 1)

  const near = spacing * 0.55
  const worst = new Map<string, Clash>()
  for (let k = 0; k < frames; k++) {
    const m = mats[k], at = posed(m)
    const shown = (b: number) => !skipped[b] && sizeOf(m, b * 16) > big[b] * 0.25
    const cells = grid(spacing, at, (i) => shown(bone[i]))
    const hits = new Map<string, number>()
    for (const i of moving) {
      if (!shown(bone[i])) continue
      const p = at(i), cx = Math.floor(p[0] / spacing), cy = Math.floor(p[1] / spacing), cz = Math.floor(p[2] / spacing)
      let into = -1
      look: for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const j of cells.get(cellKey(cx + dx, cy + dy, cz + dz)) ?? []) {
          if (bone[j] === bone[i] || partOf[j] === partOf[i] || beside[i].has(partOf[j])) continue
          const q = at(j)
          if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) <= near) { into = partOf[j]; break look }
        }
      }
      if (into >= 0) { const key = `${partOf[i]}>${into}`; hits.set(key, (hits.get(key) ?? 0) + 1) }
    }
    for (const [key, count] of hits) {
      const [part, into] = key.split('>').map(Number)
      if (count < Math.max(CLASH_LEAST, (size.get(part) ?? 0) * CLASH_SHARE)) continue
      // a pair is one clash whichever of the two is counted as moving
      const pair = part < into ? `${part}|${into}` : `${into}|${part}`
      const was = worst.get(pair)
      if (!was || count > was.blobs) {
        const b = moving.find((i) => partOf[i] === part)!
        worst.set(pair, { part, into, at: (k * loop) / frames, blobs: count, bone: sk.bones[bone[b]].name })
      }
    }
  }
  return [...worst.values()].sort((a, b) => b.blobs - a.blobs)
}
