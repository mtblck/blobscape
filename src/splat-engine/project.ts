import type { Quat, Vec3 } from '../splat-core/blobs.ts'
import type { Orbit } from '../splat-core/orbit.ts'
import { oklab } from '../splat-core/pixel.ts'
import type { PointLight } from './engine.ts'
import { Skeleton, mulQ, type Bone } from './rig.ts'
import { daylight } from './daylight.ts'
import { checkScene, compileScene, litFor, type CompiledScene, type LightDoc, type MoveDoc, type SceneDoc, type SpeckDoc } from './sceneDoc.ts'
import { CLOUD_COVERS, WEATHERS, WINDS, falling, type CloudId, type WeatherId, type WindId } from './skyRecipes.ts'
import { withHeavens } from './heavens.ts'
import { placedPart, placer, type Placement, type Placer } from './place.ts'
import { MAX_LAMPS, type Lamp, type VoxelSpec } from './voxel.ts'

/**
 * Scenes made of props (Scene Creator, docs/scene-editor-plan.md). A **prop** is a scene description that holds one
 * thing (a windmill, a sheep, a witch) standing where it stood in the scene it came from, and the point it stands on.
 * A **project** is a land (a prop that everything stands on, which keeps the scene's sky, air and water) and props set
 * down on it, each moved, turned about the upright and sized.
 *
 * A placed prop is cut where it is put, so its baked sun and shade are right for the way it faces, and its moves are
 * turned with it. Two ways to cut a project: apart (the land and each prop on their own, so moving one recuts only it:
 * what an editor wants) and merged (one grid for all, so props cast their baked shadows on the land and cull what they
 * stand in: what an export wants). Both are posed and lit by the same functions here.
 */

/** A thing that can be set down in a scene. */
export interface PropDoc {
  /** What it is called in a list. */
  name: string
  /** Its description: only its own parts, bones, moves and lights, where they stood in the scene it came from. */
  doc: SceneDoc
  /** The point it stands on, in the description's own coordinates: what a placement moves, and what it turns about. */
  foot: Vec3
}

export type { Placement, Placer } from './place.ts'
export { placer } from './place.ts'

/** A library prop by its id, or a prop written out in full (an imported one). */
export type PropRef = string | PropDoc

/** One prop set down in a project. */
export interface Placed extends Placement {
  prop: PropRef
  /** Holds still: its own moves are not played. */
  still?: boolean
  /** Its moves run this share of the loop later (0 to 1), so two of one prop side by side don't sway as one. */
  phase?: number
  /**
   * Its lamps, where the project has a time of day: 'always' keeps them lit by day, 'dark' has them wait for the dark
   * whatever the project or the land says. Left out, it goes by the project's `light.lit`, then the land's own `lamps`.
   */
  lit?: 'dark' | 'always'
}

/** A scene made of a land and props: what Scene Creator edits and saves. */
export interface SceneProject {
  kind: 'blobscape-project'
  version: 1
  name: string
  /** Seconds before everything repeats: every prop's moves are fitted to it. */
  loop: number
  /** What everything stands on. It is never moved. */
  land: PropRef
  props: Placed[]
  /** Where the view starts; the land's own camera when left out. */
  camera?: Orbit
  /** How it is drawn: a style's id (Diorama's `STYLES`) and its settings, kept as the page gives them. */
  style?: { id: string; settings?: Record<string, unknown> }
  /** The light, sky and air, where they differ from the land's own. */
  light?: ProjectLight
}

/**
 * A project's light, each left out where the land's own stands. The sun is baked into the cut (so a change cuts again)
 * unless it is `live`: then everything is cut unlit and the sun, the moon and the sky's own light shine live at the
 * hour (`daylight`), with shadows where the device draws them. Lamps are always live, so they move without a cut.
 */
export interface ProjectLight {
  /** The baked sun: `turn` degrees round from +z (counterclockwise seen from above, as props turn) and `height` degrees up. */
  sun?: { turn: number; height: number }
  /** How much light reaches what the sun doesn't: 0 to 1. */
  shade?: number
  /** The sky behind, top and bottom. */
  sky?: [string, string]
  /** The sun live, at this hour of the day (0 to 24). */
  live?: { hour: number }
  /**
   * Every prop's lamps under a live sun: 'always' keeps them lit by day (a cave, a dungeon), 'dark' has them wait for
   * the dark. Left out, the land's own `lamps` says (a cave's land keeps what is set down in it lit). A prop's own
   * `lit` comes first.
   */
  lit?: 'dark' | 'always'
  /** Lamps the visitor set down, at most `MAX_PROJECT_LAMPS`. */
  lamps?: LightDoc[]
  /** How strongly glowing things light what is round them and shine in the picture, as Diorama's Glow (0 to 4): the land's own when left out. */
  glow?: number
  /** Far things fade into the sky's lower color, total this far past the view's target; 0 is clear air. */
  haze?: number
  /** Rain, snow or leaves falling over the land and lying where they land. */
  weather?: 'rain' | 'snow' | 'leaves'
  /**
   * A shared weather or cloud cover laid over the scene (skyRecipes.ts: the same recipes every Diorama scene takes),
   * a wind in place of the weather's own, and whether its clouds float over the scene. Nothing is cut again for it.
   */
  recipe?: ProjectWeather
}

/** A project's shared weather (`ProjectLight.recipe`). */
export interface ProjectWeather {
  /** A weather, which brings its own clouds and wind. */
  weather?: WeatherId
  /** A cloud cover alone, where there is no weather. */
  clouds?: CloudId
  /** A wind in place of the weather's own. */
  wind?: WindId
  /** Whether the clouds float over the scene (left out, they do); without them rain and snow fall in from over the top of the picture. */
  overhead?: boolean
}

/** Most lamps a project may add of its own. */
export const MAX_PROJECT_LAMPS = 8

const RAD = 180 / Math.PI

/** The way toward a sun `turn` degrees round from +z and `height` degrees up. */
export const sunFrom = (turn: number, height: number): Vec3 => {
  const t = turn / RAD, h = height / RAD
  return [Math.sin(t) * Math.cos(h), Math.sin(h), Math.cos(t) * Math.cos(h)]
}

/** A description's sun as a turn and a height, the default `light.from` when it has none. */
export function sunOf(from: Vec3 = [0.45, 0.8, 0.4]): { turn: number; height: number } {
  const len = Math.hypot(from[0], from[1], from[2]) || 1
  return { turn: Math.round(Math.atan2(from[0], from[2]) * RAD), height: Math.round(Math.asin(Math.max(-1, Math.min(1, from[1] / len))) * RAD) }
}

/** How dark the hour must have grown (`daylight`'s `dark`) for lamps that wait for the dark to be lit. */
export const DARK_FROM = 0.5

/**
 * Whether it is dark in a project: by its live sun's hour. With no live sun there is no time of day, and everything is
 * lit as its description has it (undefined).
 */
export const projectDark = (l: ProjectLight | undefined): boolean | undefined => (l?.live ? daylight(l.live.hour).dark > DARK_FROM : undefined)

/**
 * What of a project's light the cut depends on: the lamps, the glow and a live sun's hour change nothing that is cut,
 * except that the hour says whether it is dark, which lights or puts out every prop's own lamps (`litFor`).
 */
export const cutLight = (l: ProjectLight | undefined) => (l ? { sun: l.sun, shade: l.shade, sky: l.sky, live: !!l.live, haze: l.haze, weather: l.weather, dark: projectDark(l), lit: l.lit } : undefined)

/**
 * The land's description under a project's light: its sun, shade and sky, unlit for a live sun, with haze and weather
 * in its air. Props are cut under the land's light, so they follow it.
 */
export function litLand(doc: SceneDoc, l: ProjectLight | undefined): SceneDoc {
  if (!l) return doc
  const light = { ...doc.light }
  if (l.live) Object.assign(light, { from: [0, 1, 0] as Vec3, ambient: 1, shadow: 0, ramp: 0 })
  else {
    if (l.sun) light.from = sunFrom(l.sun.turn, Math.max(2, l.sun.height))
    if (l.shade !== undefined) light.ambient = l.shade
  }
  const sky = l.sky ?? doc.sky
  const air = { ...doc.air }
  if (l.haze !== undefined) air.haze = l.haze > 0 ? { color: sky?.[1] ?? '#c8d0dc', from: 0, to: l.haze } : undefined
  if (l.weather) {
    // in place of any weather the land has, within the 300 specks a scene may hold
    const kept = (air.specks ?? []).filter((x) => x.kind !== 'rain' && x.kind !== 'snow' && x.kind !== 'leaves').slice(0, 7)
    const left = 300 - kept.reduce((n, x) => n + x.count, 0)
    const w = weatherOf(l.weather, doc.camera)
    air.specks = left >= 10 ? [...kept, { ...w, count: Math.min(w.count, left) }] : kept
  }
  return { ...doc, light, sky, air }
}

/** How many drops, flakes or leaves a project's weather is: fewer than a sky's most, since they share the land's bones. */
const WEATHER_COUNT = { rain: 140, snow: 120, leaves: 40 }

/**
 * A swarm of rain, snow or leaves over the view's middle, falling onto whatever stands there. Rain and snow are the
 * shared recipe's (skyRecipes.ts `falling`), so a change to rain there is a change here.
 */
function weatherOf(kind: NonNullable<ProjectLight['weather']>, camera: Orbit): SpeckDoc {
  if (kind !== 'leaves') return falling(kind, camera, WEATHER_COUNT[kind])
  return { ...falling('snow', camera, WEATHER_COUNT.leaves), kind, colors: ['#c8642a', '#e0a030', '#a83c20'] }
}

/** Most props in one project: each is an actor of its own while editing, and frames slow down as they are added (#330). */
export const MAX_PROPS = 40
/** Most bones in a merged project: a blob names its bones in a byte. */
export const MAX_PROJECT_BONES = 255
/** Most bytes in a project file. */
export const MAX_PROJECT_BYTES = 2_000_000
/** The most colors a palette can hold (pixel.ts). */
const MAX_COLORS = 32
/** The least and most a prop may be sized. */
export const SIZE_RANGE: [number, number] = [0.1, 10]

const conj = (q: ArrayLike<number>): Quat => [-q[0], -q[1], -q[2], q[3]]
const scale = (a: ArrayLike<number>, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]

// --- placing ---------------------------------------------------------------

/** What a prop is cut with that comes from where it stands, not from itself: the scene's sun, cover, camera and sky. */
export type Setting = Pick<VoxelSpec, 'light' | 'cover' | 'eye' | 'sky'>

/** The setting of a land: what its props are cut under. */
export const settingOf = (spec: VoxelSpec): Setting => ({ light: spec.light, cover: spec.cover, eye: spec.eye, sky: spec.sky })

/**
 * A prop's cut where it is placed, for a detail of `spacing` in the scene's units (times its description's `grid`). Its bones are named `prefix` + their
 * own name (its root bone included). `steps` is the palette to paint in steps of, when the scene asks for that.
 */
export function placedSpec(c: CompiledScene, foot: Vec3, pl: Placement, spacing: number, setting: Setting, { prefix = '', steps }: { prefix?: string; steps?: Rgb[] } = {}): VoxelSpec {
  const t = placer(foot, pl)
  // cut at the size it was written, so thin parts are fattened and textures sized for the grid as it will be
  const base = c.spec(spacing / t.size, steps)
  const bones: Bone[] = base.bones.map((b) => ({ ...b, name: prefix + b.name, head: t.point(b.head), tail: b.tail && t.point(b.tail) }))
  const parts = base.parts.map((p) => placedPart(p, t, prefix + p.bone))
  const lamps = (base.lamps ?? []).map((l) => l && placedLamp(l, t))
  const loose = (base.loose ?? []).map((b) => ({ ...b, center: t.point(b.center), scale: scale(b.scale, t.size), bone: prefix + b.bone }))
  // the prop's own grid where it stands (a description may ask for a finer one than the detail's, as the lighthouse does)
  return { ...base, ...setting, bones, parts, lamps, loose, beams: [], focus: undefined, spacing: base.spacing * t.size }
}

const placedLamp = (l: Lamp, t: Placer): Lamp => ({ ...l, at: t.point(l.at), reach: l.reach * t.size, clear: l.clear === undefined ? undefined : l.clear * t.size })

/** What `PlacedPoser` plays: bones as they stand where they were written, a pose for a time, and live lights. */
export type Posable = Pick<CompiledScene, 'bones' | 'pose' | 'lights'>

/**
 * Poses a placed prop: its description's own pose, played on a skeleton of its own as it was written, then turned as
 * the prop was (each bone's turn as R q R⁻¹, each slide by R and the size), so a sail that spun about z spins about the
 * mill's turned axle. `into` says which bone of the target each of the prop's bones is; left out, the same index.
 */
export class PlacedPoser {
  private readonly own: Skeleton
  private readonly t: Placer
  private readonly still: boolean
  private readonly later: number
  /** The prop's compiled description, or anything else with bones that poses itself (a creature). */
  readonly c: Posable
  constructor(c: Posable, foot: Vec3, pl: Placement, still = false) {
    this.c = c
    this.still = still
    this.own = new Skeleton(c.bones)
    this.t = placer(foot, pl)
    const loop = (c as Partial<Pick<CompiledScene, 'loop'>>).loop
    this.later = (pl as Partial<Placed>).phase && loop ? (pl as Placed).phase! * loop : 0
  }

  /**
   * Writes the prop's pose for `t` seconds into `sk`. Doesn't call `sk.update()`. With `wind` (how far it carries a
   * unit of fall, along the ground, as `windAt` gives it) a description's falling specks and swaying stalks are blown,
   * the way turned into the prop's own.
   */
  pose(sk: Skeleton, time: number, into?: ArrayLike<number>, wind?: readonly [number, number], level?: number) {
    const own = this.own, t = this.t
    if (this.still) own.reset()
    else {
      this.c.pose(own, time + this.later)
      const c = this.c as Partial<CompiledScene>
      // in a calm too: sails the wind turns carry on from where it left them, and leaves it shakes loose stay on the tree
      if (c.blow) {
        const w = wind ? t.backDir([wind[0], 0, wind[1]]) : [0, 0, 0]
        c.blow(own, time + this.later, [w[0], w[2]], undefined, level ?? (wind ? undefined : 0))
      }
    }
    for (let i = 0; i < own.count; i++) {
      const j = into ? into[i] : i
      if (j < 0) continue
      const q = own.rotation.subarray(i * 4, i * 4 + 4)
      sk.setRotation(j, t.same ? q : mulQ(mulQ(t.q, q), conj(t.q)))
      const o = t.dir(own.offset.subarray(i * 3, i * 3 + 3))
      sk.offset.set(scale(o, t.size), j * 3)
      sk.size[j] = own.size[i]
    }
  }

  /** The prop's live lights `t` seconds in, where it stands. */
  lights(time: number): PointLight[] {
    if (this.still) time = 0
    return this.c.lights(time + this.later).map((l) => ({ ...l, position: this.t.point(l.position), range: l.range * this.t.size }))
  }
}

// --- lifting props out of scenes -------------------------------------------

/** Which of a scene's parts make one prop: parts by their place in its list, and every part on the named bones or the bones under them. */
export interface PropPick {
  /** What it is called. */
  name: string
  /** Parts by their place in the scene's list. */
  parts?: number[]
  /** Bones whose parts (and their children's) come along. */
  bones?: string[]
  /** The point it stands on; the middle of the bottom of its box when left out. */
  foot?: Vec3
  /**
   * Moves and lights it leaves behind: `during` drops whatever happens only in part of the loop (a witch who appears
   * and goes stands there instead), `pass` drops going by (a billboard Turkey Run slides past stands still).
   */
  drop?: ('during' | 'pass')[]
  /** The scene's lights it takes, by their place in its list; left out, those its box holds. */
  lights?: number[]
}

/** The part indices a pick takes from a scene. */
export function pickedParts(doc: SceneDoc, pick: PropPick): number[] {
  const bones = new Set(pick.bones ?? [])
  for (let grew = true; grew;) {
    grew = false
    for (const b of doc.bones ?? []) if (b.parent && bones.has(b.parent) && !bones.has(b.name)) { bones.add(b.name); grew = true }
  }
  const out = new Set(pick.parts ?? [])
  doc.parts.forEach((p, i) => { if (p.bone && bones.has(p.bone)) out.add(i) })
  return [...out].sort((a, b) => a - b)
}

/** The picks a description marks itself: one prop for each bone with a `prop` name, taking what rides on it. */
export function markedPicks(doc: SceneDoc): PropPick[] {
  return (doc.bones ?? []).filter((b) => b.prop).map((b) => ({ name: b.prop!, bones: [b.name] }))
}

/**
 * What in a scene stands outside every prop it marks, each as `where: what`: a part on a bone that is no prop's, a
 * light no prop's box holds. A scene is built from components (each thing a prop of its own, which Scene Creator's
 * library then offers), so a new scene leaves only its land outside them: the parts on no bone.
 */
export function outsideProps(doc: SceneDoc): string[] {
  const byName = new Map((doc.bones ?? []).map((b) => [b.name, b]))
  const inProp = (name: string) => { for (let b = byName.get(name); b; b = b.parent ? byName.get(b.parent) : undefined) if (b.prop) return true; return false }
  const out: string[] = []
  const loose = new Set<string>()
  for (const p of doc.parts) if (p.bone && !inProp(p.bone)) loose.add(p.bone)
  for (const b of loose) out.push(`bones: '${b}' carries parts but is in no prop (mark it, or the bone it rides on, with prop)`)
  const { land } = splitScene(doc, markedPicks(doc))
  for (const l of land.doc.lights ?? []) out.push(`lights: the light at [${l.at.join(', ')}] is in no prop (stand it inside the lamp it belongs to)`)
  return out
}

/** The scene with only these parts, the bones they ride (and those bones' parents), and the moves on those bones. */
function keepOnly(doc: SceneDoc, parts: number[]): SceneDoc {
  const ps = parts.map((i) => doc.parts[i])
  const used = new Set(ps.map((p) => p.bone).filter((b): b is string => !!b))
  const byName = new Map((doc.bones ?? []).map((b) => [b.name, b]))
  for (const n of [...used]) for (let b = byName.get(n); b?.parent; b = byName.get(b.parent)) used.add(b.parent)
  return {
    ...doc,
    parts: ps,
    bones: (doc.bones ?? []).filter((b) => used.has(b.name)),
    moves: (doc.moves ?? []).filter((m: MoveDoc) => used.has(m.bone)),
  }
}

/** A coarse look at where a description's parts are: the box round all of them. */
export function boxOf(doc: SceneDoc): { lo: Vec3; hi: Vec3 } {
  const spec = compileScene({ ...doc, lights: [], air: undefined, water: undefined }, { puffs: false }).spec(0.08)
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const p of spec.parts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p.shape.min[i]); hi[i] = Math.max(hi[i], p.shape.max[i]) }
  return { lo, hi }
}

const inBox = (p: Vec3, b: { lo: Vec3; hi: Vec3 }, pad: number) => p.every((v, i) => v >= b.lo[i] - pad && v <= b.hi[i] + pad)

/**
 * Lifts props out of a scene description and leaves what is left as its land. A light goes with the first prop whose
 * box holds it (a lantern's flame), else stays with the land. A prop takes the scene's palette, light, look and loop
 * but none of its air, water, cover or focus: those belong to the land.
 */
export function splitScene(given: SceneDoc, picks: PropPick[]): { land: PropDoc; props: PropDoc[]; project: SceneProject } {
  // the shared moon, sun and stars are written out after every other part, so a pick's numbers still name the same parts, and stay with the land
  const doc = withHeavens(given)
  const taken = new Set<number>()
  const lightsLeft = new Set((doc.lights ?? []).map((_, i) => i))
  const props: PropDoc[] = picks.map((pick) => {
    const idx = pickedParts(doc, pick).filter((i) => !taken.has(i))
    if (!idx.length) throw new Error(`${pick.name}: picks no parts`)
    idx.forEach((i) => taken.add(i))
    const kept = keepOnly(doc, idx)
    const drop = new Set(pick.drop ?? [])
    const own = { ...kept, moves: kept.moves?.filter((m) => !(drop.has('during') && m.during) && !(drop.has('pass') && m.kind === 'pass')) }
    const box = boxOf(own)
    const pad = 0.05 * Math.max(box.hi[0] - box.lo[0], box.hi[1] - box.lo[1], box.hi[2] - box.lo[2])
    const lights: LightDoc[] = []
    for (const i of [...lightsLeft]) {
      const l = doc.lights![i]
      if (pick.lights ? pick.lights.includes(i) : inBox(l.at, box, pad)) {
        if (drop.has('during') && l.during) { const { during: _d, ...always } = l; lights.push(always) } else lights.push(l)
        lightsLeft.delete(i)
      }
    }
    const foot = pick.foot ?? [(box.lo[0] + box.hi[0]) / 2, box.lo[1], (box.lo[2] + box.hi[2]) / 2]
    // a prop's lamps wait for the dark wherever it is set down, even one taken from a cave whose lamps always burn
    const { air: _air, water: _water, cover: _cover, focus: _focus, lamps: _lamps, ...rest } = own
    return { name: pick.name, foot, doc: { ...rest, name: pick.name, lights } }
  })
  const left = doc.parts.map((_, i) => i).filter((i) => !taken.has(i))
  const ground = keepOnly(doc, left)
  const bonesLeft = new Set((ground.bones ?? []).map((b) => b.name))
  const water = doc.water && { ...doc.water, bodies: doc.water.bodies?.filter((b) => bonesLeft.has(b.bone)), floats: doc.water.floats?.filter((f) => bonesLeft.has(f.bone)) }
  // the scene's own clouds are the weather's, drawn over the land: kept on it (its moon, sun and stars are parts by now)
  const clouds = given.heavens?.clouds
  const land: PropDoc = { name: doc.name, foot: [0, 0, 0], doc: { ...ground, lights: (doc.lights ?? []).filter((_, i) => lightsLeft.has(i)), water, ...(clouds ? { heavens: { clouds } } : {}) } }
  const project: SceneProject = {
    kind: 'blobscape-project', version: 1, name: doc.name, loop: doc.loop,
    land, props: props.map((p) => ({ prop: p, at: [...p.foot], turn: 0, size: 1 })), camera: { ...doc.camera },
  }
  return { land, props, project }
}

/**
 * A description fitted to a loop of `loop` seconds: every move and light keeps as near its own pace as a whole number
 * of times in the new loop allows (never none), so a prop from a 16 s scene still joins up in a 12 s one.
 */
export function refit(doc: SceneDoc, loop: number): SceneDoc {
  if (doc.loop === loop) return doc
  const k = loop / doc.loop
  const fit = (n: number) => Math.sign(n) * Math.min(60, Math.max(1, Math.round(Math.abs(n) * k)))
  return {
    ...doc,
    loop,
    moves: doc.moves?.map((m) => ({ ...m, times: fit(m.times) })),
    lights: doc.lights?.map((l) => ({ ...l, flicker: l.flicker && { ...l.flicker, times: fit(l.flicker.times) }, circle: l.circle && { ...l.circle, times: fit(l.circle.times) } })),
  }
}

// --- checking ---------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isVec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x))

function checkProp(v: unknown, at: string, known: (id: string) => boolean, bad: (at: string, what: string) => void) {
  if (typeof v === 'string') { if (!known(v)) bad(at, `no prop in the library is called "${v}"`); return }
  if (!isObj(v)) return bad(at, 'must be a library id or a prop written out')
  if (typeof v.name !== 'string' || !v.name) bad(`${at}.name`, 'must be a name')
  if (!isVec(v.foot)) bad(`${at}.foot`, 'must be [x, y, z]')
  for (const e of checkScene(v.doc)) bad(`${at}.doc.${e}`, '')
}

/**
 * What is wrong with a project, as `where: what`, or nothing. `known` says whether a library id exists. Reads
 * anything, so a file from outside can be handed straight to it.
 */
export function checkProject(x: unknown, known: (id: string) => boolean): string[] {
  const errs: string[] = []
  const bad = (at: string, what: string) => errs.push(what ? `${at}: ${what}` : at)
  if (!isObj(x)) return ['project: must be an object']
  if (x.kind !== 'blobscape-project') bad('kind', 'must be "blobscape-project"')
  if (x.version !== 1) bad('version', 'must be 1')
  if (typeof x.name !== 'string' || !x.name || x.name.length > 80) bad('name', 'must be a name of at most 80 letters')
  if (typeof x.loop !== 'number' || !(x.loop >= 4 && x.loop <= 60)) bad('loop', 'must be 4 to 60 seconds')
  checkProp(x.land, 'land', known, bad)
  if (!Array.isArray(x.props)) bad('props', 'must be a list')
  else {
    if (x.props.length > MAX_PROPS) bad('props', `holds at most ${MAX_PROPS}`)
    x.props.forEach((p, i) => {
      const at = `props[${i}]`
      if (!isObj(p)) return bad(at, 'must be an object')
      checkProp(p.prop, `${at}.prop`, known, bad)
      if (!isVec(p.at)) bad(`${at}.at`, 'must be [x, y, z]')
      if (typeof p.turn !== 'number' || !Number.isFinite(p.turn)) bad(`${at}.turn`, 'must be degrees')
      if (typeof p.size !== 'number' || !(p.size >= SIZE_RANGE[0] && p.size <= SIZE_RANGE[1])) bad(`${at}.size`, `must be ${SIZE_RANGE[0]} to ${SIZE_RANGE[1]}`)
      if (p.still !== undefined && typeof p.still !== 'boolean') bad(`${at}.still`, 'must be true or false')
      if (p.phase !== undefined && !(typeof p.phase === 'number' && p.phase >= 0 && p.phase <= 1)) bad(`${at}.phase`, 'must be a number from 0 to 1')
      if (p.lit !== undefined && p.lit !== 'dark' && p.lit !== 'always') bad(`${at}.lit`, "must be 'dark' or 'always'")
    })
  }
  if (x.camera !== undefined) {
    const c = x.camera
    if (!isObj(c) || !isVec(c.target) || [c.distance, c.azimuth, c.elevation].some((n) => typeof n !== 'number' || !Number.isFinite(n))) bad('camera', 'must be { target, distance, azimuth, elevation }')
  }
  if (x.light !== undefined) checkLight(x.light, bad)
  if (x.style !== undefined && (!isObj(x.style) || typeof x.style.id !== 'string' || (x.style.settings !== undefined && !isObj(x.style.settings)))) bad('style', 'must be { id, settings }')
  return errs
}

const HEX = /^#[0-9a-f]{6}$/i
function checkLight(l: unknown, bad: (at: string, what: string) => void) {
  if (!isObj(l)) return bad('light', 'must be an object')
  const num = (v: unknown, at: string, lo: number, hi: number) => { if (v !== undefined && (typeof v !== 'number' || !(v >= lo && v <= hi))) bad(at, `must be ${lo} to ${hi}`) }
  if (l.sun !== undefined) { if (!isObj(l.sun)) bad('light.sun', 'must be { turn, height }'); else { num(l.sun.turn, 'light.sun.turn', -180, 180); num(l.sun.height, 'light.sun.height', 0, 90) } }
  num(l.shade, 'light.shade', 0, 1)
  if (l.sky !== undefined && !(Array.isArray(l.sky) && l.sky.length === 2 && l.sky.every((c) => typeof c === 'string' && HEX.test(c)))) bad('light.sky', 'must be two colors like "#88aadd"')
  if (l.live !== undefined) { if (!isObj(l.live)) bad('light.live', 'must be { hour }'); else num(l.live.hour, 'light.live.hour', 0, 24) }
  if (l.lit !== undefined && l.lit !== 'dark' && l.lit !== 'always') bad('light.lit', "must be 'dark' or 'always'")
  num(l.glow, 'light.glow', 0, 4)
  num(l.haze, 'light.haze', 0, 16)
  if (l.weather !== undefined && !['rain', 'snow', 'leaves'].includes(l.weather as string)) bad('light.weather', 'must be rain, snow or leaves')
  if (l.recipe !== undefined) {
    const r = l.recipe
    if (!isObj(r)) bad('light.recipe', 'must be { weather, clouds, wind, overhead }')
    else {
      const one = (v: unknown, at: string, ids: { id: string }[]) => { if (v !== undefined && !ids.some((x) => x.id === v)) bad(at, `must be one of ${ids.map((x) => x.id).join(', ')}`) }
      one(r.weather, 'light.recipe.weather', WEATHERS); one(r.clouds, 'light.recipe.clouds', CLOUD_COVERS); one(r.wind, 'light.recipe.wind', WINDS)
      if (r.overhead !== undefined && typeof r.overhead !== 'boolean') bad('light.recipe.overhead', 'must be true or false')
    }
  }
  if (l.lamps !== undefined) {
    if (!Array.isArray(l.lamps) || l.lamps.length > MAX_PROJECT_LAMPS) bad('light.lamps', `must be a list of at most ${MAX_PROJECT_LAMPS}`)
    else l.lamps.forEach((m, i) => {
      const at = `light.lamps[${i}]`
      if (!isObj(m) || !isVec(m.at) || typeof m.color !== 'string' || !HEX.test(m.color)) return bad(at, 'must be { at, color, strength, range }')
      num(m.strength, `${at}.strength`, 0, 8); num(m.range, `${at}.range`, 0.01, 20)
      if (m.flicker !== undefined && (!isObj(m.flicker) || typeof m.flicker.by !== 'number' || !Number.isInteger(m.flicker.times))) bad(`${at}.flicker`, 'must be { by, times }')
    })
  }
}

/** A project file's text read and checked: the project, or what is wrong with it. */
export function readProject(text: string, known: (id: string) => boolean): { project?: SceneProject; problems: string[] } {
  if (text.length > MAX_PROJECT_BYTES) return { problems: [`file: over ${MAX_PROJECT_BYTES / 1e6} MB, which no project needs`] }
  let x: unknown
  try { x = JSON.parse(text) } catch (e) { return { problems: [`file: not JSON (${(e as Error).message})`] } }
  const problems = checkProject(x, known)
  return problems.length ? { problems } : { project: x as SceneProject, problems }
}

// --- building ---------------------------------------------------------------

type Rgb = [number, number, number]

/** A project made ready: every prop found and fitted to the loop, compiled once. */
export interface CompiledProject {
  name: string
  loop: number
  land: { prop: PropDoc; c: CompiledScene }
  props: { prop: PropDoc; c: CompiledScene; placed: Placed; poser: PlacedPoser }[]
  /** The palette for pixel art: the land's colors, then each prop's that the land lacks, joined down to 32. */
  palette: Rgb[]
  camera: Orbit
}

export function compileProject(project: SceneProject, find: (id: string) => PropDoc | undefined): CompiledProject {
  const get = (ref: PropRef, at: string): PropDoc => {
    const p = typeof ref === 'string' ? find(ref) : ref
    if (!p) throw new Error(`${at}: no prop called "${String(ref)}"`)
    return p
  }
  const landProp = get(project.land, 'land')
  // under a live sun the hour says which lamps are lit: a prop's own setting first, then the project's, then the land's
  const dark = projectDark(project.light), lamps = project.light?.lit ?? landProp.doc.lamps
  const timed = (doc: SceneDoc, own?: 'dark' | 'always') => (dark === undefined ? doc : litFor(doc, dark, own ?? lamps))
  const land = { prop: landProp, c: compileScene(refit(litLand(timed(landProp.doc), project.light), project.loop)) }
  const props = project.props.map((placed, i) => {
    const prop = get(placed.prop, `props[${i}]`)
    const c = compileScene(refit(timed(prop.doc, placed.lit), project.loop), { puffs: false })
    return { prop, c, placed, poser: new PlacedPoser(c, prop.foot, placed, placed.still) }
  })
  return { name: project.name, loop: project.loop, land, props, palette: joinPalettes([land.prop.doc.palette, ...props.map((p) => p.prop.doc.palette)]), camera: project.camera ?? land.prop.doc.camera }
}

const hexRgb = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

/** Colors a picture can tell apart: closer than this in OKLab and the second adds nothing. */
const SAME = 0.03

/**
 * One palette for colors from several scenes: the first list's colors first, then the others' that are not already
 * there, and while there are more than 32 the two closest are joined (the first scene's color kept where one is).
 */
export function joinPalettes(lists: string[][]): Rgb[] {
  const all: { rgb: Rgb; lab: Rgb; own: boolean }[] = []
  lists.forEach((list, k) => {
    for (const h of list) {
      const rgb = hexRgb(h), lab = oklab(...rgb)
      if (all.some((c) => dist(c.lab, lab) < SAME)) continue
      all.push({ rgb, lab, own: k === 0 })
    }
  })
  while (all.length > MAX_COLORS) {
    let bi = 0, bj = 1, bd = Infinity
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { const d = dist(all[i].lab, all[j].lab); if (d < bd) { bd = d; bi = i; bj = j } }
    // keep the land's own color where one of the two is, else the earlier
    all.splice(all[bi].own || !all[bj].own ? bj : bi, 1)
  }
  return all.map((c) => c.rgb)
}

const dist = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

const stepsFor = (cp: CompiledProject) => (cp.land.c.steps ? cp.palette : undefined)

/** The land's cut on a grid of `spacing`, painted in `steps` of a palette where given (the land's own choice when left out). */
export function landSpec(cp: CompiledProject, spacing: number, steps: Rgb[] | undefined = stepsFor(cp)): VoxelSpec {
  return cp.land.c.spec(spacing, steps)
}

/** Prop `i`'s cut on its own, where it is placed, under the land's sky: an actor of its own while editing. */
export function propSpec(cp: CompiledProject, i: number, spacing: number, setting: Setting = settingOf(landSpec(cp, spacing)), steps: Rgb[] | undefined = stepsFor(cp)): VoxelSpec {
  const p = cp.props[i]
  return placedSpec(p.c, p.prop.foot, p.placed, spacing, setting, { steps })
}

/**
 * The whole project on one grid: the land's bones first (as its own pose expects), then each prop's under them as
 * `<i>/<name>`, its root folded into the land's, so what stands still culls and shades what it stands on just as one
 * scene would. With it, `mergedBones` maps each prop's bones into this skeleton.
 */
export function mergedSpec(cp: CompiledProject, spacing: number): { spec: VoxelSpec; into: number[][] } {
  const land = landSpec(cp, spacing)
  const setting = settingOf(land)
  const bones: Bone[] = [...land.bones]
  const parts = [...land.parts]
  const loose = [...(land.loose ?? [])]
  // the land's lamps line up with its first lights; each prop's after them, a gap for each light that casts none
  const lamps: (Lamp | null | undefined)[] = padTo(land.lamps ?? [], cp.land.c.lights(0).length)
  const root = land.bones[0].name
  const into = cp.props.map((p, i) => {
    const spec = placedSpec(p.c, p.prop.foot, p.placed, spacing, setting, { prefix: `${i}/`, steps: stepsFor(cp) })
    const map: number[] = []
    spec.bones.forEach((b, k) => {
      if (k === 0) { map.push(0); return }
      map.push(bones.length)
      bones.push({ ...b, parent: b.parent === 0 ? 0 : map[b.parent] })
    })
    const rename = (name: string) => (name === spec.bones[0].name ? root : name)
    for (const part of spec.parts) parts.push({ ...part, bone: rename(part.bone) })
    for (const b of spec.loose ?? []) loose.push({ ...b, bone: rename(b.bone) })
    lamps.push(...padTo(spec.lamps ?? [], p.c.lights(0).length))
    return map
  })
  if (bones.length > MAX_PROJECT_BONES) throw new Error(`${cp.name}: ${bones.length} bones, more than one grid holds (${MAX_PROJECT_BONES})`)
  return { spec: { ...land, bones, parts, loose, lamps: lamps.slice(0, MAX_LAMPS) }, into }
}

const padTo = <T>(list: T[], n: number): (T | null | undefined)[] => [...list, ...Array.from({ length: Math.max(0, Math.min(n, MAX_LAMPS) - list.length) }, () => null)].slice(0, Math.max(list.length, Math.min(n, MAX_LAMPS)))

/** Poses a merged project's one skeleton for `t` seconds: the land, then every prop on its own bones. */
export function poseMerged(cp: CompiledProject, into: number[][], sk: Skeleton, t: number) {
  cp.land.c.pose(sk, t)
  cp.props.forEach((p, i) => p.poser.pose(sk, t, into[i]))
  sk.update()
}

/** Poses one prop's own skeleton, cut apart, for `t` seconds. Its place (`Skeleton.place`) is left as it is. */
export function poseApart(cp: CompiledProject, i: number, sk: Skeleton, t: number) {
  cp.props[i].poser.pose(sk, t)
  sk.update()
}

/** Every live light of the project `t` seconds in: the land's, then each prop's, in the order a merged cut's baked lamps follow. */
export function projectLights(cp: CompiledProject, t: number): PointLight[] {
  return [...cp.land.c.lights(t), ...cp.props.flatMap((p) => p.poser.lights(t))]
}
