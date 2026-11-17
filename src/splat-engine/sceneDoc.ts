import type { Vec3 } from '../splat-core/blobs.ts'
import type { Orbit } from '../splat-core/orbit.ts'
import { MAX_PALETTE_SIZE, darkest, type PixelLook, type Rgb } from '../splat-core/pixel.ts'
import type { PointLight } from './engine.ts'
import { axisAngle, mulQ, type Bone, type Skeleton } from './rig.ts'
import { INK_MARKS, LETTERS, MAX_LAMPS, PAINTED, blend, box, many, lathe, letterGrid, pixelText, sweep, cone, cut, cylinder, displace, ellipsoid, roof, sphere, torus, union, type LooseBlob, type Shape, type VoxelPart, type VoxelSpec } from './voxel.ts'
import { PUFFS } from './poke.ts'
import { GROW_STYLES, grow, growBounds, type GrowStyle } from './grow.ts'
import { ARCHES, arcade, fence, steps, wall } from './built.ts'
import { antler, brackets, brain, cactus, horn, ribs, rosette, shell, tree } from './life.ts'
import { MAX_DROPS, arch, butte, hoodoo, land, mud, pebbles } from './erode.ts'
import { RISES, cluster, columns, crystal, drips, flowstone, geode, icicles } from './forms.ts'
import { drift, fallAt, fallShare, frost, groundUnder, type Falling } from './weather.ts'

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
  /** The scene's name. */
  name: string
  /** Seconds before everything repeats: 4 to 60. */
  loop: number
  /**
   * The baked sun: `from` points toward it. `ramp` (0–1, 0.7 when left out) turns shade toward cool violet and full
   * sun toward warm yellow, as a painter's ramp does; `crevice` (0.5) darkens corners and cracks; `wear` (0.5)
   * lightens sharp outer edges. 0 turns any of them off. `bounce` (off unless set) lets surfaces throw their color onto
   * what faces them, as a red wall warms the floor beside it; it costs build time, so use it where it shows.
   */
  light?: { from?: Vec3; ambient?: number; shadow?: number; ramp?: number; crevice?: number; wear?: number; bounce?: number }
  /** The colors the picture is drawn in, 2 to 32. */
  palette: string[]
  /** The sky behind, top and bottom. Left out, the background is clear. */
  sky?: [string, string]
  /** How far down the picture the sky's blend runs before it is all the bottom color: 0.05 to 1, the whole way when left out. */
  skyReach?: number
  /** The pixel look it asks for: how much dither and glow, and whether to draw an outline and edge lines. */
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
  /** Everything in the scene, each a shape with its paint. */
  parts: PartDoc[]
  /** What moves, each a whole number of times a loop. */
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
  /** Where the eye goes: within `r` of `at` the scene is cut at full detail, further out on a grid twice as coarse, in about a quarter of the blobs. */
  focus?: { at: Vec3; r: number }
}

/** A scene's air: haze, mist, shafts of light and specks. */
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

/** One bank of mist. */
export interface MistDoc {
  /** The middle of the bank. */
  at: Vec3
  /** Half its size along x, y (its depth) and z. */
  half: Vec3
  /** Its color. */
  color: string
  /** How thick it is, 0 to 1 (0.5 when left out). */
  thick?: number
}

/** One beam of light. */
export interface ShaftDoc {
  /** Where it starts (a window, a crack, a lamp) and where it lands. */
  from: Vec3
  /** Where it lands. */
  to: Vec3
  /** How wide it is, as a radius. */
  r: number
  /** Its color. */
  color: string
  /** How bright, 0 to 1 (0.6 when left out). */
  strength?: number
}

/**
 * What a swarm does: `dust` hangs and twinkles, `embers` rise and fade, `rain` falls fast as streaks, `snow` falls
 * slowly and sways, `leaves` flutter down, `fireflies` wander and blink, `bubbles` rise and wobble.
 */
export type SpeckKind = 'dust' | 'embers' | 'rain' | 'snow' | 'leaves' | 'fireflies' | 'bubbles'

/** One swarm of specks: dust, embers, rain, snow, leaves, fireflies or bubbles. */
export interface SpeckDoc {
  /** What they are, which sets how they move. */
  kind: SpeckKind
  /** How many. */
  count: number
  /** Two opposite corners of the box they live in: rain and snow fall from its top to its bottom, embers and bubbles rise from its bottom to its top. */
  from: Vec3
  /** The box's opposite corner. */
  to: Vec3
  /** Each speck takes one of these. */
  colors: string[]
  /** A speck's radius; left out, a size that suits the kind. */
  size?: number
  /** Whether they give off light; left out, embers and fireflies do. */
  glow?: boolean
  /** Rain, snow and leaves only: each lands on whatever stands still under it (or the box's floor), lies a while and goes, then falls again. */
  land?: boolean
  /** Rain, snow and leaves only: how far the wind carries each sideways over its whole fall, [x, z]; rain slants along it. */
  wind?: [number, number]
}

/** One bone of a scene: something for parts to ride on and moves to turn. */
export interface BoneDoc {
  /** What parts and moves call it. */
  name: string
  /** The point it turns and grows about. */
  at: Vec3
  /** Another bone it rides on (named earlier in the list). */
  parent?: string
}

/** One part of a scene: a shape, its paint and the bone that carries it. */
export interface PartDoc {
  /** Its shape. */
  shape: ShapeDoc
  /** Its paint. */
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
  /** Dabs that follow the form: 0 to 1, how far each cell is drawn as a stroke along the level line round the shape. Shows as brushwork in the Blobs view. */
  strokes?: number
}

/**
 * A shape, written as data: `kind` says which. The guide, docs/scene-descriptions.md in the repository, goes through
 * them all.
 */
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
  /**
   * Grown by a branching rule from `seed` (the same seed, the same plant): a 'tree', a 'coral' or a cluster of
   * 'crystal' spikes standing on `at`, its trunk `size` long and `r` thick at the foot. `depth` and `branches` change
   * the rule's splits. `tips` puts a ball that size at every branch's end (leaves, polyps); `only` keeps just the
   * 'twigs' or just the 'tips', so two parts can paint them apart from one grower.
   */
  | { kind: 'grow'; style: GrowStyle; at: Vec3; seed: number; size: number; r: number; depth?: number; branches?: number; tips?: number; only?: 'twigs' | 'tips' }
  /**
   * A wall of bricks in courses from `from` to `to` (feet on the ground, any direction), each brick a little proud,
   * sunk or off size (`jitter`, 0 to 1), with sunk mortar between. `brick` is [length, course height] (0.16 by 0.08
   * when left out), fitted so whole bricks fill it. `ruin` (0 to 1) breaks the top down in a ragged line, `missing`
   * (0 to 0.5) takes bricks out of the face, `fallen` lays that many at its foot. Paint it with `pieces`.
   */
  | { kind: 'wall'; from: Vec3; to: Vec3; height: number; thick: number; brick?: [number, number]; jitter?: number; ruin?: number; missing?: number; fallen?: number; seed: number }
  /** A flight of `count` stone steps climbing along `dir` ([x, z]) from `at`, the bottom step's front middle: each block its own, `wear` (0 to 1) rounding the noses and hollowing the treads. */
  | { kind: 'steps'; at: Vec3; dir: [number, number]; count: number; rise: number; run: number; width: number; wear?: number; seed: number }
  /**
   * Posts and rails along `path` (on the ground, 2 to 16 points), each straight run cut into whole bays about `bay`
   * long, so a post stands at every corner. `post` is half a post's thickness, `rails` 1 to 4; `lean`, `missing`
   * (rails gone or hanging from one end) and `sag`, 0 to 1, wear it down.
   */
  | { kind: 'fence'; path: Vec3[]; bay: number; height: number; post: number; rails: number; lean?: number; missing?: number; sag?: number; seed: number }
  /** A wall from `from` to `to` cut into `bays` equal bays, an opening in each with a `pillar` between: 'round', 'pointed' or 'flat' heads springing at `spring`. Stones in courses `course` high and wedges round each arch, for `pieces`. `ruin` (0 to 1, with a `seed`) breaks its top down, never below the arches. */
  | { kind: 'arcade'; from: Vec3; to: Vec3; height: number; thick: number; bays: number; pillar: number; spring?: number; arch?: 'round' | 'pointed' | 'flat'; course?: number; ruin?: number; seed?: number }
  /** A crystal with `sides` (3 to 8, 6) and a pointed end (`tip`, the share of its length, 0.3), growing from `at` along `dir`; `chips` (0 to 6) knocks pieces off its faces. */
  | { kind: 'crystal'; at: Vec3; dir: Vec3; length: number; r: number; sides?: number; tip?: number; chips?: number; seed: number }
  /** A cluster of `count` crystals from one root at `at`: the middle one `size` long and upright, the rest leaning out up to `spread` degrees (50), shorter the further they lean. */
  | { kind: 'crystals'; at: Vec3; count: number; size: number; r: number; spread?: number; sides?: number; chips?: number; seed: number }
  /** A geode broken open, its cut face looking along `open`: a rind (`rind`, a share of `r`, 0.15), `bands` layers (3), a hollow lined with crystals `lining` long (a share of `r`, 0.22). Paint `pieces` with `ordered`: the rind takes the first color, the bands the next two by turns, the crystals `line`. */
  | { kind: 'geode'; at: Vec3; r: number; open: Vec3; rind?: number; bands?: number; lining?: number; seed: number }
  /** Basalt columns on a hex grid round `at`, `r` across, each `cell` wide, the tallest `height`: `rise` 'steps' (a causeway, the default), 'dome' (organ pipes) or 'random'. */
  | { kind: 'columns'; at: Vec3; r: number; cell: number; height: number; rise?: 'dome' | 'steps' | 'random'; seed: number }
  /** `count` stalactites hanging from a roof at height `roof`, the longest `length`, spread `r` round `at` on the floor, with stalagmites where their drips land, joined into columns where they meet. */
  | { kind: 'drips'; at: Vec3; r: number; roof: number; count: number; length: number; seed: number }
  /** Flowstone down a wall: a curtain of stone `width` wide and `drop` deep in `folds` folds (5), hanging from `at` along `along` ([x, z]); its face looks out to the right of `along`. */
  | { kind: 'flowstone'; at: Vec3; along: [number, number]; width: number; drop: number; folds?: number; seed: number }
  /** Icicles under every downward edge of the shape `on` (which is only looked at: give it a part of its own), about `every` apart, the longest `length`; only from edges higher than `above`, if given (not where it rests on the ground). */
  | { kind: 'icicles'; on: ShapeDoc; every: number; length: number; above?: number; seed: number }
  /**
   * A tree grown by space colonization: its trunk rises `height` from `at`, then branches grow to fill a crown with
   * radii `crown`, each limb as thick as what it carries (the trunk `r` at its foot). `points` (160, up to 400) makes
   * it finer, `leaves` puts a ball that size at every twig's end, and `only` ('limbs' or 'leaves') keeps one of them.
   */
  | { kind: 'tree'; at: Vec3; height: number; crown: Vec3; r: number; points?: number; leaves?: number; only?: 'limbs' | 'leaves'; seed: number }
  /** A ribbed cactus `height` tall and `r` thick with `ribs` (8) and `arms` (0 to 4, 2) that bend up. */
  | { kind: 'cactus'; at: Vec3; height: number; r: number; ribs?: number; arms?: number; seed: number }
  /** A succulent: `leaves` (3 to 60) thick pointed leaves set round a spiral, reaching `r`, the inner ones short and upright. */
  | { kind: 'rosette'; at: Vec3; r: number; leaves: number; seed: number }
  /** Bracket fungi: `count` half-round shelves `r` wide stacked up a trunk from `at`, facing out along `facing` ([x, z]). */
  | { kind: 'brackets'; at: Vec3; facing: [number, number]; r: number; count: number; seed: number }
  /** Brain coral: a dome `r` across worn into meandering grooves `groove` wide. */
  | { kind: 'brain'; at: Vec3; r: number; groove?: number; seed: number }
  /** A shell wound on a log spiral, about `size` across: `turns` whorls (3), `spire` 0 (a flat nautilus coil) to 1 (a tall whelk), turned `facing` degrees. Each stretch of its tube is a piece. */
  | { kind: 'shell'; at: Vec3; size: number; turns?: number; spire?: number; facing?: number }
  /** A horn from `at` along `dir`, `length` long and `r` thick at the root: `curl` turns (0.5; 1 is a ram's full curl) down and back, `twist` winding it sideways, `ridges` rings (12). */
  | { kind: 'horn'; at: Vec3; dir: Vec3; length: number; r: number; curl?: number; twist?: number; ridges?: number }
  /** An antler: a main beam from `at` along `dir` that sweeps up and round, with `tines` (1 to 8) rising off it. */
  | { kind: 'antler'; at: Vec3; dir: Vec3; length: number; r: number; tines: number; seed: number }
  /** A spine from `from` to `to` with `count` pairs of ribs curving out `span` and down `drop`, widest in the middle, `r` thick. */
  | { kind: 'ribs'; from: Vec3; to: Vec3; count: number; span: number; drop: number; r: number }
  /**
   * Land worn by water: hills (`peaks`, each [x, z], a height and a reach) and `noise` on a block `half` across, `base`
   * deep (0.2), then worn by `drops` water drops (up to 30000) that carve gullies and drop what they carry in fans, and
   * slumped (`slump`, 0 to 1) to scree. `beds` lays it in rock beds from its foot up, soft ones wearing faster.
   * Pieces: each bed (for `pieces` with `ordered`), and -1 (`line`) where something was laid down.
   */
  | { kind: 'land'; at: Vec3; half: [number, number]; base?: number; peaks: { at: [number, number]; h: number; r: number }[]; noise?: number; drops?: number; slump?: number; beds?: { thick: number; hard: number }[]; seed: number }
  /** A butte or mesa: rock in `beds` turned about the upright, each soft bed worn back by `wear` (0.3) so hard beds stand out as ledges; `cap` makes a caprock that much wider, overhanging. Each bed is a piece. */
  | { kind: 'butte'; at: Vec3; r: number; height: number; beds?: { thick: number; hard: number }[]; wear?: number; cap?: number; seed: number }
  /** A hoodoo: a thin pillar of soft rock, waisted where it is softest, under a hard cap. */
  | { kind: 'hoodoo'; at: Vec3; height: number; r: number; seed: number }
  /** A natural arch: a fin of rock in `beds` from `from` to `to` (its feet), `height` tall and `thick`, with a hole worn through its soft bed at `soft` of its height (0.4). */
  | { kind: 'arch'; from: Vec3; to: Vec3; height: number; thick: number; soft?: number; beds?: { thick: number; hard: number }[]; seed: number }
  /** Dried mud, `r` round `at`, cracked into plates about `plate` wide whose edges `curl` up (0 to 1, 0.5). Each plate is a piece and the cracks are `line`. */
  | { kind: 'mud'; at: Vec3; r: number; plate: number; curl?: number; seed: number }
  /** `count` pebbles (up to 200) along a stream's `path`, `width` wide: the biggest, `size`, mid-stream where it runs fastest. Each is a piece. */
  | { kind: 'pebbles'; path: Vec3[]; width: number; count: number; size: number; seed: number }
  /**
   * Snow lying in drifts over everything in the parts before it, `half` wide round `at`: `depth` on open level ground,
   * piled up to `pile` (3 × depth) downwind of whatever stands in the `wind` ([x, z]), as far as `reach` (4) times its
   * height, scoured thin where the wind meets it, and thin along a trodden `path` (`pathWidth` wide). A part's own shape only.
   */
  | { kind: 'drift'; at: Vec3; half: [number, number]; depth: number; wind: [number, number]; pile?: number; reach?: number; path?: Vec3[]; pathWidth?: number; seed: number }
  /**
   * A frost fern on a surface facing `facing`, spreading `r` from `at` in `arms` (5) main branches, each throwing side
   * branches. `stage` [from, to] shows only that share of its growth: give each share a part on a bone that sprouts in
   * turn and it grows a branch at a time. Pieces are the generations, 0 the main branches.
   */
  | { kind: 'frost'; at: Vec3; facing: Vec3; r: number; arms?: number; stage?: [number, number]; seed: number }
  /** The first shape with the second cut out of it. */
  | { kind: 'cut'; shape: ShapeDoc; hole: ShapeDoc }
  /** A lumpy version: `by` is how far the surface moves, `scale` how big the lumps are. */
  | { kind: 'rough'; shape: ShapeDoc; by: number; scale?: number }

/** A part's paint: one color, or a pattern of several. */
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
  /** For a shape made of pieces (wall, steps, fence, arcade and the rest): each brick, block, post or stone takes one of `colors` (earlier ones commoner), and what lies between them `line`. `ordered` takes the colors in turn by the piece's number instead (a geode's rind and bands). */
  | { kind: 'pieces'; colors: string[]; line?: string; ordered?: boolean }

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
  /** Grows from nothing as you watch, stands, and shrinks away again before it starts over, `times` per loop: crystals, icicles, a sprout. */
  | { kind: 'sprout'; bone: string; times: number; phase?: number }

/** A point light in a scene. */
export interface LightDoc {
  /** Where it is. */
  at: Vec3
  /** Its color. */
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
const SPECK_KINDS: SpeckKind[] = ['dust', 'embers', 'rain', 'snow', 'leaves', 'fireflies', 'bubbles']
/** A value for a message: only what is safe to print (anything can arrive from a prompt). */
const COVERS = ['snow', 'moss', 'dust']
const SHAPE_KINDS = ['sphere', 'ball', 'box', 'cylinder', 'cone', 'ring', 'roof', 'join', 'lathe', 'sweep', 'grow', 'text', 'blocks', 'wall', 'steps', 'fence', 'arcade', 'crystal', 'crystals', 'geode', 'columns', 'drips', 'flowstone', 'icicles', 'tree', 'cactus', 'rosette', 'brackets', 'brain', 'shell', 'horn', 'antler', 'ribs', 'land', 'butte', 'hoodoo', 'arch', 'mud', 'pebbles', 'drift', 'frost', 'cut', 'rough']
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
    case 'grow': { const h = growBounds(s).half, k = s.only === 'twigs' ? 0 : s.tips ?? 0; return [h[0] + k, h[1] + k, h[2] + k] }
    case 'wall': case 'arcade': {
      const r = s.kind === 'wall' ? (s.fallen ? s.thick / 2 + 0.2 + s.height * 0.35 : s.thick / 2) : s.thick / 2
      return [Math.abs(s.to[0] - s.from[0]) / 2 + r, s.height / 2, Math.abs(s.to[2] - s.from[2]) / 2 + r]
    }
    case 'steps': {
      const l = Math.hypot(s.dir[0], s.dir[1]) || 1, run = s.run * s.count
      return [Math.abs((s.dir[0] / l) * run) / 2 + s.width / 2, (s.rise * s.count) / 2, Math.abs((s.dir[1] / l) * run) / 2 + s.width / 2]
    }
    case 'fence': return [0, 1, 2].map((i) => (i === 1 ? s.height / 2 : (Math.max(...s.path.map((q) => q[i])) - Math.min(...s.path.map((q) => q[i]))) / 2 + s.post + s.height * 0.15)) as Vec3
    case 'crystal': { const e = [0, 1, 2].map((i) => Math.abs(s.dir[i]) / (Math.hypot(...s.dir) || 1) * s.length / 2 + s.r); return e as Vec3 }
    case 'crystals': return [s.size * 0.8 + s.r, s.size / 2 + s.r, s.size * 0.8 + s.r]
    case 'geode': return [s.r, s.r, s.r]
    case 'columns': return [s.r + s.cell, s.height / 2, s.r + s.cell]
    case 'drips': return [s.r, Math.abs(s.roof - s.at[1]) / 2, s.r]
    case 'flowstone': return [s.width / 2 + s.drop * 0.25, s.drop / 2, s.width / 2 + s.drop * 0.25]
    // only the icicles are drawn, under the host's edges: about a third of its box, as deep as they hang
    case 'icicles': { const h = halfSize(s.on); return [h[0] / 2, s.length / 2, h[2] / 2] }
    case 'tree': return [s.crown[0] + s.r, (s.height + s.crown[1] * 1.8) / 2, s.crown[2] + s.r]
    case 'cactus': return [s.r * 3, s.height / 2, s.r * 3]
    case 'rosette': return [s.r, s.r / 2, s.r]
    case 'brackets': return [s.r, (s.count * s.r * 0.55) / 2, s.r]
    case 'brain': return [s.r, s.r / 2, s.r]
    case 'shell': return [s.size / 2, s.size / 2 + (s.spire ?? 0) * s.size * 0.6, s.size / 2]
    case 'horn': case 'antler': return [s.length / 2, s.length / 2, s.length / 2]
    case 'ribs': { const l = Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1], s.to[2] - s.from[2]); return [l / 2 + s.span, s.drop / 2, l / 2 + s.span] }
    case 'land': return [s.half[0], (Math.max(0, ...s.peaks.map((k) => k.h)) + (s.noise ?? 0) + (s.base ?? 0.2)) / 2, s.half[1]]
    case 'butte': return [s.r * (1.3 + (s.cap ?? 0)), s.height / 2, s.r * (1.3 + (s.cap ?? 0))]
    case 'hoodoo': return [s.r * 1.6, s.height / 2, s.r * 1.6]
    case 'arch': { const l = Math.hypot(s.to[0] - s.from[0], s.to[2] - s.from[2]); return [l / 2 + s.thick, s.height / 2, l / 2 + s.thick] }
    case 'mud': return [s.r, s.plate * 0.1, s.r]
    case 'pebbles': return [0, 1, 2].map((i) => (i === 1 ? s.size / 2 : (Math.max(...s.path.map((q) => q[i])) - Math.min(...s.path.map((q) => q[i]))) / 2 + s.width / 2)) as Vec3
    case 'drift': return [s.half[0], (s.pile ?? s.depth * 3) / 2 + s.depth, s.half[1]]
    case 'frost': return [s.r, s.r, s.r]
    case 'cut': case 'rough': return halfSize(s.shape)
  }
}

/** The shapes the `pieces` paint can paint, as they are or cut and roughened. */
const PIECED = ['wall', 'steps', 'fence', 'arcade', 'crystals', 'geode', 'columns', 'drips', 'icicles', 'shell', 'land', 'butte', 'hoodoo', 'arch', 'mud', 'pebbles', 'frost']
const hasPieces = (s: unknown): boolean => {
  if (typeof s !== 'object' || s === null) return false
  const q = s as Record<string, unknown>
  if (PIECED.includes(q.kind as string)) return true
  if (q.kind === 'cut' || q.kind === 'rough') return hasPieces(q.shape)
  if (q.kind === 'join' && Array.isArray(q.shapes)) return q.shapes.some(hasPieces)
  return false
}
const piecesIn = (p: unknown): boolean => {
  if (typeof p !== 'object' || p === null) return false
  const q = p as Record<string, unknown>
  if (q.kind === 'pieces') return true
  return [q.top, q.side, q.under, q.below, q.above].some(piecesIn)
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
  /** Each point of a path a little way from the one before, along the ground: a repeated point makes a piece with no length. */
  const apart = (path: unknown[], at: string) => {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i]
      if (Array.isArray(a) && Array.isArray(b) && Math.hypot(Number(b[0]) - Number(a[0]), Number(b[2]) - Number(a[2])) < 0.01) bad(`${at}[${i}]`, 'must be apart from the point before it along the ground')
    }
  }
  const count = (v: unknown, at: string, min: number, max: number, optional = false) => { if (optional && v === undefined) return; if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) bad(at, `must be a whole number from ${min} to ${max}`) }
  const sides = (v: unknown, at: string) => count(v, at, 3, 8, true)
  const beds = (v: unknown, at: string) => {
    if (v === undefined) return
    if (!Array.isArray(v) || !v.length || v.length > 12) { bad(at, 'must be a list of 1 to 12 beds'); return }
    v.forEach((b, i) => { if (!obj(b)) bad(`${at}[${i}]`, 'must be an object'); else { num(b.thick, `${at}[${i}].thick`, 0.01, 2); num(b.hard, `${at}[${i}].hard`, 0, 1) } })
  }
  const seed = (v: unknown, at: string) => { if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) bad(at, 'must be a whole number, 0 or more') }
  const whole = (v: unknown, at: string) => { if (typeof v !== 'number' || !Number.isInteger(v) || v === 0 || Math.abs(v) > 60) bad(at, 'must be a whole number of times per loop (not 0), so the scene loops') }

  if (!obj(doc)) return ['scene: must be an object']
  if (typeof doc.name !== 'string' || !doc.name.trim() || doc.name.length > 60) bad('name', 'must be a short name')
  num(doc.loop, 'loop', 4, 60)
  if (doc.light !== undefined) {
    if (!obj(doc.light)) bad('light', 'must be an object')
    else {
      if (doc.light.from !== undefined && vec(doc.light.from, 'light.from', -1, 1) && Math.hypot(...(doc.light.from as Vec3)) < 0.1) bad('light.from', 'must point somewhere')
      for (const k of ['ambient', 'shadow', 'ramp', 'crevice', 'wear', 'bounce']) opt(doc.light[k], `light.${k}`, 0, 1)
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
      case 'grow':
        if (!GROW_STYLES.includes(s.style as GrowStyle)) bad(`${at}.style`, `${show(s.style)} is not a style (${GROW_STYLES.join(', ')})`)
        vec(s.at, `${at}.at`); num(s.size, `${at}.size`, 0.02, REACH); num(s.r, `${at}.r`, 0.002, REACH)
        if (typeof s.seed !== 'number' || !Number.isInteger(s.seed) || s.seed < 0) bad(`${at}.seed`, 'must be a whole number, 0 or more')
        if (s.depth !== undefined && (typeof s.depth !== 'number' || !Number.isInteger(s.depth) || s.depth < 1 || s.depth > 6)) bad(`${at}.depth`, 'must be a whole number from 1 to 6')
        if (s.branches !== undefined && (typeof s.branches !== 'number' || !Number.isInteger(s.branches) || s.branches < 1 || s.branches > 9)) bad(`${at}.branches`, 'must be a whole number from 1 to 9')
        opt(s.tips, `${at}.tips`, 0, REACH)
        if (s.only !== undefined && s.only !== 'twigs' && s.only !== 'tips') bad(`${at}.only`, "must be 'twigs' or 'tips'")
        if (s.only === 'tips' && !s.tips) bad(`${at}.tips`, "is needed when only is 'tips'")
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
      case 'wall':
        vec(s.from, `${at}.from`); vec(s.to, `${at}.to`); num(s.height, `${at}.height`, 0.02, REACH); num(s.thick, `${at}.thick`, 0.01, 1)
        if (s.brick !== undefined) vec(s.brick, `${at}.brick`, 0.02, 1, 2)
        opt(s.jitter, `${at}.jitter`, 0, 1); opt(s.ruin, `${at}.ruin`, 0, 1); opt(s.missing, `${at}.missing`, 0, 0.5)
        if (s.fallen !== undefined && (typeof s.fallen !== 'number' || !Number.isInteger(s.fallen) || s.fallen < 0 || s.fallen > 60)) bad(`${at}.fallen`, 'must be a whole number from 0 to 60')
        seed(s.seed, `${at}.seed`)
        if (Array.isArray(s.from) && Array.isArray(s.to) && Math.hypot((s.to[0] as number) - (s.from[0] as number), (s.to[2] as number) - (s.from[2] as number)) < 0.05) bad(`${at}.to`, 'must be apart from from along the ground')
        break
      case 'steps':
        vec(s.at, `${at}.at`); vec(s.dir, `${at}.dir`, -1, 1, 2)
        if (Array.isArray(s.dir) && Math.hypot(Number(s.dir[0]) || 0, Number(s.dir[1]) || 0) < 0.1) bad(`${at}.dir`, 'must point somewhere along the ground')
        if (typeof s.count !== 'number' || !Number.isInteger(s.count) || s.count < 1 || s.count > 24) bad(`${at}.count`, 'must be a whole number from 1 to 24')
        num(s.rise, `${at}.rise`, 0.01, 1); num(s.run, `${at}.run`, 0.01, 1); num(s.width, `${at}.width`, 0.02, REACH); opt(s.wear, `${at}.wear`, 0, 1)
        seed(s.seed, `${at}.seed`)
        break
      case 'fence':
        if (!Array.isArray(s.path) || s.path.length < 2 || s.path.length > 16) bad(`${at}.path`, 'must be a list of 2 to 16 points')
        else { s.path.forEach((q: unknown, i: number) => vec(q, `${at}.path[${i}]`)); apart(s.path, `${at}.path`) }
        num(s.bay, `${at}.bay`, 0.05, REACH); num(s.height, `${at}.height`, 0.02, 2); num(s.post, `${at}.post`, 0.003, 0.2)
        if (typeof s.rails !== 'number' || !Number.isInteger(s.rails) || s.rails < 1 || s.rails > 4) bad(`${at}.rails`, 'must be a whole number from 1 to 4')
        opt(s.lean, `${at}.lean`, 0, 1); opt(s.missing, `${at}.missing`, 0, 1); opt(s.sag, `${at}.sag`, 0, 1)
        seed(s.seed, `${at}.seed`)
        break
      case 'arcade':
        vec(s.from, `${at}.from`); vec(s.to, `${at}.to`); num(s.height, `${at}.height`, 0.05, REACH); num(s.thick, `${at}.thick`, 0.01, 1)
        if (typeof s.bays !== 'number' || !Number.isInteger(s.bays) || s.bays < 1 || s.bays > 16) bad(`${at}.bays`, 'must be a whole number from 1 to 16')
        num(s.pillar, `${at}.pillar`, 0.01, REACH); opt(s.spring, `${at}.spring`, 0, REACH); opt(s.course, `${at}.course`, 0.01, 1); opt(s.ruin, `${at}.ruin`, 0, 1)
        if (s.seed !== undefined) seed(s.seed, `${at}.seed`)
        if (s.arch !== undefined && !ARCHES.includes(s.arch as never)) bad(`${at}.arch`, `must be one of ${ARCHES.map((k) => `'${k}'`).join(', ')}`)
        if (Array.isArray(s.from) && Array.isArray(s.to) && typeof s.bays === 'number' && typeof s.pillar === 'number' && Math.hypot((s.to[0] as number) - (s.from[0] as number), (s.to[2] as number) - (s.from[2] as number)) / s.bays <= s.pillar) bad(`${at}.pillar`, 'leaves no room for an opening in each bay')
        break
      case 'crystal':
        vec(s.at, `${at}.at`); vec(s.dir, `${at}.dir`, -1, 1); num(s.length, `${at}.length`, 0.01, REACH); num(s.r, `${at}.r`, 0.003, 1)
        if (Array.isArray(s.dir) && Math.hypot(...s.dir.map((c) => Number(c) || 0)) < 0.1) bad(`${at}.dir`, 'must point somewhere')
        sides(s.sides, `${at}.sides`); opt(s.tip, `${at}.tip`, 0.1, 0.8); count(s.chips, `${at}.chips`, 0, 6, true); seed(s.seed, `${at}.seed`)
        break
      case 'crystals':
        vec(s.at, `${at}.at`); count(s.count, `${at}.count`, 1, 40); num(s.size, `${at}.size`, 0.01, REACH); num(s.r, `${at}.r`, 0.003, 1)
        opt(s.spread, `${at}.spread`, 0, 85); sides(s.sides, `${at}.sides`); count(s.chips, `${at}.chips`, 0, 6, true); seed(s.seed, `${at}.seed`)
        break
      case 'geode':
        vec(s.at, `${at}.at`); num(s.r, `${at}.r`, 0.03, 2); vec(s.open, `${at}.open`, -1, 1)
        if (Array.isArray(s.open) && Math.hypot(...s.open.map((c) => Number(c) || 0)) < 0.1) bad(`${at}.open`, 'must point somewhere')
        opt(s.rind, `${at}.rind`, 0.05, 0.4); count(s.bands, `${at}.bands`, 1, 8, true); opt(s.lining, `${at}.lining`, 0.05, 0.4); seed(s.seed, `${at}.seed`)
        break
      case 'columns':
        vec(s.at, `${at}.at`); num(s.r, `${at}.r`, 0.05, 3); num(s.cell, `${at}.cell`, 0.02, 1); num(s.height, `${at}.height`, 0.02, REACH)
        if (s.rise !== undefined && !RISES.includes(s.rise as never)) bad(`${at}.rise`, `must be one of ${RISES.map((k) => `'${k}'`).join(', ')}`)
        if (typeof s.r === 'number' && typeof s.cell === 'number' && s.r / s.cell > 30) bad(`${at}.cell`, 'is too small for the field: at most 30 columns across its radius')
        seed(s.seed, `${at}.seed`)
        break
      case 'drips':
        vec(s.at, `${at}.at`); num(s.r, `${at}.r`, 0.01, 3); num(s.roof, `${at}.roof`, -REACH, REACH); count(s.count, `${at}.count`, 1, 60); num(s.length, `${at}.length`, 0.01, REACH)
        if (Array.isArray(s.at) && typeof s.roof === 'number' && s.roof <= (s.at[1] as number) + 0.05) bad(`${at}.roof`, 'must be above the floor at at')
        seed(s.seed, `${at}.seed`)
        break
      case 'flowstone':
        vec(s.at, `${at}.at`); vec(s.along, `${at}.along`, -1, 1, 2); num(s.width, `${at}.width`, 0.02, REACH); num(s.drop, `${at}.drop`, 0.02, REACH)
        if (Array.isArray(s.along) && Math.hypot(Number(s.along[0]) || 0, Number(s.along[1]) || 0) < 0.1) bad(`${at}.along`, 'must point somewhere along the ground')
        opt(s.folds, `${at}.folds`, 1, 20); seed(s.seed, `${at}.seed`)
        break
      case 'icicles':
        shape(s.on, `${at}.on`, depth + 1); num(s.every, `${at}.every`, 0.01, 1); num(s.length, `${at}.length`, 0.01, 2); opt(s.above, `${at}.above`, -REACH, REACH); seed(s.seed, `${at}.seed`)
        break
      case 'tree':
        vec(s.at, `${at}.at`); num(s.height, `${at}.height`, 0, REACH); vec(s.crown, `${at}.crown`, 0.05, 2); num(s.r, `${at}.r`, 0.005, 0.5)
        count(s.points, `${at}.points`, 10, 400, true); opt(s.leaves, `${at}.leaves`, 0, 0.5)
        if (s.only !== undefined && s.only !== 'limbs' && s.only !== 'leaves') bad(`${at}.only`, "must be 'limbs' or 'leaves'")
        if (s.only === 'leaves' && !s.leaves) bad(`${at}.leaves`, "is needed when only is 'leaves'")
        seed(s.seed, `${at}.seed`)
        break
      case 'cactus': vec(s.at, `${at}.at`); num(s.height, `${at}.height`, 0.05, REACH); num(s.r, `${at}.r`, 0.01, 1); count(s.ribs, `${at}.ribs`, 3, 24, true); count(s.arms, `${at}.arms`, 0, 4, true); seed(s.seed, `${at}.seed`); break
      case 'rosette': vec(s.at, `${at}.at`); num(s.r, `${at}.r`, 0.02, 1); count(s.leaves, `${at}.leaves`, 3, 60); seed(s.seed, `${at}.seed`); break
      case 'brackets':
        vec(s.at, `${at}.at`); vec(s.facing, `${at}.facing`, -1, 1, 2); num(s.r, `${at}.r`, 0.01, 1); count(s.count, `${at}.count`, 1, 8); seed(s.seed, `${at}.seed`)
        if (Array.isArray(s.facing) && Math.hypot(Number(s.facing[0]) || 0, Number(s.facing[1]) || 0) < 0.1) bad(`${at}.facing`, 'must point somewhere along the ground')
        break
      case 'brain': vec(s.at, `${at}.at`); num(s.r, `${at}.r`, 0.03, 2); opt(s.groove, `${at}.groove`, 0.01, 1); seed(s.seed, `${at}.seed`); break
      case 'shell': vec(s.at, `${at}.at`); num(s.size, `${at}.size`, 0.03, 2); opt(s.turns, `${at}.turns`, 1, 6); opt(s.spire, `${at}.spire`, 0, 1); opt(s.facing, `${at}.facing`, -360, 360); break
      case 'horn':
        vec(s.at, `${at}.at`); vec(s.dir, `${at}.dir`, -1, 1); num(s.length, `${at}.length`, 0.02, 2); num(s.r, `${at}.r`, 0.003, 0.5)
        opt(s.curl, `${at}.curl`, -1.5, 1.5); opt(s.twist, `${at}.twist`, -1, 1); opt(s.ridges, `${at}.ridges`, 0, 40)
        if (Array.isArray(s.dir) && Math.hypot(...s.dir.map((c) => Number(c) || 0)) < 0.1) bad(`${at}.dir`, 'must point somewhere')
        break
      case 'antler':
        vec(s.at, `${at}.at`); vec(s.dir, `${at}.dir`, -1, 1); num(s.length, `${at}.length`, 0.02, 2); num(s.r, `${at}.r`, 0.003, 0.5); count(s.tines, `${at}.tines`, 1, 8); seed(s.seed, `${at}.seed`)
        if (Array.isArray(s.dir) && Math.hypot(...s.dir.map((c) => Number(c) || 0)) < 0.1) bad(`${at}.dir`, 'must point somewhere')
        break
      case 'ribs':
        vec(s.from, `${at}.from`); vec(s.to, `${at}.to`); count(s.count, `${at}.count`, 1, 16); num(s.span, `${at}.span`, 0.01, 2); num(s.drop, `${at}.drop`, 0, 2); num(s.r, `${at}.r`, 0.003, 0.3)
        if (Array.isArray(s.from) && Array.isArray(s.to) && Math.hypot(...s.from.map((c, i) => (Number(c) || 0) - (Number((s.to as unknown[])[i]) || 0))) < 0.05) bad(`${at}.to`, 'must be apart from from')
        break
      case 'land':
        vec(s.at, `${at}.at`); vec(s.half, `${at}.half`, 0.1, REACH, 2); opt(s.base, `${at}.base`, 0, 2); opt(s.noise, `${at}.noise`, 0, 1)
        if (!Array.isArray(s.peaks) || s.peaks.length > 16) bad(`${at}.peaks`, 'must be a list of at most 16')
        else s.peaks.forEach((k: unknown, i: number) => {
          if (!obj(k)) { bad(`${at}.peaks[${i}]`, 'must be an object'); return }
          vec(k.at, `${at}.peaks[${i}].at`, -REACH, REACH, 2); num(k.h, `${at}.peaks[${i}].h`, -2, 3); num(k.r, `${at}.peaks[${i}].r`, 0.05, REACH)
        })
        count(s.drops, `${at}.drops`, 0, MAX_DROPS, true); opt(s.slump, `${at}.slump`, 0, 1); beds(s.beds, `${at}.beds`); seed(s.seed, `${at}.seed`)
        break
      case 'butte': vec(s.at, `${at}.at`); num(s.r, `${at}.r`, 0.02, 2); num(s.height, `${at}.height`, 0.05, REACH); beds(s.beds, `${at}.beds`); opt(s.wear, `${at}.wear`, 0, 0.8); opt(s.cap, `${at}.cap`, 0, 1.5); seed(s.seed, `${at}.seed`); break
      case 'hoodoo': vec(s.at, `${at}.at`); num(s.height, `${at}.height`, 0.05, REACH); num(s.r, `${at}.r`, 0.01, 1); seed(s.seed, `${at}.seed`); break
      case 'arch':
        vec(s.from, `${at}.from`); vec(s.to, `${at}.to`); num(s.height, `${at}.height`, 0.1, REACH); num(s.thick, `${at}.thick`, 0.02, 1); opt(s.soft, `${at}.soft`, 0.15, 0.7); beds(s.beds, `${at}.beds`); seed(s.seed, `${at}.seed`)
        if (Array.isArray(s.from) && Array.isArray(s.to) && Math.hypot((s.to[0] as number) - (s.from[0] as number), (s.to[2] as number) - (s.from[2] as number)) < 0.1) bad(`${at}.to`, 'must be apart from from along the ground')
        break
      case 'mud': vec(s.at, `${at}.at`); num(s.r, `${at}.r`, 0.05, 3); num(s.plate, `${at}.plate`, 0.03, 1); opt(s.curl, `${at}.curl`, 0, 1); seed(s.seed, `${at}.seed`); break
      case 'pebbles':
        if (!Array.isArray(s.path) || s.path.length < 2 || s.path.length > 16) bad(`${at}.path`, 'must be a list of 2 to 16 points')
        else { s.path.forEach((q: unknown, i: number) => vec(q, `${at}.path[${i}]`)); apart(s.path, `${at}.path`) }
        num(s.width, `${at}.width`, 0.02, 2); count(s.count, `${at}.count`, 1, 200); num(s.size, `${at}.size`, 0.005, 0.5); seed(s.seed, `${at}.seed`)
        break
      case 'drift':
        if (depth > 0) bad(`${at}.kind`, "a drift lies over the parts before it, so it must be a part's own shape")
        vec(s.at, `${at}.at`); vec(s.half, `${at}.half`, 0.05, REACH, 2); num(s.depth, `${at}.depth`, 0.005, 0.5)
        vec(s.wind, `${at}.wind`, -1, 1, 2); opt(s.pile, `${at}.pile`, 0, 1); opt(s.reach, `${at}.reach`, 0.5, 20); opt(s.pathWidth, `${at}.pathWidth`, 0.02, 2)
        if (s.path !== undefined) {
          if (!Array.isArray(s.path) || s.path.length < 2 || s.path.length > 16) bad(`${at}.path`, 'must be a list of 2 to 16 points')
          else { s.path.forEach((q: unknown, i: number) => vec(q, `${at}.path[${i}]`)); apart(s.path, `${at}.path`) }
        }
        seed(s.seed, `${at}.seed`)
        break
      case 'frost':
        vec(s.at, `${at}.at`); vec(s.facing, `${at}.facing`, -1, 1)
        if (Array.isArray(s.facing) && Math.hypot(...(s.facing as number[]).map((v) => Number(v) || 0)) < 0.1) bad(`${at}.facing`, 'must point somewhere')
        num(s.r, `${at}.r`, 0.02, 2); count(s.arms, `${at}.arms`, 1, 8, true); seed(s.seed, `${at}.seed`)
        if (s.stage !== undefined) {
          vec(s.stage, `${at}.stage`, 0, 1, 2)
          if (Array.isArray(s.stage) && !((s.stage[0] as number) + 0.05 <= (s.stage[1] as number))) bad(`${at}.stage`, 'must run from a share to one at least 0.05 later')
        }
        break
      case 'cut': shape(s.shape, `${at}.shape`, depth + 1); shape(s.hole, `${at}.hole`, depth + 1); break
      case 'rough': shape(s.shape, `${at}.shape`, depth + 1); num(s.by, `${at}.by`, 0, 0.3); opt(s.scale, `${at}.scale`, 0.02, REACH); break
      default: bad(`${at}.kind`, `${show(s.kind)} is not a shape (${SHAPE_KINDS.join(', ')})`)
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
      case 'pieces':
        hexes(p.colors, `${at}.colors`, 1, 8); if (p.line !== undefined) hex(p.line, `${at}.line`)
        if (p.ordered !== undefined && typeof p.ordered !== 'boolean') bad(`${at}.ordered`, 'must be true or false')
        break
      default: bad(`${at}.kind`, `${show(p.kind)} is not a paint (bands, bricks, hex, speckle, patches, faces, split, key, pieces)`)
    }
  }
  if (!Array.isArray(doc.parts) || !doc.parts.length || doc.parts.length > MAX_PARTS) bad('parts', `must be a list of 1 to ${MAX_PARTS} parts`)
  else doc.parts.forEach((p: unknown, i: number) => {
    const at = `parts[${i}]`
    if (!obj(p)) { bad(at, 'must be an object'); return }
    const before = found
    shape(p.shape, `${at}.shape`, 0)
    if (i === 0 && (p.shape as { kind?: unknown } | undefined)?.kind === 'drift') bad(`${at}.shape`, 'a drift lies over the parts before it, so it cannot come first')
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
    if (piecesIn(p.paint) && !hasPieces(p.shape)) bad(`${at}.paint`, `pieces paints a shape made of pieces only (${PIECED.join(', ')})`)
    if (p.bone !== undefined) bone(p.bone, `${at}.bone`)
    for (const k of ['glow', 'noShadow', 'bare']) if (p[k] !== undefined && typeof p[k] !== 'boolean') bad(`${at}.${k}`, 'must be true or false')
    if (p.grime !== undefined) hex(p.grime, `${at}.grime`)
    opt(p.strokes, `${at}.strokes`, 0, 1)
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
        case 'sprout': if (typeof m.times === 'number' && m.times < 0) bad(`${at}.times`, 'must be over 0 for a sprout'); break
        default: bad(`${at}.kind`, `${show(m.kind)} is not a move (spin, sway, bob, drift, pulse, sprout)`)
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
  if (doc.focus !== undefined) {
    if (!obj(doc.focus)) bad('focus', 'must be an object')
    else { vec(doc.focus.at, 'focus.at'); num(doc.focus.r, 'focus.r', 0.1, REACH * 2) }
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
        const falls = m.kind === 'rain' || m.kind === 'snow' || m.kind === 'leaves'
        if (m.land !== undefined && typeof m.land !== 'boolean') bad(`${at}.land`, 'must be true or false')
        if (m.land && !falls) bad(`${at}.land`, 'only rain, snow and leaves land')
        if (m.wind !== undefined) { vec(m.wind, `${at}.wind`, -2, 2, 2); if (!falls) bad(`${at}.wind`, 'only rain, snow and leaves are blown') }
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
function toShape(s: ShapeDoc, thin: number, under?: (x: number, z: number) => number): Shape {
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
    case 'grow': {
      const { twigs, tips } = grow(s)
      const all: Shape[] = []
      if (s.only !== 'tips') for (const w of twigs) all.push(cone(w.from, w.to, t(w.r), Math.max(w.rTo, thin * 0.6)))
      if (s.only !== 'twigs' && s.tips) for (const p of tips) all.push(sphere(p, Math.max(s.tips, thin * 1.2)))
      return all.length ? many(all) : sphere(s.at, thin * 1.2)
    }
    case 'wall': return wall({ ...s, height: Math.max(s.height, thin * 2), thick: t(s.thick) }, thin / 0.75)
    case 'steps': return steps({ ...s, rise: t(s.rise), run: t(s.run), width: t(s.width) })
    case 'fence': return fence({ ...s, post: Math.max(s.post, thin * 0.75) }, thin / 0.75)
    case 'arcade': return arcade({ ...s, thick: t(s.thick), pillar: t(s.pillar) }, thin / 0.75)
    case 'crystal': return crystal({ ...s, r: Math.max(s.r, thin * 1.2) })
    case 'crystals': return cluster({ ...s, r: Math.max(s.r, thin * 1.2) })
    case 'geode': return geode(s)
    case 'columns': return columns({ ...s, cell: Math.max(s.cell, thin * 3) })
    case 'drips': return drips(s, thin)
    case 'flowstone': return flowstone(s)
    case 'icicles': return icicles(toShape(s.on, thin), { ...s, every: Math.max(s.every, thin * 2) }, thin)
    case 'tree': return tree({ ...s, r: Math.max(s.r, thin) }, thin)
    case 'cactus': return cactus({ ...s, r: Math.max(s.r, thin * 1.5) })
    case 'rosette': return rosette(s, thin)
    case 'brackets': return brackets({ ...s, r: Math.max(s.r, thin * 3) })
    case 'brain': return brain(s)
    case 'shell': return shell(s, thin)
    case 'horn': return horn(s, thin)
    case 'antler': return antler(s, thin)
    case 'ribs': return ribs(s, thin)
    case 'land': return land(s)
    case 'butte': return butte(s)
    case 'hoodoo': return hoodoo(s)
    case 'arch': return arch(s)
    case 'mud': return mud(s, thin / 0.75)
    case 'pebbles': return pebbles(s, thin)
    case 'drift': {
      if (!under) throw new Error('a drift needs the ground under it')
      return drift(s, under, thin)
    }
    case 'frost': return frost(s, thin)
    case 'cut': return cut(toShape(s.shape, thin), toShape(s.hole, 0))
    case 'rough': {
      const k = 1 / (s.scale ?? 0.5)
      return displace(toShape(s.shape, thin), (x, y, z) => wobble(x * k, y * k, z * k) * s.by, s.by * 1.2)
    }
  }
}

type Paint = (p: Vec3, n: Vec3) => Vec3

function toPaint(p: PaintDoc, cell: number, letterAt?: (p: Vec3, n: Vec3) => string | undefined, pieceAt?: (p: Vec3) => number): Paint {
  if (typeof p === 'string') { const c = unit(p); return () => c }
  switch (p.kind) {
    case 'pieces': {
      const cs = p.colors.map(unit), line = p.line === undefined ? cs[0] : unit(p.line)
      return (q) => {
        const id = pieceAt?.(q) ?? 0
        // squared, so the first color is the commonest
        return id < 0 ? line : p.ordered ? cs[id % cs.length] : cs[Math.floor(hash(id, 17, 3) ** 2 * cs.length)]
      }
    }
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
      const side = toPaint(p.side, cell, letterAt, pieceAt), top = p.top === undefined ? side : toPaint(p.top, cell, letterAt, pieceAt), under = p.under === undefined ? side : toPaint(p.under, cell, letterAt, pieceAt)
      return (q, n) => (n[1] > 0.6 ? top : n[1] < -0.6 ? under : side)(q, n)
    }
    case 'split': {
      const below = toPaint(p.below, cell, letterAt, pieceAt), above = toPaint(p.above, cell, letterAt, pieceAt), i = IDX[p.axis]
      return (q, n) => (q[i] < p.at ? below : above)(q, n)
    }
  }
}

/** A scene ready to build and play, from `compileScene`. */
export interface CompiledScene {
  /** The scene's name. */
  name: string
  /** Seconds the scene takes to repeat. */
  loop: number
  /** Where the camera starts. */
  orbit: Orbit
  /** Degrees the view rocks to either side, once a loop: 0 holds still. */
  swing: number
  /** The pixel look the scene asks for. */
  look: PixelLook
  /** The scene's own palette. */
  palette: Rgb[]
  /** The scene's bones. */
  bones: Bone[]
  /** The shapes on a grid of `spacing`. */
  spec(spacing: number): VoxelSpec
  /** The parts (by their place in the list) that came out with no blobs at all, such as a shape whose hole swallows it: `checkScene` can't see those. */
  empty(built: { partOf: ArrayLike<number> }): number[]
  /** Poses the bones for `t` seconds. */
  pose(sk: Skeleton, t: number): void
  /** The scene's live lights at a time, in seconds. */
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
  /** Whether it lands, and the wind that carries it over its fall. */
  land: boolean
  wind: [number, number]
  /** A falling speck's lean, so a streak of rain points along its fall. */
  lean?: [number, number, number, number]
}

const SPECK_SIZE: Record<SpeckKind, number> = { dust: 0.01, embers: 0.014, rain: 0.008, snow: 0.014, leaves: 0.022, fireflies: 0.018, bubbles: 0.02 }
/** Seconds one fall or rise takes, about: the rest of a swarm's speed comes from that. A speck that lands lies a while too. */
const SPECK_SECONDS: Record<SpeckKind, number> = { dust: 6, embers: 2.2, rain: 0.55, snow: 7, leaves: 6, fireflies: 3, bubbles: 3 }
const LANDING_SECONDS: Record<Falling, number> = { rain: 0.7, snow: 8.5, leaves: 9 }

const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

/** How far a snowflake or leaf has swayed at `life` of its fall, frozen where it landed. */
function swayOf(p: Speck, life: number): [number, number] {
  const k = p.kind === 'snow' || p.kind === 'leaves' ? p.kind : null
  if (!k) return [0, 0]
  const l = p.land ? Math.min(life, fallShare(k)) : life
  // snow sways `wander` times a fall, leaves twice that; counted from the fall's start so it repeats each fall
  const a = k === 'leaves' ? 0.08 : 0.05, n = k === 'leaves' ? 2 : 1, l0 = l - p.phase[0]
  return [a * Math.sin((l0 * p.wander[0] * n + p.phase[1]) * TAU), a * 0.8 * Math.sin((l0 * p.wander[2] * n + p.phase[3]) * TAU)]
}
const BANK_BONES = 3

function planSpecks(air: AirDoc | undefined, loop: number, ground: (x: number, z: number, top: number, bottom: number) => number): Speck[] {
  const out: Speck[] = []
  ;(air?.specks ?? []).forEach((sw, si) => {
    const lo: Vec3 = [Math.min(sw.from[0], sw.to[0]), Math.min(sw.from[1], sw.to[1]), Math.min(sw.from[2], sw.to[2])]
    const hi: Vec3 = [Math.max(sw.from[0], sw.to[0]), Math.max(sw.from[1], sw.to[1]), Math.max(sw.from[2], sw.to[2])]
    const size = sw.size ?? SPECK_SIZE[sw.kind]
    const glow = sw.glow ?? (sw.kind === 'embers' || sw.kind === 'fireflies')
    for (let j = 0; j < sw.count; j++) {
      const r = (k: number) => hash(si + 1, j + 1, k)
      const across = (i: number, k: number) => lo[i] + (hi[i] - lo[i]) * r(k)
      const falls = sw.kind === 'rain' || sw.kind === 'snow' || sw.kind === 'leaves', rises = sw.kind === 'embers' || sw.kind === 'bubbles'
      const land = !!sw.land && falls, wind: [number, number] = falls && sw.wind ? sw.wind : [0, 0]
      // blown, a speck starts upwind of where it comes down, so the swarm still lands in its box
      const at: Vec3 = [across(0, 1) - wind[0], falls ? hi[1] : rises ? lo[1] : across(1, 2), across(2, 3) - wind[1]]
      // a little quicker or slower each, so a swarm never moves in step
      const seconds = (land ? LANDING_SECONDS[sw.kind as Falling] : SPECK_SECONDS[sw.kind]) * (0.7 + 0.6 * r(4))
      const times = Math.max(1, Math.round(loop / seconds))
      const wander: Speck['wander'] = [1 + Math.floor(r(5) * 2), 1 + Math.floor(r(6) * 2), 1 + Math.floor(r(7) * 2), Math.max(1, Math.round(loop / (2 + 3 * r(8))))]
      const shape: ShapeDoc = sw.kind === 'rain' ? { kind: 'ball', at, r: [size, 0.07, size] } : sw.kind === 'leaves' ? { kind: 'ball', at, r: [size, size * 0.3, size * 0.65] } : { kind: 'sphere', at, r: size }
      const p: Speck = {
        kind: sw.kind, bone: `~speck${out.length}`, index: -1, at, travel: hi[1] - lo[1], times, wander,
        phase: [r(9), r(10), r(11), r(12), r(13)], shape, color: sw.colors[Math.floor(r(14) * sw.colors.length)], glow, land, wind,
      }
      if (land) {
        // it falls to whatever is under where it comes down, resting on it
        const [sx, sz] = swayOf(p, 1)
        const rest = sw.kind === 'leaves' ? size * 0.3 : sw.kind === 'rain' ? 0 : size * 0.6
        p.travel = Math.max(0, hi[1] - (ground(at[0] + wind[0] + sx, at[2] + wind[1] + sz, hi[1], lo[1]) + rest))
      }
      // a streak of rain leans along its fall
      if (sw.kind === 'rain' && (wind[0] || wind[1])) {
        const fall = Math.max(p.travel, 0.05), w = Math.hypot(wind[0], wind[1]), ang = Math.atan2(w, fall)
        const ax: Vec3 = [-wind[1] / w, 0, wind[0] / w]
        // turning the streak's upright toward -wind tips its bottom downwind
        p.lean = axisAngle(ax, -ang) as unknown as [number, number, number, number]
      }
      out.push(p)
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
  if (p.kind === 'rain' || p.kind === 'snow' || p.kind === 'leaves') {
    const f = p.land ? fallAt(p.kind, life) : { drop: life, lying: false, size: Math.sin(Math.PI * life) ** 0.25 }
    const [sx, sz] = swayOf(p, life)
    dx = p.wind[0] * f.drop + sx; dz = p.wind[1] * f.drop + sz; dy = -p.travel * f.drop
    size = f.size
    if (p.lean) sk.setRotation(b, p.lean)
    if (p.kind === 'leaves') {
      // a leaf flutters as it falls, rocking less as it comes down, and lies flat where it lands
      const settle = f.lying ? 0 : 1 - smoothstep(0.8, 1, f.drop)
      const yaw = axisAngle([0, 1, 0], (p.phase[4] + (f.lying ? 1 : f.drop) * p.wander[1]) * TAU)
      const rock = axisAngle([1, 0, 0], 0.9 * settle * Math.sin((f.drop * 3 * p.wander[0] + p.phase[2]) * TAU))
      sk.setRotation(b, mulQ(yaw, rock))
    }
    sk.offset[b * 3] += dx; sk.offset[b * 3 + 1] += dy; sk.offset[b * 3 + 2] += dz
    sk.size[b] *= size
    return
  }
  switch (p.kind) {
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

/** A sprout's size through its life (0 to 1): grows from nothing over the first 40%, stands, and shrinks away over the last 15%. */
export function sprouted(life: number) {
  const ease = (t: number) => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k) }
  return life < 0.85 ? ease(life / 0.4) : ease((1 - life) / 0.15)
}

/** A sound description (see `checkScene`) made ready to build and play. Throws on an unsound one. */
/** `puffs` keeps hidden bones for a tap's puff of sparkles (`poke.ts`); a creature taken from a scene goes without. */
export function compileScene(doc: SceneDoc, { puffs = true }: { puffs?: boolean } = {}): CompiledScene {
  const errs = checkScene(doc)
  if (errs.length) throw new Error(`Scene "${String((doc as { name?: unknown })?.name)}" has ${errs.length} mistake${errs.length > 1 ? 's' : ''}: ${errs.slice(0, 5).join('; ')}`)
  const bones: Bone[] = [{ name: 'land', parent: -1, head: [0, 0, 0] }]
  for (const b of doc.bones ?? []) bones.push({ name: b.name, parent: b.parent ? bones.findIndex((k) => k.name === b.parent) : 0, head: b.at })
  const palette = doc.palette.map(rgb)
  const moves = doc.moves ?? []
  const lights = doc.lights ?? []
  // what weather lands on: parts that stay put (on no bone, or one that only sways), in order, a drift over those before it
  const moved = new Set<string>()
  for (const m of moves) if (m.kind !== 'sway') moved.add(m.bone)
  for (const b of doc.bones ?? []) if (b.parent && moved.has(b.parent)) moved.add(b.name)
  const solidShapes = (thin: number) => {
    const out: Shape[] = [], still: Shape[] = []
    for (const p of doc.parts) {
      const sh = toShape(p.shape, thin, (x, z) => groundUnder(still, x, z, 4, -1))
      out.push(sh)
      if (!p.glow && !(p.bone && moved.has(p.bone))) still.push(sh)
    }
    return { out, still }
  }
  // what hangs in the air rides bones of its own, after the scene's: a bone for each speck, a few for each bank of mist
  const lands = (doc.air?.specks ?? []).some((m) => m.land)
  const ground = lands ? solidShapes(0.02).still : []
  const specks = planSpecks(doc.air, doc.loop, (x, z, top, bottom) => groundUnder(ground, x, z, top, bottom))
  const banks = doc.air?.mist ?? []
  banks.forEach((m, mi) => { for (let k = 0; k < BANK_BONES; k++) bones.push({ name: `~mist${mi}-${k}`, parent: 0, head: m.at }) })
  for (const p of specks) { p.index = bones.length; bones.push({ name: p.bone, parent: 0, head: p.at }) }
  // a tap on the land throws sparkles from where it lands (poke.ts); they wait hidden at the view's target
  const puffBones = puffs ? Array.from({ length: PUFFS }, (_, k) => bones.push({ name: `~puff${k}`, parent: 0, head: doc.camera.target }) - 1) : []
  const sparkle = palette.reduce((a, c) => (c[0] + c[1] + c[2] > a[0] + a[1] + a[2] ? c : a), palette[0])
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
      const shapes = solidShapes(thin).out
      const parts: VoxelPart[] = doc.parts.map((p, i) => {
        const shape = shapes[i]
        return {
        shape, color: toPaint(p.paint, spacing, 'letterAt' in shape ? (shape.letterAt as (p: Vec3, n: Vec3) => string | undefined) : undefined, shape.pieceAt), bone: p.bone ?? 'land', glow: p.glow, noShadow: p.noShadow,
        grime: p.grime === undefined ? undefined : unit(p.grime), bare: p.bare,
        glass: p.glass, strokes: p.strokes,
        ink: p.ink && { kind: p.ink.kind, amount: p.ink.amount, color: p.ink.color === undefined ? undefined : unit(p.ink.color) },
        }
      })
      for (const p of specks) parts.push({ shape: toShape(p.shape, thin), color: unit(p.color), bone: p.bone, glow: p.glow, noShadow: true, bare: true })
      for (const b of puffBones) parts.push({ shape: toShape({ kind: 'sphere', at: doc.camera.target, r: spacing * 2 }, thin), color: sparkle.map((c) => c / 255) as Vec3, bone: bones[b].name, glow: true, noShadow: true, bare: true })
      // only what the scene sets: a key left undefined would wipe the builder's default
      const light: VoxelSpec['light'] = { ...PAINTED }
      if (doc.light?.from) light.dir = doc.light.from
      for (const k of ['ambient', 'shadow', 'ramp', 'crevice', 'wear', 'bounce'] as const) if (doc.light?.[k] !== undefined) light[k] = doc.light[k]
      const beams = (doc.air?.shafts ?? []).map((b) => ({ from: b.from, to: b.to, r: b.r, color: unit(b.color), strength: b.strength ?? 0.6 }))
      // a lamp that stays put casts shadows baked once; byte k of each blob is light k
      const lamps = lights.slice(0, MAX_LAMPS).map((l) => (!l.shadows || l.circle ? null : { at: l.at, reach: l.range }))
      const cover = doc.cover && { kind: doc.cover.kind, color: unit(doc.cover.color), amount: doc.cover.amount }
      const { target: tg, distance: dist, azimuth: az, elevation: el } = doc.camera
      const ra = (az * Math.PI) / 180, re = (el * Math.PI) / 180
      const eye: Vec3 = [tg[0] + dist * Math.sin(ra) * Math.cos(re), tg[1] + dist * Math.sin(re), tg[2] + dist * Math.cos(ra) * Math.cos(re)]
      const sky: [Vec3, Vec3] | undefined = doc.sky ? [unit(doc.sky[0]), unit(doc.sky[1])] : doc.air?.haze ? [unit(doc.air.haze.color), unit(doc.air.haze.color)] : undefined
      return { bones, parts, spacing, light, loose: looseAir(doc.air), beams, lamps, cover, eye, sky, focus: doc.focus, disc: doc.disc }
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
        } else if (m.kind === 'sprout') {
          sk.size[b] *= sprouted(((at % 1) + 1) % 1)
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
      for (const b of puffBones) sk.size[b] = 0
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
