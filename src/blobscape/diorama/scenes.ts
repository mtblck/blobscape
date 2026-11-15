import type { Orbit } from '../../splat-core/view.ts'
import type { Rgb } from '../../splat-core/pixel.ts'
import type { Built } from '../../splat-engine/body.ts'
import type { PointLight } from '../../splat-engine/engine.ts'
import type { Skeleton } from '../../splat-engine/rig.ts'
import { compileScene, type SceneDoc } from '../../splat-engine/sceneDoc.ts'
import { buildVoxels } from '../../splat-engine/voxel.ts'
import { LOOP, PALETTES, lampLights, makeDiorama, poseDiorama } from './scene.ts'
import { CAMPFIRE } from './scenes/campfire.ts'
import { BEE } from './scenes/bee.ts'
import { DRAGON } from './scenes/dragon.ts'
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
  sky: [Rgb, Rgb]
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
  finish: { dither: 0.1, glow: 1.5, outline: true, edges: true, sky: true },
  views: [
    { id: 'shore', label: 'From the shore', orbit: { target: [0.1, 0.95, 0.1], distance: 4.3, azimuth: 28, elevation: 10 } },
    { id: 'above', label: 'From above', orbit: { target: [0, 0.7, 0], distance: 6.2, azimuth: 40, elevation: 38 } },
    { id: 'lamp', label: 'The lamp', orbit: { target: [0.05, 1.35, -0.05], distance: 2.0, azimuth: 20, elevation: 6 } },
    { id: 'cottage', label: 'The cottage', orbit: { target: [-0.3, 0.4, 0.15], distance: 2.0, azimuth: 10, elevation: 14 } },
    { id: 'boat', label: 'The boat', orbit: { target: [0.85, 0.2, 0.75], distance: 2.0, azimuth: 55, elevation: 16 } },
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
  described('windmill', WINDMILL, 'A windmill on a farm by day, with turning sails, sheep, a duck on a pond, a wheat field, trees, clouds and birds'),
]
