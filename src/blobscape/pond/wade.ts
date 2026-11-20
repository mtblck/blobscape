import type { Walker } from '../walkingElf.ts'

/** What steers the wader: forward and back, and turning. */
export interface Input {
  /** −1 (back) to 1 (forward). */
  forward: number
  /** −1 (left) to 1 (right). */
  turn: number
  /**
   * Steering by the picture instead: where a stick is pushed, right and up on the screen, each −1 to 1. The wader
   * turns to walk that way as the camera sees it (`steer`), whichever way it was facing.
   */
  stick?: { x: number; y: number }
  /** The way to go, as a heading in the world, and how hard (0 to 1): what `steer` makes of a stick. */
  aim?: number
  go?: number
}

/** How fast it wades, meters a second: slower than a walk on dry ground. */
export const WADE_SPEED = 1.05
export const BACK_SPEED = 0.6
const TURN_RATE = 1.9
/** How fast it turns to face the way it is sent, radians a second. */
const AIM_RATE = 5
/** How much room the wader needs round it, meters. */
export const BODY = 0.3

/**
 * One step of the wader: it turns, eases toward the speed asked for, and moves only where `room(x, z)` says there is
 * water to stand in (`pace` is its full speed, meters a second). Meeting a bank at a slant it slides along it; head on, it stops.
 */
export function stepWader(w: Walker, input: Input, dt: number, room: (x: number, z: number) => boolean, pace = WADE_SPEED): Walker {
  let heading: number, want: number
  if (input.aim !== undefined && (input.go ?? 0) > 0) {
    // sent a way: it turns to face it, and walks as far as it already faces it (so about-face is a turn on the spot, not a wide arc)
    const off = Math.atan2(Math.sin(input.aim - w.heading), Math.cos(input.aim - w.heading))
    const by = Math.max(-AIM_RATE * dt, Math.min(AIM_RATE * dt, off))
    heading = w.heading + by
    want = input.go! * pace * Math.max(0, Math.cos(off - by)) ** 2
  } else {
    // seen from behind (looking down +z), screen right is −x
    heading = w.heading - input.turn * TURN_RATE * dt
    want = input.forward >= 0 ? input.forward * pace : input.forward * BACK_SPEED
  }
  let speed = w.speed + (want - w.speed) * (1 - Math.exp(-dt * 5))
  const dx = Math.sin(heading) * speed * dt, dz = Math.cos(heading) * speed * dt
  let x = w.x, z = w.z
  if (room(w.x + dx, w.z + dz)) { x += dx; z += dz }
  else if (room(w.x + dx, w.z)) { x += dx; speed *= Math.abs(Math.sin(heading)) }
  else if (room(w.x, w.z + dz)) { z += dz; speed *= Math.abs(Math.cos(heading)) }
  else speed = 0
  return { x, z, heading, speed }
}

/**
 * What a stick pushed (x right, y up on the screen) asks of the wader when the camera looks along `view` (a heading
 * on the ground, as the wader's own): the way to go in the world, and how hard. Up is away from the camera.
 */
export function steer(stick: { x: number; y: number }, view: number): { aim: number; go: number } {
  const dx = Math.sin(view), dz = Math.cos(view)
  // the camera's right on the ground is (−dz, dx)
  const x = stick.y * dx - stick.x * dz, z = stick.y * dz + stick.x * dx
  return { aim: Math.atan2(x, z), go: Math.min(1, Math.hypot(stick.x, stick.y)) }
}
