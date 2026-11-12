import { Blobs } from '../../splat-core/blobs.ts'
import { both, faintMask, floaterMask, hugeMask, type Mask } from '../scan/clean.ts'
import { logit, sigmoid, type Model } from './train3d.ts'

/**
 * The Floaters lesson's cleanup: Scan Studio's own cuts (faint, huge,
 * floaters) run on blobs the Photo shoot trainer made, so the floaters are
 * real ones, from too few photos.
 */

/** Two ways the bird was captured: a hurried pair of photos, or eight all round. */
export const CAPTURES = [
  { id: 'quick', name: 'Two quick photos', azimuths: [0, 30] },
  { id: 'round', name: 'Eight all round', azimuths: [0, 45, 90, 135, 180, 225, 270, 315] },
] as const
export type CaptureId = (typeof CAPTURES)[number]['id']

export interface Cuts {
  /** Drop blobs fainter than this opacity; 0 keeps all. */
  faint: number
  /** Drop blobs wider than this (world units, standard deviation); 0 keeps all. */
  huge: number
  /** Floater removal, 0 (off) to 1. */
  floaters: number
}
export const NO_CUTS: Cuts = { faint: 0, huge: 0, floaters: 0 }

/** Round blobs as ordinary splat blobs (for the cuts, and for the sandbox). */
export function asBlobs(m: Model): Blobs {
  const b = new Blobs(m.count)
  for (let i = 0; i < m.count; i++) {
    const s = Math.exp(m.logS[i])
    b.push({
      centre: [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]],
      scale: [s, s, s],
      quat: [0, 0, 0, 1],
      colour: [sigmoid(m.col[i * 3]), sigmoid(m.col[i * 3 + 1]), sigmoid(m.col[i * 3 + 2])],
      opacity: sigmoid(m.op[i]),
    })
  }
  return b
}

/** Which blobs survive the cuts (1 keeps), or undefined when nothing is cut. */
export function cutMask(m: Model, c: Cuts): Mask | undefined {
  if (!c.faint && !c.huge && !c.floaters) return undefined
  const b = asBlobs(m)
  // hugeMask measures against a size: 1 makes `share` plain world units
  return both(c.faint ? faintMask(b, c.faint) : undefined, c.huge ? hugeMask(b, c.huge, 1) : undefined, c.floaters ? floaterMask(b, c.floaters) : undefined)
}

/** The model with only the kept blobs. */
export function keepOnly(m: Model, mask: Mask | undefined): Model {
  if (!mask) return m
  const idx: number[] = []
  for (let i = 0; i < m.count; i++) if (mask[i]) idx.push(i)
  const o: Model = { count: idx.length, pos: new Float64Array(idx.length * 3), logS: new Float64Array(idx.length), col: new Float64Array(idx.length * 3), op: new Float64Array(idx.length) }
  idx.forEach((i, j) => {
    o.pos.set(m.pos.subarray(i * 3, i * 3 + 3), j * 3)
    o.col.set(m.col.subarray(i * 3, i * 3 + 3), j * 3)
    o.logS[j] = m.logS[i]
    o.op[j] = m.op[i]
  })
  return o
}

const RED = [logit(0.95), logit(0.16), logit(0.12)]

/** The model with the blobs about to be cut shown red, and solid enough to see even if they were faint. */
export function markCut(m: Model, mask: Mask | undefined): Model {
  if (!mask) return m
  const o: Model = { count: m.count, pos: m.pos, logS: m.logS, col: m.col.slice(), op: m.op.slice() }
  for (let i = 0; i < m.count; i++) {
    if (mask[i]) continue
    o.col.set(RED, i * 3)
    o.op[i] = Math.max(o.op[i], logit(0.6))
  }
  return o
}
