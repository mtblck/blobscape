import type { Vec3 } from '../../splat-core/blobs.ts'
import { MAX_PROJECT_BONES, MAX_PROPS, landSpec, type CompiledProject, type Placement, type SceneProject } from '../../splat-engine/project.ts'
import type { Shape } from '../../splat-engine/voxel.ts'
import { groundUnder } from '../../splat-engine/weather.ts'
import { matching } from '../diorama/pick.ts'
import { GROUPS, LIBRARY, type LibraryEntry, type LibraryGroup } from './library.ts'

/**
 * Props mode (Scene Creator, #337), pure so it is tested: the library's cards found by a search and filed in groups,
 * a prop added to a project, the land swapped under the props, and how much room is left.
 */

// --- Cards -----------------------------------------------------------------

/** The cards Props mode offers: props, lands, and Splat Creatures' creatures (filed with the living props). */
export const CARDS: LibraryEntry[] = LIBRARY

/** The cards a search finds, in their groups and the groups' order; a group with nothing found is left out. */
export function cardsFound(query: string, cards: readonly LibraryEntry[] = CARDS): { id: LibraryGroup; name: string; cards: LibraryEntry[] }[] {
  const found = matching(cards.map((e) => ({ ...e, label: e.name })), query)
  return GROUPS.map((g) => ({ ...g, cards: found.filter((e) => e.group === g.id) })).filter((g) => g.cards.length)
}

// --- The ground ------------------------------------------------------------

/** The land's still, solid shapes: what props stand on and are dragged along. */
export function groundOf(cp: CompiledProject, spacing: number): Shape[] {
  const spec = landSpec(cp, spacing)
  const root = spec.bones[0]?.name
  return spec.parts.filter((p) => p.bone === root && !p.glow && (p.opacity ?? 1) >= 0.9).map((p) => p.shape)
}

/** How wide the ground is: the longer side of its box seen from above. */
export function spanOf(ground: readonly Shape[]): number {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const s of ground) { x0 = Math.min(x0, s.min[0]); z0 = Math.min(z0, s.min[2]); x1 = Math.max(x1, s.max[0]); z1 = Math.max(z1, s.max[2]) }
  return Number.isFinite(x0) ? Math.max(x1 - x0, z1 - z0) : 3
}

/** The ground's height under (x, z) near `y`; off the land, `y` itself, so a prop keeps its height there. */
export function heightAt(ground: Shape[], x: number, z: number, y: number): number {
  const g = groundUnder(ground, x, z, y + 3, y - 3)
  return g <= y - 3 ? y : g
}

/** How far a prop stands above the ground under it; a hair's breadth counts as standing on it. */
export function liftOn(ground: Shape[], pl: Placement): number {
  const l = pl.at[1] - heightAt(ground, pl.at[0], pl.at[2], pl.at[1])
  return l < 0.015 ? 0 : l
}

// --- Edits -----------------------------------------------------------------

/** A library prop set down at `at`, facing the way it was written, `size` times its own size, last in the list; the project as it was when full. */
export function added(p: SceneProject, id: string, at: Vec3, size = 1): SceneProject {
  if (p.props.length >= MAX_PROPS) return p
  const r = (v: number) => Math.round(v * 1e4) / 1e4
  return { ...p, props: [...p.props, { prop: id, at: [r(at[0]), r(at[1]), r(at[2])], turn: 0, size }] }
}

/**
 * The project on another land: every prop keeps its place across the ground and its lift off it, and settles onto
 * the new ground under it (`from` is the ground it stood on, `to` the new one).
 */
export function landSwapped(p: SceneProject, land: string, from: Shape[], to: Shape[]): SceneProject {
  if (p.land === land) return p
  const r = (v: number) => Math.round(v * 1e4) / 1e4
  return {
    ...p,
    land,
    props: p.props.map((x) => {
      const lift = liftOn(from, x)
      return { ...x, at: [x.at[0], r(heightAt(to, x.at[0], x.at[2], x.at[1] - lift) + lift), x.at[2]] }
    }),
  }
}

// --- Room ------------------------------------------------------------------

/** The most blobs a scene may hold while it is edited: about what a phone draws smoothly, and twice that elsewhere. */
export const BLOB_ROOM = { phone: 300_000, other: 600_000 }

/** Bones the project would take on one grid: the land's, then each prop's but its root, which joins the land's. */
export const bonesIn = (cp: CompiledProject): number => cp.land.c.bones.length + cp.props.reduce((n, p) => n + p.c.bones.length - 1, 0)

/** How much of the scene's room is used: props, blobs and bones, each against its most. */
export interface Room {
  props: [number, number]
  blobs: [number, number]
  bones: [number, number]
}

export const roomOf = (cp: CompiledProject, blobs: number, most: number): Room => ({
  props: [cp.props.length, MAX_PROPS],
  blobs: [blobs, most],
  bones: [bonesIn(cp), MAX_PROJECT_BONES],
})

/**
 * Why `name` won't fit, in a plain sentence, or undefined when it will. `after` is the room with it added, but for its
 * blobs, which aren't known until it is cut: the scene must not have used its blobs already.
 */
export function whyNot(name: string, now: Room, after: Room): string | undefined {
  if (now.props[0] >= now.props[1]) return `A scene holds ${now.props[1]} props at most: delete one to make room for the ${name.toLowerCase()}.`
  if (now.blobs[0] >= now.blobs[1]) return `The scene has used its ${now.blobs[1].toLocaleString('en-US')} blobs: delete a prop or pick a lighter detail first.`
  if (after.bones[0] > after.bones[1]) return `The ${name.toLowerCase()} moves on ${after.bones[0] - now.bones[0]} bones, and the scene has room for ${now.bones[1] - now.bones[0]} more.`
  return undefined
}
