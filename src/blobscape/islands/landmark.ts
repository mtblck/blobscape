import { Blobs, type Quat, type Vec3 } from '../../splat-core/blobs.ts'
import { Skeleton, axisAngle, emptySkin, mulQ, rotate, type Skin } from '../../splat-engine/rig.ts'
import { chance, hashOf } from './materials.ts'
import { SCALE, type IslandGround } from './walk.ts'
import type { WorldPlan } from './world.ts'
import { ROOM as THING_ROOM } from './things.ts'

/** How far a thing's crown reaches beside it, as a share of the room it keeps. */
const THING_REACH = 2.5

/**
 * One big creature an island, the landmark its biome is known by (issue #400; after the boss chambers in Matt's
 * reference clip, our own creatures): built from a few dozen large round blobs and long single blobs for bones, soft
 * blobs among the cubes. A meadow has a long-necked grazer, a pinewood a stag with antlers, a mesa a serpent arching
 * out of the ground. Each stands in the most open place on its island and moves on the time alone. Lengths in meters.
 */

/** The landmark kinds, by biome. */
export const LANDMARKS: Record<string, Kind> = { meadow: 'grazer', pinewood: 'stag', mesa: 'serpent' }
export type Kind = 'grazer' | 'stag' | 'serpent'

/** How much open ground each kind wants round where it stands, meters. */
export const ROOM: Record<Kind, number> = { grazer: 7, stag: 6, serpent: 9 }

/** One piece of a landmark as it stands at a moment, in its own frame (y up, facing +z), meters. */
interface Piece { at: Vec3; size: Vec3; turn: Quat; color: Vec3; opacity?: number }

/** A landmark on its island: what it is, where it stands and which way it faces. */
export interface Landmark { kind: Kind; island: number; at: Vec3; yaw: number; seed: number }

const hex = (h: string): Vec3 => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255) as Vec3
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const ONE: Quat = [0, 0, 0, 1]
const TAU = Math.PI * 2
const conjQ = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]]

/** The turn taking +x to the way from a to b. */
function along(a: Vec3, b: Vec3): Quat {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]) || 1
  const x = d[0] / l, y = d[1] / l, z = d[2] / l
  // x × d = (0, -z, y)
  const s = Math.hypot(z, y)
  if (s < 1e-6) return x > 0 ? ONE : [0, 1, 0, 0]
  return axisAngle([0, -z / s, y / s], Math.atan2(s, x))
}

/** A long single blob from a to b, `r` thick: a bone of a leg, a tine of an antler. */
const limb = (a: Vec3, b: Vec3, r: number, color: Vec3): Piece => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  return { at: scale(add(a, b), 0.5), size: [l * 0.5, r, r], turn: along(a, b), color }
}
const ball = (at: Vec3, r: number | Vec3, color: Vec3, turn: Quat = ONE): Piece => ({ at, size: typeof r === 'number' ? [r, r, r] : r, turn, color })

/** A leg from its hip down to the ground, its knee bent `bend` (meters forward) and its foot lifted `lift`. */
function leg(hip: Vec3, foot: Vec3, bend: number, r: number, c: Vec3): Piece[] {
  const knee: Vec3 = [(hip[0] + foot[0]) / 2, (hip[1] + foot[1]) / 2, (hip[2] + foot[2]) / 2 + bend]
  return [limb(hip, knee, r, c), limb(knee, foot, r * 0.75, c), ball(foot, [r * 1.1, r * 0.7, r * 1.3], mix(c, [0.1, 0.08, 0.06], 0.5))]
}

/** A chain of balls through points, tapering from r0 to r1, colored from c0 to c1. */
function chain(points: Vec3[], r0: number, r1: number, c0: Vec3, c1: Vec3): Piece[] {
  return points.map((p, k) => { const u = k / Math.max(1, points.length - 1); return ball(p, r0 + (r1 - r0) * u, mix(c0, c1, u)) })
}

/** A long-necked grazer, about eight meters to the top of its head: it lowers its head to graze and lifts it to look about. */
function grazer(t: number): Piece[] {
  const hide = hex('#d9c08f'), belly = hex('#f1e4c4'), dark = hex('#8a6a43'), spot = hex('#a9824f')
  const breathe = 1 + 0.02 * Math.sin((t * TAU) / 4.2)
  // the head goes down to graze for a while, then up, once every 14 s
  const graze = 0.5 - 0.5 * Math.cos((t * TAU) / 14), dip = Math.max(0, Math.min(1, (graze - 0.25) * 2))
  const out: Piece[] = []
  // body: balls along the spine, a back two meters over the ground at the hips
  for (let k = 0; k < 5; k++) {
    const z = -2.2 + k * 1.1, r = (1.35 - Math.abs(k - 2.2) * 0.12) * breathe
    out.push(ball([0, 3 + 0.25 * Math.sin((k / 4) * Math.PI), z], [r * 1.05, r, r * 1.05], mix(hide, belly, 0.15)))
    out.push(ball([0.25 * (k % 2 ? 1 : -1), 3.9, z + 0.2], r * 0.45, spot))
  }
  // legs: a stride on the spot as it shifts its weight
  const shift = Math.sin((t * TAU) / 7)
  for (const [x, z, ph] of [[-0.8, 2, 0], [0.8, 2, 0.5], [-0.8, -2, 0.5], [0.8, -2, 0]] as const) {
    const s = Math.sin((t * TAU) / 7 + ph * TAU) * 0.15
    out.push(...leg([x, 2.6, z], [x * 1.1, 0.15 + Math.max(0, s), z + s + shift * 0.1], 0.35, 0.32, dark))
  }
  // neck: up and forward from the shoulders, bowed down to the grass while it grazes
  const n = 9, neck: Vec3[] = []
  for (let k = 0; k < n; k++) {
    const u = (k + 1) / n
    const up: Vec3 = [0, 3.4 + u * 4.2, 2.4 + u * 1.6]
    const down: Vec3 = [0, 3.4 + Math.sin(u * Math.PI * 0.9) * 1.6 - u * u * 2.6, 2.4 + u * 4]
    const look = Math.sin((t * TAU) / 23) * 0.8 * u * (1 - dip)
    neck.push(add(mix(up, down, dip), [look, 0, 0]))
  }
  out.push(...chain(neck, 0.75, 0.42, hide, mix(hide, belly, 0.4)))
  const head = neck[n - 1], face = along(neck[n - 2], head)
  out.push(ball(add(head, [0, 0.15, 0]), [0.8, 0.45, 0.45], hide, face))
  out.push(ball(add(head, [0, 0.62, 0]), [0.12, 0.38, 0.12], dark))
  out.push(ball(add(head, [-0.3, 0.45, -0.1]), [0.08, 0.3, 0.18], hide), ball(add(head, [0.3, 0.45, -0.1]), [0.08, 0.3, 0.18], hide))
  out.push(ball(add(head, [-0.28, 0.25, 0.2]), 0.09, [0.08, 0.06, 0.05]), ball(add(head, [0.28, 0.25, 0.2]), 0.09, [0.08, 0.06, 0.05]))
  // tail: a short chain that swishes
  const tail: Vec3[] = []
  for (let k = 0; k < 5; k++) { const u = (k + 1) / 5; tail.push([Math.sin((t * TAU) / 3 + u * 2) * 0.5 * u, 3.3 - u * 1.6, -3.4 - u * 0.9]) }
  out.push(...chain(tail, 0.32, 0.16, hide, dark))
  return out
}

/** A stag as tall as a small tree, antlers wide as a cart: it lifts its head, turns to look, and now and then bows. */
function stag(t: number): Piece[] {
  const coat = hex('#6b5a48'), pale = hex('#c9b79a'), moss = hex('#5f7a4a'), bone = hex('#e9e2cf')
  const breathe = 1 + 0.02 * Math.sin((t * TAU) / 4.6)
  const out: Piece[] = []
  for (let k = 0; k < 4; k++) {
    const z = -1.6 + k * 1.05, r = (1.05 - Math.abs(k - 1.6) * 0.1) * breathe
    out.push(ball([0, 3.3 + 0.12 * k, z], [r * 0.9, r, r * 1.1], k === 3 ? mix(coat, pale, 0.3) : coat))
  }
  // a mantle of moss on the shoulders
  out.push(ball([0, 4.25, 1.4], [0.95, 0.4, 0.8], moss), ball([0, 4.05, 0.2], [0.8, 0.35, 0.8], moss))
  const shift = Math.sin((t * TAU) / 9)
  for (const [x, z, ph] of [[-0.6, 1.4, 0], [0.6, 1.4, 0.5], [-0.6, -1.5, 0.5], [0.6, -1.5, 0]] as const) {
    const s = Math.sin((t * TAU) / 9 + ph * TAU) * 0.1
    out.push(...leg([x, 3, z], [x, 0.12 + Math.max(0, s), z + s + shift * 0.05], -0.3 * Math.sign(z), 0.24, coat))
  }
  // the head looks about, and bows once every 20 s
  const bow = Math.max(0, Math.sin((t * TAU) / 20)) ** 6, look = Math.sin((t * TAU) / 11) * 0.7
  const neck: Vec3[] = []
  for (let k = 0; k < 5; k++) {
    const u = (k + 1) / 5
    neck.push([look * u * u, 4 + u * 2.1 * (1 - bow) + u * 0.3 * bow - bow * u * u * 2.2, 1.9 + u * (0.9 + 1.4 * bow)])
  }
  out.push(...chain(neck, 0.62, 0.42, mix(coat, pale, 0.2), pale))
  const head = neck[4], face = along(neck[3], add(head, [0, -0.35, 0.6]))
  out.push(ball(add(head, [0, -0.1, 0.35]), [0.65, 0.36, 0.36], pale, face))
  out.push(ball(add(head, [-0.25, 0.05, 0.6]), 0.08, [0.06, 0.05, 0.04]), ball(add(head, [0.25, 0.05, 0.6]), 0.08, [0.06, 0.05, 0.04]))
  // antlers: a beam each side and its tines, all single long blobs, the tips glowing faintly green
  for (const side of [-1, 1]) {
    const base = add(head, [side * 0.3, 0.3, -0.05])
    let p = base
    const beam: Vec3[] = [add(base, [side * 0.7, 0.9, -0.3]), add(base, [side * 1.4, 1.7, -0.1]), add(base, [side * 1.8, 2.6, 0.3])]
    beam.forEach((q, k) => {
      out.push(limb(p, q, 0.13 - k * 0.025, bone))
      const tip = add(q, [side * 0.15, 0.75 - k * 0.1, 0.45])
      out.push(limb(q, tip, 0.07, bone), ball(tip, 0.1, hex('#cfe9b0')))
      p = q
    })
  }
  const tail: Vec3 = [0, 3.8, -2.6]
  out.push(ball(tail, [0.25, 0.35, 0.2], hex('#f4efe2')))
  return out
}

/** A serpent two hand-spans thick, arching out of the ground and back in, its arches rolling along it; its head rears and sways. */
function serpent(t: number): Piece[] {
  const scales = hex('#3f6e66'), bellyC = hex('#d9b27a'), crest = hex('#b8452f'), out: Piece[] = []
  const n = 34, len = 22, wave = (t * TAU) / 9
  const spine: Vec3[] = []
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1), z = -len / 2 + u * len * 0.8
    // two humps out of the ground behind the neck, rolling back along it; the rest under the ground
    const hump = Math.sin(u * TAU * 1.6 - wave) * 2.2 - 0.6
    const x = Math.sin(u * TAU * 0.8 - wave * 0.5) * 1.4
    spine.push([x, u > 0.78 ? 0 : hump, z])
  }
  // the neck rises out of the ground at the front and the head rears over it
  const sway = Math.sin((t * TAU) / 6.5), rear = 0.5 + 0.5 * Math.sin((t * TAU) / 17)
  const root = spine[n - 1]
  for (let k = 1; k <= 8; k++) {
    const u = k / 8
    spine.push(add(root, [sway * u * u * 1.6, u * (4.5 + rear * 2), u * 2.4 - u * u * rear * 1.2]))
  }
  spine.forEach((p, k) => {
    const u = k / (spine.length - 1), r = 0.9 - Math.abs(u - 0.6) * 0.5
    out.push(ball(p, [r, r * 0.95, r * 1.25], mix(scales, hex('#2c4f49'), k % 2 ? 0.35 : 0), along(spine[Math.max(0, k - 1)], spine[Math.min(spine.length - 1, k + 1)])))
    if (k % 2 === 0) out.push(ball(add(p, [0, r * 0.85, 0]), [r * 0.22, r * 0.45, r * 0.3], crest))
    out.push(ball(add(p, [0, -r * 0.45, 0]), [r * 0.75, r * 0.5, r * 1.1], bellyC))
  })
  const head = spine[spine.length - 1], face = along(spine[spine.length - 2], add(head, [0, -0.6, 1]))
  out.push(ball(add(head, [0, 0.1, 0.6]), [0.85, 0.55, 1.2], scales, face))
  out.push(ball(add(head, [-0.45, 0.45, 0.8]), 0.13, hex('#f3d34a')), ball(add(head, [0.45, 0.45, 0.8]), 0.13, hex('#f3d34a')))
  for (const side of [-1, 1]) out.push(limb(add(head, [side * 0.4, 0.5, 0.1]), add(head, [side * 0.9, 1.5, -0.8]), 0.1, hex('#e8dcc0')))
  return out
}

const SHAPES: Record<Kind, (t: number) => Piece[]> = { grazer, stag, serpent }

/** A landmark's pieces at a moment, in its own frame. */
export const piecesAt = (kind: Kind, t: number) => SHAPES[kind](t)

/** Blobs round the skin of each piece, beside the one at its middle: one blob a piece reads as a cloud, a shell reads as a body. */
const SHELL = 14
/** Ways out from a piece's middle, spread evenly (a golden spiral). */
const WAYS: Vec3[] = Array.from({ length: SHELL }, (_, k) => {
  const y = 1 - (2 * (k + 0.5)) / SHELL, r = Math.sqrt(1 - y * y), a = k * 2.399963
  return [Math.cos(a) * r, y, Math.sin(a) * r]
})

/** A landmark as an actor: a few blobs a piece, all on a bone of the piece's own under the root, `soft` so it stays blobs among cubes. */
export function landmarkActor(kind: Kind): { blobs: Blobs; skin: Skin; skeleton: Skeleton; soft: true; rest: Piece[] } {
  const rest = piecesAt(kind, 0), blobs = new Blobs(rest.length * (SHELL + 1)), bones: number[] = []
  rest.forEach((p, k) => {
    const op = p.opacity ?? 1
    // the middle, then a shell of smaller blobs lying on the piece's skin, lighter on top and darker beneath
    blobs.push({ center: p.at, scale: scale(p.size, 0.62), quat: p.turn, color: mix(p.color, [0, 0, 0], 0.12), opacity: op })
    bones.push(k + 1)
    for (const w of WAYS) {
      const local: Vec3 = [w[0] * p.size[0] * 0.62, w[1] * p.size[1] * 0.62, w[2] * p.size[2] * 0.62]
      const up = rotate(p.turn, w)[1], shade = 0.8 + 0.28 * up
      blobs.push({ center: add(p.at, rotate(p.turn, local)), scale: scale(p.size, 0.42), quat: p.turn, color: p.color.map((c) => Math.min(1, c * shade)) as Vec3, opacity: op })
      bones.push(k + 1)
    }
  })
  const skeleton = new Skeleton([{ name: kind, parent: -1, head: [0, 0, 0] }, ...rest.map((p, k) => ({ name: `${kind}${k}`, parent: 0, head: p.at }))])
  const skin = emptySkin(blobs.count)
  for (let i = 0; i < blobs.count; i++) { skin.joints[i * 4] = bones[i]; skin.weights[i * 4] = 1 }
  return { blobs, skin, skeleton, soft: true, rest }
}

/** Poses a landmark at a time: each piece moved and turned from where it rested, the whole stood where it lives. */
export function poseLandmark(m: Landmark, rest: Piece[], sk: Skeleton, t: number) {
  const now = piecesAt(m.kind, t)
  now.forEach((p, k) => {
    const r = rest[k]
    sk.offset.set([p.at[0] - r.at[0], p.at[1] - r.at[1], p.at[2] - r.at[2]], (k + 1) * 3)
    sk.setRotation(k + 1, mulQ(p.turn, conjQ(r.turn)))
  })
  sk.setRotation(0, axisAngle([0, 1, 0], m.yaw))
  sk.place.set(m.at)
  sk.update()
}

/**
 * Where each island's landmark lives: the most open ground on it, tried in a seeded order, measured from everything
 * that stands there (a tree's crown, not only its trunk), where the elf could stand; it faces the island's middle. The
 * same world gives the same places.
 */
export function placeLandmarks(world: WorldPlan, islands: readonly IslandGround[]): Landmark[] {
  const out: Landmark[] = []
  world.islands.forEach((isl, j) => {
    const kind = LANDMARKS[isl.biome] ?? 'grazer', g = islands[j], seed = hashOf(isl.seed, 9100)
    const mid = [isl.at[0] * SCALE, isl.at[2] * SCALE], reach = Math.max(isl.plan.land.half[0], isl.plan.land.half[1]) * SCALE
    // each thing as a disc on the ground, meters: about as wide as its crown
    const discs = isl.plan.things.map((t) => ({ x: (t.at[0] + isl.at[0]) * SCALE, z: (t.at[2] + isl.at[2]) * SCALE, r: THING_REACH * THING_ROOM[t.kind] * t.size * SCALE }))
    let best: { x: number; z: number; open: number } | undefined
    for (let t = 0; t < 300; t++) {
      const x = mid[0] + (chance(seed, t * 2) * 2 - 1) * reach, z = mid[1] + (chance(seed, t * 2 + 1) * 2 - 1) * reach
      const edge = g.insideAt(x, z) - 3
      if (edge < ROOM[kind] * 0.6 || !g.standsAt(x, z)) continue
      let open = edge
      for (const d of discs) open = Math.min(open, Math.hypot(d.x - x, d.z - z) - d.r)
      if (!best || open > best.open) best = { x, z, open }
    }
    if (!best) return
    const yaw = Math.atan2(mid[0] - best.x, mid[1] - best.z)
    out.push({ kind, island: j, at: [best.x, g.groundAt(best.x, best.z), best.z], yaw, seed })
  })
  return out
}
