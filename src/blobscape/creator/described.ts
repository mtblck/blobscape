/**
 * A scene description from outside (#379): a .json file Pixel Diorama would open, opened in Scene Creator as a
 * project. The things it marks with `prop` become props; a description with no marks offers the bones at the top of
 * its tree that carry parts, those on one spot together; everything else is the land. Pure, tested.
 */
import { MAX_PROPS, markedPicks, pickedParts, splitScene, type PropPick, type SceneProject } from '../../splat-engine/project.ts'
import type { SceneDoc } from '../../splat-engine/sceneDoc.ts'
import { readScene } from '../diorama/review.ts'

/** How near two bones' standing points must be, across the ground, to make one prop (a fire's flame, core and sparks). */
export const SAME_SPOT = 0.1

/**
 * The picks a description is split by: its own marks, or else its top-level bones that carry some of its parts but
 * not all, those standing on one spot together.
 */
export function picksFor(doc: SceneDoc): PropPick[] {
  const marked = markedPicks(doc)
  if (marked.length) return marked.slice(0, MAX_PROPS)
  const all = doc.parts.length
  const groups: { at: [number, number]; pick: PropPick }[] = []
  for (const b of doc.bones ?? []) {
    if (b.parent) continue
    const n = pickedParts(doc, { name: b.name, bones: [b.name] }).length
    if (!n || n >= all) continue
    const g = groups.find((x) => Math.hypot(x.at[0] - b.at[0], x.at[1] - b.at[2]) <= SAME_SPOT)
    if (g) g.pick.bones!.push(b.name)
    else groups.push({ at: [b.at[0], b.at[2]], pick: { name: named(b.name), bones: [b.name] } })
  }
  // a group that would take every part leaves no land
  return groups.map((g) => g.pick).filter((p) => pickedParts(doc, p).length < all).slice(0, MAX_PROPS)
}

/** A bone's name as a prop's: `leftTree` or `left_tree` reads "Left tree", `pine0` "Pine 1". */
export const named = (bone: string): string => {
  const words = bone.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([a-zA-Z])(\d+)$/, (_, c: string, d: string) => `${c} ${Number(d) + 1}`).replace(/[_\-.]+/g, ' ').trim().toLowerCase()
  return words ? words[0].toUpperCase() + words.slice(1) : bone
}

/** A description as a project: the land and its props written out in full, each where it stood. */
export function describedProject(doc: SceneDoc): SceneProject {
  const { project } = splitScene(doc, picksFor(doc))
  return project
}

/** Whether a file's JSON is a description rather than a project: a project says what it is. */
export function isDescription(text: string): boolean {
  try {
    const x = JSON.parse(text) as { kind?: unknown; parts?: unknown }
    return !!x && typeof x === 'object' && x.kind !== 'blobscape-project' && Array.isArray(x.parts)
  } catch { return false }
}

/** A description file read and opened as a project, or what is wrong with it as `where: what`. */
export function readDescribed(text: string): { project?: SceneProject; problems: string[] } {
  const { doc, problems } = readScene(text)
  if (!doc) return { problems }
  try { return { project: describedProject(doc), problems: [] } } catch (e) { return { problems: [`file: could not be split (${e instanceof Error ? e.message : String(e)})`] } }
}
