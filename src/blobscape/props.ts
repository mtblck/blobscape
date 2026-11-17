import { makeClock, poseClock, secondsOf } from '../splat-engine/clockwork.ts'
import type { Species } from '../splat-engine/zoo/index.ts'
import { BURST, KINDS, RULES, SPAWN, type Slime, type SlimeKind } from './dungeon/game.ts'
import { makeSlime, poseSlime } from './dungeon/slime.ts'

/**
 * Things from the other experiments that the sandbox can drop into a scene
 * beside the zoo's creatures: Dungeon Run's slime and Clockwork's watch.
 * They're written as species so the sandbox treats them like any creature
 * (placed, sized, turned, posed on the CPU, frozen into blobs).
 */

const HOP = 1

/** A slime standing at the origin, in a phase of its life `t` seconds in. */
function slimeAt(kind: SlimeKind, phase: Slime['phase'], t: number, hopT = 0): Slime {
  return { slot: 0, kind, phase, t, x: 0, z: 0, heading: 0, hp: 1, hopT, vx: 0, vz: 0, hitBy: -1, struck: 99, chill: 0, burn: 0, alight: 0 }
}

/** Every color is the same body, so the kind for posing never matters: green stands in. */
export const SLIME: Species = {
  id: 'slime',
  name: 'slime',
  blurb: 'A slime from Dungeon Run: a dome of see-through jelly on a body of six bones, with sixteen more for the drops it bursts into.',
  detail: [3000, 8000, 16000],
  start: 3000,
  looks: KINDS.map((k) => ({ id: k, label: RULES[k].label[0].toUpperCase() + RULES[k].label.slice(1) })),
  make: (count, look) => makeSlime((KINDS as readonly string[]).includes(look) ? (look as SlimeKind) : 'green', count),
  moves: [
    { name: 'hop', label: 'Hop', doing: 'hopping on the spot', seconds: HOP, fps: 24, pose: (sk, t) => poseSlime(sk, slimeAt('green', 'live', 0, t), HOP) },
    {
      name: 'burst', label: 'Burst', doing: 'bursting into splats and growing back', seconds: BURST + SPAWN, fps: 24,
      pose: (sk, t) => poseSlime(sk, t < BURST ? slimeAt('green', 'burst', t) : slimeAt('green', 'spawn', t - BURST), HOP),
    },
  ],
  view: { target: [0, 0.3, 0], distance: 2, azimuth: 25, elevation: 15 },
}

/** The watch from Clockwork, keeping the real time on the visitor's clock. */
export const WATCH: Species = {
  id: 'watch',
  name: 'watch',
  blurb: 'The watch movement from Clockwork, every wheel a bone, keeping the real time.',
  detail: [30000, 60000, 120000],
  start: 30000,
  looks: [{ id: 'gold', label: 'Gold' }],
  make: (count) => {
    const b = makeClock(count)
    return { blobs: b.blobs, skin: b.skin, skeleton: b.skeleton }
  },
  moves: [
    // the move's own clock is ignored: the hands show the time now
    { name: 'time', label: 'Keep time', doing: 'ticking, showing the time now', seconds: 1, pose: (sk) => poseClock(sk, secondsOf(new Date())) },
  ],
  view: { target: [0, 0, 0], distance: 3.5, azimuth: 0, elevation: 0 },
}

/** What the sandbox can add besides the zoo. */
export const PROPS: Species[] = [SLIME, WATCH]
