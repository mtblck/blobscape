import type { Orbit } from '../../splat-core/view.ts'
import type { PixelLook, Rgb } from '../../splat-core/pixel.ts'
import type { Built } from '../../splat-engine/body.ts'
import type { PointLight } from '../../splat-engine/engine.ts'
import type { Skeleton } from '../../splat-engine/rig.ts'
import { compileScene, litFor, type SceneDoc } from '../../splat-engine/sceneDoc.ts'
import type { HeavensDoc } from '../../splat-engine/heavens.ts'
import { paletteAt, timeOf, type TimeId } from '../timeOfDay.ts'
import { SceneWater } from '../../splat-engine/sceneWater.ts'
import { DEFAULT_LIGHT, buildVoxels } from '../../splat-engine/voxel.ts'
import * as meadow from '../fourways/meadow/build.ts'
import { CAMPFIRE } from './scenes/campfire.ts'
import { BEE } from './scenes/bee.ts'
import { DRAGON } from './scenes/dragon.ts'
import { HAND } from './scenes/hand.ts'
import { ISLES } from './scenes/isles.ts'
import { OCTOPUS } from './scenes/octopus.ts'
import { OWL } from './scenes/owl.ts'
import { REEF } from './scenes/reef.ts'
import { CROC } from './scenes/croc.ts'
import { GROVE } from './scenes/grove.ts'
import { HARVEST } from './scenes/harvest.ts'
import { LAB } from './scenes/lab.ts'
import { HUT } from './scenes/hut.ts'
import { SNAIL } from './scenes/snail.ts'
import { SPIDER } from './scenes/spider.ts'
import { WINDOW } from './scenes/window.ts'
import { WINDMILL } from './scenes/windmill.ts'
import { RUIN } from './scenes/ruin.ts'
import { CAVE } from './scenes/cave.ts'
import { CANYON } from './scenes/canyon.ts'
import { CABIN } from './scenes/cabin.ts'
import { KOI_PROJECT } from './scenes/koi.ts'
import { madeProp } from '../props/index.ts'
import { composeScene } from '../../splat-engine/compose.ts'
import type { SceneProject } from '../../splat-engine/project.ts'
import type { WeatherId } from '../../splat-engine/skyRecipes.ts'
import { HENGE } from './scenes/henge.ts'
import { WHALES } from './scenes/whales.ts'
import { TURKEY } from './scenes/turkey.ts'
import { FISHING } from './scenes/fishing.ts'
import { LIGHTHOUSE as LIGHTHOUSE_DOC } from './scenes/lighthouse.ts'
import { ambientAt, lightsAt, poseFishing, skyAt } from './fishing.ts'

/** A scene Diorama can show: how to build it, move it and light it, and how it asks to be drawn. */
export interface Diorama {
  id: string
  label: string
  /**
   * The land and library props it is made of, for a scene written that way (docs/scenes-from-props.md): its
   * description is made from them (`composeScene`), and Scene Creator opens it as these pieces.
   */
  project?: SceneProject
  /** The shared weather it starts under (skyRecipes.ts `WEATHERS`), where it has one: the koi pond's light rain. */
  weather?: WeatherId
  /** False where the weather's clouds start left out, its rain and snow falling in from over the picture (the koi pond's tree and bamboo stand nearly into them). */
  overhead?: boolean
  /**
   * True where the scene as written is a day (the koi pond's gray afternoon): what waits for the night (its shared moon
   * and stars) is out until a night is picked, while its lamps stay lit as written.
   */
  byDay?: boolean
  /** For the view's label: what is in the picture. */
  about: string
  /** Seconds before it repeats. */
  loop: number
  /** Its own palette, and what to call it. */
  palette: { label: string; colors: Rgb[] }
  sky: NonNullable<PixelLook['sky']>
  /** How it starts out: the Finish controls. */
  /** The finish the scene asks for; the art-pixel effects (`bands`, `heat`, `selout`, `cycle`) are as `PixelLook` has them. */
  finish: { dither: number; glow: number; outline: boolean; edges: boolean; sky: boolean; steps: boolean; bands?: number; heat?: number; selout?: boolean; cycle?: PixelLook['cycle'] }
  views: { id: string; label: string; orbit: Orbit }[]
  /** Degrees the view rocks to either side while it plays, once a loop. */
  swing: number
  /** Cuts the scene. With `steps` (a palette), it is painted in steps of that palette as it is cut. */
  make(spacing: number, steps?: Rgb[]): Built
  pose(sk: Skeleton, t: number): void
  /** After `pose`: blows the scene's own rain, snow and leaves and turns its sails by a wind of the moment, `level` its level (`CompiledScene.blow`), where it has any. */
  blow?(sk: Skeleton, t: number, wind: readonly [number, number], wrap?: { at: readonly [number, number]; half: number }, level?: number): void
  /** Its live lights `t` seconds in. `shadows` says whether one that can cast shadows should (the page asks only where the GPU works them out). */
  lights(t: number, shadows?: boolean): PointLight[]
  /** How much of its painted color everything keeps before its lights are added: 1 where left out, less for a scene lit mostly live. */
  ambient?: number | readonly [number, number, number]
  /** The same, for a scene whose light changes as it plays (day turning to night): a share or a color, `t` seconds in. It is used in place of `ambient`. */
  ambientAt?: (t: number) => number | [number, number, number]
  /** The sky `t` seconds in, top and bottom, for a scene whose sky changes as it plays: used in place of `sky`, with its reach. */
  skyAt?: (t: number) => [Rgb, Rgb]
  /** How dark what stands in a casting light's way makes it, for a scene whose lights cast shadows: the engine's own where left out. */
  shadowDensity?: number
  /** Distance haze: its color (linear) and where it starts and would be total, in units past the view's target. */
  haze?: { color: [number, number, number]; from: number; to: number }
  /** The same, for a scene whose air changes (weather laid over it, diorama/weather.ts), seen from `distance`: used in place of `haze`. */
  hazeAt?: (distance: number) => { color: [number, number, number]; from: number; to: number } | undefined
  /** Its moon, sun, stars and own clouds from the shared recipes (splat-engine/heavens.ts): the clouds are drawn with the weather's (diorama/weather.ts). */
  heavens?: HeavensDoc
  /** The height of what stays put under (x, z), looking down from `top` (`bottom` where nothing is): what weather laid over the scene lands on. */
  ground?: (x: number, z: number, top: number, bottom: number) => number
  /** Parts (by their place in the list) that meet others by design: the check for parts passing through each other lets them. */
  touching?: number[]
  /** How big its description is, in bytes, written out as JSON: only for a scene that is data alone. */
  bytes?: number
  /** Which way its baked sun lies (a direction toward it, in the world), for the rim of light pixel art picks out: none for a scene with no sun. */
  sun?: readonly [number, number, number]
  /** How much light its baked shade keeps (the description's ambient share): pixel art shaded a pixel at a time shades by as much. */
  shade?: number
  /** Its description, for a scene that is one: what Scene Creator splits by the props it marks. */
  doc?: SceneDoc
  /** How many moves its description lists. */
  moves?: number
  /** How many parts its description lists: specks and mist in the air are not counted. */
  parts?: number
  /**
   * Its water, for a scene that has some: one loop of ripples worked out the first time it is asked for (it takes a
   * moment), then kept. The page draws its `surface` with the scene and shows it for each moment.
   */
  water?: () => SceneWater
  /**
   * The scene at a time of day, where a page sets one (timeOfDay.ts): under that time's sky and light, in a palette
   * that has its colors as that light leaves them, with its lamps, lit windows and fires lit only in the dark (those
   * the description says wait for it) and its sun only by day. Every style draws it. Left out for a scene that is not
   * a description alone.
   */
  timed?: (time: TimeId, lamps?: 'always') => Diorama
  /** For a scene `timed` made: the scene it is a time of day of. */
  of?: Diorama
  /** For a scene `timed` made: which time of day it is. */
  at?: TimeId
}

/** A described scene with some of it replaced, at every time of day (`make` is called when the list is put together, so `described` is defined by then). */
function withOver(make: () => Diorama, over: Partial<Diorama>): Diorama {
  const d = make()
  const out: Diorama = { ...d, ...over }
  const kept = new Map<Diorama, Diorama>()
  if (d.timed) out.timed = (time, lamps) => {
    const t = d.timed!(time, lamps)
    let k = kept.get(t)
    if (!k) kept.set(t, (k = { ...t, ...over, timed: out.timed, of: out }))
    return k
  }
  return out
}

/** The scene a page picked, whatever time of day of it is showing. */
export const sceneOf = (d: Diorama): Diorama => d.of ?? d

/** The name of the palette chosen for a scene, on its chip. */
const OWN_PALETTE = 'Made for it'

/** The lighthouse, the first scene, keeps its own five views and does not rock. */
const LIGHTHOUSE: Diorama = withOver(
  () => described('lighthouse', LIGHTHOUSE_DOC, 'A lighthouse and a cottage on a rock in the sea at dusk, with a turning lamp, pines, a jetty, a small boat, gulls and clouds'),
  { views: [
    { id: 'shore', label: 'From the shore', orbit: { target: [0.05, 0.84, 0.05], distance: 3.7, azimuth: 28, elevation: 10 } },
    { id: 'above', label: 'From above', orbit: { target: [0, 0.6, 0], distance: 5.2, azimuth: 40, elevation: 38 } },
    { id: 'lamp', label: 'The lamp', orbit: { target: [0.05, 1.35, -0.05], distance: 2.0, azimuth: 20, elevation: 6 } },
    { id: 'cottage', label: 'The cottage', orbit: { target: [-0.3, 0.4, 0.15], distance: 2.0, azimuth: 10, elevation: 14 } },
    { id: 'boat', label: 'The boat', orbit: { target: [0.82, 0.2, 0.65], distance: 2.0, azimuth: 55, elevation: 16 } },
  ],
  },
)

const night = (palette: Rgb[]): [Rgb, Rgb] => {
  const dark = [...palette].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]))
  return dark.length > 1 ? [dark[0], dark[1]] : [[9, 13, 32], [60, 94, 164]]
}

/** A scene written as a description (splat-engine/sceneDoc.ts), made ready for the page. */
/** What the page calls the palette a scene was made with. */

export function described(id: string, doc: SceneDoc, about: string, more: Pick<Diorama, 'project' | 'weather' | 'overhead' | 'byDay'> = {}): Diorama {
  // a scene written as a day keeps its lamps as written but has no moon or stars out ('always' never lights the night's)
  const c = compileScene(more.byDay ? litFor(doc, false, 'always') : doc)
  let pond: SceneWater | undefined
  const times = new Map<string, Diorama>()
  const self: Diorama = {
    ...more,
    id,
    label: c.name,
    about,
    doc,
    bytes: new TextEncoder().encode(JSON.stringify(doc)).length,
    moves: doc.moves?.length ?? 0,
    parts: doc.parts.length,
    touching: c.touching,
    loop: c.loop,
    palette: { label: OWN_PALETTE, colors: c.palette },
    // with no sky of its own, the switch gives it a night made of its two darkest colors
    sky: c.look.sky ?? night(c.palette),
    finish: { dither: c.look.dither, glow: c.look.glow, outline: !!c.look.outline, edges: !!c.look.edges, sky: !!c.look.sky, steps: c.steps, bands: c.look.bands, heat: c.look.heat?.pixels, selout: c.look.selout, cycle: c.look.cycle },
    views: [
      { id: 'start', label: 'From the front', orbit: c.orbit },
      { id: 'above', label: 'From above', orbit: { ...c.orbit, elevation: 40, distance: c.orbit.distance * 1.25 } },
      { id: 'close', label: 'Close up', orbit: { ...c.orbit, target: [c.orbit.target[0], c.orbit.target[1] * 0.6, c.orbit.target[2]], distance: c.orbit.distance * 0.55 } },
    ],
    swing: c.swing,
    sun: doc.light?.from ?? DEFAULT_LIGHT.dir,
    shade: doc.light?.ambient ?? DEFAULT_LIGHT.ambient,
    make: (spacing, steps) => {
      const built = buildVoxels(c.spec(spacing, steps))
      const empty = c.empty(built)
      if (empty.length) console.warn(`${c.name}: parts ${empty.join(', ')} have no blobs at this detail`)
      return built
    },
    pose: c.pose,
    blow: c.blow,
    lights: c.lights,
    haze: c.haze,
    ground: c.ground,
    heavens: doc.heavens,
    water: c.water ? () => (pond ??= new SceneWater(c)) : undefined,
    // `lamps` 'always' is a day too gloomy for lamps to stay out (a storm, skyRecipes.ts `gloomy`): what waits for the dark is lit
    timed: (when, lamps) => {
      const key = `${when}|${lamps ?? ''}`
      let d = times.get(key)
      if (!d) {
        const time = timeOf(when)
        // the time changes the sky, the light and what is lit, never what the scene is: its description and size stay its own
        const lit = litFor(doc, time.dark, lamps ?? doc.lamps)
        // at night what glows only to keep its own color (a cloud, a flower, a gull: no `lit`) takes the night's light like the rest
        const parts = time.dark ? lit.parts.map((p) => (p.glow && !p.lit ? { ...p, glow: undefined, laid: true } : p)) : lit.parts
        const at: SceneDoc = { ...lit, parts, sky: time.sky, skyReach: undefined }
        const t = described(id, at, about, { ...more, byDay: undefined })
        // its clouds keep their own color by night only as the scene was written; set at night they take the night's light
        const clouds = doc.heavens?.clouds
        const heavens = doc.heavens && { ...doc.heavens, clouds: clouds && { ...clouds, glow: clouds.glow && !time.dark } }
        d = { ...t, doc, heavens, bytes: self.bytes, ambient: time.light, palette: { label: OWN_PALETTE, colors: paletteAt(t.palette.colors, time) }, timed: self.timed, of: self, at: when }
        times.set(key, d)
      }
      return d
    },
  }
  return self
}

/**
 * The fox and wisp of One Scene, Four Ways (fourways/meadow/): not a description alone, because a description cannot
 * yet hold a furred creature or grass. Its turf, stone and sky are one; the fox and the blades are joined on.
 */
const FOX_MEADOW: Diorama = {
  id: 'meadow',
  label: meadow.SCENE.name,
  about: 'A fox with a full coat of fur trotting a ring through tall swaying grass round a standing stone at night, while a wisp of light circles it and throws moving shadows',
  loop: meadow.LOOP,
  palette: { label: OWN_PALETTE, colors: meadow.SCENE.palette },
  sky: meadow.SCENE.look.sky ?? night(meadow.SCENE.palette),
  finish: { dither: meadow.SCENE.look.dither, glow: meadow.SCENE.look.glow, outline: !!meadow.SCENE.look.outline, edges: !!meadow.SCENE.look.edges, sky: !!meadow.SCENE.look.sky, steps: false },
  views: [
    { id: 'start', label: 'From the front', orbit: meadow.SCENE.orbit },
    { id: 'above', label: 'From above', orbit: { ...meadow.SCENE.orbit, elevation: 40, distance: meadow.SCENE.orbit.distance * 1.25 } },
    { id: 'close', label: 'Close up', orbit: { ...meadow.SCENE.orbit, target: [0, 0.3, 0.6], distance: meadow.SCENE.orbit.distance * 0.55 } },
  ],
  swing: 0,
  make: (spacing) => { const s = meadow.sharesAt(spacing); return meadow.buildMeadow(spacing, s.fox, s.blades) },
  pose: meadow.poseMeadowBones,
  lights: (t, shadows = false) => meadow.lightsAt(t, 1, shadows),
  ambient: meadow.AMBIENT,
  shadowDensity: 0.5,
  haze: meadow.SCENE.haze,
  // the fox wades through the grass and its paws press into the turf
  touching: [meadow.SCENE_PARTS, meadow.SCENE_PARTS + 1],
}

/**
 * The boy fishing the moon and the sun out of a cloud: its island, boy and clouds are a description (scenes/fishing.ts),
 * but its story is told in order, which a description's repeating moves can't do, so it is posed by diorama/fishing.ts,
 * which also turns the sky and the light from day to night and back.
 */
const SKY_FISHING: Diorama = (() => {
  const d = described('fishing', FISHING, 'A boy on the edge of a floating island casts his fishing line into a cloud, feels two tugs, and hauls up the moon, flinging it over his head into the sky as the sun sinks and the day turns to a starry night; then he casts again and pulls up the sun, and the day comes back')
  const base = d.pose
  return { ...d, pose: (sk, t) => poseFishing(sk, t, base), lights: (t) => lightsAt(t), ambientAt, skyAt, timed: undefined }
})()

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
  described('harvest', HARVEST, 'A pumpkin patch under a huge moon, kept by a scarecrow with a carved pumpkin head and a lantern, with crows on its arm, a wind pump turning behind, corn and drifting leaves.'),
  described('lab', LAB, 'A laboratory at night where sprouts grow in three tall jars of glowing liquid, with rising bubbles, a steaming flask, blinking dials, a swaying lamp and a cat keeping watch.'),
  described('croc', CROC, 'A crocodile basking on a sandbar in a sunny pond, yawning, with flowers growing along its back, a small bird riding on it and butterflies overhead.'),
  described('grove', GROVE, 'A grove of birches in the snow at night, their faces lit from inside like lanterns, with paper lamps on the branches, a fox asleep below and ribbons of light in the sky.'),
  described('hut', HUT, 'A fishing hut on stilts over a mangrove lagoon at dawn, with a lantern, drying nets, a rowing boat, and a heron in the shallows.'),
  described('window', WINDOW, 'A round stained glass window with turning rings of panes, in the last wall of a ruined library at sunrise, with shelves, piles of books and a tree grown over the wall.'),
  described('spider', SPIDER, 'A wind-up brass spider with a lantern for a body, on its web between two bare trees, with moths circling the light.'),
  described('snail', SNAIL, 'A giant snail whose shell is a little house, with lit windows, a smoking chimney, a deck with a flag and a swinging lantern, inching through a wood of tall glowing mushrooms with ferns and fireflies'),
  described('windmill', WINDMILL, 'A windmill on a farm by day, with turning sails, sheep, a duck on a pond, a wheat field, trees, clouds and birds'),
  described('ruin', RUIN, 'A ruined chapel at dusk in autumn: an arcade of pointed arches broken along its top, brick walls fallen in places with their bricks at their feet, worn steps, a leaning fence, a maple and a lantern'),
  described('cave', CAVE, 'An ice cave cut open at night, with icicles along its broken roof, stalactites joining stalagmites, flowstone, basalt columns stepping into a still pool, a geode broken open and glowing crystals, one growing as you watch'),
  described('canyon', CANYON, 'A desert canyon at sunset worn by water, with banded cliffs and ledges, scree, a mesa, hoodoos, a natural arch, a dry stream bed of pebbles and cracked mud, saguaros, a gnarled tree, a ram skull with curled horns, old ribs, a fossil shell and a circling hawk'),
  described('cabin', CABIN, 'A log cabin snowed in on a winter night: snow falling and settling where it lands, drifts piled deep downwind of the cabin, rocks and fence, a path trodden to the gate, frost growing across the lit window, chimney smoke, a woodpile and a lantern'),
  described('koi', composeScene(KOI_PROJECT, madeProp), 'A koi pond in a moss garden on a rainy day: raindrops ring the water where they land, the rings cross and bounce off the banks and stepping stones, koi circle under the surface and leave wakes, and a tall stone lantern and a low snow-viewing lantern glow under a cherry tree in full bloom that sheds its petals, with bamboo, irises and lily pads', { project: KOI_PROJECT, weather: 'light-rain', overhead: false, byDay: true }),
  described('whales', WHALES, 'A pod of whales swimming through space, a mother and two calves with stars on their backs, their tails and flippers beating slowly, past a ringed planet and its moon, banks of nebula, a far sun, tumbling rocks and stardust streaming by'),
  described('turkey', TURKEY, 'A giant turkey chasing a cook in an apron and chef’s hat down a country road in the fall, past a rail fence, trees in fall color, pumpkins, a mailbox and a billboard, with dust at their heels, loose feathers and falling leaves'),
  described('henge', HENGE, 'A ring of standing stones at night where a magic circle flares to life, sparks gather into a witch in a white robe and a tall white hat, who draws a wand, waves it once and vanishes in a shower of sparks'),
  FOX_MEADOW,
  SKY_FISHING,
]
