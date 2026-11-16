import { Blobs, type Quat, type Vec3 } from '../../splat-core/blobs.ts'
import type { PointLight } from '../../splat-engine/engine.ts'
import { Skeleton, emptySkin } from '../../splat-engine/rig.ts'
import { both, coreBox, extent, faintMask, findFloor, floaterMask, floorMask, hugeMask, keepOnly, kept, leveling, mulQ, rotate, type Mask } from './clean.ts'

/**
 * Scan Studio's whole pipeline in plain numbers, from the scan as opened to
 * the object you take away: turn it level and to a working size, work out
 * which blobs each clean-up step keeps, preview that, light it, and pack the
 * result. The page only holds the settings and draws.
 */

/** The working size: the middle of a scan is scaled to about this many units across, so every slider means the same on any scan. */
export const WORK = 3

export interface Orient {
  /** Turn applied to the scan as opened. */
  q: Quat
  /** Where the floor is after that turn (y), or null to take the bottom of the scan. */
  floorY: number | null
}

export const UNTURNED: Orient = { q: [0, 0, 0, 1], floorY: null }

/** Finds the table and turns it level; null when there's no flat surface to find. */
export function autoOrient(raw: Blobs): Orient | null {
  const p = findFloor(raw)
  if (!p) return null
  const { q, lift } = leveling(p)
  return { q, floorY: -lift }
}

/** A quarter turn on top of the current one (for scans with no table to find). */
export function tip(o: Orient, turn: Quat): Orient {
  return { q: mulQ(turn, o.q), floorY: null }
}

/**
 * The scan turned by `o`, with its floor at y = 0, the middle of it over the
 * origin and scaled to WORK units across. Returns the new list and the scale
 * it was grown by.
 */
export function working(raw: Blobs, o: Orient): { blobs: Blobs; scale: number } {
  const out = raw.clone()
  const q = o.q
  for (let i = 0; i < raw.count; i++) {
    out.center.set(rotate(q, raw.center.subarray(i * 3, i * 3 + 3)), i * 3)
    out.quat.set(mulQ(q, raw.quat.subarray(i * 4, i * 4 + 4)), i * 4)
  }
  const floorY = o.floorY ?? coreBox(out, 0.98).lo[1]
  // with a table found, the middle and the size come from what stands on it: a scan is often mostly table
  const core = o.floorY === null ? coreBox(out, 0.9) : objectBox(out, floorY)
  const across = Math.max(core.hi[0] - core.lo[0], core.hi[1] - core.lo[1], core.hi[2] - core.lo[2])
  const s = across > 0 ? WORK / across : 1
  const cx = (core.lo[0] + core.hi[0]) / 2, cz = (core.lo[2] + core.hi[2]) / 2
  for (let i = 0; i < out.count; i++) {
    out.center[i * 3] = (out.center[i * 3] - cx) * s
    out.center[i * 3 + 1] = (out.center[i * 3 + 1] - floorY) * s
    out.center[i * 3 + 2] = (out.center[i * 3 + 2] - cz) * s
    for (let k = 0; k < 3; k++) out.scale[i * 3 + k] *= s
  }
  return { blobs: out, scale: s }
}

/** The core box of the blobs clearly above the floor (a little over 1% of the scan's height), or of all of them if too few are. */
function objectBox(b: Blobs, floorY: number) {
  const all = coreBox(b, 0.9)
  const rise = 0.015 * Math.max(all.hi[0] - all.lo[0], all.hi[1] - all.lo[1], all.hi[2] - all.lo[2])
  const m = new Uint8Array(b.count)
  let n = 0
  for (let i = 0; i < b.count; i++) if (b.center[i * 3 + 1] > floorY + rise) { m[i] = 1; n++ }
  return n > 200 ? coreBox(keepOnly(b, m), 0.9) : all
}

/** The object's size in working units (its diagonal, about): what Huge blobs are measured against. */
export const OBJECT_SIZE = WORK * 1.4

export interface Clean {
  /** Cut everything below this height (working units); 0 leaves the floor. */
  floor: number
  /** Keep only blobs within this distance of the middle, across; null keeps all. */
  radius: number | null
  /** Keep only blobs below this height; null keeps all. */
  top: number | null
  /** Floater removal, 0 (off) to 1. */
  floaters: number
  /** Drop blobs fainter than this opacity; 0 keeps all. */
  faint: number
  /** Drop blobs whose longest axis is more than this share of the object's size; null keeps all. */
  huge: number | null
}

export const DEFAULT_CLEAN: Clean = { floor: 0.04, radius: null, top: null, floaters: 0.5, faint: 0.08, huge: 0.08 }

/** Each step's mask (undefined when it's off) and all of them together. */
export function cleanMasks(b: Blobs, c: Clean) {
  return cleaner()(b, c)
}

/**
 * `cleanMasks` that remembers each step's mask by its own setting, so moving
 * one slider only redoes that step (and floaters, which depend on the rest).
 */
export function cleaner() {
  const memo = new Map<string, { b: Blobs; key: string; m: Mask | undefined }>()
  const step = (name: string, b: Blobs, key: unknown, make: () => Mask | undefined) => {
    const k = JSON.stringify(key), hit = memo.get(name)
    if (hit && hit.b === b && hit.key === k) return hit.m
    const m = make()
    memo.set(name, { b, key: k, m })
    return m
  }
  return (b: Blobs, c: Clean) => {
    const floor = step('floor', b, c.floor, () => (c.floor > 0 ? floorMask(b, c.floor) : undefined))
    const crop = step('crop', b, [c.radius, c.top], () => (c.radius !== null || c.top !== null ? cropMask(b, c.radius ?? Infinity, c.top ?? Infinity) : undefined))
    const faint = step('faint', b, c.faint, () => (c.faint > 0 ? faintMask(b, c.faint) : undefined))
    const huge = step('huge', b, c.huge, () => (c.huge !== null ? hugeMask(b, c.huge, OBJECT_SIZE) : undefined))
    // floaters are judged among what the other steps keep, so the table doesn't join everything up
    const floaters = step('floaters', b, [c.floaters, c.floor, c.radius, c.top, c.faint, c.huge], () => (c.floaters > 0 ? floaterMask(b, c.floaters, both(floor, crop, faint, huge)) : undefined))
    const all = both(floor, crop, faint, huge, floaters)
    return { floor, crop, faint, huge, floaters, all, kept: kept(all, b.count) }
  }
}

/** Keeps blobs within `radius` of the y axis and below `top`. */
export function cropMask(b: Blobs, radius: number, top: number): Mask {
  const m = new Uint8Array(b.count)
  const r2 = radius * radius
  for (let i = 0; i < b.count; i++) {
    const x = b.center[i * 3], z = b.center[i * 3 + 2]
    m[i] = x * x + z * z <= r2 && b.center[i * 3 + 1] <= top ? 1 : 0
  }
  return m
}

/** Red, for blobs about to be cut when they're shown. */
export const CUT_RED: Vec3 = [0.95, 0.16, 0.12]

/** What the view shows: the kept blobs, and if `showCut`, the rest in faint red. */
export function preview(b: Blobs, mask: Mask | undefined, showCut: boolean): Blobs {
  if (!mask) return b
  if (!showCut) return keepOnly(b, mask)
  const out = b.clone()
  for (let i = 0; i < b.count; i++) {
    if (mask[i]) continue
    out.color.set(CUT_RED, i * 3)
    // faint, so the kept blobs still read through the haze of cut ones
    out.opacity[i] = Math.min(b.opacity[i] * 0.5, 0.22)
  }
  return out
}

/** The size the finished object is scaled to (its tallest or widest side), about the size of the sandbox's own scenes. */
export const FINISHED = 1.6

/** The kept blobs as an object of their own: standing on y = 0, centerd, FINISHED units at its biggest. */
export function finish(b: Blobs, mask: Mask | undefined): Blobs {
  const out = mask ? keepOnly(b, mask) : b.clone()
  if (!out.count) return out
  const { lo, hi } = extent(out)
  const big = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
  const s = big > 0 ? FINISHED / big : 1
  const cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2
  for (let i = 0; i < out.count; i++) {
    out.center[i * 3] = (out.center[i * 3] - cx) * s
    out.center[i * 3 + 1] = (out.center[i * 3 + 1] - lo[1]) * s
    out.center[i * 3 + 2] = (out.center[i * 3 + 2] - cz) * s
    for (let k = 0; k < 3; k++) out.scale[i * 3 + k] *= s
  }
  return out
}

export type LightId = 'scanned' | 'lamp' | 'daylight' | 'candle' | 'duo'

export const LIGHTS: { id: LightId; label: string; ambient: number; note: string }[] = [
  { id: 'scanned', label: 'As scanned', ambient: 1, note: 'The colors the phone saw, light and shade baked in.' },
  { id: 'lamp', label: 'Lamp', ambient: 0.22, note: 'A warm lamp above and to one side.' },
  { id: 'daylight', label: 'Daylight', ambient: 0.5, note: 'Cool light from high up.' },
  { id: 'candle', label: 'Candle', ambient: 0.14, note: 'A low orange flame close by.' },
  { id: 'duo', label: 'Two colors', ambient: 0.2, note: 'Magenta from one side, cyan from the other.' },
]

/**
 * The lights for a preset, placed round the kept blobs' bounds (so they sit
 * as close to a cropped mug as to a whole table) and turned by `angle` degrees
 * about the upright.
 */
export function lightsFor(id: LightId, angle: number, lo: Vec3, hi: Vec3): PointLight[] {
  const c: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
  const r = Math.max(0.05, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2)
  const a = (angle * Math.PI) / 180
  const at = (out: number, up: number, turn = 0): [number, number, number] => [c[0] + Math.cos(a + turn) * out * r, c[1] + up * r, c[2] + Math.sin(a + turn) * out * r]
  switch (id) {
    case 'scanned': return []
    case 'lamp': return [{ position: at(1.2, 1.0), color: [5, 3.4, 1.9], range: 1.3 * r }]
    case 'daylight': return [{ position: at(0.9, 2.2), color: [2.4, 2.6, 3.1], range: 2.2 * r }]
    case 'candle': return [{ position: at(0.95, -0.2), color: [5, 2.2, 0.6], range: 0.9 * r }]
    case 'duo': return [
      { position: at(1.2, 0.6), color: [4.2, 0.6, 2.6], range: 1.1 * r },
      { position: at(1.2, 0.6, Math.PI), color: [0.5, 2.6, 4.2], range: 1.1 * r },
    ]
  }
}

/** A still object for the engine: every blob on one bone that never moves. */
export function stillActor(blobs: Blobs) {
  const skeleton = new Skeleton([{ name: 'scan', parent: -1, head: [0, 0, 0] }])
  const skin = emptySkin(blobs.count)
  // all on bone 0 at full weight (what setWeights would write, without its sorting per blob)
  for (let i = 0; i < blobs.count; i++) skin.weights[i * 4] = 1
  return { blobs, skin, skeleton }
}
