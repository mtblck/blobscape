import type { Quat, Vec3 } from '../splat-core/blobs.ts'
import type { Orbit } from '../splat-core/orbit.ts'
import { oklab } from '../splat-core/pixel.ts'
import type { PointLight } from './engine.ts'
import { Skeleton, axisAngle, mulQ, rotate, type Bone } from './rig.ts'
import { checkScene, compileScene, type CompiledScene, type LightDoc, type MoveDoc, type SceneDoc } from './sceneDoc.ts'
import { MAX_LAMPS, type Lamp, type Shape, type VoxelPart, type VoxelSpec } from './voxel.ts'

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

/** Where a prop is set down: its foot goes to `at`, turned `turn` degrees about the upright (counterclockwise seen from above), `size` times as big. */
export interface Placement {
  at: Vec3
  turn: number
  size: number
}

/** A library prop by its id, or a prop written out in full (an imported one). */
export type PropRef = string | PropDoc

/** One prop set down in a project. */
export interface Placed extends Placement {
  prop: PropRef
  /** Holds still: its own moves are not played. */
  still?: boolean
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
  /** How it is drawn: a style's id (Pixel Diorama's `STYLES`) and its settings, kept as the page gives them. */
  style?: { id: string; settings?: Record<string, unknown> }
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

const DEG = Math.PI / 180
const conj = (q: ArrayLike<number>): Quat => [-q[0], -q[1], -q[2], q[3]]
const add = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: ArrayLike<number>, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]

// --- placing ---------------------------------------------------------------

/** A placement worked out: the turn as a quaternion and the point maps both ways. */
export interface Placer {
  /** The turn. */
  q: Quat
  /** How big. */
  size: number
  /** A point of the prop's description to where it now stands. */
  point(p: ArrayLike<number>): Vec3
  /** Back: a point where it stands to the description's. */
  back(p: ArrayLike<number>): Vec3
  /** A direction of the description to the way it now points. */
  dir(v: ArrayLike<number>): Vec3
  /** Back: a direction to the description's. */
  backDir(v: ArrayLike<number>): Vec3
  /** Whether it changes nothing. */
  same: boolean
}

export function placer(foot: ArrayLike<number>, pl: Placement): Placer {
  const q = axisAngle([0, 1, 0], pl.turn * DEG), qi = conj(q), s = pl.size
  const same = pl.turn % 360 === 0 && s === 1 && pl.at[0] === foot[0] && pl.at[1] === foot[1] && pl.at[2] === foot[2]
  return {
    q, size: s, same,
    point: (p) => (same ? [p[0], p[1], p[2]] : add(pl.at, scale(rotate(q, sub(p, foot)), s))),
    back: (p) => (same ? [p[0], p[1], p[2]] : add(foot, scale(rotate(qi, sub(p, pl.at)), 1 / s))),
    dir: (v) => (same ? [v[0], v[1], v[2]] : rotate(q, v)),
    backDir: (v) => (same ? [v[0], v[1], v[2]] : rotate(qi, v)),
  }
}

/** A shape where the placement puts it: distances are exact, since a turn and an even scale keep them (times the size). */
function placedShape(sh: Shape, t: Placer): Shape {
  if (t.same) return sh
  const s = t.size
  // the box: all eight corners where they land
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let k = 0; k < 8; k++) {
    const c = t.point([k & 1 ? sh.max[0] : sh.min[0], k & 2 ? sh.max[1] : sh.min[1], k & 4 ? sh.max[2] : sh.min[2]])
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], c[i]); hi[i] = Math.max(hi[i], c[i]) }
  }
  const out: Shape = { sdf: (x, y, z) => { const p = t.back([x, y, z]); return s * sh.sdf(p[0], p[1], p[2]) }, min: lo, max: hi }
  if (sh.pieceAt) { const at = sh.pieceAt; out.pieceAt = (p) => at(t.back(p)) }
  return out
}

function placedPart(part: VoxelPart, t: Placer, bone: string): VoxelPart {
  const color = typeof part.color === 'function' && !t.same ? ((f) => (p: Vec3, n: Vec3) => f(t.back(p), t.backDir(n)))(part.color) : part.color
  return { ...part, shape: placedShape(part.shape, t), color, bone }
}

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

/**
 * Poses a placed prop: its description's own pose, played on a skeleton of its own as it was written, then turned as
 * the prop was (each bone's turn as R q R⁻¹, each slide by R and the size), so a sail that spun about z spins about the
 * mill's turned axle. `into` says which bone of the target each of the prop's bones is; left out, the same index.
 */
export class PlacedPoser {
  private readonly own: Skeleton
  private readonly t: Placer
  private readonly still: boolean
  /** The prop's compiled description. */
  readonly c: CompiledScene
  constructor(c: CompiledScene, foot: Vec3, pl: Placement, still = false) {
    this.c = c
    this.still = still
    this.own = new Skeleton(c.bones)
    this.t = placer(foot, pl)
  }

  /** Writes the prop's pose for `t` seconds into `sk`. Doesn't call `sk.update()`. */
  pose(sk: Skeleton, time: number, into?: ArrayLike<number>) {
    const own = this.own, t = this.t
    if (this.still) own.reset()
    else this.c.pose(own, time)
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
    return this.c.lights(time).map((l) => ({ ...l, position: this.t.point(l.position), range: l.range * this.t.size }))
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
export function splitScene(doc: SceneDoc, picks: PropPick[]): { land: PropDoc; props: PropDoc[]; project: SceneProject } {
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
    const { air: _air, water: _water, cover: _cover, focus: _focus, ...rest } = own
    return { name: pick.name, foot, doc: { ...rest, name: pick.name, lights } }
  })
  const left = doc.parts.map((_, i) => i).filter((i) => !taken.has(i))
  const ground = keepOnly(doc, left)
  const bonesLeft = new Set((ground.bones ?? []).map((b) => b.name))
  const water = doc.water && { ...doc.water, bodies: doc.water.bodies?.filter((b) => bonesLeft.has(b.bone)) }
  const land: PropDoc = { name: doc.name, foot: [0, 0, 0], doc: { ...ground, lights: (doc.lights ?? []).filter((_, i) => lightsLeft.has(i)), water } }
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
    })
  }
  if (x.camera !== undefined) {
    const c = x.camera
    if (!isObj(c) || !isVec(c.target) || [c.distance, c.azimuth, c.elevation].some((n) => typeof n !== 'number' || !Number.isFinite(n))) bad('camera', 'must be { target, distance, azimuth, elevation }')
  }
  if (x.style !== undefined && (!isObj(x.style) || typeof x.style.id !== 'string' || (x.style.settings !== undefined && !isObj(x.style.settings)))) bad('style', 'must be { id, settings }')
  return errs
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
  const land = { prop: landProp, c: compileScene(refit(landProp.doc, project.loop)) }
  const props = project.props.map((placed, i) => {
    const prop = get(placed.prop, `props[${i}]`)
    const c = compileScene(refit(prop.doc, project.loop), { puffs: false })
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

/** The land's cut on a grid of `spacing`. */
export function landSpec(cp: CompiledProject, spacing: number): VoxelSpec {
  return cp.land.c.spec(spacing, stepsFor(cp))
}

/** Prop `i`'s cut on its own, where it is placed, under the land's sky: an actor of its own while editing. */
export function propSpec(cp: CompiledProject, i: number, spacing: number, setting: Setting = settingOf(landSpec(cp, spacing))): VoxelSpec {
  const p = cp.props[i]
  return placedSpec(p.c, p.prop.foot, p.placed, spacing, setting, { steps: stepsFor(cp) })
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
