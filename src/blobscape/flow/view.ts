/**
 * What Sand, Snow and Goo draws: one actor holding every lane's ground, tray
 * and things (cut with voxel.ts, so they carry the same baked sun as every
 * other scene) and a blob for each particle a lane could hold. Everything is
 * built in the simulation's own units, shifted so each lane's floor middle is
 * at its lane bone, and the root bone scales it up for the stage.
 */
import { Blobs } from '../../splat-core/blobs.ts'
import { Skeleton, emptySkin, type Bone } from '../../splat-engine/rig.ts'
import { MATERIALS, PER_CELL, type Knobs, type Material } from '../../splat-engine/mpm.ts'
import { box, buildVoxels, type Shape, type VoxelPart } from '../../splat-engine/voxel.ts'
import { DETAILS, THING_BUILT, THINGS, groundShapes, thingShape, type Detail, type FlowFrame, type Ground, type Thing } from './box.ts'

type Vec3 = [number, number, number]

/** The box is this many world units a side. */
export const SIZE = 2.4
/** How far apart lanes stand, in box units. */
export const LANE_GAP = 1.02
/** A lane's place across the view, in box units from the middle: one lane stands in the middle. */
export const laneX = (lane: number, lanes: number) => (lane - (lanes - 1) / 2) * LANE_GAP

/** Each material's color, and what it is. */
export const LOOK: Record<Material, { label: string; color: Vec3; note: string }> = {
  sand: { label: 'Sand', color: [0.9, 0.72, 0.45], note: "Grains that can't pull on each other: it runs until its slopes are no steeper than its friction allows." },
  snow: { label: 'Snow', color: [0.95, 0.97, 1], note: 'Grains that hold on to each other: it breaks along cracks into clumps, and packs down for good where it is pressed.' },
  goo: { label: 'Goo', color: [0.45, 0.84, 0.34], note: 'Keeps its volume but not its shape: it flows as fast as its thickness lets it, and a thick one keeps a soft form.' },
}
const STONE: Vec3 = [0.56, 0.54, 0.52], WOOD: Vec3 = [0.42, 0.3, 0.2], CLAY: Vec3 = [0.72, 0.42, 0.3]
const THING_COLOR: Record<Thing, Vec3> = { ball: [0.95, 0.33, 0.23], cube: [0.2, 0.55, 0.62], rock: [0.45, 0.44, 0.47] }

/** A shape moved by `by`. */
function moved(s: Shape, by: Vec3): Shape {
  return {
    sdf: (x, y, z) => s.sdf(x - by[0], y - by[1], z - by[2]),
    min: [s.min[0] + by[0], s.min[1] + by[1], s.min[2] + by[2]], max: [s.max[0] + by[0], s.max[1] + by[1], s.max[2] + by[2]],
  }
}

/** What `flowActor` builds. */
export interface FlowActor {
  blobs: Blobs
  skin: ReturnType<typeof emptySkin>
  skeleton: Skeleton
  /** The first particle blob of lane 0; each lane has `capacity` of them, one lane after another. */
  from: number
  /** Particles a lane can hold. */
  capacity: number
  lanes: number
  /** The floor's height in box units. */
  floor: number
  /** A particle blob's radius in box units. */
  radius: number
}

/** Builds the actor for `lanes` boxes on this ground at this detail. */
export function flowActor(ground: Ground, detail: Detail, lanes: number): FlowActor {
  const { cells, capacity } = DETAILS[detail]
  const dx = 1 / cells, f = dx * 1.5
  const bones: Bone[] = [{ name: 'world', parent: -1, head: [0, 0, 0] }]
  const pieces: { blobs: Blobs; bone: number }[] = []
  const spacing = 0.0125
  // where the walls hold the material, with room for a particle's own size
  const lo = f - 0.5 - dx * 0.45, hi = 0.5 - dx * 1.55, t = 0.022, h = 0.05
  for (let l = 0; l < lanes; l++) {
    const x = laneX(l, lanes), at: Vec3 = [x, 0, 0]
    const lane = bones.length
    bones.push({ name: `lane${l}`, parent: 0, head: at })
    const shift: Vec3 = [x - 0.5, -f, -0.5]
    const parts: VoxelPart[] = groundShapes(ground, f).map((s) => ({ shape: moved(s, shift), color: ground === 'bowl' ? CLAY : STONE, bone: 'lane' }))
    const mid = (lo + hi) / 2, half = (hi - lo) / 2 + t
    for (const [cx, cz, hx, hz] of [[mid, lo - t / 2, half, t / 2], [mid, hi + t / 2, half, t / 2], [lo - t / 2, mid, t / 2, half], [hi + t / 2, mid, t / 2, half]])
      parts.push({ shape: box([x + cx, h / 2, cz], [hx, h / 2, hz], 0.006), color: WOOD, bone: 'lane' })
    pieces.push({ blobs: buildVoxels({ bones: [{ name: 'lane', parent: -1, head: at }], parts, spacing, disc: 0.75 }).blobs, bone: lane })
    for (const thing of THINGS) {
      const bone = bones.length
      bones.push({ name: `${thing.id}${l}`, parent: lane, head: at })
      const shape = moved(thingShape(thing.id, THING_BUILT), at)
      const color = thing.id === 'rock' ? (p: Vec3, n: Vec3): Vec3 => { const k = 0.85 + 0.25 * Math.abs(Math.sin(n[0] * 5 + n[1] * 7 + n[2] * 3 + p[1] * 40)); return [THING_COLOR.rock[0] * k, THING_COLOR.rock[1] * k, THING_COLOR.rock[2] * k] } : THING_COLOR[thing.id]
      pieces.push({ blobs: buildVoxels({ bones: [{ name: 'thing', parent: -1, head: at }], parts: [{ shape, color, bone: 'thing' }], spacing: spacing * 0.8, disc: 0.75 }).blobs, bone })
    }
  }
  const fixed = pieces.reduce((s, p) => s + p.blobs.count, 0)
  const total = fixed + capacity * lanes
  const blobs = new Blobs(total), skin = emptySkin(total)
  for (const p of pieces) for (let i = 0; i < p.blobs.count; i++) {
    const k = blobs.push(p.blobs.get(i))
    skin.joints[k * 4] = p.bone
    skin.weights[k * 4] = 1
  }
  const radius = (dx / PER_CELL) * 0.5
  for (let i = fixed; i < total; i++) {
    blobs.push({ center: [0, -10, 0], scale: [1e-4, 1e-4, 1e-4], quat: [0, 0, 0, 1], color: [1, 1, 1], opacity: 0 })
    skin.weights[i * 4] = 1
  }
  return { blobs, skin, skeleton: new Skeleton(bones), from: fixed, capacity, lanes, floor: f, radius }
}

/** A small hash for a particle's grain: the same particle always has the same shade. */
const grain = (i: number) => { let h = Math.imul(i + 1, 2654435761) >>> 0; h ^= h >>> 15; return (h % 1000) / 1000 }

/** Writes one lane's frame into its blobs. A lane with no frame (`null`) is hidden. */
export function showLane(a: FlowActor, lane: number, f: FlowFrame | null, material: Material, knobs: Knobs) {
  const { center, color, opacity, scale } = a.blobs
  const x0 = laneX(lane, a.lanes) - 0.5, base = a.from + lane * a.capacity, r = a.radius
  const n = f ? Math.min(f.count, a.capacity) : 0
  const c = LOOK[material].color
  // damp sand is darker; packed snow is a shade bluer and darker, so a print in it shows
  const wet = material === 'sand' ? 1 - 0.28 * knobs.sand.damp : 1
  for (let i = 0; i < a.capacity; i++) {
    const b = base + i
    if (i < n) {
      center[b * 3] = f!.x[i * 3] + x0
      center[b * 3 + 1] = f!.x[i * 3 + 1] - a.floor
      center[b * 3 + 2] = f!.x[i * 3 + 2] - 0.5
      const k = (0.9 + 0.1 * grain(i)) * (f!.shade[i] / 255) * wet * 1.12
      const packed = f!.tone[i] / 255
      color[b * 3] = Math.min(1, c[0] * k * (1 - 0.3 * packed)); color[b * 3 + 1] = Math.min(1, c[1] * k * (1 - 0.2 * packed)); color[b * 3 + 2] = Math.min(1, c[2] * k * (1 - 0.06 * packed))
      opacity[b] = 1
      scale[b * 3] = scale[b * 3 + 1] = scale[b * 3 + 2] = r
    } else if (opacity[b] !== 0) {
      opacity[b] = 0
      scale[b * 3] = scale[b * 3 + 1] = scale[b * 3 + 2] = 1e-4
      center[b * 3 + 1] = -10
    }
  }
}

/** Poses one lane's things from its frame: the one that is falling at its place, turn and size, the others gone. */
export function poseThings(a: FlowActor, lane: number, f: FlowFrame | null, thing: Thing) {
  const sk = a.skeleton
  for (const t of THINGS) {
    const b = sk.index(`${t.id}${lane}`)
    if (!f || !f.body.length || t.id !== thing) { sk.size[b] = 0; continue }
    sk.size[b] = f.body[7] / THING_BUILT
    sk.offset.set([f.body[0] - 0.5, f.body[1] - a.floor, f.body[2] - 0.5], b * 3)
    sk.rotation.set(f.body.subarray(3, 7), b * 4)
  }
}

export { MATERIALS }
