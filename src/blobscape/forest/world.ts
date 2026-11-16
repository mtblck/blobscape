import { rng } from '../../splat-engine/body.ts'

/**
 * The forest's layout, without any drawing: where the path runs, which
 * stretch of it is near the walker, what grows on each stretch and how the
 * walker moves. Everything here is plain numbers so it runs in Node tests.
 *
 * The world is a path running along +z for ever, cut into tiles `TILE` long.
 * Only `RING` tiles exist at once, around the walker. The path's wiggle
 * repeats every `RING` tiles, so tile i can always reuse ring slot i % RING
 * (same ground, moved on by a whole period); what grows on each tile is
 * seeded by its index, so walking back finds the same trees.
 */

export const TILE = 4
export const RING = 9
export const PERIOD = TILE * RING
/** How far either side of the path the forest goes. */
export const HALF_WIDTH = 10
/** How far from the path's middle the walker may stray (beyond it is undergrowth). */
export const ROAM = 6.5

const TAU = Math.PI * 2

/** The middle of the path at z: a wiggle that repeats every PERIOD. */
export function pathX(z: number) {
  return 1.5 * Math.sin((TAU * z) / PERIOD) + 0.55 * Math.sin((TAU * 2 * z) / PERIOD + 1.3)
}

/** The path's slope dx/dz at z. */
export function pathSlope(z: number) {
  return 1.5 * (TAU / PERIOD) * Math.cos((TAU * z) / PERIOD) + 0.55 * ((TAU * 2) / PERIOD) * Math.cos((TAU * 2 * z) / PERIOD + 1.3)
}

/** Half the path's width at z, wobbling a little; repeats with the path. */
export function pathHalf(z: number) {
  return 0.95 + 0.12 * Math.sin((TAU * 5 * z) / PERIOD + 0.4) + 0.06 * Math.sin((TAU * 11 * z) / PERIOD)
}

const mod = (a: number, n: number) => ((a % n) + n) % n
/** Which ring slot holds tile i. */
export const slotOf = (i: number) => mod(i, RING)

/**
 * The tiles that exist with the walker at z facing `heading` (0 is +z): a few
 * behind and the rest ahead, or the other way round when walking back, so the
 * forest always reaches farthest where the camera looks.
 */
export function tileWindow(z: number, heading: number): number[] {
  const ahead = Math.cos(heading)
  const behind = Math.round(1.5 + (RING - 4) * (1 - ahead) / 2)
  const first = Math.floor(z / TILE) - behind
  return Array.from({ length: RING }, (_, k) => first + k)
}

/** The kinds of plant, each with its own ring of prebuilt plants. */
export const KINDS = ['pine', 'oak', 'birch', 'bush', 'fern', 'flowers', 'mushrooms', 'rock'] as const
export type Kind = (typeof KINDS)[number]

/** How many of each kind every tile has room for. */
export const PER_TILE: Record<Kind, number> = { pine: 2, oak: 1, birch: 1, bush: 1, fern: 2, flowers: 3, mushrooms: 1, rock: 1 }

interface KindRule {
  /** Chance each one is there at all. */
  chance: number
  /** How far from the path's edge, in meters. */
  from: number
  to: number
  /** Size range. */
  scale: [number, number]
  /** How close (meters, from the walker) it waits before it grows, when plants sprout as you come. */
  sprout: number
  /** Trunk radius the walker bumps into, before scaling; 0 walks through. */
  solid: number
}

export const RULES: Record<Kind, KindRule> = {
  pine: { chance: 0.85, from: 1.6, to: 8.5, scale: [0.8, 1.25], sprout: 22, solid: 0.3 },
  oak: { chance: 0.8, from: 2.2, to: 8.5, scale: [0.85, 1.2], sprout: 22, solid: 0.38 },
  birch: { chance: 0.8, from: 1.2, to: 7, scale: [0.85, 1.2], sprout: 18, solid: 0.2 },
  bush: { chance: 0.75, from: 0.5, to: 5, scale: [0.7, 1.3], sprout: 12, solid: 0 },
  fern: { chance: 0.8, from: 0.25, to: 4, scale: [0.8, 1.3], sprout: 9, solid: 0 },
  flowers: { chance: 0.9, from: 0.05, to: 1.6, scale: [0.85, 1.2], sprout: 7, solid: 0 },
  mushrooms: { chance: 0.55, from: 0.4, to: 4, scale: [0.8, 1.4], sprout: 8, solid: 0 },
  rock: { chance: 0.6, from: 0.15, to: 6, scale: [0.6, 1.5], sprout: 12, solid: 0.3 },
}

export interface Placed {
  kind: Kind
  /** Which of the kind's PER_TILE places on the tile (0…). */
  n: number
  x: number
  z: number
  yaw: number
  scale: number
}

/** What grows on tile i of the forest grown from `seed`: the same every time. */
export function layout(i: number, seed: number): Placed[] {
  const rand = rng((Math.imul(i, 2654435761) ^ Math.imul(seed + 1, 40503)) >>> 0)
  for (let k = 0; k < 4; k++) rand()
  const out: Placed[] = []
  for (const kind of KINDS) {
    const r = RULES[kind]
    for (let n = 0; n < PER_TILE[kind]; n++) {
      // draw every number whether or not the plant is there, so one plant's luck doesn't move the next
      const here = rand(), side = rand() < 0.5 ? -1 : 1, off = rand(), along = rand(), yaw = rand(), size = rand()
      if (here > r.chance) continue
      const z = (i + along) * TILE
      // trees thin out near the path; small things crowd its edge
      const t = kind === 'flowers' || kind === 'fern' ? off * off : off
      const x = pathX(z) + side * (pathHalf(z) + r.from + (r.to - r.from) * t)
      const p: Placed = { kind, n, x, z, yaw: yaw * Math.PI * 2, scale: r.scale[0] + (r.scale[1] - r.scale[0]) * size }
      // keep trunks apart: a tree too close to one already placed doesn't grow
      if (r.solid && out.some((o) => RULES[o.kind].solid && Math.hypot(o.x - p.x, o.z - p.z) < 1.4)) continue
      out.push(p)
    }
  }
  return out
}

/** Things the walker can't walk through, from the tiles around it. */
export function obstacles(tiles: number[], seed: number) {
  const out: { x: number; z: number; r: number }[] = []
  for (const i of tiles) for (const p of layout(i, seed)) if (RULES[p.kind].solid) out.push({ x: p.x, z: p.z, r: RULES[p.kind].solid * p.scale })
  return out
}

export interface Walker {
  x: number
  z: number
  /** Which way it faces, radians: 0 is +z (down the path), positive turns toward +x (left, seen from behind). */
  heading: number
  /** Meters per second along its heading (negative backs up). */
  speed: number
}

export interface Input {
  /** −1 (back) to 1 (forward). */
  forward: number
  /** −1 (left) to 1 (right). */
  turn: number
}

export const WALK_SPEED = 1.45
export const BACK_SPEED = 0.8
const TURN_RATE = 1.9
const BODY = 0.28

/**
 * One step of the walker: it turns, speeds up or slows down toward what the
 * input asks (so starts and stops ease), moves, and is pushed back out of
 * trunks and back toward the path if it strays too far.
 */
export function stepWalker(w: Walker, input: Input, dt: number, solid: { x: number; z: number; r: number }[] = []): Walker {
  // seen from behind (looking down +z), screen right is −x
  const heading = w.heading - input.turn * TURN_RATE * dt
  const want = input.forward >= 0 ? input.forward * WALK_SPEED : input.forward * BACK_SPEED
  const ease = 1 - Math.exp(-dt * 6)
  const speed = w.speed + (want - w.speed) * ease
  let x = w.x + Math.sin(heading) * speed * dt
  let z = w.z + Math.cos(heading) * speed * dt
  for (const o of solid) {
    const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz), min = o.r + BODY
    if (d < min && d > 1e-6) { x = o.x + (dx / d) * min; z = o.z + (dz / d) * min }
  }
  const mid = pathX(z)
  x = Math.max(mid - ROAM, Math.min(mid + ROAM, x))
  return { x, z, heading, speed }
}
