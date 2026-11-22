import type { Rgb } from '../../splat-core/pixel.ts'
import type { Orbit } from '../../splat-core/view.ts'
import type { PointLight } from '../../splat-engine/engine.ts'
import type { Skeleton } from '../../splat-engine/rig.ts'
import { composeScene } from '../../splat-engine/compose.ts'
import { compileProject, litLand, poseApart, projectLights, type CompiledProject, type SceneProject } from '../../splat-engine/project.ts'
import { DIORAMAS, described, type Diorama } from '../diorama/scenes.ts'
import type { CutJob } from './cut.ts'
import { LIBRARY, SPLIT_SCENES, libraryProp, nameOf, openLand, openScene } from './library.ts'

/** What Scene Creator has open: a project (a land and props) and where it came from, or a scene that opens whole. */
export type Opened =
  | { kind: 'project'; from: { scene: string } | { land: string } | { saved: string }; project: SceneProject }
  | { kind: 'whole'; scene: string }

/** One thing in the scene, as the list beside the picture names it. */
export interface Item { name: string; kind: 'land' | 'prop' | 'scene' }

/** What the page needs to draw what is open. */
export interface Shown {
  /** Changes whenever the cuts would: what is cut and where things stand. */
  key: string
  name: string
  /** Seconds before it repeats. */
  loop: number
  /** The palette pixel art snaps to. */
  palette: Rgb[]
  sky: Diorama['sky']
  finish: Diorama['finish']
  orbit: Orbit
  swing: number
  lights(t: number, shadows: boolean): PointLight[]
  ambient: number | readonly [number, number, number]
  /** Poses the land (or the whole scene). */
  poseLand(sk: Skeleton, t: number): void
  /** The bones `poseLand` poses, by name, where known: a land cut for an older light (other specks) must not be posed by it. */
  landBones?: readonly string[]
  /** After `poseLand`: blows the land's own rain, snow, leaves and swaying stalks by a wind of the moment, where it has any. */
  blowLand?(sk: Skeleton, t: number, wind: readonly [number, number], level?: number): void
  /** Poses prop `i`, cut apart, on its own skeleton. */
  poseProp(i: number, sk: Skeleton, t: number): void
  /** The land first, then each prop. */
  items: Item[]
  /** What to cut, in the order of `items`, on a grid of `spacing`. */
  jobs(spacing: number): CutJob[]
  /** Why a scene opened whole, when it did. */
  note?: string
  /** Distance haze: its color (linear) and where it starts and would be total, in units past the view's target. */
  haze?: Diorama['haze']
  /** The project compiled, when what is open is one. */
  cp?: CompiledProject
  /** The way toward the baked sun and the share of light in shade, for pixel art's lit rim and Shade each pixel. */
  sun?: readonly [number, number, number]
  shade?: number
  /**
   * The whole of it as one Diorama scene, for the shared weather (`SceneWeather`): where rain and snow land, its own
   * clouds, its view and loop. Made when first asked. Its water is left out: Scene Creator draws none.
   */
  weatherScene(): Diorama
}

/** A scene with its water left out, made once. */
const once = (make: () => Diorama): (() => Diorama) => {
  let d: Diorama | undefined
  return () => (d ??= { ...make(), water: undefined })
}

/** Scenes that cannot be split, and why: said in the page. */
const WHOLE_WHY: Record<string, string> = {
  meadow: 'The fox meadow is drawn by code, not written as a description, so it opens whole.',
  fishing: 'Fishing for the moon tells a story in code over its description, so it opens whole.',
}
const NOT_YET = 'This scene has no props picked out of it yet, so it opens whole.'

/** The scenes Start from offers: every Diorama scene, split where the library can. */
export const START_SCENES = DIORAMAS
/** The lands Start from offers bare. */
export const START_LANDS = LIBRARY.filter((e) => e.kind === 'land')

/** A scene opened by its Diorama id: split into a land and props where the library has picks for it. */
export function openingScene(id: string): Opened | undefined {
  if (!DIORAMAS.some((d) => d.id === id)) return undefined
  const project = SPLIT_SCENES.includes(id) ? openScene(id) : undefined
  return project ? { kind: 'project', from: { scene: id }, project } : { kind: 'whole', scene: id }
}

/** A bare land opened by its library id. */
export function openingLand(id: string): Opened | undefined {
  const project = openLand(id)
  return project && { kind: 'project', from: { land: id }, project }
}

/** What the address asks to open (`?scene=` or `?land=`), the windmill when it names nothing it knows. */
export function openingAsked(search: string): Opened {
  const q = new URLSearchParams(search)
  const land = q.get('land'), scene = q.get('scene')
  return (land && openingLand(land)) || (scene && openingScene(scene)) || openingScene('windmill')!
}

/** The address's query for what is open. */
export const queryFor = (o: Opened): [string, string] =>
  o.kind === 'whole' ? ['scene', o.scene] : 'scene' in o.from ? ['scene', o.from.scene] : 'land' in o.from ? ['land', o.from.land] : ['project', o.from.saved]

/** A short name for what is open, for file names: the scene's or land's id, or a saved project's name in plain letters. */
export const nameFor = (o: Opened): string =>
  o.kind === 'whole' ? o.scene : 'scene' in o.from ? o.from.scene : 'land' in o.from ? o.from.land : slug(o.project.name)

/** A name in lowercase letters and digits joined by dashes, `scene` when nothing is left. */
export const slug = (name: string): string => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'scene'

/** What the page draws for what is open. */
export function shownOf(o: Opened): Shown {
  if (o.kind === 'whole') {
    const d = DIORAMAS.find((x) => x.id === o.scene)!
    return {
      key: `whole:${d.id}`,
      name: d.label,
      loop: d.loop,
      palette: d.palette.colors,
      sky: d.sky,
      finish: d.finish,
      orbit: d.views[0].orbit,
      swing: d.swing,
      lights: (t, shadows) => d.lights(t, shadows),
      ambient: d.ambient ?? 1,
      poseLand: (sk, t) => d.pose(sk, t),
      blowLand: d.blow && ((sk, t, wind, level) => d.blow!(sk, t, wind, undefined, level)),
      poseProp: () => {},
      items: [{ name: d.label, kind: 'scene' }],
      jobs: (spacing) => [{ kind: 'whole', scene: d.id, spacing }],
      note: WHOLE_WHY[d.id] ?? NOT_YET,
      haze: d.haze,
      sun: d.sun,
      shade: d.shade,
      weatherScene: once(() => d),
    }
  }
  const project = o.project
  const cp = compileProject(project, libraryProp)
  // the land as Diorama would show it, for its sky and its finish
  const look = described('creator', litLand(cp.land.prop.doc, project.light), cp.land.prop.name)
  return {
    key: JSON.stringify(project),
    name: project.name,
    loop: cp.loop,
    palette: cp.palette,
    sky: look.sky,
    finish: look.finish,
    orbit: cp.camera,
    swing: look.swing,
    lights: (t) => projectLights(cp, t),
    ambient: 1,
    poseLand: (sk, t) => cp.land.c.pose(sk, t),
    landBones: cp.land.c.bones.map((b) => b.name),
    blowLand: (sk, t, wind, level) => cp.land.c.blow(sk, t, wind, undefined, level),
    poseProp: (i, sk, t) => poseApart(cp, i, sk, t),
    items: [{ name: nameOf(project.land), kind: 'land' }, ...project.props.map((p): Item => ({ name: nameOf(p.prop), kind: 'prop' }))],
    jobs: (spacing) => [{ kind: 'land', project, spacing }, ...project.props.map((_, i): CutJob => ({ kind: 'prop', project, i, spacing }))],
    haze: cp.land.c.haze,
    cp,
    sun: look.sun,
    shade: look.shade,
    // the land and every prop where it stands, so rain and snow land on roofs and treetops; the land alone if that fails
    weatherScene: once(() => {
      try { return described('creator', composeScene({ ...project, light: undefined }, libraryProp), project.name) } catch (e) { console.warn(e); return look }
    }),
  }
}
