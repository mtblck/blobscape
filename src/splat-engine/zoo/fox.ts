import { COATS, makeCreature, poseIdle, poseWalk } from '../creature.ts'
import type { Species } from './species.ts'

const LABELS: Record<keyof typeof COATS, string> = { red: 'Red', arctic: 'Arctic', silver: 'Silver' }

/** The first creature: the fox from creature.ts, which the rig lessons use too. */
export const FOX: Species = {
  id: 'fox',
  name: 'fox',
  blurb: 'A fox of fourteen bones, with a trot and a look round.',
  detail: [5000, 20000, 100000, 200000],
  start: 20000,
  looks: (Object.keys(COATS) as (keyof typeof COATS)[]).map((id) => ({ id, label: LABELS[id] })),
  make: (count, look) => makeCreature(count, 7, COATS[look as keyof typeof COATS] ?? COATS.red),
  moves: [
    { name: 'trot', label: 'Trot', doing: 'trotting on the spot', seconds: 1 / 1.4, fps: 24, pose: poseWalk },
    { name: 'idle', label: 'Stand', doing: 'standing and looking round', seconds: 4, fps: 12, pose: poseIdle },
  ],
  view: { target: [0, 0.72, 0], distance: 4.2, azimuth: 40, elevation: 12 },
}
