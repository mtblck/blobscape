import { Blobs, pick, type Vec3 } from '../splat-core/blobs.ts'
import type { Creature } from '../splat-engine/body.ts'
import { boneTail } from '../splat-engine/body.ts'
import { poseBlobs } from '../splat-engine/pose.ts'
import { posedPoint, type Skeleton } from '../splat-engine/rig.ts'
import { lookAt } from '../splat-engine/ik.ts'
import type { Species } from '../splat-engine/zoo/index.ts'
import { goingMove, paceOf, restMove, wanderAt, wanderPlan, type Where } from './wander.ts'

/**
 * Creatures in the sandbox. The sandbox's scene is a plain `Blobs` list that
 * every tool edits; a creature is kept beside it, as its rest blobs, skin and
 * skeleton, and posed on the CPU (`poseBlobs`, as the rig lessons do) into one
 * shared list that Spark draws as a second layer. So the brush, selection and
 * effects never see a creature's blobs until it's frozen into the scene.
 *
 * An actor is a value: a change of place, size or move makes a new one, so an
 * undo snapshot can hold the list as it was. Only its body (rest blobs, skin,
 * the skeleton it's posed on) is shared between versions, and that never
 * changes once made.
 */
export interface Actor {
  /** Unique within the page, for React keys and the clocks. */
  key: number
  species: Species
  look: string
  /** Blobs it was made with. */
  detail: number
  body: Creature
  /** Its rest pose's footprint: the middle of its feet and how tall it stands. */
  rest: { foot: Vec3; height: number }
  /** The point on the ground it stands on. */
  at: Vec3
  /** Degrees about the vertical; 0 faces +Z, the way every creature is built. */
  yaw: number
  /** How tall it stands, in scene units. */
  height: number
  /** The move it plays, or STILL. */
  move: string
  speed: number
  /** Walking about (wander.ts): how far from `at` it roams, in its own heights; 0 stays put. */
  roam: number
  /** What it turns its head to: where it's going, the camera, or the middle of the view. */
  gaze: Gaze
}

export type Gaze = 'ahead' | 'you' | 'middle'
export const GAZES: { id: Gaze; label: string }[] = [{ id: 'ahead', label: 'Ahead' }, { id: 'you', label: 'You' }, { id: 'middle', label: 'Middle of the view' }]

/** How far a creature roams when Walk about is first switched on, in its heights. */
export const ROAM = 2.5

export const STILL = 'still'

/** The lighter detail levels only: every frame poses each creature on the CPU. */
export const detailsOf = (sp: Species) => sp.detail.slice(0, 2)

/** Its rest pose's footprint: the middle of its lowest blobs, and how tall it stands. */
export function restFootprint(b: Blobs): { foot: Vec3; height: number } {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (let i = 0; i < b.count; i++) {
    const x = b.center[i * 3], y = b.center[i * 3 + 1], z = b.center[i * 3 + 2]
    if (x < x0) x0 = x; if (x > x1) x1 = x
    if (y < y0) y0 = y; if (y > y1) y1 = y
    if (z < z0) z0 = z; if (z > z1) z1 = z
  }
  if (!b.count) return { foot: [0, 0, 0], height: 1 }
  return { foot: [(x0 + x1) / 2, y0, (z0 + z1) / 2], height: Math.max(1e-3, y1 - y0) }
}

let nextKey = 1

/** A new creature standing at `at`, `height` tall, playing its first move. */
export function makeActor(species: Species, opts: { look?: string; detail?: number; at: Vec3; height: number; yaw?: number; move?: string; speed?: number; roam?: number; gaze?: Gaze }): Actor {
  const look = opts.look ?? species.looks[0].id
  const detail = opts.detail ?? detailsOf(species)[0]
  const body = species.make(detail, look)
  body.skeleton.reset()
  body.skeleton.update()
  return {
    key: nextKey++,
    species,
    look,
    detail,
    body,
    rest: restFootprint(body.blobs),
    at: opts.at,
    yaw: opts.yaw ?? 0,
    height: opts.height,
    move: opts.move ?? species.moves[0].name,
    speed: opts.speed ?? 1,
    roam: opts.roam ?? 0,
    gaze: opts.gaze ?? 'ahead',
  }
}

/** The same creature remade with another look or detail, keeping where it stands and what it does. */
export function remake(a: Actor, look: string, detail: number): Actor {
  return { ...makeActor(a.species, { look, detail, at: a.at, height: a.height, yaw: a.yaw, move: a.move, speed: a.speed, roam: a.roam, gaze: a.gaze }), key: a.key }
}

/** Whether it can walk about: it needs a move that goes somewhere. */
export const canRoam = (a: Actor) => goingMove(a.species) !== undefined

/** Where a roaming creature is on its loop at a time on its clock, or null when it stays put. */
export function roamingAt(a: Actor, seconds: number): Where | null {
  const going = a.roam > 0 ? goingMove(a.species) : undefined
  if (!going) return null
  const k = a.height / a.rest.height
  const plan = wanderPlan(a.key, a.roam * a.height, paceOf(a.body, going, a.rest.height) * k, a.yaw)
  return wanderAt(plan, seconds)
}

/**
 * The bones it looks with, neck first: every neck bone and the head, or, with
 * no head, a body that is all head (a slime). Empty for things with no face.
 */
export function lookBones(sk: Skeleton): string[] {
  const names = sk.bones.map((b) => b.name)
  if (names.includes('head')) return [...names.filter((n) => /^neck\d*$/.test(n)), 'head']
  return names.includes('body') && !names.includes('land') ? ['body'] : []
}
export const canLook = (a: Actor) => lookBones(a.body.skeleton).length > 0

/** The most a neck bone turns, and the head, in radians: a head with its neck turns about a quarter turn and a bit, never round to face backward. */
const NECK_TURN = 0.4, HEAD_TURN = 1.25, NECK_SHARE = 0.35, TILT = 0.4

/** A point in the scene in the actor's own rest frame (the inverse of `placePoint`). */
export function unplace(p: ArrayLike<number>, P: Placing): Vec3 {
  const wx = p[0] - P.at[0], wy = p[1] - P.at[1], wz = p[2] - P.at[2]
  return [P.foot[0] + (wx * P.c - wz * P.s) / P.k, P.foot[1] + wy / P.k, P.foot[2] + (wx * P.s + wz * P.c) / P.k]
}

/**
 * Turns a posed actor's neck and head toward a point in the scene, placed by
 * `P`. Creatures face +z at rest. It turns about the upright first (on a level
 * with each bone, so a point behind turns the head sideways as far as it goes
 * instead of tipping it over backward), then tips the head up or down a little.
 */
export function turnToLook(a: Actor, point: ArrayLike<number>, P: Placing) {
  const sk = a.body.skeleton, bones = lookBones(sk)
  if (!bones.length) return
  const target = unplace(point, P)
  const level = (name: string): Vec3 => [target[0], sk.posedHead[sk.index(name) * 3 + 1], target[2]]
  // Each neck bone takes a share and the head the rest, so the turn runs down the neck
  // (lookAt scales its limit by the amount, so the neck's limit is given over it)
  for (const name of bones.slice(0, -1)) lookAt(sk, name, level(name), { amount: NECK_SHARE, limit: NECK_TURN / NECK_SHARE })
  const head = bones[bones.length - 1]
  lookAt(sk, head, level(head), { limit: HEAD_TURN })
  lookAt(sk, head, target, { limit: TILT })
}

/** Placement: scale about the rest footprint, turn about the vertical, stand on `at` (or where its walk has got to). */
export interface Placing { k: number; c: number; s: number; qy: number; qw: number; foot: Vec3; at: Vec3 }
export function placingOf(a: Actor, seconds = 0): Placing {
  const w = roamingAt(a, seconds)
  const at: Vec3 = w ? [a.at[0] + w.dx, a.at[1], a.at[2] + w.dz] : a.at
  const r = ((w ? w.yaw : a.yaw) * Math.PI) / 180
  return { k: a.height / a.rest.height, c: Math.cos(r), s: Math.sin(r), qy: Math.sin(r / 2), qw: Math.cos(r / 2), foot: a.rest.foot, at }
}

/** A point posed at the origin, moved to where the actor stands. */
export function placePoint(p: ArrayLike<number>, P: Placing): Vec3 {
  const x = (p[0] - P.foot[0]) * P.k, y = (p[1] - P.foot[1]) * P.k, z = (p[2] - P.foot[2]) * P.k
  // A turn about +Y by the yaw: x' = x cos + z sin, z' = −x sin + z cos
  return [P.at[0] + x * P.c + z * P.s, P.at[1] + y, P.at[2] - x * P.s + z * P.c]
}

/**
 * Copies posed blobs into `out` from index `from`, placed: centers moved,
 * sizes scaled, rotations turned by the yaw. Colors and opacities copied.
 */
export function placeInto(posed: Blobs, P: Placing, out: Blobs, from: number) {
  const n = posed.count
  const pc = posed.center, ps = posed.scale, pq = posed.quat
  const { k, c, s, qy, qw, foot, at } = P
  for (let i = 0; i < n; i++) {
    const o = from + i
    const x = (pc[i * 3] - foot[0]) * k, y = (pc[i * 3 + 1] - foot[1]) * k, z = (pc[i * 3 + 2] - foot[2]) * k
    out.center[o * 3] = at[0] + x * c + z * s
    out.center[o * 3 + 1] = at[1] + y
    out.center[o * 3 + 2] = at[2] - x * s + z * c
    out.scale[o * 3] = ps[i * 3] * k
    out.scale[o * 3 + 1] = ps[i * 3 + 1] * k
    out.scale[o * 3 + 2] = ps[i * 3 + 2] * k
    // (0, qy, 0, qw) · q
    const x1 = pq[i * 4], y1 = pq[i * 4 + 1], z1 = pq[i * 4 + 2], w1 = pq[i * 4 + 3]
    out.quat[o * 4] = qw * x1 + qy * z1
    out.quat[o * 4 + 1] = qw * y1 + qy * w1
    out.quat[o * 4 + 2] = qw * z1 - qy * x1
    out.quat[o * 4 + 3] = qw * w1 - qy * y1
  }
  out.color.set(posed.color.subarray(0, n * 3), from * 3)
  out.opacity.set(posed.opacity.subarray(0, n), from)
}

/** The move it plays now: its going move while walking about, else its own (or a resting one, if its own is the going move). */
export function moveNow(a: Actor, seconds: number) {
  const w = roamingAt(a, seconds)
  const own = a.move === STILL ? undefined : a.species.moves.find((mv) => mv.name === a.move)
  if (!w) return own
  const going = goingMove(a.species)
  if (w.going) return going
  return own && own !== going ? own : restMove(a.species)
}

/** Poses an actor's skeleton for a time in seconds (looping its move), or the rest pose when still. */
export function poseActor(a: Actor, seconds: number) {
  const sk = a.body.skeleton
  const m = moveNow(a, seconds)
  if (!m) sk.reset()
  else m.pose(sk, ((seconds % m.seconds) + m.seconds) % m.seconds)
  sk.update()
}

/** Blobs the actor list draws, all told. */
export const actorBlobs = (actors: readonly Actor[]) => actors.reduce((n, a) => n + a.body.blobs.count, 0)

/**
 * Poses every actor at its own clock and writes them, placed, one after
 * another into `out`, growing it if needed. `scratch` holds one posed list per
 * body, reused frame to frame. Returns where each actor starts in `out`.
 */
export function poseAll(actors: readonly Actor[], clock: (a: Actor) => number, out: Blobs, scratch: WeakMap<Creature, Blobs>, gazeAt?: (a: Actor) => Vec3 | null): number[] {
  const total = actorBlobs(actors)
  if (out.capacity < total) {
    const bigger = new Blobs(Math.max(total, out.capacity * 2))
    out.center = bigger.center; out.scale = bigger.scale; out.quat = bigger.quat; out.color = bigger.color; out.opacity = bigger.opacity
  }
  const starts: number[] = []
  let from = 0
  for (const a of actors) {
    const rest = a.body.blobs
    // A clone keeps the rest colors and opacities, which posing leaves alone
    let posed = scratch.get(a.body)
    if (!posed) { posed = rest.clone(); scratch.set(a.body, posed) }
    const t = clock(a), P = placingOf(a, t)
    poseActor(a, t)
    const point = a.gaze !== 'ahead' ? gazeAt?.(a) : null
    if (point) turnToLook(a, point, P)
    poseBlobs(rest, a.body.skin, a.body.skeleton, 'quat', posed)
    starts.push(from)
    placeInto(posed, P, out, from)
    from += rest.count
  }
  out.count = total
  return starts
}

/** Each bone of a posed actor as a line from head to tail, placed, for drawing the rig. */
export function actorBones(a: Actor, seconds = 0): { from: Vec3; to: Vec3 }[] {
  const sk = a.body.skeleton, P = placingOf(a, seconds)
  return sk.bones.map((_, i) => ({
    from: placePoint(sk.posedHead.subarray(i * 3, i * 3 + 3), P),
    to: placePoint(posedPoint(sk, i, boneTail(sk.bones, i)), P),
  }))
}

/** The actor under a ray, given the drawn list and where each actor starts in it, or -1. */
export function actorAt(drawn: Blobs, starts: readonly number[], o: ArrayLike<number>, dir: ArrayLike<number>): { index: number; t: number } {
  const hit = pick(drawn, o, dir, 2, 0.2)
  if (hit.index < 0) return { index: -1, t: Infinity }
  let k = starts.length - 1
  while (k > 0 && starts[k] > hit.index) k--
  return { index: k, t: hit.t }
}

/** The blobs of one actor as drawn now, copied into the end of `scene` (freezing it into ordinary blobs). */
export function freezeInto(drawn: Blobs, start: number, count: number, scene: Blobs) {
  for (let i = start; i < start + count; i++) scene.push(drawn.get(i))
}
