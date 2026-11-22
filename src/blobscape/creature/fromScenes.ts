import type { Vec3 } from '../../splat-core/blobs.ts'
import { X, Y, Z, set, turn } from '../../splat-engine/posing.ts'
import { axisAngle, type Skeleton } from '../../splat-engine/rig.ts'
import { sceneCreature } from '../../splat-engine/zoo/fromScene.ts'
import type { Species } from '../../splat-engine/zoo/species.ts'
import { ZOO } from '../../splat-engine/zoo/index.ts'
import { CROC } from '../diorama/scenes/croc.ts'
import { WIZARD_OWL } from '../props/owl.ts'
import { REEF } from '../diorama/scenes/reef.ts'

/**
 * Creatures taken straight from the Diorama scenes (splat-engine/zoo/fromScene.ts):
 * the garden crocodile, the reef's jellyfish and the owl in its wizard hat, each with
 * a move of its own, the scene's own motion as its standing move, and the page's Still.
 */

const TAU = Math.PI * 2
const DETAIL = [5000, 15000, 40000, 80000]
const LOOKS = [{ id: 'scene', label: 'As in the scene' }]

// --- The crocodile. In the scene it basks facing +x with its legs as part of the body: here each leg has a bone.
const HIPS: [string, Vec3][] = [['legA', [0.38, 0.24, 0.24]], ['legB', [0.38, 0.24, -0.24]], ['legC', [-0.55, 0.24, 0.24]], ['legD', [-0.55, 0.24, -0.24]]]
const croc = sceneCreature({
  doc: CROC,
  keep: /^(croc|torso|tail\d|head|jaw|bloom\d+|bird)$/,
  bones: HIPS.map(([name, at]) => ({ name, at, parent: 'croc' })),
  hang: { 5: 'legA', 6: 'legB', 7: 'legC', 8: 'legD' },
  turn: 1,
  shift: [0, 0, 0.1],
})
const CROC_STEP = 1.3

/** A sprawling walk: diagonal legs swing together and lift as they come forward, while the body snakes and the tail follows in a wave. */
function crocWalk(sk: Skeleton, t: number) {
  sk.reset()
  const ph = (t / CROC_STEP) * TAU
  HIPS.forEach(([name, at], i) => {
    // legs on the scene's +z side are on the creature's −x side
    const side = at[2] > 0 ? -1 : 1
    const a = ph + (i === 0 || i === 3 ? 0 : Math.PI)
    set(sk, name, Y, -side * 0.4 * Math.sin(a))
    turn(sk, name, Z, side * 0.28 * Math.max(0, Math.cos(a)))
  })
  sk.offset.set([0, 0.012 * Math.sin(ph * 2), 0], sk.index('croc') * 3)
  set(sk, 'croc', Y, 0.05 * Math.sin(ph))
  turn(sk, 'croc', Z, 0.03 * Math.sin(ph + 0.6))
  set(sk, 'torso', Y, 0.05 * Math.sin(ph + 0.5))
  set(sk, 'head', Y, -0.12 * Math.sin(ph + 0.3))
  set(sk, 'jaw', X, -0.05 - 0.03 * Math.sin(ph * 2))
  for (let k = 0; k < 3; k++) set(sk, `tail${k}`, Y, (0.16 + 0.05 * k) * Math.sin(ph - 1.2 - k * 0.8))
  sk.offset.set([0, 0.02 * Math.max(0, Math.sin(ph * 2)), 0], sk.index('bird') * 3)
  set(sk, 'bird', Y, 0.3 * Math.sin(ph))
  sk.update()
}

// --- The jellyfish, from the reef: its bell and eight arms of three bones each.
const jelly = sceneCreature({ doc: REEF, keep: /^(jelly|t\d[abc])$/, turn: 0, shift: [0, -0.84, 0] })
const ARMS = (REEF.bones ?? []).filter((b) => /^t\da$/.test(b.name)).map((b) => {
  // the level axis each arm swings about, so all eight close in and open out together
  const l = Math.hypot(b.at[0], b.at[2]) || 1
  return { id: b.name.slice(0, 2), axis: [-b.at[2] / l, 0, b.at[0] / l] as Vec3 }
})
const STROKE = 2.4

/** Swimming: the bell squeezes and the jellyfish rises on each stroke, its arms closing in behind the squeeze and trailing open again, each joint a beat later. */
function jellySwim(sk: Skeleton, t: number) {
  sk.reset()
  const ph = (t / STROKE) * TAU
  const b = sk.index('jelly')
  // a quick squeeze and a slow opening, from two waves that both fit the stroke
  const squeeze = Math.sin(ph) + 0.3 * Math.sin(ph * 2)
  sk.size[b] = 1 - 0.08 * squeeze
  sk.offset.set([0, 0.13 * Math.sin(ph - 1.1), 0], b * 3)
  set(sk, 'jelly', Z, 0.05 * Math.sin(ph - 0.4))
  for (const arm of ARMS) {
    ;['a', 'b', 'c'].forEach((seg, k) => sk.setRotation(sk.index(arm.id + seg), axisAngle(arm.axis, (0.16 + 0.1 * k) * Math.sin(ph - 0.9 - k * 0.7))))
  }
  sk.update()
}

// --- The owl. It perches in the scene; here its toes get a bone a side, so it can waddle.
const owl = sceneCreature({
  doc: WIZARD_OWL.doc,
  keep: /^(body|bodyin|wing[LR]|head)$/,
  bones: [
    // the lining of the body follows the body
    { name: 'bodyin', at: [-0.62, 0.55, -0.05], parent: 'body' },
    { name: 'footL', at: [-0.78, 0.6, 0.17] },
    { name: 'footR', at: [-0.46, 0.6, 0.17] },
  ],
  hang: { 45: 'footL', 46: 'footL', 47: 'footL', 49: 'footR', 50: 'footR', 51: 'footR' },
  // its tail hung below the stump it sat on: lifted to clear the floor
  reshape: { 44: { kind: 'cone', from: [-0.62, 0.78, -0.35], to: [-0.62, 0.66, -0.62], r: 0.16 } },
  turn: 0,
  shift: [0.62, -0.5, 0.05],
})
const WADDLE = 1.0

/** A waddle: the body rocks from foot to foot and bobs, each foot lifting as the weight comes off it, the head staying level and the wings out a little for balance. */
function owlWalk(sk: Skeleton, t: number) {
  sk.reset()
  const ph = (t / WADDLE) * TAU
  const rock = Math.sin(ph)
  sk.offset.set([0.04 * rock, 0.02 * (1 - Math.cos(ph * 2)), 0], sk.index('body') * 3)
  set(sk, 'body', Z, -0.11 * rock)
  turn(sk, 'body', Y, 0.1 * Math.sin(ph + 0.5))
  set(sk, 'head', Z, 0.1 * rock)
  turn(sk, 'head', Y, -0.08 * Math.sin(ph + 0.5))
  set(sk, 'wingL', Z, -0.1 - 0.08 * Math.sin(ph * 2))
  set(sk, 'wingR', Z, 0.1 + 0.08 * Math.sin(ph * 2 + 1))
  // weight on the left as it rocks left (−x), so the right foot lifts, and the other way round
  sk.offset.set([0, 0.07 * Math.max(0, -rock), 0.05 * Math.cos(ph)], sk.index('footR') * 3)
  sk.offset.set([0, 0.07 * Math.max(0, rock), -0.05 * Math.cos(ph)], sk.index('footL') * 3)
  sk.update()
}

export const SCENE_CREATURES: Species[] = [
  {
    id: 'crocodile', name: 'crocodile',
    blurb: 'The garden crocodile from Diorama, with flowers down its back and a small bird riding along, cut as it is in the scene and given legs that walk.',
    detail: DETAIL, start: 40000, looks: LOOKS,
    make: (count) => croc.cut(count),
    moves: [
      { name: 'walk', label: 'Walk', doing: 'walking on the spot', seconds: CROC_STEP, fps: 24, pose: crocWalk },
      { name: 'stand', label: 'Stand', doing: 'basking, breathing and yawning', seconds: croc.loop, fps: 12, pose: croc.idle },
    ],
    view: { target: [0, 0.3, 0], distance: 4.6, azimuth: 55, elevation: 14 },
  },
  {
    id: 'jellyfish', name: 'jellyfish',
    blurb: 'The jellyfish from the reef scene of Diorama: a glowing bell with a ring of lights and eight trailing arms of three bones each.',
    detail: DETAIL, start: 15000, looks: LOOKS,
    make: (count) => jelly.cut(count),
    moves: [
      { name: 'swim', label: 'Swim', doing: 'swimming on the spot', seconds: STROKE, fps: 24, pose: jellySwim },
      { name: 'float', label: 'Float', doing: 'floating, its arms swaying', seconds: jelly.loop, fps: 12, pose: jelly.idle },
    ],
    view: { target: [0, 0.9, 0], distance: 4.4, azimuth: 30, elevation: 6 },
  },
  {
    id: 'owl', name: 'owl',
    blurb: 'The great owl in a starry wizard hat from Diorama, off its stump: it waddles, or stands and looks round as it does in the scene.',
    detail: DETAIL, start: 40000, looks: LOOKS,
    make: (count) => owl.cut(count),
    moves: [
      { name: 'walk', label: 'Walk', doing: 'waddling on the spot', seconds: WADDLE, fps: 24, pose: owlWalk },
      { name: 'stand', label: 'Stand', doing: 'standing and looking round', seconds: owl.loop, fps: 12, pose: owl.idle },
    ],
    view: { target: [0, 1.05, 0], distance: 5.4, azimuth: 25, elevation: 8 },
  },
]

/** Every creature of the Creature page and the sandbox: the scenes' creatures first, then the zoo. */
export const CREATURES: Species[] = [...SCENE_CREATURES, ...ZOO]
