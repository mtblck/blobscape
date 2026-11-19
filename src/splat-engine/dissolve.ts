/**
 * Dissolving: the blobs on a bone shrink to nothing one by one, in an order of their own, each drifting up and a
 * little aside as it goes, so a thing leaves as a scatter of motes (and gathers from one when the amount runs back).
 *
 * A bone carries how far gone it is (`Skeleton.gone`, 0 to 1) and how far its blobs drift (`Skeleton.lift`, world
 * units); a blob takes the blend of its bones'. Which blob goes when is fixed by a hash of its index, so the same
 * amount is always the same picture.
 *
 * The GPU (`deformBlob` in engine.ts), `SplatWorld.deformCPU` and `skinCenters` all follow `dissolved`; change them
 * together.
 */
import { lodRank } from './lod.ts'

/** The share of the way over which one blob goes: the rest of it is spent waiting its turn. */
export const DISSOLVE_SOFT = 0.15
/** How far aside a blob drifts, as a share of its `lift`. */
export const DISSOLVE_ASIDE = 0.35
/** Mixed into a blob's index for its turn, so it isn't its place in line for level of detail. */
export const DISSOLVE_TURN = 0x5bd1e995
/** Mixed into a blob's index for the way it drifts aside. */
export const DISSOLVE_WAY = 0x2545f491

/**
 * What dissolving does to blob `i` when its bones are `gone` (0 to 1) with a drift of `lift`: writes how much of its
 * size is left (0 to 1) and how far it has drifted (x, y, z) into `out`, and returns it.
 */
export function dissolved(i: number, gone: number, lift: number, out: Float32Array | number[] = [0, 0, 0, 0]) {
  if (gone <= 0) { out[0] = 1; out[1] = out[2] = out[3] = 0; return out }
  const h = lodRank((i ^ DISSOLVE_TURN) >>> 0), from = h * (1 - DISSOLVE_SOFT)
  const k = Math.min(1, Math.max(0, (gone - from) / DISSOLVE_SOFT)), g = k * k * (3 - 2 * k)
  const turn = lodRank((i ^ DISSOLVE_WAY) >>> 0) * Math.PI * 2, d = g * lift
  out[0] = 1 - g
  out[1] = d * DISSOLVE_ASIDE * Math.cos(turn)
  out[2] = d * (0.5 + h)
  out[3] = d * DISSOLVE_ASIDE * Math.sin(turn)
  return out
}
