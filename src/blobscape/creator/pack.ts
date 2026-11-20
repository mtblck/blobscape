import { Blobs } from '../../splat-core/blobs.ts'
import { Skeleton, type Bone } from '../../splat-engine/rig.ts'
import type { Built } from '../../splat-engine/body.ts'

/**
 * A cut as plain data, so a worker can hand it to the page: its typed arrays are moved, not copied (`movable`), and
 * the page puts the skeleton back together from its bones.
 */
export interface PackedCut {
  count: number
  center: Float32Array
  scale: Float32Array
  quat: Float32Array
  color: Float32Array
  opacity: Float32Array
  joints: Uint8Array
  weights: Float32Array
  partOf: Uint16Array
  seen?: Uint8Array
  glow?: Uint8Array
  bones: Bone[]
  /** A creature's own colors, for the palette (`colorsOf`); props bring theirs in their descriptions. */
  colors?: string[]
}

/** A cut packed, its arrays trimmed to the blobs it has. */
export function pack(b: Built): PackedCut {
  const n = b.blobs.count
  return {
    count: n,
    center: b.blobs.center.slice(0, n * 3),
    scale: b.blobs.scale.slice(0, n * 3),
    quat: b.blobs.quat.slice(0, n * 4),
    color: b.blobs.color.slice(0, n * 3),
    opacity: b.blobs.opacity.slice(0, n),
    joints: b.skin.joints.slice(0, n * 4),
    weights: b.skin.weights.slice(0, n * 4),
    partOf: b.partOf.slice(0, n),
    seen: b.seen?.slice(0, n * 4),
    glow: b.glow?.slice(0, n),
    bones: b.skeleton.bones.map((x) => ({ ...x, head: [...x.head] as Bone['head'] })),
  }
}

/** The buffers a packed cut can hand over with it. */
export const movable = (p: PackedCut): ArrayBuffer[] =>
  [p.center, p.scale, p.quat, p.color, p.opacity, p.joints, p.weights, p.partOf, p.seen, p.glow].filter((a) => !!a).map((a) => a!.buffer as ArrayBuffer)

/** A packed cut as a cut again, with a skeleton of its own at rest. */
export function unpack(p: PackedCut): Built {
  const blobs = new Blobs(0)
  blobs.count = p.count
  blobs.center = p.center
  blobs.scale = p.scale
  blobs.quat = p.quat
  blobs.color = p.color
  blobs.opacity = p.opacity
  return { blobs, skin: { joints: p.joints, weights: p.weights }, skeleton: new Skeleton(p.bones), partOf: p.partOf, seen: p.seen, glow: p.glow }
}
