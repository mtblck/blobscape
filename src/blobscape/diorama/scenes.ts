import type { Orbit } from '../../splat-core/view.ts'
import type { PixelLook, Rgb } from '../../splat-core/pixel.ts'
import type { Built } from '../../splat-engine/body.ts'
import type { PointLight } from '../../splat-engine/engine.ts'
import type { Skeleton } from '../../splat-engine/rig.ts'
import { compileScene, type SceneDoc } from '../../splat-engine/sceneDoc.ts'
import { buildVoxels } from '../../splat-engine/voxel.ts'
import { LOOP, PALETTES, lampLights, makeDiorama, poseDiorama } from './scene.ts'
import { CAMPFIRE } from './scenes/campfire.ts'
import { BEE } from './scenes/bee.ts'
import { DRAGON } from './scenes/dragon.ts'
import { HAND } from './scenes/hand.ts'
import { ISLES } from './scenes/isles.ts'
import { OCTOPUS } from './scenes/octopus.ts'
import { OWL } from './scenes/owl.ts'
import { REEF } from './scenes/reef.ts'
import { WINDMILL } from './scenes/windmill.ts'

/** A scene Pixel Diorama can show: how to build it, move it and light it, and how it asks to be drawn. */
export interface Diorama {
  id: string
  label: string
  /** For the view's label: what is in the picture. */
  about: string
  /** Seconds before it repeats. */
  loop: number
  /** Its own palette, and what to call it. */
  palette: { label: string; colours: Rgb[] }
  sky: NonNullable<PixelLook['sky']>
  /** How it starts out: the Finish controls. */
  finish: { dither: number; glow: number; outline: boolean; edges: boolean; sky: boolean }
  views: { id: string; label: string; orbit: Orbit }[]
  /** Degrees the view rocks to either side while it plays, once a loop. */
  swing: number
  make(spacing: number): Built
  pose(sk: Skeleton, t: number): void
  lights(t: number): PointLight[]
}

const LIGHTHOUSE: Diorama = {
  id: 'lighthouse',
  label: 'Lighthouse',
  about: 'A lighthouse and a cottage on a rock in the sea at dusk, with a turning lamp, pines, a jetty, a small boat, gulls and clouds',
  loop: LOOP,
  palette: { label: PALETTES[0].label, colours: PALETTES[0].colours },
  sky: [[9, 13, 32], [60, 94, 164]],
  finish: { dither: 0.05, glow: 1.5, outline: true, edges: true, sky: true },
  views: [
    { id: 'shore', label: 'From the shore', orbit: { target: [0.05, 0.84, 0.05], distance: 3.7, azimuth: 28, elevation: 10 } },
    { id: 'above', label: 'From above', orbit: { target: [0, 0.6, 0], distance: 5.2, azimuth: 40, elevation: 38 } },
    { id: 'lamp', label: 'The lamp', orbit: { target: [0.05, 1.35, -0.05], distance: 2.0, azimuth: 20, elevation: 6 } },
    { id: 'cottage', label: 'The cottage', orbit: { target: [-0.3, 0.4, 0.15], distance: 2.0, azimuth: 10, elevation: 14 } },
    { id: 'boat', label: 'The boat', orbit: { target: [0.82, 0.2, 0.65], distance: 2.0, azimuth: 55, elevation: 16 } },
  ],
  swing: 0,
  make: makeDiorama,
  pose: poseDiorama,
  lights: lampLights,
}

const night = (palette: Rgb[]): [Rgb, Rgb] => {
  const dark = [...palette].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]))
  return dark.length > 1 ? [dark[0], dark[1]] : [[9, 13, 32], [60, 94, 164]]
}

/** A scene written as a description (splat-engine/sceneDoc.ts), made ready for the page. */
export function described(id: string, doc: SceneDoc, about: string): Diorama {
  const c = compileScene(doc)
  return {
    id,
    label: c.name,
    about,
    loop: c.loop,
    palette: { label: 'Its own', colours: c.palette },
    // with no sky of its own, the switch gives it a night made of its two darkest colours
    sky: c.look.sky ?? night(c.palette),
    finish: { dither: c.look.dither, glow: c.look.glow, outline: !!c.look.outline, edges: !!c.look.edges, sky: !!c.look.sky },
    views: [
      { id: 'start', label: 'From the front', orbit: c.orbit },
      { id: 'above', label: 'From above', orbit: { ...c.orbit, elevation: 40, distance: c.orbit.distance * 1.25 } },
      { id: 'close', label: 'Close up', orbit: { ...c.orbit, target: [c.orbit.target[0], c.orbit.target[1] * 0.6, c.orbit.target[2]], distance: c.orbit.distance * 0.55 } },
    ],
    swing: c.swing,
    make: (spacing) => {
      const built = buildVoxels(c.spec(spacing))
      const empty = c.empty(built)
      if (empty.length) console.warn(`${c.name}: parts ${empty.join(', ')} have no blobs at this detail`)
      return built
    },
    pose: c.pose,
    lights: c.lights,
  }
}

export const DIORAMAS: Diorama[] = [
  LIGHTHOUSE,
  described('campfire', CAMPFIRE, 'A camp in a clearing among pines at night, with a flickering fire throwing sparks, a tent, a lantern, fireflies and the moon'),
  described('dragon', DRAGON, 'A red dragon bent over a glowing pool of lava in a dark cave, its claws on the rim, its neck swaying, its head turning, its jaw opening and its wings shifting, with embers rising'),
  described('bee', BEE, 'A giant bee hovering at a pink flower in a forest clearing, with fluttering pale wings, little bees, butterflies, mushrooms, ferns and drifting pollen'),
  described('hand', HAND, 'A giant sandstone hand rising from a desert ruin at dusk, holding a glowing blue crystal that turns and bobs, with slowly curling fingers, broken columns, cacti and drifting fireflies'),
  described('reef', REEF, 'A giant jellyfish beating slowly over a coral reef, trailing swaying arms, with branching corals, seaweed, circling fish and rising bubbles'),
  described('octopus', OCTOPUS, 'A purple octopus riding a bell buoy through a storm at night, holding up a glowing lantern in one arm while its other arms curl and the bell swings, in falling rain'),
  described('owl', OWL, 'A great owl in a starry wizard hat perched on a stump, turning its head to watch a cauldron of glowing pink potion that stirs itself over a fire, among candles, bottles, books and mushrooms'),
  described('isles', ISLES, 'Snowy islands of rock adrift in a night sky, joined by rope bridges: a cabin with lit windows and a smoking chimney among pines, a frozen waterfall, a crown of glowing ice crystals, a beacon, and falling snow'),
  described('windmill', WINDMILL, 'A windmill on a farm by day, with turning sails, sheep, a duck on a pond, a wheat field, trees, clouds and birds'),
]
