import type { Vec3 } from '../../splat-core/blobs.ts'
import type { Built } from '../body.ts'
import { axisAngle, mulQ, type Skeleton } from '../rig.ts'
import { compileScene, type BoneDoc, type MoveDoc, type SceneDoc, type ShapeDoc } from '../sceneDoc.ts'
import { toCount } from '../sculpt.ts'
import { buildVoxels, type VoxelSpec } from '../voxel.ts'

/**
 * A creature lifted straight out of a pixel scene (diorama/scenes/*.ts): the
 * scene's own parts and bones, cut by the same builder, without the land round
 * them. It is turned to face +z and set down on the floor at the origin, as
 * every creature of the zoo stands.
 *
 * Each part hangs on one bone, as in the scene, so these move in stiff pieces
 * (a tail of three segments, a head that turns) rather than bending.
 */
export interface FromScene {
  doc: SceneDoc
  /** The bones that come along, with the parts on them. */
  keep: RegExp
  /** Bones the scene did not need, in the scene's own coordinates (legs for a crocodile that only basked); one named as a kept bone replaces it. */
  bones?: BoneDoc[]
  /** Parts, by their place in the scene's list, hung on another bone. */
  hang?: Record<number, string>
  /** Parts given another shape. */
  reshape?: Record<number, ShapeDoc>
  /** Quarter turns about y that bring its front round to +z. */
  turn: number
  /** Where the scene's origin goes, after the turn. */
  shift: Vec3
}

export interface SceneCreature {
  cut(count: number): Built
  /** The scene's own moves for these bones, as one pose that repeats every `loop` seconds. */
  idle(sk: Skeleton, t: number): void
  loop: number
  /** A point or a direction of the scene, as the creature has it. */
  point(p: Vec3): Vec3
  dir(v: Vec3): Vec3
}

const TAU = Math.PI * 2
const AXIS: Record<'x' | 'y' | 'z', Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }

export function sceneCreature(c: FromScene): SceneCreature {
  // a quarter turn about y is exact: no rounding to blur the grid
  const k = ((c.turn % 4) + 4) % 4
  const cos = [1, 0, -1, 0][k], sin = [0, -1, 0, 1][k]
  const dir = (v: Vec3): Vec3 => [cos * v[0] + sin * v[2], v[1], -sin * v[0] + cos * v[2]]
  const point = (p: Vec3): Vec3 => { const q = dir(p); return [q[0] + c.shift[0], q[1] + c.shift[1], q[2] + c.shift[2]] }
  /** Back to the scene's coordinates: its shapes and paints are asked there. */
  const back = (x: number, y: number, z: number): Vec3 => { const a = x - c.shift[0], b = z - c.shift[2]; return [cos * a - sin * b, y - c.shift[1], sin * a + cos * b] }
  const backDir = (v: Vec3): Vec3 => [cos * v[0] - sin * v[2], v[1], sin * v[0] + cos * v[2]]

  const replaced = new Set((c.bones ?? []).map((b) => b.name))
  const kept = (c.doc.bones ?? []).filter((b) => c.keep.test(b.name) && !replaced.has(b.name))
  const bones = [...kept, ...(c.bones ?? [])]
  const names = new Set(bones.map((b) => b.name))
  // a bone whose parent stayed behind rides on nothing
  const doc: SceneDoc = {
    ...c.doc,
    bones: order(bones.map((b) => (b.parent && !names.has(b.parent) ? { name: b.name, at: b.at } : b))),
    parts: c.doc.parts.flatMap((p, i) => {
      const bone = c.hang?.[i] ?? p.bone
      return bone && names.has(bone) ? [{ ...p, bone, shape: c.reshape?.[i] ?? p.shape }] : []
    }),
    moves: [],
    lights: [],
    // the creature leaves the scene's air behind: its specks, mist and haze
    air: undefined, cover: undefined,
  }
  const compiled = compileScene(doc, { puffs: false })
  const moves = (c.doc.moves ?? []).filter((m) => names.has(m.bone))

  const cutAt = (spacing: number): Built => {
    const spec = compiled.spec(spacing)
    const turned: VoxelSpec = {
      spacing,
      // brighter than a scene, which is lit for its palette and its lamps: here the creature stands alone
      light: { dir: dir(c.doc.light?.from ?? [-0.45, 0.75, 0.5]), ambient: 0.6, shadow: 0.5 },
      bones: spec.bones.map((b) => ({ ...b, head: b.parent < 0 ? b.head : point(b.head) })),
      parts: spec.parts.map((p) => {
        const { sdf, min, max } = p.shape
        const a = point(min), b = point(max)
        const color = p.color
        return {
          ...p,
          // asked millions of times: no array per call
          shape: { sdf: (x, y, z) => { const u = x - c.shift[0], w = z - c.shift[2]; return sdf(cos * u - sin * w, y - c.shift[1], sin * u + cos * w) }, min: [Math.min(a[0], b[0]), a[1], Math.min(a[2], b[2])], max: [Math.max(a[0], b[0]), b[1], Math.max(a[2], b[2])] },
          color: typeof color === 'function' ? (q: Vec3, n: Vec3) => color(back(q[0], q[1], q[2]), backDir(n)) : color,
        }
      }),
    }
    return buildVoxels(turned)
  }

  return {
    cut: (count) => toCount(cutAt, count, 0.05),
    loop: c.doc.loop,
    point,
    dir,
    idle(sk, t) {
      sk.reset()
      const u = t / c.doc.loop
      for (const m of moves) applyMove(sk, m, u, dir)
      sk.update()
    },
  }
}

/** Parents before children, whatever order they were given in. */
function order(bones: BoneDoc[]): BoneDoc[] {
  const out: BoneDoc[] = [], done = new Set<string>()
  let left = bones
  while (left.length) {
    const next = left.filter((b) => !b.parent || done.has(b.parent))
    if (!next.length) throw new Error(`bones ride on each other in a ring: ${left.map((b) => b.name).join(', ')}`)
    for (const b of next) { out.push(b); done.add(b.name) }
    left = left.filter((b) => !done.has(b.name))
  }
  return out
}

/** One move of a scene (sceneDoc.ts `pose`), with its axis or its slide turned as the creature is. */
function applyMove(sk: Skeleton, m: MoveDoc, u: number, dir: (v: Vec3) => Vec3) {
  const b = sk.index(m.bone), at = u * m.times + (m.phase ?? 0)
  if (m.kind === 'spin' || m.kind === 'sway') {
    const q = axisAngle(dir(AXIS[m.axis]), m.kind === 'spin' ? at * TAU : Math.sin(at * TAU) * m.degrees * (Math.PI / 180))
    sk.setRotation(b, mulQ(sk.rotation.subarray(b * 4, b * 4 + 4), q))
  } else if (m.kind === 'bob') {
    const by = dir(m.by), k = Math.sin(at * TAU)
    for (let i = 0; i < 3; i++) sk.offset[b * 3 + i] += by[i] * k
  } else if (m.kind === 'drift') {
    const by = dir(m.by), life = ((at % 1) + 1) % 1, [g0, g1] = m.grow ?? [1, 1]
    for (let i = 0; i < 3; i++) sk.offset[b * 3 + i] += by[i] * life
    sk.size[b] *= Math.sin(Math.PI * life) ** 0.6 * (g0 + (g1 - g0) * life)
  } else {
    sk.size[b] *= m.size[0] + (m.size[1] - m.size[0]) * (0.5 + 0.5 * Math.sin(at * TAU))
  }
}
