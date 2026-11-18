import type { Orbit } from '../../splat-core/orbit.ts'
import type { Built } from '../../splat-engine/body.ts'
import { daylight, skyLights, type Daylight, type SkyPlace } from '../../splat-engine/daylight.ts'
import type { Light } from '../../splat-engine/engine.ts'
import type { Skeleton } from '../../splat-engine/rig.ts'
import { compileScene, type SceneDoc } from '../../splat-engine/sceneDoc.ts'
import { buildVoxels } from '../../splat-engine/voxel.ts'
import { CLEARING } from './cabin.ts'
import { CITY, WINDOW_GROUPS } from './city.ts'

/**
 * Day and Night's scenes. A scene is a description (`SceneDoc`) built with no light baked in, plus what changes with
 * the hour: which lamps come on at dusk and when they go out, and which bones are day creatures. Everything here is a
 * function of the hour (and the scene's own clock for what sways and flies), so dragging the time gives the same
 * picture as waiting for it. Pure: the page draws it, the tests run it.
 */

/** A lamp that comes on as it gets dark: a bone that shows its lit glass, and the light it throws. */
export interface Lamp {
  /** The bone its lit glass rides: full size while it is on, none while off. */
  bone: string
  /** Which of the description's `lights` it throws; left out, it only glows (a far window lights nothing round it). */
  light?: number
  /** How dark it must be for it to come on (`Daylight.dark`, 0 to 1). */
  on: number
  /** The hour it is put out for the night (after noon, so 23.5 is half past eleven; past 24 is the small hours); left out, it burns till morning. */
  out?: number
  /** Whether its light casts shadows. */
  shadow?: boolean
}

/** A scene with a day in it. */
export interface DayScene {
  id: string
  label: string
  /** For the view's label: what is in the picture. */
  about: string
  doc: SceneDoc
  lamps: Lamp[]
  /** Bones (by the start of their names) that are out by day and gone at night, such as birds. */
  byDay: string[]
  views: { id: string; label: string; orbit: Orbit }[]
}

/** The share of the dark a lamp takes to come on fully, flickering as it catches. */
const CATCH = 0.14
const smooth = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t) }
/** A steady number from 0 to 1 for a name, so each firefly and bird keeps its own hour. */
function share(name: string) {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619)
  return ((h >>> 0) % 1000) / 1000
}

/**
 * How brightly a lamp burns at an hour, 0 (out) to 1: it catches once the dark passes its `on`, blinking twice before
 * it holds, and is put out at its `out` hour until the next noon.
 */
export function lampAt(lamp: Lamp, hour: number, sky: Daylight): number {
  const x = Math.max(0, Math.min(1, (sky.dark - lamp.on) / CATCH))
  // not yet caught, and two short blinks on the way up
  if (x < 0.3 || (x > 0.48 && x < 0.58) || (x > 0.72 && x < 0.78)) return 0
  // hours since noon, so an evening and the small hours after it are one stretch
  const since = (((hour - 12) % 24) + 24) % 24
  if (lamp.out !== undefined && since >= lamp.out - 12) return 0
  return 0.55 + 0.45 * x
}

/** How much of a day creature is out at this darkness (birds go to roost as it dims, one after another). */
export function outByDay(bone: string, sky: Daylight): number {
  return 1 - smooth(0.1, 0.3, sky.dark - share(bone) * 0.3)
}

/** How much of a night creature is out (fireflies come out one after another once it is nearly dark). */
export function outByNight(bone: string, sky: Daylight): number {
  return smooth(0.55, 0.7, sky.dark - share(bone) * 0.25)
}

/** A scene ready for the page: cut it, pose it for a moment and an hour, and light it. */
export interface DayStage {
  scene: DayScene
  /** Seconds the scene's own motion takes to repeat. */
  loop: number
  /** Cuts the scene on a grid of `spacing`. */
  make(spacing: number): Built
  /** Poses the bones for `t` seconds of the scene's own clock under `sky` at `hour`: lamps lit or not, birds or fireflies out. */
  pose(sk: Skeleton, t: number, hour: number, sky: Daylight): void
  /** The lights at that moment: the sun and moon (casting if `shadows`), then each lamp that is on; and the sky's own light. */
  lights(t: number, hour: number, sky: Daylight, shadows: boolean): { lights: Light[]; ambient: [number, number, number] }
}

/** Makes a scene ready: compiles its description once. */
export function dayStage(scene: DayScene): DayStage {
  const c = compileScene(scene.doc, { puffs: false })
  const names = c.bones.map((b) => b.name)
  const day = names.map((n, i) => ({ n, i })).filter(({ n, i }) => scene.byDay.some((p) => n.startsWith(p)) && !scene.byDay.some((p) => names[c.bones[i].parent]?.startsWith(p)))
  const night = names.map((n, i) => ({ n, i })).filter(({ n }) => n.startsWith('~speck'))
  const lampBones = scene.lamps.map((l) => names.indexOf(l.bone))
  return {
    scene,
    loop: c.loop,
    make: (spacing) => buildVoxels(c.spec(spacing)),
    pose(sk, t, hour, sky) {
      c.pose(sk, t)
      scene.lamps.forEach((l, k) => { if (lampBones[k] >= 0) sk.size[lampBones[k]] *= lampAt(l, hour, sky) > 0 ? 1 : 0 })
      for (const { n, i } of day) sk.size[i] *= outByDay(n, sky)
      for (const { n, i } of night) sk.size[i] *= outByNight(n, sky)
      sk.update()
    },
    lights(t, hour, sky, shadows) {
      const { lights, ambient } = skyLights(sky, shadows)
      const lamps = c.lights(t)
      const out: Light[] = [...lights]
      for (const l of scene.lamps) {
        if (l.light === undefined) continue
        const k = lampAt(l, hour, sky), L = lamps[l.light]
        if (k > 0 && L) out.push({ position: L.position, color: [L.color[0] * k, L.color[1] * k, L.color[2] * k], range: L.range, shadow: shadows && !!l.shadow })
      }
      return { lights: out, ambient }
    },
  }
}

/** The sky for a scene at an hour: `daylight`, here so the page and the tests ask one place. */
export const skyAt = (hour: number, place: SkyPlace) => daylight(hour, place)

export const SCENES: DayScene[] = [
  {
    id: 'clearing',
    label: 'Cabin in a clearing',
    about: 'A log cabin in a forest clearing with pines and leafy trees, a lantern by the path, a fence, flowers and chimney smoke',
    doc: CLEARING,
    lamps: [
      { bone: 'flame', light: 3, on: 0.3, shadow: true },
      { bone: 'win0', light: 0, on: 0.45, out: 23.5 },
      { bone: 'win2', light: 2, on: 0.6, out: 22.75 },
      { bone: 'win1', light: 1, on: 0.75, out: 24.5 },
    ],
    byDay: ['bird'],
    views: [
      { id: 'front', label: 'From the south', orbit: { target: [0, 0.62, 0], distance: 5.3, azimuth: 24, elevation: 9 } },
      { id: 'west', label: 'Toward the sunset', orbit: { target: [0, 0.62, 0], distance: 5.3, azimuth: 75, elevation: 7 } },
      { id: 'above', label: 'From above', orbit: { target: [0, 0.3, 0], distance: 6.2, azimuth: 30, elevation: 48 } },
      { id: 'east', label: 'From the east', orbit: { target: [0, 0.45, 0], distance: 5.0, azimuth: 82, elevation: 12 } },
      { id: 'porch', label: 'The porch', orbit: { target: [0.1, 0.35, 0.1], distance: 3.3, azimuth: 34, elevation: 8 } },
    ],
  },
  {
    id: 'city',
    label: 'City blocks',
    about: 'A few city blocks: glass towers and brick buildings round two streets, with street lamps, a rooftop sign, parked cars and a small park',
    doc: CITY,
    lamps: [
      { bone: 'lamp0', light: 0, on: 0.3, shadow: true },
      { bone: 'lamp1', light: 1, on: 0.34 },
      { bone: 'lamp2', light: 2, on: 0.38 },
      { bone: 'sign', light: 3, on: 0.42, out: 27 },
      { bone: 'beacon', on: 0.25 },
      // the windows: a group at a time from the first dimming to full dark; offices empty through the evening, some rooms burn all night
      ...Array.from({ length: WINDOW_GROUPS }, (_, g): Lamp => ({ bone: `lit${g}`, on: 0.2 + (0.68 * ((g * 5) % WINDOW_GROUPS)) / WINDOW_GROUPS, out: g % 4 === 3 ? undefined : 21.25 + ((g * 7) % WINDOW_GROUPS) * 0.5 })),
    ],
    byDay: ['bird'],
    views: [
      { id: 'front', label: 'From the south', orbit: { target: [0, 0.95, 0], distance: 6.5, azimuth: 24, elevation: 8 } },
      { id: 'west', label: 'Toward the sunset', orbit: { target: [0, 0.95, 0], distance: 6.5, azimuth: 75, elevation: 6 } },
      { id: 'above', label: 'From above', orbit: { target: [0, 0.7, 0], distance: 6.8, azimuth: 30, elevation: 44 } },
      { id: 'street', label: 'Down the street', orbit: { target: [0.05, 0.55, 0.5], distance: 4.8, azimuth: 84, elevation: 9 } },
      { id: 'roofs', label: 'Over the roofs', orbit: { target: [0, 1.7, -0.4], distance: 4.6, azimuth: -28, elevation: 16 } },
    ],
  },
]
