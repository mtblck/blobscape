/**
 * The scene picker's search and its previous and next: pure, so they are tested without a page.
 */

/** What the picker knows of a scene: its name, and the sentence that says what is in the picture. */
export interface Pickable {
  id: string
  label: string
  about: string
}

const plain = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ')

/**
 * The scenes a search finds, in the list's own order: every word typed must start a word of the
 * scene's name or of what is in it ("fox" finds Fox and wisp; "rain" finds the koi pond). Scenes
 * found by name come before those found only by what is in them. Nothing typed finds them all.
 */
export function matching<T extends Pickable>(scenes: readonly T[], query: string): T[] {
  const words = plain(query).split(' ').filter(Boolean)
  if (!words.length) return [...scenes]
  const starts = (text: string, w: string) => (` ${plain(text)}`).includes(` ${w}`)
  const byName = scenes.filter((s) => words.every((w) => starts(s.label, w)))
  const byAbout = scenes.filter((s) => !byName.includes(s) && words.every((w) => starts(s.label, w) || starts(s.about, w)))
  return [...byName, ...byAbout]
}

/** The scene `step` places on from `id`, going round at the ends; the first when `id` isn't in the list. */
export function stepped<T extends { id: string }>(scenes: readonly T[], id: string, step: number): T {
  const i = scenes.findIndex((s) => s.id === id)
  if (i < 0) return scenes[0]
  return scenes[(((i + step) % scenes.length) + scenes.length) % scenes.length]
}
