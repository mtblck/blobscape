/**
 * Tags for props and lands (Matt, 2026-11-22): words from one fixed list, so a search finds a thing by what it is and
 * the shared recipes act on what it is like, rather than guessing from its name. A tag outside the list is a mistake
 * the scene checker names, not a word that quietly does nothing.
 *
 * Three sorts: a `kind` says what a prop is (search finds it by that), a `land` tag what a land is, and a `quality`
 * says how it behaves, which a recipe acts on.
 */

/** What sort of tag it is: what a prop is, what a land is, or how a thing behaves. */
export type TagSort = 'kind' | 'land' | 'quality'

/** One tag of the list. */
export interface TagInfo {
  /** The word a description writes. */
  id: string
  /** Which sort it is. */
  sort: TagSort
  /** What it means, and for a quality what acts on it. */
  means: string
}

/** Every tag there is, each with what it means. A description may use no other word. */
export const TAGS = [
  // what a prop is
  { id: 'tree', sort: 'kind', means: 'A tree, a trunk with a crown, or what is left of one' },
  { id: 'plant', sort: 'kind', means: 'A bush, stalk, leaves or a cactus' },
  { id: 'flower', sort: 'kind', means: 'In flower' },
  { id: 'rock', sort: 'kind', means: 'Stone: a boulder, slab, post, steps or stonework' },
  { id: 'crystal', sort: 'kind', means: 'Crystals' },
  { id: 'building', sort: 'kind', means: 'A building or a large built thing: a mill, a cottage, a jetty, an arch' },
  { id: 'wall', sort: 'kind', means: 'A wall or a fence' },
  { id: 'lamp', sort: 'kind', means: 'Gives light: a lantern, a lighthouse, a lamp on a buoy' },
  { id: 'farm', sort: 'kind', means: 'Of a farm: a haystack, a windmill, sheep, fields' },
  { id: 'thing', sort: 'kind', means: 'A small made thing: a mailbox' },
  { id: 'sign', sort: 'kind', means: 'A sign or a billboard' },
  { id: 'boat', sort: 'kind', means: 'A boat' },
  { id: 'animal', sort: 'kind', means: 'An animal, a bird, a fish or a dragon' },
  { id: 'person', sort: 'kind', means: 'A person: the cook, the witch, the elf' },
  { id: 'magic', sort: 'kind', means: 'Magic: a witch, a spell circle, a dragon' },
  // what a land is
  { id: 'grassy', sort: 'land', means: 'Mostly grass' },
  { id: 'rocky', sort: 'land', means: 'Mostly bare rock' },
  { id: 'sandy', sort: 'land', means: 'Sand or desert' },
  { id: 'snowy', sort: 'land', means: 'Under snow' },
  { id: 'sea', sort: 'land', means: 'Stands in the sea' },
  { id: 'pond', sort: 'land', means: 'Has a pond or a pool' },
  { id: 'night', sort: 'land', means: 'Written as a night scene' },
  { id: 'space', sort: 'land', means: 'Out in space: no ground, and no time of day or weather' },
  { id: 'indoor', sort: 'land', means: 'Inside a room: no sky, so no time of day or weather' },
  // how a prop behaves, which the shared recipes act on
  { id: 'leafy', sort: 'quality', means: 'Drops leaves: under falling leaves it lets them fall from under its crown' },
  { id: 'evergreen', sort: 'quality', means: 'Keeps its needles or leaves: falling leaves pass it by' },
  { id: 'floats', sort: 'quality', means: 'Sits on water: no stand-in shadow is laid under it' },
] as const satisfies readonly TagInfo[]

/** A word of `TAGS`. */
export type Tag = (typeof TAGS)[number]['id']

const BY_ID = new Map<string, TagInfo>(TAGS.map((t) => [t.id, t]))

/** Whether a value is a word of `TAGS`. */
export const isTag = (v: unknown): v is Tag => typeof v === 'string' && BY_ID.has(v)

/** What a tag is, or undefined for a word that is not one. */
export const tagInfo = (id: string): TagInfo | undefined => BY_ID.get(id)

/** Whether a thing has a tag. */
export const tagged = (thing: { tags?: readonly string[] } | undefined, tag: Tag): boolean => !!thing?.tags?.includes(tag)

/** Checks a list of tags, naming each fault as `where: what`. */
export function checkTags(v: unknown, at: string, bad: (at: string, what: string) => void) {
  if (v === undefined) return
  if (!Array.isArray(v)) return bad(at, 'must be a list of tags')
  const seen = new Set<string>()
  v.forEach((t, i) => {
    if (!isTag(t)) bad(`${at}[${i}]`, `'${String(t)}' is not a tag (they are: ${TAGS.map((x) => x.id).join(', ')})`)
    else if (seen.has(t)) bad(`${at}[${i}]`, `'${t}' is there twice`)
    else seen.add(t)
  })
}
