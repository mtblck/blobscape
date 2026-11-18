import type { Walker } from '../walkingElf.ts'

/** What steers the wader: forward and back, and turning. */
export interface Input {
  /** −1 (back) to 1 (forward). */
  forward: number
  /** −1 (left) to 1 (right). */
  turn: number
}

/** How fast it wades, meters a second: slower than a walk on dry ground. */
export const WADE_SPEED = 1.05
export const BACK_SPEED = 0.6
const TURN_RATE = 1.9
/** How much room the wader needs round it, meters. */
export const BODY = 0.3

/**
 * One step of the wader: it turns, eases toward the speed asked for, and moves only where `room(x, z)` says there is
 * water to stand in. Meeting a bank at a slant it slides along it; head on, it stops.
 */
export function stepWader(w: Walker, input: Input, dt: number, room: (x: number, z: number) => boolean): Walker {
  // seen from behind (looking down +z), screen right is −x
  const heading = w.heading - input.turn * TURN_RATE * dt
  const want = input.forward >= 0 ? input.forward * WADE_SPEED : input.forward * BACK_SPEED
  let speed = w.speed + (want - w.speed) * (1 - Math.exp(-dt * 5))
  const dx = Math.sin(heading) * speed * dt, dz = Math.cos(heading) * speed * dt
  let x = w.x, z = w.z
  if (room(w.x + dx, w.z + dz)) { x += dx; z += dz }
  else if (room(w.x + dx, w.z)) { x += dx; speed *= Math.abs(Math.sin(heading)) }
  else if (room(w.x, w.z + dz)) { z += dz; speed *= Math.abs(Math.cos(heading)) }
  else speed = 0
  return { x, z, heading, speed }
}
