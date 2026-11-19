import type { SceneDoc } from '../../splat-engine/sceneDoc.ts'
import { splitScene, type PropDoc, type PropPick } from '../../splat-engine/project.ts'
import { DRAGON } from '../diorama/scenes/dragon.ts'
import { HENGE } from '../diorama/scenes/henge.ts'
import { LIGHTHOUSE } from '../diorama/scenes/lighthouse.ts'
import { TURKEY } from '../diorama/scenes/turkey.ts'
import { WINDMILL } from '../diorama/scenes/windmill.ts'
import { ISLES } from '../diorama/scenes/isles.ts'
import { CANYON } from '../diorama/scenes/canyon.ts'
import { MEADOW } from '../fourways/meadow/doc.ts'
import { CREATURES } from '../creature/fromScenes.ts'
import { HENGE_PICKS, LAVA_DRAGON_PICKS, LIGHTHOUSE_PICKS, TURKEY_PICKS, WINDMILL_PICKS, WITCH_IN_SPARKS_PICKS } from './picks.ts'
import { PLAIN_ROCK, PLAIN_TURF } from './lands.ts'

/**
 * Scene Creator's library (issue #334): props lifted out of Pixel Diorama's scenes, the lands they stood on and a few
 * more, and every creature. The list is plain facts for the page and its search; a prop's description is cut out of
 * its scene only when asked for (`libraryProp`), once, because splitting a scene looks at every part.
 */

/** What an entry is: a prop to place, a land to build on, or a creature (a `Species`, placed and posed its own way). */
export type LibraryKind = 'prop' | 'land' | 'creature'

export interface LibraryEntry {
  /** Its id in a project file and in addresses. */
  id: string
  /** Its name on its card. */
  name: string
  /** A sentence for its card and for search. */
  about: string
  kind: LibraryKind
  /** Where it comes from: a scene's id, or 'creatures', or 'plain' for the lands made to start from. */
  from: string
  /** Its card picture, under the site's root (`npm run props` records them). */
  picture: string
}

/** One way of splitting a scene: its picks, and which of them (by pick name) and its land go in the library. */
interface Source {
  from: string
  doc: SceneDoc
  picks: PropPick[]
  props: { id: string; pick: string; about: string }[]
  land?: { id: string; name: string; about: string }
}

const SOURCES: Source[] = [
  {
    from: 'lighthouse', doc: LIGHTHOUSE, picks: LIGHTHOUSE_PICKS,
    props: [
      { id: 'lighthouse', pick: 'Lighthouse', about: 'A red and white lighthouse with a turning lamp that sweeps two beams of light round it' },
      { id: 'keepers-cottage', pick: "Keeper's cottage", about: 'A white cottage with a red tiled roof, a lit window and smoke rising from its chimney' },
      { id: 'tall-pine', pick: 'Tall pine', about: 'A tall pine that sways in the wind' },
      { id: 'pine', pick: 'Pine', about: 'A pine that sways in the wind' },
      { id: 'small-pine', pick: 'Small pine', about: 'A small pine that sways in the wind' },
      { id: 'jetty', pick: 'Jetty', about: 'A wooden jetty on posts with a lantern at its end' },
      { id: 'sailing-boat', pick: 'Sailing boat', about: 'A small sailing boat with a lantern, rocking on the swell' },
      { id: 'buoy', pick: 'Buoy', about: 'A red and white buoy with a light on top, nodding in the swell' },
    ],
    land: { id: 'lighthouse-rock', name: 'Lighthouse rock', about: 'A grassy rock in a round of sea at dusk, with rocks, bushes, flowers, gulls, clouds, the moon and stars' },
  },
  {
    from: 'windmill', doc: WINDMILL, picks: WINDMILL_PICKS,
    props: [
      { id: 'windmill', pick: 'Windmill', about: 'A windmill whose sails turn' },
      { id: 'apple-tree', pick: 'Apple tree', about: 'An apple tree' },
      { id: 'big-apple-tree', pick: 'Big apple tree', about: 'A big apple tree' },
      { id: 'small-apple-tree', pick: 'Small apple tree', about: 'A small apple tree' },
      { id: 'duck', pick: 'Duck', about: 'A duck' },
      { id: 'haystack', pick: 'Haystack', about: 'A haystack' },
      { id: 'sheep', pick: 'Sheep', about: 'A grazing sheep' },
    ],
    land: { id: 'windmill-hill', name: 'Windmill hill', about: 'The green hill the windmill stands on, with its path and fields' },
  },
  {
    from: 'turkey', doc: TURKEY, picks: TURKEY_PICKS,
    props: [
      { id: 'giant-turkey', pick: 'Giant turkey', about: 'A giant turkey running, kicking up dust and losing feathers' },
      { id: 'cook', pick: 'Cook', about: 'A cook in an apron running for her life' },
      { id: 'billboard', pick: 'Billboard', about: 'A roadside billboard on two posts' },
      { id: 'mailbox', pick: 'Mailbox', about: 'A mailbox on a post' },
      { id: 'roadside-haystack', pick: 'Roadside haystack', about: 'A tall haystack' },
      { id: 'roadside-tree', pick: 'Roadside tree', about: 'A roadside tree' },
      { id: 'second-roadside-tree', pick: 'Second roadside tree', about: 'Another roadside tree' },
    ],
  },
  {
    from: 'henge', doc: HENGE, picks: HENGE_PICKS,
    props: [
      { id: 'white-witch', pick: 'White witch', about: 'A witch in a white robe and hat, holding a wand' },
      { id: 'magic-circle', pick: 'Magic circle', about: 'A glowing circle of rings and a star turning on the ground, giving off blue light' },
    ],
    land: { id: 'henge-turf', name: 'Henge turf', about: 'A ring of standing stones on dark turf under the stars' },
  },
  {
    from: 'henge', doc: HENGE, picks: WITCH_IN_SPARKS_PICKS,
    props: [{ id: 'white-witch-sparks', pick: 'White witch, coming and going', about: 'The white witch arriving in a burst of sparks, waving her wand with two flashes, and leaving again' }],
  },
  {
    from: 'dragon', doc: DRAGON, picks: LAVA_DRAGON_PICKS,
    props: [{ id: 'lava-dragon', pick: 'Lava dragon', about: 'A red dragon with spread wings, swaying its neck and opening its jaw' }],
  },
]

/** Lands taken whole: scenes whose ground is the point, and the plain ones to start from. */
const WHOLE_LANDS: { id: string; name: string; about: string; from: string; doc: SceneDoc }[] = [
  { id: 'sky-islands', name: 'Sky islands', about: 'Snowy islands of rock adrift in a night sky, joined by rope bridges', from: 'isles', doc: ISLES },
  { id: 'canyon-floor', name: 'Canyon floor', about: 'A desert canyon of banded rock, buttes and an arch', from: 'canyon', doc: CANYON },
  { id: 'meadow', name: 'Meadow', about: 'A round of night meadow with a standing stone', from: 'meadow', doc: MEADOW },
  { id: 'plain-turf', name: 'Round of turf', about: 'A plain round of grass on earth, level, to build on', from: 'plain', doc: PLAIN_TURF },
  { id: 'plain-rock', name: 'Low rock', about: 'A plain low rock with moss on top, to build on', from: 'plain', doc: PLAIN_ROCK },
]

const picture = (id: string) => `/props/${id}.png`

/** Every entry: props, then lands, then creatures. */
export const LIBRARY: LibraryEntry[] = [
  ...SOURCES.flatMap((s) => s.props.map((p): LibraryEntry => ({ id: p.id, name: p.pick, about: p.about, kind: 'prop', from: s.from, picture: picture(p.id) }))),
  ...SOURCES.filter((s) => s.land).map((s): LibraryEntry => ({ id: s.land!.id, name: s.land!.name, about: s.land!.about, kind: 'land', from: s.from, picture: picture(s.land!.id) })),
  ...WHOLE_LANDS.map((l): LibraryEntry => ({ id: l.id, name: l.name, about: l.about, kind: 'land', from: l.from, picture: picture(l.id) })),
  ...CREATURES.map((c): LibraryEntry => ({ id: `creature-${c.id}`, name: c.name[0].toUpperCase() + c.name.slice(1), about: c.blurb, kind: 'creature', from: 'creatures', picture: picture(`creature-${c.id}`) })),
]

const split = new Map<Source, ReturnType<typeof splitScene>>()

/** A prop or land's description, cut out of its scene the first time it is asked for. Creatures have none. */
export function libraryProp(id: string): PropDoc | undefined {
  const whole = WHOLE_LANDS.find((l) => l.id === id)
  if (whole) return { name: whole.name, foot: [0, 0, 0], doc: whole.doc }
  for (const s of SOURCES) {
    const p = s.props.find((q) => q.id === id)
    if (!p && s.land?.id !== id) continue
    let done = split.get(s)
    if (!done) { done = splitScene(s.doc, s.picks); split.set(s, done) }
    if (!p) return { ...done.land, name: s.land!.name, doc: { ...done.land.doc, name: s.land!.name } }
    return done.props.find((q) => q.name === p.pick)
  }
  return undefined
}

/** The creature an entry is, as `CREATURES` lists it. */
export const libraryCreature = (id: string) => (id.startsWith('creature-') ? CREATURES.find((c) => `creature-${c.id}` === id) : undefined)
