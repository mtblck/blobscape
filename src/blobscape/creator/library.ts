import type { SceneDoc } from '../../splat-engine/sceneDoc.ts'
import type { Skeleton } from '../../splat-engine/rig.ts'
import type { Species } from '../../splat-engine/zoo/species.ts'
import { markedPicks, splitScene, type PropDoc, type PropPick, type PropRef, type SceneProject } from '../../splat-engine/project.ts'
import { DRAGON } from '../diorama/scenes/dragon.ts'
import { HENGE } from '../diorama/scenes/henge.ts'
import { LIGHTHOUSE } from '../diorama/scenes/lighthouse.ts'
import { TURKEY } from '../diorama/scenes/turkey.ts'
import { WINDMILL } from '../diorama/scenes/windmill.ts'
import { ISLES } from '../diorama/scenes/isles.ts'
import { CANYON } from '../diorama/scenes/canyon.ts'
import { MEADOW } from '../fourways/meadow/doc.ts'
import { CREATURES } from '../creature/fromScenes.ts'
import { DIORAMAS } from '../diorama/scenes.ts'
import { HENGE_PICKS, LAVA_DRAGON_PICKS, LIGHTHOUSE_PICKS, TURKEY_PICKS, WINDMILL_PICKS, WITCH_IN_SPARKS_PICKS } from './picks.ts'
import { PLAIN_ROCK, PLAIN_TURF } from './lands.ts'
import { KIT } from './kit.ts'
import { isModel, modelOf } from './models.ts'
import { MADE, madeProp } from '../props/index.ts'

/**
 * Scene Creator's library (issue #334): props lifted out of Diorama's scenes, the lands they stood on and a few
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
  /** Where it comes from: a scene's id, or 'creatures', or 'plain' for the lands made to start from, or 'made' for a piece written on its own (props/). */
  from: string
  /** Its card picture, under the site's root (`npm run props` records them). */
  picture: string
  /** Which of Props mode's groups it is in. */
  group: LibraryGroup
}

/** Props mode's groups, in its order: what a card is filed under. */
export type LibraryGroup = 'buildings' | 'living' | 'small' | 'lands'

export const GROUPS: { id: LibraryGroup; name: string }[] = [
  { id: 'buildings', name: 'Buildings' },
  { id: 'living', name: 'Creatures' },
  { id: 'small', name: 'Plants and small things' },
  { id: 'lands', name: 'Lands' },
]

/** One way of splitting a scene: its picks, and which of them (by pick name) and its land go in the library. */
interface Source {
  from: string
  doc: SceneDoc
  picks: PropPick[]
  props: { id: string; pick: string; about: string; group?: LibraryGroup }[]
  land?: { id: string; name: string; about: string }
}

const SOURCES: Source[] = [
  {
    from: 'lighthouse', doc: LIGHTHOUSE, picks: LIGHTHOUSE_PICKS,
    props: [
      { id: 'lighthouse', pick: 'Lighthouse', about: 'A red and white lighthouse with a turning lamp that sweeps two beams of light round it', group: 'buildings' },
      { id: 'keepers-cottage', pick: "Keeper's cottage", about: 'A white cottage with a red tiled roof, a lit window and smoke rising from its chimney', group: 'buildings' },
      { id: 'tall-pine', pick: 'Tall pine', about: 'A tall pine that sways in the wind' },
      { id: 'pine', pick: 'Pine', about: 'A pine that sways in the wind' },
      { id: 'small-pine', pick: 'Small pine', about: 'A small pine that sways in the wind' },
      { id: 'jetty', pick: 'Jetty', about: 'A wooden jetty on posts with a lantern at its end', group: 'buildings' },
      { id: 'sailing-boat', pick: 'Sailing boat', about: 'A small sailing boat with a lantern, rocking on the swell' },
      { id: 'buoy', pick: 'Buoy', about: 'A red and white buoy with a light on top, nodding in the swell' },
    ],
    land: { id: 'lighthouse-rock', name: 'Lighthouse rock', about: 'A grassy rock in a round of sea at dusk, with rocks, bushes, flowers, gulls, clouds, the moon and stars' },
  },
  {
    from: 'windmill', doc: WINDMILL, picks: WINDMILL_PICKS,
    props: [
      { id: 'windmill', pick: 'Windmill', about: 'A windmill whose sails turn', group: 'buildings' },
      { id: 'apple-tree', pick: 'Apple tree', about: 'An apple tree' },
      { id: 'big-apple-tree', pick: 'Big apple tree', about: 'A big apple tree' },
      { id: 'small-apple-tree', pick: 'Small apple tree', about: 'A small apple tree' },
      { id: 'duck', pick: 'Duck', about: 'A duck', group: 'living' },
      { id: 'haystack', pick: 'Haystack', about: 'A haystack' },
      { id: 'sheep', pick: 'Sheep', about: 'A grazing sheep', group: 'living' },
    ],
    land: { id: 'windmill-hill', name: 'Windmill hill', about: 'The green hill the windmill stands on, with its path and fields' },
  },
  {
    from: 'turkey', doc: TURKEY, picks: TURKEY_PICKS,
    props: [
      { id: 'giant-turkey', pick: 'Giant turkey', about: 'A giant turkey running, kicking up dust and losing feathers', group: 'living' },
      { id: 'cook', pick: 'Cook', about: 'A cook in an apron running for her life', group: 'living' },
      { id: 'billboard', pick: 'Billboard', about: 'A roadside billboard on two posts', group: 'buildings' },
      { id: 'mailbox', pick: 'Mailbox', about: 'A mailbox on a post' },
      { id: 'roadside-haystack', pick: 'Roadside haystack', about: 'A tall haystack' },
      { id: 'roadside-tree', pick: 'Roadside tree', about: 'A roadside tree' },
      { id: 'second-roadside-tree', pick: 'Second roadside tree', about: 'Another roadside tree' },
    ],
  },
  {
    from: 'henge', doc: HENGE, picks: HENGE_PICKS,
    props: [
      { id: 'white-witch', pick: 'White witch', about: 'A witch in a white robe and hat, holding a wand', group: 'living' },
      { id: 'magic-circle', pick: 'Magic circle', about: 'A glowing circle of rings and a star turning on the ground, giving off blue light' },
    ],
    land: { id: 'henge-turf', name: 'Henge turf', about: 'A ring of standing stones on dark turf under the stars' },
  },
  {
    from: 'henge', doc: HENGE, picks: WITCH_IN_SPARKS_PICKS,
    props: [{ id: 'white-witch-sparks', pick: 'White witch, coming and going', about: 'The white witch arriving in a burst of sparks, waving her wand with two flashes, and leaving again', group: 'living' }],
  },
  {
    from: 'dragon', doc: DRAGON, picks: LAVA_DRAGON_PICKS,
    props: [{ id: 'lava-dragon', pick: 'Lava dragon', about: 'A red dragon with spread wings, swaying its neck and opening its jaw', group: 'living' }],
  },
  {
    // kit pieces, made by rules rather than lifted from a scene (an idea from Silicon Jungle's Ink Studio)
    from: 'kit', doc: KIT, picks: markedPicks(KIT),
    props: [
      { id: 'kit-brick-wall', pick: 'Brick wall', about: 'A straight length of red brick wall, a meter long', group: 'buildings' },
      { id: 'kit-ruined-wall', pick: 'Ruined wall', about: 'A stone wall fallen in places, its stones lying at its feet', group: 'buildings' },
      { id: 'kit-fence', pick: 'Wooden fence', about: 'A leaning wooden fence of three bays with two rails', group: 'buildings' },
      { id: 'kit-steps', pick: 'Stone steps', about: 'Four worn stone steps', group: 'buildings' },
      { id: 'kit-arch', pick: 'Stone arch', about: 'A single round arch of coursed stone', group: 'buildings' },
      { id: 'kit-columns', pick: 'Stone columns', about: 'A cluster of six-sided stone columns rising in steps', group: 'buildings' },
      { id: 'kit-oak', pick: 'Oak tree', about: 'A small oak whose crown sways' },
      { id: 'kit-cactus', pick: 'Cactus', about: 'A ribbed cactus with two arms' },
      { id: 'kit-crystals', pick: 'Crystal cluster', about: 'A cluster of violet crystals' },
      { id: 'kit-boulder', pick: 'Boulder', about: 'A rough gray boulder, half sunk' },
      { id: 'kit-stump', pick: 'Tree stump', about: 'A tree stump, pale where it was cut' },
      { id: 'kit-bush', pick: 'Round bush', about: 'A round green bush' },
    ],
  },
]

/** Scenes whose picture is more than their description (code poses them, or adds to them), so they are never split. */
export const WHOLE_SCENES: readonly string[] = ['meadow', 'fishing']

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * Every other scene that marks its own props (`BoneDoc.prop`) comes apart by those marks, with nothing picked by hand:
 * each prop is `<scene>-<its name>` in the library.
 */
for (const d of DIORAMAS) {
  // a scene made from props names the library's own pieces: there is nothing to lift out of it
  if (!d.doc || d.project || WHOLE_SCENES.includes(d.id) || SOURCES.some((s) => s.from === d.id)) continue
  const picks = markedPicks(d.doc)
  if (picks.length) SOURCES.push({ from: d.id, doc: d.doc, picks, props: picks.map((p) => ({ id: `${d.id}-${slug(p.name)}`, pick: p.name, about: `${p.name}, from ${d.label}` })) })
}

/** Lands taken whole: scenes whose ground is the point, and the plain ones to start from. */
const WHOLE_LANDS: { id: string; name: string; about: string; from: string; doc: SceneDoc }[] = [
  { id: 'sky-islands', name: 'Sky islands', about: 'Snowy islands of rock adrift in a night sky, joined by rope bridges', from: 'isles', doc: ISLES },
  { id: 'canyon-floor', name: 'Canyon floor', about: 'A desert canyon of banded rock, buttes and an arch', from: 'canyon', doc: CANYON },
  { id: 'meadow', name: 'Meadow', about: 'A round of night meadow with a standing stone', from: 'meadow', doc: MEADOW },
  { id: 'plain-turf', name: 'Round of turf', about: 'A plain round of grass on earth, level, to build on', from: 'plain', doc: PLAIN_TURF },
  { id: 'plain-rock', name: 'Low rock', about: 'A plain low rock with moss on top, to build on', from: 'plain', doc: PLAIN_ROCK },
]

const picture = (id: string) => `/props/${id}.png`

/**
 * Every creature in each of its looks, a card each (Matt asked for the dragon's ember and jade, 2026-11-19): the
 * first look is `creature-<id>` and named for the creature alone, so projects saved before looks keep theirs; the
 * others are `creature-<id>-<look>`, named with the look first ("Ember dragon").
 */
export const CREATURE_LOOKS: { id: string; name: string; species: Species; look: string }[] = CREATURES.flatMap((c) =>
  c.looks.map((l, k) => ({
    id: k ? `creature-${c.id}-${l.id}` : `creature-${c.id}`,
    name: k ? `${l.label} ${c.name}` : c.name[0].toUpperCase() + c.name.slice(1),
    species: c,
    look: l.id,
  })))
const LOOK_BY_ID = new Map(CREATURE_LOOKS.map((x) => [x.id, x]))

/** Every entry: props, then lands, then creatures. */
export const LIBRARY: LibraryEntry[] = [
  ...MADE.filter((m) => m.kind === 'prop').map((m): LibraryEntry => ({ id: m.id, name: m.prop.name, about: m.about, kind: 'prop', from: 'made', picture: picture(m.id), group: m.group ?? 'small' })),
  ...SOURCES.flatMap((s) => s.props.map((p): LibraryEntry => ({ id: p.id, name: p.pick, about: p.about, kind: 'prop', from: s.from, picture: picture(p.id), group: p.group ?? 'small' }))),
  ...SOURCES.filter((s) => s.land).map((s): LibraryEntry => ({ id: s.land!.id, name: s.land!.name, about: s.land!.about, kind: 'land', from: s.from, picture: picture(s.land!.id), group: 'lands' })),
  ...WHOLE_LANDS.map((l): LibraryEntry => ({ id: l.id, name: l.name, about: l.about, kind: 'land', from: l.from, picture: picture(l.id), group: 'lands' })),
  ...MADE.filter((m) => m.kind === 'land').map((m): LibraryEntry => ({ id: m.id, name: m.prop.name, about: m.about, kind: 'land', from: 'made', picture: picture(m.id), group: 'lands' })),
  ...CREATURE_LOOKS.map(({ id, name, species: c }): LibraryEntry => ({ id, name, about: c.blurb, kind: 'creature', from: 'creatures', picture: picture(id), group: 'living' })),
]

const split = new Map<Source, ReturnType<typeof splitScene>>()

/**
 * A prop or land's description, cut out of its scene the first time it is asked for. A creature has no description:
 * it gets a stand-in (`creatureProp`) so a project holds it as it holds any prop, and is built and posed its own way.
 */
export function libraryProp(id: string): PropDoc | undefined {
  const creature = libraryCreature(id)
  if (creature) return creatureProp(id, LOOK_BY_ID.get(id)!.name)
  if (isModel(id)) return creatureProp(id, modelOf(id)?.name ?? 'Your model')
  const made = madeProp(id)
  if (made) return made
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
export const libraryCreature = (id: string): Species | undefined => LOOK_BY_ID.get(id)?.species

/** Which look of its creature an entry is. */
export const creatureLook = (id: string): string | undefined => LOOK_BY_ID.get(id)?.look

/** Whether a prop is one of the creatures. */
export const isCreature = (ref: PropRef): ref is string => typeof ref === 'string' && !!libraryCreature(ref)

const creatureProps = new Map<string, PropDoc>()
/**
 * A creature's stand-in description: one bone and one speck too small to cut, standing on its foot at the origin
 * (every creature is made standing on the floor at the middle). It is never cut: Scene Creator builds the creature
 * itself (`cut.ts`) and plays its own move (`creatureMove`). It has no lights or moves of its own, and only black and white (a description needs two colors): its own colors come with its cut (`colorsOf`).
 */
function creatureProp(id: string, name: string): PropDoc {
  let p = creatureProps.get(id)
  if (!p) {
    const label = name[0].toUpperCase() + name.slice(1)
    p = {
      name: label,
      foot: [0, 0, 0],
      doc: {
        name: label, loop: 12, light: { from: [0.4, 0.7, 0.6], ambient: 0.5, shadow: 0.7 }, palette: ['#000000', '#ffffff'], camera: { target: [0, 0.5, 0], distance: 4, azimuth: 0, elevation: 15 },
        bones: [{ name: id, at: [0, 0, 0] }],
        parts: [{ bone: id, shape: { kind: 'ball', at: [0, 0, 0], r: [0.001, 0.001, 0.001] }, paint: '#000000' }],
      },
    }
    creatureProps.set(id, p)
  }
  return p
}

/**
 * How big a creature is set down in a scene, as a share of the size it is made: each is made to its own scale (the
 * fox is about three units long, the elf as tall as a door), so each is brought to its place beside the scenes' props
 * (the cook is 1.3 tall, a sheep 0.3).
 */
const CREATURE_SIZE: Record<string, number> = { crocodile: 0.5, jellyfish: 0.5, owl: 0.45, frog: 1, fox: 0.35, 'minimalist-fox': 0.35, elf: 0.75, dragon: 0.45 }
export const creatureSize = (id: string): number => CREATURE_SIZE[libraryCreature(id)?.id ?? ''] ?? 0.5

/**
 * The move a creature plays standing in a scene: one it does on the spot without walking (idle, stand, float), else
 * its first; played a whole number of times a loop of `loop` seconds, so the scene still joins up.
 */
export function creatureMove(id: string, loop: number): { pose: (sk: Skeleton, t: number) => void; name: string } | undefined {
  const c = libraryCreature(id)
  if (!c) return undefined
  const move = c.moves.find((m) => /^(idle|stand|float)$/.test(m.name)) ?? c.moves[0]
  const times = Math.max(1, Math.round(loop / move.seconds))
  return { name: move.name, pose: (sk, t) => move.pose(sk, (((t % loop) + loop) % loop) * (times * move.seconds) / loop) }
}

/** The scenes Scene Creator opens split into a land and props: those the library has picks for. */
export const SPLIT_SCENES: readonly string[] = [...new Set([...SOURCES.map((s) => s.from), ...DIORAMAS.filter((d) => d.project).map((d) => d.id)])].filter((id) => id !== 'kit')

/**
 * A scene opened as a project: its land and every prop its first set of picks lifts out, each standing where it stood.
 * Props and the land are named by their library id where the library has them, so a saved project stays small; a
 * prop the library leaves out (the windmill's second haystack) is written out in full. Undefined for a scene that
 * opens whole.
 */
export function openScene(sceneId: string): SceneProject | undefined {
  // a scene made from props opens as the very list it is made from
  const made = DIORAMAS.find((d) => d.id === sceneId)?.project
  if (made) return structuredClone(made)
  const s = SOURCES.find((x) => x.from === sceneId)
  if (!s) return undefined
  let done = split.get(s)
  if (!done) { done = splitScene(s.doc, s.picks); split.set(s, done) }
  const { project } = done
  return {
    ...project,
    land: s.land?.id ?? project.land,
    props: project.props.map((p, i) => {
      const id = s.props.find((q) => q.pick === s.picks[i].name)?.id
      return id ? { ...p, prop: id } : p
    }),
  }
}

/** A bare land opened as a project with nothing on it, in its own loop and from its own camera. */
export function openLand(id: string): SceneProject | undefined {
  const land = libraryProp(id)
  if (!land || !LIBRARY.some((e) => e.id === id && e.kind === 'land')) return undefined
  return { kind: 'blobscape-project', version: 1, name: land.name, loop: land.doc.loop, land: id, props: [], camera: { ...land.doc.camera } }
}

/** A library entry or a prop written out, as the list beside the picture names it. */
export const nameOf = (ref: PropRef): string => (typeof ref === 'string' ? LIBRARY.find((e) => e.id === ref)?.name ?? (isModel(ref) ? modelOf(ref)?.name ?? 'Your model' : ref) : ref.name)
