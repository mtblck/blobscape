import type { Creature } from '../splat-engine/body.ts'
import type { Move, Species } from '../splat-engine/zoo/species.ts'

/**
 * Walking about the sandbox (issue #132). A creature's moves are all on the
 * spot, so to walk somewhere it plays its going move (walk, trot, hop...) while
 * its spot slides along a path at the speed its planted feet go back in that
 * move (`paceOf`), so the feet hardly slide. The path is a loop of stops round
 * where it was put (`wanderPlan`): turn on the spot toward the next stop, go
 * there, rest a moment. Where it is is a function of its clock alone
 * (`wanderAt`), so a frame, an undo or a freeze needs no state kept.
 */

/** Moves that carry a creature along, best first. */
export const GOING = ['walk', 'trot', 'swim', 'hop', 'jump', 'flap']
/** Moves to rest in between, best first. */
const RESTING = ['idle', 'stand', 'float']

export const goingMove = (sp: Species): Move | undefined => {
  for (const name of GOING) { const m = sp.moves.find((mv) => mv.name === name); if (m) return m }
  return undefined
}
export const restMove = (sp: Species): Move | undefined => {
  for (const name of RESTING) { const m = sp.moves.find((mv) => mv.name === name); if (m) return m }
  return sp.moves.find((m) => !GOING.includes(m.name))
}

/** Stops on the loop, the first being where it was put. */
export const STOPS = 6
/** Seconds it rests at each stop, on its own clock. */
export const REST = 1.6
/** Fastest turn on the spot, degrees a second. */
export const TURN = 150
/** When a move's feet say nothing (a hop, a swim), it goes this many of its heights a second. */
export const FALLBACK_PACE = 0.45

const paces = new WeakMap<Creature, Map<string, number>>()

/** A foot is down while it's in the lower half of its swing and going back (`footDown`). */
export const footDown = (y: number, low: number, high: number, dz: number) => y < (low + high) / 2 && dz < 0

/**
 * How fast the move carries the creature, in rest units a second. Its feet are
 * the bones that come within a twenty-fifth of its height of the lowest any bone
 * gets, and lift at least that much again; a foot is down while `footDown`, and
 * the pace is the middle speed at which feet go back while down, so the ground
 * slides under them about as fast as they push it. Creatures face +z. A move
 * that plants nothing (a swim, a hover) gets FALLBACK_PACE.
 */
export function paceOf(body: Creature, move: Move, height: number): number {
  let byMove = paces.get(body)
  if (!byMove) { byMove = new Map(); paces.set(body, byMove) }
  const known = byMove.get(move.name)
  if (known !== undefined) return known
  const sk = body.skeleton, n = sk.bones.length, N = 60, dt = move.seconds / N
  const ys = new Float32Array(n * (N + 1)), zs = new Float32Array(n * (N + 1))
  let floor = Infinity
  for (let f = 0; f <= N; f++) {
    move.pose(sk, f * dt)
    sk.update()
    for (let i = 0; i < n; i++) {
      ys[f * n + i] = sk.posedHead[i * 3 + 1]
      zs[f * n + i] = sk.posedHead[i * 3 + 2]
      floor = Math.min(floor, ys[f * n + i])
    }
  }
  sk.reset(); sk.update()
  const speeds: number[] = []
  for (let i = 0; i < n; i++) {
    let low = Infinity, high = -Infinity
    for (let f = 0; f <= N; f++) { low = Math.min(low, ys[f * n + i]); high = Math.max(high, ys[f * n + i]) }
    if (low > floor + height / 25 || high - low < height / 25) continue
    for (let f = 0; f < N; f++) {
      const dz = zs[(f + 1) * n + i] - zs[f * n + i]
      if (footDown(ys[f * n + i], low, high, dz)) speeds.push(-dz / dt)
    }
  }
  speeds.sort((a, b) => a - b)
  const pace = speeds.length > N / 4 ? speeds[speeds.length >> 1] : FALLBACK_PACE * height
  byMove.set(move.name, pace)
  return pace
}

/** A leg of the loop: turn to face the stop, go there, rest. Times on the creature's clock. */
interface Leg { from: [number, number]; to: [number, number]; yaw0: number; yaw1: number; start: number; turn: number; go: number }
export interface WanderPlan { legs: Leg[]; period: number }

/** A small hash to [0, 1). */
const hash = (a: number, b: number) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12
  return (h >>> 0) / 4294967296
}

/** Shortest turn from one yaw to another, in degrees (−180, 180]. */
const turnBy = (from: number, to: number) => { const d = (((to - from) % 360) + 540) % 360 - 180; return d === -180 ? 180 : d }

/**
 * A loop of STOPS stops in a disc of `radius` round the origin, the first at
 * the origin, each at least a third of the radius from the last, visited in
 * order and back to the first. `pace` is in the same units a second.
 */
export function wanderPlan(seed: number, radius: number, pace: number, startYaw: number): WanderPlan {
  const stops: [number, number][] = [[0, 0]]
  for (let i = 1; i < STOPS; i++) {
    const prev = stops[i - 1]
    let p: [number, number] = [0, 0]
    for (let tries = 0; tries < 12; tries++) {
      // Even over the disc's area, round about the middle
      const r = radius * Math.sqrt(0.15 + 0.85 * hash(seed, i * 31 + tries * 7)), a = 2 * Math.PI * hash(seed + 1, i * 17 + tries * 5)
      p = [r * Math.sin(a), r * Math.cos(a)]
      if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) > radius / 3) break
    }
    stops.push(p)
  }
  const legs: Leg[] = []
  let yaw = startYaw, time = 0
  for (let i = 0; i < STOPS; i++) {
    const from = stops[i], to = stops[(i + 1) % STOPS]
    const dist = Math.hypot(to[0] - from[0], to[1] - from[1])
    const yaw1 = yaw + turnBy(yaw, (Math.atan2(to[0] - from[0], to[1] - from[1]) * 180) / Math.PI)
    const turn = Math.abs(yaw1 - yaw) / TURN, go = dist / Math.max(1e-6, pace)
    legs.push({ from, to, yaw0: yaw, yaw1, start: time, turn, go })
    time += turn + go + REST
    yaw = yaw1
  }
  return { legs, period: time }
}

export interface Where { dx: number; dz: number; yaw: number; going: boolean }

/** Where on its loop the creature is at a time on its clock (looping), how it faces, and whether it's on the move. */
export function wanderAt(plan: WanderPlan, t: number): Where {
  const tt = ((t % plan.period) + plan.period) % plan.period
  let leg = plan.legs[0]
  for (const l of plan.legs) if (l.start <= tt) leg = l
  const s = tt - leg.start
  if (s < leg.turn) {
    const u = s / leg.turn, e = u * u * (3 - 2 * u)
    return { dx: leg.from[0], dz: leg.from[1], yaw: leg.yaw0 + (leg.yaw1 - leg.yaw0) * e, going: true }
  }
  const u = Math.min(1, (s - leg.turn) / Math.max(1e-9, leg.go))
  return {
    dx: leg.from[0] + (leg.to[0] - leg.from[0]) * u,
    dz: leg.from[1] + (leg.to[1] - leg.from[1]) * u,
    yaw: leg.yaw1,
    going: s < leg.turn + leg.go,
  }
}
