import type { Vec3 } from '../splat-core/blobs.ts'
import type { Orbit } from '../splat-core/view.ts'
import { MAX_PALETTE_SIZE, darkest, type PixelLook, type Rgb } from '../splat-core/pixel.ts'
import type { PointLight } from './engine.ts'
import { axisAngle, mulQ, type Bone, type Skeleton } from './rig.ts'
import { INK_MARKS, LETTERS, MAX_LAMPS, PAINTED, blend, box, lathe, letterGrid, pixelText, sweep, cone, cut, cylinder, displace, ellipsoid, roof, sphere, torus, union, type LooseBlob, type Shape, type VoxelPart, type VoxelSpec } from './voxel.ts'

/**
 * A pixel-art scene written as data: no code, so it can be typed by hand, kept
 * in a file, or written by Claude from a prompt (docs/scene-descriptions.md).
 * `checkScene` says what is wrong with one, in words that point at the place;
 * `compileScene` turns a sound one into what the voxel builder, the bones and
 * pixel mode need.
 *
 * Units: about 1 is a small house, and a whole scene is about 4 across. y is up, the ground is y = 0, and the
 * camera starts on the +z side. Colors are '#rrggbb'.
 */
export interface SceneDoc {
  name: string
  /** Seconds before everything repeats: 4 to 60. */
  loop: number
  /**
   * The baked sun: `from` points toward it. `ramp` (0–1, 0.7 when left out) turns shade toward cool violet and full
   * sun toward warm yellow, as a painter's ramp does; `crevice` (0.5) darkens corners and cracks; `wear` (0.5)
   * lightens sharp outer edges. 0 turns any of them off.
   */
  light?: { from?: Vec3; ambient?: number; shadow?: number; ramp?: number; crevice?: number; wear?: number }
  /** The colors the picture is drawn in, 2 to 32. */
  palette: string[]
  /** The sky behind, top and bottom. Left out, the background is clear. */
  sky?: [string, string]
  /** How far down the picture the sky's blend runs before it is all the bottom color: 0.05 to 1, the whole way when left out. */
  skyReach?: number
  look?: { dither?: number; glow?: number; outline?: boolean; edges?: boolean }
  /**
   * How wide each surface disc is, as a share of the grid: 0.4 to 1, 0.55 when left out. Small discs keep paint
   * crisp but let about a tenth of what lies behind a surface show through; a subject whose far side or inner
   * parts are much darker or lighter than its near side (a head over an open jaw) wants 0.75, as creatures use.
   */
  disc?: number
  /** Where the view starts. `swing` rocks it gently from side to side by that many degrees, once a loop. */
  camera: Orbit & { swing?: number }
  /** Things that move. The land itself needs none: parts with no bone stand still. */
  bones?: BoneDoc[]
  parts: PartDoc[]
  moves?: MoveDoc[]
  /** Live lights, at most four: they light what is near them, frame by frame. */
  lights?: LightDoc[]
  /** What hangs in the air: distance haze, low mist, beams of light and drifting specks. */
  air?: AirDoc
  /**
   * Snow, moss or dust laid over everything once it is cut (parts marked `bare` and glowing ones keep their paint):
   * `snow` settles on tops open to the sky, `moss` creeps over shut-in and up-turned faces in patches, `dust` lies
   * thin on every upturned face. `amount` 0 to 1, from a dusting to most of what faces up.
   */
  cover?: { kind: 'snow' | 'moss' | 'dust'; color: string; amount: number }
}

export interface AirDoc {
  /** Things far from the camera fade toward `color`: it starts `from` units past the view's target (0 when left out) and would be total at `to` (4). */
  haze?: { color: string; from?: number; to?: number }
  /** Low banks of mist that drift slowly to and fro, at most four. */
  mist?: MistDoc[]
  /** Beams of light, as from a window or a gap in the leaves, at most six: what they land on is lit by them. */
  shafts?: ShaftDoc[]
  /** Swarms of small things, each moving on its own, at most eight swarms and 300 specks in all. */
  specks?: SpeckDoc[]
}

export interface MistDoc {
  /** The middle of the bank. */
  at: Vec3
  /** Half its size along x, y (its depth) and z. */
  half: Vec3
  color: string
  /** How thick it is, 0 to 1 (0.5 when left out). */
  thick?: number
}

export interface ShaftDoc {
  /** Where it starts (a window, a crack, a lamp) and where it lands. */
  from: Vec3
  to: Vec3
  /** How wide it is, as a radius. */
  r: number
  color: string
  /** How bright, 0 to 1 (0.6 when left out). */
  strength?: number
}

/**
 * What a swarm does: `dust` hangs and twinkles, `embers` rise and fade, `rain` falls fast as streaks, `snow` falls
 * slowly and sways, `fireflies` wander and blink, `bubbles` rise and wobble.
 */
export type SpeckKind = 'dust' | 'embers' | 'rain' | 'snow' | 'fireflies' | 'bubbles'

export interface SpeckDoc {
  kind: SpeckKind
  count: number
  /** Two opposite corners of the box they live in: rain and snow fall from its top to its bottom, embers and bubbles rise from its bottom to its top. */
  from: Vec3
  to: Vec3
  /** Each speck takes one of these. */
  colors: string[]
  /** A speck's radius; left out, a size that suits the kind. */
  size?: number
  /** Whether they give off light; left out, embers and fireflies do. */
  glow?: boolean
}

export interface BoneDoc {
  name: string
  /** The point it turns and grows about. */
  at: Vec3
  /** Another bone it rides on (named earlier in the list). */
  parent?: string
}

export interface PartDoc {
  shape: ShapeDoc
  paint: PaintDoc
  /** The bone that carries it; left out, it is part of the land. */
  bone?: string
  /** Gives off light and takes none: lamps, fire, stars, anything that must stay bright. */
  glow?: boolean
  /** Casts no shadow: thin things in the air. */
  noShadow?: boolean
  /** A color that gathers in its corners and cracks, as moss or soot does. */
  grime?: string
  /** Takes none of the scene's `cover`: water, glass, a fresh fire. */
  bare?: boolean
  /**
   * Little drawn marks over it, one in some 4-by-4 blocks of pixels, never repeating: `hatch`, `stipple`, `cracks`,
   * `grain` (wood), `tufts` (grass) or `scales`. `amount` (0.5) is the share of blocks marked; `color` the ink, a
   * darker step of the paint when left out.
   */
  ink?: { kind: 'hatch' | 'stipple' | 'cracks' | 'grain' | 'tufts' | 'scales'; amount?: number; color?: string }
  /**
   * Water, ice or glass: it shows what lies behind it (`see`, 0.6) and mirrors what is over it (`mirror`, 0.3, more
   * at a glancing look), painted for the scene's own camera. Its paint tints what shows through, and where the line
   * from the eye leaves it with nothing met, a darker step of it shows, as the bottom of a pond does. `top` keeps it
   * to upturned faces, for a pond cut as one slab with earth sides.
   */
  glass?: { see?: number; mirror?: number; top?: boolean }
}

export type ShapeDoc =
  | { kind: 'sphere'; at: Vec3; r: number }
  /** A stretched ball: radii along x, y, z. */
  | { kind: 'ball'; at: Vec3; r: Vec3 }
  /** `half` is half its size along x, y, z. */
  | { kind: 'box'; at: Vec3; half: Vec3; round?: number }
  /** Upright, standing on `at`; `rTop` tapers it. */
  | { kind: 'cylinder'; at: Vec3; height: number; r: number; rTop?: number }
  /** A round-ended stick from one point to another, `rTo` tapering it: branches, legs, logs, flames. Its ends are balls, so it reaches `r` past `from`; for a flat-bottomed cone (a pine, a spire) use a cylinder with a small `rTop`. */
  | { kind: 'cone'; from: Vec3; to: Vec3; r: number; rTo?: number }
  /** A ring lying flat: `r` to the middle of the tube, `tube` its thickness. */
  | { kind: 'ring'; at: Vec3; r: number; tube: number }
  /** A pitched roof standing on `at`, ridge along x: `half` is [along the ridge, eave to ridge]. */
  | { kind: 'roof'; at: Vec3; half: [number, number]; height: number }
  /**
   * Shapes made one. `blend` fills the seams where they meet: 'smooth' a rounded fillet, 'chamfer' a flat bevel,
   * 'stairs' a run of `steps` little steps (3 when left out), each reaching `by` from the seam.
   */
  | { kind: 'join'; shapes: ShapeDoc[]; blend?: 'smooth' | 'chamfer' | 'stairs'; by?: number; steps?: number }
  /** Turned on a lathe: `profile` is [radius, height above `at`] pairs from the bottom up, spun round the upright through `at`. Vases, bells, bottles, posts. */
  | { kind: 'lathe'; at: Vec3; profile: [number, number][] }
  /** A tube through a list of points, `r` thick at the first and `rTo` at the last: vines, pipes, rails, tails. */
  | { kind: 'sweep'; path: Vec3[]; r: number; rTo?: number }
  /** Words in blocky 3-by-5 letters, `size` tall and `depth` thick, centered on `at`, reading along +x (or along -z when `facing` is 'x'). Letters, digits, space and . , ! ? - : only. */
  | { kind: 'text'; at: Vec3; text: string; size: number; depth: number; facing?: 'x' | 'z' }
  /** A model drawn in letters: `layers` from the bottom up, each a list of rows from back to front, each row read along +x; any letter but '.' fills a cube `size` across. It stands on `at`. Paint it with a `key`. */
  | { kind: 'blocks'; at: Vec3; size: number; layers: string[][] }
  /** The first shape with the second cut out of it. */
  | { kind: 'cut'; shape: ShapeDoc; hole: ShapeDoc }
  /** A lumpy version: `by` is how far the surface moves, `scale` how big the lumps are. */
  | { kind: 'rough'; shape: ShapeDoc; by: number; scale?: number }

export type PaintDoc =
  | string
  /** Stripes across an axis, `size` thick, taking the colors in turn. */
  | { kind: 'bands'; axis: 'x' | 'y' | 'z'; size: number; colors: string[] }
  /** Courses of bricks, tiles or planks: `size` is [length, height], `line` the color between them. */
  | { kind: 'bricks'; size: [number, number]; colors: string[]; line: string }
  /** Six-sided cells `size` across, as honeycomb, scales or paving: each cell picks a color (earlier ones commoner), with `line` between cells and, if given, `deep` in the middle of each, which reads as a hollow. */
  | { kind: 'hex'; size: number; colors: string[]; line: string; deep?: string }
  /** Small flecks: each cell of `size` picks one color; earlier colors are commoner. */
  | { kind: 'speckle'; size: number; colors: string[] }
  /** Soft-edged patches `size` across, as moss on rock or light on water. */
  | { kind: 'patches'; size: number; colors: string[] }
  /** For a `blocks` shape: each letter of the model takes its color. */
  | { kind: 'key'; colors: Record<string, string> }
  /** One paint where the surface faces up, another on the sides, another underneath. */
  | { kind: 'faces'; top?: PaintDoc; side: PaintDoc; under?: PaintDoc }
  /** One paint under a height (or left of x, or behind z), another over it. */
  | { kind: 'split'; axis: 'x' | 'y' | 'z'; at: number; below: PaintDoc; above: PaintDoc }

/** Every move repeats a whole number of `times` in the loop, so the scene loops. */
export type MoveDoc =
  /** Turns right round, `times` per loop (negative turns the other way). */
  | { kind: 'spin'; bone: string; axis: 'x' | 'y' | 'z'; times: number; phase?: number }
  /** Rocks to and fro by `degrees`. */
  | { kind: 'sway'; bone: string; axis: 'x' | 'y' | 'z'; degrees: number; times: number; phase?: number }
  /** Slides to and fro by `by`. */
  | { kind: 'bob'; bone: string; by: Vec3; times: number; phase?: number }
  /** Is born, travels `by`, and fades away, over and over: smoke, sparks, bubbles, foam. `grow` is its size at birth and at the end. */
  | { kind: 'drift'; bone: string; by: Vec3; times: number; grow?: [number, number]; phase?: number }
  /** Swells and shrinks between two sizes. */
  | { kind: 'pulse'; bone: string; size: [number, number]; times: number; phase?: number }

export interface LightDoc {
  at: Vec3
  color: string
  /** 1 is a torch; 3 lights dark ground brightly. */
  strength: number
  /** How far it reaches. */
  range: number
  /** Flickers by this share of its strength, `times` per loop. */
  flicker?: { by: number; times: number }
  /** Goes round a circle of this radius about `at`, `times` per loop. */
  circle?: { r: number; times: number }
  /**
   * Casts shadows, worked out once when the scene is built, so they cost nothing as it plays and flicker with it. Only
   * the first four lights can, and not one that goes round a circle. Give it to a lamp or fire out in the open: a light
   * set inside something (a jar, a window, a hollow) to stand for its glow would shade everything outside.
   */
  shadows?: boolean
}

// --- Checking

const HEX = /^#[0-9a-f]{6}$/i
const AXES = ['x', 'y', 'z']
const REACH = 4
const MAX_PARTS = 240
const MAX_BONES = 64
const MAX_DEPTH = 6
const MAX_SCENE_LIGHTS = 4
/** Simple shapes in the whole scene, however they are joined. */
const MAX_SHAPES = 600
/** The most surface a scene's parts may have between them, by their boxes, in square units: a third over the fullest scene we ship (the dragon, about 160). Past it the build takes seconds and the blobs run to millions. */
const MAX_SURFACE = 200
const MAX_MOVES_PER_BONE = 6
/** Specks in a whole scene: each is a bone of its own, posed every frame. */
const MAX_SPECKS = 300
const SPECK_KINDS: SpeckKind[] = ['dust', 'embers', 'rain', 'snow', 'fireflies', 'bubbles']
/** A value for a message: only what is safe to print (anything can arrive from a prompt). */
const COVERS = ['snow', 'moss', 'dust']
const BLENDS = ['smooth', 'chamfer', 'stairs']
/** The keys paints use, found anywhere inside one. */
const keysIn = (p: unknown): Record<string, unknown>[] => {
  if (typeof p !== 'object' || p === null) return []
  const q = p as Record<string, unknown>
  if (q.kind === 'key') return [q]
  return [q.top, q.side, q.under, q.below, q.above].flatMap(keysIn)
}
const show = (v: unknown) => (typeof v === 'string' ? `'${v.slice(0, 40)}'` : typeof v === 'number' || typeof v === 'boolean' ? String(v) : v === undefined ? 'nothing' : `a ${Array.isArray(v) ? 'list' : typeof v}`)
/** Half the size of a sound shape's box, near enough: for adding up how much surface a scene has. */
function halfSize(s: ShapeDoc): Vec3 {
  switch (s.kind) {
    case 'sphere': return [s.r, s.r, s.r]
    case 'ball': return s.r
    case 'box': return s.half
    case 'cylinder': { const r = Math.max(s.r, s.rTop ?? 0); return [r, s.height / 2, r] }
    case 'cone': { const r = Math.max(s.r, s.rTo ?? 0); return [Math.abs(s.to[0] - s.from[0]) / 2 + r, Math.abs(s.to[1] - s.from[1]) / 2 + r, Math.abs(s.to[2] - s.from[2]) / 2 + r] }
    case 'ring': return [s.r + s.tube, s.tube, s.r + s.tube]
    case 'roof': return [s.half[0], s.height / 2, s.half[1]]
    case 'join': return s.shapes.map(halfSize).reduce((a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])])
    case 'lathe': { const r = Math.max(...s.profile.map((q) => q[0])); return [r, (Math.max(...s.profile.map((q) => q[1])) - Math.min(...s.profile.map((q) => q[1]))) / 2, r] }
    case 'sweep': return [0, 1, 2].map((i) => (Math.max(...s.path.map((q) => q[i])) - Math.min(...s.path.map((q) => q[i]))) / 2 + Math.max(s.r, s.rTo ?? 0)) as Vec3
    case 'text': { const w = ((s.text.length * 4 - 1) * s.size) / 10; return s.facing === 'x' ? [s.depth / 2, s.size / 2, w] : [w, s.size / 2, s.depth / 2] }
    case 'blocks': return [(Math.max(...s.layers.flatMap((l) => l.map((r) => r.length))) * s.size) / 2, (s.layers.length * s.size) / 2, (Math.max(...s.layers.map((l) => l.length)) * s.size) / 2]
    case 'cut': case 'rough': return halfSize(s.shape)
  }
}

/**
 * Everything wrong with a scene description, each as `where: what`. Empty when
 * it is sound. It takes anything, so it can check what came back from a prompt.
 */
export function checkScene(doc: unknown): string[] {
  const errs: string[] = []
  // every mistake is counted, though only the first 40 are listed
  let found = 0
  const bad = (at: string, what: string) => { found++; if (errs.length < 40) errs.push(`${at}: ${what}`) }
  const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
  const num = (v: unknown, at: string, min: number, max: number) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) { bad(at, 'must be a number'); return false }
    if (v < min || v > max) { bad(at, `must be from ${min} to ${max}`); return false }
    return true
  }
  const opt = (v: unknown, at: string, min: number, max: number) => v === undefined || num(v, at, min, max)
  const vec = (v: unknown, at: string, min = -REACH, max = REACH, n = 3) => {
    if (!Array.isArray(v) || v.length !== n) { bad(at, `must be ${n} numbers`); return false }
    return v.map((c, i) => num(c, `${at}[${i}]`, min, max)).every(Boolean)
  }
  const hex = (v: unknown, at: string) => { if (typeof v !== 'string' || !HEX.test(v)) bad(at, "must be a color like '#a37a52'") }
  const hexes = (v: unknown, at: string, min: number, max: number) => {
    if (!Array.isArray(v) || v.length < min || v.length > max) { bad(at, `must be ${min} to ${max} colors`); return }
    v.forEach((c, i) => hex(c, `${at}[${i}]`))
  }
  const axis = (v: unknown, at: string) => { if (!AXES.includes(v as string)) bad(at, "must be 'x', 'y' or 'z'") }
  const whole = (v: unknown, at: string) => { if (typeof v !== 'number' || !Number.isInteger(v) || v === 0 || Math.abs(v) > 60) bad(at, 'must be a whole number of times per loop (not 0), so the scene loops') }

  if (!obj(doc)) return ['scene: must be an object']
  if (typeof doc.name !== 'string' || !doc.name.trim() || doc.name.length > 60) bad('name', 'must be a short name')
  num(doc.loop, 'loop', 4, 60)
  if (doc.light !== undefined) {
    if (!obj(doc.light)) bad('light', 'must be an object')
    else {
      if (doc.light.from !== undefined && vec(doc.light.from, 'light.from', -1, 1) && Math.hypot(...(doc.light.from as Vec3)) < 0.1) bad('light.from', 'must point somewhere')
      for (const k of ['ambient', 'shadow', 'ramp', 'crevice', 'wear']) opt(doc.light[k], `light.${k}`, 0, 1)
    }
  }
  hexes(doc.palette, 'palette', 2, MAX_PALETTE_SIZE)
  if (doc.sky !== undefined) hexes(doc.sky, 'sky', 2, 2)
  opt(doc.skyReach, 'skyReach', 0.05, 1)
  opt(doc.disc, 'disc', 0.4, 1)
  if (doc.look !== undefined) {
    if (!obj(doc.look)) bad('look', 'must be an object')
    else {
      opt(doc.look.dither, 'look.dither', 0, 1)
      opt(doc.look.glow, 'look.glow', 0, 4)
      for (const k of ['outline', 'edges']) if (doc.look[k] !== undefined && typeof doc.look[k] !== 'boolean') bad(`look.${k}`, 'must be true or false')
    }
  }
  if (!obj(doc.camera)) bad('camera', 'must be an object')
  else {
    vec(doc.camera.target, 'camera.target')
    num(doc.camera.distance, 'camera.distance', 0.5, 20)
    num(doc.camera.azimuth, 'camera.azimuth', -360, 360)
    num(doc.camera.elevation, 'camera.elevation', -10, 89)
    opt(doc.camera.swing, 'camera.swing', 0, 60)
  }

  const names = new Set<string>()
  if (doc.bones !== undefined) {
    if (!Array.isArray(doc.bones) || doc.bones.length > MAX_BONES) bad('bones', `must be a list of at most ${MAX_BONES}`)
    else doc.bones.forEach((b: unknown, i: number) => {
      const at = `bones[${i}]`
      if (!obj(b)) { bad(at, 'must be an object'); return }
      if (typeof b.name !== 'string' || !b.name || b.name === 'land') bad(`${at}.name`, "must be a name (not 'land', which is the ground itself)")
      else if (names.has(b.name)) bad(`${at}.name`, `'${b.name}' is used twice`)
      vec(b.at, `${at}.at`)
      if (b.parent !== undefined && !names.has(b.parent as string)) bad(`${at}.parent`, `${show(b.parent)} is not a bone named earlier in the list`)
      if (typeof b.name === 'string') names.add(b.name)
    })
  }
  const bone = (v: unknown, at: string) => { if (typeof v !== 'string' || !names.has(v)) bad(at, `${show(v)} is not one of the bones`) }

  let shapes = 0, surface = 0
  const shape = (s: unknown, at: string, depth: number) => {
    if (!obj(s)) { bad(at, 'must be a shape'); return }
    shapes++
    if (depth > MAX_DEPTH) { bad(at, 'shapes are nested too deep'); return }
    switch (s.kind) {
      case 'sphere': vec(s.at, `${at}.at`); num(s.r, `${at}.r`, 0.001, REACH); break
      case 'ball': vec(s.at, `${at}.at`); vec(s.r, `${at}.r`, 0.001, REACH); break
      case 'box': vec(s.at, `${at}.at`); vec(s.half, `${at}.half`, 0.001, REACH); opt(s.round, `${at}.round`, 0, 1); break
      case 'cylinder': vec(s.at, `${at}.at`); num(s.height, `${at}.height`, 0.001, REACH); num(s.r, `${at}.r`, 0.001, REACH); opt(s.rTop, `${at}.rTop`, 0, REACH); break
      case 'cone': vec(s.from, `${at}.from`); vec(s.to, `${at}.to`); num(s.r, `${at}.r`, 0.001, REACH); opt(s.rTo, `${at}.rTo`, 0, REACH); break
      case 'ring': vec(s.at, `${at}.at`); num(s.r, `${at}.r`, 0.001, REACH); num(s.tube, `${at}.tube`, 0.001, REACH); break
      case 'roof': vec(s.at, `${at}.at`); vec(s.half, `${at}.half`, 0.001, REACH, 2); num(s.height, `${at}.height`, 0.001, REACH); break
      case 'join':
        if (!Array.isArray(s.shapes) || !s.shapes.length || s.shapes.length > 40) bad(`${at}.shapes`, 'must be a list of 1 to 40 shapes')
        else s.shapes.forEach((k: unknown, i: number) => shape(k, `${at}.shapes[${i}]`, depth + 1))
        if (s.blend !== undefined) {
          if (!BLENDS.includes(s.blend as string)) bad(`${at}.blend`, `must be one of ${BLENDS.map((b) => `'${b}'`).join(', ')}`)
          num(s.by, `${at}.by`, 0.005, 1)
          if (s.steps !== undefined && (typeof s.steps !== 'number' || !Number.isInteger(s.steps) || s.steps < 1 || s.steps > 8)) bad(`${at}.steps`, 'must be a whole number from 1 to 8')
        } else if (s.by !== undefined || s.steps !== undefined) bad(`${at}.blend`, 'is needed for by or steps')
        break
      case 'lathe':
        vec(s.at, `${at}.at`)
        if (!Array.isArray(s.profile) || s.profile.length < 2 || s.profile.length > 24) bad(`${at}.profile`, 'must be a list of 2 to 24 [radius, height] pairs')
        else s.profile.forEach((q: unknown, i: number) => vec(q, `${at}.profile[${i}]`, 0, REACH, 2))
        break
      case 'sweep':
        if (!Array.isArray(s.path) || s.path.length < 2 || s.path.length > 16) bad(`${at}.path`, 'must be a list of 2 to 16 points')
        else s.path.forEach((q: unknown, i: number) => vec(q, `${at}.path[${i}]`))
        num(s.r, `${at}.r`, 0.001, REACH); opt(s.rTo, `${at}.rTo`, 0, REACH)
        break
      case 'text':
        vec(s.at, `${at}.at`); num(s.size, `${at}.size`, 0.05, REACH); num(s.depth, `${at}.depth`, 0.005, REACH)
        if (typeof s.text !== 'string' || !s.text.length || s.text.length > 24) bad(`${at}.text`, 'must be 1 to 24 characters')
        else { const odd = [...s.text.toUpperCase()].find((c) => !(c in LETTERS)); if (odd !== undefined) bad(`${at}.text`, `can't draw ${show(odd)}: letters, digits, space and . , ! ? - : only`) }
        if (s.facing !== undefined && s.facing !== 'x' && s.facing !== 'z') bad(`${at}.facing`, "must be 'x' or 'z'")
        break
      case 'blocks': {
        vec(s.at, `${at}.at`); num(s.size, `${at}.size`, 0.01, REACH)
        const rows = Array.isArray(s.layers) ? s.layers : undefined
        if (!rows || !rows.length || rows.length > 24) { bad(`${at}.layers`, 'must be a list of 1 to 24 layers'); break }
        rows.forEach((l: unknown, j: number) => {
          if (!Array.isArray(l) || !l.length || l.length > 24) bad(`${at}.layers[${j}]`, 'must be a list of 1 to 24 rows')
          else l.forEach((r: unknown, k: number) => {
            if (typeof r !== 'string' || !r.length || r.length > 24) bad(`${at}.layers[${j}][${k}]`, 'must be a row of 1 to 24 letters')
            else if (/['"`\\]/.test(r)) bad(`${at}.layers[${j}][${k}]`, 'must not hold quotes or backslashes')
          })
        })
        break
      }
      case 'cut': shape(s.shape, `${at}.shape`, depth + 1); shape(s.hole, `${at}.hole`, depth + 1); break
      case 'rough': shape(s.shape, `${at}.shape`, depth + 1); num(s.by, `${at}.by`, 0, 0.3); opt(s.scale, `${at}.scale`, 0.02, REACH); break
      default: bad(`${at}.kind`, `${show(s.kind)} is not a shape (sphere, ball, box, cylinder, cone, ring, roof, join, lathe, sweep, text, blocks, cut, rough)`)
    }
  }
  const paint = (p: unknown, at: string, depth: number) => {
    if (typeof p === 'string') { hex(p, at); return }
    if (!obj(p)) { bad(at, 'must be a color or a paint'); return }
    if (depth > MAX_DEPTH) { bad(at, 'paints are nested too deep'); return }
    switch (p.kind) {
      case 'bands': axis(p.axis, `${at}.axis`); num(p.size, `${at}.size`, 0.005, REACH); hexes(p.colors, `${at}.colors`, 2, 8); break
      case 'bricks': vec(p.size, `${at}.size`, 0.01, REACH, 2); hexes(p.colors, `${at}.colors`, 1, 8); hex(p.line, `${at}.line`); break
      case 'hex': num(p.size, `${at}.size`, 0.03, REACH); hexes(p.colors, `${at}.colors`, 1, 8); hex(p.line, `${at}.line`); if (p.deep !== undefined) hex(p.deep, `${at}.deep`); break
      case 'key':
        if (!obj(p.colors) || !Object.keys(p.colors).length) bad(`${at}.colors`, 'must map letters to colors')
        else for (const [k, c] of Object.entries(p.colors)) { if ([...k].length !== 1) bad(`${at}.colors`, `${show(k)} is not one letter`); hex(c, `${at}.colors.${k}`) }
        break
      case 'speckle': case 'patches': num(p.size, `${at}.size`, 0.005, REACH); hexes(p.colors, `${at}.colors`, 2, 8); break
      case 'faces':
        paint(p.side, `${at}.side`, depth + 1)
        if (p.top !== undefined) paint(p.top, `${at}.top`, depth + 1)
        if (p.under !== undefined) paint(p.under, `${at}.under`, depth + 1)
        break
      case 'split': axis(p.axis, `${at}.axis`); num(p.at, `${at}.at`, -REACH, REACH); paint(p.below, `${at}.below`, depth + 1); paint(p.above, `${at}.above`, depth + 1); break
      default: bad(`${at}.kind`, `${show(p.kind)} is not a paint (bands, bricks, hex, speckle, patches, faces, split)`)
    }
  }
  if (!Array.isArray(doc.parts) || !doc.parts.length || doc.parts.length > MAX_PARTS) bad('parts', `must be a list of 1 to ${MAX_PARTS} parts`)
  else doc.parts.forEach((p: unknown, i: number) => {
    const at = `parts[${i}]`
    if (!obj(p)) { bad(at, 'must be an object'); return }
    const before = found
    shape(p.shape, `${at}.shape`, 0)
    if (found === before) {
      // a sound shape: add its box's surface, and catch one so big it would take seconds to cut
      const [a, b, c] = halfSize(p.shape as ShapeDoc)
      const area = 8 * (a * b + b * c + c * a)
      if (area > MAX_SURFACE / 2) bad(`${at}.shape`, 'is too big: keep a part within about 3 units across')
      surface += area
    }
    paint(p.paint, `${at}.paint`, 0)
    const keys = keysIn(p.paint)
    if (keys.length) {
      const sh = p.shape as Record<string, unknown> | undefined
      if (sh?.kind !== 'blocks') bad(`${at}.paint`, 'a key paints a blocks shape only')
      else if (Array.isArray(sh.layers)) {
        const used = new Set((sh.layers as unknown[]).flat().filter((r): r is string => typeof r === 'string').flatMap((r) => [...r]).filter((c) => c !== '.' && c !== ' '))
        for (const k of keys) if (obj(k.colors)) for (const c of used) if (!(c in k.colors)) bad(`${at}.paint`, `the key has no color for ${show(c)}`)
      }
    }
    if (p.bone !== undefined) bone(p.bone, `${at}.bone`)
    for (const k of ['glow', 'noShadow', 'bare']) if (p[k] !== undefined && typeof p[k] !== 'boolean') bad(`${at}.${k}`, 'must be true or false')
    if (p.grime !== undefined) hex(p.grime, `${at}.grime`)
    if (p.glass !== undefined) {
      if (!obj(p.glass)) bad(`${at}.glass`, 'must be an object')
      else {
        opt(p.glass.see, `${at}.glass.see`, 0, 1); opt(p.glass.mirror, `${at}.glass.mirror`, 0, 1)
        if (p.glass.top !== undefined && typeof p.glass.top !== 'boolean') bad(`${at}.glass.top`, 'must be true or false')
      }
    }
    if (p.ink !== undefined) {
      if (!obj(p.ink)) bad(`${at}.ink`, 'must be an object')
      else {
        if (!(typeof p.ink.kind === 'string' && p.ink.kind in INK_MARKS)) bad(`${at}.ink.kind`, `must be one of ${Object.keys(INK_MARKS).map((k) => `'${k}'`).join(', ')}`)
        opt(p.ink.amount, `${at}.ink.amount`, 0, 1)
        if (p.ink.color !== undefined) hex(p.ink.color, `${at}.ink.color`)
      }
    }
  })

  if (shapes > MAX_SHAPES) bad('parts', `hold ${shapes} shapes between them; the most is ${MAX_SHAPES}`)
  if (surface > MAX_SURFACE) bad('parts', 'have too much surface between them to build quickly: make the scene smaller or use fewer big parts')

  const perBone = new Map<unknown, number>()
  if (doc.moves !== undefined) {
    if (!Array.isArray(doc.moves) || doc.moves.length > 200) bad('moves', 'must be a list of at most 200')
    else doc.moves.forEach((m: unknown, i: number) => {
      const at = `moves[${i}]`
      if (!obj(m)) { bad(at, 'must be an object'); return }
      bone(m.bone, `${at}.bone`)
      perBone.set(m.bone, (perBone.get(m.bone) ?? 0) + 1)
      if (perBone.get(m.bone) === MAX_MOVES_PER_BONE + 1) bad(`${at}.bone`, `${show(m.bone)} has more than ${MAX_MOVES_PER_BONE} moves`)
      whole(m.times, `${at}.times`)
      opt(m.phase, `${at}.phase`, -1, 1)
      switch (m.kind) {
        case 'spin': axis(m.axis, `${at}.axis`); break
        case 'sway': axis(m.axis, `${at}.axis`); num(m.degrees, `${at}.degrees`, -180, 180); break
        case 'bob': vec(m.by, `${at}.by`); break
        case 'drift':
          vec(m.by, `${at}.by`)
          if (m.grow !== undefined) vec(m.grow, `${at}.grow`, 0, 4, 2)
          if (typeof m.times === 'number' && m.times < 0) bad(`${at}.times`, 'must be over 0 for a drift')
          break
        case 'pulse': vec(m.size, `${at}.size`, 0, 4, 2); break
        default: bad(`${at}.kind`, `${show(m.kind)} is not a move (spin, sway, bob, drift, pulse)`)
      }
    })
  }
  if (doc.lights !== undefined) {
    if (!Array.isArray(doc.lights) || doc.lights.length > MAX_SCENE_LIGHTS) bad('lights', `must be a list of at most ${MAX_SCENE_LIGHTS}`)
    else doc.lights.forEach((l: unknown, i: number) => {
      const at = `lights[${i}]`
      if (!obj(l)) { bad(at, 'must be an object'); return }
      vec(l.at, `${at}.at`); hex(l.color, `${at}.color`); num(l.strength, `${at}.strength`, 0, 8); num(l.range, `${at}.range`, 0.05, REACH)
      if (l.flicker !== undefined) {
        if (!obj(l.flicker)) bad(`${at}.flicker`, 'must be an object')
        else { num(l.flicker.by, `${at}.flicker.by`, 0, 1); whole(l.flicker.times, `${at}.flicker.times`) }
      }
      if (l.shadows !== undefined && typeof l.shadows !== 'boolean') bad(`${at}.shadows`, 'must be true or false')
      if (l.circle !== undefined) {
        if (!obj(l.circle)) bad(`${at}.circle`, 'must be an object')
        else { num(l.circle.r, `${at}.circle.r`, 0, REACH); whole(l.circle.times, `${at}.circle.times`) }
      }
    })
  }
  if (doc.cover !== undefined) {
    const c = doc.cover
    if (!obj(c)) bad('cover', 'must be an object')
    else {
      if (!COVERS.includes(c.kind as string)) bad('cover.kind', `must be one of ${COVERS.map((k) => `'${k}'`).join(', ')}`)
      hex(c.color, 'cover.color')
      num(c.amount, 'cover.amount', 0, 1)
    }
  }
  if (doc.air !== undefined) {
    const air = doc.air
    const list = (v: unknown, at: string, max: number) => {
      if (v === undefined) return []
      if (!Array.isArray(v) || v.length > max) { bad(at, `must be a list of at most ${max}`); return [] }
      return v.map((x, i) => (obj(x) ? x : (bad(`${at}[${i}]`, 'must be an object'), undefined)))
    }
    if (!obj(air)) bad('air', 'must be an object')
    else {
      if (air.haze !== undefined) {
        if (!obj(air.haze)) bad('air.haze', 'must be an object')
        else { hex(air.haze.color, 'air.haze.color'); opt(air.haze.from, 'air.haze.from', -REACH, 2 * REACH); opt(air.haze.to, 'air.haze.to', -REACH, 4 * REACH) }
        if (obj(air.haze) && typeof air.haze.from === 'number' && typeof air.haze.to === 'number' && air.haze.to <= air.haze.from) bad('air.haze.to', 'must be past from')
      }
      list(air.mist, 'air.mist', 4).forEach((m, i) => {
        if (!m) return
        const at = `air.mist[${i}]`
        vec(m.at, `${at}.at`); vec(m.half, `${at}.half`, 0.05, 2.5); hex(m.color, `${at}.color`); opt(m.thick, `${at}.thick`, 0, 1)
      })
      list(air.shafts, 'air.shafts', 6).forEach((m, i) => {
        if (!m) return
        const at = `air.shafts[${i}]`
        vec(m.from, `${at}.from`); vec(m.to, `${at}.to`); num(m.r, `${at}.r`, 0.02, 1); hex(m.color, `${at}.color`); opt(m.strength, `${at}.strength`, 0, 1)
      })
      let specks = 0
      list(air.specks, 'air.specks', 8).forEach((m, i) => {
        if (!m) return
        const at = `air.specks[${i}]`
        if (!SPECK_KINDS.includes(m.kind as SpeckKind)) bad(`${at}.kind`, `${show(m.kind)} is not a kind of speck (${SPECK_KINDS.join(', ')})`)
        if (num(m.count, `${at}.count`, 1, MAX_SPECKS)) specks += m.count as number
        vec(m.from, `${at}.from`); vec(m.to, `${at}.to`)
        hexes(m.colors, `${at}.colors`, 1, 4)
        opt(m.size, `${at}.size`, 0.003, 0.1)
        if (m.glow !== undefined && typeof m.glow !== 'boolean') bad(`${at}.glow`, 'must be true or false')
      })
      if (specks > MAX_SPECKS) bad('air.specks', `hold ${specks} specks between them; the most is ${MAX_SPECKS}`)
    }
  }
  return errs
}

// --- Building

const TAU = Math.PI * 2
const rgb = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const unit = (h: string): Vec3 => { const c = rgb(h); return [c[0] / 255, c[1] / 255, c[2] / 255] }
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
/** A repeatable number in 0..1 for three whole numbers. */
const hash = (a: number, b: number, c: number) => { const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return v - Math.floor(v) }
/** A smooth wobble, about -1..1. */
const wobble = (x: number, y: number, z: number) => (Math.sin(x * 7.3 + z * 3.1 + y * 1.7) + Math.sin(z * 8.7 - x * 2.3 + y * 5.1) + Math.sin((x + z) * 13.1 + y * 9.7) * 0.5) / 2.5
const AXIS: Record<string, Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }
const IDX: Record<string, number> = { x: 0, y: 1, z: 2 }

/** A shape for the builder. Nothing is made thinner than `thin`, so it catches the grid at any detail. */
function toShape(s: ShapeDoc, thin: number): Shape {
  const t = (v: number) => Math.max(v, thin)
  switch (s.kind) {
    // a ball has to be a little fatter than a box to be sure of holding a grid point
    case 'sphere': return sphere(s.at, Math.max(s.r, thin * 1.2))
    case 'ball': return ellipsoid(s.at, [Math.max(s.r[0], thin * 1.2), Math.max(s.r[1], thin * 1.2), Math.max(s.r[2], thin * 1.2)])
    case 'box': return box(s.at, [t(s.half[0]), t(s.half[1]), t(s.half[2])], Math.min(s.round ?? 0, Math.min(...s.half) * 0.9))
    case 'cylinder': return cylinder([s.at[0], s.at[2]], s.at[1], s.at[1] + Math.max(s.height, thin * 2), t(s.r), t(s.rTop ?? s.r))
    case 'cone': return cone(s.from, s.to, t(s.r), Math.max(s.rTo ?? s.r, thin * 0.6))
    case 'ring': return torus(s.at, s.r, t(s.tube))
    case 'roof': return roof([s.at[0], s.at[2]], s.at[1], s.at[1] + Math.max(s.height, thin * 2), t(s.half[0]), t(s.half[1]))
    case 'join': {
      const all = s.shapes.map((k) => toShape(k, thin))
      return s.blend ? blend(s.blend, s.by ?? 0.05, all, s.steps) : union(...all)
    }
    case 'lathe': return lathe(s.at, s.profile.map(([r, h]) => [Math.max(r, thin), h] as [number, number]))
    case 'sweep': return sweep(s.path, t(s.r), Math.max(s.rTo ?? s.r, thin * 0.6))
    case 'text': return pixelText(s.at, s.text, Math.max(s.size, thin * 5), t(s.depth), s.facing)
    case 'blocks': return letterGrid(s.at, t(s.size), s.layers)
    case 'cut': return cut(toShape(s.shape, thin), toShape(s.hole, 0))
    case 'rough': {
      const k = 1 / (s.scale ?? 0.5)
      return displace(toShape(s.shape, thin), (x, y, z) => wobble(x * k, y * k, z * k) * s.by, s.by * 1.2)
    }
  }
}

type Paint = (p: Vec3, n: Vec3) => Vec3

function toPaint(p: PaintDoc, cell: number, letterAt?: (p: Vec3, n: Vec3) => string | undefined): Paint {
  if (typeof p === 'string') { const c = unit(p); return () => c }
  switch (p.kind) {
    case 'key': {
      const cs = new Map(Object.entries(p.colors).map(([k, c]) => [k, unit(c)])), none = cs.values().next().value as Vec3
      return (q, n) => cs.get(letterAt?.(q, n) ?? '') ?? none
    }
    case 'bands': {
      const cs = p.colors.map(unit), i = IDX[p.axis], size = Math.max(p.size, cell)
      return (q) => cs[((Math.floor(q[i] / size) % cs.length) + cs.length) % cs.length]
    }
    case 'bricks': {
      const cs = p.colors.map(unit), line = unit(p.line)
      const w = Math.max(p.size[0], cell * 2.5), h = Math.max(p.size[1], cell * 2.2)
      return (q, n) => {
        // along the wall: whichever of x and z the surface runs along (round a tower, the angle would be better, but this holds up)
        const u = Math.abs(n[0]) > Math.abs(n[2]) ? q[2] : q[0]
        const row = Math.floor(q[1] / h), fy = q[1] / h - row
        const along = u / w + (row & 1) * 0.5, col = Math.floor(along), fx = along - col
        if (fy < Math.min(0.4, cell / h) || fx < Math.min(0.3, (cell * 0.8) / w)) return line
        return cs[Math.floor(hash(row, col, 1) * cs.length)]
      }
    }
    case 'hex': {
      const cs = p.colors.map(unit), line = unit(p.line), deep = p.deep === undefined ? undefined : unit(p.deep)
      // wide enough that the line, the cell and its hollow each get a grid cell
      const w = Math.max(p.size, cell * (deep ? 5 : 3.5)), dy = w * 0.8660254
      const edge = 1 - Math.min(0.45, (cell * 1.1) / (w / 2))
      return (q, n) => {
        // on a floor the cells lie in x and z; on a wall, along the wall and up
        const flat = Math.abs(n[1]) > 0.6
        const u = flat ? q[0] : Math.abs(n[0]) > Math.abs(n[2]) ? q[2] : q[0], v = flat ? q[2] : q[1]
        let best = Infinity, col = 0, row = 0, du = 0, dv = 0
        const r0 = Math.round(v / dy)
        for (let r = r0 - 1; r <= r0 + 1; r++) {
          const shift = (r & 1) * 0.5, c = Math.round(u / w - shift)
          const x = u - (c + shift) * w, y = v - r * dy, d = x * x + y * y
          if (d < best) { best = d; col = c; row = r; du = Math.abs(x); dv = Math.abs(y) }
        }
        // 0 in the middle of the cell, 1 on its rim
        const m = Math.max(du, du * 0.5 + dv * 0.8660254) / (w / 2)
        if (m > edge) return line
        if (deep && m < 0.42) return deep
        return cs[Math.floor(hash(col, row, 2) ** 2 * cs.length)]
      }
    }
    case 'speckle': {
      const cs = p.colors.map(unit), size = Math.max(p.size, cell)
      // squared, so the first color is the commonest
      return (q) => cs[Math.floor(hash(Math.floor(q[0] / size), Math.floor(q[1] / size), Math.floor(q[2] / size)) ** 2 * cs.length)]
    }
    case 'patches': {
      const cs = p.colors.map(unit), k = 0.5 / Math.max(p.size, cell * 2)
      return (q) => cs[Math.min(cs.length - 1, Math.floor(((wobble(q[0] * k, q[1] * k, q[2] * k) + 1) / 2) * cs.length))]
    }
    case 'faces': {
      const side = toPaint(p.side, cell, letterAt), top = p.top === undefined ? side : toPaint(p.top, cell, letterAt), under = p.under === undefined ? side : toPaint(p.under, cell, letterAt)
      return (q, n) => (n[1] > 0.6 ? top : n[1] < -0.6 ? under : side)(q, n)
    }
    case 'split': {
      const below = toPaint(p.below, cell, letterAt), above = toPaint(p.above, cell, letterAt), i = IDX[p.axis]
      return (q, n) => (q[i] < p.at ? below : above)(q, n)
    }
  }
}

export interface CompiledScene {
  name: string
  loop: number
  orbit: Orbit
  /** Degrees the view rocks to either side, once a loop: 0 holds still. */
  swing: number
  /** The pixel look the scene asks for. */
  look: PixelLook
  palette: Rgb[]
  bones: Bone[]
  /** The shapes on a grid of `spacing`. */
  spec(spacing: number): VoxelSpec
  /** The parts (by their place in the list) that came out with no blobs at all, such as a shape whose hole swallows it: `checkScene` can't see those. */
  empty(built: { partOf: ArrayLike<number> }): number[]
  /** Poses the bones for `t` seconds. */
  pose(sk: Skeleton, t: number): void
  lights(t: number): PointLight[]
  /** Distance haze, if the scene asks for it: the color (linear) and where it starts and would be total, in units past the view's target. */
  haze?: { color: Vec3; from: number; to: number }
}

// --- What hangs in the air

/** How a speck moves, worked out once from the scene: where it starts, how far it travels and how fast, in whole times a loop. */
interface Speck {
  kind: SpeckKind
  bone: string
  /** Its bone's place in the skeleton, set once the bones are listed. */
  index: number
  at: Vec3
  travel: number
  /** Whole times a loop it repeats its path (falls, rises), wanders or blinks. */
  times: number
  wander: [number, number, number, number]
  phase: [number, number, number, number, number]
  shape: ShapeDoc
  color: string
  glow: boolean
}

const SPECK_SIZE: Record<SpeckKind, number> = { dust: 0.01, embers: 0.014, rain: 0.008, snow: 0.014, fireflies: 0.018, bubbles: 0.02 }
/** Seconds one fall or rise takes, about: the rest of a swarm's speed comes from that. */
const SPECK_SECONDS: Record<SpeckKind, number> = { dust: 6, embers: 2.2, rain: 0.55, snow: 7, fireflies: 3, bubbles: 3 }
const BANK_BONES = 3

function planSpecks(air: AirDoc | undefined, loop: number): Speck[] {
  const out: Speck[] = []
  ;(air?.specks ?? []).forEach((sw, si) => {
    const lo: Vec3 = [Math.min(sw.from[0], sw.to[0]), Math.min(sw.from[1], sw.to[1]), Math.min(sw.from[2], sw.to[2])]
    const hi: Vec3 = [Math.max(sw.from[0], sw.to[0]), Math.max(sw.from[1], sw.to[1]), Math.max(sw.from[2], sw.to[2])]
    const size = sw.size ?? SPECK_SIZE[sw.kind]
    const glow = sw.glow ?? (sw.kind === 'embers' || sw.kind === 'fireflies')
    for (let j = 0; j < sw.count; j++) {
      const r = (k: number) => hash(si + 1, j + 1, k)
      const across = (i: number, k: number) => lo[i] + (hi[i] - lo[i]) * r(k)
      const falls = sw.kind === 'rain' || sw.kind === 'snow', rises = sw.kind === 'embers' || sw.kind === 'bubbles'
      const at: Vec3 = [across(0, 1), falls ? hi[1] : rises ? lo[1] : across(1, 2), across(2, 3)]
      // a little quicker or slower each, so a swarm never moves in step
      const seconds = SPECK_SECONDS[sw.kind] * (0.7 + 0.6 * r(4))
      const times = Math.max(1, Math.round(loop / seconds))
      const wander: Speck['wander'] = [1 + Math.floor(r(5) * 2), 1 + Math.floor(r(6) * 2), 1 + Math.floor(r(7) * 2), Math.max(1, Math.round(loop / (2 + 3 * r(8))))]
      const shape: ShapeDoc = sw.kind === 'rain' ? { kind: 'ball', at, r: [size, 0.07, size] } : { kind: 'sphere', at, r: size }
      out.push({
        kind: sw.kind, bone: `~speck${out.length}`, index: -1, at, travel: hi[1] - lo[1], times, wander,
        phase: [r(9), r(10), r(11), r(12), r(13)], shape, color: sw.colors[Math.floor(r(14) * sw.colors.length)], glow,
      })
    }
  })
  return out
}

/** Poses one speck's bone for `u`, the share of the loop gone by. */
function poseSpeck(sk: Skeleton, p: Speck, u: number) {
  const b = p.index
  const wave = (k: number, ph: number) => Math.sin((u * k + ph) * TAU)
  const life = (((u * p.times + p.phase[0]) % 1) + 1) % 1
  let dx = 0, dy = 0, dz = 0, size = 1
  switch (p.kind) {
    case 'rain': dy = -p.travel * life; size = Math.sin(Math.PI * life) ** 0.25; break
    case 'snow':
      dy = -p.travel * life
      dx = 0.05 * wave(p.wander[0] * p.times, p.phase[1]); dz = 0.04 * wave(p.wander[2] * p.times, p.phase[3])
      size = Math.sin(Math.PI * life) ** 0.25
      break
    case 'embers':
      dy = p.travel * life
      dx = 0.05 * life * wave(p.wander[0] * p.times, p.phase[1]); dz = 0.05 * life * wave(p.wander[2] * p.times, p.phase[3])
      size = Math.sin(Math.PI * life) ** 0.6 * (1 - 0.6 * life)
      break
    case 'bubbles':
      dy = p.travel * life
      dx = 0.02 * wave(p.wander[0] * p.times * 2, p.phase[1])
      size = Math.sin(Math.PI * life) ** 0.25
      break
    case 'dust':
      dx = 0.06 * wave(p.wander[0], p.phase[1]); dy = 0.04 * wave(p.wander[1], p.phase[2]); dz = 0.06 * wave(p.wander[2], p.phase[3])
      size = 0.55 + 0.45 * wave(p.wander[3], p.phase[4])
      break
    case 'fireflies':
      dx = 0.15 * wave(p.wander[0], p.phase[1]); dy = 0.08 * wave(p.wander[1], p.phase[2]); dz = 0.15 * wave(p.wander[2], p.phase[3])
      // lit about half the time, coming and going softly
      size = Math.max(0, wave(p.wander[3], p.phase[4])) ** 0.4
      break
  }
  sk.offset[b * 3] += dx; sk.offset[b * 3 + 1] += dy; sk.offset[b * 3 + 2] += dz
  sk.size[b] *= size
}

/** Mist as loose blobs: faint, soft, and never part of a surface. */
function looseAir(air: AirDoc | undefined): LooseBlob[] {
  const out: LooseBlob[] = []
  ;(air?.mist ?? []).forEach((m, mi) => {
    const thick = m.thick ?? 0.5
    const r = Math.min(0.45, Math.max(0.15, Math.min(m.half[0], m.half[2]) * 0.5))
    const n = Math.min(160, Math.ceil(((4 * m.half[0] * m.half[2]) / (r * r)) * (0.8 + 1.2 * thick)))
    // spread evenly, on a jittered grid, so the bank has no thick clumps and thin gaps
    const across = Math.max(1, Math.round(Math.sqrt((n * m.half[0]) / m.half[2]))), deep = Math.max(1, Math.ceil(n / across))
    for (let j = 0; j < across * deep; j++) {
      const q = (k: number) => hash(mi + 50, j + 1, k) * 2 - 1
      const gx = ((j % across) + 0.5 + q(1) * 0.4) / across, gz = (Math.floor(j / across) + 0.5 + q(3) * 0.4) / deep
      out.push({
        center: [m.at[0] + (gx * 2 - 1) * m.half[0], m.at[1] + q(2) * m.half[1] * 0.6, m.at[2] + (gz * 2 - 1) * m.half[2]],
        // a flat cushion: wide, and as deep as the bank
        scale: [r * 0.6, Math.max(0.03, m.half[1] * 0.6), r * 0.6],
        color: unit(m.color), opacity: 0.025 + 0.05 * thick, bone: `~mist${mi}-${j % BANK_BONES}`,
      })
    }
  })
  return out
}

/** A sound description (see `checkScene`) made ready to build and play. Throws on an unsound one. */
export function compileScene(doc: SceneDoc): CompiledScene {
  const errs = checkScene(doc)
  if (errs.length) throw new Error(`Scene "${String((doc as { name?: unknown })?.name)}" has ${errs.length} mistake${errs.length > 1 ? 's' : ''}: ${errs.slice(0, 5).join('; ')}`)
  const bones: Bone[] = [{ name: 'land', parent: -1, head: [0, 0, 0] }]
  for (const b of doc.bones ?? []) bones.push({ name: b.name, parent: b.parent ? bones.findIndex((k) => k.name === b.parent) : 0, head: b.at })
  const palette = doc.palette.map(rgb)
  const moves = doc.moves ?? []
  const lights = doc.lights ?? []
  // what hangs in the air rides bones of its own, after the scene's: a bone for each speck, a few for each bank of mist
  const specks = planSpecks(doc.air, doc.loop)
  const banks = doc.air?.mist ?? []
  banks.forEach((m, mi) => { for (let k = 0; k < BANK_BONES; k++) bones.push({ name: `~mist${mi}-${k}`, parent: 0, head: m.at }) })
  for (const p of specks) { p.index = bones.length; bones.push({ name: p.bone, parent: 0, head: p.at }) }
  const bankBone = (mi: number, k: number) => bones.findIndex((b) => b.name === `~mist${mi}-${k}`)
  const bankBones = banks.map((_, mi) => Array.from({ length: BANK_BONES }, (_, k) => bankBone(mi, k)))
  const haze = doc.air?.haze

  return {
    name: doc.name,
    loop: doc.loop,
    orbit: { target: doc.camera.target, distance: doc.camera.distance, azimuth: doc.camera.azimuth, elevation: doc.camera.elevation },
    swing: doc.camera.swing ?? 0,
    palette,
    bones,
    look: {
      palette,
      dither: doc.look?.dither ?? 0.1,
      glow: doc.look?.glow ?? 1.5,
      outline: doc.look?.outline === false ? null : darkest(palette),
      edges: doc.look?.edges === false ? 0 : 1,
      sky: doc.sky ? [rgb(doc.sky[0]), rgb(doc.sky[1]), doc.skyReach ?? 1] : undefined,
    },
    spec(spacing) {
      const thin = spacing * 0.75
      const parts: VoxelPart[] = doc.parts.map((p) => {
        const shape = toShape(p.shape, thin)
        return {
        shape, color: toPaint(p.paint, spacing, 'letterAt' in shape ? (shape.letterAt as (p: Vec3, n: Vec3) => string | undefined) : undefined), bone: p.bone ?? 'land', glow: p.glow, noShadow: p.noShadow,
        grime: p.grime === undefined ? undefined : unit(p.grime), bare: p.bare,
        glass: p.glass,
        ink: p.ink && { kind: p.ink.kind, amount: p.ink.amount, color: p.ink.color === undefined ? undefined : unit(p.ink.color) },
        }
      })
      for (const p of specks) parts.push({ shape: toShape(p.shape, thin), color: unit(p.color), bone: p.bone, glow: p.glow, noShadow: true, bare: true })
      // only what the scene sets: a key left undefined would wipe the builder's default
      const light: VoxelSpec['light'] = { ...PAINTED }
      if (doc.light?.from) light.dir = doc.light.from
      for (const k of ['ambient', 'shadow', 'ramp', 'crevice', 'wear'] as const) if (doc.light?.[k] !== undefined) light[k] = doc.light[k]
      const beams = (doc.air?.shafts ?? []).map((b) => ({ from: b.from, to: b.to, r: b.r, color: unit(b.color), strength: b.strength ?? 0.6 }))
      // a lamp that stays put casts shadows baked once; byte k of each blob is light k
      const lamps = lights.slice(0, MAX_LAMPS).map((l) => (!l.shadows || l.circle ? null : { at: l.at, reach: l.range }))
      const cover = doc.cover && { kind: doc.cover.kind, color: unit(doc.cover.color), amount: doc.cover.amount }
      const { target: tg, distance: dist, azimuth: az, elevation: el } = doc.camera
      const ra = (az * Math.PI) / 180, re = (el * Math.PI) / 180
      const eye: Vec3 = [tg[0] + dist * Math.sin(ra) * Math.cos(re), tg[1] + dist * Math.sin(re), tg[2] + dist * Math.cos(ra) * Math.cos(re)]
      const sky: [Vec3, Vec3] | undefined = doc.sky ? [unit(doc.sky[0]), unit(doc.sky[1])] : doc.air?.haze ? [unit(doc.air.haze.color), unit(doc.air.haze.color)] : undefined
      return { bones, parts, spacing, light, loose: looseAir(doc.air), beams, lamps, cover, eye, sky, disc: doc.disc }
    },
    empty(built) {
      const seen = new Set<number>()
      for (let i = 0; i < built.partOf.length; i++) seen.add(built.partOf[i])
      return doc.parts.map((_, i) => i).filter((i) => !seen.has(i))
    },
    pose(sk, t) {
      sk.reset()
      const u = t / doc.loop
      for (const m of moves) {
        const b = sk.index(m.bone), at = u * m.times + (m.phase ?? 0)
        if (m.kind === 'spin' || m.kind === 'sway') {
          const turn = axisAngle(AXIS[m.axis], m.kind === 'spin' ? at * TAU : Math.sin(at * TAU) * m.degrees * (Math.PI / 180))
          // moves on one bone add up, in the order they are written
          sk.setRotation(b, mulQ(sk.rotation.subarray(b * 4, b * 4 + 4), turn))
        } else if (m.kind === 'bob') {
          const k = Math.sin(at * TAU)
          for (let i = 0; i < 3; i++) sk.offset[b * 3 + i] += m.by[i] * k
        } else if (m.kind === 'drift') {
          const life = ((at % 1) + 1) % 1, [g0, g1] = m.grow ?? [1, 1]
          for (let i = 0; i < 3; i++) sk.offset[b * 3 + i] += m.by[i] * life
          sk.size[b] *= Math.sin(Math.PI * life) ** 0.6 * (g0 + (g1 - g0) * life)
        } else {
          sk.size[b] *= m.size[0] + (m.size[1] - m.size[0]) * (0.5 + 0.5 * Math.sin(at * TAU))
        }
      }
      // mist drifts slowly to and fro, a third of a bank out of step with the next
      banks.forEach((m, mi) => {
        for (let k = 0; k < BANK_BONES; k++) {
          const b = bankBones[mi][k], w = Math.sin((u + k / BANK_BONES) * TAU)
          sk.offset[b * 3] += m.half[0] * 0.25 * w
          sk.offset[b * 3 + 2] += m.half[2] * 0.15 * Math.cos((u + k / BANK_BONES) * TAU)
        }
      })
      for (const p of specks) poseSpeck(sk, p, u)
      sk.update()
    },
    haze: haze ? { color: unit(haze.color).map(linear) as Vec3, from: haze.from ?? 0, to: haze.to ?? 4 } : undefined,
    lights(t) {
      const u = t / doc.loop
      return lights.map((l) => {
        const c = unit(l.color)
        // two flickers out of step, so it doesn't beat like a clock, but still loops
        const k = l.strength * (l.flicker ? 1 + l.flicker.by * (0.6 * Math.sin(u * l.flicker.times * TAU) + 0.4 * Math.sin(u * l.flicker.times * 3 * TAU + 1.3)) : 1)
        const a = l.circle ? u * l.circle.times * TAU : 0, r = l.circle?.r ?? 0
        return { position: [l.at[0] + Math.cos(a) * r, l.at[1], l.at[2] - Math.sin(a) * r], color: [linear(c[0]) * k, linear(c[1]) * k, linear(c[2]) * k], range: l.range }
      })
    },
  }
}
